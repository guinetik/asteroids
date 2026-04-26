import { describe, it, expect } from 'vitest'
import {
  applyCargoBayLimits,
  createInventoryForCargoBay,
  ensureMinimumStarterFuelCells,
  inventoryWithStarterFuelCells,
} from '../playerInventoryHelpers'
import { DEFAULT_MAX_SLOTS, DEFAULT_MAX_WEIGHT_KG, getStack } from '@/lib/inventory/inventory'
import { LANDER_FUEL_ID, RESERVE_FUEL_ID } from '@/lib/shop/shopSession'
import '@/lib/shop/tradeGoods' // register item definitions

const counts = { shuttle: 2, lander: 3 }

describe('createInventoryForCargoBay', () => {
  it('scales maxSlots and maxWeightKg by the multiplier', () => {
    const inv = createInventoryForCargoBay(1.5)
    expect(inv.maxSlots).toBe(Math.round(DEFAULT_MAX_SLOTS * 1.5))
    expect(inv.maxWeightKg).toBe(Math.round(DEFAULT_MAX_WEIGHT_KG * 1.5))
  })

  it('produces an empty hold', () => {
    const inv = createInventoryForCargoBay(1)
    expect(inv.stacks).toEqual([])
  })
})

describe('applyCargoBayLimits', () => {
  it('resizes caps on an existing inventory without touching stacks', () => {
    const base = createInventoryForCargoBay(1)
    const seeded = inventoryWithStarterFuelCells(base, counts)
    const resized = applyCargoBayLimits(seeded, 2)
    expect(resized.maxSlots).toBe(Math.round(DEFAULT_MAX_SLOTS * 2))
    expect(resized.maxWeightKg).toBe(Math.round(DEFAULT_MAX_WEIGHT_KG * 2))
    expect(resized.stacks).toBe(seeded.stacks)
  })
})

describe('inventoryWithStarterFuelCells', () => {
  it('adds both shuttle and lander fuel cells to an empty hold', () => {
    const inv = inventoryWithStarterFuelCells(createInventoryForCargoBay(1), counts)
    expect(getStack(inv, RESERVE_FUEL_ID)?.quantity).toBe(2)
    expect(getStack(inv, LANDER_FUEL_ID)?.quantity).toBe(3)
  })
})

describe('ensureMinimumStarterFuelCells', () => {
  it('adds only the deficit when stacks are under the minimum', () => {
    let inv = createInventoryForCargoBay(1)
    const seed = inventoryWithStarterFuelCells(inv, { shuttle: 1, lander: 1 })
    inv = ensureMinimumStarterFuelCells(seed, counts)
    expect(getStack(inv, RESERVE_FUEL_ID)?.quantity).toBe(counts.shuttle)
    expect(getStack(inv, LANDER_FUEL_ID)?.quantity).toBe(counts.lander)
  })

  it('does nothing when stacks already meet the minimum', () => {
    const seed = inventoryWithStarterFuelCells(createInventoryForCargoBay(1), {
      shuttle: 5,
      lander: 5,
    })
    const inv = ensureMinimumStarterFuelCells(seed, counts)
    expect(getStack(inv, RESERVE_FUEL_ID)?.quantity).toBe(5)
    expect(getStack(inv, LANDER_FUEL_ID)?.quantity).toBe(5)
  })

  it('handles missing stacks as zero', () => {
    const inv = ensureMinimumStarterFuelCells(createInventoryForCargoBay(1), counts)
    expect(getStack(inv, RESERVE_FUEL_ID)?.quantity).toBe(counts.shuttle)
    expect(getStack(inv, LANDER_FUEL_ID)?.quantity).toBe(counts.lander)
  })
})
