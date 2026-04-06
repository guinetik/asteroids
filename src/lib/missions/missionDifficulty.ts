/**
 * Mission difficulty derivation from player upgrade levels.
 *
 * Maps the average upgrade level (0-3) linearly to mission
 * difficulty (1-10). Higher upgrades unlock harder missions
 * in deeper belt regions.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import { UPGRADE_DEFINITIONS, type UpgradeId, type UpgradeLevels } from '@/lib/upgrades'

/** Maximum upgrade level across all upgrade definitions. */
const MAX_UPGRADE_LEVEL = 3

/** Minimum mission difficulty. */
const MIN_DIFFICULTY = 1

/** Maximum mission difficulty. */
const MAX_DIFFICULTY = 10

/**
 * Compute mission difficulty from the player's upgrade levels.
 *
 * @param levels - Current player upgrade levels (0-3 each).
 * @returns Difficulty level from 1 (fresh player) to 10 (fully upgraded).
 */
export function computeMissionDifficulty(levels: UpgradeLevels): number {
  const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]
  const sum = upgradeIds.reduce((acc, id) => acc + (levels[id] ?? 0), 0)
  const avg = sum / upgradeIds.length
  const raw =
    Math.floor((avg / MAX_UPGRADE_LEVEL) * (MAX_DIFFICULTY - MIN_DIFFICULTY)) + MIN_DIFFICULTY
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, raw))
}
