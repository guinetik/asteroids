# Probe Deploy Minigame — Mercury & Uranus

**Author:** guinetik
**Date:** 2026-04-11
**Inspo:** `docs/inspo/mercury-surface-canvas.html`, `docs/inspo/uranus-canvas.html`

## Overview

Side-view orbital minigame for Mercury and Uranus shuttle missions. The ship orbits along the left edge while a massive planet fills the right ~85% of the canvas. The planet rotates, revealing target zones on its surface. The player moves up/down, times their shots, and drops probes onto highlighted targets as they rotate into range — all while dodging meteorites.

Same game logic for both planets. Canvas renderer switches visual theme based on `planetId`.

**Status lifecycle:** `active` → `completed` (all targets hit) or `failed` (probes exhausted, timer expired, or hull depleted).

## Canvas & Layout

- **Canvas:** 800 x 500 px.
- **Planet:** Center at ~(550, 250), radius ~220 px. Rotates at constant speed. Surface features scroll with rotation.
- **Ship:** Locked to x ~80, moves vertically only. Orbital lane along the left edge.
- **Meteorites:** Drift from right to left across the play area between ship and planet.

## Movement

Ship moves vertically only. No gravity. Pure arcade.

- `SHIP_ACCEL = 800 px/s²`
- `SHIP_DRAG = 0.96` — velocity multiplier per frame
- `SHIP_MAX_SPEED = 450 px/s`
- `SHIP_X = 80` — fixed horizontal position
- Clamped to canvas with `EDGE_PADDING = 30` px

Input: W/S or Up/Down arrows.

## Probes

Press SPACE to launch a probe.

- Probe flies horizontally from ship position toward the planet at `PROBE_SPEED = 500 px/s`.
- Straight horizontal line at the ship's Y at time of launch.
- Travel time ~0.5s — not instant, adds a leading-the-target feel.
- On reaching the planet perimeter, checks if any uncompleted target zone is within `TARGET_HIT_RADIUS = 20 px` of the impact point.
- **Hit:** Target marked complete, probe consumed.
- **Miss:** Probe consumed, visual splash on planet surface.
- `PROBE_COOLDOWN = 1.5 s` between launches.
- Limited supply: `probeCount = targetCount + 2`.
- All probes spent with targets remaining = `failed`.

## Planet Rotation & Targets

**Rotation:**
- Constant angular speed: `PLANET_ROTATION_SPEED = 0.4 rad/s` (~16s per full rotation).
- Surface features (craters, bands) rotate with it.

**Target zones:**
- Each target has a fixed `angle` on the planet surface (evenly distributed around circumference).
- World position each frame: `x = planetX + cos(angle + rotation) * planetR`, `y = planetY + sin(angle + rotation) * planetR`.
- A target is **visible** when on the ship-facing side (left hemisphere): `cos(angle + rotation) < 0`.
- A target is **droppable** (glows bright) when within ±60° of the ship-facing edge.
- Dimmed/hidden when rotated to the far side.

**Hit detection:**
- When probe reaches planet perimeter, compute impact angle from the probe's Y position.
- Check distance between impact point and each uncompleted target's current position.
- `TARGET_HIT_RADIUS = 20 px` — generous enough to feel fair.

## Meteorites

Same pattern as Saturn ice harvest — obstacles only, no way to destroy them.

- Spawn from right edge, drift left at varying speeds (80-200 px/s).
- Random sizes: small (r=10), medium (r=18), large (r=28).
- Spawn rate ramps over time: `METEORITE_SPAWN_INTERVAL_START = 1.5 s`, ramps to `METEORITE_SPAWN_INTERVAL_MIN = 0.5 s` over `METEORITE_SPAWN_RAMP_DURATION = 45 s`.
- Size weights: [0.5, 0.35, 0.15] (small, medium, large).
- Ship collision: `METEORITE_DAMAGE = 15` HP + knockback impulse + `DAMAGE_GRACE_PERIOD = 1.0 s`.
- Fly off left edge and despawn.
- Meteorites can also block/absorb probes — if a probe hits a meteorite before reaching the planet, the probe is consumed and the meteorite is unaffected.

## Hull & Timer

- `HULL_MAX_HP = 100`. Depleted = fail.
- `TIMER_BASE = 45 s`, `TIMER_PER_TARGET = 5 s`.
- Total timer: `TIMER_BASE + TIMER_PER_TARGET * targetCount`.
- Expires = fail.

## Difficulty Scaling

Single knob: `targetGas` (mission gather quantity).

| targetGas | Targets | Probes | Timer | Rotation speed | Meteorite spawn |
|-----------|---------|--------|-------|----------------|-----------------|
| 1-2 | 3 | 5 | 60s | 0.4 rad/s | slow |
| 3-4 | 4 | 6 | 65s | 0.45 rad/s | medium |
| 5+ | 5 | 7 | 70s | 0.5 rad/s | fast |

Formulas:
- `targetCount = min(5, max(3, targetGas + 1))`
- `probeCount = targetCount + 2`
- `timer = TIMER_BASE + TIMER_PER_TARGET * targetCount`
- `rotationSpeed = PLANET_ROTATION_SPEED + ROTATION_SPEED_PER_TARGET * max(0, targetGas - 2)`

