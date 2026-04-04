import { describe, it, expect } from 'vitest'
import { ITEM_CATALOG, getItemDefinition, getItemsByCategory } from '../catalog'
import type { ItemCategory } from '../types'

const VALID_CATEGORIES = new Set<ItemCategory>(['mineral', 'upgrade', 'consumable', 'equipment'])

describe('ITEM_CATALOG', () => {
  it('contains 21 items', () => {
    expect(Object.keys(ITEM_CATALOG)).toHaveLength(21)
  })

  it('all items have valid category', () => {
    for (const [_id, item] of Object.entries(ITEM_CATALOG)) {
      expect(VALID_CATEGORIES.has(item.category)).toBe(true)
    }
  })

  it('all items have positive weightPerUnit', () => {
    for (const [_id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.weightPerUnit).toBeGreaterThan(0)
    }
  })

  it('all items have positive maxStack', () => {
    for (const [_id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.maxStack).toBeGreaterThan(0)
    }
  })

  it('all items have non-empty label and description', () => {
    for (const [_id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.label).toBeTruthy()
      expect(item.description).toBeTruthy()
    }
  })

  it('all item IDs match their catalog key', () => {
    for (const [key, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.id).toBe(key)
    }
  })

  it('equipment and upgrades have maxStack of 1', () => {
    const nonStackable = Object.values(ITEM_CATALOG).filter(
      (item) => item.category === 'equipment' || item.category === 'upgrade',
    )
    for (const item of nonStackable) {
      expect(item.maxStack).toBe(1)
    }
  })

  it('all minerals are sellable', () => {
    const minerals = Object.values(ITEM_CATALOG).filter(
      (item) => item.category === 'mineral',
    )
    for (const item of minerals) {
      expect(item.sellable).toBe(true)
    }
  })
})

describe('getItemDefinition', () => {
  it('returns the correct item for a known ID', () => {
    const item = getItemDefinition('olivine')
    expect(item).toBeDefined()
    expect(item!.label).toBe('Olivine')
    expect(item!.category).toBe('mineral')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getItemDefinition('nonexistent')).toBeUndefined()
  })
})

describe('getItemsByCategory', () => {
  it('returns only minerals for mineral category', () => {
    const minerals = getItemsByCategory('mineral')
    expect(minerals.length).toBe(10)
    for (const item of minerals) {
      expect(item.category).toBe('mineral')
    }
  })

  it('returns only consumables for consumable category', () => {
    const consumables = getItemsByCategory('consumable')
    expect(consumables.length).toBe(4)
    for (const item of consumables) {
      expect(item.category).toBe('consumable')
    }
  })

  it('returns only equipment for equipment category', () => {
    const equipment = getItemsByCategory('equipment')
    expect(equipment.length).toBe(3)
    for (const item of equipment) {
      expect(item.category).toBe('equipment')
    }
  })

  it('returns only upgrades for upgrade category', () => {
    const upgrades = getItemsByCategory('upgrade')
    expect(upgrades.length).toBe(4)
    for (const item of upgrades) {
      expect(item.category).toBe('upgrade')
    }
  })
})
