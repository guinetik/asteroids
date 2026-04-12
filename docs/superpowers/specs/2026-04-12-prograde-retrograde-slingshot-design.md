# Prograde/Retrograde Slingshot System

**Date:** 2026-04-12
**Author:** guinetik
**Status:** Draft

## Problem

Three issues with the current slingshot system:

1. **Camera glitch on release.** Camera config jumps discontinuously from orbit (above, Y=6) to free-flight (behind, -0.8/0.4). During the 3s settle, auto-align rotates the nose to match velocity heading, and the camera fights both transitions — producing jitter.

2. **No directional feedback while orbiting.** The player can yaw freely (A/D) while docked, but has no reference for which direction is efficient. Every heading feels equally valid.

3. **Slingshot VFX/state leak on death or re-dock.** Speed-lines shader, burst velocity protection, and auto-align persist for 1+ frames after death or orbit capture mid-burst. (Fixed as a pre-requisite in commit 28a4233.)

## Constraints

- **Arrow = launch direction, always.** Launch velocity must match the visual heading arrow. A previous attempt to derive launch from the orbital velocity vector caused arrow/trajectory mismatch — never do this again.
- **Heading is the source of truth.** The shuttle's `group.rotation.y` determines the launch angle. Prograde/retrograde are informational + snap targets, not overrides.
- **No new input bindings.** W (thrust) and S (brake) are already bound and unused while orbiting. A/D yaw stays as-is.

## Design

### 1. Prograde / Retrograde Vectors

The orbital tangent is derived from `orbitAngle` in `OrbitCaptureSystem`:

```
progradeAngle  = orbitAngle + π/2
retrogradeAngle = orbitAngle − π/2
```

New methods on `OrbitCaptureSystem`:
- `getProgradeHeading(): number | null` — returns prograde angle in the same convention as `launchSlingshot(facingAngle)`, or `null` when not orbiting.
- `getRetrogradeHeading(): number | null` — opposite.
- `getAlignment(facingAngle: number): number` — dot product of aim direction and prograde direction, returns −1 (retrograde) to +1 (prograde).

Pure math in `src/lib/orbitCapture.ts`. No Three.js dependency.

### 2. W-Snap to Prograde, S-Snap to Retrograde

While orbiting, pressing W smoothly rotates the shuttle's nose toward the prograde heading. S rotates toward retrograde. Both use a ~0.3s lerp so the motion feels physical, not instant.

Implementation lives in `MapOrbitFacade.tickOrbit()`. When `thrust` is active and orbit state is `orbiting`, lerp `shuttleController.group.rotation.y` toward `getProgradeHeading()`. Mirror for `brake` → retrograde.

This reuses existing input bindings with no new actions. The thruster system already ticks during orbit for RCS (A/D yaw) — W/S join the same pattern.

### 3. Alignment Bonus

Replace the current planet-velocity dot-product boost in `launchSlingshot()` with a deterministic alignment multiplier:

```
alignment = getAlignment(facingAngle)   // −1 to +1
```

Three tiers:
- **Prograde-aligned** (alignment > 0.85, ~30° cone): `baseSpeed × (1 + 0.4 × alignment)`. Exactly prograde = 1.4× speed.
- **Off-axis** (−0.85 to 0.85): `baseSpeed × 1.0`. No bonus, no penalty.
- **Retrograde-aligned** (alignment < −0.85): `baseSpeed × (1 + 0.15 × |alignment|)`. Max 1.15×. Intentional braking slingshot — rewarded but less than prograde.

Alignment thresholds and multipliers stored in `orbit-capture.json` as tunable data:
```json
{
  "progradeAlignmentThreshold": 0.85,
  "progradeSpeedMultiplier": 0.4,
  "retrogradeAlignmentThreshold": -0.85,
  "retrogradeSpeedMultiplier": 0.15
}
```

The alignment value is also exposed via `OrbitHudState` so Vue can display feedback.

