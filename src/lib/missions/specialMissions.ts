/**
 * Static “special” asteroid missions merged into the procedural board.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import type { GeneratedAsteroidMission } from './types'

import consortiumCertificationData from '@/data/missions/consortium-certification.json'
import jovianHektorPhotometry from '@/data/missions/jovian-prospection-hektor-photometry.json'
import jovianHektorDan from '@/data/missions/jovian-prospection-hektor-dan.json'
import jovianSaturnPhotometry from '@/data/missions/jovian-prospection-saturn-photometry.json'
import jovianSaturnDan from '@/data/missions/jovian-prospection-saturn-dan.json'

export const SPECIAL_MISSIONS: GeneratedAsteroidMission[] = [
  consortiumCertificationData,
  jovianHektorPhotometry,
  jovianHektorDan,
  jovianSaturnPhotometry,
  jovianSaturnDan,
] as unknown as GeneratedAsteroidMission[]

const SPECIAL_MISSIONS_BY_ID = new Map(
  SPECIAL_MISSIONS.map((mission) => [mission.id, mission] as const),
)

/** Returns a deep-cloned special mission by id, if present. */
export function getSpecialMissionById(id: string): GeneratedAsteroidMission | undefined {
  const mission = SPECIAL_MISSIONS_BY_ID.get(id)
  if (!mission) return undefined
  return structuredClone(mission)
}
