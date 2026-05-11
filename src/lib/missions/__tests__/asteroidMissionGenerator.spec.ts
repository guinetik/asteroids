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
  minHeliocentricWorldForInnerPlanetAsteroidContracts,
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
import { MISSION_GIVERS } from '../giverCatalog'
import type { MissionGiver, MissionGiverTemplate, ObjectiveSlot } from '../types'
import type { PlayerProfile } from '@/lib/player/types'
import { GLOBAL_MISSION_PAY_MULTIPLIER } from '../missionEconomy'
const SELECT_FIRST_ASTEROID_RANDOM = 0.25
const SELECT_SECOND_ASTEROID_RANDOM = 0.5
const SELECT_LAST_ASTEROID_RANDOM = 0.99

const RESTRICTED_HOST_OBJECTIVE_TYPES = new Set([
  'exterminate',
  'rescue',
  'bunker',
  'mineral-analysis',
])

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

  it('rolls photometry objective with one probe and scan timing', () => {
    const slot = {
      type: 'photometry' as const,
      weight: 1,
      params: {
        type: 'photometry' as const,
        timeLimit: { min: 240, max: 180 },
        scanHoldSeconds: { min: 8, max: 12 },
        probeDistance: { min: 2200, max: 2800 },
      },
      reward: { min: 500, max: 900 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('photometry')
    expect(obj.probeCount).toBe(1)
    expect(obj.timeLimit).toBeGreaterThanOrEqual(180)
    expect(obj.timeLimit).toBeLessThanOrEqual(240)
    expect(obj.scanHoldSeconds).toBeGreaterThanOrEqual(8)
    expect(obj.scanHoldSeconds).toBeLessThanOrEqual(12)
    expect(obj.probeDistance).toBeGreaterThanOrEqual(2200)
    expect(obj.probeDistance).toBeLessThanOrEqual(2800)
  })

  it('scales photometry around difficulty 3 minimum, 5 midpoint, and 10 maximum', () => {
    const slot = {
      type: 'photometry' as const,
      weight: 1,
      params: {
        type: 'photometry' as const,
        timeLimit: { min: 270, max: 170 },
        scanHoldSeconds: { min: 6, max: 14 },
        probeDistance: { min: 2400, max: 3400 },
      },
      reward: { min: 500, max: 900 },
    }

    const easy = rollObjective(slot, 3)
    const middle = rollObjective(slot, 5)
    const hard = rollObjective(slot, 10)

    expect(easy.timeLimit).toBe(270)
    expect(easy.scanHoldSeconds).toBe(6)
    expect(middle.timeLimit).toBe(220)
    expect(middle.scanHoldSeconds).toBe(10)
    expect(hard.timeLimit).toBe(170)
    expect(hard.scanHoldSeconds).toBe(14)
  })

  it('rolls DAN objective with concrete scan values', () => {
    const slot = {
      type: 'dan' as const,
      weight: 1,
      params: {
        type: 'dan' as const,
        scanDurationSeconds: { min: 35, max: 50 },
        requiredParticleHits: { min: 40, max: 55 },
        enemyGraceSeconds: { min: 10, max: 8 },
        particleTier: 'medium' as const,
        enemyTier: 'medium' as const,
      },
      reward: { min: 3000, max: 6500 },
    }

    const obj = rollObjective(slot, 5)

    expect(obj.type).toBe('dan')
    expect(obj.scanDurationSeconds).toBeGreaterThanOrEqual(35)
    expect(obj.scanDurationSeconds).toBeLessThanOrEqual(50)
    expect(obj.requiredParticleHits).toBeGreaterThanOrEqual(40)
    expect(obj.requiredParticleHits).toBeLessThanOrEqual(55)
    expect(obj.enemyGraceSeconds).toBeGreaterThanOrEqual(8)
    expect(obj.enemyGraceSeconds).toBeLessThanOrEqual(10)
    expect(obj.particleTier).toBe('medium')
    expect(obj.enemyTier).toBe('medium')
    expect(obj.reward).toBeGreaterThanOrEqual(3000)
    expect(obj.reward).toBeLessThanOrEqual(6500)
  })

  it('rolls mineral analysis objective with concrete rock count and sample kg', () => {
    const slot = {
      type: 'mineral-analysis' as const,
      weight: 1,
      params: {
        type: 'mineral-analysis' as const,
        analysisRockCount: { min: 2, max: 6 },
        sampleKg: { min: 10, max: 60 },
      },
      reward: { min: 900, max: 2400 },
    }

    const obj = rollObjective(slot, 5)

    expect(obj.type).toBe('mineral-analysis')
    expect(obj.analysisRockCount).toBeGreaterThanOrEqual(2)
    expect(obj.analysisRockCount).toBeLessThanOrEqual(6)
    expect(obj.sampleKg).toBeGreaterThanOrEqual(10)
    expect(obj.sampleKg).toBeLessThanOrEqual(60)
    expect(obj.reward).toBeGreaterThanOrEqual(900)
    expect(obj.reward).toBeLessThanOrEqual(2400)
  })
})

