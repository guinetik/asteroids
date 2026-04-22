# Act 1 — Inner System Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the Act 1 journey — three inner-system contracts + the existing Consortium Certification mission — so completing the three contracts auto-stages the USC message + asteroid waypoint, and installing the Grid Coupling Module completes Act 1.

**Architecture:** Two new journey trigger variants (`contract_completed:<id>`, `upgrade_installed:<id>`) driven by listener hooks on `ContractSystem` (contract → completed) and `src/lib/upgrades.ts` (upgrade level crossing 0 → ≥1). `MapViewController` subscribes and relays into `notifyJourneyTrigger`, plus runs `maybeStageAct1Climax()` after each contract-completed to materialize the message + special mission when the 3 inner-system contracts are done. Boot-time self-heal re-fires the triggers for pre-existing saves.

**Tech Stack:** TypeScript (strict), Vitest, Vue 3, Bun. Follow existing patterns in `src/lib/journeys.ts`, `src/lib/contracts/ContractSystem.ts`, and `src/lib/contracts/runtime.ts`.

**Spec:** `docs/superpowers/specs/2026-04-22-act-1-inner-system-journey-design.md`

---

## Task 1: Extend `JourneyTriggerId` with the two new variants

**Files:**
- Modify: `src/lib/journeys.ts:8-17`
- Modify: `src/lib/__tests__/journeys.spec.ts`

The `JourneyTriggerId` union currently contains one template-literal variant (`message_archived:${string}`) plus several fixed strings. We add `contract_completed:${string}` and `upgrade_installed:${UpgradeId}`. `UpgradeId` needs to be imported from `@/lib/upgrades`.

- [ ] **Step 1: Write a failing test asserting the union accepts the new trigger shapes**

Add this test at the end of `src/lib/__tests__/journeys.spec.ts` (inside the existing `describe('journeys', …)`):

```ts
  it('accepts contract_completed and upgrade_installed triggers without effect when no journey matches', () => {
    let profile = createProfile('Pilot')
    const contractResult = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    expect(contractResult.changed).toBe(false)
    profile = contractResult.profile
    const upgradeResult = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing')
    expect(upgradeResult.changed).toBe(false)
  })
```

- [ ] **Step 2: Run the test and watch it fail at compile**

Run: `bun test:unit src/lib/__tests__/journeys.spec.ts`

Expected: TypeScript error — `'contract_completed:…'` and `'upgrade_installed:…'` are not assignable to `JourneyTriggerId`.

- [ ] **Step 3: Extend `JourneyTriggerId`**

Edit `src/lib/journeys.ts` around the existing import and type declarations:

```ts
import type { PlayerProfile } from '@/lib/player/types'
import type { UpgradeId } from '@/lib/upgrades'

/** Stable ids for journey definitions persisted on the player profile. */
export type JourneyId = 'welcome'
/** Feature unlock ids granted by completing journeys. */
export type JourneyFeatureId = 'slingshot'
/** Runtime trigger ids that can advance one or more journey steps. */
export type JourneyTriggerId =
  | `message_archived:${string}`
  | `contract_completed:${string}`
  | `upgrade_installed:${UpgradeId}`
  | 'shuttle_control_opened'
  | 'shuttle_program_opened'
  | 'lander_program_opened'
  | 'shop_opened'
  | 'bought_shuttle_fuel'
  | 'inventory_opened'
  | 'upgrades_opened'
  | 'left_habitat'
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `bun test:unit src/lib/__tests__/journeys.spec.ts`

Expected: All tests in the file pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/lib/journeys.ts src/lib/__tests__/journeys.spec.ts
git commit -m "feat(journeys): add contract_completed and upgrade_installed trigger variants"
```

---

## Task 2: Define the Act 1 journey

**Files:**
- Modify: `src/lib/journeys.ts` — add `ACT_1_JOURNEY_ID` constant, extend `JourneyId`, add journey entry to `JOURNEY_DEFINITIONS`
- Modify: `src/lib/__tests__/journeys.spec.ts`

The Act 1 journey has four steps. Steps 1-3 match the three inner-system contract ids (`usc-venus-certification`, `space-cowboys-mars-hq`, `martian-marine-corps-cohort`). Step 4 matches `upgrade_installed:gravitySurfing`.

- [ ] **Step 1: Write a failing test that walks the 4 triggers to completion**

Add a new `describe('act-1-inner-system journey', …)` block to `src/lib/__tests__/journeys.spec.ts`:

