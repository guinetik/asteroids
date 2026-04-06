# Planet Shop System

> Per-planet trade shops with rotating stock, demand-driven pricing, and a buy-low-sell-high economy loop.

**Date:** 2026-04-06
**Author:** guinetik

---

## 1. Overview

Each planet in the solar system has a shop accessible while the player is orbiting it. Shops sell planet-specific trade goods and fuel, and buy the player's inventory items. The economy encourages route-finding: buy goods where they're produced cheaply, sell where demand is high. Inner-system routes are safe with modest margins; outer-system runs are risky with lucrative payoffs.

The existing auto-refuel mechanic on Earth (`EARTH_REFUEL_RATE`) is removed. Refueling is now a shop purchase at any planet.

## 2. Shop Structure (5 Slots)

Every planet shop has exactly 5 slots:

| Slot | Content | Stock |
|------|---------|-------|
| 1 | **Refuel** — instantly fills fuel tank | Unlimited |
| 2 | **Reserve Fuel** — fuel-cell item added to inventory | Unlimited |
| 3 | **Trade Good A** — random from planet's 5-item pool | 5–20 units |
| 4 | **Trade Good B** — random, no duplicates | 5–20 units |
| 5 | **Trade Good C** — random, no duplicates | 5–20 units |

- **Refuel** is an instant action (not an inventory item) — costs 100 credits, immediately fills the shuttle's fuel tank via `thrusterSystem.addFuel()`.
- **Reserve Fuel** is the existing `fuel-cell` inventory item — costs 50 credits, added to cargo for later use.
- Trade good stock quantities scale inversely with base price: cheaper goods stock higher (15–20), expensive goods stock lower (5–10).

## 3. Visit Sessions & Restock

### Visit session

Entering orbit starts a **visit session**. The 3 trade goods are randomly selected (without duplicates) from the planet's 5-item pool and locked for the session. Closing and reopening the shop dialog while still orbiting shows the same 3 goods.

Leaving orbit (slingshot away) and returning later starts a new session with a fresh random pick.

### Restock

- A single **restock timer** (2–4 minutes, randomized) governs all 3 trade good slots together.
- When the timer expires, all 3 slots refresh: new random picks from the 5-item pool, new stock quantities.
- If all 3 trade goods sell out before the timer expires, the timer continues — the player must wait.
- The restock countdown is visible in the shop UI above the trade goods section.
- Refuel and reserve fuel are never affected by restock — always available.

### Reset on death / page refresh

Credits reset to 1000, inventory clears, all shop stock and timers reset globally.

## 4. Trade Goods per Planet

Each planet produces 5 unique trade goods reflecting its real-world character. 3 are displayed per visit.

### Planet Production Table

| Planet | Produces | Why | Base Price Range |
|--------|----------|-----|-----------------|
| **Mercury** | Heat-Resistant Alloys, Solar Panels, Radiation Shielding, Thermal Regulators, Sun-Forged Glass | Closest to sun, extreme metallurgy and solar tech | 20–60 |
| **Venus** | Acid-Resistant Coatings, Pressure Vessels, Sulfuric Compounds, Atmospheric Filters, Dense-Gas Canisters | Crushing atmosphere, chemical soup | 20–60 |
| **Earth** | Luxury Foods, Medicine, Entertainment Media, Textiles, Biocultures | Only biosphere, cultural hub | 15–50 |
| **Mars** | Construction Prefabs, Iron Composites, Terraforming Enzymes, Drill Bits, Red-Soil Ceramics | Industrial colony, red dirt everywhere | 20–55 |
| **Ceres** | Purified Water, Ice Cores, Hydroponics Kits, Filtration Membranes, Brine Concentrates | Ice dwarf, water monopoly in the belt | 15–45 |
| **Jupiter** | Helium-3 Cells, Magnetic Coils, Atmospheric Samples, Plasma Conduits, Storm-Glass | Gas giant, energy powerhouse | 40–100 |
| **Saturn** | Ring-Ice Crystals, Exotic Gems, Resonance Instruments, Prismatic Dust, Cryo-Silicates | Ring harvesting, luxury exports | 50–120 |
| **Uranus** | Cryogenic Coolants, Superconductors, Exotic Isotopes, Frost Compounds, Null-Temp Alloys | Extreme cold, unique physics | 60–140 |
| **Neptune** | Navigation Beacons, Dark-Matter Sensors, Deep-Space Probes, Signal Amplifiers, Void-Wave Emitters | Frontier R&D outpost | 80–160 |
| **Pluto** | Ancient Artifacts, Void Crystals, Dark-Ice Specimens, Kuiper Relics, Shadow Minerals | Mysterious Kuiper edge, alien remnants | 100–200 |

### Demand Web

