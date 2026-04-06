# Map Overlay System Design

**Date:** 2026-04-05
**Status:** Approved

## Overview

A full-screen tactical map activated by pressing M during flight. The simulation fully pauses, the camera smoothly transitions to a top-down orthographic view of the entire solar system, and a Vue HUD overlay renders tactical information (labels, distances, gravity rings). Pressing M or Escape closes the map and resumes play.

## Architecture

The map follows the project's standard two-layer pattern:

- **Diegetic layer (Three.js):** The existing 3D scene viewed from above — planet meshes, orbit lines, spacetime grid, ship model. No new 3D objects required beyond the orthographic camera.
- **Non-diegetic layer (Vue):** A Vue overlay component projected from world-to-screen coordinates via the ortho camera. Renders tactical HUD elements on top of the 3D view.

## State Machine

The map is a first-class state `'map'` in the MapViewController state machine.

### Transitions

| From | To | Trigger | Guard |
|------|----|---------|-------|
| `'flying'` | `'map'` | M key (one-shot) | Not in `'dead'` state, not during orbit capture transition |
| `'map'` | `'flying'` | M key or Escape (one-shot) | Always allowed |

### State Behavior

**On enter (`'flying' → 'map'`):**
1. Store current perspective camera position, rotation, and target
2. Freeze shuttle (`shuttleController.freeze()`) — no thrust, no fuel consumption, no movement
3. Disable all gameplay input actions (thrust, brake, yaw, orbit, doors)
4. Stop thruster animations and VFX
5. Begin camera transition animation (see Camera section)
6. GameLoop continues running (needed for transition animation and rendering)

**While in `'map'`:**
- All physics tickables skipped (shuttle, gravity, orbit capture)
- All animation tickables skipped (thruster effects, orrery, portal boundary)
- Only camera transition, composer render, and the ortho camera remain active
- No mouse interaction (no pan, no zoom, no orbit controls)
- Only M and Escape keys are listened for

**On exit (`'map' → 'flying'`):**
1. Begin reverse camera transition
2. On transition complete: restore perspective camera state
3. Unfreeze shuttle
4. Re-enable all gameplay inputs
5. Resume all physics and animation tickables

## Camera

### Orthographic Camera

- **Type:** `THREE.OrthographicCamera`
- **Position:** `(shipX, HIGH_Y, shipZ)` looking straight down (`-Y`)
- **Frustum:** Sized to cover the full solar system. Kuiper Belt edge is ~2400 units; frustum covers approximately ±2600 units in X and Z, maintaining aspect ratio.
- **Created once** during MapViewController init, reused on each map open.

### Transition In (~1.0s total)

**Phase 1 — Perspective pull-up (~0.75s):**
1. Capture current perspective camera position and rotation
2. Lerp the perspective camera upward (increasing Y) while flattening the pitch toward straight-down
3. Use the game loop delta for smooth animation
4. Ease function: ease-in-out

**Phase 2 — Ortho zoom-out (~0.25s):**
1. Swap the EffectComposer's render pass to use the ortho camera
2. Start with a tight frustum centered on the ship
3. Ease the frustum outward to the full-system view
4. Ease function: ease-out

### Transition Out (~0.5s total)

Reverse of the above:
1. Zoom ortho frustum from full-system back to ship-centered tight crop (~0.25s ease-in)
2. Swap back to perspective camera
3. Lerp perspective camera from elevated position back to stored position/rotation (~0.25s ease-out)
4. On complete: resume `'flying'` state

## Tactical HUD Overlay (Vue Component)

A `MapOverlay.vue` component rendered in `MapView.vue` alongside the existing HUD components. Visible only when state is `'map'`.

All positions are computed once on map open by projecting world coordinates through the ortho camera to screen space. No per-frame updates needed (scene is frozen).

### Elements

#### Planet Labels
- Text labels positioned at each body's screen-projected location
- Offset slightly above the body to avoid overlap with the mesh
- Styled to match existing HUD aesthetic (monospace, semi-transparent background)
- Includes: Sun + all 8 planets

#### Ship Marker
- Pulsing reticle/icon at the shuttle's screen-projected position
- Must be visible at full zoom-out despite the shuttle's small scale (0.01×)
- CSS animation for the pulse — no JS animation needed (scene is frozen)

