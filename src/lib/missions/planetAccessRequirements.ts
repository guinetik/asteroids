/**
 * Planet access requirements for shuttle missions.
 *
 * Loads planet-access-requirements.json and provides a check for
 * whether the player's upgrade levels allow visiting a target planet.
 * Planets not listed have no requirement (always accessible).
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { PlanetAccessRequirement } from './types'
import type { UpgradeLevels } from '@/lib/upgrades'

import rawData from '@/data/missions/planet-access-requirements.json'

const requirements = rawData as unknown as PlanetAccessRequirement[]

/** Planet access requirements keyed by planet id. */
const REQUIREMENTS_BY_PLANET: Record<string, PlanetAccessRequirement> = Object.fromEntries(
  requirements.map((r) => [r.planetId, r]),
)

/**
 * Check whether the player can access a planet given their upgrade levels.
 * Planets with no requirement entry are always accessible.
 *
 * @param planetId - Target planet to check.
 * @param upgradeLevels - Current player upgrade levels.
 * @returns True if the player meets the upgrade requirement.
 */
export function canAccessPlanet(planetId: string, upgradeLevels: UpgradeLevels): boolean {
  const req = REQUIREMENTS_BY_PLANET[planetId]
  if (!req) return true
  const playerLevel = upgradeLevels[req.upgradeId as keyof typeof upgradeLevels] ?? 0
  return playerLevel >= req.minLevel
}
