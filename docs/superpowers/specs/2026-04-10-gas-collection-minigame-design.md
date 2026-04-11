# Gas Collection Minigame Design

**Date:** 2026-04-10
**Author:** guinetik
**Status:** Draft

## Problem

The `gas-collection` minigame type (Venus, Jupiter) currently falls through to `DefaultOrbitalMiniGame` — a single "Complete Mission" button. It needs a real gameplay minigame that fits the orbital context and uses the `OrbitalMiniGame` interface.

## Solution

A 2D canvas side-scrolling collection minigame rendered in its own `<canvas>` element inside the Vue overlay. The player flies the shuttle in side profile, launches drones with Q, and flies over them to collect atmospheric gas. Gas yield per drone is proportional to how long the drone stays airborne — longer air time = more gas, but wait too long and it falls off screen.

## Gameplay

### Ship

- Side profile: cone pointing right, thrusters left
- WASD movement with velocity-based physics (acceleration + drag, not instant)
- Free movement across the full canvas area
- Ship cannot leave the canvas bounds (clamped)

### Drones (Q to launch)

- 5 drones total per attempt
- Launch in a parabolic arc based on the ship's current velocity and angle at launch time
- A drone's trajectory is ballistic after launch — no steering
- Gas yield = air time in seconds (from launch to collection), clamped to a max (e.g. 3 seconds = 3 units of gas gauge fill)
- Collect by flying the ship hitbox over the drone
- If a drone falls off the bottom of the screen, it's lost — no gas collected
- Remaining drone count shown in the HUD

### Gas Gauge

- Horizontal bar at the bottom of the canvas
- Fills proportionally: each collected drone adds its air-time value
- Target fill = `gatherQuantity` from the mission template (e.g. 5 for Venus Atmospheric Survey)
- When gauge reaches target: minigame auto-completes (status → `'completed'`)
- If all 5 drones are spent and gauge isn't full: minigame fails (status → `'failed'`)

### Fail State

When all drones are spent and gauge is not full, the minigame status transitions to `'failed'`. The overlay shows a failure message. The player can close and retry (re-open the overlay to get a fresh attempt). The mission stays active — it's not lost, just not completed yet.

## Visual Design

### Background

- Fullscreen Venus/Jupiter atmosphere — planet surface scrolling or rotating horizontally to sell the "skimming the atmosphere edge" speed
- Could be a CSS gradient animation, a scrolling canvas texture, or a simple shader
- Orange/amber tones for Venus, brown/red bands for Jupiter
- Subtle cloud layers at different scroll speeds for parallax depth

### Ship Sprite

- 2D side-profile drawn as canvas paths or a small sprite
- Off-white/gray body matching the 3D shuttle's thermal tile aesthetic
- Cone nose right, engine glow left
- Small thruster flame effect when accelerating

### Drones

- Small glowing circles or capsule shapes
- Cyan/green glow trail as they arc through the air
- Flash or pulse when collectible (near the ship)

### HUD

- Gas gauge: horizontal bar, bottom-center, cyan fill on dark background
- Drone count: top-right, icon or number showing remaining drones (e.g. "DRONES: 3/5")
- Match the existing HUD aesthetic: cyan/monospace/dark

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/lib/minigame/GasCollectionMiniGame.ts` | Game logic: ship physics, drone physics, collision, gauge, status |
| `src/components/GasCollectionCanvas.vue` | Vue component: `<canvas>` element, render loop, input binding, HUD overlay |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/minigame/orbitalMiniGameFactory.ts` | `case 'gas-collection':` returns `GasCollectionMiniGame` |
| `src/components/MissionMiniGameOverlay.vue` | When minigame is `GasCollectionMiniGame`, render `<GasCollectionCanvas>` instead of the button card |

### Game Logic — `GasCollectionMiniGame`

Implements `OrbitalMiniGame` + `OrbitalMiniGameEvents`. Pure game state — no DOM, no canvas, no rendering. The Vue component reads state and renders.

