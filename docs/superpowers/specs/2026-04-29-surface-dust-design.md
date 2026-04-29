# Surface Dust System — Design

**Date:** 2026-04-29
**Status:** Approved (brainstorm)
**Author:** guinetik

## Summary

Add an asteroid-surface dust particle system to the Level view. Particles
hang quasi-statically in a small bubble around the active anchor (lander or
player), and burst outward in localized puffs when motion disturbs them
(lander main thruster firing near ground; player footsteps during EVA).
Suppressed entirely while inside bunker interiors and during cinematic
states. Dust character (color, density, particle size, settle time) is
data-driven per-asteroid via the existing `surface` block in
`src/data/asteroids/*.json`, with a universal default fallback so
asteroids without an explicit `dust` block still get a baseline look.

The system is inspired in spirit by the Map view's `AmbientSpaceController`
(layered ambient particles anchored to the shuttle) but is a separate,
purpose-built controller — Map dust is built around long zoom-out flythrough
with shell-wrapping, which doesn't fit a ground-level localized field.

## Motivation

The asteroid surface currently reads as inert. There is no atmosphere and
no wind, so the world should not have the swirling ambient drift of a
nebula — but in low gravity, loose particles (dust, ice crystals, rock
flake) realistically hang nearly still until something disturbs them. A
dust system grounded in that physical premise gives the surface a sense of
fragility and presence: thrusters kick up plumes that slowly settle,
footsteps stir small motes underfoot, and the air around the lander has
visible texture that sells low-G locality without contradicting the
"airless body" setting.

This is purely a feel/atmosphere change. It does not affect gameplay or
physics.

## Scope

In scope:

- New `SurfaceDustController` in `src/three/`.
- Owned by `LevelViewController`, ticked each frame.
- Anchor swaps between lander position (state = `lander`) and player
  position (state = `eva`).
- Hidden + tick-suppressed when state is `bunker-interior`,
  `cinematic`, or `exfil`.
- Per-asteroid `surface.dust` JSON block (optional; default fallback
  baked into the controller).
- Ambient suspended layer (near-static particles wrapping a small bubble
  around the anchor).
- Kickup events:
  - Lander main thruster firing while altitude-above-ground is below a
    small threshold.
  - EVA footstep cadence (grounded + moving + step phase rollover).

Out of scope:

- Wind or idle drift behavior. Particles are stationary when no event
  fires, matching the airless framing.
- Side/RCS thruster kickup. Main thruster only on day one to avoid
  visual overkill; can be added later if desired.
- Bunker-interior dust (e.g. dust motes in shafts of light). Bunker
  interiors stay clean.
- Trail effects from sustained motion. Footstep cadence and main-thruster
  pulses are the only emission triggers for v1.
- Sound effects. Audio coupling can come later as a follow-up.
- Tuning every existing asteroid JSON. Only Psyche gets explicit values
  on day one; the rest fall back to the universal default until the user
  tunes them.

## Architecture

### Controller

`src/three/SurfaceDustController.ts`

Implements `Tickable`. Constructed by `LevelViewController` once the
asteroid surface is available. Holds:

- A single `THREE.Points` mesh with a shared particle pool.
- An ambient sub-pool (suspended layer) and a kickup sub-pool, drawn
  from the same buffer geometry but tracked with separate index ranges
  so the GPU upload is one buffer.
- The active anchor (`THREE.Object3D | null`) — the lander or player.
- Cached configuration loaded from the active asteroid JSON.
- An "active" flag toggled by the level state machine.

Key methods:

- `setAnchor(obj: THREE.Object3D | null)` — called when state changes
  between `lander` and `eva`.
- `setActive(active: boolean)` — false during `bunker-interior`,
  `cinematic`, `exfil`. Hides the points mesh and short-circuits tick.
- `emitKickup(origin: THREE.Vector3, intensity: number)` — pulls N
  particles from the kickup pool, repositions at `origin` plus a small
  upward-and-outward velocity scaled by `intensity`, marks them as
  drifting back to ambient.
- `tick(dt: number)` — wraps ambient particles that drift outside the
  bubble back to a fresh point inside it; integrates kickup particles
  toward their settle target; advances settle timers.
- `dispose()` — frees geometry, material.

### Integration in `LevelViewController`

- Construct after `asteroidSurface` is ready (so we know which asteroid
  JSON to load dust config from).
- Subscribe to state-machine transitions:
  - `lander` → `setAnchor(lander)`, `setActive(true)`.
  - `eva` → `setAnchor(player.group)`, `setActive(true)`.
  - `bunker-interior` / `cinematic` / `exfil` → `setActive(false)`.
- Each frame in the existing tick loop:
  - Lander kickup: if state is `lander`, lander main thruster is firing,
    and altitude-above-ground sample < `LANDER_KICKUP_ALTITUDE`, call
    `emitKickup` at the lander base position with intensity scaled by
    thrust magnitude. Rate-limited (~20 Hz).
  - EVA kickup: if state is `eva`, player is grounded and moving, and
    the existing footstep cadence rolls over a step, call `emitKickup`
    at the player's foot position with low intensity.

The thruster-firing and footstep-cadence signals already exist in the
controller (used for SFX); the dust controller just listens to the same
edges.

### Data shape

