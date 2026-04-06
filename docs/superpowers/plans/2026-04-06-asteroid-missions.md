# Asteroid Missions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement asteroid mission generation from giver manifests, map waypoint markers, approach HUD, localStorage persistence, and mission board integration — up to the `/level` route transition.

**Architecture:** Data-driven giver manifests (JSON) with mission templates per character/org. A generator rolls concrete objectives from difficulty (derived from upgrade levels). Waypoints spawn in asteroid/kuiper belt at world positions, rendered as Three.js sprites. localStorage bridges map → level route.

**Tech Stack:** Vue 3, TypeScript, Three.js, Vitest, Vite static JSON imports

---

### Task 1: Add Asteroid Mission Types

**Files:**
- Modify: `src/lib/missions/types.ts`

- [ ] **Step 1: Add giver and generated mission types**

Append the following exports to `src/lib/missions/types.ts` after the existing `ShuttleMissionBoard` interface:

```ts
// ---------------------------------------------------------------------------
// Asteroid Missions — giver-driven, belt/kuiper waypoint missions
// ---------------------------------------------------------------------------

/** A mission giver — character or organization that offers asteroid missions. */
export interface MissionGiver {
  /** Unique giver id, e.g. "jay". */
  id: string
  /** Display name, e.g. "Jay Mercer". */
  name: string
  /** Title or role, e.g. "Senior Hauler". */
  title: string
  /** Which objective types this giver offers. */
  objectiveTypes: ObjectiveType[]
  /** Minimum difficulty (1-10) this giver operates at. */
  minDifficulty: number
  /** Maximum difficulty (1-10) this giver operates at. */
  maxDifficulty: number
  /** The mission templates this giver can offer. */
  missions: MissionGiverTemplate[]
}

/** A mission template within a giver's manifest. */
export interface MissionGiverTemplate {
  /** Unique template id, e.g. "jay_mineral_survey". */
  id: string
  /** Display name. */
  name: string
  /** Flavor text from the giver. */
  briefing: string
  /** Objective slots with scalable params. */
  objectiveSlots: ObjectiveSlot[]
  /** Credit bonus range for completing all objectives. */
  completionBonus: NumberRange
  /** Maps region to difficulty range. */
  regionByDifficulty: Partial<Record<MissionRegion, [number, number]>>
}

/** Concrete rolled objective values for a generated mission. */
export interface ConcreteObjective {
  /** Objective type. */
  type: ObjectiveType
  /** For gather: kg to collect. */
  resourceAmount?: number
  /** For exterminate: nest count. */
  nestCount?: number
  /** For exterminate: swarm size per nest. */
  swarmSize?: number
  /** For exterminate: whether spitters are present. */
  hasSpitters?: boolean
  /** For rescue: colonist count. */
  colonistCount?: number
  /** For rescue: seconds of oxygen. */
  oxygenTime?: number
  /** For rescue: whether site is guarded. */
  isGuarded?: boolean
  /** Credit reward for this objective. */
  reward: number
}

/** Status of an asteroid mission. */
export type AsteroidMissionStatus = 'available' | 'accepted' | 'in-transit'

/** A fully generated asteroid mission ready for play. */
export interface GeneratedAsteroidMission {
  /** Unique instance id (templateId + timestamp). */
  id: string
  /** Giver id. */
  giverId: string
  /** Giver display name. */
  giverName: string
  /** Template id. */
  templateId: string
  /** Mission display name. */
  name: string
  /** Flavor text from the giver. */
  briefing: string
  /** Rolled difficulty (1-10). */
  difficulty: number
  /** Belt region where waypoint spawns. */
  region: MissionRegion
  /** Concrete objectives with rolled values. */
  objectives: ConcreteObjective[]
  /** Total credits: sum of objective rewards + completion bonus. */
  totalReward: number
  /** Waypoint world position. */
  waypoint: { worldX: number; worldZ: number }
  /** Current status. */
  status: AsteroidMissionStatus
}
```

- [ ] **Step 2: Extend ShuttleMissionBoard with asteroid fields**

In the same file, add three fields to the `ShuttleMissionBoard` interface:

```ts
  /** Currently offered asteroid mission (null if restocking). */
  offeredAsteroidMission: GeneratedAsteroidMission | null
  /** The one active asteroid mission (null if none accepted). */
  activeAsteroidMission: GeneratedAsteroidMission | null
  /** Restock timer for asteroid missions. */
  asteroidRestockTimer: RestockTimer | null
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Errors in `shuttleMissionSession.ts` because `createMissionBoard()` doesn't return the new fields yet. That's fine — Task 5 will fix it.

- [ ] **Step 4: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat(missions): add asteroid mission and giver types"
```

---

### Task 2: Create Mission Giver Data Files

**Files:**
- Create: `src/data/missions/givers/jay-mercer.json`
- Create: `src/data/missions/givers/belt-mining-corp.json`
- Create: `src/data/missions/givers/frontier-rescue.json`
- Create: `src/data/missions/givers/colonial-guard.json`

- [ ] **Step 1: Create giver JSON files**

Create `src/data/missions/givers/jay-mercer.json`:

```json
{
  "id": "jay",
  "name": "Jay Mercer",
  "title": "Senior Hauler",
  "objectiveTypes": ["gather"],
  "minDifficulty": 1,
  "maxDifficulty": 5,
  "missions": [
    {
      "id": "jay_mineral_survey",
      "name": "Mineral Survey",
      "briefing": "There is a rock out near the belt tagged for survey. Grab samples and bring them back. Easy money.",
      "objectiveSlots": [
        { "type": "gather", "weight": 1, "params": { "type": "gather", "resourceAmount": { "min": 50, "max": 100 } }, "reward": { "min": 300, "max": 600 } }
      ],
      "completionBonus": { "min": 100, "max": 300 },
      "regionByDifficulty": { "near-earth": [1, 2], "asteroid-belt": [3, 5] }
    },
    {
      "id": "jay_deep_core_sample",
      "name": "Deep Core Sample",
      "briefing": "Science division wants a heavy extraction. Drill deep, fill the hold. The rock is further out this time.",
      "objectiveSlots": [
        { "type": "gather", "weight": 1, "params": { "type": "gather", "resourceAmount": { "min": 80, "max": 150 } }, "reward": { "min": 500, "max": 900 } }
      ],
      "completionBonus": { "min": 200, "max": 500 },
      "regionByDifficulty": { "asteroid-belt": [3, 5] }
    }
  ]
}
```

Create `src/data/missions/givers/belt-mining-corp.json`:

