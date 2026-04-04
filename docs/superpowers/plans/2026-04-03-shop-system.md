# Shop System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified buy/sell shop with data-driven pricing, integrating player credits and cargo inventory.

**Architecture:** Types in `src/lib/shop/types.ts`, JSON pricing in `src/data/shop/shop.json`, catalog loader in `src/lib/shop/catalog.ts`, pure buy/sell functions in `src/lib/shop/shop.ts`. Follows existing project patterns. TDD.

**Tech Stack:** TypeScript, Vitest, Vite static JSON imports.

---

### File Map

- Create: `src/lib/shop/types.ts` — ShopListing, SellPrice, ShopCatalog, ShopResult
- Create: `src/data/shop/shop.json` — buy listings + sell prices
- Create: `src/lib/shop/catalog.ts` — loader with validation + price lookups
- Create: `src/lib/shop/shop.ts` — buyItem, sellItem pure functions
- Create: `src/lib/shop/__tests__/catalog.spec.ts`
- Create: `src/lib/shop/__tests__/shop.spec.ts`

---

### Task 1: Types + JSON + Catalog

**Files:**
- Create: `src/lib/shop/types.ts`
- Create: `src/data/shop/shop.json`
- Create: `src/lib/shop/__tests__/catalog.spec.ts`
- Create: `src/lib/shop/catalog.ts`

- [ ] **Step 1: Create types file**

```ts
/**
 * Shop system data model.
 *
 * Defines buy listings, sell prices, and the result type for
 * shop transactions. The shop buys minerals from the player
 * and sells consumables/supplies.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'

/** An item the shop sells to the player. */
export interface ShopListing {
  /** References an ItemDefinition.id from the item catalog. */
  itemId: string
  /** Credits the player pays to purchase 1 unit. */
  buyPrice: number
}

/** A price the shop pays for an item the player sells. */
export interface SellPrice {
  /** References an ItemDefinition.id. Must have sellable: true. */
  itemId: string
  /** Credits the player receives per unit sold. */
  sellPrice: number
}

/** The full shop catalog loaded from JSON. */
export interface ShopCatalog {
  /** Items available for purchase. */
  listings: ShopListing[]
  /** Prices the shop pays for player's items. */
  sellPrices: SellPrice[]
}

/** Result of a buy or sell transaction. */
export interface ShopResult {
  /** Whether the transaction succeeded. */
  ok: boolean
  /** Player profile after transaction (unchanged if ok is false). */
  profile: PlayerProfile
  /** Inventory after transaction (unchanged if ok is false). */
  inventory: Inventory
  /** Explanation when ok is false. */
  reason?: string
}
```

- [ ] **Step 2: Create shop.json**

```json
{
  "listings": [
    { "itemId": "fuel-cell", "buyPrice": 50 }
  ],
  "sellPrices": [
    { "itemId": "olivine", "sellPrice": 3 },
    { "itemId": "magnetite", "sellPrice": 5 },
    { "itemId": "iron-sulfides", "sellPrice": 4 },
    { "itemId": "carbonates", "sellPrice": 3 },
    { "itemId": "organic-compounds", "sellPrice": 8 },
    { "itemId": "hydrated-silicates", "sellPrice": 4 },
    { "itemId": "pyroxene", "sellPrice": 3 },
    { "itemId": "plagioclase-feldspar", "sellPrice": 4 },
    { "itemId": "iron-nickel-alloy", "sellPrice": 12 },
    { "itemId": "water-ice", "sellPrice": 6 }
  ]
}
```

- [ ] **Step 3: Write failing catalog tests**

