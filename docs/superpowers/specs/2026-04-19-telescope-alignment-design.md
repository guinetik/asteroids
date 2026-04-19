# Telescope Alignment Minigame — Design Spec

**Date:** 2026-04-19
**Author:** guinetik
**Status:** Draft
**Prerequisite:** `2026-04-19-eva-minigame-wiring-design.md` (interface + overlay dispatcher)
**Reference:**
- `docs/inspo/TelescopeMinigame.jsx` — working React prototype, visual + behavioral source of truth
- `docs/inspo/EvaMinigames.design.md` §2–3 — shared UI conventions + telescope game design
- `2026-04-10-orbital-minigame-design.md` — `OrbitalMiniGame` interface

## Problem

`telescope_alignment` is authored as the `minigameType` on six EVA missions across the planet roster (one per planet plus Earth's L2 Observatory) but the factory has no implementation — every one falls through to `DefaultOrbitalMiniGame`'s single-button stub. Players reach a beautifully-framed EVA at a Hubble-scale telescope and click "Complete Maintenance".

A playable React prototype exists in `docs/inspo/TelescopeMinigame.jsx`. This spec scopes the port + integration so a subagent can implement it without further questions.

## Goals

- Port the React prototype to a Vue 3 SFC + TypeScript minigame class that implements `OrbitalMiniGame` with `presentation: 'overlay'`.
- Match the prototype's feel: blurry/chromatic/misaligned eyepiece image → player tunes four parameters → signal quality rises → lock-in at ≥ 95% → image snaps pristine with caption fade-in.
- Source six real telescope/observatory images (Hubble, JWST, SDO, Cassini) — one per mission — and bake them into the overlay. Public domain / CC BY only.
- Inherit EVA's O2 as the global timer — no per-minigame countdown.
- Wire cleanly into the existing reward + persistence chain from `docs/eva-minigame-wiring.md` so a completed telescope mission pays CR + clears from the board just like the default stub does today.

## Non-Goals (this pass)

- Audio (a future audio pass adds the lock-in sting + ambient knob ticks).
- Quality-based reward bonus (`+20% at 100%`). Mentioned in `EvaMinigames.design.md` §6 but deferred.
- Gamepad / controller input. Mouse + keyboard only.
- Mobile layout. Overlay targets desktop (same as every existing minigame canvas).
- Per-knob fine/coarse modifier tuning beyond what the prototype ships with.
- Mission-specific science captions beyond the six baseline strings in §6.

## Player Flow

1. Player accepts a telescope EVA mission (e.g. `earth_l2_observatory_phasing`), flies the shuttle to the waypoint, EVAs out, floats to the POI (a `telescope` POI variant — currently `HubbleModel` in `EvaMissionPoi`).
2. Within terminal range, "START MAINTENANCE [F]" prompt appears. F press opens the telescope overlay — pointer lock released, EVA RCS muted, helmet visor stays visible behind the modal (matches existing overlay behavior).
3. Overlay shows: status bar (location / mission name / status), the eyepiece view (blurred, chromatically split, off-center), four parameter knobs with LEDs + mini-bars, a 2D pointing indicator, signal-quality bar, controls hint row.
4. Player tunes:
   - `FOCUS` (Q / W) — blur radius
   - `CHROMA` (A / S) — RGB channel split
   - `AZIMUTH` (Z / X) — horizontal pointing offset
   - `ELEVATION` (C / V) — vertical pointing offset
   - Hold `Shift` for fine-adjust (0.25× step)
5. Quality bar updates live from the weighted error formula (§5). Per-knob LEDs go red → amber → green.
6. At quality ≥ 95%, the corner prompt lights up `⟐ E — LOCK IN`.
7. Player presses `E`. Image snaps to the pristine photo, caption fades in for ~1.2s (target name, instrument, distance, observation timestamp), `minigame.complete()` fires.
8. Host's `evaMinigameComplete` chain runs: CR paid, toast shown, overlay closes, EVA resumes.
9. `Esc` at any time → `close` emit → `evaMinigameClose` → EVA resumes without reward (user-initiated abort).

## Data Model

### `TelescopeAlignmentMiniGame` — new class

`src/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame.ts`

```ts
export class TelescopeAlignmentMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  readonly missionId: string
  readonly presentation = 'overlay' as const

  /** Current alignment quality, 0..1. Reactive-read from the Vue canvas. */
  readonly quality: number           // computed each tick from current knob state

  /** Shared tracker steps. */
  readonly steps: readonly OrbitalMiniGameStep[] = [
    { label: 'Approach Optical Bay', complete: true,  active: false },
    { label: 'Calibrate Optics',     complete: false, active: true  },
    { label: 'Lock In Target',       complete: false, active: false },
  ]

  get progressCurrent(): number { return Math.round(this.quality * 100) }
  get progressTotal():   number { return 100 }

  /** No-op — Vue canvas drives all state via direct method calls. */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {}

  /** Called by the canvas when player presses E at quality ≥ threshold. */
  complete(): void { /* sets status, fires onComplete */ }

  dispose(): void {}

  onComplete:   ((missionId: string) => void) | null = null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null
}
```

Knob state + quality live on the Vue component, not the class. The class is a thin contract bridge to the host; it exposes `presentation`, `steps`, `status`, and dispatches `complete()`. This matches how `GasCollectionMiniGame` is structured — the class is the lifecycle; the canvas is the UX.

### `TelescopeAlignmentCanvas.vue` — new SFC

`src/components/TelescopeAlignmentCanvas.vue`

Responsibilities:
- Render the full overlay — status bar, eyepiece, four knobs, pointing indicator, quality bar, hint row. Layout matches `docs/inspo/TelescopeMinigame.jsx` at component-level fidelity. Port is structural, not pixel-perfect — use the shared palette (§2.4 of `EvaMinigames.design.md`) and Tailwind `@apply` utilities per CLAUDE.md rule #4. No inline CSS blocks.
- Own knob state (four floats), ambient drift RAF loop, per-knob quality deltas, pristine snap transition, caption fade.
- Bind keyboard inputs via a composable `useTelescopeKeys()` in `src/composables/` (mirrors existing `useOrbitControls` patterns).
- On lock-in: call `props.minigame.complete()`, emit `complete`.
- On `Esc`: emit `close`. (The overlay's capture-phase ESC handler in `EvaMinigameOverlay.vue` also handles this — no double-wiring needed.)

### Image per mission

A new data file: `src/data/minigames/telescope-targets.json`

```json
{
  "mercury_corona_monitor":          { "image": "sol_corona.jpg",         "label": "SOL — CORONAL LIMB",       "caption": "prominence arc, ~400,000 km · SDO/AIA 304 · 0341 UTC" },
  "earth_l2_observatory_phasing":    { "image": "deep_field.jpg",         "label": "JWST L2 — DEEP FIELD",     "caption": "NIRCam · 5.6 μm composite · F444W / F356W / F200W" },
  "mars_phobos_astrometry":          { "image": "m13_cluster.jpg",        "label": "HST — M13 GLOBULAR",       "caption": "ACS/WFC · 330,000 stars · 25,000 ly" },
  "jupiter_europa_plume_spectro":    { "image": "europa_plume.jpg",       "label": "EUROPA — PLUME EMISSION",  "caption": "Hubble STIS · H₂O vapor · south polar region" },
  "saturn_enceladus_plume_spectro":  { "image": "enceladus_plume.jpg",    "label": "ENCELADUS — CRYO PLUME",   "caption": "Cassini ISS · back-lit, south pole" },
  "neptune_triton_exoplanet_watch":  { "image": "exoplanet_field.jpg",    "label": "TRITON — TRANSIT FIELD",   "caption": "HAT-P-7 analog · TESS cadence · 2 min" }
}
```

Image files live in `public/minigames/telescope/`. Format: 2048×2048 source, JPEG quality 85, ~400 KB each target. Displayed at 800×800 inside the eyepiece clip-path circle. Source + license lookup happens during implementation (NASA/ESA/STScI public domain + CC BY — attribution in `docs/credits.md`). If a mission id is not in the table, fall back to `deep_field.jpg` with a generic caption.

## Systems

### Quality formula (from `TelescopeMinigame.jsx`)

```ts
const focusErr    = |focus|    / MAX_FOCUS        // 0..1
const chromaErr   = |chroma|   / MAX_CHROMA
const pointErrX   = |azimuth|  / MAX_POINTING
const pointErrY   = |elevation| / MAX_POINTING
const pointingErr = √(pointErrX² + pointErrY²) / √2

const quality = 1 - (0.30 * focusErr + 0.25 * chromaErr + 0.45 * pointingErr)
```

Pointing is weighted highest because it's the most visually broken read. Constants from the prototype (keep as named constants, no magic numbers):

```ts
const MAX_FOCUS       = 16     // px blur max
const MAX_CHROMA      = 12     // px channel offset max
const MAX_POINTING    = 60     // px offset per axis
const LOCK_THRESHOLD  = 0.95
const STEP_COARSE     = 1.0
const STEP_FINE_MUL   = 0.25
const DRIFT_AMP_PCT   = 0.015  // ±1.5% ambient wobble
const DRIFT_FREQS     = [0.11, 0.17, 0.23, 0.29]  // Hz, one per knob
```

### Ambient drift

RAF loop adds a per-knob sine wobble at different frequencies. Drift never exceeds `DRIFT_AMP_PCT` of the knob's range, so it cannot alone break the 95% threshold. Drift-induced quality changes do **not** fire the `▲/▼` delta floater — only player-driven changes do (track the diff between user actions, not the raw frame-to-frame quality).

### Per-knob LEDs + mini-bars

Each knob has its own `quality_i = 1 - (|value_i| / max_i)`:
- red   when `quality_i < 0.40`
- amber when `quality_i < 0.85`
- green when `quality_i ≥ 0.85`

Mini-bar below the knob shows `quality_i` as a horizontal fill, same color. Serves as a diagnostic so the player sees which axis is least calibrated without eyeballing the image.

### 2D pointing indicator

Between the chroma and azimuth knob slots. A crosshair target box showing `(azimuth, elevation)` as a dot position. Centered dot + `CENTERED` label when `pointingErr < 0.05`; otherwise shows `XX% OFF`. Matches prototype.

### Tactile knob states

- hover: +5% scale, stroke → `cyanBright`
- press: −5% scale, 90ms snap back
- key-pulse: flash stroke `cyanBright` for 180ms when the knob's key is pressed (visual feedback for blind keyboard users)

### Eyepiece rendering

CSS-only effect stack on the underlying `<img>`:
- `filter: blur({focus}px) drop-shadow(...)` for the focus knob
- Three stacked copies with `mix-blend-mode: screen`, offset by `chroma` in R/G/B for the chromatic aberration
- `transform: translate({azimuth}px, {elevation}px)` for pointing offset

Clip-path circle (780px diameter) gates the image. Outer ring draws reticle ticks + status annotations.

### Lock-in transition

On `E` with `quality ≥ 0.95`:
1. All four knob values animate to 0 over 400ms (cubic-bezier).
2. Drift loop pauses.
3. `minigame.complete()` fires at the 400ms mark.
4. Caption fades in (1.2s) then the overlay closes via the existing `evaMinigameComplete` chain.

If quality drifts below threshold during the 400ms animation, lock-in still completes — the player's intent is locked the moment they press E.

## Asset Sourcing

Six images. Acceptable sources (public domain or CC BY):
- **NASA** — default public domain for solar, JWST, Hubble, Cassini imagery (credit string recommended but not required).
- **ESA / STScI** — CC BY 4.0 for most. Attribution required.
- **SDO** (Solar Dynamics Observatory) — public domain via NASA.

Target shortlist:
1. `sol_corona.jpg` — SDO/AIA 304 Å, any coronal prominence frame.
2. `deep_field.jpg` — JWST NIRCam deep field (e.g. SMACS 0723, CEERS).
3. `m13_cluster.jpg` — HST ACS/WFC M13 globular cluster, archival.
4. `europa_plume.jpg` — HST STIS Europa plume detection, 2013 or 2016 frame.
5. `enceladus_plume.jpg` — Cassini ISS back-lit Enceladus plume, any frame.
6. `exoplanet_field.jpg` — generic sparse star field (HST archival or TESS full-frame). Optional: superimpose a faint "transit light curve" graphic to sell the "exoplanet watch" fiction.

Attribution string baked into each caption. Full credits list added to `docs/credits.md` during implementation.

## Implementation Order

Assumes the wiring substrate spec is in place (`presentation` field, factory dispatch, overlay branch registration are already scaffolded).

### Phase T1 — Class + factory registration
- Implement `TelescopeAlignmentMiniGame` with full interface surface, placeholder `complete()` + `onComplete`.
- Register in `orbitalMiniGameFactory.ts`.
- Add `v-if` branch to `EvaMinigameOverlay.vue` rendering a temporary "telescope minigame — WIP" placeholder div.

**Done means:** Accepting a telescope EVA mission opens the placeholder. Pressing the placeholder's button calls `minigame.complete()`; reward pays out end-to-end.

### Phase T2 — Static overlay layout
- Port the React layout to `TelescopeAlignmentCanvas.vue`. No interactivity yet — static knob positions, placeholder eyepiece (a solid gradient panel), static quality bar at 0%.
- Wire the shared palette + corner brackets + status bar + hint row.
- Snap points: pixel layout matches prototype at ±10 px; typography matches.

### Phase T3 — Knob interactivity + quality math
- Knob state + keyboard handlers (QW / AS / ZX / CV, Shift fine).
- Quality formula from §5 as a pure function in `src/lib/minigame/telescopeAlignment/quality.ts` with unit tests.
- Per-knob LED + mini-bar updates from the derived per-axis qualities.
- Quality delta floater fires only on user-driven changes.
- 2D pointing indicator live.

### Phase T4 — Eyepiece rendering + images
- CSS filter stack: blur, chroma split, pointing translate.
- Load the six images into `public/minigames/telescope/` + the JSON data file.
- Eyepiece pulls the right image by `mission.template.id` with fallback.

### Phase T5 — Drift, lock-in, caption
- Ambient drift RAF loop with frequency table.
- Lock-in animation (400ms knob-to-zero, caption fade, `complete()` call).
- ESC abort path.

### Phase T6 — Polish + QA
- Tactile knob states (hover, press, key-pulse).
- Accessibility pass: `aria-label` on each knob, visible focus ring on keyboard selection.
- Manual QA across all six missions (each displays the correct image + caption).

## Testing

Pure unit tests (Vitest, `src/lib/minigame/telescopeAlignment/__tests__/`):

- `computeQuality({ focus, chroma, azimuth, elevation })`:
  - all zeros → `1.0`
  - maxed single axis → exactly `1 - weight` for that axis
  - combined errors → matches the weighted formula within 1e-6
  - negative + positive inputs yield identical quality (abs)
- `perKnobQuality(value, max)` color bucket transitions at 0.40 and 0.85 exactly.
- Drift bounded: after 10 seconds of simulated drift, absolute knob value ≤ `DRIFT_AMP_PCT * max`.
- `TelescopeAlignmentMiniGame.complete()` is idempotent: second call is a no-op; `onComplete` fires exactly once.

Manual in browser (`/map`):

- Accept each of the six missions; each opens with the correct target image and caption.
- Quality bar responds to knob input in real time; turns green at ≥ 95%.
- Drift alone cannot push you over threshold from below 94%.
- Lock-in transition plays cleanly; reward appears; overlay closes; EVA resumes.
- ESC at various quality levels aborts cleanly without payout.
- Reload mid-session does not leave overlay state stuck.

## Risks

- **Image weight.** Six 2048² JPEGs ≈ 2.4 MB total. Acceptable but monitor. If bundle size becomes a concern, emit a separate chunk via Vite's `import.meta.glob` with `{ eager: false }` and lazy-load on overlay mount.
- **Filter stack performance on low-end GPUs.** Stacked `mix-blend-mode: screen` with animated blur is cheap but not free. Mitigation: cap `filter: blur()` update to 30 Hz even though the RAF runs at 60 Hz. Re-render the eyepiece image at the throttled rate.
- **Caption / label copy writer availability.** Six captions need to be both accurate and flavorful. First pass uses the strings in §6; a lore-writer pass refines. Not a blocker.
- **Licensing pitfall.** Confirm each image's license before bundling; NASA public-domain assumption is usually correct but not universal (NASA occasionally hosts partner imagery under more restrictive terms). Attribution file in `docs/credits.md` is the safety net.
- **Key conflicts.** WASD is canonically EVA thrust. During the minigame the EVA controller is input-locked by `EvaSession.beginMinigame`, so the minigame's A/S and W don't double-fire thrust. Confirmed in the existing telescope/relay-compatible lock path — but worth a manual verification during QA.

## Open Questions

1. **Coarse vs. fine step values.** Prototype uses `STEP_COARSE = 1.0` (out of 60 for pointing, 16 for focus, 12 for chroma). Fine = 0.25× that. With drift wobble, is `STEP_FINE_MUL = 0.25` fine enough, or do we want `0.1`? Default to `0.25`; tune during Phase T6 if playtest reveals it.
2. **Should the per-mission label include the giver planet?** e.g. `JWST L2 — DEEP FIELD · EARTH MISSION`. Leaning no — the status bar already shows location. Mission name lives in the center slot.
3. **Multiple lock-in attempts.** If the player locks in at 95% and mechanically could have gotten 99%, we don't punish them — reward is flat. Do we log achieved quality to telemetry for a future "surgeon's hand" achievement? Worth one field on the mission complete event; cheap to add now even if unused.

@author guinetik
@date 2026-04-19
