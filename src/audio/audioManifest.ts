/**
 * Declarative sound registry for Asteroid Lander.
 *
 * Every sound the game can play is registered here with its category, source,
 * load strategy, playback mode, volume, and optional effect preset.
 *
 * @author guinetik
 * @date 2026-04-06
 */

import type { AudioCategory, AudioDefinition } from './audioTypes'
import { AUDIO_CATEGORIES } from './audioTypes'

/**
 * Minimal valid silent WAV inlined as a data URI so seeded static sounds decode without
 * `public/sound/*` files. Swap for real assets when they land in the repo.
 */
export const SILENT_STATIC_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

/**
 * Registered sound ids used by the audio system (order is stable for tests and tooling).
 */
export const AUDIO_SOUND_IDS = [
  // UI
  'ui.click',
  'ui.confirm',
  'ui.error',
  'ui.hover',
  // SFX — shuttle / lander
  'sfx.thrusterLoop',
  'sfx.thrusterBurst',
  'sfx.explosion',
  'sfx.landing',
  'sfx.collision',
  'sfx.slingshot',
  'sfx.fuelWarning',
  // SFX — combat / EVA
  'sfx.laserFire',
  'sfx.projectileHit',
  'sfx.shieldHit',
  'sfx.pickup',
  // Ambient
  'ambient.space',
  'ambient.engine',
  'ambient.wind',
  // Music
  'music.menu',
  'music.level',
  'music.gameover',
  // Voice (dynamic src at play time)
  'voice.comms',
] as const

/** Union of {@link AUDIO_SOUND_IDS} values. */
export type AudioSoundId = (typeof AUDIO_SOUND_IDS)[number]

/**
 * Starter seeded sound ids with silent WAV placeholders (swap for real assets later).
 */
export const SEEDED_SOUND_IDS = ['ui.click', 'ui.error', 'sfx.explosion'] as const

/**
 * Ensures each manifest record key matches its `id` field for compile-time drift checks.
 */
type ManifestById = {
  [K in AudioSoundId]: AudioDefinition & { id: K }
}

const manifestById: ManifestById = {
  // ── UI ──────────────────────────────────────────────────────────────
  'ui.click': {
    id: 'ui.click',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.35,
    effect: 'none',
  },
  'ui.confirm': {
    id: 'ui.confirm',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'lazy',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.error': {
    id: 'ui.error',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'eager',
    playback: 'restart',
    volume: 0.45,
    effect: 'none',
  },
  'ui.hover': {
    id: 'ui.hover',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ui',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.2,
    effect: 'none',
    cooldownMs: 80,
  },

  // ── SFX — shuttle / lander ─────────────────────────────────────────
  'sfx.thrusterLoop': {
    id: 'sfx.thrusterLoop',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.thrusterBurst': {
    id: 'sfx.thrusterBurst',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.explosion': {
    id: 'sfx.explosion',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.landing': {
    id: 'sfx.landing',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.collision': {
    id: 'sfx.collision',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.slingshot': {
    id: 'sfx.slingshot',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.fuelWarning': {
    id: 'sfx.fuelWarning',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.5,
    effect: 'none',
    cooldownMs: 3000,
  },

  // ── SFX — combat / EVA ─────────────────────────────────────────────
  'sfx.laserFire': {
    id: 'sfx.laserFire',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.projectileHit': {
    id: 'sfx.projectileHit',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.shieldHit': {
    id: 'sfx.shieldHit',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.pickup': {
    id: 'sfx.pickup',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.5,
    effect: 'none',
  },

  // ── Ambient ─────────────────────────────────────────────────────────
  'ambient.space': {
    id: 'ambient.space',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.15,
    effect: 'none',
  },
  'ambient.engine': {
    id: 'ambient.engine',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.wind': {
    id: 'ambient.wind',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.25,
    effect: 'none',
  },

  // ── Music ───────────────────────────────────────────────────────────
  'music.menu': {
    id: 'music.menu',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.3,
    effect: 'none',
  },
  'music.level': {
    id: 'music.level',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.25,
    effect: 'none',
  },
  'music.gameover': {
    id: 'music.gameover',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.3,
    effect: 'none',
  },

  // ── Voice (dynamic src) ─────────────────────────────────────────────
  'voice.comms': {
    id: 'voice.comms',
    category: 'voice',
    allowDynamicSrc: true,
    load: 'lazy',
    playback: 'exclusive-category',
    volume: 0.6,
    effect: 'radio',
  },
}

/** Shallow-clones and freezes a manifest entry (including a copy of array `src` when present). */
function freezeAudioDefinition(def: AudioDefinition): Readonly<AudioDefinition> {
  if ('src' in def && def.src !== undefined && Array.isArray(def.src)) {
    return Object.freeze({
      ...def,
      src: Object.freeze([...def.src]) as readonly string[],
    }) as Readonly<AudioDefinition>
  }
  return Object.freeze({ ...def }) as Readonly<AudioDefinition>
}

/**
 * Ordered list of manifest entries in {@link AUDIO_SOUND_IDS} order (frozen snapshots).
 */
export const audioManifest: readonly Readonly<AudioDefinition>[] = Object.freeze(
  AUDIO_SOUND_IDS.map((id) => freezeAudioDefinition(manifestById[id])),
)

/**
 * Returns a frozen {@link AudioDefinition} snapshot for a registered sound id.
 *
 * @param id - A registered {@link AudioSoundId}.
 */
export function getAudioDefinition(id: AudioSoundId): Readonly<AudioDefinition> {
  return freezeAudioDefinition(manifestById[id])
}

export { AUDIO_CATEGORIES }
export type { AudioCategory }
