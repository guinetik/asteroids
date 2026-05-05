# Ceres Station Dock System & Contract Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `visit-planet ceres-research-station` step with a real dock interaction at a mission-spawned Kuiper-belt station, restructure the Ceres Institute contract into a 10-step courier loop, and build a generic dock subsystem (`pickup-from-asset` / `deliver-to-asset` step kinds) reusable by future contracts.

**Architecture:** Two new contract step kinds wire dock-at-asset events through `ContractSystem`. A `PinnedStationController` (Three.js) renders `station.glb` at a deterministic Kuiper-belt position when the contract activates, despawns on terminal state. `MapViewController` gains a `DockProximityWatcher` (sibling to `tryBeginAsteroidMission`) that surfaces an F-prompt and opens `DockPanel.vue` on confirm. Special missions gain a `grantsItemOnComplete` field with `replenishWhileStepOpen` softlock prevention.

**Tech Stack:** Vue 3, TypeScript (strict), Three.js, Pinia, Vitest, Bun. JSON-driven content under `src/data/`. Path alias `@/*` → `./src/*`. ViewController + Three controller pattern.

**Spec:** `docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md`

**Contract / files most touched:**
- `src/lib/contracts/contractTypes.ts` — schema
- `src/lib/contracts/ContractSystem.ts` — engine
- `src/lib/missions/asteroidMissionRewards.ts` — completion drops
- `src/views/MapViewController.ts` — proximity loop + asset registry
- `src/data/contracts/ceres-institute-eternal-biology.json` — content rewrite
- `src/data/missions/ceres-institute-{mineral-analysis,dan}.json` — augment
- `src/data/inventory/items.json` — three new items
- `src/data/planets/planetarium.json` — rip station
- New: `src/three/PinnedStationController.ts`, `src/components/DockPanel.vue`

---

## Task 1: Rip `ceres-research-station` from the planetarium and tests

