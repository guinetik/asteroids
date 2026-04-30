# Jovian Contract Schema Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship just enough schema, runtime, and reward-effect machinery to make `src/data/contracts/jovian-society-prospection.json` parse, type-check, register, and walk end-to-end with placeholder behavior — no UI/3D/minigame work.

**Architecture:** All edits land in the existing `src/lib/contracts/` module. Adds optional fields to `Contract`, `CompleteMissionsStep`, and the step union; extends `RewardEffect`; adds `ChoiceMissionStep` to the discriminated union with a `notifyChoiceResolved` resolver; routes completion messages and rewards through `instance.resolvedOutcomeId` when `completionByOutcome` is present. `PlayerProfile` gains two optional persisted maps (`shuttleBuffs`, `disabledGiverIds`). New filter fields (`objectiveType`, `targetRegion`, `pinnedAssetRef`) are accepted but ignored by the matcher in this plan.

**Tech Stack:** TypeScript strict mode, Vue 3 + Vite, Vitest, JSON imports via Vite static-asset pipeline.

**Spec:** `docs/superpowers/specs/2026-04-29-jovian-contract-schema-parity-design.md`

---

## File Structure

**Modified files:**
- `src/lib/contracts/contractTypes.ts` — schema additions
- `src/lib/contracts/ContractSystem.ts` — `notifyChoiceResolved`, completion-arm dispatch, expanded prerequisite eval
- `src/lib/contracts/contractCatalog.ts` — register Jovian contract + load-time validator
- `src/lib/contracts/contractStorage.ts` — normalize `resolvedOutcomeId` on load
- `src/lib/contracts/runtime.ts` — three new reward-effect arms, dev picker hook
- `src/lib/player/types.ts` — `shuttleBuffs`, `disabledGiverIds` optional fields
- `src/lib/player/profile.ts` — normalization, `setShuttleBuff`, `disableGiver` helpers
- `src/data/contracts/jovian-society-prospection.json` — align to canonical reward types and `'hektor'` asset ref

**New tests:**
- `src/lib/contracts/__tests__/jovian-contract.spec.ts` — Jovian-specific schema parse + walkability + outcome-arm dispatch

---

## Task 1: Player profile gains `shuttleBuffs` and `disabledGiverIds`

**Files:**
- Modify: `src/lib/player/types.ts`
- Modify: `src/lib/player/profile.ts`
- Modify: `src/lib/player/__tests__/profile.spec.ts` (extend)

### Step 1: Read existing profile test scaffolding

Run: `cat src/lib/player/__tests__/profile.spec.ts | head -40`
Goal: confirm the test imports `loadProfile`, `saveProfile` and uses `localStorage` JSDOM. Use the existing patterns.

- [ ] **Step 2: Write the failing test**

Append to `src/lib/player/__tests__/profile.spec.ts`:

```ts
describe('shuttleBuffs and disabledGiverIds', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('createProfile defaults shuttleBuffs and disabledGiverIds to empty maps', () => {
    const profile = createProfile('Pilot')
    expect(profile.shuttleBuffs).toEqual({})
    expect(profile.disabledGiverIds).toEqual({})
  })

  it('round-trips shuttleBuffs and disabledGiverIds through localStorage', () => {
    const profile = createProfile('Pilot')
    const next: PlayerProfile = {
      ...profile,
      shuttleBuffs: { jovianEmpowerment: 1.5 },
      disabledGiverIds: { 'jovian-society': true },
    }
    saveProfile(next)
    const loaded = loadProfile()
    expect(loaded?.shuttleBuffs).toEqual({ jovianEmpowerment: 1.5 })
    expect(loaded?.disabledGiverIds).toEqual({ 'jovian-society': true })
  })

  it('legacy saves missing the fields normalize to empty maps', () => {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ name: 'Old', credits: 100 }),
    )
    const loaded = loadProfile()
    expect(loaded?.shuttleBuffs).toEqual({})
    expect(loaded?.disabledGiverIds).toEqual({})
  })
})
```

(Ensure `createProfile`, `saveProfile`, `loadProfile`, `PROFILE_STORAGE_KEY`, and `PlayerProfile` are imported at the top of the file.)

- [ ] **Step 3: Run test to verify failure**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: FAIL — `shuttleBuffs` undefined / not assignable.

- [ ] **Step 4: Add fields to `PlayerProfile`**

In `src/lib/player/types.ts`, add inside the `PlayerProfile` interface (after `landerHullHp`):

```ts
  /**
   * Permanent multiplicative buffs granted by contract reward effects of type
   * `'shuttle-buff'`. Keyed by buffId (e.g. `'jovianEmpowerment'`). Plan 7
   * applies the math; this plan only persists.
   */
  shuttleBuffs?: Record<string, number>
  /**
   * Giver ids disabled by contract reward effects of type `'disable-giver'`.
   * Plan 7 enforces the suppression at the mission-board level; this plan
   * only persists.
   */
  disabledGiverIds?: Record<string, true>
```

- [ ] **Step 5: Normalize in `normalizeLoadedProfile`**

In `src/lib/player/profile.ts`, inside `normalizeLoadedProfile`, after the existing `bodyAccess` line (`const bodyAccess = normalizeBodyAccess(p.bodyAccess)`), add:

```ts
  const shuttleBuffs: Record<string, number> = {}
  if (
    p.shuttleBuffs !== undefined &&
    p.shuttleBuffs !== null &&
    typeof p.shuttleBuffs === 'object' &&
    !Array.isArray(p.shuttleBuffs)
  ) {
    for (const [buffId, value] of Object.entries(p.shuttleBuffs as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        shuttleBuffs[buffId] = value
      }
    }
  }

  const disabledGiverIds: Record<string, true> = {}
  if (
    p.disabledGiverIds !== undefined &&
    p.disabledGiverIds !== null &&
    typeof p.disabledGiverIds === 'object' &&
    !Array.isArray(p.disabledGiverIds)
  ) {
    for (const [giverId, value] of Object.entries(p.disabledGiverIds as Record<string, unknown>)) {
      if (value === true) disabledGiverIds[giverId] = true
    }
  }
```

Then add to the returned object literal (just before `...(shuttleHullHp ...`):

```ts
    shuttleBuffs,
    disabledGiverIds,
```

And add the same two lines into `createProfile`'s returned literal (after `journeyStartReadyIds: []`):

```ts
    shuttleBuffs: {},
    disabledGiverIds: {},
```

- [ ] **Step 6: Add helper mutators**

Append to `src/lib/player/profile.ts`:

```ts
/**
 * Set or replace a shuttle-buff multiplier on the profile.
 *
 * @param profile - Current profile.
 * @param buffId - Buff id from the reward effect (e.g. `'jovianEmpowerment'`).
 * @param multiplier - New multiplier value.
 * @returns Profile with the buff applied (existing entry replaced).
 */
export function setShuttleBuff(
  profile: PlayerProfile,
  buffId: string,
  multiplier: number,
): PlayerProfile {
  const next: Record<string, number> = { ...(profile.shuttleBuffs ?? {}), [buffId]: multiplier }
  return { ...profile, shuttleBuffs: next }
}

/**
 * Mark a giver id as disabled (plan 7 reads this to suppress mission board entries).
 *
 * @param profile - Current profile.
 * @param giverId - Giver id from the reward effect (e.g. `'jovian-society'`).
 * @returns Profile with the giver disabled.
 */
export function disableGiver(profile: PlayerProfile, giverId: string): PlayerProfile {
  if (profile.disabledGiverIds?.[giverId] === true) return profile
  const next: Record<string, true> = { ...(profile.disabledGiverIds ?? {}), [giverId]: true }
  return { ...profile, disabledGiverIds: next }
}
```

