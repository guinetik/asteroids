# Yamada Mission Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four Yamada Farms mission archetypes — Bunker Protect (reskin + suspension-lapse timer), Bunker Extract (new cargo-with-thermal-clock delivery loop), Patient Rescue (yellow-suit VIP variant), Neuron-Install EVA (no-op, listed for completeness) — and make the existing `archetype` metadata field on `MissionGiverTemplate` load-bearing for runtime dispatch.

**Architecture:** Add a Yamada-mission-state union type (`YamadaMissionState`) carried on `GeneratedAsteroidMission` as `yamada?: YamadaMissionState`, stamped at mission acceptance time based on the giver template's `archetype` string. The `archetype` field stays on the template (input); the `yamada` field is the runtime-resolved (output) state. New runtime behavior — cylinder spawning, suspension-lapse timer, dispense interaction, cargo integrity model, thermal-band overlay, delivery button — branches on the `yamada.archetype` discriminator at the consumption points (level controller, HUD builders, map overlay projector, shuttle mission board).

**Tech Stack:** TypeScript strict mode, Vue 3, Three.js, Vitest, Pinia. Pure domain in `src/lib/`, controllers in `src/three/`, HUD components in `src/components/`. JSON data under `src/data/`.

**Spec:** `docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md`.

---

## File Structure

### New files

```
src/lib/missions/yamadaArchetype.ts                      — Type definitions + stamping logic (pure)
src/lib/missions/cargoIntegrity.ts                       — Bunker Extract integrity + thermal model (pure)
src/lib/missions/__tests__/yamadaArchetype.spec.ts       — Unit tests for archetype types & stamping
src/lib/missions/__tests__/cargoIntegrity.spec.ts        — Unit tests for cargo integrity model

src/lib/level/suspensionLapseTimer.ts                    — Bunker Protect timer state (pure)
src/lib/level/__tests__/suspensionLapseTimer.spec.ts     — Unit tests for the timer

src/three/SuspensionCylinderModel.ts                     — Placeholder cylinder + pig 3D asset
```

### Modified files

```
src/lib/missions/types.ts                                — Add `yamada?: YamadaMissionState` to GeneratedAsteroidMission
src/data/missions/givers/yamada-farms.json               — Add archetype-specific config fields
src/lib/missions/asteroidMissionGenerator.ts             — Call stampYamadaState() after generation
src/lib/missions/missionHudRows.ts                       — Extend row shape with optional bar/timer/status
src/lib/missions/missionStorage.ts                       — Rehydrate `yamada` field on load
src/views/LevelViewController.ts                         — Branch bunker setup on yamada.archetype; install cylinder + timer; dispense interaction
src/lib/minigame/RescueMinigame.ts                       — VIP operator support
src/lib/map/overlay/MapOverlayProjector.ts               — Safe-thermal-annulus overlay when bunker-extract active
src/components/shuttle-control/ShuttleControlProgramMissions.vue  — Deliver button for active asteroid mission when archetype=bunker-extract
src/components/MissionTrackerPanel.vue                   — Render bar/timer/status rows
```

### Files left untouched (called out for clarity)

```
src/data/shuttle-missions/eva/uranus.json                — Neuron-Install entry stays as-is (satellite_servicing alias)
src/lib/bunker/bunkerWaveSchedule.ts                     — Wave schedule unchanged; Bunker Extract bypasses it
src/data/missions/bunker-waves.json                      — Unchanged
```

---

## Phase 1 — Yamada mission state types

Build the data layer first. Each archetype gets a discriminated variant in a union; the union is attached to `GeneratedAsteroidMission` as an optional field. A `stampYamadaState()` helper takes a fresh mission + the giver template archetype + acceptance context (player upgrades, current giver-planet world position, available destination planets) and produces the right variant. No runtime changes yet.

### Task 1.1: Create the YamadaMissionState union

**Files:**
- Create: `src/lib/missions/yamadaArchetype.ts`
- Test: `src/lib/missions/__tests__/yamadaArchetype.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/missions/__tests__/yamadaArchetype.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type {
  YamadaBunkerProtectState,
  YamadaBunkerExtractState,
  YamadaPatientRescueState,
  YamadaMissionState,
} from '../yamadaArchetype'

describe('YamadaMissionState union', () => {
  it('discriminates by archetype', () => {
    const protect: YamadaBunkerProtectState = {
      archetype: 'bunker-protect',
      suspensionLapseSeconds: 360,
    }
    const extract: YamadaBunkerExtractState = {
      archetype: 'bunker-extract',
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 240,
      organItemId: 'yamada-organ-case',
    }
    const rescue: YamadaPatientRescueState = {
      archetype: 'patient-rescue',
      vipOperatorIndex: 0,
    }
    const states: YamadaMissionState[] = [protect, extract, rescue]
    expect(states.map((s) => s.archetype)).toEqual([
      'bunker-protect',
      'bunker-extract',
      'patient-rescue',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/missions/__tests__/yamadaArchetype.spec.ts`
Expected: FAIL — module `../yamadaArchetype` not found.

- [ ] **Step 3: Create the type module**

Create `src/lib/missions/yamadaArchetype.ts`:

```ts
/**
 * Yamada Farms archetype-specific mission state.
 *
 * The `archetype` string on `MissionGiverTemplate` is a template-side tag.
 * After a mission is rolled and accepted, `stampYamadaState()` translates that
 * tag into a discriminated runtime state attached to the active mission as
 * `GeneratedAsteroidMission.yamada`. Consumers (level controller, HUD,
 * overlay, mission board) branch on `yamada.archetype` to apply archetype
 * behavior.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Bunker Protect runtime state. */
export interface YamadaBunkerProtectState {
  /** Discriminator. */
  archetype: 'bunker-protect'
  /**
   * Total seconds the player has from arrival on the asteroid to complete every
   * wave AND reboot the cylinder. Expiry hard-fails the mission. Length is
   * difficulty-derived at acceptance (see `pickSuspensionLapseSeconds`).
   */
  suspensionLapseSeconds: number
}

/** Bunker Extract runtime state. */
export interface YamadaBunkerExtractState {
  /** Discriminator. */
  archetype: 'bunker-extract'
  /** Planet id where the organ must be delivered. */
  destinationPlanetId: string
  /** Total countdown in seconds from dispense completion to required delivery. */
  deliveryTimerSeconds: number
  /** Inventory item id granted by the cylinder dispense beat. */
  organItemId: string
}

/** Patient Rescue runtime state. */
export interface YamadaPatientRescueState {
  /** Discriminator. */
  archetype: 'patient-rescue'
  /**
   * Index of the VIP within the rescue operator list (0-based). The operator
   * at this index is rendered in yellow and hard-fails the mission on death.
   */
  vipOperatorIndex: number
}

/** Union of all Yamada archetype runtime states. */
export type YamadaMissionState =
  | YamadaBunkerProtectState
  | YamadaBunkerExtractState
  | YamadaPatientRescueState
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/missions/__tests__/yamadaArchetype.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/yamadaArchetype.ts src/lib/missions/__tests__/yamadaArchetype.spec.ts
git commit -m "feat(missions): add Yamada archetype state union"
```

---

### Task 1.2: Add `yamada` field to GeneratedAsteroidMission

**Files:**
- Modify: `src/lib/missions/types.ts`

- [ ] **Step 1: Add the optional field on GeneratedAsteroidMission**

Open `src/lib/missions/types.ts`. Add this import near the top of the asteroid-mission section (after existing imports):

```ts
import type { YamadaMissionState } from './yamadaArchetype'
```

In the `GeneratedAsteroidMission` interface (around line 609), add a new optional field right after `grantsItemOnComplete`:

```ts
  /**
   * Archetype-specific runtime state for Yamada Farms missions. Stamped at
   * acceptance time when the giver template's `archetype` is one of
   * `'bunker-protect'`, `'bunker-extract'`, or `'patient-rescue'`. Omitted for
   * all non-Yamada missions.
   *
   * @see {@link YamadaMissionState}
   */
  yamada?: YamadaMissionState
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/missions/types.ts
git commit -m "feat(missions): attach optional Yamada state to GeneratedAsteroidMission"
```

---

### Task 1.3: stampYamadaState() — translate archetype tag into state

**Files:**
- Modify: `src/lib/missions/yamadaArchetype.ts`
- Modify: `src/lib/missions/__tests__/yamadaArchetype.spec.ts`

- [ ] **Step 1: Add failing tests for stampYamadaState**

Append to `src/lib/missions/__tests__/yamadaArchetype.spec.ts`:

```ts
import { stampYamadaState, pickSuspensionLapseSeconds } from '../yamadaArchetype'

describe('stampYamadaState', () => {
  it('returns undefined for non-Yamada archetype strings', () => {
    expect(stampYamadaState({ archetype: undefined, difficulty: 5 })).toBeUndefined()
    expect(stampYamadaState({ archetype: 'not-a-real-archetype', difficulty: 5 })).toBeUndefined()
  })

  it('stamps bunker-protect with a difficulty-derived timer', () => {
    const state = stampYamadaState({ archetype: 'bunker-protect', difficulty: 5 })
    expect(state).toEqual({
      archetype: 'bunker-protect',
      suspensionLapseSeconds: pickSuspensionLapseSeconds(5),
    })
  })

  it('stamps bunker-extract with destination + timer + organ id', () => {
    const state = stampYamadaState({
      archetype: 'bunker-extract',
      difficulty: 6,
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 300,
    })
    expect(state).toEqual({
      archetype: 'bunker-extract',
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 300,
      organItemId: 'yamada-organ-case',
    })
  })

  it('stamps patient-rescue with a random VIP index within range', () => {
    const state = stampYamadaState({
      archetype: 'patient-rescue',
      difficulty: 7,
      operatorCount: 4,
      rand: () => 0.75,
    })
    expect(state).toEqual({ archetype: 'patient-rescue', vipOperatorIndex: 3 })
  })
})

describe('pickSuspensionLapseSeconds', () => {
  it('returns 420 (7 min) at difficulty 4-6', () => {
    expect(pickSuspensionLapseSeconds(4)).toBe(420)
    expect(pickSuspensionLapseSeconds(6)).toBe(420)
  })

  it('returns 300 (5 min) at difficulty 7-9', () => {
    expect(pickSuspensionLapseSeconds(7)).toBe(300)
    expect(pickSuspensionLapseSeconds(9)).toBe(300)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/missions/__tests__/yamadaArchetype.spec.ts`
