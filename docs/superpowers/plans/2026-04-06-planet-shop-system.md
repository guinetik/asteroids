# Planet Shop System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-planet trade shops with rotating stock, demand-driven pricing, and a buy-low-sell-high economy loop accessible while orbiting any planet.

**Architecture:** New data files (`trade-goods.json`, `planet-demand.json`) define 50 trade goods and a demand matrix. Domain logic in `src/lib/shop/` handles sessions, demand pricing, and trade good catalog. Vue components (`PlanetShopDialog`, `InventoryTable`, `ShopButton`, `CreditsBadge`) wire into the existing MapView orbit state. The existing auto-refuel on Earth is replaced by shop-purchased refueling at any planet.

**Tech Stack:** Vue 3, TypeScript, Pinia, Vitest, Tailwind CSS v4

---

## File Map

### New files — Data
- `src/data/shop/trade-goods.json` — 50 trade good definitions (5 per planet × 10 planets)
- `src/data/shop/planet-demand.json` — demand matrix (which planets want which goods, at what multiplier)

### New files — Domain logic
- `src/lib/shop/tradeTypes.ts` — types for trade goods, demand entries, shop sessions
- `src/lib/shop/tradeGoods.ts` — trade good catalog loader + planet lookup
- `src/lib/shop/planetDemand.ts` — demand multiplier system with variance
- `src/lib/shop/shopSession.ts` — shop session state machine (stock, restock timer, buy/sell)
- `src/lib/shop/__tests__/tradeGoods.spec.ts`
- `src/lib/shop/__tests__/planetDemand.spec.ts`
- `src/lib/shop/__tests__/shopSession.spec.ts`

### New files — Vue components
- `src/components/shop/InventoryTable.vue` — reusable inventory grid (view + sell modes)
- `src/components/shop/PlanetShopDialog.vue` — modal shop overlay (buy + sell columns)
- `src/components/shop/ShopButton.vue` — orbit HUD button to open shop
- `src/components/hud/CreditsBadge.vue` — always-visible credits display

### Modified files
- `src/data/inventory/items.json` — add `icon` field to all items
- `src/data/shop/shop.json` — add refuel listing at 100 credits
- `src/lib/inventory/types.ts` — add `icon` to `ItemDefinition`
- `src/lib/inventory/catalog.ts` — merge trade goods into `ITEM_CATALOG`
- `src/lib/shop/shop.ts` — dynamic sell pricing via demand system
- `src/lib/player/profile.ts` — starting credits → 1000
- `src/lib/defaultBindings.ts` — add `shopAction: ['KeyB']`
- `src/views/MapViewController.ts` — remove auto-refuel, add shop callbacks + B key
- `src/views/MapView.vue` — mount shop components, wire to orbit state
- `src/components/shuttle-control/ShuttleControlProgramInventory.vue` — use InventoryTable
- `src/assets/css/main.css` — shop dialog and component styles

---

## Task 1: Trade Types

**Files:**
- Create: `src/lib/shop/tradeTypes.ts`

- [ ] **Step 1: Create the trade types file**

```ts
/**
 * Trade economy type definitions.
 *
 * Data model for planet-specific trade goods, demand entries,
 * and shop session state. Used by the shop session system,
 * demand pricing, and Vue shop components.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */

/** A trade good produced by a specific planet. */
export interface TradeGoodDefinition {
  /** Unique key, e.g. "heat-resistant-alloys". */
  id: string
  /** Display name for UI. */
  label: string
  /** Flavor text hinting at who wants this good. */
  description: string
  /** Filename in public/images/items/, e.g. "heat-resistant-alloys.png". */
  icon: string
  /** Weight in kg per unit. */
  weightPerUnit: number
  /** Max units in one inventory stack. */
  maxStack: number
  /** Credits charged at the producing planet. */
  basePrice: number
  /** Planet id that produces this good. */
  producedBy: string
}

/** A single demand entry: one planet wants one good at a base multiplier. */
export interface DemandEntry {
  /** Trade good id. */
  itemId: string
  /** Base demand multiplier before variance (1.5–4.0). */
  multiplier: number
}

/** Per-planet demand list loaded from JSON. */
export interface PlanetDemand {
  /** Planet id. */
  planetId: string
  /** Goods this planet wants. */
  demands: DemandEntry[]
}

/** A trade good slot in the shop with current stock. */
export interface TradeGoodSlot {
  /** Trade good id. */
  itemId: string
  /** Units currently in stock. */
  stock: number
  /** Base price at this planet (the producing planet's price). */
  price: number
}

/** Restock timer state. */
export interface RestockTimer {
  /** Seconds remaining until restock. */
  remaining: number
  /** Total duration of this restock cycle in seconds. */
  total: number
}

/** Full shop session for one planet visit. */
export interface ShopSession {
  /** Planet id this shop belongs to. */
  planetId: string
  /** The 3 currently displayed trade good slots. */
  tradeSlots: [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot]
  /** Restock countdown. Null when stock is available and timer hasn't started. */
  restockTimer: RestockTimer | null
  /** Whether all 3 trade slots are sold out. */
  allSoldOut: boolean
}

/** Result of a shop refuel action. */
export interface RefuelResult {
  /** Whether the refuel succeeded. */
  ok: boolean
  /** Reason for failure. */
  reason?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/shop/tradeTypes.ts
git commit -m "feat(shop): add trade economy type definitions"
```

---

## Task 2: Trade Goods Data + Catalog

**Files:**
- Create: `src/data/shop/trade-goods.json`
- Create: `src/lib/shop/tradeGoods.ts`
- Create: `src/lib/shop/__tests__/tradeGoods.spec.ts`
- Modify: `src/lib/inventory/types.ts`
- Modify: `src/data/inventory/items.json`
- Modify: `src/lib/inventory/catalog.ts`

- [ ] **Step 1: Add `icon` field to `ItemDefinition`**

In `src/lib/inventory/types.ts`, add to the `ItemDefinition` interface after the `description` field:

```ts
  /** Icon filename in public/images/items/. */
  icon: string
```

- [ ] **Step 2: Add `icon` to all items in `items.json`**

In `src/data/inventory/items.json`, add `"icon": "<id>.png"` to every item entry. For example the first entry becomes:

```json
{ "id": "olivine", "category": "mineral", "label": "Olivine", "description": "Green silicate mineral common in stony asteroids. Valuable for industrial silicate production.", "icon": "olivine.png", "weightPerUnit": 1, "maxStack": 500, "sellable": true }
```

Apply the same pattern for all 22 items: `"icon": "<id>.png"`.

- [ ] **Step 3: Update item catalog validation to accept `icon`**

In `src/lib/inventory/catalog.ts`, update the `validateItem` function to check for the icon field:

```ts
function validateItem(item: ItemDefinition): ItemDefinition {
  if (!item.id || !item.label || !item.description || !item.icon) {
    throw new Error(`Item "${item.id}" missing required string fields`)
  }
  // ... rest unchanged
}
```

- [ ] **Step 4: Create `trade-goods.json` with all 50 trade goods**

Create `src/data/shop/trade-goods.json` with 50 entries (5 per planet). Each entry follows this shape:

```json
[
  {
    "id": "heat-resistant-alloys",
    "label": "Heat-Resistant Alloys",
    "description": "Forged in solar furnaces at extreme proximity. Engineers building atmospheric rigs on gas giants would pay dearly for these.",
    "icon": "heat-resistant-alloys.png",
    "weightPerUnit": 3,
    "maxStack": 100,
    "basePrice": 40,
    "producedBy": "mercury"
  },
  {
    "id": "solar-panels",
    "label": "Solar Panels",
    "description": "Ultra-efficient photovoltaic arrays calibrated for intense solar radiation. Frontier outposts far from the sun dream of this kind of output.",
    "icon": "solar-panels.png",
    "weightPerUnit": 4,
    "maxStack": 80,
    "basePrice": 35,
    "producedBy": "mercury"
  },
  {
    "id": "radiation-shielding",
    "label": "Radiation Shielding",
    "description": "Layered composite armor designed to deflect solar particle storms. Any colony with a thin atmosphere could use a shipment.",
    "icon": "radiation-shielding.png",
    "weightPerUnit": 5,
    "maxStack": 60,
    "basePrice": 55,
    "producedBy": "mercury"
  },
  {
    "id": "thermal-regulators",
    "label": "Thermal Regulators",
    "description": "Precision heat-exchange modules rated for solar-adjacent operations. Invaluable where temperatures swing between extremes.",
    "icon": "thermal-regulators.png",
    "weightPerUnit": 2,
    "maxStack": 100,
    "basePrice": 30,
    "producedBy": "mercury"
  },
  {
    "id": "sun-forged-glass",
    "label": "Sun-Forged Glass",
    "description": "Optically perfect silicate glass tempered by concentrated sunlight. Research stations prize it for telescope lenses and sensor arrays.",
    "icon": "sun-forged-glass.png",
    "weightPerUnit": 2,
    "maxStack": 120,
    "basePrice": 25,
    "producedBy": "mercury"
  },
  {
    "id": "acid-resistant-coatings",
    "label": "Acid-Resistant Coatings",
    "description": "Polymer sealant that laughs at sulfuric acid. Industrial colonies with corrosive environments can't get enough of this stuff.",
    "icon": "acid-resistant-coatings.png",
    "weightPerUnit": 2,
    "maxStack": 100,
    "basePrice": 30,
    "producedBy": "venus"
  },
  {
    "id": "pressure-vessels",
    "label": "Pressure Vessels",
    "description": "Reinforced containment rated for crushing atmospheric pressure. Deep-atmosphere gas harvesters rely on these to stay alive.",
    "icon": "pressure-vessels.png",
    "weightPerUnit": 6,
    "maxStack": 50,
    "basePrice": 55,
    "producedBy": "venus"
  },
  {
    "id": "sulfuric-compounds",
    "label": "Sulfuric Compounds",
    "description": "Concentrated chemical reagents extracted from acidic clouds. The belt's mining operations burn through these for ore processing.",
    "icon": "sulfuric-compounds.png",
    "weightPerUnit": 3,
    "maxStack": 80,
    "basePrice": 25,
    "producedBy": "venus"
  },
  {
    "id": "atmospheric-filters",
    "label": "Atmospheric Filters",
    "description": "Multi-stage gas scrubbers engineered for toxic atmospheres. Any habitat with impure air recycling would want a crate of these.",
    "icon": "atmospheric-filters.png",
    "weightPerUnit": 2,
    "maxStack": 100,
    "basePrice": 35,
    "producedBy": "venus"
  },
  {
    "id": "dense-gas-canisters",
    "label": "Dense-Gas Canisters",
    "description": "Pressurized exotic gas samples collected from the lower atmosphere. Cryogenics labs in the outer system would find these fascinating.",
    "icon": "dense-gas-canisters.png",
    "weightPerUnit": 4,
    "maxStack": 60,
    "basePrice": 45,
    "producedBy": "venus"
  },
  {
    "id": "luxury-foods",
    "label": "Luxury Foods",
    "description": "Vacuum-sealed Earth delicacies: real bread, chocolate, aged cheese. Colonists on the frontier dream about meals like these.",
    "icon": "luxury-foods.png",
    "weightPerUnit": 1,
    "maxStack": 200,
    "basePrice": 20,
    "producedBy": "earth"
  },
  {
    "id": "medicine",
    "label": "Medicine",
    "description": "Pharmaceutical-grade medical supplies. Every outpost beyond the belt is perpetually short on proper meds.",
    "icon": "medicine.png",
    "weightPerUnit": 1,
    "maxStack": 150,
    "basePrice": 35,
    "producedBy": "earth"
  },
  {
    "id": "entertainment-media",
    "label": "Entertainment Media",
    "description": "Holovids, music libraries, games — the good stuff from Earth studios. Bored crew on long-haul stations will pay for fresh content.",
    "icon": "entertainment-media.png",
    "weightPerUnit": 0.5,
    "maxStack": 200,
    "basePrice": 15,
    "producedBy": "earth"
  },
  {
    "id": "textiles",
    "label": "Textiles",
    "description": "Natural fabrics grown from Earth's biosphere. Colonists wearing nothing but printed synthetics would trade a lot for real cotton.",
    "icon": "textiles.png",
    "weightPerUnit": 1,
    "maxStack": 200,
    "basePrice": 18,
    "producedBy": "earth"
  },
  {
    "id": "biocultures",
    "label": "Biocultures",
    "description": "Living bacterial colonies for terraforming and agriculture. Any world trying to grow its own food needs a starter batch.",
    "icon": "biocultures.png",
    "weightPerUnit": 2,
    "maxStack": 100,
    "basePrice": 50,
    "producedBy": "earth"
  },
  {
    "id": "construction-prefabs",
    "label": "Construction Prefabs",
    "description": "Modular habitat sections milled from Martian iron. Expanding colonies across the system snap these together like building blocks.",
    "icon": "construction-prefabs.png",
    "weightPerUnit": 8,
    "maxStack": 40,
    "basePrice": 45,
    "producedBy": "mars"
  },
  {
    "id": "iron-composites",
    "label": "Iron Composites",
    "description": "High-tensile structural alloy refined from Martian regolith. Anywhere building in low gravity needs strong, light frameworks.",
    "icon": "iron-composites.png",
    "weightPerUnit": 5,
    "maxStack": 60,
    "basePrice": 35,
    "producedBy": "mars"
  },
  {
    "id": "terraforming-enzymes",
    "label": "Terraforming Enzymes",
    "description": "Engineered catalysts that accelerate soil conversion. Worlds with thin atmospheres and barren rock are desperate for these.",
    "icon": "terraforming-enzymes.png",
    "weightPerUnit": 1,
    "maxStack": 100,
    "basePrice": 55,
    "producedBy": "mars"
  },
  {
    "id": "drill-bits",
    "label": "Drill Bits",
    "description": "Industrial-grade cutting heads hardened in Martian foundries. Mining outposts in the belt chew through these weekly.",
    "icon": "drill-bits.png",
    "weightPerUnit": 3,
    "maxStack": 80,
    "basePrice": 25,
    "producedBy": "mars"
  },
  {
    "id": "red-soil-ceramics",
    "label": "Red-Soil Ceramics",
    "description": "Heat-resistant tiles fired from Martian clay. Popular as radiation-absorbing hull plating on ships running hot routes.",
    "icon": "red-soil-ceramics.png",
    "weightPerUnit": 4,
    "maxStack": 70,
    "basePrice": 20,
    "producedBy": "mars"
  },
  {
    "id": "purified-water",
    "label": "Purified Water",
    "description": "Ultra-clean H2O extracted from subsurface ice. Bone-dry worlds closer to the sun would pay a fortune for reliable water shipments.",
    "icon": "purified-water.png",
    "weightPerUnit": 2,
    "maxStack": 150,
    "basePrice": 25,
    "producedBy": "ceres"
  },
  {
    "id": "ice-cores",
    "label": "Ice Cores",
    "description": "Pristine cylinders of ancient frozen water with trapped mineral deposits. Scientific stations love analyzing these layered samples.",
    "icon": "ice-cores.png",
    "weightPerUnit": 3,
    "maxStack": 100,
    "basePrice": 30,
    "producedBy": "ceres"
  },
  {
    "id": "hydroponics-kits",
    "label": "Hydroponics Kits",
    "description": "Self-contained grow-pod systems for food production in zero-g. Every station trying to reduce supply dependency needs a few.",
    "icon": "hydroponics-kits.png",
    "weightPerUnit": 4,
    "maxStack": 60,
    "basePrice": 45,
    "producedBy": "ceres"
  },
  {
    "id": "filtration-membranes",
    "label": "Filtration Membranes",
    "description": "Nano-pore filters for water and air purification. Life-support systems across the system consume these as regular maintenance parts.",
    "icon": "filtration-membranes.png",
    "weightPerUnit": 1,
    "maxStack": 150,
    "basePrice": 20,
    "producedBy": "ceres"
  },
  {
    "id": "brine-concentrates",
    "label": "Brine Concentrates",
    "description": "Mineral-rich saline solution extracted during ice processing. Chemical plants on industrial worlds use these as feedstock.",
    "icon": "brine-concentrates.png",
    "weightPerUnit": 3,
    "maxStack": 80,
    "basePrice": 15,
    "producedBy": "ceres"
  },
  {
    "id": "helium-3-cells",
    "label": "Helium-3 Cells",
    "description": "Fusion fuel harvested from Jupiter's upper atmosphere. The most energy-dense substance in the solar system — everyone wants it.",
    "icon": "helium-3-cells.png",
    "weightPerUnit": 2,
    "maxStack": 80,
    "basePrice": 85,
    "producedBy": "jupiter"
  },
  {
    "id": "magnetic-coils",
    "label": "Magnetic Coils",
    "description": "Superconducting electromagnets wound in Jupiter's orbital factories. Shield generators and particle accelerators can't function without them.",
    "icon": "magnetic-coils.png",
    "weightPerUnit": 5,
    "maxStack": 50,
    "basePrice": 70,
    "producedBy": "jupiter"
  },
  {
    "id": "atmospheric-samples",
    "label": "Atmospheric Samples",
    "description": "Sealed vials of Jovian gas-layer compounds. University labs and pharmaceutical researchers on the inner worlds pay handsomely for these.",
    "icon": "atmospheric-samples.png",
    "weightPerUnit": 1,
    "maxStack": 100,
    "basePrice": 60,
    "producedBy": "jupiter"
  },
  {
    "id": "plasma-conduits",
    "label": "Plasma Conduits",
    "description": "High-capacity energy transfer channels rated for fusion-reactor output. Power-hungry frontier outposts need these to keep the lights on.",
    "icon": "plasma-conduits.png",
    "weightPerUnit": 4,
    "maxStack": 60,
    "basePrice": 100,
    "producedBy": "jupiter"
  },
  {
    "id": "storm-glass",
    "label": "Storm-Glass",
    "description": "Crystalline material formed in Jupiter's perpetual storms. Beautiful and nearly indestructible — luxury markets on the inner worlds love it.",
    "icon": "storm-glass.png",
    "weightPerUnit": 2,
    "maxStack": 80,
    "basePrice": 45,
    "producedBy": "jupiter"
  },
  {
    "id": "ring-ice-crystals",
    "label": "Ring-Ice Crystals",
    "description": "Perfectly formed ice shards harvested from Saturn's rings. Their unique molecular structure makes them ideal for precision cryogenics.",
    "icon": "ring-ice-crystals.png",
    "weightPerUnit": 1,
    "maxStack": 100,
    "basePrice": 65,
    "producedBy": "saturn"
  },
  {
    "id": "exotic-gems",
    "label": "Exotic Gems",
    "description": "Rare crystalline minerals compressed in Saturn's moon system. Inner-world jewelers and collectors compete fiercely for these.",
    "icon": "exotic-gems.png",
    "weightPerUnit": 0.5,
    "maxStack": 80,
    "basePrice": 120,
    "producedBy": "saturn"
  },
  {
    "id": "resonance-instruments",
    "label": "Resonance Instruments",
    "description": "Precision scientific tools calibrated using Saturn's ring harmonics. Deep-space research outposts depend on this calibration accuracy.",
    "icon": "resonance-instruments.png",
    "weightPerUnit": 3,
    "maxStack": 40,
    "basePrice": 95,
    "producedBy": "saturn"
  },
  {
    "id": "prismatic-dust",
    "label": "Prismatic Dust",
    "description": "Iridescent particulate collected from ring debris fields. Coating manufacturers and optical engineers on the inner worlds prize its refractive properties.",
    "icon": "prismatic-dust.png",
    "weightPerUnit": 0.5,
    "maxStack": 150,
    "basePrice": 50,
    "producedBy": "saturn"
  },
  {
    "id": "cryo-silicates",
    "label": "Cryo-Silicates",
    "description": "Silicate minerals with unique low-temperature crystal lattices. Superconductor fabricators in the belt always need more raw feedstock.",
    "icon": "cryo-silicates.png",
    "weightPerUnit": 3,
    "maxStack": 80,
    "basePrice": 55,
    "producedBy": "saturn"
  },
  {
    "id": "cryogenic-coolants",
    "label": "Cryogenic Coolants",
    "description": "Supercooled helium compounds stable at near-absolute-zero. Someone baking in solar radiation closer to the sun would pay a fortune for this.",
    "icon": "cryogenic-coolants.png",
    "weightPerUnit": 3,
    "maxStack": 80,
    "basePrice": 80,
    "producedBy": "uranus"
  },
  {
    "id": "superconductors",
    "label": "Superconductors",
    "description": "Zero-resistance conductors manufactured in Uranian cold-labs. Power grid engineers across the system dream of wiring with these.",
    "icon": "superconductors.png",
    "weightPerUnit": 2,
    "maxStack": 60,
    "basePrice": 110,
    "producedBy": "uranus"
  },
  {
    "id": "exotic-isotopes",
    "label": "Exotic Isotopes",
    "description": "Rare atomic variants isolated from Uranus's unique atmosphere. Medical imaging and weapons research both hunger for these.",
    "icon": "exotic-isotopes.png",
    "weightPerUnit": 1,
    "maxStack": 50,
    "basePrice": 140,
    "producedBy": "uranus"
  },
  {
    "id": "frost-compounds",
    "label": "Frost Compounds",
    "description": "Metastable chemical compounds that only form at extreme cold. Terraforming projects on warm worlds use these to seed cloud cover.",
    "icon": "frost-compounds.png",
    "weightPerUnit": 2,
    "maxStack": 80,
    "basePrice": 65,
    "producedBy": "uranus"
  },
  {
    "id": "null-temp-alloys",
    "label": "Null-Temp Alloys",
    "description": "Metal alloys forged at temperatures approaching absolute zero. Their thermal properties make them essential for deep-space hull construction.",
    "icon": "null-temp-alloys.png",
    "weightPerUnit": 4,
    "maxStack": 50,
    "basePrice": 95,
    "producedBy": "uranus"
  },
  {
    "id": "navigation-beacons",
    "label": "Navigation Beacons",
    "description": "Long-range signal transmitters calibrated for deep-space positioning. The expanding frontier always needs more of these planted.",
    "icon": "navigation-beacons.png",
    "weightPerUnit": 5,
    "maxStack": 40,
    "basePrice": 100,
    "producedBy": "neptune"
  },
  {
    "id": "dark-matter-sensors",
    "label": "Dark-Matter Sensors",
    "description": "Experimental detectors sensitive to exotic particle interactions. Physics labs on the inner worlds would fund entire expeditions for a crate.",
    "icon": "dark-matter-sensors.png",
    "weightPerUnit": 2,
    "maxStack": 30,
    "basePrice": 160,
    "producedBy": "neptune"
  },
  {
    "id": "deep-space-probes",
    "label": "Deep-Space Probes",
    "description": "Autonomous survey drones designed for extreme-range scouting. Exploration agencies near the sun are always commissioning more.",
    "icon": "deep-space-probes.png",
    "weightPerUnit": 6,
    "maxStack": 25,
    "basePrice": 130,
    "producedBy": "neptune"
  },
  {
    "id": "signal-amplifiers",
    "label": "Signal Amplifiers",
    "description": "Quantum-boosted communication relays that defeat light-lag. Every colony struggling with transmission delays wants a set.",
    "icon": "signal-amplifiers.png",
    "weightPerUnit": 3,
    "maxStack": 50,
    "basePrice": 85,
    "producedBy": "neptune"
  },
  {
    "id": "void-wave-emitters",
    "label": "Void-Wave Emitters",
    "description": "Devices that manipulate spacetime ripples at the quantum scale. Military and research applications make these highly sought after everywhere.",
    "icon": "void-wave-emitters.png",
    "weightPerUnit": 3,
    "maxStack": 40,
    "basePrice": 145,
    "producedBy": "neptune"
  },
  {
    "id": "ancient-artifacts",
    "label": "Ancient Artifacts",
    "description": "Enigmatic objects recovered from Kuiper belt ice. Their origin is unknown. Museums and private collectors on the inner worlds will pay anything.",
    "icon": "ancient-artifacts.png",
    "weightPerUnit": 2,
    "maxStack": 20,
    "basePrice": 200,
    "producedBy": "pluto"
  },
  {
    "id": "void-crystals",
    "label": "Void Crystals",
    "description": "Translucent formations that seem to absorb light. Researchers studying dark energy are desperate for samples to analyze.",
    "icon": "void-crystals.png",
    "weightPerUnit": 1,
    "maxStack": 30,
    "basePrice": 180,
    "producedBy": "pluto"
  },
  {
    "id": "dark-ice-specimens",
    "label": "Dark-Ice Specimens",
    "description": "Ice that predates the solar system, laced with unknown compounds. Xenobiologists and chemists everywhere want to study this.",
    "icon": "dark-ice-specimens.png",
    "weightPerUnit": 2,
    "maxStack": 40,
    "basePrice": 150,
    "producedBy": "pluto"
  },
  {
    "id": "kuiper-relics",
    "label": "Kuiper Relics",
    "description": "Fossilized structures found embedded in trans-Neptunian objects. Their geometric precision suggests they're not natural. Priceless to the right buyer.",
    "icon": "kuiper-relics.png",
    "weightPerUnit": 3,
    "maxStack": 15,
    "basePrice": 190,
    "producedBy": "pluto"
  },
  {
    "id": "shadow-minerals",
    "label": "Shadow Minerals",
    "description": "Ores that exist in a metastable quantum state, flickering between visible and invisible. Energy researchers believe they hold the key to new power sources.",
    "icon": "shadow-minerals.png",
    "weightPerUnit": 2,
    "maxStack": 25,
    "basePrice": 160,
    "producedBy": "pluto"
  }
]
```