## Theming

**One game class, two visual themes.** `ProbeDeployMiniGame` accepts `planetId` alongside `missionId` and `targetGas`. Game logic is identical. Canvas renderer switches visuals.

### Mercury Theme

- Scorched gray surface with craters, sun-lit from upper-left
- Massive sun corona glow upper-left (partially off-screen, R=320)
- Solar wind particles streaming across
- Coronal streamers radiating from sun
- Heat shimmer near surface, orange/red gas puffs
- Heat haze overlay
- Meteorites: rocky, dark, sun-lit on one side
- Target zones glow warm orange when droppable

### Uranus Theme

- Teal-cyan ice giant, featureless with subtle bands
- Faint dark rings (nearly vertical due to axial tilt)
- Tiny distant sun upper-right (R=4)
- Kuiper belt particles in background
- Ice crystals drifting with sparkle effects
- Methane atmosphere haze near planet edge
- Meteorites: icy, blue-white, sparkling
- Target zones glow cool cyan when droppable

## HUD

- **Probe count (top-left):** "PROBES: 4 / 6"
- **Timer (top-left):** countdown in seconds
- **Target progress:** "TARGETS: 2 / 4"
- **Health bar (top-right):** color-coded (green > 50%, yellow > 25%, red below)
- Cyan/monospace aesthetic matching existing HUD

## File Structure

```
src/lib/minigame/probeDeploy/
  ProbeDeployMiniGame.ts                — pure game logic
  types.ts                              — Probe, Meteorite, PlanetTarget, ShipInput
  constants.ts                          — all tuning constants
  __tests__/ProbeDeployMiniGame.spec.ts

src/components/
  ProbeDeployCanvas.vue                 — canvas renderer (Mercury + Uranus themes)
```

## Integration

### Factory (`orbitalMiniGameFactory.ts`)

The factory signature needs to accept `planetId` so probe-deploy can theme itself:

```ts
export function createOrbitalMiniGame(
  missionId: string,
  minigameType: string,
  targetGas: number,
  planetId?: string,
): OrbitalMiniGame
```

```ts
case 'probe-deploy':
  return new ProbeDeployMiniGame(missionId, targetGas, planetId ?? 'mercury')
```

Callers already have `planetId` available from the mission template — just need to pass it through.

### Overlay (`MissionMiniGameOverlay.vue`)

- `instanceof ProbeDeployMiniGame` check + computed.
- `<ProbeDeployCanvas :minigame="probeMinigame" @complete @fail />` block.
- Same card chrome pattern as other minigames.

### Config

`planet-orbital-config.json` already maps Mercury and Uranus to `"probe-deploy"` — no config changes needed.

## Public API (ProbeDeployMiniGame)

Implements `OrbitalMiniGame` + `OrbitalMiniGameEvents`.

| Member | Type | Description |
|--------|------|-------------|
| `status` | `OrbitalMiniGameStatus` | `'active'` / `'completed'` / `'failed'` |
| `missionId` | `string` | Mission id |
| `planetId` | `string` | `'mercury'` or `'uranus'` |
| `steps` | `OrbitalMiniGameStep[]` | Two steps |
| `progressCurrent` | `number` | Targets hit |
| `progressTotal` | `number` | Total targets |
| `shipY` | `number` | Ship vertical position |
| `shipVy` | `number` | Ship vertical velocity |
| `hullHp, hullMaxHp` | `number` | Health |
| `probesRemaining` | `number` | Probes left |
| `probeCount` | `number` | Total probes |
| `probeCooldown` | `number` | Cooldown timer |
| `activeProbe` | `Probe \| null` | In-flight probe |
| `targets` | `PlanetTarget[]` | Target zones on surface |
| `meteorites` | `Meteorite[]` | Active meteorites |
| `planetRotation` | `number` | Current rotation angle |
| `timeRemaining` | `number` | Timer |
| `damageFlash` | `number` | Grace period timer |
| `setInput(input)` | method | W/S input state |
| `launchProbe()` | method | Fire probe (SPACE) |
| `tick(dt, ctx)` | method | Per-frame update |
| `complete()` | method | No-op (win is automatic) |
| `dispose()` | method | Cleanup |

## Tests

Focus on pure logic in `ProbeDeployMiniGame.spec.ts`:

- Target count respects `min(5, max(3, targetGas + 1))`.
- Probe count = targetCount + 2.
- Launching probe creates activeProbe, decrements probesRemaining.
- Probe cooldown prevents rapid fire.
- No probe launch when probesRemaining = 0.
- Probe hitting a target marks it complete, advances progress.
- Probe missing a target consumes the probe without progress.
- Probe hitting a meteorite is consumed.
- All targets hit → status `'completed'`, `onComplete` fires.
- All probes spent with targets remaining → status `'failed'`.
- Timer expiry → status `'failed'`.
- Hull depleted → status `'failed'`.
- Meteorite collision reduces hull HP.
- Grace period prevents double-hit.
- Planet rotation advances each tick.
- Target visibility depends on rotation (facing ship = visible).
- Difficulty scaling: rotation speed and meteorite rate scale with targetGas.
- Tick is no-op after completed/failed.
