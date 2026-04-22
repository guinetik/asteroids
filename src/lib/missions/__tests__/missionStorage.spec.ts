import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  saveActiveMission,
  loadActiveMission,
  clearActiveMission,
  ACTIVE_MISSION_KEY,
  saveMissionBoard,
  loadMissionBoard,
  clearMissionBoard,
  MISSION_BOARD_KEY,
  savePendingMapReturnWorld,
  consumePendingMapReturnWorld,
  PENDING_MAP_RETURN_WORLD_KEY,
} from '../missionStorage'
import type { GeneratedAsteroidMission, ShuttleMissionBoard } from '../types'

const MOCK_MISSION: GeneratedAsteroidMission = {
  kind: 'standard',
  id: 'test_mission_123',
  asteroidId: 'bennu',
  giverId: 'jay',
  giverName: 'Jay Mercer',
  templateId: 'jay_mineral_survey',
  name: 'Mineral Survey',
  briefing: 'Test briefing',
  difficulty: 3,
  region: 'near-earth',
  objectives: [{ type: 'gather', resourceAmount: 75, reward: 450, x: 0, z: 0 }],
  totalReward: 550,
  waypoint: { worldX: 100, worldZ: 50 },
  status: 'accepted',
}

const MOCK_BOARD: ShuttleMissionBoard = {
  offeredMission: {
    id: 'earth_mars_methane',
    name: 'Mars Methane Run',
    description: 'Collect a methane sample from Mars orbit.',
    targetPlanet: 'mars',
    gatherQuantity: 4,
    reward: 900,
  },
  offeringPlanet: 'earth',
  restockTimer: { remaining: 120, total: 180 },
  activeMissions: [
    {
      template: {
        id: 'earth_venus_gas_science',
        name: 'Venus Gas Science',
        description: 'Collect dense atmospheric gas.',
        targetPlanet: 'venus',
        gatherQuantity: 3,
        reward: 1200,
      },
      giverPlanet: 'earth',
      status: 'active',
    },
  ],
  offeredAsteroidMission: null,
  activeAsteroidMission: MOCK_MISSION,
  asteroidRestockTimer: { remaining: 60, total: 120 },
  offeredEvaMission: {
    id: 'earth_relay_tx4_reboot',
    name: 'Relay TX-4 Reboot',
    description: 'Fly out and reboot the relay.',
    poiType: 'relay_antenna',
    minigameType: 'relay-reboot',
    reward: 1400,
  },
  offeringEvaPlanet: 'earth',
  evaRestockTimer: { remaining: 90, total: 150 },
  activeEvaMissions: [
    {
      template: {
        id: 'earth_probe_maintenance',
        name: 'Probe Maintenance',
        description: 'Service the old probe.',
        poiType: 'satellite',
        minigameType: 'probe-maintenance',
        reward: 1600,
      },
      giverPlanet: 'earth',
      waypoint: { worldX: -400, worldZ: 220, poiLocalY: 0 },
      status: 'active',
    },
  ],
  offeredMiningMission: null,
  offeringMiningPlanet: null,
  miningRestockTimer: null,
  activeMiningMissions: [],
}

beforeEach(() => {
  localStorage.removeItem(ACTIVE_MISSION_KEY)
  localStorage.removeItem(MISSION_BOARD_KEY)
  localStorage.removeItem(PENDING_MAP_RETURN_WORLD_KEY)
})

describe('saveActiveMission', () => {
  it('persists mission to localStorage', () => {
    saveActiveMission(MOCK_MISSION)
    const raw = localStorage.getItem(ACTIVE_MISSION_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).id).toBe('test_mission_123')
  })
})

describe('loadActiveMission', () => {
  it('returns null when nothing saved', () => {
    expect(loadActiveMission()).toBeNull()
  })

  it('returns saved mission', () => {
    saveActiveMission(MOCK_MISSION)
    const loaded = loadActiveMission()
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('test_mission_123')
    expect(loaded!.giverId).toBe('jay')
    expect(loaded!.waypoint.worldX).toBe(100)
  })

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(ACTIVE_MISSION_KEY, 'not json')
    expect(loadActiveMission()).toBeNull()
  })

  it('returns null for non-object JSON', () => {
    localStorage.setItem(ACTIVE_MISSION_KEY, '"a string"')
    expect(loadActiveMission()).toBeNull()
  })
})

describe('clearActiveMission', () => {
  it('removes mission from localStorage', () => {
    saveActiveMission(MOCK_MISSION)
    clearActiveMission()
    expect(loadActiveMission()).toBeNull()
  })
})

describe('mission board persistence', () => {
  it('persists the mission board to localStorage', () => {
    saveMissionBoard(MOCK_BOARD)
    const raw = localStorage.getItem(MISSION_BOARD_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).board.activeMissions).toHaveLength(1)
    expect(JSON.parse(raw!).board.activeEvaMissions).toHaveLength(1)
  })

  it('returns null when no mission board is saved', () => {
    expect(loadMissionBoard()).toBeNull()
  })

  it('restores a saved mission board', () => {
    saveMissionBoard(MOCK_BOARD)
    const loaded = loadMissionBoard()
    expect(loaded).not.toBeNull()
    expect(loaded!.activeMissions[0]!.template.id).toBe('earth_venus_gas_science')
    expect(loaded!.activeEvaMissions[0]!.template.id).toBe('earth_probe_maintenance')
    expect(loaded!.activeAsteroidMission?.id).toBe(MOCK_MISSION.id)
  })

  it('subtracts elapsed time from restock timers on load', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(1_000_000)
    saveMissionBoard(MOCK_BOARD)
    nowSpy.mockReturnValue(1_030_000)

    const loaded = loadMissionBoard()
    expect(loaded).not.toBeNull()
    expect(loaded!.restockTimer!.remaining).toBeCloseTo(90)
    expect(loaded!.asteroidRestockTimer!.remaining).toBeCloseTo(30)
    expect(loaded!.evaRestockTimer!.remaining).toBeCloseTo(60)

    nowSpy.mockRestore()
  })

  it('drops expired restock timers on load', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(2_000_000)
    saveMissionBoard(MOCK_BOARD)
    nowSpy.mockReturnValue(2_200_000)

    const loaded = loadMissionBoard()
    expect(loaded).not.toBeNull()
    expect(loaded!.restockTimer).toBeNull()
    expect(loaded!.asteroidRestockTimer).toBeNull()
    expect(loaded!.evaRestockTimer).toBeNull()

    nowSpy.mockRestore()
  })

  it('clears the persisted mission board', () => {
    saveMissionBoard(MOCK_BOARD)
    clearMissionBoard()
    expect(loadMissionBoard()).toBeNull()
  })
})

describe('pending map return world', () => {
  it('returns null when absent', () => {
    expect(consumePendingMapReturnWorld()).toBeNull()
  })

  it('save then consume returns coordinates and removes key', () => {
    savePendingMapReturnWorld({ worldX: 12.5, worldZ: -88 })
    expect(consumePendingMapReturnWorld()).toEqual({ worldX: 12.5, worldZ: -88 })
    expect(localStorage.getItem(PENDING_MAP_RETURN_WORLD_KEY)).toBeNull()
    expect(consumePendingMapReturnWorld()).toBeNull()
  })
})
