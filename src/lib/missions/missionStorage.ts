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
    return parsed as GeneratedAsteroidMission
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