### 4. HUD Markers

Two markers positioned on the orbit ring while docked:

- **Prograde** — filled circle sprite. Green `#34ff88`.
- **Retrograde** — X-shaped sprite. Amber `#ffaa44`.

Positions:
```
prograde:    (planetX + cos(progradeAngle) × orbitRadius, planetY, planetZ + sin(progradeAngle) × orbitRadius)
retrograde:  opposite point on the orbit circle
```

Both are camera-facing (billboarded) and orbit with the ring — always 90° ahead/behind the shuttle.

Managed by `MapSceneVisuals`:
- `showProgradeMarkers()` — creates both sprites, adds to scene.
- `updateProgradeMarkers(progradePos, retrogradePos, alignment, dt)` — positions sprites, pulses prograde marker brightness when alignment > 0.85.
- `hideProgradeMarkers()` — removes and disposes.

Lifecycle mirrors the orbit ring: created when orbit begins, updated each frame in `tickOrbit`, disposed on launch/cancel.

During slingshot charge, the marker nearest the launch arrow glows brighter as alignment increases — visual feedback that the player is locking into a sweet spot.

### 5. Camera Exit Transition

Replace the discontinuous camera config swap at slingshot release with a smooth blend.

New function `buildSlingshotExitCameraConfig(progress: number): VehicleCameraConfig` in `src/three/slingshotChargeCamera.ts`:
- `progress = 0`: orbit camera config (where we are at release).
- `progress = 1`: free-flight camera config (where we need to be).
- Lerps `idleOffset`, `fov`, `lerpSpeed`, `minY`, `maxDistance` between the two.
- `idleTimeout` set to 0 so chase framing kicks in immediately.

Driven during the slingshot settle phase in `MapViewController.tick()`:
- On release: start with `progress = 0`.
- Each frame during settle: advance progress over ~1s (faster than the 3s settle, so camera is behind the ship before input unlocks).
- After 1s: fully in `MAP_CAMERA_CONFIG`, no more blending.

This mirrors the existing charge camera (orbit → charge) but in reverse (orbit → free-flight).

### 6. Pre-requisite Bug Fixes (already committed)

These were fixed in commit 28a4233 as groundwork:

- **Speed-lines shader** now checks `!dead` and `orbitState === 'free'` before rendering.
- **`cancelSlingshotBurst()`** on `ShuttleController` zeroes all burst state immediately.
- **Called on death and orbit capture** — `triggerDeath()` and `beginCapture()` both invoke `cancelSlingshotBurst()`.

## Files Affected

| Layer | File | Changes |
|-------|------|---------|
| Domain | `src/lib/orbitCapture.ts` | `getProgradeHeading()`, `getRetrogradeHeading()`, `getAlignment()` |
| Domain | `src/lib/ShuttleTelemetry.ts` | Add `progradeAlignment` to `OrbitHudState` |
| Data | `src/data/shuttle/orbit-capture.json` | Alignment thresholds + multipliers |
| Facade | `src/lib/map/orbit/MapOrbitFacade.ts` | W/S snap in `tickOrbit()`, pass alignment to HUD, exit camera drive |
| Three.js | `src/three/MapSceneVisuals.ts` | Prograde/retrograde marker sprites |
| Three.js | `src/three/slingshotChargeCamera.ts` | `buildSlingshotExitCameraConfig()` |
| Vue | `src/components/` (orbit HUD) | Alignment indicator during charge |
| Controller | `src/views/MapViewController.ts` | Camera exit transition tick during settle |
| Tests | `src/lib/__tests__/orbitCapture.spec.ts` | Prograde/retrograde heading + alignment tests |

## Out of Scope

- Navball / normal / anti-normal markers.
- Trajectory prediction arc.
- Changes to slingshot charge mechanic (hold E timing).
- Changes to burst speed / settle duration / auto-align during settle.
- Prograde/retrograde during free flight (only while orbiting).
