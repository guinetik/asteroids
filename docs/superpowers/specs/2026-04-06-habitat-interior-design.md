# Habitat Interior Scene Design

A walkable first-person interior inside the shuttle's habitat module, accessible from the map view via the H key. The player can walk around, look through the glass at stars, and interact with furniture.

**Author:** guinetik
**Date:** 2026-04-06
**Spec:** docs/superpowers/specs/2026-04-06-habitat-interior-design.md

---

## Overview

The habitat interior is a separate Three.js scene that renders on top of the map view with a smooth camera transition. It has its own lighting, starfield, and FPS movement. The map game loop freezes while the player is inside, and resumes in the exact same state (free flight, orbiting, etc.) when they leave.

## State Machine: HabitatState

New file: `src/lib/habitatState.ts`

Four phases with timed transitions:

```
map ──[enter()]──> transitioning_in ──[0.8s]──> habitat ──[leave()]──> transitioning_out ──[0.5s]──> map
```

| Phase | Duration | Description |
|-------|----------|-------------|
| `map` | — | Habitat inactive. Map runs normally. |
| `transitioning_in` | 0.8s | Camera fly-in animation. Map frozen. |
| `habitat` | — | FPS mode inside the habitat. |
| `transitioning_out` | 0.5s | Camera fly-out animation. Map still frozen. |

Same implementation pattern as `MapState`: phase enum, elapsed timer, normalized `progress` getter (0–1), `enter()`/`leave()` guards, `tick(dt)` auto-advances phases.

**Orthogonal to orbit state.** The orbit system (`free | approaching | orbiting`) is completely unaware of the habitat. Whatever orbit state the player was in freezes when entering the habitat and resumes on exit.

## HabitatInteriorScene

New file: `src/three/HabitatInteriorScene.ts`

A self-contained Three.js scene representing the habitat cylinder interior at human/walkable scale.

### Contents

- **Habitat cylinder geometry**: Glass shell + wireframe girders, reusing the same procedural approach as `HabitatModule` but at full scale (not 0.01x map scale). Open at one end (cockpit side), capped at the other (tank side).
- **Furniture**: `bed.glb` and `table.glb` loaded via `loadGLB()`. Bed in the center, table against the tank-side wall. Same relative positioning as the exterior `HabitatModule`, but at walkable scale.
- **Lighting**: Warm interior point light + subtle ambient. Blue-ish light through the glass from "outside."
- **Starfield**: Simple decorative particle system outside the glass. Not synced to the map's actual star positions.
- **FPS Camera**: Creates and owns an `FpsCamera` instance from `src/three/FpsCamera.ts`.
- **Player controller**: Simple WASD movement within a cylindrical collision boundary (clamp XZ to `radius - margin`). Flat floor. No jump, no sprint.
- **Interaction zone**: Proximity trigger near the table. When the player is within ~2 units, emits a prompt. F key triggers the `onInteract` callback.

### API

```typescript
class HabitatInteriorScene {
  /** Load models and build the scene. Call once. */
  async load(): Promise<void>

  /** Per-frame update: FPS movement, interaction checks. */
  tick(dt: number, input: InputManager): void

  /** The interior scene's FPS camera (for renderPass swap). */
  getCamera(): THREE.PerspectiveCamera

  /** The interior Three.js scene (for renderPass swap). */
  getScene(): THREE.Scene

  /** Clean up all resources. */
  dispose(): void

  /** Fired when player interacts with furniture. */
  onInteract: ((target: string) => void) | null

  /** Fired when player enters/leaves interaction range. */
  onPrompt: ((prompt: string | null) => void) | null

  /** Spawn position + rotation for the FPS camera. */
  getSpawnPosition(): { position: THREE.Vector3; yaw: number }
}
```

Created lazily (first H press) by MapViewController, then reused on subsequent visits.

## Transition Animation

### Enter (map -> habitat)

