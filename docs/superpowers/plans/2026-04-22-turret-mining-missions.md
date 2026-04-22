# Turret Mining Missions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new mission type — Turret Mining Contracts — offered by Mars (Martian Marines Corps), Jupiter (Jovian Cloud City), and Uranus/Neptune/Pluto (United Space Consortium), completable by mining specific ores with the turret on `/map` and delivered by docking at the giver planet.

**Architecture:** Planetary-style pool per giver + multi-active. Progress tracked via the existing `onResourcePickup` callback that already fires from `TurretSessionController` on every whole-kg inventory commit. Delivery consumes ore from inventory on dock at the giver planet. No changes to the turret internals, no new inventory items, no new loot tables — all target ores (`olivine`, `magnetite`, `iron-nickel-alloy`, `water-ice`) and belts (main + kuiper) already ship.

**Tech Stack:** TypeScript (strict + `noUncheckedIndexedAccess`), Vue 3, Vitest, Bun. Data-driven JSON under `src/data/shuttle-missions/mining/`. Pure functions in `src/lib/missions/`. UI lives in `src/components/shuttle-control/ShuttleControlProgramMissions.vue`.

**Spec:** `docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md`

---

## File Map

### New files

- `src/lib/missions/turretMiningPools.ts` — static JSON loader per giver planet.
- `src/lib/missions/turretMiningSession.ts` — pure offer/accept/tick/record-progress helpers.
- `src/lib/missions/turretMiningRewards.ts` — dock-time delivery: consume ore, pay CR, contract notify.
- `src/lib/missions/__tests__/turretMiningPools.spec.ts`
- `src/lib/missions/__tests__/turretMiningSession.spec.ts`
- `src/lib/missions/__tests__/turretMiningRewards.spec.ts`
- `src/data/shuttle-missions/mining/mars.json`
- `src/data/shuttle-missions/mining/jupiter.json`
- `src/data/shuttle-missions/mining/uranus.json`
- `src/data/shuttle-missions/mining/neptune.json`
- `src/data/shuttle-missions/mining/pluto.json`

### Modified files

- `src/lib/missions/types.ts` — new types + board fields.
- `src/lib/missions/shuttleMissionSession.ts` — extend `createMissionBoard`.
- `src/lib/missions/missionStorage.ts` — persist new board fields + revive restock timer.
- `src/lib/contracts/contractTypes.ts` — `'mining'` added to `ContractMissionType`.
- `src/views/MapViewController.ts` — fire `recordMiningProgress` from the turret commit path.
- `src/views/MapView.vue` — call `deliverMiningMissionsAtDock` on dock-enter.
- `src/components/shuttle-control/ShuttleControlProgramMissions.vue` — new Mining tab markup + bindings.
- `src/lib/missions/__tests__/missionStorage.spec.ts` — round-trip new fields (extend if the file exists; otherwise the new session tests cover persistence).

---

## Task 1: Data Model & Contract Type

**Files:**
- Modify: `src/lib/missions/types.ts`
- Modify: `src/lib/contracts/contractTypes.ts`
- Modify: `src/lib/missions/shuttleMissionSession.ts:93-107` (the `createMissionBoard` function)

- [ ] **Step 1: Extend `ContractMissionType` union**

Edit `src/lib/contracts/contractTypes.ts` line ~21:

```ts
/** Mission family that can satisfy a `complete-missions` step. */
export type ContractMissionType = 'shuttle' | 'asteroid' | 'eva' | 'mining'
```

- [ ] **Step 2: Add new types to `src/lib/missions/types.ts`**

Append the following block after the existing `ShuttleMissionBoard` block (below the EVA mission section, before the asteroid section). Each exported member MUST carry a TSDoc comment — lint enforces this.

```ts
// ---------------------------------------------------------------------------
// Turret Mining Missions — contract-driven bulk ore collection on /map
// ---------------------------------------------------------------------------

/** Difficulty tier of a turret mining mission. Drives ore specificity and reward band. */
export type MiningMissionDifficulty = 'easy' | 'medium' | 'hard'

/**
 * What ore a mining mission wants. `'any'` counts every main-belt ore toward
 * progress (easy tier). Specific IDs restrict progress tracking to that exact
 * catalog item from `src/data/inventory/items.json`.
 */
export type MiningOreCategory =
  | 'any'
  | 'olivine'
  | 'magnetite'
  | 'iron-nickel-alloy'
  | 'water-ice'

/** A turret mining mission template from JSON — one entry in a giver planet's pool. */
export interface TurretMiningMissionTemplate {
  /** Unique key, e.g. "mars_marines_olivine_plating". */
  id: string
  /** Display name shown on the mission board. */
  name: string
  /** Flavor text / briefing from the giver. */
  description: string
  /** Difficulty tier — drives authoring of ore category and reward. */
  difficulty: MiningMissionDifficulty
  /** Which ore counts toward progress. */
  oreCategory: MiningOreCategory
  /** Kilograms required to mark the mission ready-to-deliver. */
  targetKg: number
  /** Credits awarded on delivery (before Science Station multiplier). */
  reward: number
}

/** A giver planet's mining mission pool loaded from JSON. */
export interface TurretMiningMissionPool {
  /** Planet id that offers these missions. */
  planetId: string
  /** Display name of the giver organization (e.g. "Martian Marines Corps"). */
  giverName: string
  /** Missions in this planet's mining pool. */
  missions: TurretMiningMissionTemplate[]
}

/** Status of an active mining mission. */
export type TurretMiningMissionStatus = 'active' | 'ready-to-deliver'

/** A mining mission the player has accepted. */
export interface ActiveTurretMiningMission {
  /** The original template. */
  template: TurretMiningMissionTemplate
  /** Planet where the mission was accepted (and where delivery must occur). */
  giverPlanet: string
  /** Kilograms mined toward this mission since acceptance. */
  minedKg: number
  /** Current mission status. */
  status: TurretMiningMissionStatus
}
```

- [ ] **Step 3: Extend `ShuttleMissionBoard` in the same file**

Find the `ShuttleMissionBoard` interface and add 4 fields to its body (after `activeEvaMissions`):

```ts
  /** Currently offered mining mission at the docked planet (null if restocking or not docked). */
  offeredMiningMission: TurretMiningMissionTemplate | null
  /** Which planet is offering the mining mission (null if not docked). */
  offeringMiningPlanet: string | null
  /** Restock timer for mining missions — counts down after one is taken. */
  miningRestockTimer: RestockTimer | null
  /** All active mining missions the player has accepted. */
  activeMiningMissions: ActiveTurretMiningMission[]
```

- [ ] **Step 4: Update `createMissionBoard` to initialize the new fields**

Edit `src/lib/missions/shuttleMissionSession.ts` inside the `createMissionBoard` function body (return object around line 94). Add after the existing `activeEvaMissions: []`:

```ts
    offeredMiningMission: null,
    offeringMiningPlanet: null,
    miningRestockTimer: null,
    activeMiningMissions: [],
```

- [ ] **Step 5: Verify type-check passes**

