# EVA Minigame Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared substrate that lets three EVA minigames (`telescope_alignment`, `relay_repair`, `satellite_servicing`) plug into the existing EVA terminal flow. Two use the existing Vue overlay pattern; one drives the 3D scene directly. After this plan ships, per-minigame plans can be implemented in parallel.

**Architecture:** Add an `OrbitalMiniGamePresentation` discriminator (`'overlay' | 'in_scene'`) to the `OrbitalMiniGame` interface. `MapViewController.beginEvaMinigame` branches on it: overlay mode is today's path; in-scene mode hands control to a new `SatelliteRepairController` in `src/three/`. Seeded damage rolls at mission-accept time drive which satellite components are broken, stored on `ActiveVisitRelayMission`. Scoped to the original `SatelliteModel` only — Hubble + Voyager POIs fall back to the default stub for `satellite_servicing`.

**Tech Stack:** TypeScript (strict), Vue 3 SFC, Three.js, Vitest (unit tests), Pinia (unchanged), Tailwind CSS v4 + `@apply`.

**Spec:** `docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md`

---

## File Structure

### Modified files

| File | Responsibility after this plan |
|---|---|
| `src/lib/minigame/OrbitalMiniGame.ts` | Adds `OrbitalMiniGamePresentation` type and `presentation` field on the interface. |
| `src/lib/minigame/DefaultOrbitalMiniGame.ts` | Declares `readonly presentation = 'overlay' as const`. |
| `src/lib/minigame/gasCollection/GasCollectionMiniGame.ts` | Same — `presentation = 'overlay'`. |
| `src/lib/minigame/iceHarvest/IceHarvestMiniGame.ts` | Same. |
| `src/lib/minigame/maintenance/MaintenanceMiniGame.ts` | Same. |
| `src/lib/minigame/logistics/LogisticsRouteMiniGame.ts` | Same. |
| `src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts` | Same. |
| `src/lib/minigame/orbitalMiniGameFactory.ts` | Adds optional `mission?: ActiveVisitRelayMission` parameter; dispatches `satellite_servicing` case. |
| `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts` | Presentation assertions; new `satellite_servicing` test case. |
| `src/lib/missions/types.ts` | Adds optional `brokenComponents?: string[]` to `ActiveVisitRelayMission`. |
| `src/lib/missions/shuttleMissionSession.ts` | `acceptEvaMission` rolls seeded damage for `satellite_servicing` missions. |
| `src/views/MapViewController.ts` | `beginEvaMinigame` threads mission into factory and branches on `presentation`. |
| `src/components/EvaMinigameOverlay.vue` | Becomes a `v-if` dispatcher with the default card as final fallback. |

### New files

| File | Responsibility |
|---|---|
| `src/data/satellite-manifests.json` | Per-`poiType` list of rigged component names eligible for damage. |
| `src/lib/satellites/satelliteManifests.ts` | Typed loader + `validateManifest(poiObject, manifestKey)` helper. |
| `src/lib/satellites/__tests__/satelliteManifests.spec.ts` | Manifest loader + validation tests. |
| `src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts` | Seeded damage roll tests (determinism, difficulty tiers). |
| `src/lib/minigame/satelliteServicing/SatelliteServicingMiniGame.ts` | `OrbitalMiniGame` impl with `presentation: 'in_scene'`; tracks `_repaired` set. |
| `src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts` | Class-level tests. |
| `src/three/SatelliteRepairController.ts` | Skeleton in-scene controller: wireframe overlay on broken components, proximity FIX prompt, single-click stub repair. Drag mechanic ships in a later plan. |

### Phases

- **Phase W1** (Tasks 1–3) — Interface + dispatch. No player-visible change. Lands first.
- **Phase W2** (Task 4) — Overlay dispatcher. No player-visible change. Clears the way for telescope + relay plans to add branches.
- **Phase W3** (Tasks 5–10) — Satellite in-scene skeleton. Player-visible: a satellite EVA mission shows red wireframes on 1–3 components; press F at each to stub-repair; mission completes; CR paid.

---

## Task 1: Add `presentation` field to `OrbitalMiniGame` interface and all existing implementations

**Files:**
- Modify: `src/lib/minigame/OrbitalMiniGame.ts`
- Modify: `src/lib/minigame/DefaultOrbitalMiniGame.ts`
- Modify: `src/lib/minigame/gasCollection/GasCollectionMiniGame.ts`
- Modify: `src/lib/minigame/iceHarvest/IceHarvestMiniGame.ts`
- Modify: `src/lib/minigame/maintenance/MaintenanceMiniGame.ts`
- Modify: `src/lib/minigame/logistics/LogisticsRouteMiniGame.ts`
- Modify: `src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts`
- Test: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`

- [ ] **Step 1: Add presentation assertions to the factory test (will fail until impl lands)**

Edit `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`. Add a new `describe` block **after** the existing `describe('createOrbitalMiniGame', ...)`:

```ts
describe('OrbitalMiniGame.presentation', () => {
  const cases: Array<[string, string]> = [
    ['gas-collection', 'overlay'],
    ['ice-harvest', 'overlay'],
    ['maintenance', 'overlay'],
    ['chemistry', 'overlay'],
    ['logistics', 'overlay'],
    ['probe-deploy', 'overlay'],
    ['unknown-type', 'overlay'], // default falls through to overlay
  ]

  for (const [type, expected] of cases) {
    it(`reports presentation "${expected}" for ${type}`, () => {
      const mg = createOrbitalMiniGame('m', type, 3, 'mercury')
      expect(mg.presentation).toBe(expected)
    })
  }
})
```

- [ ] **Step 2: Run the test — confirm it fails on "presentation is undefined"**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: FAIL. Error mentions `presentation` is undefined on the returned instances.

- [ ] **Step 3: Add `OrbitalMiniGamePresentation` type + `presentation` field to the interface**

Edit `src/lib/minigame/OrbitalMiniGame.ts`. Add between the `OrbitalMiniGameStatus` type and `OrbitalMiniGameStep` interface:

```ts
/** How this minigame presents to the player. Determines whether the host opens a Vue overlay or yields camera/input control to an in-scene controller. */
export type OrbitalMiniGamePresentation = 'overlay' | 'in_scene'
```

Then update the `OrbitalMiniGame` interface to include:

```ts
export interface OrbitalMiniGame {
  /** Current minigame status. */
  readonly status: OrbitalMiniGameStatus
  /** How this minigame presents. Drives host dispatch between Vue overlay and in-scene controller. */
  readonly presentation: OrbitalMiniGamePresentation
  // …rest unchanged…
}
```

- [ ] **Step 4: Declare `presentation` on each existing implementation**

For each of the six classes below, add the field **immediately after** the `readonly missionId: string` declaration. Match existing file style (no semicolons).

`src/lib/minigame/DefaultOrbitalMiniGame.ts`:
```ts
  /** Default minigame renders as a Vue overlay card. */
  readonly presentation = 'overlay' as const
