/**
 * Inventory and item data model.
 *
 * Defines item definitions (loaded from JSON), inventory stacks,
 * and the inventory container with slot + weight constraints.
 * Used by the cargo system, shop, and mission reward logic.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */

/** Item classification determining behavior and UI grouping. */
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good' | 'mission-material'

/** An item definition from the JSON manifest. */
export interface ItemDefinition {
  /** Unique key, e.g. "olivine", "fuel-cell", "minigun". */
  id: string
  /** Classification: mineral, upgrade, consumable, or equipment. */
  category: ItemCategory
  /** Display name for UI, e.g. "Olivine", "Fuel Cell". */
  label: string
  /** Flavor text for tooltips and detail views. */
  description: string
  /** Icon filename in public/images/items/. */
  icon: string
  /** Fixed weight in kilograms per unit. */
  weightPerUnit: number
  /** Maximum units allowed in a single inventory slot. 1 for upgrades/equipment. */
  maxStack: number
  /** Whether the shop will buy this item from the player. Minerals are sellable. */
  sellable: boolean
}

/** A stack of identical items occupying one inventory slot. */
export interface InventoryStack {
  /** References an ItemDefinition.id from the catalog. */
  itemId: string
  /** Number of units in this stack. */
  quantity: number
  /** Precomputed total weight: quantity × weightPerUnit. */
  totalWeightKg: number
}

/** The lander's cargo hold with slot and weight constraints. */
export interface Inventory {
  /** Active item stacks. Each stack occupies one slot. */
  stacks: InventoryStack[]
  /** Maximum number of distinct stacks (slots). */
  maxSlots: number
  /** Maximum total cargo weight in kilograms. */
  maxWeightKg: number
}

/** Result of an inventory mutation (add/remove/consume). */
export interface InventoryResult {
  /** Whether the operation succeeded. */
  ok: boolean
  /** The inventory after the operation (unchanged if ok is false). */
  inventory: Inventory
  /** Explanation when ok is false, e.g. "No available slots". */
  reason?: string
}
