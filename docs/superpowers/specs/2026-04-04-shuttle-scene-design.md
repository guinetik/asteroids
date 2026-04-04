# Shuttle Scene Design

## Overview

Set up a Three.js scene with the NASA shuttle model, keyboard-driven flight controls, door animation toggling, and a particle star background. This is the foundational 3D layer for the Asteroid Lander game — the shuttle navigating through a top-down solar system map.

## File Structure

```
src/three/SceneManager.ts          — renderer, camera, controls, animation loop, resize handling
src/three/ShuttleController.ts     — model loading, animation mixer, movement/physics, nozzle placement
src/three/ThrusterEffectController.ts — particle effects for thrust (orange) and brake (blue)
src/three/StarFieldController.ts   — particle star background
src/views/HomeView.vue             — default route, canvas mount point, minimal template
src/views/HomeViewController.ts    — bridges Vue lifecycle to SceneManager (init/dispose)
```

## SceneManager

Standalone Three.js orchestrator. No Vue dependency — receives a DOM element to mount into.

### Responsibilities

- Create `WebGLRenderer` (antialias, black clear color), `PerspectiveCamera`, `Scene`
- Own the `requestAnimationFrame` loop, computing delta time and calling registered update callbacks
- Handle window resize (update renderer size + camera aspect)
- Manage `OrbitControls` (target tracks shuttle position)
- Provide chase cam mode: camera locked behind/above shuttle, auto-rotates with shuttle heading
- Toggle between orbit/chase with **C** key; OrbitControls disabled during chase cam
- Expose `mount(container: HTMLElement)`, `dispose()`, and `addUpdatable(fn)` methods

### Camera Defaults

- Perspective camera positioned above and slightly behind the shuttle (top-down-ish view)
- OrbitControls with damping enabled, target follows shuttle position each frame

## ShuttleController

Lives in `src/three/`. Owns the shuttle mesh, animation, and movement state.

### Model Loading

- `GLTFLoader` with `DRACOLoader` (shuttle.glb uses `KHR_draco_mesh_compression`)
- Draco decoder from Three.js examples path (`three/examples/jsm/libs/draco/`)
- Returns the loaded `Group` to be added to the scene

### Door Animation

- `AnimationMixer` on the shuttle model
- Find the `shutAction` clip from the loaded animations
- **F key** toggles: play forward to open, play reversed to close
- Track open/closed state to determine direction on each press

### Movement Model

Top-down space navigation. The shuttle flies on the XZ plane.

| Key | Action |
|-----|--------|
| W | Thrust forward (along shuttle's facing direction) |
| S | Inertia dampener — brake toward zero velocity |
| A | Strafe left |
| D | Strafe right |
| Q | Yaw left (rotate around Y axis) |
| E | Yaw right (rotate around Y axis) |

Physics-lite model:
- `velocity: Vector3` — current movement vector
- `THRUST_FORCE` — acceleration applied per second while W held
- `BRAKE_FACTOR` — multiplier that decelerates velocity toward zero while S held (e.g. `0.95` per frame)
- `STRAFE_FORCE` — acceleration for A/D lateral movement
- `YAW_SPEED` — radians per second for Q/E rotation
- `MAX_SPEED` — velocity magnitude cap
- No gravity, no friction when no keys pressed (true space inertia)

All numeric values as named constants at the top of the file.

### Nozzle Placement (eng.glb / rcs.glb)

The merged `shuttle.glb` includes `eng` and `rcs` nodes from the separate nozzle files, but they are **not positioned** — they sit at origin with no translation into the orbiter's frame.

Per `docs/space-shuttle-glb-pipeline.md`, the approach is:

1. After loading, traverse the scene graph to find nodes named `eng` and `rcs`
2. Find the OMS pod reference nodes on the main orbiter (names containing `OMS` and `back`)
3. Use `getWorldPosition()` on the OMS pod nodes to determine where the nozzles should sit
4. Reparent nozzle nodes to the OMS pod nodes via `attach()`, adjusting position/rotation until they align with the aft pod faces
5. Fine-tune offset constants until visual alignment is correct (iterative — values stored as named constants)

The nozzles are the visual anchor for thruster effects.

### Thruster Effects (ThrusterEffectController)

Particle-based visual feedback for thrust and braking, attached to the shuttle's aft.

**Thrust effect (W key held):**
- Orange/yellow particles emitting from the `eng` nozzle positions, trailing behind the shuttle
- Particles spawn at nozzle position, inherit shuttle velocity + random spread, fade out over ~0.5s
- Intensity scales with current thrust (more particles when accelerating)

**Brake effect (S key held):**
- Blue glowing particles emitting from the shuttle's front/sides — a futuristic inertia dampener look
- Cooler, more diffuse spread than thrust. Particles radiate outward from the shuttle body
- Blue color (#4488ff range), slight glow via additive blending

**Implementation:**
- Pool of `THREE.Points` or small particle system per effect
- Each frame: spawn new particles if active, update positions, fade alpha, recycle dead particles
- `PointsMaterial` with `blending: AdditiveBlending`, `depthWrite: false`, `transparent: true`
- Named constants for: particle count, spawn rate, lifetime, spread, colors, sizes

### Input Handling

- `KeyboardController` or inline key tracking (Set of currently pressed keys)
- `keydown`/`keyup` listeners added on init, removed on dispose
- Update method reads key state each frame and applies forces/rotation

## StarFieldController

- `THREE.Points` geometry with ~2000 vertices randomly distributed in a large sphere (radius ~500)
- `PointsMaterial` — white, small size, no depth write
- Added to scene, static (does not move — gives parallax as shuttle moves)

## HomeView + HomeViewController

### HomeView.vue

- Single `<div ref="container">` filling the viewport
- No inline styles — use Tailwind classes for full-width/height
- Imports and uses `HomeViewController`

### HomeViewController.ts

- `init(container: HTMLElement)` — creates `SceneManager`, `ShuttleController`, `StarFieldController`; mounts scene into container
- `dispose()` — tears down everything, removes listeners
- Called from Vue `onMounted` / `onUnmounted`

## Router

- Add `HomeView` as the default `/` route in `src/router/index.ts`

## Styling

- Canvas container: `w-screen h-screen` (or equivalent Tailwind), no overflow
- No HUD or UI elements in this iteration

## Dependencies

Already installed:
- `three` ^0.183.2
- `@types/three` ^0.183.1

No new dependencies needed. DRACOLoader ships with Three.js.

## Out of Scope

- Solar system map, planets, orbits
- HUD, UI overlays
- Collision detection
- Sound
- Procedural door animation fallback (using baked clips only)
- RCS thruster effects (only main engine thrust and brake dampener for now)