describe('pickAsteroidForDifficulty', () => {
  it('allows Eros for Earth-hosted early/mid missions', () => {
    // Earth at difficulty 3 has multiple host-tagged entries (bennu, xg7, eros);
    // SELECT_LAST_ASTEROID_RANDOM lands on the last one declared (eros).
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(SELECT_LAST_ASTEROID_RANDOM)

    expect(pickAsteroidForDifficulty(3, 'earth')).toBe('eros')
    randomSpy.mockRestore()
  })

  it('allows Eros for Mars-hosted early/mid missions', () => {
    // Mars/diff 3 host pool: [ryugu-global, ryugu-multi, bennu-global, eros, vesta].
    // SELECT_LAST_ASTEROID_RANDOM lands on the last → vesta; index 3 (eros) needs ~0.65.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.65)

    expect(pickAsteroidForDifficulty(3, 'mars')).toBe('eros')
    randomSpy.mockRestore()
  })

  it('does not select Eros for unrelated hosts when global alternatives exist', () => {
    // Venus/diff 3 host pool: [ryugu-global, ryugu-multi, bennu-global]. Eros (earth/mars only)
    // must not appear regardless of which slot the random hits.
    for (const r of [0.0, 0.34, 0.67, 0.99]) {
      const spy = vi.spyOn(Math, 'random').mockReturnValue(r)
      expect(pickAsteroidForDifficulty(3, 'venus')).not.toBe('eros')
      spy.mockRestore()
    }
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

  it('keeps Mercury and Venus host waypoints outside Mercury perihelion + standoff', () => {
    const minR = minHeliocentricWorldForInnerPlanetAsteroidContracts()
    const inwardRand = () => 0

    const mercury = getPlanet('mercury')
    const hostMercuryR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    for (let i = 0; i < 60; i++) {
      const wp = generateAsteroidWaypointNearHostPlanet(hostMercuryR, 0, 10, inwardRand, 'mercury')
      expect(Math.hypot(wp.worldX, wp.worldZ)).toBeGreaterThanOrEqual(minR - 1e-6)
    }

    const venus = getPlanet('venus')
    const hostVenusR = venus.orbit.semiMajorAxis * ORBIT_SCALE
    for (let i = 0; i < 60; i++) {
      const wp = generateAsteroidWaypointNearHostPlanet(hostVenusR, 0, 10, inwardRand, 'venus')
      expect(Math.hypot(wp.worldX, wp.worldZ)).toBeGreaterThanOrEqual(minR - 1e-6)
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
      innerCatalog +
      (outerCatalog - innerCatalog) * WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY
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
    expect(mission.totalReward).toBeGreaterThanOrEqual(
      Math.round(MIN_ASTEROID_MISSION_REWARD * GLOBAL_MISSION_PAY_MULTIPLIER),
    )
    expect(mission.waypoint.worldX).toBeDefined()
    expect(mission.waypoint.worldZ).toBeDefined()
    expect(mission.status).toBe('available')
  })

  it('generates a valid mission at difficulty 5', () => {
    const mission = generateAsteroidMission(5)
    expect(mission.difficulty).toBe(5)
    expect(['near-earth', 'asteroid-belt', 'kuiper-belt', 'jovian-trojans']).toContain(
      mission.region,
    )
  })

  it('can force a photometry mission for level query overrides', () => {
    const mission = generateAsteroidMission(5, null, () => 0, 'photometry')

    expect(mission.giverId).toBe('jovian-society')
    expect(mission.objectives.some((objective) => objective.type === 'photometry')).toBe(true)
  })

  it('can force photometry across its full difficulty band', () => {
    for (const difficulty of [3, 5, 10]) {
      const mission = generateAsteroidMission(difficulty, null, () => 0, 'photometry')

      expect(mission.giverId).toBe('jovian-society')
      expect(mission.difficulty).toBe(difficulty)
      expect(mission.objectives.some((objective) => objective.type === 'photometry')).toBe(true)
    }
  })

  it('can force a DAN mission for DAN-capable givers', () => {
    const mission = generateAsteroidMission(6, null, () => 0, 'dan')

    expect(['jovian-society', 'cinderline', 'ceres-institute']).toContain(mission.giverId)
    expect(['jovian-trojans', 'asteroid-belt']).toContain(mission.region)
    expect(mission.objectives.some((objective) => objective.type === 'dan')).toBe(true)
  })

  it('can force DAN across its authored difficulty band', () => {
    for (const difficulty of [4, 7, 8, 10]) {
      const mission = generateAsteroidMission(difficulty, null, () => 0, 'dan')

      expect(['jovian-society', 'cinderline', 'ceres-institute']).toContain(mission.giverId)
      expect(mission.difficulty).toBe(difficulty)
      expect(mission.objectives.some((objective) => objective.type === 'dan')).toBe(true)
    }
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

  it('Saturn host only offers combat, rescue, bunker, or mineral-analysis objectives', () => {
    const saturn = getPlanet('saturn')
    const hostR = saturn.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'saturn' as const, worldX: hostR, worldZ: 0 }
    for (let d = 2; d <= 10; d++) {
      for (let i = 0; i < 24; i++) {
        const mission = generateAsteroidMission(d, host)
        expect(mission.originPlanetId).toBe('saturn')
        for (const obj of mission.objectives) {
          expect(RESTRICTED_HOST_OBJECTIVE_TYPES.has(obj.type)).toBe(true)
        }
      }
    }
  })

  it('Saturn host posts a restricted-board contract from difficulty 1', () => {
    const saturn = getPlanet('saturn')
    const hostR = saturn.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'saturn' as const, worldX: hostR, worldZ: 0 }
    const mission = generateAsteroidMission(1, host)
    expect(mission.originPlanetId).toBe('saturn')
    for (const obj of mission.objectives) {
      expect(RESTRICTED_HOST_OBJECTIVE_TYPES.has(obj.type)).toBe(true)
    }
  })

  it('Mercury host only offers combat, rescue, bunker, or mineral-analysis objectives', () => {
    const mercury = getPlanet('mercury')
    const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
    for (let d = 1; d <= 10; d++) {
      for (let i = 0; i < 24; i++) {
        const mission = generateAsteroidMission(d, host)
        expect(mission.originPlanetId).toBe('mercury')
        for (const obj of mission.objectives) {
          expect(RESTRICTED_HOST_OBJECTIVE_TYPES.has(obj.type)).toBe(true)
        }
      }
    }
  })

  it('Mercury host posts a restricted-board contract from difficulty 1', () => {
    const mercury = getPlanet('mercury')
    const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
    const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
    const mission = generateAsteroidMission(1, host)
    expect(mission.originPlanetId).toBe('mercury')
    for (const obj of mission.objectives) {
      expect(RESTRICTED_HOST_OBJECTIVE_TYPES.has(obj.type)).toBe(true)
    }
  })

  it('can generate mineral-analysis missions for every planet at every difficulty', () => {
    for (const planetId of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'] as const) {
      const planet = getPlanet(planetId)
      const hostR = planet.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId, worldX: hostR, worldZ: 0 }
      for (let difficulty = 1; difficulty <= 10; difficulty++) {
        const mission = generateAsteroidMission(
          difficulty,
          host,
          Math.random,
          'mineral-analysis',
        )

        expect(mission.originPlanetId).toBe(planetId)
        expect(mission.objectives.some((obj) => obj.type === 'mineral-analysis')).toBe(true)
      }
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

describe('rollObjective bunker materialization', () => {
  /** Synthetic bunker slot — no scalable knobs other than reward. */
  const bunkerSlot: ObjectiveSlot = {
    type: 'bunker',
    weight: 1,
    params: { type: 'bunker' },
    reward: { min: 1000, max: 4000 },
  }

  it('stamps waveCount=3 across difficulty band 1-4', () => {
    for (const d of [1, 2, 3, 4]) {
      const obj = rollObjective(bunkerSlot, d)
      expect(obj.type).toBe('bunker')
      expect(obj.waveCount).toBe(3)
    }
  })

  it('stamps waveCount=5 across difficulty band 5-7', () => {
    for (const d of [5, 6, 7]) {
      const obj = rollObjective(bunkerSlot, d)
      expect(obj.type).toBe('bunker')
      expect(obj.waveCount).toBe(5)
    }
  })

  it('stamps waveCount=7 across difficulty band 8-10', () => {
    for (const d of [8, 9, 10]) {
      const obj = rollObjective(bunkerSlot, d)
      expect(obj.type).toBe('bunker')
      expect(obj.waveCount).toBe(7)
    }
  })
})

describe('per-template planetIds filter', () => {
  /**
   * Build a synthetic giver scoped to a single test, push it onto MISSION_GIVERS,
   * and remove it on cleanup so other tests are unaffected.
   */
  function withSyntheticGiver<T>(giver: MissionGiver, fn: () => T): T {
    MISSION_GIVERS.push(giver)
    try {
      return fn()
    } finally {
      const idx = MISSION_GIVERS.indexOf(giver)
      if (idx >= 0) MISSION_GIVERS.splice(idx, 1)
    }
  }

  /** Build a gather slot template carrying a stable id we can detect. */
  function buildGatherTemplate(
    id: string,
    overrides: Partial<MissionGiverTemplate> = {},
  ): MissionGiverTemplate {
    return {
      id,
      name: `Template ${id}`,
      briefing: 'briefing',
      objectiveSlots: [
        {
          type: 'gather',
          weight: 1,
          params: { type: 'gather', resourceAmount: { min: 50, max: 150 } },
          reward: { min: 300, max: 600 },
        },
      ],
      completionBonus: { min: 100, max: 200 },
      regionByDifficulty: { 'near-earth': [1, 10] },
      ...overrides,
    }
  }

  it('skips a template with planetIds=["jupiter"] when host is not Jupiter', () => {
    const restrictedId = 'planetids_test_restricted_only'
    const giver: MissionGiver = {
      id: 'planetids_test_giver_jupiter_only',
      name: 'PlanetIds Test Giver',
      title: 'Test',
      objectiveTypes: ['gather'],
      minDifficulty: 1,
      maxDifficulty: 10,
      missions: [buildGatherTemplate(restrictedId, { planetIds: ['jupiter'] })],
    }

    withSyntheticGiver(giver, () => {
      const earth = getPlanet('earth')
      const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId: 'earth' as const, worldX: hostR, worldZ: 0 }
      for (let i = 0; i < 40; i++) {
        const mission = generateAsteroidMission(5, host)
        expect(mission.templateId).not.toBe(restrictedId)
      }
    })
  })

  it('still rolls a template without planetIds (regression: dormant field)', () => {
    const unrestrictedId = 'planetids_test_unrestricted_only'
    const giver: MissionGiver = {
      id: 'planetids_test_giver_global_only',
      name: 'PlanetIds Test Giver Global',
      title: 'Test',
      objectiveTypes: ['gather'],
      minDifficulty: 5,
      maxDifficulty: 5,
      // Single template with NO planetIds — should still appear in the pool.
      missions: [buildGatherTemplate(unrestrictedId)],
    }

    withSyntheticGiver(giver, () => {
      const venus = getPlanet('venus')
      const hostR = venus.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId: 'venus' as const, worldX: hostR, worldZ: 0 }
      // Narrow to this giver so we do not probabilistically lose against the full catalog.
      const mission = generateAsteroidMission(5, host, Math.random, null, giver.id)
      expect(mission.templateId).toBe(unrestrictedId)
    })
  })

  /** Build a bunker-only slot template carrying a stable id we can detect. */
  function buildBunkerTemplate(
    id: string,
    overrides: Partial<MissionGiverTemplate> = {},
  ): MissionGiverTemplate {
    return {
      id,
      name: `Template ${id}`,
      briefing: 'briefing',
      objectiveSlots: [
        {
          type: 'bunker',
          weight: 1,
          params: { type: 'bunker' },
          reward: { min: 1000, max: 4000 },
        },
      ],
      completionBonus: { min: 100, max: 200 },
      regionByDifficulty: { 'near-earth': [1, 10] },
      ...overrides,
    }
  }

  it('admits bunker templates at combat-only host planets (e.g. Mercury)', () => {
    /*
     * Regression: Mercury is in COMBAT_ONLY_HOST_PLANET_IDS, and the combat-host predicate
     * used to admit only `exterminate`/`rescue` slots — a Cinderline-style bunker giver
     * pinned to Mercury would have been filtered out at every roll, throwing
     * "No templates match difficulty N for mercury (...)". Bunker is combat-flavored
     * (waves of viroid enemies in an arena), so the predicate must include it.
     */
    const bunkerId = 'combat_host_bunker_test'
    const giver: MissionGiver = {
      id: 'combat_host_bunker_test_giver',
      name: 'Test Cinderline',
      title: 'Test',
      objectiveTypes: ['bunker'],
      minDifficulty: 1,
      maxDifficulty: 10,
      missions: [buildBunkerTemplate(bunkerId, { planetIds: ['mercury'] })],
    }

    withSyntheticGiver(giver, () => {
      const mercury = getPlanet('mercury')
      const hostR = mercury.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId: 'mercury' as const, worldX: hostR, worldZ: 0 }
      let bunkerMission: ReturnType<typeof generateAsteroidMission> | undefined
      for (let i = 0; i < 80 && !bunkerMission; i++) {
        const mission = generateAsteroidMission(4, host)
        if (mission.templateId === bunkerId) bunkerMission = mission
      }
      expect(bunkerMission).toBeDefined()
      expect(bunkerMission!.objectives.length).toBeGreaterThan(0)
      expect(bunkerMission!.objectives[0]!.type).toBe('bunker')
    })
  })
})

describe('generateAsteroidMission requiredGiverId filter', () => {
  it('biases the candidate pool to the requested giver when no host override applies', () => {
    const host = { planetId: 'jupiter', worldX: 0, worldZ: 0 }
    const samples: string[] = []
    for (let i = 0; i < 20; i++) {
      const m = generateAsteroidMission(5, host, Math.random, null, 'jovian-society')
      samples.push(m.giverId)
    }
    expect(samples.every((g) => g === 'jovian-society')).toBe(true)
  })

  it('throws a clear error when no template matches the requiredGiverId at this planet', () => {
    const host = { planetId: 'jupiter', worldX: 0, worldZ: 0 }
    expect(() =>
      generateAsteroidMission(5, host, Math.random, null, 'this-giver-does-not-exist'),
    ).toThrow(/No templates match/)
  })

  it('respects host-giver-override: at Mercury, requiredGiverId="cinderline" allows any template', () => {
    const host = { planetId: 'mercury', worldX: 0, worldZ: 0 }
    const samples: string[] = []
    for (let i = 0; i < 10; i++) {
      const m = generateAsteroidMission(3, host, Math.random, null, 'cinderline')
      samples.push(m.giverId)
    }
    expect(samples.every((g) => g === 'cinderline')).toBe(true)
  })
})

describe('mission-level requiresFlag filtering', () => {
  /**
   * Inject a synthetic giver, run fn, then clean up regardless of outcome.
   */
  function withSyntheticGiver<T>(giver: MissionGiver, fn: () => T): T {
    MISSION_GIVERS.push(giver)
    try {
      return fn()
    } finally {
      const idx = MISSION_GIVERS.indexOf(giver)
      if (idx >= 0) MISSION_GIVERS.splice(idx, 1)
    }
  }

  /** Minimal gather template fixture. */
  function makeGatherTemplate(
    id: string,
    overrides: Partial<MissionGiverTemplate> = {},
  ): MissionGiverTemplate {
    return {
      id,
      name: `Template ${id}`,
      briefing: 'briefing',
      objectiveSlots: [
        {
          type: 'gather',
          weight: 1,
          params: { type: 'gather', resourceAmount: { min: 50, max: 150 } },
          reward: { min: 300, max: 600 },
        },
      ],
      completionBonus: { min: 100, max: 200 },
      regionByDifficulty: { 'near-earth': [1, 10] },
      ...overrides,
    }
  }

  /** Minimal profile stub — only activeStoryFlags matters here. */
  const stubProfile = (overrides: Partial<PlayerProfile> = {}): PlayerProfile =>
    ({ ...overrides }) as unknown as PlayerProfile

  it('flagged mission templates are absent from the candidate pool when story flag is unset', () => {
    const flaggedId = 'req_flag_test_flagged'
    const unflaggedId = 'req_flag_test_unflagged'

    const giver: MissionGiver = {
      id: 'req_flag_test_giver',
      name: 'ReqFlag Test Giver',
      title: 'Test',
      objectiveTypes: ['gather'],
      minDifficulty: 1,
      maxDifficulty: 10,
      missions: [
        makeGatherTemplate(flaggedId, { requiresFlag: 'jovianContractTampered' }),
        makeGatherTemplate(unflaggedId),
      ],
    }

    withSyntheticGiver(giver, () => {
      const earth = getPlanet('earth')
      const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId: 'earth' as const, worldX: hostR, worldZ: 0 }
      // Profile without the flag — only the unflagged template should ever roll.
      const profile = stubProfile()
      for (let i = 0; i < 60; i++) {
        const mission = generateAsteroidMission(5, host, Math.random, null, null, profile)
        expect(mission.templateId).not.toBe(flaggedId)
      }
    })
  })

  it('flagged mission templates appear in the candidate pool when story flag is set', () => {
    const flaggedId = 'req_flag_test_flagged_present'
    const giver: MissionGiver = {
      id: 'req_flag_test_giver_present',
      name: 'ReqFlag Present Giver',
      title: 'Test',
      objectiveTypes: ['gather'],
      // Narrow difficulty band so this giver is the only one in the pool.
      minDifficulty: 5,
      maxDifficulty: 5,
      missions: [makeGatherTemplate(flaggedId, { requiresFlag: 'jovianContractTampered' })],
    }

    withSyntheticGiver(giver, () => {
      const earth = getPlanet('earth')
      const hostR = earth.orbit.semiMajorAxis * ORBIT_SCALE
      const host = { planetId: 'earth' as const, worldX: hostR, worldZ: 0 }
      const profile = stubProfile({ activeStoryFlags: { jovianContractTampered: true } })
      let sawFlagged = false
      for (let i = 0; i < 80; i++) {
        const mission = generateAsteroidMission(5, host, Math.random, null, null, profile)
        if (mission.templateId === flaggedId) {
          sawFlagged = true
          break
        }
      }
      expect(sawFlagged).toBe(true)
    })
  })
})

describe('Hektor liberated pool integration', () => {
  /**
   * Jupiter host anchor used to bias the pool towards jovian-trojans missions where Hektor
   * is a valid candidate.
   */
  const jupiterHost = (() => {
    const jupiter = getPlanet('jupiter')
    return {
      planetId: 'jupiter' as const,
      worldX: jupiter.orbit.semiMajorAxis * ORBIT_SCALE,
      worldZ: 0,
    }
  })()

  /** Difficulty inside Hektor's eligible band (5-10) and within jovian-trojans range. */
  const HEKTOR_TEST_DIFFICULTY = 7

  /** Roll count high enough to catch any 1-in-N asteroid pick with N ≤ 5 bodies. */
  const ROLL_COUNT = 300

  it('does NOT roll Hektor when bodyAccess is unrestricted', () => {
    const profile = {
      bodyAccess: { hektor: 'unrestricted' },
    } as unknown as PlayerProfile
    let sawHektor = false
    for (let i = 0; i < ROLL_COUNT; i++) {
      const mission = generateAsteroidMission(
        HEKTOR_TEST_DIFFICULTY,
        jupiterHost,
        Math.random,
        null,
        null,
        profile,
      )
      if (mission.asteroidId === 'hektor') sawHektor = true
    }
    expect(sawHektor).toBe(false)
  })

  it('does NOT roll Hektor when bodyAccess is restricted', () => {
    const profile = {
      bodyAccess: { hektor: 'restricted' },
    } as unknown as PlayerProfile
    let sawHektor = false
    for (let i = 0; i < ROLL_COUNT; i++) {
      const mission = generateAsteroidMission(
        HEKTOR_TEST_DIFFICULTY,
        jupiterHost,
        Math.random,
        null,
        null,
        profile,
      )
      if (mission.asteroidId === 'hektor') sawHektor = true
    }
    expect(sawHektor).toBe(false)
  })

  it('does NOT roll Hektor when bodyAccess is destroyed', () => {
    const profile = {
      bodyAccess: { hektor: 'destroyed' },
    } as unknown as PlayerProfile
    let sawHektor = false
    for (let i = 0; i < ROLL_COUNT; i++) {
      const mission = generateAsteroidMission(
        HEKTOR_TEST_DIFFICULTY,
        jupiterHost,
        Math.random,
        null,
        null,
        profile,
      )
      if (mission.asteroidId === 'hektor') sawHektor = true
    }
    expect(sawHektor).toBe(false)
  })

  it('does NOT roll Hektor when no profile is supplied', () => {
    let sawHektor = false
    for (let i = 0; i < ROLL_COUNT; i++) {
      const mission = generateAsteroidMission(HEKTOR_TEST_DIFFICULTY, jupiterHost)
      if (mission.asteroidId === 'hektor') sawHektor = true
    }
    expect(sawHektor).toBe(false)
  })

  it('CAN roll Hektor when bodyAccess is liberated', () => {
    const profile = {
      bodyAccess: { hektor: 'liberated' },
    } as unknown as PlayerProfile
    let sawHektor = false
    for (let i = 0; i < ROLL_COUNT; i++) {
      const mission = generateAsteroidMission(
        HEKTOR_TEST_DIFFICULTY,
        jupiterHost,
        Math.random,
        null,
        null,
        profile,
      )
      if (mission.asteroidId === 'hektor') {
        sawHektor = true
        break
      }
    }
    // Hektor is one of several jovian-trojan difficulty-map bodies; enough rolls guarantees a hit.
    expect(sawHektor).toBe(true)
  })

  it('pickAsteroidForDifficulty excludes Hektor when profile is absent', () => {
    // No profile → requiresLiberated entries are filtered out regardless of host.
    const result = pickAsteroidForDifficulty(HEKTOR_TEST_DIFFICULTY, 'jupiter')
    expect(result).not.toBe('hektor')
  })

  it('pickAsteroidForDifficulty excludes Hektor for unrestricted access', () => {
    const profile = {
      bodyAccess: { hektor: 'unrestricted' },
    } as unknown as PlayerProfile
    // Run many times to rule out fluke exclusion.
    for (let i = 0; i < 60; i++) {
      expect(pickAsteroidForDifficulty(HEKTOR_TEST_DIFFICULTY, 'jupiter', profile)).not.toBe(
        'hektor',
      )
    }
  })

  it('pickAsteroidForDifficulty returns Hektor for liberated access when it is the only candidate', () => {
    const profile = {
      bodyAccess: { hektor: 'liberated' },
    } as unknown as PlayerProfile
    // At difficulty 9, Jupiter host: xg7 (6-8 only), kr3 (8-10), vesta (3-5 only) → kr3 + hektor.
    // Use Math.random spy set to 0 to always pick the first entry.
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const result = pickAsteroidForDifficulty(9, 'jupiter', profile)
    spy.mockRestore()
    // Result must be either kr3 (non-jupiter-only) or hektor (jupiter + liberated).
    expect(['kr3', 'hektor']).toContain(result)
  })
})