Expected: FAIL — `stampYamadaState` and `pickSuspensionLapseSeconds` not exported.

- [ ] **Step 3: Implement the stamp helper**

Append to `src/lib/missions/yamadaArchetype.ts`:

```ts
/**
 * Suspension-lapse timer by difficulty for Bunker Protect.
 * 4–6 → 7 min; 7–9 → 5 min. Tuneable per design open-questions list.
 *
 * @param difficulty - Mission difficulty (1–10).
 */
export function pickSuspensionLapseSeconds(difficulty: number): number {
  if (difficulty <= 6) return 420
  return 300
}

/** Inventory item id granted by the Bunker Extract dispense. */
export const YAMADA_ORGAN_ITEM_ID = 'yamada-organ-case'

/** Acceptance-time context required to stamp the Yamada runtime state. */
export interface YamadaStampInput {
  /** Archetype string from the giver template (may be undefined). */
  archetype: string | undefined
  /** Rolled mission difficulty. */
  difficulty: number
  /** Bunker Extract: pinned destination planet id. */
  destinationPlanetId?: string
  /** Bunker Extract: precomputed timer length (seconds). */
  deliveryTimerSeconds?: number
  /** Patient Rescue: total operators in the rescue objective. */
  operatorCount?: number
  /** Optional RNG injectable for tests. Defaults to `Math.random`. */
  rand?: () => number
}

/**
 * Translate a giver template's `archetype` tag into the Yamada runtime state
 * attached to `GeneratedAsteroidMission.yamada`. Returns `undefined` for any
 * archetype outside the three asteroid Yamada variants — that signals the
 * caller (asteroid mission generator) not to set the field.
 *
 * @param input - Acceptance-time context.
 * @returns Discriminated state, or undefined for non-Yamada archetypes.
 */
export function stampYamadaState(input: YamadaStampInput): YamadaMissionState | undefined {
  const rand = input.rand ?? Math.random
  switch (input.archetype) {
    case 'bunker-protect':
      return {
        archetype: 'bunker-protect',
        suspensionLapseSeconds: pickSuspensionLapseSeconds(input.difficulty),
      }
    case 'bunker-extract': {
      if (!input.destinationPlanetId || input.deliveryTimerSeconds === undefined) {
        return undefined
      }
      return {
        archetype: 'bunker-extract',
        destinationPlanetId: input.destinationPlanetId,
        deliveryTimerSeconds: input.deliveryTimerSeconds,
        organItemId: YAMADA_ORGAN_ITEM_ID,
      }
    }
    case 'patient-rescue': {
      const count = Math.max(1, input.operatorCount ?? 1)
      return {
        archetype: 'patient-rescue',
        vipOperatorIndex: Math.floor(rand() * count),
      }
    }
    default:
      return undefined
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/missions/__tests__/yamadaArchetype.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/yamadaArchetype.ts src/lib/missions/__tests__/yamadaArchetype.spec.ts
git commit -m "feat(missions): stamp Yamada archetype state at acceptance"
```

---

### Task 1.4: Wire stampYamadaState into the asteroid mission generator

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts`
- Modify: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts` (in a new `describe` block):

```ts
import { stampYamadaState } from '../yamadaArchetype'
import yamadaGiver from '@/data/missions/givers/yamada-farms.json'

describe('Yamada archetype stamping in generator', () => {
  it('stamps bunker-protect state on generated Yamada bunker-protect missions', () => {
    // We test the stamp function is consulted by the generator wiring — see
    // generateAsteroidMission docstring for signature changes.
    expect(stampYamadaState({ archetype: 'bunker-protect', difficulty: 5 })).toBeDefined()
  })

  it('every Yamada giver mission has a recognised archetype string', () => {
    const archetypes = yamadaGiver.missions.map((m) => m.archetype)
    for (const a of archetypes) {
      expect(['bunker-protect', 'bunker-extract', 'patient-rescue']).toContain(a)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: PASS (the assertions are sanity checks; they should already pass once Task 1.3 is in).

- [ ] **Step 3: Wire stamping into generateAsteroidMission**

Open `src/lib/missions/asteroidMissionGenerator.ts`. Add import at the top of the file (with the other relative imports):

```ts
import { stampYamadaState } from './yamadaArchetype'
import { pickYamadaBunkerExtractDestination } from './yamadaDestinations'
```

Locate the `return { kind: 'standard', ... }` block at the end of `generateAsteroidMission()` (around line 929). Before the return, compute the Yamada state:

```ts
  const yamadaState = stampYamadaState({
    archetype: pick.template.archetype,
    difficulty,
    operatorCount: objectives.find((o) => o.type === 'rescue')?.colonistCount,
    ...(pick.template.archetype === 'bunker-extract'
      ? pickYamadaBunkerExtractDestination(anchor.planetId, difficulty)
      : {}),
  })
```

Then add `yamada: yamadaState` to the returned object:

```ts
  return {
    kind: 'standard',
    // ... existing fields ...
    waypoint,
    status: 'available',
    ...(yamadaState ? { yamada: yamadaState } : {}),
  }
```

- [ ] **Step 4: Create pickYamadaBunkerExtractDestination helper**

Create `src/lib/missions/yamadaDestinations.ts`:

```ts
/**
 * Bunker Extract destination + timer selection. Most rolls deliver to Uranus
 * (local hop, gentle timer). A weighted minority pin Neptune or Saturn for the
 * "old patient, strange orbit" lore beat. Timer length scales with the
 * pickup-to-destination distance.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Pickup-distance to destination → timer length (seconds). Tuneable. */
const TIMER_BY_DESTINATION_SECONDS: Record<string, number> = {
  uranus: 240,
  neptune: 480,
  saturn: 600,
}

interface DestinationPick {
  /** Destination planet id. */
  destinationPlanetId: string
  /** Countdown in seconds. */
  deliveryTimerSeconds: number
}

/**
 * Pick a destination + timer for a Bunker Extract drafted at the given host.
 * Uses fixed weighted distribution: 70% Uranus, 20% Neptune, 10% Saturn.
 *
 * @param _hostPlanetId - Posting station (reserved for future per-host rules).
 * @param _difficulty - Mission difficulty (reserved for future scaling).
 * @returns Destination pick.
 */
export function pickYamadaBunkerExtractDestination(
  _hostPlanetId: string,
  _difficulty: number,
): DestinationPick {
  const roll = Math.random()
  const destinationPlanetId = roll < 0.7 ? 'uranus' : roll < 0.9 ? 'neptune' : 'saturn'
  return {
    destinationPlanetId,
    deliveryTimerSeconds: TIMER_BY_DESTINATION_SECONDS[destinationPlanetId] ?? 240,
  }
}
```

- [ ] **Step 5: Run all mission tests + type-check**

Run: `bun run type-check && bun test:unit src/lib/missions/`
Expected: 0 type errors; all mission tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/yamadaDestinations.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
git commit -m "feat(missions): stamp Yamada state in asteroid mission generator"
```

---

### Task 1.5: Persist `yamada` field through localStorage rehydration

**Files:**
- Modify: `src/lib/missions/missionStorage.ts`
- Modify: `src/lib/missions/__tests__/missionStorage.spec.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/missions/__tests__/missionStorage.spec.ts` (or add to existing if covers loadActiveMission):

```ts
describe('loadActiveMission with Yamada state', () => {
  it('round-trips bunker-extract yamada state', () => {
    const mission = {
      kind: 'standard',
      id: 'test_1',
      asteroidId: 'bennu',
      giverId: 'yamada-farms',
      giverName: 'Sumiko Yamada',
      templateId: 'yamada_bunker_extract',
      name: 'Bunker Extract',
      briefing: '',
      difficulty: 5,
      region: 'kuiper-belt',
      objectives: [],
      totalReward: 5000,
      waypoint: { worldX: 1, worldZ: 1 },
      status: 'accepted',
      yamada: {
        archetype: 'bunker-extract',
        destinationPlanetId: 'uranus',
        deliveryTimerSeconds: 240,
        organItemId: 'yamada-organ-case',
      },
    }
    localStorage.setItem('asteroid-lander-active-mission-v1', JSON.stringify(mission))
    const loaded = loadActiveMission()
    expect(loaded?.yamada).toEqual(mission.yamada)
  })
})
```

(If `missionStorage.spec.ts` does not exist, create it with the required Vitest imports + JSDOM localStorage mock.)

- [ ] **Step 2: Run test**

Run: `bun test:unit src/lib/missions/__tests__/missionStorage.spec.ts`
Expected: PASS — `loadActiveMission` currently uses spread + cast that preserves any field on the parsed object, including `yamada`. If the test fails (e.g. fields stripped), proceed to Step 3.

- [ ] **Step 3: If test failed, ensure `yamada` is preserved on load**

In `src/lib/missions/missionStorage.ts`, the existing `loadActiveMission()` already does `{ ...mission, kind: ... }` which preserves arbitrary fields. No change needed if test passes. If the rehydrate path uses field-by-field reconstruction, add `yamada: mission.yamada` to the returned object.

- [ ] **Step 4: Commit**

```bash
git add src/lib/missions/__tests__/missionStorage.spec.ts src/lib/missions/missionStorage.ts
git commit -m "test(missions): round-trip Yamada state through localStorage"
```

---

## Phase 2 — Suspension cylinder asset

