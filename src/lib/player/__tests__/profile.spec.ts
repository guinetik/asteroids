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
  getBodyAccess,
  isBodyRendered,
  setBodyAccess,
  recordTradeCreditsEarned,
  recordMissionObjectiveComplete,
  recordRuntimeTipsShown,
  recordSlingshotLaunch,
  recordGravitySurfStart,
  recordManifoldRide,
  recordPortalDeparture,
  recordWorldLineDistance,
  setStoryFlag,
  hasStoryFlag,
  addSushiLove,
  addSushiHunger,
  setBowlServings,
  recordSushiPet,
  recordSushiBowlRefill,
} from '../profile'
import type { PlayerProfile } from '../types'

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
    expect(profile.bodyAccess['hektor']).toBe('restricted')
    expect(profile.hasSeenIntro).toBe(false)
    expect(profile.fantasiaCosmeticIntroSent).toBe(false)
    expect(profile.cosmetics?.ownedOptionIds.length).toBeGreaterThan(1)
  })

  it('creates profiles with zeroed achievement stats', () => {
    const profile = createProfile('Pilot')

    expect(profile.achievementStats).toEqual({
      lifetimeCreditsEarned: 0,
      lifetimeCreditsSpent: 0,
      lifetimeTradeCreditsEarned: 0,
      lifetimeCargoIntakeCreditsEarned: 0,
      missionObjectivesCompletedByType: {},
      runtimeTipsShownCount: {},
      slingshotLaunches: 0,
      slingshotLaunchesByBody: {},
      gravitySurfStarts: 0,
      manifoldRides: 0,
      portalDepartures: 0,
      lifetimeWorldLineDistance: 0,
      maxSingleRunWorldLineDistance: 0,
      sushiPetCount: 0,
      sushiBowlRefillCount: 0,
      arcadeRunsByRom: {},
      arcadeBestScoreByRom: {},
      arcadeBestWaveByRom: {},
      arcadeEventCountsByRom: {},
    })
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
    expect(loaded?.bodyAccess['hektor']).toBe('restricted')
  })

  it('migrates legacy JSON without bodyAccess to restricted pinned bodies', () => {
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify({
      name: 'LegacyHektor',
      credits: 500,
      completedMissionCount: 2,
      visitedAsteroids: {},
      orbitedSolarBodies: {},
      hasSeenIntro: true,
    })
    const loaded = loadProfile()
    expect(loaded?.bodyAccess['hektor']).toBe('restricted')
  })

  it('migrates legacy profiles without achievement stats', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: 'Legacy',
        credits: 1234,
        completedMissionCount: 2,
        visitedAsteroids: { bennu: 1 },
      }),
    )

    expect(loadProfile()?.achievementStats.lifetimeCreditsEarned).toBe(0)
    expect(loadProfile()?.achievementStats.slingshotLaunchesByBody).toEqual({})
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
    const updated = addCredits(recordAsteroidVisit(recordMissionComplete(profile), 'bennu'), 500)
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

