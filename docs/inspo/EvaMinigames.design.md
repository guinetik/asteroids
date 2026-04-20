# EVA Minigames — Design Document

**Project:** Asteroid Lander
**Scope:** Three minigame variants triggered by EVA-accessible POIs during shuttle missions
**Status:** Telescope prototype complete · Relay prototype complete · Satellite servicing planning
**Date:** 2026-04-19

---

## 1. Context

The Asteroid Lander mission system supports **three POI types**, each with its own minigame:

| POI Type | Minigame | Feel | Prototype |
|---|---|---|---|
| `telescope` | `telescope_alignment` | Slow analog precision | `TelescopeMinigame.jsx` |
| `relay_antenna` | `relay_repair` | Spatial puzzle | `RelayRepairMinigame.jsx` |
| `satellite` | `satellite_servicing` | Kinesthetic mouse skill | See `SatelliteServicing.plan.md` |

All three share:
- Triggered from EVA mode after approaching a POI in-world (not via pickup/menu)
- Run as a Vue 2D overlay on top of the 3D scene (except satellite servicing — see §4)
- Time-bounded by the existing EVA O2 timer — the minigame itself has no timer
- Fire `OrbitalMiniGame.onComplete(missionId)` on success; `onAbort()` if player bails
- Use the shared visual language: cyan HUD, corner brackets, status bar header, signal-quality meter, lock-in prompt at ≥ 95%

Mission distribution is already locked in the planet data JSON (see `planets.json`): 16 total missions across 8 planets, split roughly 5 relays / 6 satellites / 5 telescopes. Difficulty scales with distance from the sun.

---

## 2. Shared UI Conventions

Every minigame overlay uses the same chrome. This is deliberate — players learn the frame once and only need to learn each minigame's distinct interior.

### Status bar (top)
```
[EVA / <BAY TYPE> · <LOCATION>]   [MISSION NAME]   [⚠ / ⟐ / ●  STATUS]
```
- Left: `EVA / OPTICAL BAY · MERCURY-SOL L1` or similar
- Center: mission name, uppercased, letter-spaced
- Right: status text with color-coded prefix
  - `⚠` amber — in-progress / degraded
  - `⟐` green pulsing — lock-in available
  - `●` green — complete / restored

### Signal Quality Bar (bottom)
Always present. Always reads 0–100%. Always has a threshold marker at 95%. Always has the label `THRESHOLD 95% · ABOVE THIS LINE, LOCK-IN PERMITTED`. Color transitions from amber (below) → cyan (in range) → green (at or above threshold).

### Lock-in prompt
Bottom-right of the overlay. `E — LOCK IN`. Grey when not available, green pulsing `⟐ E — LOCK IN` when available.

### Escape / abort
All three respect `Esc` to abort EVA and return to the 3D scene without mission completion.

### Color palette
Shared constants:
```js
const COLOR = {
  bg:         '#05070c',
  panel:      '#0a0f1a',
  text:       '#cffafe',
  cyan:       '#22d3ee',
  cyanBright: '#7dd3fc',
  cyanDim:    'rgba(103, 232, 249, 0.3)',
  border:     'rgba(34, 211, 238, 0.25)',
  green:      '#34d399',
  amber:      '#fbbf24',
  red:        '#f87171',
  grid:       'rgba(34, 211, 238, 0.06)',
};
```

---

## 3. Minigame 1 — Telescope Alignment

**Prototype:** `TelescopeMinigame.jsx`

### The fiction
The POI is a space-based telescope pointed at a specific target (solar corona, Europa plume, etc.). A drifted actuator, stuck shutter, or misaligned component means the live view is distorted. Calibrate it.

### The core loop
1. Player EVAs to the optical bay
2. Minigame opens showing the eyepiece view of the telescope's current target — but blurry, chromatically aberrated, and off-center
3. Player adjusts four parameters via knobs:
   - **FOCUS** (Q/W) — blur radius
   - **CHROMA** (A/S) — RGB channel split
   - **AZIMUTH** (Z/X) — horizontal pointing offset
   - **ELEVATION** (C/V) — vertical pointing offset
