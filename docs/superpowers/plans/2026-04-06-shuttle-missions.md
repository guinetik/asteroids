# Shuttle Missions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement planet-to-planet orbital shuttle missions with a mission board, placeholder minigame overlay, and deliver-for-credits loop.

**Architecture:** Data-driven JSON mission pools per planet, pure-function session management (same pattern as `shopSession.ts`), Vue callbacks following the `onShopButton` pattern, and a placeholder minigame overlay. Mission materials are real inventory items with weight.

**Tech Stack:** Vue 3, TypeScript, Vitest, Vite static JSON imports

---

### Task 1: Add `mission-material` Item Category

**Files:**
- Modify: `src/lib/inventory/types.ts:14`
- Modify: `src/lib/inventory/catalog.ts:15`

- [ ] **Step 1: Add `'mission-material'` to ItemCategory union**

In `src/lib/inventory/types.ts`, change:

```ts
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good'
```

to:

```ts
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good' | 'mission-material'
```

- [ ] **Step 2: Add `'mission-material'` to VALID_CATEGORIES**

In `src/lib/inventory/catalog.ts`, change:

```ts
const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good'])
```

to:

```ts
const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good', 'mission-material'])
```

- [ ] **Step 3: Run existing tests to confirm nothing breaks**

Run: `bun test:unit src/lib/inventory`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/inventory/types.ts src/lib/inventory/catalog.ts
git commit -m "feat(missions): add mission-material item category"
```

---

### Task 2: Create Mission Material Item Definitions

**Files:**
- Create: `src/data/missions/mission-materials.json`

- [ ] **Step 1: Create the mission materials JSON**

Create `src/data/missions/mission-materials.json`:

```json
[
  {
    "id": "venusian-gas",
    "category": "mission-material",
    "label": "Venusian Gas",
    "description": "Atmospheric gas samples collected from Venus's upper cloud layer.",
    "icon": "venusian-gas.png",
    "weightPerUnit": 3,
    "maxStack": 20,
    "sellable": false
  },
  {
    "id": "cargo-container",
    "category": "mission-material",
    "label": "Cargo Container",
    "description": "Sealed logistics crate from Earth's orbital warehouse network.",
    "icon": "cargo-container.png",
    "weightPerUnit": 8,
    "maxStack": 10,
    "sellable": false
  },
  {
    "id": "methane-sample",
    "category": "mission-material",
    "label": "Methane Sample",
    "description": "Pressurized methane extracted from the Martian subsurface.",
    "icon": "methane-sample.png",
    "weightPerUnit": 2,
    "maxStack": 20,
    "sellable": false
  },
  {
    "id": "probe-telemetry",
    "category": "mission-material",
    "label": "Probe Telemetry",
    "description": "High-density data crystal containing orbital probe sensor readings.",
    "icon": "probe-telemetry.png",
    "weightPerUnit": 1,
    "maxStack": 10,
    "sellable": false
  },
  {
    "id": "jovian-hydrogen",
    "category": "mission-material",
    "label": "Jovian Hydrogen",
    "description": "Metallic hydrogen scooped from Jupiter's deep atmosphere.",
    "icon": "jovian-hydrogen.png",
    "weightPerUnit": 4,
    "maxStack": 15,
    "sellable": false
  },
  {
    "id": "ring-ice",
    "category": "mission-material",
    "label": "Ring Ice",
    "description": "Pristine ice fragments harvested from Saturn's ring system.",
    "icon": "ring-ice.png",
    "weightPerUnit": 3,
    "maxStack": 20,
    "sellable": false
  },
  {
    "id": "solar-alignment-data",
    "category": "mission-material",
    "label": "Solar Alignment Data",
    "description": "Calibration telemetry from Neptune's orbital solar mirror array.",
    "icon": "solar-alignment-data.png",
    "weightPerUnit": 1,
    "maxStack": 10,
    "sellable": false
  },
  {
    "id": "magnetic-field-data",
    "category": "mission-material",
    "label": "Magnetic Field Data",
    "description": "Magnetosphere readings from Uranus's tilted magnetic field probes.",
    "icon": "magnetic-field-data.png",
    "weightPerUnit": 1,
    "maxStack": 10,
    "sellable": false
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/data/missions/mission-materials.json
git commit -m "feat(missions): add mission material item definitions"
```

---

### Task 3: Create Planet Orbital Config Data

**Files:**
- Create: `src/data/missions/planet-orbital-config.json`

- [ ] **Step 1: Create the planet orbital config JSON**

Create `src/data/missions/planet-orbital-config.json`:

```json
[
  { "planetId": "mercury", "gatherItem": "probe-telemetry", "minigameType": "probe-deploy" },
  { "planetId": "venus", "gatherItem": "venusian-gas", "minigameType": "gas-collection" },
  { "planetId": "earth", "gatherItem": "cargo-container", "minigameType": "logistics" },
  { "planetId": "mars", "gatherItem": "methane-sample", "minigameType": "chemistry" },
  { "planetId": "jupiter", "gatherItem": "jovian-hydrogen", "minigameType": "gas-collection" },
  { "planetId": "saturn", "gatherItem": "ring-ice", "minigameType": "ice-harvest" },
  { "planetId": "uranus", "gatherItem": "magnetic-field-data", "minigameType": "probe-deploy" },
  { "planetId": "neptune", "gatherItem": "solar-alignment-data", "minigameType": "maintenance" }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/data/missions/planet-orbital-config.json
git commit -m "feat(missions): add planet orbital config data"
```

---

### Task 4: Create Shuttle Mission Pool Data (Earth + Mars)

**Files:**
- Create: `src/data/shuttle-missions/earth.json`
- Create: `src/data/shuttle-missions/mars.json`
- Create: `src/data/shuttle-missions/venus.json`
- Create: `src/data/shuttle-missions/mercury.json`
- Create: `src/data/shuttle-missions/jupiter.json`
- Create: `src/data/shuttle-missions/saturn.json`
- Create: `src/data/shuttle-missions/uranus.json`
- Create: `src/data/shuttle-missions/neptune.json`

Each planet has a pool of 3 missions that send the player to other planets. Rewards scale with distance — inner system missions are cheaper, outer system missions pay more.

- [ ] **Step 1: Create all shuttle mission pool JSON files**

Create `src/data/shuttle-missions/earth.json`:

```json
{
  "planetId": "earth",
  "missions": [
    {
      "id": "earth_venus_gas_science",
      "name": "Venus Atmospheric Survey",
      "description": "The science division needs gas samples from Venus's upper atmosphere for climate modeling.",
      "targetPlanet": "venus",
      "gatherQuantity": 5,
      "reward": 300
    },
    {
      "id": "earth_mars_methane",
      "name": "Martian Methane Analysis",
      "description": "Exobiology lab requests methane samples from the Martian subsurface for biomarker analysis.",
      "targetPlanet": "mars",
      "gatherQuantity": 3,
      "reward": 250
    },
    {
      "id": "earth_mercury_probe",
      "name": "Mercury Probe Deployment",
      "description": "Deploy a thermal probe into Mercury's orbit and return the telemetry data.",
      "targetPlanet": "mercury",
      "gatherQuantity": 1,
      "reward": 400
    }
  ]
}
```

Create `src/data/shuttle-missions/mars.json`:

```json
{
  "planetId": "mars",
  "missions": [
    {
      "id": "mars_venus_acid_reagents",
      "name": "Venusian Acid Reagents",
      "description": "Martian foundries need sulfuric compounds for ore processing. Collect atmospheric gas from Venus.",
      "targetPlanet": "venus",
      "gatherQuantity": 4,
      "reward": 280
    },
    {
      "id": "mars_earth_cargo_pickup",
      "name": "Earth Supply Run",
      "description": "Pick up a shipment of bioculture starters from Earth's orbital warehouse.",
      "targetPlanet": "earth",
      "gatherQuantity": 2,
      "reward": 200
    },
    {
      "id": "mars_jupiter_hydrogen",
      "name": "Jovian Hydrogen Haul",
      "description": "The fusion reactor needs metallic hydrogen from Jupiter. Hazard pay included.",
      "targetPlanet": "jupiter",
      "gatherQuantity": 3,
      "reward": 500
    }
  ]
}
```

Create `src/data/shuttle-missions/venus.json`:

```json
{
  "planetId": "venus",
  "missions": [
    {
      "id": "venus_earth_logistics",
      "name": "Earth Resupply Pickup",
      "description": "Venus station needs medical supplies from Earth orbit. Standard logistics run.",
      "targetPlanet": "earth",
      "gatherQuantity": 3,
      "reward": 220
    },
    {
      "id": "venus_mercury_solar_data",
      "name": "Mercury Solar Observatory",
      "description": "Deploy calibration probes near Mercury for the Venus solar research program.",
      "targetPlanet": "mercury",
      "gatherQuantity": 2,
      "reward": 350
    },
    {
      "id": "venus_mars_soil_samples",
      "name": "Martian Soil Chemistry",
      "description": "Collect methane samples from Mars for comparative atmospheric studies.",
      "targetPlanet": "mars",
      "gatherQuantity": 4,
      "reward": 300
    }
  ]
}
```

Create `src/data/shuttle-missions/mercury.json`:

```json
{
  "planetId": "mercury",
  "missions": [
    {
      "id": "mercury_venus_gas_harvest",
      "name": "Venus Cloud Harvest",
      "description": "Mercury's chemical plants need Venusian gas for heat-resistant alloy production.",
      "targetPlanet": "venus",
      "gatherQuantity": 6,
      "reward": 320
    },
    {
      "id": "mercury_earth_cargo",
      "name": "Earth Equipment Pickup",
      "description": "New solar furnace components are waiting at Earth's orbital dock.",
      "targetPlanet": "earth",
      "gatherQuantity": 2,
      "reward": 250
    },
    {
      "id": "mercury_mars_methane_fuel",
      "name": "Martian Methane Fuel Run",
      "description": "Mercury mining rigs burn methane for backup power. Collect from Mars.",
      "targetPlanet": "mars",
      "gatherQuantity": 5,
      "reward": 350
    }
  ]
}
```

Create `src/data/shuttle-missions/jupiter.json`:

```json
{
  "planetId": "jupiter",
  "missions": [
    {
      "id": "jupiter_saturn_ice",
      "name": "Saturn Ring Ice Collection",
      "description": "Jupiter station needs pristine ice from Saturn's rings for coolant production.",
      "targetPlanet": "saturn",
      "gatherQuantity": 4,
      "reward": 450
    },
    {
      "id": "jupiter_mars_methane",
      "name": "Martian Methane for Refineries",
      "description": "Jupiter's atmospheric refineries use methane as a catalyst. Collect from Mars.",
      "targetPlanet": "mars",
      "gatherQuantity": 5,
      "reward": 400
    },
    {
      "id": "jupiter_earth_supplies",
      "name": "Earth Resupply Mission",
      "description": "Long-haul cargo pickup from Earth. The crew needs fresh supplies.",
      "targetPlanet": "earth",
      "gatherQuantity": 3,
      "reward": 550
    }
  ]
}
```

Create `src/data/shuttle-missions/saturn.json`:

```json
{
  "planetId": "saturn",
  "missions": [
    {
      "id": "saturn_jupiter_hydrogen",
      "name": "Jovian Hydrogen Extraction",
      "description": "Saturn's orbital habitats need metallic hydrogen for their fusion cores.",
      "targetPlanet": "jupiter",
      "gatherQuantity": 3,
      "reward": 420
    },
    {
      "id": "saturn_uranus_mag_data",
      "name": "Uranus Magnetosphere Survey",
      "description": "Researchers studying Saturn's rings need Uranus magnetic field data for comparison.",
      "targetPlanet": "uranus",
      "gatherQuantity": 2,
      "reward": 500
    },
    {
      "id": "saturn_earth_cargo",
      "name": "Earth Supply Chain",
      "description": "Long-range supply run to Earth orbit. Premium pay for the distance.",
      "targetPlanet": "earth",
      "gatherQuantity": 2,
      "reward": 600
    }
  ]
}
```

Create `src/data/shuttle-missions/uranus.json`:

```json
{
  "planetId": "uranus",
  "missions": [
    {
      "id": "uranus_neptune_solar",
      "name": "Neptune Mirror Maintenance",
      "description": "Align and calibrate Neptune's orbital solar mirror array. Return alignment data.",
      "targetPlanet": "neptune",
      "gatherQuantity": 2,
      "reward": 550
    },
    {
      "id": "uranus_saturn_ice",
      "name": "Saturn Ring Harvest",
      "description": "Collect pristine ring ice from Saturn for Uranus cryo-lab experiments.",
      "targetPlanet": "saturn",
      "gatherQuantity": 3,
      "reward": 480
    },
    {
      "id": "uranus_jupiter_hydrogen",
      "name": "Jupiter Hydrogen Run",
      "description": "Uranus outpost needs metallic hydrogen for emergency reactor fuel.",
      "targetPlanet": "jupiter",
      "gatherQuantity": 2,
      "reward": 520
    }
  ]
}
```

Create `src/data/shuttle-missions/neptune.json`:

```json
{
  "planetId": "neptune",
  "missions": [
    {
      "id": "neptune_uranus_mag_survey",
      "name": "Uranus Magnetic Survey",
      "description": "Deploy magnetosphere probes at Uranus. Data needed for Neptune's shield generators.",
      "targetPlanet": "uranus",
      "gatherQuantity": 3,
      "reward": 500
    },
    {
      "id": "neptune_saturn_ring_samples",
      "name": "Saturn Ring Sample Collection",
      "description": "Collect ring ice for Neptune's water reclamation program.",
      "targetPlanet": "saturn",
      "gatherQuantity": 4,
      "reward": 550
    },
    {
      "id": "neptune_earth_resupply",
      "name": "Deep Space Resupply",
      "description": "Maximum-range supply run to Earth. The longest haul in the system.",
      "targetPlanet": "earth",
      "gatherQuantity": 2,
      "reward": 750
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/shuttle-missions/
git commit -m "feat(missions): add shuttle mission pool data for all planets"
```

---

### Task 5: Add Shuttle Mission Types

**Files:**
- Modify: `src/lib/missions/types.ts`

- [ ] **Step 1: Add shuttle mission types to the existing types file**

Append the following exports to `src/lib/missions/types.ts` (after the existing `MissionTemplate` interface):

```ts
// ---------------------------------------------------------------------------
// Shuttle Missions — planet-to-planet orbital tasks
// ---------------------------------------------------------------------------

/** A shuttle mission template from JSON — one entry in a planet's pool. */
export interface ShuttleMissionTemplate {
  /** Unique key, e.g. "earth_venus_gas_science". */
  id: string
  /** Display name for the mission board. */
  name: string
  /** Flavor text describing the mission. */
  description: string
  /** Planet id the player must travel to. */
  targetPlanet: string
  /** Number of items to gather at the target planet. */
  gatherQuantity: number
  /** Credits awarded on delivery. */
  reward: number
}

/** A planet's full shuttle mission pool loaded from JSON. */
export interface ShuttleMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** The 3 missions in this planet's pool. */
  missions: ShuttleMissionTemplate[]
}

/** Planet orbital config — what a planet produces when visited for a mission. */
export interface PlanetOrbitalConfig {
  /** Planet id. */
  planetId: string
  /** Item id gathered at this planet (e.g. "venusian-gas"). */
  gatherItem: string
  /** Minigame type (ignored until minigames are implemented). */
  minigameType: string
}

/** Status of an active shuttle mission. */
export type ShuttleMissionStatus = 'active' | 'ready-to-deliver'

/** A mission the player has accepted and is working on. */
export interface ActiveShuttleMission {
  /** The original template. */
  template: ShuttleMissionTemplate
  /** Planet id where the mission was accepted and must be delivered. */
  giverPlanet: string
  /** Current mission status. */
  status: ShuttleMissionStatus
}

/** The mission board state for the shuttle control terminal. */
export interface ShuttleMissionBoard {
  /** Currently offered mission at the docked planet (null if restocking or not docked). */
  offeredMission: ShuttleMissionTemplate | null
  /** Which planet is offering (null if not docked). */
  offeringPlanet: string | null
  /** Restock timer — counts down after a mission is taken. */
  restockTimer: RestockTimer | null
  /** All active missions the player has accepted. */
  activeMissions: ActiveShuttleMission[]
}
```

Also add the `RestockTimer` import at the top of the file (it is already defined in `src/lib/shop/tradeTypes.ts`):

```ts
import type { RestockTimer } from '@/lib/shop/tradeTypes'
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat(missions): add shuttle mission type definitions"
```

---

### Task 6: Create Mission Data Loaders

**Files:**
- Create: `src/lib/missions/planetOrbitalConfig.ts`
- Create: `src/lib/missions/shuttleMissionPools.ts`

These follow the same pattern as `src/lib/shop/tradeGoods.ts` — Vite static import, validation, catalog registration.

- [ ] **Step 1: Create the planet orbital config loader**

Create `src/lib/missions/planetOrbitalConfig.ts`:

```ts
/**
 * Planet orbital config loader.
 *
 * Imports planet-orbital-config.json at build time and provides
 * lookups for what each planet produces during orbital missions.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { PlanetOrbitalConfig } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import rawData from '@/data/missions/planet-orbital-config.json'

const configs = rawData as unknown as PlanetOrbitalConfig[]

// Validate planet references
for (const cfg of configs) {
  if (!PLANET_IDS.includes(cfg.planetId)) {
    throw new Error(`Planet orbital config references unknown planet "${cfg.planetId}"`)
  }
}

/** All planet orbital configs keyed by planet id. */
export const PLANET_ORBITAL_CONFIGS: Record<string, PlanetOrbitalConfig> = Object.fromEntries(
  configs.map((c) => [c.planetId, c]),
)

/** Get the orbital config for a planet. Returns undefined if the planet has no config. */
export function getPlanetOrbitalConfig(planetId: string): PlanetOrbitalConfig | undefined {
  return PLANET_ORBITAL_CONFIGS[planetId]
}

/** Get the gather item id for a target planet. Returns undefined if not configured. */
export function getGatherItemForPlanet(planetId: string): string | undefined {
  return PLANET_ORBITAL_CONFIGS[planetId]?.gatherItem
}
```

- [ ] **Step 2: Create the mission materials loader**

Create `src/lib/missions/missionMaterials.ts`:

```ts
/**
 * Mission material catalog registration.
 *
 * Imports mission-materials.json and registers each item into
 * the global ITEM_CATALOG so the inventory system can work with them.
 * Same pattern as trade goods registration in tradeGoods.ts.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { ItemDefinition } from '@/lib/inventory/types'
import { ITEM_CATALOG } from '@/lib/inventory/catalog'

import rawMaterials from '@/data/missions/mission-materials.json'

const materials = rawMaterials as unknown as ItemDefinition[]

// Validate and register into item catalog
for (const mat of materials) {
  if (!mat.id || !mat.label || !mat.description || !mat.icon) {
    throw new Error(`Mission material "${mat.id}" missing required string fields`)
  }
  if (mat.category !== 'mission-material') {
    throw new Error(`Mission material "${mat.id}" has wrong category "${mat.category}"`)
  }
  if (mat.weightPerUnit <= 0) {
    throw new Error(`Mission material "${mat.id}" has non-positive weightPerUnit`)
  }
  ITEM_CATALOG[mat.id] = mat
}
```

- [ ] **Step 3: Create the shuttle mission pool loader**

Create `src/lib/missions/shuttleMissionPools.ts`:

```ts
/**
 * Shuttle mission pool loader.
 *
 * Imports per-planet shuttle mission JSON files at build time
 * and exports a typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type { ShuttleMissionPool } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import earthData from '@/data/shuttle-missions/earth.json'
import marsData from '@/data/shuttle-missions/mars.json'
import venusData from '@/data/shuttle-missions/venus.json'
import mercuryData from '@/data/shuttle-missions/mercury.json'
import jupiterData from '@/data/shuttle-missions/jupiter.json'
import saturnData from '@/data/shuttle-missions/saturn.json'
import uranusData from '@/data/shuttle-missions/uranus.json'
import neptuneData from '@/data/shuttle-missions/neptune.json'

/** All shuttle mission pools, one per planet. */
export const SHUTTLE_MISSION_POOLS: ShuttleMissionPool[] = [
  earthData,
  marsData,
  venusData,
  mercuryData,
  jupiterData,
  saturnData,
  uranusData,
  neptuneData,
] as unknown as ShuttleMissionPool[]

// Validate planet references
for (const pool of SHUTTLE_MISSION_POOLS) {
  if (!PLANET_IDS.includes(pool.planetId)) {
    throw new Error(`Shuttle mission pool references unknown planet "${pool.planetId}"`)
  }
  for (const m of pool.missions) {
    if (!PLANET_IDS.includes(m.targetPlanet)) {
      throw new Error(`Mission "${m.id}" targets unknown planet "${m.targetPlanet}"`)
    }
  }
}

/** Mission pools keyed by planet id. */
const POOLS_BY_PLANET: Record<string, ShuttleMissionPool> = Object.fromEntries(
  SHUTTLE_MISSION_POOLS.map((p) => [p.planetId, p]),
)

/** Get the shuttle mission pool for a planet. Returns undefined if planet has no pool. */
export function getMissionPool(planetId: string): ShuttleMissionPool | undefined {
  return POOLS_BY_PLANET[planetId]
}
```

- [ ] **Step 4: Run type-check**

Run: `bun run type-check`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/planetOrbitalConfig.ts src/lib/missions/missionMaterials.ts src/lib/missions/shuttleMissionPools.ts
git commit -m "feat(missions): add data loaders for orbital config, materials, and mission pools"
```

---

### Task 7: Implement Shuttle Mission Session (TDD)

**Files:**
- Create: `src/lib/missions/shuttleMissionSession.ts`
- Create: `src/lib/missions/__tests__/shuttleMissionSession.spec.ts`

This is the core domain logic — pure functions, same pattern as `shopSession.ts`.

- [ ] **Step 1: Write the test file with all test cases**

Create `src/lib/missions/__tests__/shuttleMissionSession.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMissionBoard,
  offerMission,
  acceptMission,
  completeMission,
  deliverMission,
  tickMissionBoard,
  getActiveMissionsForPlanet,
  getDeliverableMissions,
} from '../shuttleMissionSession'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'
import type { ShuttleMissionBoard } from '../types'
// Side-effect: register mission materials into item catalog
import '../missionMaterials'

describe('createMissionBoard', () => {
  it('creates an empty mission board', () => {
    const board = createMissionBoard()
    expect(board.offeredMission).toBeNull()
    expect(board.offeringPlanet).toBeNull()
    expect(board.restockTimer).toBeNull()
    expect(board.activeMissions).toEqual([])
  })
})

describe('offerMission', () => {
  it('offers 1 mission from a planet pool', () => {
    const board = createMissionBoard()
    const updated = offerMission(board, 'earth')
    expect(updated.offeredMission).not.toBeNull()
    expect(updated.offeringPlanet).toBe('earth')
    expect(['earth_venus_gas_science', 'earth_mars_methane', 'earth_mercury_probe']).toContain(
      updated.offeredMission!.id,
    )
  })

  it('returns board unchanged for planet with no pool', () => {
    const board = createMissionBoard()
    const updated = offerMission(board, 'pluto')
    expect(updated.offeredMission).toBeNull()
  })

  it('does not offer a mission if restock timer is active', () => {
    const board = createMissionBoard()
    const withOffer = offerMission(board, 'earth')
    const accepted = acceptMission(withOffer)
    // Timer is now running
    const reoffered = offerMission(accepted, 'earth')
    expect(reoffered.offeredMission).toBeNull()
  })
})

describe('acceptMission', () => {
  it('moves offered mission to active list', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const missionId = board.offeredMission!.id
    const updated = acceptMission(board)
    expect(updated.offeredMission).toBeNull()
    expect(updated.activeMissions).toHaveLength(1)
    expect(updated.activeMissions[0]!.template.id).toBe(missionId)
    expect(updated.activeMissions[0]!.giverPlanet).toBe('earth')
    expect(updated.activeMissions[0]!.status).toBe('active')
  })

  it('starts restock timer on accept', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const updated = acceptMission(board)
    expect(updated.restockTimer).not.toBeNull()
    expect(updated.restockTimer!.remaining).toBeGreaterThan(0)
  })

  it('returns board unchanged if no offered mission', () => {
    const board = createMissionBoard()
    const updated = acceptMission(board)
    expect(updated.activeMissions).toHaveLength(0)
  })
})

describe('completeMission', () => {
  it('adds gather items to inventory and sets status to ready-to-deliver', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()

    const result = completeMission(accepted, mission.template.id, inventory)
    expect(result.ok).toBe(true)
    expect(result.board.activeMissions[0]!.status).toBe('ready-to-deliver')
    expect(result.inventory.stacks.length).toBeGreaterThan(0)
  })

  it('fails when inventory cannot fit items', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    // Create inventory with 0 capacity
    const inventory = createInventory()
    const fullInventory = { ...inventory, maxWeightKg: 0 }

    const result = completeMission(accepted, mission.template.id, fullInventory)
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('fails for unknown mission id', () => {
    const board = createMissionBoard()
    const inventory = createInventory()
    const result = completeMission(board, 'nonexistent', inventory)
    expect(result.ok).toBe(false)
  })
})

describe('deliverMission', () => {
  it('removes items, awards credits, and removes mission', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const profile = createProfile('Pilot')

    // Complete the mission first
    const completed = completeMission(accepted, mission.template.id, inventory)
    expect(completed.ok).toBe(true)

    // Now deliver
    const result = deliverMission(
      completed.board,
      mission.template.id,
      profile,
      completed.inventory,
    )
    expect(result.ok).toBe(true)
    expect(result.board.activeMissions).toHaveLength(0)
    expect(result.profile.credits).toBe(profile.credits + mission.template.reward)
    // Items should be removed from inventory
    const materialStack = result.inventory.stacks.find(
      (s) => s.quantity > 0,
    )
    expect(materialStack).toBeUndefined()
  })

  it('fails if mission is not ready-to-deliver', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const profile = createProfile('Pilot')

    const result = deliverMission(accepted, mission.template.id, profile, inventory)
    expect(result.ok).toBe(false)
  })
})

describe('tickMissionBoard', () => {
  it('decrements restock timer', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const remaining = accepted.restockTimer!.remaining

    const ticked = tickMissionBoard(accepted, 10)
    expect(ticked.restockTimer!.remaining).toBeCloseTo(remaining - 10)
  })

  it('clears timer when it expires', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const remaining = accepted.restockTimer!.remaining

    const ticked = tickMissionBoard(accepted, remaining + 1)
    expect(ticked.restockTimer).toBeNull()
  })

  it('does nothing when no timer is active', () => {
    const board = createMissionBoard()
    const ticked = tickMissionBoard(board, 10)
    expect(ticked).toBe(board)
  })
})

describe('getActiveMissionsForPlanet', () => {
  it('returns missions targeting the given planet', () => {
    let board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!

    const matches = getActiveMissionsForPlanet(accepted, mission.template.targetPlanet)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.template.id).toBe(mission.template.id)
  })

  it('returns empty array for unrelated planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const matches = getActiveMissionsForPlanet(accepted, 'pluto')
    expect(matches).toHaveLength(0)
  })
})

describe('getDeliverableMissions', () => {
  it('returns ready-to-deliver missions for the giver planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const completed = completeMission(accepted, mission.template.id, inventory)

    const deliverable = getDeliverableMissions(completed.board, 'earth')
    expect(deliverable).toHaveLength(1)
  })

  it('excludes active (not completed) missions', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const deliverable = getDeliverableMissions(accepted, 'earth')
    expect(deliverable).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/shuttleMissionSession.spec.ts`
Expected: FAIL — `shuttleMissionSession` module does not exist yet.

- [ ] **Step 3: Implement shuttleMissionSession.ts**

Create `src/lib/missions/shuttleMissionSession.ts`:

```ts
/**
 * Shuttle mission session management.
 *
 * Creates and manages the mission board state: offering missions
 * from planet pools, accepting, completing minigames, and delivering
 * for credit rewards. Pure functions — no side effects.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-shuttle-missions-design.md
 */
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  ShuttleMissionTemplate,
} from './types'
import type { RestockTimer } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { getMissionPool } from './shuttleMissionPools'
import { getGatherItemForPlanet } from './planetOrbitalConfig'
import { addItem, removeItem, canFitItem } from '@/lib/inventory/inventory'
import { addCredits } from '@/lib/player/profile'

/** Minimum restock timer duration in seconds. */
const RESTOCK_MIN_S = 120

/** Maximum restock timer duration in seconds. */
const RESTOCK_MAX_S = 240

/**
 * Generate a random restock duration between min and max.
 *
 * @returns Duration in seconds.
 */
function randomRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Create a new empty mission board.
 *
 * @returns An empty ShuttleMissionBoard.
 */
export function createMissionBoard(): ShuttleMissionBoard {
  return {
    offeredMission: null,
    offeringPlanet: null,
    restockTimer: null,
    activeMissions: [],
  }
}

/**
 * Offer a mission from a planet's pool. Picks 1 random mission from
 * the planet's pool of 3. Does nothing if a restock timer is running
 * or the planet has no mission pool.
 *
 * @param board - Current mission board state.
 * @param planetId - Planet the player is docked at.
 * @returns Updated board with an offered mission (or unchanged).
 */
export function offerMission(board: ShuttleMissionBoard, planetId: string): ShuttleMissionBoard {
  if (board.restockTimer) return board

  const pool = getMissionPool(planetId)
  if (!pool || pool.missions.length === 0) return board

  const index = Math.floor(Math.random() * pool.missions.length)
  const mission = pool.missions[index]!

  return {
    ...board,
    offeredMission: mission,
    offeringPlanet: planetId,
  }
}

/**
 * Accept the currently offered mission. Moves it to the active list
 * and starts a restock timer.
 *
 * @param board - Current mission board state.
 * @returns Updated board with mission accepted and timer started.
 */
export function acceptMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredMission || !board.offeringPlanet) return board

  const newActive: ActiveShuttleMission = {
    template: board.offeredMission,
    giverPlanet: board.offeringPlanet,
    status: 'active',
  }

  const total = randomRestockDuration()

  return {
    ...board,
    offeredMission: null,
    restockTimer: { remaining: total, total },
    activeMissions: [...board.activeMissions, newActive],
  }
}

/** Result of completing or delivering a mission. */
export interface MissionResult {
  /** Whether the operation succeeded. */
  ok: boolean
  /** Updated mission board. */
  board: ShuttleMissionBoard
  /** Updated inventory. */
  inventory: Inventory
  /** Updated player profile (only for deliver). */
  profile: PlayerProfile
  /** Explanation when ok is false. */
  reason?: string
}

/**
 * Complete a mission's minigame at the target planet. Adds gathered
 * items to inventory and updates mission status to ready-to-deliver.
 *
 * @param board - Current mission board.
 * @param missionId - ID of the active mission to complete.
 * @param inventory - Player inventory.
 * @returns Result with updated board and inventory.
 */
export function completeMission(
  board: ShuttleMissionBoard,
  missionId: string,
  inventory: Inventory,
): Omit<MissionResult, 'profile'> {
  const idx = board.activeMissions.findIndex((m) => m.template.id === missionId)
  if (idx === -1) {
    return { ok: false, board, inventory, reason: 'Mission not found' }
  }

  const mission = board.activeMissions[idx]!
  if (mission.status !== 'active') {
    return { ok: false, board, inventory, reason: 'Mission already completed' }
  }

  const gatherItem = getGatherItemForPlanet(mission.template.targetPlanet)
  if (!gatherItem) {
    return { ok: false, board, inventory, reason: 'No gather item configured for target planet' }
  }

  if (!canFitItem(inventory, gatherItem, mission.template.gatherQuantity)) {
    return { ok: false, board, inventory, reason: 'Cargo hold cannot fit gathered items' }
  }

  const addResult = addItem(inventory, gatherItem, mission.template.gatherQuantity)
  if (!addResult.ok) {
    return { ok: false, board, inventory, reason: addResult.reason }
  }

  const updatedMissions = [...board.activeMissions]
  updatedMissions[idx] = { ...mission, status: 'ready-to-deliver' }

  return {
    ok: true,
    board: { ...board, activeMissions: updatedMissions },
    inventory: addResult.inventory,
  }
}

/**
 * Deliver a completed mission at the giver planet. Removes gathered
 * items from inventory, awards credits, and removes the mission.
 *
 * @param board - Current mission board.
 * @param missionId - ID of the mission to deliver.
 * @param profile - Player profile.
 * @param inventory - Player inventory.
 * @returns Result with updated board, profile, and inventory.
 */
export function deliverMission(
  board: ShuttleMissionBoard,
  missionId: string,
  profile: PlayerProfile,
  inventory: Inventory,
): MissionResult {
  const idx = board.activeMissions.findIndex((m) => m.template.id === missionId)
  if (idx === -1) {
    return { ok: false, board, profile, inventory, reason: 'Mission not found' }
  }

  const mission = board.activeMissions[idx]!
  if (mission.status !== 'ready-to-deliver') {
    return { ok: false, board, profile, inventory, reason: 'Mission not ready for delivery' }
  }

  const gatherItem = getGatherItemForPlanet(mission.template.targetPlanet)
  if (!gatherItem) {
    return { ok: false, board, profile, inventory, reason: 'No gather item configured' }
  }

  const removeResult = removeItem(inventory, gatherItem, mission.template.gatherQuantity)
  if (!removeResult.ok) {
    return { ok: false, board, profile, inventory, reason: removeResult.reason }
  }

  const updatedProfile = addCredits(profile, mission.template.reward)
  const updatedMissions = board.activeMissions.filter((_, i) => i !== idx)

  return {
    ok: true,
    board: { ...board, activeMissions: updatedMissions },
    profile: updatedProfile,
    inventory: removeResult.inventory,
  }
}

/**
 * Tick the mission board restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board (same reference if nothing changed).
 */
export function tickMissionBoard(board: ShuttleMissionBoard, dt: number): ShuttleMissionBoard {
  if (!board.restockTimer) return board

  const remaining = board.restockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, restockTimer: null }
  }

  return {
    ...board,
    restockTimer: { ...board.restockTimer, remaining },
  }
}

/**
 * Get active missions targeting a specific planet.
 * Used to decide if the mission button shows in OrbitPrompt.
 *
 * @param board - Current board state.
 * @param planetId - Target planet to filter by.
 * @returns Active missions where targetPlanet matches.
 */
export function getActiveMissionsForPlanet(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveShuttleMission[] {
  return board.activeMissions.filter(
    (m) => m.template.targetPlanet === planetId && m.status === 'active',
  )
}

/**
 * Get missions ready for delivery at a specific planet.
 *
 * @param board - Current board state.
 * @param planetId - Giver planet to filter by.
 * @returns Missions with status ready-to-deliver at this giver planet.
 */
export function getDeliverableMissions(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveShuttleMission[] {
  return board.activeMissions.filter(
    (m) => m.giverPlanet === planetId && m.status === 'ready-to-deliver',
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/missions/__tests__/shuttleMissionSession.spec.ts`
Expected: All tests pass.

- [ ] **Step 5: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/shuttleMissionSession.ts src/lib/missions/__tests__/shuttleMissionSession.spec.ts
git commit -m "feat(missions): implement shuttle mission session with tests"
```

---

### Task 8: Add `missionAction` Key Binding

**Files:**
- Modify: `src/lib/defaultBindings.ts:10-22`

- [ ] **Step 1: Add the `missionAction` binding**

In `src/lib/defaultBindings.ts`, add `missionAction: ['KeyI']` to `DEFAULT_BINDINGS`:

```ts
export const DEFAULT_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  yawLeft: ['KeyA'],
  yawRight: ['KeyD'],
  toggleDoors: ['KeyF'],
  toggleCamera: ['KeyC'],
  orbitAction: ['KeyE'],
  toggleMap: ['KeyM'],
  focusHabitat: ['KeyH'],
  shopAction: ['KeyB'],
  missionAction: ['KeyI'],
  closeMap: ['Escape'],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat(missions): add I key binding for mission action"
```

---

### Task 9: Add OrbitPrompt Mission Button

**Files:**
- Modify: `src/components/OrbitPrompt.vue`

- [ ] **Step 1: Add mission props and emit**

In `src/components/OrbitPrompt.vue`, update the props and emits:

```ts
const props = defineProps<{
  orbitState: OrbitHudState
  shopAvailable?: boolean
  shopPlanet?: string
  missionAvailable?: boolean
}>()

const emit = defineEmits<{
  openShop: []
  openMission: []
}>()
```

- [ ] **Step 2: Add mission button to template**

After the shop button in the template, add:

```html
    <button
      v-if="missionAvailable && orbitState.state === 'orbiting'"
      type="button"
      class="orbit-prompt-mission-btn"
      @click="emit('openMission')"
    >
      I  Mission
    </button>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/OrbitPrompt.vue
git commit -m "feat(missions): add I Mission button to OrbitPrompt"
```

---

### Task 10: Create MissionMiniGameOverlay.vue

**Files:**
- Create: `src/components/MissionMiniGameOverlay.vue`

- [ ] **Step 1: Create the placeholder overlay component**

Create `src/components/MissionMiniGameOverlay.vue`:

```vue
<script setup lang="ts">
import type { ActiveShuttleMission } from '@/lib/missions/types'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { computed } from 'vue'

const props = defineProps<{
  mission: ActiveShuttleMission
  canFitCargo: boolean
}>()

const emit = defineEmits<{
  complete: []
  close: []
}>()

const orbitalConfig = computed(() => getPlanetOrbitalConfig(props.mission.template.targetPlanet))
const gatherItemDef = computed(() => {
  const itemId = orbitalConfig.value?.gatherItem
  return itemId ? getItemDefinition(itemId) : undefined
})
</script>

<template>
  <div class="mission-minigame-overlay">
    <div class="mission-minigame-card">
      <div class="mission-minigame-card__chrome">
        <span>Orbital Mission</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body">
        <h2 class="mission-minigame-card__title">{{ mission.template.name }}</h2>
        <p class="mission-minigame-card__desc">{{ mission.template.description }}</p>
        <div class="mission-minigame-card__details">
          <span v-if="gatherItemDef">
            Collect: {{ mission.template.gatherQuantity }}x {{ gatherItemDef.label }}
            ({{ gatherItemDef.weightPerUnit * mission.template.gatherQuantity }} kg)
          </span>
        </div>
        <div v-if="!canFitCargo" class="mission-minigame-card__warning">
          Cargo hold full — make room before starting
        </div>
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          :disabled="!canFitCargo"
          @click="emit('complete')"
        >
          Complete Mission
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MissionMiniGameOverlay.vue
git commit -m "feat(missions): add placeholder MissionMiniGameOverlay component"
```

---

### Task 11: Implement ShuttleControlProgramMissions.vue

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

- [ ] **Step 1: Implement the mission board UI**

Replace the contents of `src/components/shuttle-control/ShuttleControlProgramMissions.vue`:

```vue
<script setup lang="ts">
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getPlanet } from '@/lib/planets/catalog'

const props = defineProps<{
  board: ShuttleMissionBoard | null
  dockedPlanet: string | null
}>()

const emit = defineEmits<{
  acceptMission: []
  deliverMission: [missionId: string]
}>()

function targetPlanetName(planetId: string): string {
  try {
    return getPlanet(planetId).name
  } catch {
    return planetId
  }
}

function gatherItemLabel(mission: ActiveShuttleMission): string {
  const cfg = getPlanetOrbitalConfig(mission.template.targetPlanet)
  if (!cfg) return '???'
  const item = getItemDefinition(cfg.gatherItem)
  return item ? item.label : cfg.gatherItem
}

function statusLabel(mission: ActiveShuttleMission): string {
  if (mission.status === 'active') {
    return `Travel to ${targetPlanetName(mission.template.targetPlanet)}`
  }
  return `Return to ${targetPlanetName(mission.giverPlanet)}`
}

function canDeliver(mission: ActiveShuttleMission): boolean {
  return (
    mission.status === 'ready-to-deliver' &&
    props.dockedPlanet === mission.giverPlanet
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Missions</h2>

    <!-- Available Mission -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Available Mission</h3>

      <div v-if="!dockedPlanet" class="mission-board-empty">
        Not docked at a planet
      </div>

      <div v-else-if="board?.offeredMission && board.offeringPlanet === dockedPlanet" class="mission-board-offer">
        <div class="mission-board-offer__name">{{ board.offeredMission.name }}</div>
        <div class="mission-board-offer__desc">{{ board.offeredMission.description }}</div>
        <div class="mission-board-offer__meta">
          <span>Target: {{ targetPlanetName(board.offeredMission.targetPlanet) }}</span>
          <span>Reward: {{ board.offeredMission.reward }} CR</span>
        </div>
        <button
          type="button"
          class="mission-board-offer__accept-btn"
          @click="emit('acceptMission')"
        >
          Accept
        </button>
      </div>

      <div v-else-if="board?.restockTimer" class="mission-board-empty">
        Restocking in {{ formatTime(board.restockTimer.remaining) }}
      </div>

      <div v-else class="mission-board-empty">
        No missions available
      </div>
    </div>

    <!-- Active Missions -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Active Missions</h3>

      <div v-if="!board || board.activeMissions.length === 0" class="mission-board-empty">
        No active missions
      </div>

      <div
        v-for="mission in board?.activeMissions"
        :key="mission.template.id"
        class="mission-board-active"
      >
        <div class="mission-board-active__name">{{ mission.template.name }}</div>
        <div class="mission-board-active__route">
          {{ targetPlanetName(mission.giverPlanet) }} &rarr; {{ targetPlanetName(mission.template.targetPlanet) }}
        </div>
        <div class="mission-board-active__status">
          {{ statusLabel(mission) }}
        </div>
        <div class="mission-board-active__cargo">
          {{ mission.template.gatherQuantity }}x {{ gatherItemLabel(mission) }}
          &middot; {{ mission.template.reward }} CR
        </div>
        <button
          v-if="canDeliver(mission)"
          type="button"
          class="mission-board-active__deliver-btn"
          @click="emit('deliverMission', mission.template.id)"
        >
          Deliver
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shuttle-control/ShuttleControlProgramMissions.vue
git commit -m "feat(missions): implement mission board UI in shuttle control"
```

---

### Task 12: Wire Mission Data Through ShuttleControlOverlay

**Files:**
- Modify: `src/components/ShuttleControlOverlay.vue`

- [ ] **Step 1: Add mission props and emits**

In `src/components/ShuttleControlOverlay.vue`, update the imports, props, and emits:

Add the import:

```ts
import type { ShuttleMissionBoard } from '@/lib/missions/types'
```

Update the props:

```ts
defineProps<{
  visible: boolean
  inventoryStacks?: InventoryStack[]
  missionBoard?: ShuttleMissionBoard | null
  dockedPlanet?: string | null
}>()
```

Update the emits:

```ts
const emit = defineEmits<{
  close: []
  openShop: []
  acceptMission: []
  deliverMission: [missionId: string]
}>()
```

- [ ] **Step 2: Pass props to the program component**

Update the `<component>` tag to pass mission data:

```html
<component
  :is="activeProgram"
  :inventory-stacks="inventoryStacks"
  :board="missionBoard"
  :docked-planet="dockedPlanet"
  @accept-mission="$emit('acceptMission')"
  @deliver-mission="(id: string) => $emit('deliverMission', id)"
/>
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ShuttleControlOverlay.vue
git commit -m "feat(missions): wire mission data through ShuttleControlOverlay"
```

---

### Task 13: Integrate Missions into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

This is the largest integration task. Follow the existing `shopSession`/`onShopButton` patterns exactly.

- [ ] **Step 1: Add imports**

Add these imports near the existing shop imports at the top of `MapViewController.ts`:

```ts
import {
  createMissionBoard,
  offerMission,
  acceptMission,
  completeMission,
  deliverMission,
  tickMissionBoard,
  getActiveMissionsForPlanet,
} from '@/lib/missions/shuttleMissionSession'
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import { canFitItem } from '@/lib/inventory/inventory'
import { getGatherItemForPlanet } from '@/lib/missions/planetOrbitalConfig'
import '@/lib/missions/missionMaterials'
```

- [ ] **Step 2: Add state fields**

Add these private fields to the `MapViewController` class, near the existing `shopSession` fields:

```ts
  private missionBoard: ShuttleMissionBoard = createMissionBoard()
  private missionOverlayOpen = false
  private missionButtonVisible = false
```

- [ ] **Step 3: Add callback declarations**

Add these callback declarations near the existing `onShopButton` etc. callbacks:

```ts
  /** Called when mission button visibility changes in OrbitPrompt. */
  onMissionButton: ((visible: boolean, planetName: string) => void) | null = null

  /** Called when the mission minigame overlay should open/close. */
  onMissionOverlay: ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void) | null = null

  /** Called when the mission board state changes (for shuttle control terminal). */
  onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null = null
```

- [ ] **Step 4: Add mission update method**

Add a private method (near `updateShopSession`) for updating mission state each frame:

```ts
  /** Update mission button visibility based on orbit state. */
  private updateMissionState(): void {
    const orbitState = this.orbitSystem?.state ?? 'free'
    const targetName = this.orbitSystem?.target?.name ?? null

    if (orbitState === 'orbiting' && targetName) {
      const planet = PLANETS.find((p) => p.name === targetName)
      if (planet) {
        const activeMissions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
        const hasActiveMission = activeMissions.length > 0
        if (hasActiveMission !== this.missionButtonVisible) {
          this.missionButtonVisible = hasActiveMission
          this.onMissionButton?.(hasActiveMission, targetName)
        }
      }
    } else if (this.missionButtonVisible) {
      this.missionButtonVisible = false
      this.onMissionButton?.(false, '')
      if (this.missionOverlayOpen) {
        this.missionOverlayOpen = false
        this.onMissionOverlay?.(false, null, false)
      }
    }
  }
```

- [ ] **Step 5: Add mission action key handling**

In the `tick()` method, near the existing `shopAction` key handler (around line 1055), add:

```ts
    // Mission action (I key) — open mission overlay while orbiting
    if (
      this.inputManager?.wasActionPressed('missionAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.missionButtonVisible
    ) {
      if (this.missionOverlayOpen) {
        this.missionOverlayOpen = false
        this.onMissionOverlay?.(false, null, false)
      } else {
        const targetName = this.orbitSystem?.target?.name ?? null
        const planet = targetName ? PLANETS.find((p) => p.name === targetName) : null
        if (planet) {
          const missions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
          if (missions.length > 0) {
            const mission = missions[0]!
            const gatherItem = getGatherItemForPlanet(planet.id)
            const canFit = gatherItem
              ? canFitItem(this.playerInventory, gatherItem, mission.template.gatherQuantity)
              : false
            this.missionOverlayOpen = true
            this.onMissionOverlay?.(true, mission, canFit)
          }
        }
      }
    }
```

- [ ] **Step 6: Add tick calls**

In the `tick()` method, after `this.updateShopSession()`, add:

```ts
    this.updateMissionState()
    this.missionBoard = tickMissionBoard(this.missionBoard, dt)
```

- [ ] **Step 7: Add public methods for Vue event handlers**

Add these public methods to `MapViewController` (near the existing shop methods):

```ts
  /** Offer a mission when docking at a planet. Called by habitat/orbit state. */
  offerMissionAtPlanet(planetId: string): void {
    if (!this.missionBoard.offeredMission) {
      this.missionBoard = offerMission(this.missionBoard, planetId)
      this.onMissionBoardUpdate?.(this.missionBoard)
    }
  }

  /** Accept the offered mission (from shuttle control UI). */
  missionAccept(): void {
    this.missionBoard = acceptMission(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }

  /** Complete the mission minigame (from overlay UI). */
  missionComplete(missionId: string): void {
    const result = completeMission(this.missionBoard, missionId, this.playerInventory)
    if (result.ok) {
      this.missionBoard = result.board
      this.playerInventory = result.inventory
      this.missionOverlayOpen = false
      this.onMissionOverlay?.(false, null, false)
      this.onMissionBoardUpdate?.(this.missionBoard)
      this.onShopState?.(this.shopSession ?? null, this.playerProfile, this.playerInventory)
    }
  }

  /** Deliver a completed mission (from shuttle control UI). */
  missionDeliver(missionId: string): void {
    const result = deliverMission(this.missionBoard, missionId, this.playerProfile, this.playerInventory)
    if (result.ok) {
      this.missionBoard = result.board
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onMissionBoardUpdate?.(this.missionBoard)
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.onShopState?.(this.shopSession ?? null, this.playerProfile, this.playerInventory)
    }
  }
```

- [ ] **Step 8: Add openMissionOverlay public method**

Add this public method (called by Vue OrbitPrompt button click):

```ts
  /** Open the mission overlay (called by Vue OrbitPrompt click). */
  openMissionOverlay(): void {
    if (!this.missionButtonVisible || this.missionOverlayOpen) return
    const targetName = this.orbitSystem?.target?.name ?? null
    const planet = targetName ? PLANETS.find((p) => p.name === targetName) : null
    if (!planet) return
    const missions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
    if (missions.length === 0) return
    const mission = missions[0]!
    const gatherItem = getGatherItemForPlanet(planet.id)
    const canFit = gatherItem
      ? canFitItem(this.playerInventory, gatherItem, mission.template.gatherQuantity)
      : false
    this.missionOverlayOpen = true
    this.onMissionOverlay?.(true, mission, canFit)
  }
```

- [ ] **Step 9: Trigger offerMission when entering orbit**

In the `updateShopSession()` method, after `this.shopSession = createShopSession(planet.id)` (around line 1575), add:

```ts
        this.offerMissionAtPlanet(planet.id)
```

- [ ] **Step 10: Run type-check**

Run: `bun run type-check`
Expected: No new errors.

- [ ] **Step 11: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(missions): integrate mission state into MapViewController"
```

---

### Task 14: Wire Everything in MapView.vue

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add imports and reactive state**

Add the import:

```ts
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import MissionMiniGameOverlay from '@/components/MissionMiniGameOverlay.vue'
```

Add reactive state (near the existing shop reactive state):

```ts
const missionButtonVisible = ref(false)
const missionOverlayVisible = ref(false)
const missionOverlayMission = ref<ActiveShuttleMission | null>(null)
const missionOverlayCanFit = ref(false)
const missionBoard = ref<ShuttleMissionBoard | null>(null)
```

- [ ] **Step 2: Wire up callbacks**

In the `onMounted` callback, after the existing shop callbacks, add:

```ts
    viewController.onMissionButton = (visible, _planetName) => {
      missionButtonVisible.value = visible
    }
    viewController.onMissionOverlay = (visible, mission, canFit) => {
      missionOverlayVisible.value = visible
      missionOverlayMission.value = mission
      missionOverlayCanFit.value = canFit
    }
    viewController.onMissionBoardUpdate = (board) => {
      missionBoard.value = board
    }
```

- [ ] **Step 3: Add event handler functions**

Add handler functions (near the existing shop handlers):

```ts
function handleMissionComplete() {
  if (missionOverlayMission.value) {
    viewController.missionComplete(missionOverlayMission.value.template.id)
  }
}

function closeMissionOverlay() {
  missionOverlayVisible.value = false
}

function handleAcceptMission() {
  viewController.missionAccept()
}

function handleDeliverMission(missionId: string) {
  viewController.missionDeliver(missionId)
}
```

- [ ] **Step 4: Update OrbitPrompt in template**

Update the `<OrbitPrompt>` tag to include mission props:

```html
  <OrbitPrompt
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :orbitState="orbitState"
    :shop-available="shopButtonVisible && !shopDialogVisible && !shuttleControlVisible"
    :mission-available="missionButtonVisible && !missionOverlayVisible && !shuttleControlVisible"
    @open-shop="openShop"
    @open-mission="handleMissionComplete"
  />
```

Add a handler function:

```ts
function openMissionOverlay() {
  viewController.openMissionOverlay()
}
```

Update the OrbitPrompt:

```html
  <OrbitPrompt
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :orbitState="orbitState"
    :shop-available="shopButtonVisible && !shopDialogVisible && !shuttleControlVisible"
    :mission-available="missionButtonVisible && !missionOverlayVisible && !shuttleControlVisible"
    @open-shop="openShop"
    @open-mission="openMissionOverlay"
  />
```

- [ ] **Step 5: Add MissionMiniGameOverlay to template**

After the `<PlanetShopDialog>` block, add:

```html
  <MissionMiniGameOverlay
    v-if="missionOverlayVisible && missionOverlayMission"
    :mission="missionOverlayMission"
    :can-fit-cargo="missionOverlayCanFit"
    @complete="handleMissionComplete"
    @close="closeMissionOverlay"
  />
```

- [ ] **Step 6: Update ShuttleControlOverlay to pass mission data**

Update the `<ShuttleControlOverlay>` tag:

```html
  <ShuttleControlOverlay
    :visible="shuttleControlVisible"
    :inventory-stacks="shopInventory.stacks"
    :mission-board="missionBoard"
    :docked-planet="orbitState.state === 'orbiting' ? orbitState.nearestBodyName : null"
    @close="closeShuttleControl"
    @open-shop="openShopFromTerminal"
    @accept-mission="handleAcceptMission"
    @deliver-mission="handleDeliverMission"
  />
```

Note: `dockedPlanet` needs to be the planet **id**, not the display name. The `orbitState.nearestBodyName` is the display name (e.g., "Earth"). We need to convert. Add a computed or helper:

```ts
import { PLANETS } from '@/lib/planets/catalog'
```

(This import may already exist in MapViewController but needs to be added to MapView.vue if not present.)

```ts
function dockedPlanetId(): string | null {
  if (orbitState.state !== 'orbiting' || !orbitState.nearestBodyName) return null
  const planet = PLANETS.find((p) => p.name === orbitState.nearestBodyName)
  return planet?.id ?? null
}
```

Then use it in the template:

```html
  <ShuttleControlOverlay
    :visible="shuttleControlVisible"
    :inventory-stacks="shopInventory.stacks"
    :mission-board="missionBoard"
    :docked-planet="dockedPlanetId()"
    @close="closeShuttleControl"
    @open-shop="openShopFromTerminal"
    @accept-mission="handleAcceptMission"
    @deliver-mission="handleDeliverMission"
  />
```

- [ ] **Step 7: Run type-check**

Run: `bun run type-check`
Expected: No new errors.

- [ ] **Step 8: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(missions): wire mission UI into MapView"
```

---

### Task 15: Final Verification

- [ ] **Step 1: Run full type-check**

Run: `bun run type-check`
Expected: Clean pass, no errors.

- [ ] **Step 2: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No blocking errors. Fix any TSDoc warnings on new exports.

- [ ] **Step 4: Run dev server and smoke test**

Run: `bun dev`

Manual verification:
1. Open shuttle control terminal → Missions program shows "Available Mission" when orbiting a planet
2. Accept a mission → moves to active list, restock timer starts
3. Fly to target planet, orbit it → "I Mission" button appears
4. Press I → mission overlay opens with "Complete Mission" button
5. Click Complete → items appear in inventory
6. Fly back to giver planet, dock, open Missions → "Deliver" button visible
7. Click Deliver → items removed, credits awarded

- [ ] **Step 5: Commit any lint/TSDoc fixes**

```bash
git add -A
git commit -m "chore(missions): fix lint and TSDoc warnings"
```