#### Heading Arrow
- Arrow extending from the ship marker in the direction of the shuttle's current velocity vector
- Length proportional to speed magnitude
- Shows the direction the ship was traveling when the map was opened

#### Distance Readouts
- Thin lines from the ship marker to the nearest 2-3 celestial bodies
- Distance value displayed along each line (in AU or game units — match existing telemetry convention)
- Lines styled as dashed, semi-transparent

#### Gravity Influence Rings
- Circles around each massive body showing two radii:
  - **Influence radius** (`influenceRadius(mass)` = `influenceScale × √mass`): dashed circle, subtle color
  - **Event horizon radius** (`eventHorizonRadius(mass)` = `eventHorizonScale × √mass`): solid circle, danger color (red/orange)
- Uses existing gravity math from `src/lib/physics/gravity.ts`
- Only shown for bodies with mass > 1e-5 M☉ (same filter as SpaceTimeGrid)

## Input Handling

### During `'map'` state:
| Key | Action |
|-----|--------|
| M | Close map, return to `'flying'` |
| Escape | Close map, return to `'flying'` |
| All other keys | Ignored |

### Blocked inputs:
- Thrust (W), Brake (S), Yaw (A/D)
- Orbit action (E), Toggle doors (F), Toggle camera (C)
- Mouse orbit/zoom/pan — OrbitControls disabled

## File Structure

| File | Purpose |
|------|---------|
| `src/components/MapOverlay.vue` | Vue tactical HUD overlay component |
| `src/lib/mapState.ts` | Map state logic — transition timing, freeze/unfreeze coordination |
| `src/three/MapCamera.ts` | Orthographic camera setup, frustum sizing, transition animations |
| `src/views/MapViewController.ts` | Modified — new `'map'` state, M key binding, tick gating |
| `src/views/MapView.vue` | Modified — add MapOverlay component |
| `src/lib/InputManager.ts` | Modified — add `'toggleMap'` action bound to M key |

## Data Flow

```
M key pressed (InputManager one-shot)
  → MapViewController detects 'toggleMap' action
  → State transitions to 'map'
  → shuttleController.freeze()
  → All gameplay tickables gated off
  → MapCamera begins transition animation
  → On transition complete:
      → MapOverlay receives projected positions via callback
      → Vue overlay renders tactical elements

M or Escape pressed
  → State begins transition to 'flying'
  → MapCamera begins reverse transition
  → On transition complete:
      → shuttleController.unfreeze()
      → All tickables resume
      → MapOverlay hidden
```

## Constants

All numeric values extracted to a JSON config or named constants:

| Constant | Value | Description |
|----------|-------|-------------|
| `MAP_FRUSTUM_HALF_SIZE` | ~2600 | Ortho frustum half-extent in world units (full system view) |
| `MAP_FRUSTUM_INITIAL_HALF_SIZE` | ~50 | Ortho frustum half-extent at zoom-out start (tight crop around ship) |
| `MAP_CAMERA_HEIGHT` | 3000 | Y position of the ortho camera |
| `TRANSITION_IN_PERSPECTIVE_DURATION` | 0.75 | Seconds for perspective pull-up |
| `TRANSITION_IN_ORTHO_DURATION` | 0.25 | Seconds for ortho zoom-out |
| `TRANSITION_OUT_ORTHO_DURATION` | 0.25 | Seconds for ortho zoom-in |
| `TRANSITION_OUT_PERSPECTIVE_DURATION` | 0.25 | Seconds for perspective restore |
| `INFLUENCE_RING_MASS_THRESHOLD` | 1e-5 | Minimum mass for gravity ring display |
| `NEAREST_BODY_COUNT` | 3 | Number of distance readouts shown |

## Testing Strategy

Focus on `src/lib/` domain logic:

- **mapState.ts:** Test state transitions (flying → map → flying), guard conditions (blocked during dead/orbit), freeze/unfreeze sequencing
- **MapCamera.ts:** Test frustum calculation for different aspect ratios, transition progress interpolation
- **Gravity ring math:** Already tested in `gravity.spec.ts` — `influenceRadius` and `eventHorizonRadius`
- **Distance calculations:** Test nearest-body selection and distance formatting
- **Screen projection:** Test world-to-screen coordinate mapping with known ortho camera parameters

No need to test Vue components or Three.js rendering directly (per project ground rules).
