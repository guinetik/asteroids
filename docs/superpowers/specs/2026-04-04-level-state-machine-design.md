# Level State Machine & EVA Mechanics Design

**Date:** 2026-04-04  
**Scope:** Generic StateMachine\<T\>, level state flow (arrival → lander ↔ eva), EVA enter/exit transitions  
**Out of scope this session:** Objectives, exfil, mission complete/fail, shuttle choreography, HUD

---

## 1. Generic StateMachine\<T\>

**File:** `src/lib/stateMachine.ts`

TypeScript port of `gcanvas/src/state/state-machine.js`. Generic over state name union `T extends string`.

### API

```ts
interface StateConfig<T extends string> {
  enter?: (data?: unknown) => void
  tick?: (dt: number) => void
  exit?: (data?: unknown) => void
  duration?: number        // auto-transition after N seconds
  next?: T                 // target state after duration expires
  onComplete?: () => void  // called when duration expires and no next
  on?: Record<string, T | TransitionConfig<T>>  // trigger → target
}

interface TransitionConfig<T extends string> {
  target: T
  guard?: (data?: unknown) => boolean
  action?: (data?: unknown) => void
}

interface StateMachineConfig<T extends string> {
  initial?: T
  states: Record<T, StateConfig<T>>
  context?: unknown
}
```

### Class: StateMachine\<T\>

Implements `Tickable` (tick calls update logic).

| Member | Description |
|--------|-------------|
| `state: T \| null` | Current state name |
| `previousState: T \| null` | Previous state name |
| `stateTime: number` | Seconds in current state |
| `progress: number` | 0–1 for timed states |
| `remaining: number` | Seconds left for timed states |
| `paused: boolean` | Stops tick processing |
| `onStateChange: ((current: T, previous: T \| null, data?: unknown) => void) \| null` | Global callback |

| Method | Description |
|--------|-------------|
| `setState(state: T, data?: unknown): boolean` | Exit current → enter new. Returns false if unknown state |
| `trigger(name: string, data?: unknown): boolean` | Check current state's `on` map, evaluate guard, transition if valid |
| `is(state: T): boolean` | Check current state |
| `isAny(...states: T[]): boolean` | Check if in any of given states |
| `tick(dt: number): void` | Advance stateTime, call state tick, check duration |
| `pause() / resume()` | Toggle paused |
| `reset(state?: T): void` | Reset to given or initial state |
| `addState(name: T, config: StateConfig<T>)` | Add/update state at runtime |
| `static fromSequence<T>(phases, options?)` | Factory for linear phase chains |

### Behaviour

- `setState()`: calls `currentState.exit(data)` → updates tracking → calls `newState.enter(data)` → fires `onStateChange`
- `tick(dt)`: increments `stateTime`, calls `state.tick(dt)`, checks `duration` → auto-transitions via `next`
- `trigger(name)`: looks up `currentState.on[name]`, if string → `setState()`, if object → check `guard()`, run `action()`, then `setState(target)`
- Context binding: all callbacks called with `config.context` as `this` if provided

---

## 2. TickHandler.unregister()

**File:** `src/lib/TickHandler.ts`

Add `unregister(tickable: Tickable): void` — removes a tickable from the priority list. Required for swapping lander/EVA systems without destroying them.

---

## 3. Level States

**File:** `src/lib/level/levelStateMachine.ts`

```ts
type LevelState = 'arrival' | 'lander' | 'eva' | 'exfil' | 'complete' | 'failed'
```

### State: `arrival`

- **Duration:** 3 seconds, auto-transitions to `lander`
- **Enter:** Spawn lander at high Y (e.g. 300 above terrain). Register LanderController in TickHandler so gravity pulls it down naturally — but do NOT register lander input bindings, so the player cannot thrust. Camera is a standalone PerspectiveCamera at a cinematic angle (wide, offset to side, looking at lander with terrain below) — NOT VehicleCamera. CSS letterbox bars (two black divs, top and bottom) appear immediately.
- **Tick:** Cinematic camera tracks the falling lander (lookAt lander position each frame). Lander falls under physics only. At ~2.5s mark, letterbox bars begin CSS transition to height 0.
- **Exit:** Letterbox bars removed. Camera snaps to vehicle-follow (VehicleCamera). Lander is wherever gravity took it — mid-air, player must thrust to control landing.

### State: `lander`

- **Enter:** Register lander tickables (LanderController at PHYSICS priority, VehicleCamera at RENDER-1). Set VehicleCamera as active camera. Enable lander input bindings.
- **Triggers:** `exitVehicle` → `eva` with guard: `landerController.grounded === true`
- **Exit:** Unregister lander tickables. Disable lander input.

