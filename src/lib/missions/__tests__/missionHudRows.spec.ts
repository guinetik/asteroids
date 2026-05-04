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
  GeneratedAsteroidMission,
  ConcreteObjective,
  ObjectiveType,
  ActiveVisitRelayMission,
  EvaMissionPoiType,
  VisitRelayShuttleMissionTemplate,
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

function objective(type: ObjectiveType): ConcreteObjective {
  return { type, x: 0, z: 0, reward: 0 }
}

function asteroidMission(
  overrides: Partial<GeneratedAsteroidMission> = {},
): GeneratedAsteroidMission {
  return {
    kind: 'standard',
    id: 'belt-survey-001',
    asteroidId: 'bennu',
    giverId: 'jay',
    giverName: 'Jay Mercer',
    templateId: 'mineral_survey',
    name: 'Belt Survey 4A',
    briefing: '',
    difficulty: 3,
    region: 'asteroid-belt',
    objectives: [objective('photometry')],
    totalReward: 0,
    waypoint: { worldX: 1234, worldZ: -567 },
    status: 'accepted',
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

  it('produces an asteroid group when one mission is active', () => {
    const board = emptyBoard()
    board.activeAsteroidMission = asteroidMission()
    const groups = buildMissionTrackerGroups(board)
    expect(groups.map((g) => g.key)).toEqual(['asteroid'])
    const row = groups[0]!.rows[0]!
    expect(row.title).toBe('Belt Survey 4A')
    expect(row.objectiveType).toBe('Photometry')
    expect(row.focus).toEqual({ kind: 'world', worldX: 1234, worldZ: -567 })
  })

  it('maps every asteroid objective type to a display label', () => {
    const types: ObjectiveType[] = [
      'gather',
      'exterminate',
      'rescue',
      'survey',
      'photometry',
      'dan',
      'collect',
      'bunker',
      'mineral-analysis',
      'prospectus-terminal',
    ]
    for (const t of types) {
      const board = emptyBoard()
      board.activeAsteroidMission = asteroidMission({ objectives: [objective(t)] })
      const row = buildMissionTrackerGroups(board)[0]!.rows[0]!
      expect(row.objectiveType).toBeTypeOf('string')
      expect(row.objectiveType!.length).toBeGreaterThan(0)
    }
  })

  function evaTemplate(
    overrides: Partial<VisitRelayShuttleMissionTemplate> = {},
  ): VisitRelayShuttleMissionTemplate {
    return {
      id: 'earth_relay_tx4',
      name: 'TX-4 Reboot',
      description: '',
      poiType: 'relay_antenna',
      minigameType: 'relay_repair',
      reward: 200,
      ...overrides,
    }
  }

  function evaActive(
    overrides: Partial<ActiveVisitRelayMission> = {},
  ): ActiveVisitRelayMission {
    return {
      template: evaTemplate(),
      giverPlanet: 'earth',
      waypoint: { worldX: 50, worldZ: 75, poiLocalY: 5 },
      status: 'active',
      ...overrides,
    }
  }

  it('produces an EVA row with waypoint focus and poiType label', () => {
    const board = emptyBoard()
    board.activeEvaMissions = [evaActive()]
    const group = buildMissionTrackerGroups(board)[0]!
    expect(group.key).toBe('eva')
    const row = group.rows[0]!
    expect(row.title).toBe('TX-4 Reboot')
    expect(row.objectiveType).toBe('Relay Repair')
    expect(row.focus).toEqual({ kind: 'world', worldX: 50, worldZ: 75 })
  })

  it.each<[EvaMissionPoiType, string]>([
    ['satellite', 'Satellite Servicing'],
    ['relay_antenna', 'Relay Repair'],
    ['telescope', 'Telescope'],
  ])('maps EVA poiType %s to label %s', (poiType, label) => {
    const board = emptyBoard()
    board.activeEvaMissions = [evaActive({ template: evaTemplate({ poiType }) })]
    expect(buildMissionTrackerGroups(board)[0]!.rows[0]!.objectiveType).toBe(label)
  })
})
