# Map Gravity & Death System

**Date:** 2026-04-05  
**Status:** Draft

## Goal

Add gravitational pull from the Sun and planets to the map view so the shuttle follows spacetime fabric curvature and can die by crossing an event horizon. Reuses the existing gravity math from `src/lib/physics/gravity.ts` with map-scale tuning constants.

## Context

The shuttle scene already has gravity, spacetime grid following, and death via `CelestialBody` + `ShuttleController`. The map scene has the spacetime grid rendered but the shuttle ignores it (fixed Y=0, no gravity wells). The orbit-capture-slingshot spec (`2026-04-05-orbit-capture-slingshot-design.md`) listed map gravity as out-of-scope / future work — this spec fills that gap.

## Approach: Parameterized Gravity Constants

The 4 hardcoded constants in `gravity.ts` (`GRAVITY_CONSTANT`, `MIN_GRAVITY_DISTANCE`, `INFLUENCE_RADIUS_SCALE`, `EVENT_HORIZON_SCALE`) become optional config parameters on the public functions. Default values stay unchanged so the shuttle scene is unaffected. The map scene passes a `GravityConfig` loaded from `src/data/shuttle/map-gravity.json`.

### Scale Reference

| Property | Shuttle Scene | Map Scene |
|----------|--------------|-----------|
| Shuttle scale | 1.0 (MODEL_SCALE=0.01 on mesh) | 0.01 on group |
| Sun distance | 0 (origin) | 0 (origin) |
| Earth distance | ~400–1500 (random spawn) | ~15 units (149.6 AU * ORBIT_SCALE 0.1) |
| Sun display radius | 50 units | ~2.25 units (0.045 * SIZE_SCALE 50) |
| Earth display radius | N/A | ~0.385 units (0.0077 * SIZE_SCALE 50) |
| Jupiter display radius | N/A | ~0.825 units (0.0165 * SIZE_SCALE 50) |
| Thrust speed cap | 60 | 2 |
| Gravity speed cap | 150 | 5 |

### Map Gravity Tuning

Config in `src/data/shuttle/map-gravity.json`:

```json
{
  "gravityConstant": 0.08,
  "minDistance": 0.3,
  "influenceScale": 8,
  "eventHorizonScale": 1.2
}
```

Resulting radii (influence / event horizon):
- **Sun** (mass=1.0): influence=8, horizon=1.2 — dominates inner solar system
- **Jupiter** (mass=9.55e-4): influence=0.25, horizon=0.037 — noticeable pull zone
- **Saturn** (mass=2.86e-4): influence=0.14, horizon=0.020 — subtle pull
- **Earth** (mass=3e-6): influence=0.014, horizon=0.002 — must fly right into it

These values need playtesting. The JSON config makes iteration instant.

## Changes

### `src/lib/physics/gravity.ts`

New exported interface and parameter additions:

```ts
export interface GravityConfig {
  gravityConstant: number
  minDistance: number
  influenceScale: number
  eventHorizonScale: number
}
```

Functions gain an optional trailing `config?: GravityConfig` parameter:
- `influenceRadius(mass, config?)` — uses `config.influenceScale` or default 400
- `eventHorizonRadius(mass, config?)` — uses `config.eventHorizonScale` or default 230
- `gravityAt(sx, sz, mass, px, pz, config?)` — uses `config.gravityConstant`, `config.minDistance`, `config.influenceScale` or defaults
- `checkEventHorizon(sources, px, pz, config?)` — uses `config.eventHorizonScale` or default

No behavioral change when config is omitted. Shuttle scene code is untouched.

### `src/three/ShuttleController.ts`

1. **Constructor** accepts optional `GravityConfig`:
   ```ts
   constructor(inputManager, physics?, gravityConfig?)
   ```
   Stored as `this.gravityConfig`. Passed to `checkEventHorizon()` in `checkDeath()` and to `getGravityAt` calls.

2. **`onDeath` callback** — new public field:
   ```ts
   onDeath: (() => void) | null = null
   ```
   Called when the death animation reaches center (currently calls `this.respawn()`). If `onDeath` is set, call it instead of `respawn()`. If not set, fall back to `respawn()` (shuttle scene unchanged).

3. **`GravityWell` interface** — make it exported so MapViewController can create adapters:
   ```ts
   export interface GravityWell {
     getGravityAt(position: THREE.Vector3): THREE.Vector3
   }
   ```

### `src/data/shuttle/map-gravity.json` (new)

```json
{
  "gravityConstant": 0.08,
  "minDistance": 0.3,
  "influenceScale": 8,
  "eventHorizonScale": 1.2
}
```

