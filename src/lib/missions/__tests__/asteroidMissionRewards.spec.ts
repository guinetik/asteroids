import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { persistCompletedAsteroidMissionRewards } from '../asteroidMissionRewards'
import { ACTIVE_MISSION_KEY, PENDING_MAP_RETURN_WORLD_KEY } from '../missionStorage'
import { PROFILE_STORAGE_KEY, loadProfile, createProfile, saveProfile } from '@/lib/player/profile'
import { loadInventory } from '@/lib/inventory/inventoryStorage'
import type { GeneratedAsteroidMission } from '../types'

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
})
