import { describe, it, expect } from 'vitest'
import { addItem, createInventory } from '../../inventory/inventory'
import { createMissionBoard } from '../shuttleMissionSession'
import { deliverTurretMiningMissions } from '../turretMiningRewards'
import type { PlayerProfile } from '@/lib/player/types'
import type { ActiveTurretMiningMission, TurretMiningMissionTemplate } from '../types'

function profile(credits = 0): PlayerProfile {
  return {
    credits,
    upgradeLevels: {},
    stats: { missionsCompleted: 0, asteroidsVisited: [] },
  } as unknown as PlayerProfile
}

function template(overrides: Partial<TurretMiningMissionTemplate> = {}): TurretMiningMissionTemplate {
  return {
    id: overrides.id ?? 'test_mission',
    name: overrides.name ?? 'Test Mission',
    description: overrides.description ?? 'Test',
    difficulty: overrides.difficulty ?? 'medium',
    oreCategory: overrides.oreCategory ?? 'olivine',
    targetKg: overrides.targetKg ?? 200,
    reward: overrides.reward ?? 1000,
  }
}

function activeMission(overrides: Partial<ActiveTurretMiningMission> = {}): ActiveTurretMiningMission {
  return {
    template: overrides.template ?? template(),
    giverPlanet: overrides.giverPlanet ?? 'mars',
  }
}

describe('deliverTurretMiningMissions', () => {
  it('is a no-op when inventory cannot cover the mission at this planet', () => {
    const board = { ...createMissionBoard(), activeMiningMissions: [activeMission()] }
    const inv = createInventory()
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
  })

  it('delivers a specific-ore mission: removes ore, awards credits, removes from board', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: 1200 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const result = deliverTurretMiningMissions(board, 'mars', withOre, profile(100), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.profile.credits).toBe(100 + 1200)
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')?.quantity).toBe(50)
    expect(result.board.activeMiningMissions).toHaveLength(0)
  })

  it('applies reward multiplier (Science Station)', () => {
    const mission = activeMission({ template: template({ reward: 1000 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1.5)
    expect(result.profile.credits).toBe(1500)
  })

  it('delivers an `any`-tier mission by draining main-belt stacks in order', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100, reward: 800 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    let inv = createInventory()
    inv = addItem(inv, 'olivine', 40).inventory
    inv = addItem(inv, 'magnetite', 80).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.profile.credits).toBe(800)
    // 100 kg total removed: all 40 olivine + 60 magnetite (order = MAIN_BELT_ORE_IDS).
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')).toBeUndefined()
    expect(result.inventory.stacks.find((s) => s.itemId === 'magnetite')?.quantity).toBe(20)
  })

  it('refuses delivery when inventory cannot cover targetKg (specific-ore shortfall)', () => {
    const mission = activeMission({ template: template({ targetKg: 100 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 50).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
    expect(result.inventory).toBe(inv) // inventory not mutated
    expect(result.board.activeMiningMissions).toHaveLength(1)
  })

  it('refuses any-tier delivery when main-belt stacks fall short', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 80).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
  })

  it('delivers multiple ready missions at the same planet in one call', () => {
    const m1 = activeMission({
      template: template({ id: 'a', oreCategory: 'olivine', targetKg: 50, reward: 500 }),
    })
    const m2 = activeMission({
      template: template({ id: 'b', oreCategory: 'magnetite', targetKg: 40, reward: 400 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [m1, m2] }
    let inv = createInventory()
    inv = addItem(inv, 'olivine', 100).inventory
    inv = addItem(inv, 'magnetite', 100).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(2)
    expect(result.profile.credits).toBe(900)
    expect(result.board.activeMiningMissions).toHaveLength(0)
  })

  it('skips missions for other planets', () => {
    const marsMission = activeMission({ giverPlanet: 'mars' })
    const jupiterMission = activeMission({
      giverPlanet: 'jupiter',
      template: template({ id: 'j1' }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [marsMission, jupiterMission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.board.activeMiningMissions).toHaveLength(1)
    expect(result.board.activeMiningMissions[0]!.giverPlanet).toBe('jupiter')
  })
})
