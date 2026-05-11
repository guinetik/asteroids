# Yamada Mission Pool — Design

## Overview

Yamada Farms is a late-game mission giver based on Uranus, introduced in act 3. The Yamada giver JSON (`src/data/missions/givers/yamada-farms.json`) already lists three asteroid mission entries (`bunker-protect`, `bunker-extract`, `patient-rescue`) with `archetype` strings — but `archetype` is currently metadata only and the variants are not implemented. An EVA pool exists at `src/data/shuttle-missions/eva/uranus.json` with a `yamada_eva_neuron_install` entry aliased to the existing `satellite_servicing` minigame.

This spec covers the four mission archetypes as standing Yamada-pool content. The Yamada *contract* (the chained 5-step structure, the Titania compound visit, the enroll/decline cosmetic) is a separate spec.

Source material: `docs/inspo/yamada-practice-gdd.md`, `docs/inspo/yamada-practice-intake.json`.

## Goals

- Introduce three new asteroid mission archetypes (Bunker Protect, Bunker Extract, Patient Rescue) that branch from existing systems, not new ones.
- Add a delivery-loop mission type (Bunker Extract) that teaches thermal-route planning by tying cargo integrity to the existing world-space temperature gradient.
- Keep the EVA Neuron-Install entry as-is (pure reskin, deferred art).
- Reuse the lander cargo system, the existing rescue system, and the existing bunker wave system. Avoid net-new gameplay systems where a reskin or parameter does the work.

## Non-goals

- The Yamada *contract* (5-step chain). Out of scope.
- The Titania compound, the intake-interview minigame, the enroll/decline outcome, the glasses cosmetic, and downstream NPC reactions. Out of scope.
- A new Neuron-Install minigame. Existing `satellite_servicing` alias is kept.
- New satellite art. Yamada-branded satellite model swap is a deferred art task.
- Wider Saturnine-NPC dialogue reactions. Out of scope.

---

## 1. Bunker Protect (asteroid)

A reskin of the existing bunker wave-combat mission. The bunker now holds a patient-pig suspension cylinder instead of a data terminal. Viroids have invaded; the player clears them and reboots the cylinder before the suspension cycle lapses.

### Visual

- Central interactable in the bunker is swapped from server rack / data terminal to a **suspension cylinder**: large vertical glass cylinder housing a sleeping pig, mounted to the bunker floor, with cable bundles running into the bunker structure. Ambient hum.
- Cylinder asset is **shared with Bunker Extract**.

### Combat

- Identical to the existing bunker wave mission. Same enemy roster, same wave schedule (`src/lib/bunker/bunkerWaveSchedule.ts`), same damage model.

### Final interaction

- Hold-E on the cylinder. Progress bar fills. Same UX as existing data-terminal extraction, relabeled to "Reboot Suspension."
- No new minigame code.

### Suspension-lapse timer (new)

- A global mission timer runs from the moment the player lands on the asteroid.
- HUD displays the timer in the mission HUD row stack.
- Length scales with mission difficulty:
  - Difficulty 4–6: 7 minutes
  - Difficulty 7–9: 5 minutes
  - Tuneable in the mission JSON if needed per-entry.
- Timer expires while either (a) any wave is still active or (b) the cylinder has not yet been rebooted → **hard fail** ("the file closes"). No partial credit. Both must be done before the timer hits zero.
- Timer reuses the same HUD primitive built for Bunker Extract.

### Failure modes

- Player death.
- Suspension-lapse timer hits zero.

---

## 2. Bunker Extract (asteroid → planet)

A no-combat delivery mission. Player enters a Yamada bunker, draws a harvested organ from the patient-pig cylinder, returns to the lander, and delivers it to a specified planet's dock before the case integrity or timer hit zero.

This is the only Yamada archetype with a genuinely new mechanic. It introduces the *cargo-with-thermal-clock* class.

### Pickup beat

