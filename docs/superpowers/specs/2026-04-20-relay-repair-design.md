# Relay Repair Minigame — Design Spec

**Date:** 2026-04-20
**Author:** guinetik
**Status:** Draft
**Prerequisite:** `2026-04-19-eva-minigame-wiring-design.md` (substrate), `2026-04-19-telescope-alignment-design.md` (pattern reference — overlay presentation, canvas SFC + class bridge, factory registration)
**Reference:**
- `docs/inspo/RelayRepairMinigame.jsx` — working React prototype, visual + behavioral source of truth
- `docs/inspo/EvaMinigames.design.md` §2–3 — shared UI conventions
- `2026-04-10-orbital-minigame-design.md` — `OrbitalMiniGame` interface

## Problem

`relay_repair` is authored as the `minigameType` on **every non-telescope EVA mission across the planet roster** — ~10+ missions under `src/data/shuttle-missions/eva/*.json`. Every one falls through to the default "Complete Maintenance" card. Players are told to EVA to a damaged relay antenna and then click a button.

A playable React prototype exists in `docs/inspo/RelayRepairMinigame.jsx`. This spec scopes the port + integration so a subagent can implement it without further questions, matching the pattern established by `telescope_alignment`.

## Goals

- Port the React prototype to a Vue 3 SFC + TypeScript minigame class that implements `OrbitalMiniGame` with `presentation: 'overlay'`.
- Match the prototype's feel: 5×3 grid of pipe nodes (I/L/T), two start misrotated, rotate nodes to connect IN → OUT, live wave trace with wiggling cyan pipes + flowing packets, amber dead-end markers, signal quality bar, lock-in at ≥ 95%.
- Data-drive the puzzle layouts so different missions can ship different grids without code changes. MVP is **one layout**; schema allows growth.
- Inherit EVA's O2 as the global timer — no per-minigame countdown.
- Wire cleanly into the existing reward + persistence chain established by the substrate spec.

## Non-Goals (this pass)

- Audio pass (packet stings, rotation clicks, carrier-lock chime — deferred).
- Mission-specific decorative captions beyond a shared "RELAY RESTORED" caption + mission-name line.
- Procedural puzzle generation. MVP is one static layout from JSON; a randomized generator is out of scope.
- Multi-signal / multi-carrier grids. Prototype is single-source, single-sink; spec preserves that.
- Gamepad / controller input. Keyboard + mouse (click + wheel) only.
- Mobile layout.

## Player Flow

1. Player accepts a relay-repair EVA mission (e.g. `earth_l1_relay_reterm`), flies to the waypoint, EVAs out, floats to the POI (a `relay_antenna` POI variant).
2. Within terminal range, "START MAINTENANCE [F]" prompt appears. F → overlay opens. Pointer lock released, EVA input detached, OrbitControls disabled — all standard per the substrate pattern.
3. Overlay shows: status bar (location / mission name / status), input oscilloscope strip (clean 2.4 GHz sine), the 5×3 signal grid panel, signal quality bar, controls hint row. Caption fades in on success.
4. Player navigates:
   - `W/A/S/D` or arrows — move the selected node (skips empty cells)
   - `R` — rotate the selected node 90° CW
   - **Click a node** — select + rotate
   - **Mouse wheel over a node** — rotate
   - `E` — lock in (only available when the wave reaches the sink at ≥ 95% quality)
   - `Esc` — abort (closes overlay, no reward)
5. Wave trace updates live on every rotation. Active pipes wiggle cyan and flow packets; dead-end branches pulse amber at the edge where they died.
6. At quality ≥ 95% (i.e. `sinkReached`), the corner prompt lights up `⟐ E — LOCK IN`.
7. Player presses `E`. A 450ms "locking" state plays, the sink carrier indicator flips to green, caption fades in, `minigame.complete()` fires. Host's `evaMinigameComplete` chain runs: CR paid, toast shown, overlay closes, EVA resumes.
8. `Esc` at any time → `close` emit → `evaMinigameClose` → EVA resumes without reward.

## Data Model

### `RelayRepairMiniGame` — new class

`src/lib/minigame/relayRepair/RelayRepairMiniGame.ts`

```ts
export class RelayRepairMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  readonly missionId: string
  readonly presentation = 'overlay' as const

  /** Current signal quality, 0..1. Canvas reports each tick via reportQuality. */
  readonly quality: number

  readonly steps: readonly OrbitalMiniGameStep[] = [
    { label: 'Approach Relay Bay',  complete: true,  active: false },
    { label: 'Reterminate Backbone', complete: false, active: true  },
    { label: 'Confirm Carrier Lock', complete: false, active: false },
  ]

  get progressCurrent(): number { return Math.round(this.quality * 100) }
  get progressTotal():   number { return 100 }

  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {}
  reportQuality(q: number): void { /* sets _quality while active */ }
  complete(): void { /* idempotent, fires onComplete once */ }
  dispose(): void {}

  onComplete:   ((missionId: string) => void) | null = null
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null
}
```

