/**
 * Pure credit checks for purchasing the next upgrade level.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import { spendCredits } from '@/lib/player/profile'
import { getUpgradeCost, UPGRADE_DEFINITIONS, type UpgradeId } from '@/lib/upgrades'

/** Failure reasons for {@link tryPurchaseNextUpgradeLevel}. */
export type PurchaseUpgradeFailureReason = 'max_level' | 'insufficient_credits'

/**
 * Attempt to buy the next level for an upgrade (e.g. 0→1, 1→2).
 *
 * Does not mutate any global state; caller applies `profile` and level bumps.
 *
 * @param profile - Current player profile (credits).
 * @param upgradeId - Upgrade to advance.
 * @param currentLevel - Player's current level for this upgrade (0..max).
 */
export function tryPurchaseNextUpgradeLevel(
  profile: PlayerProfile,
  upgradeId: UpgradeId,
  currentLevel: number,
):
  | { ok: true; profile: PlayerProfile; newLevel: number; creditsSpent: number }
  | { ok: false; reason: PurchaseUpgradeFailureReason } {
  const definition = UPGRADE_DEFINITIONS[upgradeId]
  const nextLevel = currentLevel + 1
  if (nextLevel > definition.maxLevel) {
    return { ok: false, reason: 'max_level' }
  }
  const creditsSpent = getUpgradeCost(upgradeId, nextLevel)
  const updated = spendCredits(profile, creditsSpent)
  if (!updated) {
    return { ok: false, reason: 'insufficient_credits' }
  }
  return { ok: true, profile: updated, newLevel: nextLevel, creditsSpent }
}