- [ ] **Step 5: Create the trade goods catalog loader**

Create `src/lib/shop/tradeGoods.ts`:

```ts
/**
 * Trade goods catalog loader.
 *
 * Imports trade-goods.json, validates entries, registers them
 * into the item catalog, and provides planet-based lookups.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { TradeGoodDefinition } from './tradeTypes'
import type { ItemDefinition } from '@/lib/inventory/types'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'
import { PLANET_IDS } from '@/lib/planets/catalog'

import rawTradeGoods from '@/data/shop/trade-goods.json'

const tradeGoods = rawTradeGoods as unknown as TradeGoodDefinition[]

// Validate and register into item catalog
for (const tg of tradeGoods) {
  if (!tg.id || !tg.label || !tg.description || !tg.icon) {
    throw new Error(`Trade good "${tg.id}" missing required string fields`)
  }
  if (tg.basePrice <= 0) {
    throw new Error(`Trade good "${tg.id}" has non-positive basePrice`)
  }
  if (!PLANET_IDS.includes(tg.producedBy)) {
    throw new Error(`Trade good "${tg.id}" references unknown planet "${tg.producedBy}"`)
  }
  // Register as an item in the global catalog so inventory system works
  const itemDef: ItemDefinition = {
    id: tg.id,
    category: 'trade-good' as ItemDefinition['category'],
    label: tg.label,
    description: tg.description,
    icon: tg.icon,
    weightPerUnit: tg.weightPerUnit,
    maxStack: tg.maxStack,
    sellable: true,
  }
  ITEM_CATALOG[tg.id] = itemDef
}

/** All trade goods indexed by id. */
export const TRADE_GOODS: Record<string, TradeGoodDefinition> = Object.fromEntries(
  tradeGoods.map((tg) => [tg.id, tg]),
)

/** Get a trade good definition by id. */
export function getTradeGood(id: string): TradeGoodDefinition | undefined {
  return TRADE_GOODS[id]
}

/** Get the 5 trade goods produced by a planet. */
export function getTradeGoodsByPlanet(planetId: string): TradeGoodDefinition[] {
  return tradeGoods.filter((tg) => tg.producedBy === planetId)
}
```

- [ ] **Step 6: Update `ItemCategory` to include trade goods**

In `src/lib/inventory/types.ts`, update the `ItemCategory` type:

```ts
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good'
```

And update `src/lib/inventory/catalog.ts` validation:

```ts
const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good'])
```

- [ ] **Step 7: Write trade goods tests**

Create `src/lib/shop/__tests__/tradeGoods.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TRADE_GOODS, getTradeGood, getTradeGoodsByPlanet } from '../tradeGoods'
import { PLANET_IDS } from '@/lib/planets/catalog'
import { getItemDefinition } from '@/lib/inventory/catalog'

describe('TRADE_GOODS', () => {
  it('has 50 trade goods total', () => {
    expect(Object.keys(TRADE_GOODS).length).toBe(50)
  })

  it('every planet has exactly 5 goods', () => {
    for (const planetId of PLANET_IDS) {
      const goods = getTradeGoodsByPlanet(planetId)
      expect(goods.length, `${planetId} should have 5 goods`).toBe(5)
    }
  })

  it('all trade goods have positive base prices', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      expect(tg.basePrice, `${tg.id} basePrice`).toBeGreaterThan(0)
    }
  })

  it('all trade goods are registered in the item catalog', () => {
    for (const tg of Object.values(TRADE_GOODS)) {
      const item = getItemDefinition(tg.id)
      expect(item, `${tg.id} should be in item catalog`).toBeDefined()
      expect(item!.category).toBe('trade-good')
      expect(item!.sellable).toBe(true)
    }
  })
})

describe('getTradeGood', () => {
  it('returns a known trade good', () => {
    const tg = getTradeGood('heat-resistant-alloys')
    expect(tg).toBeDefined()
    expect(tg!.producedBy).toBe('mercury')
  })

  it('returns undefined for unknown id', () => {
    expect(getTradeGood('nonexistent')).toBeUndefined()
  })
})
```

- [ ] **Step 8: Run tests**

Run: `bun test:unit src/lib/shop/__tests__/tradeGoods.spec.ts`
Expected: All tests PASS.

Also run: `bun test:unit src/lib/inventory`
Expected: Existing inventory tests still PASS (icon field added).

- [ ] **Step 9: Commit**

```bash
git add src/data/shop/trade-goods.json src/lib/shop/tradeGoods.ts src/lib/shop/tradeTypes.ts src/lib/shop/__tests__/tradeGoods.spec.ts src/lib/inventory/types.ts src/lib/inventory/catalog.ts src/data/inventory/items.json
git commit -m "feat(shop): add 50 trade goods with planet catalog and item catalog integration"
```

---

## Task 3: Planet Demand System

**Files:**
- Create: `src/data/shop/planet-demand.json`
- Create: `src/lib/shop/planetDemand.ts`
- Create: `src/lib/shop/__tests__/planetDemand.spec.ts`

- [ ] **Step 1: Create `planet-demand.json`**

Create `src/data/shop/planet-demand.json`. Each planet lists the goods it demands with a base multiplier. Multipliers follow the route tier system (1.5–4x based on distance):

