# Mission Templates — Design Spec

**Date:** 2026-04-03
**Status:** Approved

## Overview

Data-driven mission template system for procedural mission generation. Templates define the rules (objective types, param ranges, reward ranges, difficulty tiers) and the generator (separate spec) creates concrete missions at runtime by picking an asteroid, rolling values from the ranges, and placing waypoints.

A **mission** is a contract to go to a specific asteroid. Each mission has one or more **objectives** (GATHER, EXTERMINATE, RESCUE) mapped to **waypoints** on the asteroid surface. Missions can mix objective types — e.g. clear a bug nest then mine the deposit it was blocking.

All code lives in `src/lib/missions/` (pure TypeScript, no framework deps). Templates live in `src/data/missions/` as JSON files, imported statically by Vite.

## Mission Hierarchy

```
Mission (generated at runtime — NOT in this spec)
├── asteroid: which asteroid to go to
├── objectives: ObjectiveInstance[]
│   ├── Objective 1: GATHER 100kg Olivine at waypoint A
│   ├── Objective 2: EXTERMINATE 2 nests at waypoint B
│   └── Objective 3: RESCUE 1 colonist at waypoint C
└── rewards: per-objective credits + completion bonus
```

The gameplay loop per mission: undock from shuttle → navigate asteroid surface in 3D → land at waypoint → complete objective → lift off → next waypoint → ... → return to shuttle.

## Scope

This spec covers **mission templates only** — the data model for defining mission generation rules. Out of scope: mission state machine, mission generator, waypoint placement, asteroid selection logic.

## Data Model

All interfaces in `src/lib/missions/types.ts`.

### ObjectiveType

```ts
type ObjectiveType = 'gather' | 'exterminate' | 'rescue'
```

### NumberRange

```ts
interface NumberRange {
  min: number
  max: number
}
```

A simple range for procedural generation. The generator interpolates within this range based on difficulty. Most ranges have `min <= max`, except `oxygenTime` which intentionally decreases with difficulty (`min: 120, max: 30` means easy=120s, hard=30s).

### ScalableParams

Per-objective-type parameters that scale with difficulty. Templates define min/max ranges; the generator interpolates.

```ts
interface GatherScalableParams {
  type: 'gather'
  resourceAmount: NumberRange  // kg to collect at waypoint
}

interface ExterminateScalableParams {
  type: 'exterminate'
  nestCount: NumberRange       // nests to destroy at this waypoint
  swarmSize: NumberRange       // crawlers per nest
  spitterChance: number        // 0-1, probability spitters are present
}

interface RescueScalableParams {
  type: 'rescue'
  colonistCount: NumberRange   // people to extract
  oxygenTime: NumberRange      // seconds before colonists die (INVERTED: decreases with difficulty)
  guardedChance: number        // 0-1, probability of bug guards at cocoon site
}

type ScalableParams = GatherScalableParams | ExterminateScalableParams | RescueScalableParams
```

**Note on GATHER:** The `mineralName` is NOT in the template. The generator picks a valid mineral from the target asteroid's composition at runtime. The template only defines how much to collect.

### ObjectiveSlot

Defines a slot in a mission template that the generator fills with a concrete objective.

```ts
interface ObjectiveSlot {
  type: ObjectiveType          // which objective type this slot generates
  weight: number               // probability weight when template has multiple slot options
  params: ScalableParams       // min/max ranges that scale with difficulty
  reward: NumberRange           // credit payout range for this objective
}
```

### MissionTemplate

Top-level template definition. Loaded from JSON.

```ts
interface MissionTemplate {
  id: string                          // unique key, e.g. "mining_contract"
  name: string                        // display name, e.g. "Mining Contract"
  description: string                 // flavor text for mission board
  minDifficulty: number               // 1-10, minimum difficulty this template appears at
  maxDifficulty: number               // 1-10, maximum difficulty
  objectiveSlots: ObjectiveSlot[]     // defines what objectives can be generated
  completionBonus: NumberRange        // credits bonus range for finishing ALL objectives
}
```

## File Layout

```
src/lib/missions/
  types.ts                — all interfaces and ObjectiveType
  templates.ts            — loads JSON, validates, exports typed MissionTemplate[]

src/data/missions/
  mining-contract.json          — pure GATHER objectives
  pest-control.json             — pure EXTERMINATE objectives
  search-and-rescue.json        — pure RESCUE objectives
  hazard-cleanup.json           — mixed: EXTERMINATE + GATHER
  colony-relief.json            — mixed: EXTERMINATE + RESCUE

src/lib/missions/__tests__/
  templates.spec.ts
```

