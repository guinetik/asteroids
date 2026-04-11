/**
 * Central runtime for manifest-driven audio playback: category routing, cached static Howl
 * instances, dynamic `src` streams, playback modes, voice ducking, and Web Audio effect chains.
 *
 * Ported from irover's audio system — identical engine, asteroids-specific manifest.
 *
 * @author guinetik
 * @date 2026-04-06
 */

import { Howl, Howler } from 'howler'
import {
  createEffectChain,
  getAudioEffectConfig,
  VOICE_DUCK_FADE_ATTACK_MS,
  VOICE_DUCK_FADE_RELEASE_MS,
  VOICE_DUCK_UI_SFX_MULTIPLIER,
  type AudioEffectConfig,
} from './audioEffects'
import { getAudioDefinition, type AudioSoundId } from './audioManifest'
import {
  AUDIO_CATEGORIES,
  type AudioCategory,
  type AudioCategoryState,
  type AudioDefinition,
  type AudioEffectPreset,
  type AudioManagerOptions,
  type AudioPlayOptions,
  type AudioPlaybackHandle,
} from './audioTypes'
import { playProceduralSound } from './proceduralAudio'

/** Howl error events may pass `null` for howl-level load failures (see Howler `_emit`). */
type HowlErrorEventHandler = (soundId: number | null, error: unknown) => void

/** Tracks a deferred dynamic voice handle: pending until {@link AudioManager.unlock}, then active. */
interface VoiceHandleState {
  kind: 'pending' | 'active' | 'cancelled'
  realHandle?: AudioPlaybackHandle
}

/** One running instance registered with the manager (supports overlap within a category). */
interface ActivePlayback {
  /** Stable token for handle.stop bookkeeping. */
  token: number
  soundId: AudioSoundId
  category: AudioCategory
  howl: Howl
  /** Sound id returned by {@link Howl.play} (distinct instances on the same Howl). */
  howlPlayId?: number
  /** `options.volume ?? def.volume` — used when voice ducking refreshes per-instance gain. */
  baseVolumeScale: number
  /** Restores Howl gain → `masterGain` after a Web Audio effect chain, if any. */
  effectRelease?: () => void
  /** Same references passed to `on`/`once` so `off` can remove listeners on interrupt or failure. */
  endHandler: () => void
  playErrorHandler: HowlErrorEventHandler
  loadErrorHandler: HowlErrorEventHandler
  /** {@link AudioPlayOptions.onEnd} — natural completion and load/play failure (not manual stop). */
  onEndCallback?: () => void
}

const DEFAULT_CATEGORY_STATE: Record<AudioCategory, AudioCategoryState> = {
  ui: { volume: 1, muted: false },
  voice: { volume: 1, muted: false },
  sfx: { volume: 1, muted: false },
  ambient: { volume: 1, muted: false },
  music: { volume: 1, muted: false },
}

/**
 * Central runtime for manifest-driven playback: category routing, cached static {@link Howl}
 * instances, dynamic `src` for streams, and manifest playback modes.
 */
export class AudioManager {
  private unlocked = false
  private readonly categoryState: Record<AudioCategory, AudioCategoryState>
  /** Multiple concurrent playbacks per category (e.g. overlap); exclusive modes clear before adding. */
  private readonly activeByCategory = new Map<AudioCategory, ActivePlayback[]>()
  private readonly cachedHowls = new Map<AudioSoundId, Howl>()
  /** Last trigger time for {@link AudioDefinition} `rate-limited` + `cooldownMs`. */
  private readonly lastRateLimitTriggerAt = new Map<string, number>()
  private nextPlaybackToken = 1
  /** Dynamic voice play requested while locked; replayed from {@link AudioManager.unlock}. */
  private pendingLockedVoice: {
    soundId: AudioSoundId
    options: AudioPlayOptions
    stateRef: VoiceHandleState
  } | null = null