Run: `bun run type-check`
Expected: clean. If `ShuttleMissionBoard` usages elsewhere in the codebase implicitly require the new fields via exhaustive spread/destructure, fix those callers inline. The board is already destructured in `missionStorage.ts:145-158` — that loader is updated in Task 6, so a transient type error there is OK right now; it will be resolved. Any *other* callers touched should be a 1-line add.

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/types.ts src/lib/contracts/contractTypes.ts src/lib/missions/shuttleMissionSession.ts
git commit -m "feat(missions): add turret mining mission types and board fields"
```

---

## Task 2: Giver Pool JSON Files (authored data)

**Files:**
- Create: `src/data/shuttle-missions/mining/mars.json`
- Create: `src/data/shuttle-missions/mining/jupiter.json`
- Create: `src/data/shuttle-missions/mining/uranus.json`
- Create: `src/data/shuttle-missions/mining/neptune.json`
- Create: `src/data/shuttle-missions/mining/pluto.json`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/data/shuttle-missions/mining
```

- [ ] **Step 2: Write `mars.json`**

```json
{
  "planetId": "mars",
  "giverName": "Martian Marines Corps",
  "missions": [
    {
      "id": "mars_marines_bulk_supply",
      "name": "Forward Base Supply",
      "description": "Marines need bulk asteroid ore for temporary forward bases. Any rock will do — just fill the hold.",
      "difficulty": "easy",
      "oreCategory": "any",
      "targetKg": 350,
      "reward": 750
    },
    {
      "id": "mars_marines_olivine_plating",
      "name": "Armor Plating Contract",
      "description": "Raw olivine for a new armor lamination run. Marines want it clean — no cross-contamination from other ores.",
      "difficulty": "medium",
      "oreCategory": "olivine",
      "targetKg": 475,
      "reward": 1350
    },
    {
      "id": "mars_marines_iron_nickel",
      "name": "Classified Procurement",
      "description": "Marines need iron-nickel alloy for projects they won't explain. Small quantity, generous payout.",
      "difficulty": "hard",
      "oreCategory": "iron-nickel-alloy",
      "targetKg": 200,
      "reward": 2200
    }
  ]
}
```

- [ ] **Step 3: Write `jupiter.json`**

```json
{
  "planetId": "jupiter",
  "giverName": "Jovian Cloud City",
  "missions": [
    {
      "id": "jupiter_cloud_city_any_ore",
      "name": "Construction Supplies",
      "description": "Cloud City is always expanding. They'll take whatever ore you can bring.",
      "difficulty": "easy",
      "oreCategory": "any",
      "targetKg": 380,
      "reward": 820
    },
    {
      "id": "jupiter_cloud_city_magnetite",
      "name": "Shielded Platform Reinforcement",
      "description": "New residential sectors need magnetite for radiation-shielded support frames. Purity matters — Cloud City inspectors reject mixed loads.",
      "difficulty": "medium",
      "oreCategory": "magnetite",
      "targetKg": 500,
      "reward": 1500
    },
    {
      "id": "jupiter_cloud_city_iron_nickel",
      "name": "Executive Suites",
      "description": "Premium iron-nickel fittings for the new orbital penthouse tier. Discreet delivery, excellent pay.",
      "difficulty": "hard",
      "oreCategory": "iron-nickel-alloy",
      "targetKg": 225,
      "reward": 2500
    }
  ]
}
```

- [ ] **Step 4: Write `uranus.json`**

```json
{
  "planetId": "uranus",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_uranus_ice_research",
      "name": "Cryogenic Research Shipment",
      "description": "USC labs need primordial water-ice for deep-cold chemistry studies. Bring it fresh from the kuiper belt.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 425,
      "reward": 2600
    }
  ]
}
```

- [ ] **Step 5: Write `neptune.json`**

```json
{
  "planetId": "neptune",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_neptune_ice_reactor",
      "name": "Reactor Coolant Resupply",
      "description": "Neptune station's fusion reactor runs on water-ice moderators pulled from kuiper rocks. Quantity matters — run short, station goes dark.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 475,
      "reward": 2900
    }
  ]
}
```

- [ ] **Step 6: Write `pluto.json`**

```json
{
  "planetId": "pluto",
  "giverName": "United Space Consortium",
  "missions": [
    {
      "id": "usc_pluto_deep_ice_survey",
      "name": "Trans-Neptunian Ice Sampling",
      "description": "USC wants deep water-ice from the furthest reaches of the kuiper belt. Nobody goes out this far without the right gear. That's why the pay is what it is.",
      "difficulty": "hard",
      "oreCategory": "water-ice",
      "targetKg": 500,
      "reward": 3200
    }
  ]
}
```

- [ ] **Step 7: Commit**

```bash
git add src/data/shuttle-missions/mining/
git commit -m "feat(data): turret mining mission giver pools"
```

---

## Task 3: Pool Loader (TDD)

**Files:**
- Create: `src/lib/missions/turretMiningPools.ts`
- Create: `src/lib/missions/__tests__/turretMiningPools.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/missions/__tests__/turretMiningPools.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getTurretMiningPool, TURRET_MINING_POOLS } from '../turretMiningPools'

describe('turretMiningPools', () => {
  it('exposes pools for all five giver planets', () => {
    const planetIds = TURRET_MINING_POOLS.map((p) => p.planetId).sort()
    expect(planetIds).toEqual(['jupiter', 'mars', 'neptune', 'pluto', 'uranus'])
  })

  it('returns the Mars pool with three missions', () => {
    const pool = getTurretMiningPool('mars')
    expect(pool).toBeDefined()
    expect(pool?.giverName).toBe('Martian Marines Corps')
    expect(pool?.missions).toHaveLength(3)
    const difficulties = pool!.missions.map((m) => m.difficulty).sort()
    expect(difficulties).toEqual(['easy', 'hard', 'medium'])
  })

  it('returns undefined for planets without a mining pool', () => {
    expect(getTurretMiningPool('earth')).toBeUndefined()
    expect(getTurretMiningPool('saturn')).toBeUndefined()
  })

  it('USC planets use the same giver name', () => {
    const names = ['uranus', 'neptune', 'pluto'].map((id) => getTurretMiningPool(id)?.giverName)
    expect(names).toEqual([
      'United Space Consortium',
      'United Space Consortium',
      'United Space Consortium',
    ])
  })

  it('every mission uses an ore category from the MiningOreCategory union', () => {
    const valid = new Set(['any', 'olivine', 'magnetite', 'iron-nickel-alloy', 'water-ice'])
    for (const pool of TURRET_MINING_POOLS) {
      for (const mission of pool.missions) {
        expect(valid.has(mission.oreCategory)).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningPools.spec.ts`
Expected: FAIL with module-not-found on `../turretMiningPools`.

- [ ] **Step 3: Implement the loader**

Create `src/lib/missions/turretMiningPools.ts`:

```ts
/**
 * Turret mining mission pool loader.
 *
 * Imports per-planet turret mining JSON files at build time and exports a
 * typed catalog with lookup helpers. Mirrors {@link evaMissionPools} and
 * {@link shuttleMissionPools}.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type { TurretMiningMissionPool } from './types'
import { PLANET_IDS } from '@/lib/planets/catalog'

import marsData from '@/data/shuttle-missions/mining/mars.json'
import jupiterData from '@/data/shuttle-missions/mining/jupiter.json'
import uranusData from '@/data/shuttle-missions/mining/uranus.json'
import neptuneData from '@/data/shuttle-missions/mining/neptune.json'
import plutoData from '@/data/shuttle-missions/mining/pluto.json'

/** All turret mining pools, one per giver planet. */
export const TURRET_MINING_POOLS: TurretMiningMissionPool[] = [
  marsData,
  jupiterData,
  uranusData,
  neptuneData,
  plutoData,
] as unknown as TurretMiningMissionPool[]

// Validate planet references at module-load time so bad data fails fast.
for (const pool of TURRET_MINING_POOLS) {
  if (!PLANET_IDS.includes(pool.planetId)) {
    throw new Error(`Turret mining pool references unknown planet "${pool.planetId}"`)
  }
}

/** Pools keyed by planet id. */
const POOLS_BY_PLANET: Record<string, TurretMiningMissionPool> = Object.fromEntries(
  TURRET_MINING_POOLS.map((p) => [p.planetId, p]),
)

/**
 * Get the turret mining pool for a planet.
 *
 * @param planetId - Planet id to look up.
 * @returns The pool, or undefined if the planet offers no turret mining missions.
 */
export function getTurretMiningPool(planetId: string): TurretMiningMissionPool | undefined {
  return POOLS_BY_PLANET[planetId]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningPools.spec.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/turretMiningPools.ts src/lib/missions/__tests__/turretMiningPools.spec.ts
git commit -m "feat(missions): turret mining pool loader"
```

---

## Task 4: Session Helpers (offer / accept / tick / progress)

**Files:**
- Create: `src/lib/missions/turretMiningSession.ts`
- Create: `src/lib/missions/__tests__/turretMiningSession.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/missions/__tests__/turretMiningSession.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createMissionBoard } from '../shuttleMissionSession'
import {
  offerTurretMiningMission,
  takeTurretMiningMission,
  tickTurretMiningRestock,
  recordTurretMiningProgress,
  getReadyTurretMiningMissions,
  isMainBeltOre,
  MAIN_BELT_ORE_IDS,
} from '../turretMiningSession'
import { getTurretMiningPool } from '../turretMiningPools'

describe('turretMiningSession', () => {
  describe('MAIN_BELT_ORE_IDS', () => {
    it('contains the expected main-belt ores and excludes kuiper ices', () => {
      expect(MAIN_BELT_ORE_IDS).toContain('olivine')
      expect(MAIN_BELT_ORE_IDS).toContain('magnetite')
      expect(MAIN_BELT_ORE_IDS).toContain('pyroxene')
      expect(MAIN_BELT_ORE_IDS).toContain('iron-nickel-alloy')
      expect(MAIN_BELT_ORE_IDS).not.toContain('water-ice')
      expect(MAIN_BELT_ORE_IDS).not.toContain('carbon-dioxide-ice')
    })

    it('isMainBeltOre returns true only for main-belt entries', () => {
      expect(isMainBeltOre('olivine')).toBe(true)
      expect(isMainBeltOre('magnetite')).toBe(true)
      expect(isMainBeltOre('iron-nickel-alloy')).toBe(true)
      expect(isMainBeltOre('water-ice')).toBe(false)
      expect(isMainBeltOre('fuel-cell')).toBe(false)
    })
  })

  describe('offerTurretMiningMission', () => {
    it('offers a mission for a giver planet', () => {
      const board = createMissionBoard()
      const next = offerTurretMiningMission(board, 'mars')
      expect(next.offeredMiningMission).not.toBeNull()
      expect(next.offeringMiningPlanet).toBe('mars')
    })

    it('is a no-op while restock timer is running', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 60, total: 120 } }
      const next = offerTurretMiningMission(board, 'mars')
      expect(next.offeredMiningMission).toBeNull()
      expect(next.offeringMiningPlanet).toBeNull()
    })

    it('is a no-op for planets without a mining pool', () => {
      const board = createMissionBoard()
      const next = offerTurretMiningMission(board, 'earth')
      expect(next.offeredMiningMission).toBeNull()
    })

    it('does not re-offer the same template that is currently active', () => {
      const pool = getTurretMiningPool('pluto')!
      const only = pool.missions[0]!
      const board = {
        ...createMissionBoard(),
        activeMiningMissions: [{ template: only, giverPlanet: 'pluto', minedKg: 0, status: 'active' as const }],
      }
      // Pluto's pool only contains `only`, so the offer should be a no-op.
      const next = offerTurretMiningMission(board, 'pluto')
      expect(next.offeredMiningMission).toBeNull()
    })
  })

  describe('takeTurretMiningMission', () => {
    it('moves offered to active and starts restock timer', () => {
      let board = offerTurretMiningMission(createMissionBoard(), 'mars')
      const template = board.offeredMiningMission!
      board = takeTurretMiningMission(board)
      expect(board.offeredMiningMission).toBeNull()
      expect(board.offeringMiningPlanet).toBeNull()
      expect(board.miningRestockTimer).not.toBeNull()
      expect(board.activeMiningMissions).toHaveLength(1)
      expect(board.activeMiningMissions[0]!.template).toBe(template)
      expect(board.activeMiningMissions[0]!.giverPlanet).toBe('mars')
      expect(board.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(board.activeMiningMissions[0]!.status).toBe('active')
    })

    it('is a no-op when nothing is offered', () => {
      const board = createMissionBoard()
      const next = takeTurretMiningMission(board)
      expect(next).toBe(board)
    })
  })

  describe('tickTurretMiningRestock', () => {
    it('decrements remaining', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 60, total: 120 } }
      const next = tickTurretMiningRestock(board, 10)
      expect(next.miningRestockTimer?.remaining).toBe(50)
    })

    it('clears the timer when it expires', () => {
      const board = { ...createMissionBoard(), miningRestockTimer: { remaining: 5, total: 120 } }
      const next = tickTurretMiningRestock(board, 10)
      expect(next.miningRestockTimer).toBeNull()
    })

    it('is a no-op when no timer is running', () => {
      const board = createMissionBoard()
      const next = tickTurretMiningRestock(board, 10)
      expect(next).toBe(board)
    })
  })

  describe('recordTurretMiningProgress', () => {
    function boardWithActives() {
      const marsPool = getTurretMiningPool('mars')!
      const olivineMission = marsPool.missions.find((m) => m.oreCategory === 'olivine')!
      const anyMission = marsPool.missions.find((m) => m.oreCategory === 'any')!
      return {
        ...createMissionBoard(),
        activeMiningMissions: [
          { template: olivineMission, giverPlanet: 'mars', minedKg: 0, status: 'active' as const },
          { template: anyMission, giverPlanet: 'mars', minedKg: 0, status: 'active' as const },
        ],
      }
    }

    it('increments matching active missions on specific-ore progress', () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'olivine', 30)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(30)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(30)
    })

    it("increments any-tier mission on any main-belt ore; specific-tier ignores mismatch", () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'magnetite', 15)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(15)
    })

    it('does NOT credit any-tier for kuiper ices', () => {
      const board = boardWithActives()
      const next = recordTurretMiningProgress(board, 'water-ice', 50)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(0)
      expect(next.activeMiningMissions[1]!.minedKg).toBe(0)
    })

    it('transitions to ready-to-deliver when target reached', () => {
      const board = boardWithActives()
      const olivineTarget = board.activeMiningMissions[0]!.template.targetKg
      const next = recordTurretMiningProgress(board, 'olivine', olivineTarget)
      expect(next.activeMiningMissions[0]!.status).toBe('ready-to-deliver')
    })

    it('leaves already-ready missions untouched', () => {
      const board = boardWithActives()
      board.activeMiningMissions[0]!.status = 'ready-to-deliver'
      board.activeMiningMissions[0]!.minedKg = 9999
      const next = recordTurretMiningProgress(board, 'olivine', 30)
      expect(next.activeMiningMissions[0]!.minedKg).toBe(9999)
      expect(next.activeMiningMissions[0]!.status).toBe('ready-to-deliver')
    })
  })

  describe('getReadyTurretMiningMissions', () => {
    it('returns ready missions for a specific giver', () => {
      const marsMission = getTurretMiningPool('mars')!.missions[0]!
      const jupiterMission = getTurretMiningPool('jupiter')!.missions[0]!
      const board = {
        ...createMissionBoard(),
        activeMiningMissions: [
          { template: marsMission, giverPlanet: 'mars', minedKg: 400, status: 'ready-to-deliver' as const },
          { template: jupiterMission, giverPlanet: 'jupiter', minedKg: 100, status: 'active' as const },
        ],
      }
      const ready = getReadyTurretMiningMissions(board, 'mars')
      expect(ready).toHaveLength(1)
      expect(ready[0]!.template.id).toBe(marsMission.id)
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningSession.spec.ts`
Expected: FAIL with module-not-found on `../turretMiningSession`.