| Planet | Needs | Gets it from |
|--------|-------|-------------|
| **Mercury** | Coolants, Food, Water | Uranus, Earth, Ceres |
| **Venus** | Radiation Shielding, Medicine, Construction Materials | Mercury, Earth, Mars |
| **Earth** | Energy, Exotic Materials, Rare Minerals | Jupiter, Saturn, Pluto |
| **Mars** | Water, Biologicals, Consumer Goods | Ceres, Earth, Earth |
| **Ceres** | Industrial Equipment, Electronics, Food | Mars, Saturn, Earth |
| **Jupiter** | Consumer Goods, Heat-Resistant Tech, Construction Materials | Earth, Mercury, Mars |
| **Saturn** | Cryogenics, Scientific Instruments, Food | Uranus, Neptune, Earth |
| **Uranus** | Energy, Industrial Equipment, Medicine | Jupiter, Mars, Earth |
| **Neptune** | Food, Construction Materials, Consumer Goods | Earth, Mars, Earth |
| **Pluto** | Food, Water, Energy | Earth, Ceres, Jupiter |

### Route Reward Tiers

| Tier | Routes | Demand Multiplier |
|------|--------|-------------------|
| 1 — Short hops | Venus↔Mars, Earth↔Mars, Mars↔Ceres | 1.5x–2x |
| 2 — Medium | Earth↔Jupiter, Ceres↔Jupiter | 2x–2.5x |
| 3 — Long haul | Inner↔Saturn/Uranus | 2.5x–3.5x |
| 4 — Expedition | Anything↔Neptune/Pluto | 3x–4x |

## 5. Pricing & Economy

### Base price

Each trade good has a fixed **base price** — the cost at its producing planet.

### Demand multiplier

Each planet that *wants* a good has a **demand multiplier** (1.5x–4x) based on need intensity and route distance. This determines what the buying planet pays.

### Rate variance

Every ~5 minutes (global timer, shared across all planets), all demand multipliers wobble **±20%** randomly. The whole economy shifts at once. No explicit UI for the timer — prices just change.

### Desirability (sell-side sorting)

The sell side of the shop shows the player's inventory sorted by **desirability** at the current planet. Desirability is displayed as a **1–5 pip indicator** (not an exact credit amount). The actual credits received are revealed only when the sale completes.

Desirability is computed as:

```
desirability = demandMultiplier(currentPlanet, itemId) × basePrice(itemId)
```

Mapped to pips: the highest-value item the current planet wants = 5 pips, scaled down from there. Items the current planet doesn't want at all = 0 pips (still sellable at 0.5x base price as a fallback).

### Flavor text hints

Each trade good's description hints at who might want it without naming the planet explicitly. Examples:

- *"Cryogenic Coolant — supercooled helium compound. Useless this far from the sun, but someone baking in solar radiation would pay a fortune."* (hints at Mercury)
- *"Luxury Foods — vacuum-sealed Earth delicacies. Colonists on the frontier dream about real bread."* (hints at outer planets)

## 6. Data Model

### New file: `src/data/shop/trade-goods.json`

Array of trade good definitions. Each entry:

```json
{
  "id": "heat-resistant-alloys",
  "category": "trade-good",
  "label": "Heat-Resistant Alloys",
  "description": "Forged in Mercury's solar furnaces. Engineers working near gas giants would value these for deep-atmosphere rigs.",
  "icon": "heat-resistant-alloys.png",
  "weightPerUnit": 3,
  "maxStack": 100,
  "sellable": true,
  "basePrice": 40,
  "producedBy": "mercury"
}
```

- `icon` — filename in `public/images/items/`. Referenced in UI.
- `basePrice` — what the producing planet charges.
- `producedBy` — planet id that sells this good.

### New file: `src/data/shop/planet-demand.json`

Demand matrix: which planets want which goods, and at what multiplier.

```json
{
  "mercury": {
    "demands": [
      { "itemId": "cryogenic-coolants", "multiplier": 3.0 },
      { "itemId": "luxury-foods", "multiplier": 2.5 },
      { "itemId": "purified-water", "multiplier": 2.0 }
    ]
  }
}
```

Each planet lists the trade goods it demands and the base demand multiplier for each. Multipliers wobble ±20% at runtime.

### Update: `src/data/inventory/items.json`

Add `icon` field to all existing items. Trade goods from `trade-goods.json` are registered into the item catalog at load time (merged into `ITEM_CATALOG`).

## 7. Domain Layer

### `src/lib/shop/tradeGoods.ts`

- Loads and validates `trade-goods.json`.
- Merges trade good definitions into the item catalog.
- Exports `getTradeGoodsByPlanet(planetId): TradeGoodDefinition[]` — returns the 5 goods a planet produces.

### `src/lib/shop/planetDemand.ts`

- Loads `planet-demand.json`.
- `getDemandMultiplier(planetId, itemId): number` — returns the current demand multiplier (base × variance).
- `refreshDemandVariance()` — called on the global ~5 min timer. Randomizes ±20% wobble for all entries.
- `getDesirabilityPips(planetId, itemId): number` — returns 0–5 pip rating for the sell-side UI.

### `src/lib/shop/shopSession.ts`

- `createShopSession(planetId): ShopSession` — picks 3 random goods from the planet's 5, assigns stock quantities, starts restock timer.
- `ShopSession` tracks: planet id, displayed goods (3), stock per good, restock timer, session id.
- `tickRestock(session, dt): ShopSession` — decrements timer, refreshes all 3 slots when expired.
- `buyTradeGood(session, profile, inventory, slotIndex, quantity): ShopBuyResult` — purchase from a trade slot.
- `refuel(session, profile, thrusterSystem): ShopRefuelResult` — pays 100 credits, fills fuel.

