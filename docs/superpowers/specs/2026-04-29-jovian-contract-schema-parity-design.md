# Jovian Society Contract — Schema Parity & Walkable Stub

_Plan 2 of the Jovian Society Prospection contract rollout. Engine-only._

---

## Premise

The contract data already exists in `src/data/contracts/jovian-society-prospection.json` and references several schema concepts the engine doesn't know about yet (`pinnedAssets`, `pinnedAssetRef`, `objectiveType`, `targetRegion`, `choice-mission` step kind, `completionByOutcome`, three new reward types, and a combined-prerequisite trigger shape). Plan 2 ships **just enough** to make the JSON parse, type-check, register in the catalog, and walk end-to-end with placeholder behavior — no UI changes, no 3D, no minigame, no new mission generators.

After plan 2 lands, the contract is offerable, all 9 steps progress through the runtime, the player can drive it to completion, the right `completionByOutcome` block resolves and its message arrives in the Society inbox folder. The choice between transmit and tamper is made via a **dev picker** (modal or console hook). Many steps will satisfy without real player action because the giver pool / mission-routing work is plan 3-5; that's intentional. This plan exists to flush out schema bugs, type errors, and contract-loop regressions cheaply, before any feature flesh is laid on.

This plan is independent of plan 1 (Hektor pinned body). Both can ship in parallel.

---

## Scope

**In scope**

1. New schema fields on `Contract`, `CompleteMissionsStep`, and the step union — typed, validated, persisted (where applicable), with stub runtime behavior.
2. Adjusted `offerWhenPrerequisites` shape that supports `requiredCompletedContractId + triggerOnPlanetVisited` as authored in the JSON.
3. Three new reward effect kinds: `shuttle-buff`, `disable-giver`, and a body-state effect (one of two options below — section *Reward effects*).
4. `'choice-mission'` step kind in the discriminated union, with a stub resolver (dev picker) that fires `notifyChoiceResolved(missionId, outcomeId)`.
5. `completionByOutcome` block on `Contract` that picks the right `completionSubject / completionBody / rewards` triple based on the resolved outcome string, mutually exclusive with the legacy single-completion fields.
6. Register `jovian-society-prospection` in `CONTRACT_CATALOG`.
7. Tests: schema parses, runtime walks, choice-mission resolves, completionByOutcome dispatches the correct branch.

**Out of scope**

- Any 3D / Vue / canvas work. No `OrbitPrompt` changes, no `MapView` changes, no minigame, no kiosk slot fill.
- Mission generator routing for `pinnedAssetRef` (plan 4) or `targetRegion` overrides (plan 5). Filters are accepted by the type but the runtime ignores them in plan 2 — any `complete-missions` event matches as if those fields weren't there. Steps requiring photometry/DAN on Hektor will satisfy on **any** completed asteroid mission of the right type until plan 4/5 tighten the filter.
- Jovian giver pool expansion (plan 3). Steps 1 (`gather`) and 2 (`mining`) don't have giver-side missions yet; the player satisfies them by completing **any** asteroid/mining mission posted by the Society — schema-level only.
- Real `shuttle-buff` math, real body destruction visuals, real giver blacklisting at the mission-board level. Reward effects register and dispatch but their **side effects** are deferred to plan 7. In plan 2 they log + persist a flag so plan 7 can read it.
- Hektor existing on the map. That's plan 1, dispatched in parallel; this plan doesn't depend on it.

---

## Schema additions

All edits land in `src/lib/contracts/contractTypes.ts`. Existing types stay backward-compatible.

### 1. `Contract.pinnedAssets`

```ts
/** Body the contract pins for its duration. Plan 2 stores; plan 4 routes missions to it. */
export interface PinnedAsset {
  /** Stable ref used by step `pinnedAssetRef` lookups. */
  assetRef: string
  /** Region the body lives in (e.g. `'jovian-trojans'`). */
  region: string
  /** Display label for inbox flavor and asset cards (e.g. `'Asset 2306-J'`). */
  label: string
}

export interface Contract {
  // ...existing...
  /** Bodies pinned at acceptance. Empty/absent for non-pinning contracts. */
  pinnedAssets?: PinnedAsset[]
}
```