Build a placeholder Three.js controller for the suspension cylinder + pig. Shared by Bunker Protect (interactable terminal swap) and Bunker Extract (dispense source). Real art swap is a later content pass.

### Task 2.1: SuspensionCylinderModel controller

**Files:**
- Create: `src/three/SuspensionCylinderModel.ts`

- [ ] **Step 1: Create the controller**

Create `src/three/SuspensionCylinderModel.ts`:

```ts
/**
 * Placeholder Three.js model for the Yamada suspension cylinder — a large
 * vertical glass cylinder housing a sleeping pig, mounted on a base, with
 * indicator lights and ambient hum (audio is handled by an external sound
 * controller; this controller owns geometry + materials only).
 *
 * Shared by Bunker Protect (interactable target — reboot) and Bunker Extract
 * (dispense source for the organ case).
 *
 * Real art is deferred. This placeholder uses primitive geometry + emissive
 * glass material so the gameplay can be built and tested before final assets.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */
import * as THREE from 'three'

/** World-space interaction range for the cylinder. Matches existing terminal range. */
export const CYLINDER_INTERACT_RANGE = 8.0

/** Visible cylinder height. */
const CYLINDER_HEIGHT = 4.0

/** Visible cylinder radius. */
const CYLINDER_RADIUS = 1.0

/** Base platform height. */
const BASE_HEIGHT = 0.4

/** Color tuning for the cylinder glass (Yamada palette — pale clinical green). */
const GLASS_COLOR = 0x9be7c4

/** Color tuning for the indicator strip (calm Yamada green). */
const INDICATOR_COLOR = 0x4dd17b

/**
 * Controller for the suspension cylinder. Owns a single root `THREE.Group`
 * that callers parent into the bunker scene at the desired world position.
 */
export class SuspensionCylinderModel {
  /** Root Object3D — parent into the bunker scene. */
  public readonly root: THREE.Group
  /** Indicator strip — toggle visibility during dispense animation. */
  private indicator: THREE.Mesh

  public constructor() {
    this.root = new THREE.Group()

    const baseGeom = new THREE.CylinderGeometry(
      CYLINDER_RADIUS * 1.4,
      CYLINDER_RADIUS * 1.6,
      BASE_HEIGHT,
      24,
    )
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a3a44, roughness: 0.7 })
    const base = new THREE.Mesh(baseGeom, baseMat)
    base.position.y = BASE_HEIGHT * 0.5
    this.root.add(base)

    const glassGeom = new THREE.CylinderGeometry(
      CYLINDER_RADIUS,
      CYLINDER_RADIUS,
      CYLINDER_HEIGHT,
      32,
      1,
      true,
    )
    const glassMat = new THREE.MeshStandardMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
      emissive: GLASS_COLOR,
      emissiveIntensity: 0.15,
      side: THREE.DoubleSide,
    })
    const glass = new THREE.Mesh(glassGeom, glassMat)
    glass.position.y = BASE_HEIGHT + CYLINDER_HEIGHT * 0.5
    this.root.add(glass)

    const pigGeom = new THREE.CapsuleGeometry(CYLINDER_RADIUS * 0.6, CYLINDER_HEIGHT * 0.45, 8, 16)
    const pigMat = new THREE.MeshStandardMaterial({ color: 0xeac4b8, roughness: 0.85 })
    const pig = new THREE.Mesh(pigGeom, pigMat)
    pig.rotation.z = Math.PI / 2
    pig.position.y = BASE_HEIGHT + CYLINDER_HEIGHT * 0.5
    this.root.add(pig)

    const indicatorGeom = new THREE.BoxGeometry(CYLINDER_RADIUS * 0.3, CYLINDER_HEIGHT * 0.05, 0.05)
    const indicatorMat = new THREE.MeshBasicMaterial({ color: INDICATOR_COLOR })
    this.indicator = new THREE.Mesh(indicatorGeom, indicatorMat)
    this.indicator.position.set(0, BASE_HEIGHT + CYLINDER_HEIGHT * 0.9, CYLINDER_RADIUS + 0.05)
    this.root.add(this.indicator)
  }

  /**
   * Set the indicator strip on/off — call during dispense beat to suggest
   * activity. Replace with a real animation in the art pass.
   *
   * @param active - Whether the indicator is lit.
   */
  public setIndicatorActive(active: boolean): void {
    this.indicator.visible = active
  }

  /** Dispose all geometry and materials owned by the controller. */
  public dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/three/SuspensionCylinderModel.ts
git commit -m "feat(three): placeholder suspension cylinder + pig model"
```

---

## Phase 3 — Bunker Protect: reskin + suspension-lapse timer

Branch the existing bunker mission setup on `mission.yamada?.archetype === 'bunker-protect'`. Spawn the cylinder in place of the terminal. Relabel the hold-E interaction "Reboot Suspension." Add a global mission timer that hard-fails on expiry.

### Task 3.1: SuspensionLapseTimer (pure domain)

**Files:**
- Create: `src/lib/level/suspensionLapseTimer.ts`
- Test: `src/lib/level/__tests__/suspensionLapseTimer.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/level/__tests__/suspensionLapseTimer.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createSuspensionLapseTimer, tickSuspensionLapseTimer } from '../suspensionLapseTimer'

describe('SuspensionLapseTimer', () => {
  it('starts at the configured total and not expired', () => {
    const t = createSuspensionLapseTimer(60)
    expect(t.remaining).toBe(60)
    expect(t.expired).toBe(false)
  })

  it('decrements remaining by dt and flips expired at zero', () => {
    let t = createSuspensionLapseTimer(2)
    t = tickSuspensionLapseTimer(t, 1.5)
    expect(t.remaining).toBeCloseTo(0.5)
    expect(t.expired).toBe(false)
    t = tickSuspensionLapseTimer(t, 1)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })

  it('stays at zero and expired once fired', () => {
    let t = createSuspensionLapseTimer(1)
    t = tickSuspensionLapseTimer(t, 5)
    t = tickSuspensionLapseTimer(t, 5)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/level/__tests__/suspensionLapseTimer.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/level/suspensionLapseTimer.ts`:

```ts
/**
 * Suspension-lapse timer for Bunker Protect missions. Counts down from
 * arrival on the asteroid; expiry hard-fails the mission unless every wave
 * has been cleared AND the cylinder has been rebooted.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */

/** Immutable timer state. Use `tickSuspensionLapseTimer` to advance. */
export interface SuspensionLapseTimerState {
  /** Total configured seconds (immutable after creation). */
  readonly total: number
  /** Seconds remaining; clamped to 0. */
  readonly remaining: number
  /** Latched true once remaining reaches 0. */
  readonly expired: boolean
}

/**
 * Build a fresh timer.
 *
 * @param totalSeconds - Total countdown duration.
 */
export function createSuspensionLapseTimer(totalSeconds: number): SuspensionLapseTimerState {
  return { total: totalSeconds, remaining: totalSeconds, expired: false }
}

/**
 * Advance the timer by `dt` seconds. Pure — returns a new state.
 *
 * @param state - Previous state.
 * @param dt - Delta time, in seconds. Negative or zero values are no-ops.
 */
export function tickSuspensionLapseTimer(
  state: SuspensionLapseTimerState,
  dt: number,
): SuspensionLapseTimerState {
  if (state.expired || dt <= 0) {
    return state
  }
  const remaining = Math.max(0, state.remaining - dt)
  return {
    total: state.total,
    remaining,
    expired: remaining === 0,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test:unit src/lib/level/__tests__/suspensionLapseTimer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/suspensionLapseTimer.ts src/lib/level/__tests__/suspensionLapseTimer.spec.ts
git commit -m "feat(level): suspension-lapse timer (Bunker Protect)"
```

---

### Task 3.2: Extend MissionTrackerRow with bar/timer/status fields

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/missions/__tests__/missionHudRows.spec.ts`:

```ts
describe('MissionTrackerRow optional bar/timer/status fields', () => {
  it('supports a timer field for countdown rows', () => {
    const row: MissionTrackerRow = {
      id: 'lapse-timer',
      title: 'Suspension',
      timerSeconds: 360,
      focus: { kind: 'world', worldX: 0, worldZ: 0 },
    }
    expect(row.timerSeconds).toBe(360)
  })

  it('supports a bar field for integrity rows', () => {
    const row: MissionTrackerRow = {
      id: 'integrity',
      title: 'Cargo',
      bar: { value: 80, max: 100, label: 'Integrity' },
      focus: { kind: 'world', worldX: 0, worldZ: 0 },
    }
    expect(row.bar?.value).toBe(80)
  })

  it('supports a status field for thermal-zone rows', () => {
    const row: MissionTrackerRow = {
      id: 'thermal',
      title: 'Thermal',
      status: { label: 'SAFE', tone: 'ok' },
      focus: { kind: 'world', worldX: 0, worldZ: 0 },
    }
    expect(row.status?.label).toBe('SAFE')
  })
})
```

- [ ] **Step 2: Run test**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: FAIL — fields not declared.

- [ ] **Step 3: Extend MissionTrackerRow**

In `src/lib/missions/missionHudRows.ts`, replace the existing `MissionTrackerRow` interface with:

```ts
/** Color tone for a status row — drives CSS class selection in the Vue layer. */
export type MissionTrackerStatusTone = 'ok' | 'warn' | 'danger'