- Bunker asset and layout reuse Bunker Protect (same cylinder + pig dressing). No viroids spawn; no waves.
- Player walks to the cylinder, holds E.
- A **3–4 second dispense animation** plays: cylinder hisses, hatch indicator walks through a cycle, output port opens. No input required during the animation; no failure path during the animation.
- On animation complete, the harvested organ is added directly to the active mission inventory. **No physical organ-case 3D model**, no separate pickup step.
- The Bunker Extract HUD (integrity + timer + thermal zone — see below) activates on dispense complete. The clock starts here.

### Cargo HUD

Three new readouts in the mission HUD row stack while a Bunker Extract organ is held:

- **Integrity bar** — 0–100 %. Starts at 100. Decreases under thermal stress (see thermal model). Reaching 0 → hard fail.
- **Hard countdown timer** — fixed length, scaled by pickup-asteroid → destination-planet distance. Tuneable per mission, with target ranges:
  - Uranus-local hop: ~4 minutes
  - Cross-system to Neptune: ~8 minutes
  - Cross-system to Saturn: ~10–12 minutes
  - Length is precomputed at mission acceptance and stored on the mission state.
- **Thermal zone indicator** — three-state readout: `SAFE` / `HOT` / `COLD`. Updates live as the ship moves through the solar thermal gradient.

### Thermal model

