import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveActiveMission,
  loadActiveMission,
  clearActiveMission,
  ACTIVE_MISSION_KEY,
  savePendingMapReturnWorld,
  consumePendingMapReturnWorld,
  PENDING_MAP_RETURN_WORLD_KEY,
} from '../missionStorage'
import type { GeneratedAsteroidMission } from '../types'

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

beforeEach(() => {
  localStorage.removeItem(ACTIVE_MISSION_KEY)
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