```json
{
  "mercury": {
    "demands": [
      { "itemId": "cryogenic-coolants", "multiplier": 3.0 },
      { "itemId": "luxury-foods", "multiplier": 2.0 },
      { "itemId": "purified-water", "multiplier": 2.5 },
      { "itemId": "frost-compounds", "multiplier": 2.5 },
      { "itemId": "filtration-membranes", "multiplier": 1.8 }
    ]
  },
  "venus": {
    "demands": [
      { "itemId": "radiation-shielding", "multiplier": 1.5 },
      { "itemId": "medicine", "multiplier": 1.8 },
      { "itemId": "construction-prefabs", "multiplier": 1.5 },
      { "itemId": "thermal-regulators", "multiplier": 1.5 },
      { "itemId": "drill-bits", "multiplier": 1.5 }
    ]
  },
  "earth": {
    "demands": [
      { "itemId": "helium-3-cells", "multiplier": 2.5 },
      { "itemId": "exotic-gems", "multiplier": 2.5 },
      { "itemId": "void-crystals", "multiplier": 4.0 },
      { "itemId": "ancient-artifacts", "multiplier": 3.5 },
      { "itemId": "atmospheric-samples", "multiplier": 2.0 }
    ]
  },
  "mars": {
    "demands": [
      { "itemId": "purified-water", "multiplier": 1.5 },
      { "itemId": "biocultures", "multiplier": 1.5 },
      { "itemId": "luxury-foods", "multiplier": 1.5 },
      { "itemId": "entertainment-media", "multiplier": 1.5 },
      { "itemId": "hydroponics-kits", "multiplier": 1.8 }
    ]
  },
  "ceres": {
    "demands": [
      { "itemId": "iron-composites", "multiplier": 1.5 },
      { "itemId": "resonance-instruments", "multiplier": 2.0 },
      { "itemId": "luxury-foods", "multiplier": 1.8 },
      { "itemId": "drill-bits", "multiplier": 1.5 },
      { "itemId": "magnetic-coils", "multiplier": 2.0 }
    ]
  },
  "jupiter": {
    "demands": [
      { "itemId": "entertainment-media", "multiplier": 2.0 },
      { "itemId": "heat-resistant-alloys", "multiplier": 2.5 },
      { "itemId": "construction-prefabs", "multiplier": 2.0 },
      { "itemId": "textiles", "multiplier": 2.0 },
      { "itemId": "pressure-vessels", "multiplier": 2.0 }
    ]
  },
  "saturn": {
    "demands": [
      { "itemId": "cryogenic-coolants", "multiplier": 2.5 },
      { "itemId": "dark-matter-sensors", "multiplier": 3.0 },
      { "itemId": "luxury-foods", "multiplier": 2.5 },
      { "itemId": "navigation-beacons", "multiplier": 2.5 },
      { "itemId": "medicine", "multiplier": 2.5 }
    ]
  },
  "uranus": {
    "demands": [
      { "itemId": "helium-3-cells", "multiplier": 3.0 },
      { "itemId": "iron-composites", "multiplier": 2.5 },
      { "itemId": "medicine", "multiplier": 3.0 },
      { "itemId": "plasma-conduits", "multiplier": 2.5 },
      { "itemId": "construction-prefabs", "multiplier": 2.5 }
    ]
  },
  "neptune": {
    "demands": [
      { "itemId": "luxury-foods", "multiplier": 3.5 },
      { "itemId": "construction-prefabs", "multiplier": 3.0 },
      { "itemId": "entertainment-media", "multiplier": 3.0 },
      { "itemId": "textiles", "multiplier": 3.0 },
      { "itemId": "biocultures", "multiplier": 3.5 }
    ]
  },
  "pluto": {
    "demands": [
      { "itemId": "luxury-foods", "multiplier": 4.0 },
      { "itemId": "purified-water", "multiplier": 3.5 },
      { "itemId": "helium-3-cells", "multiplier": 3.5 },
      { "itemId": "medicine", "multiplier": 4.0 },
      { "itemId": "hydroponics-kits", "multiplier": 3.5 }
    ]
  }
}
```

- [ ] **Step 2: Create the demand system**

Create `src/lib/shop/planetDemand.ts`:

```ts
/**
 * Planet demand and pricing system.
 *
 * Loads the demand matrix, applies ±20% variance on a global
 * timer, and computes sell prices and desirability pips.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { DemandEntry } from './tradeTypes'
import { getTradeGood } from './tradeGoods'
import { getSellPrice } from './catalog'

import rawDemand from '@/data/shop/planet-demand.json'

/** Maximum desirability pip rating. */
const MAX_PIPS = 5

/** Variance range applied to demand multipliers (±20%). */
const VARIANCE_RANGE = 0.2

/** Global demand refresh interval in seconds (~5 minutes). */
export const DEMAND_REFRESH_INTERVAL_S = 300

/** Fallback multiplier for items a planet doesn't specifically demand. */
const JUNK_MULTIPLIER = 0.5

// ─── Internal state ─────────────────────────────────────────────────────────

interface PlanetDemandData {
  demands: DemandEntry[]
}

const demandMap: Record<string, PlanetDemandData> = rawDemand as unknown as Record<
  string,
  PlanetDemandData
>

/** Per-item variance offsets keyed by `planetId:itemId`. Randomized on refresh. */
let varianceMap: Record<string, number> = {}

/** Time accumulator for global demand refresh. */
let demandTimer = 0

/** Randomize all variance offsets. */
export function refreshDemandVariance(): void {
  varianceMap = {}
  for (const [planetId, data] of Object.entries(demandMap)) {
    for (const entry of data.demands) {
      const key = `${planetId}:${entry.itemId}`
      // Random value in [-VARIANCE_RANGE, +VARIANCE_RANGE]
      varianceMap[key] = (Math.random() * 2 - 1) * VARIANCE_RANGE
    }
  }
}

// Initialize variance on module load
refreshDemandVariance()

/**
 * Tick the global demand timer. Refreshes variance when the interval elapses.
 *
 * @param dt - Delta time in seconds.
 * @returns True if variance was refreshed this tick.
 */
export function tickDemandTimer(dt: number): boolean {
  demandTimer += dt
  if (demandTimer >= DEMAND_REFRESH_INTERVAL_S) {
    demandTimer = 0
    refreshDemandVariance()
    return true
  }
  return false
}

/** Reset the demand timer and variance (used on death/restart). */
export function resetDemand(): void {
  demandTimer = 0
  refreshDemandVariance()
}

/**
 * Get the current demand multiplier for an item at a planet.
 * Returns the junk multiplier (0.5) if the planet doesn't want the item.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Trade good id.
 * @returns Current demand multiplier with variance applied.
 */
export function getDemandMultiplier(planetId: string, itemId: string): number {
  const data = demandMap[planetId]
  if (!data) return JUNK_MULTIPLIER

  const entry = data.demands.find((d) => d.itemId === itemId)
  if (!entry) return JUNK_MULTIPLIER

  const key = `${planetId}:${itemId}`
  const variance = varianceMap[key] ?? 0
  return entry.multiplier * (1 + variance)
}

/**
 * Compute the sell price for an item at a planet.
 * Trade goods use the demand matrix. Minerals use the fixed sell prices
 * from shop.json as a fallback.
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Item id (trade good or mineral).
 * @returns Credit value per unit, or 0 if the item has no sell value.
 */
export function computeSellPrice(planetId: string, itemId: string): number {
  const tg = getTradeGood(itemId)
  if (tg) {
    const multiplier = getDemandMultiplier(planetId, itemId)
    return Math.round(tg.basePrice * multiplier)
  }

  // Fallback: check fixed mineral sell prices from shop.json
  const fixedPrice = getSellPrice(itemId)
  return fixedPrice ?? 0
}

/**
 * Compute desirability pips (0–5) for an item at a planet.
 *
 * Maps the demand multiplier to a 0–5 scale where:
 * - 0 pips = junk multiplier (0.5x) or unknown item
 * - 5 pips = 4x+ multiplier
 *
 * @param planetId - Planet where the player is selling.
 * @param itemId - Trade good id.
 * @returns Integer pip count 0–5.
 */
export function getDesirabilityPips(planetId: string, itemId: string): number {
  const tg = getTradeGood(itemId)
  // Non-trade-goods (minerals, consumables) always show 0 pips
  if (!tg) return 0

  const multiplier = getDemandMultiplier(planetId, itemId)
  if (multiplier <= JUNK_MULTIPLIER) return 0

  // Linear map: 1.0x → 1 pip, 4.0x → 5 pips
  const pips = Math.round(((multiplier - 1.0) / 3.0) * (MAX_PIPS - 1)) + 1
  return Math.max(0, Math.min(MAX_PIPS, pips))
}
```

- [ ] **Step 3: Write demand system tests**

Create `src/lib/shop/__tests__/planetDemand.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDemandMultiplier,
  computeSellPrice,
  getDesirabilityPips,
  refreshDemandVariance,
  resetDemand,
  tickDemandTimer,
  DEMAND_REFRESH_INTERVAL_S,
} from '../planetDemand'
// Ensure trade goods are loaded (side-effect import)
import '../tradeGoods'

describe('getDemandMultiplier', () => {
  beforeEach(() => resetDemand())

  it('returns a multiplier > 1 for demanded items', () => {
    // Mercury demands cryogenic-coolants at 3.0 base
    const m = getDemandMultiplier('mercury', 'cryogenic-coolants')
    expect(m).toBeGreaterThan(1)
    expect(m).toBeLessThan(5)
  })

  it('returns junk multiplier (0.5) for items not demanded', () => {
    // Mercury does not demand entertainment-media
    const m = getDemandMultiplier('mercury', 'entertainment-media')
    expect(m).toBe(0.5)
  })

  it('returns junk multiplier for unknown planet', () => {
    expect(getDemandMultiplier('unknown-planet', 'cryogenic-coolants')).toBe(0.5)
  })
})

describe('computeSellPrice', () => {
  beforeEach(() => resetDemand())

  it('returns base × multiplier for a demanded item', () => {
    const price = computeSellPrice('mercury', 'cryogenic-coolants')
    // Cryogenic coolants base=80, mercury demand=3.0 ±20%
    expect(price).toBeGreaterThanOrEqual(Math.round(80 * 3.0 * 0.8))
    expect(price).toBeLessThanOrEqual(Math.round(80 * 3.0 * 1.2))
  })

  it('returns junk price for non-demanded items', () => {
    const price = computeSellPrice('mercury', 'entertainment-media')
    // Entertainment media base=15, junk multiplier=0.5
    expect(price).toBe(Math.round(15 * 0.5))
  })

  it('returns 0 for unknown items', () => {
    expect(computeSellPrice('mercury', 'nonexistent')).toBe(0)
  })
})

describe('getDesirabilityPips', () => {
  beforeEach(() => resetDemand())

  it('returns 0 for non-demanded items', () => {
    expect(getDesirabilityPips('mercury', 'entertainment-media')).toBe(0)
  })

  it('returns 1-5 for demanded items', () => {
    const pips = getDesirabilityPips('mercury', 'cryogenic-coolants')
    expect(pips).toBeGreaterThanOrEqual(1)
    expect(pips).toBeLessThanOrEqual(5)
  })

  it('returns 0 for unknown items', () => {
    expect(getDesirabilityPips('mercury', 'nonexistent')).toBe(0)
  })
})

describe('tickDemandTimer', () => {
  beforeEach(() => resetDemand())

  it('does not refresh before interval', () => {
    expect(tickDemandTimer(10)).toBe(false)
  })

  it('refreshes when interval elapses', () => {
    expect(tickDemandTimer(DEMAND_REFRESH_INTERVAL_S)).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/shop/__tests__/planetDemand.spec.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/shop/planet-demand.json src/lib/shop/planetDemand.ts src/lib/shop/__tests__/planetDemand.spec.ts
git commit -m "feat(shop): add planet demand system with variance and desirability pips"
```

