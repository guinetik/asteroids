import { describe, expect, it } from 'vitest'
import { getPlanet } from '@/lib/planets/catalog'
import { SIZE_SCALE } from '@/lib/planets/constants'
import {
  EVA_WAYPOINT_MAX_RADIAL_OFFSET,
  EVA_WAYPOINT_MAX_TANGENTIAL_OFFSET,
  generateEvaWaypoint,
} from '../evaWaypointGenerator'

describe('generateEvaWaypoint', () => {
  it('keeps Earth EVA waypoints inside the 3–5 Earth-radius onboarding band', () => {
    const earth = getPlanet('earth')
    const earthRadiusWorld = earth.displayRadius * SIZE_SCALE
    const planetWorldX = earth.orbit.semiMajorAxis * 150
    const minDistance = earthRadiusWorld * 3
    const maxDistance = earthRadiusWorld * 5

    for (let i = 0; i < 40; i++) {
      const waypoint = generateEvaWaypoint(planetWorldX, 0, 'earth')
      const distanceFromEarth = Math.hypot(
        waypoint.worldX - planetWorldX,
        waypoint.worldZ,
      )
      expect(distanceFromEarth).toBeGreaterThanOrEqual(minDistance - 1e-6)
      expect(distanceFromEarth).toBeLessThanOrEqual(maxDistance + 1e-6)
    }
  })

  it('keeps non-Earth EVA waypoints on the wider tangent-biased lane', () => {
    const planetWorldX = 228.6
    for (let i = 0; i < 40; i++) {
      const waypoint = generateEvaWaypoint(planetWorldX, 0, 'mars')
      const dx = waypoint.worldX - planetWorldX
      const dz = waypoint.worldZ
      expect(Math.abs(dx)).toBeLessThanOrEqual(EVA_WAYPOINT_MAX_RADIAL_OFFSET + 1e-6)
      expect(Math.abs(dz)).toBeLessThanOrEqual(EVA_WAYPOINT_MAX_TANGENTIAL_OFFSET + 1e-6)
    }
  })
})
