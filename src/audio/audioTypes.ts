/**
 * Type definitions for the manifest-driven audio system.
 *
 * @author guinetik
 * @date 2026-04-06
 */

/**
 * Canonical audio channel categories used by manifest entries and the runtime.
 */
export const AUDIO_CATEGORIES = ['ui', 'voice', 'sfx', 'ambient', 'music'] as const

/** Union of known {@link AUDIO_CATEGORIES} values. */
export type AudioCategory = (typeof AUDIO_CATEGORIES)[number]

/**
 * Built-in DSP / routing presets applied when playing a sound (e.g. radio band-pass for comms).
 */
export const AUDIO_EFFECT_PRESETS = [
  'none',
  'radio',
  'helmet-comms',
  'terminal-beep',
] as const

/** Union of {@link AUDIO_EFFECT_PRESETS} values. */
export type AudioEffectPreset = (typeof AUDIO_EFFECT_PRESETS)[number]

/** How and when decoded audio buffers are loaded relative to app startup. */
export const AUDIO_LOAD_STRATEGIES = ['eager', 'lazy', 'manual'] as const

/** Union of {@link AUDIO_LOAD_STRATEGIES} values. */
export type AudioLoadStrategy = (typeof AUDIO_LOAD_STRATEGIES)[number]

/**
 * Coexistence and interruption rules when the same or related sounds are triggered.
 *
 * `AudioManager` applies these as follows:
 * - `exclusive-category` — stop all other active playbacks in the same category before starting.
 * - `restart` — stop any prior active playback of the same sound id (any category), then play.
 * - `single-instance` — same as `restart` (one concurrent instance of that id).
 * - `overlap` — do not pre-stop; multiple instances may run (use per-instance volume on shared Howls).
 * - `rate-limited` — if `cooldownMs` is set, ignore play requests until the cooldown elapses (keyed by
 *   `cooldownKey` in {@link AudioPlayOptions} or the manifest `id`).
 */
export const AUDIO_PLAYBACK_MODES = [
  'restart',
  'overlap',
  'single-instance',
  'exclusive-category',
  'rate-limited',
] as const

/** Union of {@link AUDIO_PLAYBACK_MODES} values. */
export type AudioPlaybackMode = (typeof AUDIO_PLAYBACK_MODES)[number]

/** Fields shared by every manifest entry. */
interface AudioDefinitionCommon {
  id: string
  category: AudioCategory
  load: AudioLoadStrategy
  playback: AudioPlaybackMode
  volume: number
  effect: AudioEffectPreset
  cooldownMs?: number
}

/**
 * Bundled or fixed file path(s); `src` is required so static sounds cannot omit assets silently.
 */
export interface AudioDefinitionStatic extends AudioDefinitionCommon {
  allowDynamicSrc?: false
  src: string | readonly string[]
}

/**
 * Source resolved at play time (e.g. stream URL); must not rely on a bundled `src`.
 */
export interface AudioDefinitionDynamic extends AudioDefinitionCommon {
  allowDynamicSrc: true
  src?: never
}

/**
 * Static metadata for a registered sound id in the audio manifest.
 *
 * Discriminated by {@link AudioDefinitionStatic} vs {@link AudioDefinitionDynamic} (`allowDynamicSrc`).
 */
export type AudioDefinition = AudioDefinitionStatic | AudioDefinitionDynamic

/**
 * Per-play overrides passed to the runtime when triggering a sound.
 *
 * **`src`** — Only honored when the manifest entry has {@link AudioDefinitionDynamic.allowDynamicSrc}
 * set to `true`. Static cues always use their bundled manifest `src`; passing `src` for other ids is
 * ignored.
 *
 * **`onEnd`** — Invoked when the instance finishes playing naturally (`end`) **and** when playback is
 * torn down after a load or decode failure (`loaderror` / `playerror`), so callers can reset UI state
 * without relying on timeouts. Not invoked for manual {@link AudioPlaybackHandle.stop} (user interrupt).
 *
 * **`loop`** — When true, loops the specific playback instance until stopped manually.
 */
export interface AudioPlayOptions {
  src?: string
  volume?: number
  effect?: AudioEffectPreset
  cooldownKey?: string
  loop?: boolean
  onEnd?: () => void
}

/**
 * Handle returned by the audio layer for controlling an active playback instance.
 */
export interface AudioPlaybackHandle {
  readonly soundId: string
  stop(): void
  playing(): boolean
  /** Normalized position in the current clip, in the range 0–1 (`seek / duration`). */
  progress(): number
  /** Clip length in seconds (Howler), or 0 when unknown. */
  duration(): number
  /** Sets the playback volume (0–1) for this instance. */
  setVolume(volume: number): void
  /** Sets stereo pan (-1 = full left, 0 = center, 1 = full right). */
  setStereo(pan: number): void
}

/**
 * Per-category gain and mute state used by the audio manager for routing and UI.
 */
export interface AudioCategoryState {
  volume: number
  muted: boolean
}

/** Constructor options for the runtime audio manager (`AudioManager`). */
export interface AudioManagerOptions {
  /**
   * Initial category state; unspecified categories use full volume and unmuted.
   * Per-category patches may be partial (e.g. `{ volume: 0.5 }` without `muted`).
   */
  initialCategoryState?: Partial<Record<AudioCategory, Partial<AudioCategoryState>>>
}
