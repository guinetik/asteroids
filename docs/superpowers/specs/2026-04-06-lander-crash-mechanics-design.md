# Lander Crash Mechanics Design

**Author:** guinetik  
**Date:** 2026-04-06  
**Status:** Approved (v2 — replaces lives system with HP damage)

## Overview

The lander gets an HP bar like the player and shuttle already have. Hard landings deal damage proportional to impact speed and angle. HP reaches 0 = lander explodes = game over (stranded on asteroid with no way back to shuttle). Future: repair services in orbit gameplay.

## Landing Validation

On ground contact (the frame `PlatformerBody` sets `grounded = true`), evaluate landing quality:

- **Safe speed**: `|velocityY| <= 5.0` units/s — no damage
- **Safe angle**: combined tilt `<= 0.175 rad` (~10 degrees) — no damage

If either exceeds the threshold, compute damage proportional to the excess:

```
speedExcess = max(0, |velocityY| - SAFE_LANDING_SPEED)
angleExcess = max(0, combinedTilt - SAFE_LANDING_ANGLE)
damage = speedExcess * SPEED_DAMAGE_MULTIPLIER + angleExcess * ANGLE_DAMAGE_MULTIPLIER
```

## Lander HP

- **Max HP**: 100 (matching player and shuttle convention)
- **Starting HP**: 100
- **Damage**: Applied on each hard landing via `takeDamage(amount)`
- **No healing**: HP does not regenerate during a level (future: repair in orbit)
- **HP display**: Shown in lander HUD as a bar (like fuel bar)

## Crash (HP = 0)

When lander HP reaches 0:

1. **Explosion VFX** — particle burst at impact, intensity at maximum
2. **Lander mesh hidden**
3. **Fade to black**
4. **Game over** — trigger `failed` state, show death overlay with cause "Lander Destroyed", redirect to `/`

No respawn, no lives. The lander was your only way back to the shuttle — you're stranded.

## Explosion VFX

Particle burst on every hard landing (not just fatal ones), scaled to damage dealt:

- Low damage: small spark burst
- High damage: large fireball + debris
- Fatal (HP=0): maximum intensity explosion

Uses `ParticleEmitter` — fire emitter (orange) + debris emitter (grey).

## State Machine Changes

No new states needed. Crash death uses the existing `failed` state:

- `lander` state: `LanderController` detects hard landing, fires `onCrash(damage)`
- `LevelViewController` applies damage, checks HP
- If HP <= 0: trigger existing `failed` state flow

The `crashed` state from the previous plan is NOT needed — damage is instant, no respawn delay.

## Architecture

### LanderController

- Add `hp` / `maxHp` fields (100/100)
- Add `takeDamage(amount)` method (same pattern as `FpsPlayerController`)
- Add `onCrash` callback: `(damage: number, impactSpeed: number) => void`
- Add `onDeath` callback: `() => void` — fired when HP reaches 0
- Capture pre-landing `velocityY` before `PlatformerBody` zeroes it (via `impactVelocityY` on the body)
- Evaluate landing on grounded transition frame

### LanderExplosion (new file: `src/three/LanderExplosion.ts`)

- Fire + debris `ParticleEmitter` pair
- `explode(position, impactSpeed)` — scales particle count/spread/force with speed
- Reusable — called on every hard landing, not just fatal ones

### LevelViewController

- Wire `onCrash`: spawn explosion VFX (every hard landing)
- Wire `onDeath`: hide lander, maximum explosion, transition to `failed`
- Add explosion emitters to scene

### Lander HUD

- Add `hp` and `maxHp` to `LanderTelemetry`
- Render HP bar in `LanderHud.vue`

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `SAFE_LANDING_SPEED` | 5.0 | Max safe abs(velocityY) |
| `SAFE_LANDING_ANGLE` | 0.175 | Max safe combined tilt (rad, ~10°) |
| `SPEED_DAMAGE_MULTIPLIER` | 3.0 | HP damage per unit of excess speed |
| `ANGLE_DAMAGE_MULTIPLIER` | 40.0 | HP damage per radian of excess tilt |
| `LANDER_MAX_HP` | 100 | Starting/max HP |