---

## Task 4: Shop Session State Machine

**Files:**
- Create: `src/lib/shop/shopSession.ts`
- Create: `src/lib/shop/__tests__/shopSession.spec.ts`

- [ ] **Step 1: Create the shop session module**

Create `src/lib/shop/shopSession.ts`:

```ts
/**
 * Shop session state management.
 *
 * Creates per-planet shop sessions with rotating trade good stock,
 * restock timers, and buy operations. Pure functions — no side effects.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-planet-shop-system-design.md
 */
import type { ShopSession, TradeGoodSlot, RestockTimer } from './tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import type { ShopResult } from './types'
import { getTradeGoodsByPlanet, getTradeGood } from './tradeGoods'
import { addItem, canFitItem } from '@/lib/inventory/inventory'
import { spendCredits, addCredits } from '@/lib/player/profile'
import { computeSellPrice } from './planetDemand'
import { removeItem } from '@/lib/inventory/inventory'

/** Minimum restock timer duration in seconds. */
const RESTOCK_MIN_S = 120

/** Maximum restock timer duration in seconds. */
const RESTOCK_MAX_S = 240

/** Minimum stock for expensive goods. */
const STOCK_MIN = 5

/** Maximum stock for cheap goods. */
const STOCK_MAX = 20

/** Price threshold: goods below this get higher stock. */
const CHEAP_THRESHOLD = 50

/** Refuel cost in credits. */
export const REFUEL_COST = 100

/** Reserve fuel item id (existing fuel-cell). */
export const RESERVE_FUEL_ID = 'fuel-cell'

/** Reserve fuel cost in credits. */
export const RESERVE_FUEL_COST = 50

/**
 * Pick 3 random trade goods from a planet's 5-item pool.
 * Returns them as TradeGoodSlots with randomized stock.
 */
function pickTradeSlots(planetId: string): [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot] {
  const allGoods = getTradeGoodsByPlanet(planetId)
  // Shuffle and take 3
  const shuffled = [...allGoods].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, 3)

  return picked.map((tg) => {
    const stock =
      tg.basePrice < CHEAP_THRESHOLD
        ? STOCK_MIN + Math.floor(Math.random() * (STOCK_MAX - STOCK_MIN + 1))
        : STOCK_MIN + Math.floor(Math.random() * (STOCK_MAX / 2 - STOCK_MIN + 1))
    return {
      itemId: tg.id,
      stock,
      price: tg.basePrice,
    }
  }) as [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot]
}

/** Generate a random restock duration between min and max. */
function randomRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Create a new shop session for a planet.
 *
 * @param planetId - The planet the player is orbiting.
 * @returns A fresh ShopSession with 3 random trade good slots.
 */
export function createShopSession(planetId: string): ShopSession {
  const tradeSlots = pickTradeSlots(planetId)
  return {
    planetId,
    tradeSlots,
    restockTimer: null,
    allSoldOut: false,
  }
}

/**
 * Tick the shop session restock timer.
 *
 * - If all 3 trade slots are sold out and no timer is running, start one.
 * - If the timer is running, decrement it.
 * - If the timer expires, refresh all 3 slots with new picks/stock.
 *
 * @param session - Current session.
 * @param dt - Delta time in seconds.
 * @returns Updated session (new object if changed).
 */
export function tickShopSession(session: ShopSession, dt: number): ShopSession {
  const allSoldOut = session.tradeSlots.every((slot) => slot.stock <= 0)

  // Start restock timer when all sold out
  if (allSoldOut && !session.restockTimer) {
    const total = randomRestockDuration()
    return { ...session, allSoldOut: true, restockTimer: { remaining: total, total } }
  }

  // Tick existing timer
  if (session.restockTimer) {
    const remaining = session.restockTimer.remaining - dt
    if (remaining <= 0) {
      // Restock: new random picks
      const tradeSlots = pickTradeSlots(session.planetId)
      return { ...session, tradeSlots, restockTimer: null, allSoldOut: false }
    }
    return {
      ...session,
      allSoldOut,
      restockTimer: { ...session.restockTimer, remaining },
    }
  }

  // Also start timer even if not all sold out — restock timer always ticks
  // Actually per spec: timer only matters when all sold out. If stock remains, no timer.
  return session
}

/**
 * Buy a trade good from a shop slot.
 *
 * @param session - Current shop session.
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @param slotIndex - Which trade slot (0, 1, or 2).
 * @param quantity - Units to buy.
 * @returns Updated session, profile, and inventory.
 */
export function buyTradeGood(
  session: ShopSession,
  profile: PlayerProfile,
  inventory: Inventory,
  slotIndex: number,
  quantity: number,
): { ok: boolean; session: ShopSession; profile: PlayerProfile; inventory: Inventory; reason?: string } {
  const slot = session.tradeSlots[slotIndex]
  if (!slot) return { ok: false, session, profile, inventory, reason: 'Invalid slot index' }

  if (slot.stock < quantity) {
    return { ok: false, session, profile, inventory, reason: 'Insufficient stock' }
  }

  const totalCost = slot.price * quantity

  if (!canFitItem(inventory, slot.itemId, quantity)) {
    return { ok: false, session, profile, inventory, reason: 'Cannot fit item in inventory' }
  }

  const updatedProfile = spendCredits(profile, totalCost)
  if (!updatedProfile) {
    return { ok: false, session, profile, inventory, reason: 'Insufficient credits' }
  }

  const addResult = addItem(inventory, slot.itemId, quantity)
  if (!addResult.ok) {
    return { ok: false, session, profile, inventory, reason: addResult.reason }
  }

  // Update slot stock
  const updatedSlots = [...session.tradeSlots] as [TradeGoodSlot, TradeGoodSlot, TradeGoodSlot]
  updatedSlots[slotIndex] = { ...slot, stock: slot.stock - quantity }
  const updatedSession = { ...session, tradeSlots: updatedSlots }

  return { ok: true, session: updatedSession, profile: updatedProfile, inventory: addResult.inventory }
}

/**
 * Sell an inventory item at the current planet's demand price.
 *
 * @param session - Current shop session (for planet id).
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @param itemId - Item to sell.
 * @param quantity - Units to sell.
 * @returns Updated profile and inventory.
 */
export function sellTradeGood(
  session: ShopSession,
  profile: PlayerProfile,
  inventory: Inventory,
  itemId: string,
  quantity: number,
): ShopResult {
  const removeResult = removeItem(inventory, itemId, quantity)
  if (!removeResult.ok) {
    return { ok: false, profile, inventory, reason: removeResult.reason }
  }

  const pricePerUnit = computeSellPrice(session.planetId, itemId)
  if (pricePerUnit <= 0) {
    return { ok: false, profile, inventory, reason: 'Item has no sell value' }
  }

  const totalPayout = pricePerUnit * quantity
  const updatedProfile = addCredits(profile, totalPayout)

  return { ok: true, profile: updatedProfile, inventory: removeResult.inventory }
}
```

- [ ] **Step 2: Write shop session tests**

