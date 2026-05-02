# Shuttle Prelude — Asteroids Homage Design

**Date:** 2026-05-02
**Author:** guinetik
**Status:** Approved (pending implementation plan)

## Context

`index.html` hosts a self-contained prelude mini-game that runs while Vue
boots. There are now two preludes, gated by route:

- `LanderGame` — runs on `/` and most routes. "You're piloting your lander
  down to the moon to buy a shuttle." Existing, untouched by this spec.
- `ShuttleGame` — runs on `/level`. "You're cruising your shuttle to the
  asteroid you just selected on the solar map." **Currently a static SVG
  render with a slow bob — this spec replaces that with gameplay.**

Both classes extend a shared `PreludeGame` base (lifecycle, canvas init, rAF
loop). Public API to Vue stays the same: `window.Prelude.ready()` /
`window.Prelude.play()`.

## Fiction

> *Travelling to mission destination. Asteroid field ahead — shoot the small
> ones to clear a path. Stay alert.*

The shuttle stays still on screen. The world (stars, dust, asteroids) flows
*toward* the player from the top. This sells "we're cruising at speed"
without the prelude needing the shuttle to actually move.

When the host signals `ready()`, eventually a single big destination
asteroid appears, the game takes the wheel from the player, and the shuttle
flies off the top of the screen toward the rock — cinematic close, then
Vue takes over.

This is an explicit homage to the original Asteroids arcade game, adapted
to a vertical-scroller framing.

## Player Experience

### Controls

| Input        | Effect                                       |
| ------------ | -------------------------------------------- |
| W / Up       | Strafe up                                    |
| S / Down     | Strafe down                                  |
| A / Left     | Strafe left                                  |
| D / Right    | Strafe right                                 |
| SPACE        | Fire one bullet straight up (capped, cooldown)|
| Click / Tap  | Same as SPACE (fire)                         |

The shuttle does **not** rotate. WASD is direct 4-axis acceleration with
clamped max speed and drag, identical in feel to the lander's lateral
control extended to two axes.

Mouse swipe steering (used on the lander) is **not** carried over — the
shuttle game is keyboard/SPACE-first since you need both steering and
shooting at once.

### Loop

1. Stars and dust scroll downward (parallax: 2-3 layers, near layer faster).
2. Asteroids spawn off the top edge and drift downward with random lateral
   velocity and visual rotation. Spawn interval interpolates **linearly**
   from `ASTEROID_BASE_SPAWN_MS` down to `ASTEROID_MIN_SPAWN_MS` over
   `ASTEROID_RAMP_MS` of elapsed prelude time, then stays at the floor.
3. Player strafes to dodge, fires to clear the path. Each pop adds score.
4. **Splits:** big asteroid shot → splits into 2 medium. Medium → 2 small.
   Small → vanishes (highest points per pop).
5. **Collision:** shuttle blinks (semi-transparent, invulnerable) for
   ~1.5s, respawns at horizontal center / vertical lower-third. Any
   asteroid whose center is within `RESPAWN_CLEAR_RADIUS` of the
   respawn point is removed (no animation, instant) so the player
   doesn't instantly die again.
6. Score persists across deaths within a single prelude run.

### Finale (triggered by `Prelude.ready()`)

`ready()` does NOT immediately end the game. It arms the finale; the actual
sequence waits for a minimum elapsed time (so a fast host doesn't cut the
fun short) AND for the next "wave gap" (no big asteroid spawns mid-screen
on top of player asteroids).

Finale sequence:

1. Stop spawning normal asteroids. Existing in-flight asteroids continue
   drifting and remain shootable.
2. Spawn one **destination asteroid** off the top edge. Notably larger than
   any normal asteroid, slow descent, subtle outline pulse, no rotation
   wobble. Drifts to roughly screen-center vertically.
3. Header text swaps from "TRAVELLING TO MISSION DESTINATION" to
   "DESTINATION REACHED."
4. Player retains control during the arrival beat (~2s). Bullets that hit
   the destination rock just pop with a small spark — no damage.
