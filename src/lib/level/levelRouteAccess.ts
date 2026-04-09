/**
 * Guards the /level route: requires a persisted player profile and active
 * asteroid mission unless query params provide a dev / test override.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { LocationQuery } from 'vue-router'
import type { ObjectiveType } from '@/lib/missions/types'
import { loadActiveMission } from '@/lib/missions/missionStorage'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'
import { loadProfile } from '@/lib/player/profile'

/** Allowed values for the `mission` query param when used with `difficulty` to bypass storage. */
const LEVEL_ROUTE_OBJECTIVE_TYPES: readonly ObjectiveType[] = [
  'gather',
  'exterminate',
  'rescue',
  'survey',
  'collect',
]

/** Minimum valid `difficulty` query value for bypass (inclusive). */
const LEVEL_ROUTE_DIFFICULTY_MIN = 1

/** Maximum valid `difficulty` query value for bypass (inclusive). */
const LEVEL_ROUTE_DIFFICULTY_MAX = 10

/**
 * Build search params from a Vue route query object (first value wins per key).
 *
 * @param query - `to.query` from vue-router.
 */
function routeQueryToSearchParams(query: LocationQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    const first = Array.isArray(value) ? value[0] : value
    if (first === undefined || first === null) continue
    params.set(key, String(first))
  }
  return params
}

/**
 * True when URL allows entering /level without profile or stored mission.
 *
 * - `asteroidId` — procedural mission for that body (difficulty defaults inside level loader).
 * - `difficulty` (integer 1–10) and `mission` (objective type) — both required together.
 *
 * @param params - Parsed query string (e.g. `window.location` or route-derived).
 */
export function hasLevelRouteQueryOverrideFromSearchParams(params: URLSearchParams): boolean {
  const asteroidId = params.get('asteroidId')?.trim() ?? ''
  if (asteroidId !== '') return true

  const missionId = params.get('mission')?.trim() ?? ''
  if (missionId !== '' && getSpecialMissionById(missionId)) {
    return true
  }

  const rawDifficulty = params.get('difficulty')
  const missionRaw = missionId.toLowerCase()
  if (rawDifficulty === null || missionRaw === '') return false

  const difficulty = Number(rawDifficulty)
  if (
    !Number.isInteger(difficulty)
    || difficulty < LEVEL_ROUTE_DIFFICULTY_MIN
    || difficulty > LEVEL_ROUTE_DIFFICULTY_MAX
  ) {
    return false
  }

  return (LEVEL_ROUTE_OBJECTIVE_TYPES as readonly string[]).includes(missionRaw)
}

/**
 * Same as {@link hasLevelRouteQueryOverrideFromSearchParams} using a route `query` object.
 *
 * @param query - Normalized location query from vue-router.
 */
export function hasLevelRouteQueryOverride(query: LocationQuery): boolean {
  return hasLevelRouteQueryOverrideFromSearchParams(routeQueryToSearchParams(query))
}

/**
 * Whether navigation to `/level` is allowed.
 *
 * @param query - Route query (`to.query`).
 * @returns True when override params are present or both profile and active mission exist in LS.
 */
export function canAccessLevelRoute(query: LocationQuery): boolean {
  if (hasLevelRouteQueryOverride(query)) return true
  if (typeof localStorage === 'undefined') return false
  return loadProfile() !== null && loadActiveMission() !== null
}
