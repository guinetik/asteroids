import { afterEach, describe, it, expect, vi } from 'vitest'
import { ORBIT_SCALE, SIZE_SCALE } from '@/lib/planets/constants'
import { getPlanet } from '@/lib/planets/catalog'
import shipHealthData from '@/data/shuttle/ship-health.json'
import {
  generateAsteroidMission,
  generateAsteroidWaypointNearHostPlanet,
  generateWaypointInRegion,
  interpolateRange,
  isMissionWaypointSolarDistanceClearOfPlanets,
  nearEarthInnerCatalogForWaypointSpawn,
  nearEarthOuterCatalogForWaypointSpawn,
  objectiveCountForDifficulty,
  pickAsteroidForDifficulty,
  rollObjective,
  syntheticEarthHostAnchor,
  LEVEL_GRID_SIZE,
  MIN_ASTEROID_MISSION_REWARD,
  WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY,
} from '../asteroidMissionGenerator'

const SELECT_FIRST_ASTEROID_RANDOM = 0.25
const SELECT_SECOND_ASTEROID_RANDOM = 0.5

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('rolls survey objective with concrete values', () => {
    const slot = {
      type: 'survey' as const,
      weight: 1,
      params: {
        type: 'survey' as const,
        probeCount: { min: 3, max: 10 },
        timeLimit: { min: 90, max: 45 },
      },
      reward: { min: 200, max: 800 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('survey')
    expect(obj.probeCount).toBeGreaterThanOrEqual(3)
    expect(obj.probeCount).toBeLessThanOrEqual(10)
    expect(obj.timeLimit).toBeGreaterThanOrEqual(45)
    expect(obj.timeLimit).toBeLessThanOrEqual(90)
    expect(obj.reward).toBeGreaterThanOrEqual(200)
    expect(obj.reward).toBeLessThanOrEqual(800)
  })
})

describe('pickAsteroidForDifficulty', () => {
  it('allows Eros for Earth-hosted early/mid missions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_SECOND_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(3, 'earth')).toBe('eros')
    randomSpy.mockRestore()
  })

  it('allows Eros for Mars-hosted early/mid missions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_SECOND_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(3, 'mars')).toBe('eros')
    randomSpy.mockRestore()
  })

  it('does not select Eros for unrelated hosts when global alternatives exist', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_SECOND_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(3, 'venus')).toBe('bennu')
    randomSpy.mockRestore()
  })

  it('preserves global fallback when no host is supplied', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_SECOND_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(3)).toBe('bennu')
    randomSpy.mockRestore()
  })

  it('allows Vesta for Mars-hosted main-belt missions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_FIRST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(5, 'mars')).toBe('vesta')
    randomSpy.mockRestore()
  })

  it('allows Vesta for Jupiter-hosted main-belt missions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_FIRST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(5, 'jupiter')).toBe('vesta')
    randomSpy.mockRestore()
  })

  it('allows Vesta for Saturn-hosted main-belt missions', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_FIRST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(5, 'saturn')).toBe('vesta')
    randomSpy.mockRestore()
  })

  it('does not select Vesta for unrelated hosts when global alternatives exist', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_FIRST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(5, 'earth')).toBe('psyche')
    randomSpy.mockRestore()
  })

  it('keeps Vesta out of no-host fallback selection', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_FIRST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(5)).toBe('psyche')
    randomSpy.mockRestore()
  })
})

