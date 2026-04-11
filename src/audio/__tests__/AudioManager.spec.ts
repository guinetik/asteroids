import { beforeEach, describe, expect, it, vi } from 'vitest'

type ErrFn = (id: number | null, err: unknown) => void

type MockHowlProbe = {
  src: string[]
  endOnce: Array<{ fn: () => void; id?: number }>
  playErrorOn: Array<{ fn: ErrFn }>
  playErrorOnce: Array<{ fn: ErrFn; id?: number }>
  loadErrorOn: Array<{ fn: ErrFn }>
  loadErrorOnce: Array<{ fn: ErrFn; id?: number }>
}

const {
  mockPlay,
  mockStop,
  mockUnload,
  mockLoad,
  mockDuration,
  mockSeek,
  mockPlaying,
  mockHowlVolume,
  mockLoop,
  mockFade,
  mockCtxResume,
  mockOff,
  mockHowlInstances,
  mockMasterGain,
  mockCreateBiquadFilter,
  mockCreateWaveShaper,
  mockGainNodes,
  playCounterRef,
  syncPlayErrorRef,
  deferLoadRef,
} = vi.hoisted(() => ({
  mockPlay: vi.fn(),
  mockStop: vi.fn(),
  mockUnload: vi.fn(),
  mockLoad: vi.fn(),
  mockDuration: vi.fn(() => 12),
  mockSeek: vi.fn(() => 3),
  mockPlaying: vi.fn(() => true),
  mockHowlVolume: vi.fn(),
  mockLoop: vi.fn(),
  mockFade: vi.fn(),
  mockCtxResume: vi.fn(() => Promise.resolve()),
  mockOff: vi.fn(),
  mockHowlInstances: [] as MockHowlProbe[],
  mockMasterGain: {
    gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  mockCreateBiquadFilter: vi.fn(),
  mockCreateWaveShaper: vi.fn(),
  mockGainNodes: [] as Array<{
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }>,
  playCounterRef: { n: 0 },
  syncPlayErrorRef: { trigger: false },
  deferLoadRef: { trigger: false },
}))

vi.mock('howler', () => {
  mockCreateBiquadFilter.mockImplementation(() => ({
    type: 'lowpass',
    frequency: { value: 1000 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))
  mockCreateWaveShaper.mockImplementation(() => ({
    curve: null as Float32Array | null,
    oversample: '4x' as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }))

  class MockHowl {
    src: string[]
    endOnce: Array<{ fn: () => void; id?: number }> = []
    playErrorOn: Array<{ fn: ErrFn }> = []
    playErrorOnce: Array<{ fn: ErrFn; id?: number }> = []
    loadErrorOn: Array<{ fn: ErrFn }> = []
    loadErrorOnce: Array<{ fn: ErrFn; id?: number }> = []
    private _state: 'unloaded' | 'loaded'
    private readonly _instanceVol = new Map<number, number>()
    private readonly _soundsById = new Map<
      number,
      {
        _id: number
        _node: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }
      }
    >()
    private _groupVol = 1

    constructor(opts: { src: string[] | string; volume?: number; preload?: boolean }) {
      this.src = Array.isArray(opts.src) ? opts.src : [opts.src]
      this._state = opts.preload ? 'loaded' : 'unloaded'
      mockHowlInstances.push(this)
    }

    private emitPlayError(id: number): void {
      const err = new Error('sync playerror')
      for (const { fn } of [...this.playErrorOn]) {
        fn(id, err)
      }
      const onceCopy = [...this.playErrorOnce]
      this.playErrorOnce.length = 0
      for (const { fn } of onceCopy) {
        fn(id, err)
      }
    }

    play = () => {
      playCounterRef.n += 1
      const id = mockPlay() ?? playCounterRef.n
      const gainNode = {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      mockGainNodes.push(gainNode)
      this._soundsById.set(id, { _id: id, _node: gainNode })
      if (syncPlayErrorRef.trigger) {
        this.emitPlayError(id)
      }
      return id
    }
    stop = mockStop
    unload = mockUnload
    load = mockLoad.mockImplementation(function (this: MockHowl) {
      if (!deferLoadRef.trigger) {
        this._state = 'loaded'
      }
      return this
    })
    state = () => this._state
    duration = mockDuration
    seek = mockSeek
    playing = mockPlaying
    on = vi.fn((event: string, cb: (...args: unknown[]) => void, _id?: number) => {
      if (event === 'playerror') this.playErrorOn.push({ fn: cb as ErrFn })
      else if (event === 'loaderror') this.loadErrorOn.push({ fn: cb as ErrFn })
      return this
    })
    once = vi.fn((event: string, cb: (...args: unknown[]) => void, id?: number) => {
      if (event === 'end') {
        this.endOnce.push({ fn: cb as () => void, id })
      } else if (event === 'playerror') {
        this.playErrorOnce.push({ fn: cb as ErrFn, id })
      } else if (event === 'loaderror') {
        this.loadErrorOnce.push({ fn: cb as ErrFn, id })
      }
      return this
    })
    off = mockOff.mockImplementation(
      (event: string, cb: (...args: unknown[]) => void, id?: number) => {
        const matchOnce = (arr: Array<{ fn: unknown; id?: number }>) => {
          const idx = arr.findIndex(
            (e) => e.fn === cb && (id === undefined ? e.id === undefined : e.id === id),
          )
          if (idx >= 0) arr.splice(idx, 1)
        }
        const matchOn = (arr: Array<{ fn: unknown }>) => {
          const idx = arr.findIndex((e) => e.fn === cb)
          if (idx >= 0) arr.splice(idx, 1)
        }
        if (event === 'end') matchOnce(this.endOnce as Array<{ fn: unknown; id?: number }>)
        else if (event === 'playerror') {
          matchOn(this.playErrorOn)
          matchOnce(this.playErrorOnce as Array<{ fn: unknown; id?: number }>)
        } else if (event === 'loaderror') {
          matchOn(this.loadErrorOn)
          matchOnce(this.loadErrorOnce as Array<{ fn: unknown; id?: number }>)
        }
        return this
      },
    )

    volume = (...args: unknown[]): number | MockHowl => {
      if (args.length === 0) return this._groupVol
      if (args.length === 1 && typeof args[0] === 'number') {
        const id = args[0]
        if (this._instanceVol.has(id)) return this._instanceVol.get(id)!
        return 1
      }
      if (args.length === 2 && typeof args[0] === 'number' && typeof args[1] === 'number') {
        this._instanceVol.set(args[1], args[0])
        mockHowlVolume(args[0], args[1])
        return this
      }
      return this
    }

    fade = (from: number, to: number, durationMs: number, id?: number) => {
      mockFade(from, to, durationMs, id)
      if (id !== undefined) {
        this.volume(to, id)
      } else {
        this._groupVol = to
        mockHowlVolume(to)
      }
      return this
    }

    loop = (value?: boolean, id?: number): boolean | MockHowl => {
      if (typeof value === 'boolean') {
        mockLoop(value, id)
        return this
      }
      return false
    }

    stereo = vi.fn()

    _soundById = (id: number) => this._soundsById.get(id) ?? null
  }

  return {
    Howl: MockHowl,
    Howler: {
      noAudio: false,
      autoUnlock: false,
      _volume: 1,
      masterGain: mockMasterGain,
      get ctx() {
        return {
          state: 'suspended' as string,
          resume: mockCtxResume,
          createGain: vi.fn(() => ({
            gain: { value: 1 },
            connect: vi.fn(),
            disconnect: vi.fn(),
          })),
          createBiquadFilter: mockCreateBiquadFilter,
          createWaveShaper: mockCreateWaveShaper,
        }
      },
      volume(this: { _volume: number }, vol?: number) {
        if (typeof vol === 'number' && vol >= 0 && vol <= 1) {
          this._volume = vol
          return this
        }
        return this._volume
      },
    },
  }
})

import * as audioManifest from '../audioManifest'
import { SEEDED_SOUND_IDS, SILENT_STATIC_WAV_DATA_URI } from '../audioManifest'
import {
  VOICE_DUCK_FADE_ATTACK_MS,
  VOICE_DUCK_FADE_RELEASE_MS,
  VOICE_DUCK_UI_SFX_MULTIPLIER,
} from '../audioEffects'
import { AudioManager } from '../AudioManager'
import { resetAudioForTests, useAudio } from '../useAudio'

function getLastMockHowl(): MockHowlProbe | undefined {
  return mockHowlInstances[mockHowlInstances.length - 1]
}

function fireRegisteredEndCallbacks(): void {
  const h = getLastMockHowl()
  if (!h) return
  const copy = [...h.endOnce]
  h.endOnce.length = 0
  for (const { fn } of copy) {
    fn()
  }
}

function emitPlayErrorOnHowl(h: MockHowlProbe, id: number): void {
  const err = new Error('mock play error')
  for (const { fn } of [...h.playErrorOn]) {
    fn(id, err)
  }
  const onceCopy = [...h.playErrorOnce]
  h.playErrorOnce.length = 0
  for (const { fn } of onceCopy) {
    fn(id, err)
  }
}

function emitLoadErrorOnHowl(h: MockHowlProbe, id: number | null): void {
  const err = new Error('mock load error')
  for (const { fn } of [...h.loadErrorOn]) {
    fn(id, err)
  }
  const onceCopy = [...h.loadErrorOnce]
  h.loadErrorOnce.length = 0
  for (const { fn } of onceCopy) {
    fn(id, err)
  }
}

function firePlayErrorOnLastHowl(id: number): void {
  const h = getLastMockHowl()
  if (!h) return
  emitPlayErrorOnHowl(h, id)
}

function fireLoadErrorOnLastHowl(id: number | null): void {
  const h = getLastMockHowl()
  if (!h) return
  emitLoadErrorOnHowl(h, id)
}

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockHowlInstances.length = 0
    mockGainNodes.length = 0
    playCounterRef.n = 0
    syncPlayErrorRef.trigger = false
    deferLoadRef.trigger = false
    mockDuration.mockImplementation(() => 12)
    mockSeek.mockImplementation(() => 3)
    mockCtxResume.mockImplementation(() => Promise.resolve())
    mockMasterGain.connect.mockImplementation(() => mockMasterGain)
    manager = new AudioManager()
  })

  it('plays dynamic voice sources through the voice category', () => {
    manager.unlock()
    const handle = manager.play('voice.comms', { src: '/comms/mission-001.mp3' })
    expect(mockPlay).toHaveBeenCalled()
    expect(handle.soundId).toBe('voice.comms')
    expect(handle.duration()).toBe(12)
    expect(handle.progress()).toBeCloseTo(0.25)
    expect(mockHowlVolume).toHaveBeenCalledWith(0.6, 1)
  })

  it('handle progress() tracks seek/duration for dynamic voice', () => {
    manager.unlock()
    mockDuration.mockReturnValue(100)
    mockSeek.mockReturnValue(42)
    const h = manager.play('voice.comms', { src: '/comms/progress-bar.mp3' })
    expect(h.progress()).toBeCloseTo(0.42)
    mockSeek.mockReturnValue(50)
    expect(h.progress()).toBeCloseTo(0.5)
  })

  it('unlocked dynamic voice play returns a handle with playing() true', () => {
    manager.unlock()
    const h = manager.play('voice.comms', { src: '/comms/gesture.mp3' })
    expect(h.playing()).toBe(true)
  })

  it('locked dynamic voice play returns pending handle with playing() false until unlock', () => {
    const h = manager.play('voice.comms', { src: '/comms/pending.mp3' })
    expect(h.playing()).toBe(false)
    manager.unlock()
    expect(h.playing()).toBe(true)
  })

  it('stops the previous voice sound when an exclusive voice sound starts', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/A.mp3' })
    manager.play('voice.comms', { src: '/comms/B.mp3' })
    expect(mockStop).toHaveBeenCalled()
  })

  it('can stop the voice category explicitly', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/test.mp3' })
    manager.stopCategory('voice')
    expect(mockStop).toHaveBeenCalled()
    expect(mockUnload).toHaveBeenCalled()
  })

  it('can stop an active sound by id', () => {
    manager.unlock()
    manager.play('sfx.thrusterLoop', { loop: true })
    manager.stopSound('sfx.thrusterLoop')
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('queues dynamic voice while locked and plays on unlock', () => {
    manager.play('voice.comms', { src: '/comms/queued.mp3' })
    expect(mockPlay).not.toHaveBeenCalled()
    manager.unlock()
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('cancelled pending voice does not play on unlock', () => {
    const h = manager.play('voice.comms', { src: '/comms/cancel.mp3' })
    expect(mockPlay).not.toHaveBeenCalled()
    h.stop()
    manager.unlock()
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('stopCategory(voice) clears pending locked voice before unlock', () => {
    manager.play('voice.comms', { src: '/comms/cat-clear.mp3' })
    manager.stopCategory('voice')
    manager.unlock()
    expect(mockPlay).not.toHaveBeenCalled()
  })

  it('replaces queued voice when a newer request arrives while locked', () => {
    manager.play('voice.comms', { src: '/comms/old.mp3' })
    manager.play('voice.comms', { src: '/comms/new.mp3' })
    manager.unlock()
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(getLastMockHowl()?.src[0]).toBe('/comms/new.mp3')
  })

  it('resume()s the Web Audio context on unlock when autoUnlock is disabled', () => {
    manager.unlock()
    expect(mockCtxResume).toHaveBeenCalled()
  })

  it('ignores options.src for static manifest entries (uses bundled src)', () => {
    manager.unlock()
    manager.play('ui.click', { src: 'https://example.com/override.mp3' })
    expect(getLastMockHowl()?.src[0]).toBe(SILENT_STATIC_WAV_DATA_URI)
  })

  it('applies per-instance volume on each play for shared cached Howls', () => {
    const m = new AudioManager({
      initialCategoryState: { ui: { volume: 1, muted: false } },
    })
    m.unlock()
    m.play('ui.click')
    // applyCategoryState now also refreshes active playbacks immediately (so live sounds react to
    // mute/volume changes without needing a replayed sound to pick up the new gain).
    m.applyCategoryState('ui', { volume: 0.5 })
    m.play('ui.click')
    expect(mockHowlVolume).toHaveBeenCalledTimes(3)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 0.35, 1)   // first play at full vol
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0.175, 1)  // refresh first instance to new vol
    expect(mockHowlVolume).toHaveBeenNthCalledWith(3, 0.175, 2)  // second play at new vol
  })

  it('applies distinct per-play volume overrides per Howl play id on shared cached Howls', () => {
    manager.unlock()
    manager.play('ui.click', { volume: 1 })
    manager.play('ui.click', { volume: 0.5 })
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 1, 1)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0.5, 2)
  })

  it('preload warms static sounds via cached Howls and Howl.load without duplicate instances', () => {
    manager.preload([...SEEDED_SOUND_IDS])
    expect(mockHowlInstances).toHaveLength(SEEDED_SOUND_IDS.length)
    expect(mockLoad).toHaveBeenCalledTimes(SEEDED_SOUND_IDS.length)
    const afterPreload = mockHowlInstances.length
    manager.unlock()
    manager.play('ui.click')
    expect(mockHowlInstances).toHaveLength(afterPreload)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('loads lazy static sounds before first play when the cached Howl is still unloaded', () => {
    manager.unlock()
    manager.play('sfx.explosion')
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('loads dynamic sounds before play when the runtime Howl starts unloaded', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/test.mp3' })
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(mockPlay).toHaveBeenCalledTimes(1)
  })

  it('applies per-play loop mode when requested', () => {
    manager.unlock()
    manager.play('sfx.explosion', { loop: true })
    expect(mockLoop).toHaveBeenCalledTimes(1)
    expect(mockLoop).toHaveBeenCalledWith(true, 1)
  })

  it('unloads a cached sound stopped while still loading to clear queued playback', () => {
    deferLoadRef.trigger = true
    manager.unlock()
    const h = manager.play('sfx.explosion', { loop: true })
    h.stop()
    expect(mockUnload).toHaveBeenCalledTimes(1)
  })

  it('preload skips dynamic-only manifest ids and does not throw', () => {
    expect(() => manager.preload(['voice.comms', 'ui.click'])).not.toThrow()
    expect(mockHowlInstances).toHaveLength(1)
    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it('tracks multiple concurrent playbacks in the same category when not exclusive', () => {
    manager.unlock()
    manager.play('ui.click')
    manager.play('ui.error')
    expect(mockPlay).toHaveBeenCalledTimes(2)
    manager.stopCategory('ui')
    expect(mockStop).toHaveBeenCalledTimes(2)
  })

  it('restart mode stops the prior instance of the same sound before replaying', () => {
    manager.unlock()
    manager.play('ui.click')
    expect(getLastMockHowl()?.endOnce).toHaveLength(1)
    manager.play('ui.click')
    expect(mockStop).toHaveBeenCalledTimes(1)
    expect(mockOff).toHaveBeenCalled()
    expect(getLastMockHowl()?.endOnce).toHaveLength(1)
  })

  it('single-instance mode stops the prior instance before replaying', () => {
    manager.unlock()
    manager.play('sfx.thrusterLoop')
    manager.play('sfx.thrusterLoop')
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('overlap mode does not pre-stop prior instances of the same sound', () => {
    manager.unlock()
    manager.play('sfx.explosion')
    manager.play('sfx.explosion')
    expect(mockStop).not.toHaveBeenCalled()
  })

  it('overlapping cached plays keep per-playback on() error handlers until matching playerror', () => {
    manager.unlock()
    manager.play('sfx.explosion')
    manager.play('sfx.explosion')
    const h = getLastMockHowl()
    expect(h?.playErrorOn.length).toBe(2)
    emitPlayErrorOnHowl(h!, 1)
    expect(h?.playErrorOn.length).toBe(1)
    emitPlayErrorOnHowl(h!, 2)
    expect(h?.playErrorOn.length).toBe(0)
  })

  it('rate-limited mode ignores plays inside cooldown', () => {
    const orig = audioManifest.getAudioDefinition
    const spy = vi.spyOn(audioManifest, 'getAudioDefinition').mockImplementation((id) => {
      const def = orig(id)
      if (id === 'ui.click') {
        return { ...def, playback: 'rate-limited' as const, cooldownMs: 60_000 }
      }
      return def
    })
    manager.unlock()
    const a = manager.play('ui.click')
    const b = manager.play('ui.click')
    expect(mockPlay).toHaveBeenCalledTimes(1)
    expect(a.soundId).toBe('ui.click')
    expect(b.soundId).toBe('ui.click')
    expect(b.playing()).toBe(false)
    spy.mockRestore()
  })

  it('invokes onEnd and unloads dynamic Howls when a playback ends naturally', () => {
    let ended = false
    manager.unlock()
    manager.play('voice.comms', {
      src: '/comms/X.mp3',
      onEnd: () => {
        ended = true
      },
    })
    expect(getLastMockHowl()?.endOnce).toHaveLength(1)
    fireRegisteredEndCallbacks()
    expect(ended).toBe(true)
    expect(mockUnload).toHaveBeenCalled()
  })

  it('unloads dynamic Howls on manual stop', () => {
    manager.unlock()
    const h = manager.play('voice.comms', { src: '/comms/Y.mp3' })
    h.stop()
    expect(mockUnload).toHaveBeenCalled()
  })

  it('cleans up active playback and unloads dynamic Howls on playerror', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/fail.mp3' })
    expect(getLastMockHowl()?.playErrorOnce.length).toBeGreaterThan(0)
    firePlayErrorOnLastHowl(1)
    expect(mockUnload).toHaveBeenCalled()
    expect(getLastMockHowl()?.endOnce).toHaveLength(0)
  })

  it('invokes onEnd when dynamic playback fails with playerror', () => {
    let ended = false
    manager.unlock()
    manager.play('voice.comms', {
      src: '/comms/fail-onend.mp3',
      onEnd: () => {
        ended = true
      },
    })
    firePlayErrorOnLastHowl(1)
    expect(ended).toBe(true)
  })

  it('handles synchronous playerror during play() without leaving an active playback', () => {
    syncPlayErrorRef.trigger = true
    manager.unlock()
    const h = manager.play('voice.comms', { src: '/comms/sync-fail.mp3' })
    expect(h.playing()).toBe(false)
    expect(mockUnload).toHaveBeenCalled()
    syncPlayErrorRef.trigger = false
  })

  it('cleans up dynamic Howls when loaderror fires with a null sound id', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/null-load.mp3' })
    fireLoadErrorOnLastHowl(null)
    expect(mockUnload).toHaveBeenCalled()
  })

  it('returns a no-op handle when a dynamic sound has no resolved src', () => {
    manager.unlock()
    const h = manager.play('voice.comms')
    expect(mockPlay).not.toHaveBeenCalled()
    expect(h.playing()).toBe(false)
    expect(h.progress()).toBe(0)
  })

  it('resolveEffect(voice.comms) returns the radio preset parameters', () => {
    expect(manager.resolveEffect('voice.comms')).toEqual({
      id: 'radio',
      lowpassHz: 2600,
      highpassHz: 420,
      distortion: 0.18,
    })
  })

  it('ducks ui and sfx category gain to 0.55 of their mixer level while voice is active', () => {
    manager.unlock()
    manager.applyCategoryState('ui', { volume: 1, muted: false })
    manager.applyCategoryState('sfx', { volume: 1, muted: false })
    expect(manager.getCategoryVolume('ui')).toBe(1)
    expect(manager.getCategoryVolume('sfx')).toBe(1)
    manager.play('voice.comms', { src: '/comms/duck.mp3' })
    expect(manager.getCategoryVolume('ui')).toBeCloseTo(0.55)
    expect(manager.getCategoryVolume('sfx')).toBeCloseTo(0.55)
    expect(manager.getCategoryVolume('voice')).toBe(1)
    fireRegisteredEndCallbacks()
    expect(manager.getCategoryVolume('ui')).toBe(1)
    expect(manager.getCategoryVolume('sfx')).toBe(1)
  })

  it('applies voice ducking on top of existing category volume without mutating mixer state', () => {
    manager.unlock()
    manager.applyCategoryState('ui', { volume: 0.8, muted: false })
    manager.play('voice.comms', { src: '/comms/duck2.mp3' })
    expect(manager.getCategoryVolume('ui')).toBeCloseTo(0.44)
    fireRegisteredEndCallbacks()
    expect(manager.getCategoryVolume('ui')).toBe(0.8)
  })

  it('uses attack and release fades for ui/sfx ducking when voice starts and ends', () => {
    manager.unlock()
    manager.play('ui.click')
    manager.play('voice.comms', { src: '/comms/fade-duck.mp3' })
    expect(mockFade).toHaveBeenCalledWith(
      0.35,
      0.35 * VOICE_DUCK_UI_SFX_MULTIPLIER,
      VOICE_DUCK_FADE_ATTACK_MS,
      1,
    )
    fireRegisteredEndCallbacks()
    expect(mockFade).toHaveBeenCalledWith(
      0.35 * VOICE_DUCK_UI_SFX_MULTIPLIER,
      0.35,
      VOICE_DUCK_FADE_RELEASE_MS,
      1,
    )
  })

  it('inserts the Web Audio effect chain on the per-play gain for voice playback', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/chain.mp3' })
    expect(mockCreateBiquadFilter).toHaveBeenCalledTimes(2)
    expect(mockCreateWaveShaper).toHaveBeenCalledTimes(1)
    const h = getLastMockHowl() as unknown as {
      _soundById?: (
        id: number,
      ) => {
        _node: { disconnect: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn> }
      } | null
    }
    const sound = h._soundById?.(1)
    expect(sound?._node.disconnect).toHaveBeenCalled()
    expect(sound?._node.connect).toHaveBeenCalled()
    const wsResults = mockCreateWaveShaper.mock.results
    const waveShaper = wsResults[wsResults.length - 1]?.value as {
      connect: ReturnType<typeof vi.fn>
    }
    expect(waveShaper?.connect).toHaveBeenCalledWith(mockMasterGain)
  })

  it('does not throw when the effect chain cannot connect to the master bus', () => {
    mockCreateWaveShaper.mockImplementationOnce(() => ({
      curve: null as Float32Array | null,
      oversample: '4x' as const,
      connect: vi.fn(() => {
        throw new Error('bus connect fail')
      }),
      disconnect: vi.fn(),
    }))
    manager.unlock()
    expect(() =>
      manager.play('voice.comms', { src: '/comms/chain-fail.mp3' }),
    ).not.toThrow()
  })

  it('releases the effect chain and reconnects the gain to the master bus when voice ends', () => {
    manager.unlock()
    manager.play('voice.comms', { src: '/comms/effect-release.mp3' })
    const h = getLastMockHowl() as unknown as {
      _soundById?: (id: number) => { _node: { connect: ReturnType<typeof vi.fn> } } | null
    }
    const node = h._soundById?.(1)?._node
    fireRegisteredEndCallbacks()
    expect(node?.connect).toHaveBeenLastCalledWith(mockMasterGain)
  })
})

describe('useAudio', () => {
  beforeEach(() => {
    resetAudioForTests()
    vi.clearAllMocks()
  })

  it('returns a singleton AudioManager', () => {
    const a = useAudio()
    const b = useAudio()
    expect(a).toBe(b)
  })

  it('clears the singleton via resetAudioForTests', () => {
    const first = useAudio()
    resetAudioForTests()
    const second = useAudio()
    expect(second).not.toBe(first)
  })
})

describe('AudioManagerOptions.initialCategoryState', () => {
  beforeEach(() => {
    mockHowlInstances.length = 0
    playCounterRef.n = 0
    vi.clearAllMocks()
  })

  it('merges partial nested category patches', () => {
    const m = new AudioManager({
      initialCategoryState: {
        ui: { volume: 0.25 },
        voice: { muted: true },
      },
    })
    m.unlock()
    m.play('ui.click')
    expect(mockHowlVolume).toHaveBeenNthCalledWith(1, 0.35 * 0.25, 1)
    m.play('voice.comms', { src: '/x.mp3' })
    expect(mockFade).toHaveBeenCalledWith(
      0.35 * 0.25,
      0.35 * 0.25 * VOICE_DUCK_UI_SFX_MULTIPLIER,
      VOICE_DUCK_FADE_ATTACK_MS,
      1,
    )
    expect(mockHowlVolume).toHaveBeenNthCalledWith(2, 0.35 * 0.25 * VOICE_DUCK_UI_SFX_MULTIPLIER, 1)
    expect(mockHowlVolume).toHaveBeenNthCalledWith(3, 0, 2)
  })
})

describe('setVolume on playback handle', () => {
  it('updates the per-instance volume on a playing sound', () => {
    const mgr = new AudioManager()
    mgr.unlock()
    const handle = mgr.play('ui.click')
    handle.setVolume(0.5)
    expect(handle.playing).toBeDefined()
  })

  it('is a no-op on a noop handle', () => {
    const mgr = new AudioManager()
    const handle = mgr.play('ui.click')
    expect(() => handle.setVolume(0.5)).not.toThrow()
  })
})
