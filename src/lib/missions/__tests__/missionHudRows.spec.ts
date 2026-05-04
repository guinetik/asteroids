/**
 * Tests for {@link buildMissionTrackerGroups}.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import { describe, it, expect } from 'vitest'
import { buildMissionTrackerGroups } from '@/lib/missions/missionHudRows'
import type { ShuttleMissionBoard } from '@/lib/missions/types'

function emptyBoard(): ShuttleMissionBoard {
  return {
    offeredMission: null,
    offeringPlanet: null,
    restockTimer: null,
    activeMissions: [],
    offeredAsteroidMission: null,
    offeringAsteroidPlanet: null,
    activeAsteroidMission: null,
    asteroidRestockTimer: null,
    offeredEvaMission: null,
    offeringEvaPlanet: null,
    evaRestockTimer: null,
    activeEvaMissions: [],
    offeredMiningMission: null,
    offeringMiningPlanet: null,
    miningRestockTimer: null,
    activeMiningMissions: [],
  }
}

describe('buildMissionTrackerGroups', () => {
  it('returns no groups for an empty board', () => {
    expect(buildMissionTrackerGroups(emptyBoard())).toEqual([])
  })
})