### `src/views/MapViewController.ts`

1. Import `GravityConfig` and load `map-gravity.json`
2. Pass `gravityConfig` to `ShuttleController` constructor
3. Call `shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)` — shuttle follows fabric Y
4. Create `GravityWell` adapters for `SunController` and each `PlanetSystemController`:
   ```ts
   function makeGravityWell(source: GravitySource, config: GravityConfig): GravityWell & GravitySource {
     return {
       ...source (mass, getWorldX, getWorldZ),
       getGravityAt(pos) {
         const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, pos.x, pos.z, config)
         return new Vector3(g.ax, 0, g.az)
       }
     }
   }
   ```
5. Call `shuttleController.addGravityWell(well)` for Sun + all planets
6. Set `shuttleController.onDeath = () => { /* no-op for now — orbit-capture will handle respawn into Earth orbit */ }`

### `src/three/GravityDistortionPass.ts` (new)

Custom post-processing `ShaderPass` for the map scene's `EffectComposer`. Two layered effects driven by a single `proximity` uniform (0 = safe, 1 = event horizon):

**Effect 1 — Gravitational lensing:** Warps UV coordinates toward a screen-space `sourceUV` uniform (the gravity source's projected position). Displacement increases with proximity. Creates a visible directional pull on the rendered image.

**Effect 2 — Chromatic aberration:** Separates R/G/B channels by an offset that scales with proximity. Kicks in at higher proximity values (~0.5+) so it layers on top of the lensing as danger increases.

Uniforms:
- `tDiffuse: Texture` — input from previous pass (standard for ShaderPass)
- `proximity: float` — 0–1 gravity danger level
- `sourceUV: vec2` — screen-space position of the nearest gravity source (0–1 range)
- `lensStrength: float` — max UV warp magnitude (tunable from JSON)
- `chromStrength: float` — max chromatic aberration offset (tunable from JSON)

The pass slots into the `EffectComposer` after bloom, before the final output. MapViewController updates `proximity` and `sourceUV` each frame based on the nearest gravity source distance relative to influence radius.

Proximity calculation:
```
dist = distance(shuttle, nearestSource)
influence = influenceRadius(source.mass, gravityConfig)
horizon = eventHorizonRadius(source.mass, gravityConfig)
proximity = 1 - clamp((dist - horizon) / (influence - horizon), 0, 1)
```

So proximity=0 at influence edge, proximity=1 at event horizon.

### `src/components/GravityWarning.vue` (new)

Center-screen alert positioned below the position HUD. Fades in when `proximity > 0`. Reactive props:

```ts
interface GravityWarningState {
  proximity: number       // 0–1
  bodyName: string | null // "Sun", "Jupiter", etc.
  visible: boolean        // proximity > 0
}
```

Display tiers:
| Proximity | Display |
|-----------|---------|
| 0 | Hidden |
| 0–0.3 | "⚠ GRAVITATIONAL PULL — [BODY]" — dim yellow text |
| 0.3–0.7 | "⚠ GRAVITY WARNING — [BODY]" — bright orange, pulsing opacity |
| 0.7–1.0 | "⚠ CRITICAL — [BODY]" — red, fast pulse, larger text |

Styled with Tailwind `@apply` classes in `main.css`. Opacity pulse via CSS animation keyed on tier class. Positioned with `absolute` below the `.hud-position` element.

### `src/data/shuttle/map-gravity.json` updated

Add VFX tuning knobs to the existing config:

```json
{
  "gravityConstant": 0.08,
  "minDistance": 0.3,
  "influenceScale": 8,
  "eventHorizonScale": 1.2,
  "lensStrength": 0.08,
  "chromStrength": 0.015
}
```

### `src/views/MapView.vue`

Add `GravityWarning` component alongside `ShuttleHud` and `OrbitPrompt`. Reactive state fed from `MapViewController.onGravityWarning` callback.

### `src/views/MapViewController.ts`

1. Create `GravityDistortionPass` and add to `EffectComposer` after bloom
2. Each frame in `tick()`: find nearest gravity source, compute proximity, project source position to screen UV, update pass uniforms
3. New `onGravityWarning` callback emits `GravityWarningState` to Vue

### Not Changed

| File | Reason |
|------|--------|
| `CelestialBody` | Shuttle scene only — uses default gravity constants, untouched |
| `SpaceTimeGrid` | Already renders gravity wells in map; shuttle just rides on it now |
| `ThrusterEffectController` | Already scale-aware |
| `ShuttleViewController` | Shuttle scene — no changes needed, uses defaults |

## Orbit Capture State Interactions

The orbit-capture system (`OrbitCaptureSystem`) controls the shuttle's position and Y in non-free states. Gravity must respect these boundaries:

### State: `free`
- **Gravity pull**: active — `addGravityWell` sources pull the shuttle
- **Grid Y follow**: active — `spaceTimeGrid.getDepthAt()` drives `position.y`
- **Death check**: active — `checkEventHorizon()` can trigger death
- **Distortion VFX**: active — proximity drives lensing + chromatic aberration
- **HUD warning**: active — shows body name and danger tier

### State: `approaching`
- **Gravity pull**: disabled — shuttle is frozen, position driven by approach lerp
- **Grid Y follow**: disabled — approach sets Y=0 explicitly
- **Death check**: disabled — shuttle is frozen, `tick()` returns early
- **Distortion VFX**: disabled — set proximity=0
- **HUD warning**: hidden

### State: `orbiting`
- **Gravity pull**: disabled — position driven by Keplerian `tickOrbit()`
- **Grid Y follow**: disabled — Y set to `planetY` (orbital inclination)
- **Death check**: disabled — shuttle is frozen, can't die while safely orbiting
- **Distortion VFX**: disabled — set proximity=0
- **HUD warning**: hidden

### Y Recovery (after slingshot launch)
After slingshot, `yRecovery` flag lerps Y→0. During this phase:
- **Gravity pull**: active (shuttle is unfrozen, free state)
- **Grid Y follow**: **suppressed** until yRecovery completes — the lerp handles Y
- **Death check**: active — a bad slingshot near a massive body can still kill you

Implementation: `ShuttleController` already has `setIgnoreGridY(ignore)`. MapViewController sets it `true` when `yRecovery` starts, `false` when recovery completes (Y < 0.01). This prevents grid Y from fighting the lerp.

### How shuttle freeze interacts with gravity

`ShuttleController.tick()` already returns early when `frozen = true` (line 276). This means:
- `updateMovement()` (which applies gravity) is skipped
- `checkDeath()` is skipped
- No additional gating needed inside ShuttleController

The only gating needed is in **MapViewController.tick()**:
- Proximity/distortion/warning calculations should check `orbitSystem.state === 'free'`
- If not free, set proximity=0 (clears VFX and hides warning)

## Death Flow

```
frame tick → checkDeath() → checkEventHorizon(sources, px, pz, gravityConfig)
  → crosses horizon → isDead = true, velocity zeroed
  → updateDeath() plays tumble animation toward body center
  → reaches center → onDeath() fires (or respawn() if no callback)
```

For now `onDeath` is a no-op log in MapViewController. The orbit-capture system will later set it to trigger respawn into Earth orbit (default orbiting state from that spec).

## Slingshot + Gravity Interaction

The slingshot `setVelocity(exitVelocity)` interacts naturally with gravity: the exit velocity may exceed `maxThrustSpeed` but gravity continues pulling, meaning a poorly aimed slingshot near a massive body could curve back into the event horizon. This is intentional — gravity makes slingshots risky near massive bodies like the Sun.

## Files Summary

### New
| File | Purpose |
|------|---------|
| `src/data/shuttle/map-gravity.json` | Gravity constants + VFX tuning for map scale |
| `src/three/GravityDistortionPass.ts` | ShaderPass: gravitational lensing + chromatic aberration |
| `src/components/GravityWarning.vue` | Center-screen gravity proximity alert |

### Modified
| File | Change |
|------|--------|
| `src/lib/physics/gravity.ts` | Add `GravityConfig` interface, optional config param on all public functions |
| `src/three/ShuttleController.ts` | Accept `GravityConfig`, add `onDeath` callback, export `GravityWell` |
| `src/views/MapViewController.ts` | Wire gravity wells, spacetime grid follow, distortion pass, warning callback |
| `src/views/MapView.vue` | Add `GravityWarning` component |
| `src/assets/css/main.css` | Gravity warning Tailwind utility classes |

### Unchanged
| File | Reason |
|------|--------|
| `CelestialBody` | Shuttle scene only, uses default gravity constants |
| `SpaceTimeGrid` | Already renders gravity wells; shuttle just rides on it now |
| `ThrusterEffectController` | Already scale-aware |
| `ShuttleViewController` | Uses defaults, untouched |

## Out of Scope

- Visual gravity rings in map view (explicitly excluded per requirements)
- Per-planet gravity config overrides (uniform config is sufficient)
- Moon gravity (moons are too small at map scale to matter)
- Orbit-capture respawn behavior (handled by orbit-capture system)
- Death screen / game-over UI (future — for now just fires `onDeath` callback)
