import { describe, expect, it } from 'vitest'
import {
  MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD,
  isWithinAsteroidMissionApproachRadius,
} from '@/lib/missions/mapAsteroidMissionApproach'

describe('isWithinAsteroidMissionApproachRadius', () => {
  it('returns true just inside the radius', () => {
    const r = MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD
    const wp = { worldX: 100, worldZ: 200 }
    const inside = isWithinAsteroidMissionApproachRadius(wp.worldX + r * 0.5, wp.worldZ, wp)
    expect(inside).toBe(true)
  })

  it('returns false just outside the radius', () => {
    const r = MAP_ASTEROID_MISSION_APPROACH_RADIUS_WORLD
    const wp = { worldX: 100, worldZ: 200 }
    const outside = isWithinAsteroidMissionApproachRadius(wp.worldX + r * 1.01, wp.worldZ, wp)
    expect(outside).toBe(false)
  })

  it('returns false for missing or non-finite waypoint', () => {
    expect(isWithinAsteroidMissionApproachRadius(0, 0, null)).toBe(false)
    expect(isWithinAsteroidMissionApproachRadius(0, 0, { worldX: NaN, worldZ: 0 })).toBe(false)
  })
})
