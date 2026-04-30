# Jovian Giver Pool — Generic & Repeatable

_Plan 3 of the Jovian Society Prospection contract rollout._

---

## Revision note (2026-04-29)

This spec was rewritten after a brainstorm pass clarified the architecture:

- **The Society giver pool is for repeatable, generic Vance work the player can pick up forever**, independent of any contract.
- **Contract-specific missions live in their own pool**, registered as `SPECIAL_MISSIONS` entries (consortium-certification precedent), referenced by `step.specialMissionId`. Plan 4 owns those.

The original plan 3 conflated the two. The revised plan 3 only generic-ifies the giver pool. Saturn-targeting missions and Hektor-targeting missions are out of scope here — they're plan 4 (special missions).

---

## Premise

`src/data/missions/givers/jovian-society.json` currently holds 5 missions whose names imply a contract sequence: "Preliminary Asset Evaluation," "Phase II Verification Scan," "Subsurface Verification Pass," "Asset Substrate Recovery," "Extraction-Grade DAN Survey." These names only make sense inside the prospection arc. Once the contract is over, picking up "Preliminary Asset Evaluation" again on a random rock reads broken.

This plan rewrites those entries as generic, repeatable Society work — the kind of portfolio-cycle work Vance would post indefinitely as a Cloud City revenue stream — and adds two more objective types (gather and mining) the giver previously didn't surface, so Movement 1 of the contract has work to attach to. The `objectiveType` filter that plan 2 stubbed becomes load-bearing here.

After plan 3, the Society giver always offers a stable rotation of generic photometry, DAN, bunker, gather, and mining work, all Vance-voiced but free of contract-narrative references. The contract proper (steps 4, 5, 7, 8) stops touching this file — those use special missions in plan 4.

---

## Scope

**In scope**