5. **Takeover:** input is disabled. Shuttle accelerates upward toward the
   destination rock, fading as it approaches. When fully faded (or when
   the shuttle's logical position reaches the rock), the prelude
   container hides and `prelude-play` is dispatched, just like the
   existing PLAY button click path.

The PLAY button still appears as soon as `ready()` fires (separate from
the cinematic) so an impatient player can skip directly to Vue. Clicking
it short-circuits the finale.

## Architecture

### File / module placement

Stays inline in `index.html` next to the existing `LanderGame`. Reasons:
- Prelude code MUST run before Vue boots — moving it to `src/` would
  require it to ship as a separate non-module script in `public/` and be
  loaded by a `<script>` tag in `index.html` anyway. Net same complexity,
  more files.
- The class is self-contained and doesn't share types with Vue/Three code.
- Lander prelude already lives here as the established pattern.

If the file becomes unwieldy after the refactor, extract both classes into
`public/prelude.js` as a follow-up — but not in this spec.

### Class structure

`ShuttleGame extends PreludeGame` with the existing `_onCanvasInit`,
`_attachInput`, `_detachInput`, `_update`, `_draw`, `ready` overrides plus
the following internal subsystems, each isolated as a small helper on the
class instance:

- **`_updateShuttle(deltaSec)`** — applies WASD acceleration, drag, max
  speed clamp, screen-edge clamp, blink/invulnerable timer.
- **`_updateBullets(deltaSec)`** — moves bullets, expires by lifetime,
  enforces simultaneous cap.
- **`_updateAsteroids(deltaSec)`** — spawns from top edge per current
  spawn rate, drifts, wraps laterally, despawns off-bottom, rotates
  visually.
- **`_updateCollisions()`** — bullet↔asteroid (split + score),
  shuttle↔asteroid (blink + respawn). Skips collisions when shuttle is
  invulnerable.
- **`_updateStarfield(deltaSec)`** — scrolls 2-3 parallax layers, recycles
  off-bottom stars to the top.
- **`_updateFinale(dt)`** — runs only when `state === 'finale'`. Manages
  destination-asteroid drift, takeover timer, shuttle auto-pilot, fade.

Render path (`_draw`): clear → starfield → bullets → asteroids → shuttle
(with blink alpha) → HUD text → finale overlay. Layer order chosen so the
shuttle reads on top of debris.

### State machine

`this.state` is one of:

- `'cruising'` — normal play. Asteroids spawn, player has control.
- `'finale'` — `ready()` fired and arrival beat is in progress.
- `'exit'` — takeover engaged. No input. Shuttle auto-flies up. Ends with
  prelude hide + `prelude-play` event.

Transitions:
- `cruising → finale`: `readyPending && elapsed >= MIN_RUN_MS`.
- `finale → exit`: destination asteroid has been visible >=
  `DESTINATION_LINGER_MS` AND it has reached its target Y.
- `exit → (done)`: shuttle alpha hits 0 OR shuttle Y < `EXIT_Y_THRESHOLD`.

`MIN_RUN_MS` exists so a fast host doesn't cut the player's run instantly,
mirroring the lander's `MIN_FALLING_MS` discipline.

### Asteroid representation

```
{
  x, y,                  // center, canvas-space
  vx, vy,                // px/s
  size: 'big' | 'med' | 'small',
  radius,                // collision + render scale, derived from size
  vertices,              // array of {angle, distance} for irregular shape,
                         //   generated once at spawn
  rotation, rotationVel, // visual only, not used for collision
}
```

Rendering: `ctx.beginPath()`, walk vertices around the center applying
rotation, stroke as outline (vector-arcade look — matches the shuttle
stroke style and the lander's terrain).

Splits: a big or medium asteroid that gets shot is replaced with two new
asteroids one tier smaller, spawned at the parent's position with
divergent velocities (parent.vx ± a small lateral kick, vy preserved with
a small randomization).

### Bullet representation

```
{ x, y, vy: -BULLET_SPEED, life: BULLET_LIFETIME_S }
```

Fired from the shuttle's nose (top-center of the shuttle visual). Drawn
as a short white line segment. Cap of `MAX_BULLETS` simultaneous bullets;
SPACE input is rate-limited by `BULLET_COOLDOWN_MS` regardless.

### Tuning constants

All numeric tuning lives as `static` fields on `ShuttleGame`. No magic
numbers in update/draw bodies. Initial values (subject to feel-tuning):

| Constant                       | Value         | Notes                                       |
| ------------------------------ | ------------- | ------------------------------------------- |
| `STAR_LAYERS`                  | 3             | parallax depth                              |
| `STAR_COUNT_PER_LAYER`         | 60 / 40 / 25  | nearer = more, faster                       |
| `STAR_LAYER_SPEEDS`            | 180 / 90 / 35 | px/s downward                               |
| `SHUTTLE_ACCEL`                | 900           | px/s² per axis when key held                |
| `SHUTTLE_MAX_SPEED`            | 320           | px/s, clamped per axis                      |
| `SHUTTLE_DRAG`                 | 600           | px/s² when no key on that axis              |
| `BULLET_SPEED`                 | 700           | px/s upward                                 |
| `BULLET_LIFETIME_S`            | 0.9           | seconds                                     |
| `BULLET_COOLDOWN_MS`           | 180           | between consecutive shots                   |
| `MAX_BULLETS`                  | 4             | simultaneous                                |
| `ASTEROID_BASE_SPAWN_MS`       | 1400          | spawn interval at t=0                       |
| `ASTEROID_MIN_SPAWN_MS`        | 450           | floor as difficulty ramps                   |
| `ASTEROID_RAMP_MS`             | 25000         | seconds to reach floor                      |
| `ASTEROID_BIG_RADIUS`          | 38            | px                                          |
| `ASTEROID_MED_RADIUS`          | 24            | px                                          |
| `ASTEROID_SMALL_RADIUS`        | 14            | px                                          |
| `ASTEROID_VY_MIN/MAX`          | 60 / 130      | px/s downward                               |
| `ASTEROID_VX_RANGE`            | ±40           | px/s lateral                                |
| `ASTEROID_ROT_VEL_RANGE`       | ±1.2          | rad/s visual                                |
| `SCORE_BIG/MED/SMALL`          | 20 / 50 / 100 | points per pop                              |
| `RESPAWN_BLINK_MS`             | 1500          | invulnerable window                         |
| `RESPAWN_CLEAR_RADIUS`         | 110           | px around respawn — clear nearby asteroids  |
| `MIN_RUN_MS`                   | 4500          | matches lander; minimum prelude length      |
| `DESTINATION_RADIUS`           | 110           | px                                          |
| `DESTINATION_TARGET_Y_RATIO`   | 0.45          | of canvas height                            |
| `DESTINATION_DRIFT_SPEED`      | 50            | px/s                                        |
| `DESTINATION_LINGER_MS`        | 2000          | dwell time before takeover                  |
| `EXIT_ACCEL`                   | 800           | px/s² upward during takeover                |
| `EXIT_FADE_MS`                 | 900           | shuttle fade duration                       |

## Out of Scope

- **No persistence.** Score doesn't carry into the actual `/level` game
  state. The prelude is throwaway.
- **No audio.** Sound design comes later if we want it (the lander has
  none either).
- **No mobile-specific gestures.** Tap = fire, that's it. WASD-equivalent
  on touch is a future spec.
- **No bullet upgrades / power-ups.** Pure single-shot.
- **No animated background gradients / nebulae.** Just stars + dust.
- **No big-asteroid destruction.** It's an environmental object during the
  finale, not a target.
- **No leaderboard / high score storage.** Score is ephemeral.

## Risks / Open Questions

- **Bun dev startup speed:** if Vue boots in <500ms, `ready()` fires
  almost instantly and only `MIN_RUN_MS` keeps the prelude alive. That's
  the same trade-off the lander has and is considered acceptable.
- **DPR scaling:** existing `PreludeGame._initCanvas` already handles DPR
  correctly. Spawn/draw code uses `this.width` / `this.height` (CSS
  pixels), so this stays clean.
- **Procedural asteroid shape variety:** with N=8-12 vertices and
  per-vertex distance jitter of ±25%, shapes should look distinct. Will
  feel-tune after first pass.
- **Difficulty curve fairness:** the ramp from `ASTEROID_BASE_SPAWN_MS`
  → `ASTEROID_MIN_SPAWN_MS` over `ASTEROID_RAMP_MS` is a guess. Expect to
  tune after playing for 30s straight.

## Acceptance Criteria

- Navigating to `/level` shows the asteroids prelude (not the lander).
- Navigating to `/` (or anywhere else) still shows the lander.
- WASD strafes the shuttle, SPACE fires, asteroids spawn from above, can
  be shot, split into smaller pieces, and award score.
- Collision with an asteroid blinks the shuttle, respawns at center, does
  NOT end the run.
- After `MIN_RUN_MS`, when host calls `ready()`, the destination asteroid
  appears, header changes, player loses control after `DESTINATION_LINGER_MS`,
  shuttle auto-flies up, prelude exits and Vue takes over.
- PLAY button is present once `ready()` is signalled and clicking it
  cleanly exits regardless of where the cinematic is in its sequence.
- No magic numbers in update/draw bodies — all tunables are static fields.
- `bun run type-check` and `bun run lint` still pass (no source changes
  outside `index.html`).