describe('generateAsteroidWaypointNearHostPlanet', () => {
  it("keeps early Earth asteroid waypoints outside 1.5x the Moon's local orbit", () => {
    const earth = getPlanet('earth')
    const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
    const moonOrbitWorld = (earth.moons[0]!.orbit.semiMajorAxis * SIZE_SCALE) / 150
    const earthRadiusWorld = earth.displayRadius * SIZE_SCALE
    const minDistance = Math.max(moonOrbitWorld * 1.5, earthRadiusWorld * 3)
    const maxDistance = Math.max(minDistance + earthRadiusWorld * 2, moonOrbitWorld * 2.25)

    for (let i = 0; i < 40; i++) {
      const wp = generateAsteroidWaypointNearHostPlanet(hostR, 0, 1, Math.random, 'earth')
      const distanceFromEarth = Math.hypot(wp.worldX - hostR, wp.worldZ)
      expect(distanceFromEarth).toBeGreaterThanOrEqual(minDistance - 1e-6)
      expect(distanceFromEarth).toBeLessThanOrEqual(maxDistance + 1e-6)
    }
  })

  it('keeps waypoint solar radius close to the host planet (Earth @ 1 AU)', () => {
    const earth = getPlanet('earth')
    const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
    const maxJitter = 20 + 95 + 1e-6
    for (let i = 0; i < 120; i++) {
      const wp = generateAsteroidWaypointNearHostPlanet(hostR, 0, 10)
      const Rw = Math.hypot(wp.worldX, wp.worldZ)
      expect(Math.abs(Rw - hostR)).toBeLessThanOrEqual(maxJitter + 1e-3)
    }
  })

  it('keeps waypoint solar radius close to Jupiter host orbit, not inner planets', () => {
    const jupiter = getPlanet('jupiter')
    const hostR = jupiter.orbit.semiMajorAxis * ORBIT_SCALE
    const maxJitter = 20 + 95 + 1e-6
    for (let i = 0; i < 80; i++) {
      const wp = generateAsteroidWaypointNearHostPlanet(hostR, 0, 8)
      const Rw = Math.hypot(wp.worldX, wp.worldZ)
      expect(Math.abs(Rw - hostR)).toBeLessThanOrEqual(maxJitter + 1e-3)
      expect(Rw).toBeGreaterThan(400)
    }
  })
})

describe('generateWaypointInRegion', () => {
  it('generates position for asteroid-belt within belt bounds at high difficulty', () => {
    const wp = generateWaypointInRegion('asteroid-belt', 10)
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // main-belt: innerRadius=2.06 AU, outerRadius=3.27 AU, ORBIT_SCALE=150
    expect(dist).toBeGreaterThanOrEqual(2.06 * ORBIT_SCALE * 0.9)
    expect(dist).toBeLessThanOrEqual(3.27 * ORBIT_SCALE * 1.1)
  })

  it('generates position for kuiper-belt within belt bounds at high difficulty', () => {
    const wp = generateWaypointInRegion('kuiper-belt', 10)
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // kuiper-belt: innerRadius=30 AU, outerRadius=50 AU, ORBIT_SCALE=150
    expect(dist).toBeGreaterThanOrEqual(30 * ORBIT_SCALE * 0.9)
    expect(dist).toBeLessThanOrEqual(50 * ORBIT_SCALE * 1.1)
  })

  it('keeps near-earth waypoints in inner annulus at difficulty 1', () => {
    const wp = generateWaypointInRegion('near-earth', 1)
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    const innerCatalog = nearEarthInnerCatalogForWaypointSpawn()
    const outerCatalog = nearEarthOuterCatalogForWaypointSpawn()
    const maxCatalog =
      innerCatalog + (outerCatalog - innerCatalog) * WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY
    const innerWorld = innerCatalog * ORBIT_SCALE
    const maxWorld = maxCatalog * ORBIT_SCALE
    expect(dist).toBeGreaterThanOrEqual(innerWorld * 0.99)
    expect(dist).toBeLessThanOrEqual(maxWorld * 1.01)
  })

  it('keeps near-earth waypoints outside the shuttle hot zone', () => {
    for (let i = 0; i < 40; i++) {
      const wp = generateWaypointInRegion('near-earth', 1 + (i % 10))
      const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
      expect(dist).toBeGreaterThanOrEqual(shipHealthData.hotBoundary + 8)
    }
  })

  it('allows full near-earth annulus at difficulty 10', () => {
    const wp = generateWaypointInRegion('near-earth', 10)
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    const innerWorld = nearEarthInnerCatalogForWaypointSpawn() * ORBIT_SCALE
    const outerWorld = nearEarthOuterCatalogForWaypointSpawn() * ORBIT_SCALE
    expect(dist).toBeGreaterThanOrEqual(innerWorld * 0.99)
    expect(dist).toBeLessThanOrEqual(outerWorld * 1.01)
  })

  it('rejects radii that sit on Earth nominal orbit at strict standoff', () => {
    const earthOrbitWorld = 1.0 * ORBIT_SCALE
    expect(isMissionWaypointSolarDistanceClearOfPlanets(earthOrbitWorld)).toBe(false)
  })

  it('keeps asteroid-belt waypoints outside strict planet-orbit gaps', () => {
    for (let i = 0; i < 80; i++) {
      const wp = generateWaypointInRegion('asteroid-belt', 4 + (i % 6))
      const dist = Math.hypot(wp.worldX, wp.worldZ)
      expect(isMissionWaypointSolarDistanceClearOfPlanets(dist)).toBe(true)
    }
  })
})

