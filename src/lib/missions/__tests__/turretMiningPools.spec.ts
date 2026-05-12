import { describe, it, expect } from 'vitest'
import { getTurretMiningPool, TURRET_MINING_POOLS } from '../turretMiningPools'

describe('turretMiningPools', () => {
  it('exposes pools for all five giver planets', () => {
    const planetIds = TURRET_MINING_POOLS.map((p) => p.planetId).sort()
    expect(planetIds).toEqual(['ceres', 'jupiter', 'mars', 'neptune', 'pluto', 'uranus'])
  })

  it('returns the Mars pool with three missions', () => {
    const pool = getTurretMiningPool('mars')
    expect(pool).toBeDefined()
    expect(pool?.giverName).toBe('Martian Marines Corps')
    expect(pool?.missions).toHaveLength(3)
    const difficulties = pool!.missions.map((m) => m.difficulty).sort()
    expect(difficulties).toEqual(['easy', 'hard', 'medium'])
  })

  it('returns undefined for planets without a mining pool', () => {
    expect(getTurretMiningPool('earth')).toBeUndefined()
    expect(getTurretMiningPool('saturn')).toBeUndefined()
  })

  it('USC planets use the same giver name', () => {
    const names = ['neptune', 'pluto'].map((id) => getTurretMiningPool(id)?.giverName)
    expect(names).toEqual(['United Space Consortium', 'United Space Consortium'])
  })

  it('every mission uses an ore category from the MiningOreCategory union', () => {
    const valid = new Set(['any', 'olivine', 'magnetite', 'iron-nickel-alloy', 'water-ice'])
    for (const pool of TURRET_MINING_POOLS) {
      for (const mission of pool.missions) {
        expect(valid.has(mission.oreCategory)).toBe(true)
      }
    }
  })
})