```ts
describe('act-1-inner-system journey', () => {
  it('completes when all three contracts are done and gravitySurfing installs', () => {
    let profile = createProfile('Pilot')

    // Mark welcome as complete so Act 1 becomes the active journey in the tracker.
    profile = applyJourneyTrigger(profile, 'message_archived:seller-welcome-earth-orbit').profile
    profile = applyJourneyTrigger(profile, 'message_archived:jay-so-you-actually-did-it').profile
    profile = applyJourneyTrigger(profile, 'shuttle_control_opened').profile
    profile = applyJourneyTrigger(profile, 'shuttle_program_opened').profile
    profile = applyJourneyTrigger(profile, 'lander_program_opened').profile
    profile = applyJourneyTrigger(profile, 'bought_shuttle_fuel').profile
    profile = applyJourneyTrigger(profile, 'inventory_opened').profile
    profile = applyJourneyTrigger(profile, 'upgrades_opened').profile
    profile = applyJourneyTrigger(profile, 'left_habitat').profile

    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile

    // Before the final upgrade install, Act 1 is active with step 4 pending.
    const beforeInstall = buildActiveJourneyTracker(profile)
    expect(beforeInstall?.title).toBe('Inner System')
    const step4 = beforeInstall?.objectives[0]?.steps[3]
    expect(step4?.label).toBe('Install the USC Module')
    expect(step4?.active).toBe(true)
    expect(step4?.complete).toBe(false)

    profile = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing').profile

    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
    expect(buildActiveJourneyTracker(profile)).toBeNull()
  })

  it('is insensitive to the order the three contracts complete in', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing').profile
    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
  })

  it('does not tick step 4 on a non-gravitySurfing install', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    const result = applyJourneyTrigger(profile, 'upgrade_installed:shuttleHull')
    expect(result.changed).toBe(false)
    expect(result.profile.completedJourneyIds).not.toContain('act-1-inner-system')
  })

  it('is idempotent — re-firing the same trigger does not double-advance', () => {
    let profile = createProfile('Pilot')
    const first = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    profile = first.profile
    const second = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    expect(second.changed).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `bun test:unit src/lib/__tests__/journeys.spec.ts`

Expected: Four new tests fail — `buildActiveJourneyTracker` returns null for the Act 1 triggers because no matching journey is authored yet.

- [ ] **Step 3: Extend `JourneyId` and add the journey definition**

In `src/lib/journeys.ts`, change:

```ts
export type JourneyId = 'welcome'
```

to:

```ts
export type JourneyId = 'welcome' | 'act-1-inner-system'
```

Right below `export const WELCOME_JOURNEY_ID: JourneyId = 'welcome'`, add:

```ts
/** Canonical id for the Act 1 inner-system arc. */
export const ACT_1_JOURNEY_ID: JourneyId = 'act-1-inner-system'
```

Then add a second entry to `JOURNEY_DEFINITIONS` after the welcome journey:

```ts
  {
    id: ACT_1_JOURNEY_ID,
    eyebrow: 'Act I',
    title: 'Inner System',
    objectiveLabel: 'Earn your manifold cert',
    unlocks: [],
    steps: [
      {
        id: 'usc-cert',
        label: 'Complete USC Venus Certification',
        trigger: 'contract_completed:usc-venus-certification',
      },
      {
        id: 'cowboys-hq',
        label: 'Complete Space Cowboys Mars HQ',
        trigger: 'contract_completed:space-cowboys-mars-hq',
      },
      {
        id: 'mmc-cohort',
        label: 'Complete MMC Turret Cohort',
        trigger: 'contract_completed:martian-marine-corps-cohort',
      },
      {
        id: 'grid-coupling',
        label: 'Install the USC Module',
        trigger: 'upgrade_installed:gravitySurfing',
      },
    ],
  },
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `bun test:unit src/lib/__tests__/journeys.spec.ts`

Expected: All tests pass — the welcome journey test still works, and the four new Act 1 tests pass.

- [ ] **Step 5: Run the full lint + type-check**

Run: `bun run type-check && bun run lint`

Expected: No errors. The new trigger variants and journey id flow through the rest of the codebase cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/lib/journeys.ts src/lib/__tests__/journeys.spec.ts
git commit -m "feat(journeys): add act-1-inner-system journey definition"
```

---

## Task 3: Add upgrade-install listener to `src/lib/upgrades.ts`

**Files:**
- Modify: `src/lib/upgrades.ts` — add listener set, emission helper, wire into `ensureUpgradeAtLeast`
- Create: `src/lib/__tests__/upgradeInstallListener.spec.ts`

We add a module-level listener set that fires when a stored upgrade level transitions from 0 to ≥1. `ensureUpgradeAtLeast` is the first and most important emission site (it covers contract `shuttle-upgrade` rewards). A shared `setPlayerUpgradeLevel(upgradeId, newLevel)` helper will later be used by the MapViewController direct-mutation paths so they emit too.

- [ ] **Step 1: Write a failing test for the listener API**

Create `src/lib/__tests__/upgradeInstallListener.spec.ts`:

```ts
/**
 * Tests for the upgrade-install listener API.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-act-1-inner-system-journey-design.md
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CURRENT_PLAYER_UPGRADE_LEVELS,
  ensureUpgradeAtLeast,
  onUpgradeInstalled,
  resetPlayerUpgradesToDefaults,
  setPlayerUpgradeLevel,
  type UpgradeId,
} from '../upgrades'

describe('onUpgradeInstalled', () => {
  beforeEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  afterEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  it('fires when ensureUpgradeAtLeast takes a level from 0 to 1', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('gravitySurfing', 1)
      expect(events).toEqual(['gravitySurfing'])
    } finally {
      unsubscribe()
    }
  })

  it('does not fire on a 1 → 2 tier bump (install is a zero-crossing event)', () => {
    ensureUpgradeAtLeast('shuttleHull', 1)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('shuttleHull', 2)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('does not fire when ensureUpgradeAtLeast is a no-op at current level', () => {
    ensureUpgradeAtLeast('shuttleHull', 1)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('shuttleHull', 1)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('fires from setPlayerUpgradeLevel on a 0 → ≥1 transition', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      setPlayerUpgradeLevel('gravitySurfing', 1)
      expect(events).toEqual(['gravitySurfing'])
      expect(CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing).toBe(1)
    } finally {
      unsubscribe()
    }
  })

  it('does not fire from setPlayerUpgradeLevel when the new value equals the old', () => {
    ensureUpgradeAtLeast('shuttleHull', 2)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      setPlayerUpgradeLevel('shuttleHull', 2)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('unsubscribe removes the listener', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    unsubscribe()
    ensureUpgradeAtLeast('gravitySurfing', 1)
    expect(events).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test:unit src/lib/__tests__/upgradeInstallListener.spec.ts`

Expected: Compilation error — `onUpgradeInstalled` and `setPlayerUpgradeLevel` are not exported from `../upgrades`.

- [ ] **Step 3: Add the listener API and helper to `src/lib/upgrades.ts`**

After the existing `saveCurrentPlayerUpgradesToStorage` function (around line 133) and before `ensureUpgradeAtLeast`, add:

```ts
/** Listeners notified when any upgrade level transitions from 0 to ≥1. */
const upgradeInstallListeners = new Set<(upgradeId: UpgradeId) => void>()

