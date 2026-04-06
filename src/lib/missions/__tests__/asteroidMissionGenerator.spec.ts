import { describe, it, expect } from 'vitest'
import {
  generateAsteroidMission,
  generateWaypointInRegion,
  interpolateRange,
  rollObjective,
} from '../asteroidMissionGenerator'

describe('interpolateRange', () => {
  it('returns min at difficulty 1', () => {
    expect(interpolateRange({ min: 50, max: 150 }, 1)).toBe(50)
  })

  it('returns max at difficulty 10', () => {
    expect(interpolateRange({ min: 50, max: 150 }, 10)).toBe(150)
  })

  it('interpolates linearly at difficulty 5', () => {
    const result = interpolateRange({ min: 0, max: 90 }, 5)
    // (5-1)/9 * 90 = 40
    expect(result).toBe(40)
  })
})

describe('rollObjective', () => {
  it('rolls gather objective with concrete resource amount', () => {
    const slot = {
      type: 'gather' as const,
      weight: 1,
      params: { type: 'gather' as const, resourceAmount: { min: 50, max: 150 } },
      reward: { min: 300, max: 600 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('gather')
    expect(obj.resourceAmount).toBeGreaterThanOrEqual(50)
    expect(obj.resourceAmount).toBeLessThanOrEqual(150)
    expect(obj.reward).toBeGreaterThanOrEqual(300)
    expect(obj.reward).toBeLessThanOrEqual(600)
  })

  it('rolls exterminate objective with concrete values', () => {
    const slot = {
      type: 'exterminate' as const,
      weight: 1,
      params: {
        type: 'exterminate' as const,
        nestCount: { min: 1, max: 5 },
        swarmSize: { min: 3, max: 10 },
        spitterChance: 0.5,
      },
      reward: { min: 800, max: 2000 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('exterminate')
    expect(obj.nestCount).toBeGreaterThanOrEqual(1)
    expect(typeof obj.hasSpitters).toBe('boolean')
  })

  it('rolls rescue objective with concrete values', () => {
    const slot = {
      type: 'rescue' as const,
      weight: 1,
      params: {
        type: 'rescue' as const,
        colonistCount: { min: 1, max: 3 },
        oxygenTime: { min: 120, max: 45 },
        guardedChance: 0.5,
      },
      reward: { min: 1000, max: 3000 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('rescue')
    expect(obj.colonistCount).toBeGreaterThanOrEqual(1)
    expect(obj.oxygenTime).toBeGreaterThanOrEqual(45)
    expect(typeof obj.isGuarded).toBe('boolean')
  })
})

describe('generateWaypointInRegion', () => {
  it('generates position for asteroid-belt within belt bounds', () => {
    const wp = generateWaypointInRegion('asteroid-belt')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // main-belt: innerRadius=420, outerRadius=660, ORBIT_SCALE=0.5
    expect(dist).toBeGreaterThanOrEqual(420 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(660 * 0.5 * 1.1)
  })

  it('generates position for kuiper-belt within belt bounds', () => {
    const wp = generateWaypointInRegion('kuiper-belt')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    expect(dist).toBeGreaterThanOrEqual(1400 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(2400 * 0.5 * 1.1)
  })

  it('generates position for near-earth in closer range', () => {
    const wp = generateWaypointInRegion('near-earth')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    expect(dist).toBeGreaterThanOrEqual(200 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(420 * 0.5 * 1.1)
  })
})

describe('generateAsteroidMission', () => {
  it('generates a valid mission at difficulty 1', () => {
    const mission = generateAsteroidMission(1)
    expect(mission.id).toBeTruthy()
    expect(mission.giverId).toBeTruthy()
    expect(mission.giverName).toBeTruthy()
    expect(mission.name).toBeTruthy()
    expect(mission.briefing).toBeTruthy()
    expect(mission.difficulty).toBe(1)
    expect(mission.objectives.length).toBeGreaterThan(0)
    expect(mission.totalReward).toBeGreaterThan(0)
    expect(mission.waypoint.worldX).toBeDefined()
    expect(mission.waypoint.worldZ).toBeDefined()
    expect(mission.status).toBe('available')
  })

  it('generates a valid mission at difficulty 5', () => {
    const mission = generateAsteroidMission(5)
    expect(mission.difficulty).toBe(5)
    expect(['near-earth', 'asteroid-belt', 'kuiper-belt']).toContain(mission.region)
  })

  it('generates a valid mission at difficulty 10', () => {
    const mission = generateAsteroidMission(10)
    expect(mission.difficulty).toBe(10)
  })

  it('region matches difficulty tier', () => {
    const easyMission = generateAsteroidMission(1)
    expect(easyMission.region).toBe('near-earth')
  })
})
