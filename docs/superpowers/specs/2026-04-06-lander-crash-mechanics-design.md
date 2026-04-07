# Lander Crash Mechanics Design

**Author:** guinetik  
**Date:** 2026-04-06  
**Status:** Approved

## Overview

Landing the lander requires controlled descent — too fast or too tilted and the lander crashes. Crashes cost a life and respawn the player at the shuttle. Out of lives means level failure. Crash explosions scale in intensity with impact speed.

## Landing Validation

On ground contact (the frame `PlatformerBody` sets `grounded = true`), check two conditions:

- **Safe speed**: `|velocityY| <= 5.0` units/s at the moment of contact
- **Safe angle**: combined tilt magnitude `<= 0.175 rad` (~10 degrees) from vertical

Combined tilt magnitude: `Math.sqrt(tiltX * tiltX + tiltZ * tiltZ)`

If either condition fails, the landing is a crash. The check must happen *before* `PlatformerBody` zeroes `velocityY` — capture the pre-landing velocity.

## Crash Response Sequence

1. **Capture impact data** — record `impactSpeed = Math.abs(velocityY)` and tilt at moment of contact
2. **Hide lander mesh** — `group.visible = false` immediately
3. **Explosion VFX** — particle burst at impact position, intensity scales with `impactSpeed`:
   - Particle count: `lerp(16, 64, speedRatio)` where `speedRatio = clamp(impactSpeed / 20, 0, 1)`
   - Spread radius: `lerp(10, 40, speedRatio)`
   - Particle lifetime: `lerp(0.5, 1.5, speedRatio)`
   - Color: orange/yellow core, fading to grey (debris)
4. **Screen shake** — amplitude proportional to `impactSpeed`
5. **Fade to black** — over 1.5 seconds
6. **Deduct life** — `livesRemaining -= 1`
7. **Respawn or fail** — after ~3 seconds total crash duration:
   - If `livesRemaining > 0`: respawn lander at LANDER_SPAWN_HEIGHT (600) directly above shuttle (original spawn XZ), transition back to `lander` state
   - If `livesRemaining <= 0`: transition to `failed` state (redirect to `/`)

## Lives System

- **Starting lives**: 3
- **Display**: Lander silhouette icons in the lander HUD (top area)
- **Loss**: One life per crash
- **No recovery**: Lives cannot be regained during a level

## State Machine Changes

Add `crashed` state to `LevelState`:

```
lander → crashed    (on crash detection, no trigger — detected in LanderController)
crashed → lander    (auto-advance after CRASH_DURATION if lives > 0)
crashed → failed    (auto-advance after CRASH_DURATION if lives <= 0)
```

The `crashed` state uses `duration: 3.0` with a conditional `next` — `LevelViewController` decides the target based on remaining lives.

## Architecture

### Crash Detection — `LanderController`

The controller already tracks `body.velocityY`, `tiltX`, and `tiltZ`. Add a pre-landing velocity capture:

- Each frame while airborne, store `lastAirborneVelocityY` and `lastAirborneTilt`
- On the frame `body.grounded` transitions from `false` to `true`, evaluate landing safety
- Fire callback: `onCrash(impactSpeed: number, impactAngle: number)` if unsafe
- Fire callback: `onLand()` if safe (for future use — sound effects, dust, etc.)

### Explosion VFX — `LanderExplosion` in `src/three/`

New controller that creates a scaled particle burst:

- Constructor takes `ParticleEmitter` reference (reuse the existing one or a dedicated crash emitter)
- `explode(position: Vector3, impactSpeed: number)` — emits particles scaled to speed
- Uses the existing `ParticleEmitter` pattern from the projectile impact system

### Lives Tracking — `LevelViewController`

- New field: `livesRemaining = 3` (constant: `STARTING_LIVES = 3`)
- On crash callback: decrement lives, trigger `crashed` state, spawn explosion
- On `crashed` state exit: check lives to decide respawn vs fail
- Respawn: reset lander position to spawn point, make visible, transition to `lander`

### HUD — `LanderHud.vue`

- Extend `LanderTelemetry` with `lives: number`
- Render lander silhouette icons (small SVG or unicode) for each remaining life
- Icons disappear as lives are spent

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `SAFE_LANDING_SPEED` | 5.0 | Max abs(velocityY) for safe landing |
| `SAFE_LANDING_ANGLE` | 0.175 | Max combined tilt (rad, ~10 degrees) |
| `CRASH_DURATION` | 3.0 | Seconds on crash screen before respawn/fail |
| `STARTING_LIVES` | 3 | Lives at level start |
| `CRASH_FADE_DURATION` | 1.5 | Seconds for fade to black after crash |
