/**
 * Planet orbital config loader.
 *
 * Imports planet-orbital-config.json at build time and provides
 * lookups for what each planet produces during orbital missions.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { PlanetOrbitalConfig } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import rawData from '@/data/missions/planet-orbital-config.json'

const configs = rawData as unknown as PlanetOrbitalConfig[]

// Validate planet references
for (const cfg of configs) {
  if (!PLANET_IDS.includes(cfg.planetId)) {
    throw new Error(`Planet orbital config references unknown planet "${cfg.planetId}"`)
  }
}

/** All planet orbital configs keyed by planet id. */
export const PLANET_ORBITAL_CONFIGS: Record<string, PlanetOrbitalConfig> = Object.fromEntries(
  configs.map((c) => [c.planetId, c]),
)

/** Get the orbital config for a planet. Returns undefined if the planet has no config. */
export function getPlanetOrbitalConfig(planetId: string): PlanetOrbitalConfig | undefined {
  return PLANET_ORBITAL_CONFIGS[planetId]
}

/** Get the gather item id for a target planet. Returns undefined if not configured. */
export function getGatherItemForPlanet(planetId: string): string | undefined {
  return PLANET_ORBITAL_CONFIGS[planetId]?.gatherItem
}
