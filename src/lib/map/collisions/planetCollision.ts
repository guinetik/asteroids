/**
 * Pure helper for detecting instant-death shuttle ↔ planet-mesh collisions on the map.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { SIZE_SCALE } from '@/lib/planets/constants'
import { MAP_SHUTTLE_COLLISION_RADIUS } from '@/lib/map/mapViewControllerConfig'

/** Minimum state needed to test one planet for ship overlap. */
export interface PlanetCollisionSample {
  /** Planet display name used for the death banner (`Crashed Into Mars`). */
  name: string
  /** Catalog `displayRadius` — multiplied by {@link SIZE_SCALE} for world-units. */
  displayRadius: number
  /** Live world-space X of the planet. */
  worldX: number
  /** Live world-space Z of the planet. */
  worldZ: number
}

/** Collision hit descriptor. */
export interface PlanetCollisionHit {
  /** Planet that the shuttle overlapped. */
  planetName: string
}

/**
 * Return the first planet whose mesh-radius + shuttle collision radius contains the
 * ship's XZ position, or `null` when the ship is clear of every planet.
 *
 * @param shipX - Shuttle world-space X.
 * @param shipZ - Shuttle world-space Z.
 * @param planets - Snapshot of planet samples to test (usually built from the live controller list).
 * @returns Collision hit or `null`.
 */
export function findPlanetCollision(
  shipX: number,
  shipZ: number,
  planets: readonly PlanetCollisionSample[],
): PlanetCollisionHit | null {
  for (const planet of planets) {
    const dx = planet.worldX - shipX
    const dz = planet.worldZ - shipZ
    const distSq = dx * dx + dz * dz
    const collisionRadius = planet.displayRadius * SIZE_SCALE + MAP_SHUTTLE_COLLISION_RADIUS
    if (distSq < collisionRadius * collisionRadius) {
      return { planetName: planet.name }
    }
  }
  return null
}