/**
 * Subscribe to the "an upgrade just got installed" event. The event fires once per
 * transition of a stored upgrade level from 0 to any value ≥1 — a tier bump from 1
 * to 2 is NOT an install event.
 *
 * @param listener - Receives the upgrade id whose level crossed zero.
 * @returns Unsubscribe function.
 */
export function onUpgradeInstalled(listener: (upgradeId: UpgradeId) => void): () => void {
  upgradeInstallListeners.add(listener)
  return () => upgradeInstallListeners.delete(listener)
}

/** Fire upgradeInstallListeners; swallow listener errors so one bad subscriber cannot break others. */
function emitUpgradeInstalled(upgradeId: UpgradeId): void {
  for (const listener of upgradeInstallListeners) {
    try {
      listener(upgradeId)
    } catch {
      // best-effort notification — upstream listeners are isolated
    }
  }
}

/**
 * Set an upgrade's stored level to an exact value (clamped to catalog maxLevel).
 * Persists to storage. Fires `onUpgradeInstalled` if the previous level was 0 and
 * the new level is ≥1. Idempotent when the new value equals the old.
 *
 * @param upgradeId - Catalog upgrade to set.
 * @param newLevel - Target level.
 * @returns The actually persisted level after clamping.
 */
export function setPlayerUpgradeLevel(upgradeId: UpgradeId, newLevel: number): number {
  const def = UPGRADE_DEFINITIONS[upgradeId]
  const clamped = Math.max(0, Math.min(def.maxLevel, Math.floor(newLevel)))
  const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
  if (clamped === current) return current
  CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = clamped
  saveCurrentPlayerUpgradesToStorage()
  if (current === 0 && clamped >= 1) emitUpgradeInstalled(upgradeId)
  return clamped
}
```

- [ ] **Step 4: Refactor `ensureUpgradeAtLeast` to route through `setPlayerUpgradeLevel`**

Replace the existing `ensureUpgradeAtLeast` body so the zero-crossing check lives in one place:

```ts
/**
 * Ensure an upgrade is at least `minLevel` (capped to catalog `maxLevel`).
 * Idempotent: does nothing if already at or above. Persists to storage.
 * Fires `onUpgradeInstalled` when the level transitions from 0 to ≥1.
 *
 * @param upgradeId - Catalog upgrade to bump.
 * @param minLevel - Target minimum level.
 * @returns True when a higher level was written.
 */