```json
{
  "id": "belt-mining",
  "name": "Belt Mining Corp",
  "title": "Mining Contractor",
  "objectiveTypes": ["gather"],
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "bmc_standard_extraction",
      "name": "Standard Extraction",
      "briefing": "Contract #4471. Target asteroid tagged for mineral extraction. Standard rates apply. Fill your hold and return to any station.",
      "objectiveSlots": [
        { "type": "gather", "weight": 1, "params": { "type": "gather", "resourceAmount": { "min": 100, "max": 300 } }, "reward": { "min": 800, "max": 2000 } }
      ],
      "completionBonus": { "min": 300, "max": 1000 },
      "regionByDifficulty": { "asteroid-belt": [3, 7], "kuiper-belt": [8, 10] }
    },
    {
      "id": "bmc_deep_belt_haul",
      "name": "Deep Belt Haul",
      "briefing": "Long-range extraction job. The ore is rich but the rock is far. Fuel up and bring a full hold back.",
      "objectiveSlots": [
        { "type": "gather", "weight": 1, "params": { "type": "gather", "resourceAmount": { "min": 200, "max": 500 } }, "reward": { "min": 1500, "max": 3000 } }
      ],
      "completionBonus": { "min": 500, "max": 1500 },
      "regionByDifficulty": { "asteroid-belt": [5, 7], "kuiper-belt": [8, 10] }
    }
  ]
}
```

Create `src/data/missions/givers/frontier-rescue.json`:

```json
{
  "id": "frontier-rescue",
  "name": "Frontier Rescue",
  "title": "Emergency Services",
  "objectiveTypes": ["rescue"],
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "fr_distress_signal",
      "name": "Distress Signal",
      "briefing": "We are picking up a distress beacon. Colonists are trapped. Clock is ticking — get in there and pull them out.",
      "objectiveSlots": [
        { "type": "rescue", "weight": 1, "params": { "type": "rescue", "colonistCount": { "min": 1, "max": 3 }, "oxygenTime": { "min": 120, "max": 45 }, "guardedChance": 0.2 }, "reward": { "min": 1000, "max": 3000 } }
      ],
      "completionBonus": { "min": 500, "max": 2000 },
      "regionByDifficulty": { "near-earth": [3, 4], "asteroid-belt": [5, 8], "kuiper-belt": [9, 10] }
    },
    {
      "id": "fr_cocoon_extraction",
      "name": "Cocoon Extraction",
      "briefing": "Multiple colonists cocooned in a deep nest. Hostiles confirmed. Move fast, shoot straight, bring them home alive.",
      "objectiveSlots": [
        { "type": "rescue", "weight": 1, "params": { "type": "rescue", "colonistCount": { "min": 2, "max": 4 }, "oxygenTime": { "min": 90, "max": 30 }, "guardedChance": 0.7 }, "reward": { "min": 2000, "max": 4000 } }
      ],
      "completionBonus": { "min": 800, "max": 3000 },
      "regionByDifficulty": { "asteroid-belt": [5, 8], "kuiper-belt": [9, 10] }
    }
  ]
}
```

Create `src/data/missions/givers/colonial-guard.json`:

```json
{
  "id": "colonial-guard",
  "name": "Colonial Guard",
  "title": "Pest Control Division",
  "objectiveTypes": ["exterminate"],
  "minDifficulty": 2,
  "maxDifficulty": 10,
  "missions": [
    {
      "id": "cg_nest_clearance",
      "name": "Nest Clearance",
      "briefing": "Bug infestation confirmed on a near-Earth rock. Clear the nests before they spread to the shipping lanes.",
      "objectiveSlots": [
        { "type": "exterminate", "weight": 1, "params": { "type": "exterminate", "nestCount": { "min": 1, "max": 3 }, "swarmSize": { "min": 3, "max": 8 }, "spitterChance": 0.1 }, "reward": { "min": 800, "max": 2500 } }
      ],
      "completionBonus": { "min": 400, "max": 1500 },
      "regionByDifficulty": { "near-earth": [2, 4], "asteroid-belt": [5, 7], "kuiper-belt": [8, 10] }
    },
    {
      "id": "cg_hive_assault",
      "name": "Hive Assault",
      "briefing": "This one is serious. Multiple nests, spitter escorts, the whole party. Colonial Guard wants it scorched. Hazard pay included.",
      "objectiveSlots": [
        { "type": "exterminate", "weight": 1, "params": { "type": "exterminate", "nestCount": { "min": 3, "max": 5 }, "swarmSize": { "min": 6, "max": 12 }, "spitterChance": 0.6 }, "reward": { "min": 2000, "max": 4000 } }
      ],
      "completionBonus": { "min": 800, "max": 2500 },
      "regionByDifficulty": { "asteroid-belt": [5, 7], "kuiper-belt": [8, 10] }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/data/missions/givers/
git commit -m "feat(missions): add mission giver manifest data files"
```

---

### Task 3: Create Giver Catalog Loader

**Files:**
- Create: `src/lib/missions/giverCatalog.ts`

- [ ] **Step 1: Create the loader**

Create `src/lib/missions/giverCatalog.ts`:

```ts
/**
 * Mission giver catalog loader.
 *
 * Imports all mission giver manifest JSON files at build time
 * and exports a typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { MissionGiver } from './types'

import jayData from '@/data/missions/givers/jay-mercer.json'
import beltMiningData from '@/data/missions/givers/belt-mining-corp.json'
import frontierRescueData from '@/data/missions/givers/frontier-rescue.json'
import colonialGuardData from '@/data/missions/givers/colonial-guard.json'

/** All mission givers loaded from JSON. */
export const MISSION_GIVERS: MissionGiver[] = [
  jayData,
  beltMiningData,
  frontierRescueData,
  colonialGuardData,
] as unknown as MissionGiver[]

/** Mission givers keyed by id. */
const GIVERS_BY_ID: Record<string, MissionGiver> = Object.fromEntries(
  MISSION_GIVERS.map((g) => [g.id, g]),
)

/** Get a giver by id. Returns undefined if not found. */
export function getGiverById(id: string): MissionGiver | undefined {
  return GIVERS_BY_ID[id]
}

/**
 * Get all givers whose difficulty range covers the given difficulty.
 *
 * @param difficulty - Player mission difficulty (1-10).
 * @returns Givers that operate at this difficulty level.
 */
export function getGiversForDifficulty(difficulty: number): MissionGiver[] {
  return MISSION_GIVERS.filter(
    (g) => g.minDifficulty <= difficulty && g.maxDifficulty >= difficulty,
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/missions/giverCatalog.ts
git commit -m "feat(missions): add mission giver catalog loader"
```

---

### Task 4: Implement Mission Difficulty (TDD)

