# Navigation Feel Improvements

**Date:** 2026-04-06
**Author:** guinetik
**Status:** Approved

## Problem

Navigation in the solar system map feels awkward. Two compounding issues:

1. **Directional blindness** — The player can see where they've been (world line history) but not where they're going. The velocity wedge indicator exists but rotates with the camera instead of showing true heading. It only appears at extreme zoom levels.
2. **Over-punishing physics** — Course corrections are frustrating because thrust drops to 45% when drifting sideways, RCS is too weak to nudge, and speed above cruise bleeds away almost instantly (0.95/s).

The result: constant reliance on the tactical map (M key) to understand direction, and a ship that fights you instead of flying.

## Scope

Two buckets — physics tuning and directional legibility. No camera changes, no trajectory prediction, no UI clutter.

## Bucket 1: Map Physics Tuning

Changes to `src/data/shuttle/shuttle-physics.json` — `map` block only. Shuttle scene untouched.

| Parameter | Current | New | Rationale |
|---|---|---|---|
| `thrustAlignMinMultiplier` | 0.45 | 0.72 | Sideways thrust at 72% not 45% — corrections possible without crippling thrust |
| `thrustAlignMaxMultiplier` | 1.0 | 1.05 | Small on-heading reward |
| `yawLateralForce` | 0.08 | 0.16 | RCS doubled — lateral nudges actually register |
| `rcsAlignMinMultiplier` | 0.48 | 0.72 | RCS penalty softened to match thrust alignment |
| `speedExcessReturnRate` | 0.95 | 0.35 | Speed bleeds gently (~35%/s) instead of near-instantly |

### Design intent

"Momentum-heavy but readable" — the ship still has mass and you commit to directions, but corrections are slow-and-possible rather than punishing. The speed bleed prevents infinite acceleration but doesn't steal hard-earned velocity.

## Bucket 2: Directional Legibility

### 2a. Fix velocity wedge rotation

**File:** `src/views/MapViewController.ts` — `tickShuttleScale` method

**Problem:** The wedge projects velocity through the camera into NDC screen-space (`_reticleProjA`/`_reticleProjB` → `atan2(ndcDy, ndcDx)`). This couples the arrow direction to camera orientation — the wedge shifts when the camera swings, not when the ship changes direction.

**Fix:** Compute wedge angle from world-space velocity directly. The map camera is always roughly top-down, so `atan2(vel.x, vel.z)` converted to screen rotation gives a stable heading independent of camera orbit. Use the camera's azimuthal angle to offset so the wedge stays correct as the player orbits the view.

### 2b. Show velocity wedge earlier

**File:** `src/views/MapViewController.ts` — constants

| Constant | Current | New |
|---|---|---|
| `MAP_RETICLE_FADE_START` | 1.5 | 0.8 |
| `MAP_RETICLE_FADE_END` | 5.0 | 2.0 |

The wedge appears at moderate zoom and reaches full opacity much sooner, so the player can see their velocity direction during normal gameplay — not just when zoomed to speck-level.

### 2c. Preview orbit ring during approach

**Problem:** The dashed orbit ring (`showOrbitRing`) only appears after the autopilot captures the ship at `captureMultiplier: 20` × display radius. The player can't see where to aim before capture.

**Fix:** During free-flight tick, check distance to each planet. When the ship enters a preview zone (2× capture radius) and is heading roughly toward the body, show the orbit ring at reduced opacity (~0.3) and thinner dash. This reads as "target orbit" not "you're captured."

**Implementation:**
- New constant: `ORBIT_PREVIEW_MULTIPLIER = 2.0` (preview zone = 2 × capture radius)
- New constant: `ORBIT_PREVIEW_OPACITY = 0.3`
- In the free-flight branch of the orbit tick, find the nearest planet within preview range
- If `dot(normalize(shipVel), normalize(planetPos - shipPos)) > 0.3` (heading toward it), show preview ring
- Hide when leaving zone or turning away
- Use existing `showOrbitRing` with a dimmer material variant
- When actual capture triggers, the ring transitions to full opacity (already happens)

**What this does NOT include:**
- No trajectory projection curves
- No approach funnels or corridors
- No slingshot exit arc preview
- No camera behavior changes
- No shuttle model size changes
- No tactical map (M key) changes

These are valid future improvements but out of scope for this change.

## Files Changed

1. `src/data/shuttle/shuttle-physics.json` — map physics values
2. `src/views/MapViewController.ts` — wedge rotation fix, fade constants, orbit preview logic

## Testing

- Physics changes: playtesting only (no unit tests for feel)
- Wedge fix: visual verification — rotate camera while moving, confirm wedge stays stable
- Orbit preview: fly toward a planet, confirm ring appears at ~2× capture distance and fades in
