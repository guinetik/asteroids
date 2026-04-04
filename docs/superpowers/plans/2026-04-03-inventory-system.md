# Inventory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement slot-and-weight-based cargo inventory with a JSON item manifest, catalog loader, and pure CRUD functions.

**Architecture:** Interfaces in `src/lib/inventory/types.ts`, JSON manifest in `src/data/inventory/items.json`, catalog loader in `src/lib/inventory/catalog.ts`, pure inventory operations in `src/lib/inventory/inventory.ts`. Follows existing project patterns (asteroid catalog, mission templates). TDD.

**Tech Stack:** TypeScript, Vitest, Vite static JSON imports.

---

### File Map

- Create: `src/lib/inventory/types.ts` — all interfaces and type aliases
- Create: `src/data/inventory/items.json` — 21 item definitions
- Create: `src/lib/inventory/catalog.ts` — loads JSON, validates, exports catalog
- Create: `src/lib/inventory/inventory.ts` — pure inventory operations
- Create: `src/lib/inventory/__tests__/catalog.spec.ts`
- Create: `src/lib/inventory/__tests__/inventory.spec.ts`

---

### Task 1: Types

**Files:**
- Create: `src/lib/inventory/types.ts`

- [ ] **Step 1: Create types file**

```ts
/**
 * Inventory and item data model.
 *
 * Defines item definitions (loaded from JSON), inventory stacks,
 * and the inventory container with slot + weight constraints.
 * Used by the cargo system, shop, and mission reward logic.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-inventory-system-design.md
 */

/** Item classification determining behavior and UI grouping. */
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment'

/** An item definition from the JSON manifest. */
export interface ItemDefinition {
  /** Unique key, e.g. "olivine", "fuel-cell", "minigun". */
  id: string
  /** Classification: mineral, upgrade, consumable, or equipment. */
  category: ItemCategory
  /** Display name for UI, e.g. "Olivine", "Fuel Cell". */
  label: string
  /** Flavor text for tooltips and detail views. */
  description: string
  /** Fixed weight in kilograms per unit. */
  weightPerUnit: number
  /** Maximum units allowed in a single inventory slot. 1 for upgrades/equipment. */
  maxStack: number
  /** Whether the shop will buy this item from the player. Minerals are sellable. */
  sellable: boolean
}

/** A stack of identical items occupying one inventory slot. */
export interface InventoryStack {
  /** References an ItemDefinition.id from the catalog. */
  itemId: string
  /** Number of units in this stack. */
  quantity: number
  /** Precomputed total weight: quantity × weightPerUnit. */
  totalWeightKg: number
}

/** The lander's cargo hold with slot and weight constraints. */
export interface Inventory {
  /** Active item stacks. Each stack occupies one slot. */
  stacks: InventoryStack[]
  /** Maximum number of distinct stacks (slots). */
  maxSlots: number
  /** Maximum total cargo weight in kilograms. */
  maxWeightKg: number
}

/** Result of an inventory mutation (add/remove/consume). */
export interface InventoryResult {
  /** Whether the operation succeeded. */
  ok: boolean
  /** The inventory after the operation (unchanged if ok is false). */
  inventory: Inventory
  /** Explanation when ok is false, e.g. "No available slots". */
  reason?: string
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/inventory/types.ts
git commit -m "feat(inventory): add item and inventory type definitions"
```

---

### Task 2: Item Manifest JSON

**Files:**
- Create: `src/data/inventory/items.json`

- [ ] **Step 1: Create items.json with all 21 items**