Persisted on `ContractInstance`? **No** — pinned assets are static contract metadata, not per-save state. They live on the `Contract` definition only.

### 2. `CompleteMissionsStep` filters and triggers

```ts
export interface CompleteMissionsStep extends ContractStepRewardMixin {
  kind: 'complete-missions'
  count: number
  missionType?: ContractMissionType
  giverId?: string
  giverPlanetId?: string

  // NEW — accepted by the type, ignored by the matcher in plan 2.
  /** Restrict to a single objective type within the mission family (e.g. `'photometry'`, `'dan'`, `'gather'`). */
  objectiveType?: string
  /** When set, requires the mission to have spawned in this region (e.g. `'saturn-trojans'`). */
  targetRegion?: string
  /** When set, requires the mission to target the contract's pinned body with this ref. */
  pinnedAssetRef?: string
  /** When set, this step auto-activates a specific {@link SPECIAL_MISSIONS} entry on entry. Plan 4 wires the activation. Plan 2 stores the field. */
  specialMissionId?: string
  /** When set, step activation flips `bodyAccess[revealsBody]` to `'unrestricted'` so a pinned body becomes visible/orbit-able. Plan 4 wires the activation. Plan 2 stores the field. */
  revealsBody?: string

  subject: string
  flavor: string[]
}
```

The matcher in `ContractSystem.notifyMissionCompleted` is **not changed** in plan 2 — the new fields parse and store but don't filter. A `// TODO(plan-3/4/5): tighten filter` comment marks the spot.

The `MissionCompletedEvent` payload may need optional fields added (`objectiveType?`, `region?`, `pinnedAssetRef?`) so the matcher has something to read when plans 3-5 turn the filter on. Add them as optional now even though plan 2 doesn't populate them — that way emitting sites can fill them in later without an event-shape break.

### 3. `'choice-mission'` step

```ts
/** Outcome option presented to the player at a choice-mission terminal. */
export interface ChoiceMissionOutcome extends ContractStepRewardMixin {
  /** Stable id (e.g. `'transmit'`, `'tamper'`). */
  outcomeId: string
  /** Display label (e.g. `'Transmit Report'`). */
  label: string
}

/**
 * Step that requires the player to make a binary (or N-ary) choice at a
 * special-purpose mission. Plan 2 resolves this via a dev picker. Plan 6 wires
 * the actual prospectus terminal canvas overlay.
 */
export interface ChoiceMissionStep {
  kind: 'choice-mission'
  /** Mission id presented to the choice-mission runner (e.g. `'jovian_final_prospectus'`). */
  missionId: string
  /** Authored kind name for the runner (e.g. `'terminal-prospectus'`). Used by plan 6 to pick which canvas overlay opens. */
  minigameType: string
  /** Asset ref the choice-mission spawns at (matches a contract `pinnedAssets[].assetRef`). */
  pinnedAssetRef?: string
  /** Authored outcomes. Plan 2 picks one via dev picker. */
  outcomes: ChoiceMissionOutcome[]
  subject: string
  flavor: string[]
}

export type ContractStep =
  | CompleteMissionsStep
  | InstallUpgradeStep
  | VisitPlanetStep
  | OrbitalMissionStep
  | TradeGoodsStep
  | CollectDropsStep
  | LaunchFromBodyStep
  | DeliverItemsStep
  | ChoiceMissionStep   // NEW
```

`ChoiceMissionStep` does not extend `ContractStepRewardMixin` — payout is per-outcome on `ChoiceMissionOutcome`. The contract resolver pays the chosen outcome's `creditsReward` when the choice resolves.

`requiredCount(step)` returns `1` for `'choice-mission'`.

### 4. Resolved-outcome state on `ContractInstance`

The contract system needs to remember which outcome was picked so the completion handler can route to the right `completionByOutcome` block.