  constructor(options: AudioManagerOptions = {}) {
    this.categoryState = { ...DEFAULT_CATEGORY_STATE }
    const init = options.initialCategoryState
    if (init) {
      for (const cat of AUDIO_CATEGORIES) {
        const patch = init[cat]
        if (patch) {
          this.categoryState[cat] = { ...this.categoryState[cat], ...patch }
        }
      }
    }
    Howler.autoUnlock = false
  }

  /**
   * Merges mixer state for a category (volume/mute). Affects the next computed playback level.
   */
  applyCategoryState(category: AudioCategory, patch: Partial<AudioCategoryState>): void {
    this.categoryState[category] = { ...this.categoryState[category], ...patch }
    this.refreshCategoryVolumes(category)
  }

  /**
   * Pushes the current effective category volume to every active playback in that category.
   * Called after any category state change (mute, volume) so live sounds react immediately.
   */
  private refreshCategoryVolumes(category: AudioCategory): void {
    const list = this.activeByCategory.get(category)
    if (!list?.length) return
    const catVol = this.getCategoryVolume(category)
    for (const p of list) {
      this.applyPerInstanceVolume(p.howl, p.baseVolumeScale * catVol, p.howlPlayId)
    }
  }

  /**
   * Resolves the manifest effect preset for a sound id to concrete DSP parameters.
   *
   * @param soundId - Registered manifest id.
   */
  resolveEffect(soundId: AudioSoundId): AudioEffectConfig {
    const def = getAudioDefinition(soundId)
    return getAudioEffectConfig(def.effect)
  }

  /**
   * Effective category gain (0–1) including mute and voice ducking for `ui` / `sfx`.
   *
   * @param category - Mixer channel.
   */
  getCategoryVolume(category: AudioCategory): number {
    const base = this.getCategoryBaseVolume(category)
    if (category === 'ui' || category === 'sfx') {
      return base * this.getVoiceDuckMultiplier()
    }
    return base
  }

  private getCategoryBaseVolume(category: AudioCategory): number {
    const state = this.categoryState[category]
    return state.muted ? 0 : state.volume
  }

  private getVoiceDuckMultiplier(): number {
    const voice = this.activeByCategory.get('voice')
    return voice && voice.length > 0 ? VOICE_DUCK_UI_SFX_MULTIPLIER : 1
  }

  /**
   * Marks the app as allowed to play audio and attempts to resume the Web Audio `AudioContext`
   * (required when `Howler.autoUnlock` is disabled). Safe to call repeatedly; resume failures are
   * ignored (e.g. strict autoplay policies).
   *
   * After the first successful unlock, replays one queued dynamic voice request that arrived while
   * locked, if it was not cancelled.
   */
  unlock(): void {
    this.unlocked = true
    this.resumeHowlerAudioContext()
    this.flushPendingLockedVoice()
  }

  /**
   * Ensures static manifest sounds begin decoding by reusing the same cached {@link Howl}
   * instances as {@link play} (no duplicate Howls per id). Calls {@link Howl.load} so lazy-loaded
   * entries warm their buffers. Skips ids with no bundled `src` (e.g. dynamic voice).
   *
   * @param soundIds - Registered manifest ids to preload.
   */
  preload(soundIds: readonly AudioSoundId[]): void {
    for (const soundId of soundIds) {
      const def = getAudioDefinition(soundId)
      if (!('src' in def) || def.src === undefined) {
        continue
      }
      const howl = this.getOrCreateHowl(soundId)
      howl.load()
    }
  }

