import { describe, expect, it } from 'vitest'
import {
  hasCompletedMissionObjectiveType,
  isFirstMissionRun,
  resolveFirstRunLanderTipTransmission,
  resolveMissionTipTransmission,
  resolveRuntimeMissionTipTransmission,
} from '@/lib/level/missionTips'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
import type { PlayerProfile } from '@/lib/player/types'

function mission(
  giverId: string,
  type: GeneratedAsteroidMission['objectives'][number]['type'],
): GeneratedAsteroidMission {
  return {
    kind: 'standard',
    id: `${giverId}-${type}`,
    asteroidId: 'bennu',
    giverId,
    giverName: giverId,
    templateId: `${giverId}-${type}`,
    name: 'Test Mission',
    briefing: 'Testing',
    difficulty: 1,
    region: 'near-earth',
    objectives: [{ type, x: 0, z: 0, reward: 100 }],
    totalReward: 100,
    waypoint: { worldX: 0, worldZ: 0 },
    status: 'accepted',
  }
}

function profile(completed: Record<string, number>): PlayerProfile {
  return {
    name: 'Pilot',
    credits: 0,
    completedMissionCount: Object.values(completed).reduce((sum, count) => sum + count, 0),
    visitedAsteroids: {},
    achievementStats: {
      lifetimeCreditsEarned: 0,
      lifetimeCreditsSpent: 0,
      lifetimeTradeCreditsEarned: 0,
      missionObjectivesCompletedByType: completed,
      slingshotLaunches: 0,
      slingshotLaunchesByBody: {},
      gravitySurfStarts: 0,
      manifoldRides: 0,
      portalDepartures: 0,
      lifetimeWorldLineDistance: 0,
      maxSingleRunWorldLineDistance: 0,
    },
    orbitedSolarBodies: {},
    lastDockedPlanetId: 'earth',
    hasSeenIntro: true,
    unlockedFastTravelPlanets: [],
    missionPayMultipliers: {},
    bodyAccess: {},
    completedJourneyIds: [],
    journeyStepProgress: {},
    unlockedFeatureIds: [],
    announcedJourneyStartIds: [],
    journeyStartReadyIds: [],
  }
}

describe('missionTips', () => {
  it('returns a contextual giver-specific transmission for first-time rescue missions', () => {
    const tip = resolveMissionTipTransmission(
      mission('frontier-rescue', 'rescue'),
      profile({}),
      'fps',
    )

    expect(tip?.speaker).toBe('Frontier Rescue')
    expect(tip?.tone).toBe('rescue')
    expect(tip?.message).toContain('Survivors')
  })

  it('suppresses a tip after that objective type has already been completed', () => {
    const tip = resolveMissionTipTransmission(
      mission('frontier-rescue', 'rescue'),
      profile({ rescue: 1 }),
      'fps',
    )

    expect(tip).toBeNull()
  })

  it('falls back to objective copy when the giver has no override', () => {
    const tip = resolveMissionTipTransmission(
      mission('unknown-giver', 'exterminate'),
      profile({}),
      'fps',
    )

    expect(tip?.speaker).toBe('Colonial Guard')
    expect(tip?.channel).toBe('PEST CONTROL NET')
  })

  it('does not resolve lander-oriented guidance for the FPS visor channel', () => {
    const tip = resolveMissionTipTransmission(
      mission('jovian-society', 'photometry'),
      profile({}),
      'fps',
    )

    expect(tip).toBeNull()
  })

  it('resolves lander-oriented guidance on the lander channel', () => {
    const tip = resolveMissionTipTransmission(
      mission('jovian-society', 'photometry'),
      profile({}),
      'lander',
    )

    expect(tip?.speaker).toBe('Vance')
    expect(tip?.view).toBe('lander')
  })

  it('treats missing profile as first-time guidance', () => {
    expect(hasCompletedMissionObjectiveType(null, 'gather')).toBe(false)
  })

  it('shows a retired-operator lander refresher before any mission completion', () => {
    const tip = resolveFirstRunLanderTipTransmission(mission('jay', 'gather'), profile({}))

    expect(tip?.view).toBe('lander')
    expect(tip?.message).toContain('Hey, you got Jay')
    expect(tip?.message).toContain('WASD')
    expect(tip?.message).toContain('SPACE')
    expect(tip?.message).toContain('C kills lateral drift')
    expect(tip?.message).toContain('charge bar')
  })

  it('hides the lander refresher once the player has completed a mission', () => {
    const tip = resolveFirstRunLanderTipTransmission(
      mission('jay', 'gather'),
      profile({ gather: 1 }),
    )

    expect(tip).toBeNull()
  })

  it('treats a missing profile as a first mission run', () => {
    expect(isFirstMissionRun(null)).toBe(true)
  })

  it('resolves the gather rocket SCIENCE tracker runtime tip', () => {
    const tip = resolveRuntimeMissionTipTransmission('gatherRocketScience', 'gather')

    expect(tip?.id).toBe('runtime:gatherRocketScience')
    expect(tip?.message).toContain('press 3 for SCIENCE')
  })

  it('resolves lander warning runtime tips with stacked SHIFT lift guidance', () => {
    const tip = resolveRuntimeMissionTipTransmission('landerDescentWarning', 'gather')

    expect(tip?.id).toBe('runtime:landerDescentWarning')
    expect(tip?.view).toBe('lander')
    expect(tip?.message).toContain('hold SHIFT alongside')
    expect(tip?.message).toContain('ascent RCS')
  })

  it('resolves return-to-lander ground boost and exfil runtime tips', () => {
    const boost = resolveRuntimeMissionTipTransmission('landerGroundBoost', 'gather')
    const exfil = resolveRuntimeMissionTipTransmission('landerObjectiveExfil', 'gather')

    expect(boost?.view).toBe('lander')
    expect(boost?.message).toContain('SPACE punches four times')
    expect(boost?.message).toContain('SHIFT + SPACE')
    expect(exfil?.view).toBe('lander')
    expect(exfil?.message).toContain('EXFILTRATE')
    expect(exfil?.message).toContain('tap F')
  })
})