```ts
export interface ContractInstance {
  // ...existing...
  /** Outcome id resolved by a choice-mission step, or null if none resolved yet. */
  resolvedOutcomeId: string | null
}
```

Set on the live transition when the player picks an outcome; cleared to `null` for fresh instances. Backward-compatible: missing field on persisted snapshots normalizes to `null` on load.

### 5. `completionByOutcome` on `Contract`

```ts
/** One completion arm per outcome id of a contained `'choice-mission'` step. */
export interface ContractCompletionArm {
  completionSubject: string
  completionBody: string[]
  rewards: RewardEffect[]
}

export interface Contract {
  // ...existing...
  /**
   * Mutually exclusive with `completionSubject` / `completionBody` / `rewards`.
   * When present, the completion handler reads `instance.resolvedOutcomeId` and
   * dispatches the matching arm. When neither block resolves, the contract still
   * completes but logs a warning and dispatches no rewards.
   */
  completionByOutcome?: Record<string, ContractCompletionArm>
}
```

The legacy `completionSubject` / `completionBody` / `rewards` triple becomes optional. A new validator in `contractCatalog.ts` (or wherever load-time normalization lives) asserts exactly one of `{legacy triple, completionByOutcome}` is present per contract.

### 6. `offerWhenPrerequisites` combined trigger

Current shape requires `minGiverPlanetCompletions`. The Jovian JSON authors a different combination: `requiredCompletedContractId + triggerOnPlanetVisited`. Make all three sub-fields optional and the system AND-s every present field:

```ts
export interface Contract {
  // ...existing...
  offerWhenPrerequisites?: {
    /** Optional — id of a contract the player must have finished. */
    requiredCompletedContractId?: string
    /** Optional — giver planet completion gate (legacy combined gate). */
    minGiverPlanetCompletions?: { planetId: string; min: number }
    /** Optional — fires the offer the first time the player orbits this planet (with all other gates met). */
    triggerOnPlanetVisited?: string
  }
}
```

The runtime keeps the existing top-level `triggerOnPlanetVisited` for contracts that don't have other prerequisites. When the same field appears inside `offerWhenPrerequisites`, the planet-visit signal is treated as **a check** during the `requiredCompletedContractId` gate evaluation — i.e. the offer fires when (a) the required contract is completed AND (b) the player has orbited the named planet at least once. The order of those two events is irrelevant.

### 7. Reward effects

```ts
export type RewardEffect =
  | { type: 'fast-travel'; planetId: string }
  | { type: 'mission-pay-multiplier'; planetId: string; multiplier: number }
  | { type: 'shuttle-upgrade'; upgradeId: UpgradeId; minLevel: number }
  // NEW
  | { type: 'shuttle-buff'; buffId: string; multiplier: number }
  | { type: 'disable-giver'; giverId: string }
  | { type: 'set-body-access'; bodyId: string; state: 'restricted' | 'unrestricted' | 'liberated' | 'destroyed' }
```

**Why `set-body-access` and not `destroy-body` / `liberate-body`?** The GDD names them by what they do narratively, but mechanically they're both "flip Hektor's `bodyAccess` field to a specific state." A single `set-body-access` reward effect is more general and lets future contracts pin different bodies without inventing new reward kinds. The Jovian JSON gets two arms:
- transmit: `{ type: 'set-body-access', bodyId: 'hektor', state: 'destroyed' }`
- tamper: `{ type: 'set-body-access', bodyId: 'hektor', state: 'liberated' }`

This couples plan 2's reward system to plan 1's `bodyAccess` field. If plan 1 hasn't landed yet at the time plan 2 ships, this reward effect can be a logged no-op until plan 1's `setBodyAccess` helper exists. Tests assert dispatch happens regardless.

**Reward dispatch in `runtime.ts → applyRewardToProfile`** picks up three new arms:

- `shuttle-buff`: persist `profile.shuttleBuffs[buffId] = multiplier` on the player profile (new optional field). No math is applied to ship stats yet — that's plan 7.
- `disable-giver`: persist `profile.disabledGiverIds[giverId] = true`. Plan 7 reads this to suppress the giver from the mission board.
- `set-body-access`: call `setBodyAccess(profile, bodyId, state)` if the helper is exported (plan 1). Otherwise log a warning and no-op. Plans 1 and 2 are racing in parallel; once plan 1 lands and the player picks an outcome on a fresh contract instance, the reward dispatch hits the real helper.

The `PlayerProfile` additions (`shuttleBuffs`, `disabledGiverIds`) are part of plan 2's profile-migration work.

The JSON's `faction-standing` reward type used in the GDD draft becomes `mission-pay-multiplier` (cohort-member arm) and `disable-giver` (blacklisted arm) — confirmed in our brainstorm. The JSON needs a small edit to use the canonical type names; this is part of plan 2 (we adapt the JSON to the matured spec).

### 8. JSON edits to `jovian-society-prospection.json`

The contract was authored before the spec matured. Plan 2 makes the following edits to align it:

- `completionByOutcome.transmit.rewards`: rewrite `faction-standing` to `mission-pay-multiplier` (which already exists alongside it in the same array — drop the duplicate). Replace `destroy-body` with `set-body-access`.
- `completionByOutcome.tamper.rewards`: rewrite `faction-standing` (`'blacklisted'`) to `disable-giver: 'jovian-society'`. Add a `set-body-access` to `'liberated'`.
- `pinnedAssets[0].assetRef`: confirm string id matches whatever id Hektor uses in plan 1 (`'hektor'`). The current JSON uses `'jovian-prospectus-target-jupiter'`. Either:
  - keep the JSON's `assetRef` and have plan 4 map asset-ref → body-id, or
  - rename to `'hektor'` directly, simpler.
  Plan 2 takes the simpler path: rename to `'hektor'` and update every `pinnedAssetRef` on steps to match.
- `offerWhenPrerequisites`: keep as-is (the new optional shape supports the existing JSON).

These edits are **in scope** for plan 2.

---

## Runtime additions

### `ContractSystem` API

New event-emitter:

```ts
/**
 * Fire when a `'choice-mission'` step's chosen outcome is resolved by the runner
 * (dev picker in plan 2; canvas overlay in plan 6).
 *
 * @param missionId - The choice-mission's `missionId` (e.g. `'jovian_final_prospectus'`).
 * @param outcomeId - The selected outcome id (e.g. `'transmit'`).
 */
notifyChoiceResolved(missionId: string, outcomeId: string): void
```

When fired:
1. Look up the active contract instance whose current step is a `'choice-mission'` matching `missionId`.
2. Validate `outcomeId` against `step.outcomes[].outcomeId`.
3. Set `instance.resolvedOutcomeId = outcomeId` and pay the per-outcome `creditsReward`.
4. Call `advanceStep(contract, instance, 1)` — this satisfies and the contract transitions to `completed`.
5. The completion handler reads `resolvedOutcomeId`, dispatches the matching `completionByOutcome` arm (subject + body to the inbox, rewards through `applyRewardToProfile`).

When `completionByOutcome` is absent, fall through to the legacy `completionSubject / completionBody / rewards`.

### Dev picker

Plan 2 ships a console hook (`window.__contracts.resolveChoice(missionId, outcomeId)`) gated by `import.meta.env.DEV`. No UI. The user can pick `transmit` or `tamper` by hand to verify both completion arms work.

### `requiredCount(step)`

Add the `'choice-mission'` case returning `1`.

### Profile migration

`PlayerProfile` gains three optional fields:
- `shuttleBuffs?: Record<string, number>` — defaults `{}`.
- `disabledGiverIds?: Record<string, true>` — defaults `{}`.
Backward-compat migration: missing fields normalize to defaults on load.

---

## Tests

`src/lib/contracts/__tests__/`:

1. **Schema parses.** Load `jovian-society-prospection.json`, cast to `Contract`, assert all 9 steps, the `completionByOutcome` block, and `pinnedAssets` survive the cast. (Compile-time test plus a runtime assertion.)
2. **`'choice-mission'` step satisfies.** Build a fake contract with one choice step. Accept it. Call `notifyChoiceResolved(missionId, 'transmit')`. Assert the contract is `completed`, `resolvedOutcomeId === 'transmit'`, and the transmit `completionBody` was emitted.
3. **`completionByOutcome` dispatch.** Same fixture, both arms — verify the right rewards array is dispatched per outcome.
4. **Per-outcome `creditsReward` paid.** Outcome with `creditsReward: 5000` credits the player profile by 5000 on resolution; outcome with `0` credits zero.
5. **Reward dispatch wiring.** Mock `applyRewardToProfile`. Assert `shuttle-buff`, `disable-giver`, `set-body-access` all hit it once per outcome.
6. **`offerWhenPrerequisites` combined gate.** Build a contract with `requiredCompletedContractId + triggerOnPlanetVisited`. Verify the offer fires only when both conditions are met, and that order doesn't matter.
7. **`'choice-mission'` step survives serialize → deserialize round trip via `contractStorage`.**
8. **Walkability smoke test.** Drive `jovian-society-prospection` end-to-end with synthetic events: 8 mission-completion notifications + 6 collect-drops + 8 more mission-completions (loose match because filters are stubbed) → choice resolution → `completed`. Assert the right inbox messages were enqueued and the resolved arm's rewards landed.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes (oxlint 0 errors, ESLint 0 errors / 0 warnings).
3. `bun run test:unit` passes including the 8 new tests above.
4. **Manual: walkable.** From a fresh save: complete `martian-marine-corps-cohort`, orbit Jupiter, accept the offered Jovian contract, drive 8 mission/collect events with anything that matches loosely, run `window.__contracts.resolveChoice('jovian_final_prospectus', 'transmit')` in dev console, see the transmit completion message arrive in the Society inbox, see the player profile gain `shuttleBuffs.jovianEmpowerment === 1.5`, see `mission-pay-multiplier` on Jupiter set to 2, see `bodyAccess.hektor === 'destroyed'` (or queued, if plan 1 hasn't landed).
5. **Manual: tamper arm.** Same flow with `'tamper'` instead — see the cohort-departure message, see `disabledGiverIds['jovian-society'] === true`, see `bodyAccess.hektor === 'liberated'`.
6. No regression on existing contracts (cinderline, marines, cowboys, USC, zeppelin) — they all complete normally.

---

## Open questions for the implementer

1. **Where does `JovianSocietyProspection` register in `CONTRACT_CATALOG`?** End of array is fine; order isn't load-bearing.
2. **Validator placement.** "Exactly one of legacy-triple-or-byOutcome present" check — likely a small assertion in `contractCatalog.ts` at module-load time, throwing on misconfigured contracts. Implementer's call where the validator lives.
3. **JSON edit phasing.** The plan's JSON edits could be split into a separate commit from the engine work. Up to the implementer; one commit is fine if the diff is clean.

---

## Forward references (later plans will need these)

- Plan 3: tighten the `complete-missions` matcher to honor `objectiveType` and `giverId`. Author Vance-voiced gather/mining missions in `jovian-society.json`.
- Plan 4: tighten the matcher to honor `pinnedAssetRef`. Mission generator routes asset-ref to a body id (e.g. `'hektor'`). Hektor's mission-callout slot fills with the active step's subject/CTA.
- Plan 5: tighten the matcher to honor `targetRegion`. Mission generator spawns Saturn co-orbital missions from the Jovian board.
- Plan 6: replace the `__contracts.resolveChoice` dev hook with the prospectus terminal canvas overlay. Routed by step's `minigameType: 'terminal-prospectus'`.
- Plan 7: real `shuttle-buff` math — `jovianEmpowerment: 1.5` applies a permanent multiplier to shuttle stats (scope tunable per GDD Q6). Real `disable-giver` enforcement at the mission-board level. Real body destruction visuals (debris field on first flyby, then absent).
