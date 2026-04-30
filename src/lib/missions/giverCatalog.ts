/**
 * Mission giver catalog loader.
 *
 * Imports all mission giver manifest JSON files at build time
 * and exports a typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { MissionGiver } from './types'
import type { PlayerProfile } from '@/lib/player/types'
import { hasStoryFlag } from '@/lib/player/profile'

import jayData from '@/data/missions/givers/jay-mercer.json'
import beltMiningData from '@/data/missions/givers/belt-mining-corp.json'
import frontierRescueData from '@/data/missions/givers/frontier-rescue.json'
import colonialGuardData from '@/data/missions/givers/colonial-guard.json'
import jovianSocietyData from '@/data/missions/givers/jovian-society.json'
import cinderlineData from '@/data/missions/givers/cinderline.json'
import lucasMaverickData from '@/data/missions/givers/lucas-maverick.json'
import martianMarinesBunkerData from '@/data/missions/givers/martian-marines-bunker.json'
import mrFinchData from '@/data/missions/givers/mr-finch.json'
import cloudCityOpsData from '@/data/missions/givers/cloud-city-ops.json'

/** All mission givers loaded from JSON. */
export const MISSION_GIVERS: MissionGiver[] = [
  jayData,
  beltMiningData,
  frontierRescueData,
  colonialGuardData,
  jovianSocietyData,
  cinderlineData,
  lucasMaverickData,
  martianMarinesBunkerData,
  mrFinchData,
  cloudCityOpsData,
] as unknown as MissionGiver[]

/** Mission givers keyed by id. */
const GIVERS_BY_ID: Record<string, MissionGiver> = Object.fromEntries(
  MISSION_GIVERS.map((g) => [g.id, g]),
)

/**
 * Get a giver by id. Returns undefined if not found.
 *
 * @param id - Giver id to look up.
 * @returns The giver with that id, or undefined.
 */
export function getGiverById(id: string): MissionGiver | undefined {
  return GIVERS_BY_ID[id]
}

/**
 * Surfaces all givers eligible at `difficulty`, filtered by:
 * - `profile.disabledGiverIds` — skip blacklisted givers (e.g. post-tamper Jovian Society).
 * - giver-level `requiresFlag` — skip when the named story flag is absent.
 *
 * @param difficulty - Mission difficulty in the `[1, 10]` range.
 * @param profile - Player profile (drives `disabledGiverIds` and story flags).
 * @param givers - Optional override (for tests). Defaults to `MISSION_GIVERS`.
 * @returns Filtered, eligible givers.
 */
export function getGiversForDifficulty(
  difficulty: number,
  profile: PlayerProfile = {} as PlayerProfile,
  givers: readonly MissionGiver[] = MISSION_GIVERS,
): MissionGiver[] {
  return givers.filter((g) => {
    if (g.minDifficulty > difficulty) return false
    if (g.maxDifficulty < difficulty) return false
    if (profile.disabledGiverIds?.[g.id]) return false
    if (g.requiresFlag !== undefined && !hasStoryFlag(profile, g.requiresFlag)) return false
    return true
  })
}