describe('achievement stats', () => {
  it('tracks earned and spent lifetime credits', () => {
    const earned = addCredits(createProfile('Pilot'), 500)
    expect(earned.credits).toBe(1500)
    expect(earned.achievementStats.lifetimeCreditsEarned).toBe(500)

    const spent = spendCredits(earned, 300)
    expect(spent?.achievementStats.lifetimeCreditsSpent).toBe(300)
    expect(spendCredits(earned, 999999)).toBeNull()
  })

  it('updates achievement stats through focused helpers', () => {
    let profile = createProfile('Pilot')
    profile = recordTradeCreditsEarned(profile, 250)
    profile = recordMissionObjectiveComplete(profile, 'survey')
    profile = recordSlingshotLaunch(profile, 'sun')
    profile = recordGravitySurfStart(profile)
    profile = recordManifoldRide(profile)
    profile = recordPortalDeparture(profile)
    profile = recordWorldLineDistance(profile, 100, 250)

    expect(profile.achievementStats.lifetimeTradeCreditsEarned).toBe(250)
    expect(profile.achievementStats.missionObjectivesCompletedByType.survey).toBe(1)
    expect(profile.achievementStats.slingshotLaunches).toBe(1)
    expect(profile.achievementStats.slingshotLaunchesByBody.sun).toBe(1)
    expect(profile.achievementStats.gravitySurfStarts).toBe(1)
    expect(profile.achievementStats.manifoldRides).toBe(1)
    expect(profile.achievementStats.portalDepartures).toBe(1)
    expect(profile.achievementStats.lifetimeWorldLineDistance).toBe(100)
    expect(profile.achievementStats.maxSingleRunWorldLineDistance).toBe(250)
  })

  it('returns the same profile for invalid achievement stat inputs', () => {
    const profile = createProfile('Pilot')

    expect(recordTradeCreditsEarned(profile, 0)).toBe(profile)
    expect(recordMissionObjectiveComplete(profile, '')).toBe(profile)
    expect(recordSlingshotLaunch(profile, '')).toBe(profile)
    expect(recordWorldLineDistance(profile, -1, 100)).toBe(profile)
    expect(recordWorldLineDistance(profile, 100, Number.POSITIVE_INFINITY)).toBe(profile)
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
    expect(updated.lastVisitedAsteroidId).toBe('bennu')
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
    expect(v2.lastVisitedAsteroidId).toBe('psyche')
  })

  it('does not mutate the original profile', () => {
    const profile = createProfile('Joe')
    recordAsteroidVisit(profile, 'bennu')

    expect(profile.visitedAsteroids).toEqual({})
    expect(profile.lastVisitedAsteroidId).toBeNull()
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

describe('body access', () => {
  it('gets and sets pinned body access without mutating the original profile', () => {
    const profile = createProfile('Ada')
    const updated = setBodyAccess(profile, 'hektor', 'unrestricted')

    expect(getBodyAccess(updated, 'hektor')).toBe('unrestricted')
    expect(getBodyAccess(profile, 'hektor')).toBe('restricted')
  })

  it('persists pinned body access through localStorage', () => {
    const profile = setBodyAccess(createProfile('Ada'), 'hektor', 'unrestricted')
    saveProfile(profile)
    expect(loadProfile()?.bodyAccess['hektor']).toBe('unrestricted')
  })

  it('renders only unrestricted or liberated pinned body states', () => {
    expect(isBodyRendered('restricted')).toBe(false)
    expect(isBodyRendered('destroyed')).toBe(false)
    expect(isBodyRendered('unrestricted')).toBe(true)
    expect(isBodyRendered('liberated')).toBe(true)
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

describe('shuttleBuffs and disabledGiverIds', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key]
    }
  })

  it('createProfile defaults shuttleBuffs and disabledGiverIds to empty maps', () => {
    const profile = createProfile('Pilot')
    expect(profile.shuttleBuffs).toEqual({})
    expect(profile.disabledGiverIds).toEqual({})
  })

  it('round-trips shuttleBuffs and disabledGiverIds through localStorage', () => {
    const profile = createProfile('Pilot')
    const next: PlayerProfile = {
      ...profile,
      shuttleBuffs: { jovianEmpowerment: 1.5 },
      disabledGiverIds: { 'jovian-society': true },
    }
    saveProfile(next)
    const loaded = loadProfile()
    expect(loaded?.shuttleBuffs).toEqual({ jovianEmpowerment: 1.5 })
    expect(loaded?.disabledGiverIds).toEqual({ 'jovian-society': true })
  })

  it('legacy saves missing the fields normalize to empty maps', () => {
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify({ name: 'Old', credits: 100 })
    const loaded = loadProfile()
    expect(loaded?.shuttleBuffs).toEqual({})
    expect(loaded?.disabledGiverIds).toEqual({})
  })
})

describe('story flags', () => {
  it('hasStoryFlag returns false on a fresh profile', () => {
    const p = createProfile('Pilot')
    expect(hasStoryFlag(p, 'jovianContractTampered')).toBe(false)
  })

  it('setStoryFlag persists the flag', () => {
    const p = setStoryFlag(createProfile('Pilot'), 'jovianContractTampered')
    expect(hasStoryFlag(p, 'jovianContractTampered')).toBe(true)
  })

  it('setStoryFlag is idempotent', () => {
    let p = createProfile('Pilot')
    p = setStoryFlag(p, 'x')
    p = setStoryFlag(p, 'x')
    expect(Object.keys(p.activeStoryFlags ?? {})).toEqual(['x'])
  })

  it('seenJovianEpilogue defaults to false', () => {
    const p = createProfile('Pilot')
    expect(p.seenJovianEpilogue).toBeFalsy()
  })
})

describe('runtimeTipsShownCount field', () => {
  it('defaults to an empty map on a fresh profile', () => {
    const profile = createProfile('Pilot')
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('seeds an empty map when loading legacy stats without the field', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({
        name: 'Pilot',
        credits: 0,
        achievementStats: { lifetimeCreditsEarned: 0 },
      }),
    )
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({})
  })

  it('round-trips show counts through save/load', () => {
    const profile = {
      ...createProfile('Pilot'),
      achievementStats: {
        ...createProfile('Pilot').achievementStats,
        runtimeTipsShownCount: { oxygenLow: 1, drillWalking: 2 },
      },
    }
    saveProfile(profile)
    const loaded = loadProfile()
    expect(loaded?.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 2,
    })
  })
})

describe('recordRuntimeTipsShown', () => {
  it('increments each id by one', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['oxygenLow', 'drillWalking'])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 1,
      drillWalking: 1,
    })
  })

  it('accumulates across calls', () => {
    let profile = createProfile('Pilot')
    profile = recordRuntimeTipsShown(profile, ['oxygenLow'])
    profile = recordRuntimeTipsShown(profile, ['oxygenLow', 'rtgLow'])
    expect(profile.achievementStats.runtimeTipsShownCount).toEqual({
      oxygenLow: 2,
      rtgLow: 1,
    })
  })

  it('returns the same profile reference when ids is empty', () => {
    const profile = createProfile('Pilot')
    expect(recordRuntimeTipsShown(profile, [])).toBe(profile)
  })

  it('skips blank or non-string ids', () => {
    const profile = createProfile('Pilot')
    const updated = recordRuntimeTipsShown(profile, ['', '  '])
    expect(updated.achievementStats.runtimeTipsShownCount).toEqual({})
  })
})