1. H pressed -> `habitatState.enter()`
2. Map tick freezes (early `return`, same pattern as M key overlay)
3. Swap `renderPass.scene` and `renderPass.camera` to the habitat interior
4. Camera animation over 0.8s with easeInOut:
   - Start: current map vehicle camera position/rotation
   - End: habitat FPS camera spawn position (on the bed, facing the table)
   - Lerp position + slerp quaternion using `progress`
5. On complete (`habitat` phase): enable pointer lock, enable FPS input

### Exit (habitat -> map)

1. H or Escape pressed -> `habitatState.leave()`
2. Camera animation over 0.5s (reverse):
   - Start: current FPS camera position/rotation
   - End: map vehicle camera's stored position
3. On complete (`map` phase): swap renderPass back to map scene + vehicle camera, unfreeze map tick, re-enable OrbitControls

### RenderPass Scene Swap

The EffectComposer's `RenderPass` supports swapping both `.scene` and `.camera`:

```typescript
const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
renderPass.scene = habitatScene.getScene()
renderPass.camera = habitatScene.getCamera()
```

Bloom and gravity distortion passes apply to whichever scene is active.

## FPS Movement

Reuses `FpsCamera` from `src/three/FpsCamera.ts`.

- **Input**: WASD walk, mouse look (pointer lock). Same bindings as EVA mode (`FPS_BINDINGS` subset: moveForward, moveBack, moveLeft, moveRight).
- **Collision**: Cylindrical boundary — clamp player XZ to `radius - margin` from cylinder center each frame. No mesh collision.
- **Floor**: Flat bottom of cylinder. No terrain, no slope, no gravity simulation.
- **Spawn**: On the bed, facing the table (toward the tank end). Same spawn every time.

## Interaction

### Table Proximity

- Each tick, check distance from player to table center
- Within ~2 units: emit `onPrompt('F  Shuttle Control')`
- Outside range: emit `onPrompt(null)`
- F key while in range: emit `onInteract('table')`

### Shuttle Control Overlay

New component: `src/components/ShuttleControlOverlay.vue`

- Styled like the existing message dialog (same Tailwind classes/patterns)
- Title: "SHUTTLE CONTROL"
- Close button (X button or Escape key)
- Empty body — placeholder for future content
- Shown/hidden via reactive prop from `MapView.vue`

**While overlay is open:**
- FPS movement paused
- Pointer lock released
- Mouse controls the UI

**On close:**
- Pointer lock re-acquired
- FPS movement resumes

## Vue Wiring

`MapView.vue` gains:
- `ShuttleControlOverlay` component with `v-if` on a reactive boolean
- Interaction prompt display (reuse existing prompt pattern from `OrbitPrompt`)
- `MapViewController` callbacks: `onShuttleControl`, `onHabitatPrompt`

## File Map

### New Files

| File | Purpose |
|------|---------|
| `src/lib/habitatState.ts` | State machine: map <-> transitioning <-> habitat |
| `src/three/HabitatInteriorScene.ts` | Interior scene: models, lighting, starfield, FPS, interaction |
| `src/components/ShuttleControlOverlay.vue` | Vue overlay: title + close button |

### Modified Files

| File | Change |
|------|--------|
| `src/views/MapViewController.ts` | H key handler, habitat state tick, transition rendering, callbacks. Remove FPS camera hack code. |
| `src/views/MapView.vue` | ShuttleControlOverlay component, prompt display, reactive state |
| `src/three/VehicleCamera.ts` | Remove `MAP_HABITAT_CAMERA_CONFIG` |
| `src/three/ShuttleController.ts` | Remove `habitatWorldPosition` getter |

### Untouched

| File | Reason |
|------|--------|
| `src/three/HabitatModule.ts` | Exterior furniture stays as-is (cargo bay decoration) |
| `src/three/FpsCamera.ts` | Reused as-is |
| `src/lib/orbitCapture.ts` | Completely unaware of habitat |
| `src/lib/defaultBindings.ts` | Already has `focusHabitat: ['KeyH']` |
