# Inventory System — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Slot-and-weight-based cargo inventory system for the lander. Items are defined in a JSON manifest, grouped into 4 categories. The inventory enforces both a slot limit (number of distinct stacks) and a weight limit (total kg). All operations are pure functions in `src/lib/inventory/`. Ported from the irover project's inventory pattern, adapted to Asteroid Lander's architecture.

## Scope

Item catalog, inventory state, and CRUD operations. Out of scope: shop/store system (separate spec), Pinia store wrapper (thin, added when UI needs it), lander upgrade effects on capacity.

## Data Model

All interfaces in `src/lib/inventory/types.ts`.

### ItemCategory

```ts
type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment'
```

- **mineral** — gathered resources from GATHER objectives. Maps to asteroid composition minerals.
- **upgrade** — lander upgrades (thruster boost, hull reinforcement, etc.). Do not stack.
- **consumable** — expendable supplies (fuel, ammo, repair kits). Used up during missions.
- **equipment** — mission tools (drill, minigun, rescue winch). Swapped at workbench. Do not stack.

### ItemDefinition

```ts
interface ItemDefinition {
  id: string
  category: ItemCategory
  label: string
  description: string
  weightPerUnit: number
  maxStack: number
  sellable: boolean
}
```

- **`id`** — unique key, e.g. "olivine", "fuel-cell", "minigun".
- **`category`** — one of the 4 categories above.
- **`label`** — display name for UI, e.g. "Olivine", "Fuel Cell".
- **`description`** — flavor text for tooltips/details.
- **`weightPerUnit`** — kilograms per unit. Fixed, not random.
- **`maxStack`** — maximum units in a single inventory slot. 1 for upgrades/equipment.
- **`sellable`** — whether the shop (future system) will buy this from the player. Minerals are sellable. Equipment and upgrades are not.

### InventoryStack

```ts
interface InventoryStack {
  itemId: string
  quantity: number
  totalWeightKg: number
}
```

- **`totalWeightKg`** — precomputed as `quantity × weightPerUnit`. Updated on every add/remove.

### Inventory

```ts
interface Inventory {
  stacks: InventoryStack[]
  maxSlots: number
  maxWeightKg: number
}
```

### InventoryResult

```ts
interface InventoryResult {
  ok: boolean
  inventory: Inventory
  reason?: string
}
```

Returned by `addItem`. When `ok` is `false`, `inventory` is unchanged and `reason` explains why (e.g. "No available slots", "Would exceed weight limit", "Stack is full").

## Constants

```ts
const DEFAULT_MAX_SLOTS = 8
const DEFAULT_MAX_WEIGHT_KG = 500
```

## File Layout

```
src/lib/inventory/
  types.ts              — ItemCategory, ItemDefinition, InventoryStack, Inventory, InventoryResult
  catalog.ts            — loads items.json, validates, exports catalog + lookups
  inventory.ts          — pure functions for inventory operations

src/data/inventory/
  items.json            — all game items across 4 categories

src/lib/inventory/__tests__/
  catalog.spec.ts       — item manifest validation
  inventory.spec.ts     — inventory operation tests
```

## Functions — `src/lib/inventory/inventory.ts`

### Creation

- **`createInventory(maxSlots?: number, maxWeightKg?: number): Inventory`** — returns an empty inventory. Defaults to `DEFAULT_MAX_SLOTS` and `DEFAULT_MAX_WEIGHT_KG`.

### Queries (pure, read-only)

- **`getCurrentWeight(inventory: Inventory): number`** — sum of `totalWeightKg` across all stacks.
- **`getAvailableSlots(inventory: Inventory): number`** — `maxSlots - stacks.length`.
- **`getStack(inventory: Inventory, itemId: string): InventoryStack | undefined`** — find a stack by item ID.
- **`canFitItem(inventory: Inventory, itemId: string, quantity: number): boolean`** — checks both slot availability (existing stack or free slot) and weight limit. Requires the item catalog to look up `weightPerUnit` and `maxStack`.

### Mutations (pure, return new inventory)

- **`addItem(inventory: Inventory, itemId: string, quantity: number): InventoryResult`** — merges into existing stack if one exists and maxStack not exceeded, otherwise creates a new stack in a free slot. Returns `{ ok: false, reason }` if: no catalog entry for itemId, slots full and no existing stack, would exceed weight limit, would exceed maxStack.

- **`removeItem(inventory: Inventory, itemId: string, quantity: number): InventoryResult`** — decrements stack quantity. Removes the stack entirely if quantity reaches 0. Returns `{ ok: false, reason }` if item not found or insufficient quantity.

