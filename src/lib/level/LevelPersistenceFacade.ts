/**
 * Level-scoped persistence helpers for inventory pickups and lander hull state.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */

import { addItem } from '@/lib/inventory/inventory'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { loadProfile, saveProfile } from '@/lib/player/profile'

/**
 * Result of trying to persist an inventory pickup.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export interface PersistPickupResult {
  /** Whether the pickup was successfully added and saved. */
  ok: boolean
  /** Human-readable item label for toasts/HUD, for example `Olivine`. */
  label: string
  /** Quantity that was requested to be added. */
  quantity: number
  /** Failure reason when `ok` is false. */
  reason?: string
}

/**
 * Thin facade around level-related storage mutations.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelPersistenceFacade {
  /**
   * Persist a pickup into the player's cargo inventory.
   *
   * @param itemId - Inventory item id.
   * @param quantity - Quantity to add.
   * @returns Structured success/failure result for controller-side reactions.
   */
  persistInventoryPickup(itemId: string, quantity: number): PersistPickupResult {
    const inventory = loadInventory()
    const label = getItemDefinition(itemId)?.label ?? itemId
    if (!inventory) {
      return {
        ok: false,
        label,
        quantity,
        reason: 'Inventory unavailable',
      }
    }

    const result = addItem(inventory, itemId, quantity)
    if (!result.ok) {
      return {
        ok: false,
        label,
        quantity,
        reason: result.reason ?? 'Inventory full',
      }
    }

    saveInventory(result.inventory)
    return { ok: true, label, quantity }
  }

  /**
   * Persist the latest lander hull HP into the player profile when it changed.
   *
   * @param hp - Current lander hull HP.
   */
  flushLanderHullHp(hp: number): void {
    if (typeof localStorage === 'undefined') return
    const stored = loadProfile()
    if (!stored) return
    if (stored.landerHullHp === hp) return
    saveProfile({ ...stored, landerHullHp: hp })
  }
}
