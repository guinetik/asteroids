import { describe, it, expect, beforeEach } from 'vitest'
import {
  createProfile,
  saveProfile,
  loadProfile,
  addCredits,
  spendCredits,
  recordMissionComplete,
  recordAsteroidVisit,
  PROFILE_STORAGE_KEY,
} from '../profile'

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

describe('createProfile', () => {
  it('creates a profile with the given name and zero values', () => {
    const profile = createProfile('Trucker Joe')

    expect(profile.name).toBe('Trucker Joe')
    expect(profile.credits).toBe(0)
    expect(profile.completedMissionCount).toBe(0)
    expect(profile.visitedAsteroids).toEqual({})
  })

  it('preserves the name exactly as given', () => {
    const profile = createProfile('  SpaceCat_42  ')
    expect(profile.name).toBe('  SpaceCat_42  ')
  })
})

describe('saveProfile / loadProfile', () => {
  it('round-trips a profile through localStorage', () => {
    const profile = createProfile('Trucker Joe')
    saveProfile(profile)
    const loaded = loadProfile()

    expect(loaded).toEqual(profile)
  })

  it('returns null when localStorage is empty', () => {
    expect(loadProfile()).toBeNull()
  })

  it('returns null when localStorage contains invalid JSON', () => {
    mockStorage[PROFILE_STORAGE_KEY] = 'not valid json {'
    expect(loadProfile()).toBeNull()
  })

  it('persists complex profile state', () => {
    const profile = createProfile('Trucker Joe')
    const updated = addCredits(
      recordAsteroidVisit(
        recordMissionComplete(profile),
        'bennu',
      ),
      500,
    )
    saveProfile(updated)
    const loaded = loadProfile()

    expect(loaded).toEqual(updated)
    expect(loaded!.credits).toBe(500)
    expect(loaded!.completedMissionCount).toBe(1)
    expect(loaded!.visitedAsteroids).toEqual({ bennu: 1 })
  })
})

describe('addCredits', () => {
  it('adds credits to profile', () => {
    const profile = createProfile('Joe')
    const updated = addCredits(profile, 1000)

    expect(updated.credits).toBe(1000)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    addCredits(profile, 1000)

    expect(profile.credits).toBe(0)
  })
})

describe('spendCredits', () => {
  it('deducts credits when sufficient balance', () => {
    const profile = addCredits(createProfile('Joe'), 1000)
    const updated = spendCredits(profile, 300)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(700)
  })

  it('returns null when insufficient credits', () => {
    const profile = addCredits(createProfile('Joe'), 100)
    const updated = spendCredits(profile, 200)

    expect(updated).toBeNull()
  })

  it('succeeds with exact balance (0 remaining)', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const updated = spendCredits(profile, 500)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(0)
  })

  it('does not mutate the original profile', () => {
    const profile = addCredits(createProfile('Joe'), 1000)
    spendCredits(profile, 300)

    expect(profile.credits).toBe(1000)
  })
})

describe('recordMissionComplete', () => {
  it('increments completedMissionCount by 1', () => {
    const profile = createProfile('Joe')
    const updated = recordMissionComplete(profile)

    expect(updated.completedMissionCount).toBe(1)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordMissionComplete(profile)

    expect(profile.completedMissionCount).toBe(0)
  })
})

describe('recordAsteroidVisit', () => {
  it('sets count to 1 on first visit', () => {
    const profile = createProfile('Joe')
    const updated = recordAsteroidVisit(profile, 'bennu')

    expect(updated.visitedAsteroids['bennu']).toBe(1)
  })

  it('increments count on subsequent visits', () => {
    const profile = createProfile('Joe')
    const v1 = recordAsteroidVisit(profile, 'bennu')
    const v2 = recordAsteroidVisit(v1, 'bennu')

    expect(v2.visitedAsteroids['bennu']).toBe(2)
  })

  it('does not affect other asteroid counts', () => {
    const profile = createProfile('Joe')
    const v1 = recordAsteroidVisit(profile, 'bennu')
    const v2 = recordAsteroidVisit(v1, 'psyche')

    expect(v2.visitedAsteroids['bennu']).toBe(1)
    expect(v2.visitedAsteroids['psyche']).toBe(1)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordAsteroidVisit(profile, 'bennu')

    expect(profile.visitedAsteroids).toEqual({})
  })
})
