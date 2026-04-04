# Shuttle Scene Design

## Overview

Set up the foundational game architecture and a Three.js shuttle scene. This establishes the game loop, tick system, centralized input, and the pattern for how Vue routes act as game "maps" — each with its own scene, controllers, and lifecycle. The shuttle scene is the first implementation of this pattern.

## File Structure

```
src/lib/GameLoop.ts                — core rAF loop, fixed + variable tick dispatch
src/lib/TickHandler.ts             — tick registry, subscribers register/unregister tick callbacks
src/lib/InputManager.ts            — centralized keyboard state, action bindings, key-to-action mapping
src/three/SceneManager.ts          — renderer, camera, controls, resize; registers itself as a tick subscriber
src/three/ShuttleController.ts     — model loading, animation mixer, movement/physics, nozzle placement
src/three/ThrusterEffectController.ts — particle effects for thrust (orange) and brake (blue)
src/three/StarFieldController.ts   — particle star background
src/views/HomeView.vue             — default route, canvas mount point, minimal template
src/views/HomeViewController.ts    — bridges Vue lifecycle to game systems (init/dispose)
```

## Core Game Systems (src/lib/)

These are framework-agnostic, pure TS. No Three.js or Vue imports.

### GameLoop

The single `requestAnimationFrame` owner for the entire application. Only one loop runs at a time.

```
interface GameLoop {
  start(): void
  stop(): void
  isRunning: boolean
}
```

- Computes `deltaTime` (seconds) each frame, clamped to a max (e.g. 0.1s) to prevent spiral-of-death on tab-away
- Each frame calls `TickHandler.tick(deltaTime)`
- Vue route transitions call `stop()` on unmount, `start()` on mount — clean handoff between "maps"

### TickHandler

Central registry for per-frame update callbacks. The GameLoop drives it; everything else subscribes to it.

```
interface Tickable {
  tick(dt: number): void
}

interface TickHandler {
  register(tickable: Tickable, priority?: number): void
  unregister(tickable: Tickable): void
  tick(dt: number): void
}
```

- Subscribers are called in priority order each frame (lower = earlier)
- Suggested priority bands: `INPUT = 0`, `PHYSICS = 10`, `ANIMATION = 20`, `RENDER = 30`
- This means: input is read first, then physics updates positions, then animations mix, then the scene renders
- Controllers implement `Tickable` and register themselves

### InputManager

Centralized keyboard state with action-based bindings. No controller polls `keydown` directly.

```
interface InputManager {
  isActionActive(action: string): boolean
  wasActionPressed(action: string): boolean  // true only on the frame the key went down
  setBindings(bindings: Record<string, string[]>): void
  tick(): void   // called at INPUT priority to update edge detection (pressed this frame vs held)
  dispose(): void
}
```

- Listens to `keydown`/`keyup` on `window`, tracks a `Set<string>` of currently held keys
- Maps keys to named **actions** via a bindings config (data-driven, rebindable):

```ts
const DEFAULT_BINDINGS: Record<string, string[]> = {
  thrust: ['KeyW'],
  brake: ['KeyS'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  toggleDoors: ['KeyF'],
  toggleCamera: ['KeyC'],
}
```

- Controllers query actions, not raw keys: `inputManager.isActionActive('thrust')`
- `wasActionPressed()` for one-shot actions (door toggle, camera toggle) — returns true only on the frame the key transitions from up to down
- The InputManager itself is a `Tickable` at priority `INPUT` — it updates edge-detection state each frame before other systems read it

### How It Fits Together

```
GameLoop (owns rAF)
  └─ TickHandler.tick(dt)
       ├─ InputManager.tick()          [priority 0  — INPUT]
       ├─ ShuttleController.tick(dt)   [priority 10 — PHYSICS]
       ├─ ThrusterEffectController.tick(dt)  [priority 20 — ANIMATION]
       └─ SceneManager.tick(dt)        [priority 30 — RENDER]
```

### Vue Route = Game Map

Each Vue route is a game "map" or screen. The pattern:

1. `onMounted`: ViewController creates the GameLoop, TickHandler, InputManager, SceneManager, and scene-specific controllers. Registers all tickables. Calls `gameLoop.start()`.
2. `onUnmounted`: ViewController calls `gameLoop.stop()`, unregisters all tickables, disposes controllers and SceneManager.

Future screens (menu, landing scene, etc.) follow the same pattern — create their own loop + tick handler + controllers. One active loop at a time.

## SceneManager

Three.js orchestrator. Implements `Tickable`. No Vue dependency — receives a DOM element.

### Responsibilities

- Create `WebGLRenderer` (antialias, black clear color), `PerspectiveCamera`, `Scene`
- On `tick(dt)`: update OrbitControls, render the scene
- Handle window resize (update renderer size + camera aspect)
- Manage `OrbitControls` (target tracks shuttle position)
- Provide chase cam mode: camera locked behind/above shuttle, auto-rotates with shuttle heading
- Toggle between orbit/chase via `toggleCamera()` (called by ViewController when InputManager reports `toggleCamera` action pressed)
- Expose `mount(container)`, `dispose()`, `addToScene(object)`, `removeFromScene(object)`

### Camera Defaults

