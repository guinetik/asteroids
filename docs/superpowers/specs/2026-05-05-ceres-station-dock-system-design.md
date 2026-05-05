# Ceres Station Dock System & Contract Rewrite — Design Spec

**Date:** 2026-05-05
**Author:** guinetik (with assistant)
**Supersedes:** `docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md` (the 7-step shape, the `ceres-research-station` PinnedBody, and the `visit-planet` step on Step 2). Earlier work on the requiredUpgrades gate, the giver, the special missions, the chimera variant, the achievements, and the bunker step are kept.

---

## 1. Goal

Replace the broken Step 2 `visit-planet ceres-research-station` with a real dock interaction, and restructure the contract into a 10-step shape that gives the gravity-surfing + orbital-surfing prerequisite an actual gameplay reason to exist (long round-trips to a Kuiper-belt station). Build a generic dock subsystem reusable by future contracts.

## 2. Why the previous design failed

`ceres-research-station` was added as a `PinnedBody` in `planetarium.json`. Three independent reasons it cannot satisfy a `visit-planet` step in the live game:

1. `MapView.notifyContractPlanetVisitedByName` does `PLANETS.find(p => p.name === bodyName)`. Pinned bodies live in a separate `PINNED_BODIES` array (`catalog.ts:198-204`). The station never reaches `notifyPlanetVisited`.
2. `runtime.hasOrbitedPlanetForContracts` reads `profile.orbitedSolarBodies[planetId]`. Only PLANETS get persisted there.
3. Even if both wires above were fixed, the orbit detector picks the dominant body by mass/proximity — a station at mass `1e-14` next to Ceres at full planetary mass will never become `nearestBodyName`.

The fix is not "extend `visit-planet` to pinned bodies." The fix is to stop pretending the station is a celestial body. It's a pinned, mission-spawned object with a dock interaction — the same pattern the codebase already uses for asteroid mission targets and EVA satellites, just with a different verb on approach.

## 3. Player-facing experience

While the Ceres Institute contract is active, a station model (`public/models/station.glb`) is visible in the Kuiper belt at a deterministic position. Approaching it in the shuttle triggers an F-prompt — `[F] DOCK · CERES INSTITUTE STATION`. Pressing F opens a small panel:

- **Panel header:** "CERES INSTITUTE STATION · DOCK"
- **Body:** flavor text from the active step.
- **Action button:** context-sensitive based on the active contract step:
  - Step 2: `TAKE PACKAGE` (PICKUP verb) → grants the canister into inventory, advances step.
  - Step 6: `HAND OVER MINERAL CRATE` (DELIVER verb) → consumes mineral results crate from inventory, advances step.
  - Step 8: `HAND OVER DAN CRATE` (DELIVER verb) → consumes DAN results crate from inventory, advances step.
  - Any other state (no matching active step / inventory mismatch): no action button, just dialogue text and a CLOSE button. This is the "tour" / non-interactive case.
- **CLOSE** dismisses without effect.

The station despawns when the contract reaches a terminal state (completed via either outcome, or sabotaged/abandoned).

## 4. Final 10-step contract shape

| # | Kind | Action | Where | Item I/O |
|---|------|--------|-------|----------|
| 1 | `complete-missions` (shuttle) | Earth standards run (existing) | Earth pickup → Ceres deliver | none |
| 2 | **`pickup-from-asset`** | Take canister from station | Station (pinned) | +1 `ceres-institute-canister` |
| 3 | `deliver-items` | Drop canister at Ceres surface | Ceres | −1 `ceres-institute-canister` |
| 4 | `complete-missions` | Rescue 1 (existing) | Asteroid | none (Institute extracts off-screen) |
| 5 | `complete-missions` | Mineral analysis (existing, **augmented** to drop crate on completion) | Asteroid | +1 `ceres-mineral-results-crate` on completion |
| 6 | **`deliver-to-asset`** | Hand mineral crate at station | Station (pinned) | −1 `ceres-mineral-results-crate` |
| 7 | `complete-missions` | DAN survey (existing, **augmented** to drop crate on completion) | Asteroid | +1 `ceres-dan-results-crate` on completion |
| 8 | **`deliver-to-asset`** | Hand DAN crate at station | Station (pinned) | −1 `ceres-dan-results-crate` |
| 9 | `complete-missions` | Rescue 2 (existing) | Asteroid | none |
| 10 | `choice-mission` (existing) | Bunker terminal — TRANSMIT or SABOTAGE | Kuiper Site CIB-7 (pinned) | none |

