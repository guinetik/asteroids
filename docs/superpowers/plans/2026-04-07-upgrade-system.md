# Upgrade System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6-upgrade hardcoded system with 26 data-driven upgrades across 4 categories (shuttle, lander, multitool, suit), each with levels 0–3 and linear cost scaling.

**Architecture:** Upgrade definitions move from TypeScript constants to `src/data/upgrades.json`. The resolver module (`src/lib/upgrades.ts`) loads from JSON, adds a cost function, and exports the same `getUpgradeValue`/`getCurrentUpgradeValue` API. All consumers update to new IDs. Four orphaned upgrade items are removed from inventory.

**Tech Stack:** TypeScript, Vitest, Vite JSON imports

**Spec:** `docs/superpowers/specs/2026-04-07-upgrade-system-design.md`

---

### Task 1: Create upgrade data JSON

**Files:**
- Create: `src/data/upgrades.json`

- [ ] **Step 1: Create the JSON data file**

Create `src/data/upgrades.json` with all 26 upgrade definitions:

```json
[
  {
    "id": "shuttleThrusterEfficiency",
    "category": "shuttle",
    "label": "Thruster Efficiency",
    "description": "Optimized fuel injectors reduce thruster fuel consumption.",
    "baseCost": 500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.75, 0.5, 0.25]
  },
  {
    "id": "shuttleThrusterCharge",
    "category": "shuttle",
    "label": "Thruster Charge",
    "description": "Improved capacitors accelerate thruster recharge rate.",
    "baseCost": 500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.5, 2.0, 2.5]
  },
  {
    "id": "shuttleThrusterSpeed",
    "category": "shuttle",
    "label": "Thruster Speed",
    "description": "Overclocked thrust nozzles increase top boost speed.",
    "baseCost": 750,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.25, 1.5, 1.75]
  },
  {
    "id": "shuttleSystemsEfficiency",
    "category": "shuttle",
    "label": "Efficient Systems",
    "description": "Low-power avionics reduce passive fuel drain.",
    "baseCost": 600,
    "maxLevel": 3,
    "valuesByLevel": [3.0, 2.0, 1.0, 0.0]
  },
  {
    "id": "shuttleHull",
    "category": "shuttle",
    "label": "Hull Upgrade",
    "description": "Reinforced hull plating absorbs more impact damage.",
    "baseCost": 1000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "shuttleHeatResistance",
    "category": "shuttle",
    "label": "Heat Shield",
    "description": "Ablative coating reduces thermal damage near stars.",
    "baseCost": 5000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.7, 0.45, 0.25]
  },
  {
    "id": "shuttleFreezeResistance",
    "category": "shuttle",
    "label": "Cryo Insulation",
    "description": "Thermal lining resists cryogenic damage in deep space.",
    "baseCost": 5000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.7, 0.45, 0.25]
  },
  {
    "id": "shuttleRadiationResistance",
    "category": "shuttle",
    "label": "Radiation Shielding",
    "description": "Lead-lined compartments deflect ionizing radiation.",
    "baseCost": 6000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.7, 0.45, 0.25]
  },
  {
    "id": "shuttleCargoBay",
    "category": "shuttle",
    "label": "Cargo Bay Expansion",
    "description": "Modular cargo frame increases carrying capacity.",
    "baseCost": 1500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "shuttleFuelCapacity",
    "category": "shuttle",
    "label": "Fuel Tank Expansion",
    "description": "Auxiliary fuel bladder extends operational range.",
    "baseCost": 1200,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "shuttleScienceStation",
    "category": "shuttle",
    "label": "Science Station",
    "description": "Onboard lab boosts CR earnings on mission completion.",
    "baseCost": 2000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.25, 1.5, 1.75]
  },
  {
    "id": "landerThrusterEfficiency",
    "category": "lander",
    "label": "Thruster Efficiency",
    "description": "Refined propellant mix lowers fuel burn per thrust.",
    "baseCost": 500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.75, 0.5, 0.25]
  },
  {
    "id": "landerThrusterCharge",
    "category": "lander",
    "label": "Thruster Charge",
    "description": "Faster thruster recharge between burn cycles.",
    "baseCost": 500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.5, 2.0, 2.5]
  },
  {
    "id": "landerThrusterSpeed",
    "category": "lander",
    "label": "Thruster Power",
    "description": "Upgraded engine bells deliver more thrust force.",
    "baseCost": 750,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.25, 1.5, 1.75]
  },
  {
    "id": "landerHull",
    "category": "lander",
    "label": "Hull Upgrade",
    "description": "Impact-resistant frame survives harder landings.",
    "baseCost": 5000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "landerFuelCapacity",
    "category": "lander",
    "label": "Fuel Tank Expansion",
    "description": "Extended fuel reservoir for longer surface operations.",
    "baseCost": 1000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "multitoolEfficiency",
    "category": "multitool",
    "label": "Instrument Efficiency",
    "description": "Power-saving circuits reduce RTG fuel consumption.",
    "baseCost": 600,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.75, 0.5, 0.25]
  },
  {
    "id": "multitoolDamage",
    "category": "multitool",
    "label": "Damage Output",
    "description": "Amplified emitter deals more damage to targets.",
    "baseCost": 1000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "multitoolRtgCapacity",
    "category": "multitool",
    "label": "RTG Capacity",
    "description": "Larger radioisotope core stores more charge.",
    "baseCost": 1200,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "multitoolRtgCharge",
    "category": "multitool",
    "label": "RTG Charge Boost",
    "description": "Each random charge pickup restores more energy.",
    "baseCost": 800,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "multitoolScience",
    "category": "multitool",
    "label": "Science Upgrade",
    "description": "Enhanced sensors boost CR earnings on mission completion.",
    "baseCost": 2000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.25, 1.5, 1.75]
  },
  {
    "id": "suitArmor",
    "category": "suit",
    "label": "Suit Armor",
    "description": "Hardened exosuit plating increases hit points.",
    "baseCost": 1500,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "suitStaminaCapacity",
    "category": "suit",
    "label": "Stamina Capacity",
    "description": "Muscle-assist servos extend sprint duration.",
    "baseCost": 600,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "suitStaminaEfficiency",
    "category": "suit",
    "label": "Stamina Efficiency",
    "description": "Efficient rebreather uses less O2 to recharge stamina.",
    "baseCost": 800,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 0.75, 0.5, 0.25]
  },
  {
    "id": "suitO2Capacity",
    "category": "suit",
    "label": "O2 Capacity",
    "description": "High-pressure tanks carry more breathable oxygen.",
    "baseCost": 5000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.35, 1.65, 2.0]
  },
  {
    "id": "suitMobility",
    "category": "suit",
    "label": "Mobility Upgrade",
    "description": "Low-friction joints improve walk speed, sprint speed, and jump distance.",
    "baseCost": 1000,
    "maxLevel": 3,
    "valuesByLevel": [1.0, 1.15, 1.35, 1.5]
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add src/data/upgrades.json
git commit -m "data: add 26 upgrade definitions JSON"
```

