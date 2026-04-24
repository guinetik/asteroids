/**
 * Per-frame asteroid-belt impact coordinator for the map view.
 *
 * Walks every belt's `findNearestImpact` result, and on the first hit
 * resolves damage + shake + knockback via {@link resolveAsteroidImpact}
 * then arms a cooldown so the shuttle can't be chain-hit by a cluster of
 * adjacent asteroids within a single pass.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import type { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import {
  ASTEROID_IMPACT_COOLDOWN_SEC,
  MAP_SHUTTLE_COLLISION_RADIUS,
} from '@/lib/map/mapViewControllerConfig'
import { resolveAsteroidImpact, type AsteroidImpactResolution } from './asteroidImpactMath'

/** Per-tick input for {@link AsteroidImpactSystem.tick}. */
export interface AsteroidImpactTickInput {
  /** Frame delta in seconds. Used to count down the post-impact cooldown. */
  dt: number
  /** World-space shuttle position. */
  shuttlePosition: THREE.Vector3
  /** Current shuttle velocity (read-only; caller applies the returned `newVelocity`). */
  velocity: THREE.Vector3
  /** Every belt whose asteroids the shuttle can collide with. */
  beltControllers: AsteroidBeltController[]
}

/** Stateful impact system — owns cooldown between hits. */
export class AsteroidImpactSystem {
  /** Remaining cooldown (seconds) before the next impact can register. */
  private cooldown = 0

  /**
   * Advance cooldown and, when enabled, check every belt for a new impact.
   * Returns the first resolved impact of the frame (caller applies damage,
   * shake, and `setVelocity`), or `null` when nothing hit this frame.
   *
   * @param input - Tick bundle (dt, ship pose, belts).
   * @returns Impact resolution when a hit registered and cooldown arms; otherwise `null`.
   */
  tick(input: AsteroidImpactTickInput): AsteroidImpactResolution | null {
    this.cooldown = Math.max(0, this.cooldown - input.dt)
    if (this.cooldown > 0) return null

    for (const belt of input.beltControllers) {
      const impact = belt.findNearestImpact(input.shuttlePosition, MAP_SHUTTLE_COLLISION_RADIUS)
      if (!impact) continue

      const resolved = resolveAsteroidImpact({
        shuttlePosition: input.shuttlePosition,
        velocity: input.velocity,
        impact,
      })
      this.cooldown = ASTEROID_IMPACT_COOLDOWN_SEC
      return resolved
    }
    return null
  }

  /** Clear the cooldown (e.g. on respawn) so the next belt pass can hit immediately. */
  reset(): void {
    this.cooldown = 0
  }
}