  /**
   * Plays a registered sound.
   *
   * Runtime `options.src` is applied only when the manifest entry has `allowDynamicSrc: true`
   * (e.g. voice comms). Static UI/SFX entries always use their manifest `src`.
   */
  play(soundId: AudioSoundId, options: AudioPlayOptions = {}): AudioPlaybackHandle {
    const def = getAudioDefinition(soundId)
    const resolvedSrc = this.resolvePlaySrc(def, options)
    if (resolvedSrc === undefined) {
      return this.createNoopHandle(soundId)
    }

    if (!this.unlocked) {
      if (
        this.canQueueLockedDynamicVoice(def, resolvedSrc) &&
        !(def.playback === 'rate-limited' && this.isRateLimited(def, soundId, options))
      ) {
        return this.enqueueLockedVoicePlay(soundId, options)
      }
      return this.createNoopHandle(soundId)
    }

    if (def.playback === 'rate-limited' && this.isRateLimited(def, soundId, options)) {
      return this.createNoopHandle(soundId)
    }

    this.applyPlaybackModePrelude(def, soundId)

    const proceduralHandle = this.tryPlayProceduralSound(soundId, def, options)
    if (proceduralHandle) {
      if (def.playback === 'rate-limited') {
        this.recordRateLimitTrigger(def, soundId, options)
      }
      return proceduralHandle
    }

    const allowDynamicSrc = 'allowDynamicSrc' in def && def.allowDynamicSrc === true
    const dynamicSrc =
      allowDynamicSrc && options.src !== undefined && options.src !== '' ? options.src : undefined

    const howl =
      dynamicSrc !== undefined
        ? new Howl({
            src: [dynamicSrc],
            preload: false,
            volume: 1,
          })
        : this.getOrCreateHowl(soundId)

    const baseVol = options.volume ?? def.volume
    const token = this.nextPlaybackToken++
    const playback: ActivePlayback = {
      token,
      soundId,
      category: def.category,
      howl,
      howlPlayId: undefined,
      baseVolumeScale: baseVol,
      endHandler: () => {},
      playErrorHandler: () => {},
      loadErrorHandler: () => {},
    }

    playback.onEndCallback = options.onEnd

    playback.endHandler = () => {
      try {
        playback.onEndCallback?.()
      } finally {
        this.detachPlaybackListeners(playback)
        this.finalizePlaybackEnded(playback)
      }
    }

    playback.playErrorHandler = (id, _err) => {
      if (playback.howlPlayId !== undefined && id !== playback.howlPlayId) return
      this.teardownPlaybackFailure(playback)
    }

    playback.loadErrorHandler = (id, _err) => {
      if (id == null) {
        this.teardownPlaybackFailureForHowlLevelLoadError(playback)
        return
      }
      if (playback.howlPlayId !== undefined && id !== playback.howlPlayId) return
      this.teardownPlaybackFailure(playback)
    }

    this.pushActive(def.category, playback)
    if (def.category === 'voice') {
      this.refreshDuckedCategoryVolumes('duck')
    }
    this.registerPlaybackErrorListenersBeforePlay(howl, playback)
    this.ensureHowlLoadedBeforePlay(howl)

    const howlPlayIdRaw = howl.play()
    const resolvedId =
      typeof howlPlayIdRaw === 'number' && !Number.isNaN(howlPlayIdRaw) ? howlPlayIdRaw : undefined
    playback.howlPlayId = resolvedId

    if (!this.isPlaybackActive(playback)) {
      return this.createNoopHandle(soundId)
    }

    const vol = this.computePlaybackVolume(def, options)
    if (options.fadeInMs && options.fadeInMs > 0) {
      this.applyPerInstanceVolume(howl, 0, playback.howlPlayId)
      if (playback.howlPlayId !== undefined) {
        howl.fade(0, vol, options.fadeInMs, playback.howlPlayId)
      } else {
        howl.fade(0, vol, options.fadeInMs)
      }
    } else {
      this.applyPerInstanceVolume(howl, vol, playback.howlPlayId)
    }
    this.applyPlaybackLoopOption(howl, playback.howlPlayId, options.loop)

    const effectPreset = options.effect ?? def.effect
    playback.effectRelease = this.tryApplyPlaybackEffectChain(howl, playback.howlPlayId, effectPreset)

    if (!options.loop) {
      this.registerEndListenerAfterPlay(howl, playback, playback.howlPlayId)
    }

    if (def.playback === 'rate-limited') {
      this.recordRateLimitTrigger(def, soundId, options)
    }

    return {
      soundId,
      stop: () => {
        this.stopPlaybackInstance(playback)
      },
      playing: () =>
        playback.howlPlayId !== undefined
          ? howl.playing(playback.howlPlayId)
          : howl.playing(),
      progress: () => {
        const id = playback.howlPlayId
        const dur = id !== undefined ? howl.duration(id) : howl.duration()
        const pos = id !== undefined ? Number(howl.seek(id)) : Number(howl.seek())
        return dur > 0 ? pos / dur : 0
      },
      duration: () =>
        playback.howlPlayId !== undefined
          ? howl.duration(playback.howlPlayId)
          : howl.duration(),
      setVolume: (vol: number) => {
        playback.baseVolumeScale = vol
        const effectiveVol = vol * this.getCategoryVolume(def.category)
        this.applyPerInstanceVolume(howl, effectiveVol, playback.howlPlayId)
      },
      setStereo: (pan: number) => {
        if (playback.howlPlayId !== undefined) {
          howl.stereo(pan, playback.howlPlayId)
        } else {
          howl.stereo(pan)
        }
      },
    }
  }

