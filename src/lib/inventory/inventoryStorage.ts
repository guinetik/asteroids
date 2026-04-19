/**
 * Shuttle inventory localStorage persistence.
 *
 * Keeps the map cargo state available across route changes so level rewards can
 * write into the same shuttle inventory the hub uses.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */
import { addItem, createInventory } from './inventory'
import { getItemDefinition } from './catalog'
import type { Inventory } from './types'

/** Versioned localStorage key for the shuttle inventory save. */
export const INVENTORY_STORAGE_KEY = 'asteroid-lander-shuttle-inventory-v1'

/** Parses persisted JSON into an {@link Inventory}, or `null` if the payload is invalid. */
function normalizeLoadedInventory(data: unknown): Inventory | null {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null

  const parsed = data as Partial<Inventory>
  if (
    typeof parsed.maxSlots !== 'number'
    || typeof parsed.maxWeightKg !== 'number'
    || !Array.isArray(parsed.stacks)
  ) {
    return null
  }

  let inventory = createInventory(parsed.maxSlots, parsed.maxWeightKg)
  for (const stack of parsed.stacks) {
    if (stack === null || typeof stack !== 'object' || Array.isArray(stack)) return null
    const candidate = stack as { itemId?: unknown; quantity?: unknown }
    if (typeof candidate.itemId !== 'string' || typeof candidate.quantity !== 'number') return null
    if (!Number.isInteger(candidate.quantity) || candidate.quantity <= 0) return null
    if (!getItemDefinition(candidate.itemId)) return null

    const result = addItem(inventory, candidate.itemId, candidate.quantity)
    if (!result.ok) return null
    inventory = result.inventory
  }

  return inventory
}

/** Serialize and save the shuttle inventory to localStorage. */
export function saveInventory(inventory: Inventory): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(inventory))
}

/** Load the shuttle inventory from localStorage. Returns null if missing or corrupted. */
export function loadInventory(): Inventory | null {
  if (typeof localStorage === 'undefined') return null

  const raw = localStorage.getItem(INVENTORY_STORAGE_KEY)
  if (raw === null) return null

  try {
    return normalizeLoadedInventory(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

/** Remove the persisted shuttle inventory from localStorage. */
export function clearInventory(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(INVENTORY_STORAGE_KEY)
}
