/**
 * Lander fuel-cell inventory helpers for asteroid levels.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
 */
import { consumeItem, getStack } from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import { LANDER_FUEL_ID } from '@/lib/shop/shopSession'

/** Fraction of the active lander's fuel tank restored by one carried lander fuel cell. */
export const LANDER_FUEL_REFILL_FRACTION = 0.5

/**
 * Result of attempting to consume one lander fuel cell.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
 */
export interface LanderFuelCellUseResult {
  /** Whether a `fuel-cell` was consumed successfully. */
  ok: boolean
  /** Updated inventory after the attempted consume. Failed attempts preserve the input inventory. */
  inventory: Inventory
  /** Fuel units the caller should add to the active lander tank. */
  fuelToAdd: number
  /** Remaining `fuel-cell` count after the attempted consume. */
  remainingFuelCells: number
  /** Human-readable failure reason when `ok` is false. */
  reason?: string
}

/**
 * Count carried lander fuel cells in an inventory snapshot.
 *
 * @param inventory - Persisted player cargo inventory.
 * @returns Quantity of `fuel-cell` items available for lander refuel.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
 */
export function countLanderFuelCells(inventory: Inventory): number {
  return getStack(inventory, LANDER_FUEL_ID)?.quantity ?? 0
}

/**
 * Consume one lander fuel cell and calculate the tank refill amount.
 *
 * @param inventory - Persisted player cargo inventory.
 * @param fuelCapacity - Active lander fuel capacity in fuel units.
 * @returns Updated inventory and fuel units to add if a cell was consumed.
 *
 * @author guinetik
 * @date 2026-04-30
 * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
 */
export function useLanderFuelCell(
  inventory: Inventory,
  fuelCapacity: number,
): LanderFuelCellUseResult {
  const available = countLanderFuelCells(inventory)
  if (available <= 0) {
    return {
      ok: false,
      inventory,
      fuelToAdd: 0,
      remainingFuelCells: 0,
      reason: 'No lander fuel cells available',
    }
  }

  const result = consumeItem(inventory, LANDER_FUEL_ID, 1)
  if (!result.ok) {
    return {
      ok: false,
      inventory,
      fuelToAdd: 0,
      remainingFuelCells: available,
      reason: result.reason,
    }
  }

  return {
    ok: true,
    inventory: result.inventory,
    fuelToAdd: Math.max(0, fuelCapacity) * LANDER_FUEL_REFILL_FRACTION,
    remainingFuelCells: countLanderFuelCells(result.inventory),
  }
}