---

### Task 2: Rewrite upgrades.ts to load from JSON

**Files:**
- Modify: `src/lib/upgrades.ts` (full rewrite)
- Test: `src/lib/__tests__/upgrades.spec.ts` (full rewrite)

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/__tests__/upgrades.spec.ts` entirely:

```ts
/**
 * Tests for data-driven upgrade definitions and value resolution.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  UPGRADE_DEFINITIONS,
  CURRENT_PLAYER_UPGRADE_LEVELS,
  getUpgradeValue,
  getCurrentUpgradeValue,
  getUpgradeCost,
  getUpgradesByCategory,
  getShuttleThrusterEfficiencyModifiers,
  getCurrentShuttleThrusterEfficiencyModifiers,
} from '../upgrades'
import type { UpgradeId } from '../upgrades'

/** Total number of upgrades defined in the JSON. */
const EXPECTED_UPGRADE_COUNT = 26

describe('UPGRADE_DEFINITIONS', () => {
  it('loads all 26 upgrades from JSON', () => {
    const ids = Object.keys(UPGRADE_DEFINITIONS)
    expect(ids).toHaveLength(EXPECTED_UPGRADE_COUNT)
  })

  it('every definition has id matching its key', () => {
    for (const [key, def] of Object.entries(UPGRADE_DEFINITIONS)) {
      expect(def.id).toBe(key)
    }
  })

  it('every definition has category, label, description, baseCost', () => {
    for (const def of Object.values(UPGRADE_DEFINITIONS)) {
      expect(['shuttle', 'lander', 'multitool', 'suit']).toContain(def.category)
      expect(def.label).toBeTruthy()
      expect(def.description).toBeTruthy()
      expect(def.baseCost).toBeGreaterThan(0)
    }
  })

  it('valuesByLevel length equals maxLevel + 1', () => {
    for (const def of Object.values(UPGRADE_DEFINITIONS)) {
      expect(def.valuesByLevel).toHaveLength(def.maxLevel + 1)
    }
  })
})