**Files:**
- Create: `src/lib/missions/missionDifficulty.ts`
- Create: `src/lib/missions/__tests__/missionDifficulty.spec.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/missions/__tests__/missionDifficulty.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMissionDifficulty } from '../missionDifficulty'
import type { UpgradeLevels } from '@/lib/upgrades'

describe('computeMissionDifficulty', () => {
  it('returns 1 for all level-0 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 0,
      shuttleBoosterEfficiencyUpgrade: 0,
      shuttleBrakeEfficiencyUpgrade: 0,
      shuttleThrustersEfficiencyUpgrade: 0,
      heatShieldResistance: 0,
      heatShieldArmor: 0,
    }
    expect(computeMissionDifficulty(levels)).toBe(1)
  })

  it('returns 10 for all level-3 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 3,
      shuttleBoosterEfficiencyUpgrade: 3,
      shuttleBrakeEfficiencyUpgrade: 3,
      shuttleThrustersEfficiencyUpgrade: 3,
      heatShieldResistance: 3,
      heatShieldArmor: 3,
    }
    expect(computeMissionDifficulty(levels)).toBe(10)
  })

  it('returns 4 for all level-1 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 1,
      shuttleBoosterEfficiencyUpgrade: 1,
      shuttleBrakeEfficiencyUpgrade: 1,
      shuttleThrustersEfficiencyUpgrade: 1,
      heatShieldResistance: 1,
      heatShieldArmor: 1,
    }
    expect(computeMissionDifficulty(levels)).toBe(4)
  })

  it('returns 7 for all level-2 upgrades', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 2,
      shuttleBoosterEfficiencyUpgrade: 2,
      shuttleBrakeEfficiencyUpgrade: 2,
      shuttleThrustersEfficiencyUpgrade: 2,
      heatShieldResistance: 2,
      heatShieldArmor: 2,
    }
    expect(computeMissionDifficulty(levels)).toBe(7)
  })

  it('handles mixed levels (averages correctly)', () => {
    const levels: UpgradeLevels = {
      shuttleFuelUpgrade: 3,
      shuttleBoosterEfficiencyUpgrade: 0,
      shuttleBrakeEfficiencyUpgrade: 0,
      shuttleThrustersEfficiencyUpgrade: 0,
      heatShieldResistance: 0,
      heatShieldArmor: 0,
    }
    // avg = 3/6 = 0.5, floor(0.5/3*9)+1 = floor(1.5)+1 = 2
    expect(computeMissionDifficulty(levels)).toBe(2)
  })

  it('handles empty/undefined levels as 0', () => {
    expect(computeMissionDifficulty({})).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/missionDifficulty.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/missions/missionDifficulty.ts`:

```ts
/**
 * Mission difficulty derivation from player upgrade levels.
 *
 * Maps the average upgrade level (0-3) linearly to mission
 * difficulty (1-10). Higher upgrades unlock harder missions
 * in deeper belt regions.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import { UPGRADE_DEFINITIONS, type UpgradeId, type UpgradeLevels } from '@/lib/upgrades'

/** Maximum upgrade level across all upgrade definitions. */
const MAX_UPGRADE_LEVEL = 3

/** Minimum mission difficulty. */
const MIN_DIFFICULTY = 1

/** Maximum mission difficulty. */
const MAX_DIFFICULTY = 10

/**
 * Compute mission difficulty from the player's upgrade levels.
 *
 * @param levels - Current player upgrade levels (0-3 each).
 * @returns Difficulty level from 1 (fresh player) to 10 (fully upgraded).
 */
export function computeMissionDifficulty(levels: UpgradeLevels): number {
  const upgradeIds = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]
  const sum = upgradeIds.reduce((acc, id) => acc + (levels[id] ?? 0), 0)
  const avg = sum / upgradeIds.length
  const raw = Math.floor((avg / MAX_UPGRADE_LEVEL) * (MAX_DIFFICULTY - MIN_DIFFICULTY)) + MIN_DIFFICULTY
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, raw))
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/missionDifficulty.spec.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionDifficulty.ts src/lib/missions/__tests__/missionDifficulty.spec.ts
git commit -m "feat(missions): implement mission difficulty from upgrade levels"
```

---

### Task 5: Implement Asteroid Mission Generator (TDD)

**Files:**
- Create: `src/lib/missions/asteroidMissionGenerator.ts`
- Create: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  generateAsteroidMission,
  generateWaypointInRegion,
  interpolateRange,
  rollObjective,
} from '../asteroidMissionGenerator'

describe('interpolateRange', () => {
  it('returns min at difficulty 1', () => {
    expect(interpolateRange({ min: 50, max: 150 }, 1)).toBe(50)
  })

  it('returns max at difficulty 10', () => {
    expect(interpolateRange({ min: 50, max: 150 }, 10)).toBe(150)
  })

  it('interpolates linearly at difficulty 5', () => {
    const result = interpolateRange({ min: 0, max: 90 }, 5)
    // (5-1)/9 * 90 = 40
    expect(result).toBe(40)
  })
})

