/**
 * Pure math for shuttle ↔ asteroid impacts on the map.
 *
 * Given a shuttle position + velocity and the nearest asteroid that overlaps
 * the ship's collision sphere, produce the damage / shake / impulse numbers
 * the caller should apply. Pulled out so the resolver can be unit tested
 * without a Three.js scene, a {@link AsteroidBeltController}, or a running
 * camera shake coroutine.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import {
  ASTEROID_IMPACT_MAX_DAMAGE,
  ASTEROID_IMPACT_MAX_SHAKE,
  ASTEROID_IMPACT_MIN_DAMAGE,
  ASTEROID_IMPACT_MIN_IMPULSE,
  ASTEROID_IMPACT_MIN_SHAKE,
  ASTEROID_IMPACT_RADIUS_TO_IMPULSE,
  ASTEROID_IMPACT_SHAKE_DURATION_SEC,
  ASTEROID_IMPACT_SPEED_TO_IMPULSE,
} from '@/lib/map/mapViewControllerConfig'

/** Speed (ratio units) at which impact damage saturates to 100%. */
const DAMAGE_SATURATION_SPEED = 6

/** Post-impact velocity retention when the hit arrived with inbound component. */
const INBOUND_VELOCITY_RETENTION = 0.92

/** Small-number guard for "ship is sitting exactly on the asteroid centre" fallbacks. */
const OVERLAP_EPSILON_SQ = 1e-6

/** Minimum raw speed (world units/s) before we'd bother computing a normal from velocity. */
const VELOCITY_FALLBACK_MIN_SPEED = 0.001

/** Impact as reported by an {@link @/three/controllers/AsteroidBeltController}. */
export interface AsteroidImpactInput {
  /** World-space position of the asteroid that hit the shuttle. */
  worldPosition: THREE.Vector3
  /** Collision radius of the asteroid (local belt units ≈ world units). */
  asteroidRadius: number
}

/** Resolved impact numbers ready to push into shipHealth / camera / velocity. */
export interface AsteroidImpactResolution {
  /** Hull damage to apply to {@link @/lib/shipHealth}. Always positive. */
  damage: number
  /** Damage label forwarded to shipHealth for HUD tooltips. */
  damageLabel: 'Asteroid Impact'
  /** Camera shake magnitude in shake-units; fed straight into VehicleCamera. */
  shakeMagnitude: number
  /** Camera shake duration in seconds. */
  shakeDurationSec: number
  /**
   * Velocity to assign to the shuttle after the hit. Already includes
   * knockback impulse along the collision normal and the inbound-retention
   * multiplier; caller should `setVelocity(result.newVelocity)` verbatim.
   */
  newVelocity: THREE.Vector3
}

/**
 * Resolve an asteroid impact into damage / shake / knockback numbers.
 *
 * The collision normal points from the asteroid toward the shuttle. When the
 * ship is exactly on the asteroid centre we fall back to the reverse velocity
 * vector (so the impulse still pushes the ship back the way it came), and if
 * the shuttle is also barely moving we default to `+X` as a last resort.
 *
 * @param params.shuttlePosition - World-space shuttle position.
 * @param params.velocity - Current shuttle velocity (read-only; result gets a fresh Vector3).
 * @param params.impact - Nearest-asteroid sample from `AsteroidBeltController.findNearestImpact`.
 * @returns Damage + shake + new velocity to apply.
 */
export function resolveAsteroidImpact(params: {
  shuttlePosition: THREE.Vector3
  velocity: THREE.Vector3
  impact: AsteroidImpactInput
}): AsteroidImpactResolution {
  const { shuttlePosition, velocity, impact } = params

  // Collision normal: from asteroid toward shuttle, XZ-planar, unit-length.
  const normal = new THREE.Vector3().copy(shuttlePosition).sub(impact.worldPosition)
  if (normal.lengthSq() < OVERLAP_EPSILON_SQ) {
    const speed = velocity.length()
    if (speed > VELOCITY_FALLBACK_MIN_SPEED) {
      normal.copy(velocity).multiplyScalar(-1)
    } else {
      normal.set(1, 0, 0)
    }
  }
  normal.y = 0
  normal.normalize()

  const speed = velocity.length()
  const inboundSpeed = Math.max(0, -velocity.dot(normal))
  const damageRatio = Math.min(1, Math.max(speed, inboundSpeed) / DAMAGE_SATURATION_SPEED)

  const damage =
    ASTEROID_IMPACT_MIN_DAMAGE +
    (ASTEROID_IMPACT_MAX_DAMAGE - ASTEROID_IMPACT_MIN_DAMAGE) * damageRatio

  const shakeMagnitude =
    ASTEROID_IMPACT_MIN_SHAKE +
    (ASTEROID_IMPACT_MAX_SHAKE - ASTEROID_IMPACT_MIN_SHAKE) * damageRatio

  const impulseMagnitude = Math.max(
    ASTEROID_IMPACT_MIN_IMPULSE,
    inboundSpeed * ASTEROID_IMPACT_SPEED_TO_IMPULSE +
      impact.asteroidRadius * ASTEROID_IMPACT_RADIUS_TO_IMPULSE,
  )

  const newVelocity = velocity.clone().addScaledVector(normal, impulseMagnitude)
  if (inboundSpeed > 0) {
    newVelocity.multiplyScalar(INBOUND_VELOCITY_RETENTION)
  }

  return {
    damage,
    damageLabel: 'Asteroid Impact',
    shakeMagnitude,
    shakeDurationSec: ASTEROID_IMPACT_SHAKE_DURATION_SEC,
    newVelocity,
  }
}