```json
[
  {
    "id": "olivine",
    "category": "mineral",
    "label": "Olivine",
    "description": "Green silicate mineral common in stony asteroids. Valuable for industrial silicate production.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "magnetite",
    "category": "mineral",
    "label": "Magnetite",
    "description": "Iron oxide with strong magnetic properties. Used in electronics and radiation shielding.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "iron-sulfides",
    "category": "mineral",
    "label": "Iron Sulfides",
    "description": "Metallic sulfide ore. Feedstock for sulfuric acid production and steel alloys.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "carbonates",
    "category": "mineral",
    "label": "Carbonates",
    "description": "Calcium carbonate deposits. Essential for cement production in off-world construction.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "organic-compounds",
    "category": "mineral",
    "label": "Organic Compounds",
    "description": "Complex carbon chains preserved in carbonaceous rock. High scientific and pharmaceutical value.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "hydrated-silicates",
    "category": "mineral",
    "label": "Hydrated Silicates",
    "description": "Water-bearing silicate minerals. Can be processed to extract potable water in deep space.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "pyroxene",
    "category": "mineral",
    "label": "Pyroxene",
    "description": "Dark silicate mineral rich in iron and magnesium. Used in refractory ceramics.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "plagioclase-feldspar",
    "category": "mineral",
    "label": "Plagioclase Feldspar",
    "description": "Light-colored silicate found in rocky asteroids. Aluminum feedstock for alloy production.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "iron-nickel-alloy",
    "category": "mineral",
    "label": "Iron-Nickel Alloy",
    "description": "Native metal from the core of a differentiated body. The most valuable mining commodity in the belt.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "water-ice",
    "category": "mineral",
    "label": "Water Ice",
    "description": "Frozen water extracted from icy bodies. Critical life support resource in deep space operations.",
    "weightPerUnit": 1,
    "maxStack": 500,
    "sellable": true
  },
  {
    "id": "fuel-cell",
    "category": "consumable",
    "label": "Fuel Cell",
    "description": "Hydrogen fuel cell for the lander's neutron thrusters. Each cell provides one full burn cycle.",
    "weightPerUnit": 5,
    "maxStack": 20,
    "sellable": false
  },
  {
    "id": "repair-kit",
    "category": "consumable",
    "label": "Repair Kit",
    "description": "Field repair package with hull patches and sealant. Restores structural integrity after hard landings.",
    "weightPerUnit": 3,
    "maxStack": 10,
    "sellable": false
  },
  {
    "id": "ammo-crate",
    "category": "consumable",
    "label": "Ammo Crate",
    "description": "Caseless ammunition for the mounted minigun. Each crate feeds approximately 500 rounds.",
    "weightPerUnit": 8,
    "maxStack": 15,
    "sellable": false
  },
  {
    "id": "oxygen-canister",
    "category": "consumable",
    "label": "Oxygen Canister",
    "description": "Pressurized O2 supply for rescued colonists. Each canister extends survival time during extraction.",
    "weightPerUnit": 4,
    "maxStack": 10,
    "sellable": false
  },
  {
    "id": "drill",
    "category": "equipment",
    "label": "Mining Drill",
    "description": "Industrial-grade rotary drill for mineral extraction. Required for GATHER objectives.",
    "weightPerUnit": 25,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "minigun",
    "category": "equipment",
    "label": "Mounted Minigun",
    "description": "Six-barrel rotary cannon with recoil compensation. Required for EXTERMINATE objectives. Newton's third law applies.",
    "weightPerUnit": 35,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "rescue-winch",
    "category": "equipment",
    "label": "Rescue Winch",
    "description": "Electromagnetic winch for extracting colonists from alien cocoons. Required for RESCUE objectives.",
    "weightPerUnit": 20,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "thruster-boost",
    "category": "upgrade",
    "label": "Thruster Boost Module",
    "description": "Aftermarket thruster amplifier. Increases main engine thrust output by 25%.",
    "weightPerUnit": 15,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "hull-reinforcement",
    "category": "upgrade",
    "label": "Hull Reinforcement",
    "description": "Composite armor plating bonded to the lander frame. Increases crash damage threshold.",
    "weightPerUnit": 20,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "fuel-tank-expansion",
    "category": "upgrade",
    "label": "Fuel Tank Expansion",
    "description": "Auxiliary fuel bladder mounted externally. Extends mission range by 40%.",
    "weightPerUnit": 18,
    "maxStack": 1,
    "sellable": false
  },
  {
    "id": "cargo-bay-expansion",
    "category": "upgrade",
    "label": "Cargo Bay Expansion",
    "description": "Modular cargo frame extension. Adds 4 inventory slots and 250kg capacity.",
    "weightPerUnit": 10,
    "maxStack": 1,
    "sellable": false
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/data/inventory/items.json
git commit -m "feat(inventory): add 21-item manifest JSON"
```