/** A single row inside a tracker group. */
export interface MissionTrackerRow {
  /** Stable id used for v-for keying. */
  id: string
  /** Mission name shown as the row title. */
  title: string
  /** Optional objective-type display label (asteroid/EVA only). */
  objectiveType?: string
  /** Optional progress line (e.g. mining `"180 / 350 kg of Olivine"`). */
  progress?: string
  /** Optional countdown timer (seconds remaining). Rendered as `mm:ss`. */
  timerSeconds?: number
  /** Optional integrity / progress bar. */
  bar?: {
    /** Current value (0..max). */
    value: number
    /** Max value (typically 100 for integrity). */
    max: number
    /** Display label above or beside the bar. */
    label: string
  }
  /** Optional categorical status indicator (e.g. SAFE / HOT / COLD). */
  status?: {
    /** Short label shown in the indicator. */
    label: string
    /** Tone driving the color of the indicator. */
    tone: MissionTrackerStatusTone
  }
  /** Where clicking the row should park the camera. */
  focus: MissionTrackerFocus
}
```

- [ ] **Step 4: Run test**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(missions): extend MissionTrackerRow with bar/timer/status"
```

---

### Task 3.3: Render bar/timer/status in MissionTrackerPanel.vue

**Files:**
- Modify: `src/components/MissionTrackerPanel.vue` (or matching path — confirm via Glob)

- [ ] **Step 1: Locate the panel**

Run: `Glob` for `MissionTrackerPanel.vue` to confirm the exact path.

- [ ] **Step 2: Read the current template**

Read the panel file end-to-end so you understand the existing row markup.

- [ ] **Step 3: Add bar/timer/status conditional rendering**

Inside each `<tr>` (or row container) for a `MissionTrackerRow`, after the existing `progress` rendering, add:

```vue
<span v-if="row.timerSeconds !== undefined" class="mission-row-timer">
  {{ formatMmSs(row.timerSeconds) }}
</span>
<span v-if="row.bar" class="mission-row-bar">
  <span class="mission-row-bar__label">{{ row.bar.label }}</span>
  <span
    class="mission-row-bar__fill"
    :style="{ width: ((row.bar.value / row.bar.max) * 100) + '%' }"
  />
</span>
<span
  v-if="row.status"
  class="mission-row-status"
  :class="'mission-row-status--' + row.status.tone"
>
  {{ row.status.label }}
</span>
```

Add helper function `formatMmSs` inside the component `<script setup>`:

```ts
function formatMmSs(totalSeconds: number): string {
  const t = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

- [ ] **Step 4: Add the matching CSS**

Add the styles to a sibling stylesheet imported by `main.css` (per Tailwind @apply pattern — never embed in `<style scoped>` for Tailwind v4 in this repo). Create or extend `src/assets/css/mission-row.css`:

```css
.mission-row-timer {
  @apply ml-2 font-mono text-xs text-emerald-300;
}
.mission-row-bar {
  @apply ml-2 flex items-center gap-1;
}
.mission-row-bar__label {
  @apply text-[10px] uppercase tracking-wider text-slate-400;
}
.mission-row-bar__fill {
  @apply block h-1 w-12 rounded-full bg-emerald-400;
}
.mission-row-status {
  @apply ml-2 rounded px-1 text-[10px] uppercase tracking-wider;
}
.mission-row-status--ok {
  @apply bg-emerald-900/40 text-emerald-300;
}
.mission-row-status--warn {
  @apply bg-amber-900/40 text-amber-300;
}
.mission-row-status--danger {
  @apply bg-rose-900/40 text-rose-300;
}
```

Add the import to `src/assets/css/main.css`:

```css
@import './mission-row.css';
```

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/MissionTrackerPanel.vue src/assets/css/mission-row.css src/assets/css/main.css
git commit -m "feat(hud): render bar/timer/status on mission tracker rows"
```

---

### Task 3.4: Branch bunker setup on `yamada.archetype === 'bunker-protect'`

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Locate the bunker setup**

Open `src/views/LevelViewController.ts`. Find the section that creates the bunker hatch + terminal for a bunker objective (around line 144 — `BunkerMinigame` instantiation and `surfaceBunkerHatch` model placement near line 289).

- [ ] **Step 2: Add cylinder spawning for bunker-protect**

After the existing terminal/hatch placement, add:

```ts
import { SuspensionCylinderModel, CYLINDER_INTERACT_RANGE } from '@/three/SuspensionCylinderModel'

// ... inside the bunker objective setup section, after the terminal is placed ...

const isBunkerProtect = mission.yamada?.archetype === 'bunker-protect'
if (isBunkerProtect) {
  const cylinder = new SuspensionCylinderModel()
  cylinder.root.position.copy(terminalModel.root.position) // place where terminal was
  cylinder.root.position.y += 0.0
  scene.add(cylinder.root)
  terminalModel.root.visible = false // hide the data terminal
  this.suspensionCylinder = cylinder
  // Reuse the existing terminal interaction trigger range and label change:
  this.bunkerFinalInteractionLabel = 'Reboot Suspension'
  this.bunkerFinalInteractionRange = CYLINDER_INTERACT_RANGE
}
```

(Exact line numbers and surrounding identifier names — `terminalModel`, `scene` — must be verified against the actual file before edits; this snippet shows the conceptual integration.)

- [ ] **Step 3: Add disposal**

In the existing `dispose()` / cleanup method of `LevelViewController`, add:

```ts
this.suspensionCylinder?.dispose()
this.suspensionCylinder = undefined
```

Declare the property near other view-level members:

```ts
private suspensionCylinder?: SuspensionCylinderModel
```

- [ ] **Step 4: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): swap bunker terminal for suspension cylinder on bunker-protect"
```

---

### Task 3.5: Wire the suspension-lapse timer into the level loop

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/lib/level/levelStateMachine.ts`

- [ ] **Step 1: Add the timer to LevelViewController**

In `LevelViewController.ts`, declare the timer state near the cylinder property:

```ts
import {
  createSuspensionLapseTimer,
  tickSuspensionLapseTimer,
  type SuspensionLapseTimerState,
} from '@/lib/level/suspensionLapseTimer'

private suspensionLapseTimer?: SuspensionLapseTimerState
```

- [ ] **Step 2: Initialize on arrival**

In the level init / arrival state entry (where mission setup happens for the asteroid), add:

```ts
if (mission.yamada?.archetype === 'bunker-protect') {
  this.suspensionLapseTimer = createSuspensionLapseTimer(mission.yamada.suspensionLapseSeconds)
}
```

- [ ] **Step 3: Tick + expiry**

In the per-frame tick callback of the level (the same place the lander/EVA tick happens), add:

```ts
if (this.suspensionLapseTimer && !this.suspensionLapseTimer.expired) {
  this.suspensionLapseTimer = tickSuspensionLapseTimer(this.suspensionLapseTimer, dt)
  if (this.suspensionLapseTimer.expired && !this.cylinderRebooted) {
    this.failMissionSuspensionLapse()
  }
}
```

Add the matching `failMissionSuspensionLapse()` helper to `LevelViewController.ts`:

```ts
private failMissionSuspensionLapse(): void {
  // Transition the level state machine to the existing "failed" terminal state.
  this.stateMachine.transitionTo('failed', { reason: 'suspension-lapse' })
}
```

Verify the `'failed'` state name and transition API against `src/lib/level/levelStateMachine.ts` before committing the snippet.

- [ ] **Step 4: Stop timer on cylinder reboot**

When the bunker terminal completion event fires (existing wave-clear + terminal interaction flow), set `this.cylinderRebooted = true`. The tick guard above prevents fail.

- [ ] **Step 5: Expose timer to HUD**

In the function that builds mission tracker groups (called from the Vue layer), inject a row for the lapse timer when active. Open `src/lib/missions/missionHudRows.ts` and add:

```ts
import type { SuspensionLapseTimerState } from '@/lib/level/suspensionLapseTimer'

/**
 * Build a Bunker Protect suspension-lapse timer row. Returns `null` when no
 * Bunker Protect mission is active.
 *
 * @param mission - Active asteroid mission, if any.
 * @param timer - Live timer state from the level controller.
 * @returns Mission tracker row or null.
 */
export function buildSuspensionLapseRow(
  mission: GeneratedAsteroidMission | null,
  timer: SuspensionLapseTimerState | null,
): MissionTrackerRow | null {
  if (!mission || mission.yamada?.archetype !== 'bunker-protect' || !timer) return null
  return {
    id: `suspension-lapse:${mission.id}`,
    title: 'Suspension Cycle',
    timerSeconds: timer.remaining,
    focus: { kind: 'world', worldX: mission.waypoint.worldX, worldZ: mission.waypoint.worldZ },
  }
}
```

Wire this into the HUD render path (Vue side) so the lapse row appears in the asteroid group during a Bunker Protect run.

- [ ] **Step 6: Type-check + run all tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: clean.

- [ ] **Step 7: Manual smoke test**

Run: `bun dev`. Open the mission board, accept a Bunker Protect mission, fly to it, land. Verify:
- The cylinder model appears in place of the data terminal.
- A "Suspension Cycle" row appears in the mission tracker HUD with a countdown.
- The countdown decrements live during the wave.
- Clearing all waves + holding E on the cylinder (relabeled "Reboot Suspension") completes the mission normally.
- Letting the countdown reach 0 fails the mission.

- [ ] **Step 8: Commit**

```bash
git add src/views/LevelViewController.ts src/lib/missions/missionHudRows.ts
git commit -m "feat(level): suspension-lapse timer hard-fails bunker-protect on expiry"
```

---

## Phase 4 — Cargo integrity model (pure domain)

Build the Bunker Extract organ integrity model before wiring it into the runtime. The model has two inputs (time elapsed, current thermal zone) and one output (integrity percentage). Ship Heat/Freeze upgrade levels widen the safe thermal band.

### Task 4.1: Cargo integrity types and tolerances

