/**
 * Mission localStorage persistence.
 *
 * Saves/loads the full shuttle mission board for map refresh recovery and keeps
 * the active asteroid mission mirrored separately so the /level route can read
 * what mission is in progress.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { RestockTimer } from '@/lib/shop/tradeTypes'
import type { GeneratedAsteroidMission, ShuttleMissionBoard } from './types'

/** Versioned localStorage key for the active asteroid mission. */
export const ACTIVE_MISSION_KEY = 'asteroid-lander-active-mission-v1'
/** Versioned localStorage key for the persisted shuttle mission board. */
export const MISSION_BOARD_KEY = 'asteroid-lander-mission-board-v1'

/**
 * One-shot spawn position when returning to the map after a completed asteroid mission (cleared with
 * {@link consumePendingMapReturnWorld}).
 */
export const PENDING_MAP_RETURN_WORLD_KEY = 'asteroid-lander-map-return-world-v1'

interface PersistedMissionBoard {
  board: ShuttleMissionBoard
  savedAt: number
}

/** XZ world position written before `clearActiveMission` on successful exfil. */
export interface PendingMapReturnWorld {
  /** World X from the mission waypoint. */
  worldX: number
  /** World Z from the mission waypoint. */
  worldZ: number
}

/**
 * Save the active asteroid mission to localStorage.
 *
 * @param mission - Mission to persist.
 */
export function saveActiveMission(mission: GeneratedAsteroidMission): void {
  localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
}

/**
 * Load the active asteroid mission from localStorage.
 *
 * @returns The persisted mission, or null if absent or corrupt.
 */
export function loadActiveMission(): GeneratedAsteroidMission | null {
  const raw = localStorage.getItem(ACTIVE_MISSION_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null
    }
    const mission = parsed as Partial<GeneratedAsteroidMission>
    return {
      ...mission,
      kind: mission.kind === 'special' ? 'special' : 'standard',
    } as GeneratedAsteroidMission
  } catch {
    return null
  }
}

/**
 * Remove the active mission from localStorage.
 */
export function clearActiveMission(): void {
  localStorage.removeItem(ACTIVE_MISSION_KEY)
}

function reviveRestockTimer(timer: unknown, elapsedSeconds: number): RestockTimer | null {
  if (timer === null || typeof timer !== 'object' || Array.isArray(timer)) return null
  const candidate = timer as Partial<RestockTimer>
  if (typeof candidate.remaining !== 'number' || typeof candidate.total !== 'number') return null
  const remaining = candidate.remaining - elapsedSeconds
  if (remaining <= 0) return null
  return {
    remaining,
    total: candidate.total,
  }
}

/**
 * Save the full shuttle mission board to localStorage.
 *
 * @param board - Mission board snapshot to persist.
 */
export function saveMissionBoard(board: ShuttleMissionBoard): void {
  if (typeof localStorage === 'undefined') return
  const payload: PersistedMissionBoard = {
    board,
    savedAt: Date.now(),
  }
  localStorage.setItem(MISSION_BOARD_KEY, JSON.stringify(payload))
}

/**
 * Load the persisted shuttle mission board, adjusting restock timers for the
 * time elapsed since the last save.
 *
 * @returns The restored mission board, or null if absent/corrupt/expired.
 */
export function loadMissionBoard(): ShuttleMissionBoard | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(MISSION_BOARD_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

    const persisted = parsed as Partial<PersistedMissionBoard>
    if (
      persisted.board === null ||
      typeof persisted.board !== 'object' ||
      Array.isArray(persisted.board) ||
      typeof persisted.savedAt !== 'number'
    ) {
      return null
    }

    const elapsedSeconds = Math.max(0, (Date.now() - persisted.savedAt) / 1000)
    const board = persisted.board as ShuttleMissionBoard

    return {
      ...board,
      restockTimer: reviveRestockTimer(board.restockTimer, elapsedSeconds),
      asteroidRestockTimer: reviveRestockTimer(board.asteroidRestockTimer, elapsedSeconds),
      evaRestockTimer: reviveRestockTimer(board.evaRestockTimer, elapsedSeconds),
      activeMissions: Array.isArray(board.activeMissions) ? board.activeMissions : [],
      activeEvaMissions: Array.isArray(board.activeEvaMissions) ? board.activeEvaMissions : [],
      offeredMission: board.offeredMission ?? null,
      offeringPlanet: board.offeringPlanet ?? null,
      offeredAsteroidMission: board.offeredAsteroidMission ?? null,
      activeAsteroidMission: board.activeAsteroidMission ?? null,
      offeredEvaMission: board.offeredEvaMission ?? null,
      offeringEvaPlanet: board.offeringEvaPlanet ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Remove the persisted shuttle mission board from localStorage.
 */
export function clearMissionBoard(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(MISSION_BOARD_KEY)
}

/**
 * Stash shuttle map spawn coordinates for the next `/map` init after a successful in-level mission.
 *
 * @param position - Mission waypoint in world units (same frame as the solar map).
 */
export function savePendingMapReturnWorld(position: PendingMapReturnWorld): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PENDING_MAP_RETURN_WORLD_KEY, JSON.stringify(position))
}

/**
 * Read and remove a pending post-mission map position, if any.
 *
 * @returns Parsed coordinates, or `null` if missing or invalid.
 */
export function consumePendingMapReturnWorld(): PendingMapReturnWorld | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(PENDING_MAP_RETURN_WORLD_KEY)
  if (raw === null) return null
  localStorage.removeItem(PENDING_MAP_RETURN_WORLD_KEY)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const o = parsed as Record<string, unknown>
    if (typeof o.worldX !== 'number' || typeof o.worldZ !== 'number') {
      return null
    }
    return { worldX: o.worldX, worldZ: o.worldZ }
  } catch {
    return null
  }
}