export function ensureUpgradeAtLeast(upgradeId: UpgradeId, minLevel: number): boolean {
  const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
  const def = UPGRADE_DEFINITIONS[upgradeId]
  const target = Math.max(0, Math.min(def.maxLevel, Math.floor(minLevel)))
  if (current >= target) return false
  setPlayerUpgradeLevel(upgradeId, target)
  return true
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `bun test:unit src/lib/__tests__/upgradeInstallListener.spec.ts`

Expected: All six tests pass.

- [ ] **Step 6: Run the upgrades + journeys test files together to confirm no regressions**

Run: `bun test:unit src/lib/__tests__/upgrades.spec.ts src/lib/__tests__/upgradeInstallListener.spec.ts src/lib/__tests__/journeys.spec.ts`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/upgrades.ts src/lib/__tests__/upgradeInstallListener.spec.ts
git commit -m "feat(upgrades): emit install event on 0→≥1 level transitions"
```

---

## Task 4: Refactor MapViewController direct-mutation sites to use `setPlayerUpgradeLevel`

**Files:**
- Modify: `src/views/MapViewController.ts` — three sites currently assign to `CURRENT_PLAYER_UPGRADE_LEVELS[id]` directly: `purchaseNextUpgradeLevel` (line 2520), `devSetPlayerUpgradeLevel` (line 2543), `installUpgradeFromConsumable` (line 2944)

The three direct assignments must route through `setPlayerUpgradeLevel` so the install listener fires from every grant path. After this refactor, the upgrade purchase flow, the consumable install flow, and the dev grant flow all emit.

- [ ] **Step 1: Add `setPlayerUpgradeLevel` to the existing upgrades import**

Find the import in `src/views/MapViewController.ts` that includes `CURRENT_PLAYER_UPGRADE_LEVELS` (from `@/lib/upgrades`). Add `setPlayerUpgradeLevel` alongside the existing named imports. Preserve the rest of the block.

- [ ] **Step 2: Refactor `purchaseNextUpgradeLevel` at line 2520**

Current body (lines 2520-2535):

```ts
  purchaseNextUpgradeLevel(upgradeId: UpgradeId): boolean {
    if (UPGRADE_DEFINITIONS[upgradeId].hiddenFromShop) return false
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    const result = tryPurchaseNextUpgradeLevel(this.playerProfile, upgradeId, current)
    if (!result.ok) return false
    this.playerProfile = result.profile
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = result.newLevel
    if (upgradeId === 'shuttleCargoBay') {
      this.playerInventory = this.applyCargoBayLimits(this.playerInventory)
      this.emitShopState()
    }
    this.persistPlayerProfile()
    saveCurrentPlayerUpgradesToStorage()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    return true
  }
```

Replace the direct assignment + redundant persist with a single `setPlayerUpgradeLevel` call. `setPlayerUpgradeLevel` persists internally, so drop `saveCurrentPlayerUpgradesToStorage()`:

```ts
  purchaseNextUpgradeLevel(upgradeId: UpgradeId): boolean {
    if (UPGRADE_DEFINITIONS[upgradeId].hiddenFromShop) return false
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    const result = tryPurchaseNextUpgradeLevel(this.playerProfile, upgradeId, current)
    if (!result.ok) return false
    this.playerProfile = result.profile
    setPlayerUpgradeLevel(upgradeId, result.newLevel)
    if (upgradeId === 'shuttleCargoBay') {
      this.playerInventory = this.applyCargoBayLimits(this.playerInventory)
      this.emitShopState()
    }
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    return true
  }
```

- [ ] **Step 3: Refactor `installUpgradeFromConsumable` at line 2944**

Current body (lines 2944-2954):

```ts
  /** Install a minimum upgrade tier from a scripted consumable flow. */
  private installUpgradeFromConsumable(upgradeId: UpgradeId, targetLevel: number): void {
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    if (current >= targetLevel) return
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = targetLevel
    saveCurrentPlayerUpgradesToStorage()
    this.syncMapAfterExternalShuttleInstall(upgradeId, targetLevel, {
      defaultMeta: (defId, level) =>
        defId === 'gravitySurfing' ? 'Tier 1 · Grid Coupling Module' : `Tier ${level} · Auto-install`,
    })
  }
```

Replace with:

```ts
  /** Install a minimum upgrade tier from a scripted consumable flow. */
  private installUpgradeFromConsumable(upgradeId: UpgradeId, targetLevel: number): void {
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    if (current >= targetLevel) return
    setPlayerUpgradeLevel(upgradeId, targetLevel)
    this.syncMapAfterExternalShuttleInstall(upgradeId, targetLevel, {
      defaultMeta: (defId, level) =>
        defId === 'gravitySurfing' ? 'Tier 1 · Grid Coupling Module' : `Tier ${level} · Auto-install`,
    })
  }
```

- [ ] **Step 4: Refactor `devSetPlayerUpgradeLevel` at line 2543**

Current body (lines 2543-2557):

```ts
  private devSetPlayerUpgradeLevel(upgradeId: UpgradeId, level: number): void {
    if (!import.meta.env.DEV) return
    const def = UPGRADE_DEFINITIONS[upgradeId]
    const clamped = Math.max(0, Math.min(def.maxLevel, Math.floor(level)))
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = clamped
    saveCurrentPlayerUpgradesToStorage()
    if (upgradeId === 'gravitySurfing') {
      if (!hasGravitySurfingUnlock()) {
        this.applyGridVisible(false)
      }
      this.emitMapViewLayerToggles()
    }
    this.onUpgradeHudRefresh?.()
    console.info(`[MapView] set upgrade ${upgradeId} → level ${clamped}`)
  }
```

Replace with:

```ts
  private devSetPlayerUpgradeLevel(upgradeId: UpgradeId, level: number): void {
    if (!import.meta.env.DEV) return
    const clamped = setPlayerUpgradeLevel(upgradeId, level)
    if (upgradeId === 'gravitySurfing') {
      if (!hasGravitySurfingUnlock()) {
        this.applyGridVisible(false)
      }
      this.emitMapViewLayerToggles()
    }
    this.onUpgradeHudRefresh?.()
    console.info(`[MapView] set upgrade ${upgradeId} → level ${clamped}`)
  }
```

- [ ] **Step 4: Run the full test suite**

Run: `bun test:unit`

Expected: All existing tests still pass.

- [ ] **Step 5: Run lint + type-check**

Run: `bun run type-check && bun run lint`

Expected: No errors. If `saveCurrentPlayerUpgradesToStorage` is no longer referenced in `MapViewController.ts`, remove it from the upgrades import to keep oxlint's no-unused-imports happy.

- [ ] **Step 6: Run the full test suite**

Run: `bun test:unit`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "refactor(upgrades): route MapView direct grants through setPlayerUpgradeLevel"
```

---

## Task 5: Add `onContractCompleted` hook to `ContractSystem`

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts` — add hook to `ContractSystemHooks`, emit from `advanceStep` completion branch, emit from `replayCompletedRewards`
- Modify: `src/lib/contracts/__tests__/ContractSystem.spec.ts`

- [ ] **Step 1: Write a failing test for the new hook**

Add a new test to `src/lib/contracts/__tests__/ContractSystem.spec.ts` (inside a new `describe('onContractCompleted', …)` block near the bottom of the file). You can reuse the existing `createHarness` helper — it takes a contract list and returns a harness. We need to capture completed ids:

```ts
describe('onContractCompleted hook', () => {
  it('fires exactly once when a contract transitions from active to completed', () => {
    const completedIds: string[] = []
    const messages = new MessageSystem(
      [triggerMessage],
      { load: () => ({}), save: () => {} },
    )
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
    }
    const contracts = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractCompleted: (id) => completedIds.push(id),
      },
    )

    // Offer + accept Cowboys by firing the Nth mission trigger.
    offerCowboys(contracts)
    contracts.acceptContract('space-cowboys-mars-hq')

    // Step 1 needs 3 missions, step 2 an install, step 3 a visit.
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    expect(completedIds).toEqual([])

    contracts.notifyPlanetVisited('mars')

    expect(completedIds).toEqual(['space-cowboys-mars-hq'])
  })

  it('fires during replayCompletedRewards for pre-existing completed instances', () => {
    const now = new Date().toISOString()
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        'space-cowboys-mars-hq': {
          contractId: 'space-cowboys-mars-hq',
          status: 'completed',
          currentStepIndex: 2,
          stepCounters: [3, 1, 1],
          offeredAt: now,
          acceptedAt: now,
          completedAt: now,
        },
      },
    }
    const completedIds: string[] = []
    const messages = new MessageSystem(
      [triggerMessage],
      { load: () => ({}), save: () => {} },
    )
    const contracts = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractCompleted: (id) => completedIds.push(id),
        onRewardGranted: () => {},
      },
    )
    contracts.replayCompletedRewards()
    expect(completedIds).toEqual(['space-cowboys-mars-hq'])
  })
})
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts`

Expected: TypeScript error — `onContractCompleted` is not a property of `ContractSystemHooks`.

- [ ] **Step 3: Add the hook to `ContractSystemHooks`**

In `src/lib/contracts/ContractSystem.ts`, extend the `ContractSystemHooks` interface (around line 34):

```ts
/** Optional callbacks for embedding {@link ContractSystem} in a UI shell. */
export interface ContractSystemHooks {
  /**
   * Called whenever a contract instance changes (offered, accepted, advanced, completed,
   * declined). Receivers typically refresh inbox UI and re-evaluate fast-travel buttons.
   */
  onContractsChanged?: () => void
  /**
   * Called for each {@link RewardEffect} when a contract completes. Receivers apply the
   * effect to the player profile (e.g. unlock fast-travel kiosks, set pay multipliers).
   *
   * @param effect - One reward effect from `Contract.rewards`.
   * @param contract - The contract that was completed.
   */
  onRewardGranted?: (effect: RewardEffect, contract: Contract) => void
  /**
   * Called once per contract when its instance transitions into `completed` status,
   * both on the live path and during `replayCompletedRewards`. Receivers typically
   * emit a journey trigger or run post-completion UI cleanup.
   *
   * @param contractId - Id of the contract that just completed.
   */
  onContractCompleted?: (contractId: string) => void
}
```

- [ ] **Step 4: Emit the hook from the live completion branch**

In `advanceStep` (around line 387), where the status transitions to `completed`, add the hook call after `applyRewards`:

```ts
      if (nextIndex >= contract.steps.length) {
        updated = { ...updated, status: 'completed', completedAt: new Date().toISOString() }
        this.snapshot = {
          ...this.snapshot,
          instances: { ...this.snapshot.instances, [contract.id]: updated },
        }
        this.deliverCompletionMessage(contract)
        this.applyRewards(contract)
        this.hooks.onContractCompleted?.(contract.id)
        this.evaluatePrerequisiteContractOffers()
      } else {
```

- [ ] **Step 5: Emit the hook from `replayCompletedRewards`**

Extend `replayCompletedRewards` (around line 134) so it fires both hooks for each completed instance:

```ts
  /**
   * Re-fire `onRewardGranted` and `onContractCompleted` for every contract instance
   * currently in `completed` state. Reward effects and completion listeners are required
   * to be idempotent (`unlockFastTravelPlanet` is a no-op on duplicates, journey step
   * applicators are step-idempotent), so this is safe to call on startup as a recovery
   * path for profiles that lost a reward or need to catch up journey progress.
   *
   * Persisted instance state is untouched — this only re-applies the side-effects through
   * the registered hooks.
   */
  replayCompletedRewards(): void {
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'completed') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      this.applyRewards(contract)
      this.hooks.onContractCompleted?.(contract.id)
    }
  }
