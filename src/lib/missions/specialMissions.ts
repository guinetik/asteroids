import type { GeneratedAsteroidMission } from './types'

import consortiumCertificationData from '@/data/missions/consortium-certification.json'

export const SPECIAL_MISSIONS: GeneratedAsteroidMission[] = [
  consortiumCertificationData,
] as unknown as GeneratedAsteroidMission[]

const SPECIAL_MISSIONS_BY_ID = new Map(
  SPECIAL_MISSIONS.map((mission) => [mission.id, mission] as const),
)

export function getSpecialMissionById(id: string): GeneratedAsteroidMission | undefined {
  const mission = SPECIAL_MISSIONS_BY_ID.get(id)
  if (!mission) return undefined
  return structuredClone(mission)
}
