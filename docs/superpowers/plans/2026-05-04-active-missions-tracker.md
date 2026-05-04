# Active Missions Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a right-hand HUD panel on the solar map listing every active mission, grouped by type, with click-to-focus camera behavior.

**Architecture:** A pure builder converts `ShuttleMissionBoard` snapshots into typed group rows. A presentational Vue component renders them inline in the existing `map-hud-tracker-stack` between the journey and contract trackers. Clicking a row asks `MapViewController` to park the `VehicleCamera` on the row's spatial target; an Esc handler restores follow-target on the shuttle.

**Tech Stack:** Vue 3 SFC, TypeScript strict, Three.js `VehicleCamera.parkAt`/`setTarget`, Vitest + JSDOM.

**Spec:** `docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md`

---

## File Structure

**Create:**
- `src/lib/missions/missionHudRows.ts` — pure builder + types + objective label tables.
- `src/lib/missions/__tests__/missionHudRows.spec.ts` — Vitest coverage.
- `src/components/MissionTrackerPanel.vue` — group/row presentational component.
- `src/components/MissionFocusPrompt.vue` — "ESC — return to ship" overlay.

**Modify:**
- `src/views/MapViewController.ts` — `focusOnMissionTarget` / `clearMissionFocus` / reactive `missionFocusActive` flag, Esc/cancel hooks.
- `src/views/MapView.vue` — import the panel + prompt, wire `focusMission` event, render prompt, route Esc, clear focus on every camera-reparenting flow.

No edits to `ContractTrackerPanel.vue`, `ObjectiveTracker.vue`, `VehicleCamera.ts`, or any mission domain types.

---

## Task 1: Builder types and empty-board test

**Files:**
- Create: `src/lib/missions/missionHudRows.ts`
- Create: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Create the empty module with types and a stub builder**

```ts
// src/lib/missions/missionHudRows.ts
/**
 * Pure builder that converts an active-mission snapshot from
 * {@link ShuttleMissionBoard} into the grouped row data consumed by
 * `MissionTrackerPanel.vue`. Empty groups are omitted.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

import type { ShuttleMissionBoard } from '@/lib/missions/types'

/** Group key — drives section header and row palette. */
export type MissionTrackerGroupKey = 'delivery' | 'asteroid' | 'eva' | 'mining'

/** Spatial focus target for a tracker row. */
export type MissionTrackerFocus =
  | { kind: 'planet'; planetId: string }
  | { kind: 'world'; worldX: number; worldZ: number }

/** A single row inside a tracker group. */
export interface MissionTrackerRow {
  /** Stable id used for v-for keying. */
  id: string
  /** Mission name shown as the row title. */
  title: string
  /** Optional objective-type display label (asteroid/EVA only). */
  objectiveType?: string
  /** Where clicking the row should park the camera. */
  focus: MissionTrackerFocus
}

/** A group rendered as one section. Empty groups are not produced. */
export interface MissionTrackerGroup {
  /** Discriminator used for keys, ordering, and styling hooks. */
  key: MissionTrackerGroupKey
  /** Human label shown as the section eyebrow. */
  title: string
  /** Rows in acceptance order. */
  rows: readonly MissionTrackerRow[]
}

/**
 * Build the ordered list of non-empty mission groups for the HUD tracker.
 *
 * @param board - Current shuttle mission board snapshot.
 * @returns Ordered groups (delivery → asteroid → EVA → mining), empty groups omitted.
 */
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
): readonly MissionTrackerGroup[] {
  void board
  return []
}
```

- [ ] **Step 2: Write the empty-board test**

```ts
// src/lib/missions/__tests__/missionHudRows.spec.ts
/**
 * Tests for {@link buildMissionTrackerGroups}.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import { describe, it, expect } from 'vitest'
import { buildMissionTrackerGroups } from '@/lib/missions/missionHudRows'
import type { ShuttleMissionBoard } from '@/lib/missions/types'

function emptyBoard(): ShuttleMissionBoard {
  return {
    offeredMission: null,
    offeringPlanet: null,
    restockTimer: null,
    activeMissions: [],
    offeredAsteroidMission: null,
    offeringAsteroidPlanet: null,
    activeAsteroidMission: null,
    asteroidRestockTimer: null,
    offeredEvaMission: null,
    offeringEvaPlanet: null,
    evaRestockTimer: null,
    activeEvaMissions: [],
    offeredMiningMission: null,
    offeringMiningPlanet: null,
    miningRestockTimer: null,
    activeMiningMissions: [],
  }
}

describe('buildMissionTrackerGroups', () => {
  it('returns no groups for an empty board', () => {
    expect(buildMissionTrackerGroups(emptyBoard())).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test — should pass**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): scaffold mission tracker row builder"
```

