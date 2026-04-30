import { describe, expect, it } from 'vitest'
import { addItem, createInventory } from '@/lib/inventory/inventory'
import {
  LANDER_FUEL_REFILL_FRACTION,
  countLanderFuelCells,
  useLanderFuelCell,
} from '@/lib/level/landerFuelCell'
import { LANDER_FUEL_ID } from '@/lib/shop/shopSession'

describe('landerFuelCell', () => {
  it('consumes one lander fuel cell and returns half-tank fuel', () => {
    const inventory = addItem(createInventory(), LANDER_FUEL_ID, 2).inventory

    const result = useLanderFuelCell(inventory, 240)

    expect(result.ok).toBe(true)
    expect(result.fuelToAdd).toBe(240 * LANDER_FUEL_REFILL_FRACTION)
    expect(result.remainingFuelCells).toBe(1)
    expect(countLanderFuelCells(result.inventory)).toBe(1)
  })

  it('fails without changing inventory when no lander fuel cell exists', () => {
    const inventory = createInventory()

    const result = useLanderFuelCell(inventory, 240)

    expect(result.ok).toBe(false)
    expect(result.inventory).toBe(inventory)
    expect(result.fuelToAdd).toBe(0)
    expect(result.remainingFuelCells).toBe(0)
  })

  it('counts only lander fuel cells', () => {
    const inventory = addItem(createInventory(), LANDER_FUEL_ID, 3).inventory

    expect(countLanderFuelCells(inventory)).toBe(3)
  })
})