```ts
import { describe, it, expect } from 'vitest'
import { SHOP_CATALOG, getBuyPrice, getSellPrice } from '../catalog'
import { getItemDefinition } from '@/lib/inventory/catalog'

describe('SHOP_CATALOG', () => {
  it('has listings and sell prices', () => {
    expect(SHOP_CATALOG.listings.length).toBeGreaterThan(0)
    expect(SHOP_CATALOG.sellPrices.length).toBeGreaterThan(0)
  })

  it('all listing itemIds exist in the item catalog', () => {
    for (const listing of SHOP_CATALOG.listings) {
      expect(getItemDefinition(listing.itemId)).toBeDefined()
    }
  })

  it('all sell price itemIds exist in the item catalog and are sellable', () => {
    for (const sp of SHOP_CATALOG.sellPrices) {
      const item = getItemDefinition(sp.itemId)
      expect(item).toBeDefined()
      expect(item!.sellable).toBe(true)
    }
  })

  it('all buy prices are positive', () => {
    for (const listing of SHOP_CATALOG.listings) {
      expect(listing.buyPrice).toBeGreaterThan(0)
    }
  })

  it('all sell prices are positive', () => {
    for (const sp of SHOP_CATALOG.sellPrices) {
      expect(sp.sellPrice).toBeGreaterThan(0)
    }
  })
})

describe('getBuyPrice', () => {
  it('returns correct price for fuel-cell', () => {
    expect(getBuyPrice('fuel-cell')).toBe(50)
  })

  it('returns undefined for unlisted item', () => {
    expect(getBuyPrice('olivine')).toBeUndefined()
  })
})

describe('getSellPrice', () => {
  it('returns correct price for iron-nickel-alloy', () => {
    expect(getSellPrice('iron-nickel-alloy')).toBe(12)
  })

  it('returns correct price for olivine', () => {
    expect(getSellPrice('olivine')).toBe(3)
  })

  it('returns undefined for non-sellable item', () => {
    expect(getSellPrice('fuel-cell')).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test:unit src/lib/shop/__tests__/catalog.spec.ts`
Expected: FAIL — cannot import from `../catalog`

- [ ] **Step 5: Implement catalog loader**

```ts
/**
 * Shop catalog loader.
 *
 * Imports shop pricing JSON at build time, validates all item
 * references against the inventory catalog, and exports price
 * lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { ShopCatalog } from './types'
import { getItemDefinition } from '@/lib/inventory/catalog'

import shopData from '@/data/shop/shop.json'

function validateCatalog(catalog: ShopCatalog): ShopCatalog {
  for (const listing of catalog.listings) {
    const item = getItemDefinition(listing.itemId)
    if (!item) {
      throw new Error(`Shop listing references unknown item "${listing.itemId}"`)
    }
    if (listing.buyPrice <= 0) {
      throw new Error(`Shop listing "${listing.itemId}" has non-positive buyPrice`)
    }
  }
  for (const sp of catalog.sellPrices) {
    const item = getItemDefinition(sp.itemId)
    if (!item) {
      throw new Error(`Shop sell price references unknown item "${sp.itemId}"`)
    }
    if (!item.sellable) {
      throw new Error(`Shop sell price "${sp.itemId}" is not sellable in item catalog`)
    }
    if (sp.sellPrice <= 0) {
      throw new Error(`Shop sell price "${sp.itemId}" has non-positive sellPrice`)
    }
  }
  return catalog
}

/** Validated shop catalog with buy listings and sell prices. */
export const SHOP_CATALOG: ShopCatalog = validateCatalog(
  shopData as unknown as ShopCatalog,
)

/** Get the buy price for an item, or undefined if not sold by the shop. */
export function getBuyPrice(itemId: string): number | undefined {
  const listing = SHOP_CATALOG.listings.find((l) => l.itemId === itemId)
  return listing?.buyPrice
}

/** Get the sell price for an item, or undefined if the shop doesn't buy it. */
export function getSellPrice(itemId: string): number | undefined {
  const sp = SHOP_CATALOG.sellPrices.find((s) => s.itemId === itemId)
  return sp?.sellPrice
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test:unit src/lib/shop/__tests__/catalog.spec.ts`
Expected: All 8 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/shop/types.ts src/data/shop/shop.json src/lib/shop/catalog.ts src/lib/shop/__tests__/catalog.spec.ts
git commit -m "feat(shop): add types, pricing JSON, and catalog loader with tests"
```

---

### Task 2: Buy/Sell Operations — Tests First

**Files:**
- Create: `src/lib/shop/__tests__/shop.spec.ts`
- Create: `src/lib/shop/shop.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { buyItem, sellItem } from '../shop'
import { createProfile, addCredits } from '@/lib/player/profile'
import { createInventory, addItem } from '@/lib/inventory/inventory'