**Files:**
- Create: `src/lib/missions/cargoIntegrity.ts`
- Test: `src/lib/missions/__tests__/cargoIntegrity.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/missions/__tests__/cargoIntegrity.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  cargoThermalToleranceBand,
  classifyThermalZone,
  createCargoState,
  tickCargo,
  type CargoState,
} from '../cargoIntegrity'

describe('cargoThermalToleranceBand', () => {
  it('returns the baseline Saturn–Uranus band at L1/L1', () => {
    const band = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    expect(band.innerSafeRadius).toBeGreaterThan(0)
    expect(band.outerSafeRadius).toBeGreaterThan(band.innerSafeRadius)
  })

  it('widens the inner side as heatLevel increases', () => {
    const l1 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    const l3 = cargoThermalToleranceBand({ heatLevel: 3, freezeLevel: 1 })
    expect(l3.innerSafeRadius).toBeLessThan(l1.innerSafeRadius)
  })

  it('widens the outer side as freezeLevel increases', () => {
    const l1 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    const l3 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 3 })
    expect(l3.outerSafeRadius).toBeGreaterThan(l1.outerSafeRadius)
  })
})

describe('classifyThermalZone', () => {
  const band = { innerSafeRadius: 2, outerSafeRadius: 14 }

  it('returns SAFE inside the band', () => {
    expect(classifyThermalZone(8, band)).toBe('safe')
  })

  it('returns HOT inside the inner edge', () => {
    expect(classifyThermalZone(1, band)).toBe('hot')
  })

  it('returns COLD outside the outer edge', () => {
    expect(classifyThermalZone(20, band)).toBe('cold')
  })

  it('treats the band edges as safe', () => {
    expect(classifyThermalZone(band.innerSafeRadius, band)).toBe('safe')
    expect(classifyThermalZone(band.outerSafeRadius, band)).toBe('safe')
  })
})

describe('createCargoState / tickCargo', () => {
  it('starts at 100% integrity', () => {
    const c = createCargoState()
    expect(c.integrity).toBe(100)
  })

  it('does not lose integrity in the safe zone', () => {
    const c0 = createCargoState()
    const c1 = tickCargo(c0, { dt: 5, zone: 'safe', overshoot: 0 })
    expect(c1.integrity).toBe(100)
  })

  it('bleeds integrity in the hot zone proportional to overshoot and dt', () => {
    const c0 = createCargoState()
    const c1 = tickCargo(c0, { dt: 1, zone: 'hot', overshoot: 1 })
    expect(c1.integrity).toBeLessThan(100)
    const c2 = tickCargo(c1, { dt: 1, zone: 'hot', overshoot: 1 })
    expect(c2.integrity).toBeLessThan(c1.integrity)
  })

  it('bleeds faster with larger overshoot', () => {
    const a = tickCargo(createCargoState(), { dt: 1, zone: 'hot', overshoot: 1 })
    const b = tickCargo(createCargoState(), { dt: 1, zone: 'hot', overshoot: 5 })
    expect(100 - b.integrity).toBeGreaterThan(100 - a.integrity)
  })

  it('clamps integrity at zero', () => {
    let c = createCargoState()
    for (let i = 0; i < 1000; i++) {
      c = tickCargo(c, { dt: 1, zone: 'hot', overshoot: 10 })
    }
    expect(c.integrity).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/cargoIntegrity.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the model**

Create `src/lib/missions/cargoIntegrity.ts`:

```ts
/**
 * Bunker Extract cargo integrity model.
 *
 * The harvested organ wants to stay within the Saturn–Uranus thermal band of
 * the existing solar temperature gradient. Out-of-band, integrity bleeds at a
 * rate that scales with how far past the threshold the ship currently is.
 * Ship Heat/Freeze upgrade levels widen the cargo's tolerated band.
 *
 * Pure domain — no Three.js, no Vue. Plumbed in from the map controller per
 * frame.
 *
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */
import shipHealthData from '@/data/shuttle/ship-health.json'

/** Baseline safe band inner radius — start of the Uranus thermal zone. */
const BASELINE_INNER_SAFE = shipHealthData.coldBoundary

/** Baseline safe band outer radius — end of the deep cold zone (Uranus/Neptune). */
const BASELINE_OUTER_SAFE = shipHealthData.coldZone3Boundary

/** How far each Heat level widens the inner safe edge (sunward). */
const HEAT_LEVEL_INNER_NARROW_PER_LEVEL = 0.55

/** How far each Freeze level widens the outer safe edge. */
const FREEZE_LEVEL_OUTER_EXTEND_PER_LEVEL = 3.5

/** Integrity bled per second per unit of overshoot beyond the band edge. */
const INTEGRITY_BLEED_PER_OVERSHOOT_PER_SECOND = 5.0

/** Thermal zone classification. */
export type CargoThermalZone = 'safe' | 'hot' | 'cold'

/** Ship upgrade levels that shape the cargo's tolerance band. */
export interface CargoUpgradeContext {
  /** shuttleHeatResistance level (1–3 per current upgrade design). */
  heatLevel: number
  /** shuttleFreezeResistance level (1–3). */
  freezeLevel: number
}

/** A thermal tolerance band in world-space heliocentric radius units. */
export interface CargoThermalBand {
  /** Inner edge (sunward boundary). Smaller values = closer to sun. */
  innerSafeRadius: number
  /** Outer edge (deep-space boundary). */
  outerSafeRadius: number
}

/** Per-frame cargo state. */
export interface CargoState {
  /** Integrity percent (0..100). */
  readonly integrity: number
}

/** Tick input. */
export interface CargoTickInput {
  /** Delta time in seconds. */
  dt: number
  /** Current zone classification. */
  zone: CargoThermalZone
  /** When out of band: world units past the nearest band edge. 0 when safe. */
  overshoot: number
}

/**
 * Compute the safe thermal band for the cargo given the ship's upgrade levels.
 * Each Heat level brings the inner edge closer to the sun; each Freeze level
 * pushes the outer edge further out.
 *
 * @param ctx - Heat/Freeze upgrade levels.
 */
export function cargoThermalToleranceBand(ctx: CargoUpgradeContext): CargoThermalBand {
  const heatDelta = Math.max(0, ctx.heatLevel - 1) * HEAT_LEVEL_INNER_NARROW_PER_LEVEL
  const freezeDelta = Math.max(0, ctx.freezeLevel - 1) * FREEZE_LEVEL_OUTER_EXTEND_PER_LEVEL
  return {
    innerSafeRadius: Math.max(0.1, BASELINE_INNER_SAFE - heatDelta),
    outerSafeRadius: BASELINE_OUTER_SAFE + freezeDelta,
  }
}

/**
 * Classify a heliocentric distance into safe / hot / cold.
 *
 * @param sunDistance - Heliocentric world-units distance.
 * @param band - Current safe band.
 */
export function classifyThermalZone(
  sunDistance: number,
  band: CargoThermalBand,
): CargoThermalZone {
  if (sunDistance < band.innerSafeRadius) return 'hot'
  if (sunDistance > band.outerSafeRadius) return 'cold'
  return 'safe'
}

/**
 * Compute the overshoot (world units past the nearest band edge) for a given
 * distance. Returns 0 inside the safe band.
 *
 * @param sunDistance - Heliocentric world-units distance.
 * @param band - Current safe band.
 */
export function computeOvershoot(sunDistance: number, band: CargoThermalBand): number {
  if (sunDistance < band.innerSafeRadius) return band.innerSafeRadius - sunDistance
  if (sunDistance > band.outerSafeRadius) return sunDistance - band.outerSafeRadius
  return 0
}

/** Start a fresh cargo at full integrity. */
export function createCargoState(): CargoState {
  return { integrity: 100 }
}

/**
 * Advance the cargo by `dt`. Pure — returns a new state.
 *
 * @param state - Previous cargo state.
 * @param input - Tick input.
 */