describe('CURRENT_PLAYER_UPGRADE_LEVELS', () => {
  it('initializes all 26 upgrades to level 0', () => {
    const keys = Object.keys(CURRENT_PLAYER_UPGRADE_LEVELS)
    expect(keys).toHaveLength(EXPECTED_UPGRADE_COUNT)
    for (const level of Object.values(CURRENT_PLAYER_UPGRADE_LEVELS)) {
      expect(level).toBe(0)
    }
  })
})

describe('getUpgradeValue', () => {
  it('resolves shuttle systems efficiency by level', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 0 })).toBe(3)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 1 })).toBe(2)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 2 })).toBe(1)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 3 })).toBe(0)
  })

  it('defaults missing upgrade state to level 0', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', {})).toBe(3)
  })

  it('clamps levels above the upgrade max', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 99 })).toBe(0)
  })

  it('resolves shuttle thruster efficiency multiplier', () => {
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 0 })).toBe(1)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 1 })).toBe(0.75)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 2 })).toBe(0.5)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 3 })).toBe(0.25)
  })
})

describe('getCurrentUpgradeValue', () => {
  it('resolves from current player state (all level 0)', () => {
    expect(getCurrentUpgradeValue('shuttleSystemsEfficiency')).toBe(3)
    expect(getCurrentUpgradeValue('shuttleThrusterEfficiency')).toBe(1)
    expect(getCurrentUpgradeValue('shuttleHeatResistance')).toBe(1)
  })
})

describe('getUpgradeCost', () => {
  it('returns baseCost * level', () => {
    expect(getUpgradeCost('shuttleThrusterEfficiency', 1)).toBe(500)
    expect(getUpgradeCost('shuttleThrusterEfficiency', 2)).toBe(1000)
    expect(getUpgradeCost('shuttleThrusterEfficiency', 3)).toBe(1500)
  })

  it('returns 0 for level 0', () => {
    expect(getUpgradeCost('shuttleThrusterEfficiency', 0)).toBe(0)
  })

  it('works for late-game upgrades with high base cost', () => {
    expect(getUpgradeCost('shuttleRadiationResistance', 1)).toBe(6000)
    expect(getUpgradeCost('shuttleRadiationResistance', 3)).toBe(18000)
  })
})

describe('getUpgradesByCategory', () => {
  it('returns 11 shuttle upgrades', () => {
    expect(getUpgradesByCategory('shuttle')).toHaveLength(11)
  })

  it('returns 5 lander upgrades', () => {
    expect(getUpgradesByCategory('lander')).toHaveLength(5)
  })

  it('returns 5 multitool upgrades', () => {
    expect(getUpgradesByCategory('multitool')).toHaveLength(5)
  })

  it('returns 5 suit upgrades', () => {
    expect(getUpgradesByCategory('suit')).toHaveLength(5)
  })
})

