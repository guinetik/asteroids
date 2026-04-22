import { describe, it, expect, beforeEach } from 'vitest'
import {
  createProfile,
  saveProfile,
  loadProfile,
  addCredits,
  spendCredits,
  recordMissionComplete,
  recordAsteroidVisit,
  recordSolarBodyFirstOrbit,
  PROFILE_STORAGE_KEY,
  normalizePlayerDisplayName,
  withPlayerDisplayName,
  savePlayerDisplayName,
  markMapIntroSeen,
  DEFAULT_PLAYER_DISPLAY_NAME,
  MAX_PLAYER_DISPLAY_NAME_LENGTH,
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
    expect(profile.credits).toBe(1000)
    expect(profile.completedMissionCount).toBe(0)
    expect(profile.visitedAsteroids).toEqual({})
    expect(profile.orbitedSolarBodies).toEqual({})
    expect(profile.hasSeenIntro).toBe(false)
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

  it('migrates legacy JSON without hasSeenIntro to hasSeenIntro true', () => {
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify({
      name: 'Legacy',
      credits: 500,
      completedMissionCount: 2,
      visitedAsteroids: {},
    })
    const loaded = loadProfile()
    expect(loaded?.hasSeenIntro).toBe(true)
    expect(loaded?.name).toBe('Legacy')
    expect(loaded?.orbitedSolarBodies).toEqual({})
  })

  it('preserves explicit hasSeenIntro false from storage', () => {
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify({
      name: 'HomeOnly',
      credits: 1000,
      completedMissionCount: 0,
      visitedAsteroids: {},
      hasSeenIntro: false,
    })
    expect(loadProfile()?.hasSeenIntro).toBe(false)
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
    expect(loaded!.credits).toBe(1500)
    expect(loaded!.completedMissionCount).toBe(1)
    expect(loaded!.visitedAsteroids).toEqual({ bennu: 1 })
  })

  it('round-trips shuttle and lander hull HP fields', () => {
    const profile = createProfile('Hull')
    saveProfile({ ...profile, shuttleHullHp: 72, landerHullHp: 81 })
    const loaded = loadProfile()
    expect(loaded?.shuttleHullHp).toBe(72)
    expect(loaded?.landerHullHp).toBe(81)
  })

  it('drops invalid hull HP values on load', () => {
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify({
      name: 'X',
      credits: 1,
      shuttleHullHp: -1,
      landerHullHp: NaN,
    })
    const loaded = loadProfile()
    expect(loaded?.shuttleHullHp).toBeUndefined()
    expect(loaded?.landerHullHp).toBeUndefined()
  })
})

describe('addCredits', () => {
  it('adds credits to profile', () => {
    const profile = createProfile('Joe')
    const updated = addCredits(profile, 500)

    expect(updated.credits).toBe(1500)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    addCredits(profile, 500)

    expect(profile.credits).toBe(1000)
  })
})

describe('spendCredits', () => {
  it('deducts credits when sufficient balance', () => {
    const profile = createProfile('Joe')
    const updated = spendCredits(profile, 300)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(700)
  })

  it('returns null when insufficient credits', () => {
    const profile = createProfile('Joe')
    const updated = spendCredits(profile, 1500)

    expect(updated).toBeNull()
  })

  it('succeeds with exact balance (0 remaining)', () => {
    const profile = createProfile('Joe')
    const updated = spendCredits(profile, 1000)

    expect(updated).not.toBeNull()
    expect(updated!.credits).toBe(0)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
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

describe('recordSolarBodyFirstOrbit', () => {
  it('records the first orbit for a body key', () => {
    const profile = createProfile('Joe')
    const updated = recordSolarBodyFirstOrbit(profile, 'mars')

    expect(updated.orbitedSolarBodies['mars']).toBe(1)
  })

  it('returns the same reference when already orbited', () => {
    const profile = createProfile('Joe')
    const once = recordSolarBodyFirstOrbit(profile, 'earth')
    const twice = recordSolarBodyFirstOrbit(once, 'earth')

    expect(twice).toBe(once)
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordSolarBodyFirstOrbit(profile, 'sun')

    expect(profile.orbitedSolarBodies).toEqual({})
  })
})

describe('normalizePlayerDisplayName', () => {
  it('trims whitespace', () => {
    expect(normalizePlayerDisplayName('  Neo  ')).toBe('Neo')
  })

  it('uses default when empty', () => {
    expect(normalizePlayerDisplayName('')).toBe(DEFAULT_PLAYER_DISPLAY_NAME)
    expect(normalizePlayerDisplayName(' \t ')).toBe(DEFAULT_PLAYER_DISPLAY_NAME)
  })

  it('truncates past max length', () => {
    const long = 'a'.repeat(MAX_PLAYER_DISPLAY_NAME_LENGTH + 10)
    expect(normalizePlayerDisplayName(long).length).toBe(MAX_PLAYER_DISPLAY_NAME_LENGTH)
  })
})

describe('withPlayerDisplayName', () => {
  it('updates only the name field', () => {
    const profile = addCredits(createProfile('Old'), 100)
    const updated = withPlayerDisplayName(profile, 'New')
    expect(updated.name).toBe('New')
    expect(updated.credits).toBe(1100)
    expect(updated.hasSeenIntro).toBe(false)
  })
})

describe('markMapIntroSeen', () => {
  it('sets hasSeenIntro to true', () => {
    const profile = createProfile('Ada')
    const updated = markMapIntroSeen(profile)
    expect(updated.hasSeenIntro).toBe(true)
    expect(profile.hasSeenIntro).toBe(false)
  })
})

describe('savePlayerDisplayName', () => {
  it('creates a new profile when storage is empty', () => {
    const result = savePlayerDisplayName('Ripley')
    expect(result.name).toBe('Ripley')
    expect(loadProfile()).toEqual(result)
    expect(result.credits).toBe(1000)
    expect(result.hasSeenIntro).toBe(false)
  })

  it('renames without touching credits', () => {
    const profile = addCredits(createProfile('A'), 250)
    saveProfile(profile)
    const result = savePlayerDisplayName('B')
    expect(result.name).toBe('B')
    expect(result.credits).toBe(1250)
    expect(loadProfile()?.name).toBe('B')
    expect(result.hasSeenIntro).toBe(false)
  })
})
