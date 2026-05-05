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
import jovianHektorProspectus from '@/data/missions/jovian-prospection-hektor-prospectus.json'
import jovianSaturnPhotometry from '@/data/missions/jovian-prospection-saturn-photometry.json'
import jovianSaturnDan from '@/data/missions/jovian-prospection-saturn-dan.json'
import finchSaturnTelescope from '@/data/missions/finch-recovery-saturn-telescope.json'
import finchVenusTelescope from '@/data/missions/finch-recovery-venus-telescope.json'
import finchEarthTelescope from '@/data/missions/finch-recovery-earth-telescope.json'
import finchMarsBunker from '@/data/missions/finch-recovery-mars-bunker.json'
import finchCeresBunker from '@/data/missions/finch-recovery-ceres-bunker.json'
import finchNeptuneBunker from '@/data/missions/finch-recovery-neptune-bunker.json'
import ceresEarthSupplies from '@/data/missions/ceres-institute-earth-supplies.json'
import ceresRescue1 from '@/data/missions/ceres-institute-rescue-1.json'
import ceresRescue2 from '@/data/missions/ceres-institute-rescue-2.json'
import ceresMineralAnalysis from '@/data/missions/ceres-institute-mineral-analysis.json'
import ceresDan from '@/data/missions/ceres-institute-dan.json'
import ceresArchiveBunker from '@/data/missions/ceres-institute-archive-bunker.json'

export const SPECIAL_MISSIONS: GeneratedAsteroidMission[] = [
  consortiumCertificationData,
  jovianHektorPhotometry,
  jovianHektorDan,
  jovianHektorProspectus,
  jovianSaturnPhotometry,
  jovianSaturnDan,
  finchSaturnTelescope,
  finchVenusTelescope,
  finchEarthTelescope,
  finchMarsBunker,
  finchCeresBunker,
  finchNeptuneBunker,
  ceresEarthSupplies,
  ceresRescue1,
  ceresRescue2,
  ceresMineralAnalysis,
  ceresDan,
  ceresArchiveBunker,
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
