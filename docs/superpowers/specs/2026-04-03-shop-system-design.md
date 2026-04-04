# Shop System — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Unified shop system where players buy supplies (fuel cells) and sell gathered minerals for credits. Prices are fixed and data-driven via a JSON catalog. Mineral sell prices vary by type to reward targeting valuable asteroids. All operations are pure functions that take a player profile + inventory and return updated versions.

## Scope

Shop catalog (buy listings + sell prices), buy/sell operations, price lookups. Out of scope: UI, dynamic pricing, shop upgrades, workbench repairs.

## Dependencies

- **Player profile** (`src/lib/player/`) — credits balance
- **Inventory** (`src/lib/inventory/`) — cargo operations (addItem, removeItem)
- **Item catalog** (`src/lib/inventory/catalog.ts`) — item definitions, `sellable` flag

## Data Model

All interfaces in `src/lib/shop/types.ts`.

### ShopListing

```ts
interface ShopListing {
  itemId: string
  buyPrice: number
}
```

- **`itemId`** — references an ItemDefinition from the item catalog. Must exist.
- **`buyPrice`** — credits the player pays to purchase 1 unit.

### SellPrice

```ts
interface SellPrice {
  itemId: string
  sellPrice: number
}
```

- **`itemId`** — references an ItemDefinition. Must have `sellable: true`.
- **`sellPrice`** — credits the player receives per unit sold.

### ShopCatalog

```ts
interface ShopCatalog {
  listings: ShopListing[]
  sellPrices: SellPrice[]
}
```

### ShopResult

```ts
interface ShopResult {
  ok: boolean
  profile: PlayerProfile
  inventory: Inventory
  reason?: string
}
```

Returned by `buyItem` and `sellItem`. When `ok` is false, `profile` and `inventory` are unchanged.

## File Layout

```
src/lib/shop/
  types.ts              — ShopListing, SellPrice, ShopCatalog, ShopResult
  catalog.ts            — loads shop.json, validates, exports catalog + lookups
  shop.ts               — pure buy/sell functions

src/data/shop/
  shop.json             — buy listings + sell prices

src/lib/shop/__tests__/
  catalog.spec.ts
  shop.spec.ts
```

## Shop Catalog — `src/data/shop/shop.json`

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

### Mineral Pricing Rationale

Prices reflect rarity and industrial value from the lore:

| Mineral | Price/kg | Why |
|---------|----------|-----|
| Olivine | 3 | Common silicate, low value |
| Pyroxene | 3 | Common silicate |
| Carbonates | 3 | Abundant in C-type asteroids |
| Iron Sulfides | 4 | Moderate industrial use |
| Hydrated Silicates | 4 | Water extraction value |
| Plagioclase Feldspar | 4 | Aluminum feedstock |
| Magnetite | 5 | Electronics/shielding demand |
| Water Ice | 6 | Critical life support resource |
| Organic Compounds | 8 | High scientific/pharma value |
| Iron-Nickel Alloy | 12 | Most valuable belt commodity |

This makes Psyche (55% Iron-Nickel) the most lucrative asteroid and Bennu (42% Hydrated Silicates) a mid-tier earner.

## Catalog Loader — `src/lib/shop/catalog.ts`

- Imports `shop.json` via Vite static import
- Exports `SHOP_CATALOG: ShopCatalog`
- Exports `getBuyPrice(itemId: string): number | undefined` — returns buy price or undefined if not listed
- Exports `getSellPrice(itemId: string): number | undefined` — returns sell price or undefined if not listed
- Validates at load time:
  - All `itemId` values in listings exist in the item catalog
  - All `itemId` values in sellPrices exist in the item catalog AND have `sellable: true`
  - All prices are positive

## Functions — `src/lib/shop/shop.ts`

### buyItem

```ts
function buyItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult
```

1. Look up buy price. If item not in shop listings → `{ ok: false, reason: "Item not available for purchase" }`
2. Calculate total cost: `buyPrice × quantity`
3. Check player can afford it via `spendCredits`. If not → `{ ok: false, reason: "Insufficient credits" }`
4. Try `addItem` to inventory. If fails → `{ ok: false, reason }` (slots full, overweight, etc.)
5. Return `{ ok: true, profile: updatedProfile, inventory: updatedInventory }`

**Important:** credits must be debited AND item added atomically. If `addItem` fails after `spendCredits`, the credits must not be lost. Implementation: check `canFitItem` before debiting credits.

### sellItem

```ts
function sellItem(
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult
```

1. Look up sell price. If item not in sell prices → `{ ok: false, reason: "Item cannot be sold" }`
2. Try `removeItem` from inventory. If fails → `{ ok: false, reason }` (not in inventory, insufficient quantity)
3. Calculate total payout: `sellPrice × quantity`
4. Credit player via `addCredits`
5. Return `{ ok: true, profile: updatedProfile, inventory: updatedInventory }`

## Testing Plan

### catalog.spec.ts

- Shop catalog loads with listings and sell prices
- All listing itemIds exist in the item catalog
- All sell price itemIds exist in the item catalog and have `sellable: true`
- All buy prices are positive
- All sell prices are positive
- `getBuyPrice` returns correct price for listed item, undefined for unlisted
- `getSellPrice` returns correct price for listed mineral, undefined for unlisted

### shop.spec.ts

**buyItem:**
- Buys 1 fuel cell: credits debited, item added to inventory
- Buys multiple fuel cells: correct total cost, correct quantity in inventory
- Fails with insufficient credits (profile and inventory unchanged)
- Fails when inventory is full (profile and inventory unchanged — credits NOT debited)
- Fails for item not in shop listings
- Does not mutate original profile or inventory

**sellItem:**
- Sells 10 olivine: item removed from inventory, credits added to profile
- Sells at correct price per mineral type (iron-nickel-alloy at 12/kg)
- Fails when item not in inventory
- Fails when selling more than available
- Fails for non-sellable items
- Does not mutate original profile or inventory