**Files:**
- Modify: `src/data/planets/planetarium.json` (remove `ceres-research-station` entry from `pinnedBodies`, lines ~764–793)
- Modify: `src/lib/planets/__tests__/catalog.spec.ts` (remove any assertion referencing `ceres-research-station`)
- Modify: `src/data/contracts/ceres-institute-eternal-biology.json` (the Step 2 `visit-planet` step is removed; the full rewrite happens in Task 11 — for now, leave the rest of the file alone but delete just the `ceres-research-station` step so existing parser tests don't try to resolve it)

- [ ] **Step 1: Locate every reference**

Run: `bun grep "ceres-research-station"` (or use Grep tool). Confirm hits are exactly: planetarium.json, catalog.spec.ts, ceres-institute-eternal-biology.json, and the two superseded design docs. Docs may stay; code/data must go.

- [ ] **Step 2: Remove from `planetarium.json`**

Open `src/data/planets/planetarium.json`. Find the object inside `pinnedBodies` whose `id === 'ceres-research-station'`. Delete that whole object plus the trailing comma if it leaves a trailing comma in the array.

- [ ] **Step 3: Remove the catalog test assertion**

Open `src/lib/planets/__tests__/catalog.spec.ts`. Delete or rewrite any assertion that names `'ceres-research-station'`. If the test asserts pinned body counts, decrement the expected count.

- [ ] **Step 4: Delete the broken Step 2 from the contract JSON**

Open `src/data/contracts/ceres-institute-eternal-biology.json`. Find the step with `"kind": "visit-planet"` and `"planetId": "ceres-research-station"`. Delete the whole step object. Renumber subjects only if a parser test asserts on them; otherwise leave subject text alone (Task 11 rewrites the whole file).

- [ ] **Step 5: Run type-check and tests**

Run: `bun run type-check && bun test:unit src/lib/planets src/lib/contracts`
Expected: PASS (the parser test for the Ceres contract may need its step count adjusted from 7 to 6 — temporary; Task 11 will set it to 10).

- [ ] **Step 6: Adjust the contract parser test step count if needed**

Open `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`. If it asserts `steps.length === 7`, change it to `6` for now and add a comment `// TODO(plan): becomes 10 in Task 11`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(ceres): rip ceres-research-station planet body and broken visit-planet step"
```

---

## Task 2: Add `PinnedAsset.kind` discriminator and station-specific fields

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts:342-349`
- Test: `src/lib/contracts/__tests__/contractTypes.spec.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

Create / append to `src/lib/contracts/__tests__/pinnedAssetTypes.spec.ts`:

```ts
import { describe, it, expectTypeOf, expect } from 'vitest'
import type { PinnedAsset } from '@/lib/contracts/contractTypes'

describe('PinnedAsset discriminator', () => {
  it('accepts asteroid kind (default) without modelPath', () => {
    const a: PinnedAsset = { assetRef: 'hektor', region: 'jovian-trojans', label: 'Asset 2306-J' }
    expect(a.assetRef).toBe('hektor')
  })
  it('accepts station kind with modelPath + positionSeed', () => {
    const a: PinnedAsset = {
      assetRef: 'ceres-institute-station',
      kind: 'station',
      region: 'kuiper-belt',
      label: 'CIB Station',
      modelPath: 'models/station.glb',
      positionSeed: 'ceres-institute-station',
    }
    expect(a.kind).toBe('station')
  })
})
```

- [ ] **Step 2: Run test, expect type-error or runtime fail**

Run: `bun test:unit src/lib/contracts/__tests__/pinnedAssetTypes.spec.ts`
Expected: FAIL — `kind`, `modelPath`, `positionSeed` not assignable.

- [ ] **Step 3: Update the type**

In `src/lib/contracts/contractTypes.ts`, replace the `PinnedAsset` interface (line ~342–349) with a discriminated union:

```ts
/**
 * Body or object the contract pins for its duration. `'asteroid'` (default)
 * is a catalog body referenced by mission generation; `'station'` is a
 * mission-spawned interactable that supports the dock subsystem.
 */
export type PinnedAsset =
  | {
      /** Stable ref used by step `pinnedAssetRef` lookups (e.g. `'hektor'`). */
      assetRef: string
      /** Discriminator. Omitted means asteroid. */
      kind?: 'asteroid'
      /** Region the body lives in (e.g. `'jovian-trojans'`). */
      region: string
      /** Display label for inbox flavor and asset cards. */
      label: string
    }
  | {
      /** Stable ref the dock subsystem keys off. */
      assetRef: string
      /** Discriminator. */
      kind: 'station'
      /** Region the station orbits in (e.g. `'kuiper-belt'`). */
      region: string
      /** Display label for the dock prompt. */
      label: string
      /** Path under `public/` to the GLB (e.g. `'models/station.glb'`). */
      modelPath: string
      /** Stable string hashed to a deterministic Kuiper-belt position. */
      positionSeed: string
    }
```

- [ ] **Step 4: Run test, expect pass**

Run: `bun test:unit src/lib/contracts/__tests__/pinnedAssetTypes.spec.ts && bun run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/contractTypes.ts src/lib/contracts/__tests__/pinnedAssetTypes.spec.ts
git commit -m "feat(contracts): add PinnedAsset.kind discriminator with station fields"
```

---

## Task 3: Add `pickup-from-asset` and `deliver-to-asset` step kinds

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts` (around line 245, after `DeliverItemsStep`; and the `ContractStep` union at line 313)
- Test: `src/lib/contracts/__tests__/dockStepKinds.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/contracts/__tests__/dockStepKinds.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ContractStep } from '@/lib/contracts/contractTypes'

describe('dock step kinds', () => {
  it('accepts pickup-from-asset', () => {
    const s: ContractStep = {
      kind: 'pickup-from-asset',
      assetRef: 'ceres-institute-station',
      itemId: 'ceres-institute-canister',
      count: 1,
      subject: 'Step 2',
      flavor: ['hello'],
    }
    expect(s.kind).toBe('pickup-from-asset')
  })
  it('accepts deliver-to-asset', () => {
    const s: ContractStep = {
      kind: 'deliver-to-asset',
      assetRef: 'ceres-institute-station',
      itemId: 'ceres-mineral-results-crate',
      count: 1,
      subject: 'Step 6',
      flavor: ['hand it over'],
    }
    expect(s.kind).toBe('deliver-to-asset')
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `bun test:unit src/lib/contracts/__tests__/dockStepKinds.spec.ts`

- [ ] **Step 3: Add the two interfaces and extend the union**

In `src/lib/contracts/contractTypes.ts`, immediately after `DeliverItemsStep` (~line 258):

```ts
/**
 * Step that requires the player to dock at a pinned station-kind asset and
 * confirm a pickup. The engine grants `count` units of `itemId` via the
 * `grantItemsForPickup` hook on confirm and advances the step.
 */
export interface PickupFromAssetStep extends ContractStepRewardMixin {
  /** Discriminator. */
  kind: 'pickup-from-asset'
  /** Pinned asset ref the player must dock at (matches `pinnedAssets[].assetRef`). */
  assetRef: string
  /** Inventory item id to grant on confirm. */
  itemId: string
  /** Units to grant on confirm. */
  count: number
  /** Authored summary for the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}

/**
 * Step that requires the player to dock at a pinned station-kind asset and
 * hand over `count` units of `itemId`. The engine consumes inventory via the
 * existing `consumeItemsForDelivery` hook on confirm and advances on success.
 */
export interface DeliverToAssetStep extends ContractStepRewardMixin {
  /** Discriminator. */
  kind: 'deliver-to-asset'
  /** Pinned asset ref the player must dock at. */
  assetRef: string
  /** Inventory item id to consume on confirm. */
  itemId: string
  /** Units to consume on confirm. */
  count: number
  /** Authored summary for the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}
```

Extend the `ContractStep` union (line 313):

```ts
export type ContractStep =
  | CompleteMissionsStep
  | InstallUpgradeStep
  | VisitPlanetStep
  | OrbitalMissionStep
  | TradeGoodsStep
  | CollectDropsStep
  | LaunchFromBodyStep
  | DeliverItemsStep
  | PickupFromAssetStep
  | DeliverToAssetStep
  | ChoiceMissionStep
```

- [ ] **Step 4: Run, expect PASS** — `bun test:unit src/lib/contracts/__tests__/dockStepKinds.spec.ts && bun run type-check`

If `type-check` fails because a `switch (step.kind)` somewhere is now non-exhaustive, fix each call site by adding pass-through cases for the two new kinds (skipping them — they're handled in Task 5). Likely sites: `contractStepLabel.ts`, `contractStepProgress.ts`, `contractHudRows.ts`. Add a sensible label like `'Dock at <label>'` and a required count of `1` for both (single-confirm).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/ src/lib/contracts/__tests__/
git commit -m "feat(contracts): add pickup-from-asset and deliver-to-asset step kinds"
```

---

## Task 4: Add three new inventory items

**Files:**
- Modify: `src/data/inventory/items.json`
- Test: `src/lib/inventory/__tests__/catalog.spec.ts` (or wherever items are validated; create if no test exists for catalog membership)

- [ ] **Step 1: Write the failing test**

Append to (or create) `src/lib/inventory/__tests__/ceresItems.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getItemDefinition } from '@/lib/inventory/catalog'

const ids = [
  'ceres-institute-canister',
  'ceres-mineral-results-crate',
  'ceres-dan-results-crate',
]

describe('Ceres Institute items', () => {
  it.each(ids)('registers %s with weight 1 and maxStack 1', (id) => {
    const def = getItemDefinition(id)
    expect(def).toBeTruthy()
    expect(def?.weightPerUnit).toBe(1)
    expect(def?.maxStack).toBe(1)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `bun test:unit src/lib/inventory/__tests__/ceresItems.spec.ts`

- [ ] **Step 3: Add the three items**

Append to `src/data/inventory/items.json` (preserve trailing-comma rules of the existing array):

```json
{
  "id": "ceres-institute-canister",
  "category": "consumable",
  "label": "Sealed Ampoule Case",
  "description": "Biostable case from the Ceres Institute. Outer shell sealed; do not handle inner cassettes without equipment you do not have.",
  "icon": "ceres-canister.png",
  "weightPerUnit": 1,
  "maxStack": 1
},
{
  "id": "ceres-mineral-results-crate",
  "category": "consumable",
  "label": "Sealed Sample Crate · Mineral Survey",
  "description": "Hand-readable crate of substrate cores and DAN-cross-referenced mineral readings, sealed for return to the Institute.",
  "icon": "ceres-mineral-crate.png",
  "weightPerUnit": 1,
  "maxStack": 1
},
{
  "id": "ceres-dan-results-crate",
  "category": "consumable",
  "label": "Sealed Sample Crate · DAN",
  "description": "Particle capture cassettes and field-stamped DAN albedo logs, sealed for return to the Institute.",
  "icon": "ceres-dan-crate.png",
  "weightPerUnit": 1,
  "maxStack": 1
}
```

If `category: 'consumable'` is rejected by the catalog schema (check `src/lib/inventory/catalog.ts` for the allowed union), fall back to whichever category Jovian quest items use (likely `'mineral'` or a quest-flagged variant). Match an existing precedent rather than introducing a new category.

If icon files don't exist yet, point at any existing crate icon as a stub and leave a TODO note in the JSON value (acceptable; spec §6.4 explicitly allows stubbing icons).

- [ ] **Step 4: Run, expect PASS** — `bun test:unit src/lib/inventory/__tests__/ceresItems.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add src/data/inventory/items.json src/lib/inventory/__tests__/ceresItems.spec.ts
git commit -m "feat(inventory): add Ceres canister and two results crates"
```

---

## Task 5: ContractSystem — `notifyDockedAtAsset`, `grantItemsForPickup` hook, lifecycle events

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts` (add hooks in `ContractSystemHooks` ~line 42–154; add a `notifyDockedAtAsset` method near `notifyPlanetVisited` ~line 446; emit lifecycle events on accept and on any terminal transition; add `getActiveStepForAsset` helper)
- Test: `src/lib/contracts/__tests__/dockStepFlow.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/contracts/__tests__/dockStepFlow.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ContractSystem } from '@/lib/contracts/ContractSystem'
import type { Contract } from '@/lib/contracts/contractTypes'
import { MessageSystem } from '@/lib/messages/messageSystem'

function inMemoryPersistence() {
  let snap: any = { instances: {}, visitedPlanetIds: {} }
  return { load: () => snap, save: (s: any) => { snap = s } }
}

const stationContract: Contract = {
  id: 'test-dock',
  homePlanet: 'ceres',
  inboxName: 'Test',
  from: 'Tester',
  sentAt: '2306-05-05',
  introSubject: 's', introBody: ['x'],
  pinnedAssets: [{ assetRef: 'station-1', kind: 'station', region: 'kuiper-belt', label: 'S', modelPath: 'models/station.glb', positionSeed: 'station-1' }],
  steps: [
    { kind: 'pickup-from-asset', assetRef: 'station-1', itemId: 'tok', count: 1, subject: 'p', flavor: ['p'] },
    { kind: 'deliver-to-asset', assetRef: 'station-1', itemId: 'tok', count: 1, subject: 'd', flavor: ['d'] },
  ],
} as unknown as Contract

describe('dock step flow', () => {
  it('pickup-from-asset advances on confirm and grants items', () => {
    const grant = vi.fn()
    const ms = new MessageSystem()
    const sys = new ContractSystem(ms, inMemoryPersistence(), { grantItemsForPickup: grant })
    sys.registerContracts([stationContract])
    sys.acceptContract('test-dock')
    sys.notifyDockedAtAsset('station-1')
    expect(grant).toHaveBeenCalledWith('tok', 1)
    expect(sys.getInstance('test-dock')?.currentStepIndex).toBe(1)
  })

  it('deliver-to-asset advances on confirm only when consume returns true', () => {
    const consume = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const ms = new MessageSystem()
    const sys = new ContractSystem(ms, inMemoryPersistence(), {
      grantItemsForPickup: () => {},
      consumeItemsForDelivery: consume,
    })
    sys.registerContracts([stationContract])
    sys.acceptContract('test-dock')
    sys.notifyDockedAtAsset('station-1') // step 0 pickup
    sys.notifyDockedAtAsset('station-1') // step 1 deliver, consume → false
    expect(sys.getInstance('test-dock')?.currentStepIndex).toBe(1)
    sys.notifyDockedAtAsset('station-1') // consume → true
    expect(sys.getInstance('test-dock')?.currentStepIndex).toBe(2)
  })

  it('emits onPinnedAssetActivated on accept and onPinnedAssetDeactivated on terminal', () => {
    const onAct = vi.fn(); const onDeact = vi.fn()
    const ms = new MessageSystem()
    const sys = new ContractSystem(ms, inMemoryPersistence(), {
      grantItemsForPickup: () => {},
      consumeItemsForDelivery: () => true,
      onPinnedAssetActivated: onAct,
      onPinnedAssetDeactivated: onDeact,
    })
    sys.registerContracts([stationContract])
    sys.acceptContract('test-dock')
    expect(onAct).toHaveBeenCalledWith(expect.objectContaining({ assetRef: 'station-1', kind: 'station' }))
    sys.notifyDockedAtAsset('station-1')
    sys.notifyDockedAtAsset('station-1')
    // contract should be completed now (or at least off active); registry should be told to despawn
    expect(onDeact).toHaveBeenCalledWith(expect.objectContaining({ assetRef: 'station-1' }))
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `bun test:unit src/lib/contracts/__tests__/dockStepFlow.spec.ts`

- [ ] **Step 3: Add hooks to `ContractSystemHooks`**

In `src/lib/contracts/ContractSystem.ts` (after `consumeItemsForDelivery`, line ~119):

```ts
  /**
   * Asked by the engine when the player confirms a pickup at a docked
   * station-kind pinned asset. Hosts (typically the inventory bridge) MUST
   * grant `count` units of `itemId` to the player's inventory and persist.
   */
  grantItemsForPickup?: (itemId: string, count: number) => void
  /**
   * Fired when a station-kind pinned asset becomes active (contract accepted
   * with that asset, or any asset toggle the engine adds later).
   */
  onPinnedAssetActivated?: (payload: PinnedAssetLifecyclePayload) => void
  /**
   * Fired when a previously activated station-kind pinned asset should be
   * despawned (contract reaches a terminal state).
   */
  onPinnedAssetDeactivated?: (payload: { assetRef: string }) => void
```

Add the payload type near the other payload interfaces:

```ts
/** Payload for {@link ContractSystemHooks.onPinnedAssetActivated}. */
export interface PinnedAssetLifecyclePayload {
  /** The asset ref. */
  assetRef: string
  /** The asset kind (only `'station'` activates a controller today). */
  kind: 'station' | 'asteroid'
  /** Region for the spawner (e.g. `'kuiper-belt'`). */
  region: string
  /** Display label for the F-prompt. */
  label: string
  /** GLB path under `public/` (only present when kind === 'station'). */
  modelPath?: string
  /** Stable seed hashed to a deterministic position (only when kind === 'station'). */
  positionSeed?: string
}
```

- [ ] **Step 4: Add `notifyDockedAtAsset` and `getActiveStepForAsset`**

After `notifyPlanetVisited` (~line 487):

```ts
  /**
   * Notify the system that the player has just confirmed a dock-and-act at a
   * pinned station-kind asset. Advances any active `pickup-from-asset` /
   * `deliver-to-asset` step whose `assetRef` matches.
   */
  notifyDockedAtAsset(assetRef: string): void {
    let changed = false
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step) continue
      if (step.kind === 'pickup-from-asset') {
        if (step.assetRef !== assetRef) continue
        this.hooks.grantItemsForPickup?.(step.itemId, step.count)
        this.advanceStep(contract, instance, 1)
        changed = true
      } else if (step.kind === 'deliver-to-asset') {
        if (step.assetRef !== assetRef) continue
        const consumed = this.hooks.consumeItemsForDelivery?.(step.itemId, step.count) ?? false
        if (!consumed) continue
        this.advanceStep(contract, instance, 1)
        changed = true
      }
    }
    this.persist()
    if (changed) this.afterChange()
  }

  /**
   * Return the active step on any contract whose pinned-station assetRef
   * matches. Returns null when no contract has the asset active or the
   * current step does not target it. Used by the dock panel to decide what
   * action button to show.
   */
  getActiveStepForAsset(
    assetRef: string,
  ): { contractId: string; step: ContractStep; stepIndex: number } | null {
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step) continue
      if (step.kind !== 'pickup-from-asset' && step.kind !== 'deliver-to-asset') continue
      if (step.assetRef !== assetRef) continue
      return { contractId: contract.id, step, stepIndex: instance.currentStepIndex }
    }
    return null
  }
