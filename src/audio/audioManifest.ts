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
  'sfx.slingshot.burst',
  'sfx.slingshot.charge',
  'sfx.orbitCapture',
  'sfx.wormhole',
  'sfx.fuelWarning',
  // SFX — lander propulsion
  'sfx.lander.thrusterLoop',
  'sfx.lander.thrusterBurst',
  'sfx.lander.thruster.ground',
  'sfx.lander.gyro',
  'sfx.lander.shake',
  'sfx.lander.alarm',
  'sfx.lander.alarm.attitude',
  'sfx.landing',
  'sfx.collision',
  'sfx.explosion',
  'sfx.explosive',
  'sfx.suit.impact',
  'sfx.grunt.damage',
  'sfx.suit.alarm',
  'sfx.damage.slash',
  // SFX — shuttle systems
  'sfx.touchdown',
  'sfx.harpoon',
  'sfx.ice_break',
  'sfx.mission.shuttle.clear',
  'sfx.collect',
  'sfx.mistake',
  'sfx.telemetry.shoot',
  'sfx.target',
  'sfx.drone',
  'sfx.drone.pickup',
  'sfx.geyser',
  'sfx.cargo.open',
  'sfx.cargo.close',
  // SFX — footsteps
  'sfx.step.habitat.1',
  'sfx.step.habitat.2',
  'sfx.step.asteroid.1',
  'sfx.step.asteroid.2',
  // SFX — level / cinematic
  'sfx.level.arrival',
  'sfx.arrivalSeparation',
  'sfx.dockingClamp',
  // SFX — combat / EVA
  'sfx.tool.drill',
  'sfx.laserFire',
  'sfx.tool.heal',
  'sfx.projectileHit',
  'sfx.shieldHit',
  'sfx.pickup',
  'sfx.grunt',
  // Ambient
  'ambient.space',
  'ambient.engine',
  'ambient.shuttleMission',
  'ambient.landerCockpit',
  'ambient.habitat',
  'ambient.anomaly',
  'ambient.asteroid',
  'ambient.wind',
  'sfx.floating',
  'sfx.jump',
  'sfx.jump.voice',
  'sfx.breathing.walk',
  'sfx.breathing.run',
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
    playback: 'single-instance',
    volume: 0,
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
  'sfx.slingshot.burst': {
    id: 'sfx.slingshot.burst',
    src: '/sound/sfx.slingshot.burst.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.8,
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
  'sfx.wormhole': {
    id: 'sfx.wormhole',
    src: '/sound/sfx.wormhole.mp3',
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
    volume: 0,
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
  'sfx.lander.shake': {
    id: 'sfx.lander.shake',
    src: '/sound/sfx.lander.shake.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0,
    effect: 'hull-exterior',
  },
  'sfx.lander.gyro': {
    id: 'sfx.lander.gyro',
    src: '/sound/sfx.lander.gyro.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0,
    effect: 'hull-exterior',
  },
  'sfx.lander.thruster.ground': {
    id: 'sfx.lander.thruster.ground',
    src: '/sound/sfx.lander.thruster.ground.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0,
    effect: 'none',
  },
  'sfx.lander.alarm': {
    id: 'sfx.lander.alarm',
    src: '/sound/sfx.lander.alarm.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
    effect: 'none',
  },
  'sfx.lander.alarm.attitude': {
    id: 'sfx.lander.alarm.attitude',
    src: '/sound/sfx.lander.alarm.attitude.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.55,
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
  /**
   * Heavier "explosive charge" boom — used for objective detonations
   * (nest blasts, virus blasts) where we want a punchier signature than
   * the generic crash-impact `sfx.explosion`. Overlap so multiple objective
   * blasts in quick succession all play.
   */
  'sfx.explosive': {
    id: 'sfx.explosive',
    src: '/sound/sfx.explosive.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.85,
    effect: 'none',
  },
  /**
   * Generic "projectile slammed into the suit" thud, played whenever the
   * player takes ranged damage from any enemy. Overlap so back-to-back
   * hits stack rather than swallow each other; volume kept conservative
   * so the cue layers under the breathing/ambient bed instead of stomping
   * it.
   */
  'sfx.suit.impact': {
    id: 'sfx.suit.impact',
    src: '/sound/sfx.suit.impact.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.4,
    effect: 'none',
  },
  /**
   * Pained grunt layered on top of {@link sfx.suit.impact} when the player
   * is shoved by ranged damage. Rate-limited so a burst of consecutive hits
   * doesn't turn into a stuttering "uh-uh-uh" — one grunt per ~1.2 s window.
   */
  'sfx.grunt.damage': {
    id: 'sfx.grunt.damage',
    src: '/sound/sfx.grunt.damage.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.55,
    effect: 'none',
    cooldownMs: 1200,
  },
  /**
   * "Suit damage" alarm chirp routed through the {@link helmet-echo} preset
   * so it reads as an internal helmet HUD warning rather than world audio.
   * Rate-limited generously (~3.5 s) so it only punctuates noteworthy
   * damage events, not every projectile sting.
   */
  'sfx.suit.alarm': {
    id: 'sfx.suit.alarm',
    src: '/sound/sfx.suit.alarm.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.25,
    effect: 'helmet-echo',
    cooldownMs: 3500,
  },
  /**
   * Sustained "being mauled" loop, played whenever any enemy is currently
   * dealing contact damage to the player. Multiple attackers should still
   * collapse to a single audible loop — the controller manages exactly one
   * playback handle and refreshes a hold-timer on every contact frame, so
   * `single-instance` here is just a defensive backstop against accidental
   * duplicate plays. Looping is requested per-instance via `play({ loop:
   * true })`.
   */
  'sfx.damage.slash': {
    id: 'sfx.damage.slash',
    src: '/sound/sfx.damage.slash.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.6,
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
    volume: 0.35,
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

  // ── SFX — shuttle systems ───────────────────────────────────────────
  'sfx.telemetry.shoot': {
    id: 'sfx.telemetry.shoot',
    src: '/sound/sfx.telemetry.shoot.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.75,
    effect: 'none',
  },
  'sfx.target': {
    id: 'sfx.target',
    src: '/sound/sfx.target.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.85,
    effect: 'none',
  },
  'sfx.mistake': {
    id: 'sfx.mistake',
    src: '/sound/sfx.mistake.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.8,
    effect: 'none',
  },
  'sfx.collect': {
    id: 'sfx.collect',
    src: '/sound/sfx.collect.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.drone': {
    id: 'sfx.drone',
    src: '/sound/sfx.drone.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.drone.pickup': {
    id: 'sfx.drone.pickup',
    src: '/sound/sfx.drone.pickup.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.8,
    effect: 'none',
  },
  'sfx.geyser': {
    id: 'sfx.geyser',
    src: '/sound/sfx.geyser.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.5,
    effect: 'none',
  },
  'sfx.mission.shuttle.clear': {
    id: 'sfx.mission.shuttle.clear',
    src: '/sound/sfx.mission.shuttle.clear.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.9,
    effect: 'none',
  },
  'sfx.harpoon': {
    id: 'sfx.harpoon',
    src: '/sound/sfx.harpoon.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.75,
    effect: 'none',
  },
  'sfx.ice_break': {
    id: 'sfx.ice_break',
    src: '/sound/sfx.ice_break.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.8,
    effect: 'none',
  },
  'sfx.touchdown': {
    id: 'sfx.touchdown',
    src: '/sound/sfx.touchdown.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 1.0,
    effect: 'none',
  },
  'sfx.cargo.open': {
    id: 'sfx.cargo.open',
    src: '/sound/sfx.cargo.open.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.7,
    effect: 'none',
  },
  'sfx.cargo.close': {
    id: 'sfx.cargo.close',
    src: '/sound/sfx.cargo.close.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.7,
    effect: 'none',
  },

  // ── SFX — footsteps ────────────────────────────────────────────────
  'sfx.step.habitat.1': {
    id: 'sfx.step.habitat.1',
    src: '/sound/sfx.step.habitat.1.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.4,
    effect: 'none',
  },
  'sfx.step.habitat.2': {
    id: 'sfx.step.habitat.2',
    src: '/sound/sfx.step.habitat.2.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.4,
    effect: 'none',
  },
  'sfx.step.asteroid.1': {
    id: 'sfx.step.asteroid.1',
    src: '/sound/sfx.step.asteroid.1.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.45,
    effect: 'none',
  },
  'sfx.step.asteroid.2': {
    id: 'sfx.step.asteroid.2',
    src: '/sound/sfx.step.asteroid.2.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.45,
    effect: 'none',
  },

  // ── SFX — combat / EVA ─────────────────────────────────────────────
  'sfx.tool.drill': {
    id: 'sfx.tool.drill',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'overlap',
    volume: 0.55,
    effect: 'none',
    procedural: 'tool-drill',
  },
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
  'sfx.tool.heal': {
    id: 'sfx.tool.heal',
    src: SILENT_STATIC_WAV_DATA_URI,
    category: 'sfx',
    load: 'lazy',
    playback: 'restart',
    volume: 0.5,
    effect: 'none',
    procedural: 'tool-heal',
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
  'sfx.grunt': {
    id: 'sfx.grunt',
    src: '/sound/sfx.grunt.mp3',
    category: 'sfx',
    load: 'lazy',
    // `restart` so back-to-back hard landings cut off the previous grunt
    // instead of stacking and producing a chorus of the same sample.
    playback: 'restart',
    volume: 0.7,
    effect: 'none',
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
  /**
   * Shuttle systems bed for interactive orbital minigames (canvas overlays).
   * Uses the legacy `shuttle.mp3` asset until a dedicated mix replaces it.
   */
  'ambient.shuttleMission': {
    id: 'ambient.shuttleMission',
    src: '/sound/shuttle.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.22,
    effect: 'none',
  },
  'ambient.landerCockpit': {
    id: 'ambient.landerCockpit',
    src: '/sound/ambient.landerCockpit.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.6,
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
  'ambient.asteroid': {
    id: 'ambient.asteroid',
    src: '/sound/ambient.asteroid.mp3',
    category: 'ambient',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.45,
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
  'sfx.jump': {
    id: 'sfx.jump',
    src: '/sound/sfx.jump.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.7,
    effect: 'none',
  },
  /**
   * Effort grunt layered on top of {@link sfx.jump} when the player launches
   * off the ground. Rate-limited so a string of consecutive hops doesn't
   * spam the vocal — the suit thruster cue still fires every jump, this
   * just colours the first one in a burst.
   */
  'sfx.jump.voice': {
    id: 'sfx.jump.voice',
    src: '/sound/sfx.jump.voice.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'rate-limited',
    volume: 0.55,
    effect: 'none',
    cooldownMs: 1500,
  },
  'sfx.floating': {
    id: 'sfx.floating',
    src: '/sound/sfx.floating.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.1,
    effect: 'none',
  },
  'sfx.breathing.walk': {
    id: 'sfx.breathing.walk',
    src: '/sound/sfx.breathing.walk.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.4,
    effect: 'none',
  },
  'sfx.breathing.run': {
    id: 'sfx.breathing.run',
    src: '/sound/sfx.breathing.run.mp3',
    category: 'sfx',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.5,
    effect: 'none',
  },

  // ── Music ───────────────────────────────────────────────────────────
  'music.menu': {
    id: 'music.menu',
    src: '/sound/theme.mp3',
    category: 'music',
    load: 'lazy',
    playback: 'single-instance',
    volume: 0.1,
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
