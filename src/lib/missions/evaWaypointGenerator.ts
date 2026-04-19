/**
 * Generate the world-space waypoint for an accepted EVA (visit-relay) mission.
 *
 * The waypoint is placed at a small random offset from the giver planet's
 * current world position — close enough that the player can see the marker on
 * the solar map from their current orbit, but far enough that the POI prop
 * reads as a separate object and doesn't overlap planet geometry.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */

/** Minimum world-space planar offset from the planet center when placing the EVA waypoint. */
export const EVA_WAYPOINT_MIN_OFFSET_WORLD = 60

/** Maximum world-space planar offset from the planet center when placing the EVA waypoint. */
export const EVA_WAYPOINT_MAX_OFFSET_WORLD = 140

/**
 * Minimum absolute vertical offset (world units) of the POI prop inside the waypoint
 * root. Prevents the satellite from spawning at exactly Y=0 where the shuttle already
 * sits — the POI must be clearly above or below the orbital plane so EVA egress has a
 * real vertical component to traverse.
 */
export const EVA_WAYPOINT_MIN_Y_OFFSET_WORLD = 12

/**
 * Maximum absolute vertical offset (world units) of the POI prop inside the waypoint
 * root. Paired with {@link EVA_WAYPOINT_MIN_Y_OFFSET_WORLD}; final `poiLocalY` has
 * magnitude in [min, max] with a random sign.
 */
export const EVA_WAYPOINT_MAX_Y_OFFSET_WORLD = 25

/**
 * Generate a waypoint world position near the giver planet, plus a small local Y offset
 * for the POI prop so the satellite doesn't sit exactly at shuttle altitude.
 *
 * @param planetWorldX - Giver planet world X at accept time.
 * @param planetWorldZ - Giver planet world Z at accept time.
 * @param rand - RNG in [0,1); defaults to {@link Math.random} (injectable for tests).
 * @returns World-space coords `{ worldX, worldZ }` on the Y=0 plane, plus `poiLocalY`.
 */
export function generateEvaWaypoint(
  planetWorldX: number,
  planetWorldZ: number,
  rand: () => number = Math.random,
): { worldX: number; worldZ: number; poiLocalY: number } {
  const angle = rand() * Math.PI * 2
  const span = EVA_WAYPOINT_MAX_OFFSET_WORLD - EVA_WAYPOINT_MIN_OFFSET_WORLD
  const dist = EVA_WAYPOINT_MIN_OFFSET_WORLD + rand() * span
  const ySpan = EVA_WAYPOINT_MAX_Y_OFFSET_WORLD - EVA_WAYPOINT_MIN_Y_OFFSET_WORLD
  const yMagnitude = EVA_WAYPOINT_MIN_Y_OFFSET_WORLD + rand() * ySpan
  const ySign = rand() < 0.5 ? -1 : 1
  const poiLocalY = yMagnitude * ySign
  return {
    worldX: planetWorldX + Math.cos(angle) * dist,
    worldZ: planetWorldZ + Math.sin(angle) * dist,
    poiLocalY,
  }
}