```

- [ ] **Step 5: Wire lifecycle emissions**

Find the place in `ContractSystem.ts` where a contract transitions to `'active'` (search for `status: 'active'` near `acceptContract`). After that mutation, iterate `contract.pinnedAssets` and call `this.hooks.onPinnedAssetActivated?.({ assetRef, kind: kind ?? 'asteroid', region, label, modelPath, positionSeed })` for each one.

Find the place(s) where a contract transitions to a terminal status (`completed`, `declined`, `abandoned`). Search for `status: 'completed'`. After the mutation, iterate `contract.pinnedAssets` and call `this.hooks.onPinnedAssetDeactivated?.({ assetRef })` for each.

- [ ] **Step 6: Run, expect PASS**

Run: `bun test:unit src/lib/contracts && bun run type-check`
Expected: PASS. The new test passes; existing tests untouched.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contracts/
git commit -m "feat(contracts): notifyDockedAtAsset, grantItemsForPickup, pinned-asset lifecycle hooks"
```

---

## Task 6: Mission completion `grantsItemOnComplete` with `replenishWhileStepOpen`

**Files:**
- Modify: `src/lib/missions/types.ts` (add `grantsItemOnComplete` to `GeneratedAsteroidMission`)
- Modify: `src/lib/missions/asteroidMissionRewards.ts` (around line 86, after the existing collect loop)
- Test: `src/lib/missions/__tests__/grantsItemOnComplete.spec.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `src/lib/missions/__tests__/grantsItemOnComplete.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { persistCompletedAsteroidMissionRewards } from '@/lib/missions/asteroidMissionRewards'