- [ ] **Step 3: Implement `turretMiningSession.ts`**

Create `src/lib/missions/turretMiningSession.ts`:

```ts
/**
 * Turret mining mission session — pure offer / accept / tick / progress helpers.
 *
 * Parallels `shuttleMissionSession.ts` (planetary + EVA flows) for the mining
 * mission kind. Boards are immutable inputs; every function returns a new
 * board. Progress recording is driven by the existing `onResourcePickup`
 * callback from `TurretSessionController` — this module never touches the
 * turret directly.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type {
  ActiveTurretMiningMission,
  MiningOreCategory,
  ShuttleMissionBoard,
  TurretMiningMissionTemplate,
} from './types'
import { getTurretMiningPool } from './turretMiningPools'

/** Main-belt ore ids that count toward an `'any'` mining mission. */
export const MAIN_BELT_ORE_IDS: readonly string[] = [
  'olivine',
  'magnetite',
  'pyroxene',
  'iron-nickel-alloy',
]

/** Restock timer range in seconds — matches planetary + EVA cadence. */
const RESTOCK_MIN_S = 120
/** Restock timer range in seconds — matches planetary + EVA cadence. */
const RESTOCK_MAX_S = 240

/**
 * Whether an ore id is a main-belt ore (olivine, magnetite, pyroxene, iron-nickel-alloy).
 *
 * Used by {@link recordTurretMiningProgress} to gate `'any'`-tier contracts so they only
 * credit main-belt pickups — kuiper ices are hard-specific and must be targeted explicitly.
 *
 * @param itemId - Inventory catalog id.
 * @returns True if `itemId` is part of the main-belt ore set.
 */
export function isMainBeltOre(itemId: string): boolean {
  return MAIN_BELT_ORE_IDS.includes(itemId)
}

/**
 * Return whether a mining mission's `oreCategory` matches a given extracted ore.
 *
 * @param category - Mission's declared ore category.
 * @param itemId - Extracted inventory item id.
 * @returns True when the ore should count toward the mission's progress.
 */
export function matchesMiningOreCategory(category: MiningOreCategory, itemId: string): boolean {
  if (category === 'any') return isMainBeltOre(itemId)
  return category === itemId
}

/**
 * Random restock duration in seconds — matches shuttleMissionSession behavior.
 *
 * @returns Duration in seconds between {@link RESTOCK_MIN_S} and {@link RESTOCK_MAX_S}.
 */
function randomMiningRestockDuration(): number {
  return RESTOCK_MIN_S + Math.random() * (RESTOCK_MAX_S - RESTOCK_MIN_S)
}

/**
 * Offer a mining mission from a giver planet's pool. No-op when a restock
 * timer is already running, the planet has no pool, or every mission in the
 * pool is already active.
 *
 * @param board - Current mission board state.
 * @param planetId - Planet the player is docked at.
 * @returns Updated board with an offered mining mission (or unchanged).
 */
export function offerTurretMiningMission(
  board: ShuttleMissionBoard,
  planetId: string,
): ShuttleMissionBoard {
  if (board.miningRestockTimer) return board
  const pool = getTurretMiningPool(planetId)
  if (!pool || pool.missions.length === 0) return board

  const activeIds = new Set(board.activeMiningMissions.map((m) => m.template.id))
  const candidates = pool.missions.filter((m) => !activeIds.has(m.id))
  if (candidates.length === 0) return board

  const idx = Math.floor(Math.random() * candidates.length)
  const chosen = candidates[idx]!

  return {
    ...board,
    offeredMiningMission: chosen,
    offeringMiningPlanet: planetId,
  }
}

/**
 * Accept the currently offered mining mission. Moves it to the active list
 * and starts a restock timer. No-op if nothing is offered.
 *
 * @param board - Current mission board state.
 * @returns Updated board with the mission accepted and timer started.
 */
export function takeTurretMiningMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredMiningMission || !board.offeringMiningPlanet) return board

  const newActive: ActiveTurretMiningMission = {
    template: board.offeredMiningMission,
    giverPlanet: board.offeringMiningPlanet,
    minedKg: 0,
    status: 'active',
  }

  const total = randomMiningRestockDuration()
  return {
    ...board,
    offeredMiningMission: null,
    offeringMiningPlanet: null,
    miningRestockTimer: { remaining: total, total },
    activeMiningMissions: [...board.activeMiningMissions, newActive],
  }
}

/**
 * Tick the mining mission restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board (same reference if nothing changed).
 */
export function tickTurretMiningRestock(
  board: ShuttleMissionBoard,
  dt: number,
): ShuttleMissionBoard {
  if (!board.miningRestockTimer) return board
  const remaining = board.miningRestockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, miningRestockTimer: null }
  }
  return {
    ...board,
    miningRestockTimer: { ...board.miningRestockTimer, remaining },
  }
}

/**
 * Record mining progress against every matching active mining mission.
 * Called on each whole-kg turret commit via the `onResourcePickup` hook in
 * `MapViewController`.
 *
 * @param board - Current mission board state.
 * @param itemId - Extracted inventory item id.
 * @param kg - Kilograms committed this tick (whole units).
 * @returns Updated board; missions that crossed `targetKg` flip to `ready-to-deliver`.
 */
export function recordTurretMiningProgress(
  board: ShuttleMissionBoard,
  itemId: string,
  kg: number,
): ShuttleMissionBoard {
  if (board.activeMiningMissions.length === 0) return board
  let changed = false
  const nextActives = board.activeMiningMissions.map((active) => {
    if (active.status === 'ready-to-deliver') return active
    if (!matchesMiningOreCategory(active.template.oreCategory, itemId)) return active
    const minedKg = active.minedKg + kg
    const status: ActiveTurretMiningMission['status'] =
      minedKg >= active.template.targetKg ? 'ready-to-deliver' : 'active'
    changed = true
    return { ...active, minedKg, status }
  })
  if (!changed) return board
  return { ...board, activeMiningMissions: nextActives }
}

/**
 * Get all active mining missions ready for delivery at a specific giver planet.
 *
 * @param board - Current board state.
 * @param planetId - Giver planet to filter by.
 * @returns Missions with `status === 'ready-to-deliver'` where `giverPlanet` matches.
 */
export function getReadyTurretMiningMissions(
  board: ShuttleMissionBoard,
  planetId: string,
): ActiveTurretMiningMission[] {
  return board.activeMiningMissions.filter(
    (m) => m.giverPlanet === planetId && m.status === 'ready-to-deliver',
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningSession.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/turretMiningSession.ts src/lib/missions/__tests__/turretMiningSession.spec.ts
git commit -m "feat(missions): turret mining offer/take/tick/progress helpers"
```

