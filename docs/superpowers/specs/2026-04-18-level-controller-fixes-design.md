# LevelViewController review fixes

- **Author:** guinetik
- **Date:** 2026-04-18
- **Status:** Implemented

## Summary

Three behaviour bugs surfaced from playtesting `LevelViewController.ts`:

1. The player could die of hypoxia at the lander's airlock — entering the
   lander did not rescue them, and the hypoxia vignette stuck around even
   after they made it back inside.
2. The lander would happily "land" against vertical or near-vertical walls,
   coming to rest sideways on a cliff face instead of crashing.
3. Enemies spawned for `exterminate` (and `rescue`) missions wandered in
   tiny circles next to their spawn point and never aggro'd until the
   player was almost on top of them, making encounters feel static.

This design covers the surgical fixes for each.

## Fix 1 — Lander rescue from hypoxia

### Problem

`FpsPlayerController.tick()` drains O2 every frame and starts ticking HP
down once the tank is empty
(`config.health.hypoxiaDamagePerSecond * dt`). When HP hits zero,
`onDeath` fires and `LevelViewController` jumps the state machine into
`dead` regardless of where the player is standing.

The intended affordance — sprint back to the lander, press `F`, get O2
back from life support — only works if the player physically presses the
interact key before HP runs out. A player coasting in on the last meter
of stamina was rolling the dice.

In addition, the EVA hypoxia vignette is driven inside
`if (this.stateMachine?.is('eva'))` in `tick()`, so the
`onDeathFade` callback never gets a `0` after the state changes — the
darken stuck around through the entire lander leg.

### Solution

Two small changes in `LevelViewController`:

1. The `playerController.onDeath` handler now checks
   `isPlayerNearLander()` first. If the player is within
   `LANDER_INTERACT_RANGE` of the lander when they die, we treat it as a
   last-ditch climb-back-in: `replenish()`, clear the death fade, and
   trigger `enterVehicle` instead of `die`.
2. `exitEva()` now also calls `onDeathFade?.(0)` so the suit-darken
   clears the moment the player is back inside the cockpit, no matter
   what triggered the EVA exit.

The behaviour is intentionally limited to dying *while standing next to
the lander* — actual death anywhere else still goes through the dead
state and respawn flow.

## Fix 2 — Reject wall landings

### Problem

`LanderController` evaluates landing safety on the airborne→grounded
transition using `Math.sqrt(this.tiltX² + this.tiltZ²)` for the impact
angle. Those tilt values are visual lerp targets — on the very first
frame of contact they still hold the airborne value, so a hard sideways
slam into a cliff face read as a perfectly upright touchdown. The
support-height pass ran by `sampleTerrainSupport` averages the top three
of nine probes around the lander, so a lander hugging a cliff would also
get its `position.y` snapped up onto the cliff lip — looking like it
"landed" sideways.

### Solution

Inside the landing-transition block in `LanderController.tick()`, also
sample the terrain support normal directly and convert it into a slope
angle (`acos(normal.y)`). Damage is now computed from three independent
excess channels:

- `speedExcess` × `SPEED_DAMAGE_MULTIPLIER` — descent speed past
  `SAFE_LANDING_SPEED`.
- `tiltExcess` × `ANGLE_DAMAGE_MULTIPLIER` — lander's own tilt past
  `SAFE_LANDING_ANGLE` (preserves the existing inverted-landing damage).
- `slopeExcess` × `SURFACE_SLOPE_DAMAGE_MULTIPLIER` — surface slope at
  contact past `SAFE_LANDING_ANGLE`. The new `90.0` multiplier is sized
  so that touching down on a near-vertical wall (slope ≈ π/2 rad) deals
  more than `LANDER_BASE_HP` damage on its own, guaranteeing a crash
  even at zero descent speed.

Rough damage curve (slope only, lander otherwise upright at 0 m/s):

| Surface slope | Damage |
| ------------- | ------ |
| 30°           | ~24    |
| 45°           | ~47    |
| 60°           | ~71    |
| 75°           | ~94    |
| 90°           | ~118   |

Combined with descent damage, anything past ~60° is effectively a
crash, while gentle slopes around the flat-zone pads stay landable.

## Fix 3 — Defenders patrol and aggro on landing

### Problem

`enemy-types.json` shipped with very small `aggroRadius` (40–50) and
`wanderRadius` (10–16) values, but the exterminate/rescue minigames
spawn enemies anywhere inside `SITE_RADIUS = FLAT_ZONE_RADIUS * 0.82
≈ 246` units of the objective. The player's lander parks near the
objective center, so most defenders spawn outside their own aggro
range and idle in 10–16 unit circles — they look frozen at distance.

### Solution

Bump the AI ranges in `src/data/fps/enemy-types.json` to match the
encounter footprint:

- `aggroRadius`: `40–50` → `220` for all three types — enemies engage
  as soon as the player drops out of the lander.
- `leashRadius`: `60–70` → `320` — defenders commit to the chase
  through most of the encounter area instead of giving up after a few
  seconds.
- `wanderRadius`: `10–16` → `60–80` — idle patrols cover meaningful
  ground around their spawn.
- `bacteriophage.wanderSpeed`: `2.0` → `2.5` — the melee swarm visibly
  moves between waypoints instead of creeping.

Other ranges (`agitateRadius`, `preferredRange`, `eyeLaserMaxRange`)
are left untouched — those tune fire-control behaviour, not "are they
moving / chasing" behaviour.

## Files changed

- `src/views/LevelViewController.ts` — lander rescue + clear EVA fade.
- `src/three/LanderController.ts` — surface-slope damage channel +
  `SURFACE_SLOPE_DAMAGE_MULTIPLIER` constant.
- `src/data/fps/enemy-types.json` — wander/aggro/leash bumps for
  bacteriophage, spire, chimera.