```

Same block (copy verbatim, TSDoc text may stay identical) into:
- `src/lib/minigame/gasCollection/GasCollectionMiniGame.ts`
- `src/lib/minigame/iceHarvest/IceHarvestMiniGame.ts`
- `src/lib/minigame/maintenance/MaintenanceMiniGame.ts`
- `src/lib/minigame/logistics/LogisticsRouteMiniGame.ts`
- `src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts`

- [ ] **Step 5: Run the full test suite**

Run: `bun test:unit`
Expected: all tests PASS, including the new `presentation` cases.

- [ ] **Step 6: Run type-check and lint**

Run: `bun run type-check`
Expected: exits 0.

Run: `bun run lint`
Expected: oxlint 0 errors, ESLint 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/OrbitalMiniGame.ts src/lib/minigame/DefaultOrbitalMiniGame.ts src/lib/minigame/gasCollection/GasCollectionMiniGame.ts src/lib/minigame/iceHarvest/IceHarvestMiniGame.ts src/lib/minigame/maintenance/MaintenanceMiniGame.ts src/lib/minigame/logistics/LogisticsRouteMiniGame.ts src/lib/minigame/probeDeploy/ProbeDeployMiniGame.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
git commit -m "feat: add presentation discriminator to OrbitalMiniGame interface"
```

---

## Task 2: Thread optional `mission` param through the factory

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/views/MapViewController.ts` (call site inside `beginEvaMinigame`)
- Test: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`

- [ ] **Step 1: Add a failing test for the new signature**

Edit `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`. Add at the top (after existing imports):

```ts
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
```

Add a new test inside `describe('createOrbitalMiniGame', ...)`:

```ts
it('accepts an optional mission param without breaking existing cases', () => {
  const mission = {
    template: {
      id: 'earth_sat_patch',
      name: 'Cubesat Patch',
      description: '',
      poiType: 'satellite',
      minigameType: 'maintenance',
      reward: 1500,
    },
    giverPlanet: 'earth',
    waypoint: { worldX: 0, worldZ: 0, poiLocalY: 0 },
    status: 'active',
  } as ActiveVisitRelayMission
  const mg = createOrbitalMiniGame('m', 'maintenance', 3, 'earth', mission)
  expect(mg.missionId).toBe('m')
})
```

- [ ] **Step 2: Run the test — confirm it fails on arity**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: FAIL. TypeScript compile error — `createOrbitalMiniGame` takes 4 args, not 5.

- [ ] **Step 3: Extend the factory signature**

Edit `src/lib/minigame/orbitalMiniGameFactory.ts`. Replace the whole file contents with:

```ts
/**
 * Orbital minigame factory.
 *
 * Dispatches on the minigameType string from planet-orbital-config.json
 * to create the appropriate OrbitalMiniGame implementation.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type { OrbitalMiniGame } from './OrbitalMiniGame'
import { DefaultOrbitalMiniGame } from './DefaultOrbitalMiniGame'
import { GasCollectionMiniGame } from './gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from './iceHarvest/IceHarvestMiniGame'
import { MaintenanceMiniGame } from './maintenance/MaintenanceMiniGame'
import { LogisticsRouteMiniGame } from './logistics/LogisticsRouteMiniGame'
import { ProbeDeployMiniGame } from './probeDeploy/ProbeDeployMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'

/**
 * Create an orbital minigame for the given mission and minigame type.
 *
 * @param missionId - The shuttle mission id.
 * @param minigameType - The minigame type from planet-orbital-config.json or EVA mission template.
 * @param targetGas - The gather quantity from the mission template.
 * @param planetId - The target planet id (used by probe-deploy and similar minigames).
 * @param mission - The active EVA mission, when the caller is on the EVA path. Gather-mission callers omit.
 * @returns A new OrbitalMiniGame instance.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
  planetId?: string,
  mission?: ActiveVisitRelayMission,
): OrbitalMiniGame {
  // `mission` is currently unused by every existing case. It's reserved for EVA
  // minigames (satellite_servicing) that read mission-level data like brokenComponents.
  void mission
  switch (minigameType) {
    case 'gas-collection':
      return new GasCollectionMiniGame(missionId, targetGas)
    case 'ice-harvest':
      return new IceHarvestMiniGame(missionId, targetGas)
    case 'maintenance':
      return new MaintenanceMiniGame(missionId, targetGas)
    case 'chemistry':
      return new GasCollectionMiniGame(missionId, targetGas)
    case 'logistics':
      return new LogisticsRouteMiniGame(missionId, targetGas)
    case 'probe-deploy':
      return new ProbeDeployMiniGame(missionId, targetGas, planetId ?? 'mercury')
    default:
      return new DefaultOrbitalMiniGame(missionId)
  }
}
```

- [ ] **Step 4: Thread `mission` through the EVA call site**

Edit `src/views/MapViewController.ts`. Find `beginEvaMinigame` (around line 2328). Replace the factory call block:

```ts
    const minigameType = mission.template.minigameType ?? 'default'
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
```

(The only change is the added `mission,` line.)

- [ ] **Step 5: Run tests + type-check + lint**

Run: `bun test:unit && bun run type-check && bun run lint`
Expected: all green, 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/views/MapViewController.ts
git commit -m "feat: thread active EVA mission through orbital minigame factory"
```

---

## Task 3: Branch `beginEvaMinigame` on `presentation`

**Files:**
- Modify: `src/views/MapViewController.ts` (`beginEvaMinigame`)

No unit test here — `MapViewController` is a Vue-layer integration module (per CLAUDE.md rule #2, tests focus on `src/lib/`). Verification is manual in-browser plus type-check/lint.

- [ ] **Step 1: Rewrite `beginEvaMinigame` to branch on presentation**

Edit `src/views/MapViewController.ts`. Replace the body of `beginEvaMinigame()` (around line 2328) with:

```ts
  private beginEvaMinigame(): void {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) {
      // No mission rendered — shouldn't happen in normal play; bail so we don't leave
      // the session stuck in minigame mode.
      this.evaSession?.endMinigame()
      return
    }
    const minigameType = mission.template.minigameType ?? 'default'
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame

    if (minigame.presentation === 'overlay') {
      this.onEvaMinigameChange?.({ mission, minigame })
      return
    }

    // presentation === 'in_scene' — no in-scene controller is registered yet.
    // The SatelliteRepairController lands in Task 10. Until then, log and fall
    // through to overlay so the flow stays playable for any mission that
    // accidentally lands on this branch (none currently do: satellite_servicing
    // still falls through to DefaultOrbitalMiniGame in the factory).
    console.warn(
      `[MapViewController] In-scene minigame presentation not yet wired for "${minigameType}"; opening overlay fallback.`,
    )
    this.onEvaMinigameChange?.({ mission, minigame })
  }
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Manual browser verification**