---

## Task 2: Delivery group with status-driven focus

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append to `missionHudRows.spec.ts` inside the existing `describe`:

```ts
import type { ActiveShuttleMission, ShuttleMissionTemplate } from '@/lib/missions/types'

function deliveryTemplate(
  overrides: Partial<ShuttleMissionTemplate> = {},
): ShuttleMissionTemplate {
  return {
    id: 'earth_venus_gas',
    name: 'Venusian Gas Run',
    description: '',
    targetPlanet: 'venus',
    gatherQuantity: 1,
    reward: 100,
    ...overrides,
  }
}

function deliveryActive(
  overrides: Partial<ActiveShuttleMission> = {},
): ActiveShuttleMission {
  return {
    template: deliveryTemplate(),
    giverPlanet: 'earth',
    status: 'active',
    ...overrides,
  }
}

it('produces a delivery group with target-planet focus when status is active', () => {
  const board = emptyBoard()
  board.activeMissions = [deliveryActive()]
  const groups = buildMissionTrackerGroups(board)
  expect(groups).toHaveLength(1)
  const group = groups[0]!
  expect(group.key).toBe('delivery')
  expect(group.title).toBe('Deliveries')
  expect(group.rows).toHaveLength(1)
  const row = group.rows[0]!
  expect(row.title).toBe('Venusian Gas Run')
  expect(row.objectiveType).toBeUndefined()
  expect(row.focus).toEqual({ kind: 'planet', planetId: 'venus' })
})

it('uses giver-planet focus for ready-to-deliver missions', () => {
  const board = emptyBoard()
  board.activeMissions = [deliveryActive({ status: 'ready-to-deliver' })]
  const row = buildMissionTrackerGroups(board)[0]!.rows[0]!
  expect(row.focus).toEqual({ kind: 'planet', planetId: 'earth' })
})

it('keeps delivery rows in acceptance order with stable ids', () => {
  const board = emptyBoard()
  board.activeMissions = [
    deliveryActive({ template: deliveryTemplate({ id: 'a', name: 'A' }) }),
    deliveryActive({ template: deliveryTemplate({ id: 'b', name: 'B' }) }),
  ]
  const rows = buildMissionTrackerGroups(board)[0]!.rows
  expect(rows.map((r) => r.title)).toEqual(['A', 'B'])
  expect(new Set(rows.map((r) => r.id)).size).toBe(2)
})
```

- [ ] **Step 2: Run the tests — should fail**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: 3 failures ("expected length 1, received 0" etc.).

- [ ] **Step 3: Implement the delivery branch**

Replace the body of `buildMissionTrackerGroups` and add helpers:

```ts
import type {
  ActiveShuttleMission,
  ShuttleMissionBoard,
} from '@/lib/missions/types'

/** Section title for the delivery group. */
const DELIVERY_GROUP_TITLE = 'Deliveries'

/**
 * Build the ordered list of non-empty mission groups for the HUD tracker.
 */
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
): readonly MissionTrackerGroup[] {
  const groups: MissionTrackerGroup[] = []

  const deliveryRows = board.activeMissions.map(buildDeliveryRow)
  if (deliveryRows.length > 0) {
    groups.push({ key: 'delivery', title: DELIVERY_GROUP_TITLE, rows: deliveryRows })
  }

  return groups
}

/**
 * Build a tracker row for one delivery mission. Focus follows the player's
 * next destination: the target planet during the gather phase (`active`),
 * the giver planet during the turn-in phase (`ready-to-deliver`).
 */
function buildDeliveryRow(
  mission: ActiveShuttleMission,
  index: number,
): MissionTrackerRow {
  const planetId =
    mission.status === 'ready-to-deliver' ? mission.giverPlanet : mission.template.targetPlanet
  return {
    id: `delivery:${mission.template.id}:${index}`,
    title: mission.template.name,
    focus: { kind: 'planet', planetId },
  }
}
```

- [ ] **Step 4: Run the tests — all pass**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): add delivery group with status-driven focus"
```

---

## Task 3: Asteroid group with objective-type label

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Add the failing tests**

```ts
import type {
  GeneratedAsteroidMission,
  ConcreteObjective,
  ObjectiveType,
} from '@/lib/missions/types'

function objective(type: ObjectiveType): ConcreteObjective {
  return { type, x: 0, z: 0, reward: 0 }
}

function asteroidMission(
  overrides: Partial<GeneratedAsteroidMission> = {},
): GeneratedAsteroidMission {
  return {
    kind: 'standard',
    id: 'belt-survey-001',
    asteroidId: 'bennu',
    giverId: 'jay',
    giverName: 'Jay Mercer',
    templateId: 'mineral_survey',
    name: 'Belt Survey 4A',
    briefing: '',
    difficulty: 3,
    region: 'asteroid-belt',
    objectives: [objective('photometry')],
    totalReward: 0,
    waypoint: { worldX: 1234, worldZ: -567 },
    status: 'accepted',
    ...overrides,
  }
}