```ts
class GasCollectionMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  // Config
  readonly missionId: string
  readonly targetGas: number          // from gatherQuantity
  readonly maxDrones: number          // 5

  // Ship state
  shipX: number; shipY: number
  shipVx: number; shipVy: number

  // Drone state
  drones: Drone[]                     // active drones in flight
  dronesRemaining: number             // how many left to launch
  gasCollected: number                // accumulated gas gauge value

  // Interface
  status: OrbitalMiniGameStatus
  steps: OrbitalMiniGameStep[]
  progressCurrent: number             // gasCollected
  progressTotal: number               // targetGas

  // Methods
  tick(dt, ctx): void                 // physics, collision, gauge check
  launchDrone(): void                 // called by input handler
  setInput(input: ShipInput): void    // WASD state from Vue component
  complete(): void                    // auto-called when gauge full
  dispose(): void
}

interface Drone {
  x: number; y: number
  vx: number; vy: number
  airTime: number                     // seconds since launch
  collected: boolean
}

interface ShipInput {
  up: boolean; down: boolean
  left: boolean; right: boolean
}
```

The game logic class is framework-agnostic. The Vue component owns the render loop (`requestAnimationFrame`), reads the game state each frame, and draws to canvas.

### Vue Component — `GasCollectionCanvas.vue`

- Mounts a `<canvas>` element sized to fill the overlay area
- Listens for WASD + Q keyboard input, forwards to the game logic via `setInput()` and `launchDrone()`
- Runs a `requestAnimationFrame` loop that calls `minigame.tick(dt)` and renders:
  - Background (scrolling atmosphere)
  - Ship (canvas paths at ship position)
  - Drones (circles with trails at drone positions)
  - Gas gauge (bottom bar)
  - Drone counter (top-right text)
- On `status === 'completed'`: stops the loop, emits completion
- On `status === 'failed'`: stops the loop, shows failure message

### Overlay Integration

`MissionMiniGameOverlay.vue` checks the minigame type. If it's a `GasCollectionMiniGame`, it renders `<GasCollectionCanvas>` fullscreen instead of the card with the button. The close button stays accessible (ESC or a corner X).

## Physics Constants

All named constants in the game logic file:

| Constant | Value | Description |
|----------|-------|-------------|
| `SHIP_ACCELERATION` | 800 | px/s² when holding a direction |
| `SHIP_DRAG` | 0.92 | velocity multiplier per frame (1 = no drag) |
| `SHIP_MAX_SPEED` | 400 | px/s max velocity magnitude |
| `DRONE_GRAVITY` | 300 | px/s² downward acceleration on drones |
| `DRONE_LAUNCH_SPEED` | 250 | px/s base launch speed (added to ship velocity) |
| `DRONE_LAUNCH_ANGLE` | -45° | degrees from horizontal (upward-right arc) |
| `DRONE_COLLECT_RADIUS` | 30 | px — hitbox for ship-drone collision |
| `MAX_AIR_TIME_YIELD` | 3 | seconds — cap on gas yield per drone |
| `MAX_DRONES` | 5 | total drones per attempt |
| `CANVAS_WIDTH` | 800 | logical canvas width |
| `CANVAS_HEIGHT` | 500 | logical canvas height |

These are starting values — tuning expected.

## Steps for HUD Tracker

Two steps shown in the mission tracker:

1. "Collect atmospheric gas" — active while playing, shows progress (gasCollected / targetGas)
2. "Mission complete" — activates on completion

## Testing

Unit tests for `GasCollectionMiniGame` (no canvas, pure logic):

- Ship moves with WASD input and drag
- Ship is clamped to canvas bounds
- Drone launches with velocity based on ship velocity
- Drone falls under gravity
- Drone collection when ship overlaps drone position
- Gas yield equals drone air time (clamped to max)
- Gauge fills correctly — auto-completes at target
- Fail state when all drones spent and gauge not full
- `launchDrone()` does nothing when no drones remain
- `tick()` is no-op after completed/failed

## Out of Scope

- Sound effects (future pass)
- Particle effects beyond simple trails
- Difficulty scaling between Venus and Jupiter
- Leaderboard or scoring beyond pass/fail