The chain is now structurally a courier loop with embedded research arcs: pickup → out-to-Ceres → asteroid → station → asteroid → station → asteroid → bunker. Every station leg is a long round-trip from wherever the player is, and both gravity surfing and orbital surfing earn their prerequisite weight.

## 5. Architecture

### 5.1 Subsystems being added

1. **PinnedStationController (`src/three/`)** — renders `station.glb` at a deterministic Kuiper position; tracks model load + dispose; exposes a worldPosition getter for the proximity loop.
2. **PinnedAssetWorldRegistry (`src/views/MapViewController.ts`)** — central place where the controller learns "this contract has these pinned assets active right now" and decides what geometry to spawn / despawn. Driven by ContractSystem state.
3. **DockProximityWatcher (`src/views/MapViewController.ts`)** — sibling to `tryBeginAsteroidMission`. Each tick: if the shuttle is within `DOCK_PROXIMITY_M` of an active pinned station and the beginMission action fires, emit `onRequestDock(assetRef)`.
4. **DockPanel.vue (`src/components/`)** — Vue panel that opens on dock request, reads the active contract step, exposes the action button, and routes the click to ContractSystem.
5. **ContractSystem step kinds** — `pickup-from-asset` and `deliver-to-asset`. Both carry `{ assetRef, itemId, count }`. Both routed through new ContractSystem hooks: `grantItemsOnPickup` and `consumeItemsForDelivery` (the latter exists; the former is new).
6. **Mission-completion item drops** — special missions gain an optional `grantsItemOnComplete: { itemId, count }` field. When the mission succeeds, the host hooks add the item to the player's inventory. Mineral and DAN special missions use it.
7. **New inventory items** — `ceres-institute-canister` (1 kg, "Sealed Ampoule Case"), `ceres-mineral-results-crate` (1 kg, "Sealed Sample Crate · Mineral Survey"), `ceres-dan-results-crate` (1 kg, "Sealed Sample Crate · DAN").

### 5.2 What we keep from the previous implementation

- `Contract.offerWhenPrerequisites.requiredUpgrades` gate (works correctly).
- The Ceres Institute giver JSON.
- Special missions: `ceres-institute-earth-supplies`, `ceres-institute-rescue-1`, `ceres-institute-rescue-2`, `ceres-institute-mineral-analysis`, `ceres-institute-dan`, `ceres-institute-archive-bunker`.
- The `astronaut-chimera` enemy variant in the bunker.
- All five achievements; the rule kinds (`specific_contract_accepted`, `specific_contract_step_completed`, `specific_contract_completed` with `requiredOutcomeId`).
- The choice-mission outcome rewards (transmit/sabotage), `homePlanet: 'ceres'` fast-travel, the `disable-giver` reward on sabotage.
- Porter's voice and the body-horror seeding in flavor copy.

### 5.3 What we rip out

- The `ceres-research-station` entry from `planetarium.json` `pinnedBodies`.
- The Step 2 `visit-planet` step in the contract JSON.
- Any references to `ceres-research-station` as a planet id in tests, achievements rules, or controller code.

The new station is a `pinnedAssets` entry on the contract with `kind: 'station'`, not a planetarium body.

## 6. Schema additions

### 6.1 Contract `pinnedAssets[]` entry — add `kind`

```ts
type PinnedAsset =
  | { assetRef: string; kind?: 'asteroid'; region: AsteroidRegion; label?: string }
  | { assetRef: string; kind: 'station'; region: AsteroidRegion; label?: string; modelPath: string; positionSeed: string }
```

`positionSeed` is a stable string the spawner hashes to a deterministic Kuiper-belt position. `modelPath` is the asset path under `public/models/`.

### 6.2 New step kinds

```ts
interface PickupFromAssetStep {
  kind: 'pickup-from-asset'
  assetRef: string
  itemId: string
  count: number
  creditsReward?: number
  subject: string
  flavor: string[]
}

interface DeliverToAssetStep {
  kind: 'deliver-to-asset'
  assetRef: string
  itemId: string
  count: number
  creditsReward?: number
  subject: string
  flavor: string[]
}
```