describe('Sushi cat needs on PlayerProfile', () => {
  it('seeds defaults on a fresh profile', () => {
    const profile = createProfile('Pilot')
    expect(profile.sushiLove).toBe(25)
    expect(profile.sushiHunger).toBe(75)
    expect(profile.bowlServings).toBe(0)
  })

  it('hydrates missing Sushi fields when loading legacy saves', () => {
    const profile = createProfile('Pilot')
    saveProfile(profile)
    const raw = mockStorage[PROFILE_STORAGE_KEY] as string
    const parsed = JSON.parse(raw) as Record<string, unknown>
    delete parsed['sushiLove']
    delete parsed['sushiHunger']
    delete parsed['bowlServings']
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify(parsed)

    const loaded = loadProfile()
    expect(loaded?.sushiLove).toBe(25)
    expect(loaded?.sushiHunger).toBe(75)
    expect(loaded?.bowlServings).toBe(0)
  })

  it('clamps persisted Sushi fields to their valid ranges', () => {
    const profile = createProfile('Pilot')
    saveProfile(profile)
    const parsed = JSON.parse(mockStorage[PROFILE_STORAGE_KEY] as string) as Record<string, unknown>
    parsed['sushiLove'] = 9999
    parsed['sushiHunger'] = -50
    parsed['bowlServings'] = 200
    mockStorage[PROFILE_STORAGE_KEY] = JSON.stringify(parsed)

    const loaded = loadProfile()
    expect(loaded?.sushiLove).toBe(100)
    expect(loaded?.sushiHunger).toBe(0)
    expect(loaded?.bowlServings).toBe(10)
  })
})

describe('addSushiLove / addSushiHunger / setBowlServings', () => {
  it('clamps love into [0, 100]', () => {
    let profile: PlayerProfile = createProfile('Pilot')
    profile = addSushiLove(profile, +500)
    expect(profile.sushiLove).toBe(100)
    profile = addSushiLove(profile, -250)
    expect(profile.sushiLove).toBe(0)
  })

  it('clamps hunger into [0, 100]', () => {
    let profile: PlayerProfile = createProfile('Pilot')
    profile = addSushiHunger(profile, -100)
    expect(profile.sushiHunger).toBe(0)
    profile = addSushiHunger(profile, +9999)
    expect(profile.sushiHunger).toBe(100)
  })

  it('clamps bowl servings into [0, 10] and ignores non-finite', () => {
    let profile: PlayerProfile = createProfile('Pilot')
    profile = setBowlServings(profile, 10)
    expect(profile.bowlServings).toBe(10)
    profile = setBowlServings(profile, 99)
    expect(profile.bowlServings).toBe(10)
    profile = setBowlServings(profile, -1)
    expect(profile.bowlServings).toBe(0)
    profile = setBowlServings(profile, Number.NaN)
    expect(profile.bowlServings).toBe(0)
  })

  it('returns the same object reference when value is unchanged', () => {
    const profile = createProfile('Pilot')
    expect(addSushiLove(profile, 0)).toBe(profile)
    expect(addSushiHunger(profile, 0)).toBe(profile)
    expect(setBowlServings(profile, profile.bowlServings)).toBe(profile)
  })
})

describe('recordSushiPet / recordSushiBowlRefill', () => {
  it('increments lifetime sushi pet count', () => {
    const profile = createProfile('Pilot')
    expect(profile.achievementStats.sushiPetCount).toBe(0)
    const next = recordSushiPet(profile)
    expect(next.achievementStats.sushiPetCount).toBe(1)
    expect(recordSushiPet(next).achievementStats.sushiPetCount).toBe(2)
  })

  it('increments lifetime bowl refill count', () => {
    const profile = createProfile('Pilot')
    expect(profile.achievementStats.sushiBowlRefillCount).toBe(0)
    const next = recordSushiBowlRefill(profile)
    expect(next.achievementStats.sushiBowlRefillCount).toBe(1)
    expect(recordSushiBowlRefill(next).achievementStats.sushiBowlRefillCount).toBe(2)
  })
})
