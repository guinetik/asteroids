# Mission Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement data-driven mission template system with 5 JSON-defined templates covering all 3 objective types and 2 mixed combos.

**Architecture:** Interfaces in `src/lib/missions/types.ts`, JSON templates in `src/data/missions/`, loader in `src/lib/missions/templates.ts`. Follows the same pattern as the asteroid catalog — static Vite imports, validation, typed exports. TDD.

**Tech Stack:** TypeScript, Vitest, Vite static JSON imports.

---

### File Map

- Create: `src/lib/missions/types.ts` — all interfaces and type aliases
- Create: `src/data/missions/mining-contract.json`
- Create: `src/data/missions/pest-control.json`
- Create: `src/data/missions/search-and-rescue.json`
- Create: `src/data/missions/hazard-cleanup.json`
- Create: `src/data/missions/colony-relief.json`
- Create: `src/lib/missions/templates.ts` — loader, validation, exports
- Create: `src/lib/missions/__tests__/templates.spec.ts`

---

### Task 1: Types

**Files:**
- Create: `src/lib/missions/types.ts`

- [ ] **Step 1: Create types file with all interfaces**

```ts
/**
 * Mission template data model.
 *
 * Defines the structure for data-driven mission templates loaded from
 * JSON. Templates define generation rules — objective types, param
 * ranges, reward ranges, difficulty tiers. The generator (separate
 * system) creates concrete missions at runtime.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-mission-templates-design.md
 */

/** The three objective types a mission can contain. */
export type ObjectiveType = 'gather' | 'exterminate' | 'rescue'

/** A min/max range for procedural generation. Generator interpolates based on difficulty. */
export interface NumberRange {
  /** Lower bound (or upper bound for inverted ranges like oxygenTime). */
  min: number
  /** Upper bound (or lower bound for inverted ranges like oxygenTime). */
  max: number
}

/** Scalable params for GATHER objectives. */
export interface GatherScalableParams {
  /** Discriminator for the union type. */
  type: 'gather'
  /** Kilograms of resource to collect at waypoint. Scales up with difficulty. */
  resourceAmount: NumberRange
}

/** Scalable params for EXTERMINATE objectives. */
export interface ExterminateScalableParams {
  /** Discriminator for the union type. */
  type: 'exterminate'
  /** Number of bug nests to destroy at this waypoint. */
  nestCount: NumberRange
  /** Number of crawlers spawned per nest. */
  swarmSize: NumberRange
  /** Probability (0–1) that spitter enemies are present. Scales with difficulty. */
  spitterChance: number
}

/** Scalable params for RESCUE objectives. */
export interface RescueScalableParams {
  /** Discriminator for the union type. */
  type: 'rescue'
  /** Number of colonists to extract from cocoons. */
  colonistCount: NumberRange
  /** Seconds before colonists die. INVERTED: decreases with difficulty (easy=120s, hard=30s). */
  oxygenTime: NumberRange
  /** Probability (0–1) that bugs guard the cocoon site. */
  guardedChance: number
}

/** Union of all objective-specific scalable parameters. */
export type ScalableParams =
  | GatherScalableParams
  | ExterminateScalableParams
  | RescueScalableParams

/** A slot in a mission template that the generator fills with a concrete objective. */
export interface ObjectiveSlot {
  /** Which objective type this slot generates. */
  type: ObjectiveType
  /** Probability weight when the generator picks among multiple slot options. */
  weight: number
  /** Min/max ranges for objective parameters, interpolated by difficulty. */
  params: ScalableParams
  /** Credit payout range for completing this objective. */
  reward: NumberRange
}

/** Top-level mission template loaded from a JSON data file. */
export interface MissionTemplate {
  /** Unique key, e.g. "mining_contract". */
  id: string
  /** Display name for the mission board, e.g. "Mining Contract". */
  name: string
  /** Flavor text shown on the mission board. */
  description: string
  /** Minimum difficulty level (1–10) at which this template can appear. */
  minDifficulty: number
  /** Maximum difficulty level (1–10) at which this template can appear. */
  maxDifficulty: number
  /** Defines what objectives can be generated for this mission. */
  objectiveSlots: ObjectiveSlot[]
  /** Credit bonus range awarded for completing ALL objectives in the mission. */
  completionBonus: NumberRange
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat(missions): add mission template type definitions"
```

---

### Task 2: JSON Data Files — All 5 Templates