it('produces an asteroid group when one mission is active', () => {
  const board = emptyBoard()
  board.activeAsteroidMission = asteroidMission()
  const groups = buildMissionTrackerGroups(board)
  expect(groups.map((g) => g.key)).toEqual(['asteroid'])
  const row = groups[0]!.rows[0]!
  expect(row.title).toBe('Belt Survey 4A')
  expect(row.objectiveType).toBe('Photometry')
  expect(row.focus).toEqual({ kind: 'world', worldX: 1234, worldZ: -567 })
})

it('maps every asteroid objective type to a display label', () => {
  const types: ObjectiveType[] = [
    'gather',
    'exterminate',
    'rescue',
    'survey',
    'photometry',
    'dan',
    'collect',
    'bunker',
    'mineral-analysis',
    'prospectus-terminal',
  ]
  for (const t of types) {
    const board = emptyBoard()
    board.activeAsteroidMission = asteroidMission({ objectives: [objective(t)] })
    const row = buildMissionTrackerGroups(board)[0]!.rows[0]!
    expect(row.objectiveType, `label for ${t}`).toBeTypeOf('string')
    expect(row.objectiveType!.length).toBeGreaterThan(0)
  }
})
```

- [ ] **Step 2: Run — should fail**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: 2 new failures.

- [ ] **Step 3: Implement asteroid branch + label table**

Add to `missionHudRows.ts`:

```ts
import type {
  GeneratedAsteroidMission,
  ObjectiveType,
} from '@/lib/missions/types'

/** Section title for the asteroid group. */
const ASTEROID_GROUP_TITLE = 'Asteroid'

/** Display labels for each asteroid objective discriminant. */
const ASTEROID_OBJECTIVE_LABELS: Record<ObjectiveType, string> = {
  gather: 'Gather',
  exterminate: 'Exterminate',
  rescue: 'Rescue',
  survey: 'Survey',
  photometry: 'Photometry',
  dan: 'DAN Survey',
  collect: 'Collect',
  bunker: 'Bunker Defense',
  'mineral-analysis': 'Mineral Analysis',
  'prospectus-terminal': 'Prospectus',
}

/**
 * Build a tracker row for the active asteroid mission. The first objective's
 * type drives the display label — multi-objective missions surface their
 * leading objective for the at-a-glance HUD.
 */
function buildAsteroidRow(mission: GeneratedAsteroidMission): MissionTrackerRow {
  const first = mission.objectives[0]
  const objectiveType = first ? ASTEROID_OBJECTIVE_LABELS[first.type] : undefined
  return {
    id: `asteroid:${mission.id}`,
    title: mission.name,
    objectiveType,
    focus: {
      kind: 'world',
      worldX: mission.waypoint.worldX,
      worldZ: mission.waypoint.worldZ,
    },
  }
}
```

And extend the public builder:

```ts
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
): readonly MissionTrackerGroup[] {
  const groups: MissionTrackerGroup[] = []

  const deliveryRows = board.activeMissions.map(buildDeliveryRow)
  if (deliveryRows.length > 0) {
    groups.push({ key: 'delivery', title: DELIVERY_GROUP_TITLE, rows: deliveryRows })
  }

  if (board.activeAsteroidMission) {
    groups.push({
      key: 'asteroid',
      title: ASTEROID_GROUP_TITLE,
      rows: [buildAsteroidRow(board.activeAsteroidMission)],
    })
  }

  return groups
}
```

- [ ] **Step 4: Run — all pass**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): add asteroid mission group with objective label"
```

---

## Task 4: EVA group with `poiType` label

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Add the failing tests**