```

Note we dropped the `if (!this.hooks.onRewardGranted) return` early return — we still want to fire `onContractCompleted` even when no reward hook is registered. `applyRewards` already guards on `onRewardGranted` internally (line 434).

- [ ] **Step 6: Run the test and verify it passes**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts`

Expected: All tests pass, including the two new ones.

- [ ] **Step 7: Run the full test suite**

Run: `bun test:unit`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/contracts/ContractSystem.ts src/lib/contracts/__tests__/ContractSystem.spec.ts
git commit -m "feat(contracts): add onContractCompleted hook (live + replay)"
```

---

## Task 6: Expose `onContractCompleted` + `onUpgradeInstalled` listener APIs in runtime

**Files:**
- Modify: `src/lib/contracts/runtime.ts` — add `contractCompletedListeners` set + `onContractCompleted` export, wire into `ContractSystem` hooks

The runtime already mirrors this pattern for `onContractsChanged` and `onContractShuttleUpgradeGranted`. We add a sibling `onContractCompleted`. The upgrade-install listener is already exported directly from `src/lib/upgrades.ts` (`onUpgradeInstalled`) and needs no runtime wrapper.

- [ ] **Step 1: Add `contractCompletedListeners` + public `onContractCompleted` in `runtime.ts`**

After the existing `contractShuttleUpgradeListeners` set in `src/lib/contracts/runtime.ts`, add:

```ts
/** Subscribers notified once per contract that transitions to `completed`. */
const contractCompletedListeners = new Set<(contractId: string) => void>()
```

Near the existing `onContractShuttleUpgradeGranted` export at the bottom of the file, add:

```ts
/**
 * Subscribe to "a contract just finished" (live path + `replayCompletedRewards`).
 *
 * @param listener - Receives the completed contract id.
 * @returns Unsubscribe function.
 */
