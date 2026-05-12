/**
 * Turret mining mission pool loader.
 *
 * Imports per-planet turret mining JSON files at build time and exports a
 * typed catalog with lookup helpers. Mirrors {@link evaMissionPools} and
 * {@link shuttleMissionPools}.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type { TurretMiningMissionPool } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import marsData from '@/data/shuttle-missions/mining/mars.json'
import ceresData from '@/data/shuttle-missions/mining/ceres.json'
import jupiterData from '@/data/shuttle-missions/mining/jupiter.json'
import uranusData from '@/data/shuttle-missions/mining/uranus.json'
import neptuneData from '@/data/shuttle-missions/mining/neptune.json'
import plutoData from '@/data/shuttle-missions/mining/pluto.json'

/** All turret mining pools, one per giver planet. */
export const TURRET_MINING_POOLS: TurretMiningMissionPool[] = [
  marsData,
  ceresData,
  jupiterData,
  uranusData,
  neptuneData,
  plutoData,
] as unknown as TurretMiningMissionPool[]

// Validate planet references at module-load time so bad data fails fast.
for (const pool of TURRET_MINING_POOLS) {
  if (!PLANET_IDS.includes(pool.planetId)) {
    throw new Error(`Turret mining pool references unknown planet "${pool.planetId}"`)
  }
}

/** Pools keyed by planet id. */
const POOLS_BY_PLANET: Record<string, TurretMiningMissionPool> = Object.fromEntries(
  TURRET_MINING_POOLS.map((p) => [p.planetId, p]),
)

/**
 * Get the turret mining pool for a planet.
 *
 * @param planetId - Planet id to look up.
 * @returns The pool, or undefined if the planet offers no turret mining missions.
 */
export function getTurretMiningPool(planetId: string): TurretMiningMissionPool | undefined {
  return POOLS_BY_PLANET[planetId]
}