---

## Task 5: Delivery & Rewards (TDD)

**Files:**
- Create: `src/lib/missions/turretMiningRewards.ts`
- Create: `src/lib/missions/__tests__/turretMiningRewards.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/missions/__tests__/turretMiningRewards.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { addItem, createInventory } from '../../inventory/inventory'
import { createMissionBoard } from '../shuttleMissionSession'
import { deliverTurretMiningMissions } from '../turretMiningRewards'
import type { PlayerProfile } from '@/lib/player/types'
import type { ActiveTurretMiningMission, TurretMiningMissionTemplate } from '../types'

function profile(credits = 0): PlayerProfile {
  return {
    credits,
    upgradeLevels: {},
    stats: { missionsCompleted: 0, asteroidsVisited: [] },
  } as unknown as PlayerProfile
}

function template(overrides: Partial<TurretMiningMissionTemplate> = {}): TurretMiningMissionTemplate {
  return {
    id: overrides.id ?? 'test_mission',
    name: overrides.name ?? 'Test Mission',
    description: overrides.description ?? 'Test',
    difficulty: overrides.difficulty ?? 'medium',
    oreCategory: overrides.oreCategory ?? 'olivine',
    targetKg: overrides.targetKg ?? 200,
    reward: overrides.reward ?? 1000,
  }
}

function activeMission(overrides: Partial<ActiveTurretMiningMission> = {}): ActiveTurretMiningMission {
  return {
    template: overrides.template ?? template(),
    giverPlanet: overrides.giverPlanet ?? 'mars',
    minedKg: overrides.minedKg ?? 200,
    status: overrides.status ?? 'ready-to-deliver',
  }
}

describe('deliverTurretMiningMissions', () => {
  it('is a no-op when no missions are ready at this planet', () => {
    const board = { ...createMissionBoard(), activeMiningMissions: [activeMission({ status: 'active' })] }
    const inv = createInventory()
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
  })

  it('delivers a specific-ore mission: removes ore, awards credits, removes from board', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'olivine', targetKg: 150, reward: 1200 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const withOre = addItem(createInventory(), 'olivine', 200).inventory
    const result = deliverTurretMiningMissions(board, 'mars', withOre, profile(100), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.profile.credits).toBe(100 + 1200)
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')?.quantity).toBe(50)
    expect(result.board.activeMiningMissions).toHaveLength(0)
  })

  it('applies reward multiplier (Science Station)', () => {
    const mission = activeMission({ template: template({ reward: 1000 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1.5)
    expect(result.profile.credits).toBe(1500)
  })

  it('delivers an `any`-tier mission by draining main-belt stacks in order', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100, reward: 800 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    let inv = createInventory()
    inv = addItem(inv, 'olivine', 40).inventory
    inv = addItem(inv, 'magnetite', 80).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.profile.credits).toBe(800)
    // 100 kg total removed: all 40 olivine + 60 magnetite (order = MAIN_BELT_ORE_IDS).
    expect(result.inventory.stacks.find((s) => s.itemId === 'olivine')).toBeUndefined()
    expect(result.inventory.stacks.find((s) => s.itemId === 'magnetite')?.quantity).toBe(20)
  })

  it('refuses delivery when inventory cannot cover targetKg (specific-ore shortfall)', () => {
    const mission = activeMission({ template: template({ targetKg: 100 }) })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 50).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
    expect(result.inventory).toBe(inv) // inventory not mutated
    expect(result.board.activeMiningMissions).toHaveLength(1)
  })

  it('refuses any-tier delivery when main-belt stacks fall short', () => {
    const mission = activeMission({
      template: template({ oreCategory: 'any', targetKg: 100 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [mission] }
    const inv = addItem(createInventory(), 'olivine', 80).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(0)
    expect(result.profile.credits).toBe(0)
  })

  it('delivers multiple ready missions at the same planet in one call', () => {
    const m1 = activeMission({
      template: template({ id: 'a', oreCategory: 'olivine', targetKg: 50, reward: 500 }),
    })
    const m2 = activeMission({
      template: template({ id: 'b', oreCategory: 'magnetite', targetKg: 40, reward: 400 }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [m1, m2] }
    let inv = createInventory()
    inv = addItem(inv, 'olivine', 100).inventory
    inv = addItem(inv, 'magnetite', 100).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(2)
    expect(result.profile.credits).toBe(900)
    expect(result.board.activeMiningMissions).toHaveLength(0)
  })

  it('skips missions for other planets', () => {
    const marsMission = activeMission({ giverPlanet: 'mars' })
    const jupiterMission = activeMission({
      giverPlanet: 'jupiter',
      template: template({ id: 'j1' }),
    })
    const board = { ...createMissionBoard(), activeMiningMissions: [marsMission, jupiterMission] }
    const inv = addItem(createInventory(), 'olivine', 500).inventory
    const result = deliverTurretMiningMissions(board, 'mars', inv, profile(0), 1)
    expect(result.delivered).toHaveLength(1)
    expect(result.board.activeMiningMissions).toHaveLength(1)
    expect(result.board.activeMiningMissions[0]!.giverPlanet).toBe('jupiter')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningRewards.spec.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement `turretMiningRewards.ts`**

Create `src/lib/missions/turretMiningRewards.ts`:

```ts
/**
 * Dock-time delivery for turret mining missions.
 *
 * Consumes the required ore from inventory, credits the player, removes the
 * mission from the active list, and fires a `contractSystem` completion
 * event. For `'any'`-tier missions, main-belt ore stacks are drained in the
 * order declared by {@link MAIN_BELT_ORE_IDS}.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md
 */
import type { Inventory } from '@/lib/inventory/types'
import { getStack, removeItem } from '@/lib/inventory/inventory'
import type { PlayerProfile } from '@/lib/player/types'
import { addCredits } from '@/lib/player/profile'
import type {
  ActiveTurretMiningMission,
  MiningOreCategory,
  ShuttleMissionBoard,
} from './types'
import { MAIN_BELT_ORE_IDS } from './turretMiningSession'
import { contractSystem } from '@/lib/contracts/runtime'

/** Outcome of delivering mining missions at a giver planet dock. */
export interface TurretMiningDeliveryResult {
  /** Board with successfully-delivered missions removed from `activeMiningMissions`. */
  board: ShuttleMissionBoard
  /** Inventory with ore consumed. Same reference as input when nothing delivered. */
  inventory: Inventory
  /** Profile with credits added. Same reference as input when nothing delivered. */
  profile: PlayerProfile
  /** Missions successfully delivered this call. */
  delivered: ActiveTurretMiningMission[]
}

