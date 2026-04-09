/**
 * Active asteroid mission localStorage persistence.
 *
 * Saves/loads the active asteroid mission so the /level route
 * can read what mission is in progress. Same pattern as
 * messageStorage.ts.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { GeneratedAsteroidMission } from './types'

/** Versioned localStorage key for the active asteroid mission. */
export const ACTIVE_MISSION_KEY = 'asteroid-lander-active-mission-v1'

/**
 * One-shot spawn position when returning to the map after a completed asteroid mission (cleared with
 * {@link consumePendingMapReturnWorld}).
 */
export const PENDING_MAP_RETURN_WORLD_KEY = 'asteroid-lander-map-return-world-v1'

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