  /**
   * Stops every active sound in a category, unloads non-cached Howls, and clears bookkeeping.
   */
  stopCategory(category: AudioCategory): void {
    if (category === 'voice' && this.pendingLockedVoice) {
      this.pendingLockedVoice.stateRef.kind = 'cancelled'
      this.pendingLockedVoice = null
    }
    const list = this.activeByCategory.get(category)
    if (!list?.length) return
    const copy = [...list]
    for (const p of copy) {
      this.stopPlaybackInstance(p)
    }
  }

  /**
   * Stops every active playback for a specific manifest sound id.
   *
   * @param soundId - Registered manifest sound id to silence.
   */
  stopSound(soundId: AudioSoundId): void {
    if (this.pendingLockedVoice?.soundId === soundId) {
      this.pendingLockedVoice.stateRef.kind = 'cancelled'
      this.pendingLockedVoice = null
    }
    this.stopAllActiveWithSoundId(soundId)
  }

  /**
   * Applies manifest {@link AudioDefinition.playback} rules before starting a new instance.
   */
  private applyPlaybackModePrelude(def: Readonly<AudioDefinition>, soundId: AudioSoundId): void {
    switch (def.playback) {
      case 'exclusive-category':
        this.stopCategory(def.category)
        break
      case 'restart':
      case 'single-instance':
        this.stopAllActiveWithSoundId(soundId)
        break
      case 'overlap':
      case 'rate-limited':
        break
      default:
        break
    }
  }

  private isRateLimited(
    def: Readonly<AudioDefinition>,
    soundId: AudioSoundId,
    options: AudioPlayOptions,
  ): boolean {
    const ms = def.cooldownMs ?? 0
    if (ms <= 0) return false
    const key = options.cooldownKey ?? soundId
    const last = this.lastRateLimitTriggerAt.get(key)
    if (last === undefined) return false
    return performance.now() - last < ms
  }

  private recordRateLimitTrigger(
    def: Readonly<AudioDefinition>,
    soundId: AudioSoundId,
    options: AudioPlayOptions,
  ): void {
    const ms = def.cooldownMs ?? 0
    if (ms <= 0) return
    const key = options.cooldownKey ?? soundId
    this.lastRateLimitTriggerAt.set(key, performance.now())
  }

  private stopAllActiveWithSoundId(soundId: AudioSoundId): void {
    const toStop: ActivePlayback[] = []
    for (const cat of AUDIO_CATEGORIES) {
      const list = this.activeByCategory.get(cat)
      if (!list?.length) continue
      for (const p of list) {
        if (p.soundId === soundId) toStop.push(p)
      }
    }
    for (const p of toStop) {
      this.stopPlaybackInstance(p)
    }
  }

