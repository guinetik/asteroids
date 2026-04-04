/**
 * Mission template loader.
 *
 * Imports all mission template JSON files at build time via Vite
 * static imports and exports the typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-mission-templates-design.md
 */
import type { MissionTemplate, MissionRegion } from './types'

import miningContractData from '@/data/missions/mining-contract.json'
import pestControlData from '@/data/missions/pest-control.json'
import searchAndRescueData from '@/data/missions/search-and-rescue.json'
import hazardCleanupData from '@/data/missions/hazard-cleanup.json'
import colonyReliefData from '@/data/missions/colony-relief.json'

/** All mission templates, loaded and typed from JSON data files. */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  miningContractData,
  pestControlData,
  searchAndRescueData,
  hazardCleanupData,
  colonyReliefData,
] as unknown as MissionTemplate[]

/** Look up a mission template by its unique ID. Returns `undefined` if not found. */
export function getTemplateById(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((t) => t.id === id)
}

/** Get all templates available at a given difficulty level (1–10). */
export function getTemplatesForDifficulty(difficulty: number): MissionTemplate[] {
  return MISSION_TEMPLATES.filter(
    (t) => t.minDifficulty <= difficulty && t.maxDifficulty >= difficulty,
  )
}

/** Get the region for a mission at a given difficulty level. */
export function getRegionForDifficulty(
  template: MissionTemplate,
  difficulty: number,
): MissionRegion | undefined {
  for (const [region, [min, max]] of Object.entries(template.regionByDifficulty)) {
    if (difficulty >= min && difficulty <= max) {
      return region as MissionRegion
    }
  }
  return undefined
}