**Files:**
- Create: `src/data/missions/mining-contract.json`
- Create: `src/data/missions/pest-control.json`
- Create: `src/data/missions/search-and-rescue.json`
- Create: `src/data/missions/hazard-cleanup.json`
- Create: `src/data/missions/colony-relief.json`

- [ ] **Step 1: Create mining-contract.json**

```json
{
  "id": "mining_contract",
  "name": "Mining Contract",
  "description": "Standard resource extraction contract. Land at marked deposits, drill, deliver.",
  "minDifficulty": 1,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "gather",
      "weight": 1,
      "params": {
        "type": "gather",
        "resourceAmount": { "min": 50, "max": 150 }
      },
      "reward": { "min": 500, "max": 1200 }
    },
    {
      "type": "gather",
      "weight": 0.7,
      "params": {
        "type": "gather",
        "resourceAmount": { "min": 100, "max": 300 }
      },
      "reward": { "min": 800, "max": 2000 }
    },
    {
      "type": "gather",
      "weight": 0.4,
      "params": {
        "type": "gather",
        "resourceAmount": { "min": 200, "max": 500 }
      },
      "reward": { "min": 1500, "max": 3000 }
    }
  ],
  "completionBonus": { "min": 200, "max": 1500 }
}
```

- [ ] **Step 2: Create pest-control.json**

```json
{
  "id": "pest_control",
  "name": "Pest Control",
  "description": "Bug infestation reported. Clear all nests before mining operations can resume.",
  "minDifficulty": 2,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "exterminate",
      "weight": 1,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 1, "max": 2 },
        "swarmSize": { "min": 3, "max": 6 },
        "spitterChance": 0.0
      },
      "reward": { "min": 800, "max": 2000 }
    },
    {
      "type": "exterminate",
      "weight": 0.8,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 2, "max": 4 },
        "swarmSize": { "min": 5, "max": 8 },
        "spitterChance": 0.3
      },
      "reward": { "min": 1500, "max": 3000 }
    },
    {
      "type": "exterminate",
      "weight": 0.5,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 3, "max": 5 },
        "swarmSize": { "min": 6, "max": 10 },
        "spitterChance": 0.5
      },
      "reward": { "min": 2000, "max": 3500 }
    },
    {
      "type": "exterminate",
      "weight": 0.3,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 4, "max": 5 },
        "swarmSize": { "min": 8, "max": 12 },
        "spitterChance": 0.8
      },
      "reward": { "min": 3000, "max": 4000 }
    }
  ],
  "completionBonus": { "min": 500, "max": 2500 }
}
```

- [ ] **Step 3: Create search-and-rescue.json**

```json
{
  "id": "search_and_rescue",
  "name": "Search and Rescue",
  "description": "Distress signal received. Colonists trapped in alien cocoons. Time-sensitive extraction.",
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "rescue",
      "weight": 1,
      "params": {
        "type": "rescue",
        "colonistCount": { "min": 1, "max": 2 },
        "oxygenTime": { "min": 120, "max": 60 },
        "guardedChance": 0.0
      },
      "reward": { "min": 1000, "max": 2500 }
    },
    {
      "type": "rescue",
      "weight": 0.6,
      "params": {
        "type": "rescue",
        "colonistCount": { "min": 2, "max": 3 },
        "oxygenTime": { "min": 90, "max": 45 },
        "guardedChance": 0.3
      },
      "reward": { "min": 2000, "max": 4000 }
    },
    {
      "type": "rescue",
      "weight": 0.3,
      "params": {
        "type": "rescue",
        "colonistCount": { "min": 3, "max": 4 },
        "oxygenTime": { "min": 60, "max": 30 },
        "guardedChance": 0.7
      },
      "reward": { "min": 3500, "max": 5000 }
    }
  ],
  "completionBonus": { "min": 800, "max": 3000 }
}
```

- [ ] **Step 4: Create hazard-cleanup.json**

