# Contract Special Missions — Hektor + Saturn Auto-Activation

_Plan 4 of the Jovian Society Prospection contract rollout. Absorbs original plan 5 (Saturn region routing)._

---

## Revision note (2026-04-29)

This spec was rewritten to adopt the `SPECIAL_MISSIONS` precedent (`consortium-certification.json`) for contract-driven missions, replacing the original "orbit Hektor → mission-callout → I" UI pattern.

**What changed from the original plan 4:**
- Mission-callout slot (anchored mid-right when orbiting Hektor) is gone. Standard active-mission UI handles surfacing the contract waypoint.
- Mission acceptance no longer requires the player to physically orbit Hektor. When the contract step activates, the runtime auto-enqueues the offer message AND auto-activates the special mission (consortium pattern). Waypoint appears on the map immediately.
- Hektor reveals itself the moment Step 4 activates — `revealsBody: 'hektor'` flips `bodyAccess['hektor']` to `'unrestricted'`. Plan 1 has been revised so Hektor is not always rendered; this is the trigger that puts it on the map.
- Plan 5 (Saturn region routing) is folded in. Both Hektor and Saturn legs of the contract use special missions in plan 4. The Saturn legs use a fictional named co-orbital body (`asset-2306-s`) authored alongside Hektor.

---

## Premise

Plans 1-3 establish: Hektor data exists but is hidden by default, contract schema parses, the Society giver pool offers generic Vance work. What's still missing is the **contract's contextualized work** — the hand-authored, narrative-aware missions that drive the prospection arc forward.

This plan ships those missions as `SPECIAL_MISSIONS` entries. When a contract step with a `specialMissionId` becomes active, the runtime mirrors the consortium pattern: enqueue the offer message into the contract's inbox folder, activate the mission so the waypoint pops up on the map, set the active mission state so `/level` boots correctly when the player flies in. The player doesn't need to "find" the mission — Vance sends it, and a moment later it's their next assignment.

For Hektor the body itself is part of the reveal. Step 4's activation also flips `bodyAccess['hektor']` to `'unrestricted'`, so the rock appears on the map at the same moment the mission posts. The player flies out to Jupiter's L4 cluster — somewhere they had no reason to go before — and finds a body the Society wants their attention on.

For Saturn there's no pinned-body mechanic — the contract just routes the player to a fictional co-orbital body authored as a one-off named asteroid. After the contract resolves the body persists in the catalog, available as flavor for Act 3 follow-ups.

---

## Scope

**In scope**

1. **Author 4 special missions** in `src/data/contracts/missions/jovian-society-prospection/`:
   - `hektor-photometry.json` (Step 4)
   - `hektor-dan.json` (Step 7)
   - `saturn-photometry.json` (Step 5)
   - `saturn-dan.json` (Step 8)
   Each is a pre-baked `GeneratedAsteroidMission` (consortium shape), Vance-voiced, hand-tuned objective parameters, fixed reward.
2. **Author 2 named asteroid bodies:**
   - `src/data/asteroids/hektor.json` — full asteroid profile for `/level` (D-type Trojan, dark, contact-binary shape, low gravity, deep cold).
   - `src/data/asteroids/asset-2306-s.json` — fictional Saturn co-orbital, ~12 km dark body in `saturn-trojans` region. Society ledger naming. Reuses an existing dark-asteroid GLB or generates procedurally.
3. **Register** all 4 special missions in `SPECIAL_MISSIONS` (or a sibling `CONTRACT_SPECIAL_MISSIONS` array). Register both asteroid bodies in `ASTEROID_CATALOG`. Register one `mailbox` offer message per special mission.
4. **Auto-activation runtime hook** in `ContractSystem`. When a step with `specialMissionId` activates (transitions from pending to current):
   - Enqueue the offer message via `messageFacade.enqueueById`.
   - Activate the special mission via the existing path that consortium-certification uses.
   - If `revealsBody` is set, call `setBodyAccess(profile, step.revealsBody, 'unrestricted')`.