`pickup-from-asset` advances when the dock UI emits a confirm event for a step whose `assetRef` matches the docked asset; the engine calls `grantItemsForPickup(itemId, count)` (new hook). `deliver-to-asset` advances when the dock UI emits a confirm event AND the engine's `consumeItemsForDelivery(itemId, count)` (existing hook) returns true. If the player presses the action button without the required item, the panel shows a soft refusal: "You aren't carrying that." Step does not advance.

### 6.3 Special mission completion side-effects

`SpecialMissionDefinition` gains:

```ts
grantsItemOnComplete?: { itemId: string; count: number; replenishWhileStepOpen?: boolean }
```

The mission-success pipeline in `src/lib/missions/` reads this and hands it to a host hook (`addItemsToInventory(itemId, count)`) at completion. Mineral and DAN special missions populate this field with `replenishWhileStepOpen: true`.

When `replenishWhileStepOpen` is `true`, the special mission stays available for re-run as long as its paired `deliver-to-asset` contract step is still active and the player does not currently hold `count` of `itemId`. This handles the death/cargo-loss case: a player who dies after mineral analysis but before docking has lost the crate; they can re-fly the mineral mission and the completion grants the crate again. Once the deliver step advances, the mission stops re-granting (and the special mission may close out per its existing one-shot semantics).

The check is: at mission completion, if `replenishWhileStepOpen` and the player already has `>= count` of `itemId` in inventory, skip the grant (silent no-op — no duplicate items). Otherwise grant.

### 6.4 Inventory items

Three new entries in `src/data/inventory/items.json`:

```json
{
  "id": "ceres-institute-canister",
  "category": "consumable",
  "label": "Sealed Ampoule Case",
  "description": "Biostable case from the Ceres Institute. Outer shell sealed; do not handle inner cassettes without equipment you do not have.",
  "icon": "ceres-canister.png",
  "weightPerUnit": 1.0,
  "maxStack": 1
},
{
  "id": "ceres-mineral-results-crate",
  "category": "consumable",
  "label": "Sealed Sample Crate · Mineral Survey",
  "description": "Hand-readable crate of substrate cores and DAN-cross-referenced mineral readings, sealed for return to the Institute.",
  "icon": "ceres-mineral-crate.png",
  "weightPerUnit": 1.0,
  "maxStack": 1
},
{
  "id": "ceres-dan-results-crate",
  "category": "consumable",
  "label": "Sealed Sample Crate · DAN",
  "description": "Particle capture cassettes and field-stamped DAN albedo logs, sealed for return to the Institute.",
  "icon": "ceres-dan-crate.png",
  "weightPerUnit": 1.0,
  "maxStack": 1
}
```

Icons may stub to existing crate art if no bespoke art is ready. Categories follow existing inventory patterns; treat them like quest-only items that stop being craftable.

## 7. Data flow

### 7.1 Spawn / despawn lifecycle

- On contract acceptance: ContractSystem fires `onPinnedAssetActivated({ assetRef, kind, modelPath, region, positionSeed })`. MapViewController listens and tells PinnedAssetWorldRegistry to spawn `station.glb`.
- On contract terminal state (any completion, sabotage, abandon): ContractSystem fires `onPinnedAssetDeactivated({ assetRef })`. Registry disposes the controller.
- The bunker (`ceres-archive-site`) keeps its existing kind (effectively `'asteroid'` / pinned-mission); only the new station entry uses `kind: 'station'`.

### 7.2 Dock interaction tick

```
MapViewController.tick:
  ...existing mission proximity...
  for each active station-kind pinned asset:
    if shuttlePosition within DOCK_PROXIMITY_M of asset.position:
      show F-prompt (label = asset.label)
      if beginMissionPressed:
        openDockPanel(asset.assetRef)
```

### 7.3 Dock confirm

```
DockPanel onConfirm:
  step = contractSystem.getActiveStepForAsset(assetRef)
  switch step.kind:
    case 'pickup-from-asset':
      contractSystem.confirmPickupFromAsset(contractId, assetRef)
        → engine calls hooks.grantItemsForPickup(itemId, count)
        → engine advances step
    case 'deliver-to-asset':
      contractSystem.confirmDeliverToAsset(contractId, assetRef)
        → engine calls hooks.consumeItemsForDelivery(itemId, count)
        → if true, engine advances step
        → if false, panel shows refusal
    default:
      no-op (panel was opened during a step that doesn't need station — close-only mode)
```