4. Signal quality bar fills as all four parameters approach zero
5. At ≥ 95% quality, player presses E to lock in
6. Image snaps to pristine, caption fades in ("SOL — CORONAL LIMB / prominence arc, ~400,000 km / SDO/AIA 304 · 0341 UTC"), mission completes

### Unique mechanics
- **Ambient drift** — all four parameters wobble ±1.5% at different sine frequencies. Never enough to break the 95% threshold, but enough that the image is never dead-still. Sells "real optics in space."
- **Quality delta feedback** — on each player adjustment, a `▲ +1.2%` or `▼ -0.8%` floats up next to the meter and fades over 900ms. Only player-driven changes fire the delta (drift is filtered out).
- **Per-knob LED + mini-bar** — each knob has its own status LED (red → amber → green) and a small quality bar below it, so the player sees which parameter is closest to calibrated.
- **2D pointing indicator** — between the chroma and azimuth knobs, a small crosshair box shows az/el offset as a dot on a target, with CENTERED / XX% OFF readout. The 2D reference makes centering feel intuitive.
- **Tactile knob states** — hover (+5% scale, brighter cyan), press (−5% scale, 90ms snap), key-pulse (flash 180ms when its key is pressed).

### Assets required
Six images, one per telescope mission. Public domain / CC BY from NASA / ESA / STScI:
1. `sol_corona.jpg` — Mercury / Helios Coronagraph (SDO/AIA 304) ✓ sourced
2. `deep_field.jpg` — Earth / L2 Observatory (JWST or Hubble deep field)
3. `m13_cluster.jpg` — Mars / Phobos Astrometric (Hubble M13 globular cluster)
4. `europa_plume.jpg` — Jupiter / Europa Plume Spectrograph
5. `enceladus_plume.jpg` — Saturn / Enceladus Plume Spectrograph (Cassini)
6. `exoplanet_field.jpg` — Neptune / Triton Exoplanet Watcher (sparse star field)

2048×2048 square source, 800×800 displayed inside the eyepiece clip-path circle.

### Integration shape
```ts
class TelescopeAlignmentMiniGame implements OrbitalMiniGame {
  readonly missionId: string
  readonly steps = [
    { label: 'Approach Optical Bay', complete: true,  active: false },
    { label: 'Calibrate Optics',     complete: false, active: true  },
    { label: 'Lock In Target',       complete: false, active: false },
  ]
  progressCurrent: number | null = 0    // quality * 100, rounded
  progressTotal:   number | null = 100
  // tick() is a no-op — UI-driven
  // complete() fires when player presses E at >= 95% quality
}
```

### Key tuning constants
See prototype file. Notable:
- `MAX_FOCUS = 16` (px blur max)
- `MAX_CHROMA = 12` (px channel offset max)
- `MAX_POINTING = 60` (px offset per axis)
- `LOCK_THRESHOLD = 0.95`
- `STEP_FINE_MUL = 0.25` (Shift modifier)

Quality formula is weighted: `0.30 * focusErr + 0.25 * chromaErr + 0.45 * pointingErr`. Pointing is weighted highest because it reads as the most visually broken.

---

## 4. Minigame 2 — Relay Repair

**Prototype:** `RelayRepairMinigame.jsx`

### The fiction
The POI is a comms relay whose signal path is broken. The inside of the relay is a routing grid: the signal enters at IN (left), must exit at OUT (right), and has to traverse pipe-nodes whose rotation determines whether the path connects. Some nodes are misrotated. Fix them.

Witness-adjacent puzzle design. Routing as visible signal flow.

