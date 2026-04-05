# Orbit Capture & Slingshot System

**Date:** 2026-04-05  
**Status:** Draft

## Goal

Allow the shuttle to enter orbit around any planet or moon in the map view, then slingshot launch with the planet's orbital momentum for speed boosts beyond normal thrust limits. This creates a core navigation mechanic: outer planets become highway on-ramps across the solar system.

## State Machine

Uses the existing `StateMachine<T>` from `src/lib/stateMachine.ts`.

```
States: 'free' | 'approaching' | 'orbiting'

free ──(press E in capture range)──> approaching
approaching ──(reached orbit radius)──> orbiting
approaching ──(press E to cancel)──> free
orbiting ──(press E)──> free (with slingshot velocity)
```

## Proximity Detection

Each planet/moon has a **capture radius** precomputed once at init:

```
captureRadius = max(displayRadius * SIZE_SCALE * captureMultiplier, minCaptureRadius)
captureRadiusSq = captureRadius * captureRadius
```

Per-frame check: `dx*dx + dz*dz < captureRadiusSq` against shuttle position. No formula recomputation — just cached squared distances. Only the nearest body triggers the HUD prompt if multiple overlap.

## Orbit Radius

Derived from planet size with a floor for small bodies:

```
orbitRadius = max(displayRadius * SIZE_SCALE * orbitMultiplier, minOrbitRadius)
```

Values stored in `src/data/shuttle/orbit-capture.json`:
- `captureMultiplier`: 8 (how far out the "Press E" prompt appears)
- `orbitMultiplier`: 3 (how far the shuttle circles)
- `minOrbitRadius`: 0.5 (floor for tiny moons)
- `approachThrustFactor`: 0.8 (fraction of max thrust during autopilot)
- `orbitSpeed`: 1.5 (rad/s base orbit angular velocity, scaled by radius)

## Approach Phase

When the player presses E in capture range:

1. State transitions to `approaching`
2. Player input is disabled (except E to cancel)
3. Autopilot computes a target point on the orbit circle (nearest tangent point)
4. Autopilot rotates the shuttle toward the target and fires thrust — sets the same internal input flags so `ThrusterEffectController` shows engine VFX automatically
5. Camera begins lerping to a wider offset
6. When shuttle is within tolerance of orbit radius and roughly tangent, transitions to `orbiting`

## Orbiting Phase

1. Shuttle position is driven by Keplerian math — `orbitalPosition3D()` with synthetic orbital elements:
   - `semiMajorAxis`: the derived orbit radius
   - `eccentricity`: 0 (circular)
   - `period`: derived from orbit radius and `orbitSpeed` config
   - `inclination`: 0
2. Position is offset from the planet's current world position each frame (planet moves in its own orbit; shuttle follows)
3. A/D yaw still controls `group.rotation.y` — the shuttle's facing direction is independent of its orbital path, so the player aims their exit vector
4. Camera pulls back to orbital view — target shifts to the planet center, offset high enough to see the full orbit circle
5. HUD shows "Press E — Slingshot Launch" and current orbital speed

## Slingshot Launch

When the player presses E while orbiting:

1. Compute **orbital tangent velocity**: direction tangent to orbit at current position, rotated to match shuttle's facing direction (A/D aim), magnitude from orbit angular speed * radius
2. Compute **planet orbital velocity**: planet's frame-to-frame position delta from `PlanetSystemController`
3. **Exit velocity** = aimed tangent velocity + planet orbital velocity
4. Call `shuttleController.setVelocity(exitVelocity)` — no cap
5. State returns to `free`
6. Camera snaps back to normal VehicleCamera follow

### Slingshot Speed Decay

The shuttle's `updateMovement` currently clamps speed at `maxThrustSpeed` (thrust) and `maxGravitySpeed` (gravity). Slingshot launches can exceed both.

New field `slingshotSpeed` on ShuttleController:
- Set to the exit speed magnitude on slingshot launch
- Decays toward `maxThrustSpeed` over time (e.g. lose 10% of excess per second)
- While `speed > maxThrustSpeed && speed < slingshotSpeed`, the thrust clamp is skipped
- Once `slingshotSpeed` decays to `maxThrustSpeed`, normal clamping resumes
- Braking immediately cancels slingshot protection (speed clamps normally)

This means slingshot boosts are temporary but meaningful — you coast at high speed until friction/decay brings you back to normal thrust range.

## Camera Configs

Three camera states, all using `VehicleCamera` with config swaps:

- **Free**: Current `MAP_CAMERA_CONFIG` — close behind shuttle
- **Approaching**: Lerp from current to a wider offset as shuttle nears planet
- **Orbiting**: `MAP_ORBIT_CAMERA_CONFIG` — target shifts to planet center, pulled back to show full orbit. Offset approximately `(0, orbitRadius * 2.5, 0)` looking down, adjusted per planet size

Config swap via a new `setConfig(config)` method on VehicleCamera that lerps to the new offset.

## HUD

New `OrbitPrompt.vue` component layered on MapView:

| State | Display |
|-------|---------|
| Free, out of range | Hidden |
| Free, in capture range | "Press E — Orbit [Planet Name]" — fades in |
| Approaching | "Orbit Insertion..." / "Press E — Cancel" |
| Orbiting | "Press E — Slingshot Launch" + orbital speed |
| Free, just launched | "Slingshot — [speed] u/s" — brief flash, fades out |

State fed from `MapViewController` via reactive callback, same pattern as `onTelemetry`.

## Input

Add `orbitAction: ['KeyE']` to `DEFAULT_BINDINGS` in `src/lib/defaultBindings.ts`.

## Files

### New
| File | Purpose |
|------|---------|
| `src/lib/orbitCapture.ts` | Pure domain logic: StateMachine, proximity detection, orbit math, slingshot velocity. No Three.js. |
| `src/components/OrbitPrompt.vue` | HUD overlay for orbit prompts per state |
| `src/data/shuttle/orbit-capture.json` | Tuning constants (capture/orbit multipliers, speeds, decay) |

### Modified
| File | Change |
|------|--------|
| `src/three/ShuttleController.ts` | Add `slingshotSpeed` + decay, `setInputEnabled()` for autopilot takeover |
| `src/three/VehicleCamera.ts` | Add `setConfig()` for smooth config transitions, `MAP_ORBIT_CAMERA_CONFIG` |
| `src/views/MapViewController.ts` | Wire OrbitCaptureSystem, E key binding, feed orbit state to Vue |
| `src/views/MapView.vue` | Add OrbitPrompt component with reactive orbit state |
| `src/lib/defaultBindings.ts` | Add `orbitAction: ['KeyE']` |

### Reused As-Is
- `StateMachine<T>` — state management
- `orbitalPosition3D()` — Keplerian orbit positions
- `PlanetSystemController` — planet positions and velocity
- `ThrusterEffectController` — autopilot thruster VFX (reads input flags)

## Out of Scope

- Gravity pull during free flight (future: map-scale gravity tuning)
- Planet landing / docking from orbit
- Orbit visualization ring (future: draw the projected orbit path)
- Multiple orbit transfers (Hohmann transfers, etc.)
- Moon-specific orbit interactions (moons move relative to parent — adds complexity)