### Updates to existing `src/lib/shop/shop.ts`

- `sellItem` remains as-is but the sell price is now dynamic: `basePrice × getDemandMultiplier(currentPlanet, itemId)`.
- The old fixed `sellPrices` in `shop.json` become a fallback for mineral items not in the demand matrix (sold at 0.5x base as junk price).

## 8. Vue Components

### `src/components/shop/PlanetShopDialog.vue`

Modal overlay for the planet shop. Two-column layout:

- **Left column — Buy side:**
  - Refuel button (100 credits, fills tank)
  - Reserve Fuel row (fuel-cell, 50 credits, stock: unlimited)
  - 3 trade good rows: icon, name, description, stock count, price, buy button
  - Restock timer countdown above trade goods section (visible when counting down)

- **Right column — Sell side:**
  - Uses `InventoryTable.vue` in sell mode
  - Items sorted by desirability (highest first)
  - Each row shows: icon, name, quantity, desirability pips (1–5), sell button
  - Items with 0 demand at current planet show 0 pips but are still sellable at junk price

- **Header:** Planet name + shop title
- **Footer:** Keybind hints

### `src/components/shop/InventoryTable.vue`

Reusable inventory display component.

**Props:**
- `items: InventoryStack[]` — stacks to display
- `mode: 'view' | 'sell'` — view mode (read-only) or sell mode (with sell buttons)
- `planetId?: string` — current planet, needed for desirability in sell mode

**Emits:**
- `sell(itemId: string, quantity: number)` — fired in sell mode when player sells

**Behavior:**
- In `view` mode: shows icon, name, quantity, weight per row. No actions.
- In `sell` mode: adds desirability pips column and sell button. Sorted by desirability descending.

### `src/components/shuttle-control/ShuttleControlProgramInventory.vue`

Updated to use `InventoryTable.vue` in view mode, replacing the current placeholder.

### `src/components/shop/ShopButton.vue`

Small button that appears near the orbit HUD while the player is orbiting a planet. Click or press `B` to open `PlanetShopDialog.vue`.

### `src/components/hud/CreditsBadge.vue`

Always-visible HUD element in the top-right corner of MapView. Shows the player's current credit balance with a currency icon.

## 9. Integration with MapView

### MapViewController changes

- **Remove** `EARTH_REFUEL_RATE` constant and the auto-refuel block (~line 1188).
- **Add** shop session management: create/destroy `ShopSession` on orbit enter/exit.
- **Expose** orbit state + current planet id to the Vue layer for shop button visibility.
- **Add** `B` key binding in orbit state to toggle shop dialog.

### MapView.vue changes

- Mount `PlanetShopDialog.vue`, `ShopButton.vue`, and `CreditsBadge.vue`.
- Wire shop button visibility to orbit state.
- Wire shop dialog open/close to button click + `B` key.
- Pass current planet id and shop session to dialog.

## 10. Player Start & Reset

- `createProfile` starts with **1000 credits** (change from current 0).
- On death: credits reset to 1000, inventory clears, all shop sessions destroyed, demand variance resets.
- On page refresh: same as death (localStorage profile resets to 1000 credits).

## 11. Item Icons

All items (existing minerals, consumables, equipment, upgrades, and new trade goods) get an `icon` field pointing to `public/images/items/<id>.png`. Placeholder images can be used initially.

The `InventoryTable.vue` and `PlanetShopDialog.vue` components render these as small thumbnails (32x32 or similar).

## 12. Files Changed / Created

### New files
- `src/data/shop/trade-goods.json` — 50 trade good definitions (5 per planet)
- `src/data/shop/planet-demand.json` — demand matrix
- `src/lib/shop/tradeGoods.ts` — trade good catalog loader
- `src/lib/shop/planetDemand.ts` — demand multiplier system
- `src/lib/shop/shopSession.ts` — shop session state machine
- `src/lib/shop/tradeTypes.ts` — types for trade goods, demand, sessions
- `src/lib/shop/__tests__/tradeGoods.spec.ts`
- `src/lib/shop/__tests__/planetDemand.spec.ts`
- `src/lib/shop/__tests__/shopSession.spec.ts`
- `src/components/shop/PlanetShopDialog.vue`
- `src/components/shop/InventoryTable.vue`
- `src/components/shop/ShopButton.vue`
- `src/components/hud/CreditsBadge.vue`

### Modified files
- `src/data/inventory/items.json` — add `icon` field to all items
- `src/data/shop/shop.json` — add refuel listing (100 credits)
- `src/lib/shop/catalog.ts` — merge trade goods into catalog
- `src/lib/shop/shop.ts` — dynamic sell pricing via demand system
- `src/lib/player/profile.ts` — starting credits 1000
- `src/views/MapViewController.ts` — remove auto-refuel, add shop session management, B key binding
- `src/views/MapView.vue` — mount shop components, wire to orbit state
- `src/components/shuttle-control/ShuttleControlProgramInventory.vue` — use InventoryTable in view mode
