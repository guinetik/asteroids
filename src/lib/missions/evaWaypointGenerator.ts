/**
 * Generate the world-space waypoint for an accepted EVA (visit-relay) mission.
 *
 * The waypoint is placed close to the giver planet and biased along its orbital tangent
 * rather than purely radially — satellites should "hug the orbital line" of their host,
 * not drift toward the sun (into overheat zones) or outward into the next planet's
 * gravity well. Offsets are split into two axes derived from the planet's position
 * relative to the sun at origin:
 *   - **Tangential** (along the orbit, either leading or trailing the planet): larger
 *     range so the POI sits clearly off the planet's current column.
 *   - **Radial** (toward / away from the sun): bounded tight so the waypoint stays near
 *     the orbital line. Matches the "~2–3 planet-radii off the orbital line" feel.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import { getPlanet } from '@/lib/planets/catalog'
import { SIZE_SCALE } from '@/lib/planets/constants'

/** Minimum signed tangential offset magnitude (world units) along the planet's orbit. */
export const EVA_WAYPOINT_MIN_TANGENTIAL_OFFSET = 150

/** Maximum signed tangential offset magnitude (world units) along the planet's orbit. */
export const EVA_WAYPOINT_MAX_TANGENTIAL_OFFSET = 280

/**
 * Maximum absolute radial offset (world units) from the planet's orbital line. Bounded
 * tight so the waypoint doesn't drift toward the sun (overheat) or into the next
 * planet's gravity well. Radial sign is randomized — waypoint may sit slightly inside
 * or outside the orbital circle, but never far from it.
 */
export const EVA_WAYPOINT_MAX_RADIAL_OFFSET = 30

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

/** Early Earth EVA waypoints stay 3–5 Earth radii from the planet center. */
const EARTH_LOCAL_WAYPOINT_MIN_RADIUS_MULTIPLE = 3

/** Upper edge of the early Earth EVA annulus. */
const EARTH_LOCAL_WAYPOINT_MAX_RADIUS_MULTIPLE = 5

/** Earth-local EVA POIs float modestly above/below the orbital plane. */
const EARTH_LOCAL_POI_MIN_Y_RADIUS_MULTIPLE = 0.75

/** Upper bound for Earth-local EVA POI vertical offset. */
const EARTH_LOCAL_POI_MAX_Y_RADIUS_MULTIPLE = 1.5

/**
 * Generate a waypoint world position near the giver planet, plus a small local Y offset
 * for the POI prop so the satellite doesn't sit exactly at shuttle altitude. Waypoint
 * hugs the planet's orbital line: most of the offset goes along the orbital tangent;
 * radial offset (toward/away from the sun) is bounded tight.
 *
 * @param planetWorldX - Giver planet world X at accept time.
 * @param planetWorldZ - Giver planet world Z at accept time.
 * Earth onboarding missions are intentionally much tighter: they stay in a 3–5 Earth-radius
 * annulus around Earth so the first EVA jobs read as "nearby orbital maintenance" instead of
 * far-flung system travel.
 *
 * @param giverPlanetId - Optional giver planet id. Earth uses the tighter onboarding annulus.
 * @param rand - RNG in [0,1); defaults to {@link Math.random} (injectable for tests).
 * @returns World-space coords `{ worldX, worldZ }` on the Y=0 plane, plus `poiLocalY`.
 */
export function generateEvaWaypoint(
  planetWorldX: number,
  planetWorldZ: number,
  giverPlanetId: string | null = null,
  rand: () => number = Math.random,
): { worldX: number; worldZ: number; poiLocalY: number } {
  if (giverPlanetId === 'earth') {
    const earthRadiusWorld = getPlanet('earth').displayRadius * SIZE_SCALE
    const minDistance = earthRadiusWorld * EARTH_LOCAL_WAYPOINT_MIN_RADIUS_MULTIPLE
    const maxDistance = earthRadiusWorld * EARTH_LOCAL_WAYPOINT_MAX_RADIUS_MULTIPLE
    const yMagnitude =
      earthRadiusWorld
      * (
        EARTH_LOCAL_POI_MIN_Y_RADIUS_MULTIPLE
        + rand() * (EARTH_LOCAL_POI_MAX_Y_RADIUS_MULTIPLE - EARTH_LOCAL_POI_MIN_Y_RADIUS_MULTIPLE)
      )
    const ySign = rand() < 0.5 ? -1 : 1
    const angle = rand() * Math.PI * 2
    const distance = minDistance + rand() * (maxDistance - minDistance)
    return {
      worldX: planetWorldX + Math.cos(angle) * distance,
      worldZ: planetWorldZ + Math.sin(angle) * distance,
      poiLocalY: yMagnitude * ySign,
    }
  }

  // Radial unit vector (sun at origin → planet). Fallback to +X if the planet is somehow
  // exactly at the sun; shouldn't happen in play but avoids NaN.
  const planetDistFromSun = Math.hypot(planetWorldX, planetWorldZ)
  const radialX = planetDistFromSun > 1e-6 ? planetWorldX / planetDistFromSun : 1
  const radialZ = planetDistFromSun > 1e-6 ? planetWorldZ / planetDistFromSun : 0
  // Tangential unit vector on XZ, perpendicular to radial (prograde convention).
  const tangentX = -radialZ
  const tangentZ = radialX

  const tangSpan = EVA_WAYPOINT_MAX_TANGENTIAL_OFFSET - EVA_WAYPOINT_MIN_TANGENTIAL_OFFSET
  const tangMagnitude = EVA_WAYPOINT_MIN_TANGENTIAL_OFFSET + rand() * tangSpan
  const tangSign = rand() < 0.5 ? -1 : 1
  const tangentialOffset = tangMagnitude * tangSign

  const radialMagnitude = rand() * EVA_WAYPOINT_MAX_RADIAL_OFFSET
  const radialSign = rand() < 0.5 ? -1 : 1
  const radialOffset = radialMagnitude * radialSign

  const ySpan = EVA_WAYPOINT_MAX_Y_OFFSET_WORLD - EVA_WAYPOINT_MIN_Y_OFFSET_WORLD
  const yMagnitude = EVA_WAYPOINT_MIN_Y_OFFSET_WORLD + rand() * ySpan
  const ySign = rand() < 0.5 ? -1 : 1
  const poiLocalY = yMagnitude * ySign

  return {
    worldX: planetWorldX + tangentX * tangentialOffset + radialX * radialOffset,
    worldZ: planetWorldZ + tangentZ * tangentialOffset + radialZ * radialOffset,
    poiLocalY,
  }
}
