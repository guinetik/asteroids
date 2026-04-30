import { describe, it, expect, vi } from 'vitest'
import { addItem, createInventory } from '../../inventory/inventory'
import { createMissionBoard } from '../shuttleMissionSession'
import { deliverTurretMiningMission } from '../turretMiningRewards'
import type { PlayerProfile } from '@/lib/player/types'
import type { ActiveTurretMiningMission, TurretMiningMissionTemplate } from '../types'
import { contractSystem } from '@/lib/contracts/runtime'

function profile(credits = 0): PlayerProfile {
  return {
    credits,
    upgradeLevels: {},
    stats: { missionsCompleted: 0, asteroidsVisited: [] },
  } as unknown as PlayerProfile
}

function template(
  overrides: Partial<TurretMiningMissionTemplate> = {},
): TurretMiningMissionTemplate {
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

function activeMission(
  overrides: Partial<ActiveTurretMiningMission> = {},
): ActiveTurretMiningMission {
  return {
    template: overrides.template ?? template(),
    giverPlanet: overrides.giverPlanet ?? 'mars',
  }
}

describe('deliverTurretMiningMission', () => {
  it('returns ok:false when the mission id is unknown', () => {
    const board = { ...createMissionBoard(), activeMiningMissions: [activeMission()] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMission(board, 'unknown', 'mars', inv, profile(0), 1)
    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(0)
    expect(result.board.activeMiningMissions).toHaveLength(1)
  })

  it('returns ok:false when docked at a different planet than the giver', () => {
    const mission = activeMission({ giverPlanet: 'mars' })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'jupiter',
      inv,
      profile(0),
      1,
    )
    expect(result.ok).toBe(false)
  })

  it('delivers a specific-ore mission: removes ore, awards credits, removes from board', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: 1200 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'mars',
      withOre,
      profile(100),
      1,
    )
    expect(result.ok).toBe(true)
    expect(result.creditsEarned).toBe(1200)
    expect(result.profile.credits).toBe(100 + 1200)
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')?.quantity).toBe(50)
    expect(result.board.activeMiningMissions).toHaveLength(0)
    expect(result.mission?.template.id).toBe(mission.template.id)
  })

  it('applies reward multiplier (Science Station)', () => {
    const mission = activeMission({ template: template({ reward: 1000 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'mars',
      inv,
      profile(0),
      1.5,
    )
    expect(result.creditsEarned).toBe(1500)
    expect(result.profile.credits).toBe(1500)
  })

  it('delivers an `any`-tier mission by draining main-belt stacks in catalog order', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100, reward: 800 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    let inv = createInventory()
    inv = addItem(inv, 'olivine', 40).inventory
    inv = addItem(inv, 'magnetite', 80).inventory
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'mars',
      inv,
      profile(0),
      1,
    )
    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(800)
    // 100 kg total removed: all 40 olivine + 60 magnetite (order = MAIN_BELT_ORE_IDS).
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')).toBeUndefined()
    expect(result.inventory.stacks.find((s) => s.itemId === 'magnetite')?.quantity).toBe(20)
  })

  it('refuses delivery on shortfall and leaves inputs unchanged', () => {
    const mission = activeMission({ template: template({ targetKg: 100 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 50).inventory
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'mars',
      inv,
      profile(0),
      1,
    )
    expect(result.ok).toBe(false)
    expect(result.inventory).toBe(inv) // inventory not mutated
    expect(result.board.activeMiningMissions).toHaveLength(1)
    expect(result.profile.credits).toBe(0)
  })

  it('emits MissionCompletedEvent with objectiveType: "mining" and giverPlanetId from the mission', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: 1200 }),
      giverPlanet: 'jupiter',
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    deliverTurretMiningMission(board, mission.template.id, 'jupiter', withOre, profile(0), 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.kind).toBe('mining')
    expect(callArg?.objectiveType).toBe('mining')
    expect(callArg?.giverPlanetId).toBe('jupiter')
    spy.mockRestore()
  })
})
