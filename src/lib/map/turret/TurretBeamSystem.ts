/**
 * Turret beam raycast — ray-sphere test against the registered asteroid
 * instances for the current turret session. Pure; no Three scene access.
 *
 * Uses simple nearest-hit ray-sphere intersection with a linear scan. A few
 * hundred instances is well within budget per frame.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import type { Vector3 } from 'three'

/** A single target sphere for the beam raycast. */
export interface BeamTargetInstance {
  /** Coordinator-assigned index for this registered asteroid. */
  readonly spawnIndex: number
  /** World-space center of the sphere. */
  readonly worldPosition: Vector3
  /** Sphere radius in world units. */
  readonly radius: number
}

/** Nearest-hit result from {@link raycastBeam}. */
export interface BeamHit {
  /** Matching `BeamTargetInstance.spawnIndex`. */
  readonly spawnIndex: number
  /** Distance from ray origin to the entry point. */
  readonly distance: number
}

/**
 * Test a ray against a flat array of target spheres; return the nearest hit.
 *
 * @param origin - Ray origin in world space.
 * @param direction - Unit-length ray direction in world space.
 * @param maxDistance - Maximum distance for valid hits. Beyond → null.
 * @param instances - Registered asteroid spheres to test.
 * @returns Nearest hit, or null when no sphere is within reach.
 */
export function raycastBeam(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
  instances: readonly BeamTargetInstance[],
): BeamHit | null {
  let nearestIndex = -1
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!
    const ocx = origin.x - inst.worldPosition.x
    const ocy = origin.y - inst.worldPosition.y
    const ocz = origin.z - inst.worldPosition.z

    const b = ocx * direction.x + ocy * direction.y + ocz * direction.z
    const c = ocx * ocx + ocy * ocy + ocz * ocz - inst.radius * inst.radius

    const disc = b * b - c
    if (disc < 0) continue

    const sqrtDisc = Math.sqrt(disc)
    // Entry distance along ray direction. Use the smaller root (t0).
    const t0 = -b - sqrtDisc
    const t1 = -b + sqrtDisc

    // Discard hits entirely behind the origin.
    if (t1 < 0) continue

    const t = t0 >= 0 ? t0 : t1
    if (t > maxDistance) continue
    if (t >= nearestDistance) continue

    nearestDistance = t
    nearestIndex = i
  }

  if (nearestIndex < 0) return null
  return { spawnIndex: instances[nearestIndex]!.spawnIndex, distance: nearestDistance }
}