---

### Task 3: Catalog Loader — Tests First

**Files:**
- Create: `src/lib/inventory/__tests__/catalog.spec.ts`
- Create: `src/lib/inventory/catalog.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { ITEM_CATALOG, getItemDefinition, getItemsByCategory } from '../catalog'
import type { ItemCategory } from '../types'

const VALID_CATEGORIES = new Set<ItemCategory>(['mineral', 'upgrade', 'consumable', 'equipment'])

describe('ITEM_CATALOG', () => {
  it('contains 21 items', () => {
    expect(Object.keys(ITEM_CATALOG)).toHaveLength(21)
  })

  it('all items have valid category', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      expect(VALID_CATEGORIES.has(item.category), `${id} has invalid category`).toBe(true)
    }
  })

  it('all items have positive weightPerUnit', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.weightPerUnit, `${id} weightPerUnit`).toBeGreaterThan(0)
    }
  })

  it('all items have positive maxStack', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.maxStack, `${id} maxStack`).toBeGreaterThan(0)
    }
  })

  it('all items have non-empty label and description', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.label, `${id} label`).toBeTruthy()
      expect(item.description, `${id} description`).toBeTruthy()
    }
  })

  it('all item IDs match their catalog key', () => {
    for (const [key, item] of Object.entries(ITEM_CATALOG)) {
      expect(item.id, `key ${key} does not match item.id`).toBe(key)
    }
  })

  it('equipment and upgrades have maxStack of 1', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      if (item.category === 'equipment' || item.category === 'upgrade') {
        expect(item.maxStack, `${id} should have maxStack 1`).toBe(1)
      }
    }
  })

  it('all minerals are sellable', () => {
    for (const [id, item] of Object.entries(ITEM_CATALOG)) {
      if (item.category === 'mineral') {
        expect(item.sellable, `mineral ${id} should be sellable`).toBe(true)
      }
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/inventory/__tests__/catalog.spec.ts`
Expected: FAIL — cannot import from `../catalog`

- [ ] **Step 3: Implement catalog loader**

```ts
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

const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment'])

function validateItem(item: ItemDefinition): ItemDefinition {
  if (!item.id || !item.label || !item.description) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/inventory/__tests__/catalog.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/catalog.ts src/lib/inventory/__tests__/catalog.spec.ts
git commit -m "feat(inventory): add item catalog loader with tests"
```

---

### Task 4: Inventory Operations — Tests First

**Files:**
- Create: `src/lib/inventory/__tests__/inventory.spec.ts`
- Create: `src/lib/inventory/inventory.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/inventory/__tests__/inventory.spec.ts`
Expected: FAIL — cannot import from `../inventory`

- [ ] **Step 3: Implement inventory operations**

```ts
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
    return { ok: false, inventory, reason: `Insufficient quantity (have ${existing.quantity}, need ${quantity})` }
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/inventory/__tests__/inventory.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/inventory.ts src/lib/inventory/__tests__/inventory.spec.ts
git commit -m "feat(inventory): add inventory operations with tests"
```

---

### Task 5: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test:unit --run`
Expected: All tests PASS

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit any lint fixes**

If lint auto-fixed anything:
```bash
git add src/lib/inventory/
git commit -m "style(inventory): apply lint fixes"
```
