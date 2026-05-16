/**
 * Per-room drone spawn-count helpers.
 *
 * Pure functions — no Three.js, no Vue, deterministic against an injected RNG.
 * Used by {@link StationDroneDirector} when populating rooms from the layout
 * JSON.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */

import { DRONE_ROOM_SPAWN_BUCKETS, DRONE_SLOT_SPAWN_PROBABILITY } from './droneConfig'

/**
 * Compute the maximum number of drone slots a room may roll based on its
 * footprint in tiles. Uses {@link DRONE_ROOM_SPAWN_BUCKETS}; the first bucket
 * whose `maxArea` covers `widthTiles * depthTiles` wins.
 *
 * Negative or non-finite inputs collapse to a zero-area room (no drones).
 *
 * @param widthTiles - Room width in tiles (e.g. 1, 2, 3).
 * @param depthTiles - Room depth in tiles (e.g. 1, 2, 3).
 * @returns Maximum drone slot count for this room footprint.
 */
export function maxDronesForRoom(widthTiles: number, depthTiles: number): number {
  if (!Number.isFinite(widthTiles) || !Number.isFinite(depthTiles)) return 0
  const area = Math.max(0, Math.floor(widthTiles)) * Math.max(0, Math.floor(depthTiles))
  for (const bucket of DRONE_ROOM_SPAWN_BUCKETS) {
    if (area <= bucket.maxArea) return bucket.maxDrones
  }
  return 0
}

/**
 * Flip `max` independent coins against `probability`, returning the number of
 * successes. A draw counts as a success when `rng() < probability`.
 *
 * @param max - Maximum number of drone slots to roll. Values &le; 0 return 0.
 * @param rng - Uniform `[0, 1)` random source. Inject deterministic stubs in tests.
 * @param probability - Per-slot success probability. Defaults to
 *   {@link DRONE_SLOT_SPAWN_PROBABILITY}. Clamped to `[0, 1]`.
 * @returns Number of successful rolls — between 0 and `max` inclusive.
 */
export function rollDroneCount(
  max: number,
  rng: () => number,
  probability: number = DRONE_SLOT_SPAWN_PROBABILITY,
): number {
  if (!Number.isFinite(max) || max <= 0) return 0
  const slots = Math.floor(max)
  const p = Math.min(1, Math.max(0, probability))
  let count = 0
  for (let i = 0; i < slots; i++) {
    if (rng() < p) count++
  }
  return count
}
