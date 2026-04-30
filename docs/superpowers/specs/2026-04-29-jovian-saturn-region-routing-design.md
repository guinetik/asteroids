# Saturn Co-Orbital Routing — `targetRegion` Activation

_~~Plan 5~~ — **DEPRECATED on 2026-04-29.** Folded into [`2026-04-29-jovian-hektor-mission-routing-design.md`](./2026-04-29-jovian-hektor-mission-routing-design.md) (now plan 4)._

---

## Why this was folded

Plan 4 was rewritten to adopt the `SPECIAL_MISSIONS` pattern (consortium-certification precedent) for **all** contract-driven missions, regardless of which region they target. With that architecture, the difference between a Hektor mission and a Saturn mission is just the `asteroidId` field on the special mission JSON — not a separate routing path. Plan 5's giver-pool authoring + targetRegion-filter activation collapses into plan 4's authoring + matcher tightening pass.

The original plan 5 content below is preserved for history but **should not be implemented**. Plan 4 ships everything plan 5 was meant to deliver, plus auto-activation, plus the `asset-2306-s` named body authoring.

---

## Original premise (preserved for history)

After plan 4 the player can do photometry and DAN on Hektor. Plan 5 adds the comparison-data leg: Vance posts saturn-trojans-targeting photometry (Step 5) and DAN (Step 8) missions from Cloud City, the player accepts them at Jupiter, the mission spawns out at a saturn co-orbital asteroid (procedurally — no second pinned body, the GDD's "Asset 2306-S" simplifies down to "any saturn-trojan"). The player flies Jupiter → saturn-trojans, does the scan, flies back.

The player does **not** need to orbit Saturn-the-planet. Vance posts from Jupiter; the mission's spawn region is what changes. The "travel premium" framing on the contract briefing is flavor — the engine doesn't care that Saturn is far, it just routes the spawn.

After plan 5, contract steps 5 and 8 are real. Steps 1-7 already work from prior plans. Only step 9 (the prospectus minigame) remains, and that's plan 6.

---

## Scope

**In scope**

1. Author 2 Vance-voiced saturn-trojans-targeting missions in `src/data/missions/givers/jovian-society.json`:
   - Photometry variant for Step 5 (`regionByDifficulty: { "saturn-trojans": [4, 8] }`).
   - DAN variant for Step 8 (`regionByDifficulty: { "saturn-trojans": [6, 10] }`).
   Briefings echo the existing OP-5 / OP-8 contract flavor — "Travel premium is included in the line item. Please do not cite the figure to other contractors." Vance.
2. Tighten `matchesMissionEvent` in `ContractSystem.ts` to honor the `targetRegion` filter (stubbed in plan 2). Apply to all `'complete-missions'` step kinds.
3. Extend `MissionCompletedEvent` so the emitting layer fills `region: string` from the active mission's spawn region. Plan 2 added the optional field; plan 5 populates it from `MissionRegion`.
4. Verify the asteroid mission generator's existing `regionByDifficulty` lookup correctly routes new Society entries with `saturn-trojans` keys. Spot-check by spawning a saturn-trojans Society mission from the Jupiter board.
5. Tests: matcher rejects wrong-region completions, accepts saturn-trojans completions, regression check on existing region-agnostic steps.

**Out of scope**

- Step 9 prospectus minigame (plan 6).
- Outcome side effects (plan 7).
- Any saturn-trojans terrain / environmental authoring beyond what the existing region already drives. The visual difference between a jovian-trojan and a saturn-trojan asteroid surface is procedural-generator territory, not authored content for plan 5.
- A second pinned body for Saturn. The GDD's "Asset 2306-S" framing is **dropped** — it's just any saturn-trojan, with the briefing's `Asset 2306-S` label living only as inbox flavor (the contract message refers to "the asset" without the engine pinning a specific rock). The implementer can ignore the label entirely or surface it as a static line in the briefing flavor.

---

## Authored content

Two new entries in `jovian-society.json`'s `missions` array:

- **`jovian_co_orbital_photometry`** — Saturn-region photometry for Step 5.
  - `objectiveSlots[0].type`: `"photometry"`.
  - Params identical to `jovian_phase_two_scan` (or close) — phase-II rates, tighter standoff, narrower variance window. The "travel premium" is reflected in slightly higher `reward` and `completionBonus` ranges than the Jupiter-trojan equivalent.
  - `regionByDifficulty`: `{ "saturn-trojans": [4, 8] }`.
  - Briefing in Vance voice: gestures at "system-wide portfolio review this quarter," mentions the travel premium, asks for clean telemetry. Short — three to four short paragraphs.

- **`jovian_co_orbital_dan`** — Saturn-region DAN for Step 8.
  - `objectiveSlots[0].type`: `"dan"`.
  - Params close to `jovian_extraction_grade_dan` — high tier, longer scan duration, more required hits.
  - `regionByDifficulty`: `{ "saturn-trojans": [6, 10] }`.
  - Briefing: nods at "elevated sensor cross-talk reports from cohort pilots near gas-giant assets" (echoing the contract's OP-8 step flavor), reassures via instrumentation team, instructs to proceed at discretion.

Both inherit `objectiveTypes` from the giver — plan 3 added `"gather"`; plan 5 doesn't need to add anything since `"photometry"` and `"dan"` are already advertised.

`completionBonus` ranges should be slightly higher than the Jupiter-trojan equivalents (call it +20–30%) to bake the "travel premium" into the engine, not just the briefing.

---

## Engine work — `targetRegion` filter

In `ContractSystem.ts`'s `matchesMissionEvent`:

```ts
function matchesMissionEvent(
  step: {
    missionType?: string
    giverId?: string
    giverPlanetId?: string
    objectiveType?: string
    pinnedAssetRef?: string
    targetRegion?: string
  },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  if (step.objectiveType !== undefined && step.objectiveType !== event.objectiveType) return false
  if (step.pinnedAssetRef !== undefined && step.pinnedAssetRef !== event.pinnedAssetRef) return false
  if (step.targetRegion !== undefined && step.targetRegion !== event.region) return false
  return true
}
```

`MissionCompletedEvent.region` becomes a populated field across all asteroid mission emit sites. The implementer audits the same emitting layers plan 3 audited for `objectiveType` (`shuttleMissionSession.ts`, `turretMiningSession.ts`, asteroid mission completion paths) and threads the active mission's region through the event.

For mission types without a clear region (rare — most asteroid missions live in a region by construction), emit `region: ''` and the filter rejects on demand. A contract step that requires `targetRegion: 'saturn-trojans'` will not be satisfied by a regionless event. That's correct.

---

## Mission generator — sanity check

The asteroid mission generator already supports `regionByDifficulty` and picks a region per the entry's keys. Plan 5 adds new entries with `saturn-trojans` keys; the generator should pick that region without code changes. Verification points:

- The Society's photometry kiosk listing on the Jupiter mission board surfaces `jovian_co_orbital_photometry` at appropriate difficulty bands.
- Accepting it spawns the waypoint in `saturn-trojans`, not jovian-trojans.
- The active mission's region threads through to the completion event.

If any of these break — likely candidate is a board filter that locks listings to "near the posting station" — the implementer flags it and we either patch the filter or move to a path-X-style relaxation. Default expectation: the existing infrastructure handles cross-region postings, since trade contracts already route between distant planets.

---

## Tests

In `src/lib/contracts/__tests__/`:

1. **`targetRegion` filter satisfies.** Step with `targetRegion: 'saturn-trojans'`; event with matching region advances; event without does not.
2. **Cross-region rejection.** Step requires `'saturn-trojans'`; event with `'jovian-trojans'` does not advance.
3. **Step 5 / Step 8 round-trip.** Synthetic emission of a saturn-trojans photometry event closes Step 5; saturn-trojans DAN event closes Step 8. Wrong type at right region does not advance the wrong step.
4. **Plan 4 regression.** Step 4 (Hektor photometry, `pinnedAssetRef: 'hektor'`) does not advance from a saturn-trojans completion. The two filters are AND'd.
5. **Other contracts unaffected.** Non-region-filtered steps in cinderline / marines still advance on any matching mission.

In `src/lib/missions/__tests__/`:

6. **Society Saturn photometry generator.** Difficulty 5 produces a mission with `region === 'saturn-trojans'` for `jovian_co_orbital_photometry`.

Manual:

7. **Steps 5 and 8 walk.** Drive the contract to Step 5: visit Jupiter, see the Society's saturn-trojans photometry on the mission board, accept it, see the waypoint render in saturn-trojans, fly there, complete the scan, return → Step 5 closes, Step 6 message arrives. Same for Step 8.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. Manual flow above works.
5. **Regression: plans 1-4 still pass their acceptance.** Hektor steps 4/7 still close on Hektor only; gather/mining still close steps 1/2; psychosphere collection still closes steps 3/6.
6. **Regression: existing givers.** Belt Mining Corp, Cinderline, Marines all still surface and complete normally.

---

## Open questions for the implementer

1. **Difficulty banding.** I picked `[4, 8]` for photometry and `[6, 10]` for DAN. The contract step lands somewhere in those bands; the generator picks an exact difficulty. If those bands clash with the player's progression (e.g. they hit the contract at upgrade-level 2 and Saturn DAN at minimum 6 is unreachable), the implementer can shift downward. The GDD's framing implies this is mid-to-late Act 2 work, so the high tier is on-theme.
2. **Travel-premium reward sizing.** I called for +20-30% on `completionBonus` over jovian-trojan equivalents. If playtest shows the saturn-trojans round trip costs significantly more fuel than that compensates for, bump it.
3. **Region label routing on the map.** When the player accepts the Saturn mission from Jupiter's board, the waypoint should clearly read as "Saturn region — long flight." If the existing waypoint UI doesn't differentiate, no change needed for plan 5; the mission's flavor copy handles the player-facing framing. Just verify the waypoint actually renders in the right place.

---

## Forward references

- Plan 6: prospectus terminal minigame on Hektor (Step 9).
- Plan 7: outcome resolution side effects (`shuttle-buff` math, Hektor `destroyed`/`liberated` plumbing, `disable-giver` enforcement).
