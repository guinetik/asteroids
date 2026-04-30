import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { persistCompletedAsteroidMissionRewards } from '../asteroidMissionRewards'
import { createMissionBoard } from '../shuttleMissionSession'
import {
  ACTIVE_MISSION_KEY,
  MISSION_BOARD_KEY,
  PENDING_MAP_RETURN_WORLD_KEY,
} from '../missionStorage'
import { PROFILE_STORAGE_KEY, loadProfile, createProfile, saveProfile } from '@/lib/player/profile'
import { loadInventory } from '@/lib/inventory/inventoryStorage'
import type { GeneratedAsteroidMission } from '../types'
import { contractSystem } from '@/lib/contracts/runtime'

const BASE_MISSION: GeneratedAsteroidMission = {
  kind: 'standard',
  id: 'test-mission-1',
  asteroidId: 'bennu',
  giverId: 'jay',
  giverName: 'Jay',
  templateId: 't1',
  name: 'Test',
  briefing: '',
  difficulty: 1,
  region: 'near-earth',
  objectives: [],
  totalReward: 500,
  waypoint: { worldX: 0, worldZ: 0 },
  status: 'in-transit',
}

describe('persistCompletedAsteroidMissionRewards', () => {
  beforeEach(() => {
    localStorage.clear()
    const profile = createProfile('Test')
    saveProfile({ ...profile, credits: 1000 })
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(BASE_MISSION))
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('adds CR, increments stats, and clears active mission storage', () => {
    persistCompletedAsteroidMissionRewards(BASE_MISSION, 1)

    const updated = loadProfile()
    expect(updated!.credits).toBe(1500)
    expect(updated!.completedMissionCount).toBe(1)
    expect(updated!.visitedAsteroids['bennu']).toBe(1)
    expect(localStorage.getItem(ACTIVE_MISSION_KEY)).toBeNull()
    expect(localStorage.getItem(PENDING_MAP_RETURN_WORLD_KEY)).toBe(
      JSON.stringify({ worldX: 0, worldZ: 0 }),
    )
  })

  it('applies reward multiplier', () => {
    persistCompletedAsteroidMissionRewards(BASE_MISSION, 1.5)

    const updated = loadProfile()
    expect(updated!.credits).toBe(1000 + Math.round(500 * 1.5))
  })

  it('still clears active mission when profile is missing', () => {
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    persistCompletedAsteroidMissionRewards(BASE_MISSION, 1)
    expect(localStorage.getItem(ACTIVE_MISSION_KEY)).toBeNull()
  })

  it('clears full mission board when active slot is already null (matches completed mission id)', () => {
    const board = createMissionBoard()
    localStorage.setItem(MISSION_BOARD_KEY, JSON.stringify({ board, savedAt: Date.now() }))
    persistCompletedAsteroidMissionRewards(BASE_MISSION, 1)
    const raw = localStorage.getItem(MISSION_BOARD_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { board: { activeAsteroidMission: unknown } }
    expect(parsed.board.activeAsteroidMission).toBeNull()
  })

  describe('partial-credit reward interpolation', () => {
    it('pays each objective its full rolled reward when actualReward is unset', () => {
      const mission: GeneratedAsteroidMission = {
        ...BASE_MISSION,
        objectives: [
          { type: 'gather', x: 0, z: 0, resourceAmount: 100, reward: 1200 },
          { type: 'survey', x: 0, z: 0, probeCount: 5, timeLimit: 90, reward: 800 },
        ],
        totalReward: 2200, // 1200 + 800 + 200 completion bonus
      }

      persistCompletedAsteroidMissionRewards(mission, 1)

      // 1000 starting + 2200 (full objectives + bonus) = 3200
      expect(loadProfile()!.credits).toBe(3200)
    })

    it('substitutes actualReward and preserves the completion bonus', () => {
      const mission: GeneratedAsteroidMission = {
        ...BASE_MISSION,
        objectives: [
          {
            type: 'dan',
            x: 0,
            z: 0,
            scanDurationSeconds: 45,
            requiredParticleHits: 50,
            enemyGraceSeconds: 9,
            particleTier: 'medium',
            enemyTier: 'medium',
            reward: 6000,
            rewardMin: 1500,
            actualReward: 1500,
          },
        ],
        totalReward: 7000, // 6000 rolled + 1000 completion bonus
      }

      persistCompletedAsteroidMissionRewards(mission, 1)

      // 1000 starting + (1500 actual + 1000 bonus) = 3500
      expect(loadProfile()!.credits).toBe(3500)
    })

    it('pays the same as binary when actualReward equals the rolled reward', () => {
      const mission: GeneratedAsteroidMission = {
        ...BASE_MISSION,
        objectives: [
          {
            type: 'dan',
            x: 0,
            z: 0,
            scanDurationSeconds: 45,
            requiredParticleHits: 50,
            enemyGraceSeconds: 9,
            particleTier: 'medium',
            enemyTier: 'medium',
            reward: 6000,
            rewardMin: 1500,
            actualReward: 6000,
          },
        ],
        totalReward: 7000,
      }

      persistCompletedAsteroidMissionRewards(mission, 1)

      // 1000 starting + (6000 actual + 1000 bonus) = 8000 — same as the binary path
      expect(loadProfile()!.credits).toBe(8000)
    })

    it('sums multiple objectives with mixed quality and applies the multiplier', () => {
      const mission: GeneratedAsteroidMission = {
        ...BASE_MISSION,
        objectives: [
          { type: 'gather', x: 0, z: 0, resourceAmount: 100, reward: 1000 },
          {
            type: 'dan',
            x: 0,
            z: 0,
            scanDurationSeconds: 45,
            requiredParticleHits: 50,
            enemyGraceSeconds: 9,
            particleTier: 'medium',
            enemyTier: 'medium',
            reward: 4000,
            rewardMin: 1000,
            actualReward: 3000, // 50% above floor → mid-quality
          },
        ],
        totalReward: 5500, // 1000 + 4000 + 500 completion bonus
      }

      persistCompletedAsteroidMissionRewards(mission, 2)

      // earned = 1000 + 3000 = 4000, plus 500 bonus, ×2 = 9000. Starting 1000 → 10000.
      expect(loadProfile()!.credits).toBe(10000)
    })
  })

  it('adds collect rewards to shuttle inventory', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      kind: 'special',
      objectives: [
        {
          type: 'collect',
          x: 0,
          z: 0,
          collectItemId: 'grid-coupling-module',
          collectItemLabel: 'Grid Coupling Module',
          reward: 0,
        },
      ],
    }

    persistCompletedAsteroidMissionRewards(mission, 1)

    expect(loadInventory()).toEqual({
      maxSlots: 8,
      maxWeightKg: 500,
      stacks: [
        {
          itemId: 'grid-coupling-module',
          quantity: 1,
          totalWeightKg: 12,
        },
      ],
    })
  })

  it('emits MissionCompletedEvent with objectiveType drawn from the primary objective slot', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'objtype-test',
      objectives: [
        {
          type: 'photometry',
          x: 0,
          z: 0,
          reward: 500,
        },
      ],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.objectiveType).toBe('photometry')
    spy.mockRestore()
  })

  it('emits objectiveType: "" when objectives array is empty', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'objtype-empty',
      objectives: [],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.objectiveType).toBe('')
    spy.mockRestore()
  })

  it('emits specialMissionId and pinnedAssetRef when a special Hektor mission completes', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      kind: 'special',
      id: 'jovian-prospection-hektor-photometry',
      asteroidId: 'hektor',
      region: 'jovian-trojans',
      objectives: [{ type: 'photometry', x: 0, z: 0 }],
    } as GeneratedAsteroidMission
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBe('jovian-prospection-hektor-photometry')
    expect(callArg?.pinnedAssetRef).toBe('hektor')
    expect(callArg?.region).toBe('jovian-trojans')
    spy.mockRestore()
  })

  it('emits specialMissionId without pinnedAssetRef for a non-pinned special mission', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      kind: 'special',
      id: 'jovian-prospection-saturn-photometry',
      asteroidId: 'asset-2306-s',
      region: 'saturn-trojans',
      objectives: [{ type: 'photometry', x: 0, z: 0 }],
    } as GeneratedAsteroidMission
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBe('jovian-prospection-saturn-photometry')
    expect(callArg?.pinnedAssetRef).toBeUndefined()
    expect(callArg?.region).toBe('saturn-trojans')
    spy.mockRestore()
  })

  it('emits region but no specialMissionId for non-special asteroid missions', () => {
    const mission: GeneratedAsteroidMission = {
      ...BASE_MISSION,
      id: 'standard-mission-1',
      region: 'near-earth',
      objectives: [{ type: 'gather', x: 0, z: 0, reward: 500 }],
    }
    localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
    const spy = vi.spyOn(contractSystem, 'notifyMissionCompleted')
    persistCompletedAsteroidMissionRewards(mission, 1)
    const callArg = spy.mock.calls[0]?.[0]
    expect(callArg?.specialMissionId).toBeUndefined()
    expect(callArg?.pinnedAssetRef).toBeUndefined()
    expect(callArg?.region).toBe('near-earth')
    spy.mockRestore()
  })
})