describe('getShuttleThrusterEfficiencyModifiers', () => {
  it('returns unified multiplier for all three thruster groups', () => {
    expect(getShuttleThrusterEfficiencyModifiers({
      shuttleThrusterEfficiency: 2,
    })).toEqual({
      thrust: 0.5,
      brake: 0.5,
      rcs: 0.5,
    })
  })

  it('defaults to 1.0 when no upgrades set', () => {
    expect(getCurrentShuttleThrusterEfficiencyModifiers()).toEqual({
      thrust: 1,
      brake: 1,
      rcs: 1,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: FAIL — old exports don't match new test imports.

- [ ] **Step 3: Rewrite upgrades.ts**

Replace `src/lib/upgrades.ts` entirely:

```ts
/**
 * Data-driven upgrade definitions and value resolution.
 *
 * Loads 26 upgrade definitions from JSON across 4 categories
 * (shuttle, lander, multitool, suit). Each upgrade has levels 0-3
 * with numeric values and linear cost scaling.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import upgradesData from '@/data/upgrades.json'

/** Upgrade category for UI grouping. */
export type UpgradeCategory = 'shuttle' | 'lander' | 'multitool' | 'suit'

/** A single upgrade definition loaded from JSON. */
export interface NumericUpgradeDefinition {
  /** Unique upgrade key used by gameplay systems. */
  id: string
  /** Category for UI grouping. */
  category: UpgradeCategory
  /** Display name. */
  label: string
  /** One-line effect description. */
  description: string
  /** CR cost for level 1. Levels 2+ cost baseCost × level. */
  baseCost: number
  /** Highest supported upgrade level. */
  maxLevel: number
  /** Numeric value at each level from 0..maxLevel. */
  valuesByLevel: readonly number[]
}

/** Valid upgrade IDs derived from the JSON data. */
export type UpgradeId =
  | 'shuttleThrusterEfficiency'
  | 'shuttleThrusterCharge'
  | 'shuttleThrusterSpeed'
  | 'shuttleSystemsEfficiency'
  | 'shuttleHull'
  | 'shuttleHeatResistance'
  | 'shuttleFreezeResistance'
  | 'shuttleRadiationResistance'
  | 'shuttleCargoBay'
  | 'shuttleFuelCapacity'
  | 'shuttleScienceStation'
  | 'landerThrusterEfficiency'
  | 'landerThrusterCharge'
  | 'landerThrusterSpeed'
  | 'landerHull'
  | 'landerFuelCapacity'
  | 'multitoolEfficiency'
  | 'multitoolDamage'
  | 'multitoolRtgCapacity'
  | 'multitoolRtgCharge'
  | 'multitoolScience'
  | 'suitArmor'
  | 'suitStaminaCapacity'
  | 'suitStaminaEfficiency'
  | 'suitO2Capacity'
  | 'suitMobility'

/** Runtime player upgrade levels keyed by upgrade id. */
export type UpgradeLevels = Partial<Record<UpgradeId, number>>

/** Build the keyed catalog from the JSON array. */
const definitions = upgradesData as unknown as NumericUpgradeDefinition[]

/** All upgrade definitions keyed by id for O(1) lookup. */
export const UPGRADE_DEFINITIONS: Record<UpgradeId, NumericUpgradeDefinition> =
  Object.fromEntries(definitions.map((d) => [d.id, d])) as Record<UpgradeId, NumericUpgradeDefinition>

/**
 * Current player upgrade levels.
 * All start at 0 — no purchase flow yet.
 */
export const CURRENT_PLAYER_UPGRADE_LEVELS: Record<UpgradeId, number> =
  Object.fromEntries(definitions.map((d) => [d.id, 0])) as Record<UpgradeId, number>

/**
 * Resolve a numeric upgrade value from arbitrary runtime levels.
 *
 * @param upgradeId - Upgrade to resolve.
 * @param levels - Runtime upgrade level state.
 * @returns Numeric value for the resolved upgrade level.
 */
export function getUpgradeValue(upgradeId: UpgradeId, levels: UpgradeLevels): number {
  const definition = UPGRADE_DEFINITIONS[upgradeId]
  const rawLevel = levels[upgradeId] ?? 0
  const level = Math.max(0, Math.min(definition.maxLevel, rawLevel))
  return definition.valuesByLevel[level] ?? definition.valuesByLevel[0]!
}

/**
 * Resolve a numeric upgrade value from the current player state.
 *
 * @param upgradeId - Upgrade to resolve.
 * @returns Numeric value for the player's current upgrade level.
 */
export function getCurrentUpgradeValue(upgradeId: UpgradeId): number {
  return getUpgradeValue(upgradeId, CURRENT_PLAYER_UPGRADE_LEVELS)
}

/**
 * Compute the CR cost to purchase a specific upgrade level.
 *
 * @param upgradeId - Upgrade to price.
 * @param level - Target level (1, 2, or 3). Level 0 is free (default).
 * @returns CR cost for the requested level.
 */
export function getUpgradeCost(upgradeId: UpgradeId, level: number): number {
  if (level <= 0) return 0
  return UPGRADE_DEFINITIONS[upgradeId].baseCost * level
}

/**
 * Get all upgrade definitions in a given category.
 *
 * @param category - Category to filter by.
 * @returns Array of matching upgrade definitions.
 */
export function getUpgradesByCategory(category: UpgradeCategory): NumericUpgradeDefinition[] {
  return definitions.filter((d) => d.category === category)
}

/** Burn-rate multipliers for shuttle thruster bars. */
export interface ShuttleThrusterEfficiencyModifiers {
  /** Red booster bar drain multiplier. */
  thrust: number
  /** Blue brake bar drain multiplier. */
  brake: number
  /** White RCS bar drain multiplier. */
  rcs: number
}

/**
 * Resolve shuttle thruster burn-rate multipliers from arbitrary upgrade levels.
 * All three groups share the single `shuttleThrusterEfficiency` upgrade.
 *
 * @param levels - Runtime upgrade level state.
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getShuttleThrusterEfficiencyModifiers(
  levels: UpgradeLevels,
): ShuttleThrusterEfficiencyModifiers {
  const m = getUpgradeValue('shuttleThrusterEfficiency', levels)
  return { thrust: m, brake: m, rcs: m }
}

/**
 * Resolve shuttle thruster burn-rate multipliers from current player upgrades.
 *
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getCurrentShuttleThrusterEfficiencyModifiers(): ShuttleThrusterEfficiencyModifiers {
  return getShuttleThrusterEfficiencyModifiers(CURRENT_PLAYER_UPGRADE_LEVELS)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/upgrades.ts src/lib/__tests__/upgrades.spec.ts
git commit -m "feat: rewrite upgrades to load 26 definitions from JSON"
```

---

### Task 3: Update shuttleBaseFuelDrain to new ID

**Files:**
- Modify: `src/lib/shuttleBaseFuelDrain.ts:11` — change upgrade ID constant
- Modify: `src/lib/__tests__/shuttleBaseFuelDrain.spec.ts:26` — update ID assertion

- [ ] **Step 1: Update the test**

In `src/lib/__tests__/shuttleBaseFuelDrain.spec.ts`, change line 26:

```ts
// old
expect(SHUTTLE_FUEL_UPGRADE_ID).toBe('shuttleFuelUpgrade')
// new
expect(SHUTTLE_FUEL_UPGRADE_ID).toBe('shuttleSystemsEfficiency')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/shuttleBaseFuelDrain.spec.ts`
Expected: FAIL on the ID assertion.

- [ ] **Step 3: Update the source**

In `src/lib/shuttleBaseFuelDrain.ts`, change line 11:

```ts
// old
export const SHUTTLE_FUEL_UPGRADE_ID = 'shuttleFuelUpgrade'
// new
export const SHUTTLE_FUEL_UPGRADE_ID = 'shuttleSystemsEfficiency'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/shuttleBaseFuelDrain.spec.ts`
Expected: All PASS (drain rate is still 3 at level 0, same as before).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shuttleBaseFuelDrain.ts src/lib/__tests__/shuttleBaseFuelDrain.spec.ts
git commit -m "refactor: rename shuttleFuelUpgrade to shuttleSystemsEfficiency"
```

---

### Task 4: Update MapViewController to new upgrade IDs

**Files:**
- Modify: `src/views/MapViewController.ts:95,1410-1411`

- [ ] **Step 1: Update the imports**

In `src/views/MapViewController.ts` line 95, the import already brings in the right functions. No import changes needed — `getCurrentShuttleThrusterEfficiencyModifiers`, `getCurrentUpgradeValue`, and `CURRENT_PLAYER_UPGRADE_LEVELS` still exist with the same signatures.

- [ ] **Step 2: Update the heat/armor upgrade IDs**

In `src/views/MapViewController.ts` lines 1410-1411, change:

```ts
// old
getCurrentUpgradeValue('heatShieldResistance'),
getCurrentUpgradeValue('heatShieldArmor'),
// new
getCurrentUpgradeValue('shuttleHeatResistance'),
getCurrentUpgradeValue('shuttleHull'),
```

- [ ] **Step 3: Run type check to verify**

Run: `bun run type-check`
Expected: No errors (the new IDs are valid members of `UpgradeId`).

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "refactor: update MapViewController to new upgrade IDs"
```

---

### Task 5: Update mission difficulty tests

**Files:**
- Modify: `src/lib/missions/__tests__/missionDifficulty.spec.ts` (full rewrite of test data)

The `computeMissionDifficulty` function iterates `Object.keys(UPGRADE_DEFINITIONS)` — now 26 keys instead of 6. The math changes: avg of 26 zeros is still 0 → difficulty 1, avg of 26 threes is still 3 → difficulty 10. Mixed-level tests need new expected values.

- [ ] **Step 1: Rewrite the test file**

Replace `src/lib/missions/__tests__/missionDifficulty.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMissionDifficulty } from '../missionDifficulty'
import { UPGRADE_DEFINITIONS, type UpgradeId, type UpgradeLevels } from '@/lib/upgrades'

/** Helper: set all 26 upgrades to the same level. */
function allAtLevel(level: number): UpgradeLevels {
  const levels: UpgradeLevels = {}
  for (const id of Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]) {
    levels[id] = level
  }
  return levels
}

describe('computeMissionDifficulty', () => {
  it('returns 1 for all level-0 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(0))).toBe(1)
  })

  it('returns 10 for all level-3 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(3))).toBe(10)
  })

  it('returns 4 for all level-1 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(1))).toBe(4)
  })

  it('returns 7 for all level-2 upgrades', () => {
    expect(computeMissionDifficulty(allAtLevel(2))).toBe(7)
  })

  it('handles mixed levels (averages correctly)', () => {
    // 1 upgrade at level 3 out of 26 → avg ≈ 0.115 → floor(0.115/3*9)+1 = 1
    const levels: UpgradeLevels = { shuttleSystemsEfficiency: 3 }
    expect(computeMissionDifficulty(levels)).toBe(1)
  })

  it('handles empty/undefined levels as 0', () => {
    expect(computeMissionDifficulty({})).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test:unit src/lib/missions/__tests__/missionDifficulty.spec.ts`
Expected: All PASS. The `computeMissionDifficulty` function doesn't need changes — it already iterates `Object.keys(UPGRADE_DEFINITIONS)` dynamically.

- [ ] **Step 3: Commit**

```bash
git add src/lib/missions/__tests__/missionDifficulty.spec.ts
git commit -m "test: update mission difficulty tests for 26-upgrade catalog"
```

---

### Task 6: Remove upgrade items from inventory

**Files:**
- Modify: `src/data/inventory/items.json` — remove 4 upgrade items
- Modify: `src/lib/inventory/types.ts:14` — remove `'upgrade'` from `ItemCategory`
- Modify: `src/lib/inventory/catalog.ts:15` — remove `'upgrade'` from `VALID_CATEGORIES`
- Modify: `src/lib/inventory/__tests__/catalog.spec.ts` — update counts, remove upgrade test

- [ ] **Step 1: Update the catalog test**

In `src/lib/inventory/__tests__/catalog.spec.ts`:

1. Line 5 — remove `'upgrade'` from `VALID_CATEGORIES`:
```ts
// old
const VALID_CATEGORIES = new Set<ItemCategory>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good'])
// new
const VALID_CATEGORIES = new Set<ItemCategory>(['mineral', 'consumable', 'equipment', 'trade-good'])
```

2. Line 9 — change item count from 22 to 18:
```ts
// old
expect(Object.keys(ITEM_CATALOG)).toHaveLength(22)
// new
expect(Object.keys(ITEM_CATALOG)).toHaveLength(18)
```

3. Lines 43-49 — remove `|| item.category === 'upgrade'` from the equipment test:
```ts
// old
const nonStackable = Object.values(ITEM_CATALOG).filter(
  (item) => item.category === 'equipment' || item.category === 'upgrade',
)
// new
const nonStackable = Object.values(ITEM_CATALOG).filter(
  (item) => item.category === 'equipment',
)
```

4. Lines 100-106 — delete the entire `'returns only upgrades for upgrade category'` test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/inventory/__tests__/catalog.spec.ts`
Expected: FAIL — item count is still 22, upgrade category still valid.

- [ ] **Step 3: Remove upgrade items from items.json**

In `src/data/inventory/items.json`, remove the 4 objects with `"category": "upgrade"`:
- `thruster-boost` (line 20)
- `hull-reinforcement` (line 21)
- `fuel-tank-expansion` (line 22)
- `cargo-bay-expansion` (line 23)

- [ ] **Step 4: Remove `'upgrade'` from types and catalog**

In `src/lib/inventory/types.ts` line 14:
```ts
// old
export type ItemCategory = 'mineral' | 'upgrade' | 'consumable' | 'equipment' | 'trade-good' | 'mission-material'
// new
export type ItemCategory = 'mineral' | 'consumable' | 'equipment' | 'trade-good' | 'mission-material'
```

In `src/lib/inventory/catalog.ts` line 15:
```ts
// old
const VALID_CATEGORIES = new Set<string>(['mineral', 'upgrade', 'consumable', 'equipment', 'trade-good', 'mission-material'])
// new
const VALID_CATEGORIES = new Set<string>(['mineral', 'consumable', 'equipment', 'trade-good', 'mission-material'])
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test:unit src/lib/inventory/__tests__/catalog.spec.ts`
Expected: All PASS

- [ ] **Step 6: Run full type check**

Run: `bun run type-check`
Expected: No errors. If any file references `'upgrade'` as an `ItemCategory`, it will fail here.

- [ ] **Step 7: Commit**

```bash
git add src/data/inventory/items.json src/lib/inventory/types.ts src/lib/inventory/catalog.ts src/lib/inventory/__tests__/catalog.spec.ts
git commit -m "refactor: remove upgrade items from inventory system"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: No errors (warnings for missing TSDoc on new exports are OK — already covered).

- [ ] **Step 3: Run type check**

Run: `bun run type-check`
Expected: No errors.

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: Build succeeds.