Create `src/lib/shop/__tests__/shopSession.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createShopSession,
  tickShopSession,
  buyTradeGood,
  sellTradeGood,
  REFUEL_COST,
  RESERVE_FUEL_COST,
} from '../shopSession'
import { createProfile, addCredits } from '@/lib/player/profile'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import { resetDemand } from '../planetDemand'
// Side-effect: register trade goods into item catalog
import '../tradeGoods'

describe('createShopSession', () => {
  it('creates a session with 3 trade slots for Earth', () => {
    const session = createShopSession('earth')
    expect(session.planetId).toBe('earth')
    expect(session.tradeSlots).toHaveLength(3)
    expect(session.restockTimer).toBeNull()
    expect(session.allSoldOut).toBe(false)
  })

  it('all 3 slots have distinct item ids', () => {
    const session = createShopSession('earth')
    const ids = session.tradeSlots.map((s) => s.itemId)
    expect(new Set(ids).size).toBe(3)
  })

  it('all slots have stock > 0', () => {
    const session = createShopSession('jupiter')
    for (const slot of session.tradeSlots) {
      expect(slot.stock).toBeGreaterThan(0)
    }
  })
})

describe('buyTradeGood', () => {
  it('buys 1 item: credits debited, stock decremented, item in inventory', () => {
    const session = createShopSession('earth')
    const profile = addCredits(createProfile('Joe'), 1000)
    const inventory = createInventory()
    const slot = session.tradeSlots[0]!

    const result = buyTradeGood(session, profile, inventory, 0, 1)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBe(1000 - slot.price)
    expect(result.session.tradeSlots[0]!.stock).toBe(slot.stock - 1)
    expect(result.inventory.stacks).toHaveLength(1)
    expect(result.inventory.stacks[0]!.itemId).toBe(slot.itemId)
  })

  it('fails with insufficient credits', () => {
    const session = createShopSession('pluto') // Expensive goods
    const profile = addCredits(createProfile('Joe'), 1) // Only 1 credit
    const inventory = createInventory()

    const result = buyTradeGood(session, profile, inventory, 0, 1)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('credits')
  })

  it('fails when stock is insufficient', () => {
    const session = createShopSession('earth')
    const profile = addCredits(createProfile('Joe'), 99999)
    const inventory = createInventory()

    const result = buyTradeGood(session, profile, inventory, 0, 9999)

    expect(result.ok).toBe(false)
    expect(result.reason).toContain('stock')
  })

  it('fails for invalid slot index', () => {
    const session = createShopSession('earth')
    const profile = addCredits(createProfile('Joe'), 1000)
    const inventory = createInventory()

    const result = buyTradeGood(session, profile, inventory, 5, 1)
    expect(result.ok).toBe(false)
  })
})

describe('sellTradeGood', () => {
  beforeEach(() => resetDemand())

  it('sells an item at demand price', () => {
    const session = createShopSession('mercury')
    const profile = createProfile('Joe')
    // Add cryogenic-coolants (mercury demands these at 3.0x, base=80)
    const inv = addItem(createInventory(), 'cryogenic-coolants', 10).inventory

    const result = sellTradeGood(session, profile, inv, 'cryogenic-coolants', 5)

    expect(result.ok).toBe(true)
    expect(result.profile.credits).toBeGreaterThan(0)
    expect(result.inventory.stacks[0]!.quantity).toBe(5)
  })

  it('fails when item not in inventory', () => {
    const session = createShopSession('mercury')
    const profile = createProfile('Joe')
    const inventory = createInventory()

    const result = sellTradeGood(session, profile, inventory, 'cryogenic-coolants', 1)
    expect(result.ok).toBe(false)
  })
})

describe('tickShopSession', () => {
  it('starts restock timer when all slots sold out', () => {
    let session = createShopSession('earth')
    // Drain all stock
    session = {
      ...session,
      tradeSlots: session.tradeSlots.map((s) => ({ ...s, stock: 0 })) as typeof session.tradeSlots,
    }

    const updated = tickShopSession(session, 0)
    expect(updated.allSoldOut).toBe(true)
    expect(updated.restockTimer).not.toBeNull()
  })

  it('restocks when timer expires', () => {
    let session = createShopSession('earth')
    session = {
      ...session,
      tradeSlots: session.tradeSlots.map((s) => ({ ...s, stock: 0 })) as typeof session.tradeSlots,
    }

    // Start timer
    session = tickShopSession(session, 0)
    const timer = session.restockTimer!

    // Fast-forward past timer
    const restocked = tickShopSession(session, timer.remaining + 1)
    expect(restocked.restockTimer).toBeNull()
    expect(restocked.allSoldOut).toBe(false)
    for (const slot of restocked.tradeSlots) {
      expect(slot.stock).toBeGreaterThan(0)
    }
  })

  it('does nothing when stock is still available', () => {
    const session = createShopSession('earth')
    const updated = tickShopSession(session, 10)
    expect(updated).toBe(session) // Same reference — no change
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/shop/__tests__/shopSession.spec.ts`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shop/shopSession.ts src/lib/shop/__tests__/shopSession.spec.ts
git commit -m "feat(shop): add shop session state machine with buy, sell, and restock"
```

---

## Task 5: Update Player Starting Credits

**Files:**
- Modify: `src/lib/player/profile.ts`
- Modify: `src/lib/player/__tests__/profile.spec.ts`

- [ ] **Step 1: Change starting credits to 1000**

In `src/lib/player/profile.ts`, update `createProfile`:

```ts
/** Starting credits for a new player. */
const STARTING_CREDITS = 1000

/** Create a fresh profile with zero progress. */
export function createProfile(name: string): PlayerProfile {
  return {
    name,
    credits: STARTING_CREDITS,
    completedMissionCount: 0,
    visitedAsteroids: {},
  }
}
```

- [ ] **Step 2: Update profile tests**

In `src/lib/player/__tests__/profile.spec.ts`, find any test that asserts `credits: 0` on a fresh profile and update to `credits: 1000`. For example if there's a test like:

```ts
expect(profile.credits).toBe(0)
```

Change to:

```ts
expect(profile.credits).toBe(1000)
```

Also update any shop tests in `src/lib/shop/__tests__/shop.spec.ts` where `createProfile` is used and credits are checked — the base credits are now 1000 not 0. For the sell test:

```ts
// sellItem sell 10 olivine test: credits was 0 + 30 = 30, now 1000 + 30 = 1030
expect(result.profile.credits).toBe(1030)
```

And the iron-nickel-alloy sell test:

```ts
// Was 0 + 60 = 60, now 1000 + 60 = 1060
expect(result.profile.credits).toBe(1060)
```

- [ ] **Step 3: Run all tests**

Run: `bun test:unit`
Expected: All tests PASS. Fix any other assertions broken by the starting credits change.

- [ ] **Step 4: Commit**

```bash
git add src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts src/lib/shop/__tests__/shop.spec.ts
git commit -m "feat(shop): change starting credits to 1000"
```

---

## Task 6: Add Shop Key Binding

**Files:**
- Modify: `src/lib/defaultBindings.ts`

- [ ] **Step 1: Add `shopAction` binding**

In `src/lib/defaultBindings.ts`, add to the `DEFAULT_BINDINGS` object:

```ts
  shopAction: ['KeyB'],
```

Place it after the `focusHabitat` line.

- [ ] **Step 2: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat(shop): add B key binding for shop action"
```

---

## Task 7: CreditsBadge HUD Component

**Files:**
- Create: `src/components/hud/CreditsBadge.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create CreditsBadge component**

Create `src/components/hud/CreditsBadge.vue`:

```vue
<script setup lang="ts">
defineProps<{
  credits: number
}>()
</script>

<template>
  <div class="credits-badge">
    <span class="credits-badge__icon">CR</span>
    <span class="credits-badge__value">{{ credits.toLocaleString() }}</span>
  </div>
</template>
```

- [ ] **Step 2: Add CSS styles**

In `src/assets/css/main.css`, add at the end:

```css
/* Credits Badge HUD */
.credits-badge {
  @apply fixed top-4 right-4 z-30 flex items-center gap-2
         rounded-lg border border-cyan-400/30 bg-slate-950/80
         px-4 py-2 font-mono text-sm text-cyan-300 shadow-lg
         pointer-events-none;
}

.credits-badge__icon {
  @apply text-cyan-500 font-bold text-xs;
}

.credits-badge__value {
  @apply tabular-nums;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/hud/CreditsBadge.vue src/assets/css/main.css
git commit -m "feat(shop): add CreditsBadge HUD component"
```

---

## Task 8: InventoryTable Component

**Files:**
- Create: `src/components/shop/InventoryTable.vue`
- Modify: `src/components/shuttle-control/ShuttleControlProgramInventory.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create InventoryTable component**

Create `src/components/shop/InventoryTable.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { InventoryStack } from '@/lib/inventory/types'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getDesirabilityPips } from '@/lib/shop/planetDemand'

const props = defineProps<{
  items: InventoryStack[]
  mode: 'view' | 'sell'
  planetId?: string
}>()

const emit = defineEmits<{
  sell: [itemId: string, quantity: number]
}>()

interface DisplayRow {
  itemId: string
  label: string
  icon: string
  quantity: number
  weightKg: number
  pips: number
}

const rows = computed<DisplayRow[]>(() => {
  const result: DisplayRow[] = props.items.map((stack) => {
    const def = getItemDefinition(stack.itemId)
    const pips =
      props.mode === 'sell' && props.planetId
        ? getDesirabilityPips(props.planetId, stack.itemId)
        : 0
    return {
      itemId: stack.itemId,
      label: def?.label ?? stack.itemId,
      icon: def?.icon ?? '',
      quantity: stack.quantity,
      weightKg: stack.totalWeightKg,
      pips,
    }
  })

  // In sell mode, sort by desirability (highest first)
  if (props.mode === 'sell') {
    result.sort((a, b) => b.pips - a.pips)
  }

  return result
})

function handleSell(itemId: string) {
  emit('sell', itemId, 1)
}
</script>

<template>
  <div class="inventory-table">
    <div v-if="rows.length === 0" class="inventory-table__empty">
      Cargo hold is empty.
    </div>
    <div v-else class="inventory-table__grid">
      <div
        v-for="row in rows"
        :key="row.itemId"
        class="inventory-table__row"
      >
        <div class="inventory-table__icon-cell">
          <div class="inventory-table__icon-placeholder">{{ row.label.charAt(0) }}</div>
        </div>
        <div class="inventory-table__info">
          <span class="inventory-table__name">{{ row.label }}</span>
          <span class="inventory-table__meta">{{ row.quantity }} units &middot; {{ row.weightKg.toFixed(0) }} kg</span>
        </div>
        <div v-if="mode === 'sell'" class="inventory-table__demand">
          <span
            v-for="p in 5"
            :key="p"
            class="inventory-table__pip"
            :class="p <= row.pips ? 'inventory-table__pip--active' : 'inventory-table__pip--inactive'"
          />
        </div>
        <button
          v-if="mode === 'sell'"
          type="button"
          class="inventory-table__sell-btn"
          @click="handleSell(row.itemId)"
        >
          Sell
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Update ShuttleControlProgramInventory to use InventoryTable**

Replace the contents of `src/components/shuttle-control/ShuttleControlProgramInventory.vue`:

```vue
<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Inventory</h2>
    <InventoryTable :items="[]" mode="view" />
  </div>
</template>

<script setup lang="ts">
import InventoryTable from '@/components/shop/InventoryTable.vue'
</script>
```

Note: The `items` prop is `[]` for now — it will be wired to the player's actual inventory in a later integration task when the inventory Pinia store is connected.

- [ ] **Step 3: Add InventoryTable CSS**

In `src/assets/css/main.css`, add:

```css
/* Inventory Table */
.inventory-table {
  @apply flex flex-col gap-1;
}

.inventory-table__empty {
  @apply py-6 text-center text-sm text-slate-500 italic;
}

.inventory-table__grid {
  @apply flex flex-col gap-1;
}

.inventory-table__row {
  @apply flex items-center gap-3 rounded-lg border border-white/5
         bg-white/5 px-3 py-2;
}

.inventory-table__icon-cell {
  @apply shrink-0;
}

.inventory-table__icon-placeholder {
  @apply flex h-8 w-8 items-center justify-center rounded
         bg-slate-700 text-xs font-bold text-slate-300;
}

.inventory-table__info {
  @apply flex flex-1 flex-col;
}

.inventory-table__name {
  @apply text-sm text-slate-100;
}

.inventory-table__meta {
  @apply text-xs text-slate-500;
}

.inventory-table__demand {
  @apply flex gap-0.5;
}

.inventory-table__pip {
  @apply h-2 w-2 rounded-full;
}

.inventory-table__pip--active {
  @apply bg-cyan-400;
}

.inventory-table__pip--inactive {
  @apply bg-slate-700;
}

.inventory-table__sell-btn {
  @apply shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10
         px-3 py-1 text-xs font-mono text-cyan-300
         hover:bg-cyan-400/20 transition-colors cursor-pointer;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/shop/InventoryTable.vue src/components/shuttle-control/ShuttleControlProgramInventory.vue src/assets/css/main.css
git commit -m "feat(shop): add InventoryTable component and wire into inventory program"
```

---

## Task 9: ShopButton Component

**Files:**
- Create: `src/components/shop/ShopButton.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create ShopButton component**

Create `src/components/shop/ShopButton.vue`:

```vue
<script setup lang="ts">
defineProps<{
  planetName: string
}>()

defineEmits<{
  open: []
}>()
</script>

<template>
  <div class="shop-button-container">
    <button
      type="button"
      class="shop-button"
      @click="$emit('open')"
    >
      <span class="shop-button__label">Shop</span>
      <span class="shop-button__planet">{{ planetName }}</span>
    </button>
    <span class="shop-button__hint">B</span>
  </div>
</template>
```

- [ ] **Step 2: Add CSS**

In `src/assets/css/main.css`, add:

```css
/* Shop Button */
.shop-button-container {
  @apply fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2;
}

.shop-button {
  @apply flex flex-col items-center rounded-lg border border-amber-400/30
         bg-slate-950/80 px-5 py-2 font-mono text-sm shadow-lg
         hover:bg-amber-400/10 transition-colors cursor-pointer;
}

.shop-button__label {
  @apply text-amber-300 font-bold text-xs uppercase tracking-wider;
}

.shop-button__planet {
  @apply text-slate-300 text-xs;
}

.shop-button__hint {
  @apply rounded border border-white/10 bg-slate-800/80
         px-1.5 py-0.5 text-[10px] font-mono text-slate-500;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shop/ShopButton.vue src/assets/css/main.css
git commit -m "feat(shop): add ShopButton orbit HUD component"
```

---

## Task 10: PlanetShopDialog Component

**Files:**
- Create: `src/components/shop/PlanetShopDialog.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Create PlanetShopDialog**

Create `src/components/shop/PlanetShopDialog.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { ShopSession, TradeGoodSlot } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getTradeGood } from '@/lib/shop/tradeGoods'
import { REFUEL_COST, RESERVE_FUEL_COST, RESERVE_FUEL_ID } from '@/lib/shop/shopSession'
import InventoryTable from './InventoryTable.vue'

const props = defineProps<{
  session: ShopSession
  profile: PlayerProfile
  inventory: Inventory
}>()

const emit = defineEmits<{
  close: []
  buyTradeGood: [slotIndex: number, quantity: number]
  sellItem: [itemId: string, quantity: number]
  refuel: []
  buyReserveFuel: []
}>()

const planetName = computed(() => {
  const id = props.session.planetId
  return id.charAt(0).toUpperCase() + id.slice(1)
})

const restockRemaining = computed(() => {
  if (!props.session.restockTimer) return null
  const s = Math.ceil(props.session.restockTimer.remaining)
  const min = Math.floor(s / 60)
  const sec = s % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
})

function slotLabel(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.label ?? slot.itemId
}

function slotDescription(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.description ?? ''
}

function slotIcon(slot: TradeGoodSlot) {
  const tg = getTradeGood(slot.itemId)
  return tg?.label.charAt(0) ?? '?'
}

function canAfford(cost: number): boolean {
  return props.profile.credits >= cost
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.code === 'KeyB') {
    emit('close')
  }
}
</script>