```ts
import type {
  ActiveVisitRelayMission,
  EvaMissionPoiType,
  VisitRelayShuttleMissionTemplate,
} from '@/lib/missions/types'

function evaTemplate(
  overrides: Partial<VisitRelayShuttleMissionTemplate> = {},
): VisitRelayShuttleMissionTemplate {
  return {
    id: 'earth_relay_tx4',
    name: 'TX-4 Reboot',
    description: '',
    poiType: 'relay_antenna',
    minigameType: 'relay_repair',
    reward: 200,
    ...overrides,
  }
}

function evaActive(
  overrides: Partial<ActiveVisitRelayMission> = {},
): ActiveVisitRelayMission {
  return {
    template: evaTemplate(),
    giverPlanet: 'earth',
    waypoint: { worldX: 50, worldZ: 75, poiLocalY: 5 },
    status: 'active',
    ...overrides,
  }
}

it('produces an EVA row with waypoint focus and poiType label', () => {
  const board = emptyBoard()
  board.activeEvaMissions = [evaActive()]
  const group = buildMissionTrackerGroups(board)[0]!
  expect(group.key).toBe('eva')
  const row = group.rows[0]!
  expect(row.title).toBe('TX-4 Reboot')
  expect(row.objectiveType).toBe('Relay Repair')
  expect(row.focus).toEqual({ kind: 'world', worldX: 50, worldZ: 75 })
})

it.each<[EvaMissionPoiType, string]>([
  ['satellite', 'Satellite Servicing'],
  ['relay_antenna', 'Relay Repair'],
  ['telescope', 'Telescope'],
])('maps EVA poiType %s to label %s', (poiType, label) => {
  const board = emptyBoard()
  board.activeEvaMissions = [evaActive({ template: evaTemplate({ poiType }) })]
  expect(buildMissionTrackerGroups(board)[0]!.rows[0]!.objectiveType).toBe(label)
})
```

- [ ] **Step 2: Run — should fail**

Expected: 4 new failures.

- [ ] **Step 3: Implement EVA branch + label table**

Add to `missionHudRows.ts`:

```ts
import type {
  ActiveVisitRelayMission,
  EvaMissionPoiType,
} from '@/lib/missions/types'

/** Section title for the EVA group. */
const EVA_GROUP_TITLE = 'EVA'

/** Display labels for each EVA POI type. */
const EVA_POI_LABELS: Record<EvaMissionPoiType, string> = {
  satellite: 'Satellite Servicing',
  relay_antenna: 'Relay Repair',
  telescope: 'Telescope',
}

/**
 * Build a tracker row for one active EVA visit-relay mission. Camera focus
 * uses the snapshotted XZ waypoint (the Y-axis offset only matters during
 * EVA egress, not for the orbital map view).
 */
function buildEvaRow(mission: ActiveVisitRelayMission, index: number): MissionTrackerRow {
  return {
    id: `eva:${mission.template.id}:${index}`,
    title: mission.template.name,
    objectiveType: EVA_POI_LABELS[mission.template.poiType],
    focus: {
      kind: 'world',
      worldX: mission.waypoint.worldX,
      worldZ: mission.waypoint.worldZ,
    },
  }
}
```

And extend the public builder before `return groups`:

```ts
const evaRows = board.activeEvaMissions.map(buildEvaRow)
if (evaRows.length > 0) {
  groups.push({ key: 'eva', title: EVA_GROUP_TITLE, rows: evaRows })
}
```

- [ ] **Step 4: Run — all pass**

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): add EVA mission group with poiType label"
```

---

## Task 5: Mining group with giver-planet focus

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Add the failing tests**

```ts
import type {
  ActiveTurretMiningMission,
  TurretMiningMissionTemplate,
} from '@/lib/missions/types'

function miningTemplate(
  overrides: Partial<TurretMiningMissionTemplate> = {},
): TurretMiningMissionTemplate {
  return {
    id: 'mars_olivine_plating',
    name: 'Olivine Plating',
    description: '',
    difficulty: 'easy',
    oreCategory: 'olivine',
    targetKg: 100,
    reward: 500,
    ...overrides,
  }
}

function miningActive(
  overrides: Partial<ActiveTurretMiningMission> = {},
): ActiveTurretMiningMission {
  return { template: miningTemplate(), giverPlanet: 'mars', ...overrides }
}

it('produces a mining row that focuses the giver planet (no waypoint, no objective label)', () => {
  const board = emptyBoard()
  board.activeMiningMissions = [miningActive()]
  const group = buildMissionTrackerGroups(board)[0]!
  expect(group.key).toBe('mining')
  expect(group.title).toBe('Mining')
  const row = group.rows[0]!
  expect(row.title).toBe('Olivine Plating')
  expect(row.objectiveType).toBeUndefined()
  expect(row.focus).toEqual({ kind: 'planet', planetId: 'mars' })
})

it('returns groups in fixed order delivery → asteroid → eva → mining', () => {
  const board = emptyBoard()
  board.activeMissions = [deliveryActive()]
  board.activeAsteroidMission = asteroidMission()
  board.activeEvaMissions = [evaActive()]
  board.activeMiningMissions = [miningActive()]
  expect(buildMissionTrackerGroups(board).map((g) => g.key)).toEqual([
    'delivery',
    'asteroid',
    'eva',
    'mining',
  ])
})

