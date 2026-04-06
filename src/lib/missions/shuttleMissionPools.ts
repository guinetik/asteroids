/**
 * Shuttle mission pool loader.
 *
 * Imports per-planet shuttle mission JSON files at build time
 * and exports a typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { ShuttleMissionPool } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import earthData from '@/data/shuttle-missions/earth.json'
import marsData from '@/data/shuttle-missions/mars.json'
import venusData from '@/data/shuttle-missions/venus.json'
import mercuryData from '@/data/shuttle-missions/mercury.json'
import jupiterData from '@/data/shuttle-missions/jupiter.json'
import saturnData from '@/data/shuttle-missions/saturn.json'
import uranusData from '@/data/shuttle-missions/uranus.json'
import neptuneData from '@/data/shuttle-missions/neptune.json'

/** All shuttle mission pools, one per planet. */
export const SHUTTLE_MISSION_POOLS: ShuttleMissionPool[] = [
  earthData,
  marsData,
  venusData,
  mercuryData,
  jupiterData,
  saturnData,
  uranusData,
  neptuneData,
] as unknown as ShuttleMissionPool[]

// Validate planet references
for (const pool of SHUTTLE_MISSION_POOLS) {
  if (!PLANET_IDS.includes(pool.planetId)) {
    throw new Error(`Shuttle mission pool references unknown planet "${pool.planetId}"`)
  }
  for (const m of pool.missions) {
    if (!PLANET_IDS.includes(m.targetPlanet)) {
      throw new Error(`Mission "${m.id}" targets unknown planet "${m.targetPlanet}"`)
    }
  }
}

/** Mission pools keyed by planet id. */
const POOLS_BY_PLANET: Record<string, ShuttleMissionPool> = Object.fromEntries(
  SHUTTLE_MISSION_POOLS.map((p) => [p.planetId, p]),
)

/** Get the shuttle mission pool for a planet. Returns undefined if planet has no pool. */
export function getMissionPool(planetId: string): ShuttleMissionPool | undefined {
  return POOLS_BY_PLANET[planetId]
}