describe('rollObjective', () => {
  it('rolls gather objective with concrete resource amount', () => {
    const slot = {
      type: 'gather' as const,
      weight: 1,
      params: { type: 'gather' as const, resourceAmount: { min: 50, max: 150 } },
      reward: { min: 300, max: 600 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('gather')
    expect(obj.resourceAmount).toBeGreaterThanOrEqual(50)
    expect(obj.resourceAmount).toBeLessThanOrEqual(150)
    expect(obj.reward).toBeGreaterThanOrEqual(300)
    expect(obj.reward).toBeLessThanOrEqual(600)
  })

  it('rolls exterminate objective with concrete values', () => {
    const slot = {
      type: 'exterminate' as const,
      weight: 1,
      params: {
        type: 'exterminate' as const,
        nestCount: { min: 1, max: 5 },
        swarmSize: { min: 3, max: 10 },
        spitterChance: 0.5,
      },
      reward: { min: 800, max: 2000 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('exterminate')
    expect(obj.nestCount).toBeGreaterThanOrEqual(1)
    expect(typeof obj.hasSpitters).toBe('boolean')
  })

  it('rolls rescue objective with concrete values', () => {
    const slot = {
      type: 'rescue' as const,
      weight: 1,
      params: {
        type: 'rescue' as const,
        colonistCount: { min: 1, max: 3 },
        oxygenTime: { min: 120, max: 45 },
        guardedChance: 0.5,
      },
      reward: { min: 1000, max: 3000 },
    }
    const obj = rollObjective(slot, 5)
    expect(obj.type).toBe('rescue')
    expect(obj.colonistCount).toBeGreaterThanOrEqual(1)
    expect(obj.oxygenTime).toBeGreaterThanOrEqual(45)
    expect(typeof obj.isGuarded).toBe('boolean')
  })
})

describe('generateWaypointInRegion', () => {
  it('generates position for asteroid-belt within belt bounds', () => {
    const wp = generateWaypointInRegion('asteroid-belt')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // main-belt: innerRadius=420, outerRadius=660, ORBIT_SCALE=0.5
    expect(dist).toBeGreaterThanOrEqual(420 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(660 * 0.5 * 1.1)
  })

  it('generates position for kuiper-belt within belt bounds', () => {
    const wp = generateWaypointInRegion('kuiper-belt')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // kuiper-belt: innerRadius=1400, outerRadius=2400, ORBIT_SCALE=0.5
    expect(dist).toBeGreaterThanOrEqual(1400 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(2400 * 0.5 * 1.1)
  })

  it('generates position for near-earth in closer range', () => {
    const wp = generateWaypointInRegion('near-earth')
    const dist = Math.sqrt(wp.worldX * wp.worldX + wp.worldZ * wp.worldZ)
    // near-earth: between Earth orbit (~200) and main belt inner (420)
    expect(dist).toBeGreaterThanOrEqual(200 * 0.5 * 0.9)
    expect(dist).toBeLessThanOrEqual(420 * 0.5 * 1.1)
  })
})

describe('generateAsteroidMission', () => {
  it('generates a valid mission at difficulty 1', () => {
    const mission = generateAsteroidMission(1)
    expect(mission.id).toBeTruthy()
    expect(mission.giverId).toBeTruthy()
    expect(mission.giverName).toBeTruthy()
    expect(mission.name).toBeTruthy()
    expect(mission.briefing).toBeTruthy()
    expect(mission.difficulty).toBe(1)
    expect(mission.objectives.length).toBeGreaterThan(0)
    expect(mission.totalReward).toBeGreaterThan(0)
    expect(mission.waypoint.worldX).toBeDefined()
    expect(mission.waypoint.worldZ).toBeDefined()
    expect(mission.status).toBe('available')
  })

  it('generates a valid mission at difficulty 5', () => {
    const mission = generateAsteroidMission(5)
    expect(mission.difficulty).toBe(5)
    expect(['near-earth', 'asteroid-belt', 'kuiper-belt']).toContain(mission.region)
  })

  it('generates a valid mission at difficulty 10', () => {
    const mission = generateAsteroidMission(10)
    expect(mission.difficulty).toBe(10)
  })

  it('region matches difficulty tier', () => {
    // Difficulty 1 should be near-earth
    const easyMission = generateAsteroidMission(1)
    expect(easyMission.region).toBe('near-earth')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the generator**

Create `src/lib/missions/asteroidMissionGenerator.ts`:

```ts
/**
 * Asteroid mission generator.
 *
 * Takes a difficulty level, picks a giver and template, rolls
 * concrete objective values, and generates a waypoint position
 * within the appropriate belt region.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type {
  NumberRange,
  MissionRegion,
  ObjectiveSlot,
  ConcreteObjective,
  MissionGiverTemplate,
  GeneratedAsteroidMission,
} from './types'
import { getGiversForDifficulty } from './giverCatalog'
import { ASTEROID_BELTS } from '@/lib/planets/catalog'
import { ORBIT_SCALE } from '@/lib/planets/constants'

/** Earth's approximate semi-major axis in catalog units. */
const NEAR_EARTH_INNER_RADIUS = 200

/** Main belt inner radius — upper bound for near-earth missions. */
const NEAR_EARTH_OUTER_RADIUS = 420

/**
 * Interpolate a NumberRange linearly by difficulty (1-10).
 *
 * @param range - Min/max range from template.
 * @param difficulty - Current difficulty (1-10).
 * @returns Interpolated integer value.
 */
export function interpolateRange(range: NumberRange, difficulty: number): number {
  const t = (difficulty - 1) / 9
  return Math.round(range.min + t * (range.max - range.min))
}

/**
 * Roll a concrete objective from a template slot and difficulty.
 *
 * @param slot - Objective slot with scalable params.
 * @param difficulty - Current difficulty (1-10).
 * @returns Concrete objective with rolled values.
 */
export function rollObjective(slot: ObjectiveSlot, difficulty: number): ConcreteObjective {
  const reward = interpolateRange(slot.reward, difficulty)

  switch (slot.params.type) {
    case 'gather':
      return {
        type: 'gather',
        resourceAmount: interpolateRange(slot.params.resourceAmount, difficulty),
        reward,
      }
    case 'exterminate':
      return {
        type: 'exterminate',
        nestCount: interpolateRange(slot.params.nestCount, difficulty),
        swarmSize: interpolateRange(slot.params.swarmSize, difficulty),
        hasSpitters: Math.random() < slot.params.spitterChance,
        reward,
      }
    case 'rescue':
      return {
        type: 'rescue',
        colonistCount: interpolateRange(slot.params.colonistCount, difficulty),
        oxygenTime: interpolateRange(slot.params.oxygenTime, difficulty),
        isGuarded: Math.random() < slot.params.guardedChance,
        reward,
      }
  }
}

/**
 * Find the region for a template at a given difficulty.
 *
 * @param template - Giver mission template.
 * @param difficulty - Current difficulty (1-10).
 * @returns Matching region or undefined.
 */
function findRegionForTemplate(
  template: MissionGiverTemplate,
  difficulty: number,
): MissionRegion | undefined {
  for (const [region, range] of Object.entries(template.regionByDifficulty)) {
    if (range && difficulty >= range[0] && difficulty <= range[1]) {
      return region as MissionRegion
    }
  }
  return undefined
}

/**
 * Generate a waypoint position within a belt region.
 *
 * @param region - Target region.
 * @returns World-space XZ coordinates within the belt.
 */
export function generateWaypointInRegion(region: MissionRegion): { worldX: number; worldZ: number } {
  let innerRadius: number
  let outerRadius: number

  if (region === 'near-earth') {
    innerRadius = NEAR_EARTH_INNER_RADIUS
    outerRadius = NEAR_EARTH_OUTER_RADIUS
  } else {
    const beltId = region === 'asteroid-belt' ? 'main-belt' : 'kuiper-belt'
    const belt = ASTEROID_BELTS.find((b) => b.id === beltId)
    if (!belt) {
      innerRadius = NEAR_EARTH_INNER_RADIUS
      outerRadius = NEAR_EARTH_OUTER_RADIUS
    } else {
      innerRadius = belt.innerRadius
      outerRadius = belt.outerRadius
    }
  }

  const angle = Math.random() * Math.PI * 2
  const radius = innerRadius + Math.random() * (outerRadius - innerRadius)
  const worldRadius = radius * ORBIT_SCALE

  return {
    worldX: Math.cos(angle) * worldRadius,
    worldZ: Math.sin(angle) * worldRadius,
  }
}

/**
 * Generate a complete asteroid mission at a given difficulty.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @returns Fully generated mission ready for the mission board.
 */
export function generateAsteroidMission(difficulty: number): GeneratedAsteroidMission {
  const givers = getGiversForDifficulty(difficulty)
  if (givers.length === 0) {
    throw new Error(`No givers available for difficulty ${difficulty}`)
  }

  // Collect all eligible templates across all givers
  const candidates: { giver: typeof givers[0]; template: MissionGiverTemplate; region: MissionRegion }[] = []
  for (const giver of givers) {
    for (const template of giver.missions) {
      const region = findRegionForTemplate(template, difficulty)
      if (region) {
        candidates.push({ giver, template, region })
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error(`No templates match difficulty ${difficulty}`)
  }

  // Pick a random candidate
  const pick = candidates[Math.floor(Math.random() * candidates.length)]!

  // Roll objectives from the first slot (weighted selection could be added later)
  const slot = pick.template.objectiveSlots[0]!
  const objective = rollObjective(slot, difficulty)
  const completionBonus = interpolateRange(pick.template.completionBonus, difficulty)
  const totalReward = objective.reward + completionBonus

  // Generate waypoint
  const waypoint = generateWaypointInRegion(pick.region)

  return {
    id: `${pick.template.id}_${Date.now()}`,
    giverId: pick.giver.id,
    giverName: pick.giver.name,
    templateId: pick.template.id,
    name: pick.template.name,
    briefing: pick.template.briefing,
    difficulty,
    region: pick.region,
    objectives: [objective],
    totalReward,
    waypoint,
    status: 'available',
  }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
git commit -m "feat(missions): implement asteroid mission generator with tests"
```

---

### Task 6: Implement Mission Storage (TDD)

**Files:**
- Create: `src/lib/missions/missionStorage.ts`
- Create: `src/lib/missions/__tests__/missionStorage.spec.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/missions/__tests__/missionStorage.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveActiveMission,
  loadActiveMission,
  clearActiveMission,
  ACTIVE_MISSION_KEY,
} from '../missionStorage'
import type { GeneratedAsteroidMission } from '../types'

const MOCK_MISSION: GeneratedAsteroidMission = {
  id: 'test_mission_123',
  giverId: 'jay',
  giverName: 'Jay Mercer',
  templateId: 'jay_mineral_survey',
  name: 'Mineral Survey',
  briefing: 'Test briefing',
  difficulty: 3,
  region: 'near-earth',
  objectives: [{ type: 'gather', resourceAmount: 75, reward: 450 }],
  totalReward: 550,
  waypoint: { worldX: 100, worldZ: 50 },
  status: 'accepted',
}

beforeEach(() => {
  localStorage.removeItem(ACTIVE_MISSION_KEY)
})

describe('saveActiveMission', () => {
  it('persists mission to localStorage', () => {
    saveActiveMission(MOCK_MISSION)
    const raw = localStorage.getItem(ACTIVE_MISSION_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).id).toBe('test_mission_123')
  })
})

describe('loadActiveMission', () => {
  it('returns null when nothing saved', () => {
    expect(loadActiveMission()).toBeNull()
  })

  it('returns saved mission', () => {
    saveActiveMission(MOCK_MISSION)
    const loaded = loadActiveMission()
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe('test_mission_123')
    expect(loaded!.giverId).toBe('jay')
    expect(loaded!.waypoint.worldX).toBe(100)
  })

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(ACTIVE_MISSION_KEY, 'not json')
    expect(loadActiveMission()).toBeNull()
  })

  it('returns null for non-object JSON', () => {
    localStorage.setItem(ACTIVE_MISSION_KEY, '"a string"')
    expect(loadActiveMission()).toBeNull()
  })
})

describe('clearActiveMission', () => {
  it('removes mission from localStorage', () => {
    saveActiveMission(MOCK_MISSION)
    clearActiveMission()
    expect(loadActiveMission()).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/missionStorage.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/missions/missionStorage.ts`:

```ts
/**
 * Active asteroid mission localStorage persistence.
 *
 * Saves/loads the active asteroid mission so the /level route
 * can read what mission is in progress. Same pattern as
 * messageStorage.ts.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-asteroid-missions-design.md
 */
import type { GeneratedAsteroidMission } from './types'

/** Versioned localStorage key for the active asteroid mission. */
export const ACTIVE_MISSION_KEY = 'asteroid-lander-active-mission-v1'

/**
 * Save the active asteroid mission to localStorage.
 *
 * @param mission - Mission to persist.
 */
export function saveActiveMission(mission: GeneratedAsteroidMission): void {
  localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(mission))
}

/**
 * Load the active asteroid mission from localStorage.
 *
 * @returns The persisted mission, or null if absent or corrupt.
 */
export function loadActiveMission(): GeneratedAsteroidMission | null {
  const raw = localStorage.getItem(ACTIVE_MISSION_KEY)
  if (raw === null) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null
    }
    return parsed as GeneratedAsteroidMission
  } catch {
    return null
  }
}

/**
 * Remove the active mission from localStorage.
 */
export function clearActiveMission(): void {
  localStorage.removeItem(ACTIVE_MISSION_KEY)
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/missionStorage.spec.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionStorage.ts src/lib/missions/__tests__/missionStorage.spec.ts
git commit -m "feat(missions): implement mission localStorage persistence with tests"
```

---

### Task 7: Extend Mission Board for Asteroid Missions

**Files:**
- Modify: `src/lib/missions/shuttleMissionSession.ts`
- Modify: `src/lib/missions/__tests__/shuttleMissionSession.spec.ts`

- [ ] **Step 1: Update createMissionBoard to include asteroid fields**

In `src/lib/missions/shuttleMissionSession.ts`, update `createMissionBoard()`:

```ts
export function createMissionBoard(): ShuttleMissionBoard {
  return {
    offeredMission: null,
    offeringPlanet: null,
    restockTimer: null,
    activeMissions: [],
    offeredAsteroidMission: null,
    activeAsteroidMission: null,
    asteroidRestockTimer: null,
  }
}
```

- [ ] **Step 2: Add asteroid mission board functions**

Add these functions to `shuttleMissionSession.ts`:

```ts
import type { GeneratedAsteroidMission } from './types'

/**
 * Set the offered asteroid mission on the board.
 *
 * @param board - Current board state.
 * @param mission - Generated asteroid mission to offer.
 * @returns Updated board.
 */
export function offerAsteroidMission(
  board: ShuttleMissionBoard,
  mission: GeneratedAsteroidMission,
): ShuttleMissionBoard {
  if (board.asteroidRestockTimer) return board
  return { ...board, offeredAsteroidMission: mission }
}

/**
 * Accept the offered asteroid mission. Moves it to active and starts restock timer.
 *
 * @param board - Current board state.
 * @returns Updated board.
 */
export function acceptAsteroidMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.offeredAsteroidMission) return board

  const total = randomRestockDuration()
  return {
    ...board,
    offeredAsteroidMission: null,
    activeAsteroidMission: { ...board.offeredAsteroidMission, status: 'accepted' },
    asteroidRestockTimer: { remaining: total, total },
  }
}

/**
 * Mark the active asteroid mission as in-transit (player pressed E at waypoint).
 *
 * @param board - Current board state.
 * @returns Updated board.
 */
export function beginAsteroidMission(board: ShuttleMissionBoard): ShuttleMissionBoard {
  if (!board.activeAsteroidMission || board.activeAsteroidMission.status !== 'accepted') return board
  return {
    ...board,
    activeAsteroidMission: { ...board.activeAsteroidMission, status: 'in-transit' },
  }
}

/**
 * Tick the asteroid mission restock timer.
 *
 * @param board - Current board state.
 * @param dt - Delta time in seconds.
 * @returns Updated board.
 */
export function tickAsteroidMissionBoard(board: ShuttleMissionBoard, dt: number): ShuttleMissionBoard {
  if (!board.asteroidRestockTimer) return board

  const remaining = board.asteroidRestockTimer.remaining - dt
  if (remaining <= 0) {
    return { ...board, asteroidRestockTimer: null }
  }

  return {
    ...board,
    asteroidRestockTimer: { ...board.asteroidRestockTimer, remaining },
  }
}
```

- [ ] **Step 3: Add tests for asteroid board functions**

Append to `src/lib/missions/__tests__/shuttleMissionSession.spec.ts`:

```ts
import {
  offerAsteroidMission,
  acceptAsteroidMission,
  beginAsteroidMission,
  tickAsteroidMissionBoard,
} from '../shuttleMissionSession'
import { generateAsteroidMission } from '../asteroidMissionGenerator'

describe('offerAsteroidMission', () => {
  it('sets the offered asteroid mission', () => {
    const board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    const updated = offerAsteroidMission(board, mission)
    expect(updated.offeredAsteroidMission).not.toBeNull()
    expect(updated.offeredAsteroidMission!.id).toBe(mission.id)
  })

  it('does not offer if restock timer is running', () => {
    let board = createMissionBoard()
    const mission1 = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission1)
    board = acceptAsteroidMission(board)
    // Timer is running
    const mission2 = generateAsteroidMission(1)
    const updated = offerAsteroidMission(board, mission2)
    expect(updated.offeredAsteroidMission).toBeNull()
  })
})

describe('acceptAsteroidMission', () => {
  it('moves offered to active with accepted status', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    const updated = acceptAsteroidMission(board)
    expect(updated.offeredAsteroidMission).toBeNull()
    expect(updated.activeAsteroidMission).not.toBeNull()
    expect(updated.activeAsteroidMission!.status).toBe('accepted')
    expect(updated.asteroidRestockTimer).not.toBeNull()
  })
})

describe('beginAsteroidMission', () => {
  it('sets status to in-transit', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const updated = beginAsteroidMission(board)
    expect(updated.activeAsteroidMission!.status).toBe('in-transit')
  })
})

describe('tickAsteroidMissionBoard', () => {
  it('decrements asteroid restock timer', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const remaining = board.asteroidRestockTimer!.remaining
    const ticked = tickAsteroidMissionBoard(board, 10)
    expect(ticked.asteroidRestockTimer!.remaining).toBeCloseTo(remaining - 10)
  })

  it('clears timer when expired', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const ticked = tickAsteroidMissionBoard(board, 999)
    expect(ticked.asteroidRestockTimer).toBeNull()
  })
})
```

- [ ] **Step 4: Run all mission tests**

Run: `bun test:unit src/lib/missions/`
Expected: All pass (existing shuttle tests + new asteroid tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/shuttleMissionSession.ts src/lib/missions/__tests__/shuttleMissionSession.spec.ts
git commit -m "feat(missions): extend mission board with asteroid mission functions"
```

---

### Task 8: Add Waypoint to Map Overlay State

**Files:**
- Modify: `src/lib/ShuttleTelemetry.ts`

- [ ] **Step 1: Add waypoint field to MapOverlayState**

In `src/lib/ShuttleTelemetry.ts`, add to the `MapOverlayState` interface:

```ts
  /** Mission waypoint projected to screen, if an active asteroid mission exists. */
  missionWaypoint: { screenX: number; screenY: number; name: string; distance: string } | null
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ShuttleTelemetry.ts
git commit -m "feat(missions): add mission waypoint to MapOverlayState"
```

---

### Task 9: Update Mission Board UI for Asteroid Missions

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

- [ ] **Step 1: Add asteroid mission section to the template**

Read the current file, then add an "Asteroid Missions" section after the existing "Active Missions" section. Update the script to handle asteroid mission emits and display.

Add new emits:

```ts
const emit = defineEmits<{
  acceptMission: []
  deliverMission: [missionId: string]
  acceptAsteroidMission: []
}>()
```

Add a helper for objective summary:

```ts
function objectiveSummary(mission: GeneratedAsteroidMission): string {
  const obj = mission.objectives[0]
  if (!obj) return ''
  switch (obj.type) {
    case 'gather':
      return `Gather ${obj.resourceAmount} kg of resources`
    case 'exterminate':
      return `Clear ${obj.nestCount} nest${obj.nestCount !== 1 ? 's' : ''}${obj.hasSpitters ? ' (spitters present)' : ''}`
    case 'rescue':
      return `Rescue ${obj.colonistCount} colonist${obj.colonistCount !== 1 ? 's' : ''} (${obj.oxygenTime}s oxygen)`
  }
}

function regionLabel(region: MissionRegion): string {
  switch (region) {
    case 'near-earth': return 'Near-Earth'
    case 'asteroid-belt': return 'Asteroid Belt'
    case 'kuiper-belt': return 'Kuiper Belt'
  }
}
```

Add the import for the new type:

```ts
import type { ShuttleMissionBoard, ActiveShuttleMission, GeneratedAsteroidMission, MissionRegion } from '@/lib/missions/types'
```

Add the template section after the "Active Missions" div:

```html
    <!-- Asteroid Missions -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Asteroid Missions</h3>

      <div v-if="board?.offeredAsteroidMission && !board.activeAsteroidMission" class="mission-board-offer">
        <div class="mission-board-offer__name">{{ board.offeredAsteroidMission.name }}</div>
        <div class="mission-board-offer__giver">From: {{ board.offeredAsteroidMission.giverName }}</div>
        <div class="mission-board-offer__desc">{{ board.offeredAsteroidMission.briefing }}</div>
        <div class="mission-board-offer__meta">
          <span>Region: {{ regionLabel(board.offeredAsteroidMission.region) }}</span>
          <span>Reward: {{ board.offeredAsteroidMission.totalReward }} CR</span>
        </div>
        <div class="mission-board-offer__objective">
          {{ objectiveSummary(board.offeredAsteroidMission) }}
        </div>
        <button
          type="button"
          class="mission-board-offer__accept-btn"
          @click="emit('acceptAsteroidMission')"
        >
          Accept
        </button>
      </div>

      <div v-else-if="board?.activeAsteroidMission" class="mission-board-active">
        <div class="mission-board-active__name">{{ board.activeAsteroidMission.name }}</div>
        <div class="mission-board-active__route">
          {{ board.activeAsteroidMission.giverName }} &middot; {{ regionLabel(board.activeAsteroidMission.region) }}
        </div>
        <div class="mission-board-active__status">
          {{ board.activeAsteroidMission.status === 'accepted' ? 'Navigate to waypoint' : 'In transit' }}
        </div>
        <div class="mission-board-active__cargo">
          {{ objectiveSummary(board.activeAsteroidMission) }}
          &middot; {{ board.activeAsteroidMission.totalReward }} CR
        </div>
      </div>

      <div v-else-if="board?.asteroidRestockTimer" class="mission-board-empty">
        Restocking in {{ formatTime(board.asteroidRestockTimer.remaining) }}
      </div>

      <div v-else class="mission-board-empty">
        No asteroid missions available
      </div>
    </div>
```

- [ ] **Step 2: Update ShuttleControlOverlay to pass the new emit**

In `src/components/ShuttleControlOverlay.vue`, add `acceptAsteroidMission: []` to the emits and pass it through the `<component>` tag:

```html
@accept-asteroid-mission="$emit('acceptAsteroidMission')"
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shuttle-control/ShuttleControlProgramMissions.vue src/components/ShuttleControlOverlay.vue
git commit -m "feat(missions): add asteroid missions section to mission board UI"
```

---

### Task 10: Add CSS for Asteroid Mission UI

**Files:**
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Add mission giver and objective styles**

Add after the existing mission board styles:

```css
/* Mission Board — giver and objective details */
.mission-board-offer__giver {
  @apply text-xs font-mono text-amber-300/70;
}

.mission-board-offer__objective {
  @apply text-xs font-mono text-slate-400 italic mt-1;
}

/* Mission approach prompt */
.mission-approach-prompt {
  @apply fixed bottom-1/4 left-1/2 -translate-x-1/2 z-30
         pointer-events-none font-mono flex flex-col items-center gap-2
         px-6 py-4 rounded-lg;
  background: radial-gradient(ellipse at center, rgba(60, 30, 0, 0.85) 0%, rgba(30, 10, 0, 0.7) 100%);
  border: 1px solid rgba(255, 180, 0, 0.3);
  text-shadow: 0 0 8px rgba(255, 180, 0, 0.7);
  animation: orbit-prompt-fade-in 0.3s ease-out;
}

.mission-approach-prompt__name {
  @apply text-lg font-bold text-amber-200 tracking-widest uppercase;
}

.mission-approach-prompt__action {
  @apply text-sm text-amber-400;
}

/* Mission waypoint label (tactical map overlay) */
.map-waypoint-indicator {
  @apply absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 pointer-events-none;
}

.map-waypoint-dot {
  @apply w-2.5 h-2.5 rounded-sm rotate-45 border border-amber-400/80 bg-amber-400/40;
  animation: waypoint-pulse 2s ease-in-out infinite;
}

.map-waypoint-label {
  @apply text-[10px] font-mono text-amber-300/90 whitespace-nowrap tracking-wider uppercase;
}

.map-waypoint-distance {
  @apply text-[9px] font-mono text-amber-400/50;
}

@keyframes waypoint-pulse {
  0%, 100% { opacity: 0.6; box-shadow: 0 0 4px rgba(255, 180, 0, 0.3); }
  50% { opacity: 1; box-shadow: 0 0 12px rgba(255, 180, 0, 0.6); }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/assets/css/main.css
git commit -m "feat(missions): add CSS for asteroid mission UI and waypoint"
```

---

### Task 11: Add Waypoint to Tactical Map Overlay

**Files:**
- Modify: `src/components/MapOverlay.vue`

- [ ] **Step 1: Add waypoint rendering to the overlay template**

Read the file first. After the planet indicators section and before the ship marker, add:

```html
    <!-- Mission waypoint indicator -->
    <div
      v-if="overlay.missionWaypoint"
      class="map-waypoint-indicator"
      :style="{ left: overlay.missionWaypoint.screenX + '%', top: overlay.missionWaypoint.screenY + '%' }"
    >
      <div class="map-waypoint-dot" />
      <span class="map-waypoint-label">{{ overlay.missionWaypoint.name }}</span>
      <span class="map-waypoint-distance">{{ overlay.missionWaypoint.distance }}</span>
    </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/MapOverlay.vue
git commit -m "feat(missions): add mission waypoint to tactical map overlay"
```

---

### Task 12: Integrate Asteroid Missions into MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts`

This is the largest integration task. Adds waypoint sprite, approach detection, E key handling, and asteroid mission board methods.

- [ ] **Step 1: Add imports**

Add near the existing mission imports:

```ts
import {
  offerAsteroidMission,
  acceptAsteroidMission,
  beginAsteroidMission,
  tickAsteroidMissionBoard,
} from '@/lib/missions/shuttleMissionSession'
import { generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'
import { computeMissionDifficulty } from '@/lib/missions/missionDifficulty'
import { saveActiveMission } from '@/lib/missions/missionStorage'
import { CURRENT_PLAYER_UPGRADE_LEVELS } from '@/lib/upgrades'
import type { GeneratedAsteroidMission } from '@/lib/missions/types'
```

- [ ] **Step 2: Add state fields**

Add near the existing mission state fields:

```ts
  /** THREE.Sprite for the mission waypoint marker. */
  private waypointSprite: THREE.Sprite | null = null
  /** Whether the shuttle is within approach range of the waypoint. */
  private missionApproachVisible = false
```

- [ ] **Step 3: Add constants**

Add near the existing mission constants:

```ts
/** Distance in world units at which the "Begin Mission" prompt appears. */
const MISSION_APPROACH_RADIUS = 15

/** Apparent screen size of the waypoint marker as fraction of screen height. */
const WAYPOINT_APPARENT_SIZE = 0.04

/** Waypoint marker canvas texture size. */
const WAYPOINT_CANVAS_SIZE = 128
```

- [ ] **Step 4: Add callbacks**

Add near the existing mission callbacks:

```ts
  /** Called when the shuttle approaches/leaves a mission waypoint. */
  onMissionApproach: ((visible: boolean, missionName: string) => void) | null = null

  /** Called when the player begins an asteroid mission (E at waypoint). */
  onBeginAsteroidMission: ((mission: GeneratedAsteroidMission) => void) | null = null
```

- [ ] **Step 5: Add waypoint sprite creation method**

Add a private method (near the reticle creation method):

```ts
  /** Create or destroy the waypoint sprite based on active asteroid mission. */
  private syncWaypointSprite(): void {
    const mission = this.missionBoard.activeAsteroidMission
    if (mission && mission.status === 'accepted' && !this.waypointSprite && this.sceneObjects) {
      // Create canvas texture — amber diamond
      const size = WAYPOINT_CANVAS_SIZE
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const cx = size / 2
      const cy = size / 2
      const r = 20

      // Diamond shape
      ctx.beginPath()
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()

      // Outer glow
      ctx.shadowColor = 'rgba(255, 180, 0, 0.8)'
      ctx.shadowBlur = 15
      ctx.fillStyle = 'rgba(255, 180, 0, 0.6)'
      ctx.fill()

      // Inner outline
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255, 200, 50, 0.95)'
      ctx.lineWidth = 2
      ctx.stroke()

      const tex = new THREE.CanvasTexture(canvas)
      tex.needsUpdate = true

      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })

      this.waypointSprite = new THREE.Sprite(mat)
      this.waypointSprite.position.set(mission.waypoint.worldX, 0, mission.waypoint.worldZ)
      this.sceneObjects.scene.add(this.waypointSprite)
    } else if ((!mission || mission.status !== 'accepted') && this.waypointSprite) {
      this.waypointSprite.removeFromParent()
      this.waypointSprite = null
    }
  }
```

- [ ] **Step 6: Add waypoint scale + approach detection in tick**

Add in the tick method (after `tickAsteroidMissionBoard` call):

```ts
    // Waypoint sprite scale + approach detection
    this.syncWaypointSprite()
    if (this.waypointSprite && this.vehicleCamera && this.shuttleController) {
      // Constant apparent size
      const dist = this.vehicleCamera.camera.position.distanceTo(this.waypointSprite.position)
      const halfFovRad = THREE.MathUtils.degToRad(this.vehicleCamera.camera.fov / 2)
      const waypointWorld = WAYPOINT_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
      this.waypointSprite.scale.setScalar(waypointWorld)

      // Pulsing opacity
      const pulse = 0.6 + 0.4 * Math.sin(this.simTime * 2)
      ;(this.waypointSprite.material as THREE.SpriteMaterial).opacity = pulse

      // Approach detection
      const sx = this.shuttleController.position.x
      const sz = this.shuttleController.position.z
      const wx = this.missionBoard.activeAsteroidMission!.waypoint.worldX
      const wz = this.missionBoard.activeAsteroidMission!.waypoint.worldZ
      const approachDist = Math.sqrt((sx - wx) ** 2 + (sz - wz) ** 2)
      const inRange = approachDist < MISSION_APPROACH_RADIUS

      if (inRange !== this.missionApproachVisible) {
        this.missionApproachVisible = inRange
        this.onMissionApproach?.(inRange, this.missionBoard.activeAsteroidMission!.name)
      }

      // E key to begin mission at waypoint
      if (
        inRange &&
        this.inputManager?.wasActionPressed('orbitAction') &&
        this.orbitSystem?.state === 'free'
      ) {
        const mission = this.missionBoard.activeAsteroidMission!
        this.missionBoard = beginAsteroidMission(this.missionBoard)
        saveActiveMission({ ...mission, status: 'in-transit' })
        this.onBeginAsteroidMission?.(mission)
      }
    } else if (this.missionApproachVisible) {
      this.missionApproachVisible = false
      this.onMissionApproach?.(false, '')
    }
```

- [ ] **Step 7: Add tick calls for asteroid board**

After the existing `this.missionBoard = tickMissionBoard(this.missionBoard, dt)`, add:

```ts
    this.missionBoard = tickAsteroidMissionBoard(this.missionBoard, dt)
```

- [ ] **Step 8: Add waypoint projection in emitMapOverlay**

In `emitMapOverlay()`, before the final `this.onMapOverlay?.(...)` call, add waypoint projection:

```ts
    // Mission waypoint projection
    let missionWaypoint: MapOverlayState['missionWaypoint'] = null
    if (this.missionBoard.activeAsteroidMission?.status === 'accepted') {
      const wp = this.missionBoard.activeAsteroidMission.waypoint
      const wpScreen = this.mapCamera!.projectToScreen(new THREE.Vector3(wp.worldX, 0, wp.worldZ))
      const dx = wp.worldX - px
      const dz = wp.worldZ - pz
      const dist = Math.sqrt(dx * dx + dz * dz)
      missionWaypoint = {
        screenX: wpScreen.x * 100,
        screenY: wpScreen.y * 100,
        name: this.missionBoard.activeAsteroidMission.name,
        distance: formatDistance(dist),
      }
    }
```

Then add `missionWaypoint` to the overlay state object passed to `this.onMapOverlay`.

- [ ] **Step 9: Add public methods for asteroid missions**

```ts
  /** Generate and offer an asteroid mission based on current difficulty. */
  offerAsteroidMissionFromDifficulty(): void {
    if (this.missionBoard.offeredAsteroidMission || this.missionBoard.activeAsteroidMission) return
    if (this.missionBoard.asteroidRestockTimer) return
    const difficulty = computeMissionDifficulty(CURRENT_PLAYER_UPGRADE_LEVELS)
    const mission = generateAsteroidMission(difficulty)
    this.missionBoard = offerAsteroidMission(this.missionBoard, mission)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }

  /** Accept the offered asteroid mission (from shuttle control UI). */
  asteroidMissionAccept(): void {
    this.missionBoard = acceptAsteroidMission(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }
```

- [ ] **Step 10: Trigger asteroid mission offer when entering orbit**

In `updateShopSession()`, after `this.offerMissionAtPlanet(planet.id)`, add:

```ts
        this.offerAsteroidMissionFromDifficulty()
```

- [ ] **Step 11: Run type-check**

Run: `bun run type-check`

- [ ] **Step 12: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(missions): integrate asteroid missions into MapViewController"
```

---

### Task 13: Wire Asteroid Missions in MapView.vue

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add reactive state**

```ts
const missionApproachVisible = ref(false)
const missionApproachName = ref('')
```

- [ ] **Step 2: Wire up callbacks in onMounted**

```ts
    viewController.onMissionApproach = (visible, missionName) => {
      missionApproachVisible.value = visible
      missionApproachName.value = missionName
    }
    viewController.onBeginAsteroidMission = (mission) => {
      // Navigate to level route
      import('@/router').then((mod) => {
        mod.default.push('/level')
      })
    }
```

- [ ] **Step 3: Add handler functions**

```ts
function handleAcceptAsteroidMission() {
  viewController.asteroidMissionAccept()
}
```

- [ ] **Step 4: Add approach prompt to template**

After the mission notification div:

```html
  <div v-if="missionApproachVisible" class="mission-approach-prompt">
    <span class="mission-approach-prompt__name">{{ missionApproachName }}</span>
    <span class="mission-approach-prompt__action">E  Begin Mission</span>
  </div>
```

- [ ] **Step 5: Update ShuttleControlOverlay to pass asteroid emit**

Update the `<ShuttleControlOverlay>` tag to include:

```html
    @accept-asteroid-mission="handleAcceptAsteroidMission"
```

- [ ] **Step 6: Run type-check**

Run: `bun run type-check`

- [ ] **Step 7: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(missions): wire asteroid missions in MapView"
```

---

### Task 14: Final Verification

- [ ] **Step 1: Run full type-check**

Run: `bun run type-check`
Expected: Clean pass.

- [ ] **Step 2: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass.

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No blocking errors. Fix any TSDoc warnings on new exports.

- [ ] **Step 4: Smoke test**

Run: `bun dev`

Manual verification:
1. Orbit Earth, dock, open Missions → "Asteroid Missions" section shows offered mission with giver name + briefing
2. Accept → waypoint appears on map as amber diamond
3. Open tactical map (M) → waypoint shows with distance label
4. Fly toward waypoint → "E Begin Mission" prompt appears
5. Press E → navigates to /level

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(missions): fix lint and TSDoc warnings"
```