## 8. Voice / content guidance

The contract content is rewritten in this spec's wake. Porter's voice (clinical, fussy academic, em-dashes, "young pilot", signs "— Porter", Saturnine endowment thread, no observed death state) stays. New beats per step:

- **Step 1:** unchanged from current copy.
- **Step 2:** First time at the station. Welcome flavor + introduce the canister with deliberately over-clinical specificity. ("Biostable case, outer shell sealed, do not handle the inner cassettes without the appropriate equipment which you do not have.") Foreshadow the clinical wing on Ceres surface.
- **Step 3:** Drop at the clinical wing groundside. Porter calmly notes the Ceres surface lab handles "the recovery cases." Plants the body-horror seed without spelling it out.
- **Step 4:** Rescue 1 — current Step 3 voice (resonance trap, host has gone quiet first, collect psychosphere). Mention the Institute's pickup ship will rendezvous at Ceres orbit.
- **Step 5:** Mineral analysis — current Step 4 voice (rare-earth substrate as colony soil) + a new line that the readings spool into a sealed crate "for the station's archive."
- **Step 6:** Hand the crate over at the station. Brief Porter beat about cross-referencing the readings against the lab's running model.
- **Step 7:** DAN survey — current Step 5 voice (cross-talk is the colony answering, your thruster is shouting in their language) + readings spool into the second crate.
- **Step 8:** Hand the DAN crate over at the station. Reveal-prep beat — "the assays are converging."
- **Step 9:** Rescue 2 — current Step 6 voice (red pylons are extraction columns, the things you shoot are limbs, you have been pruning).
- **Step 10:** Bunker — current Step 7 voice unchanged.

Offer messages: existing five become eight (steps 2, 3, 4, 5, 6, 7, 8, 9 each get an offer-message; bunker step 10 keeps its current one). Each new offer-message gets a folder entry and priority slot mirroring the existing pattern.

## 9. Testing strategy

### 9.1 Unit tests (`src/lib/contracts/__tests__/`)

- `pickup-from-asset` step: dispatched event with matching assetRef → hook called → step advances. Non-matching assetRef → no advance.
- `deliver-to-asset` step: hook returns true → step advances; hook returns false (no item) → step does not advance.
- Contract walkthrough test: 10 steps in order, item ids match, credits sum matches, transmit and sabotage outcomes intact.
- Pinned-asset activation lifecycle: accepting fires `onPinnedAssetActivated` for both station and bunker; reaching terminal state fires `onPinnedAssetDeactivated` for both.

### 9.2 Mission tests (`src/lib/missions/__tests__/`)

- Mineral special mission completion with `grantsItemOnComplete: { itemId: 'ceres-mineral-results-crate', count: 1, replenishWhileStepOpen: true }` calls `addItemsToInventory` exactly once with that payload when the player has zero crates.
- Same mineral mission re-completed while the deliver step is still open and the crate has been lost: completion calls `addItemsToInventory` again (re-grant).
- Same mineral mission re-completed while the player still holds the crate: completion does NOT call `addItemsToInventory` (no duplicate).
- Same mineral mission re-completed AFTER the deliver step has advanced: completion does NOT call `addItemsToInventory` (chain has moved on).
- DAN equivalents for all four cases.
- Dock panel canister re-grant: Step 3 active, player holds zero canisters → dock action re-offers `TAKE PACKAGE`. Step 3 active, player holds one canister → dock is close-only. Step 3 has advanced (chain at Step 4+) → dock is close-only regardless of inventory.

### 9.3 Integration / smoke (manual)

The /map smoke punch list from the previous spec is retired and replaced:

1. Accept the contract. Station model appears in the Kuiper belt at a deterministic position. Bunker site is also pinned (existing).
2. Shuttle proximity to the station fires the F-prompt at `DOCK_PROXIMITY_M`.
3. Step 2: dock panel opens with `TAKE PACKAGE`. Confirm grants canister, closes panel, step advances.
4. Step 3: drop at Ceres (existing deliver-items flow).
5. Steps 4, 5, 7, 9: complete asteroid missions. Mineral + DAN drop crates into inventory; rescues do not.
6. Steps 6, 8: dock at station, deliver respective crate. Refusal text shows correctly if the player docks without the crate.
7. Step 10: bunker terminal flow as today (TRANSMIT vs SABOTAGE).
8. On contract completion (either outcome): station model despawns. Bunker site despawns.
9. Save/reload mid-chain at each gating step. Pinned station persists. Inventory persists. Step does not regress.
10. Achievement toasts fire correctly per arm.