it('hides empty groups (only EVA active → only EVA group returned)', () => {
  const board = emptyBoard()
  board.activeEvaMissions = [evaActive()]
  expect(buildMissionTrackerGroups(board).map((g) => g.key)).toEqual(['eva'])
})
```

- [ ] **Step 2: Run — should fail**

Expected: 3 new failures.

- [ ] **Step 3: Implement mining branch**

Add to `missionHudRows.ts`:

```ts
import type { ActiveTurretMiningMission } from '@/lib/missions/types'

/** Section title for the mining group. */
const MINING_GROUP_TITLE = 'Mining'

/**
 * Build a tracker row for one active turret mining mission. Mining missions
 * have no spatial waypoint — the player roams the belt with a turret-equipped
 * shuttle and returns to the giver to deliver — so focus targets the giver
 * planet itself.
 */
function buildMiningRow(
  mission: ActiveTurretMiningMission,
  index: number,
): MissionTrackerRow {
  return {
    id: `mining:${mission.template.id}:${index}`,
    title: mission.template.name,
    focus: { kind: 'planet', planetId: mission.giverPlanet },
  }
}
```

And extend the public builder before `return groups`:

```ts
const miningRows = board.activeMiningMissions.map(buildMiningRow)
if (miningRows.length > 0) {
  groups.push({ key: 'mining', title: MINING_GROUP_TITLE, rows: miningRows })
}
```

- [ ] **Step 4: Run — all pass**

Expected: 13 passed.

- [ ] **Step 5: Verify lint and type-check on the new module**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): add mining group and finalize tracker builder"
```

---

## Task 6: `MissionTrackerPanel.vue` component

**Files:**
- Create: `src/components/MissionTrackerPanel.vue`

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
/**
 * Right-hand HUD panel listing all active missions on the solar map,
 * grouped by mission type. Empty groups are hidden by the upstream
 * builder; this component just renders what it's given. Clicking a row
 * emits {@link MissionTrackerRow} so the parent can park the camera on
 * the row's focus target.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */
import type {
  MissionTrackerGroup,
  MissionTrackerRow,
} from '@/lib/missions/missionHudRows'

defineProps<{
  /** Groups produced by {@link buildMissionTrackerGroups}. */
  groups: readonly MissionTrackerGroup[]
}>()

const emit = defineEmits<{
  /** Parent should park the camera on the row's focus. */
  focusMission: [row: MissionTrackerRow]
}>()

/** Landmark label for assistive tech. */
const MISSION_TRACKER_ARIA_LABEL = 'Active missions'

/**
 * Forward a click to the parent. Kept as a tiny helper so the template
 * stays readable.
 */
function emitFocus(row: MissionTrackerRow): void {
  emit('focusMission', row)
}
</script>

<template>
  <section
    v-if="groups.length > 0"
    class="mission-tracker-panel"
    :aria-label="MISSION_TRACKER_ARIA_LABEL"
    role="region"
  >
    <header class="mission-tracker-panel__header">
      <span class="mission-tracker-panel__eyebrow">Missions</span>
    </header>
    <div
      v-for="group in groups"
      :key="group.key"
      class="mission-tracker-panel__group"
    >
      <span class="mission-tracker-panel__group-title">{{ group.title }}</span>
      <ul class="mission-tracker-panel__list">
        <li
          v-for="row in group.rows"
          :key="row.id"
          class="mission-tracker-panel__item"
        >
          <button
            type="button"
            class="mission-tracker-panel__row-btn"
            @click="emitFocus(row)"
          >
            <span class="mission-tracker-panel__row-title">{{ row.title }}</span>
            <span
              v-if="row.objectiveType"
              class="mission-tracker-panel__row-objective"
            >
              {{ row.objectiveType }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style>
.mission-tracker-panel {
  --tracker-bg: rgba(0, 10, 15, 0.5);
  --tracker-border: rgba(0, 255, 204, 0.15);
  --tracker-border-soft: rgba(0, 255, 204, 0.1);
  --tracker-eyebrow: rgba(0, 255, 204, 0.4);
  --tracker-title: rgba(0, 255, 204, 0.8);
  --tracker-text-bright: rgba(255, 255, 255, 0.85);
  --tracker-accent: rgba(0, 255, 204, 0.5);
  --tracker-accent-strong: rgba(0, 255, 204, 0.95);

  pointer-events: auto;
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--tracker-bg);
  border: 1px solid var(--tracker-border);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.mission-tracker-panel__header {
  border-bottom: 1px solid var(--tracker-border);
  padding-bottom: 0.35rem;
}

.mission-tracker-panel__eyebrow {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.mission-tracker-panel__group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mission-tracker-panel__group-title {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--tracker-eyebrow);
}

.mission-tracker-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-left: 1px solid var(--tracker-border-soft);
  padding-left: 0.6rem;
  margin-left: 0.2rem;
}

