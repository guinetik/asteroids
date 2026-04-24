/**
 * Pure helpers for the map view's shuttle inventory lifecycle.
 *
 * All functions take the inputs they need and return new values — no singletons, no
 * implicit reads from `@/lib/upgrades`. The controller resolves the current cargo-bay
 * multiplier + starter quantities at the call site and threads them in.
 *
 * Extracted from {@link MapViewController} so inventory initialization + resizing can
 * be tested without spinning up a full controller.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import {
  addItem,
  createInventory,
  getStack,
  DEFAULT_MAX_SLOTS,
  DEFAULT_MAX_WEIGHT_KG,
} from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import { LANDER_FUEL_ID, RESERVE_FUEL_ID } from '@/lib/shop/shopSession'

/** Starter-fuel quantities the controller threads into the inventory helpers. */
export interface StarterFuelCellCounts {
  /** Shuttle reserve fuel cell count applied to fresh holds. */
  shuttle: number
  /** Lander fuel cell count applied to fresh holds. */
  lander: number
}

/**
 * Build an empty {@link Inventory} sized by the current cargo-bay upgrade multiplier.
 *
 * @param cargoMultiplier - Current `shuttleCargoBay` upgrade value (1.0 → 2.0).
 * @returns A fresh inventory with `maxSlots` and `maxWeightKg` scaled by the multiplier.
 */
export function createInventoryForCargoBay(cargoMultiplier: number): Inventory {
  return createInventory(
    Math.round(DEFAULT_MAX_SLOTS * cargoMultiplier),
    Math.round(DEFAULT_MAX_WEIGHT_KG * cargoMultiplier),
  )
}

/**
 * Keep the current inventory contents but resize slot/weight caps to the installed
 * cargo bay. Called after loading a save and after `shuttleCargoBay` purchases.
 *
 * @param inventory - Current inventory.
 * @param cargoMultiplier - Current `shuttleCargoBay` upgrade value.
 * @returns New inventory object with updated caps; stacks array is shared (shallow copy at top).
 */
export function applyCargoBayLimits(
  inventory: Inventory,
  cargoMultiplier: number,
): Inventory {
  return {
    ...inventory,
    maxSlots: Math.round(DEFAULT_MAX_SLOTS * cargoMultiplier),
    maxWeightKg: Math.round(DEFAULT_MAX_WEIGHT_KG * cargoMultiplier),
  }
}

/**
 * Add starter shuttle and lander fuel cells to an empty cargo hold (new game or death respawn).
 *
 * @param emptyHold - Fresh inventory with correct bay limits and no stacks.
 * @param counts - Starter shuttle + lander fuel cell counts.
 * @returns Inventory including the reserve shuttle cells and lander cells when `addItem` succeeds.
 */
export function inventoryWithStarterFuelCells(
  emptyHold: Inventory,
  counts: StarterFuelCellCounts,
): Inventory {
  let inv = emptyHold
  const addReserve = addItem(inv, RESERVE_FUEL_ID, counts.shuttle)
  if (!addReserve.ok) return inv
  inv = addReserve.inventory
  const addLander = addItem(inv, LANDER_FUEL_ID, counts.lander)
  return addLander.ok ? addLander.inventory : inv
}

/**
 * Ensure at least `counts.shuttle` reserve cells and `counts.lander` lander cells
 * (e.g. after loading a save that predates fuel grants or had zero stacks).
 *
 * @param inventory - Current hold (already cargo-bay sized).
 * @param counts - Minimum shuttle + lander fuel cell counts.
 * @returns Updated inventory when adds succeed; otherwise the input reference.
 */
export function ensureMinimumStarterFuelCells(
  inventory: Inventory,
  counts: StarterFuelCellCounts,
): Inventory {
  let inv = inventory
  const reserveQty = getStack(inv, RESERVE_FUEL_ID)?.quantity ?? 0
  if (reserveQty < counts.shuttle) {
    const delta = counts.shuttle - reserveQty
    const r = addItem(inv, RESERVE_FUEL_ID, delta)
    if (r.ok) inv = r.inventory
  }
  const landerQty = getStack(inv, LANDER_FUEL_ID)?.quantity ?? 0
  if (landerQty < counts.lander) {
    const delta = counts.lander - landerQty
    const r = addItem(inv, LANDER_FUEL_ID, delta)
    if (r.ok) inv = r.inventory
  }
  return inv
}
