import { describe, it, expect } from 'vitest'
import { addItem, createInventory } from '../../inventory/inventory'
import { createMissionBoard } from '../shuttleMissionSession'
import {
  offerTurretMiningMission,
  takeTurretMiningMission,
  tickTurretMiningRestock,
  computeMiningProgressKg,
  isMiningMissionReady,
  isMainBeltOre,
  matchesMiningOreCategory,
  MAIN_BELT_ORE_IDS,
} from '../turretMiningSession'
import { getTurretMiningPool } from '../turretMiningPools'
import type { ActiveTurretMiningMission, TurretMiningMissionTemplate } from '../types'

function template(
  overrides: Partial<TurretMiningMissionTemplate> = {},
): TurretMiningMissionTemplate {
  return {
    id: overrides.id ?? 'test',
    name: overrides.name ?? 'Test',
    description: overrides.description ?? '',
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

describe('turretMiningSession', () => {
  describe('MAIN_BELT_ORE_IDS', () => {
    it('contains the expected main-belt ores and excludes kuiper ices', () => {
      expect(MAIN_BELT_ORE_IDS).toContain('olivine')
      expect(MAIN_BELT_ORE_IDS).toContain('magnetite')
      expect(MAIN_BELT_ORE_IDS).toContain('pyroxene')
      expect(MAIN_BELT_ORE_IDS).toContain('iron-nickel-alloy')
      expect(MAIN_BELT_ORE_IDS).not.toContain('water-ice')
      expect(MAIN_BELT_ORE_IDS).not.toContain('carbon-dioxide-ice')
    })

    it('isMainBeltOre returns true only for main-belt entries', () => {
      expect(isMainBeltOre('olivine')).toBe(true)
      expect(isMainBeltOre('magnetite')).toBe(true)
      expect(isMainBeltOre('iron-nickel-alloy')).toBe(true)
      expect(isMainBeltOre('water-ice')).toBe(false)
      expect(isMainBeltOre('fuel-cell')).toBe(false)
    })

    it('matchesMiningOreCategory matches specific ids and main-belt for any', () => {
      expect(matchesMiningOreCategory('olivine', 'olivine')).toBe(true)
      expect(matchesMiningOreCategory('olivine', 'magnetite')).toBe(false)
      expect(matchesMiningOreCategory('any', 'magnetite')).toBe(true)
      expect(matchesMiningOreCategory('any', 'water-ice')).toBe(false)
    })
  })

  describe('offerTurretMiningMission', () => {
    it('offers a mission for a giver planet', () => {
      const board = createMissionBoard()
      const next = offerTurretMiningMission(board, 'mars')
      expect(next.offeredMiningMission).not.toBeNull()
      expect(next.offeringMiningPlanet).toBe('mars')
    })

    it('is a no-op while restock timer is running', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 60, total: 120 } }
      const next = offerTurretMiningMission(board, 'mars')
      expect(next.offeredMiningMission).toBeNull()
      expect(next.offeringMiningPlanet).toBeNull()
    })

    it('is a no-op for planets without a mining pool', () => {
      const board = createMissionBoard()
      const next = offerTurretMiningMission(board, 'earth')
      expect(next.offeredMiningMission).toBeNull()
    })

    it('does not re-offer the same template that is currently active', () => {
      const pool = getTurretMiningPool('pluto')!
      const only = pool.missions[0]!
      const board = {
        ...createMissionBoard(),
        activeMiningMissions: [{ template: only, giverPlanet: 'pluto' }],
      }
      const next = offerTurretMiningMission(board, 'pluto')
      expect(next.offeredMiningMission).toBeNull()
    })
  })

  describe('takeTurretMiningMission', () => {
    it('moves offered to active and starts restock timer', () => {
      let board = offerTurretMiningMission(createMissionBoard(), 'mars')
      const tmpl = board.offeredMiningMission!
      board = takeTurretMiningMission(board)
      expect(board.offeredMiningMission).toBeNull()
      expect(board.offeringMiningPlanet).toBeNull()
      expect(board.miningRestockTimer).not.toBeNull()
      expect(board.activeMiningMissions).toHaveLength(1)
      expect(board.activeMiningMissions[0]!.template).toBe(tmpl)
      expect(board.activeMiningMissions[0]!.giverPlanet).toBe('mars')
    })

    it('is a no-op when nothing is offered', () => {
      const board = createMissionBoard()
      const next = takeTurretMiningMission(board)
      expect(next).toBe(board)
    })
  })

  describe('tickTurretMiningRestock', () => {
    it('decrements remaining', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 60, total: 120 } }
      const next = tickTurretMiningRestock(board, 10)
      expect(next.miningRestockTimer?.remaining).toBe(50)
    })

    it('clears the timer when it expires', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 5, total: 120 } }
      const next = tickTurretMiningRestock(board, 10)
      expect(next.miningRestockTimer).toBeNull()
    })

    it('is a no-op when no timer is running', () => {
      const board = createMissionBoard()
      const next = tickTurretMiningRestock(board, 10)
      expect(next).toBe(board)
    })
  })

  describe('computeMiningProgressKg', () => {
    it('returns the stack quantity for a specific-ore mission', () => {
      const inv = addItem(createInventory(), 'olivine', 175).inventory
      const m = activeMission({ template: template({ oreCategory: 'olivine', targetKg: 200 }) })
      expect(computeMiningProgressKg(inv, m)).toBe(175)
    })

    it('sums all main-belt ores for an `any` mission', () => {
      let inv = createInventory()
      inv = addItem(inv, 'olivine', 50).inventory
      inv = addItem(inv, 'magnetite', 80).inventory
      inv = addItem(inv, 'iron-nickel-alloy', 20).inventory
      const m = activeMission({ template: template({ oreCategory: 'any', targetKg: 200 }) })
      expect(computeMiningProgressKg(inv, m)).toBe(150)
    })

    it('does not count kuiper ices for an `any` mission', () => {
      let inv = createInventory()
      inv = addItem(inv, 'water-ice', 500).inventory
      const m = activeMission({ template: template({ oreCategory: 'any', targetKg: 200 }) })
      expect(computeMiningProgressKg(inv, m)).toBe(0)
    })

    it('returns 0 when the requested ore is absent', () => {
      const inv = createInventory()
      const m = activeMission({
        template: template({ oreCategory: 'iron-nickel-alloy', targetKg: 200 }),
      })
      expect(computeMiningProgressKg(inv, m)).toBe(0)
    })
  })

  describe('isMiningMissionReady', () => {
    it('is true when cargo meets the target exactly', () => {
      const inv = addItem(createInventory(), 'olivine', 200).inventory
      const m = activeMission({ template: template({ oreCategory: 'olivine', targetKg: 200 }) })
      expect(isMiningMissionReady(inv, m)).toBe(true)
    })

    it('is true when cargo exceeds the target', () => {
      const inv = addItem(createInventory(), 'olivine', 500).inventory
      const m = activeMission({ template: template({ oreCategory: 'olivine', targetKg: 200 }) })
      expect(isMiningMissionReady(inv, m)).toBe(true)
    })

    it('is false when cargo falls short', () => {
      const inv = addItem(createInventory(), 'olivine', 199).inventory
      const m = activeMission({ template: template({ oreCategory: 'olivine', targetKg: 200 }) })
      expect(isMiningMissionReady(inv, m)).toBe(false)
    })
  })
})
