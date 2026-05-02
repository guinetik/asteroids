import { describe, it, expect } from 'vitest'
import { addItem, createInventory, removeItem } from '../inventory'
import {
  cloneInventory,
  inventoryQuantitiesGainedSince,
  stripInventoryGainedSinceBaseline,
} from '../inventoryRunBaseline'

describe('cloneInventory', () => {
  it('copies stacks without aliasing', () => {
    const base = addItem(createInventory(), 'olivine', 5).inventory
    const copy = cloneInventory(base)
    expect(copy).toEqual(base)
    const bumped = addItem(base, 'olivine', 1).inventory
    expect(copy.stacks[0]?.quantity).toBe(5)
    expect(bumped.stacks[0]?.quantity).toBe(6)
  })
})

describe('inventoryQuantitiesGainedSince', () => {
  it('reports only positive deltas vs baseline', () => {
    let baseline = createInventory()
    baseline = addItem(baseline, 'olivine', 10).inventory
    baseline = addItem(baseline, 'magnetite', 4).inventory

    let current = cloneInventory(baseline)
    current = addItem(current, 'olivine', 3).inventory
    current = addItem(current, 'iron-sulfides', 2).inventory

    const gains = inventoryQuantitiesGainedSince(baseline, current)
    expect(gains.get('olivine')).toBe(3)
    expect(gains.get('iron-sulfides')).toBe(2)
    expect(gains.has('magnetite')).toBe(false)
  })

  it('returns empty map when jettison drops below baseline for an id', () => {
    const baseline = addItem(createInventory(), 'olivine', 10).inventory
    let current = addItem(cloneInventory(baseline), 'olivine', 5).inventory
    current = removeItem(current, 'olivine', 10).inventory
    const gains = inventoryQuantitiesGainedSince(baseline, current)
    expect(gains.size).toBe(0)
  })
})

describe('stripInventoryGainedSinceBaseline', () => {
  it('removes only quantities above baseline', () => {
    let baseline = createInventory()
    baseline = addItem(baseline, 'olivine', 10).inventory
    baseline = addItem(baseline, 'magnetite', 4).inventory

    let current = cloneInventory(baseline)
    current = addItem(current, 'olivine', 3).inventory
    current = addItem(current, 'iron-sulfides', 2).inventory

    const stripped = stripInventoryGainedSinceBaseline(baseline, current)
    expect(stripped.stacks.find((s) => s.itemId === 'olivine')?.quantity).toBe(10)
    expect(stripped.stacks.find((s) => s.itemId === 'magnetite')?.quantity).toBe(4)
    expect(stripped.stacks.find((s) => s.itemId === 'iron-sulfides')).toBeUndefined()
  })

  it('is idempotent after strip', () => {
    const baseline = addItem(createInventory(), 'olivine', 10).inventory
    const current = addItem(cloneInventory(baseline), 'olivine', 5).inventory
    const once = stripInventoryGainedSinceBaseline(baseline, current)
    const twice = stripInventoryGainedSinceBaseline(baseline, once)
    expect(twice).toEqual(once)
  })
})