describe('objectiveCountForDifficulty', () => {
  it('returns 1 for difficulty 1-3', () => {
    expect(objectiveCountForDifficulty(1)).toBe(1)
    expect(objectiveCountForDifficulty(2)).toBe(1)
    expect(objectiveCountForDifficulty(3)).toBe(1)
  })

  it('returns 2 for difficulty 4-6', () => {
    expect(objectiveCountForDifficulty(4)).toBe(2)
    expect(objectiveCountForDifficulty(5)).toBe(2)
    expect(objectiveCountForDifficulty(6)).toBe(2)
  })

  it('returns 3 for difficulty 7-10', () => {
    expect(objectiveCountForDifficulty(7)).toBe(3)
    expect(objectiveCountForDifficulty(8)).toBe(3)
    expect(objectiveCountForDifficulty(9)).toBe(3)
    expect(objectiveCountForDifficulty(10)).toBe(3)
  })
})

describe('generateAsteroidMission', () => {
  it('tags origin planet when a host anchor is passed', () => {
    const mars = getPlanet('mars')
    const hostR = mars.orbit.semiMajorAxis * ORBIT_SCALE
    const mission = generateAsteroidMission(5, {
      planetId: 'mars',
      worldX: hostR,
      worldZ: 0,
    })
    expect(mission.originPlanetId).toBe('mars')
    const Rw = Math.hypot(mission.waypoint.worldX, mission.waypoint.worldZ)
    expect(Math.abs(Rw - hostR)).toBeLessThanOrEqual(20 + 95 + 1e-3)
  })

  it('defaults synthetic host to Earth when no anchor is passed', () => {
    const mission = generateAsteroidMission(3)
    expect(mission.originPlanetId).toBe(syntheticEarthHostAnchor().planetId)
  })

  it('generates a valid mission at difficulty 1', () => {
    const mission = generateAsteroidMission(1)
    expect(mission.id).toBeTruthy()
    expect(mission.giverId).toBeTruthy()
    expect(mission.giverName).toBeTruthy()
    expect(mission.name).toBeTruthy()
    expect(mission.briefing).toBeTruthy()
    expect(mission.difficulty).toBe(1)
    expect(mission.objectives.length).toBeGreaterThan(0)
    expect(mission.totalReward).toBeGreaterThanOrEqual(MIN_ASTEROID_MISSION_REWARD)
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

  it('keeps difficulty 2 missions in the near-earth region only', () => {
    for (let i = 0; i < 12; i++) {
      expect(generateAsteroidMission(2).region).toBe('near-earth')
    }
  })

  it('produces objectives with valid x/z positions within grid bounds', () => {
    const halfGrid = LEVEL_GRID_SIZE / 2
    for (let d = 1; d <= 10; d++) {
      const mission = generateAsteroidMission(d)
      for (const obj of mission.objectives) {
        expect(obj.x).toBeGreaterThanOrEqual(-halfGrid)
        expect(obj.x).toBeLessThanOrEqual(halfGrid)
        expect(obj.z).toBeGreaterThanOrEqual(-halfGrid)
        expect(obj.z).toBeLessThanOrEqual(halfGrid)
      }
    }
  })

  it('scales objective count by difficulty (clamped to available slots)', () => {
    const easy = generateAsteroidMission(1)
    expect(easy.objectives.length).toBe(1)

    const hard = generateAsteroidMission(8)
    // Count is min(objectiveCountForDifficulty, template slots)
    expect(hard.objectives.length).toBeGreaterThanOrEqual(1)
    expect(hard.objectives.length).toBeLessThanOrEqual(objectiveCountForDifficulty(8))
  })

  it('Saturn host only offers exterminate or rescue asteroid objectives', () => {
    const saturn = getPlanet('saturn')
    const hostR = saturn.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'saturn' as const, worldX: hostR, worldZ: 0 }
    for (let d = 2; d <= 10; d++) {
      for (let i = 0; i < 24; i++) {
        const mission = generateAsteroidMission(d, host)
        expect(mission.originPlanetId).toBe('saturn')
        for (const obj of mission.objectives) {
          expect(obj.type === 'exterminate' || obj.type === 'rescue').toBe(true)
        }
      }
    }
  })

  it('Saturn host posts a combat contract from difficulty 1 once Colonial Guard covers the band', () => {
    const saturn = getPlanet('saturn')
    const hostR = saturn.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'saturn' as const, worldX: hostR, worldZ: 0 }
    const mission = generateAsteroidMission(1, host)
    expect(mission.originPlanetId).toBe('saturn')
    for (const obj of mission.objectives) {
      expect(obj.type === 'exterminate' || obj.type === 'rescue').toBe(true)
    }
  })

  it('Mercury host only offers exterminate or rescue asteroid objectives', () => {
    const mercury = getPlanet('mercury')
    const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
    for (let d = 1; d <= 10; d++) {
      for (let i = 0; i < 24; i++) {
        const mission = generateAsteroidMission(d, host)
        expect(mission.originPlanetId).toBe('mercury')
        for (const obj of mission.objectives) {
          expect(obj.type === 'exterminate' || obj.type === 'rescue').toBe(true)
        }
      }
    }
  })

  it('Mercury host posts a combat contract from difficulty 1 (Cinderline narrative requirement)', () => {
    const mercury = getPlanet('mercury')
    const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
    const mission = generateAsteroidMission(1, host)
    expect(mission.originPlanetId).toBe('mercury')
    for (const obj of mission.objectives) {
      expect(obj.type === 'exterminate' || obj.type === 'rescue').toBe(true)
    }
  })

  it('Mercury host re-attributes the asteroid contract to The Cinderline', () => {
    const mercury = getPlanet('mercury')
    const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
    for (let d = 1; d <= 10; d++) {
      for (let i = 0; i < 12; i++) {
        const mission = generateAsteroidMission(d, host)
        expect(mission.giverId).toBe('cinderline')
        expect(mission.giverName).toBe('The Cinderline')
      }
    }
  })

  it('non-overridden hosts keep the underlying template giver attribution', () => {
    const earth = getPlanet('earth')
    const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'earth' as const, worldX: hostR, worldZ: 0 }
    const mission = generateAsteroidMission(3, host)
    expect(mission.giverId).not.toBe('cinderline')
    expect(mission.giverName).not.toBe('The Cinderline')
  })

  it('civilian hosts never post pure-extermination contracts (Cinderline flavor stays exclusive)', () => {
    /*
     * Regression: with Colonial Guard's `near-earth` band lowered to [1, 4] so Mercury could
     * draft a contract at diff 1, every other planet started crowding the random pool with
     * Nest Clearance — making Earth/Mars/Venus boards feel like they all serve the same
     * exterminate work. Civilian boards must stay survey/gather/rescue.
     */
    const planets = ['earth', 'mars', 'venus'] as const
    for (const planetId of planets) {
      const planet = getPlanet(planetId)
      const hostR = planet.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId, worldX: hostR, worldZ: 0 }
      for (let d = 1; d <= 10; d++) {
        for (let i = 0; i < 16; i++) {
          const mission = generateAsteroidMission(d, host)
          for (const obj of mission.objectives) {
            expect(obj.type).not.toBe('exterminate')
          }
        }
      }
    }
  })
})