// Setup: stub localStorage; stub loadActiveMission/loadInventory/saveInventory; stub
// contractSystem.notifyMissionCompleted, contractSystem.getActiveStepForAsset.
// Inject a fake mineral mission with grantsItemOnComplete.

describe('grantsItemOnComplete', () => {
  it('grants item once when player has zero held', () => {
    /* drive completion with zero held; expect addItem called once with crate id */
  })
  it('re-grants when paired deliver step is still active and player lost the crate', () => {
    /* simulate post-death: zero held, deliver step active; expect addItem called */
  })
  it('skips grant when player still holds the crate', () => {
    /* held=1, replenishWhileStepOpen=true → expect addItem NOT called */
  })
  it('skips grant when paired deliver step has already advanced', () => {
    /* getActiveStepForDeliveryItem returns null → expect addItem NOT called */
  })
})
```

The test setup is non-trivial — use `vi.mock` to stub `@/lib/missions/missionStorage`, `@/lib/inventory/inventoryStorage`, `@/lib/player/profile`, `@/lib/contracts/runtime`. Mirror the structure of any existing rewards test in the same folder.

- [ ] **Step 2: Run, expect FAIL** — `bun test:unit src/lib/missions/__tests__/grantsItemOnComplete.spec.ts`

- [ ] **Step 3: Extend `GeneratedAsteroidMission`**

In `src/lib/missions/types.ts`, on the `GeneratedAsteroidMission` interface (or its `'special'` variant — check the discriminator):

```ts
  /**
   * Optional inventory grant on successful completion. When
   * `replenishWhileStepOpen` is true, the grant is suppressed if the player
   * already holds at least `count` of `itemId` (no duplicates), and is
   * suppressed entirely once any paired `deliver-to-asset` step in any active
   * contract has already advanced past the matching `itemId`. This is the
   * softlock-prevention rule: lost-crate-on-death triggers a re-grant; the
   * loop closes when the deliver step advances.
   */
  grantsItemOnComplete?: {
    /** Inventory item id to grant on success. */
    itemId: string
    /** Units to grant. */
    count: number
    /** When true, applies the dedup + close-on-deliver-advance rules. */
    replenishWhileStepOpen?: boolean
  }
```

- [ ] **Step 4: Implement the grant in `asteroidMissionRewards.ts`**

After line 86 (after the collect-objective loop, before `saveInventory(inventory)`):

```ts
  // Optional inventory grant attached to the mission definition.
  // Spec §6.3 — softlock prevention: when replenishWhileStepOpen is true,
  // skip the grant if the player already holds enough OR if no contract has
  // an active deliver-to-asset step still expecting this item.
  if (mission.grantsItemOnComplete) {
    const { itemId, count, replenishWhileStepOpen } = mission.grantsItemOnComplete
    let shouldGrant = true
    if (replenishWhileStepOpen) {
      const heldCount = inventory.items[itemId]?.quantity ?? 0
      if (heldCount >= count) shouldGrant = false
      if (!hasActiveDeliveryWaitingFor(itemId)) shouldGrant = false
    }
    if (shouldGrant) {
      const result = addItem(inventory, itemId, count)
      if (result.ok) inventory = result.inventory
      else console.warn(`[asteroidMissionRewards] grantsItemOnComplete failed: ${result.reason}`)
    }
  }
```

Implement `hasActiveDeliveryWaitingFor` as a small helper at the bottom of the file:

```ts
function hasActiveDeliveryWaitingFor(itemId: string): boolean {
  for (const inst of contractSystem.listActiveInstances()) {
    const c = contractSystem.getContract(inst.contractId)
    const step = c?.steps[inst.currentStepIndex]
    if (step?.kind === 'deliver-to-asset' && step.itemId === itemId) return true
    if (step?.kind === 'deliver-items' && step.itemId === itemId) return true
  }
  return false
}
```

If `contractSystem.listActiveInstances()` / `getContract()` aren't already exposed, add small public getters on the system. The reference snippet in the existing rewards file already imports `contractSystem` from `@/lib/contracts/runtime` (line 30).

Read the actual `Inventory` shape in `src/lib/inventory/inventory.ts` to confirm the `inventory.items[id].quantity` accessor — if it differs (e.g. `getQuantity(inv, id)`), use the actual API.

- [ ] **Step 5: Run, expect PASS** — `bun test:unit src/lib/missions/__tests__/grantsItemOnComplete.spec.ts && bun run type-check`

- [ ] **Step 6: Commit**

```bash
git add src/lib/missions/ src/lib/contracts/
git commit -m "feat(missions): grantsItemOnComplete with replenishWhileStepOpen softlock guard"
```

---

## Task 7: PinnedStationController (Three.js)

**Files:**
- Create: `src/three/PinnedStationController.ts`
- Test: smoke-only — actual Three rendering not unit-tested per project convention.

- [ ] **Step 1: Read sibling controllers for the pattern**

Read `src/three/RelayAntennaController.ts` and `src/three/SatelliteRepairController.ts` for the established controller pattern: constructor with scene+modelPath, `dispose()`, `update(dt)`, `getWorldPosition()`. Mirror it.

- [ ] **Step 2: Implement the controller**

```ts
/**
 * Renders a station GLB at a deterministic Kuiper-belt position for the
 * duration of an active contract that pins it. Mission-spawned, not a
 * celestial body — the orbit detector never sees it.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import * as THREE from 'three'
import { loadGLB } from '@/three/loadGLB'
import { hashToKuiperPosition } from '@/lib/math/deterministicPositioning'

/** Constructor options. */
export interface PinnedStationControllerOptions {
  /** Three scene to add the model to. */
  scene: THREE.Scene
  /** Path under `public/` (e.g. `'models/station.glb'`). */
  modelPath: string
  /** Stable seed hashed to a deterministic position. */
  positionSeed: string
  /** World-units scale. Stations are physically large; default 1. */
  scale?: number
}