Run: `bun dev`, open `/map`. Accept any EVA mission, fly to the waypoint, EVA, approach the POI, press F. Confirm the overlay still opens and "Complete Maintenance" still pays CR + closes the overlay + removes the mission. Flow is unchanged from today.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat: branch EVA minigame dispatch on presentation mode"
```

---

## Task 4: Refactor `EvaMinigameOverlay.vue` into a `v-if` dispatcher

**Files:**
- Modify: `src/components/EvaMinigameOverlay.vue`

- [ ] **Step 1: Replace the SFC with the dispatcher form**

Open `src/components/EvaMinigameOverlay.vue`. Replace the entire file with:

```vue
<!--
  EvaMinigameOverlay.vue

  Dispatcher for per-minigameType overlays. Currently only the default card
  branch is wired — telescope, relay, and any future overlay-type canvas
  mounts here as an additional `v-if` branch. Mirrors MissionMiniGameOverlay
  for gather minigames. The final fallback is the "Complete Maintenance" card
  so the EVA loop stays playable while per-type canvases roll out.

  @author guinetik
  @date 2026-04-19
  @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
-->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  /** The EVA mission whose terminal the player is interacting with. */
  mission: ActiveVisitRelayMission
  /** Active minigame instance — `complete()` is called from the overlay's button. */
  minigame: OrbitalMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame — host should pay the reward + close. */
  complete: []
  /** User dismissed the overlay (X button or ESC) — host should restore EVA control. */
  close: []
}>()

