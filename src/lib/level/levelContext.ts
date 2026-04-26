/**
 * Query-param and storage-driven level mission resolution helpers.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

import { getAsteroidById, ASTEROID_CATALOG } from '@/lib/asteroids/catalog'
import type { AsteroidDefinition, RotationLottery } from '@/lib/asteroids/types'
import { hasLevelRouteQueryOverrideFromSearchParams } from '@/lib/level/levelRouteAccess'
import { generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'
import { loadActiveMission } from '@/lib/missions/missionStorage'
import type { GeneratedAsteroidMission, ObjectiveType } from '@/lib/missions/types'

/** Maximum attempts to generate a mission matching the requested objective type. */
export const LEVEL_MISSION_TYPE_RETRY_LIMIT = 20

/**
 * Resolved level boot context.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface LevelContext {
  /** Asteroid definition used to build the scene. */
  asteroid: AsteroidDefinition
  /** Deterministic numeric seed derived from the mission id. */
  seed: number
  /** Mission active for this level run. */
  mission: GeneratedAsteroidMission
  /**
   * True when completion should grant rewards and clear active mission state,
   * false for ad-hoc/dev query launches.
   */
  persistCompletionRewards: boolean
}

/**
 * Deterministically hash a mission id into a non-negative numeric seed.
 *
 * @param value - Stable mission id string.
 * @returns Non-negative numeric seed for procedural helpers.
 */
export function hashLevelSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Pick a deterministic Euler rotation from a numeric seed. Used so each
 * mission's asteroid GLB lands in a different orientation. An optional
 * per-axis lottery override locks specific axes to fixed radians, leaving
 * the remaining axes seeded — used for elongated bodies (e.g. Itokawa)
 * where rotating the long axis vertical collapses the playable surface.
 *
 * @param seed - Mission seed (typically from {@link hashLevelSeed}).
 * @param lottery - Optional axis locks. Present axes use their literal
 * radian value; omitted axes are sampled from `[0, 2π)`.
 * @returns XYZ Euler rotation in radians.
 */
export function rotationFromSeed(
  seed: number,
  lottery?: RotationLottery,
): { x: number; y: number; z: number } {
  const goldenRatioSeed = 0x9e3779b9
  const mulberryIncrement = 0x6d2b79f5
  let s = (seed ^ goldenRatioSeed) >>> 0
  const next = (): number => {
    s = (s + mulberryIncrement) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const tau = Math.PI * 2
  // Always advance the PRNG for each axis so locking one axis doesn't
  // shift the seeded value of the next axis (keeps existing seeds stable).
  const xRand = next() * tau
  const yRand = next() * tau
  const zRand = next() * tau
  return {
    x: lottery?.x ?? xRand,
    y: lottery?.y ?? yRand,
    z: lottery?.z ?? zRand,
  }
}

/**
 * Generate a mission, optionally forcing a specific objective type.
 *
 * @param difficulty - Mission difficulty in the `[1, 10]` range.
 * @param type - Optional objective type to require, for example `'survey'`.
 * @returns Generated mission matching the requested type when possible.
 */
export function generateMissionWithType(
  difficulty: number,
  type: string | null,
): GeneratedAsteroidMission {
  if (!type) return generateAsteroidMission(difficulty)

  const requiredType = type as ObjectiveType
  for (let i = 0; i < LEVEL_MISSION_TYPE_RETRY_LIMIT; i++) {
    const mission = generateAsteroidMission(difficulty, null, Math.random, requiredType)
    if (mission.objectives.some((objective) => objective.type === type)) return mission
  }

  return generateAsteroidMission(difficulty)
}

/**
 * Resolve the asteroid and terrain seed for the current level launch.
 *
 * Priority: `special mission` → `asteroidId` ad-hoc override →
 * query-driven generated mission → persisted active mission.
 *
 * @param search - URL search string, for example `'?difficulty=5&mission=survey'`.
 * @returns Fully-resolved level mission context.
 */
export function resolveLevelContext(search: string): LevelContext {
  const params = new URLSearchParams(search)
  const paramId = params.get('asteroidId')
  const missionType = params.get('mission')
  const difficulty = Math.max(1, Math.min(10, Number(params.get('difficulty')) || 5))
  const queryOverride = hasLevelRouteQueryOverrideFromSearchParams(params)

  let mission: GeneratedAsteroidMission
  let persistCompletionRewards = false
  const specialMission = missionType ? getSpecialMissionById(missionType) : undefined

  if (specialMission) {
    mission = specialMission
    persistCompletionRewards = true
  } else if (paramId) {
    mission = generateMissionWithType(difficulty, missionType)
    mission.asteroidId = paramId
  } else if (queryOverride) {
    mission = generateMissionWithType(difficulty, missionType)
  } else {
    const stored = loadActiveMission()
    if (!stored) {
      throw new Error(
        '[Level] No active mission in storage. Use /map to launch one, or open /level with ' +
          '?mission=<special-id>, ?asteroidId=…, or both ?difficulty=1-10&mission=' +
          'gather|exterminate|rescue|survey|photometry|collect',
      )
    }
    mission = stored
    persistCompletionRewards = true
  }

  const asteroid = getAsteroidById(mission.asteroidId) ?? ASTEROID_CATALOG[0]!
  const seed = hashLevelSeed(mission.id)

  return { asteroid, seed, mission, persistCompletionRewards }
}