```json
{
  "id": "hazard_cleanup",
  "name": "Hazard Cleanup",
  "description": "Mining site overrun. Clear hostile fauna, then extract resources from secured deposits.",
  "minDifficulty": 3,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "exterminate",
      "weight": 1,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 1, "max": 3 },
        "swarmSize": { "min": 3, "max": 8 },
        "spitterChance": 0.2
      },
      "reward": { "min": 800, "max": 2500 }
    },
    {
      "type": "exterminate",
      "weight": 0.5,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 2, "max": 4 },
        "swarmSize": { "min": 5, "max": 10 },
        "spitterChance": 0.5
      },
      "reward": { "min": 1200, "max": 3000 }
    },
    {
      "type": "gather",
      "weight": 1,
      "params": {
        "type": "gather",
        "resourceAmount": { "min": 80, "max": 250 }
      },
      "reward": { "min": 600, "max": 2000 }
    },
    {
      "type": "gather",
      "weight": 0.5,
      "params": {
        "type": "gather",
        "resourceAmount": { "min": 150, "max": 400 }
      },
      "reward": { "min": 1000, "max": 2500 }
    }
  ],
  "completionBonus": { "min": 600, "max": 3500 }
}
```

- [ ] **Step 5: Create colony-relief.json**

```json
{
  "id": "colony_relief",
  "name": "Colony Relief",
  "description": "Colony under siege. Neutralize infestation and extract surviving personnel. Expect heavy resistance.",
  "minDifficulty": 5,
  "maxDifficulty": 10,
  "objectiveSlots": [
    {
      "type": "exterminate",
      "weight": 1,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 2, "max": 4 },
        "swarmSize": { "min": 5, "max": 10 },
        "spitterChance": 0.4
      },
      "reward": { "min": 1200, "max": 3000 }
    },
    {
      "type": "exterminate",
      "weight": 0.7,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 3, "max": 5 },
        "swarmSize": { "min": 8, "max": 12 },
        "spitterChance": 0.7
      },
      "reward": { "min": 2000, "max": 4000 }
    },
    {
      "type": "exterminate",
      "weight": 0.4,
      "params": {
        "type": "exterminate",
        "nestCount": { "min": 4, "max": 5 },
        "swarmSize": { "min": 10, "max": 12 },
        "spitterChance": 0.8
      },
      "reward": { "min": 3000, "max": 4000 }
    },
    {
      "type": "rescue",
      "weight": 1,
      "params": {
        "type": "rescue",
        "colonistCount": { "min": 1, "max": 3 },
        "oxygenTime": { "min": 90, "max": 40 },
        "guardedChance": 0.5
      },
      "reward": { "min": 1500, "max": 4000 }
    },
    {
      "type": "rescue",
      "weight": 0.5,
      "params": {
        "type": "rescue",
        "colonistCount": { "min": 2, "max": 4 },
        "oxygenTime": { "min": 60, "max": 30 },
        "guardedChance": 0.7
      },
      "reward": { "min": 3000, "max": 5000 }
    }
  ],
  "completionBonus": { "min": 1000, "max": 5000 }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/data/missions/
git commit -m "feat(missions): add 5 mission template JSON data files"
```

---

### Task 3: Template Loader — Tests First

