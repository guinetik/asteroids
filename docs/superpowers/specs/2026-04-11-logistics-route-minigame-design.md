# Earth Orbital Minigame — Logistics Route Runner

**Author:** guinetik
**Date:** 2026-04-11
**Inspo:** `docs/inspo/earth-logistics-canvas.html`

## Overview

Vertical scroller minigame for Earth shuttle missions. The shuttle flies "up" through scrolling orbital shipping lanes near Earth. Player collects route symbols in manifest order while dodging traffic shuttles.

**Status lifecycle:** `active` → `completed` (all symbols collected) or `failed` (hull depleted).

## Canvas & Layout

- **Canvas:** 800 × 500 px (matches all other minigames).
- **Earth backdrop:** Large sphere partially off-screen to the right (~25% of canvas), matching the canvas inspo. Atmosphere glow, continents, cloud swirls, city lights on the dark side.
- **Lane area:** Left ~75% of canvas. 5 lanes evenly spaced.
  - `LANE_START_X = 64`, `LANE_SPACING = 100` — lane centers at x = 164, 264, 364, 464, 564.
  - Dashed lane dividers scroll down, outer boundaries slightly brighter.
- **Background:** Starfield, distant space station silhouettes (parallax), scroll particles for speed reference, vignette.

## Movement & Physics

No gravity. Pure arcade dodging.

### Vertical (W/S or Up/Down)

- `SHIP_ACCEL = 600 px/s²` — high responsiveness.
- `SHIP_DRAG = 0.90` — velocity multiplier per frame, ship stops quickly on release.
- `SHIP_MAX_SPEED_Y = 350 px/s`.

### Horizontal (A/D or Left/Right)

- Same acceleration model but with a soft spring: when no A/D input, ship drifts back toward `centerX` (horizontal midpoint of the lane area).
- `SPRING_STRENGTH = 3.0` — gentle pull, player can fight it with A/D.
- `SHIP_MAX_SPEED_X = 200 px/s` — slower than vertical; nudging between lanes, not racing sideways.

### Bounds

Ship clamped to canvas with ~30px edge padding.

## Entities

### Route Symbols (collectibles)

Five symbol types: `star`, `diamond`, `circle`, `triangle`, `square`.

- Spawn above screen at `y = -30`, lane-centered (random lane).
- Scroll down at `scrollSpeed`.
- One symbol in the pipeline at a time — next spawns after `SYMBOL_SPAWN_INTERVAL = 1.8 s`.
- At default scroll speed (100 px/s), this yields ~3–4 symbols visible on screen at once, generously spaced.
- Collection radius: `SYMBOL_COLLECT_RADIUS = 20 px`.
- Only the symbol matching `manifest[manifestIndex]` advances progress. Others are ignored (no penalty).
- Symbols that scroll off the bottom are missed — no damage, just wasted time.

### Traffic Shuttles (hazards)

- Spawn above screen, lane-centered with ±8 px X jitter.
- Each gets its own speed: `scrollSpeed * (0.8 + random * 0.6)`.
- Minimum vertical gap enforced: `MIN_TRAFFIC_GAP = 120 px`.
- Max on-screen count capped (scales with difficulty).
- Collision with player: `TRAFFIC_DAMAGE = 15` HP + knockback impulse away from traffic shuttle.
- Traffic collision radius: ~12 px. Player collision radius: ~14 px.

### Damage & Grace Period

- `HULL_MAX_HP = 100`.
- `DAMAGE_GRACE_PERIOD = 1.0 s` — invulnerable after hit, prevents stun-lock.
- `damageFlash` timer drives visual blink feedback.

## Manifest & Progression

- Generated at start: random array of `RouteSymbolType`, length = `max(4, targetGas)`.
- `manifestIndex` starts at 0, advances when player flies through the correct next symbol.
- Wrong symbols: no penalty, just ignored.
- **Win:** `manifestIndex === manifest.length` → status `'completed'`.
- **Lose:** `hullHp <= 0` → status `'failed'`.
- **No timer.** Pressure comes from scroll speed and traffic density — staying alive long enough to catch all the right symbols.

## Difficulty Scaling

Single knob: `targetGas` (mission gather quantity). Floor at 4.

| targetGas | Manifest length | Scroll speed | Max traffic on screen |
|-----------|----------------|--------------|-----------------------|
| 2         | 4              | 100 px/s     | 4                     |
| 4         | 4              | 100 px/s     | 4                     |
| 6         | 6              | 120 px/s     | 5                     |
| 8         | 8              | 140 px/s     | 6                     |

