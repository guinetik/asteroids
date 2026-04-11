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
  // SFX — shuttle propulsion
  'sfx.thrusterLoop',
  'sfx.thrusterBurst',
  'sfx.brake',
  'sfx.slingshot',
  'sfx.slingshot.charge',
  'sfx.orbitCapture',
  'sfx.fuelWarning',
  // SFX — lander propulsion
  'sfx.lander.thrusterLoop',
  'sfx.lander.thrusterBurst',
  'sfx.landing',
  'sfx.collision',
  'sfx.explosion',
  // SFX — level / cinematic
  'sfx.level.arrival',
  'sfx.arrivalSeparation',
  'sfx.dockingClamp',
  // SFX — combat / EVA
  'sfx.laserFire',
  'sfx.projectileHit',
  'sfx.shieldHit',
  'sfx.pickup',
  // Ambient
  'ambient.space',
  'ambient.engine',
  'ambient.landerCockpit',
  'ambient.habitat',
  'ambient.anomaly',
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
 * Sound ids that still use the silent WAV placeholder (no real asset yet).
 * Remove an id from this list once its `src` is swapped for a real file.
 */
export const SEEDED_SOUND_IDS = ['ui.click', 'ui.error'] as const

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

  // ── SFX — shuttle propulsion ────────────────────────────────────────
  'sfx.thrusterLoop': {
    id: 'sfx.thrusterLoop',
    src: '/sound/sfx.thrusterLoop.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.thrusterBurst': {
    id: 'sfx.thrusterBurst',
    src: '/sound/sfx.thrusterBurst.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.brake': {
    id: 'sfx.brake',
    src: '/sound/sfx.brake.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.slingshot': {
    id: 'sfx.slingshot',
    src: '/sound/sfx.slingshot.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.slingshot.charge': {
    id: 'sfx.slingshot.charge',
    src: '/sound/sfx.slingshot.charge.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.orbitCapture': {
    id: 'sfx.orbitCapture',
    src: '/sound/sfx.orbitCapture.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.fuelWarning': {
    id: 'sfx.fuelWarning',
    src: '/sound/sfx.fuelWarning.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.5,
    effect: 'none',
    cooldownMs: 3000,
  },

  // ── SFX — lander propulsion ─────────────────────────────────────────
  'sfx.lander.thrusterLoop': {
    id: 'sfx.lander.thrusterLoop',
    src: '/sound/sfx.lander.thrusterLoop.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.85,
    effect: 'none',
  },
  'sfx.lander.thrusterBurst': {
    id: 'sfx.lander.thrusterBurst',
    src: '/sound/sfx.lander.thrusterBurst.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.15,
    effect: 'none',
  },
  'sfx.landing': {
    id: 'sfx.landing',
    src: '/sound/sfx.landing.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.collision': {
    id: 'sfx.collision',
    src: '/sound/sfx.collision.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.explosion': {
    id: 'sfx.explosion',
    src: '/sound/sfx.explosion.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.7,
    effect: 'none',
  },

  // ── SFX — level / cinematic ─────────────────────────────────────────
  'sfx.level.arrival': {
    id: 'sfx.level.arrival',
    src: '/sound/sfx.level.arrival.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
  },
  'sfx.arrivalSeparation': {
    id: 'sfx.arrivalSeparation',
    src: '/sound/sfx.arrivalSeparation.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.65,
    effect: 'none',
  },
  'sfx.dockingClamp': {
    id: 'sfx.dockingClamp',
    src: '/sound/sfx.dockingClamp.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.6,
    effect: 'none',
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
    procedural: 'laser-fire',
  },
  'sfx.projectileHit': {
    id: 'sfx.projectileHit',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
    procedural: 'projectile-hit',
  },
  'sfx.shieldHit': {
    id: 'sfx.shieldHit',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
    procedural: 'shield-hit',
  },
  'sfx.pickup': {
    id: 'sfx.pickup',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.5,
    effect: 'none',
    procedural: 'pickup',
  },

  // ── Ambient ─────────────────────────────────────────────────────────
  'ambient.space': {
    id: 'ambient.space',
    src: '/sound/ambient.space.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.15,
    effect: 'none',
  },
  'ambient.engine': {
    id: 'ambient.engine',
    src: '/sound/ambient.engine.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.landerCockpit': {
    id: 'ambient.landerCockpit',
    src: '/sound/ambient.landerCockpit.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.habitat': {
    id: 'ambient.habitat',
    src: '/sound/ambient.habitat.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.2,
    effect: 'none',
  },
  'ambient.anomaly': {
    id: 'ambient.anomaly',
    src: '/sound/ambient.anomaly.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.3,
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
    src: '/sound/theme.mp3',
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.3,
    effect: 'none',
  },
  'music.level': {
    id: 'music.level',
    src: '/sound/level.mp3',
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
