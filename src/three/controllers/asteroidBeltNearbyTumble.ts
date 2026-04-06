/**
 * Pure helper logic for bounded nearby asteroid tumbling.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-nearby-asteroid-tumble-design.md
 */

/**
 * Minimal 3D vector shape for distance checks in belt-local space.
 */
export interface Vector3Like {
  /** X component in belt-local units. */
  x: number
  /** Y component in belt-local units. */
  y: number
  /** Z component in belt-local units. */
  z: number
}

/**
 * Result of evaluating whether one instance should tumble or snap back to its base pose.
 */
export interface NearbyTumbleDecision {
  /** Whether this instance should be treated as actively tumbling after the decision. */
  nextIsTumbling: boolean
  /**
   * When true, the caller should restore this instance's matrix from its cached base transform.
   * Typical case: instance was tumbling but is no longer in the nearby zone.
   */
  shouldResetToBaseMatrix: boolean
}

/**
 * Describes a contiguous slice of visible instance indices, wrapping at `visibleCount`.
 * Sample indices as `(startIndex + i) % visibleCount` for `i` in `[0, windowLength)`.
 */
export interface NearbyTumbleSampleWindow {
  /** First visible instance index, in `[0, visibleCount)`. */
  startIndex: number
  /** How many instances to visit; never greater than `visibleCount`. */
  windowLength: number
  /** Number of visible instances (`instancedMesh.count`). */
  visibleCount: number
}

/**
 * Returns whether the asteroid lies within the shared nearby tumble radius of the shuttle.
 *
 * @param input - Shuttle and asteroid positions in belt-local space, and the radius in the same units.
 * @returns True when Euclidean distance from shuttle to asteroid is less than or equal to `nearbyRadius`.
 */
export function isWithinNearbyTumbleRadius(input: {
  shuttleLocal: Vector3Like
  asteroidLocal: Vector3Like
  nearbyRadius: number
}): boolean {
  const dx = input.asteroidLocal.x - input.shuttleLocal.x
  const dy = input.asteroidLocal.y - input.shuttleLocal.y
  const dz = input.asteroidLocal.z - input.shuttleLocal.z
  const distSq = dx * dx + dy * dy + dz * dz
  const r = input.nearbyRadius
  return distSq <= r * r
}

/**
 * Builds a rotating sample window over visible instances for bounded per-pass work.
 *
 * @param input - Cursor advances each tumble pass; `samplesPerPass` caps how many indices to read.
 * @returns `null` when nothing is visible; otherwise a window that may wrap past the last index.
 */
export function getNearbyTumbleSampleWindow(input: {
  sampleCursor: number
  samplesPerPass: number
  visibleCount: number
}): NearbyTumbleSampleWindow | null {
  const { sampleCursor, samplesPerPass, visibleCount } = input
  if (visibleCount <= 0) {
    return null
  }
  const normalizedCursor = ((sampleCursor % visibleCount) + visibleCount) % visibleCount
  const windowLength = Math.min(samplesPerPass, visibleCount)
  return {
    startIndex: normalizedCursor,
    windowLength,
    visibleCount,
  }
}

/**
 * Decides tumble activation and whether to reset to the base matrix for one sampled instance.
 *
 * @param input - Nearby membership, current tumble state, global cap, and activation/deactivation lottery inputs.
 * @returns The next tumble flag and whether the base matrix must be restored.
 */
export function decideNearbyTumbleState(input: {
  isInsideNearbyRadius: boolean
  isCurrentlyTumbling: boolean
  activeTumblerCount: number
  maxActiveTumblers: number
  activationRoll: number
  activationChance: number
  deactivationRoll: number
  deactivationChance: number
}): NearbyTumbleDecision {
  const {
    isInsideNearbyRadius,
    isCurrentlyTumbling,
    activeTumblerCount,
    maxActiveTumblers,
    activationRoll,
    activationChance,
    deactivationRoll,
    deactivationChance,
  } = input

  if (!isInsideNearbyRadius) {
    return {
      nextIsTumbling: false,
      shouldResetToBaseMatrix: isCurrentlyTumbling,
    }
  }

  if (isCurrentlyTumbling) {
    const deactivationPasses = deactivationRoll < deactivationChance
    return {
      nextIsTumbling: !deactivationPasses,
      shouldResetToBaseMatrix: false,
    }
  }

  const atOrOverCap = activeTumblerCount >= maxActiveTumblers
  const activationPasses = activationRoll < activationChance
  const nextIsTumbling = !atOrOverCap && activationPasses

  return {
    nextIsTumbling,
    shouldResetToBaseMatrix: false,
  }
}