<template>
  <div class="planet-shop-overlay" @keydown="onKeydown" tabindex="0">
    <div class="planet-shop-card">
      <!-- Header -->
      <div class="planet-shop-header">
        <span class="planet-shop-header__title">{{ planetName }} Trading Post</span>
        <span class="planet-shop-header__credits">CR {{ profile.credits.toLocaleString() }}</span>
        <button type="button" class="ship-message-card__button" @click="$emit('close')">
          Close
        </button>
      </div>

      <div class="shuttle-control-divider" />

      <!-- Body: buy + sell columns -->
      <div class="planet-shop-body">
        <!-- Buy column -->
        <div class="planet-shop-column">
          <h3 class="planet-shop-column__title">Buy</h3>

          <!-- Refuel -->
          <div class="planet-shop-item">
            <div class="planet-shop-item__icon-placeholder">F</div>
            <div class="planet-shop-item__info">
              <span class="planet-shop-item__name">Refuel</span>
              <span class="planet-shop-item__desc">Instantly fill fuel tank and recharge all thrusters.</span>
            </div>
            <span class="planet-shop-item__price">{{ REFUEL_COST }} CR</span>
            <button
              type="button"
              class="planet-shop-item__buy-btn"
              :disabled="!canAfford(REFUEL_COST)"
              @click="$emit('refuel')"
            >
              Buy
            </button>
          </div>

          <!-- Reserve fuel -->
          <div class="planet-shop-item">
            <div class="planet-shop-item__icon-placeholder">R</div>
            <div class="planet-shop-item__info">
              <span class="planet-shop-item__name">Reserve Fuel Cell</span>
              <span class="planet-shop-item__desc">Hydrogen fuel cell stored in cargo for later use.</span>
            </div>
            <span class="planet-shop-item__price">{{ RESERVE_FUEL_COST }} CR</span>
            <button
              type="button"
              class="planet-shop-item__buy-btn"
              :disabled="!canAfford(RESERVE_FUEL_COST)"
              @click="$emit('buyReserveFuel')"
            >
              Buy
            </button>
          </div>

          <!-- Restock timer -->
          <div v-if="restockRemaining" class="planet-shop-restock">
            Restocking in {{ restockRemaining }}
          </div>

          <!-- Trade goods -->
          <div
            v-for="(slot, index) in session.tradeSlots"
            :key="slot.itemId"
            class="planet-shop-item"
            :class="{ 'planet-shop-item--sold-out': slot.stock <= 0 }"
          >
            <div class="planet-shop-item__icon-placeholder">{{ slotIcon(slot) }}</div>
            <div class="planet-shop-item__info">
              <span class="planet-shop-item__name">{{ slotLabel(slot) }}</span>
              <span class="planet-shop-item__desc">{{ slotDescription(slot) }}</span>
              <span class="planet-shop-item__stock">
                {{ slot.stock > 0 ? `${slot.stock} in stock` : 'Sold out' }}
              </span>
            </div>
            <span class="planet-shop-item__price">{{ slot.price }} CR</span>
            <button
              type="button"
              class="planet-shop-item__buy-btn"
              :disabled="slot.stock <= 0 || !canAfford(slot.price)"
              @click="$emit('buyTradeGood', index, 1)"
            >
              Buy
            </button>
          </div>
        </div>

        <!-- Sell column -->
        <div class="planet-shop-column">
          <h3 class="planet-shop-column__title">Sell</h3>
          <InventoryTable
            :items="inventory.stacks"
            mode="sell"
            :planet-id="session.planetId"
            @sell="(itemId, qty) => $emit('sellItem', itemId, qty)"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="shuttle-control-footer">
        <span class="ship-message-card__hint">ESC / B  Close</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add CSS**

In `src/assets/css/main.css`, add:

```css
/* Planet Shop Dialog */
.planet-shop-overlay {
  @apply fixed inset-0 z-50 flex items-center justify-center
         bg-slate-950/60 px-6 py-8 backdrop-blur-sm;
}

.planet-shop-card {
  @apply flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl
         border border-amber-400/25 bg-slate-950/95 text-slate-100 shadow-2xl;
  max-height: 85vh;
}

.planet-shop-header {
  @apply flex items-center justify-between border-b border-white/10
         bg-white/5 px-5 py-3 font-mono text-[11px] uppercase
         tracking-widest text-slate-400;
}

.planet-shop-header__title {
  @apply text-amber-300;
}

.planet-shop-header__credits {
  @apply text-cyan-300;
}

.planet-shop-body {
  @apply grid grid-cols-2 gap-4 overflow-y-auto p-5;
}

.planet-shop-column {
  @apply flex flex-col gap-2;
}

.planet-shop-column__title {
  @apply font-mono text-xs uppercase tracking-wider text-slate-500
         border-b border-white/5 pb-1 mb-1;
}

.planet-shop-item {
  @apply flex items-center gap-3 rounded-lg border border-white/5
         bg-white/5 px-3 py-2;
}

.planet-shop-item--sold-out {
  @apply opacity-40;
}

.planet-shop-item__icon-placeholder {
  @apply flex h-10 w-10 shrink-0 items-center justify-center rounded
         bg-slate-700 text-sm font-bold text-slate-300;
}

.planet-shop-item__info {
  @apply flex flex-1 flex-col gap-0.5;
}

.planet-shop-item__name {
  @apply text-sm text-slate-100;
}

.planet-shop-item__desc {
  @apply text-xs text-slate-500 line-clamp-2;
}

.planet-shop-item__stock {
  @apply text-xs text-slate-400;
}

.planet-shop-item__price {
  @apply shrink-0 font-mono text-sm text-amber-300;
}

.planet-shop-item__buy-btn {
  @apply shrink-0 rounded border border-amber-400/30 bg-amber-400/10
         px-3 py-1 text-xs font-mono text-amber-300
         hover:bg-amber-400/20 transition-colors cursor-pointer
         disabled:opacity-30 disabled:cursor-not-allowed;
}

.planet-shop-restock {
  @apply rounded border border-amber-400/20 bg-amber-400/5
         px-3 py-2 text-center text-xs font-mono text-amber-400;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shop/PlanetShopDialog.vue src/assets/css/main.css
git commit -m "feat(shop): add PlanetShopDialog modal component"
```

---

## Task 11: Wire Shop into MapView

**Files:**
- Modify: `src/views/MapViewController.ts`
- Modify: `src/views/MapView.vue`

This is the integration task. It connects all domain logic and Vue components to the existing orbit state machine.

- [ ] **Step 1: Add shop state and callbacks to MapViewController**

In `src/views/MapViewController.ts`, add imports at the top (near other imports):