- **`consumeItem(inventory: Inventory, itemId: string, quantity: number): InventoryResult`** — identical to `removeItem`. Semantic alias for clarity (fuel burned, ammo spent vs. items discarded).

## Item Manifest — `src/data/inventory/items.json`

### Minerals (~10 items)

Mapped from the asteroid composition minerals. Each mineral the player can gather has a matching inventory item.

| id | label | weightPerUnit | maxStack | sellable |
|----|-------|--------------|----------|----------|
| olivine | Olivine | 1 | 500 | true |
| magnetite | Magnetite | 1 | 500 | true |
| iron-sulfides | Iron Sulfides | 1 | 500 | true |
| carbonates | Carbonates | 1 | 500 | true |
| organic-compounds | Organic Compounds | 1 | 500 | true |
| hydrated-silicates | Hydrated Silicates | 1 | 500 | true |
| pyroxene | Pyroxene | 1 | 500 | true |
| plagioclase-feldspar | Plagioclase Feldspar | 1 | 500 | true |
| iron-nickel-alloy | Iron-Nickel Alloy | 1 | 500 | true |
| water-ice | Water Ice | 1 | 500 | true |

Minerals are 1 kg per unit (1 unit = 1 kg gathered). `maxStack: 500` matches the weight limit. All are sellable.

### Consumables (4 items)

| id | label | weightPerUnit | maxStack | sellable |
|----|-------|--------------|----------|----------|
| fuel-cell | Fuel Cell | 5 | 20 | false |
| repair-kit | Repair Kit | 3 | 10 | false |
| ammo-crate | Ammo Crate | 8 | 15 | false |
| oxygen-canister | Oxygen Canister | 4 | 10 | false |

### Equipment (3 items)

| id | label | weightPerUnit | maxStack | sellable |
|----|-------|--------------|----------|----------|
| drill | Mining Drill | 25 | 1 | false |
| minigun | Mounted Minigun | 35 | 1 | false |
| rescue-winch | Rescue Winch | 20 | 1 | false |

One per mission type. Swapped at workbench before departure.

### Upgrades (4 items)

| id | label | weightPerUnit | maxStack | sellable |
|----|-------|--------------|----------|----------|
| thruster-boost | Thruster Boost Module | 15 | 1 | false |
| hull-reinforcement | Hull Reinforcement | 20 | 1 | false |
| fuel-tank-expansion | Fuel Tank Expansion | 18 | 1 | false |
| cargo-bay-expansion | Cargo Bay Expansion | 10 | 1 | false |

Installed permanently. Effect logic is a future system.

## Catalog — `src/lib/inventory/catalog.ts`

- Imports `items.json` via Vite static import.
- Exports `ITEM_CATALOG: Record<string, ItemDefinition>` — keyed by item ID for O(1) lookup.
- Exports `getItemDefinition(id: string): ItemDefinition | undefined`.
- Exports `getItemsByCategory(category: ItemCategory): ItemDefinition[]`.
- Validates at load time: all items have `weightPerUnit > 0`, `maxStack > 0`, non-empty `id`/`label`/`description`, valid `category`.

## Testing Plan

### catalog.spec.ts

- All items load with unique IDs.
- All items have valid `category` values.
- All `weightPerUnit > 0` and `maxStack > 0`.
- All items have non-empty `label` and `description`.
- `getItemDefinition` returns correct item for known ID, `undefined` for unknown.
- `getItemsByCategory('mineral')` returns only minerals.
- Every mineral name used in asteroid compositions has a matching item ID in the catalog (cross-reference with asteroid data).

### inventory.spec.ts

- `createInventory` returns empty inventory with correct defaults.
- `createInventory` accepts custom slot/weight limits.
- `getCurrentWeight` returns 0 for empty, correct sum after adds.
- `getAvailableSlots` returns maxSlots for empty, decrements correctly.
- `getStack` finds existing stack, returns undefined for missing.
- `addItem` to empty inventory creates a new stack.
- `addItem` merges into existing stack (quantity and weight updated).
- `addItem` fails with reason when all slots are full (no existing stack).
- `addItem` fails with reason when weight limit would be exceeded.
- `addItem` fails with reason when maxStack would be exceeded.
- `addItem` fails with reason for unknown item ID.
- `removeItem` decrements quantity and weight.
- `removeItem` removes stack entirely when quantity reaches 0.
- `removeItem` fails when item not in inventory.
- `removeItem` fails when removing more than available.
- `consumeItem` behaves identically to removeItem.
- `canFitItem` returns true/false checking both constraints.
- All mutation functions return new inventory — original is never mutated.
