/**
 * Typed constants for map-turret mining mode, loaded from JSON data files.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import turretConfig from '@/data/map/turret-config.json'
import asteroidBeltLoot from '@/data/asteroid-belt-loot.json'
import type { MineralEntry } from '@/lib/asteroids/types'

const DEG_TO_RAD = Math.PI / 180

/** Fade-in duration in seconds before turret controls are live. */
export const TURRET_FADE_IN_DURATION = turretConfig.fade.inDurationSec
/** Fade-out duration in seconds when exiting the turret. */
export const TURRET_FADE_OUT_DURATION = turretConfig.fade.outDurationSec
/** Fade opacity threshold for opening → active transition. */
export const TURRET_OPENING_COMPLETE_THRESHOLD = turretConfig.fade.openingCompleteThreshold
/** Fade opacity threshold for closing → idle transition. */
export const TURRET_CLOSING_COMPLETE_THRESHOLD = turretConfig.fade.closingCompleteThreshold

/** Half-angle of the mouse aim cone relative to the turret base forward (radians). */
export const TURRET_CONE_HALF_ANGLE = turretConfig.aim.coneHalfAngleDeg * DEG_TO_RAD
/** Absolute pitch limit (radians) — clamps camera local pitch. */
export const TURRET_PITCH_LIMIT = turretConfig.aim.pitchLimitDeg * DEG_TO_RAD
/** Turret-base rotation speed (radians/sec) driven by A/D keys. */
export const TURRET_TRAVERSE_SPEED = turretConfig.aim.traverseSpeedDegPerSec * DEG_TO_RAD
/** Mouse sensitivity — radians per pixel of mouse delta. */
export const TURRET_MOUSE_SENSITIVITY = turretConfig.aim.mouseSensitivity

/** Maximum beam range in world units. */
export const TURRET_BEAM_MAX_RANGE = turretConfig.beam.maxRangeWorldUnits
/** Beam damage rate in kg/sec at `turretMiningYield` level 0 (multiplier 1.0). */
export const TURRET_BEAM_DPS = turretConfig.beam.dpsKgPerSec
/** Local offset from shuttle origin to turret base attach point. */
export const TURRET_NOSE_OFFSET = turretConfig.beam.noseOffset

/** Number of particles emitted per tractor burst. */
export const TURRET_TRACTOR_BURST_COUNT = turretConfig.tractor.burstCount
/** Initial particle speed (world units/sec). */
export const TURRET_TRACTOR_PARTICLE_SPEED = turretConfig.tractor.particleSpeed
/** Steering acceleration toward target (world units/sec^2). */
export const TURRET_TRACTOR_STEER_ACCEL = turretConfig.tractor.steerAcceleration
/** Distance (world units) at which a particle is considered arrived and despawns. */
export const TURRET_TRACTOR_ARRIVAL_RADIUS = turretConfig.tractor.arrivalRadius
/** Hard cap on particle lifetime (seconds). */
export const TURRET_TRACTOR_MAX_LIFETIME = turretConfig.tractor.maxLifetimeSec

/** Granularity (kg) at which buffered yield is committed to inventory. */
export const TURRET_YIELD_COMMIT_GRANULARITY_KG = turretConfig.yieldBuffer.commitUnitGranularityKg

/** Raw tier config, exposed for {@link pickTier}. */
export const TURRET_TIER_CONFIG = turretConfig.tiers

/** Loot tables keyed by lootId. */
export const ASTEROID_BELT_LOOT: Record<string, readonly MineralEntry[]> = asteroidBeltLoot
