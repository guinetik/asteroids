/**
 * Helpers for persistent tactical-map world-line history.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */

/**
 * A sampled ship position along the run-long world line.
 */
export interface WorldLineHistoryPoint {
  /** World X coordinate. */
  x: number
  /** World Z coordinate. */
  z: number
}

/**
 * Orbit-state values relevant to world-line sampling.
 */
export type WorldLineRecordState = 'free' | 'approaching' | 'orbiting'

/**
 * Appends a new point to the world-line only when the ship has moved far enough.
 *
 * @param history - Existing sampled world-line points.
 * @param point - Current ship position.
 * @param minDistance - Minimum world distance required before appending.
 * @returns Updated sampled history.
 */
export function appendWorldLinePoint(
  history: readonly WorldLineHistoryPoint[],
  point: WorldLineHistoryPoint,
  minDistance: number,
): WorldLineHistoryPoint[] {
  const lastPoint = history[history.length - 1]
  if (!lastPoint) {
    return [point]
  }

  const dx = point.x - lastPoint.x
  const dz = point.z - lastPoint.z
  if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
    return [...history]
  }

  return [...history, point]
}

/**
 * Returns whether the current frame should contribute to the persistent world line.
 *
 * @param orbitState - Current orbit-capture state.
 * @param dead - True when the shuttle is dead.
 * @returns True only during normal free-flight driving.
 */
export function shouldRecordWorldLinePoint(
  orbitState: WorldLineRecordState,
  dead: boolean,
): boolean {
  return orbitState === 'free' && !dead
}