5. **Matcher tightening.** `matchesMissionEvent` honors `pinnedAssetRef`, `targetRegion`, AND `specialMissionId`. The completion event for a special mission carries `specialMissionId`, `pinnedAssetRef` (when applicable), and `region`.
6. **Mission completion plumbing.** When the player completes a special mission, the completion event is emitted with all three fields populated. `MissionCompletedEvent` gains the optional fields if they aren't there from plan 2.
7. **Adapt the contract JSON.** Edit `jovian-society-prospection.json` so steps 4, 5, 7, 8 each carry a `specialMissionId`. Step 4 also carries `revealsBody: 'hektor'`. Steps 5 and 8 do not need `revealsBody` (no body to reveal — Saturn co-orbital is just a target asteroid, not a pinned body in the planet-rendering sense).
8. **Tests** for matcher tightening, auto-activation, body reveal trigger, and the seed-stable terrain check from the original plan 4.

**Out of scope**

- Step 9 prospectus terminal — special mission has a unique kind (terminal interaction, not asteroid scan). Plan 6 owns that.
- Movement 1 (Steps 1, 2) — these stay generic-pool work per plan 3 (or migrate to special missions in this plan if the implementer decides — see *Optional: Steps 1 + 2 as special missions*).
- Outcome side effects (plan 7).

---

## Player flow (after this plan ships)

