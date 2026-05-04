/**
 * Tests for {@link buildMissionTrackerGroups}.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import { describe, it, expect } from 'vitest'
import { buildMissionTrackerGroups } from '@/lib/missions/missionHudRows'
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  ShuttleMissionTemplate,
} from '@/lib/missions/types'

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

function deliveryTemplate(
  overrides: Partial<ShuttleMissionTemplate> = {},
): ShuttleMissionTemplate {
  return {
    id: 'earth_venus_gas',
    name: 'Venusian Gas Run',
    description: '',
    targetPlanet: 'venus',
    gatherQuantity: 1,
    reward: 100,
    ...overrides,
  }
}

function deliveryActive(
  overrides: Partial<ActiveShuttleMission> = {},
): ActiveShuttleMission {
  return {
    template: deliveryTemplate(),
    giverPlanet: 'earth',
    status: 'active',
    ...overrides,
  }
}

describe('buildMissionTrackerGroups', () => {
  it('returns no groups for an empty board', () => {
    expect(buildMissionTrackerGroups(emptyBoard())).toEqual([])
  })

  it('produces a delivery group with target-planet focus when status is active', () => {
    const board = emptyBoard()
    board.activeMissions = [deliveryActive()]
    const groups = buildMissionTrackerGroups(board)
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    expect(group.key).toBe('delivery')
    expect(group.title).toBe('Deliveries')
    expect(group.rows).toHaveLength(1)
    const row = group.rows[0]!
    expect(row.title).toBe('Venusian Gas Run')
    expect(row.objectiveType).toBeUndefined()
    expect(row.focus).toEqual({ kind: 'planet', planetId: 'venus' })
  })

  it('uses giver-planet focus for ready-to-deliver missions', () => {
    const board = emptyBoard()
    board.activeMissions = [deliveryActive({ status: 'ready-to-deliver' })]
    const row = buildMissionTrackerGroups(board)[0]!.rows[0]!
    expect(row.focus).toEqual({ kind: 'planet', planetId: 'earth' })
  })

  it('keeps delivery rows in acceptance order with stable ids', () => {
    const board = emptyBoard()
    board.activeMissions = [
      deliveryActive({ template: deliveryTemplate({ id: 'a', name: 'A' }) }),
      deliveryActive({ template: deliveryTemplate({ id: 'b', name: 'B' }) }),
    ]
    const rows = buildMissionTrackerGroups(board)[0]!.rows
    expect(rows.map((r) => r.title)).toEqual(['A', 'B'])
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
  })
})
