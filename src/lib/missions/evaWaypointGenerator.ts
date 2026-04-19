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

/** Minimum world-space offset from the planet center when placing the EVA waypoint. */
export const EVA_WAYPOINT_MIN_OFFSET_WORLD = 60

/** Maximum world-space offset from the planet center when placing the EVA waypoint. */
export const EVA_WAYPOINT_MAX_OFFSET_WORLD = 140

/**
 * Generate a waypoint world position near the giver planet.
 *
 * @param planetWorldX - Giver planet world X at accept time.
 * @param planetWorldZ - Giver planet world Z at accept time.
 * @param rand - RNG in [0,1); defaults to {@link Math.random} (injectable for tests).
 * @returns World-space coords `{ worldX, worldZ }` inside the EVA offset annulus.
 */
export function generateEvaWaypoint(
  planetWorldX: number,
  planetWorldZ: number,
  rand: () => number = Math.random,
): { worldX: number; worldZ: number } {
  const angle = rand() * Math.PI * 2
  const span = EVA_WAYPOINT_MAX_OFFSET_WORLD - EVA_WAYPOINT_MIN_OFFSET_WORLD
  const dist = EVA_WAYPOINT_MIN_OFFSET_WORLD + rand() * span
  return {
    worldX: planetWorldX + Math.cos(angle) * dist,
    worldZ: planetWorldZ + Math.sin(angle) * dist,
  }
}
