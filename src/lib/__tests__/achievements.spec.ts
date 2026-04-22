import { describe, expect, it, beforeEach } from 'vitest'
import { createProfile } from '@/lib/player/profile'
import { WELCOME_JOURNEY_ID } from '@/lib/journeys'
import {
  evaluateAchievementUnlocks,
  getAchievementLockedHint,
  loadUnlockedAchievementIds,
  persistUnlockedAchievementIds,
  resetAchievementStorageForTests,
} from '@/lib/achievements'

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
        upgradeLevels: { gravitySurfing: 1, shuttleCargoBay: 2, shuttleHull: 2, shuttleFuelCapacity: 1 },
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
      },
    )

    expect(hint).toContain('5,000 CR')
    expect(hint).toContain('1,000 CR')
  })
})