**Files:**
- Create: `src/lib/missions/__tests__/templates.spec.ts`
- Create: `src/lib/missions/templates.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { MISSION_TEMPLATES, getTemplateById, getTemplatesForDifficulty } from '../templates'
import type { ObjectiveSlot } from '../types'

const VALID_TYPES = new Set(['gather', 'exterminate', 'rescue'])
const DIFFICULTY_MIN = 1
const DIFFICULTY_MAX = 10

describe('MISSION_TEMPLATES', () => {
  it('contains exactly 5 templates', () => {
    expect(MISSION_TEMPLATES).toHaveLength(5)
  })

  it('has unique IDs', () => {
    const ids = MISSION_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has required string fields', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)
    expect(t).toBeDefined()
    expect(t!.name).toBeTruthy()
    expect(t!.description).toBeTruthy()
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid difficulty range', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.minDifficulty).toBeGreaterThanOrEqual(DIFFICULTY_MIN)
    expect(t.maxDifficulty).toBeLessThanOrEqual(DIFFICULTY_MAX)
    expect(t.minDifficulty).toBeLessThanOrEqual(t.maxDifficulty)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid completion bonus', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.completionBonus.min).toBeGreaterThan(0)
    expect(t.completionBonus.min).toBeLessThanOrEqual(t.completionBonus.max)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid objective slots', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.objectiveSlots.length).toBeGreaterThan(0)

    for (const slot of t.objectiveSlots) {
      expect(VALID_TYPES.has(slot.type)).toBe(true)
      expect(slot.weight).toBeGreaterThan(0)
      expect(slot.reward.min).toBeGreaterThan(0)
      expect(slot.reward.min).toBeLessThanOrEqual(slot.reward.max)
      expect(slot.params.type).toBe(slot.type)
    }
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid scalable params', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!

    for (const slot of t.objectiveSlots) {
      if (slot.params.type === 'gather') {
        expect(slot.params.resourceAmount.min).toBeGreaterThan(0)
        expect(slot.params.resourceAmount.min).toBeLessThanOrEqual(
          slot.params.resourceAmount.max,
        )
      } else if (slot.params.type === 'exterminate') {
        expect(slot.params.nestCount.min).toBeGreaterThan(0)
        expect(slot.params.nestCount.min).toBeLessThanOrEqual(slot.params.nestCount.max)
        expect(slot.params.swarmSize.min).toBeGreaterThan(0)
        expect(slot.params.swarmSize.min).toBeLessThanOrEqual(slot.params.swarmSize.max)
        expect(slot.params.spitterChance).toBeGreaterThanOrEqual(0)
        expect(slot.params.spitterChance).toBeLessThanOrEqual(1)
      } else if (slot.params.type === 'rescue') {
        expect(slot.params.colonistCount.min).toBeGreaterThan(0)
        expect(slot.params.colonistCount.min).toBeLessThanOrEqual(
          slot.params.colonistCount.max,
        )
        expect(slot.params.oxygenTime.min).toBeGreaterThan(slot.params.oxygenTime.max)
        expect(slot.params.guardedChance).toBeGreaterThanOrEqual(0)
        expect(slot.params.guardedChance).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('getTemplateById', () => {
  it('returns the correct template for a known ID', () => {
    const t = getTemplateById('mining_contract')
    expect(t).toBeDefined()
    expect(t!.name).toBe('Mining Contract')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined()
  })
})

describe('getTemplatesForDifficulty', () => {
  it('returns only mining_contract at difficulty 1', () => {
    const templates = getTemplatesForDifficulty(1)
    expect(templates).toHaveLength(1)
    expect(templates[0]!.id).toBe('mining_contract')
  })

  it('returns all 5 templates at difficulty 5', () => {
    const templates = getTemplatesForDifficulty(5)
    expect(templates).toHaveLength(5)
  })

  it('returns all templates at difficulty 10', () => {
    const templates = getTemplatesForDifficulty(10)
    expect(templates).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/templates.spec.ts`
Expected: FAIL — cannot import from `../templates`

- [ ] **Step 3: Implement template loader**

```ts
/**
 * Mission template loader.
 *
 * Imports all mission template JSON files at build time via Vite
 * static imports and exports the typed catalog with lookup helpers.
 *
 * @author guinetik
 * @date 2026-04-03
 * @spec docs/superpowers/specs/2026-04-03-mission-templates-design.md
 */
import type { MissionTemplate } from './types'

import miningContractData from '@/data/missions/mining-contract.json'
import pestControlData from '@/data/missions/pest-control.json'
import searchAndRescueData from '@/data/missions/search-and-rescue.json'
import hazardCleanupData from '@/data/missions/hazard-cleanup.json'
import colonyReliefData from '@/data/missions/colony-relief.json'

/** All mission templates, loaded and typed from JSON data files. */
export const MISSION_TEMPLATES: MissionTemplate[] = [
  miningContractData,
  pestControlData,
  searchAndRescueData,
  hazardCleanupData,
  colonyReliefData,
] as unknown as MissionTemplate[]

/** Look up a mission template by its unique ID. Returns `undefined` if not found. */
export function getTemplateById(id: string): MissionTemplate | undefined {
  return MISSION_TEMPLATES.find((t) => t.id === id)
}

/** Get all templates available at a given difficulty level (1–10). */
export function getTemplatesForDifficulty(difficulty: number): MissionTemplate[] {
  return MISSION_TEMPLATES.filter(
    (t) => t.minDifficulty <= difficulty && t.maxDifficulty >= difficulty,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/missions/__tests__/templates.spec.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/templates.ts src/lib/missions/__tests__/templates.spec.ts
git commit -m "feat(missions): add template loader with validation tests"
```

---

### Task 4: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun test:unit --run`
Expected: All tests PASS (portal + asteroids + missions + App.spec.ts)

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: PASS

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: PASS

- [ ] **Step 4: Commit any lint fixes**

If lint auto-fixed anything:
```bash
git add src/lib/missions/ src/data/missions/
git commit -m "style(missions): apply lint fixes"
```
