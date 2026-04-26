import { beforeEach, describe, expect, it } from 'vitest'
import { addItem, createInventory } from '../inventory'
import {
  clearInventory,
  INVENTORY_STORAGE_KEY,
  loadInventory,
  saveInventory,
} from '../inventoryStorage'

describe('inventoryStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips a saved inventory', () => {
    const inventory = addItem(createInventory(10, 600), 'fuel-cell', 2).inventory

    saveInventory(inventory)

    expect(loadInventory()).toEqual(inventory)
  })

  it('returns null for invalid saved data', () => {
    localStorage.setItem(
      INVENTORY_STORAGE_KEY,
      JSON.stringify({
        maxSlots: 8,
        maxWeightKg: 500,
        stacks: [{ itemId: 'unknown-item', quantity: 1, totalWeightKg: 1 }],
      }),
    )

    expect(loadInventory()).toBeNull()
  })

  it('clears the saved inventory', () => {
    saveInventory(createInventory())
    clearInventory()
    expect(loadInventory()).toBeNull()
  })
})