1. **Generic-ify the existing 5 entries** in `jovian-society.json`. Strip "Preliminary / Phase II / Extraction-Grade" naming. Strip lines that reference contract narrative ("Stakeholders are watching this one"). Briefings stay Vance-voiced — corporate-banal, polite, ledger-flavored — but read as routine cycle work.
2. **Add 1-2 generic gather entries** — Society-issued belt extraction, Vance voice. Difficulty bands appropriate for a mid-Act-2 giver (4-8). Region: `jovian-trojans` and/or `asteroid-belt`.
3. **Add 1-2 generic mining entries** if the implementer takes path B from the original brainstorm (Society-attributed turret mining via a `giverIdHint` field on `jupiter.json` mining entries) — OR the simpler path A (no new mining entries; the contract step's mining filter relaxes to `giverPlanetId: 'jupiter'`). Path A is the default; B is only adopted if the implementer prefers stronger fiction. **Note: with plan 4's special-mission architecture, mining attribution matters only for the contract's Step 2, which is now itself a candidate for being a special mission instead.** See *Open question: Movement 1 in special missions or in the giver pool*.
4. Update the giver's `objectiveTypes` array to include `'gather'` (and `'mining'` if path B is taken).
5. **Tighten `matchesMissionEvent`** in `ContractSystem.ts` to honor the `objectiveType` filter that plan 2 stored but ignored. Apply to all `'complete-missions'` step kinds, not just Jovian.
6. **Populate `objectiveType`** on `MissionCompletedEvent` from the active mission's primary objective slot type at every emission site.
7. Tests for the matcher and emission population.

**Out of scope**

- All contract-specific mission authoring — Hektor photometry, Hektor DAN, Saturn photometry, Saturn DAN, prospectus terminal. These are plan 4 (special missions).
- The `pinnedAssetRef` filter and `targetRegion` filter — plan 4 activates those.
- Outcome side effects (plan 7).

---

## Generic-ifying the existing 5 entries

Suggested renames and tone shift. The implementer has freedom on exact wording — these are starting points to convey direction.

### `jovian_prelim_eval` → `jovian_routine_telemetry`

- **Was:** "Preliminary Asset Evaluation" with "Several assets are under simultaneous review this cycle. Clean data advances yours in queue."
- **Becomes:** "Routine Asset Telemetry" — generic photometric pass on whatever rock the Society's queue flags this rotation. Briefing references portfolio cycle work, no specific assets.
- Sample briefing: "Per current portfolio review, the Society routes ad-hoc photometric coverage to qualified contractors. Standard pass: deploy probe, hold standoff, capture telemetry. Rates per the standing kiosk schedule. — Vance Hoyt, Asset Strategy."

### `jovian_phase_two_scan` → `jovian_extraction_grade_telemetry`

- **Was:** "Phase II Verification Scan" with "Subject body has cleared preliminary screening… Stakeholders are watching this one."
- **Becomes:** "Extraction-Grade Telemetry" — same photometry mechanic, tighter standoff, longer hold, higher difficulty band. Generic — applies to any candidate body in the queue, not a specific one.
- Sample briefing: "Higher tier, same protocol — extraction-grade tolerance for standoff drift and hold variance. Rates scale accordingly. Good telemetry returns advance the contractor's standing on our manifest. — Vance"
- Difficulty 6-10, jovian-trojans region.

### `jovian_subsurface_pass` → keep id, generic-ify text

- **Was:** Specific to "this asset" with viroid cross-talk references.
- **Becomes:** Generic DAN survey text. Drop "this asset" / "this body" — make it about the work, not a specific rock.
- The "kindly disregard any sensor cross-talk inside the instrumentation envelope" line is on-tone for repeat work and can stay; it's Vance's voice in the abstract.

### `jovian_asset_substrate_recovery` → keep mostly as-is

This one's bunker mission flavor reads as generic recovery work — "viroid incursion has compromised it, descend, neutralize, recover the substrate." Doesn't reference contract narrative. Light tone polish optional; the substance is fine.

### `jovian_extraction_grade_dan` → `jovian_high_tier_dan`

- **Was:** "Extraction-Grade DAN Survey" with "Stakeholders require extraction-grade subsurface confidence before this body advances."
- **Becomes:** "High-Tier DAN Survey." Same mechanics. Briefing references the tier (high-end DAN) and the Phobos reference family without naming any specific asset.

---

## New entries — gather

Two new gather missions, Vance-voiced, generic. Authoring guidance:

- **`jovian_substrate_gather`** — surface gather, mid-difficulty, jovian-trojans region. Briefing leans Vance: "Per current portfolio review, the Society maintains a rolling acquisition queue for surface-recovered substrate from candidate bodies. Standard pass: land, gather, return to any Cloud City intake. Rates per the standing kiosk schedule. — Vance Hoyt, Asset Strategy."
- **`jovian_belt_gather`** — generic belt gather, slightly higher difficulty, asteroid-belt or jovian-trojans. "Higher acquisition volume, deeper cycle, same compensation tier. Some pilots prefer the longer cycle for the quiet. Compensate yourself accordingly."

`objectiveSlots[].type === 'gather'`. Reuse `params.resourceAmount` ranges similar to belt-mining-corp's tunings.

Add `'gather'` to the giver's `objectiveTypes` array.

---

## Mining attribution — open question

Step 2 of the Jovian contract authors `missionType: 'mining'` + `giverId: 'jovian-society'`. Existing turret mining is per-planet, not per-giver, so the matcher would reject as-is.

Two paths (carried over from the original plan 3 brainstorm):

**A. Loosen Step 2's filter** to `giverPlanetId: 'jupiter'`. Edit the contract JSON to drop `giverId: 'jovian-society'` for that one step. No new content. The narrative reads "any Jupiter belt run from the cohort era counts."

**B. Author a `giverIdHint?: string` field** on individual mining mission entries, plumb it through to `event.giverId` on completion. Add 1-2 Vance-voiced mining variants in `jupiter.json` with `giverIdHint: 'jovian-society'`. Stronger fiction, more work.

**Default: A.** B is reasonable to layer in plan 7 if cohort-branded mining feels worth differentiating.

### Or — make Step 2 a special mission instead

A third option, surfaced after the brainstorm shifted: Step 2 might be more naturally a **special mission** (plan 4) than a giver-pool match. A one-shot Society demo run — "Cohort Belt Cycle, Demonstration Pass" — with hand-authored briefing referencing the cohort, attributed to a fixed jovian-trojans asteroid. This eliminates the attribution question entirely.

Recommendation: defer this decision to plan 4. If plan 4's special-mission count grows from 4 (steps 4, 5, 7, 8 — and 9 via plan 6) to 6 (adding 1, 2), authoring stays bounded and the giver pool is purely generic. Plan 3's mining work then becomes "do nothing" — the giver pool gets two generic mining entries only if path B feels right; otherwise nothing.

---

## Engine work — `objectiveType` filter

In `ContractSystem.ts`'s `matchesMissionEvent`:

```ts
function matchesMissionEvent(
  step: { missionType?: string; giverId?: string; giverPlanetId?: string; objectiveType?: string },
  event: MissionCompletedEvent,
): boolean {
  if (step.missionType !== undefined && step.missionType !== event.kind) return false
  if (step.giverId !== undefined && step.giverId !== event.giverId) return false
  if (step.giverPlanetId !== undefined && step.giverPlanetId !== event.giverPlanetId) return false
  if (step.objectiveType !== undefined && step.objectiveType !== event.objectiveType) return false
  return true
}
```

`MissionCompletedEvent` gains a populated `objectiveType: string`. The implementer audits emission sites — `shuttleMissionSession.ts`, `turretMiningSession.ts`, `evaWaypointGenerator.ts`, asteroid mission completion paths — and pulls the primary objective slot type from the active mission. For mission types without a clear slot type, emit `objectiveType: ''` and the filter rejects on demand.

Plan 4 will tighten the matcher further with `pinnedAssetRef`, `targetRegion`, and `specialMissionId` filters; plan 3 only ships `objectiveType`.

---

## Tests

In `src/lib/contracts/__tests__/`:

1. **Gather filter satisfies.** Active step with `objectiveType: 'gather'`; event with matching type advances; event with `'photometry'` does not.
2. **Photometry vs. DAN strictness.** Step demanding `'photometry'` does not advance from a DAN completion, and vice versa.
3. **Other contracts unaffected.** Cinderline's first observance (`asteroid` mission, no `objectiveType` filter) still advances on any asteroid completion.

In `src/lib/missions/__tests__/`:

4. **Emission-site population.** A unit-test-friendly mission session emits an event with `objectiveType` populated from the mission's slot type.

Manual:

5. **Society generic missions surface.** Visit Jupiter, see at least one gather mission and the renamed photometry/DAN missions on the Society board, briefings read as generic cycle work (no contract references).
6. **Pre-contract play.** A player without the Jovian contract can pick up Society work indefinitely.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. **Manual: generic feel.** Briefings of all renamed missions read like routine work, not "stakeholders are watching this one" / "your file advances the queue." The voice is Vance, the substance is repeatable.
5. **Manual: gather works.** Player can accept and complete a Society gather mission.
6. **Manual: regression.** Cinderline / marines / cowboys all still surface and complete normally. Belt Mining Corp gather missions still work.

---

## Open questions for the implementer

1. **Movement 1 in special missions or in the giver pool.** See section above. Recommend deferring to plan 4 — if Steps 1 and 2 become special missions, plan 3 doesn't need new mining content at all.
2. **Briefing voice consistency.** Pull cadence from the existing Vance flavors. Implementer borrows phrases like "Per current portfolio review," "Standing kiosk schedule," "preferred contractor manifest," "Warm regards, Vance Hoyt."
3. **`objectiveType` emission audit.** Confirm every mission-completed emission site passes the right slot type. Empty strings silently reject any contract step with the filter; flag as code smell in PR review.
4. **Region weighting.** For new gather entries, `regionByDifficulty` should lean jovian-trojans at higher difficulty (the cohort vibe is "rocks closer to Jupiter").

---

## Forward references

- Plan 4 — Hektor + Saturn special missions, auto-activation on step entry, `pinnedAssetRef` and `targetRegion` and `specialMissionId` filter activation. May absorb Steps 1 and 2 as special missions if that lands cleaner than giver-pool attribution.
- Plan 7 — outcome side effects, including potentially adding Jovian-attributed mining (path B) if the cohort-mining feel is worth lifting.