  /**
   * Registers `playerror` / `loaderror` before {@link Howl.play} so synchronous failures are not
   * missed.
   */
  private registerPlaybackErrorListenersBeforePlay(howl: Howl, playback: ActivePlayback): void {
    const { playErrorHandler, loadErrorHandler } = playback
    const cached = this.isCachedHowlInstance(howl)
    if (cached) {
      howl.on('playerror', playErrorHandler)
      howl.on('loaderror', loadErrorHandler)
    } else {
      howl.once('playerror', playErrorHandler)
      howl.once('loaderror', loadErrorHandler)
    }
  }

  /**
   * Registers `end` after `play()` returns a sound id (Howler requires the id for per-instance end).
   */
  private registerEndListenerAfterPlay(
    howl: Howl,
    playback: ActivePlayback,
    howlPlayId: number | undefined,
  ): void {
    const { endHandler } = playback
    if (howlPlayId !== undefined) {
      howl.once('end', endHandler, howlPlayId)
    } else {
      howl.once('end', endHandler)
    }
  }

  /**
   * Removes all listeners registered for this playback.
   */
  private detachPlaybackListeners(playback: ActivePlayback): void {
    const { howl, howlPlayId, endHandler, playErrorHandler, loadErrorHandler } = playback
    howl.off('playerror', playErrorHandler)
    howl.off('loaderror', loadErrorHandler)
    if (howlPlayId !== undefined) {
      howl.off('end', endHandler, howlPlayId)
    } else {
      howl.off('end', endHandler)
    }
  }

  private isPlaybackActive(playback: ActivePlayback): boolean {
    const list = this.activeByCategory.get(playback.category)
    return list?.some((p) => p.token === playback.token) ?? false
  }

  /**
   * Howler emits `loaderror` with a null id for howl-level failures; tear down every active
   * playback on a cached shared Howl, or this playback's row for a non-cached (dynamic) Howl.
   */
  private teardownPlaybackFailureForHowlLevelLoadError(playback: ActivePlayback): void {
    if (!this.isCachedHowlInstance(playback.howl)) {
      this.teardownPlaybackFailure(playback)
      return
    }
    const toTear: ActivePlayback[] = []
    for (const cat of AUDIO_CATEGORIES) {
      const list = this.activeByCategory.get(cat)
      if (!list?.length) continue
      for (const p of list) {
        if (p.howl === playback.howl) toTear.push(p)
      }
    }
    for (const p of toTear) {
      this.teardownPlaybackFailure(p)
    }
  }

