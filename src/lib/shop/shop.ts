/**
 * Shop buy/sell operations.
 *
 * Pure functions that take a player profile and inventory, perform
 * a transaction, and return updated versions. Credits and items
 * are handled atomically — if any step fails, nothing changes.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { ShopResult } from './types'
import { addCredits, spendCredits } from '@/lib/player/profile'
import { addItem, removeItem, canFitItem } from '@/lib/inventory/inventory'
import { getBuyPrice, getSellPrice } from './catalog'

/**
 * Buy an item from the shop.
 * Checks price, credits, and inventory space atomically.
 */
export function buyItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const price = getBuyPrice(itemId)
  if (price === undefined) {
    return { ok: false, profile, inventory, reason: 'Item not available for purchase' }
  }

  const totalCost = price * quantity

  if (!canFitItem(inventory, itemId, quantity)) {
    return { ok: false, profile, inventory, reason: 'Cannot fit item in inventory' }
  }

  const updatedProfile = spendCredits(profile, totalCost)
  if (!updatedProfile) {
    return { ok: false, profile, inventory, reason: 'Insufficient credits' }
  }

  const addResult = addItem(inventory, itemId, quantity)
  if (!addResult.ok) {
    return { ok: false, profile, inventory, reason: addResult.reason }
  }

  return { ok: true, profile: updatedProfile, inventory: addResult.inventory }
}

/**
 * Sell an item to the shop.
 * Removes item from inventory and credits the player.
 */
export function sellItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const price = getSellPrice(itemId)
  if (price === undefined) {
    return { ok: false, profile, inventory, reason: 'Item cannot be sold' }
  }

  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const totalPayout = price * quantity
  const updatedProfile = addCredits(profile, totalPayout)

  return { ok: true, profile: updatedProfile, inventory: removeResult.inventory }
}