### The core loop
1. Player EVAs to the relay bay
2. Minigame opens showing a 5×3 grid of pipe-nodes (some cells empty) with IN/OUT terminals
3. Wave traces from IN through correctly-rotated nodes, dead-ends where the path breaks (amber pulse marker)
4. Player selects a node (WASD / click / hover) and rotates it (R / click / wheel) 90° CW
5. Wave re-traces live on each rotation
6. When wave reaches OUT: signal quality jumps to 100%, lock-in prompt appears
7. Player presses E, "BACKBONE RESTORED" success overlay, mission completes

### Unique mechanics
- **Wiggly pipe rendering** — active pipes use a time-based sine-wave perpendicular offset, with edge-fade so adjacent cells connect cleanly at cell boundaries. Inactive pipes are straight dim lines. The wiggle is what makes signal flow feel *alive* rather than static.
- **Three pipe shapes: I / L / T** — stored with a canonical port list + rotation index (0–3). `getPorts(shape, rotation)` returns the current port set.
- **Live BFS wave trace** — on every rotation, runs a BFS from IN with branching at T-pieces. Builds `activeCells`, `activeSegments`, and `exits`. Exits that aren't the sink become amber pulse markers on the originating cell's edge.
- **Dead-end markers** — pulsing amber rings at the exact edge where the wave died. They move as you rotate nodes. Excellent diagnostic feedback without needing a terminal log.
- **Rotation animation** — `visualRotation` monotonically increments on each R press, so the CSS transform rotates CW continuously (you never snap back from 3 → 0). 260ms cubic-bezier ease for tactile "click into place."
- **Quality is path-based, not error-based** — partial progress reads `(activeCells / idealPathLength) * 0.9` capped at 94%. Hitting the sink jumps to 100%. You cannot accidentally cross 95% without completing the path.

### Puzzle generation (for variants beyond the shipped snapshot)
Generate per mission at minigame open:
1. Pick a solution path from IN to OUT through N cells (4–11 cells depending on difficulty)
2. Fill the remaining grid cells with decoy nodes (not on the path)
3. Rotate 1–4 nodes on the solution path away from their correct orientations
4. Verify the puzzle is solvable in exactly N rotations

Difficulty scaling by distance:
- Inner (Mercury, Venus, Earth): 4×2 grid, 1–2 misrotated, mostly I-pieces
- Mid (Mars, Jupiter): 5×3 grid, 2–3 misrotated, I + L mix
- Outer (Saturn, Uranus, Neptune): 5×3 or 6×3, 3–4 misrotated, heavy T-pieces

Note — the relay mission list in `planets.json` spans inner-to-outer. Each mission should specify its difficulty tier.

### Integration shape
```ts
class RelayRepairMiniGame implements OrbitalMiniGame {
  readonly missionId: string
  readonly steps = [
    { label: 'Dock with Relay',   complete: true,  active: false },
    { label: 'Route Signal Path', complete: false, active: true  },
    { label: 'Restore Backbone',  complete: false, active: false },
  ]
  progressCurrent: number | null = 0    // quality * 100
  progressTotal:   number | null = 100
}
```

### Controls
- WASD / arrows — move selection to adjacent placed cell
- R — rotate selected 90° CW
- Click node — select + rotate
- Wheel over node — rotate
- E — lock in (when wave reaches sink)
- Esc — abort

---

## 5. Minigame 3 — Satellite Servicing

**Planning doc:** `SatelliteServicing.plan.md`

### The fiction
The POI is a malfunctioning satellite. 1–3 rigged components on its 3D model are glowing red (wireframe overlay). Player EVAs up to each broken component, enters a fixed-camera repair mode, and draws a line connecting anchor points floating over the part. Each successful trace restores the part to normal. Fix all red parts, mission complete.

### Distinguishing this minigame
- **Lives in the 3D scene, not a 2D overlay.** There is no Vue popup. The satellite is the playing field. Camera framing and anchor-point projection handle the UI.
- **Kinesthetic feel.** It's a mouse-skill challenge (aim-trainer "follow the path" drills), not analog tuning or spatial puzzling.
- **Works across the whole satellite roster without per-mission authoring.** Any rigged component on any satellite can be randomly selected as broken; the 3-point shape is generated from the component's geometry.