.mission-tracker-panel__row-btn {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  border: none;
  background: transparent;
  padding: 0.2rem 0;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s ease;
}

.mission-tracker-panel__row-btn:hover .mission-tracker-panel__row-title {
  color: var(--tracker-accent-strong);
}

.mission-tracker-panel__row-title {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tracker-text-bright);
}

.mission-tracker-panel__row-objective {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--tracker-accent);
}
</style>
```

- [ ] **Step 2: Verify type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/MissionTrackerPanel.vue
git commit -m "feat(missions): add MissionTrackerPanel component"
```

---

## Task 7: `MissionFocusPrompt.vue` component

**Files:**
- Create: `src/components/MissionFocusPrompt.vue`

- [ ] **Step 1: Write the component**

```vue
<script setup lang="ts">
/**
 * Tiny overlay shown at the bottom-center of the solar map while the
 * camera is parked on a mission focus target. Pressing Esc anywhere on
 * MapView (or clicking this prompt) returns the camera to the shuttle.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

const emit = defineEmits<{
  /** User clicked the prompt; parent should clear the focus state. */
  dismiss: []
}>()

/**
 * Click handler — emits the dismiss event so the parent can run the
 * same code path the Esc key uses.
 */
function onClick(): void {
  emit('dismiss')
}
</script>

<template>
  <button
    type="button"
    class="mission-focus-prompt"
    aria-label="Return camera to ship"
    @click="onClick"
  >
    <span class="mission-focus-prompt__key">ESC</span>
    <span class="mission-focus-prompt__label">Return to ship</span>
  </button>
</template>

<style>
.mission-focus-prompt {
  position: fixed;
  bottom: 4rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 70;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0.9rem;
  background: rgba(0, 10, 15, 0.55);
  border: 1px solid rgba(0, 255, 204, 0.25);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  cursor: pointer;
  transition: border-color 0.2s ease;
}

.mission-focus-prompt:hover {
  border-color: rgba(0, 255, 204, 0.6);
}

.mission-focus-prompt__key {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  color: rgba(0, 255, 204, 0.9);
  border: 1px solid rgba(0, 255, 204, 0.4);
  padding: 0.1rem 0.35rem;
}

.mission-focus-prompt__label {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.85);
}
</style>
```

- [ ] **Step 2: Verify type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/MissionFocusPrompt.vue
git commit -m "feat(missions): add MissionFocusPrompt overlay"
```

---

## Task 8: Camera focus methods on `MapViewController`

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Locate the existing `vehicleCamera` field and add config + state**

Open `src/views/MapViewController.ts` and find the existing `vehicleCamera` private field (around line 310). Above the field declarations, near the top of the class (or alongside other map-scoped constants in the same file), add:

```ts
/** Vertical offset (world units) used when parking the camera on a mission focus target. */
const MISSION_FOCUS_CAMERA_HEIGHT = 600

/** Diagonal offset (world units) along XZ used so the parked camera sees the target at an angle. */
const MISSION_FOCUS_CAMERA_DISTANCE = 600
```

If the file already groups constants in a top-of-file block, add them there. Otherwise place them immediately above the `MapViewController` class declaration.

Add a public reactive signal next to the existing public reactive flags on the controller (search for an existing `Ref` of `boolean` like `portalCinematicActive` for placement). Import `ref` from `'vue'` if not already imported:

```ts
/** True while the camera is parked on a mission focus target — drives the ESC prompt. */
public readonly missionFocusActive = ref(false)
```

- [ ] **Step 2: Add the two new methods to the `MapViewController` class**

Add these as public methods on the class (place them near the existing `vehicleCamera` setup/teardown helpers, e.g. just below the constructor or alongside other camera helpers):

```ts
/**
 * Park the map camera on a mission focus target. Planet focuses resolve
 * the live world position at call time so movement/orbit doesn't matter.
 *
 * @param focus - The {@link MissionTrackerFocus} from a clicked tracker row.
 */
public focusOnMissionTarget(focus: MissionTrackerFocus): void {
  if (!this.vehicleCamera) return
  const lookAt = this.resolveMissionFocusWorldPosition(focus)
  if (!lookAt) return
  const cameraPos = lookAt
    .clone()
    .add(new THREE.Vector3(MISSION_FOCUS_CAMERA_DISTANCE, MISSION_FOCUS_CAMERA_HEIGHT, MISSION_FOCUS_CAMERA_DISTANCE))
  this.vehicleCamera.parkAt(cameraPos, lookAt)
  this.missionFocusActive.value = true
}

/**
 * Return the camera to follow the shuttle. Safe to call when no focus
 * is active (becomes a no-op).
 */
