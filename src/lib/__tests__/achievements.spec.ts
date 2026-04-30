import { describe, expect, it, beforeEach } from 'vitest'
import { createProfile } from '@/lib/player/profile'
import { ACT_1_JOURNEY_ID, WELCOME_JOURNEY_ID } from '@/lib/journeys'
import { ACHIEVEMENT_DEFINITIONS, type AchievementProgress } from '@/data/achievements'
import { emptyContractSnapshot } from '@/lib/contracts/contractStorage'
import type { ContractStoreSnapshot } from '@/lib/contracts/contractTypes'
import {
  evaluateAchievementUnlocks,
  getAchievementLockedHint,
  isAchievementUnlocked,
  loadUnlockedAchievementIds,
  persistUnlockedAchievementIds,
  resetAchievementStorageForTests,
} from '@/lib/achievements'

function progress(
  profile = createProfile('Pilot'),
  contractSnapshot: ContractStoreSnapshot = emptyContractSnapshot(),
): AchievementProgress {
  return { profile, upgradeLevels: {}, contractSnapshot }
}

describe('achievements', () => {
  beforeEach(() => {
    localStorage.clear()
    resetAchievementStorageForTests()
  })

  it('unlocks intro and first mission milestones from profile progress', () => {
    const profile = {
      ...createProfile('Pilot'),
      hasSeenIntro: true,
      completedJourneyIds: [WELCOME_JOURNEY_ID],
      completedMissionCount: 1,
      credits: 2200,
      visitedAsteroids: { bennu: 1 },
    }

    const result = evaluateAchievementUnlocks(
      {
        profile,
        upgradeLevels: { shuttleCargoBay: 1 },
        contractSnapshot: emptyContractSnapshot(),
      },
      [],
    )

    expect(result.newlyUnlocked.map((item) => item.id)).toEqual([
      'flight-first-launch',
      'missions-first-contract',
      'exploration-first-asteroid',
      'credits-two-thousand',
      'upgrades-first-install',
    ])
  })

  it('does not re-emit already unlocked achievements', () => {
    const profile = {
      ...createProfile('Pilot'),
      hasSeenIntro: true,
      completedMissionCount: 6,
      credits: 5000,
      visitedAsteroids: { bennu: 1, psyche: 1, eros: 1 },
    }

    const result = evaluateAchievementUnlocks(
      {
        profile,
        upgradeLevels: {
          gravitySurfing: 1,
          shuttleCargoBay: 2,
          shuttleHull: 2,
          shuttleFuelCapacity: 1,
        },
        contractSnapshot: emptyContractSnapshot(),
      },
      ['flight-first-launch', 'missions-first-contract', 'exploration-first-asteroid'],
    )

    expect(result.newlyUnlocked.map((item) => item.id)).toEqual([
      'missions-five-contracts',
      'exploration-three-asteroids',
      'credits-two-thousand',
      'credits-five-thousand',
      'upgrades-first-install',
      'upgrades-five-tiers',
      'upgrades-gravity-surfing',
    ])
  })

  it('persists unlocked ids to localStorage', () => {
    persistUnlockedAchievementIds(['a', 'b'])
    expect(loadUnlockedAchievementIds()).toEqual(['a', 'b'])
  })

  it('unlocks solar orbit achievements from orbitedSolarBodies', () => {
    const profile = {
      ...createProfile('Pilot'),
      hasSeenIntro: true,
      orbitedSolarBodies: { sun: 1, mars: 1 },
    }

    const result = evaluateAchievementUnlocks(
      {
        profile,
        upgradeLevels: {},
        contractSnapshot: emptyContractSnapshot(),
      },
      [],
    )

    expect(result.newlyUnlocked.some((a) => a.id === 'exploration-orbit-sun')).toBe(true)
    expect(result.newlyUnlocked.some((a) => a.id === 'exploration-orbit-mars')).toBe(true)
    // Earth has no first-orbit achievement (game starts in Earth orbit).
    expect(result.newlyUnlocked.some((a) => a.id === 'exploration-orbit-earth')).toBe(false)
  })

  it('returns contextual locked hints', () => {
    const hint = getAchievementLockedHint(
      {
        id: 'credits-five-thousand',
        category: 'credits',
        icon: '💰',
        title: 'RETIREMENT IS A LIE',
        subtitle: '5,000 CR on hand · dreams sold separately',
        description: 'Hold 5,000 credits at once.',
        type: 'CREDITS',
        rewardCredits: 1000,
        kind: 'credits_balance',
        threshold: 5000,
      },
      {
        profile: createProfile('Pilot'),
        upgradeLevels: {},
        contractSnapshot: emptyContractSnapshot(),
      },
    )

    expect(hint).toContain('5,000 CR')
    expect(hint).toContain('1,000 CR')
  })

  it('does not unlock malformed achievement definitions with missing required fields', () => {
    const baseProfile = createProfile('Pilot')
    const richProfile = {
      ...baseProfile,
      completedJourneyIds: [WELCOME_JOURNEY_ID],
      completedMissionCount: 10,
      credits: 10000,
      visitedAsteroids: { bennu: 1 },
      orbitedSolarBodies: { sun: 1 },
      bodyAccess: { hektor: 'liberated' as const },
      achievementStats: {
        ...baseProfile.achievementStats,
        lifetimeCreditsEarned: 100000,
        lifetimeCreditsSpent: 50000,
        lifetimeTradeCreditsEarned: 10000,
        missionObjectivesCompletedByType: { survey: 1 },
        slingshotLaunches: 10,
        slingshotLaunchesByBody: { sun: 1 },
        gravitySurfStarts: 1,
        manifoldRides: 1,
        portalDepartures: 1,
        lifetimeWorldLineDistance: 50000,
        maxSingleRunWorldLineDistance: 5000,
      },
    }
    const snapshot = emptyContractSnapshot()
    snapshot.instances['usc-venus-certification'] = {
      contractId: 'usc-venus-certification',
      status: 'completed',
      currentStepIndex: 1,
      stepCounters: [1],
      offeredAt: null,
      acceptedAt: null,
      completedAt: '2306-04-30T00:00:00.000Z',
      resolvedOutcomeId: null,
    }
    snapshot.missionCompletionsByKind = { asteroid: 5 }
    const richProgress = {
      profile: richProfile,
      upgradeLevels: { gravitySurfing: 1 },
      contractSnapshot: snapshot,
    }
    const malformedDefinitions = [
      { kind: 'journey_completed' },
      { kind: 'credits_balance' },
      { kind: 'credits_lifetime_earned' },
      { kind: 'upgrade_tiers' },
      { kind: 'specific_upgrade' },
      { kind: 'solar_body_orbit' },
      { kind: 'mission_kind_completed', threshold: 1 },
      { kind: 'mission_objective_completed', threshold: 1 },
      { kind: 'specific_contract_completed' },
      { kind: 'body_access_state', bodyId: 'hektor' },
      { kind: 'body_access_state', bodyAccessState: 'liberated' },
    ] as const

    for (const malformed of malformedDefinitions) {
      expect(
        isAchievementUnlocked(
          {
            id: `malformed-${malformed.kind}`,
            category: 'flight',
            icon: '*',
            title: 'Malformed',
            subtitle: 'Missing required fields',
            description: 'Should not unlock.',
            type: 'TEST',
            rewardCredits: 0,
            ...malformed,
          },
          richProgress,
        ),
      ).toBe(false)
    }
  })

  it('uses journey-specific locked hints', () => {
    const hint = getAchievementLockedHint(
      ACHIEVEMENT_DEFINITIONS.find((definition) => definition.id === 'journey-act-1-inner-system')!,
      progress(),
    )

    expect(hint).toContain('Act I')
    expect(hint).toContain('Inner System')
  })

  it('unlocks expanded economy achievements from profile stats', () => {
    const baseProfile = createProfile('Pilot')
    const profile = {
      ...baseProfile,
      credits: 10000,
      achievementStats: {
        ...baseProfile.achievementStats,
        lifetimeCreditsEarned: 100000,
        lifetimeCreditsSpent: 50000,
        lifetimeTradeCreditsEarned: 10000,
      },
    }

    const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('credits-ten-thousand')
    expect(ids).toContain('credits-earned-one-hundred-thousand')
    expect(ids).toContain('credits-spent-fifty-thousand')
    expect(ids).toContain('credits-trade-ten-thousand')
  })

  it('unlocks contract and mission family achievements from contract snapshot', () => {
    const snapshot = emptyContractSnapshot()
    snapshot.instances['usc-venus-certification'] = {
      contractId: 'usc-venus-certification',
      status: 'completed',
      currentStepIndex: 1,
      stepCounters: [1],
      offeredAt: null,
      acceptedAt: null,
      completedAt: '2306-04-30T00:00:00.000Z',
      resolvedOutcomeId: null,
    }
    snapshot.missionCompletionsByKind = { asteroid: 5, eva: 1, mining: 1, shuttle: 1 }

    const ids = evaluateAchievementUnlocks(progress(createProfile('Pilot'), snapshot), [
      'missions-first-contract',
    ]).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('contracts-first-complete')
    expect(ids).toContain('contracts-usc-venus-certification')
    expect(ids).toContain('missions-asteroid-five')
    expect(ids).toContain('missions-shuttle-first')
    expect(ids).toContain('missions-eva-first')
    expect(ids).toContain('missions-mining-first')
  })

  it('unlocks Act I from the completed Act I journey', () => {
    const profile = {
      ...createProfile('Pilot'),
      completedJourneyIds: [ACT_1_JOURNEY_ID],
    }

    const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('journey-act-1-inner-system')
  })

  it('unlocks mission objective achievements from profile stats', () => {
    const baseProfile = createProfile('Pilot')
    const profile = {
      ...baseProfile,
      achievementStats: {
        ...baseProfile.achievementStats,
        missionObjectivesCompletedByType: {
          bunker: 1,
          dan: 1,
          gather: 5,
          photometry: 1,
          'prospectus-terminal': 1,
          survey: 1,
        },
      },
    }

    const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('missions-survey-first')
    expect(ids).toContain('missions-photometry-first')
    expect(ids).toContain('missions-dan-first')
    expect(ids).toContain('missions-bunker-first')
    expect(ids).toContain('missions-prospectus-terminal-first')
    expect(ids).toContain('missions-gather-five')
  })

  it('unlocks navigation and portal achievements from profile stats', () => {
    const baseProfile = createProfile('Pilot')
    const profile = {
      ...baseProfile,
      achievementStats: {
        ...baseProfile.achievementStats,
        gravitySurfStarts: 1,
        manifoldRides: 1,
        portalDepartures: 1,
        slingshotLaunches: 10,
        slingshotLaunchesByBody: { sun: 1 },
      },
    }

    const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('flight-first-slingshot')
    expect(ids).toContain('flight-ten-slingshots')
    expect(ids).toContain('flight-sun-launch')
    expect(ids).toContain('flight-first-gravity-surf')
    expect(ids).toContain('flight-first-manifold')
    expect(ids).toContain('flight-first-portal-departure')
  })

  it('unlocks worldline achievements from profile stats', () => {
    const baseProfile = createProfile('Pilot')
    const profile = {
      ...baseProfile,
      achievementStats: {
        ...baseProfile.achievementStats,
        lifetimeWorldLineDistance: 50000,
        maxSingleRunWorldLineDistance: 5000,
      },
    }

    const ids = evaluateAchievementUnlocks(progress(profile), []).newlyUnlocked.map((a) => a.id)

    expect(ids).toContain('worldline-first-trace')
    expect(ids).toContain('worldline-long-thread')
    expect(ids).toContain('worldline-lifetime-ten-thousand')
    expect(ids).toContain('worldline-lifetime-fifty-thousand')
  })

  it('uses approved worldline thresholds', () => {
    expect(
      ACHIEVEMENT_DEFINITIONS.find((definition) => definition.id === 'worldline-first-trace')
        ?.threshold,
    ).toBe(100)
    expect(
      ACHIEVEMENT_DEFINITIONS.find((definition) => definition.id === 'worldline-long-thread')
        ?.threshold,
    ).toBe(2500)
  })

  it('unlocks Hektor outcome achievements from body access', () => {
    const liberated = {
      ...createProfile('Pilot'),
      bodyAccess: { hektor: 'liberated' as const },
    }
    const destroyed = {
      ...createProfile('Pilot'),
      bodyAccess: { hektor: 'destroyed' as const },
    }

    const liberatedIds = evaluateAchievementUnlocks(progress(liberated), []).newlyUnlocked.map(
      (a) => a.id,
    )
    const destroyedIds = evaluateAchievementUnlocks(progress(destroyed), []).newlyUnlocked.map(
      (a) => a.id,
    )

    expect(liberatedIds).toContain('contracts-hektor-liberated')
    expect(destroyedIds).toContain('contracts-hektor-destroyed')
  })

  it('does not include unreachable Act II achievements yet', () => {
    const ids = ACHIEVEMENT_DEFINITIONS.map((definition) => definition.id)

    expect(ids.some((id) => id.includes('act-2'))).toBe(false)
  })
})
