# Exterminate Mission — Bigger Explosion + Deploy Marker

**Date:** 2026-04-18
**Author:** guinetik (with agent assistance)
**Spec:** Make the nest detonation read as an actual explosion, and add a
ground waypoint so the player can locate the charge-deploy site after clearing
the defenders.

## Problems

1. **Detonation looked like a flashbulb.** A single 0.45 s additive sphere
   (max scale 34) plus one weak point light (intensity 6, distance 80) at the
   nest position. With the camera 4–6 m off the ground the visible result was
   a brief orange pop with no sound, no shake, no debris field, no shockwave,
   no afterglow. It read more like a UI ack than a satisfying objective payoff.
2. **No spatial cue for the deploy site.** Once defenders were dead the only
   feedback was a `[E] DEPLOY EXPLOSIVE CHARGES` prompt that triggered when
   the player walked within 16 m of the nest. From far away the player had no
   indication where to go — the nest itself blends into the rust terrain at
   distance and there was no waypoint marker.

## Fixes

### Beefier explosion (per-minigame visuals)

`ExterminateMinigame.ts` now plays a 3-layer explosion + ground shockwave
instead of a single sphere flash:

| Layer | Geometry | Duration | Decay |
|---|---|---|---|
| Outer fireball | sphere, scale 1 → **62** | **0.75 s** | linear opacity 0.85 → 0 |
| White-hot core | sphere, scale 1 → **22** | **0.22 s** | `pow(1−t, 1.6)` opacity (snappier) |
| Ground shockwave | thin ring (radius 1 → **35.2** ≈ `BLAST_RADIUS × 1.6`) | **0.6 s** | easeOut radius, linear opacity |
| Point light | — | shares fireball duration | intensity 0 → **18**, distance **180** |

The core saturates the screen for the first ~220 ms (white additive over the
orange fireball reads as a chemical-flash bloom), the fireball provides the
sustained heat, and the ground ring paints a planar shockwave that's still
visible at distance even when the spherical layers have faded.

### Centralised explosion presentation (level-side)

`LevelViewController.triggerObjectiveExplosion(pos, sparkBursts, sparkBaseSpeed)`
is the new shared helper, called from both the exterminate **and** rescue
`onExplosion` callbacks. Each blast now also:

- Fires `LanderExplosion.explode(pos, 22)` — full fire+debris emitter,
  same particle budget as a hard lander crash.
- Plays `sfx.explosion` with **distance-attenuated volume** (full at the blast
  point, fading to 30 % past `EXPLOSION_FEEDBACK_RANGE = 90` m).
- Applies a **camera kick** scaled by the same attenuation, up to
  `EXPLOSION_FLINCH_STRENGTH = 240` mouse-delta units (3 × the damage flinch).
  Routed through the existing `FpsCamera.applyMouseDelta` so it composes with
  the damage-flinch path.
- Bumped the shared `impactEmitter` pool from `64 → 128` so a 32-spark blast
  can land without recycling particles still being drawn for in-flight
  projectile impacts.

The exterminate path emits 32 sparks at base speed 10; rescue 36 at base 9
(slightly bigger area, slightly less vertical bias) — kept distinct so the
two missions still have a recognisable signature.

### Deploy marker

A new ground+sky marker on `ExterminateMinigame` — a yellow additive ring
(`DEPLOY_MARKER_RADIUS = NEST_INTERACT_RANGE + 0.5 = 16.5 m`) flat on the
ground at the nest, with a thin 80 m vertical light beam rising from the
centre so it's visible from anywhere on the asteroid surface. Both layers
pulse on a ~1.1 Hz sine via opacity modulation so the marker reads as
"active waypoint" rather than a flat overlay.

Visibility lifecycle:

```
defenders alive          → marker hidden (combat is the cue)
defenders dead, !armed   → marker visible + pulsing
charges armed            → marker hidden (countdown HUD takes over)
detonated                → marker hidden permanently (cleared in detonate())
```

The outer ring radius matching `NEST_INTERACT_RANGE` doubles as a "you're
now in interact range" cue — when the player crosses the ring, the
`[E] DEPLOY EXPLOSIVE CHARGES` prompt activates simultaneously.

## Files Changed

- `src/lib/minigame/ExterminateMinigame.ts`
  - New constants: `EXPLOSION_CORE_DURATION`, `EXPLOSION_CORE_MAX_SCALE`,
    `SHOCKWAVE_DURATION`, `SHOCKWAVE_MAX_SCALE`, `DEPLOY_MARKER_RADIUS`,
    `DEPLOY_MARKER_BEAM_HEIGHT`, `DEPLOY_MARKER_PULSE_HZ`.
  - New geometries / materials for core flash, shockwave ring, deploy ring,
    deploy beam.
  - New fields: `explosionCore`, `shockwave`, `deployMarker`,
    `deployMarkerRing`, `deployMarkerBeam`, `deployMarkerPhase`,
    `explosionCoreTimer`, `shockwaveTimer`.
  - New helpers: `buildDeployMarker()`, `syncDeployMarker(dt, wantVisible)`.
  - `tick()` now calls `syncDeployMarker(dt, allDefendersDead && !this.armed)`.
  - `detonate()` resets all three explosion timers, hides the deploy marker.
  - `syncExplosionFlash()` now drives all three explosion layers.
  - `dispose()` removes + disposes the new meshes/materials.
  - Bumped `EXPLOSION_FLASH_DURATION 0.45 → 0.75`,
    `EXPLOSION_FLASH_MAX_SCALE 34 → 62`,
    `EXPLOSION_LIGHT_INTENSITY 6 → 18`,
    `EXPLOSION_LIGHT_DISTANCE 80 → 180`.
- `src/views/LevelViewController.ts`
  - New constants: `EXPLOSION_FLINCH_STRENGTH`, `EXPLOSION_FEEDBACK_RANGE`,
    `OBJECTIVE_EXPLOSION_IMPACT`.
  - New helper: `triggerObjectiveExplosion(pos, sparkBursts, sparkBaseSpeed)`
    that fires `LanderExplosion`, plays `sfx.explosion` with distance
    attenuation, sparks the impact emitter, and applies a proximity camera
    kick.
  - Both objective `onExplosion` callbacks now route through the helper.
  - `impactEmitter` pool bumped `64 → 128` to absorb the larger spark burst
    without recycling in-flight projectile-impact particles.

## Why not also pulse the deploy marker on the rescue minigame?

The user only asked for the exterminate variant and the rescue minigame uses a
different visual language (the virus mass is much taller and self-illuminated,
so it's already a clear waypoint). Adding the same marker to rescue is a
follow-up if it's ever needed — the helper geometries / materials are local
to `ExterminateMinigame` for now to avoid premature abstraction.

## Verification

- `bun run type-check` — exit 0.
- `bun test:unit` — 1127/1127 pass.
