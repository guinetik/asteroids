# Act 1 — Inner System Journey

**Date:** 2026-04-22
**Author:** guinetik
**Status:** draft

## Goal

Wrap the three initial inner-system contracts (USC Venus, Space Cowboys Mars, MMC Turret Cohort) and the existing Consortium Certification mission into a single player-visible arc — "Act I: Inner System" — whose completion unlocks `gravitySurfing` and ends the demo.

Most of the machinery already exists. The Consortium Certification special mission, the `grid-coupling-module` inventory item, the install timer, and the `gravitySurfing` upgrade grant are all wired. What's missing is the *natural* path from "you just finished the three inner-system contracts" to "the USC ping comes in and the asteroid waypoint is live on your star map."

## Scope

This spec covers only the Act 1 journey and its climactic staging. It does **not** revise the three existing contract definitions, rewrite any Consortium mission content, or change the gravity-surfing gameplay itself.

## Player experience

1. Player completes the three inner-system contracts (any order). The existing welcome journey is already complete; HUD tracker is empty between welcome and Act 1.
2. The moment the third contract closes, two things happen silently as side-effects:
   - An inbox message from the USC appears (existing `consortium-certification-offer`).
   - The Consortium Certification special mission is staged as the active asteroid mission on the star map, with its authored waypoint `(worldX: 260, worldZ: 145)` already placed.
3. The HUD objective tracker now shows the Act 1 journey with four rows — the three contracts all ticked, the fourth row reading **"Install the USC Module"** and active.
4. Player reads the message, flies to the waypoint, lands, collects the sealed package, exfils to the shuttle. The Grid Coupling Module lands in inventory. Nothing new so far.
5. Player uses the module from the shuttle inventory. Existing install timer fires `gravitySurfing`, `shuttleHeatResistance`, and `shuttleFreezeResistance`.
6. At the moment `gravitySurfing` transitions from level 0 to level 1, the journey's step 4 ticks, the journey is marked complete, and Act 1 / demo ends.

Deliberately, step 4 triggers on the **upgrade install** (the ability becoming real), not on the mission completion — the crate sitting in the hold isn't the payoff, the grid coupler going live is.

## Journey definition

One new entry in `JOURNEY_DEFINITIONS` inside `src/lib/journeys.ts`:

```ts
{
  id: ACT_1_JOURNEY_ID,
  eyebrow: 'Act I',
  title: 'Inner System',
  objectiveLabel: 'Earn your manifold cert',
  unlocks: [],
  steps: [
    { id: 'usc-cert',     label: 'Complete USC Venus Certification', trigger: 'contract_completed:usc-venus-certification' },
    { id: 'cowboys-hq',   label: 'Complete Space Cowboys Mars HQ',   trigger: 'contract_completed:space-cowboys-mars-hq' },
    { id: 'mmc-cohort',   label: 'Complete MMC Turret Cohort',        trigger: 'contract_completed:martian-marine-corps-cohort' },
    { id: 'grid-coupling', label: 'Install the USC Module',           trigger: 'upgrade_installed:gravitySurfing' },
  ],
}
```

- `unlocks` is empty on purpose: `gravitySurfing` is the tangible reward and is granted by the existing consumable install path. No new abstract feature id is added to `JourneyFeatureId`.
- Step 4's label is intentionally non-spoilery — no mention of "gravity surfing" or "grid coupling" in HUD copy until the player installs the module.

## New journey triggers

`JourneyTriggerId` gains two template-literal variants, matching the existing `` message_archived:${string} `` pattern:

```ts
| `contract_completed:${string}`
| `upgrade_installed:${UpgradeId}`
```

`applyJourneyTrigger` needs no logic change — these are just new string shapes matched against authored step triggers.

### `contract_completed:<id>`

Emitted once per contract instance the moment its status transitions to `completed`. Fired from **both** the live completion path inside `ContractSystem` and the `replayCompletedRewards` path so a profile that reloads with already-completed contracts catches up on first boot.

A new optional hook is added to `ContractSystemHooks`:

```ts
onContractCompleted?: (contractId: string) => void
```

`src/lib/contracts/runtime.ts` exposes a listener set mirroring the existing `contractChangeListeners` / `contractShuttleUpgradeListeners` idiom:

```ts
export function onContractCompleted(listener: (contractId: string) => void): () => void
```

`MapViewController` subscribes and calls `this.notifyJourneyTrigger(` `` `contract_completed:${id}` `` `)`, then evaluates `maybeStageAct1Climax()` (see Staging).

### `upgrade_installed:<upgradeId>`

Emitted whenever a persisted upgrade level crosses `0 → ≥1`. This keeps the trigger generic for future journeys that care about arbitrary upgrade installs, not hard-coded to `gravitySurfing`.

Implementation: extend the upgrade-level persistence surface in `src/lib/upgrades.ts` with a listener set. Every callsite that mutates `CURRENT_PLAYER_UPGRADE_LEVELS` before `saveCurrentPlayerUpgradesToStorage` (notably `ensureUpgradeAtLeast` and the upgrade-purchase setter) compares the previous stored value with the new value; if the previous was 0 and the new is ≥1, the callsite fires `upgradeInstallListeners` with the upgrade id.

```ts
export function onUpgradeInstalled(listener: (upgradeId: UpgradeId) => void): () => void
```

`MapViewController` subscribes and calls `this.notifyJourneyTrigger(` `` `upgrade_installed:${id}` `` `)`.

This subscription covers every grant path: the consumable install (`useInventoryItem('grid-coupling-module')` → `installUpgradeFromConsumable` → `ensureUpgradeAtLeast`), contract `shuttle-upgrade` rewards (already route through `ensureUpgradeAtLeast`), the upgrade shop purchase path, and dev-console grants. One listener, all paths.

## Staging the Consortium climax

When the third of the three inner-system contracts transitions to `completed`, the game must materialize the USC message and the asteroid waypoint. This is a side-effect, not a journey-step operation — it makes the world state reflect the story beat, it doesn't tick anything.

**Location:** a private method on `MapViewController` called `maybeStageAct1Climax()`, invoked after `notifyJourneyTrigger` for any `contract_completed:*` trigger.

**Guard (derived state — no new profile field):**

1. All three of `usc-venus-certification`, `space-cowboys-mars-hq`, `martian-marine-corps-cohort` are in `completed` status on the contract snapshot.
2. `CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing < 1` (player does not already have the ability).
3. The Consortium special mission is neither already active nor already recorded complete in mission storage.

Only if all three hold does the staging body run.

**Body (shared with the existing dev console path):**

Extract the current `devStartConsortiumCertificationMessage` body into a named helper — e.g. `stageConsortiumCertification()` on `MapViewController` — that both `maybeStageAct1Climax` and `devStartConsortiumCertificationMessage` call. The helper:

1. Clones the special mission via `getSpecialMissionById('consortium-certification')` with `status: 'accepted'`.
2. Enqueues `consortium-certification-offer` via `this.messageFacade.enqueueById(...)`.
3. Replaces `this.missionBoard.activeAsteroidMission` with the cloned mission, clears any pending `offeredAsteroidMission`.
4. Calls `saveActiveMission(...)` and `this.onMissionBoardUpdate?.(...)`.

The dev-console variant stays for developer convenience but no longer holds its own copy of this logic.

**Idempotency guarantees:**

- Live path: the live `contract_completed` hook fires once per status transition, so `maybeStageAct1Climax` runs at most once per contract finishing. After a successful staging, condition 2 or condition 3 immediately becomes false for future invocations.
- Replay path: on app boot, the replay fires `contract_completed:<id>` for each already-completed contract. `maybeStageAct1Climax` runs after each one, but the guard conditions prevent re-staging (either `gravitySurfing ≥ 1` already or the mission is already active/completed). A profile that finished all three contracts in a prior version gets the climax staged on first reload after this spec ships — this is the intended self-heal behavior.
- Edge case: player completes all three contracts, the mission stages, player declines / ignores the mission, uninstalls the accepted mission somehow, reloads. The guard (`gravitySurfing` still 0, mission no longer active, mission not recorded complete) would re-stage on reload — which is the right behavior, not a bug.