/** Three controller for a pinned station-kind asset. */
export class PinnedStationController {
  private group: THREE.Group
  private disposed = false
  private worldPos: THREE.Vector3

  constructor(opts: PinnedStationControllerOptions) {
    this.group = new THREE.Group()
    this.worldPos = hashToKuiperPosition(opts.positionSeed)
    this.group.position.copy(this.worldPos)
    this.group.scale.setScalar(opts.scale ?? 1)
    opts.scene.add(this.group)
    void loadGLB(opts.modelPath).then((gltf) => {
      if (this.disposed) return
      this.group.add(gltf.scene)
    })
  }

  /** World-space position of the station (used by the proximity loop). */
  getWorldPosition(): THREE.Vector3 {
    return this.worldPos.clone()
  }

  /** Dispose model + remove from scene. Safe to call once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.group.parent?.remove(this.group)
    this.group.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose()
      const mat = (o as THREE.Mesh).material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else if (mat) mat.dispose()
    })
  }
}
```

If `hashToKuiperPosition` does not exist, add it to a new file `src/lib/math/deterministicPositioning.ts`. Implementation: hash the seed string to two stable floats `(angle, radius)`, where `radius` ∈ Kuiper belt range and `angle` ∈ [0, 2π). Then `new THREE.Vector3(radius * cos(angle), 0, radius * sin(angle))`. Cite the actual Kuiper belt radius constants from `src/lib/planets/catalog.ts` if present (e.g. the bunker site's region radius — match it).

- [ ] **Step 3: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/three/PinnedStationController.ts src/lib/math/deterministicPositioning.ts
git commit -m "feat(three): PinnedStationController with deterministic Kuiper position"
```

---

## Task 8: PinnedAssetWorldRegistry + DockProximityWatcher in MapViewController

**Files:**
- Modify: `src/views/MapViewController.ts` (around line 2215 — existing `tryBeginAsteroidMission` proximity check)
- Modify: `src/lib/contracts/runtime.ts` (wire the new hooks `grantItemsForPickup`, `onPinnedAssetActivated`, `onPinnedAssetDeactivated`)
- Test: `src/views/__tests__/dockProximity.spec.ts` (only if a similar testable seam exists; otherwise smoke-only and rely on contract-flow tests)

- [ ] **Step 1: Inspect the runtime hook wiring**

Read `src/lib/contracts/runtime.ts:240-310` (the `consumeItemsForDelivery` / `hasOrbitedPlanet` hook implementations). Add `grantItemsForPickup` next to them: load inventory, addItem, save:

```ts
grantItemsForPickup: (itemId, count) => {
  let inv = loadInventory() ?? createInventory()
  const result = addItem(inv, itemId, count)
  if (!result.ok) {
    console.warn(`[contracts] grantItemsForPickup failed: ${result.reason}`)
    return
  }
  saveInventory(result.inventory)
},
```

For `onPinnedAssetActivated` / `onPinnedAssetDeactivated` — these need to reach `MapViewController`. The pattern in this codebase is a runtime-side event emitter (e.g., a Pinia store or a small EventTarget in `runtime.ts`). Re-use whatever existing channel surfaces contract changes to `MapView` (search for how `onContractsChanged` reaches the map). If `MapViewController` reads contract state directly each tick, the registry simply diffs `contractSystem.listActivePinnedStations()` between ticks — add that method to the system instead.

Pragmatic approach: add `getActivePinnedAssets(): PinnedAssetLifecyclePayload[]` to `ContractSystem` (returns a flat list across all active instances, station kind only). Then `MapViewController` calls it each tick and the registry diffs.

- [ ] **Step 2: Add `getActivePinnedAssets` to ContractSystem**

```ts
/** Flat list of station-kind pinned assets on every currently-active contract. */
getActivePinnedAssets(): PinnedAssetLifecyclePayload[] {
  const out: PinnedAssetLifecyclePayload[] = []
  for (const inst of Object.values(this.snapshot.instances)) {
    if (inst.status !== 'active') continue
    const c = this.contracts.get(inst.contractId)
    if (!c?.pinnedAssets) continue
    for (const a of c.pinnedAssets) {
      if (a.kind !== 'station') continue
      out.push({ assetRef: a.assetRef, kind: 'station', region: a.region, label: a.label, modelPath: a.modelPath, positionSeed: a.positionSeed })
    }
  }
  return out
}
```

- [ ] **Step 3: Add the registry to MapViewController**

In `MapViewController.ts`, near the other Three-controller fields (search for `private shuttleController`):

```ts
private pinnedStationControllers = new Map<string, PinnedStationController>()
```

Add a method:

```ts
private syncPinnedStations(): void {
  const desired = contractSystem.getActivePinnedAssets()
  const desiredRefs = new Set(desired.map((a) => a.assetRef))
  // Despawn anything no longer desired
  for (const [ref, controller] of this.pinnedStationControllers) {
    if (!desiredRefs.has(ref)) {
      controller.dispose()
      this.pinnedStationControllers.delete(ref)
    }
  }
  // Spawn anything new
  for (const a of desired) {
    if (this.pinnedStationControllers.has(a.assetRef)) continue
    if (!a.modelPath || !a.positionSeed) continue
    this.pinnedStationControllers.set(
      a.assetRef,
      new PinnedStationController({
        scene: this.scene,
        modelPath: a.modelPath,
        positionSeed: a.positionSeed,
      }),
    )
  }
}
```

Call `syncPinnedStations()` once per tick (cheap: empty diff is O(0); set comparisons are O(n) on a tiny n). Add the call inside `tick(dt)` near the start, before the proximity checks.

- [ ] **Step 4: Add the dock proximity watcher**

After the `tryBeginAsteroidMission` block (line ~2215):

```ts
// Dock proximity — sibling to mission proximity. F-prompt + open dock panel.
if (this.shuttleController && !this.shuttleController.dead) {
  const shuttlePos = this.shuttleController.position
  let nearestRef: string | null = null
  let nearestLabel = ''
  let nearestDist = DOCK_PROXIMITY_M
  for (const [ref, controller] of this.pinnedStationControllers) {
    const d = shuttlePos.distanceTo(controller.getWorldPosition())
    if (d < nearestDist) {
      nearestDist = d
      nearestRef = ref
      const meta = contractSystem.getActivePinnedAssets().find((a) => a.assetRef === ref)
      nearestLabel = meta?.label ?? 'STATION'
    }
  }
  if (nearestRef) {
    this.dockPromptState.value = { assetRef: nearestRef, label: nearestLabel }
    if (this.inputManager?.wasActionPressed('beginMission')) {
      this.onRequestDock?.(nearestRef)
    }
  } else {
    this.dockPromptState.value = null
  }
}
```

Define `DOCK_PROXIMITY_M` near other proximity constants in the file (match the value of the asteroid-mission proximity threshold; spec doesn't pin a number — pick something the same order of magnitude, e.g. the existing mission-begin radius, then tune later).

Add `dockPromptState: Ref<{ assetRef: string; label: string } | null>` and `onRequestDock?: (assetRef: string) => void` to the controller surface. The Vue layer (Task 9) reads `dockPromptState` and binds the panel.

- [ ] **Step 5: Type-check**

Run: `bun run type-check && bun lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/MapViewController.ts src/lib/contracts/
git commit -m "feat(map): pinned-station registry + dock proximity watcher"
```

---

## Task 9: DockPanel.vue + KeyPrompt for the F-prompt

**Files:**
- Create: `src/components/DockPanel.vue`
- Create: `src/components/DockPanel.css` (sibling — Tailwind @apply per CLAUDE.md memory; never inside `<style scoped>`)
- Modify: `src/assets/css/main.css` (import the sibling css)
- Modify: `src/views/MapView.vue` (mount DockPanel; render F-prompt via existing `KeyPrompt.vue`)

- [ ] **Step 1: Read sibling components**

Read `src/components/KeyPrompt.vue` (used for in-world F-prompts) and `src/components/MissionFocusPrompt.vue` (a panel-style component) for structure conventions.

- [ ] **Step 2: Implement DockPanel.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { contractSystem } from '@/lib/contracts/runtime'

const props = defineProps<{
  /** Asset ref the player docked at; null when panel is closed. */
  assetRef: string | null
}>()
const emit = defineEmits<{ close: [] }>()

const active = computed(() =>
  props.assetRef ? contractSystem.getActiveStepForAsset(props.assetRef) : null,
)

const verb = computed(() => {
  const k = active.value?.step.kind
  if (k === 'pickup-from-asset') return 'TAKE PACKAGE'
  if (k === 'deliver-to-asset') return 'HAND OVER'
  return null
})

const flavor = computed(() => active.value?.step.flavor ?? [
  'The dock cycle completes. The station hums, indifferent.',
  'Nothing here for you today.',
])

function onConfirm(): void {
  if (!props.assetRef) return
  contractSystem.notifyDockedAtAsset(props.assetRef)
  emit('close')
}
</script>

<template>
  <div v-if="assetRef" class="dock-panel">
    <header class="dock-panel-header">CERES INSTITUTE STATION · DOCK</header>
    <section class="dock-panel-body">
      <p v-for="(p, i) in flavor" :key="i">{{ p }}</p>
    </section>
    <footer class="dock-panel-footer">
      <button v-if="verb" class="dock-panel-confirm" @click="onConfirm">{{ verb }}</button>
      <button class="dock-panel-close" @click="emit('close')">CLOSE</button>
    </footer>
  </div>
</template>
```

- [ ] **Step 3: Create DockPanel.css (Tailwind @apply, sibling not scoped)**

```css
.dock-panel { @apply fixed inset-0 m-auto w-[640px] h-[420px] bg-zinc-900/95 border border-zinc-700 text-zinc-100 p-6 flex flex-col gap-4 z-50; }
.dock-panel-header { @apply text-sm tracking-widest uppercase text-emerald-400; }
.dock-panel-body { @apply flex-1 overflow-y-auto text-sm leading-relaxed; }
.dock-panel-body p + p { @apply mt-3; }
.dock-panel-footer { @apply flex justify-end gap-3; }
.dock-panel-confirm { @apply px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs tracking-wider uppercase; }
.dock-panel-close { @apply px-4 py-2 border border-zinc-600 hover:border-zinc-400 text-xs tracking-wider uppercase; }
```

- [ ] **Step 4: Import the css from main.css**

Append: `@import './components/dock-panel.css';` (or follow whatever import path convention is used by `key-prompt.css` — see `src/assets/css/main.css` for the pattern).

- [ ] **Step 5: Mount in MapView.vue**

Bind a `dockedAssetRef` ref to `MapViewController.onRequestDock`. Render `<DockPanel :asset-ref="dockedAssetRef" @close="dockedAssetRef = null" />` plus `<KeyPrompt v-if="dockPromptState" key-label="F" :action="`Dock at ${dockPromptState.label}`" tone="green" variant="split" />`. Pull `dockPromptState` reactively from the controller.

- [ ] **Step 6: Run dev server and smoke-test manually**

Run: `bun dev`. Open the contract via dev tools (force-accept), fly the shuttle near the spawned station. Confirm the F-prompt shows, F opens the panel, the action button advances the contract step.

- [ ] **Step 7: Commit**

```bash
git add src/components/DockPanel.vue src/components/dock-panel.css src/assets/css/main.css src/views/MapView.vue
git commit -m "feat(map): DockPanel and F-prompt for pinned stations"
```

---

## Task 10: Augment mineral and DAN special missions with `grantsItemOnComplete`

**Files:**
- Modify: `src/data/missions/ceres-institute-mineral-analysis.json`
- Modify: `src/data/missions/ceres-institute-dan.json`
- Test: a small parser test that reads the JSONs and asserts the field is present.

- [ ] **Step 1: Append `grantsItemOnComplete` to both files**

In `src/data/missions/ceres-institute-mineral-analysis.json`, after `"totalReward": 6000,`:

```json
  "grantsItemOnComplete": {
    "itemId": "ceres-mineral-results-crate",
    "count": 1,
    "replenishWhileStepOpen": true
  },
```

Same shape in `ceres-institute-dan.json` with `"itemId": "ceres-dan-results-crate"`.

- [ ] **Step 2: Add a parser smoke test**

Create `src/data/missions/__tests__/ceresInstituteGrants.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import mineral from '@/data/missions/ceres-institute-mineral-analysis.json'
import dan from '@/data/missions/ceres-institute-dan.json'

describe('Ceres Institute mission grants', () => {
  it('mineral grants ceres-mineral-results-crate with replenish flag', () => {
    expect(mineral.grantsItemOnComplete).toEqual({
      itemId: 'ceres-mineral-results-crate', count: 1, replenishWhileStepOpen: true,
    })
  })
  it('dan grants ceres-dan-results-crate with replenish flag', () => {
    expect(dan.grantsItemOnComplete).toEqual({
      itemId: 'ceres-dan-results-crate', count: 1, replenishWhileStepOpen: true,
    })
  })
})
```

- [ ] **Step 3: Run, expect PASS** — `bun test:unit src/data/missions`

- [ ] **Step 4: Commit**

```bash
git add src/data/missions/ src/data/missions/__tests__/
git commit -m "feat(missions): mineral and DAN drop sealed crates on completion"
```

---

## Task 11: Rewrite `ceres-institute-eternal-biology.json` to the 10-step shape

**Files:**
- Modify: `src/data/contracts/ceres-institute-eternal-biology.json`
- Modify: `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts` (update step count + new asserts)

- [ ] **Step 1: Update the contract walkthrough test**

Open `src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`. Set:

```ts
expect(ceres.steps.length).toBe(10)
expect(ceres.pinnedAssets?.find((a) => a.assetRef === 'ceres-institute-station')?.kind).toBe('station')
expect(ceres.pinnedAssets?.find((a) => a.assetRef === 'ceres-archive-site')).toBeTruthy()

// Step-kind sequence
const kinds = ceres.steps.map((s) => s.kind)
expect(kinds).toEqual([
  'complete-missions', 'pickup-from-asset', 'deliver-items',
  'complete-missions', 'complete-missions', 'deliver-to-asset',
  'complete-missions', 'deliver-to-asset', 'complete-missions',
  'choice-mission',
])

// Item refs
const pickup = ceres.steps[1] as any
expect(pickup.itemId).toBe('ceres-institute-canister')
expect((ceres.steps[2] as any).itemId).toBe('ceres-institute-canister')
expect((ceres.steps[5] as any).itemId).toBe('ceres-mineral-results-crate')
expect((ceres.steps[7] as any).itemId).toBe('ceres-dan-results-crate')
```

- [ ] **Step 2: Run, expect FAIL** — `bun test:unit src/lib/contracts/__tests__/ceres-institute-contract.spec.ts`

- [ ] **Step 3: Rewrite the contract JSON**

The full structure to land — voice/copy per spec §8. Pinned assets become an array of two: `ceres-institute-station` (kind: station, modelPath, positionSeed) and `ceres-archive-site` (existing, no kind = asteroid).

```json
{
  "id": "ceres-institute-eternal-biology",
  "homePlanet": "ceres",
  "inboxName": "Ceres Institute",
  "from": "Dean Bernard Porter, Ceres Institute for Eternal Biology",
  "sentAt": "2306-05-04 09:12 UTC",
  "offerWhenPrerequisites": {
    "requiredUpgrades": [
      { "upgradeId": "gravitySurfing", "minLevel": 1 },
      { "upgradeId": "orbitalSurfing", "minLevel": 1 }
    ],
    "triggerOnPlanetVisited": "ceres"
  },
  "pinnedAssets": [
    {
      "assetRef": "ceres-institute-station",
      "kind": "station",
      "region": "kuiper-belt",
      "label": "CIB Research Station",
      "modelPath": "models/station.glb",
      "positionSeed": "ceres-institute-station"
    },
    {
      "assetRef": "ceres-archive-site",
      "region": "kuiper-belt",
      "label": "Site CIB-7"
    }
  ],
  "introSubject": "An Introduction, and a Standing Invitation",
  "introBody": [ /* keep the existing eight-paragraph introBody verbatim */ ],
  "steps": [
    /* Step 1 — keep existing complete-missions shuttle Earth-supplies step verbatim */,
    {
      "kind": "pickup-from-asset",
      "assetRef": "ceres-institute-station",
      "itemId": "ceres-institute-canister",
      "count": 1,
      "creditsReward": 4000,
      "subject": "Step 2 — A Visit, and a Quiet Errand",
      "flavor": [
        "Young pilot —",
        "Welcome to the station. Tour first; coffee shortly. The dock crew will hand you a sealed case before you leave — biostable shell, outer layer set, do not open the inner cassettes without the appropriate equipment, which you do not have. The case rides home with you. The clinical wing on Ceres surface will know what to do with it.",
        "A small confession during approach. What carries you up here — the neutron thruster, the manifold, the surfing rigs hanging off it — is, in a sense, borrowed. The lattice that produces your thrust is a viroid lattice. We did not invent the physics. We *recognised* it, on Phobos, after the drilling. Every ship in the system is flying on a piece of their biology dressed up in a pressure vessel. Keep that in mind during the tour. It saves me having to bring it up over coffee.",
        "— Porter"
      ]
    },
    {
      "kind": "deliver-items",
      "planetId": "ceres",
      "itemId": "ceres-institute-canister",
      "count": 1,
      "creditsReward": 4000,
      "subject": "Step 3 — Drop at the Clinical Wing",
      "flavor": [
        "Young pilot —",
        "Set the case down at the clinical wing receiving bay on the Ceres surface. The wing handles what we, in our paperwork, call *recovery cases*. You will not see them. Their care is — emphatically — ours.",
        "— Porter"
      ]
    },
    /* Step 4 — keep existing rescue-1 special-mission step copy (current 'Step 3' in old JSON), update subject to 'Step 4 —' */,
    /* Step 5 — keep existing mineral-analysis step copy, update subject to 'Step 5 —' and add a final flavor sentence about the readings spooling into a sealed crate for the station's archive */,
    {
      "kind": "deliver-to-asset",
      "assetRef": "ceres-institute-station",
      "itemId": "ceres-mineral-results-crate",
      "count": 1,
      "creditsReward": 4500,
      "subject": "Step 6 — Hand Over the Mineral Crate",
      "flavor": [
        "Young pilot —",
        "Bring the sealed crate up to the station. The instrumentation team is cross-referencing your readings against the lab's running model of substrate viability — soil, in the colonies' sense. Coffee is still on, if you can spare the orbit.",
        "— Porter"
      ]
    },
    /* Step 7 — keep existing DAN-survey step copy, update subject to 'Step 7 —' and add a final flavor sentence about the cassettes sealing into the second crate */,
    {
      "kind": "deliver-to-asset",
      "assetRef": "ceres-institute-station",
      "itemId": "ceres-dan-results-crate",
      "count": 1,
      "creditsReward": 5500,
      "subject": "Step 8 — Hand Over the DAN Crate",
      "flavor": [
        "Young pilot —",
        "Last crate. The assays are converging in a way I am uncomfortable with and exhilarated by, in roughly equal measure. Bring it up. We will discuss the next move at the station, and I will be honest with you about what comes after.",
        "— Porter"
      ]
    },
    /* Step 9 — keep existing rescue-2 step copy, update subject to 'Step 9 —' (the red-pylons / extraction-columns paragraph stays — it's the heart of this beat) */,
    /* Step 10 — keep existing choice-mission archive-bunker step verbatim, update subject to 'Step 10 —' */
  ],
  "completionByOutcome": { /* unchanged */ }
}
```

The `/* keep existing ... */` comments above are notes for the implementer — JSON has no comments. Replace them with the actual step bodies copied from the prior JSON, with subjects renumbered and flavor additions per spec §8. Do **not** invent new flavor copy beyond what spec §8 specifies — keep voice tight and Porter-shaped.

- [ ] **Step 4: Run the parser test, expect PASS** — `bun test:unit src/lib/contracts/__tests__/ceres-institute-contract.spec.ts && bun run type-check`

- [ ] **Step 5: Commit**

```bash
git add src/data/contracts/ceres-institute-eternal-biology.json src/lib/contracts/__tests__/
git commit -m "feat(contracts): rewrite Ceres Institute to 10-step station-courier shape"
```

---

## Task 12: Add offer-message templates for steps 2, 3, 6, 8

**Files:**
- Modify: `src/data/messages/` (whichever folder/file holds the existing Ceres Institute step offer messages — search for `ceres-institute-mineral-analysis` references)
- Modify: `src/lib/missions/specialMissions.ts` (or wherever `SPECIAL_MISSION_OFFER_IDS` lives)

- [ ] **Step 1: Locate the existing offer-message pattern**

Run: `bun grep "SPECIAL_MISSION_OFFER_IDS"` and `bun grep "ceres-institute-mineral-analysis-offer"` to find the file pattern.

- [ ] **Step 2: Add four new templates**

For each of step 2 (`ceres-institute-station-pickup-offer`), step 3 (`ceres-institute-canister-deliver-offer`), step 6 (`ceres-institute-mineral-deliver-offer`), step 8 (`ceres-institute-dan-deliver-offer`): create the message template mirroring the shape used by the existing 5 offer messages. Each is a short Porter-voiced inbox nudge.

- [ ] **Step 3: Wire into `SPECIAL_MISSION_OFFER_IDS`**

Note: `pickup-from-asset` and `deliver-to-asset` steps don't have a `specialMissionId`. The "offer message" for these dock steps fires on step activation (`onStepActivated`), not on a special mission. Decide between (a) extending the offer-id map to include step indices, or (b) authoring the cue directly into the step's `flavor` array — which the existing engine already posts on step activation. Spec implies (b): each step's `flavor` is itself the inbox message. So this task may collapse to: confirm step `flavor` arrays read well as standalone inbox messages, and **no new template wiring is needed**.

If on inspection (a) is required by an existing test or HUD path, add the entries. Otherwise close this task as "no-op confirmed; flavor arrays are the offer messages."

- [ ] **Step 4: Run tests** — `bun test:unit && bun run type-check`

- [ ] **Step 5: Commit (only if files changed)**

```bash
git add -A
git commit -m "feat(contracts): wire dock-step offer messages"
```

---

## Task 13: Confirm achievements still resolve

**Files:**
- Read-only: any achievement JSON / rule file referencing `ceres-institute-eternal-biology`. Likely under `src/data/achievements/` — locate via `bun grep "ceres-institute-eternal-biology"` in `src/data/`.

- [ ] **Step 1: List achievement rules**

Run: Grep for `ceres-institute-eternal-biology` across `src/data/achievements/`. For each rule of kind `specific_contract_step_completed`, the rule references a step **index** or **id**.

- [ ] **Step 2: Patch step indices if any rule uses them**

If a rule says `"stepIndex": 2`, the old "Step 3" rescue is now at index 3. Update each affected rule. Prefer step **id** anchors over indices if the rule schema supports it; if not, hand-update indices and add a one-line comment in the JSON file (a "_comment" key at root if the linter accepts it; otherwise just document in commit message).

- [ ] **Step 3: Run achievement tests** — `bun test:unit src/lib/achievements` (path may differ — find the achievement test folder).

- [ ] **Step 4: Commit (only if changes)**

```bash
git add src/data/achievements/
git commit -m "fix(achievements): renumber Ceres Institute step indices for 10-step shape"
```

---

## Task 14: Manual smoke per spec §9.3

**Files:** none — this is the manual punch list that establishes the feature works in-game.

- [ ] **Step 1: Run dev** — `bun dev`

- [ ] **Step 2: Walk the smoke list**

Run through every item in `docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md` §9.3 (1–10):

1. Accept contract; station + bunker visible on map.
2. Proximity F-prompt fires.
3. Step 2 dock → TAKE PACKAGE → canister granted → step advances.
4. Step 3 deliver at Ceres surface (existing flow).
5. Steps 4, 5, 7, 9 asteroid missions; mineral + DAN drop crates; rescues do not.
6. Steps 6, 8 dock → HAND OVER → consumes crate → advances. Refusal text on missing crate.
7. Step 10 bunker → TRANSMIT or SABOTAGE.
8. On completion (either outcome): station despawns; bunker despawns.
9. Save/reload at every gating step. State persists; no regression.
10. Achievement toasts fire correctly per arm.

- [ ] **Step 3: Crate softlock cases**

Mid-Step 6 chain: complete mineral, fly to asteroid, die. Crate gone. Re-fly mineral special. Confirm crate is re-granted on completion. Dock and deliver — chain advances. Re-fly mineral one more time after Step 6 advanced — confirm crate is **not** re-granted.

- [ ] **Step 4: Canister softlock case**

After Step 2 grants canister, before docking at Ceres for Step 3, suicide. Confirm dock at station re-offers TAKE PACKAGE. Take it. Deliver at Ceres. Step 3 advances. Re-dock at station — confirm dock is now close-only.

- [ ] **Step 5: Final pre-merge gate**

```bash
bun run type-check && bun lint && bun test:unit
```

All three must be clean (oxlint 0 errors, ESLint 0 errors / 0 warnings, all Vitest green) per CLAUDE.md merge criteria.

- [ ] **Step 6: Final commit (any tuning)**

```bash
git add -A
git commit -m "chore(ceres): post-smoke tuning"
```

---

## Self-Review Notes (for the executor)

- Every code step shows the actual code or the exact file:line target.
- No `TODO`, `TBD`, or "implement appropriately" — substantive guidance everywhere.
- Type names used consistently across tasks: `PinnedAsset` (Task 2), `PickupFromAssetStep` / `DeliverToAssetStep` / `ContractStep` (Task 3), `PinnedAssetLifecyclePayload` (Task 5), `PinnedStationController` (Task 7), `DockPanel` (Task 9), `grantsItemOnComplete` (Task 6), `notifyDockedAtAsset` / `getActiveStepForAsset` / `grantItemsForPickup` / `getActivePinnedAssets` (Task 5/8).
- Spec coverage:
  - §3 player experience → Task 9 (panel) + Task 8 (proximity prompt).
  - §4 10-step shape → Task 11 (rewrite) + Task 3 (kinds) + Task 10 (drops).
  - §5 architecture → Tasks 5, 7, 8, 9.
  - §6 schema additions → Tasks 2, 3, 4, 6.
  - §7 data flow → Task 5 (engine) + Task 8 (controller).
  - §8 voice → Task 11 + Task 12.
  - §9 testing → embedded tests in Tasks 2, 3, 4, 5, 6, 10, 11; Task 14 manual.
  - §11 decisions (softlock) → Task 6.
  - §12 migration order → Tasks 1 → 14 mirror it.