/**
 * Try to remove `targetKg` across main-belt stacks in catalog order.
 *
 * Pure: returns `ok: false` + original inventory when the available total
 * is below `targetKg`; otherwise returns the reduced inventory with whole-kg
 * removals chained through `removeItem`.
 *
 * @param inventory - Starting inventory.
 * @param targetKg - Total kilograms required.
 * @returns Either a successful drain or a failure with the untouched inventory.
 */
function drainAnyMainBelt(
  inventory: Inventory,
  targetKg: number,
): { ok: true; inventory: Inventory } | { ok: false; inventory: Inventory } {
  let available = 0
  for (const itemId of MAIN_BELT_ORE_IDS) {
    const stack = getStack(inventory, itemId)
    if (stack) available += stack.quantity
  }
  if (available < targetKg) return { ok: false, inventory }

  let remaining = targetKg
  let working = inventory
  for (const itemId of MAIN_BELT_ORE_IDS) {
    if (remaining <= 0) break
    const stack = getStack(working, itemId)
    if (!stack) continue
    const take = Math.min(stack.quantity, remaining)
    const result = removeItem(working, itemId, take)
    if (!result.ok) return { ok: false, inventory }
    working = result.inventory
    remaining -= take
  }
  return { ok: true, inventory: working }
}

/**
 * Attempt to remove the ore required by a mission.
 *
 * @param inventory - Starting inventory.
 * @param category - Mission's ore category.
 * @param targetKg - Quantity required.
 * @returns Either a successful drain or a failure with the untouched inventory.
 */
function drainForCategory(
  inventory: Inventory,
  category: MiningOreCategory,
  targetKg: number,
): { ok: true; inventory: Inventory } | { ok: false; inventory: Inventory } {
  if (category === 'any') return drainAnyMainBelt(inventory, targetKg)
  const stack = getStack(inventory, category)
  if (!stack || stack.quantity < targetKg) return { ok: false, inventory }
  const result = removeItem(inventory, category, targetKg)
  if (!result.ok) return { ok: false, inventory }
  return { ok: true, inventory: result.inventory }
}

/**
 * Deliver every mining mission that is ready-to-deliver at the given giver planet.
 *
 * Each eligible mission consumes its required ore from inventory in a single
 * pass; a shortfall on any mission leaves that mission in place with the
 * inventory unmodified for it (other missions may still deliver). Credits
 * are awarded per successful delivery with `rewardMultiplier` (Science
 * Station) applied and rounded.
 *
 * @param board - Current mission board.
 * @param planetId - Giver planet the player just docked at.
 * @param inventory - Player inventory.
 * @param profile - Player profile; credits on success.
 * @param rewardMultiplier - Science Station bonus (1.0 at level 0).
 * @returns Updated board / inventory / profile + list of delivered missions.
 */
