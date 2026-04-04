/**
 * Creates a LineLoop tracing a full Keplerian orbit.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import * as THREE from 'three'
import { orbitPathPoints } from '@/lib/planets/orbit'
import type { OrbitalElements } from '@/lib/planets/types'
import { ORBIT_PATH_SEGMENTS } from '@/lib/planets/constants'

/** Default orbit line color. */
const ORBIT_LINE_COLOR = 0xffffff

/** Default planet orbit line opacity. */
const PLANET_ORBIT_OPACITY = 0.18

/** Default moon orbit line opacity. */
const MOON_ORBIT_OPACITY = 0.1

/**
 * Generate a LineLoop tracing a full orbital ellipse.
 *
 * @param elements - Keplerian orbital elements (radians, scene units)
 * @param opacity - Line opacity (default 0.18 for planets, 0.1 for moons)
 * @returns A Three.js LineLoop positioned at the origin
 */
export function createOrbitLine(
  elements: OrbitalElements,
  opacity = PLANET_ORBIT_OPACITY,
): THREE.LineLoop {
  const rawPoints = orbitPathPoints(elements, ORBIT_PATH_SEGMENTS)
  // Convert from Kepler coordinate system (x,y,z) to Three.js (x = x, y = z, z = y)
  const threePoints = rawPoints.map(p => new THREE.Vector3(p.x, p.z, p.y))
  const geometry = new THREE.BufferGeometry().setFromPoints(threePoints)
  const material = new THREE.LineBasicMaterial({
    color: ORBIT_LINE_COLOR,
    transparent: true,
    opacity,
  })
  return new THREE.LineLoop(geometry, material)
}

export { PLANET_ORBIT_OPACITY, MOON_ORBIT_OPACITY }