/**
 * Capture-phase ESC handler so the overlay closes even if a future minigame
 * canvas swallows keystrokes.
 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

/** Trigger the minigame's own completion path; host listens via `onComplete`. */
function handleComplete(): void {
  props.minigame.complete()
  emit('complete')
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <div class="mission-minigame-overlay">
    <!--
      Per-minigameType branches plug in here (see
      docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md §"Overlay Branching Pattern").
      Each minigame's own plan (telescope_alignment, relay_repair) adds its
      `v-if="isXxx"` branch above the default card. None are registered yet;
      everything falls through to the card.
    -->
    <div class="mission-minigame-card">
      <div class="mission-minigame-card__chrome">
        <span>EVA Maintenance Terminal</span>
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
          Reward: +{{ mission.template.reward.toLocaleString() }} CR on completion
        </div>
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          @click="handleComplete"
        >
          Complete Maintenance
        </button>
      </div>
    </div>
  </div>
</template>
```

The only real change is the comment block clarifying the dispatcher intent; structure is already compatible. Leave in place so per-minigame plans have a clear insertion point.

- [ ] **Step 2: Type-check + lint + tests**

Run: `bun run type-check && bun run lint && bun test:unit`
Expected: all green.

- [ ] **Step 3: Manual browser verification**

Run: `bun dev`, open `/map`, accept any EVA mission, complete via overlay. Confirm behavior is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/EvaMinigameOverlay.vue
git commit -m "chore: document EvaMinigameOverlay dispatcher insertion point"
```

---

## Task 5: Satellite manifest data + typed loader + validation helper

**Files:**
- Create: `src/data/satellite-manifests.json`
- Create: `src/lib/satellites/satelliteManifests.ts`
- Create: `src/lib/satellites/__tests__/satelliteManifests.spec.ts`

- [ ] **Step 1: Discover the actual rigged component names on the existing `SatelliteModel`**

Open `src/three/SatelliteModel.ts` and look for calls like `traverse`, `getObjectByName`, or named mesh assignments. List every unique sub-object name that exists on the loaded GLB. If the model exposes fewer than 4 named rigged sub-objects, **stop** and escalate — rigging has to come before code (satellite-servicing needs at least 4 so hard missions can pick 3 distinct parts).

Record the found names — they populate the JSON in Step 2. A plausible set based on `SatelliteServicing.plan.md` §4: `reaction_wheel`, `solar_panel_a`, `solar_panel_b`, `high_gain_antenna`, `thruster_cluster`. Use whatever the model actually has.

- [ ] **Step 2: Create the manifest JSON**

Create `src/data/satellite-manifests.json` with exactly one key — `satellite` — populated with the names discovered in Step 1. Example (replace component list with the real names):

```json
{
  "satellite": {
    "components": [
      "reaction_wheel",
      "solar_panel_a",
      "solar_panel_b",
      "high_gain_antenna",
      "thruster_cluster"
    ]
  }
}
```

Intentionally *only* `satellite`. `relay_antenna` and `telescope` stay out this pass so missions on those POI types fall back cleanly (handled in Task 10).

- [ ] **Step 3: Write failing tests for the manifest loader + validator**

Create `src/lib/satellites/__tests__/satelliteManifests.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  getSatelliteManifest,
  hasSatelliteManifest,
  validateManifest,
} from '../satelliteManifests'

describe('satelliteManifests', () => {
  it('returns the component list for a known manifest key', () => {
    const manifest = getSatelliteManifest('satellite')
    expect(manifest).not.toBeNull()
    expect(manifest!.components.length).toBeGreaterThanOrEqual(4)
  })

  it('returns null for an unknown manifest key', () => {
    expect(getSatelliteManifest('telescope')).toBeNull()
    expect(getSatelliteManifest('relay_antenna')).toBeNull()
  })

  it('reports presence via hasSatelliteManifest', () => {
    expect(hasSatelliteManifest('satellite')).toBe(true)
    expect(hasSatelliteManifest('telescope')).toBe(false)
  })

  it('validateManifest returns missing components absent from the object tree', () => {
    const root = new THREE.Object3D()
    const present = new THREE.Object3D()
    present.name = 'reaction_wheel'
    root.add(present)
    const result = validateManifest(root, ['reaction_wheel', 'does_not_exist'])
    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(['does_not_exist'])
    expect(result.found).toEqual(['reaction_wheel'])
  })

  it('validateManifest reports ok when all components are present', () => {
    const root = new THREE.Object3D()
    for (const n of ['a', 'b', 'c']) {
      const o = new THREE.Object3D()
      o.name = n
      root.add(o)
    }
    const result = validateManifest(root, ['a', 'b', 'c'])
    expect(result.ok).toBe(true)
    expect(result.missing).toEqual([])
    expect(result.found).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 4: Run tests — confirm failure on missing module**

Run: `bun test:unit src/lib/satellites/__tests__/satelliteManifests.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the loader**

Create `src/lib/satellites/satelliteManifests.ts`:

```ts
/**
 * Satellite component manifests — per-POI-type lists of rigged sub-object
 * names eligible for damage during EVA satellite-servicing missions.
 *
 * Loaded statically by Vite from the JSON source. Callers read the list
 * by POI type key (currently only `"satellite"` is populated — Hubble and
 * Voyager POIs do not support satellite-servicing in this pass).
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import type * as THREE from 'three'
import rawManifests from '@/data/satellite-manifests.json'

/** Component list for a single satellite POI type. */
export interface SatelliteManifest {
  /** Named rigged sub-objects eligible for damage. */
  components: string[]
}

/** Result of validating a manifest against a real Three.js object tree. */
export interface ManifestValidationResult {
  /** True when every manifest component exists in the object tree. */
  ok: boolean
  /** Components that were located on the tree by name. */
  found: string[]
  /** Components listed in the manifest but missing from the tree. */
  missing: string[]
}

const MANIFESTS = rawManifests as Record<string, SatelliteManifest>

/**
 * Look up the manifest for a POI type.
 *
 * @param poiType - The mission template's `poiType` value.
 * @returns The manifest, or `null` if no manifest is registered for that POI type.
 */
export function getSatelliteManifest(poiType: string): SatelliteManifest | null {
  const entry = MANIFESTS[poiType]
  return entry ?? null
}

/**
 * True when a manifest is registered for the given POI type.
 *
 * @param poiType - The mission template's `poiType` value.
 * @returns Whether a manifest exists for that POI type.
 */
export function hasSatelliteManifest(poiType: string): boolean {
  return MANIFESTS[poiType] != null
}

/**
 * Verify that every component in `names` exists as a named descendant of `root`.
 * Used by `SatelliteRepairController` on attach so silently-broken manifests
 * fail loud instead of producing invisible damage overlays.
 *
 * @param root - The POI root Object3D to traverse.
 * @param names - Component names expected on the tree.
 * @returns Validation result — ok + which names were found vs. missing.
 */
export function validateManifest(
  root: THREE.Object3D,
  names: readonly string[],
): ManifestValidationResult {
  const found: string[] = []
  const missing: string[] = []
  for (const name of names) {
    if (root.getObjectByName(name) != null) {
      found.push(name)
    } else {
      missing.push(name)
    }
  }
  return { ok: missing.length === 0, found, missing }
}
```

- [ ] **Step 6: Run tests — confirm pass**

Run: `bun test:unit src/lib/satellites/__tests__/satelliteManifests.spec.ts`
Expected: PASS, all five cases.

- [ ] **Step 7: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Commit**

```bash
git add src/data/satellite-manifests.json src/lib/satellites/satelliteManifests.ts src/lib/satellites/__tests__/satelliteManifests.spec.ts
git commit -m "feat: add satellite component manifest loader and validator"
```

---

## Task 6: Seeded damage roll on `acceptEvaMission`

**Files:**
- Modify: `src/lib/missions/types.ts`
- Modify: `src/lib/missions/shuttleMissionSession.ts`
- Create: `src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts`

- [ ] **Step 1: Add `brokenComponents` field to `ActiveVisitRelayMission`**

Edit `src/lib/missions/types.ts` (around line 251). Update the interface:

```ts
/** An EVA mission the player has accepted and is working on. */
export interface ActiveVisitRelayMission {
  /** The original template. */
  template: VisitRelayShuttleMissionTemplate
  /** Planet the mission was accepted at (and where it must be delivered). */
  giverPlanet: string
  /**
   * World-space waypoint generated at accept time near the giver planet's then-current
   * position. Snapshotted so the POI stays put while the giver planet keeps orbiting.
   * The root always sits on the shuttle's Y=0 orbital plane (beam marker stays aligned
   * with overhead map); `poiLocalY` raises or lowers the POI prop inside the root so
   * egress has a small vertical component.
   */
  waypoint: { worldX: number; worldZ: number; poiLocalY: number }
  /** Current mission status. */
  status: VisitRelayMissionStatus
  /**
   * For `satellite_servicing` missions only: names of rigged sub-objects on the POI
   * that start in the damaged state. Rolled deterministically from the mission id
   * at accept time so retries see the same damage.
   */
  brokenComponents?: string[]
}
```

- [ ] **Step 2: Write failing tests for the damage roll**

Create `src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  acceptEvaMission,
  createShuttleMissionBoard,
} from '../shuttleMissionSession'
import type { VisitRelayShuttleMissionTemplate } from '../types'

function template(
  id: string,
  poiType: 'satellite' | 'relay_antenna' | 'telescope',
  minigameType: string,
): VisitRelayShuttleMissionTemplate {
  return {
    id,
    name: id,
    description: '',
    poiType,
    minigameType,
    reward: 1500,
  }
}

function boardWithOffer(
  tmpl: VisitRelayShuttleMissionTemplate,
  planetId: string,
) {
  return {
    ...createShuttleMissionBoard(),
    offeredEvaMission: tmpl,
    offeringEvaPlanet: planetId,
  }
}

const WAYPOINT = { worldX: 100, worldZ: -50, poiLocalY: 12 }

describe('acceptEvaMission damage roll', () => {
  it('rolls brokenComponents for satellite_servicing missions', () => {
    const tmpl = template('earth_sat_1', 'satellite', 'satellite_servicing')
    const board = boardWithOffer(tmpl, 'earth')
    const result = acceptEvaMission(board, WAYPOINT)
    const [active] = result.activeEvaMissions
    expect(active!.brokenComponents).toBeDefined()
    expect(active!.brokenComponents!.length).toBeGreaterThanOrEqual(1)
  })

  it('produces the same brokenComponents for the same mission id', () => {
    const tmpl = template('jupiter_sat_42', 'satellite', 'satellite_servicing')
    const b1 = boardWithOffer(tmpl, 'jupiter')
    const b2 = boardWithOffer(tmpl, 'jupiter')
    const r1 = acceptEvaMission(b1, WAYPOINT)
    const r2 = acceptEvaMission(b2, WAYPOINT)
    expect(r1.activeEvaMissions[0]!.brokenComponents).toEqual(
      r2.activeEvaMissions[0]!.brokenComponents,
    )
  })

  it('picks more components for outer-planet (hard) missions than inner (easy)', () => {
    const earth = template('earth_sat_1', 'satellite', 'satellite_servicing')
    const neptune = template('neptune_sat_1', 'satellite', 'satellite_servicing')
    const e = acceptEvaMission(boardWithOffer(earth, 'earth'), WAYPOINT)
    const n = acceptEvaMission(boardWithOffer(neptune, 'neptune'), WAYPOINT)
    expect(e.activeEvaMissions[0]!.brokenComponents!.length).toBe(1)
    expect(n.activeEvaMissions[0]!.brokenComponents!.length).toBe(3)
  })

  it('does not roll damage for non-satellite_servicing minigames', () => {
    const tmpl = template('earth_relay_1', 'relay_antenna', 'relay_repair')
    const board = boardWithOffer(tmpl, 'earth')
    const result = acceptEvaMission(board, WAYPOINT)
    expect(result.activeEvaMissions[0]!.brokenComponents).toBeUndefined()
  })

  it('does not roll damage when no manifest is registered for the poiType', () => {
    // telescope poiType has no manifest in this pass; even if a mission slipped
    // through with minigameType satellite_servicing on a telescope POI, damage
    // should stay undefined so the runtime can fall back cleanly.
    const tmpl = template('mars_weird_1', 'telescope', 'satellite_servicing')
    const board = boardWithOffer(tmpl, 'mars')
    const result = acceptEvaMission(board, WAYPOINT)
    expect(result.activeEvaMissions[0]!.brokenComponents).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests — confirm failure**

Run: `bun test:unit src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts`
Expected: FAIL — `brokenComponents` is undefined on all cases.

- [ ] **Step 4: Implement the damage roll**

Edit `src/lib/missions/shuttleMissionSession.ts`. Near the top of the file, add the imports (if not present — check existing imports first to avoid duplicates):

```ts
import { getSatelliteManifest } from '@/lib/satellites/satelliteManifests'
```

Add these helpers **above** the `acceptEvaMission` function:

```ts
/** Broken-component count per giver-planet difficulty tier. */
const DAMAGE_COUNT_BY_PLANET: Record<string, number> = {
  earth: 1,
  mars: 1,
  jupiter: 2,
  saturn: 2,
  mercury: 3,
  venus: 3,
  uranus: 3,
  neptune: 3,
}

/** Default to hard (3) if a planet id isn't in the tier table — safer than crashing. */
const DEFAULT_DAMAGE_COUNT = 3

/**
 * Deterministic 32-bit hash of a string. Used to seed the mulberry32 PRNG so a
 * given mission id always rolls the same brokenComponents list.
 *
 * @param str - Input string, typically a mission id.
 * @returns Unsigned 32-bit hash.
 */
function hashMissionId(str: string): number {
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

/** Mulberry32 PRNG seeded from a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Roll the broken-component list for a satellite-servicing mission.
 *
 * Deterministic given (missionId, manifest). Returns `undefined` for missions
 * that are not satellite_servicing, or whose POI type has no manifest — the
 * runtime treats `undefined` as "no damage state" and falls back to the
 * default stub minigame at dispatch time.
 *
 * @param template - Mission template.
 * @param planetId - Giver planet id — drives the damage tier count.
 * @returns Broken component names, or `undefined` when damage does not apply.
 */
function rollBrokenComponents(
  template: VisitRelayShuttleMissionTemplate,
  planetId: string,
): string[] | undefined {
  if (template.minigameType !== 'satellite_servicing') return undefined
  const manifest = getSatelliteManifest(template.poiType)
  if (!manifest || manifest.components.length === 0) return undefined
  const count = Math.min(
    DAMAGE_COUNT_BY_PLANET[planetId] ?? DEFAULT_DAMAGE_COUNT,
    manifest.components.length,
  )
  const rng = mulberry32(hashMissionId(template.id))
  // Fisher-Yates partial shuffle — take first `count` after shuffling.
  const pool = [...manifest.components]
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (pool.length - i))
    const tmp = pool[i]!
    pool[i] = pool[j]!
    pool[j] = tmp
  }
  return pool.slice(0, count)
}
```

Now modify `acceptEvaMission` — replace the `newActive` construction to include the rolled components:

```ts
  const newActive: ActiveVisitRelayMission = {
    template: board.offeredEvaMission,
    giverPlanet: board.offeringEvaPlanet,
    waypoint,
    status: 'active',
    brokenComponents: rollBrokenComponents(board.offeredEvaMission, board.offeringEvaPlanet),
  }