- Perspective camera positioned above and slightly behind the shuttle (top-down-ish view)
- OrbitControls with damping enabled, target follows shuttle position each frame

## ShuttleController

Lives in `src/three/`. Implements `Tickable`. Owns the shuttle mesh, animation, and movement state.

### Model Loading

- `GLTFLoader` with `DRACOLoader` (shuttle.glb uses `KHR_draco_mesh_compression`)
- Draco decoder from Three.js examples path (`three/examples/jsm/libs/draco/`)
- Returns the loaded `Group` to be added to the scene

### Door Animation

- `AnimationMixer` on the shuttle model
- Find the `shutAction` clip from the loaded animations
- Toggle via `toggleDoors` action: play forward to open, play reversed to close
- Track open/closed state to determine direction on each press

### Movement Model

Top-down space navigation. The shuttle flies on the XZ plane. Reads actions from InputManager.

| Action | Effect |
|--------|--------|
| `thrust` | Accelerate forward (along shuttle's facing direction) |
| `brake` | Inertia dampener — decelerate toward zero velocity |
| `strafeLeft` / `strafeRight` | Lateral movement |
| `yawLeft` / `yawRight` | Rotate around Y axis |

Physics-lite model:
- `velocity: Vector3` — current movement vector
- `THRUST_FORCE` — acceleration applied per second while thrust active
- `BRAKE_FACTOR` — multiplier that decelerates velocity toward zero (e.g. `0.95` per frame)
- `STRAFE_FORCE` — acceleration for lateral movement
- `YAW_SPEED` — radians per second for rotation
- `MAX_SPEED` — velocity magnitude cap
- No gravity, no friction when no input (true space inertia)

All numeric values as named constants.

### Nozzle Placement (eng.glb / rcs.glb)

The merged `shuttle.glb` includes `eng` and `rcs` nodes from the separate nozzle files, but they are **not positioned** — they sit at origin with no translation into the orbiter's frame.

Per `docs/space-shuttle-glb-pipeline.md`, the approach is:

1. After loading, traverse the scene graph to find nodes named `eng` and `rcs`
2. Find the OMS pod reference nodes on the main orbiter (names containing `OMS` and `back`)
3. Use `getWorldPosition()` on the OMS pod nodes to determine where the nozzles should sit
4. Reparent nozzle nodes to the OMS pod nodes via `attach()`, adjusting position/rotation until they align with the aft pod faces
5. Fine-tune offset constants until visual alignment is correct (iterative — values stored as named constants)

The nozzles are the visual anchor for thruster effects.

### tick(dt)

1. Read input actions from InputManager
2. Apply yaw rotation
3. Compute thrust/brake/strafe forces, update velocity
4. Clamp velocity to MAX_SPEED
5. Update position from velocity
6. Update AnimationMixer

## ThrusterEffectController

Implements `Tickable`. Particle-based visual feedback for thrust and braking.

**Thrust effect (thrust action active):**
- Orange/yellow particles emitting from the `eng` nozzle positions, trailing behind the shuttle
- Particles spawn at nozzle position, inherit shuttle velocity + random spread, fade out over ~0.5s
- Intensity scales with current thrust (more particles when accelerating)

**Brake effect (brake action active):**
- Blue glowing particles emitting from the shuttle's front/sides — a futuristic inertia dampener look
- Cooler, more diffuse spread than thrust. Particles radiate outward from the shuttle body
- Blue color (#4488ff range), slight glow via additive blending

**Implementation:**
- Pool of `THREE.Points` or small particle system per effect
- Each tick: spawn new particles if active, update positions, fade alpha, recycle dead particles
- `PointsMaterial` with `blending: AdditiveBlending`, `depthWrite: false`, `transparent: true`
- Named constants for: particle count, spawn rate, lifetime, spread, colors, sizes

## StarFieldController

- `THREE.Points` geometry with ~2000 vertices randomly distributed in a large sphere (radius ~500)
- `PointsMaterial` — white, small size, no depth write
- Added to scene, static (does not move — gives parallax as shuttle moves)
- No `Tickable` needed — purely static geometry

## HomeView + HomeViewController

### HomeView.vue

- Single `<div ref="container">` filling the viewport
- No inline styles — Tailwind classes for full-width/height
- Imports and uses `HomeViewController`

### HomeViewController.ts

- `init(container: HTMLElement)`:
  1. Create `InputManager` with default bindings
  2. Create `TickHandler`, register InputManager at INPUT priority
  3. Create `SceneManager`, mount into container, register at RENDER priority
  4. Load shuttle model → create `ShuttleController`, register at PHYSICS priority
  5. Create `ThrusterEffectController`, register at ANIMATION priority
  6. Create `StarFieldController`, add to scene (no tick needed)
  7. Create `GameLoop` with the TickHandler, start it
- `dispose()`: stop loop, unregister all, dispose all controllers and SceneManager
- Listens for `toggleCamera` and `toggleDoors` one-shot actions each frame and calls the appropriate controller methods

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
- HUD, UI overlays (future — Vue components reading game state from Pinia stores)
- Collision detection
- Sound
- Procedural door animation fallback (using baked clips only)
- RCS thruster effects (only main engine thrust and brake dampener for now)
- Fixed timestep / physics interpolation (simple variable timestep is fine for now)
