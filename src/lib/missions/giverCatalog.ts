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

import jayData from '@/data/missions/givers/jay-mercer.json'
import beltMiningData from '@/data/missions/givers/belt-mining-corp.json'
import frontierRescueData from '@/data/missions/givers/frontier-rescue.json'
import colonialGuardData from '@/data/missions/givers/colonial-guard.json'
import jovianSocietyData from '@/data/missions/givers/jovian-society.json'

/** All mission givers loaded from JSON. */
export const MISSION_GIVERS: MissionGiver[] = [
  jayData,
  beltMiningData,
  frontierRescueData,
  colonialGuardData,
  jovianSocietyData,
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
 * Get all givers whose difficulty range covers the given difficulty.
 *
 * @param difficulty - Player mission difficulty (1-10).
 * @returns Givers that operate at this difficulty level.
 */
export function getGiversForDifficulty(difficulty: number): MissionGiver[] {
  return MISSION_GIVERS.filter(
    (g) => g.minDifficulty <= difficulty && g.maxDifficulty >= difficulty,
  )
}
