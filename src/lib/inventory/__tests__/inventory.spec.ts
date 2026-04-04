import { describe, it, expect } from 'vitest'
import {
  createInventory,
  getCurrentWeight,
  getAvailableSlots,
  getStack,
  canFitItem,
  addItem,
  removeItem,
  consumeItem,
  DEFAULT_MAX_SLOTS,
  DEFAULT_MAX_WEIGHT_KG,
} from '../inventory'

describe('createInventory', () => {
  it('creates empty inventory with defaults', () => {
    const inv = createInventory()
    expect(inv.stacks).toEqual([])
    expect(inv.maxSlots).toBe(DEFAULT_MAX_SLOTS)
    expect(inv.maxWeightKg).toBe(DEFAULT_MAX_WEIGHT_KG)
  })

  it('accepts custom limits', () => {
    const inv = createInventory(4, 100)
    expect(inv.maxSlots).toBe(4)
    expect(inv.maxWeightKg).toBe(100)
  })
})

describe('getCurrentWeight', () => {
  it('returns 0 for empty inventory', () => {
    expect(getCurrentWeight(createInventory())).toBe(0)
  })

  it('sums weight across stacks', () => {
    const inv = createInventory()
    const r1 = addItem(inv, 'olivine', 100)
    const r2 = addItem(r1.inventory, 'magnetite', 50)
    expect(getCurrentWeight(r2.inventory)).toBe(150)
  })
})

describe('getAvailableSlots', () => {
  it('returns maxSlots for empty inventory', () => {
    const inv = createInventory()
    expect(getAvailableSlots(inv)).toBe(DEFAULT_MAX_SLOTS)
  })

  it('decrements when stacks are added', () => {
    const inv = createInventory()
    const r1 = addItem(inv, 'olivine', 10)
    expect(getAvailableSlots(r1.inventory)).toBe(DEFAULT_MAX_SLOTS - 1)
  })
})

describe('getStack', () => {
  it('returns undefined for empty inventory', () => {
    expect(getStack(createInventory(), 'olivine')).toBeUndefined()
  })

  it('finds an existing stack', () => {
    const inv = createInventory()
    const r = addItem(inv, 'olivine', 50)
    const stack = getStack(r.inventory, 'olivine')
    expect(stack).toBeDefined()
    expect(stack!.quantity).toBe(50)
    expect(stack!.totalWeightKg).toBe(50)
  })
})

describe('addItem', () => {
  it('creates a new stack in empty inventory', () => {
    const inv = createInventory()
    const result = addItem(inv, 'olivine', 10)

    expect(result.ok).toBe(true)
    expect(result.inventory.stacks).toHaveLength(1)
    expect(result.inventory.stacks[0]!.itemId).toBe('olivine')
    expect(result.inventory.stacks[0]!.quantity).toBe(10)
    expect(result.inventory.stacks[0]!.totalWeightKg).toBe(10)
  })

  it('merges into existing stack', () => {
    const inv = createInventory()
    const r1 = addItem(inv, 'olivine', 10)
    const r2 = addItem(r1.inventory, 'olivine', 20)

    expect(r2.ok).toBe(true)
    expect(r2.inventory.stacks).toHaveLength(1)
    expect(r2.inventory.stacks[0]!.quantity).toBe(30)
    expect(r2.inventory.stacks[0]!.totalWeightKg).toBe(30)
  })

  it('fails when all slots are full', () => {
    let inv = createInventory(2, 9999)
    inv = addItem(inv, 'olivine', 1).inventory
    inv = addItem(inv, 'magnetite', 1).inventory
    const result = addItem(inv, 'pyroxene', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('slot')
  })

  it('fails when weight limit would be exceeded', () => {
    const inv = createInventory(8, 50)
    const result = addItem(inv, 'olivine', 51)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('weight')
  })

  it('fails when maxStack would be exceeded', () => {
    const inv = createInventory()
    const r1 = addItem(inv, 'drill', 1)
    const r2 = addItem(r1.inventory, 'drill', 1)

    expect(r2.ok).toBe(false)
    expect(r2.reason).toContain('stack')
  })

  it('fails for unknown item ID', () => {
    const inv = createInventory()
    const result = addItem(inv, 'unobtainium', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Unknown')
  })

  it('does not mutate the original inventory', () => {
    const inv = createInventory()
    addItem(inv, 'olivine', 10)

    expect(inv.stacks).toHaveLength(0)
  })
})

describe('removeItem', () => {
  it('decrements quantity and weight', () => {
    const inv = addItem(createInventory(), 'olivine', 50).inventory
    const result = removeItem(inv, 'olivine', 20)

    expect(result.ok).toBe(true)
    expect(result.inventory.stacks[0]!.quantity).toBe(30)
    expect(result.inventory.stacks[0]!.totalWeightKg).toBe(30)
  })

  it('removes stack entirely when quantity reaches 0', () => {
    const inv = addItem(createInventory(), 'olivine', 10).inventory
    const result = removeItem(inv, 'olivine', 10)

    expect(result.ok).toBe(true)
    expect(result.inventory.stacks).toHaveLength(0)
  })

  it('fails when item not in inventory', () => {
    const inv = createInventory()
    const result = removeItem(inv, 'olivine', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not found')
  })

  it('fails when removing more than available', () => {
    const inv = addItem(createInventory(), 'olivine', 10).inventory
    const result = removeItem(inv, 'olivine', 20)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Insufficient')
  })

  it('does not mutate the original inventory', () => {
    const inv = addItem(createInventory(), 'olivine', 50).inventory
    removeItem(inv, 'olivine', 20)

    expect(inv.stacks[0]!.quantity).toBe(50)
  })
})

describe('consumeItem', () => {
  it('behaves identically to removeItem', () => {
    const inv = addItem(createInventory(), 'fuel-cell', 5).inventory
    const result = consumeItem(inv, 'fuel-cell', 2)

    expect(result.ok).toBe(true)
    expect(result.inventory.stacks[0]!.quantity).toBe(3)
    expect(result.inventory.stacks[0]!.totalWeightKg).toBe(15)
  })
})

describe('canFitItem', () => {
  it('returns true when inventory has space and weight', () => {
    const inv = createInventory()
    expect(canFitItem(inv, 'olivine', 100)).toBe(true)
  })

  it('returns false when weight would be exceeded', () => {
    const inv = createInventory(8, 50)
    expect(canFitItem(inv, 'olivine', 51)).toBe(false)
  })

  it('returns false when slots are full and no existing stack', () => {
    let inv = createInventory(1, 9999)
    inv = addItem(inv, 'olivine', 1).inventory
    expect(canFitItem(inv, 'magnetite', 1)).toBe(false)
  })

  it('returns true when merging into existing stack within limits', () => {
    let inv = createInventory(1, 9999)
    inv = addItem(inv, 'olivine', 1).inventory
    expect(canFitItem(inv, 'olivine', 1)).toBe(true)
  })

  it('returns false for unknown item', () => {
    const inv = createInventory()
    expect(canFitItem(inv, 'unobtainium', 1)).toBe(false)
  })
})