### Planning status
See `SatelliteServicing.plan.md` for:
- Breakdown of open implementation questions
- Proposed technical architecture (component registry, damage selection, anchor-point generation, input handling)
- Reference to existing satellite rigging pipeline
- Phased implementation plan
- Open questions to resolve before prototyping

Once the plan is approved by the planner agent, we can implement a standalone 2D line-drag demo to nail the input feel, then integrate into the Three.js scene.

---

## 6. Integration Points

All three minigames implement `OrbitalMiniGame` from `OrbitalMiniGame.ts`. The shuttle mission system maps `minigameType` → concrete class via a factory.

```ts
function createMinigame(mission: Mission): OrbitalMiniGame {
  switch (mission.minigameType) {
    case 'telescope_alignment':  return new TelescopeAlignmentMiniGame(mission.id)
    case 'relay_repair':         return new RelayRepairMiniGame(mission.id)
    case 'satellite_servicing':  return new SatelliteServicingMiniGame(mission.id)
    default:                     return new DefaultOrbitalMiniGame(mission.id)
  }
}
```

All three fire `onComplete(missionId)` on success. The existing mission system handles payout, UI closure, and return to 3D EVA.

### O2 as the global timer
No minigame has its own timer. EVA mode already tracks O2 consumption from the moment the player exits the shuttle. The minigame inherits that pressure for free. Players who burned O2 drifting to the POI have less time to solve. This is a feature, not a limitation — it ties minigame difficulty to the rest of the game's resource loop without any coupling.

### Reward scaling (from `planets.json`)
Base reward by POI type, multiplied by distance:
- `relay_antenna`: 1200
- `satellite`: 1500
- `telescope`: 1800
- Multiplier: 1.0 inner → 1.8 Neptune

A future enhancement could feed minigame quality into reward: 95% = base, 100% = +20% bonus. Mentioned for the record, not required for first ship.

---

## 7. Files

| File | Purpose |
|---|---|
| `EvaMinigames.design.md` | **This document.** Top-level design covering all three minigames. |
| `TelescopeMinigame.jsx` | Telescope alignment prototype (React, self-contained, base64 embedded image). Handed to implementer for Vue port. |
| `RelayRepairMinigame.jsx` | Relay repair prototype (React, fully interactive, no external assets). Handed to implementer for Vue port. |
| `SatelliteServicing.plan.md` | Planning doc for satellite servicing minigame. Input to the planner agent. |
| `planets.json` | Mission data — 16 missions across 8 planets with POI types, rewards, and minigame types. |
| `OrbitalMiniGame.ts` | Shared interface — all three concrete classes implement it. |
| `DefaultOrbitalMiniGame.ts` | Fallback "press button to complete" implementation. |

---

## 8. Remaining work

- **Telescope assets** — 5 of 6 images still to source (Mercury ✓, Earth, Mars, Jupiter, Saturn, Neptune)
- **Relay procgen** — shipped prototype has one hardcoded puzzle; need generator for per-mission variants with difficulty scaling
- **Satellite servicing** — full implementation pending planning approval (see companion doc)
- **Vue port** — all three prototypes are React; needs straightforward translation to Vue components in the existing overlay system. The SVG filter chains, BFS traversal, and sine-wiggle math all port directly.
- **Audio** — not yet designed for any of the three. Telescope lock-in wants a single piano note (Göransson-adjacent). Relay wants a subtle "signal hum" when path completes. Satellite wants a confirmation chime on each part restored.
- **Mission-specific flavor** — each minigame type has mission-specific framing (target subject for telescope, difficulty tier for relay, component list for satellite) that needs a per-mission data table beyond what's currently in `planets.json`.