## 10. Out of scope

- Reusing the dock subsystem for other contracts beyond Ceres. The schema and code are written generically, but no other contract uses it in this spec.
- Multi-station support per contract. Schema permits it (`pinnedAssets` is an array), but the dock panel is keyed off the assetRef under the cursor — fine for one station.
- Cargo capacity gating. The crates are 1 kg each; assume the player's cargo bay can hold them.
- Animated docking visuals (cinematic approach, airlock pressurization). The interaction is "F to dock → panel opens" with a dialogue payload. No camera trickery.
- Selling the crates anywhere else, or the canister having any handler other than the Ceres surface drop. The items are quest-only.

## 11. Decisions made (no open questions)

- 10 steps, not 7 or 8. Confirmed with user.
- Rescue missions do **not** drop deliverables — Institute extracts off-screen. Mineral and DAN **do** drop crates.
- The canister (Step 2 → Step 3) is foreshadowing for the clinical wing on Ceres surface, not a red herring.
- Step 1 (Earth shuttle → Ceres) stays as-is; no station involvement.
- The station's role ends at Step 8; Step 10's archive is composed at the bunker terminal, no station pickup needed.
- Both PICKUP and DELIVER verbs in the dock UI from the start (full panel, not single-action). The chain uses both, so building the lesser version is wasted work.
- `ceres-research-station` is removed from `planetarium.json`. It is not a body.
- The bunker step 10 stays exactly as designed in the previous spec — no rewrite, no archive pickup at station, no new item.
- **Crate softlock prevention.** Mineral analysis and DAN special missions re-grant their crate on every successful completion as long as the paired `deliver-to-asset` step is still active and the player does not currently hold the crate. Death (which resets shuttle cargo) is a real failure mode and the crate is not allowed to be permanently lost. Mechanically: `replenishWhileStepOpen: true` on `grantsItemOnComplete`, with a "skip if already held" check at completion to avoid duplication. The deliver step closes the loop; once advanced, the mission no longer re-grants.
- **Canister softlock prevention.** Symmetric rule for Step 2 → Step 3. While Step 3 (`deliver-items` to Ceres) is active and the player does not currently hold `ceres-institute-canister`, re-docking at the station re-offers the `TAKE PACKAGE` action. Once Step 3 advances, the dock no longer re-grants. Implementation lives on the dock panel's step-resolution logic, not on a new schema field — the dock looks at the active step OR the most recent advanced `pickup-from-asset` step whose paired consumer is still open and the player is short the item.
- **Step 1 needs no special handling.** `complete-missions { missionType: 'shuttle', giverPlanetId: 'ceres' }` accepts any qualifying shuttle mission from the Ceres giver. A player who dies mid-Earth-run can pick up the special again from the kiosk, or pick a different qualifying shuttle mission. Existing `complete-missions` semantics handle this; no rule needed.

## 12. Migration

Single PR / branch shape (subsystem + content rewrite together — they're not independently shippable):

1. Rip `ceres-research-station` out of `planetarium.json` and any test fixtures referencing it.
2. Add the schema additions (PinnedAsset.kind, two new step kinds, special mission `grantsItemOnComplete`, three inventory items, one new ContractSystem hook).
3. Build PinnedStationController + the registry + the proximity watcher + the dock panel.
4. Wire the new step kinds through ContractSystem with full unit-test coverage.
5. Augment mineral and DAN special missions with `grantsItemOnComplete`.
6. Rewrite `ceres-institute-eternal-biology.json` to the 10-step shape with the new voice.
7. Add three new offer-message templates for steps 6 and 8 (and any missing ones for 2/3); update the `SPECIAL_MISSION_OFFER_IDS` map.
8. Confirm the existing five achievements still resolve (rule references step IDs; renumber if needed).
9. Manual smoke per §9.3.

The previous plan's Task 16 punch list is retired and replaced by §9.3.
