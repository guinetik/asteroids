/**
 * Pure resolver mapping a special mission's `asteroidId` to a world XZ
 * waypoint. Used by `MapViewController.stageSpecialMission` to override the
 * pre-baked `(0, 0)` waypoint in the special mission JSON with the actual
 * body's current solar-map position.
 *
 * Asteroid id coverage:
 *   - `'hektor'`: returns Hektor's live position from the body map (Hektor is
 *     a pinned body with a `PlanetController` that exposes `getWorldX/Z`).
 *   - `'asset-2306-s'`: fictional Saturn co-orbital. Places near Saturn's
 *     current position at a random angular offset, small radius. Not orbit-
 *     correct — just "go fly to Saturn area" — which is the contract's intent
 *     ("Saturn co-orbital region, longer trip").
 *   - any other id: returns the fallback (the JSON-baked waypoint).
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-special-mission-waypoint-resolution.md
 */

/** World position in the solar-map XZ frame. */
export interface WorldPositionXZ {
  /** World X. */
  x: number
  /** World Z. */
  z: number
}

/** Waypoint shape used by `GeneratedAsteroidMission.waypoint`. */
export interface Waypoint {
  /** Waypoint world X. */
  worldX: number
  /** Waypoint world Z. */
  worldZ: number
}

/** Offset radius (world units) used for procedural Saturn co-orbital placement. */
const SATURN_CO_ORBITAL_OFFSET_RADIUS = 60

/**
 * Resolve a special mission's waypoint to the body's actual position.
 *
 * @param asteroidId - The mission's `asteroidId` field.
 * @param bodyWorldPositions - Map from body id to current world XZ. Caller
 *   builds this from live planet controllers (`getWorldX/Z()`), pinned-body
 *   controllers, etc.
 * @param fallback - JSON-baked waypoint, used when the asteroid id has no
 *   special handling or the required body is missing from the map.
 * @param rand - RNG for procedural placement (asset-2306-s).
 * @returns Waypoint XZ in the same world frame as the body positions.
 */
export function resolveSpecialMissionWaypoint(
  asteroidId: string,
  bodyWorldPositions: ReadonlyMap<string, WorldPositionXZ>,
  fallback: Waypoint,
  rand: () => number = Math.random,
): Waypoint {
  if (asteroidId === 'hektor') {
    const hektor = bodyWorldPositions.get('hektor')
    if (!hektor) return fallback
    return { worldX: hektor.x, worldZ: hektor.z }
  }
  if (asteroidId === 'asset-2306-s') {
    const saturn = bodyWorldPositions.get('saturn')
    if (!saturn) return fallback
    const angle = rand() * Math.PI * 2
    return {
      worldX: saturn.x + Math.cos(angle) * SATURN_CO_ORBITAL_OFFSET_RADIUS,
      worldZ: saturn.z + Math.sin(angle) * SATURN_CO_ORBITAL_OFFSET_RADIUS,
    }
  }
  return fallback
}
