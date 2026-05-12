/**
 * Shuttle EVA (visit-relay) mission pool loader.
 *
 * Imports per-planet EVA mission JSON files at build time and exports a
 * typed catalog with lookup helpers. Mirrors {@link shuttleMissionPools}
 * but for the EVA flavor of shuttle missions.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import type { VisitRelayMissionPool } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import mercuryData from '@/data/shuttle-missions/eva/mercury.json'
import venusData from '@/data/shuttle-missions/eva/venus.json'
import earthData from '@/data/shuttle-missions/eva/earth.json'
import marsData from '@/data/shuttle-missions/eva/mars.json'
import ceresData from '@/data/shuttle-missions/eva/ceres.json'
import jupiterData from '@/data/shuttle-missions/eva/jupiter.json'
import saturnData from '@/data/shuttle-missions/eva/saturn.json'
import uranusData from '@/data/shuttle-missions/eva/uranus.json'
import neptuneData from '@/data/shuttle-missions/eva/neptune.json'

/** All EVA mission pools, one per planet that offers them. */
export const EVA_MISSION_POOLS: VisitRelayMissionPool[] = [
  mercuryData,
  venusData,
  earthData,
  marsData,
  ceresData,
  jupiterData,
  saturnData,
  uranusData,
  neptuneData,
] as unknown as VisitRelayMissionPool[]

// Validate planet references
for (const pool of EVA_MISSION_POOLS) {
  if (!PLANET_IDS.includes(pool.planetId)) {
    throw new Error(`EVA mission pool references unknown planet "${pool.planetId}"`)
  }
}

/** EVA mission pools keyed by planet id. */
const POOLS_BY_PLANET: Record<string, VisitRelayMissionPool> = Object.fromEntries(
  EVA_MISSION_POOLS.map((p) => [p.planetId, p]),
)

/**
 * Get the EVA mission pool for a planet.
 *
 * @param planetId - Planet id to look up.
 * @returns The pool, or undefined if the planet offers no EVA missions.
 */
export function getEvaMissionPool(planetId: string): VisitRelayMissionPool | undefined {
  return POOLS_BY_PLANET[planetId]
}
