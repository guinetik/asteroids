/**
 * Pure progress helpers for Pimp My Shuttle–gated achievements (paint, trails, intake payouts).
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-30-pimp-my-shuttle-shop-design.md
 */

import { getCosmeticOptions } from '@/lib/cosmetics/catalog'
import type { CosmeticCategory, PlayerCosmetics } from '@/lib/cosmetics/types'

/**
 * Counts catalog rows in a category the player both owns and paid credits for (`price > 0`).
 *
 * @param cosmetics - Persisted ownership + selections.
 * @param category - Cosmetic tab category, e.g. `'shuttle-paintjob'`.
 * @returns Number of owned paid SKUs, e.g. `1` after the first premium paint purchase.
 */
export function countOwnedPaidCosmeticSkus(
  cosmetics: PlayerCosmetics,
  category: CosmeticCategory,
): number {
  const owned = new Set(cosmetics.ownedOptionIds)
  return getCosmeticOptions(category).filter((row) => row.price > 0 && owned.has(row.id)).length
}

/**
 * Counts how many catalog rows in a category appear in {@link PlayerCosmetics.ownedOptionIds}.
 *
 * @param cosmetics - Persisted ownership + selections.
 * @param category - Cosmetic tab category.
 */
export function countOwnedCosmeticSkusInCategory(
  cosmetics: PlayerCosmetics,
  category: CosmeticCategory,
): number {
  const owned = new Set(cosmetics.ownedOptionIds)
  return getCosmeticOptions(category).filter((row) => owned.has(row.id)).length
}

/**
 * Total catalog rows in a category (including free defaults).
 *
 * @param category - Cosmetic tab category.
 */
export function totalCosmeticSkuCount(category: CosmeticCategory): number {
  return getCosmeticOptions(category).length
}

/**
 * True when every catalog row in the category is owned (full collection).
 *
 * @param cosmetics - Persisted ownership + selections.
 * @param category - Cosmetic tab category.
 */
export function ownsEveryCosmeticSku(
  cosmetics: PlayerCosmetics,
  category: CosmeticCategory,
): boolean {
  const owned = new Set(cosmetics.ownedOptionIds)
  return getCosmeticOptions(category).every((row) => owned.has(row.id))
}
