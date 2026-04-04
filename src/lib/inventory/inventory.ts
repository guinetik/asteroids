/**
 * Inventory operations.
 *
 * Pure functions for creating, querying, and mutating the lander's
 * cargo inventory. All mutation functions return new Inventory
 * objects — they never modify the input. Weight and slot constraints
 * are enforced on every add.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */
import type { Inventory, InventoryResult, InventoryStack } from './types'
import { getItemDefinition } from './catalog'

/** Default cargo hold: 8 slots. */
export const DEFAULT_MAX_SLOTS = 8

/** Default cargo capacity: 500 kg. */
export const DEFAULT_MAX_WEIGHT_KG = 500

/** Create an empty inventory with the given limits. */
export function createInventory(
  maxSlots: number = DEFAULT_MAX_SLOTS,
  maxWeightKg: number = DEFAULT_MAX_WEIGHT_KG,
): Inventory {
  return { stacks: [], maxSlots, maxWeightKg }
}

/** Total weight in kg across all stacks. */
export function getCurrentWeight(inventory: Inventory): number {
  return inventory.stacks.reduce((sum, s) => sum + s.totalWeightKg, 0)
}

/** Number of free slots remaining. */
export function getAvailableSlots(inventory: Inventory): number {
  return inventory.maxSlots - inventory.stacks.length
}

/** Find a stack by item ID, or undefined if not present. */
export function getStack(inventory: Inventory, itemId: string): InventoryStack | undefined {
  return inventory.stacks.find((s) => s.itemId === itemId)
}

/** Check whether the given quantity of an item can be added. */
export function canFitItem(inventory: Inventory, itemId: string, quantity: number): boolean {
  const def = getItemDefinition(itemId)
  if (!def) return false

  const existing = getStack(inventory, itemId)
  const addedWeight = quantity * def.weightPerUnit
  const wouldExceedWeight = getCurrentWeight(inventory) + addedWeight > inventory.maxWeightKg

  if (wouldExceedWeight) return false

  if (existing) {
    return existing.quantity + quantity <= def.maxStack
  }

  return getAvailableSlots(inventory) > 0
}

/** Add items to the inventory. Returns a result with the updated inventory or a failure reason. */
export function addItem(inventory: Inventory, itemId: string, quantity: number): InventoryResult {
  const def = getItemDefinition(itemId)
  if (!def) {
    return { ok: false, inventory, reason: `Unknown item "${itemId}"` }
  }

  const addedWeight = quantity * def.weightPerUnit
  if (getCurrentWeight(inventory) + addedWeight > inventory.maxWeightKg) {
    return { ok: false, inventory, reason: 'Would exceed weight limit' }
  }

  const existing = getStack(inventory, itemId)

  if (existing) {
    if (existing.quantity + quantity > def.maxStack) {
      return { ok: false, inventory, reason: `Would exceed max stack of ${def.maxStack}` }
    }
    const updatedStack: InventoryStack = {
      ...existing,
      quantity: existing.quantity + quantity,
      totalWeightKg: (existing.quantity + quantity) * def.weightPerUnit,
    }
    return {
      ok: true,
      inventory: {
        ...inventory,
        stacks: inventory.stacks.map((s) => (s.itemId === itemId ? updatedStack : s)),
      },
    }
  }

  if (getAvailableSlots(inventory) <= 0) {
    return { ok: false, inventory, reason: 'No available slots' }
  }

  const newStack: InventoryStack = {
    itemId,
    quantity,
    totalWeightKg: quantity * def.weightPerUnit,
  }
  return {
    ok: true,
    inventory: {
      ...inventory,
      stacks: [...inventory.stacks, newStack],
    },
  }
}

/** Remove items from the inventory. Removes the stack entirely if quantity reaches 0. */
export function removeItem(inventory: Inventory, itemId: string, quantity: number): InventoryResult {
  const existing = getStack(inventory, itemId)
  if (!existing) {
    return { ok: false, inventory, reason: `Item "${itemId}" not found in inventory` }
  }

  if (existing.quantity < quantity) {
    return {
      ok: false,
      inventory,
      reason: `Insufficient quantity (have ${existing.quantity}, need ${quantity})`,
    }
  }

  const def = getItemDefinition(itemId)
  const weightPerUnit = def?.weightPerUnit ?? 0
  const newQuantity = existing.quantity - quantity

  if (newQuantity === 0) {
    return {
      ok: true,
      inventory: {
        ...inventory,
        stacks: inventory.stacks.filter((s) => s.itemId !== itemId),
      },
    }
  }

  const updatedStack: InventoryStack = {
    ...existing,
    quantity: newQuantity,
    totalWeightKg: newQuantity * weightPerUnit,
  }
  return {
    ok: true,
    inventory: {
      ...inventory,
      stacks: inventory.stacks.map((s) => (s.itemId === itemId ? updatedStack : s)),
    },
  }
}

/** Consume items (semantic alias for removeItem — fuel burned, ammo spent). */
export function consumeItem(
  inventory: Inventory,
  itemId: string,
  quantity: number,
): InventoryResult {
  return removeItem(inventory, itemId, quantity)
}
