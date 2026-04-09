/**
 * Solar-map rules for “near the asteroid mission waypoint” (2D world XZ).
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */

/** Planar distance (world units) at which the shuttle shows “Begin Mission” on the map. */
export const MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD = 100

/**
 * Whether the shuttle is within the approach disc for an active mission waypoint.
 *
 * @param shuttleX - Shuttle world X (same frame as the active mission waypoint).
 * @param shuttleZ - Shuttle world Z.
 * @param waypoint - Mission waypoint; invalid or non-finite coords return false.
 * @returns True when inside {@link MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD}.
 */
export function isWithinAsteroidMissionApproachRadius(
  shuttleX: number,
  shuttleZ: number,
  waypoint: { worldX: number; worldZ: number } | null | undefined,
): boolean {
  if (!waypoint) return false
  if (!Number.isFinite(waypoint.worldX) || !Number.isFinite(waypoint.worldZ)) return false
  if (!Number.isFinite(shuttleX) || !Number.isFinite(shuttleZ)) return false
  const dx = shuttleX - waypoint.worldX
  const dz = shuttleZ - waypoint.worldZ
  const r = MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD
  return dx * dx + dz * dz < r * r
}
