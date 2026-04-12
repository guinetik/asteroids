/**
 * Pure projection helpers for the tactical map overlay.
 *
 * Computes nearest-body distances, formats display values,
 * and converts heading angles to 2D screen vectors.
 * No Three.js or Vue dependencies — pure math.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-overlay-design.md
 */

/** A celestial body with position and mass for map projection. */
export interface MapBody {
  /** Display name */
  name: string
  /** World X position */
  x: number
  /** World Z position */
  z: number
  /** Mass in solar masses */
  mass: number
}

/** A body with its computed distance from the ship. */
export interface NearestBody {
  /** Display name */
  name: string
  /** World X position */
  x: number
  /** World Z position */
  z: number
  /** Mass in solar masses */
  mass: number
  /** Distance from ship in world units */
  distance: number
}

import { ORBIT_SCALE } from '@/lib/planets/constants'

/**
 * Find the N nearest celestial bodies to a position, sorted by distance.
 *
 * @param shipX - Ship world X
 * @param shipZ - Ship world Z
 * @param bodies - All celestial bodies
 * @param count - Maximum number of results
 */
export function findNearestBodies(
  shipX: number,
  shipZ: number,
  bodies: readonly MapBody[],
  count: number,
): NearestBody[] {
  return bodies
    .map((b) => {
      const dx = b.x - shipX
      const dz = b.z - shipZ
      return { ...b, distance: Math.sqrt(dx * dx + dz * dz) }
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
}

/**
 * Format a distance value for HUD display in Astronomical Units.
 *
 * @param distance - Distance in world units
 */
export function formatDistance(distance: number): string {
  const au = distance / ORBIT_SCALE
  if (au >= 100) {
    return `${au.toFixed(0)} AU`
  }
  if (au >= 10) {
    return `${au.toFixed(1)} AU`
  }
  return `${au.toFixed(2)} AU`
}

/**
 * Convert a heading angle (radians, 0 = +X) to a 2D unit vector.
 * The Y component maps Z→screen-Y (inverted because screen Y is down).
 *
 * @param heading - Heading angle in radians
 * @returns 2D unit vector { x, y } suitable for CSS transform
 */
export function headingToVector(heading: number): { x: number; y: number } {
  return {
    x: Math.cos(heading),
    y: -Math.sin(heading),
  }
}