### State: `eva`

- **Enter:** Spawn FpsPlayerController at lander position + lateral offset (side of lander door). Register EVA tickables (FpsPlayerController at PHYSICS, FpsCamera at RENDER-2, MultiToolController at RENDER-2, MultiToolState at PHYSICS+1). Set FpsCamera as active camera. Request pointer lock. Start O2 drain.
- **Triggers:** `enterVehicle` → `lander` with guard: player within interaction range of lander (e.g. 10 units)
- **Exit:** Unregister EVA tickables. Release pointer lock. Replenish O2 (back in lander, connected to life support).

### State: `exfil` (stub)

Placeholder for when all objectives complete and lander crosses altitude threshold.

### State: `complete` (stub)

Placeholder for mission summary screen.

### State: `failed` (stub)

Placeholder for fuel-empty / death conditions.

---

## 4. LevelViewController

**File:** `src/views/LevelViewController.ts`

Single orchestrator. Creates all systems once during `init()`, uses state machine callbacks to wire/unwire them.

### Systems Created Once (init)

| System | Purpose |
|--------|---------|
| InputManager | Key/mouse input (always active) |
| TickHandler | Priority-based tick dispatch |
| SceneManager | Three.js scene + renderer |
| TerrainGrid + Heightmap | Procedural terrain |
| Lighting (ambient + directional) | Scene lighting |
| LanderController | Lander physics + thrusters |
| VehicleCamera | 3rd person lander camera |
| FpsPlayerController | EVA movement + O2 |
| FpsCamera | First-person camera |
| MultiToolController | Weapon model |
| MultiToolState | Tool mode logic |
| StateMachine\<LevelState\> | State orchestration |

### Always Registered in TickHandler

- InputManager (TICK_PRIORITY_INPUT)
- StateMachine (TICK_PRIORITY_INPUT + 1)
- SceneManager (TICK_PRIORITY_RENDER)

### F Key Handling

In LevelViewController.tick():

```ts
if (inputManager.wasActionPressed('interact')) {
  stateMachine.trigger('exitVehicle')
  stateMachine.trigger('enterVehicle')
}
```

Both triggers fire every frame F is pressed. Only the one whose guard passes will transition. No if/else branching on current state.

### Input Bindings

Add `interact` (F key) to a new `LEVEL_BINDINGS` set that merges lander + FPS bindings plus the interact key. Only one InputManager — bindings cover both modes, but actions are only checked when the relevant controller is active.

---

## 5. LevelView.vue

**File:** `src/views/LevelView.vue`

Minimal Vue wrapper:

- `<div ref="container">` for Three.js
- Letterbox overlay divs (two absolute-positioned black bars, top and bottom)
- LevelViewController controls bar visibility via callbacks: `onLetterbox(visible: boolean)`
- CSS transition on bar height for smooth open/close

No HUD this session — just the scene container and letterbox bars.

---

## 6. File Summary

| File | Action |
|------|--------|
| `src/lib/stateMachine.ts` | **New** — Generic StateMachine\<T\> |
| `src/lib/TickHandler.ts` | **Edit** — Add `unregister()` |
| `src/lib/level/levelStateMachine.ts` | **New** — LevelState type + factory function |
| `src/views/LevelViewController.ts` | **Rewrite** — Full scene orchestrator with state machine |
| `src/views/LevelView.vue` | **Edit** — Add letterbox divs |
| `src/lib/level/__tests__/stateMachine.spec.ts` | **New** — State machine unit tests |
| `src/lib/level/__tests__/levelStateMachine.spec.ts` | **New** — Level state transition tests |

---

## 7. Test Strategy

All tests target `src/lib/` — pure TS, no Three.js.

### StateMachine\<T\> tests:
- Enter/exit callbacks fire on setState
- Tick calls current state's tick
- Timed states auto-transition after duration
- Triggers with string targets transition
- Triggers with guards block when guard returns false
- Triggers with guards pass when guard returns true
- Trigger actions fire before transition
- Unknown state returns false
- Pause stops tick processing
- stateTime / progress / remaining track correctly
- fromSequence builds correct chain
- onStateChange callback fires with correct args

### Level state transition tests:
- Arrival auto-transitions to lander after 3 seconds
- Cannot exit lander when not grounded (guard blocks)
- Can exit lander when grounded (guard passes)
- Cannot enter lander when far from it (guard blocks)
- Can enter lander when within range (guard passes)
- EVA → lander → EVA round-trip works
