/**
 * Compares live cargo to a level-entry snapshot so failed runs can strip only
 * quantities gained after drop while preserving gear the pilot brought from orbit.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-run-inventory-baseline-design.md
 */
import { getStack, removeItem } from './inventory'
import type { Inventory } from './types'

/**
 * Deep-clone an inventory for an immutable baseline snapshot (stack rows copied).
 *
 * @param inventory - Live shuttle hold to copy.
 * @returns Independent inventory with the same caps and stack quantities.
 */
export function cloneInventory(inventory: Inventory): Inventory {
  return {
    maxSlots: inventory.maxSlots,
    maxWeightKg: inventory.maxWeightKg,
    stacks: inventory.stacks.map((s) => ({ ...s })),
  }
}

/**
 * For each item id, returns how many more units the player holds now than at
 * baseline. Omits ids with zero or negative delta (jettison / consumption).
 *
 * @param baseline - Quantities at level entry (or last restart).
 * @param current - Persisted hold after pickups and jettisons this sortie.
 * @returns Map from catalog id to non-negative delta.
 */
export function inventoryQuantitiesGainedSince(
  baseline: Inventory,
  current: Inventory,
): Map<string, number> {
  const gains = new Map<string, number>()
  for (const stack of current.stacks) {
    const baseQty = getStack(baseline, stack.itemId)?.quantity ?? 0
    const delta = stack.quantity - baseQty
    if (delta > 0) gains.set(stack.itemId, delta)
  }
  return gains
}

/**
 * Remove {@link inventoryQuantitiesGainedSince} from `current` in one pass.
 * Caps and limits are taken from `current` so shuttle upgrades stay consistent.
 *
 * @param baseline - Protected floor captured when the sortie began.
 * @param current - Hold after this attempt; typically `loadInventory()`.
 * @returns New inventory equal to `current` minus run-only gains.
 */
export function stripInventoryGainedSinceBaseline(
  baseline: Inventory,
  current: Inventory,
): Inventory {
  const gains = inventoryQuantitiesGainedSince(baseline, current)
  let next = current
  for (const [itemId, qty] of gains) {
    const result = removeItem(next, itemId, qty)
    if (result.ok) next = result.inventory
  }
  return next
}