export function onContractCompleted(listener: (contractId: string) => void): () => void {
  contractCompletedListeners.add(listener)
  return () => contractCompletedListeners.delete(listener)
}
```

- [ ] **Step 2: Wire the hook into the `ContractSystem` constructor**

Edit the hooks object passed to `new ContractSystem` (currently around line 87 in `runtime.ts`). Add the `onContractCompleted` hook alongside `onContractsChanged` and `onRewardGranted`:

```ts
export const contractSystem = new ContractSystem(
  CONTRACT_CATALOG,
  shipMessageSystem,
  undefined,
  {
    onContractsChanged: () => {
      for (const listener of contractChangeListeners) {
        try {
          listener()
        } catch {
          // listeners must not break the system; swallow to keep other subscribers alive
        }
      }
    },
    onRewardGranted: (effect, c) => applyRewardToProfile(effect, c),
    onContractCompleted: (id) => {
      for (const listener of contractCompletedListeners) {
        try {
          listener(id)
        } catch {
          // listeners must not break the system
        }
      }
    },
  },
)
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`

Expected: No errors. `onContractCompleted` is a known hook on `ContractSystemHooks` (from Task 5) and flows through.

- [ ] **Step 4: Commit**

```bash
git add src/lib/contracts/runtime.ts
git commit -m "feat(contracts): expose onContractCompleted subscription in runtime"
```

---

## Task 7: Extract `stageConsortiumCertification` helper in `MapViewController`

**Files:**
- Modify: `src/views/MapViewController.ts` — extract the body of `devStartConsortiumCertificationMessage` into a reusable `stageConsortiumCertification` method

The current `devStartConsortiumCertificationMessage` (around line 3957) is dev-only and does the entire staging inline. We extract a private method with identical behavior so the Act 1 side-effect (next task) can share it.

- [ ] **Step 1: Add `stageConsortiumCertification` private method**

Add a new method near `devStartConsortiumCertificationMessage` in `MapViewController`:

```ts
  /**
   * Enqueue the Consortium Certification inbox message and force its authored special
   * mission as the active asteroid mission, with the authored waypoint already placed
   * on the star map. Shared by the Act 1 climax staging path and the dev console helper.
   */
  private stageConsortiumCertification(): void {
    const mission = getSpecialMissionById('consortium-certification')
    if (!mission) {
      console.warn('[MapView] Special mission consortium-certification not found.')
      return
    }

    this.messageFacade.enqueueById('consortium-certification-offer', this.onMessageUpdate)

    const acceptedMission: GeneratedAsteroidMission = {
      ...mission,
      status: 'accepted',
    }
    this.missionBoard = {
      ...this.missionBoard,
      offeredAsteroidMission: null,
      activeAsteroidMission: acceptedMission,
    }
    saveActiveMission(acceptedMission)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }
```

- [ ] **Step 2: Replace the body of `devStartConsortiumCertificationMessage`**

Change the existing method to delegate:

```ts
  /** Dev-only: enqueue the Consortium message and start its authored special mission immediately. */
  private devStartConsortiumCertificationMessage(): void {
    this.stageConsortiumCertification()
  }
```

- [ ] **Step 3: Run type-check + test suite**

Run: `bun run type-check && bun test:unit`

Expected: All clean. This is a pure refactor; no behavior change.

- [ ] **Step 4: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "refactor(mapview): extract stageConsortiumCertification helper"
```

---

## Task 8: Subscribe to the two new events + add `maybeStageAct1Climax`

**Files:**
- Modify: `src/views/MapViewController.ts` — subscribe to `onContractCompleted` + `onUpgradeInstalled`, wire them into `notifyJourneyTrigger`, add `maybeStageAct1Climax` guard + call

This is the Vue-layer wiring. Per CLAUDE.md, MapViewController sits outside the pure-domain test surface, so we don't add unit tests for these methods — the journey-level tests from Task 2 already prove the `notifyJourneyTrigger` behavior.

- [ ] **Step 1: Add the imports**

At the top of `src/views/MapViewController.ts`, add to the contracts runtime import:

```ts
import {
  contractSystem,
  onContractCompleted,
  onContractShuttleUpgradeGranted,
  acceptContractWithRetroEval,
  // ...any existing imports from this module
} from '@/lib/contracts/runtime'
```

And add `onUpgradeInstalled` to the upgrades import (already extended in Task 4):

```ts
import {
  CURRENT_PLAYER_UPGRADE_LEVELS,
  ensureUpgradeAtLeast,
  // ... other existing imports ...
  onUpgradeInstalled,
  setPlayerUpgradeLevel,
  UPGRADE_DEFINITIONS,
  type UpgradeId,
} from '@/lib/upgrades'
```

- [ ] **Step 2: Add unsubscribe properties on the class**

Find the existing `private unsubscribeJourneyMessageArchive: (() => void) | null = null` field (search the file — it's the pattern we're mirroring). Add two siblings right next to it:

```ts
  private unsubscribeContractCompleted: (() => void) | null = null
  private unsubscribeUpgradeInstalled: (() => void) | null = null
```

- [ ] **Step 3: Subscribe in the existing init block (around line 640-644)**

The init block already has:

```ts
    this.unsubscribeJourneyMessageArchive?.()
    this.unsubscribeJourneyMessageArchive = shipMessageSystem.onMessageArchived((messageId) => {
      this.notifyJourneyTrigger(`message_archived:${messageId}`)
    })
```

Immediately after those three lines, add:

```ts
    this.unsubscribeContractCompleted?.()
    this.unsubscribeContractCompleted = onContractCompleted((contractId) => {
      this.notifyJourneyTrigger(`contract_completed:${contractId}`)
      this.maybeStageAct1Climax()
    })
    this.unsubscribeUpgradeInstalled?.()
    this.unsubscribeUpgradeInstalled = onUpgradeInstalled((upgradeId) => {
      this.notifyJourneyTrigger(`upgrade_installed:${upgradeId}`)
    })
```

- [ ] **Step 4: Unsubscribe in `dispose` (around line 4746)**

The `dispose` method currently runs:

```ts
    this.unsubscribeJourneyMessageArchive?.()
    this.unsubscribeJourneyMessageArchive = null
```

Right after those two lines, add:

```ts
    this.unsubscribeContractCompleted?.()
    this.unsubscribeContractCompleted = null
    this.unsubscribeUpgradeInstalled?.()
    this.unsubscribeUpgradeInstalled = null
```

- [ ] **Step 5: Implement `maybeStageAct1Climax`**

Add this private method next to `stageConsortiumCertification` (from Task 7):

```ts
  /**
   * When all three inner-system contracts are complete and the player has not yet
   * acquired (or started acquiring) gravity surfing, stage the Consortium message
   * and active asteroid mission. Guarded on derived state only — idempotent across
   * repeat calls. Intended to be invoked after each `contract_completed` event.
   */
  private maybeStageAct1Climax(): void {
    const requiredIds = [
      'usc-venus-certification',
      'space-cowboys-mars-hq',
      'martian-marine-corps-cohort',
    ] as const
    for (const id of requiredIds) {
      const instance = contractSystem.getInstance(id)
      if (!instance || instance.status !== 'completed') return
    }

    const gravitySurfingLevel = CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing ?? 0
    if (gravitySurfingLevel >= 1) return

    const activeMissionId = this.missionBoard.activeAsteroidMission?.id
    if (activeMissionId === 'consortium-certification') return

    const storedActive = loadActiveMission()
    if (storedActive?.id === 'consortium-certification') return

    this.stageConsortiumCertification()
  }
```

If `loadActiveMission` isn't already imported in this file, add it to the existing `@/lib/missions/missionStorage` import line; it's a sibling of `saveActiveMission` which is already imported in the dev path above.

- [ ] **Step 6: Run type-check + lint**

Run: `bun run type-check && bun run lint`

Expected: No errors. No warnings.

- [ ] **Step 7: Run the full test suite**

Run: `bun test:unit`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(mapview): stage Consortium climax on third contract completion"
```

---

## Task 9: Self-heal boot pass for existing saves

**Files:**
- Modify: `src/views/MapViewController.ts` — add a boot-time replay of `contract_completed` + `upgrade_installed:gravitySurfing` for profiles that already qualify

A save that completed all three contracts in a prior build needs the USC ping and the mission staging on first load. Similarly, a profile that already has `gravitySurfing` needs step 4 auto-ticked.

- [ ] **Step 1: Find the controller's existing boot retro-fire block**

Open `src/views/MapViewController.ts` and locate where the controller iterates existing profile state to retro-fire journey triggers (e.g. near where `hasSeenIntro` is consulted or where `notifyPlanetVisited` is re-fired for orbited bodies — somewhere in the init flow that runs after the profile is loaded). Add a new private method nearby:

```ts
  /**
   * Replay `contract_completed` and `upgrade_installed:gravitySurfing` triggers for a
   * profile loaded from disk. Makes the Act 1 journey self-heal when the save predates
   * the journey (or when the player completed contracts in a prior build). Invoked once
   * during controller init, after the contract system has hydrated.
   */
  private replayAct1JourneyTriggers(): void {
    for (const instance of contractSystem.listInstances()) {
      if (instance.status === 'completed') {
        this.notifyJourneyTrigger(`contract_completed:${instance.contractId}`)
      }
    }
    if ((CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing ?? 0) >= 1) {
      this.notifyJourneyTrigger('upgrade_installed:gravitySurfing')
    }
    this.maybeStageAct1Climax()
  }