describe('buyItem', () => {
  it('buys 1 fuel cell: credits debited, item added', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 1)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(450)
    expect(result.inventory.stacks).toHaveLength(1)
    expect(result.inventory.stacks[0]!.itemId).toBe('fuel-cell')
    expect(result.inventory.stacks[0]!.quantity).toBe(1)
  })

  it('buys multiple fuel cells: correct total cost', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 3)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(350)
    expect(result.inventory.stacks[0]!.quantity).toBe(3)
  })

  it('fails with insufficient credits', () => {
    const profile = addCredits(createProfile('Joe'), 40)
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'fuel-cell', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('credits')
    expect(result.profile.credits).toBe(40)
    expect(result.inventory.stacks).toHaveLength(0)
  })

  it('fails when inventory is full — credits NOT debited', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const inventory = createInventory(1, 9999)
    const fullInventory = addItem(inventory, 'olivine', 1).inventory
    const result = buyItem(profile, fullInventory, 'fuel-cell', 1)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(500)
  })

  it('fails for item not in shop listings', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const inventory = createInventory()
    const result = buyItem(profile, inventory, 'olivine', 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('not available')
  })

  it('does not mutate original profile or inventory', () => {
    const profile = addCredits(createProfile('Joe'), 500)
    const inventory = createInventory()
    buyItem(profile, inventory, 'fuel-cell', 1)

    expect(profile.credits).toBe(500)
    expect(inventory.stacks).toHaveLength(0)
  })
})

describe('sellItem', () => {
  it('sells 10 olivine: item removed, credits added', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'olivine', 50).inventory
    const result = sellItem(profile, inventory, 'olivine', 10)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(30)
    expect(result.inventory.stacks[0]!.quantity).toBe(40)
  })

  it('sells iron-nickel-alloy at correct price', () => {
    const profile = createProfile('Joe')
    const inventory = addItem(createInventory(), 'iron-nickel-alloy', 20).inventory
    const result = sellItem(profile, inventory, 'iron-nickel-alloy', 5)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(60)
  })

  it('fails when item not in inventory', () => {
    const profile = createProfile('Joe')
    const inventory = createInventory()
    const result = sellItem(profile, inventory, 'olivine', 1)

    expect(result.ok).toBe(false)
    expect(result.profile.credits).toBe(0)
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

    expect(profile.credits).toBe(0)
    expect(inventory.stacks[0]!.quantity).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/shop/__tests__/shop.spec.ts`
Expected: FAIL — cannot import from `../shop`

- [ ] **Step 3: Implement buy/sell functions**

```ts
/**
 * Shop buy/sell operations.
 *
 * Pure functions that take a player profile and inventory, perform
 * a transaction, and return updated versions. Credits and items
 * are handled atomically — if any step fails, nothing changes.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-shop-system-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { ShopResult } from './types'
import { addCredits, spendCredits } from '@/lib/player/profile'
import { addItem, removeItem, canFitItem } from '@/lib/inventory/inventory'
import { getBuyPrice, getSellPrice } from './catalog'

/**
 * Buy an item from the shop.
 * Checks price, credits, and inventory space atomically.
 */
export function buyItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const price = getBuyPrice(itemId)
  if (price === undefined) {
    return { ok: false, profile, inventory, reason: 'Item not available for purchase' }
  }

  const totalCost = price * quantity

  if (!canFitItem(inventory, itemId, quantity)) {
    return { ok: false, profile, inventory, reason: 'Cannot fit item in inventory' }
  }

  const updatedProfile = spendCredits(profile, totalCost)
  if (!updatedProfile) {
    return { ok: false, profile, inventory, reason: 'Insufficient credits' }
  }

  const addResult = addItem(inventory, itemId, quantity)
  if (!addResult.ok) {
    return { ok: false, profile, inventory, reason: addResult.reason }
  }

  return { ok: true, profile: updatedProfile, inventory: addResult.inventory }
}

/**
 * Sell an item to the shop.
 * Removes item from inventory and credits the player.
 */
export function sellItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const price = getSellPrice(itemId)
  if (price === undefined) {
    return { ok: false, profile, inventory, reason: 'Item cannot be sold' }
  }

  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const totalPayout = price * quantity
  const updatedProfile = addCredits(profile, totalPayout)

  return { ok: true, profile: updatedProfile, inventory: removeResult.inventory }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/shop/__tests__/shop.spec.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shop/shop.ts src/lib/shop/__tests__/shop.spec.ts
git commit -m "feat(shop): add buy/sell operations with tests"
```

---

### Task 3: Final Verification

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
git add src/lib/shop/
git commit -m "style(shop): apply lint fixes"
```