Formulas:
- `manifestLength = max(4, targetGas)`
- `scrollSpeed = BASE_SCROLL_SPEED + SCROLL_SPEED_PER_TARGET * max(0, targetGas - 4)`
- `maxTraffic = BASE_TRAFFIC_COUNT + floor(max(0, targetGas - 4) / 2)`

Where `BASE_SCROLL_SPEED = 100`, `SCROLL_SPEED_PER_TARGET = 10`, `BASE_TRAFFIC_COUNT = 4`.

## HUD

- **Manifest card (top-left):** Shows current target symbol with glow, progress counter ("3 / 8"). Matches canvas inspo layout.
- **Health bar (top-right):** Cyan/monospace aesthetic matching existing game HUD.

## Rendering

Visual language from the canvas inspo (`docs/inspo/earth-logistics-canvas.html`):

- Earth partially off-screen right with atmosphere glow, continents, cloud swirls, city lights.
- Scrolling dashed lane dividers.
- Distant space station silhouettes at parallax speeds.
- Scroll particles for speed reference.
- Player shuttle: larger, bright, pointing up with engine glow trail.
- Traffic shuttles: smaller, dimmer, pointing down with running lights.
- Route symbols: glow + outlined shape (star/diamond/circle/triangle/square).
- Vignette overlay.

## File Structure

```
src/lib/minigame/logistics/
  LogisticsRouteMiniGame.ts          — pure game logic, implements OrbitalMiniGame
  types.ts                           — RouteSymbol, TrafficShuttle, ShipInput
  constants.ts                       — all tuning constants
  __tests__/LogisticsRouteMiniGame.spec.ts

src/components/
  LogisticsRouteCanvas.vue           — canvas renderer + input binding
```

## Integration

### Factory (`orbitalMiniGameFactory.ts`)

```ts
case 'logistics':
  return new LogisticsRouteMiniGame(missionId, targetGas)
```

### Overlay (`MissionMiniGameOverlay.vue`)

- `instanceof LogisticsRouteMiniGame` check + computed.
- `<LogisticsRouteCanvas :minigame="logisticsMinigame" @complete @fail />` block.
- Same card chrome pattern as ice harvest / gas collection.

### Config

`planet-orbital-config.json` already maps Earth to `"logistics"` / `"cargo-container"` — no config changes needed.

## Public API (LogisticsRouteMiniGame)

Implements `OrbitalMiniGame` + `OrbitalMiniGameEvents`.

| Member | Type | Description |
|--------|------|-------------|
| `status` | `OrbitalMiniGameStatus` | `'active'` / `'completed'` / `'failed'` |
| `missionId` | `string` | Mission id |
| `steps` | `OrbitalMiniGameStep[]` | One step per manifest symbol |
| `progressCurrent` | `number` | `manifestIndex` |
| `progressTotal` | `number` | `manifest.length` |
| `shipX, shipY` | `number` | Ship position |
| `shipVx, shipVy` | `number` | Ship velocity |
| `hullHp, hullMaxHp` | `number` | Health |
| `manifest` | `RouteSymbolType[]` | Symbol sequence to collect |
| `manifestIndex` | `number` | Next symbol to collect |
| `symbols` | `RouteSymbol[]` | Active symbols on screen |
| `traffic` | `TrafficShuttle[]` | Active traffic on screen |
| `scrollSpeed` | `number` | Current scroll speed |
| `damageFlash` | `number` | Grace period timer |
| `setInput(input)` | method | WASD input state |
| `tick(dt, ctx)` | method | Per-frame update |
| `complete()` | method | No-op (win is automatic) |
| `dispose()` | method | Cleanup |

## Tests

Focus on pure logic in `LogisticsRouteMiniGame.spec.ts`:

- Manifest generation respects `max(4, targetGas)` floor.
- Collecting correct symbol advances `manifestIndex`.
- Collecting wrong symbol does not advance.
- All symbols collected → status `'completed'`, `onComplete` fires.
- Traffic collision reduces `hullHp` by `TRAFFIC_DAMAGE`.
- Grace period prevents double-hit.
- `hullHp <= 0` → status `'failed'`.
- Difficulty scaling: scroll speed and max traffic scale with `targetGas`.
- Symbols and traffic spawn within lane bounds.
- Ship spring returns to center when no horizontal input.
