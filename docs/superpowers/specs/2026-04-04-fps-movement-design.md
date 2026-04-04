# FPS Movement System — Design Spec

**Date:** 2026-04-04
**GDD Reference:** docs/asteroid-lander-gdd-v03.md — Layer 4: First Person — On Foot

---

## Overview

First-person EVA movement system for the `/fps` demo route. The player walks on procedural asteroid terrain in micro-gravity with thrust-based movement, pointer-lock mouse look, and an O2-as-fuel stamina system built on the project's existing `PlatformerBody` and `ThrusterSystem` patterns.

This spec covers movement only — no multi-tool, no enemies, no NPCs.

---

## FpsCamera

New class: `src/three/FpsCamera.ts`

Pointer-lock first-person camera that attaches to a target Object3D at eye height.

### Behavior

- Perspective camera positioned at target position + eye-height offset
- Requests pointer lock on mount; shows click-to-relock overlay on escape
- Mouse deltaX rotates the player entity (yaw); deltaY pitches the camera (clamped)
- Exposes `getForwardXZ()` and `getRightXZ()` for movement-relative-to-camera input (pitch stripped so WASD stays on the ground plane)
- Implements `Tickable` — copies target position each frame, applies yaw/pitch

### Configuration

```ts
interface FpsCameraConfig {
  /** Vertical offset above player origin (meters). */
  eyeHeight: number
  /** Mouse sensitivity multiplier for raw deltas. */
  sensitivity: number
  /** Maximum pitch angle in radians (default ~85deg). */
  pitchClamp: number
  /** Perspective field of view in degrees. */
  fov: number
}
```

### Pointer Lock Flow

1. On scene mount → request pointer lock automatically
2. If user presses Escape → browser releases lock → show centered "Click to resume" overlay
3. Click overlay → re-lock

---

## FpsPlayerController

New class: `src/three/FpsPlayerController.ts`

The player entity on the terrain surface. Composes existing systems.

### Composition

| System | Role |
|--------|------|
| `PlatformerBody` | Gravity, vertical velocity, grounding, heightmap floor collision |
| `ThrusterSystem<'sprint' \| 'jump'>` | O2 fuel pool + sprint/jump charge management |
| `Heightmap` ref | Terrain floor queries + surface normal queries |
| `THREE.Group` | Scene node (invisible anchor; multi-tool attaches here later) |

### Movement Model (per frame)

1. Read `FpsCamera.getForwardXZ()` and `getRightXZ()`
2. Map WASD to thrust impulses along those camera-relative vectors
3. If Shift held and sprint thruster has charge → multiply thrust by sprint multiplier
4. Apply friction:
   - **Grounded:** strong deceleration (slide to stop in ~0.3-0.5s)
   - **Airborne:** weak deceleration (commit to jump direction)
5. Clamp lateral speed to max (base or sprint max)
6. Apply lateral velocity to XZ position
7. Query `heightmap.heightAt(x, z)` for floor, pass to `body.tick()` for gravity + grounding
8. When grounded, align player up-vector to `heightmap.normalAt(x, z)` (terrain conforming)

### Jump

- Space when `body.grounded` → `body.impulse(jumpForce)` — single impulse
- Must land before jumping again
- Jump thruster charge consumed per jump, recharges from O2

### Sprint

- Hold L-Shift → sprint thruster fires, multiplying movement thrust
- Sprint thruster drains charge while held, recharges from O2 when idle
- O2 empty → no recharge, remaining charge is all you have

---

## O2 Power System

O2 is the shared fuel pool for the player's `ThrusterSystem`. It maps directly to the GDD's EVA oxygen mechanic.

### Behavior

- O2 ticks down constantly while on foot at a base drain rate (breathing)
- Sprint recharge costs additional O2 (via `fuelCostPerRecharge`)
- O2 empty → stamina/jump can't recharge, remaining charge is all you have
- O2 depleted for 30 seconds → game over (reset demo scene)

### ThrusterSystem Configuration

```ts
ThrusterSystem<'sprint' | 'jump'>({
  fuelCapacity: 100,        // O2 tank
  thrusters: {
    sprint: {
      capacity: 50,
      burnRate: 25,          // charge/s while sprinting
      rechargeRate: 15,      // charge/s while idle
      fuelCostPerRecharge: 0.8
    },
    jump: {
      capacity: 10,
      burnRate: 10,          // charge/s per jump
      rechargeRate: 8,       // charge/s recovery
      fuelCostPerRecharge: 0.3
    }
  }
})
```

### Base O2 Drain