```

(`brokenComponents` is optional on the type; when `rollBrokenComponents` returns `undefined`, TypeScript serializes the field as `brokenComponents: undefined` which is fine — the test checks with `toBeUndefined()`.)

- [ ] **Step 5: Run tests — confirm pass**

Run: `bun test:unit src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts`
Expected: PASS all five cases. Also run full suite to confirm no regressions:

Run: `bun test:unit`
Expected: all green.

- [ ] **Step 6: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/missions/types.ts src/lib/missions/shuttleMissionSession.ts src/lib/missions/__tests__/acceptEvaMissionDamage.spec.ts
git commit -m "feat: roll seeded satellite damage on EVA mission accept"
```

---

## Task 7: `SatelliteServicingMiniGame` class

**Files:**
- Create: `src/lib/minigame/satelliteServicing/SatelliteServicingMiniGame.ts`
- Create: `src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { SatelliteServicingMiniGame } from '../SatelliteServicingMiniGame'

describe('SatelliteServicingMiniGame', () => {
  it('reports presentation "in_scene"', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    expect(mg.presentation).toBe('in_scene')
  })

  it('starts with progress 0 / total = brokenComponents length', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b', 'c'])
    expect(mg.progressCurrent).toBe(0)
    expect(mg.progressTotal).toBe(3)
  })

  it('markRepaired increments progress and ignores duplicates', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    mg.markRepaired('a')
    expect(mg.progressCurrent).toBe(1)
    mg.markRepaired('a')
    expect(mg.progressCurrent).toBe(1)
  })

  it('markRepaired ignores unknown component names', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    mg.markRepaired('zzz')
    expect(mg.progressCurrent).toBe(0)
  })

  it('fires onComplete exactly once when all components are repaired', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    const spy = vi.fn()
    mg.onComplete = spy
    mg.markRepaired('a')
    expect(spy).not.toHaveBeenCalled()
    mg.markRepaired('b')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('mid')
    // Calling complete again is a no-op.
    mg.complete()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('handles zero-component input by completing immediately on complete()', () => {
    const mg = new SatelliteServicingMiniGame('mid', [])
    const spy = vi.fn()
    mg.onComplete = spy
    mg.complete()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mg.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run tests — confirm failure on missing module**

Run: `bun test:unit src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the class**

Create `src/lib/minigame/satelliteServicing/SatelliteServicingMiniGame.ts`:

```ts
/**
 * Satellite servicing minigame — in-scene 3D minigame where the player EVAs
 * up to 1–3 broken components on a satellite and repairs each via a screen-
 * space drag interaction. This class is the OrbitalMiniGame contract bridge:
 * it tracks the damaged component list, exposes progress, and fires
 * onComplete when every component has been repaired. The 3D scene work —
 * wireframe overlays, camera lock, drag mechanic — lives in
 * SatelliteRepairController.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'

/**
 * Satellite servicing minigame. Driven by `SatelliteRepairController` in the
 * 3D scene; this class is purely the lifecycle + progress contract.
 *
 * @author guinetik
 * @date 2026-04-19
 */
export class SatelliteServicingMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** This minigame drives the 3D scene directly — no Vue overlay. */
  readonly presentation = 'in_scene' as const

  /** Names of components that start damaged. Immutable after construction. */
  readonly brokenComponents: readonly string[]

  private readonly _repaired: Set<string> = new Set()
  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Approach Satellite', complete: true, active: false },
    { label: 'Fix Damaged Parts', complete: false, active: true },
    { label: 'Confirm Repair', complete: false, active: false },
  ]

  /** Minigame completed — fires with mission id. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  constructor(missionId: string, brokenComponents: readonly string[]) {
    this.missionId = missionId
    this.brokenComponents = [...brokenComponents]
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Number of components repaired so far. */
  get progressCurrent(): number {
    return this._repaired.size
  }

  /** Total number of components to repair. */
  get progressTotal(): number {
    return this.brokenComponents.length
  }

  /**
   * Per-frame update. No-op — progress is driven by controller calls to
   * `markRepaired`.
   *
   * @param _dt - Delta time (unused).
   * @param _ctx - Map scene context (unused).
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — controller-driven.
  }

  /**
   * Mark a component as repaired. Unknown component names are ignored.
   * When every `brokenComponents` entry has been repaired, transitions to
   * completed and fires `onComplete`.
   *
   * @param componentName - Name of the rigged sub-object that was repaired.
   */
  markRepaired(componentName: string): void {
    if (this._status !== 'active') return
    if (!this.brokenComponents.includes(componentName)) return
    if (this._repaired.has(componentName)) return
    this._repaired.add(componentName)
    this.onStepChange?.(this._steps)
    if (this._repaired.size >= this.brokenComponents.length) {
      this.complete()
    }
  }

  /**
   * Finalize the minigame. Idempotent — subsequent calls are ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    this._steps[1]!.complete = true
    this._steps[1]!.active = false
    this._steps[2]!.complete = true
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op. */
  dispose(): void {
    // No resources to clean up; controller handles scene cleanup separately.
  }
}
```