public clearMissionFocus(): void {
  if (!this.missionFocusActive.value) return
  this.missionFocusActive.value = false
  if (this.vehicleCamera && this.shuttleController) {
    this.vehicleCamera.setTarget(this.shuttleController.group)
  }
}

/**
 * Resolve a {@link MissionTrackerFocus} to a world-space {@link THREE.Vector3}
 * (Y=0 plane). Returns `null` if a planet id can't be resolved.
 */
private resolveMissionFocusWorldPosition(
  focus: MissionTrackerFocus,
): THREE.Vector3 | null {
  if (focus.kind === 'world') {
    return new THREE.Vector3(focus.worldX, 0, focus.worldZ)
  }
  const planet = PLANETS[focus.planetId]
  if (!planet) return null
  const pos = planet.getWorldPosition(new THREE.Vector3())
  pos.y = 0
  return pos
}
```

Add the import alongside the existing missions imports (at the top of the file):

```ts
import type { MissionTrackerFocus } from '@/lib/missions/missionHudRows'
```

`PLANETS` and `THREE` are already imported in this file — verify the imports include them; if not, add `import * as THREE from 'three'` and `import { PLANETS } from '@/lib/planets/catalog'`.

- [ ] **Step 3: Wire `clearMissionFocus()` into existing camera-reparenting flows**

Search for every call site of `this.vehicleCamera.parkAt(` (the portal cinematic uses it). Immediately before each `parkAt` call that is NOT triggered by `focusOnMissionTarget`, prepend:

```ts
this.missionFocusActive.value = false
```

Search for every call site of `this.vehicleCamera.setTarget(` (fast-travel return, EVA exit, etc.). Immediately before each call, prepend:

```ts
this.missionFocusActive.value = false
```

Rationale: any flow that retargets the camera implicitly cancels the parked focus state so the prompt doesn't lie.

- [ ] **Step 4: Verify type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(missions): add focusOnMissionTarget on MapViewController"
```

---

## Task 9: Wire panel + prompt into `MapView.vue`

**Files:**
- Modify: `src/views/MapView.vue`

- [ ] **Step 1: Add imports**

Find the existing import block (around lines 28–30) and add:

```ts
import MissionTrackerPanel from '@/components/MissionTrackerPanel.vue'
import MissionFocusPrompt from '@/components/MissionFocusPrompt.vue'
import {
  buildMissionTrackerGroups,
  type MissionTrackerRow,
} from '@/lib/missions/missionHudRows'
```

- [ ] **Step 2: Add a reactive `missionTrackerGroups` computed**

Find where `activeContractHudRows` is computed (search for `buildActiveContractHudRows`). Add a sibling computed that reads from the existing reactive shuttle mission board ref. The exact ref name is whatever currently feeds the mission board UI — locate it by searching for `.activeMissions` near the `<script setup>` block. Then:

```ts
const missionTrackerGroups = computed(() => buildMissionTrackerGroups(shuttleMissionBoard.value))
```

Replace `shuttleMissionBoard.value` with the actual reactive ref name in this file. If the board lives on `viewController` and is mirrored to a local `ref`, use the local ref. If it's pulled directly from the controller via a getter, wrap it in a `computed` that calls the getter so the panel re-renders when the board changes.

- [ ] **Step 3: Expose the controller's `missionFocusActive` flag locally**

Near the other reactive view-state mirrors (search for `portalCinematicActive`):

```ts
const missionFocusActive = viewController.missionFocusActive
```

Since `missionFocusActive` is a `Ref<boolean>` exported from the controller, no extra wrapping is needed — Vue unwraps refs returned by `setup`.

- [ ] **Step 4: Add a click handler that forwards to the controller**

Place near the other `handle*` helpers (e.g. next to `handleContractTrackerObjective`):

```ts
function handleMissionTrackerFocus(row: MissionTrackerRow): void {
  uiAudio.notifyButtonClick()
  viewController.focusOnMissionTarget(row.focus)
}

function handleMissionFocusDismiss(): void {
  uiAudio.notifyCancel()
  viewController.clearMissionFocus()
}
```

`uiAudio` is already imported in this file — verify the existing import; if not present, copy the import from a sibling component.

- [ ] **Step 5: Insert the panel into the existing tracker stack**

Find the `<div v-if="mapHudTrackerStackVisible" class="map-hud-tracker-stack">` block (around line 1832). Insert the panel **between** the journey `<ObjectiveTracker>` and the `<ContractTrackerPanel>`:

```vue
<div v-if="mapHudTrackerStackVisible" class="map-hud-tracker-stack">
  <ObjectiveTracker
    v-if="journeyTracker && journeyTrackerVisible"
    dock="inline"
    :eyebrow="journeyTracker.eyebrow"
    :title="journeyTracker.title"
    :objectives="journeyTracker.objectives"
    variant="journey"
  />
  <MissionTrackerPanel
    v-if="missionTrackerGroups.length > 0"
    :groups="missionTrackerGroups"
    @focus-mission="handleMissionTrackerFocus"
  />
  <ContractTrackerPanel
    v-if="activeContractHudRows.length > 0"
    :contracts="activeContractHudRows"
    @open-objective="handleContractTrackerObjective"
  />
</div>
```

- [ ] **Step 6: Render the prompt at the top level of the template**

Place this immediately before the closing element of the existing `<template>` body (next to other top-level overlays like `<DeathOverlay>` and `<DamageVignette>`):

```vue
<MissionFocusPrompt
  v-if="missionFocusActive"
  @dismiss="handleMissionFocusDismiss"
/>
```

- [ ] **Step 7: Extend the existing Esc handler**

Find the existing `handleWindowKeydown` function (around line 1159). It currently only handles intro skip:

```ts
function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (
    mapIntro.phase !== 'cinematic_zoom' &&
    mapIntro.phase !== 'awaiting_message_open' &&
    mapIntro.phase !== 'reading_message'
  ) {
    return
  }
  event.preventDefault()
  viewController.skipIntro()
}
```

Update to handle the parked-camera state first (highest priority — short-circuits the intro check):

```ts
function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (missionFocusActive.value) {
    event.preventDefault()
    handleMissionFocusDismiss()
    return
  }
  if (
    mapIntro.phase !== 'cinematic_zoom' &&
    mapIntro.phase !== 'awaiting_message_open' &&
    mapIntro.phase !== 'reading_message'
  ) {
    return
  }
  event.preventDefault()
  viewController.skipIntro()
}
```

- [ ] **Step 8: Run type-check, lint, and tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: 0 type errors, 0 lint errors/warnings, all tests green.

- [ ] **Step 9: Manual smoke test in the dev server**

Run: `bun dev`

In the browser:
1. Start a new run, accept at least one delivery mission and one EVA mission from a planet's mission board.
2. Return to the solar map. Confirm the new "Missions" panel appears on the right between Journey and Contracts, with two group sections.
3. Click an EVA row → camera parks on the waypoint, "ESC — Return to ship" prompt appears bottom-center.
4. Press Esc → camera snaps back to following the shuttle, prompt disappears.
5. Click a delivery row → camera parks on the target planet (or giver planet if status is ready-to-deliver). Click the prompt → camera returns.
6. Trigger a fast-travel or open EVA — confirm the prompt clears and doesn't reappear stuck.

If any of those steps fail, capture the symptom and fix before committing. Do **not** mark this step complete based on type-check/lint alone.

- [ ] **Step 10: Commit**

```bash
git add src/views/MapView.vue
git commit -m "feat(missions): wire active mission tracker into MapView"
```

---

## Self-review

**Spec coverage:**

- ✅ Right-side HUD panel listing active missions — Tasks 6 + 9.
- ✅ Grouped by mission type, fixed order delivery → asteroid → EVA → mining — Tasks 2–5 (builder), Task 6 (panel renders in given order).
- ✅ Empty groups hidden — Task 5 ordering test plus per-group early-out checks across Tasks 2–5.
- ✅ Title + objective-type-only-where-meaningful — Tasks 2 (no obj), 3 (asteroid label), 4 (EVA label), 5 (mining no obj).
- ✅ Click parks camera on focus target — Task 8 + Task 9 wiring.
- ✅ Esc returns camera to ship + prompt overlay — Task 7 + Task 9 step 7.
- ✅ Stack order Journey → Missions → Contracts — Task 9 step 5.
- ✅ Live planet position resolution at click time — Task 8 step 2 (`resolveMissionFocusWorldPosition`).
- ✅ Camera-reparenting flows clear focus — Task 8 step 3.
- ✅ Tests on `src/lib/` only, none on Vue/Three layers — Tasks 1–5.

**Placeholder scan:** No "TBD"/"TODO" left in steps. Step 5/Task 9 explicitly resolves the spec's two open questions: `MissionFocusPrompt` chosen over reusing `OrbitPrompt`, concrete `MISSION_FOCUS_CAMERA_HEIGHT`/`MISSION_FOCUS_CAMERA_DISTANCE` values named in Task 8.

**Type consistency:** `MissionTrackerFocus`, `MissionTrackerRow`, `MissionTrackerGroup`, `MissionTrackerGroupKey` defined in Task 1 are referenced verbatim in Tasks 2–9. Method names `focusOnMissionTarget` / `clearMissionFocus` / `missionFocusActive` are stable across Tasks 8 and 9. Group title strings ("Deliveries", "Asteroid", "EVA", "Mining") are introduced as constants in Tasks 2–5 and asserted in their tests.