  /** Natural completion: bookkeeping was updated in {@link endHandler}; only list + unload here. */
  private finalizePlaybackEnded(playback: ActivePlayback): void {
    const wasVoice = playback.category === 'voice'
    this.releasePlaybackEffectChain(playback)
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    if (wasVoice) {
      this.refreshDuckedCategoryVolumes('unduck')
    }
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  /**
   * Load/decode failure: invokes {@link ActivePlayback.onEndCallback} (same contract as natural
   * `end`), then drops bookkeeping and unloads dynamic Howls.
   */
  private teardownPlaybackFailure(playback: ActivePlayback): void {
    this.detachPlaybackListeners(playback)
    try {
      playback.onEndCallback?.()
    } catch {
      /* ignore user callback errors */
    }
    const wasVoice = playback.category === 'voice'
    this.releasePlaybackEffectChain(playback)
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    if (wasVoice) {
      this.refreshDuckedCategoryVolumes('unduck')
    }
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  private resumeHowlerAudioContext(): void {
    if (Howler.noAudio) return
    void Howler.volume()
    const ctx = Howler.ctx
    if (!ctx || typeof ctx.resume !== 'function') return
    void ctx.resume().catch(() => {
      /* ignore — may reject if not triggered from a user gesture */
    })
  }

  private pushActive(category: AudioCategory, playback: ActivePlayback): void {
    const list = this.activeByCategory.get(category) ?? []
    list.push(playback)
    this.activeByCategory.set(category, list)
  }

  /** User stop / interrupt: tear down listeners first, then stop and unload dynamic Howls. */
  private stopPlaybackInstance(playback: ActivePlayback): void {
    this.detachPlaybackListeners(playback)
    const wasVoice = playback.category === 'voice'
    this.releasePlaybackEffectChain(playback)
    const removed = this.removeFromActiveList(playback)
    if (!removed) return
    if (wasVoice) {
      this.refreshDuckedCategoryVolumes('unduck')
    }
    if (this.clearQueuedHowlByUnloadingIfNotLoaded(playback)) {
      return
    }
    this.stopHowlSound(playback.howl, playback.howlPlayId)
    if (!this.isCachedHowlInstance(playback.howl)) {
      playback.howl.unload()
    }
  }

  private removeFromActiveList(playback: ActivePlayback): boolean {
    const list = this.activeByCategory.get(playback.category)
    if (!list?.length) return false
    const idx = list.findIndex((p) => p.token === playback.token)
    if (idx === -1) return false
    list.splice(idx, 1)
    if (!list.length) {
      this.activeByCategory.delete(playback.category)
    }
    return true
  }

  private stopHowlSound(howl: Howl, howlPlayId?: number): void {
    if (howlPlayId !== undefined) {
      howl.stop(howlPlayId)
    } else {
      howl.stop()
    }
  }

  /**
   * Per-instance gain: use `volume(vol, id)` when Howler exposes a play id so shared cached
   * Howls can overlap at different levels.
   */
  private applyPerInstanceVolume(howl: Howl, volume: number, howlPlayId: number | undefined): void {
    if (howlPlayId !== undefined) {
      howl.volume(volume, howlPlayId)
    } else {
      howl.volume(volume)
    }
  }

  private computePlaybackVolume(def: Readonly<AudioDefinition>, options: AudioPlayOptions): number {
    const baseVol = options.volume ?? def.volume
    return baseVol * this.getCategoryVolume(def.category)
  }

  /**
   * Fades active `ui` / `sfx` toward the ducked or restored target when voice ducking engages or
   * releases.
   */
  private refreshDuckedCategoryVolumes(transition: 'duck' | 'unduck'): void {
    const fadeMs =
      transition === 'duck' ? VOICE_DUCK_FADE_ATTACK_MS : VOICE_DUCK_FADE_RELEASE_MS
    for (const cat of ['ui', 'sfx'] as const) {
      const list = this.activeByCategory.get(cat)
      if (!list?.length) continue
      for (const p of list) {
        const targetVol = p.baseVolumeScale * this.getCategoryVolume(cat)
        const fromVol = this.getPerInstanceVolumeFromHowl(p)
        if (Math.abs(fromVol - targetVol) < 1e-6) continue
        if (fadeMs <= 0) {
          this.applyPerInstanceVolume(p.howl, targetVol, p.howlPlayId)
          continue
        }
        if (p.howlPlayId !== undefined) {
          p.howl.fade(fromVol, targetVol, fadeMs, p.howlPlayId)
        } else {
          p.howl.fade(fromVol, targetVol, fadeMs)
        }
      }
    }
  }

  /**
   * Reads the current Howl gain for this playback.
   */
  private getPerInstanceVolumeFromHowl(playback: ActivePlayback): number {
    const { howl, howlPlayId } = playback
    if (howlPlayId !== undefined) {
      const v = howl.volume(howlPlayId)
      return typeof v === 'number' && !Number.isNaN(v) ? v : 1
    }
    const v = howl.volume()
    return typeof v === 'number' && !Number.isNaN(v) ? v : 1
  }

  private releasePlaybackEffectChain(playback: ActivePlayback): void {
    try {
      playback.effectRelease?.()
    } finally {
      playback.effectRelease = undefined
    }
  }

  /**
   * Inserts the Web Audio effect chain between the Howl per-sound gain and `masterGain` when safe.
   */
  private tryApplyPlaybackEffectChain(
    howl: Howl,
    howlPlayId: number | undefined,
    effectPreset: AudioEffectPreset,
  ): (() => void) | undefined {
    if (effectPreset === 'none' || howlPlayId === undefined || Howler.noAudio) {
      return undefined
    }
    const ctx = Howler.ctx
    const masterGain = (Howler as unknown as { masterGain?: GainNode }).masterGain
    if (!ctx || !masterGain) {
      return undefined
    }

    const chain = createEffectChain(ctx, effectPreset)
    if (!chain) {
      return undefined
    }

    const sound = (
      howl as unknown as {
        _soundById?: (id: number) => { _node?: unknown } | null
      }
    )._soundById?.(howlPlayId)
    const gainNode = sound?._node
    if (!isWebAudioGainNode(gainNode)) {
      chain.dispose()
      return undefined
    }

    try {
      gainNode.disconnect()
    } catch {
      chain.dispose()
      return undefined
    }

    try {
      gainNode.connect(chain.input)
      chain.output.connect(masterGain)
    } catch {
      try {
        gainNode.connect(masterGain)
      } catch {
        /* ignore */
      }
      chain.dispose()
      return undefined
    }

    return () => {
      try {
        chain.output.disconnect()
      } catch {
        /* ignore */
      }
      try {
        gainNode.disconnect()
      } catch {
        /* ignore */
      }
      chain.dispose()
      try {
        gainNode.connect(masterGain)
      } catch {
        /* ignore */
      }
    }
  }

  private resolvePlaySrc(
    def: Readonly<AudioDefinition>,
    options: AudioPlayOptions,
  ): string | readonly string[] | undefined {
    const allowDynamicSrc = 'allowDynamicSrc' in def && def.allowDynamicSrc === true
    if (allowDynamicSrc && options.src !== undefined && options.src !== '') {
      return options.src
    }
    if ('src' in def && def.src !== undefined) {
      return def.src
    }
    return undefined
  }

  private getOrCreateHowl(soundId: AudioSoundId): Howl {
    const cached = this.cachedHowls.get(soundId)
    if (cached) return cached

    const def = getAudioDefinition(soundId)
    if (!('src' in def) || def.src === undefined) {
      throw new Error(`Sound ${soundId} requires a runtime src`)
    }
    const srcList = Array.isArray(def.src) ? [...def.src] : [def.src]
    const howl = new Howl({
      src: srcList,
      preload: def.load === 'eager',
      volume: 1,
    })
    this.cachedHowls.set(soundId, howl)
    return howl
  }

  /**
   * Howler does not auto-load `preload: false` Howls on `play()`, so lazy static cues and runtime
   * dynamic Howls must be explicitly loaded the first time they are used.
   */
  private ensureHowlLoadedBeforePlay(howl: Howl): void {
    if (howl.state() === 'unloaded') {
      howl.load()
    }
  }

  /**
   * Stopping a Howl before it finishes loading can leave queued Howler `play` actions behind.
   * Unload + cache eviction clears that queue so a cancelled loop cannot resurrect later as an orphan.
   */
  private clearQueuedHowlByUnloadingIfNotLoaded(playback: ActivePlayback): boolean {
    if (playback.howl.state() === 'loaded') {
      return false
    }
    if (this.cachedHowls.get(playback.soundId) === playback.howl) {
      this.cachedHowls.delete(playback.soundId)
    }
    playback.howl.unload()
    return true
  }

  /**
   * Applies an optional loop override to the current play instance.
   */
  private applyPlaybackLoopOption(
    howl: Howl,
    howlPlayId: number | undefined,
    loop: boolean | undefined,
  ): void {
    if (loop !== true) return
    if (howlPlayId !== undefined) {
      howl.loop(true, howlPlayId)
      return
    }
    howl.loop(true)
  }

  private isCachedHowlInstance(howl: Howl): boolean {
    for (const h of this.cachedHowls.values()) {
      if (h === howl) return true
    }
    return false
  }

  /**
   * Dynamic `voice` + `allowDynamicSrc` with a runtime `src` may be queued while locked, then
   * replayed after {@link AudioManager.unlock}.
   */
  private canQueueLockedDynamicVoice(
    def: Readonly<AudioDefinition>,
    resolvedSrc: string | readonly string[],
  ): boolean {
    const dynamic = 'allowDynamicSrc' in def && def.allowDynamicSrc === true
    return dynamic && def.category === 'voice' && typeof resolvedSrc === 'string'
  }

  /**
   * Reserves manifest prelude (voice exclusive stop), stores one pending request, returns a handle
   * that can cancel before unlock or delegate to the real playback after flush.
   */
  private enqueueLockedVoicePlay(soundId: AudioSoundId, options: AudioPlayOptions): AudioPlaybackHandle {
    const def = getAudioDefinition(soundId)
    this.applyPlaybackModePrelude(def, soundId)
    const stateRef: VoiceHandleState = {
      kind: 'pending',
    }
    this.pendingLockedVoice = {
      soundId,
      options: { ...options },
      stateRef,
    }
    return this.createPendingVoiceHandle(soundId, stateRef)
  }

  private flushPendingLockedVoice(): void {
    const pending = this.pendingLockedVoice
    if (!pending || pending.stateRef.kind !== 'pending') return
    this.pendingLockedVoice = null
    const stateRef = pending.stateRef
    const real = this.play(pending.soundId, pending.options)
    if (stateRef.kind === 'cancelled') {
      real.stop()
      return
    }
    stateRef.kind = 'active'
    stateRef.realHandle = real
  }

  private createPendingVoiceHandle(
    soundId: AudioSoundId,
    stateRef: VoiceHandleState,
  ): AudioPlaybackHandle {
    return {
      soundId,
      stop: () => {
        if (stateRef.kind === 'cancelled') return
        if (stateRef.kind === 'active') {
          stateRef.realHandle?.stop()
          return
        }
        if (this.pendingLockedVoice?.stateRef === stateRef) {
          this.pendingLockedVoice = null
        }
        stateRef.kind = 'cancelled'
      },
      playing: () => (stateRef.kind === 'active' ? (stateRef.realHandle?.playing() ?? false) : false),
      progress: () => (stateRef.kind === 'active' ? (stateRef.realHandle?.progress() ?? 0) : 0),
      duration: () => (stateRef.kind === 'active' ? (stateRef.realHandle?.duration() ?? 0) : 0),
      setVolume: (vol: number) => {
        if (stateRef.kind === 'active') stateRef.realHandle?.setVolume(vol)
      },
      setStereo: (pan: number) => {
        if (stateRef.kind === 'active') stateRef.realHandle?.setStereo(pan)
      },
    }
  }

  private createNoopHandle(soundId: AudioSoundId): AudioPlaybackHandle {
    return {
      soundId,
      stop: () => {},
      playing: () => false,
      progress: () => 0,
      duration: () => 0,
      setVolume: () => {},
      setStereo: () => {},
    }
  }

  private tryPlayProceduralSound(
    soundId: AudioSoundId,
    def: Readonly<AudioDefinition>,
    options: AudioPlayOptions,
  ): AudioPlaybackHandle | null {
    if (!def.procedural) return null
    if (options.loop) {
      return this.createNoopHandle(soundId)
    }
    return (
      playProceduralSound({
        soundId,
        preset: def.procedural,
        volume: this.computePlaybackVolume(def, options),
        onEnd: options.onEnd,
      }) ?? this.createNoopHandle(soundId)
    )
  }
}

/** True when Howler attached a Web Audio `GainNode` for this sound instance. */
function isWebAudioGainNode(node: unknown): node is GainNode {
  return (
    typeof node === 'object' &&
    node !== null &&
    'gain' in node &&
    typeof (node as GainNode).connect === 'function' &&
    typeof (node as GainNode).disconnect === 'function'
  )
}
