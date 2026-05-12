import { describe, expect, it } from 'vitest'
import { getEvaMissionPool } from '../evaMissionPools'
import { getMissionPool } from '../shuttleMissionPools'
import { getTurretMiningPool } from '../turretMiningPools'

const HANDLER_POOL_MINIMUM_MISSIONS = 3
const HANDLER_POOL_MINIMUM_EVA_TYPES = 2

const handlerWorlds = [
  {
    planetId: 'jupiter',
    shuttleGiver: 'Vance Holroyd, Senior Asset Officer',
    evaGiver: 'Vance Holroyd, Senior Asset Officer',
    miningGiverId: 'jovian-society',
  },
  {
    planetId: 'uranus',
    shuttleGiver: 'Yamada Farms',
    evaGiver: 'Yamada Farms',
    miningGiverId: 'yamada-farms',
  },
  {
    planetId: 'ceres',
    shuttleGiver: 'Dean Bernard Porter',
    evaGiver: 'Dean Bernard Porter',
    miningGiverId: 'ceres-institute',
  },
]

describe('handler mission pools', () => {
  it('gives handler worlds enough shuttle atmospheric variety to stand alone', () => {
    for (const world of handlerWorlds) {
      const pool = getMissionPool(world.planetId)

      expect(pool?.giverName).toBe(world.shuttleGiver)
      expect(pool?.missions.length).toBeGreaterThanOrEqual(HANDLER_POOL_MINIMUM_MISSIONS)
      expect(new Set(pool?.missions.map((mission) => mission.targetPlanet)).size).toBeGreaterThanOrEqual(
        HANDLER_POOL_MINIMUM_MISSIONS,
      )
    }
  })

  it('gives handler worlds enough EVA variety to stand alone', () => {
    for (const world of handlerWorlds) {
      const pool = getEvaMissionPool(world.planetId)
      const minigameTypes = new Set(pool?.missions.map((mission) => mission.minigameType))

      expect(pool?.giverName).toBe(world.evaGiver)
      expect(pool?.missions.length).toBeGreaterThanOrEqual(HANDLER_POOL_MINIMUM_MISSIONS)
      expect(minigameTypes.size).toBeGreaterThanOrEqual(HANDLER_POOL_MINIMUM_EVA_TYPES)
    }
  })

  it('gives handler worlds easy, medium, and hard mining missions from their handler', () => {
    for (const world of handlerWorlds) {
      const pool = getTurretMiningPool(world.planetId)
      const difficulties = pool?.missions.map((mission) => mission.difficulty).sort()

      expect(pool?.giverId).toBe(world.miningGiverId)
      expect(pool?.missions.length).toBeGreaterThanOrEqual(HANDLER_POOL_MINIMUM_MISSIONS)
      expect(difficulties).toEqual(['easy', 'hard', 'medium'])
    }
  })
})
