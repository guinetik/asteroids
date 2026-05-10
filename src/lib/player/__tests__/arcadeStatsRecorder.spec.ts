import { describe, expect, it } from 'vitest'
import {
  recordArcadeRomEvent,
  type ArcadeRomEvent,
} from '../arcadeStatsRecorder'
import type { PlayerAchievementStats } from '../types'

function emptyStats(): PlayerAchievementStats {
  return {
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
  }
}

describe('recordArcadeRomEvent', () => {
  it('runStarted increments runs counter and seeds best-score/wave at 0/1', () => {
    const event: ArcadeRomEvent = { type: 'runStarted', score: 0, wave: 1 }
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', event)
    expect(stats.arcadeRunsByRom.asteroids).toBe(1)
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(0)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(1)
  })

  it('runStarted twice increments to 2', () => {
    const event: ArcadeRomEvent = { type: 'runStarted', score: 0, wave: 1 }
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', event)
    stats = recordArcadeRomEvent(stats, 'asteroids', event)
    expect(stats.arcadeRunsByRom.asteroids).toBe(2)
  })

  it('runEnded max-tracks score and wave', () => {
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'runEnded',
      score: 7500,
      wave: 4,
    })
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(7500)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(4)
    stats = recordArcadeRomEvent(stats, 'asteroids', {
      type: 'runEnded',
      score: 1000,
      wave: 2,
    })
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(7500)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(4)
  })

  it('event type bumps the per-eventId counter and max-tracks score/wave', () => {
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'event',
      eventId: 'saucerKill',
      score: 1200,
      wave: 3,
    })
    expect(stats.arcadeEventCountsByRom.asteroids?.saucerKill).toBe(1)
    expect(stats.arcadeBestScoreByRom.asteroids).toBe(1200)
    expect(stats.arcadeBestWaveByRom.asteroids).toBe(3)
  })

  it('event without eventId is a no-op for the event-counts map', () => {
    const stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'event',
      score: 100,
      wave: 1,
    })
    expect(stats.arcadeEventCountsByRom.asteroids).toBeUndefined()
  })

  it('keys are isolated per ROM id', () => {
    let stats = recordArcadeRomEvent(emptyStats(), 'asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
    stats = recordArcadeRomEvent(stats, 'pong', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
    expect(stats.arcadeRunsByRom.asteroids).toBe(1)
    expect(stats.arcadeRunsByRom.pong).toBe(1)
  })

  it('does not mutate the input stats object', () => {
    const before = emptyStats()
    const after = recordArcadeRomEvent(before, 'asteroids', {
      type: 'runStarted',
      score: 0,
      wave: 1,
    })
    expect(before.arcadeRunsByRom).toEqual({})
    expect(after).not.toBe(before)
  })
})