- The organ wants to stay within the **Saturn–Uranus thermal band** of the existing world-space temperature gradient (the same gradient the map gravity/temperature overlay already exposes).
- In-band: no thermal damage. Only the countdown timer runs.
- Out-of-band on the hot side (sun-ward of Saturn's thermal threshold): integrity bleeds at a rate that scales with how far past the threshold the ship is. A short transit through Mars-band is recoverable; a sustained sun-pass is fatal to the cargo.
- Out-of-band on the cold side (past Uranus's thermal threshold, into Kuiper depths): same — integrity bleeds at a rate scaling with overshoot.
- **Ship heat/freeze upgrade levels widen the tolerated band.** Heat L1 → tight inner threshold. Heat L3 → meaningfully closer-to-sun tolerance. Freeze L1 / L3 → same on the outer side. The Yamada-contract prerequisite of L3/L3 is calibrated to give the player a comfortable corridor on most deliveries; lower-level players will find the band claustrophobic.
- Specific bleed rates and band-widening curves: tuneable constants in `src/lib/missions/`, not magic numbers. To be calibrated during implementation.

### Map indicator

- While a Bunker Extract is active, the tactical map (M) shades the **safe thermal annulus** as a translucent ring centered on the sun. The annulus expands or contracts based on the ship's current heat/freeze upgrade levels (so the player sees their *actual* safe corridor, not a fixed-width band).
- Implementation hooks into the existing map gravity/temperature visualization layer.

### Destination

- Per-mission pinned planet, stored in the mission JSON entry.
- Distribution: most rolls deliver to Uranus (local hop, gentle timer, no thermal challenge). A weighted minority of rolls pin Neptune or Saturn (longer timer, real thermal management, higher payout). Saturn pins are the GDD's "old patient, strange orbit — quieter than you expect" beat — Sumiko's briefing flavor changes for those rolls.
- The mission generator picks the destination at acceptance time and locks it for the duration of the mission.

### Delivery

- Player lands at the destination planet's dock.
- Opens the mission board (existing UI).
- A **Deliver** button appears for the active Bunker Extract mission. Pressing it consumes the inventory organ, completes the mission, and pays out.
- Reuses the existing shuttle-mission planetary delivery pattern. No new delivery UI.

### Failure modes

- Integrity bar hits 0.
- Countdown timer hits 0.
- Lander destroyed.

---

## 3. Patient Rescue (asteroid)

A variant of the existing `search_and_rescue` mission with one operator flagged as a VIP. The variant exists to teach priority targeting under wave-combat pressure.

### Setup

- Generation reuses the rescue generator with one additional parameter on the Yamada entry: **`vipOperator: true`**.
- The generator selects exactly one of the rolled operators to be the patient. That operator's suit color is forced **yellow**; other operators keep their standard rescue palette.
- No map marker, no through-wall tag, no HUD indicator points at the VIP. Identification is purely visual.

### Completion

- Standard rescue completion logic, with one override: if the **yellow operator dies** at any point, the mission **hard fails** immediately (the file closes).
- Non-VIP operators behave exactly as in the base rescue mission — saving them pays out per-head bonus credits; losing them costs the per-head bonus but does not fail the mission.

### Failure modes

- Yellow operator dies.
- Player death.
- Standard rescue oxygen-out / time-out conditions, if applicable.

---

## 4. Neuron-Install EVA

No code changes. The existing `yamada_eva_neuron_install` entry in `src/data/shuttle-missions/eva/uranus.json` keeps its `satellite_servicing` minigame alias. The Yamada-branded satellite model swap is a deferred art task and not part of this spec.

Listed here only so the four-archetype Yamada pool is documented in one place.

---

## Shared infrastructure

| Piece | What's needed | Reuse |
|---|---|---|
| Suspension cylinder asset | New 3D model, ambient hum audio | Shared by Bunker Protect + Extract |
| Mission HUD: integrity bar | New row pattern via `missionHudRows.ts` | Same primitive as health/thermal bars |
| Mission HUD: countdown timer | New row | Same primitive |
| Mission HUD: thermal zone (SAFE/HOT/COLD) | New row, color-coded | Same primitive |
| Suspension-lapse timer (Bunker Protect) | Shares timer HUD primitive | Same code as Bunker Extract timer |
| Map: safe thermal annulus overlay | New layer on map renderer | Hooks into existing map temperature gradient |
| Per-mission destination planet | New field on Bunker Extract entries | Mission JSON shape extended |
| Archetype-driven behavior routing | The `archetype` field on Yamada mission entries currently is metadata; must now actually route mission setup (bunker reskin vs. base, combat vs. no-combat, final interaction label, post-objective delivery requirement). | Touches `asteroidMissionGenerator.ts` and the bunker/rescue runtime |
| Rescue VIP variant | One operator forced to yellow suit; hard-fail hook on that operator's death | Existing rescue system + one param |
| Bunker reboot interaction | Label-only reskin of existing terminal interaction | No code change |

## Asset list

- **Suspension cylinder** — large vertical glass cylinder with internal pig model, cable harness, base mount, status lights. Used in both bunker archetypes.
- **Pig (suspended)** — single static pose, low-poly, sleeping. Visible through the cylinder glass.
- **Bunker dressing variants** — repaint of existing bunker interior with Yamada-practice signage (small detail pass, optional).
- **Yellow rescue suit material variant** — single material swap on the existing rescue operator model.
- **(deferred) Yamada-branded satellite model** — Neuron-Install reskin. Not part of this spec's delivery.

## Failure of approach — what could go wrong

- **Thermal calibration.** The "band widens with upgrades" knob has a lot of degrees of freedom (inner threshold, outer threshold, bleed rate function, upgrade scaling). Mistuned, Bunker Extract is either trivial (band is too wide) or unwinnable below L3 (band is too narrow). Mitigation: ship Uranus-local deliveries first with generous tolerances; introduce Neptune/Saturn rolls only after the local case feels right.
- **HUD overload.** Three new HUD rows (integrity, timer, thermal zone) plus an annulus overlay is a lot of cargo-specific UI. Mitigation: rows are mission-conditional (only show when an organ is held), and visually grouped so the player learns to read them as one block.
- **Archetype routing tangle.** The `archetype` field becoming load-bearing changes its character from documentation to dispatch. Mitigation: keep routing logic in one place (a small archetype-handler registry in `src/lib/missions/`), not scattered across mission types.

## Open tuning questions (resolve during implementation)

- Specific timer values per difficulty band for Bunker Protect.
- Specific thermal band widths per Heat/Freeze upgrade level.
- Bleed rate curve for out-of-band Bunker Extract integrity (linear vs. quadratic on overshoot).
- Distribution weight for Uranus-local vs. Neptune vs. Saturn destinations on Bunker Extract rolls.