Separate from thruster recharge — each frame, O2 drains at a base rate even when standing still. `ThrusterSystem` currently has no `consumeFuel()` method, so we add one: a simple public method that subtracts a given amount from the fuel pool (clamped to zero). This is the only addition to `thrusterSystem.ts`.

### Death Timer

- O2 reaches zero → 30-second countdown starts
- During countdown: no stamina recharge, HUD warning (flashing red), screen effects
- Timer expires → game over (scene reset)
- If O2 restored (future: return to lander, find canister) → timer cancels

---

## Data Config

All tuning constants live in `src/data/fps/player-config.json`. No magic numbers in code.

```json
{
  "movement": {
    "moveThrust": 12.0,
    "sprintMultiplier": 2.0,
    "groundFriction": 8.0,
    "airFriction": 0.3,
    "maxSpeed": 8.0,
    "maxSprintSpeed": 16.0,
    "jumpForce": 6.0,
    "gravity": 1.2
  },
  "o2": {
    "fuelCapacity": 100,
    "baseDrainRate": 1.5,
    "deathTimerSeconds": 30,
    "thrusters": {
      "sprint": {
        "capacity": 50,
        "burnRate": 25,
        "rechargeRate": 15,
        "fuelCostPerRecharge": 0.8
      },
      "jump": {
        "capacity": 10,
        "burnRate": 10,
        "rechargeRate": 8,
        "fuelCostPerRecharge": 0.3
      }
    }
  },
  "camera": {
    "eyeHeight": 1.7,
    "sensitivity": 0.002,
    "pitchClamp": 1.48,
    "fov": 75
  }
}
```

---

## Input Bindings

New `FPS_BINDINGS` added to `src/lib/defaultBindings.ts`:

| Action | Key |
|--------|-----|
| `moveForward` | W |
| `moveBack` | S |
| `moveLeft` | A |
| `moveRight` | D |
| `jump` | Space |
| `sprint` | L-Shift |

Mouse look is handled by `FpsCamera` via pointer lock `mousemove` events — not through InputManager.

---

## FpsHud

New component: `src/components/FpsHud.vue`

| Element | Position | Description |
|---------|----------|-------------|
| O2 bar | Top left | Blue to red, always ticking down |
| Sprint bar | Below O2 | Smaller, shows sprint charge |
| Crosshair | Center | Simple crosshair |
| Death countdown | Center | Flashing red, appears when O2 depleted |
| Speed readout | Bottom left | Current lateral speed |

### Telemetry Interface

```ts
interface FpsTelemetry {
  o2Level: number
  o2Capacity: number
  sprintCharge: number
  sprintCapacity: number
  speed: number
  grounded: boolean
  deathTimer: number | null  // seconds remaining, null if not active
}
```

---

## FpsViewController Wiring

Expand existing `src/views/FpsViewController.ts`:

### Init Sequence

1. Load `player-config.json`
2. Generate terrain (heightmap + TerrainGrid — already in place)
3. Create `InputManager` with `FPS_BINDINGS`
4. Create `FpsPlayerController` (PlatformerBody + ThrusterSystem, wired to heightmap)
5. Spawn player at terrain center, slightly above ground
6. Create `FpsCamera`, attach to player group, request pointer lock
7. Set SceneManager camera to FpsCamera's perspective camera
8. Lighting (already in place)
9. Register tick order: Input → Physics (player) → Camera → Render
10. Start GameLoop

### Pointer Lock Overlay

- Hidden while locked
- On escape: show "Click to resume" centered overlay
- Click → re-lock

---

## File Plan

### New Files

| File | Purpose |
|------|---------|
| `src/data/fps/player-config.json` | All tuning constants |
| `src/three/FpsCamera.ts` | Pointer-lock mouse look camera |
| `src/three/FpsPlayerController.ts` | Player entity: PlatformerBody + ThrusterSystem + movement |
| `src/components/FpsHud.vue` | O2, stamina, crosshair, death timer |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/defaultBindings.ts` | Add `FPS_BINDINGS` |
| `src/views/FpsViewController.ts` | Full scene wiring |
| `src/views/FpsView.vue` | Add HUD + pointer lock overlay |

### Minor Addition

| File | Change |
|------|--------|
| `src/lib/physics/thrusterSystem.ts` | Add `consumeFuel(amount)` method for base O2 drain |

### No Changes To

- `src/lib/physics/platformerBody.ts` — used as-is
- `src/lib/terrain/heightmap.ts` — used as-is
- `src/three/TerrainGrid.ts` — used as-is
