import { describe, it, expect } from 'vitest'
import { buyItem, sellItem } from '../shop'
import { createProfile, spendCredits as spendCreditsFromProfile } from '@/lib/player/profile'
import { createInventory, addItem } from '@/lib/inventory/inventory'

describe('buyItem', () => {
  it('buys 1 fuel cell: credits debited, item added', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 1)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(925)
    expect(result.inventory.stacks).toHaveLength(1)
    expect(result.inventory.stacks[0]!.itemId).toBe('fuel-cell')
    expect(result.inventory.stacks[0]!.quantity).toBe(1)
  })

  it('buys multiple fuel cells: correct total cost', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 3)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(775)
    expect(result.inventory.stacks[0]!.quantity).toBe(3)
  })

  it('fails with insufficient credits', () => {
    const profile = spendCreditsFromProfile(createProfile('Joe'), 990)!
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('credits')
    expect(result.profile.credits).toBe(10)
    expect(result.inventory.stacks).toHaveLength(0)
  })

  it('fails when inventory is full — credits NOT debited', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory(1, 9999)
    const fullInventory = addItem(inventory, 'olivine', 1).inventory
    const result = buyItem(profile, fullInventory, 'fuel-cell', 1)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(1000)
  })

  it('fails for item not in shop listings', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'olivine', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not available')
  })

  it('does not mutate original profile or inventory', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    buyItem(profile, inventory, 'fuel-cell', 1)

    expect(profile.credits).toBe(1000)
    expect(inventory.stacks).toHaveLength(0)
  })
})

describe('sellItem', () => {
  it('sells 10 olivine: item removed, credits added', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'olivine', 50).inventory
    const result = sellItem(profile, inventory, 'olivine', 10)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(1030)
    expect(result.inventory.stacks[0]!.quantity).toBe(40)
  })

  it('sells iron-nickel-alloy at correct price', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'iron-nickel-alloy', 20).inventory
    const result = sellItem(profile, inventory, 'iron-nickel-alloy', 5)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(1060)
  })

  it('fails when item not in inventory', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const result = sellItem(profile, inventory, 'olivine', 1)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(1000)
  })

  it('fails when selling more than available', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'olivine', 5).inventory
    const result = sellItem(profile, inventory, 'olivine', 10)

    expect(result.ok).toBe(false)
  })

  it('fails for non-sellable items', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'fuel-cell', 5).inventory
    const result = sellItem(profile, inventory, 'fuel-cell', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('cannot be sold')
  })

  it('does not mutate original profile or inventory', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'olivine', 50).inventory
    sellItem(profile, inventory, 'olivine', 10)

    expect(profile.credits).toBe(1000)
    expect(inventory.stacks[0]!.quantity).toBe(50)
  })
})
