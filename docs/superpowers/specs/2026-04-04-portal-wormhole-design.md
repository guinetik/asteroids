# Portal Wormhole — Design Spec

**Author:** guinetik
**Date:** 2026-04-04
**Status:** Approved

## Overview

A one-shot arrival portal for the shuttle demo scene. When a player arrives from another Vibe Jam game (`?portal=true`), a wormhole manifests near the sun, ejects the shuttle with the incoming velocity params, pulses, then collapses. If no portal arrival, the wormhole never spawns and the shuttle uses its normal `respawn()` flow.

## Visual Design

The wormhole is an **inverted gravity well** — it pushes the SpaceTimeGrid upward instead of pulling it down, creating a dome/peak on the grid surface.

### Grid Deformation

Register a source with `SpaceTimeGrid.addSource()` using a **negative mass** value (e.g., `-0.6`). This produces an upward bulge that contrasts with the sun's downward well. During collapse, the mass lerps from `-0.6` toward `0` over ~3 seconds, flattening the grid back to normal.

### Glow Mesh

A small emissive sphere at the wormhole's peak position, blue/white colored to contrast the sun's warm orange glow. Uses the same composition pattern as `CelestialBody` (sphere + additive-blended glow sprite) but at a smaller scale (~15 unit radius). During collapse, the glow fades to zero opacity and the mesh is removed from the scene.

### Energy Pulse on Ejection

When the shuttle exits, the glow mesh scales up briefly (1.5x over ~0.3 seconds) before the collapse animation begins. This marks the moment of arrival visually.

## Placement

Fixed position near the sun at a short radius (~150 units from origin). This places it inside the shuttle's normal spawn range (400–1500 units) and close enough that the sun's gravity is immediately felt after ejection. The angular position is randomized each time.

## Arrival Flow

1. `ShuttleViewController.init()` instantiates `VibePortal` and checks `isArrival`.
2. If `true`:
   a. Create `PortalWormhole` at the chosen position near the sun.
   b. Add its negative-mass source to `SpaceTimeGrid`.
   c. Add the glow mesh to the scene.
   d. Position the shuttle at the wormhole's peak (riding the grid's upward deformation).
   e. Set the shuttle's initial heading to point away from the sun.
   f. Apply initial velocity from portal params: use `speed_x`/`speed_z` if provided, otherwise use scalar `speed` along the away-from-sun direction. Default to a reasonable ejection speed (~40 units/s) if no speed params exist.
   g. Trigger the energy pulse, then begin the collapse animation.
3. If `false`: skip wormhole creation entirely. Shuttle spawns via normal `respawn()`.

## Architecture

### `PortalWormhole` — `src/three/PortalWormhole.ts`

New controller implementing `Tickable`. Responsibilities:

- **Construction:** Takes position (`THREE.Vector3`) and a reference to `SpaceTimeGrid`.
- **`group`:** `THREE.Group` containing the glow sphere and sprite, added to the scene by the view controller.
- **`gridSource`:** Object registered with `SpaceTimeGrid.addSource()`. Holds the negative mass value that the wormhole mutates during collapse.
- **`eject()`:** Triggers the energy pulse → collapse sequence. Sets internal state to `collapsing`.
- **`tick(dt)`:** During collapse, lerps the grid source mass toward 0, fades glow opacity, and removes meshes when fully collapsed. Emits a `done` flag (or calls a callback) when collapse is complete so the view controller can unregister it from the tick handler.
- **`dispose()`:** Cleans up geometry, materials, and sprites.

### State Machine

```
idle → ejecting (pulse) → collapsing (fade over ~3s) → done (removed)
```

- `idle`: Wormhole is present, grid is deformed, glow is active. Shuttle is positioned at the peak.
- `ejecting`: Energy pulse plays (scale glow 1.5x over 0.3s). Shuttle receives velocity.
- `collapsing`: Negative mass lerps to 0, glow fades, mesh shrinks. Duration ~3 seconds.
- `done`: All meshes removed, grid source zeroed. Controller signals completion.

### Integration in `ShuttleViewController`

- Import `VibePortal` from `src/lib/portal.ts`.
- Import `PortalWormhole` from `src/three/PortalWormhole.ts`.
- In `init()`, after scene setup, check `vibePortal.isArrival`.
- If arriving: create wormhole, register with tick handler at `TICK_PRIORITY_ANIMATION`, position shuttle, apply velocity, call `wormhole.eject()`.
- On wormhole completion callback: unregister from tick handler, dispose.

### Minor Changes

- **`ShuttleController`** — `velocity` is currently `private`. Add a public `setVelocity(v: THREE.Vector3)` method so the view controller can inject the portal ejection velocity. `position` is already public via the `group`.

### No Changes Needed

- `src/lib/portal.ts` — already provides all needed arrival data via `VibePortal`.
- `SpaceTimeGrid` — already supports arbitrary sources; negative mass produces upward deformation naturally.

## Constraints

- **One-shot only.** The wormhole exists for arrival and then disappears. No re-entry.
- **No departure mechanic.** Departing the game is a separate feature, not part of this spec.
- **No gameplay effect.** The wormhole's negative mass is visual only — it does not repel the shuttle via gravity. The shuttle's initial velocity comes from portal params, not from the wormhole's deformation.

## Data

No JSON data files needed. The wormhole is scene-level configuration, not game content. Constants (negative mass value, collapse duration, glow color, placement radius) live as named constants in `PortalWormhole.ts`.