1. Player completes the Marines contract, orbits Jupiter for the first time, accepts the Jovian Society contract via the offer in their inbox. Plan 2's auto-walk drives them through Steps 1, 2, 3 with generic-pool work + psychosphere collection (plans 2, 3).
2. **Step 4 activates.** Inbox shows the OP-4 message ("Calibration unit registers green. You're cleared for photometry tasking…"). Simultaneously, an offer message arrives for the special mission `jovian-prospection-hektor-photometry`. The mission auto-activates — waypoint appears on the map.
3. **Hektor appears on the map.** L4 of Jupiter's orbit. Dark D-type, smaller than Ceres. The player has never seen this body before. The waypoint points right at it.
4. Player flies to Hektor. Approaches, orbits. No kiosks (Hektor has `noKiosks: true` from plan 1). The standard active-mission HUD shows the photometry assignment. Player lands, performs the photometry, /level returns them to the map. Step 4 closes.
5. **Step 5 activates.** Inbox shows OP-5 (Saturn travel-premium framing). Special mission `jovian-prospection-saturn-photometry` auto-activates. Waypoint points at `asset-2306-s` in saturn-trojans region.
6. Player flies the long haul out to Saturn co-orbitals, completes the photometry on Asset 2306-S, returns. Step 5 closes. Step 6 (psychosphere ×8) activates per plan 2.
7. After Step 6, **Step 7 activates.** Inbox: OP-7 ("DAN instrument is shipped and registered… you'll find the body familiar"). Special mission `jovian-prospection-hektor-dan` auto-activates with waypoint on Hektor (still visible). Player flies back, lands, does DAN, returns.
8. **Step 8 activates.** Inbox: OP-8 (sensor cross-talk reframing). Saturn DAN special mission auto-activates with waypoint on `asset-2306-s`. Player flies, completes, returns.
9. **Step 9 activates** (plan 6 owns the special-mission shape for the terminal — this plan's auto-activation hook applies; the prospectus minigame logic is plan 6).

---

## Special mission authoring

Each entry follows the consortium-certification shape: a pre-baked `GeneratedAsteroidMission` with fixed `asteroidId`, `giverId`, `giverName`, objectives, waypoint, and reward.

### `hektor-photometry.json`

```jsonc
{
  "kind": "special",
  "id": "jovian-prospection-hektor-photometry",
  "asteroidId": "hektor",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-hektor-photometry",
  "name": "OP 4 — Photometric Assessment, Asset 2306-J",
  "briefing": "Pilot, calibration unit registers green. You're cleared for photometry tasking. First assignment: a candidate body in the Jovian Trojans, currently flagged 'preliminary review' in our portfolio. We're calling it Asset 2306-J for ledger purposes. Single photometric pass, standard deliverable. The Society values clean telemetry; please prioritize signal quality over speed. — Vance",
  "difficulty": 5,
  "region": "jovian-trojans",
  "objectives": [
    {
      "type": "photometry",
      "x": 0,
      "z": 0,
      "scanHoldSeconds": 8,
      "probeDistance": 2700,
      "timeLimit": 240,
      "reward": 4500
    }
  ],
  "totalReward": 4500,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

The waypoint coordinates are placeholders — the runtime maps the asteroid id to the body's actual position at activation time. (Verify this against the consortium-certification flow; if waypoints are pre-baked the implementer adjusts.)

### `hektor-dan.json`

Same shape, `objectives[0].type === 'dan'`, briefing matches OP-7's authored flavor. Difficulty ~6, scan duration ~70s, required hits ~28, particle/enemy tier `medium`. Reward ~6000.

### `saturn-photometry.json`

`asteroidId: 'asset-2306-s'`. Briefing matches OP-5 (travel premium). Difficulty 6 (a notch up from Hektor's photometry per the contract progression). Reward higher to bake in the travel premium (~6000).

### `saturn-dan.json`

`asteroidId: 'asset-2306-s'`. Briefing matches OP-8 (cross-talk reframing). Difficulty 8. Reward ~7500.

All four reference `giverId: 'jovian-society'` for matcher purposes.

---

## Asteroid catalog authoring

### `hektor.json`

Per the asteroid catalog schema (eros, vesta, bennu reference). Real-world Hektor data:

- **id**: `"hektor"`
- **name**: `"Hektor"`
- **designation**: `"624 Hektor"`
- **type**: `"Dark D-type Trojan"`
- **biome**: pick darkest existing biome; if none fit, a new `"trojan"` biome is reasonable but adds tile-set work
- **composition** (sums to 100):
  - Carbonaceous Chondrite ~38
  - Organic Macromolecules ~22
  - Hydrated Silicates ~18
  - Water Ice (subsurface) ~14
  - Magnetite ~5
  - Iron-Nickel ~3
- **shape**: contact binary, ~370×195×195 km. Match Eros's scale convention (`[34400, 11200, 11200]` for ~34×11×11 km) → Hektor at `[37000, 19500, 19500]`. `elongation: 1.9, lobeCount: 2, irregularity: 0.65`.
- **surface**: `modelPath: "/models/hektor.glb"`. High `craterDensity` (heavily cratered ancient body), moderate `boulderDensity`.
- **visual**: D-types are extraordinarily dark. `albedo: 0.025, baseColor: [0.18, 0.16, 0.14]`.
- **physical**: `mass: 7.9e18, density: 1.0, surfaceGravity: 0.018, rotationPeriod: 6.92, surfaceTemperature: 125`.
- **lighting**: dim cold sun. Lower `sunIntensity ~1.1`, cooler `sunColor ~[0.95, 0.96, 1.0]`, low `ambientIntensity ~0.7`.

### `asset-2306-s.json`

Fictional Saturn co-orbital. ~12 km dark body. Real-world there are no confirmed Saturn Trojans, so this is invented for the contract:

- **id**: `"asset-2306-s"`
- **name**: `"Asset 2306-S"`
- **designation**: `"Asset 2306-S"` (Society ledger naming, no IAU number — fictional)
- **type**: `"Dark Outer-System Trojan"`
- **biome**: same dark biome as Hektor (or fall back to whatever existing dark biome fits cleanest)
- **composition**: D-type analogue, similar to Hektor's mix but tunable to imply this is a *peer* body for comparison
- **shape**: small irregular blob, ~12 km mean diameter. Implementer scales to engine convention. Single lobe, moderate irregularity.
- **surface**: pick an existing GLB the implementer is happy reusing — `bennu.glb` or `itokawa.glb` would read fine. New model authoring is not required.
- **visual**: dark, `albedo ~0.04`, similar palette to Hektor but slightly bluer-grey to suggest "peer body, different evolution."
- **physical**: tiny gravity, deep cold (~110 K — even colder than Hektor since Saturn's farther from the sun).
- **lighting**: like Hektor's but dimmer.

Both bodies must pass `validateAsteroid` (composition sums to 100). Both register in `ASTEROID_CATALOG`.

---

## Engine work

### 1. `MissionCompletedEvent` filter fields

Plan 2 added `objectiveType?` and `region?` and `pinnedAssetRef?` as optional. Plan 4 ensures every emission site populates them when they apply. Add `specialMissionId?: string` to the event shape if not already there from plan 2:

```ts
export interface MissionCompletedEvent {
  kind: ContractMissionType
  giverPlanetId: string | null
  giverId: string | null
  targetPlanetId: string | null
  // Filter fields:
  objectiveType?: string
  region?: string
  pinnedAssetRef?: string
  specialMissionId?: string
}
```

### 2. `matchesMissionEvent` — full filter set

```ts
function matchesMissionEvent(
  step: {
    missionType?: string
    giverId?: string
    giverPlanetId?: string
    objectiveType?: string
    pinnedAssetRef?: string
    targetRegion?: string
    specialMissionId?: string
  },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  if (step.objectiveType !== undefined && step.objectiveType !== event.objectiveType) return false
  if (step.pinnedAssetRef !== undefined && step.pinnedAssetRef !== event.pinnedAssetRef) return false
  if (step.targetRegion !== undefined && step.targetRegion !== event.region) return false
  if (step.specialMissionId !== undefined && step.specialMissionId !== event.specialMissionId) return false
  return true
}
```

In practice, when a step has `specialMissionId` set, the other filters are redundant — the special mission has fixed properties, so `specialMissionId === 'jovian-prospection-hektor-photometry'` is enough. But the redundancy is fine and makes the contract self-documenting.

### 3. Auto-activation hook

When `ContractSystem` advances to a new step (or accepts a contract whose first step matches), check the step:

```ts
private onStepActivated(contract: Contract, instance: ContractInstance, step: ContractStep): void {
  if (step.kind === 'complete-missions') {
    if (step.specialMissionId !== undefined) {
      this.activateSpecialMission(step.specialMissionId)
    }
    if (step.revealsBody !== undefined) {
      const profile = loadProfile()
      if (profile) {
        saveProfile(setBodyAccess(profile, step.revealsBody, 'unrestricted'))
      }
    }
  }
  // ...existing flavor message enqueue...
}

private activateSpecialMission(missionId: string): void {
  const mission = getSpecialMissionById(missionId)
  if (!mission) {
    console.warn(`[ContractSystem] Special mission not found: ${missionId}`)
    return
  }
  // Enqueue offer message + activate via the same path MapViewController uses for consortium-certification.
  // The implementer audits MapViewController:3950-4000 for the precise wiring; likely the lift is to extract
  // a reusable helper from MapViewController and call it from ContractSystem (or ContractSystem fires an
  // event that MapViewController subscribes to, depending on layering preferences).
}
```

The implementer's call on layering: extracting a helper into `src/lib/missions/specialMissionActivation.ts` is the cleanest, but firing an event the map view subscribes to also works. Either is fine.

### 4. Mission completion plumbing

When a special mission completes, emit `MissionCompletedEvent` with `specialMissionId: mission.id`, `pinnedAssetRef: mission.asteroidId === 'hektor' ? 'hektor' : undefined`, `region: mission.region`. The implementer audits the asteroid completion path to ensure these fields populate correctly when the active mission was a special mission.

### 5. Contract JSON edits

Adapt `src/data/contracts/jovian-society-prospection.json`:

- Step 4 (`complete-missions`, was `pinnedAssetRef: 'jovian-prospectus-target-jupiter'`):
  - `specialMissionId: 'jovian-prospection-hektor-photometry'`
  - `revealsBody: 'hektor'`
  - Drop `objectiveType`, `pinnedAssetRef` filters — `specialMissionId` covers them
  - Keep `subject` and `flavor` (the inbox-side message)
- Step 5: `specialMissionId: 'jovian-prospection-saturn-photometry'`, drop other filters.
- Step 7: `specialMissionId: 'jovian-prospection-hektor-dan'`. Hektor already revealed.
- Step 8: `specialMissionId: 'jovian-prospection-saturn-dan'`.

Remove the contract's `pinnedAssets` block (was `[{ assetRef: 'hektor', ... }]`) — it's no longer load-bearing because the special mission carries the asset reference directly. Or keep it if the implementer wants the inbox-flavor `Asset 2306-J` label to come from there. Either is fine — the engine doesn't need it.

---

## Optional: Steps 1 and 2 as special missions

Steps 1 (gather) and 2 (mining) currently rely on the giver pool path (plan 3). The implementer may choose to migrate them to special missions in this plan instead — for narrative consistency with the rest of the cohort arc:

- `jovian-prospection-cohort-gather.json` — "OP 1 — Demonstration Run, Surface Gather" with hand-authored Vance briefing matching the contract's existing flavor. Asteroid id: any small named body in jovian-trojans (or invent a second fictional one — `cohort-demo-rock`).
- `jovian-prospection-cohort-mining.json` — "OP 2 — Demonstration Run, Belt Operations." Mining mission, attribution sidesteps the giver-pool/turret-pool question entirely.

Adopting this option means plan 3's mining-attribution open question disappears, and plan 4's special-mission count grows to 6 (steps 1, 2, 4, 5, 7, 8). The giver pool stays purely generic.

**Recommendation:** adopt this option. It cleanly resolves the mining attribution issue, makes Movement 1's narrative consistent with the rest of the cohort arc, and the authoring cost is two more JSON files. The simpler `jovian-society-prospection.json` carries fewer filter fields per step.

---

## Tests

In `src/lib/contracts/__tests__/`:

1. **`specialMissionId` filter satisfies.** Step with `specialMissionId: 'jovian-prospection-hektor-photometry'`; matching event advances; non-matching event does not.
2. **Cross-mission rejection.** Step requires Hektor mission; event with Saturn mission's id does not advance.
3. **Auto-activation on step entry.** Mock `getSpecialMissionById` and the activation helper. Advance a contract instance to a step with `specialMissionId`. Assert the helper was called with the right id and the offer message was enqueued.
4. **`revealsBody` flips access state.** Advance to a step with `revealsBody: 'hektor'`. Assert `bodyAccess['hektor'] === 'unrestricted'` after activation.
5. **`revealsBody` is one-way for plan 4.** Step entry doesn't override `'liberated'` or `'destroyed'` to `'unrestricted'` — those are end-states, plan 7 manages. (Defensive: if revealsBody is set on a step that activates *after* the contract resolved, no-op.)
6. **Plan 3 regression.** Generic giver pool still surfaces and completes generic Society missions.

In `src/lib/missions/__tests__/`:

7. **Asteroid catalog validation.** Both `hektor.json` and `asset-2306-s.json` pass `validateAsteroid` (composition sums to 100).
8. **Special mission lookup.** All four special missions are reachable via `getSpecialMissionById`.

Manual:

9. **End-to-end: Step 4 activation.** Drive contract to Step 4. Inbox gains the special-mission offer + the contract OP-4 flavor. Map shows Hektor (newly visible). Active mission waypoint points at Hektor. Fly + complete photometry → step closes, Step 5 activates.
10. **End-to-end: Step 5 activation.** Same flow for Saturn. Asset 2306-S is the waypoint target. Player flies the long haul, completes, returns. Step 6 activates per plan 2.
11. **Round-trip: Steps 7 and 8.** Same patterns; verify Hektor stays visible across the Saturn intermissions.
12. **Re-entry safety.** Player can exit `/level` mid-mission and the active mission persists across reload.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. **Manual flows above work end-to-end.**
5. **Plan 1 + 3 regression.** Hektor stays invisible until step 4 activates; generic giver-pool work still surfaces and completes.
6. **No regression on consortium-certification or any existing special mission.** The shared activation helper / pattern doesn't break the existing path.

---

## Open questions for the implementer

1. **Activation layering.** Helper-in-lib vs. event-out-from-`ContractSystem`. Either works; pick whichever matches the codebase's prevailing pattern.
2. **Saturn body model reuse.** `bennu.glb` and `itokawa.glb` would both read fine for Asset 2306-S. Pick one. New model authoring is out of scope.
3. **Step 1 + 2 migration to special missions.** See *Optional* section above. Strong recommend.
4. **Difficulty tuning.** Specific values in the special-mission JSONs are starting points. Playtest may shift them.
5. **Waypoint coordinates.** Confirm the consortium pattern uses fixed `worldX/worldZ` from the JSON, or maps from the asteroid id at runtime. Special missions for Hektor / Asset 2306-S should target the body's current orbital position, not a fixed coordinate; if the existing pattern is fixed coords, the implementer adapts.

---

## Forward references

- Plan 6 — prospectus terminal minigame: special mission `jovian-prospection-hektor-prospectus` with a terminal-objective shape (not photometry/DAN). Same auto-activation hook as plan 4 fires it. Plan 6 builds the canvas overlay and outcome resolution.
- Plan 7 — outcome side effects: shuttle-buff math, `set-body-access` to `'destroyed'` (transmit) or `'liberated'` (tamper), `disable-giver` enforcement on tamper, optional addition of Hektor to Jupiter's normal asteroid mission pool on liberated.