- [ ] **Step 4: Run tests — confirm pass**

Run: `bun test:unit src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts`
Expected: PASS all six cases.

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/satelliteServicing/SatelliteServicingMiniGame.ts src/lib/minigame/satelliteServicing/__tests__/SatelliteServicingMiniGame.spec.ts
git commit -m "feat: add SatelliteServicingMiniGame class with in-scene presentation"
```

---

## Task 8: Register `satellite_servicing` in the factory

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`

- [ ] **Step 1: Add failing tests for the new branch**

Edit `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`. Inside the existing `describe('createOrbitalMiniGame', ...)`, add:

```ts
it('returns SatelliteServicingMiniGame when mission has brokenComponents', () => {
  const mission = {
    template: {
      id: 'earth_sat_patch',
      name: 'Cubesat Patch',
      description: '',
      poiType: 'satellite',
      minigameType: 'satellite_servicing',
      reward: 1500,
    },
    giverPlanet: 'earth',
    waypoint: { worldX: 0, worldZ: 0, poiLocalY: 0 },
    status: 'active',
    brokenComponents: ['reaction_wheel', 'solar_panel_a'],
  } as ActiveVisitRelayMission
  const mg = createOrbitalMiniGame(
    'earth_sat_patch',
    'satellite_servicing',
    0,
    'earth',
    mission,
  )
  expect(mg).toBeInstanceOf(SatelliteServicingMiniGame)
  expect((mg as SatelliteServicingMiniGame).brokenComponents).toEqual([
    'reaction_wheel',
    'solar_panel_a',
  ])
  expect(mg.presentation).toBe('in_scene')
})

it('falls back to Default for satellite_servicing when mission has no brokenComponents', () => {
  const mission = {
    template: {
      id: 'earth_sat_patch',
      name: 'Cubesat Patch',
      description: '',
      poiType: 'telescope', // no manifest — damage roll returns undefined
      minigameType: 'satellite_servicing',
      reward: 1500,
    },
    giverPlanet: 'earth',
    waypoint: { worldX: 0, worldZ: 0, poiLocalY: 0 },
    status: 'active',
    // brokenComponents intentionally absent
  } as ActiveVisitRelayMission
  const mg = createOrbitalMiniGame(
    'earth_sat_patch',
    'satellite_servicing',
    0,
    'earth',
    mission,
  )
  expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
})

it('falls back to Default for satellite_servicing when mission is absent', () => {
  const mg = createOrbitalMiniGame('earth_sat_patch', 'satellite_servicing', 0, 'earth')
  expect(mg).toBeInstanceOf(DefaultOrbitalMiniGame)
})
```

Also add the import at the top of the test file:

```ts
import { SatelliteServicingMiniGame } from '../satelliteServicing/SatelliteServicingMiniGame'
```

- [ ] **Step 2: Update the `OrbitalMiniGame.presentation` cases table**

In the existing `describe('OrbitalMiniGame.presentation', …)` block from Task 1, add one entry:

```ts
    ['satellite_servicing', 'overlay'], // currently falls back when mission omitted
```

