/**
 * Item catalog loader.
 *
 * Imports the item manifest JSON at build time, validates all
 * entries, and exports a keyed catalog for O(1) lookups.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */
import type { ItemDefinition, ItemCategory } from './types'

import itemsData from '@/data/inventory/items.json'

const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good', 'mission-material'])

function validateItem(item: ItemDefinition): ItemDefinition {
  if (!item.id || !item.label || !item.description || !item.icon) {
    throw new Error(`Item "${item.id}" missing required string fields`)
  }
  if (!VALID_CATEGORIES.has(item.category)) {
    throw new Error(`Item "${item.id}" has invalid category "${item.category}"`)
  }
  if (item.weightPerUnit <= 0) {
    throw new Error(`Item "${item.id}" has non-positive weightPerUnit`)
  }
  if (item.maxStack <= 0) {
    throw new Error(`Item "${item.id}" has non-positive maxStack`)
  }
  return item
}

const items = (itemsData as unknown as ItemDefinition[]).map(validateItem)

/** All game items keyed by ID for O(1) lookup. */
export const ITEM_CATALOG: Record<string, ItemDefinition> = Object.fromEntries(
  items.map((item) => [item.id, item]),
)

/** Look up an item by its unique ID. Returns `undefined` if not found. */
export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_CATALOG[id]
}

/** Get all items in a given category. */
export function getItemsByCategory(category: ItemCategory): ItemDefinition[] {
  return items.filter((item) => item.category === category)
}