```ts
import {
  createShopSession,
  tickShopSession,
  buyTradeGood,
  sellTradeGood,
  REFUEL_COST,
  RESERVE_FUEL_COST,
  RESERVE_FUEL_ID,
} from '@/lib/shop/shopSession'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import { tickDemandTimer, resetDemand } from '@/lib/shop/planetDemand'
import { createProfile, addCredits, spendCredits } from '@/lib/player/profile'
import type { PlayerProfile } from '@/lib/player/types'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
// Ensure trade goods are registered in item catalog
import '@/lib/shop/tradeGoods'
```

Add private state fields (in the private member section near line ~290):

```ts
  private shopSession: ShopSession | null = null
  private playerProfile: PlayerProfile = createProfile('Pilot')
  private playerInventory: Inventory = createInventory()
```

Add callback declarations (near the other `on*` callbacks around line ~340):

```ts
  /** Fired when the shop button should show/hide. */
  onShopButton: ((visible: boolean, planetName: string) => void) | null = null
  /** Fired when the shop dialog state changes. */
  onShopState: ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void) | null = null
  /** Fired when credits change (for the HUD badge). */
  onCreditsUpdate: ((credits: number) => void) | null = null
```

- [ ] **Step 2: Remove auto-refuel and add shop logic to orbit tick**

In `src/views/MapViewController.ts`, remove the `EARTH_REFUEL_RATE` constant (line ~179) and remove the auto-refuel block (lines ~1199-1201):

Remove:
```ts
/** Fuel units restored per second while orbiting Earth. */
const EARTH_REFUEL_RATE = 50
```

Remove:
```ts
      // Refuel while orbiting Earth
      if (this.orbitSystem.target?.name === 'Earth') {
        this.shuttleController.thrusterSystem.addFuel(EARTH_REFUEL_RATE * dt)
      }
```

- [ ] **Step 3: Add shop session creation on orbit entry**

In the orbit approach completion logic (where `this.orbitSystem.checkArrival` is called and state transitions to `'orbiting'`), after arrival is confirmed, create a shop session. Find the section near line ~965 where `checkArrival` is called, and add after the existing code block that handles arrival:

Add a new method to the class:

```ts
  /** Create or destroy shop session based on orbit state. */
  private updateShopSession(): void {
    const orbitState = this.orbitSystem?.state ?? 'free'
    const targetName = this.orbitSystem?.target?.name ?? null

    if (orbitState === 'orbiting' && targetName && !this.shopSession) {
      // Find planet id from name
      const planet = PLANETS.find((p) => p.name === targetName)
      if (planet) {
        this.shopSession = createShopSession(planet.id)
        this.onShopButton?.(true, targetName)
        this.onCreditsUpdate?.(this.playerProfile.credits)
      }
    } else if (orbitState !== 'orbiting' && this.shopSession) {
      this.shopSession = null
      this.onShopButton?.(false, '')
      this.onShopState?.(null, this.playerProfile, this.playerInventory)
    }
  }
```

Call `this.updateShopSession()` at the end of the orbit position driving block (after the existing orbit tick code near line ~1200, inside the `if (this.orbitSystem?.state === 'orbiting')` block).

- [ ] **Step 4: Add shop tick for restock timer and demand timer**

In the main animation tick (inside the tick handler that runs each frame), add after the orbit-related code:

```ts
    // Shop session restock tick
    if (this.shopSession) {
      this.shopSession = tickShopSession(this.shopSession, dt)
    }

    // Global demand variance tick
    tickDemandTimer(dt)
```

- [ ] **Step 5: Add B key handling for shop toggle**

In the one-shot action section (where `orbitAction` key press is handled, around line ~797), add after the orbit action handling:

```ts
    // Shop action (B key) — toggle shop while orbiting
    if (this.inputManager?.wasActionPressed('shopAction') && this.orbitSystem?.state === 'orbiting' && this.shopSession) {
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    }
```

- [ ] **Step 6: Add public methods for shop transactions**

Add these public methods to the `MapViewController` class:

```ts
  /** Open the shop dialog (called by Vue ShopButton click). */
  openShop(): void {
    if (this.shopSession) {
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    }
  }

  /** Buy a trade good from the shop. */
  shopBuyTradeGood(slotIndex: number, quantity: number): void {
    if (!this.shopSession) return
    const result = buyTradeGood(this.shopSession, this.playerProfile, this.playerInventory, slotIndex, quantity)
    if (result.ok) {
      this.shopSession = result.session
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
  }

  /** Sell an item from inventory at the current planet. */
  shopSellItem(itemId: string, quantity: number): void {
    if (!this.shopSession) return
    const result = sellTradeGood(this.shopSession, this.playerProfile, this.playerInventory, itemId, quantity)
    if (result.ok) {
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
  }

  /** Refuel the shuttle (instant, 100 credits). */
  shopRefuel(): void {
    if (!this.shuttleController) return
    const updated = spendCredits(this.playerProfile, REFUEL_COST)
    if (!updated) return
    this.playerProfile = updated
    this.shuttleController.thrusterSystem.refuel()
    this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Buy a reserve fuel cell (inventory item, 50 credits). */
  shopBuyReserveFuel(): void {
    if (!this.shopSession) return
    const updated = spendCredits(this.playerProfile, RESERVE_FUEL_COST)
    if (!updated) return
    const addResult = addItem(this.playerInventory, RESERVE_FUEL_ID, 1)
    if (!addResult.ok) return
    this.playerProfile = updated
    this.playerInventory = addResult.inventory
    this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }
```

- [ ] **Step 7: Reset shop state on death**

In the `respawnAtEarth` method, add shop reset:

```ts
    // Reset shop and economy state
    this.shopSession = null
    this.playerProfile = createProfile('Pilot')
    this.playerInventory = createInventory()
    resetDemand()
    this.onShopButton?.(false, '')
    this.onShopState?.(null, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
```

- [ ] **Step 8: Wire Vue components in MapView.vue**

In `src/views/MapView.vue`, add imports:

```ts
import ShopButton from '@/components/shop/ShopButton.vue'
import PlanetShopDialog from '@/components/shop/PlanetShopDialog.vue'
import CreditsBadge from '@/components/hud/CreditsBadge.vue'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'
```

Add reactive state:

```ts
const shopButtonVisible = ref(false)
const shopButtonPlanet = ref('')
const shopDialogVisible = ref(false)
const shopSession = ref<ShopSession | null>(null)
const shopProfile = ref<PlayerProfile>(createProfile('Pilot'))
const shopInventory = ref<Inventory>(createInventory())
const playerCredits = ref(1000)
```

Wire callbacks in `onMounted` (alongside existing callbacks):

```ts
    viewController.onShopButton = (visible, planetName) => {
      shopButtonVisible.value = visible
      shopButtonPlanet.value = planetName
      if (!visible) shopDialogVisible.value = false
    }
    viewController.onShopState = (session, profile, inventory) => {
      if (session) {
        shopSession.value = session
        shopProfile.value = profile
        shopInventory.value = inventory
        shopDialogVisible.value = true
      } else {
        shopDialogVisible.value = false
      }
    }
    viewController.onCreditsUpdate = (credits) => {
      playerCredits.value = credits
    }
```

Add handler functions:

```ts
function openShop() {
  viewController.openShop()
}

function closeShop() {
  shopDialogVisible.value = false
  const canvas = document.querySelector('canvas')
  canvas?.requestPointerLock()
}

function handleShopBuyTradeGood(slotIndex: number, quantity: number) {
  viewController.shopBuyTradeGood(slotIndex, quantity)
}

function handleShopSellItem(itemId: string, quantity: number) {
  viewController.shopSellItem(itemId, quantity)
}

function handleShopRefuel() {
  viewController.shopRefuel()
}

function handleShopBuyReserveFuel() {
  viewController.shopBuyReserveFuel()
}
```

Add template markup (after the ShuttleControlOverlay section):

```html
  <CreditsBadge
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :credits="playerCredits"
  />
  <ShopButton
    v-if="shopButtonVisible && !shopDialogVisible && !shuttleControlVisible"
    :planet-name="shopButtonPlanet"
    @open="openShop"
  />
  <PlanetShopDialog
    v-if="shopDialogVisible && shopSession"
    :session="shopSession"
    :profile="shopProfile"
    :inventory="shopInventory"
    @close="closeShop"
    @buy-trade-good="handleShopBuyTradeGood"
    @sell-item="handleShopSellItem"
    @refuel="handleShopRefuel"
    @buy-reserve-fuel="handleShopBuyReserveFuel"
  />
```

- [ ] **Step 9: Run the dev server and verify**

Run: `bun dev`

Verify:
1. Credits badge shows "CR 1,000" in the top right
2. Orbiting Earth (or any planet) shows the "Shop" button
3. Pressing B or clicking the button opens the shop dialog
4. Buy side shows refuel (100 CR), reserve fuel (50 CR), and 3 trade goods
5. Sell side shows empty cargo (or items if you bought some)
6. Buying a trade good decrements stock and credits
7. Selling an item gives credits based on demand
8. Closing shop with ESC or B works
9. Slingshot away and return — new trade goods appear
10. No auto-refuel on Earth anymore

- [ ] **Step 10: Commit**

```bash
git add src/views/MapViewController.ts src/views/MapView.vue
git commit -m "feat(shop): wire planet shop system into MapView with orbit integration"
```

---

## Task 12: Update shop.json with refuel listing

**Files:**
- Modify: `src/data/shop/shop.json`

- [ ] **Step 1: Add refuel listing**

In `src/data/shop/shop.json`, add refuel to listings:

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

Note: The existing `shop.json` listings remain as-is for the old mineral sell prices. These serve as fallback pricing for minerals that don't appear in the demand matrix. The refuel action is handled directly in `shopSession.ts` (not through this file), so no changes needed here — this file is kept for backwards compatibility with the existing `buyItem`/`sellItem` functions.

- [ ] **Step 2: Commit**

```bash
git add src/data/shop/shop.json
git commit -m "chore(shop): document shop.json as mineral fallback pricing"
```

---

## Task 13: Run Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `bun test:unit`
Expected: All tests PASS.

- [ ] **Step 2: Run type check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No errors (warnings from missing TSDoc on new exports are acceptable).

- [ ] **Step 4: Fix any issues found, then commit**

If any test/type/lint issues are found, fix them and commit:

```bash
git add -A
git commit -m "fix(shop): resolve test/type/lint issues from shop system integration"
```