(That entry verifies the *fallback* path because the parameterized loop doesn't pass a mission.)

- [ ] **Step 3: Run tests — confirm failure**

Run: `bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
Expected: FAIL — factory doesn't know `satellite_servicing` and `SatelliteServicingMiniGame` isn't imported.

- [ ] **Step 4: Register the branch in the factory**

Edit `src/lib/minigame/orbitalMiniGameFactory.ts`. Add the import:

```ts
import { SatelliteServicingMiniGame } from './satelliteServicing/SatelliteServicingMiniGame'
```

Remove the `void mission` line (we're now reading it), and add a new case **above** `default`:

```ts
    case 'satellite_servicing': {
      const broken = mission?.brokenComponents
      if (!broken || broken.length === 0) {
        // No damage state rolled (non-satellite POI, or no manifest) — fall back
        // to the default stub so the EVA flow stays playable.
        return new DefaultOrbitalMiniGame(missionId)
      }
      return new SatelliteServicingMiniGame(missionId, broken)
    }
```

- [ ] **Step 5: Run tests — confirm pass**

Run: `bun test:unit`
Expected: all green.

- [ ] **Step 6: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
git commit -m "feat: register satellite_servicing in orbital minigame factory"
```

---

## Task 9: `SatelliteRepairController` skeleton

**Files:**
- Create: `src/three/SatelliteRepairController.ts`

No unit test — this is a Three.js integration module (per CLAUDE.md rule #2, tests focus on `src/lib/`). Verification is manual in-browser in Task 10.

- [ ] **Step 1: Create the skeleton controller**

Create `src/three/SatelliteRepairController.ts`:

```ts
/**
 * In-scene controller for the satellite servicing minigame.
 *
 * Attaches to a satellite POI during EVA, applies a red wireframe overlay to
 * each broken component, detects when the EVA player drifts into interact
 * range of a still-broken component, shows a "FIX [F]" billboard, and on
 * F-press stubs the repair (marks the component repaired, fades the overlay,
 * calls `minigame.markRepaired`). The real drag mechanic lands in a later
 * plan; this skeleton ships the end-to-end loop with a single-press stub.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import * as THREE from 'three'
import type { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { validateManifest } from '@/lib/satellites/satelliteManifests'

/** Distance (world units) within which a FIX prompt appears above a broken component. */
const FIX_PROMPT_RANGE = 2.5

/** Red emissive wireframe color for damaged components. */
const DAMAGE_WIREFRAME_COLOR = 0xf87171

/** Fade-out duration (seconds) applied to a wireframe when its component is repaired. */
const WIREFRAME_FADE_SECONDS = 0.5

/** Configuration passed to `SatelliteRepairController.attach`. */
export interface SatelliteRepairControllerConfig {
  /** Scene root used to host the wireframe + prompt meshes. */
  scene: THREE.Scene
  /** POI root — walked for named rigged sub-objects. */
  poiObject: THREE.Object3D
  /** Source of the EVA player world position for proximity checks. */
  getPlayerPosition: () => THREE.Vector3
  /** True while the F-press should register as a repair attempt. */
  isFixKeyPressed: () => boolean
  /** The minigame instance — controller calls `markRepaired(name)` on success. */
  minigame: SatelliteServicingMiniGame
  /** The active mission — reserved for future use (mission-specific tuning). */
  mission: ActiveVisitRelayMission
}

interface DamagedComponent {
  name: string
  source: THREE.Object3D
  wireframe: THREE.Object3D
  promptBillboard: THREE.Sprite
  fading: boolean
  fadeTimer: number
}

/**
 * Controller-side skeleton for the satellite servicing minigame.
 *
 * Usage:
 * ```ts
 * const controller = new SatelliteRepairController()
 * controller.attach({ scene, poiObject, getPlayerPosition, isFixKeyPressed, minigame, mission })
 * // …later, per frame…
 * controller.tick(dt)
 * // …on minigame.onComplete or forced abort…
 * controller.dispose()
 * ```
 *
 * @author guinetik
 * @date 2026-04-19
 */
export class SatelliteRepairController {
  private cfg: SatelliteRepairControllerConfig | null = null
  private components: DamagedComponent[] = []
  private prevFixKey = false

  /**
   * Attach to a scene + POI. Looks up each broken component by name, applies
   * a red wireframe overlay and a hidden FIX-prompt billboard above it. If
   * any manifest component is missing from the POI tree, logs a warning and
   * skips that component (so the rest of the mission stays playable).
   *
   * @param cfg - Attachment configuration.
   */
  attach(cfg: SatelliteRepairControllerConfig): void {
    this.cfg = cfg
    const brokenList = cfg.minigame.brokenComponents
    const validation = validateManifest(cfg.poiObject, brokenList)
    if (!validation.ok) {
      console.warn(
        `[SatelliteRepairController] Missing components on POI:`,
        validation.missing,
      )
    }
    for (const name of validation.found) {
      const source = cfg.poiObject.getObjectByName(name)
      if (!source) continue
      const wireframe = this.buildWireframe(source)
      const promptBillboard = this.buildFixPrompt()
      promptBillboard.visible = false
      source.add(wireframe)
      source.add(promptBillboard)
      this.components.push({
        name,
        source,
        wireframe,
        promptBillboard,
        fading: false,
        fadeTimer: 0,
      })
    }
  }

  /**
   * Per-frame update. Runs proximity detection for broken components, shows
   * the FIX prompt on the nearest in-range one, and applies the single-press
   * stub repair when the F key transitions pressed.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    if (!this.cfg) return
    const player = this.cfg.getPlayerPosition()

    let nearest: DamagedComponent | null = null
    let nearestDist = FIX_PROMPT_RANGE
    const tmp = new THREE.Vector3()
    for (const c of this.components) {
      if (c.fading) continue
      c.source.getWorldPosition(tmp)
      const d = tmp.distanceTo(player)
      if (d < nearestDist) {
        nearest = c
        nearestDist = d
      }
    }

    // Hide prompts on every component; reveal only the nearest in-range.
    for (const c of this.components) {
      c.promptBillboard.visible = c === nearest && !c.fading
    }

    const fixPressed = this.cfg.isFixKeyPressed()
    const fixJustPressed = fixPressed && !this.prevFixKey
    this.prevFixKey = fixPressed
    if (fixJustPressed && nearest) {
      nearest.fading = true
      nearest.promptBillboard.visible = false
      this.cfg.minigame.markRepaired(nearest.name)
    }

    // Drive fade + wireframe removal.
    for (const c of this.components) {
      if (!c.fading) continue
      c.fadeTimer += dt
      const t = Math.min(1, c.fadeTimer / WIREFRAME_FADE_SECONDS)
      this.setWireframeOpacity(c.wireframe, 0.9 * (1 - t))
      if (t >= 1 && c.wireframe.parent) {
        c.wireframe.parent.remove(c.wireframe)
      }
    }
  }

  /**
   * Detach and dispose every overlay/prompt. Safe to call multiple times.
   */
  dispose(): void {
    for (const c of this.components) {
      if (c.wireframe.parent) c.wireframe.parent.remove(c.wireframe)
      if (c.promptBillboard.parent) c.promptBillboard.parent.remove(c.promptBillboard)
      this.disposeObject(c.wireframe)
      this.disposeObject(c.promptBillboard)
    }
    this.components = []
    this.cfg = null
  }

  /**
   * Walk `source`, clone each mesh, swap in a red wireframe material, and
   * return the group. Transforms follow because the group is parented to
   * `source` at attach time.
   */
  private buildWireframe(source: THREE.Object3D): THREE.Object3D {
    const group = new THREE.Group()
    source.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return
      const mesh = obj as THREE.Mesh
      const clone = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({
          color: DAMAGE_WIREFRAME_COLOR,
          wireframe: true,
          transparent: true,
          opacity: 0.9,
          depthTest: true,
          depthWrite: false,
        }),
      )
      clone.matrixAutoUpdate = false
      // Copy world transform into the clone, then invert the source world so
      // the overlay sits exactly on top when added as a child of `source`.
      mesh.updateWorldMatrix(true, false)
      source.updateWorldMatrix(true, false)
      const inv = new THREE.Matrix4().copy(source.matrixWorld).invert()
      clone.matrix.multiplyMatrices(inv, mesh.matrixWorld)
      group.add(clone)
    })
    return group
  }

  /**
   * Build a cheap canvas-textured sprite saying "[F] FIX". Visible toggling
   * lives in `tick`. Positioned slightly above the component's local origin.
   */
  private buildFixPrompt(): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(5, 7, 12, 0.8)'
    ctx.fillRect(0, 0, 256, 64)
    ctx.strokeStyle = '#22d3ee'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, 254, 62)
    ctx.fillStyle = '#cffafe'
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('[F] FIX', 128, 32)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(1.2, 0.3, 1)
    sprite.position.set(0, 1.2, 0)
    return sprite
  }

  /** Tween every mesh material's opacity inside `wireframe`. */
  private setWireframeOpacity(wireframe: THREE.Object3D, opacity: number): void {
    wireframe.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = opacity
    })
  }

  /** Dispose geometry + materials under `obj`. */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        // Geometry is shared with the source mesh — do not dispose here.
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      }
      const sprite = child as THREE.Sprite
      if (sprite.isSprite) {
        const sm = sprite.material
        if (sm.map) sm.map.dispose()
        sm.dispose()
      }
    })
  }
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/three/SatelliteRepairController.ts
git commit -m "feat: add skeleton SatelliteRepairController for in-scene EVA repairs"
```

---

## Task 10: Wire `'in_scene'` branch in `MapViewController.beginEvaMinigame`

**Files:**
- Modify: `src/views/MapViewController.ts`

- [ ] **Step 1: Inspect existing EVA session / input hooks**

Before editing, open `src/three/EvaSession.ts` and locate the accessor used by the EVA tether for the player's current world position (look for calls like `getPlayerPosition`, `camera.position`, or `controller.position`). Also find where the F key is read in the map scene's input path (search `InputManager` usage for `fix` / `action` / `F` key bindings). Record the exact expressions you'll pass as `getPlayerPosition` and `isFixKeyPressed` callbacks — they're scene-specific and cannot be guessed without looking.

Common shapes observed in the codebase:
- `this.evaSession?.getFpsCameraWorldPosition()` or similar getter
- `this.input.isPressed('interact')` for the F binding

If neither exists under obvious names, add a **minimal** accessor on `EvaSession` (e.g. `getCameraWorldPosition(out: THREE.Vector3): void`) and use the existing keyboard binding for the EVA terminal (same key that triggered `beginEvaMinigame`). Keep the new accessor tight — just enough for the controller.

- [ ] **Step 2: Import + field declarations in `MapViewController`**

Edit `src/views/MapViewController.ts`. Add the import alongside the existing minigame imports:

```ts
import { SatelliteRepairController } from '@/three/SatelliteRepairController'
import { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
```

Add a private field near `activeEvaMinigame`:

```ts
  /** In-scene controller for the currently-active satellite servicing minigame, if any. */
  private satelliteRepairController: SatelliteRepairController | null = null
```

- [ ] **Step 3: Rewrite the `'in_scene'` branch in `beginEvaMinigame`**

Replace the block from Task 3 that logs "not yet wired" with a real dispatch. Final shape of `beginEvaMinigame`:

```ts
  private beginEvaMinigame(): void {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) {
      this.evaSession?.endMinigame()
      return
    }
    const minigameType = mission.template.minigameType ?? 'default'
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame

    if (minigame.presentation === 'overlay') {
      this.onEvaMinigameChange?.({ mission, minigame })
      return
    }

    // presentation === 'in_scene' → hand to SatelliteRepairController.
    if (!(minigame instanceof SatelliteServicingMiniGame)) {
      console.warn(
        `[MapViewController] Unknown in-scene minigame type "${minigameType}"; opening overlay fallback.`,
      )
      this.onEvaMinigameChange?.({ mission, minigame })
      return
    }
    const poiObject = this.missionFacade.getEvaPoiObject?.()
    if (!poiObject) {
      console.warn('[MapViewController] No POI object available for in-scene minigame; aborting.')
      this.evaMinigameClose()
      return
    }
    this.satelliteRepairController = new SatelliteRepairController()
    this.satelliteRepairController.attach({
      scene: this.scene,
      poiObject,
      // Use whichever expressions you identified in Step 1. Example shapes:
      getPlayerPosition: () => {
        const out = new THREE.Vector3()
        this.evaSession?.getCameraWorldPosition(out)
        return out
      },
      isFixKeyPressed: () => this.input.isPressed('interact'),
      minigame,
      mission,
    })
  }
```

Replace `this.evaSession?.getCameraWorldPosition(out)` and `this.input.isPressed('interact')` with the concrete expressions identified in Step 1. Keep the method dispatch-only — no other logic.

If `MapMissionFacade` does not yet expose `getEvaPoiObject`, add the getter there too. Check for an existing accessor first (e.g. `evaPoiContainer`, `getEvaPoiWorldPos`); if present, extract the first child or return the root `Object3D` the beam renderer already owns. Fallback: `return this.evaPoiContainer?.children[0] ?? null`.

- [ ] **Step 4: Tick + dispose**

Find the main `update(dt)` loop on `MapViewController`. Immediately after the `activeEvaMinigame?.tick(dt, ctx)` call (or equivalent — search for `activeEvaMinigame` and look for an existing tick), add:

```ts
    this.satelliteRepairController?.tick(dt)
```

Find `evaMinigameComplete` and `evaMinigameClose`. In **both**, after `this.activeEvaMinigame?.dispose()`, add:

```ts
    this.satelliteRepairController?.dispose()
    this.satelliteRepairController = null
```

- [ ] **Step 5: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: 0 errors, 0 warnings. If either accessor (`getCameraWorldPosition`, `getEvaPoiObject`, `input.isPressed('interact')`) doesn't exist, resolve it inline per Step 1 guidance and re-run.

- [ ] **Step 6: Tests**

Run: `bun test:unit`
Expected: all green. (Controller has no unit tests; domain tests from Tasks 1, 2, 5, 6, 7, 8 should all still pass.)

- [ ] **Step 7: Manual browser verification — the golden path**

Run: `bun dev`. Open `/map`. At **Earth**, accept the `earth_cubesat_cluster_patch` mission (minigameType `satellite_servicing`, difficulty tier 1 = one broken component). Fly to the waypoint, park, press F to EVA, float to the POI.

Verify:
- Exactly one component on the satellite shows a red wireframe overlay.
- Approaching the red component within ~2.5 units shows the `[F] FIX` billboard above it.
- Pressing F while in range fades the wireframe over ~500 ms and then immediately fires the mission complete toast + CR payout (because it's the last component).
- The mission disappears from the active list; reload and confirm it stays gone.

Then repeat on **Jupiter** (`jupiter_io_torus_probe_rebuild`) to confirm the 2-part flow: first F press repairs one component without completing; second F press on the other component completes the mission.

Finally, accept a telescope or relay EVA mission on any planet and confirm the flow is unchanged (still opens the default overlay).

- [ ] **Step 8: Commit**

```bash
git add src/views/MapViewController.ts src/lib/map/missions/MapMissionFacade.ts
git commit -m "feat: dispatch in-scene satellite repair controller from EVA terminal"
```

(Omit `MapMissionFacade.ts` from the `git add` if you didn't need to add the `getEvaPoiObject` getter.)

---

## Done Criteria

- [ ] `bun run type-check` exits 0.
- [ ] `bun run lint` reports 0 oxlint errors and 0 ESLint errors/warnings.
- [ ] `bun test:unit` — all tests pass, including the new tests added in Tasks 1, 2, 5, 6, 7, 8.
- [ ] Manual flow on `/map`:
  - Telescope EVA mission → opens overlay → Complete Maintenance pays CR (unchanged from today).
  - Relay EVA mission → opens overlay → Complete Maintenance pays CR (unchanged from today).
  - Satellite EVA mission on Earth → one red wireframe → F-press fades it and pays CR.
  - Satellite EVA mission on Jupiter → two red wireframes → two F-presses complete the mission.
  - Satellite EVA mission on Neptune → three red wireframes → three F-presses complete the mission.
  - Reload mid-mission: `brokenComponents` rehydrates; same components still broken.
- [ ] No console errors during any of the above flows.

## Follow-ups Not In This Plan

Out of scope; each gets its own spec + plan:

- Telescope alignment minigame (`docs/superpowers/specs/2026-04-19-telescope-alignment-design.md` — plan TBD).
- Relay repair minigame (spec TBD; port `docs/inspo/RelayRepairMinigame.jsx`).
- Real satellite servicing drag mechanic (spec + plan TBD; this plan only ships the single-press stub).
- Hubble / Voyager satellite-servicing support (requires those models to be rigged and added to `satellite-manifests.json`).
- Camera hero-framing lock during each repair (planned in `SatelliteServicing.plan.md` §5.3; lands with the drag mechanic).
- Audio hooks (all three minigames, plus repair success chime).