### templates.ts behavior

- Imports all 5 JSON files via Vite static import
- Exports `MISSION_TEMPLATES: MissionTemplate[]` — all 5 templates
- Exports `getTemplateById(id: string): MissionTemplate | undefined`
- Exports `getTemplatesForDifficulty(difficulty: number): MissionTemplate[]` — returns templates whose `minDifficulty <= difficulty <= maxDifficulty`

## The 5 Templates

### 1. Mining Contract (`mining_contract`)

Pure GATHER. The bread and butter.

- **Difficulty:** 1–10 (available at all levels)
- **Objective slots:** 1–3 GATHER slots
  - `resourceAmount`: 50–500 kg (scales up with difficulty)
  - Reward per objective: 500–3000 credits
- **Completion bonus:** 200–1500 credits
- **Description:** "Standard resource extraction contract. Land at marked deposits, drill, deliver."

### 2. Pest Control (`pest_control`)

Pure EXTERMINATE. Bug clearing.

- **Difficulty:** 2–10 (not available at easiest)
- **Objective slots:** 1–4 EXTERMINATE slots
  - `nestCount`: 1–5 nests
  - `swarmSize`: 3–12 crawlers per nest
  - `spitterChance`: 0.0–0.8 (scales with difficulty)
  - Reward per objective: 800–4000 credits
- **Completion bonus:** 500–2500 credits
- **Description:** "Bug infestation reported. Clear all nests before mining operations can resume."

### 3. Search and Rescue (`search_and_rescue`)

Pure RESCUE. Extract colonists.

- **Difficulty:** 3–10 (harder baseline)
- **Objective slots:** 1–3 RESCUE slots
  - `colonistCount`: 1–4 colonists
  - `oxygenTime`: 120–30 seconds (decreases with difficulty)
  - `guardedChance`: 0.0–0.7
  - Reward per objective: 1000–5000 credits
- **Completion bonus:** 800–3000 credits
- **Description:** "Distress signal received. Colonists trapped in alien cocoons. Time-sensitive extraction."

### 4. Hazard Cleanup (`hazard_cleanup`)

Mixed: EXTERMINATE then GATHER. Clear the bugs blocking the deposits.

- **Difficulty:** 3–10
- **Objective slots:**
  - 1–2 EXTERMINATE slots (clear the area)
  - 1–2 GATHER slots (mine the now-accessible deposits)
- **Completion bonus:** 600–3500 credits
- **Description:** "Mining site overrun. Clear hostile fauna, then extract resources from secured deposits."

### 5. Colony Relief (`colony_relief`)

Mixed: EXTERMINATE + RESCUE. The most intense template.

- **Difficulty:** 5–10 (mid-to-hard only)
- **Objective slots:**
  - 1–3 EXTERMINATE slots (clear the bugs)
  - 1–2 RESCUE slots (extract survivors)
- **Completion bonus:** 1000–5000 credits
- **Description:** "Colony under siege. Neutralize infestation and extract surviving personnel. Expect heavy resistance."

## Testing Plan

All tests in `src/lib/missions/__tests__/templates.spec.ts`.

### Template validation
- All 5 templates load with unique IDs
- All templates have non-empty `name`, `description`
- `minDifficulty <= maxDifficulty` for each template
- `minDifficulty >= 1` and `maxDifficulty <= 10`

### Objective slot validation
- All slots have a valid `type` (`gather`, `exterminate`, or `rescue`)
- All `weight` values are positive
- All `reward` ranges have `min > 0` and `min <= max`
- `completionBonus` ranges have `min > 0` and `min <= max`

### ScalableParams validation
- GATHER: `resourceAmount.min <= resourceAmount.max`, both positive
- EXTERMINATE: `nestCount` and `swarmSize` ranges valid (min <= max, positive), `spitterChance` in 0-1
- RESCUE: `colonistCount` range valid, `oxygenTime.min > oxygenTime.max` (intentionally inverted), `guardedChance` in 0-1

### Lookup functions
- `getTemplateById` returns correct template for known ID, `undefined` for unknown
- `getTemplatesForDifficulty(1)` returns only templates with `minDifficulty <= 1`
- `getTemplatesForDifficulty(5)` returns all 5 templates
- `getTemplatesForDifficulty(10)` returns all templates with `maxDifficulty >= 10`
