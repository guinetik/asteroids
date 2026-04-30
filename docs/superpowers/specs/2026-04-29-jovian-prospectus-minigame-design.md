# Prospectus Terminal Minigame

_Plan 6 of the Jovian Society Prospection contract rollout. Step 9 routing + canvas overlay + outcome resolution._

---

## Revision note (2026-04-30)

This spec was rewritten after plan 4 landed with the auto-activation pattern. Original plan 6 referenced an "orbit Hektor → mission-callout slot → press I" flow; the actual shipped pattern (consortium-certification precedent) auto-queues the special mission when its step activates, with the waypoint pointing at Hektor. The player flies there directly — there's no callout slot, no orbit-then-accept step.

**For Jovian Step 9 specifically:** when the contract step activates, the prospectus special mission auto-queues with Hektor as the waypoint. Player flies to Hektor, lands, the special mission engages on landing (same path as Steps 4 and 7's photometry / DAN special missions), and the terrain spawns a terminal POI instead of a scan objective. Player walks to the POI, `E` interacts, the overlay opens.

The minigame UX (overlay layout, asymmetric CTAs, `notifyChoiceResolved` wiring, audio) is unchanged. Only the routing into `/level` differs from the original spec.

---

## Premise

Plans 1-5 build the contract's body — gather, mining, photometry on Hektor, psychosphere, DAN on Hektor, photometry on saturn-trojans, DAN on saturn-trojans. Step 9 is its head: the player flies to Hektor one last time, lands, walks to a Society-provisioned terminal, and is shown — for the first time, in the Society's internal language — what the contract has been compiling.

Up to this point Vance's flavor has used words like "portfolio review," "longitudinal benefits," "preferred contractor manifest." The terminal screen uses words like "full extraction queue" and "demolition cycle." That shift is the dramatic beat. The minigame is **non-interactive in the gameplay sense** — there is no skill check, no puzzle, no wave. The player reads the screen, makes one binary choice, and lives with it. The asymmetry of the prompts is the design: TRANSMIT is default-highlighted, TAMPER is small and gray. First-time players on rails will hit TRANSMIT. That training is the trap.

The minigame is built on infrastructure plans 1-5 already established: plan 1's Hektor body, plan 2's `'choice-mission'` step kind + `completionByOutcome` plumbing, plan 4's special-mission auto-activation hook and `/level` boot path. Plan 6 authors the prospectus special mission, spawns the terminal POI in `/level` (instead of a scan objective), builds the canvas overlay, wires the two outcomes, and exits cleanly back to the map where plan 2's completion handler dispatches the chosen arm.

This plan does **not** apply outcome side effects (shuttle-buff math, body destruction, giver blacklist) — that's plan 7. Plan 6's job ends when `notifyChoiceResolved(missionId, outcomeId)` is called. The contract system handles the rest.

---

## Scope

**In scope**

1. **Author the prospectus special mission.** New file `src/data/contracts/missions/jovian-society-prospection/hektor-prospectus.json`, registered in `SPECIAL_MISSIONS` (or sibling array per plan 4). `asteroidId: 'hektor'`, fixed waypoint, single objective of a new shape (terminal interaction, not scan). The contract's Step 9 carries `specialMissionId: 'jovian-prospection-hektor-prospectus'`. Step activation auto-queues it via the same hook plans 4's missions use — waypoint to Hektor appears, player flies there directly, no callout fill on orbit, no separate "accept" beat.
2. **`/level` choice-mission boot.** When the active mission entering `/level` is the prospectus special mission, the level scene boots on Hektor with the standard procedural terrain (seed-stable per plan 4) but spawns a **Society-branded terminal pylon** at the asteroid landing-zone POI position instead of a scan objective. Visually a clean blue panel mounted on a pylon, glowing softly, Cloud City logo. The terminal POI registers an `E to interact` prompt with the existing terminal-prompt system. The interaction handler opens `ProspectusOverlay`.
3. **Prospectus canvas overlay** — a new Vue component `ProspectusOverlay.vue` (sibling to existing minigame overlays). Terminal-style readout, monospaced, Society blue accent. Sections detailed below.
4. **Outcome resolution.** TRANSMIT (E) and TAMPER (Q) calls `contractSystem.notifyChoiceResolved('jovian_final_prospectus', 'transmit' | 'tamper')`. Plan 2's runtime advances the step, sets `instance.resolvedOutcomeId`, and dispatches the matching `completionByOutcome` arm. The overlay closes, `/level` exits, the player lands back on the map, and the completion message arrives in the Society inbox.
5. **Procedurally generated photometry and DAN graphs** seeded by `'hektor'`. Per GDD's open question 4, plan 6 picks **procedural over actual return data** — saves having to store player telemetry per run, the visual reads as "scientific scan output" without needing real fidelity, and seeded-by-Hektor means it's stable across reloads.
6. **Audio.** Three cues: an ambient corporate-hum loop while the overlay is open; a clean confirm chord on TRANSMIT; a data-corruption glitch on TAMPER. Reuse `relayAudio.ts` style if it fits, otherwise three short sample assets.
7. **Re-entry handling.** If the player exits `/level` (lander launch, menu, etc.) without resolving the choice, the contract stays on step 9 and the terminal remains interactive next time they orbit Hektor. The choice itself, once resolved, is permanent — there is no "undo."
8. Tests: overlay opens/closes, both outcomes call `notifyChoiceResolved` with the right payload, procedurally-generated graphs are seed-stable.

**Out of scope (plan 7)**

- Real `shuttle-buff` math (jovianEmpowerment +50% application to ship stats).
- Body destruction visualization (Hektor debris field on first flyby after transmit).
- `disable-giver` enforcement (Society listings disappear from Jupiter board on tamper).
- The `liberated` state's effect of joining Hektor to the normal Jupiter asteroid mission pool.
- Cinderline-side follow-up message hooks (the GDD's Act-3 seed for the moon-worker / Cinderline contact).

---

## Player flow

1. Contract is on step 9. Inbox shows OP 9 flavor: "There is a Society-provisioned terminal on the surface, near your previous landing zone…" The prospectus special mission auto-queues; the active-mission HUD now shows "OP 9 — Prospectus Compilation" with a waypoint at Hektor.
2. Player flies to Hektor on the map. Approaches, orbits, lands — same flow as Steps 4 and 7. Once `/level` boots on Hektor with the prospectus mission active, terrain generates per the seed but **no scan objective spawns**; instead a Society-branded terminal pylon stands at the landing-zone POI position.
3. Lander touches down. Player EVAs.
4. Walking out from the lander, the player sees the terminal — clean blue panel mounted on a pylon, glowing softly. Existing `E to interact` prompt fires.
5. `E` → canvas overlay opens. The world behind dims and pauses. Audio: ambient hum loop fades in.
6. Player reads the screen (sections below). Two CTAs at bottom: green E TRANSMIT default-highlighted, small gray Q TAMPER.
7. Player picks one. Audio cue fires (transmit chord OR tamper glitch). Overlay closes. The terminal screen flips to a "Transmission Complete" / "Report Tampered" static state for a beat.
8. Player walks back to the lander, launches, exits `/level` to the map. Inbox shows the matching `completionByOutcome` message. Plan 2's reward dispatch fires (plan 7 makes those rewards mean something mechanical; plan 6 just calls the dispatch).

---

## Overlay layout

`ProspectusOverlay.vue`. Monospaced, Society blue (`#2C5BB0` accent, near-black background, off-white text), Cloud City logo at top. Sections, top to bottom:

### 1. Header

```
┌────────────────────────────────────────────────────┐
│  [☁ CLOUD CITY]   JOVIAN SOCIETY                   │
│                   ASSET STRATEGY · INTERNAL        │
│                   Prospectus Compilation           │
│                   Cohort: Q4 / 2306                │
│                   Operator: <Pilot Name>           │
└────────────────────────────────────────────────────┘
```

### 2. Asset card

```
ASSET 2306-J   ·   Cross-ref: 624 HEKTOR (L4)
Region:        Jovian Trojans · L4 leading cluster
Class:         D-type · contact binary
Mean diameter: 230 km
Status:        Pending disposition
```

The "Cross-ref: 624 Hektor" line is the recognition beat — the Society uses a ledger number, but they know what they're looking at. A player who's been paying attention catches this.

### 3. Photometry summary

A small spectral lightcurve graph rendered to a `<canvas>` element inside the overlay. Procedurally generated from a seed derived from `'hektor'` (e.g. `hashSeed('hektor-photometry')`). Looks scientific. Three labeled bands beneath: "Carbonaceous: 38%", "Hydrated silicates: 18%", "Water ice (subsurface, inferred): 14%" — same numbers as `hektor.json`'s composition (the implementer can pull from the asteroid catalog directly).

### 4. DAN summary

Second small canvas graph: a neutron-flux histogram, again seed-stable. Labels beneath: "Subsurface volatile signature: STRONG", "Lattice-positive bands: 6", "Phobos reference family match: 87%" (procedurally generated numbers, but consistent across reloads).

### 5. Recommendation block

This is the moment. Boxed and slightly emphasized:

```
┌────────────────────────────────────────────────────┐
│  RECOMMENDATION                                    │
│                                                    │
│  Asset is composition-rich and volatiles-positive. │
│  Asset is recommended for full extraction queue.   │
│  Estimated yield value: ~2.8B credits over a       │
│  14-month demolition cycle.                        │
│                                                    │
│  No habitation. No biological signature.           │
│  No protected status.                              │
└────────────────────────────────────────────────────┘
```

This is the **first time the contract uses the words "extraction queue" and "demolition cycle"**. Vance has never. The player learns the truth here, not from a person but from a printout.

### 6. CTAs

```
[ E ]  TRANSMIT REPORT  ←  recommended            (green, default-highlighted)
[ Q ]  Tamper Report                              (small, gray)
```

The asymmetry is intentional. TRANSMIT is the default — the prompt the player's been trained to hit at the end of every screen. TAMPER is small enough to be missable on a fast read.

---

## Engine work

### 1. Special mission authoring

New file `src/data/contracts/missions/jovian-society-prospection/hektor-prospectus.json`. Same shape as plans 4's `hektor-photometry.json` and `hektor-dan.json`, but the objective is a terminal interaction instead of a scan:

```jsonc
{
  "kind": "special",
  "id": "jovian-prospection-hektor-prospectus",
  "asteroidId": "hektor",
  "giverId": "jovian-society",
  "giverName": "Jovian Society",
  "templateId": "jovian-prospection-hektor-prospectus",
  "name": "OP 9 — Prospectus Compilation",
  "briefing": "Pilot, eight deliverables clean. Final assignment: travel to Asset 2306-J. There is a Society-provisioned terminal on the surface, near your previous landing zone. Approach the terminal and review the assembled report — your readings, our analysis, the recommended disposition. Confirm transmission to Cloud City Asset Strategy at your discretion. — Vance",
  "difficulty": 5,
  "region": "jovian-trojans",
  "objectives": [
    {
      "type": "prospectus-terminal",
      "x": 0,
      "z": 0,
      "interactionLabel": "[E] OPEN PROSPECTUS",
      "reward": 0
    }
  ],
  "totalReward": 0,
  "waypoint": { "worldX": 0, "worldZ": 0 },
  "status": "available"
}
```

Reward is 0 because the contract step's per-outcome `creditsReward` (5000 on transmit, 0 on tamper) is paid via plan 2's choice resolution — plan 6 doesn't pay anything from the special mission itself.

The new `objectives[0].type === 'prospectus-terminal'` is a plan-6-specific objective kind. The level scene's objective-spawn logic dispatches on this type to spawn the terminal pylon instead of a scan/gather/etc. apparatus. Any sane fallback — e.g. treating it as a `'collect'` with no item — would also work; the implementer picks the cleanest extension.

Register in `SPECIAL_MISSIONS` (or sibling array). Step 9 of the contract carries `specialMissionId: 'jovian-prospection-hektor-prospectus'`, and the existing auto-activation hook from plan 4 fires on step entry — no new runtime code path. The mission queues, the waypoint posts, the player flies to Hektor.

### 2. `/level` terminal POI spawn

When the active mission entering `/level` is `jovian-prospection-hektor-prospectus`:

- Standard asteroid terrain generates per the asteroid catalog entry (seed-stable, same path plan 4 uses).
- Instead of a scan/gather objective apparatus, the level scene reads the special mission's objective array, finds `type: 'prospectus-terminal'`, and spawns a Society-branded terminal pylon at the corresponding `(x, z)` (the landing-zone POI position).
- The terminal POI registers an `E to interact` prompt with the existing terminal-prompt system. The interaction handler opens `ProspectusOverlay`.

The implementer audits how DAN's "walk to terminal after the scan" works (per the cinderline references). The same POI + prompt pattern likely applies; if not, a small extension to the terminal-prompt registry covers the case.

### 3. `ProspectusOverlay.vue`

Vue component, sibling to existing minigame overlays (`EvaMinigameOverlay.vue` is reference). Receives:

- `bodyId: 'hektor'` (for asset-card binding to the catalog entry).
- `onResolve: (outcomeId: 'transmit' | 'tamper') => void`.

State machine:
- `idle` — overlay opens, ambient hum begins, sections render in. Optional small intro animation (lines fade in top to bottom — "scientific report compiling").
- `awaiting-choice` — both CTAs interactive.
- `resolving` — chosen outcome highlighted, audio cue plays, opposite CTA fades. ~1.5s lockout before:
- `resolved` — overlay closes, `onResolve` fires. World resumes.

E and Q keybindings tied to TRANSMIT and TAMPER respectively. Click on either CTA also works.

Per CLAUDE.md: no inline `<style>` blocks. Sibling `.css` file with `@apply` utilities, imported by `main.css`.

### 4. Procedural graphs

Two small `<canvas>` elements inside the overlay, each ~280×80px. Render functions (`drawPhotometryLightcurve`, `drawDanHistogram`) take a seed and produce a stable plot. Pure functions in `src/lib/minigame/prospectus/` so they're testable without DOM.

### 5. Audio

Three cues, registered with the existing UI audio director:
- `prospectus-ambient`: low corporate hum loop, 6-10s seamless. Plays from overlay open to overlay close.
- `prospectus-transmit`: a clean confirm chord, ~0.5s, slightly warm.
- `prospectus-tamper`: a brief data-corruption glitch, ~0.4s, slightly cold.

If new asset authoring is too heavy for plan 6, the implementer reuses existing UI cues (`uiAudio.notifyButtonClick` + a synthesized chord/glitch via the existing `relayAudio.ts` style). Final audio polish can land in plan 7 alongside the other outcome-side work.

### 6. Outcome resolution

`onResolve('transmit')` calls:

```ts
contractSystem.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
```

Plan 2's runtime:
- Validates the outcome id against the step's `outcomes`.
- Sets `instance.resolvedOutcomeId = 'transmit'`.
- Pays the per-outcome `creditsReward` (5000).
- Advances step → contract `completed`.
- Reads `completionByOutcome.transmit`, dispatches subject + body to inbox, dispatches the rewards array to `applyRewardToProfile`.

Plan 6 doesn't need to do anything more — call `notifyChoiceResolved` and exit `/level`. Plan 2 already wired the rest.

### 7. Re-entry

If the overlay is closed without resolving (e.g. player exits `/level` via lander launch before pressing E or Q), the contract stays on step 9. The special mission stays queued — the active-mission HUD still shows OP 9 with Hektor as the waypoint. Player flies back to Hektor whenever they want; the level boots again, the terminal POI is there again, the overlay re-opens on `E`. No state to clean up — the contract instance hasn't advanced.

The choice, once resolved, is irreversible. The completion message arrives, the contract is `completed`, and the inbox shows the matching arm.

---

## Tests

In `src/lib/minigame/__tests__/prospectus.spec.ts`:

1. **Lightcurve seed stability.** `drawPhotometryLightcurve` with `seed = hashSeed('hektor-photometry')` produces identical output across calls.
2. **Histogram seed stability.** Same for DAN.
3. **Asset-card data binding.** Given `getAsteroidById('hektor')`, the displayed values match the catalog entry's composition percentages.

In `src/lib/contracts/__tests__/`:

4. **Resolution wiring smoke.** Build a fake contract with the choice-mission step. Synthetically call `notifyChoiceResolved('jovian_final_prospectus', 'transmit')`. Assert step advances, `resolvedOutcomeId === 'transmit'`, and the transmit completion arm dispatches.
5. **Both outcomes round-trip.** Same fixture for tamper.

Component / view layer (Vue + JSDOM):

6. **Overlay renders.** Mount `ProspectusOverlay` with `bodyId: 'hektor'`. Assert header, asset-card, recommendation, and both CTAs are in the DOM.
7. **CTA bindings.** Trigger E on a mounted overlay → `onResolve('transmit')` fires once. Trigger Q → `onResolve('tamper')` fires once.
8. **Lockout during `resolving`.** After picking an outcome, additional E/Q presses do not refire `onResolve`.

Manual:

9. **End-to-end.** Drive the contract to step 9. Verify the active-mission HUD shows OP 9 with a Hektor waypoint as soon as Step 8 closes. Fly to Hektor, land, walk to terminal pylon, E to interact, read screen, pick TRANSMIT, see ambient hum stop, see confirm chord, see overlay close, walk to lander, exit /level, see "Welcome To The Manifest" message arrive in inbox.
10. **Tamper round-trip.** Same with TAMPER (different chord/glitch, "Cohort Departure Confirmed" message).
11. **Re-entry.** Open the overlay, exit /level without picking, fly back to Hektor — terminal works, choice still available, active mission is still OP 9.

---

## Acceptance criteria

1. `bun run type-check` passes.
2. `bun run lint` passes.
3. `bun run test:unit` passes including new tests.
4. **Manual end-to-end works for both outcomes.**
5. **Re-entry works.** Step 9 stays open until resolved.
6. **Plan 1-5 regression.** All prior step flows still work; specifically, steps 4 and 7 on Hektor still close on photometry/DAN completion (the choice-mission flag is only set when the active step is `'choice-mission'`).

---

## Open questions for the implementer

1. **Audio assets.** New samples vs. synthesized in code (relayAudio style)? Plan 6 ships either; if synthesizing is faster, do that and revisit asset polish in plan 7.
2. **Terminal pylon visual.** A bespoke model (e.g. `/models/society-terminal.glb`) or reuse an existing prop? GDD doesn't specify. If a quick existing-prop reskin (e.g. one of the bunker terminals) carries the corporate-blue accent, that's enough.
3. **Cross-ref reveal placement.** I put "Cross-ref: 624 HEKTOR (L4)" inline on the asset card. An alternative is to bury it in fine print at the bottom — better recognition beat for an attentive player, more missable for a casual one. Implementer's call; either is fine.
4. **Cohort field and operator name.** I have `Cohort: Q4 / 2306` and `Operator: <Pilot Name>` in the header. Pulling pilot name from the player profile is a one-liner. Keeping "Q4 / 2306" hardcoded is fine — it dates the moment.
5. **Animation pacing.** I described a fade-in for the sections. If "compiling" feels overwrought, instant render is also fine. Aim for ~1-2s overlay-open settle before CTAs become hot, so the player has a beat to read.

---

## Forward references

- Plan 7 — outcome side effects:
  - `shuttle-buff` math: jovianEmpowerment +50% multiplier applies to ship stats (scope per GDD Q6 — full or narrowed).
  - Hektor `destroyed` state: removed from map render, optionally with a one-time debris field on first flyby.
  - Hektor `liberated` state: joins the normal Jupiter asteroid mission pool.
  - `disable-giver`: Society listings disappear from the Jupiter mission board on tamper.
  - Optional: Cinderline / moon-worker contact follow-up message ~2 in-game days post-tamper (Act-3 seed).