Same contract bridge pattern as `TelescopeAlignmentMiniGame`. All puzzle state lives in the Vue canvas; the class is purely `OrbitalMiniGame` lifecycle.

### `RelayRepairCanvas.vue` — new SFC

`src/components/RelayRepairCanvas.vue`

Responsibilities:
- Render the full overlay — status bar, oscilloscope, 5×3 grid (SVG), quality bar, hint row. Layout matches `docs/inspo/RelayRepairMinigame.jsx` at component-level fidelity.
- Own puzzle state: `cells[]` (row, col, shape, rotation, visualRotation), `selectedId`, `hoveredId`, `lockState`, `time` (for wiggle animation).
- Pure wave-trace pass per render via `traceWave(cells, SOURCE)`. Derived reactive values: `activeCells`, `activeSegments`, `exits`, `deadEnds`, `sinkReached`, `quality`, `canLock`.
- Keyboard handler: WASD/arrows move selection (skips empties), R rotates, E locks in when `canLock`, ESC emits `close`.
- Click handler per cell: select + rotate.
- Wheel handler per cell: rotate (either direction rotates CW — simpler UX; matches prototype line 849).
- Lock-in: 450ms locking state → `minigame.complete()` + `emit('complete')` after a caption fade window (matches telescope's ~1.2s caption).

### Puzzle JSON

`src/data/minigames/relay-puzzles.json`

Keyed by mission id, falling back to a generic puzzle for unmapped missions. Each entry is a complete `INITIAL_CELLS` snapshot:

```json
{
  "_default": {
    "label": "BACKBONE RETERM",
    "relay": "TITAN-RELAY-07",
    "carrier": "2.400 GHz",
    "cells": [
      { "row": 0, "col": 0, "shape": "L", "rotation": 2 },
      { "row": 0, "col": 2, "shape": "L", "rotation": 1 },
      { "row": 0, "col": 3, "shape": "I", "rotation": 1 },
      ...
    ],
    "idealPathLength": 11,
    "startSelected": "1-2"
  },
  "earth_l1_relay_reterm":       { "label": "L1 BACKBONE", "relay": "L1-RELAY-03", "carrier": "8.400 GHz", "cells": [...] },
  "mars_surface_relay_reterm":   { ... },
  "jupiter_io_relay_reterm":     { ... }
}
```

MVP ships `_default` only. Later PRs add per-mission entries. `startSelected` is stored as the canonical `${row}-${col}` cell id string so it serializes cleanly.

### Accessor — `src/lib/minigame/relayRepair/puzzles.ts`

```ts
export function getRelayPuzzle(missionId: string): RelayPuzzle {
  return PUZZLES[missionId] ?? PUZZLES._default
}
```

Uses the `satisfies Record<string, RelayPuzzle>` pattern from the telescope targets module.

## Systems

### Shape rotations

```ts
const SHAPE_ROTATIONS = {
  I: [['E','W'], ['N','S'], ['E','W'], ['N','S']],
  L: [['N','E'], ['E','S'], ['S','W'], ['W','N']],
  T: [['N','E','S'], ['E','S','W'], ['S','W','N'], ['W','N','E']],
} as const
```

Port tables plus `OPPOSITE` and `DIR_DELTA` live in `src/lib/minigame/relayRepair/shapes.ts`. Pure data — no DOM.

### Wave propagation

BFS with branching at T-pieces. Pure function in `src/lib/minigame/relayRepair/wave.ts`:

```ts
interface TraceResult {
  activeCells: Set<string>       // cellId(row,col)
  activeSegments: Set<string>    // `${row}-${col}-${port}`
  exits: Array<{ row, col, dir, blocked? }>
}

export function traceWave(cells, startRow, startCol, startDir): TraceResult
```

Matches the prototype's `traceWave` (lines 155–205). Pure, testable, zero side effects.

### Quality formula

```ts
export function computeQuality(activeCellCount: number, sinkReached: boolean): number {
  if (sinkReached) return 1.0
  return Math.min(QUALITY_CAP_WITHOUT_SINK, (activeCellCount / IDEAL_PATH_LENGTH) * QUALITY_SCALE)
}
```

Constants: `QUALITY_CAP_WITHOUT_SINK = 0.94`, `QUALITY_SCALE = 0.9`, `IDEAL_PATH_LENGTH` pulled from the puzzle JSON. Lock threshold: `LOCK_THRESHOLD = 0.95` (identical to telescope).

Key invariant: **quality cannot cross 0.95 without `sinkReached`.** Caps at 0.94 until the wave reaches the sink terminal. Tested explicitly.

### Visual layers (matches prototype)

- **Grid background** — dashed lines + intersection tick-marks, static
- **Terminal nodes** — IN (source, green when wave flowing) and OUT (sink, green when `sinkReached`) with carrier labels
- **Pipe arms** — outer arms from node edge to cell edge; static dim cyan when inactive, wiggly sine cyan with flowing dashed packets when active
- **Hub arms** — inner arms from cell center to node edge (always straight); cyan when any port of that node is active
- **Node body** — filled circle with border; border brightens on hover, glows on active
- **Selection halo** — rotating dashed ring around selected node (~7s loop)
- **Dead-end markers** — amber pulse circles at the edge where the wave died
- **Oscilloscope strip** — scrolling clean sine at the top, labelled `INPUT SIGNAL · 2.400 GHz · CLEAN`

### Wiggly path generator

Pure function `wigglyPath(x1, y1, x2, y2, time, amplitude, wavelength, speed): string` that returns an SVG path `d` attribute. Perpendicular sine offset with edge-fade via `sin(t·π)`. Matches prototype lines 211–232. Unit-testable on fixed `time=0` samples.

### Lock-in transition

On `E` with `sinkReached && canLock`:
1. `lockState = 'locking'` (RAF wiggle loop pauses at end of frame via the `lockState === 'locked'` early-return on line 783 of prototype)
2. After `LOCK_ANIMATION_MS` (450ms — prototype uses 450; telescope used 400, spec keeps them distinct per feel), `lockState = 'locked'`
3. `minigame.complete()` fires
4. Caption "RELAY RESTORED" fades in over `CAPTION_FADE_MS` (1200ms — same as telescope)
5. After the fade, host emits `complete` and closes the overlay

ESC at any time during `calibrating` or `locking` → `emit('close')` immediately.

## Asset Sourcing

**None.** The minigame is pure SVG + CSS — no external images, no fonts beyond the mono-family already used project-wide. No credits entry needed.

## Implementation Order

Assumes the substrate spec is in place (it is) and the telescope spec's overlay dispatch pattern is live (it is — `EvaMinigameOverlay.vue` already branches by `instanceof`).

### Phase R1 — Class + factory registration
- Implement `RelayRepairMiniGame` with full interface surface + `reportQuality` bridge. Tests mirror the telescope class spec.
- Register `case 'relay_repair'` in `orbitalMiniGameFactory.ts` + test table.
- Add `v-else-if` branch to `EvaMinigameOverlay.vue` rendering a placeholder `RelayRepairCanvas.vue` (status + mission name + "Complete (WIP)" button).

**Done means:** Accepting any relay-repair EVA mission opens the placeholder; pressing the placeholder button pays the reward end-to-end.

### Phase R2 — Pure shape/wave/quality math
- `shapes.ts` (SHAPE_ROTATIONS + DIR_DELTA + OPPOSITE + `getPorts`)
- `wave.ts` (`traceWave` BFS + branching)
- `quality.ts` (`computeQuality` + `LOCK_THRESHOLD`)
- `wiggle.ts` (`wigglyPath` generator)
- Full Vitest coverage: shape rotation tables, trace on the prototype's INITIAL_CELLS (pre- and post-rotation), quality invariants (cap at 0.94 without sink; 1.0 at sink), wiggle pure-function output at fixed times.

### Phase R3 — Puzzle data + accessor
- `src/data/minigames/relay-puzzles.json` with the prototype's `INITIAL_CELLS` as `_default`.
- `src/lib/minigame/relayRepair/puzzles.ts` — typed accessor + fallback test, same `satisfies` pattern as `targets.ts`.

### Phase R4 — Static overlay layout
- Port the prototype's layout to `RelayRepairCanvas.vue`. No interactivity yet — static grid rendering, every cell drawn in its initial rotation, signal quality bar frozen at 0%.
- All styles go in `src/assets/css/main.css` as `.relay-*` classes (per the telescope pattern — no `<style>` blocks in SFCs).
- Layout: centered inside the existing `.mission-minigame-overlay` wrapper (backdrop-blur + dark). Card is fluid-sized with `max-width: 920px`.
- SVG grid at 480×288 (5×96 × 3×96) base, scales to viewport.

### Phase R5 — Interactivity + wave trace
- Wire keyboard (`WASD`/arrows + `R` + `E` + `Esc`), click-to-rotate, wheel-to-rotate handlers on cells.
- Compute `activeCells` / `activeSegments` / `exits` / `sinkReached` as Vue computeds derived from reactive `cells`.
- Pipe arms read `activeSegments` to render wiggly-active vs dim-static.
- Signal quality bar updates live.
- Dead-end markers render at the "from" cell's exit edge.
- `reportQuality` pushed to the minigame instance so `progressCurrent` stays fresh for the HUD.

### Phase R6 — Wiggle RAF + lock-in
- RAF loop advancing `time` for the wiggly path animation (matches prototype useEffect line 782). Loop pauses when `lockState === 'locked'` per prototype.
- Lock-in sequence: 450ms `locking` state → terminal indicator flips to green → caption fade → `complete()` + emit.
- ESC abort path.

### Phase R7 — Polish
- Hover highlight ring, selection halo with rotating dashed ring animation.
- Terminal arrows with flowing dashed lines on active.
- Oscilloscope strip with scrolling sine + carrier-lock indicator.
- A11y: overlay root `role="dialog"`, each cell `aria-label`.

## Testing

### Pure unit tests (Vitest, `src/lib/minigame/relayRepair/__tests__/`)

- **shapes** — `getPorts('I', 0)` returns `['E','W']`; mod-4 wrap-around for negative rotations; exhaustive table check for I/L/T all 4 rotations.
- **wave** — trace on the prototype's `INITIAL_CELLS`:
  - pre-rotation (as authored): wave dies at cell (1,2) — `sinkReached === false`
  - after rotating (0,3) and (1,2) each once: `sinkReached === true`, `activeCells.size === 11`
  - empty-cell exit adds a `blocked: true` exit entry
  - T-piece branching: incoming W on a T at rotation 0 → exits at N and S (both ports activated)
- **quality** — caps at 0.94 without sink; returns exactly 1.0 when sinkReached; monotonic in `activeCellCount`.
- **wiggle** — `wigglyPath(0, 0, 100, 0, 0)` returns a deterministic string; endpoints at `t=0` and `t=length` exactly match `(x1, y1)` and `(x2, y2)` (edge fade makes offset zero at ends).
- **`RelayRepairMiniGame.complete()`** — idempotent; `onComplete` fires exactly once; `onStepChange` fires with all three steps completed.
- **puzzles** — `_default` fallback; known-key returns registered puzzle; schema validation catches malformed `shape` / `rotation` values.

### Manual in browser (`/map`)

- Accept `earth_l1_relay_reterm` (or any relay mission). Overlay opens on `F` press at the POI.
- Status bar shows mission name. Oscilloscope scrolls. Grid renders with two misrotated cells.
- Navigate with WASD — selection ring moves, skips empties.
- Click a node → selects + rotates. Wheel on a node → rotates. `R` on the selected node → rotates.
- Rotate the two wrong cells → wave connects IN → OUT, OUT terminal flips to green, quality → 100%, status reads `SIGNAL LOCK AVAILABLE`.
- Press `E` → 450ms lock animation, caption fades in "RELAY RESTORED", reward paid, overlay closes, EVA resumes.
- `Esc` at various states aborts cleanly with no payout.
- Re-accept and deliberately over-rotate to leave a dead-end — amber markers appear at the broken edge; quality stays ≤ 0.94.

## Risks

- **SVG performance with live wiggle.** Every active pipe arm samples ~6–10 points per frame. At worst (all 11 on-path cells active, 4 arms each) that's ~40 arms × 10 points = 400 path points/frame. Manageable. If it becomes a problem, throttle `time` updates to 30 Hz.
- **Puzzle JSON drift.** Authored cell lists can become invalid if the schema changes. Validation in `puzzles.ts` (same pattern as `validateManifest` for satellites) fails loud on load.
- **Input conflict with EVA WASD.** Same issue the telescope had (EVA thrust on W/A/S/D bleeding through). The substrate's `controller.setInput(null)` on minigame start already fixes this — relay inherits the fix for free.
- **Ambiguity when a cell is between two equally-valid rotations.** Not a concern for MVP since the default puzzle has a unique path, but future puzzles should be reviewed for "multiple valid solutions in ≤ N rotations" — fine if all are solvable, problematic if any require a specific rotation to match the flavor text.

## Open Questions

1. **Dead-end amber markers — should they strobe?** Prototype uses a 1.6s expanding-ring animation. Matching the prototype is the default.
2. **Should wheel direction matter?** Prototype ignores sign and always rotates CW (line 852 — "simpler UX than tracking dir"). Keep prototype behavior unless playtest says otherwise.
3. **Mission-specific puzzle variety.** MVP is `_default` only. How many distinct puzzles do we author? Spec recommends 3–5 at launch (earth, mars, jupiter, saturn get their own; everything else falls back to `_default`).
4. **Success overlay.** Prototype shows a centered `RELAY RESTORED` card with carrier details + a "RESTART · DEV" button (lines 715–767). The production caption should match the telescope's simpler fade-in label+body treatment (caption strip, not a full card) to stay consistent across EVA minigames. Recommend **drop the RESTART button** — it's a prototype affordance.
5. **Wave trace tick cost.** On every keystroke the full `traceWave` runs. For a 5×3 grid this is trivially fast; flagging in case someone later scales the grid up.

@author guinetik
@date 2026-04-20
