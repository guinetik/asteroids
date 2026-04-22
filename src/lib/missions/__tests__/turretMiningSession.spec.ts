import { describe, it, expect } from 'vitest'
import { createMissionBoard } from '../shuttleMissionSession'
import {
  offerTurretMiningMission,
  takeTurretMiningMission,
  tickTurretMiningRestock,
  recordTurretMiningProgress,
  getReadyTurretMiningMissions,
  isMainBeltOre,
  MAIN_BELT_ORE_IDS,
} from '../turretMiningSession'
import { getTurretMiningPool } from '../turretMiningPools'

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
        activeMiningMissions: [{ template: only, giverPlanet: 'pluto', minedKg: 0, status: 'active' as const }],
      }
      // Pluto's pool only contains `only`, so the offer should be a no-op.
      const next = offerTurretMiningMission(board, 'pluto')
      expect(next.offeredMiningMission).toBeNull()
    })
  })

  describe('takeTurretMiningMission', () => {
    it('moves offered to active and starts restock timer', () => {
      let board = offerTurretMiningMission(createMissionBoard(), 'mars')
      const template = board.offeredMiningMission!
      board = takeTurretMiningMission(board)
      expect(board.offeredMiningMission).toBeNull()
      expect(board.offeringMiningPlanet).toBeNull()
      expect(board.miningRestockTimer).not.toBeNull()
      expect(board.activeMiningMissions).toHaveLength(1)
      expect(board.activeMiningMissions[0]!.template).toBe(template)
      expect(board.activeMiningMissions[0]!.giverPlanet).toBe('mars')
      expect(board.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(board.activeMiningMissions[0]!.status).toBe('active')
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

  describe('recordTurretMiningProgress', () => {
    function boardWithActives() {
      const marsPool = getTurretMiningPool('mars')!
      const olivineMission = marsPool.missions.find((m) => m.oreCategory === 'olivine')!
      const anyMission = marsPool.missions.find((m) => m.oreCategory === 'any')!
      return {
        ...createMissionBoard(),
        activeMiningMissions: [
          { template: olivineMission, giverPlanet: 'mars', minedKg: 0, status: 'active' as const },
          { template: anyMission, giverPlanet: 'mars', minedKg: 0, status: 'active' as const },
        ],
      }
    }

    it('increments matching active missions on specific-ore progress', () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'olivine', 30)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(30)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(30)
    })

    it("increments any-tier mission on any main-belt ore; specific-tier ignores mismatch", () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'magnetite', 15)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(15)
    })

    it('does NOT credit any-tier for kuiper ices', () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'water-ice', 50)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(0)
    })

    it('transitions to ready-to-deliver when target reached', () => {
      const board = boardWithActives()
      const olivineTarget = board.activeMiningMissions[0]!.template.targetKg
      const next = recordTurretMiningProgress(board, 'olivine', olivineTarget)
      expect(next.activeMiningMissions[0]!.status).toBe('ready-to-deliver')
    })

    it('leaves already-ready missions untouched', () => {
      const base = boardWithActives()
      const board = {
        ...base,
        activeMiningMissions: [
          { ...base.activeMiningMissions[0]!, status: 'ready-to-deliver' as const, minedKg: 9999 },
          ...base.activeMiningMissions.slice(1),
        ],
      }
      const next = recordTurretMiningProgress(board, 'olivine', 30)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(9999)
      expect(next.activeMiningMissions[0]!.status).toBe('ready-to-deliver')
    })
  })

  describe('getReadyTurretMiningMissions', () => {
    it('returns ready missions for a specific giver', () => {
      const marsMission = getTurretMiningPool('mars')!.missions[0]!
      const jupiterMission = getTurretMiningPool('jupiter')!.missions[0]!
      const board = {
        ...createMissionBoard(),
        activeMiningMissions: [
          { template: marsMission, giverPlanet: 'mars', minedKg: 400, status: 'ready-to-deliver' as const },
          { template: jupiterMission, giverPlanet: 'jupiter', minedKg: 100, status: 'active' as const },
        ],
      }
      const ready = getReadyTurretMiningMissions(board, 'mars')
      expect(ready).toHaveLength(1)
      expect(ready[0]!.template.id).toBe(marsMission.id)
    })
  })
})