export function deliverTurretMiningMissions(
  board: ShuttleMissionBoard,
  planetId: string,
  inventory: Inventory,
  profile: PlayerProfile,
  rewardMultiplier: number,
): TurretMiningDeliveryResult {
  const delivered: ActiveTurretMiningMission[] = []
  let workingInventory = inventory
  let workingProfile = profile

  const nextActives: ActiveTurretMiningMission[] = []
  for (const mission of board.activeMiningMissions) {
    const eligible =
      mission.giverPlanet === planetId && mission.status === 'ready-to-deliver'
    if (!eligible) {
      nextActives.push(mission)
      continue
    }
    const drain = drainForCategory(
      workingInventory,
      mission.template.oreCategory,
      mission.template.targetKg,
    )
    if (!drain.ok) {
      nextActives.push(mission) // keep mission; player can try again after mining more.
      continue
    }
    workingInventory = drain.inventory
    const creditsEarned = Math.round(mission.template.reward * rewardMultiplier)
    workingProfile = addCredits(workingProfile, creditsEarned)
    delivered.push(mission)
    contractSystem.notifyMissionCompleted({
      kind: 'mining',
      giverPlanetId: mission.giverPlanet,
      giverId: null,
      targetPlanetId: null,
    })
  }

  if (delivered.length === 0) {
    return { board, inventory, profile, delivered }
  }

  return {
    board: { ...board, activeMiningMissions: nextActives },
    inventory: workingInventory,
    profile: workingProfile,
    delivered,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/missions/__tests__/turretMiningRewards.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/turretMiningRewards.ts src/lib/missions/__tests__/turretMiningRewards.spec.ts
git commit -m "feat(missions): turret mining delivery consumes ore and awards CR"
```

---

## Task 6: Mission Board Persistence

**Files:**
- Modify: `src/lib/missions/missionStorage.ts`

- [ ] **Step 1: Update `loadMissionBoard` to hydrate the new fields**

Open `src/lib/missions/missionStorage.ts`. Find the `return {...}` block inside `loadMissionBoard` (lines 145-158). Add four new lines (match existing style):

```ts
    return {
      ...board,
      restockTimer: reviveRestockTimer(board.restockTimer, elapsedSeconds),
      asteroidRestockTimer: reviveRestockTimer(board.asteroidRestockTimer, elapsedSeconds),
      evaRestockTimer: reviveRestockTimer(board.evaRestockTimer, elapsedSeconds),
      miningRestockTimer: reviveRestockTimer(board.miningRestockTimer, elapsedSeconds),
      activeMissions: Array.isArray(board.activeMissions) ? board.activeMissions : [],
      activeEvaMissions: Array.isArray(board.activeEvaMissions) ? board.activeEvaMissions : [],
      activeMiningMissions: Array.isArray(board.activeMiningMissions) ? board.activeMiningMissions : [],
      offeredMission: board.offeredMission ?? null,
      offeringPlanet: board.offeringPlanet ?? null,
      offeredAsteroidMission: board.offeredAsteroidMission ?? null,
      activeAsteroidMission: board.activeAsteroidMission ?? null,
      offeredEvaMission: board.offeredEvaMission ?? null,
      offeringEvaPlanet: board.offeringEvaPlanet ?? null,
      offeredMiningMission: board.offeredMiningMission ?? null,
      offeringMiningPlanet: board.offeringMiningPlanet ?? null,
    }
```

- [ ] **Step 2: Verify type-check passes**

Run: `bun run type-check`
Expected: clean. (Task 1 opened a type error here; this closes it.)

- [ ] **Step 3: Verify existing mission-storage tests still pass**

Run: `bun test:unit src/lib/missions/`
Expected: previous tests still green; new turret mining specs still green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/missions/missionStorage.ts
git commit -m "feat(missions): persist turret mining board fields across saves"
```

---

## Task 7: Wire Progress Into Turret Commit Path

**Files:**
- Modify: `src/views/MapViewController.ts` near line 3791 (the `commitInventoryUnit` block)

- [ ] **Step 1: Locate the turret wiring**

Run: `grep -n "commitInventoryUnit" src/views/MapViewController.ts`
Expected: around line 3791, a block like:

```ts
        commitInventoryUnit: (itemId) => {
          const result = addItem(this.playerInventory, itemId, 1)
          if (!result.ok) return { ok: false as const, reason: result.reason ?? 'Inventory full' }
          this.playerInventory = result.inventory
          ...
        },
```

Read the surrounding context (±20 lines) to see how `this.playerInventory` is persisted and whether the controller already reads/writes the mission board. Mission board access uses `loadMissionBoard()` / `saveMissionBoard()` from `@/lib/missions/missionStorage` — if that import is not present in this file, add it.

- [ ] **Step 2: Add imports (top of file)**

Ensure these are imported:

```ts
import { loadMissionBoard, saveMissionBoard } from '@/lib/missions/missionStorage'
import { recordTurretMiningProgress } from '@/lib/missions/turretMiningSession'
```

- [ ] **Step 3: Fire `recordTurretMiningProgress` inside `commitInventoryUnit`**

Inside the `commitInventoryUnit` callback, after `this.playerInventory = result.inventory`, add:

```ts
          const board = loadMissionBoard()
          if (board) {
            const nextBoard = recordTurretMiningProgress(board, itemId, 1)
            if (nextBoard !== board) saveMissionBoard(nextBoard)
          }
```

**Why 1?** `commitInventoryUnit` is invoked once per whole-kg commit from `TurretYieldCoordinator.acceptYield` (see `TURRET_YIELD_COMMIT_GRANULARITY_KG`, which is 1 kg). One commit = one `kg` unit credited to mission progress.

- [ ] **Step 4: Run type-check and lint**

Run in parallel:
```bash
bun run type-check
bun run lint
```
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(map): track turret mining progress on every ore commit"
```

---

## Task 8: Dock-Time Delivery Trigger

**Files:**
- Modify: `src/views/MapView.vue` near existing planetary delivery (grep for `contractSystem.notifyMissionCompleted` → the `kind: 'shuttle'` call, around line 715)

- [ ] **Step 1: Locate the dock handler**

Run: `grep -n "kind: 'shuttle'" src/views/MapView.vue`
Expected: around line 715, inside the handler that runs when the planetary `deliverMission` succeeds.

Read ±30 lines around it. Identify the function that fires when the player enters the docked state at a planet (it invokes `deliverMission` for planetary missions). That same function is where mining delivery must also fire — once per dock-enter.

- [ ] **Step 2: Add imports**

At the top of the `<script setup>` block in `MapView.vue`:

```ts
import { deliverTurretMiningMissions } from '@/lib/missions/turretMiningRewards'
```

Ensure `loadMissionBoard`, `saveMissionBoard`, `loadInventory`, `saveInventory`, `loadProfile`, `saveProfile`, and the science-station multiplier helpers are already imported (they are for the planetary delivery path — reuse).

- [ ] **Step 3: Call `deliverTurretMiningMissions` on dock-enter**

In the dock-enter handler, after the planetary delivery block and before any UI refresh / `syncPersistentProgressFromController()` call, add a dedicated mining delivery block. Use whatever variable the surrounding code already uses to reference the current docked planet id.

```ts
  // Deliver any ready turret-mining contracts at this planet.
  {
    const miningBoard = loadMissionBoard()
    const inventory = loadInventory()
    const profile = loadProfile()
    if (miningBoard && inventory && profile && dockedPlanetId) {
      const scienceMult = getUpgradeValue('shuttleScienceStation', profile.upgradeLevels ?? {})
      const result = deliverTurretMiningMissions(
        miningBoard,
        dockedPlanetId,
        inventory,
        profile,
        scienceMult,
      )
      if (result.delivered.length > 0) {
        saveMissionBoard(result.board)
        saveInventory(result.inventory)
        saveProfile(result.profile)
        syncPersistentProgressFromController()
      }
    }
  }
```

**Note:** `dockedPlanetId` is a placeholder — use whatever variable is in scope at that call site. If the surrounding code uses a different name (e.g. `mission.giverPlanet` or `planetId`), substitute the actual name. Grep `src/views/MapView.vue` for `dockedPlanet` to find the right symbol.

- [ ] **Step 4: Also offer a new mining mission on dock**

In the same dock handler (or wherever planetary missions get offered at dock — grep `offerMission(`), add a mining-offer call:

```ts
import { offerTurretMiningMission } from '@/lib/missions/turretMiningSession'
```

Inside the dock handler:

```ts
  {
    const boardAfterMining = loadMissionBoard()
    if (boardAfterMining && dockedPlanetId) {
      const offered = offerTurretMiningMission(boardAfterMining, dockedPlanetId)
      if (offered !== boardAfterMining) saveMissionBoard(offered)
    }
  }
```

- [ ] **Step 5: Tick the mining restock timer in the map loop**

Grep for `tickEvaMissionBoard(` or `tickMissionBoard(` inside `src/views/MapView.vue`. Those are called every frame with `dt`. Add a parallel call for mining, in the same block:

```ts
import { tickTurretMiningRestock } from '@/lib/missions/turretMiningSession'
```

```ts
        const withMiningTick = tickTurretMiningRestock(boardAfterEvaTick, dt)
        if (withMiningTick !== boardAfterEvaTick) saveMissionBoard(withMiningTick)
```

Variable names must match whatever the existing code uses — grep for the exact surrounding pattern and mirror it.

- [ ] **Step 6: Verify type-check and lint**

Run in parallel:
```bash
bun run type-check
bun run lint
```
Expected: clean. If a lint `jsdoc/require-jsdoc` complaint fires on any inline helpers added here, hoist them to module scope with proper TSDoc headers.

- [ ] **Step 7: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(map): offer, tick, and deliver turret mining missions on dock"
```

---

## Task 9: Mining Tab UI

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

- [ ] **Step 1: Read the component**

```bash
bun run dev  # keep it running in another pane for hot-reload visual QA
```

Read `src/components/shuttle-control/ShuttleControlProgramMissions.vue` end-to-end. It has three tabs today: planetary, asteroid, EVA. The pattern is:

1. Tab button in the header.
2. Conditional rendering of the tab body based on an active-tab state.
3. For each tab: offered-block + active-missions list + restock timer readout.

- [ ] **Step 2: Add mining-related props and imports**

In `<script setup>`:

```ts
import type {
  ActiveTurretMiningMission,
  TurretMiningMissionTemplate,
  MiningOreCategory,
} from '@/lib/missions/types'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getCurrentUpgradeValue } from '@/lib/upgrades'

const miningUnlockLevel = computed(() => getCurrentUpgradeValue('turretMiningUnlock'))
const miningTabVisible = computed(() => miningUnlockLevel.value >= 1)
```

**Note:** `getCurrentUpgradeValue` may already be imported or may be named differently in this codebase. Grep `getCurrentUpgradeValue` across `src/lib/upgrades.ts` to confirm the exact exported helper. The existing component already reads upgrade levels — reuse whatever pattern is in place.

- [ ] **Step 3: Expose new emits for accepting a mining mission**

```ts
const emit = defineEmits<{
  acceptMission: []
  deliverMission: [missionId: string]
  acceptAsteroidMission: []
  acceptEvaMission: []
  acceptMiningMission: []
}>()
```

- [ ] **Step 4: Add a tab button**

In the template, wherever the other tab buttons live (likely wrapped in a `<nav>` or `<div class="tabs">`), add:

```vue
<button
  v-if="miningTabVisible"
  type="button"
  :class="['tab-button', { active: activeTab === 'mining' }]"
  @click="activeTab = 'mining'"
>
  Mining
</button>
```

Match the existing `tab-button` utility class or CSS module style — no inline styles, per CLAUDE.md rule #4.

- [ ] **Step 5: Render the mining tab body**

Add a new block, parallel to the EVA tab body:

```vue
<section v-if="activeTab === 'mining' && miningTabVisible" class="mission-tab">
  <div v-if="board?.offeredMiningMission && board.offeringMiningPlanet === dockedPlanet" class="offered-mission">
    <h3>{{ board.offeredMiningMission.name }}</h3>
    <p class="briefing">{{ board.offeredMiningMission.description }}</p>
    <dl class="mission-stats">
      <div><dt>Ore:</dt><dd>{{ oreLabelFor(board.offeredMiningMission.oreCategory) }}</dd></div>
      <div><dt>Quantity:</dt><dd>{{ board.offeredMiningMission.targetKg }} kg</dd></div>
      <div><dt>Payout:</dt><dd>{{ formatCr(board.offeredMiningMission.reward) }} CR</dd></div>
    </dl>
    <button type="button" class="primary-action" @click="emit('acceptMiningMission')">Accept</button>
  </div>
  <p v-else-if="board?.miningRestockTimer" class="restock-timer">
    New mining contract in {{ formatTime(board.miningRestockTimer.remaining) }}
  </p>
  <p v-else class="restock-timer">No mining contracts available here.</p>

  <h4 v-if="activeMiningMissions.length > 0">Active Mining Contracts</h4>
  <ul class="active-missions">
    <li v-for="mission in activeMiningMissions" :key="mission.template.id">
      <div class="mission-title">{{ mission.template.name }}</div>
      <div class="mission-progress">
        {{ mission.minedKg }} / {{ mission.template.targetKg }} kg
        of {{ oreLabelFor(mission.template.oreCategory) }}
      </div>
      <div class="mission-status">
        <span v-if="mission.status === 'ready-to-deliver' && dockedPlanet === mission.giverPlanet">
          Ready — delivery on dock
        </span>
        <span v-else-if="mission.status === 'ready-to-deliver'">
          Return to {{ targetPlanetName(mission.giverPlanet) }} to deliver
        </span>
        <span v-else>
          Posted by {{ targetPlanetName(mission.giverPlanet) }}
        </span>
      </div>
    </li>
  </ul>
</section>
```

- [ ] **Step 6: Add the supporting helpers**

```ts
const activeMiningMissions = computed<ActiveTurretMiningMission[]>(() => props.board?.activeMiningMissions ?? [])

function oreLabelFor(category: MiningOreCategory): string {
  if (category === 'any') return 'Any main-belt ore'
  const def = getItemDefinition(category)
  return def ? def.label : category
}

function formatCr(n: number): string {
  return new Intl.NumberFormat('en-US').format(n)
}
```

(`formatTime` and `targetPlanetName` already exist in the component.)

- [ ] **Step 7: Wire the emit in the host**

Find where the component is instantiated (grep `ShuttleControlProgramMissions` across the repo) and add a handler for `@accept-mining-mission` (Vue auto-kebab-cases emit names). The handler:

```ts
function onAcceptMiningMission(): void {
  const board = loadMissionBoard()
  if (!board) return
  const next = takeTurretMiningMission(board)
  if (next !== board) saveMissionBoard(next)
}
```

Import `takeTurretMiningMission` from `@/lib/missions/turretMiningSession` and `loadMissionBoard`/`saveMissionBoard` from `@/lib/missions/missionStorage`.

- [ ] **Step 8: Verify type-check and lint**

```bash
bun run type-check
bun run lint
```
Expected: clean. Any `jsdoc/require-jsdoc` warnings on the new helpers in the `.vue` `<script setup>` block are exempt by config (tests + components are excluded per CLAUDE.md), but double-check if oxlint complains.

- [ ] **Step 9: Commit**

```bash
git add src/components/shuttle-control/ShuttleControlProgramMissions.vue
# and the host view file where the emit was wired (likely MapView.vue or a ShuttleControl host component)
git commit -m "feat(ui): mining tab in shuttle control — offer, progress, delivery hint"
```

---

## Task 10: Final Checks + Smoke Test

**Files:** all

- [ ] **Step 1: Run the full merge gate in parallel**

```bash
bun run type-check && bun run lint && bun run test:unit
```
Expected: all three clean. Fix anything that falls out. TSDoc `@author guinetik` / `@date 2026-04-22` / `@spec docs/superpowers/specs/2026-04-22-turret-mining-missions-design.md` must appear on every new exported symbol in `src/lib/`.

- [ ] **Step 2: Smoke test — Mars easy mission**

Start the dev server: `bun dev`. In the browser:

1. Open devtools console. Run `localStorage.setItem('asteroid-lander-profile-v1', JSON.stringify({ credits: 99999, upgradeLevels: { turretMiningUnlock: 1 }, stats: { missionsCompleted: 0, asteroidsVisited: [] } }))` (or use an existing save with the upgrade purchased).
2. Reload. Fly to Mars. Dock.
3. Open Shuttle Control → confirm the **Mining** tab is visible. Pick the "Forward Base Supply" (easy, any, 350 kg, 750 CR).
4. Press **Accept**. Close Shuttle Control. Undock.
5. Press **T** to enter the turret. Mine belt rocks until the HUD progress reads ≥ 350 kg of any main-belt ore.
6. Exit turret. Fly back to Mars. Dock.
7. Verify: profile credits increased by 750 (× Science Station multiplier if purchased). Inventory shows 350 fewer main-belt ore kg. Mission no longer in active list. Mars' mining tab can offer a new mission once the restock timer elapses.

- [ ] **Step 3: Smoke test — Jupiter medium + multi-active**

1. Dock Jupiter. Accept `jupiter_cloud_city_magnetite` (500 kg magnetite).
2. Dock Mars. Accept `mars_marines_olivine_plating` (475 kg olivine).
3. Fly to belt. Mine **magnetite** — watch the Jupiter progress tick up, Mars stay at 0.
4. Mine **olivine** — watch Mars tick up, Jupiter frozen.
5. Deliver each at its giver. Confirm CR award matches the table × Science Station multiplier.

- [ ] **Step 4: Smoke test — USC kuiper-ice**

1. Purchase `shuttleFreezeResistance` level 3. Fly to Pluto.
2. Dock. Accept the Pluto mining mission (water-ice, 500 kg, 3200 CR).
3. Fly to kuiper belt. Mine until 500 kg water-ice collected.
4. Return to Pluto. Confirm delivery & credits.

- [ ] **Step 5: Commit any smoke-test-driven fixes**

```bash
git add -A
git commit -m "fix(missions): post-smoke adjustments to turret mining flow"
```

(Skip if nothing needed.)

---

## Acceptance Criteria Recap

1. `bun run type-check` — clean.
2. `bun run lint` — oxlint 0 errors, ESLint 0 errors & 0 warnings (per CLAUDE.md).
3. `bun run test:unit` — all specs green; new files introduce ~30+ tests.
4. All three smoke tests above pass in-browser.
5. Every new exported symbol in `src/lib/missions/` carries the required TSDoc header.
