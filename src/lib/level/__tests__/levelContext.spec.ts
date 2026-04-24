import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import {
  generateMissionWithType,
  hashLevelSeed,
  resolveLevelContext,
  rotationFromSeed,
} from '../levelContext'

const { asteroidFallback, specialMission, storedMission } = vi.hoisted(() => ({
  asteroidFallback: { id: 'fallback-asteroid', name: 'Fallback Rock' },
  specialMission: {
    id: 'special-mission',
    asteroidId: 'special-asteroid',
    objectives: [{ type: 'survey', x: 0, z: 0 }],
  },
  storedMission: {
    id: 'stored-mission',
    asteroidId: 'stored-asteroid',
    objectives: [{ type: 'gather', x: 1, z: 2 }],
  },
}))

vi.mock('@/lib/asteroids/catalog', () => ({
  ASTEROID_CATALOG: [asteroidFallback],
  getAsteroidById: vi.fn((id: string) => (id === asteroidFallback.id ? asteroidFallback : null)),
}))

vi.mock('@/lib/level/levelRouteAccess', () => ({
  hasLevelRouteQueryOverrideFromSearchParams: vi.fn(
    (params: URLSearchParams) => params.has('difficulty') || params.has('mission'),
  ),
}))

vi.mock('@/lib/missions/asteroidMissionGenerator', () => ({
  generateAsteroidMission: vi.fn((difficulty: number) => ({
    id: `generated-${difficulty}`,
    asteroidId: `generated-asteroid-${difficulty}`,
    objectives: [{ type: 'collect', x: 0, z: 0 }],
  })),
}))

vi.mock('@/lib/missions/specialMissions', () => ({
  getSpecialMissionById: vi.fn((id: string) => (id === 'special-id' ? specialMission : undefined)),
}))

vi.mock('@/lib/missions/missionStorage', () => ({
  loadActiveMission: vi.fn(() => storedMission),
}))

describe('levelContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hashLevelSeed is deterministic and non-negative', () => {
    expect(hashLevelSeed('mission-a')).toBe(hashLevelSeed('mission-a'))
    expect(hashLevelSeed('mission-a')).toBeGreaterThanOrEqual(0)
  })

  it('rotationFromSeed is deterministic', () => {
    expect(rotationFromSeed(42)).toEqual(rotationFromSeed(42))
  })

  it('generateMissionWithType retries until a matching objective appears', async () => {
    const { generateAsteroidMission } = await import('@/lib/missions/asteroidMissionGenerator')
    vi.mocked(generateAsteroidMission)
      .mockReturnValueOnce({
        id: 'first',
        asteroidId: 'asteroid-1',
        objectives: [{ type: 'gather', x: 0, z: 0 }],
      } as GeneratedAsteroidMission)
      .mockReturnValueOnce({
        id: 'second',
        asteroidId: 'asteroid-2',
        objectives: [{ type: 'survey', x: 0, z: 0 }],
      } as GeneratedAsteroidMission)

    const mission = generateMissionWithType(4, 'survey')

    expect(mission.id).toBe('second')
    expect(generateAsteroidMission).toHaveBeenCalledTimes(2)
  })

  it('prefers special missions and persists completion rewards', () => {
    const context = resolveLevelContext('?mission=special-id')

    expect(context.mission).toEqual(specialMission)
    expect(context.persistCompletionRewards).toBe(true)
  })

  it('uses stored missions when there are no query overrides', () => {
    const context = resolveLevelContext('')

    expect(context.mission).toEqual(storedMission)
    expect(context.persistCompletionRewards).toBe(true)
  })

  it('supports ad-hoc asteroid overrides without persistence rewards', () => {
    const context = resolveLevelContext('?asteroidId=adhoc-rock&difficulty=7')

    expect(context.mission.asteroidId).toBe('adhoc-rock')
    expect(context.persistCompletionRewards).toBe(false)
  })
})