## Journey self-heal on reload

`MapViewController` boot already retro-fires events into the welcome journey (archived messages etc.) via profile state inspection. Extend that pass so existing profiles catch up on Act 1:

- Iterate every contract instance in `contractSystem.getSnapshot().instances`. For each with `status === 'completed'`, call `notifyJourneyTrigger(` `` `contract_completed:${id}` `` `)`. (Can also be handled entirely by the contract `replayCompletedRewards` path emitting the new hook — preferred, since it keeps the self-heal concern inside the contract subsystem.)
- If `CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing ≥ 1`, call `notifyJourneyTrigger('upgrade_installed:gravitySurfing')`.
- Call `maybeStageAct1Climax()` once after the replay pass settles, so a profile that already finished the three contracts in a prior build picks up the USC ping on first load.

`applyJourneyTrigger` is already idempotent per-step, so re-firing triggers the journey has already recorded is a no-op.

## Boundary choices

- **No 4th contract.** The USC ping is a plain inbox message. Contracts are reserved for accept/decline arcs; this is an auto-staged climax, not a contract to sign.
- **No new message content.** `consortium-certification-offer` already reads as a USC dispatch and is the right copy for this moment.
- **Step 4 label says "USC Module", not "Grid Coupling Module" or "Gravity Surfing".** The twist — that the cert is a ride on the spacetime fabric — is revealed by the Jay post-install message, not pre-spoiled in the HUD tracker.
- **Empty `unlocks: []`.** The `JourneyFeatureId` abstraction exists for unlock gates that don't map to an upgrade id. `gravitySurfing` *is* an upgrade id; granting it via the existing consumable install is the unlock. Adding a parallel `JourneyFeatureId` for it would duplicate state.
- **Derived-state staging guard rather than a persisted `act1ClimaxStaged` flag.** Avoids a new profile field. The cost is one extra lookup per contract-complete trigger, which is negligible.

## Testing

Pure-domain tests are added alongside the existing `src/lib/__tests__/journeys.spec.ts`:

- Act 1 journey walks through the 4 triggers in mixed order and completes on the final `upgrade_installed:gravitySurfing`.
- Act 1 journey rejects spurious triggers (e.g. `upgrade_installed:shuttleHull` doesn't tick step 4; `contract_completed:some-unknown-id` doesn't tick anything).
- Firing the same trigger twice is a no-op (idempotency).

In `src/lib/contracts/__tests__/ContractSystem.spec.ts`:

- `onContractCompleted` fires exactly once per live status transition.
- `onContractCompleted` fires during `replayCompletedRewards` for each already-completed contract.

In `src/lib/__tests__/upgrades.spec.ts` (new describe block):

- `onUpgradeInstalled` fires when a level transitions from 0 to 1.
- `onUpgradeInstalled` does **not** fire on a 1 → 2 transition (it's an install event, not a tier event).
- `onUpgradeInstalled` does **not** fire on a re-save at the same level.

`maybeStageAct1Climax` itself is not unit-tested directly — it lives in `MapViewController`, which sits outside the pure-domain test surface defined in `CLAUDE.md`. If the staging helper is extracted to `src/lib/` (e.g. a pure function that returns the next `missionBoard` + a message-enqueue instruction), a small unit test around the guard logic would be valuable but is not a blocker for this spec.

## Not in scope

- Revising `consortium-certification-offer` copy or the Consortium mission layout.
- Changing the gravity-surfing gameplay or Space Fabric UI.
- Adding an Act 2 journey or any post-demo content.
- Tuning any of the three inner-system contracts.
- New dev-console commands. The existing `grantGravitySurfing` and `devStartConsortiumCertificationMessage` stay as-is (the latter is refactored to share the staging body, but externally unchanged).