Extend the existing `surface` block in `src/data/asteroids/*.json`. The
existing `dustCoverage` field is **reused** as the ambient density
multiplier (1.0 = full count, 0.0 = no ambient particles), so no new
density field is added. A new optional `dust` sub-block carries the
visual config:

```json
"surface": {
  "dustCoverage": 0.1,
  "dust": {
    "color": "#ccbb88",
    "accentColor": "#eeeedd",
    "ambientCount": 120,
    "kickupCount": 80,
    "size": 0.04,
    "settleSeconds": 1.4,
    "bubbleRadius": 1.2
  }
}
```

Field reference:

| Field            | Type            | Range / Example         | Purpose                                                                |
| ---------------- | --------------- | ----------------------- | ---------------------------------------------------------------------- |
| `color`          | hex string      | `"#ccbb88"`             | Primary tint for the bulk of particles.                                |
| `accentColor`    | hex string      | `"#eeeedd"`             | Optional secondary tint; ~25% of particles get this color.             |
| `ambientCount`   | integer         | 80–200                  | Particles in the suspended layer.                                      |
| `kickupCount`    | integer         | 40–120                  | Additional pool reserved for kickup puffs.                             |
| `size`           | number (units)  | 0.02–0.08               | World-space point size with `sizeAttenuation = true`.                  |
| `settleSeconds`  | number (s)      | 0.8–2.5                 | Time for a kicked particle to slow and rejoin ambient.                 |
| `bubbleRadius`   | number (units)  | 0.8–2.0                 | Radius of the suspended layer bubble around the anchor.                |

All fields in `dust` are optional. Any missing field falls back to the
universal default (defined as constants at the top of the controller).
If the entire `dust` block is omitted, every asteroid still gets a
baseline gray-tan dust look governed by `dustCoverage`.

### Default values (constants)

Defined at the top of `SurfaceDustController.ts`:

```
DEFAULT_COLOR          = '#a89a82'   // generic gray-tan grit
DEFAULT_ACCENT_COLOR   = '#cfc4ad'
DEFAULT_AMBIENT_COUNT  = 120
DEFAULT_KICKUP_COUNT   = 80
DEFAULT_SIZE           = 0.04
DEFAULT_SETTLE_SECONDS = 1.4
DEFAULT_BUBBLE_RADIUS  = 1.2

LANDER_KICKUP_ALTITUDE       = 3        // units above terrain to enable kickup
LANDER_KICKUP_RATE_HZ        = 20       // emit cap while thruster fires
LANDER_KICKUP_PARTICLES_PER  = 4        // particles per emission
EVA_KICKUP_PARTICLES_PER_STEP = 2
KICKUP_UPWARD_SPEED          = 0.6      // initial vertical velocity (u/s)
KICKUP_OUTWARD_SPEED         = 0.4      // initial radial velocity (u/s)
```

These follow the project's "no magic numbers" rule — every tuning lever
is a named constant.

### Psyche values (day-one tuning)

`src/data/asteroids/psyche.json` gets:

```json
"dust": {
  "color": "#b8a878",
  "accentColor": "#dccfa0",
  "ambientCount": 100,
  "kickupCount": 60,
  "size": 0.035,
  "settleSeconds": 1.6
}
```

(Warm metallic-flake palette to match Psyche's iron-nickel composition.)

All other asteroids stay default until tuned.

## Data flow

```
asteroid JSON ─► AsteroidConfig ─► LevelViewController
                                       │
                                       ├─ new SurfaceDustController(config.surface.dust)
                                       │
                                       ├─ on state transition: setAnchor + setActive
                                       │
                                       └─ each tick:
                                            ├─ thruster + altitude → emitKickup
                                            ├─ footstep edge → emitKickup
                                            └─ controller.tick(dt)
```

## Error handling

- Missing `dust` block → fall back to defaults silently. Not an error.
- Missing individual fields inside `dust` → fall back to per-field
  default silently.
- Anchor null → controller skips tick (no crash). Re-attaches on next
  `setAnchor`.
- Asteroid JSON loaded after controller construction is not a real
  scenario in the current flow — JSON is loaded synchronously before
  the level scene wires up. No async edge case to handle.

## Testing

`src/three/` is intentionally outside the test boundary per project
conventions (tests focus on `src/lib/`). The controller is visual and
will be validated in-engine.

If any **pure data parsing** logic is split out (e.g. a
`parseSurfaceDustConfig(json) → ResolvedDustConfig` helper that fills
defaults), that helper goes in `src/lib/level/` and gets a unit test
covering:

- All fields present → returned as-is.
- `dust` block missing → all defaults.
- Partial `dust` block → only missing fields filled with defaults.
- Invalid hex color → falls back to default color (no throw).

## Acceptance

- Driving the lander on Psyche kicks up visible dust under the main
  thruster when close to the ground; no dust at altitude.
- Walking in EVA on Psyche stirs small puffs at each footstep; standing
  still is silent and visually quiet.
- Entering a bunker interior fully suppresses dust; exiting restores it.
- An asteroid without a `dust` JSON block still shows baseline gray-tan
  dust on its surface.
- `bun run type-check`, `bun run lint`, and `bun run test:unit` all
  pass.

## Open questions

None at design time. Tuning passes (counts, settle time, color) are
expected during implementation per the user's "iterate on feel"
preference.