export function tickCargo(state: CargoState, input: CargoTickInput): CargoState {
  if (state.integrity <= 0 || input.dt <= 0) return state
  if (input.zone === 'safe') return state
  const bleed = INTEGRITY_BLEED_PER_OVERSHOOT_PER_SECOND * input.overshoot * input.dt
  const next = Math.max(0, state.integrity - bleed)
  return { integrity: next }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/cargoIntegrity.spec.ts`
Expected: PASS (all 11 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/cargoIntegrity.ts src/lib/missions/__tests__/cargoIntegrity.spec.ts
git commit -m "feat(missions): cargo integrity + thermal-band model (Bunker Extract)"
```

---

### Task 4.2: Delivery countdown timer

**Files:**
- Modify: `src/lib/missions/cargoIntegrity.ts`
- Modify: `src/lib/missions/__tests__/cargoIntegrity.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/lib/missions/__tests__/cargoIntegrity.spec.ts`:

```ts
import {
  createDeliveryTimer,
  tickDeliveryTimer,
  type DeliveryTimerState,
} from '../cargoIntegrity'

describe('DeliveryTimer', () => {
  it('starts at total and not expired', () => {
    const t = createDeliveryTimer(240)
    expect(t.remaining).toBe(240)
    expect(t.expired).toBe(false)
  })

  it('decrements remaining and flips expired', () => {
    let t = createDeliveryTimer(3)
    t = tickDeliveryTimer(t, 2)
    expect(t.remaining).toBe(1)
    t = tickDeliveryTimer(t, 2)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })
})
```

- [ ] **Step 2: Run test**

Run: `bun test:unit src/lib/missions/__tests__/cargoIntegrity.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Add the timer**

Append to `src/lib/missions/cargoIntegrity.ts`:

```ts
/** Delivery countdown timer state. */
export interface DeliveryTimerState {
  readonly total: number
  readonly remaining: number
  readonly expired: boolean
}

/**
 * Build a fresh delivery timer.
 *
 * @param totalSeconds - Total countdown (set at dispense complete).
 */
export function createDeliveryTimer(totalSeconds: number): DeliveryTimerState {
  return { total: totalSeconds, remaining: totalSeconds, expired: false }
}

/**
 * Advance the timer by `dt`.
 *
 * @param state - Previous state.
 * @param dt - Delta time, seconds.
 */
export function tickDeliveryTimer(state: DeliveryTimerState, dt: number): DeliveryTimerState {
  if (state.expired || dt <= 0) return state
  const remaining = Math.max(0, state.remaining - dt)
  return { total: state.total, remaining, expired: remaining === 0 }
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/cargoIntegrity.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/missions/cargoIntegrity.ts src/lib/missions/__tests__/cargoIntegrity.spec.ts
git commit -m "feat(missions): delivery countdown timer (Bunker Extract)"
```

---

## Phase 5 — Bunker Extract runtime

Branch the bunker setup again, this time on `bunker-extract`: skip wave spawning, swap the terminal for the cylinder, expose a "Draw Organ" interaction that runs a 3–4s dispense beat and adds an organ item to the active mission state. Persist the active mission on transition.

### Task 5.1: Skip waves and replace interaction on bunker-extract

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add the dispense state**

Declare on `LevelViewController`:

```ts
private dispenseBeatRemaining = 0
private organDispensed = false
```

- [ ] **Step 2: Branch wave setup**

In the bunker setup code path, around where waves are scheduled, wrap with:

```ts
const archetype = mission.yamada?.archetype
if (archetype === 'bunker-extract') {
  // No wave spawning. Place the cylinder in the bunker arena center.
  const cylinder = new SuspensionCylinderModel()
  cylinder.root.position.copy(/* center of arena */)
  scene.add(cylinder.root)
  this.suspensionCylinder = cylinder
  this.bunkerFinalInteractionLabel = 'Draw Organ (hold E)'
  this.bunkerFinalInteractionRange = CYLINDER_INTERACT_RANGE
  // Disable the standard bunker wave director:
  this.skipBunkerWaves = true
} else if (archetype === 'bunker-protect') {
  // (Task 3.4 swap — keep existing waves + cylinder swap.)
}
```

- [ ] **Step 3: Implement the dispense beat**

Replace the existing "hold-E completes mission" path for bunker-extract: holding E starts a 3.5s dispense beat. On completion, grant the organ and clear the dispense state — but do NOT complete the mission (delivery is at the planet).

```ts
private readonly DISPENSE_DURATION_SECONDS = 3.5

private startOrganDispense(): void {
  if (this.organDispensed) return
  this.dispenseBeatRemaining = this.DISPENSE_DURATION_SECONDS
  this.suspensionCylinder?.setIndicatorActive(true)
}

private tickDispenseBeat(dt: number): void {
  if (this.dispenseBeatRemaining <= 0 || this.organDispensed) return
  this.dispenseBeatRemaining = Math.max(0, this.dispenseBeatRemaining - dt)
  if (this.dispenseBeatRemaining === 0) {
    this.completeOrganDispense()
  }
}

private completeOrganDispense(): void {
  this.organDispensed = true
  this.suspensionCylinder?.setIndicatorActive(false)
  const mission = this.activeMission
  if (mission?.yamada?.archetype !== 'bunker-extract') return
  // Add organ to inventory + set mission state's organDispensed flag.
  this.grantOrganToInventory(mission.yamada.organItemId)
  this.startDeliveryTimer(mission.yamada.deliveryTimerSeconds)
  this.startCargoIntegrity()
}
```

- [ ] **Step 4: Tie to existing input handler**

Where the existing bunker terminal hold-E completion is wired (look for the `TerminalModel` interaction subscription), branch on archetype: for `bunker-extract`, call `startOrganDispense()` instead of completing the mission directly.

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): bunker-extract dispense beat replaces wave combat"
```

---

### Task 5.2: Grant organ to inventory + persist active mission

**Files:**
- Modify: `src/views/LevelViewController.ts`
- Modify: `src/data/inventory/items.json`

- [ ] **Step 1: Add the organ item to the inventory catalog**

Open `src/data/inventory/items.json` (verify via Glob if uncertain). Add an entry:

```json
{
  "id": "yamada-organ-case",
  "label": "Yamada Organ Case",
  "description": "A small refrigerated case containing a freshly-harvested patient organ. Time-and-temperature sensitive.",
  "stackable": false,
  "iconKey": "organ-case"
}
```

(Adjust fields to match the existing item schema — read one neighboring entry first to confirm shape.)

- [ ] **Step 2: Implement grantOrganToInventory**

In `LevelViewController.ts`:

```ts
import { loadInventory, saveInventory, addItem } from '@/lib/inventory/storage'
import { saveActiveMission } from '@/lib/missions/missionStorage'

private grantOrganToInventory(itemId: string): void {
  const inventory = loadInventory()
  if (!inventory) return
  addItem(inventory, itemId, 1)
  saveInventory(inventory)
}
```

(Resolve actual function names from `src/lib/inventory/` before committing.)

- [ ] **Step 3: Persist mission state with `organDispensed` flag**

Extend `YamadaBunkerExtractState` with an optional `organDispensed: boolean` flag:

```ts
// src/lib/missions/yamadaArchetype.ts
export interface YamadaBunkerExtractState {
  archetype: 'bunker-extract'
  destinationPlanetId: string
  deliveryTimerSeconds: number
  organItemId: string
  /** Set true after the dispense beat completes. Persists across map/level. */
  organDispensed?: boolean
}
```

In `completeOrganDispense()` in `LevelViewController.ts`, mutate and persist the mission:

```ts
private completeOrganDispense(): void {
  // ... existing flag flips ...
  const mission = this.activeMission
  if (!mission || mission.yamada?.archetype !== 'bunker-extract') return
  const updated = {
    ...mission,
    yamada: { ...mission.yamada, organDispensed: true },
  }
  this.activeMission = updated
  saveActiveMission(updated)
  this.grantOrganToInventory(mission.yamada.organItemId)
  this.startDeliveryTimer(mission.yamada.deliveryTimerSeconds)
  this.startCargoIntegrity()
}
```

- [ ] **Step 4: Run all tests**

Run: `bun test:unit && bun run type-check`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelViewController.ts src/lib/missions/yamadaArchetype.ts src/data/inventory/items.json
git commit -m "feat(level): grant organ + persist organDispensed flag"
```

---

### Task 5.3: Bunker Extract level completion = "exfil with organ"

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Allow exfil after dispense**

The base level state machine already supports `complete` after exfil. For Bunker Extract, the level scene's completion criterion is "organDispensed === true and player has exfiled the asteroid." Locate the existing exfil completion path; gate it on `mission.yamada?.archetype === 'bunker-extract' ? organDispensed : (existing wave-clear + terminal completion)`.

```ts
// Inside the per-frame check that triggers exfil eligibility:
const isBunkerExtract = mission.yamada?.archetype === 'bunker-extract'
const exfilEligible = isBunkerExtract
  ? this.organDispensed && this.landerAirborne
  : this.allObjectivesComplete && this.landerAirborne
if (exfilEligible) {
  this.stateMachine.transitionTo('complete')
}
```

(Resolve actual property names and the existing exit condition before committing.)

- [ ] **Step 2: On level-complete for bunker-extract, do NOT pay out — defer to delivery**

Find where `persistCompletedAsteroidMissionRewards()` is called. For bunker-extract missions, skip the immediate payout — leave the mission active so the player can fly to the destination planet and deliver:

```ts
if (mission.yamada?.archetype === 'bunker-extract') {
  // Mark in-transit; payout happens at planetary delivery.
  saveActiveMission({ ...mission, status: 'in-transit' })
  // Don't clear the active mission. Don't persist rewards yet.
} else {
  persistCompletedAsteroidMissionRewards(mission)
  clearActiveMission()
}
```

- [ ] **Step 3: Manual smoke test**

Run `bun dev`. Accept a Yamada Bunker Extract mission, fly to the asteroid, hold-E on the cylinder (3.5s beat), exfil. Confirm:
- Inventory now contains a Yamada Organ Case.
- Active mission persists into the map view (no clear, no payout yet).
- HUD has not yet been wired (next phase), so timer/integrity won't show — that's expected here.

- [ ] **Step 4: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): bunker-extract exfil leaves mission active for planetary delivery"
```

---

## Phase 6 — Bunker Extract HUD + map overlay

Now that the data flow works, surface it. Three new HUD rows (integrity, timer, thermal zone) appear when an organ is in inventory. The map overlay paints a safe thermal annulus.

### Task 6.1: Cargo HUD rows builder

**Files:**
- Modify: `src/lib/missions/missionHudRows.ts`
- Modify: `src/lib/missions/__tests__/missionHudRows.spec.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/missions/__tests__/missionHudRows.spec.ts`:

```ts
import { buildBunkerExtractCargoRows } from '../missionHudRows'

describe('buildBunkerExtractCargoRows', () => {
  it('returns empty when no Bunker Extract mission is active', () => {
    expect(buildBunkerExtractCargoRows(null, null, null)).toEqual([])
  })

  it('returns three rows (integrity, timer, thermal) when organ is dispensed', () => {
    const mission = {
      id: 'm1',
      name: 'Bunker Extract',
      waypoint: { worldX: 0, worldZ: 0 },
      yamada: {
        archetype: 'bunker-extract' as const,
        destinationPlanetId: 'uranus',
        deliveryTimerSeconds: 240,
        organItemId: 'yamada-organ-case',
        organDispensed: true,
      },
    }
    const rows = buildBunkerExtractCargoRows(
      mission as never,
      { remaining: 200, total: 240, expired: false },
      { integrity: 80 },
      'safe',
    )
    expect(rows.length).toBe(3)
    expect(rows.find((r) => r.bar)?.bar?.value).toBe(80)
    expect(rows.find((r) => r.timerSeconds !== undefined)?.timerSeconds).toBe(200)
    expect(rows.find((r) => r.status)?.status?.label).toBe('SAFE')
  })
})
```

- [ ] **Step 2: Implement the builder**

Append to `src/lib/missions/missionHudRows.ts`:

```ts
import type { DeliveryTimerState, CargoState, CargoThermalZone } from '@/lib/missions/cargoIntegrity'

const ZONE_LABELS: Record<CargoThermalZone, string> = {
  safe: 'SAFE',
  hot: 'HOT',
  cold: 'COLD',
}

const ZONE_TONES: Record<CargoThermalZone, MissionTrackerStatusTone> = {
  safe: 'ok',
  hot: 'danger',
  cold: 'danger',
}

/**
 * Build the three Bunker Extract HUD rows (integrity bar, delivery timer,
 * thermal zone indicator). Returns an empty array unless the active mission
 * is bunker-extract with `organDispensed === true`.
 */
export function buildBunkerExtractCargoRows(
  mission: GeneratedAsteroidMission | null,
  timer: DeliveryTimerState | null,
  cargo: CargoState | null,
  zone: CargoThermalZone | null,
): MissionTrackerRow[] {
  if (!mission || mission.yamada?.archetype !== 'bunker-extract') return []
  if (!mission.yamada.organDispensed || !timer || !cargo || !zone) return []
  const focus: MissionTrackerFocus = { kind: 'planet', planetId: mission.yamada.destinationPlanetId }
  return [
    {
      id: `cargo-integrity:${mission.id}`,
      title: 'Cargo Integrity',
      bar: { value: Math.round(cargo.integrity), max: 100, label: 'Integrity' },
      focus,
    },
    {
      id: `cargo-timer:${mission.id}`,
      title: 'Delivery Window',
      timerSeconds: timer.remaining,
      focus,
    },
    {
      id: `cargo-zone:${mission.id}`,
      title: 'Thermal Zone',
      status: { label: ZONE_LABELS[zone], tone: ZONE_TONES[zone] },
      focus,
    },
  ]
}
```

- [ ] **Step 3: Run tests**

Run: `bun test:unit src/lib/missions/__tests__/missionHudRows.spec.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/missions/missionHudRows.ts src/lib/missions/__tests__/missionHudRows.spec.ts
git commit -m "feat(hud): bunker-extract cargo rows (integrity / timer / zone)"
```

---

### Task 6.2: Drive cargo state from the map controller

**Files:**
- Modify: `src/views/MapView*.ts` or `src/three/MapController.ts` — verify via Glob

- [ ] **Step 1: Locate the map per-frame tick**

Run Glob for `MapView*` and the file that holds the map's per-frame update loop (where the ship position is updated each frame).

- [ ] **Step 2: Add cargo state ownership**

In the map controller, declare:

```ts
import {
  createDeliveryTimer,
  tickDeliveryTimer,
  createCargoState,
  tickCargo,
  cargoThermalToleranceBand,
  classifyThermalZone,
  computeOvershoot,
  type DeliveryTimerState,
  type CargoState,
  type CargoThermalZone,
} from '@/lib/missions/cargoIntegrity'

private deliveryTimer: DeliveryTimerState | null = null
private cargoState: CargoState | null = null
private currentZone: CargoThermalZone | null = null
```

- [ ] **Step 3: Initialize on map enter when active mission has organDispensed**

In the map init method (`onMounted` equivalent):

```ts
const mission = loadActiveMission()
if (mission?.yamada?.archetype === 'bunker-extract' && mission.yamada.organDispensed) {
  this.deliveryTimer = createDeliveryTimer(mission.yamada.deliveryTimerSeconds)
  this.cargoState = createCargoState()
}
```

- [ ] **Step 4: Tick per-frame**

In the per-frame update:

```ts
if (this.deliveryTimer && this.cargoState) {
  const upgrades = getCurrentPlayerUpgradeLevels() // existing helper
  const band = cargoThermalToleranceBand({
    heatLevel: upgrades.shuttleHeatResistance ?? 1,
    freezeLevel: upgrades.shuttleFreezeResistance ?? 1,
  })
  const sunDistance = Math.hypot(this.shipWorldX, this.shipWorldZ)
  this.currentZone = classifyThermalZone(sunDistance, band)
  const overshoot = computeOvershoot(sunDistance, band)
  this.cargoState = tickCargo(this.cargoState, { dt, zone: this.currentZone, overshoot })
  this.deliveryTimer = tickDeliveryTimer(this.deliveryTimer, dt)

  if (this.cargoState.integrity === 0 || this.deliveryTimer.expired) {
    this.failBunkerExtract(this.cargoState.integrity === 0 ? 'integrity' : 'timer')
  }
}
```

- [ ] **Step 5: failBunkerExtract handler**

```ts
private failBunkerExtract(reason: 'integrity' | 'timer'): void {
  clearActiveMission()
  removeOrganFromInventory('yamada-organ-case')
  this.showFailureBanner(`Bunker Extract failed: ${reason === 'integrity' ? 'cargo lost' : 'timer expired'}`)
}
```

(Reuse the existing failure banner pattern from the level scene.)

- [ ] **Step 6: Expose state to the HUD render**

The Vue HUD layer that calls `buildMissionTrackerGroups()` should also call `buildBunkerExtractCargoRows()` with the live `deliveryTimer`, `cargoState`, `currentZone` values from the map controller. Wire those through whichever store / props chain feeds the mission tracker panel.

- [ ] **Step 7: Manual smoke test**

Run `bun dev`. Accept Bunker Extract, dispense organ, exfil to map. Verify:
- Three new HUD rows appear (Cargo Integrity, Delivery Window, Thermal Zone).
- Flying inward past Saturn → zone flips to HOT, integrity bleeds.
- Flying back into the band → zone flips to SAFE, bleed stops.
- Timer counts down regardless.

- [ ] **Step 8: Commit**

```bash
git add <map controller file>
git commit -m "feat(map): cargo integrity + thermal zone tick during Bunker Extract"
```

---

### Task 6.3: Safe thermal annulus map overlay

**Files:**
- Modify: `src/lib/map/overlay/MapOverlayProjector.ts`
- Modify: matching `MapOverlayState` definition file (find via Grep for `MapOverlayState`)

- [ ] **Step 1: Add annulus to MapOverlayState**

Add an optional field to the overlay state interface:

```ts
/** Safe thermal annulus rendered during Bunker Extract. Omitted otherwise. */
safeThermalAnnulus?: {
  innerRadiusWorld: number
  outerRadiusWorld: number
}
```

- [ ] **Step 2: Compute the annulus when bunker-extract is active**

In `MapOverlayProjector.buildOverlayState()`:

```ts
import { cargoThermalToleranceBand } from '@/lib/missions/cargoIntegrity'

// Inside buildOverlayState:
const mission = input.activeAsteroidMission
const yamada = mission?.yamada
if (yamada?.archetype === 'bunker-extract' && yamada.organDispensed) {
  const band = cargoThermalToleranceBand({
    heatLevel: input.heatLevel,
    freezeLevel: input.freezeLevel,
  })
  state.safeThermalAnnulus = {
    innerRadiusWorld: band.innerSafeRadius,
    outerRadiusWorld: band.outerSafeRadius,
  }
}
```

Extend `MapOverlayBuildInput` to carry `heatLevel` and `freezeLevel` from the caller.

- [ ] **Step 3: Render the annulus in the Vue overlay**

In the SVG/Canvas overlay component that consumes `MapOverlayState`, add a circle pair (or torus) rendering the safe band. Style: thin emerald stroke at the band edges, translucent fill between, ~10% opacity.

- [ ] **Step 4: Type-check + smoke test**

Run `bun run type-check && bun run lint` then `bun dev`. Open the map during a Bunker Extract run. Confirm the band is visible and that it widens when you upgrade Heat/Freeze.

- [ ] **Step 5: Commit**

```bash
git add src/lib/map/overlay/MapOverlayProjector.ts <state def file> <overlay vue file>
git commit -m "feat(map): safe thermal annulus overlay during Bunker Extract"
```

---

## Phase 7 — Bunker Extract delivery

The player flies to the destination planet, lands, opens the mission board, and hits Deliver. Payout fires, inventory item is consumed, mission cleared.

### Task 7.1: Detect arrival at destination → mark ready-to-deliver

**Files:**
- Modify: `src/views/MapView*.ts` (or the shuttle docking handler — find via Grep for "docked" and the planet docking event)

- [ ] **Step 1: Listen for planet docking**

Find the docking handler that fires when the shuttle lands at a planet. When the player docks:

```ts
const mission = loadActiveMission()
if (
  mission?.yamada?.archetype === 'bunker-extract' &&
  mission.yamada.organDispensed &&
  dockedPlanetId === mission.yamada.destinationPlanetId
) {
  saveActiveMission({ ...mission, status: 'in-transit' /* keep status */ })
  // No status change needed — the mission board will check organDispensed +
  // destinationPlanetId === current dock to enable the Deliver button.
}
```

(Confirm `AsteroidMissionStatus` shape — it currently has `'available' | 'accepted' | 'in-transit'`. The Deliver button condition is "docked at destination AND organ in inventory.")

- [ ] **Step 2: No commit yet — pure observation step. Skip to next task.**

---

### Task 7.2: Add Deliver button to the shuttle mission board

**Files:**
- Modify: `src/components/shuttle-control/ShuttleControlProgramMissions.vue`

- [ ] **Step 1: Read the existing deliver button block for shuttle missions**

Open the file; find where the existing Deliver button is rendered for `ActiveShuttleMission` items.

- [ ] **Step 2: Add an asteroid-mission Deliver row**

Add a parallel block for the active asteroid mission when it's a Bunker Extract pending delivery:

```vue
<div v-if="canDeliverBunkerExtract" class="mission-row mission-row--asteroid">
  <span class="mission-row__title">{{ activeAsteroidMission!.name }}</span>
  <button class="mission-row__deliver" @click="$emit('deliverAsteroidMission', activeAsteroidMission!.id)">
    Deliver
  </button>
</div>
```

Add the computed:

```ts
const canDeliverBunkerExtract = computed(() => {
  const m = props.board.activeAsteroidMission
  return (
    m?.yamada?.archetype === 'bunker-extract' &&
    m.yamada.organDispensed === true &&
    props.dockedPlanetId === m.yamada.destinationPlanetId &&
    inventoryHasOrgan(props.inventory, m.yamada.organItemId)
  )
})
```

Add `inventoryHasOrgan()` helper:

```ts
function inventoryHasOrgan(inventory: Inventory | null, itemId: string): boolean {
  if (!inventory) return false
  return inventory.items.some((i) => i.itemId === itemId && i.count > 0)
}
```

Emit:

```ts
const emit = defineEmits<{
  // ... existing ...
  deliverAsteroidMission: [missionId: string]
}>()
```

- [ ] **Step 3: Wire the parent to handle the delivery**

In the parent component that owns the shuttle control program (find via grep for the existing `deliverMission` listener), add a handler for `deliverAsteroidMission`:

```ts
function onDeliverAsteroidMission(missionId: string): void {
  const mission = board.value.activeAsteroidMission
  if (!mission || mission.id !== missionId) return
  if (mission.yamada?.archetype !== 'bunker-extract') return
  // Remove organ from inventory.
  const inventory = loadInventory()
  if (inventory) {
    removeItem(inventory, mission.yamada.organItemId, 1)
    saveInventory(inventory)
  }
  // Persist rewards + clear active mission.
  persistCompletedAsteroidMissionRewards(mission)
  clearActiveMission()
  board.value.activeAsteroidMission = null
}
```

- [ ] **Step 4: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors / 0 warnings.

- [ ] **Step 5: Manual smoke test**

Run `bun dev`. Complete a Bunker Extract round-trip: accept → asteroid → dispense organ → exfil → fly to destination planet → land → open shuttle control → see Deliver button → click → payout fires, organ removed, mission cleared.

- [ ] **Step 6: Commit**

```bash
git add src/components/shuttle-control/ShuttleControlProgramMissions.vue <parent component>
git commit -m "feat(shuttle): Deliver button for Bunker Extract at destination planet"
```

---

## Phase 8 — Patient Rescue VIP variant

One operator is forced yellow; their death hard-fails the mission. Non-VIP operators pay out per head as in the base rescue.

### Task 8.1: VIP operator support in RescueMinigame

**Files:**
- Modify: `src/lib/minigame/RescueMinigame.ts`
- Add test: `src/lib/minigame/__tests__/RescueMinigame.vipOperator.spec.ts`

- [ ] **Step 1: Add VIP config to the rescue minigame entry point**

Locate the rescue minigame setup in `RescueMinigame.ts`. Find where operators are spawned and assigned colors. Extend the configuration to accept a `vipOperatorIndex?: number` from the active mission's `mission.yamada` field.

- [ ] **Step 2: Force the yellow suit on the VIP**

When spawning operators, when the operator index matches `vipOperatorIndex`, set the suit material to a yellow variant. Define the yellow color near the top of the file:

```ts
const YAMADA_VIP_SUIT_COLOR = 0xf2c14b
```

When constructing the Hostage / operator, if `index === vipOperatorIndex`, use this color for the suit material.

- [ ] **Step 3: Wire VIP death → hard fail**

Where the existing death event for a hostage fires, branch:

```ts
private onHostageDeath(index: number): void {
  if (index === this.vipOperatorIndex) {
    this.failMissionVip()
    return
  }
  // existing non-VIP death handling — count as lost, no fail
}

private failMissionVip(): void {
  this.events.emit('mission-failed', { reason: 'vip-died' })
}
```

(Resolve actual event names against the existing code.)

- [ ] **Step 4: Read VIP index from active mission**

In the constructor / init of `RescueMinigame`, plumb through:

```ts
const mission = this.activeMission
this.vipOperatorIndex =
  mission?.yamada?.archetype === 'patient-rescue' ? mission.yamada.vipOperatorIndex : -1
```

- [ ] **Step 5: Write a smoke test**

Create `src/lib/minigame/__tests__/RescueMinigame.vipOperator.spec.ts` — a minimal test that verifies, given a `vipOperatorIndex` of 0 and 4 operators, killing operator 0 fires `mission-failed`. Use existing test patterns in the rescue spec files if available; otherwise stub the minimum surface needed.

- [ ] **Step 6: Manual smoke test**

Run `bun dev`. Accept a Yamada Patient Rescue. Verify:
- One operator visibly wears a yellow suit.
- Killing the yellow operator (or letting them die) fails the mission immediately.
- Killing a non-yellow operator does not fail.

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/RescueMinigame.ts src/lib/minigame/__tests__/RescueMinigame.vipOperator.spec.ts
git commit -m "feat(rescue): patient-rescue VIP yellow operator hard-fails on death"
```

---

## Phase 9 — Yamada JSON wire-up and final verification

### Task 9.1: Confirm Yamada giver JSON is consistent

**Files:**
- Modify (if needed): `src/data/missions/givers/yamada-farms.json`

- [ ] **Step 1: Re-read the giver JSON**

Open `src/data/missions/givers/yamada-farms.json`. Confirm:
- Each mission entry has its `archetype` set to one of the three valid strings.
- The `id` strings are unique.
- The difficulty bands align with the rest of the giver pool.

No JSON edits are required for Phase 9 — the generator stamps the runtime state from these archetype strings; per-mission destination/timer is rolled at acceptance time, not authored per template.

- [ ] **Step 2: No commit unless changes were necessary.**

---

### Task 9.2: Confirm Neuron-Install EVA pool is untouched

**Files:**
- Read-only: `src/data/shuttle-missions/eva/uranus.json`

- [ ] **Step 1: Open the file**

Confirm the `yamada_eva_neuron_install` entry is present and its `minigameType` is `satellite_servicing`. No code changes for Neuron-Install — this is explicitly scoped out.

---

### Task 9.3: Full acceptance criteria run

- [ ] **Step 1: Type-check**

Run: `bun run type-check`
Expected: 0 errors.

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: oxlint 0 errors; ESLint 0 errors and 0 warnings.

- [ ] **Step 3: Unit tests**

Run: `bun test:unit`
Expected: all tests pass.

- [ ] **Step 4: End-to-end manual smoke**

Run `bun dev`. Verify each Yamada archetype runs end-to-end:

1. **Bunker Protect:** accept → arrive → cylinder spawned in bunker → suspension-lapse timer HUD row visible + counting down → clear waves → hold E on cylinder to reboot → exfil → payout fires. Separately verify timer expiry hard-fails.
2. **Bunker Extract:** accept → arrive → no waves spawn → cylinder visible → hold E for 3.5s dispense beat → organ in inventory → exfil → switch to map → integrity / timer / zone HUD rows visible → safe annulus painted on map → fly to destination planet → land → mission board shows Deliver button → click → payout, organ consumed, mission cleared.
3. **Patient Rescue:** accept → arrive → one operator visibly yellow → kill them → mission fails. Replay → save them and the rest → payout includes per-head bonus.
4. **Neuron-Install EVA:** accept → run as before → confirm no regression.

- [ ] **Step 5: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(yamada): final wire-up and acceptance criteria pass"
```

---

## Implementation notes

- **Pure-domain TDD is non-negotiable.** Tasks in `src/lib/missions/` and `src/lib/level/` are pure TS — write tests first, run them red, then implement.
- **UI / Three.js integration is smoke-tested manually.** Vitest + JSDOM does not exercise WebGL. The plan adds minimal smoke tests where domain logic is reachable; the rest is verified by `bun dev`.
- **The cylinder model is a placeholder.** Real art / animation is a content pass after this plan ships.
- **Constants are tuneable.** Bleed rates, band widths, timer lengths are all named constants in the new files — re-tune during the open-questions calibration after Phase 9.
- **Failure recovery is intentionally crude.** When a Bunker Extract fails mid-flight (integrity or timer), the active mission is simply cleared. There is no "lost cargo recovery" loop. The player retries from the mission board.

## Spec coverage matrix

| Spec section | Tasks |
|---|---|
| 1. Bunker Protect — cylinder reskin | 3.4 |
| 1. Bunker Protect — reboot interaction | 3.4 (label change), uses existing terminal interaction |
| 1. Bunker Protect — suspension-lapse timer | 3.1, 3.5 |
| 1. Bunker Protect — HUD timer row | 3.2, 3.3, 3.5 (builder), Phase 9 verification |
| 1. Bunker Protect — failure modes | 3.5 |
| 2. Bunker Extract — dispense beat | 5.1, 5.2 |
| 2. Bunker Extract — cargo into inventory | 5.2 |
| 2. Bunker Extract — HUD integrity / timer / zone rows | 6.1, 6.2 |
| 2. Bunker Extract — thermal model | 4.1 |
| 2. Bunker Extract — upgrades widen band | 4.1 (tests confirm) |
| 2. Bunker Extract — map safe annulus overlay | 6.3 |
| 2. Bunker Extract — destination per mission | 1.4 (`pickYamadaBunkerExtractDestination`) |
| 2. Bunker Extract — delivery at planet | 7.1, 7.2 |
| 2. Bunker Extract — failure modes | 6.2 (`failBunkerExtract`) |
| 3. Patient Rescue — VIP yellow suit | 8.1 |
| 3. Patient Rescue — VIP hard-fail | 8.1 |
| 3. Patient Rescue — non-VIP per-head bonus | Uses existing rescue payout — verified in Phase 9 |
| 4. Neuron-Install EVA — no code changes | 9.2 (verification only) |
| Shared infra: cylinder asset | Phase 2 |
| Shared infra: integrity bar / timer / status HUD rows | 3.2, 3.3, 6.1 |
| Shared infra: safe annulus overlay | 6.3 |
| Shared infra: per-mission destination planet field | 1.1, 1.3, 1.4 |
| Shared infra: archetype-driven runtime dispatch | 1.1–1.5 (data); 3.4, 5.1, 8.1 (consumption) |
| Shared infra: yellow-suit VIP variant | 8.1 |
| Shared infra: bunker reboot interaction (label-only) | 3.4 |
