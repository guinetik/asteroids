/**
 * Relay repair difficulty-tier table. Inner planets yield easier puzzles
 * (fewer cells misrotated); outer planets harder. Unknown planets fall back
 * to tier 1 so no mission ever hits an unplayable roll.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

/** Difficulty tier — 1 = easy, 2 = medium, 3 = hard. */
export type RelayDifficultyTier = 1 | 2 | 3

/** Tier mapping by giver planet id. */
const TIER_BY_PLANET: Readonly<Record<string, RelayDifficultyTier>> = {
  mercury: 1,
  venus: 1,
  earth: 1,
  mars: 2,
  jupiter: 2,
  saturn: 3,
  uranus: 3,
  neptune: 3,
}

/** Number of cells misrotated at each tier. */
export const WRONG_CELLS_BY_TIER: Readonly<Record<RelayDifficultyTier, number>> = {
  1: 2,
  2: 3,
  3: 4,
}

/**
 * Look up the difficulty tier for a given planet. Unknown planets → tier 1.
 *
 * @param giverPlanet - Planet id the mission originated from.
 * @returns Difficulty tier.
 */
export function getRelayDifficulty(giverPlanet: string): RelayDifficultyTier {
  return TIER_BY_PLANET[giverPlanet] ?? 1
}