```

- [ ] **Step 2: Call it during controller init**

In the same init method where the subscriptions from Task 8 were added (around lines 640-660), locate the line `this.persistPlayerProfile()` (currently line 668 before Task 4 edits — it writes the profile after loading from storage or creating fresh). The call to `replayAct1JourneyTriggers` must run:

1. After the subscriptions (so listeners are live — irrelevant for this call since it uses `notifyJourneyTrigger` directly, but harmless).
2. After `hydratePlayerUpgradeLevelsFromStorage()` (so `CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing` reflects storage).
3. After `this.playerProfile = storedProfile` (or `createProfile`) — so journey state reads from the current profile.

Add the call immediately after `this.persistPlayerProfile()`:

```ts
    this.persistPlayerProfile()
    this.replayAct1JourneyTriggers()
    this.emitFuelCellCount()
```

- [ ] **Step 3: Manually verify in the running app**

Run: `bun dev`

In a browser session, open the dev console and run:

```js
AsteroidDev.MapView.grantGravitySurfing?.()
```

(or use the existing dev console path to simulate.)

Then reload the page. The Act 1 journey step 4 should be marked complete on reload when Act 1 is the active journey. (If you don't have the full journey state, this is a smoke check — the full verification is in Task 10.)

Expected: No runtime errors in the browser console. Map renders. Journey tracker updates as expected.

- [ ] **Step 4: Run type-check + lint + full test suite**

Run: `bun run type-check && bun run lint && bun test:unit`

Expected: All clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/MapViewController.ts
git commit -m "feat(mapview): self-heal Act 1 journey on boot"
```

---

## Task 10: End-to-end smoke verification

**Files:** none (manual / verification only)

- [ ] **Step 1: Use the dev console to trigger each of the 3 contracts to completion**

The dev console at `src/lib/devConsole.ts` exposes commands under `AsteroidDev.MapView.*`. Complete each inner-system contract through normal or dev-forced play — the key is that each of `usc-venus-certification`, `space-cowboys-mars-hq`, `martian-marine-corps-cohort` reaches `completed` status in `contractSystem.getSnapshot().instances`.

- [ ] **Step 2: Observe the Consortium staging**

After the third contract completes, verify in the browser:

- An inbox message from the Consortium appears in the default folder.
- The asteroid map shows a waypoint at `(worldX: 260, worldZ: 145)`.
- The mission board's `activeAsteroidMission` is the Consortium Certification mission.
- The HUD objective tracker shows "Act I: Inner System" with the first three steps checked and "Install the USC Module" active.

- [ ] **Step 3: Fly the mission → collect the crate → exfil → install from inventory**

Complete the mission normally. After using the Grid Coupling Module from inventory:

- `CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing` becomes 1.
- The Act 1 journey is marked complete (`profile.completedJourneyIds` contains `'act-1-inner-system'`).
- The HUD tracker disappears or transitions away from Act 1.

- [ ] **Step 4: Reload the browser to verify self-heal**

Refresh the page. The profile should still have `completedJourneyIds: [..., 'act-1-inner-system']` and no stale USC message / stale staged mission should re-appear (guards in `maybeStageAct1Climax` prevent a re-stage because `gravitySurfing ≥ 1`).

- [ ] **Step 5: Final lint + type-check + test pass**

Run: `bun run type-check && bun run lint && bun test:unit`

Expected: Green on all three gates.

- [ ] **Step 6: Commit any follow-up polish from manual testing (if needed)**

If manual play reveals any non-blocking issues (e.g. HUD copy polish, tracker timing), fix them in a small follow-up commit. Otherwise, no additional commit is needed — the plan is complete.

---

## File structure summary

**Created:**
- `src/lib/__tests__/upgradeInstallListener.spec.ts` — listener API tests

**Modified:**
- `src/lib/journeys.ts` — new trigger variants, Act 1 journey definition, `ACT_1_JOURNEY_ID` constant
- `src/lib/__tests__/journeys.spec.ts` — Act 1 journey tests
- `src/lib/upgrades.ts` — `onUpgradeInstalled`, `setPlayerUpgradeLevel`, `ensureUpgradeAtLeast` refactored to route through the new setter
- `src/lib/contracts/ContractSystem.ts` — `onContractCompleted` hook wired in `advanceStep` + `replayCompletedRewards`
- `src/lib/contracts/__tests__/ContractSystem.spec.ts` — hook fires on live + replay
- `src/lib/contracts/runtime.ts` — `onContractCompleted` listener set + public subscribe API
- `src/views/MapViewController.ts` — three direct-mutation sites routed through `setPlayerUpgradeLevel`; `stageConsortiumCertification` extracted from dev path; `onContractCompleted` + `onUpgradeInstalled` subscriptions; `maybeStageAct1Climax` guard; boot-time `replayAct1JourneyTriggers`

**Unchanged but referenced:**
- `src/data/contracts/*.json` — no data changes; the three existing contracts drive the three journey step triggers as-is
- `src/data/missions/consortium-certification.json` — the special mission is reused as-is
- `src/lib/messages/messageCatalog.ts:203` — `consortium-certification-offer` message is reused as-is