- [ ] **Step 7: Run tests**

Run: `bun test:unit src/lib/player/__tests__/profile.spec.ts`
Expected: PASS (all three new tests + existing).

- [ ] **Step 8: Commit**

```bash
git add src/lib/player/types.ts src/lib/player/profile.ts src/lib/player/__tests__/profile.spec.ts
git commit -m "feat(player): add shuttleBuffs and disabledGiverIds profile maps"
```

---

## Task 2: `RewardEffect` gains three new arms

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts`

- [ ] **Step 1: Edit the `RewardEffect` union**

In `src/lib/contracts/contractTypes.ts`, replace the `RewardEffect` declaration:

```ts
/** Reward applied when a contract is completed. */
export type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }
  | { type: 'shuttle-upgrade'; upgradeId: UpgradeId; minLevel: number }
  | { type: 'shuttle-buff'; buffId: string; multiplier: number }
  | { type: 'disable-giver'; giverId: string }
  | {
      type: 'set-body-access'
      bodyId: string
      state: 'restricted' | 'unrestricted' | 'liberated' | 'destroyed'
    }
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: PASS. (Existing usages still compile because the union only widens.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/contracts/contractTypes.ts
git commit -m "feat(contracts): add shuttle-buff, disable-giver, set-body-access reward effects"
```

---

## Task 3: `Contract.pinnedAssets` and `CompleteMissionsStep` filter fields

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts`

- [ ] **Step 1: Add `PinnedAsset` interface**

In `src/lib/contracts/contractTypes.ts`, before the `Contract` interface, add:

```ts
/**
 * Body the contract pins for its duration. Plan 2 stores; later plans route
 * mission generation to it.
 */
export interface PinnedAsset {
  /** Stable ref used by step `pinnedAssetRef` lookups (e.g. `'hektor'`). */
  assetRef: string
  /** Region the body lives in (e.g. `'jovian-trojans'`). */
  region: string
  /** Display label for inbox flavor and asset cards (e.g. `'Asset 2306-J'`). */
  label: string
}
```

- [ ] **Step 2: Add optional `pinnedAssets` to `Contract`**

In the `Contract` interface, after `headsUpInboxMessageId?: string`, add:

```ts
  /** Bodies pinned at acceptance. Empty/absent for non-pinning contracts. */
  pinnedAssets?: PinnedAsset[]
```

- [ ] **Step 3: Add filter fields to `CompleteMissionsStep`**

Replace `CompleteMissionsStep` with:

```ts
/** Step that requires N completed missions matching optional filters. */
export interface CompleteMissionsStep extends ContractStepRewardMixin {
  kind: 'complete-missions'
  /** Total missions of the matching kind required to mark the step complete. */
  count: number
  /** Restrict to a single mission family. */
  missionType?: ContractMissionType
  /** Restrict to a single giver id (matches {@link MissionCompletedEvent.giverId}). */
  giverId?: string
  /** Restrict to a single giver planet (matches {@link MissionCompletedEvent.giverPlanetId}). */
  giverPlanetId?: string
  /**
   * Restrict to a single objective type (e.g. `'photometry'`, `'dan'`, `'gather'`).
   * Accepted by the type, ignored by the matcher in this plan — later plans tighten.
   */
  objectiveType?: string
  /**
   * Restrict to missions spawned in this region (e.g. `'saturn-trojans'`).
   * Accepted by the type, ignored by the matcher in this plan — later plans tighten.
   */
  targetRegion?: string
  /**
   * Restrict to missions targeting the contract's pinned body with this ref.
   * Accepted by the type, ignored by the matcher in this plan — later plans tighten.
   */
  pinnedAssetRef?: string
  /** Authored summary shown on the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}
```

- [ ] **Step 4: Add optional fields to `MissionCompletedEvent`**

In the `MissionCompletedEvent` interface, after `targetPlanetId`, add:

```ts
  /** Optional objective subtype (e.g. `'photometry'`). Plan 3+ populates and matches. */
  objectiveType?: string
  /** Optional region tag (e.g. `'jovian-trojans'`). Plan 5 populates and matches. */
  region?: string
  /** Optional pinned-asset ref the mission targets. Plan 4 populates and matches. */
  pinnedAssetRef?: string
```

- [ ] **Step 5: Type-check**

Run: `bun run type-check`
Expected: PASS. The new fields are all optional, so no existing usage breaks.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contracts/contractTypes.ts
git commit -m "feat(contracts): add pinnedAssets and stub filter fields on complete-missions"
```

---

## Task 4: `ChoiceMissionStep` and `resolvedOutcomeId`

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts`

- [ ] **Step 1: Add `ChoiceMissionOutcome` and `ChoiceMissionStep`**

In `src/lib/contracts/contractTypes.ts`, before the `ContractStep` union declaration, add:

```ts
/** Outcome option presented to the player at a choice-mission terminal. */
export interface ChoiceMissionOutcome extends ContractStepRewardMixin {
  /** Stable id (e.g. `'transmit'`, `'tamper'`). */
  outcomeId: string
  /** Display label (e.g. `'Transmit Report'`). */
  label: string
}

/**
 * Step that requires the player to pick one of N authored outcomes at a special
 * mission. This plan resolves it via a dev picker; later plans wire the actual
 * canvas overlay. Per-outcome `creditsReward` is paid when the choice resolves.
 */
export interface ChoiceMissionStep {
  /** Discriminator. */
  kind: 'choice-mission'
  /** Mission id presented to the choice-mission runner. */
  missionId: string
  /** Authored kind name for the runner (e.g. `'terminal-prospectus'`). */
  minigameType: string
  /** Asset ref the choice-mission spawns at (matches `Contract.pinnedAssets[].assetRef`). */
  pinnedAssetRef?: string
  /** Authored outcomes; one is selected by the player. */
  outcomes: ChoiceMissionOutcome[]
  /** Authored summary for the step's flavor message subject. */
  subject: string
  /** Authored body paragraphs for the step's flavor message. */
  flavor: string[]
}
```

- [ ] **Step 2: Add `ChoiceMissionStep` to the `ContractStep` union**

Replace the `ContractStep` union with:

```ts
/** Discriminated union of all supported contract steps. */
export type ContractStep =
  | CompleteMissionsStep
  | InstallUpgradeStep
  | VisitPlanetStep
  | OrbitalMissionStep
  | TradeGoodsStep
  | CollectDropsStep
  | LaunchFromBodyStep
  | DeliverItemsStep
  | ChoiceMissionStep
```

- [ ] **Step 3: Add `resolvedOutcomeId` to `ContractInstance`**

In the `ContractInstance` interface, after `completedAt: string | null`, add:

```ts
  /**
   * Outcome id resolved by a `'choice-mission'` step, or `null` if none has
   * resolved yet. Read by the completion handler to dispatch the matching
   * `completionByOutcome` arm.
   */
  resolvedOutcomeId: string | null
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: FAIL — every constructor of `ContractInstance` (offer path, tests, fixtures) must now provide `resolvedOutcomeId`.

- [ ] **Step 5: Set `resolvedOutcomeId: null` at instance creation**

In `src/lib/contracts/ContractSystem.ts` → `offerContract`, the `instance` literal becomes:

```ts
    const instance: ContractInstance = {
      contractId: contract.id,
      status: 'available',
      currentStepIndex: 0,
      stepCounters: contract.steps.map(() => 0),
      offeredAt: new Date().toISOString(),
      acceptedAt: null,
      completedAt: null,
      resolvedOutcomeId: null,
    }
```

- [ ] **Step 6: Normalize `resolvedOutcomeId` on snapshot load**

In `src/lib/contracts/contractStorage.ts` → `loadContractSnapshot`, after the existing `instances` extraction, normalize each entry. Replace the `instances` extraction block with:

```ts
    let instances: Record<string, ContractInstance> = {}
    if (obj.instances && typeof obj.instances === 'object' && !Array.isArray(obj.instances)) {
      const raw = obj.instances as Record<string, Partial<ContractInstance>>
      for (const [id, entry] of Object.entries(raw)) {
        if (entry === null || typeof entry !== 'object') continue
        instances[id] = {
          contractId: entry.contractId ?? id,
          status: (entry.status as ContractInstance['status']) ?? 'available',
          currentStepIndex: typeof entry.currentStepIndex === 'number' ? entry.currentStepIndex : 0,
          stepCounters: Array.isArray(entry.stepCounters)
            ? entry.stepCounters.filter((n): n is number => typeof n === 'number')
            : [],
          offeredAt: typeof entry.offeredAt === 'string' ? entry.offeredAt : null,
          acceptedAt: typeof entry.acceptedAt === 'string' ? entry.acceptedAt : null,
          completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : null,
          resolvedOutcomeId:
            typeof entry.resolvedOutcomeId === 'string' ? entry.resolvedOutcomeId : null,
        }
      }
    }
```

- [ ] **Step 7: Update existing test fixtures that build `ContractInstance` literals**

Run: `bun run type-check`
For every reported error in tests where a `ContractInstance` literal is missing `resolvedOutcomeId`, add `resolvedOutcomeId: null` to the literal.

- [ ] **Step 8: Type-check passes**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/contracts/contractTypes.ts src/lib/contracts/ContractSystem.ts src/lib/contracts/contractStorage.ts
git add src/lib/contracts/__tests__
git commit -m "feat(contracts): add choice-mission step and resolvedOutcomeId state"
```

---

## Task 5: `completionByOutcome` and expanded `offerWhenPrerequisites`

**Files:**
- Modify: `src/lib/contracts/contractTypes.ts`

- [ ] **Step 1: Add `ContractCompletionArm`**

In `src/lib/contracts/contractTypes.ts`, before the `Contract` interface, add:

```ts
/** One completion arm per outcome id of a contained `'choice-mission'` step. */
export interface ContractCompletionArm {
  /** Subject line for this outcome's completion message. */
  completionSubject: string
  /** Body paragraphs for this outcome's completion message. */
  completionBody: string[]
  /** Reward effects applied when this arm resolves. */
  rewards: RewardEffect[]
}
```

- [ ] **Step 2: Make legacy completion fields optional and add `completionByOutcome`**

In the `Contract` interface, change `completionSubject`, `completionBody`, and `rewards` to optional (add `?`), and add `completionByOutcome`:

```ts
  /** Subject for the contract-completion message (legacy single-arm). */
  completionSubject?: string
  /** Body paragraphs for the contract-completion message (legacy single-arm). */
  completionBody?: string[]
  /** Reward effects applied on completion (legacy single-arm). */
  rewards?: RewardEffect[]
  /**
   * Mutually exclusive with the legacy `completionSubject / completionBody / rewards`
   * triple. When present, the completion handler reads
   * `instance.resolvedOutcomeId` and dispatches the matching arm. When neither
   * block resolves, the contract still completes but emits no rewards and a
   * console warning.
   */
  completionByOutcome?: Record<string, ContractCompletionArm>
```

- [ ] **Step 3: Make every `offerWhenPrerequisites` sub-field optional and add `triggerOnPlanetVisited`**

Replace the `offerWhenPrerequisites` declaration in the `Contract` interface with:

```ts
  /**
   * Combined offer gate. The runtime AND-s every present sub-field. Authoring
   * just one of these fields makes the gate degenerate to a single check.
   */
  offerWhenPrerequisites?: {
    /** Optional — id of a contract the player must have finished. */
    requiredCompletedContractId?: string
    /** Optional — giver-planet completion gate (legacy combined gate). */
    minGiverPlanetCompletions?: { planetId: string; min: number }
    /** Optional — fires when the player orbits this planet, with all other gates met. */
    triggerOnPlanetVisited?: string
  }
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: PASS — `completionSubject` etc. are now optional, fixtures still work, contract loaders that read these fields will need updates in later tasks (handled in Task 8).

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/contractTypes.ts
git commit -m "feat(contracts): add completionByOutcome and combined offer prereqs"
```

---

## Task 6: `requiredCount` handles `choice-mission`

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts`
- Modify: `src/lib/contracts/__tests__/ContractSystem.spec.ts` (extend or add fixture)

- [ ] **Step 1: Write failing test (in `ContractSystem.spec.ts`)**

Add a new `describe` block at the bottom of `src/lib/contracts/__tests__/ContractSystem.spec.ts`:

```ts
describe('choice-mission step', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('requires count of 1 (resolves on a single notifyChoiceResolved call)', () => {
    const choiceContract: Contract = {
      id: 'choice-stub',
      inboxName: 'Choice Stub',
      from: 'Test',
      sentAt: TEST_DATE,
      introSubject: 'Choose',
      introBody: ['intro'],
      steps: [
        {
          kind: 'choice-mission',
          missionId: 'stub-choice',
          minigameType: 'terminal-stub',
          outcomes: [
            { outcomeId: 'a', label: 'A', creditsReward: 100 },
            { outcomeId: 'b', label: 'B', creditsReward: 0 },
          ],
          subject: 'Choose',
          flavor: ['choose'],
        },
      ],
      completionByOutcome: {
        a: { completionSubject: 'Picked A', completionBody: ['a'], rewards: [] },
        b: { completionSubject: 'Picked B', completionBody: ['b'], rewards: [] },
      },
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([choiceContract], messages, inMemoryPersistence())
    contracts.resetForTests()
    // Force the offer (no real trigger; use the snapshot poke).
    forceOffer(contracts, choiceContract)
    contracts.acceptContract(choiceContract.id)
    contracts.notifyChoiceResolved('stub-choice', 'a')
    const inst = contracts.getInstance(choiceContract.id)
    expect(inst?.status).toBe('completed')
    expect(inst?.resolvedOutcomeId).toBe('a')
  })
})
```

You will need three helpers near the top of the file (search for the `emptyContractSnapshot` import — add the helpers right after the contract fixtures section, just before the first test):

```ts
function emptyMessageStore() {
  return {
    load: () => ({ messages: {}, version: 1 as const }),
    save: () => undefined,
  }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

function forceOffer(contracts: ContractSystem, contract: Contract): void {
  // Dev/test-only: synthetically advance an instance to `available` without
  // wiring a trigger. Mirrors what offerContract does internally.
  contracts.notifyMessageArchived('__never__')
  // Direct path: call `acceptContract` which would no-op without an
  // available instance — so seed via a roundabout: register a fake
  // archived trigger by mutating a contract whose triggerOnMessageArchived
  // matches. Easiest is to expose a test seam.
  void contract
}
```

The `forceOffer` helper above is intentionally a stub — wiring it requires the next step.

- [ ] **Step 2: Add a test seam to `ContractSystem`**

In `src/lib/contracts/ContractSystem.ts`, add a public method right above `resetForTests`:

```ts
  /**
   * Test seam: synthetically place a contract in the `available` state without
   * needing a real trigger. Production code does NOT call this — the method
   * exists so unit tests can drive the lifecycle from a known starting state.
   *
   * @param contractId - Contract id to offer.
   */
  offerForTests(contractId: string): void {
    const contract = this.contracts.get(contractId)
    if (!contract) return
    if (this.snapshot.instances[contractId]) return
    this.offerContract(contract)
    this.afterChange()
  }
```

Then in the test, replace the body of `forceOffer` with:

```ts
function forceOffer(contracts: ContractSystem, contract: Contract): void {
  contracts.offerForTests(contract.id)
}
```

- [ ] **Step 3: Run test to verify failure**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts`
Expected: FAIL — `notifyChoiceResolved` does not exist; `requiredCount` for choice-mission throws or returns wrong value.

- [ ] **Step 4: Update `requiredCount`**

In `src/lib/contracts/ContractSystem.ts`, replace `requiredCount`:

```ts
/** Required completion count for a step (1 unless the step counts pickups/missions/trades). */
function requiredCount(step: ContractStep): number {
  if (step.kind === 'complete-missions') return step.count
  if (step.kind === 'trade-goods') return step.count
  if (step.kind === 'collect-drops') return step.count
  return 1
}
```

(No change visible — but with the union widened, TS will complain only if the function body references step kinds it can't narrow; this version is exhaustive-by-default.)

- [ ] **Step 5: Implement `notifyChoiceResolved`**

In `src/lib/contracts/ContractSystem.ts`, add the method after `notifyOrbitalLaunched` (and before `acceptContract`):

```ts
  /**
   * Notify the system that the player picked an outcome at a `'choice-mission'` step.
   * Validates the outcome against the active step's `outcomes[]`, sets
   * `resolvedOutcomeId`, pays the per-outcome `creditsReward`, and advances the
   * step (which fires the completion handler).
   *
   * Plan 2 wires this to a dev console hook. Later plans wire it to the canvas
   * terminal overlay.
   *
   * @param missionId - The choice-mission's `missionId` (e.g. `'jovian_final_prospectus'`).
   * @param outcomeId - Selected outcome id (must match `step.outcomes[].outcomeId`).
   * @returns `true` when the choice was applied.
   */
  notifyChoiceResolved(missionId: string, outcomeId: string): boolean {
    for (const instance of Object.values(this.snapshot.instances)) {
      if (instance.status !== 'active') continue
      const contract = this.contracts.get(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || step.kind !== 'choice-mission') continue
      if (step.missionId !== missionId) continue
      const outcome = step.outcomes.find((o) => o.outcomeId === outcomeId)
      if (!outcome) return false
      const updated: ContractInstance = { ...instance, resolvedOutcomeId: outcomeId }
      this.snapshot = {
        ...this.snapshot,
        instances: { ...this.snapshot.instances, [contract.id]: updated },
      }
      this.hooks.onContractStepCompleted?.({
        contractId: contract.id,
        stepIndex: instance.currentStepIndex,
        creditsReward: outcome.creditsReward ?? 0,
      })
      this.advanceStep(contract, updated, 1)
      this.afterChange()
      return true
    }
    return false
  }
```

Note: `advanceStep` already fires `onContractStepCompleted` for the satisfied step. To avoid double-firing the per-step credit hook, replace the explicit `onContractStepCompleted` call above with deletion (we want the per-outcome reward, not the per-step one). Adjust:

```ts
      const updated: ContractInstance = { ...instance, resolvedOutcomeId: outcomeId }
      this.snapshot = {
        ...this.snapshot,
        instances: { ...this.snapshot.instances, [contract.id]: updated },
      }
      // advanceStep will fire onContractStepCompleted with the step's own
      // creditsReward (default 0 for choice-mission since it has no mixin
      // payout). Pay the per-outcome reward via a dedicated hook below.
      this.hooks.onChoiceOutcomeResolved?.({
        contractId: contract.id,
        stepIndex: instance.currentStepIndex,
        outcomeId,
        creditsReward: outcome.creditsReward ?? 0,
      })
      this.advanceStep(contract, updated, 1)
      this.afterChange()
      return true
```

- [ ] **Step 6: Add `onChoiceOutcomeResolved` to `ContractSystemHooks`**

In `src/lib/contracts/ContractSystem.ts` → `ContractSystemHooks`, add (after `onContractStepCompleted`):

```ts
  /**
   * Called when a `'choice-mission'` step's outcome resolves. Receivers credit
   * the per-outcome `creditsReward` (the engine does not — `choice-mission` has
   * no mixin reward to fire through `onContractStepCompleted`).
   */
  onChoiceOutcomeResolved?: (payload: ChoiceOutcomeResolvedPayload) => void
```

And add the payload interface near `ContractStepCompletedPayload`:

```ts
/** Payload for {@link ContractSystemHooks.onChoiceOutcomeResolved}. */
export interface ChoiceOutcomeResolvedPayload {
  /** Contract whose choice resolved. */
  contractId: string
  /** Step index where the choice lives. */
  stepIndex: number
  /** Selected outcome id. */
  outcomeId: string
  /** Authored CR payout for this outcome. Fractional preserved. */
  creditsReward: number
}
```

- [ ] **Step 7: Run test to verify pass on the requiredCount portion**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "choice-mission step"`
Expected: PASS for the basic resolve, but the completion message dispatch will fail until Task 7 lands.

If the test depends on a completion message being delivered, defer that assertion to Task 7. Keep this step's assertions limited to: `inst?.status === 'completed'` and `inst?.resolvedOutcomeId === 'a'`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/contracts/ContractSystem.ts src/lib/contracts/__tests__/ContractSystem.spec.ts
git commit -m "feat(contracts): add notifyChoiceResolved and choice-mission step support"
```

---

## Task 7: Completion-arm dispatch via `completionByOutcome`

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts`

- [ ] **Step 1: Update `buildContractMessageDefinitions` to register per-arm completion messages**

In `src/lib/contracts/ContractSystem.ts`, replace the `buildContractMessageDefinitions` function with:

```ts
/**
 * Build the full set of message definitions for one contract: intro + per-step
 * flavor + completion (or one completion per `completionByOutcome` arm).
 *
 * @param contract - Contract whose messages should be materialized.
 * @returns Array of message definitions to register with the {@link MessageSystem}.
 */
export function buildContractMessageDefinitions(contract: Contract): ShipMessageDefinition[] {
  const base = {
    from: contract.from,
    sentAt: contract.sentAt,
    trigger: CONTRACT_MESSAGE_TRIGGER,
    delivery: 'inbox_prompt' as const,
    priority: CONTRACT_MESSAGE_PRIORITY,
    folderId: contract.id,
    folderLabel: contract.inboxName,
    contractId: contract.id,
  }

  const intro: ShipMessageDefinition = {
    ...base,
    id: contractIntroMessageId(contract.id),
    subject: contract.introSubject,
    body: contract.introBody,
    contractMessageKind: 'intro',
    ...(contract.introAudioUrl ? { audioUrl: contract.introAudioUrl } : {}),
  }

  const brief: ShipMessageDefinition = {
    ...base,
    id: contractBriefMessageId(contract.id),
    subject: `Active Brief — ${contract.inboxName}`,
    body: buildContractBriefBody(contract),
    contractMessageKind: 'brief',
    pinned: true,
    priority: CONTRACT_BRIEF_PRIORITY,
  }

  const stepMessages: ShipMessageDefinition[] = contract.steps.map((step, index) => ({
    ...base,
    id: contractStepMessageId(contract.id, index),
    subject: step.subject,
    body: step.flavor,
    contractMessageKind: 'step',
    contractStepIndex: index,
  }))

  const completions: ShipMessageDefinition[] = []
  if (contract.completionByOutcome) {
    for (const [outcomeId, arm] of Object.entries(contract.completionByOutcome)) {
      completions.push({
        ...base,
        id: contractCompletionMessageId(contract.id, outcomeId),
        subject: arm.completionSubject,
        body: arm.completionBody,
        contractMessageKind: 'completion',
      })
    }
  } else if (contract.completionSubject !== undefined && contract.completionBody !== undefined) {
    completions.push({
      ...base,
      id: contractCompletionMessageId(contract.id),
      subject: contract.completionSubject,
      body: contract.completionBody,
      contractMessageKind: 'completion',
    })
  }

  return [intro, brief, ...stepMessages, ...completions]
}
```

- [ ] **Step 2: Update `contractCompletionMessageId` to support per-outcome ids**

Replace `contractCompletionMessageId`:

```ts
/** Stable id for a contract's completion message (per-outcome when provided). */
export function contractCompletionMessageId(contractId: string, outcomeId?: string): string {
  if (outcomeId) return `contract.${contractId}.completion.${outcomeId}`
  return `contract.${contractId}.completion`
}
```

- [ ] **Step 3: Update `deliverCompletionMessage` to read `resolvedOutcomeId`**

Replace `deliverCompletionMessage`:

```ts
  /** Deliver the completion message into the contract folder, picking the right arm. */
  private deliverCompletionMessage(contract: Contract, instance: ContractInstance): void {
    if (contract.completionByOutcome) {
      const outcomeId = instance.resolvedOutcomeId
      if (outcomeId && contract.completionByOutcome[outcomeId]) {
        this.messageSystem.enqueueById(contractCompletionMessageId(contract.id, outcomeId))
        return
      }
      // No resolved outcome but completionByOutcome present — log and skip.
      console.warn(
        `Contract ${contract.id} completed without a resolvedOutcomeId; no completion message delivered.`,
      )
      return
    }
    this.messageSystem.enqueueById(contractCompletionMessageId(contract.id))
  }
```

- [ ] **Step 4: Update the `advanceStep` call site that delivers the completion**

In `src/lib/contracts/ContractSystem.ts`, find the `if (nextIndex >= contract.steps.length)` branch in `advanceStep`. Pass `updated` to `deliverCompletionMessage` and `applyRewards`:

```ts
        updated = { ...updated, status: 'completed', completedAt: new Date().toISOString() }
        this.snapshot = {
          ...this.snapshot,
          instances: { ...this.snapshot.instances, [contract.id]: updated },
        }
        this.deliverCompletionMessage(contract, updated)
        this.applyRewards(contract, updated)
        this.hooks.onContractCompleted?.(contract.id)
        this.evaluatePrerequisiteContractOffers()
```

- [ ] **Step 5: Update `applyRewards` to dispatch the matching arm**

Replace `applyRewards`:

```ts
  /** Fan reward effects out to the registered hook. */
  private applyRewards(contract: Contract, instance: ContractInstance): void {
    if (!this.hooks.onRewardGranted) return
    const effects = resolveRewardEffects(contract, instance)
    for (const effect of effects) {
      this.hooks.onRewardGranted(effect, contract)
    }
  }
```

And add a free helper at the bottom of the file:

```ts
/**
 * Pick the rewards array for a completed contract, branching on
 * `completionByOutcome` when present. Returns `[]` when the contract uses
 * outcome arms but no outcome resolved (defensive: completion still fires but
 * no rewards).
 *
 * @param contract - Completed contract definition.
 * @param instance - Instance whose `resolvedOutcomeId` selects the arm.
 * @returns Reward effects to dispatch (possibly empty).
 */
function resolveRewardEffects(contract: Contract, instance: ContractInstance): RewardEffect[] {
  if (contract.completionByOutcome) {
    const outcomeId = instance.resolvedOutcomeId
    if (!outcomeId) return []
    const arm = contract.completionByOutcome[outcomeId]
    return arm?.rewards ?? []
  }
  return contract.rewards ?? []
}
```

- [ ] **Step 6: Update `replayCompletedRewards` to pass the instance**

In `replayCompletedRewards`, replace `this.applyRewards(contract)` with `this.applyRewards(contract, instance)`.

- [ ] **Step 7: Type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/contracts/ContractSystem.ts
git commit -m "feat(contracts): dispatch completionByOutcome arms via resolvedOutcomeId"
```

---

## Task 8: Catalog validator — exactly one of legacy / byOutcome

**Files:**
- Modify: `src/lib/contracts/contractCatalog.ts`

- [ ] **Step 1: Write the validator and apply on module load**

Replace `src/lib/contracts/contractCatalog.ts` with:

```ts
/**
 * Static catalog of all authored contracts.
 *
 * Loads JSON contract definitions from `src/data/contracts/*.json` and exports
 * them as a flat array. Validates at module-load time that each contract uses
 * exactly one of the legacy `completionSubject/completionBody/rewards` triple
 * or the `completionByOutcome` block (mutually exclusive).
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-contracts-design.md
 */
import jovianSocietyProspection from '@/data/contracts/jovian-society-prospection.json'
import martianMarineCorpsCohort from '@/data/contracts/martian-marine-corps-cohort.json'
import spaceCowboysMarsHq from '@/data/contracts/space-cowboys-mars-hq.json'
import theCinderline from '@/data/contracts/the-cinderline.json'
import uscVenusCertification from '@/data/contracts/usc-venus-certification.json'
import venusianZeppelinTradeLoop from '@/data/contracts/venusian-zeppelin-trade-loop.json'
import type { Contract } from './contractTypes'

/** All authored contracts shipped with the game. */
export const CONTRACT_CATALOG: Contract[] = [
  spaceCowboysMarsHq as Contract,
  uscVenusCertification as Contract,
  martianMarineCorpsCohort as Contract,
  venusianZeppelinTradeLoop as Contract,
  theCinderline as Contract,
  jovianSocietyProspection as Contract,
]

/**
 * Assert each contract uses exactly one completion shape (legacy triple OR
 * `completionByOutcome`, not both, not neither). Throws on misconfiguration so
 * the bug surfaces at module-load instead of at runtime.
 */
function validateCatalog(catalog: Contract[]): void {
  for (const contract of catalog) {
    const hasLegacy =
      contract.completionSubject !== undefined &&
      contract.completionBody !== undefined &&
      contract.rewards !== undefined
    const hasByOutcome = contract.completionByOutcome !== undefined
    if (hasLegacy === hasByOutcome) {
      throw new Error(
        `Contract '${contract.id}' must define exactly one of {completionSubject + completionBody + rewards} or {completionByOutcome}.`,
      )
    }
  }
}

validateCatalog(CONTRACT_CATALOG)
```

- [ ] **Step 2: Type-check**

Run: `bun run type-check`
Expected: FAIL — JSON import will not yet resolve because the JSON also contains unmapped types (handled in Task 9).

If type-check fails on the JSON shape (e.g. `'destroy-body'` not assignable), defer the check until after Task 9.

- [ ] **Step 3: Run tests (skip running yet)**

Skip `bun test:unit` until Task 9 also lands; the JSON shape mismatch will fail every contract test.

- [ ] **Step 4: Commit**

```bash
git add src/lib/contracts/contractCatalog.ts
git commit -m "feat(contracts): register Jovian Society and validate completion shape"
```

---

## Task 9: JSON edits — align Jovian Society to canonical reward types

**Files:**
- Modify: `src/data/contracts/jovian-society-prospection.json`

- [ ] **Step 1: Rename `pinnedAssets[0].assetRef` to `'hektor'`**

Edit `src/data/contracts/jovian-society-prospection.json`:

Change `"assetRef": "jovian-prospectus-target-jupiter"` to `"assetRef": "hektor"`.

Then, for **every** step that uses `"pinnedAssetRef": "jovian-prospectus-target-jupiter"`, change it to `"pinnedAssetRef": "hektor"`. There are three locations: OP 4 step, OP 7 step, and OP 9 (choice-mission) step.

- [ ] **Step 2: Rewrite `completionByOutcome.transmit.rewards`**

Replace the `"transmit"` arm's rewards array with:

```json
      "rewards": [
        { "type": "shuttle-buff", "buffId": "jovianEmpowerment", "multiplier": 1.5 },
        { "type": "set-body-access", "bodyId": "hektor", "state": "destroyed" },
        { "type": "mission-pay-multiplier", "planetId": "jupiter", "multiplier": 2 }
      ]
```

(Drop the old `destroy-body` and `faction-standing` entries.)

- [ ] **Step 3: Rewrite `completionByOutcome.tamper.rewards`**

Replace the `"tamper"` arm's rewards array with:

```json
      "rewards": [
        { "type": "disable-giver", "giverId": "jovian-society" },
        { "type": "set-body-access", "bodyId": "hektor", "state": "liberated" }
      ]
```

- [ ] **Step 4: Type-check**

Run: `bun run type-check`
Expected: PASS — every reward effect now matches a `RewardEffect` arm; the JSON casts to `Contract` cleanly.

- [ ] **Step 5: Run all contract tests (sanity)**

Run: `bun test:unit src/lib/contracts/__tests__/`
Expected: PASS for existing tests, plus the choice-mission test from Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/data/contracts/jovian-society-prospection.json
git commit -m "feat(contracts): align Jovian JSON to canonical reward types and hektor ref"
```

---

## Task 10: Reward dispatch — `shuttle-buff`, `disable-giver`, `set-body-access`

**Files:**
- Modify: `src/lib/contracts/runtime.ts`

- [ ] **Step 1: Extend `applyRewardToProfile`**

In `src/lib/contracts/runtime.ts`, update the imports to include `disableGiver`, `setBodyAccess`, and `setShuttleBuff`:

```ts
import {
  addCredits,
  disableGiver,
  loadProfile,
  saveProfile,
  setBodyAccess,
  setMissionPayMultiplier,
  setShuttleBuff,
  unlockFastTravelPlanet,
} from '@/lib/player/profile'
```

Replace the `applyRewardToProfile` function with:

```ts
/**
 * Apply a contract reward effect to the persisted player profile. Idempotent:
 * unlocking the same planet twice is a no-op, raising a multiplier never
 * regresses an existing bonus, replaying body-access transitions just rewrites
 * to the same state.
 *
 * @param effect - Reward effect drawn from `Contract.rewards` or
 *   `Contract.completionByOutcome[outcomeId].rewards`.
 * @param contract - Contract that produced this effect (for shuttle-upgrade UI meta).
 */
function applyRewardToProfile(effect: RewardEffect, contract: Contract): void {
  const profile = loadProfile()
  if (!profile) return
  let next = profile
  if (effect.type === 'fast-travel') {
    next = unlockFastTravelPlanet(next, effect.planetId)
  } else if (effect.type === 'mission-pay-multiplier') {
    next = setMissionPayMultiplier(next, effect.planetId, effect.multiplier)
  } else if (effect.type === 'shuttle-upgrade') {
    const leveled = ensureUpgradeAtLeast(effect.upgradeId, effect.minLevel)
    if (leveled) {
      const newLevel = CURRENT_PLAYER_UPGRADE_LEVELS[effect.upgradeId] ?? 0
      const payload: ContractShuttleUpgradeGrantPayload = {
        upgradeId: effect.upgradeId,
        newLevel,
        contractInboxName: contract.inboxName,
      }
      for (const listener of contractShuttleUpgradeListeners) {
        try {
          listener(payload)
        } catch {
          // best-effort; do not break reward application
        }
      }
    }
  } else if (effect.type === 'shuttle-buff') {
    next = setShuttleBuff(next, effect.buffId, effect.multiplier)
  } else if (effect.type === 'disable-giver') {
    next = disableGiver(next, effect.giverId)
  } else if (effect.type === 'set-body-access') {
    next = setBodyAccess(next, effect.bodyId, effect.state)
  }
  if (next !== profile) saveProfile(next)
}
```

- [ ] **Step 2: Wire `onChoiceOutcomeResolved` into the runtime**

In `src/lib/contracts/runtime.ts` → `new ContractSystem(...)` hooks block, add an `onChoiceOutcomeResolved` entry that pays the per-outcome credits:

```ts
  onChoiceOutcomeResolved: (payload) => {
    payContractStepCredits(payload.creditsReward)
  },
```

- [ ] **Step 3: Add the dev picker hook**

Append to `src/lib/contracts/runtime.ts`:

```ts
/**
 * Dev console hook: resolve a `'choice-mission'` step by hand. Gated by
 * `import.meta.env.DEV`. The user can run e.g.
 * `window.__contracts.resolveChoice('jovian_final_prospectus', 'transmit')`
 * to drive a contract to completion without the canvas terminal overlay.
 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __contracts: { resolveChoice: (m: string, o: string) => boolean } }
    ).__contracts = {
    resolveChoice: (missionId, outcomeId) =>
      contractSystem.notifyChoiceResolved(missionId, outcomeId),
  }
}
```

- [ ] **Step 4: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contracts/runtime.ts
git commit -m "feat(contracts): dispatch new reward effects and add dev choice picker"
```

---

## Task 11: Combined `offerWhenPrerequisites` evaluator

**Files:**
- Modify: `src/lib/contracts/ContractSystem.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/contracts/__tests__/ContractSystem.spec.ts` (under the choice-mission describe or a new `describe('offerWhenPrerequisites combined gate')`):

```ts
describe('offerWhenPrerequisites combined gate', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('fires when both requiredCompletedContractId and triggerOnPlanetVisited met', () => {
    const A: Contract = {
      id: 'a',
      inboxName: 'A',
      from: 't',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'A',
      introBody: ['a'],
      steps: [{ kind: 'visit-planet', planetId: 'mars', subject: 's', flavor: ['f'] }],
      completionSubject: 'A done',
      completionBody: ['ad'],
      rewards: [],
    }
    const B: Contract = {
      id: 'b',
      inboxName: 'B',
      from: 't',
      sentAt: TEST_DATE,
      offerWhenPrerequisites: {
        requiredCompletedContractId: 'a',
        triggerOnPlanetVisited: 'jupiter',
      },
      introSubject: 'B',
      introBody: ['b'],
      steps: [{ kind: 'visit-planet', planetId: 'earth', subject: 's', flavor: ['f'] }],
      completionSubject: 'B done',
      completionBody: ['bd'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([A, B], messages, inMemoryPersistence(), {
      hasOrbitedPlanet: () => false,
    })
    contracts.resetForTests()

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract('a')
    contracts.notifyPlanetVisited('mars') // completes A

    // B prereq met but planet-visit gate not — should not be offered yet.
    expect(contracts.getInstance('b')).toBeNull()

    // Order doesn't matter: visiting jupiter now offers B.
    contracts.notifyPlanetVisited('jupiter')
    expect(contracts.getInstance('b')?.status).toBe('available')
  })

  it('respects order: planet visited before required contract completed', () => {
    const A: Contract = { /* same as above */ } as Contract
    const B: Contract = { /* same as above */ } as Contract
    // Build identical fixtures inline (or factor a helper).
    // Visit jupiter first, then complete A → B should still offer.
    // ... (full body required by no-placeholder rule)
  })
})
```

Replace the second test's placeholder with the full body:

```ts
  it('respects order: planet visited before required contract completed', () => {
    const A: Contract = {
      id: 'a2',
      inboxName: 'A',
      from: 't',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'A',
      introBody: ['a'],
      steps: [{ kind: 'visit-planet', planetId: 'mars', subject: 's', flavor: ['f'] }],
      completionSubject: 'A done',
      completionBody: ['ad'],
      rewards: [],
    }
    const B: Contract = {
      id: 'b2',
      inboxName: 'B',
      from: 't',
      sentAt: TEST_DATE,
      offerWhenPrerequisites: {
        requiredCompletedContractId: 'a2',
        triggerOnPlanetVisited: 'jupiter',
      },
      introSubject: 'B',
      introBody: ['b'],
      steps: [{ kind: 'visit-planet', planetId: 'earth', subject: 's', flavor: ['f'] }],
      completionSubject: 'B done',
      completionBody: ['bd'],
      rewards: [],
    }
    const messages = new MessageSystem(emptyMessageStore())
    const contracts = new ContractSystem([A, B], messages, inMemoryPersistence(), {
      hasOrbitedPlanet: () => false,
    })
    contracts.resetForTests()

    contracts.notifyPlanetVisited('jupiter')
    expect(contracts.getInstance('b2')).toBeNull()

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract('a2')
    contracts.notifyPlanetVisited('mars')
    expect(contracts.getInstance('b2')?.status).toBe('available')
  })
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts -t "offerWhenPrerequisites combined gate"`
Expected: FAIL.

- [ ] **Step 3: Track jovian-style planet visits in the snapshot**

In `src/lib/contracts/contractTypes.ts` → `ContractStoreSnapshot`, add:

```ts
  /**
   * Planet ids the player has orbited at least once since the contract system
   * started observing. Drives `offerWhenPrerequisites.triggerOnPlanetVisited`.
   */
  visitedPlanetIds?: Record<string, true>
```

In `src/lib/contracts/contractStorage.ts` → `loadContractSnapshot`, after the `missionCompletionsByKind` block, add:

```ts
    let visitedPlanetIds: Record<string, true> = {}
    if (
      obj.visitedPlanetIds &&
      typeof obj.visitedPlanetIds === 'object' &&
      !Array.isArray(obj.visitedPlanetIds)
    ) {
      for (const [planetId, value] of Object.entries(
        obj.visitedPlanetIds as Record<string, unknown>,
      )) {
        if (value === true) visitedPlanetIds[planetId] = true
      }
    }
```

And include it in the returned object:

```ts
    return {
      instances,
      observedMissionCompletions,
      giverPlanetCompletions,
      missionCompletionsByKind:
        missionCompletionsByKind as ContractStoreSnapshot['missionCompletionsByKind'],
      visitedPlanetIds,
      version: 1,
    }
```

In `emptyContractSnapshot()`, add `visitedPlanetIds: {},` to the returned literal.

- [ ] **Step 4: Update `notifyPlanetVisited` to record visits and re-evaluate prereqs**

In `src/lib/contracts/ContractSystem.ts` → `notifyPlanetVisited`, at the very start of the method:

```ts
  notifyPlanetVisited(planetId: string): void {
    let changed = false
    const visited = this.snapshot.visitedPlanetIds ?? {}
    if (visited[planetId] !== true) {
      this.snapshot = {
        ...this.snapshot,
        visitedPlanetIds: { ...visited, [planetId]: true },
      }
    }
    // ... existing body ...
```

After the existing body, just before `if (changed) this.afterChange()`, add:

```ts
    if (this.evaluatePrerequisiteContractOffers()) {
      changed = true
    }
    this.persist()
```

- [ ] **Step 5: Update `evaluatePrerequisiteContractOffers` to AND every present sub-field**

Replace `evaluatePrerequisiteContractOffers`:

```ts
  /**
   * Offer contracts whose `offerWhenPrerequisites` gates are all satisfied.
   * Every present sub-field is AND-ed. Order of qualifying events does not
   * matter — the evaluator runs after every relevant signal.
   *
   * @returns True if at least one new contract was offered.
   */
  private evaluatePrerequisiteContractOffers(): boolean {
    let offered = false
    for (const contract of this.contracts.values()) {
      const p = contract.offerWhenPrerequisites
      if (!p) continue
      if (this.snapshot.instances[contract.id]) continue
      if (p.requiredCompletedContractId !== undefined) {
        const pre = this.snapshot.instances[p.requiredCompletedContractId]
        if (!pre || pre.status !== 'completed') continue
      }
      if (p.minGiverPlanetCompletions !== undefined) {
        const { planetId, min: minCount } = p.minGiverPlanetCompletions
        if ((this.snapshot.giverPlanetCompletions[planetId] ?? 0) < minCount) continue
      }
      if (p.triggerOnPlanetVisited !== undefined) {
        if (this.snapshot.visitedPlanetIds?.[p.triggerOnPlanetVisited] !== true) continue
      }
      this.offerContract(contract)
      offered = true
    }
    return offered
  }
```

- [ ] **Step 6: Run tests**

Run: `bun test:unit src/lib/contracts/__tests__/ContractSystem.spec.ts`
Expected: PASS for both new combined-gate tests + existing tests still green.

- [ ] **Step 7: Type-check + lint**

Run: `bun run type-check && bun run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/contracts
git commit -m "feat(contracts): support combined offerWhenPrerequisites gate (AND of present fields)"
```

---

## Task 12: Jovian-specific test suite

**Files:**
- Create: `src/lib/contracts/__tests__/jovian-contract.spec.ts`

- [ ] **Step 1: Create the test file**

Write `src/lib/contracts/__tests__/jovian-contract.spec.ts`:

```ts
/**
 * Tests for the jovian-society-prospection contract: schema parses, end-to-end
 * walkability with stub events, and per-outcome arm dispatch.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-29-jovian-contract-schema-parity-design.md
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import jovianRaw from '@/data/contracts/jovian-society-prospection.json'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type {
  ChoiceMissionStep,
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
} from '../contractTypes'

const jovian = jovianRaw as Contract

function emptyMessageStore() {
  return { load: () => ({ messages: {}, version: 1 as const }), save: () => undefined }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

const mining: MissionCompletedEvent = {
  kind: 'mining',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
}
const asteroid: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
}

describe('jovian-society-prospection schema', () => {
  it('parses with 9 steps, completionByOutcome, and pinnedAssets', () => {
    expect(jovian.id).toBe('jovian-society-prospection')
    expect(jovian.steps.length).toBe(9)
    expect(jovian.completionByOutcome).toBeTruthy()
    expect(jovian.completionByOutcome?.transmit).toBeTruthy()
    expect(jovian.completionByOutcome?.tamper).toBeTruthy()
    expect(jovian.pinnedAssets?.[0]?.assetRef).toBe('hektor')
  })

  it('step 9 is a choice-mission with two outcomes', () => {
    const step = jovian.steps[8] as ChoiceMissionStep
    expect(step.kind).toBe('choice-mission')
    expect(step.missionId).toBe('jovian_final_prospectus')
    expect(step.outcomes.map((o) => o.outcomeId)).toEqual(['transmit', 'tamper'])
  })
})

describe('jovian-society-prospection walkability', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  function buildSystem(rewards: RewardEffect[][] = [[], []]) {
    void rewards
    const messages = new MessageSystem(emptyMessageStore())
    const granted: RewardEffect[] = []
    const completed: string[] = []
    const contracts = new ContractSystem(
      [jovian],
      messages,
      inMemoryPersistence(),
      {
        onRewardGranted: (effect) => granted.push(effect),
        onContractCompleted: (id) => completed.push(id),
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(jovian.id)
    contracts.acceptContract(jovian.id)
    return { contracts, granted, completed }
  }

  function driveToChoice(contracts: ContractSystem) {
    // Steps 1, 2: complete-missions (asteroid/gather + mining). Stub matcher
    // ignores objectiveType; any matching family + giver works.
    contracts.notifyMissionCompleted(asteroid)
    contracts.notifyMissionCompleted(mining)
    // Step 3: collect-drops 3 viroid-psychosphere
    for (let i = 0; i < 3; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 4: photometry asteroid (matcher loose: just an asteroid).
    contracts.notifyMissionCompleted(asteroid)
    // Step 5: photometry asteroid in Saturn region (loose).
    contracts.notifyMissionCompleted(asteroid)
    // Step 6: collect-drops 8.
    for (let i = 0; i < 8; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 7: DAN asteroid (loose).
    contracts.notifyMissionCompleted(asteroid)
    // Step 8: DAN asteroid Saturn region (loose).
    contracts.notifyMissionCompleted(asteroid)
  }

  it('drives transmit arm end-to-end', () => {
    const { contracts, granted, completed } = buildSystem()
    driveToChoice(contracts)
    const inst = contracts.getInstance(jovian.id)
    expect(inst?.currentStepIndex).toBe(8)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
    expect(contracts.getInstance(jovian.id)?.status).toBe('completed')
    expect(contracts.getInstance(jovian.id)?.resolvedOutcomeId).toBe('transmit')
    expect(completed).toContain(jovian.id)
    const types = granted.map((e) => e.type)
    expect(types).toContain('shuttle-buff')
    expect(types).toContain('set-body-access')
    expect(types).toContain('mission-pay-multiplier')
  })

  it('drives tamper arm end-to-end', () => {
    const { contracts, granted } = buildSystem()
    driveToChoice(contracts)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    expect(contracts.getInstance(jovian.id)?.resolvedOutcomeId).toBe('tamper')
    const types = granted.map((e) => e.type)
    expect(types).toContain('disable-giver')
    expect(types).toContain('set-body-access')
    // Tamper should NOT grant the shuttle-buff or jupiter pay mult.
    expect(types).not.toContain('shuttle-buff')
    expect(types).not.toContain('mission-pay-multiplier')
  })

  it('per-outcome creditsReward fires through onChoiceOutcomeResolved', () => {
    const messages = new MessageSystem(emptyMessageStore())
    const credits: number[] = []
    const contracts = new ContractSystem([jovian], messages, inMemoryPersistence(), {
      onChoiceOutcomeResolved: (p) => credits.push(p.creditsReward),
    })
    contracts.resetForTests()
    contracts.offerForTests(jovian.id)
    contracts.acceptContract(jovian.id)
    driveToChoice(contracts)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
    expect(credits).toEqual([5000])
  })

  it('survives serialize → deserialize round trip', () => {
    const { contracts } = buildSystem()
    driveToChoice(contracts)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    const inst = contracts.getInstance(jovian.id)
    const json = JSON.stringify({ instances: { [jovian.id]: inst } })
    const parsed = JSON.parse(json) as {
      instances: Record<string, { resolvedOutcomeId: string | null; status: string }>
    }
    expect(parsed.instances[jovian.id]?.resolvedOutcomeId).toBe('tamper')
    expect(parsed.instances[jovian.id]?.status).toBe('completed')
  })
})
```

- [ ] **Step 2: Run the new test file**

Run: `bun test:unit src/lib/contracts/__tests__/jovian-contract.spec.ts`
Expected: PASS for all five tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/contracts/__tests__/jovian-contract.spec.ts
git commit -m "test(contracts): jovian schema parse, walkability, and arm dispatch"
```

---

## Task 13: Acceptance gate — full type-check, lint, and test sweep

- [ ] **Step 1: Run type-check**

Run: `bun run type-check`
Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: oxlint 0 errors, ESLint 0 errors / 0 warnings.

If TSDoc warnings appear on new exports, fix in place (add `@param`, `@returns`, etc.) and re-run.

- [ ] **Step 3: Run all unit tests**

Run: `bun test:unit`
Expected: full green; no regressions on existing contract tests (Cinderline, Marines, Cowboys, USC, Zeppelin).

- [ ] **Step 4: Manual walkthrough — transmit arm (in dev)**

Start dev server: `bun dev`. In the browser console, after a fresh save and after completing `martian-marine-corps-cohort` and orbiting Jupiter, drive the contract by repeated `notifyMissionCompleted` and `notifyDropCollected` calls (the dev console exposes the contract system on `window.contractSystem` if a journal hook is wired; otherwise sequence through actual missions). Final command:

```js
window.__contracts.resolveChoice('jovian_final_prospectus', 'transmit')
```

Expected:
- Transmit completion message arrives in the Jovian Society inbox folder.
- Player profile shows `shuttleBuffs.jovianEmpowerment === 1.5`.
- Player profile shows `missionPayMultipliers.jupiter === 2`.
- Player profile shows `bodyAccess.hektor === 'destroyed'`.

- [ ] **Step 5: Manual walkthrough — tamper arm**

Repeat with a fresh save and `'tamper'` instead. Expected:
- Cohort-departure message arrives.
- `disabledGiverIds['jovian-society'] === true`.
- `bodyAccess.hektor === 'liberated'`.

- [ ] **Step 6: Final commit if any cleanup landed**

```bash
git status
# if anything is dirty:
git add -A
git commit -m "chore(contracts): plan-2 final cleanup"
```

---

## Notes for the implementer

- The `MessageSystem` and `MessageStorage` test stubs above (`emptyMessageStore`, `inMemoryPersistence`) match the in-tree pattern; if `ContractSystem.spec.ts` already exports a richer pair, prefer those.
- `setBodyAccess` already exists in `src/lib/player/profile.ts` (see line ~319); only `setShuttleBuff` and `disableGiver` are net-new helpers.
- The `'set-body-access'` reward effect couples to `BodyAccessState`, which is already exported from `src/lib/player/types.ts` — no migration risk.
- The dev picker is gated on `import.meta.env.DEV` and `typeof window !== 'undefined'` so it never ships to test/SSR contexts.
- This plan does NOT tighten the `complete-missions` matcher. Steps that the JSON authors with `objectiveType` / `targetRegion` / `pinnedAssetRef` will satisfy on any matching mission family + giver. Plans 3, 4, and 5 fix that.
