import { describe, it, expect, vi } from 'vitest'
import { addItem, createInventory } from '../../inventory/inventory'
import { createMissionBoard } from '../shuttleMissionSession'
import { deliverTurretMiningMission } from '../turretMiningRewards'
import { GLOBAL_MISSION_PAY_MULTIPLIER } from '../missionEconomy'
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

function scaledOfferReward(baseCredits: number): number {
  return Math.round(baseCredits * GLOBAL_MISSION_PAY_MULTIPLIER)
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
    reward: overrides.reward ?? scaledOfferReward(1000),
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
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: scaledOfferReward(1200) }),
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
    expect(result.creditsEarned).toBe(scaledOfferReward(1200))
    expect(result.profile.credits).toBe(100 + scaledOfferReward(1200))
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')?.quantity).toBe(50)
    expect(result.board.activeMiningMissions).toHaveLength(0)
    expect(result.mission?.template.id).toBe(mission.template.id)
  })

  it('applies reward multiplier (Science Station)', () => {
    const mission = activeMission({ template: template({ reward: scaledOfferReward(1000) }) })
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
    expect(result.creditsEarned).toBe(Math.round(scaledOfferReward(1000) * 1.5))
    expect(result.profile.credits).toBe(Math.round(scaledOfferReward(1000) * 1.5))
  })

  it('delivers an `any`-tier mission by draining main-belt stacks in catalog order', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100, reward: scaledOfferReward(800) }),
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
    expect(result.profile.credits).toBe(scaledOfferReward(800))
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

  it('returns a mining contract event without notifying contracts synchronously', () => {
    const mission = activeMission({
      template: template({
        oreCategory: 'olivine',
        targetKg: 150,
        reward: scaledOfferReward(1200),
      }),
      giverPlanet: 'jupiter',
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    const result = deliverTurretMiningMission(
      board,
      mission.template.id,
      'jupiter',
      withOre,
      profile(0),
      1,
    )

    expect(result).toMatchObject({
      contractEvent: {
        kind: 'mining',
        objectiveType: 'mining',
        giverPlanetId: 'jupiter',
      },
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
