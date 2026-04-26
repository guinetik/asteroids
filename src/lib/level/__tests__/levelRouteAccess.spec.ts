import { describe, it, expect, beforeEach } from 'vitest'
import type { LocationQuery } from 'vue-router'
import {
  hasLevelRouteQueryOverrideFromSearchParams,
  hasLevelRouteQueryOverride,
  canAccessLevelRoute,
} from '../levelRouteAccess'
import {
  saveProfile,
  createProfile,
  PROFILE_STORAGE_KEY,
} from '@/lib/player/profile'
import {
  saveActiveMission,
  ACTIVE_MISSION_KEY,
  clearActiveMission,
} from '@/lib/missions/missionStorage'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'

const mockStorage: Record<string, string> = {}

beforeEach(() => {
  for (const key of Object.keys(mockStorage)) {
    delete mockStorage[key]
  }
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
    },
    writable: true,
  })
})

const MOCK_MISSION: GeneratedAsteroidMission = {
  kind: 'standard',
  id: 'test_mission_123',
  asteroidId: 'bennu',
  giverId: 'jay',
  giverName: 'Jay Mercer',
  templateId: 'jay_mineral_survey',
  name: 'Mineral Survey',
  briefing: 'Test briefing',
  difficulty: 3,
  region: 'near-earth',
  objectives: [{ type: 'gather', resourceAmount: 75, reward: 450, x: 0, z: 0 }],
  totalReward: 550,
  waypoint: { worldX: 100, worldZ: 50 },
  status: 'accepted',
}

function q(obj: Record<string, string>): LocationQuery {
  const out: LocationQuery = {}
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v
  }
  return out
}

describe('hasLevelRouteQueryOverrideFromSearchParams', () => {
  it('is true when asteroidId is set', () => {
    const p = new URLSearchParams('asteroidId=bennu')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(true)
  })

  it('is true when difficulty and mission type are both valid', () => {
    const p = new URLSearchParams('difficulty=5&mission=survey')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(true)
  })

  it('is true for photometry mission dev overrides', () => {
    const p = new URLSearchParams('difficulty=5&mission=photometry')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(true)
  })

  it('is true when mission is a known special mission id', () => {
    const p = new URLSearchParams('mission=consortium-certification')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(true)
  })

  it('is false when only difficulty is set', () => {
    const p = new URLSearchParams('difficulty=5')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(false)
  })

  it('is false when only mission is set', () => {
    const p = new URLSearchParams('mission=gather')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(false)
  })

  it('is false for non-integer difficulty', () => {
    const p = new URLSearchParams('difficulty=3.5&mission=gather')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(false)
  })

  it('is false for unknown mission type', () => {
    const p = new URLSearchParams('difficulty=5&mission=invalid')
    expect(hasLevelRouteQueryOverrideFromSearchParams(p)).toBe(false)
  })
})

describe('canAccessLevelRoute', () => {
  it('allows access with override query only', () => {
    expect(canAccessLevelRoute(q({ difficulty: '5', mission: 'rescue' }))).toBe(true)
    expect(canAccessLevelRoute(q({ asteroidId: 'bennu' }))).toBe(true)
    expect(canAccessLevelRoute(q({ mission: 'consortium-certification' }))).toBe(true)
  })

  it('denies without storage or override', () => {
    expect(canAccessLevelRoute(q({}))).toBe(false)
  })

  it('allows when profile and mission exist', () => {
    saveProfile(createProfile('Test'))
    saveActiveMission(MOCK_MISSION)
    expect(canAccessLevelRoute(q({}))).toBe(true)
  })

  it('denies when only profile exists', () => {
    saveProfile(createProfile('Test'))
    clearActiveMission()
    expect(mockStorage[ACTIVE_MISSION_KEY]).toBeUndefined()
    expect(canAccessLevelRoute(q({}))).toBe(false)
  })

  it('denies when only mission exists', () => {
    localStorage.removeItem(PROFILE_STORAGE_KEY)
    saveActiveMission(MOCK_MISSION)
    expect(canAccessLevelRoute(q({}))).toBe(false)
  })
})

describe('hasLevelRouteQueryOverride', () => {
  it('matches search params helper for route query', () => {
    const query = q({ difficulty: '7', mission: 'exterminate' })
    const params = new URLSearchParams('difficulty=7&mission=exterminate')
    expect(hasLevelRouteQueryOverride(query)).toBe(
      hasLevelRouteQueryOverrideFromSearchParams(params),
    )
  })
})
