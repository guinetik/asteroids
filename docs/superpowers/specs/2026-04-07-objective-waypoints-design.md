# Objective Waypoints, Compass & Minimap

**Date:** 2026-04-07
**Status:** Draft

## Overview

Wire mission objectives to the level's terrain and HUD. Each objective spawns a flat zone on the terrain, a 3D waypoint beam visible from orbit, a compass marker during EVA, and a dot on a toggleable minimap.

## 1. Objective Positions in Mission Data

### Changes to `ConcreteObjective`

Add `x: number` and `z: number` fields — world-space position, equal to the flat zone center.

### Objective Count by Difficulty

| Difficulty | Objective Count |
|------------|----------------|
| 1–3        | 1              |
| 4–6        | 2              |
| 7–10       | 3              |

The mission generator picks the first N objective slots whose cumulative weight fits the difficulty, then rolls concrete values for each.

### Position Generation

`generateFlatZones` (currently called in `LevelViewController`) moves into the mission generator. The generator calls it with `count = objectives.length`, using the mission's own seed (hash of mission id). Grid size (`12000`) and flat zone radius (`300`) become named constants shared between the generator and the level.

Each rolled objective receives the `x`/`z` of its corresponding flat zone.

### Level Controller Changes

`LevelViewController.init()` no longer calls `generateFlatZones`. Instead it reads `mission.objectives` and builds a `FlatZone[]` from their `x`/`z` positions, passing that to `generateTerrain`.

When using `?asteroidId=` URL param (no real mission), the ad-hoc mission generated in `resolveLevelContext()` already goes through `generateAsteroidMission()` and gets positioned objectives.

## 2. Waypoint Markers (3D)

### New file: `src/three/WaypointMarkers.ts`

Ported from irover's `WaypointMarkers.ts`. Each marker is a group of Three.js meshes:

- **Beam core:** Thin cylinder, additive blending, high opacity. Cyan color (`0x66ffee`).
- **Beam glow:** Wider cylinder, lower opacity, same color.
- **Base ring:** Torus at ground level, pulses scale 0.9–1.1x.
- **Top diamond:** Octahedron at beam peak, rotates 360deg/s, bobs 0.3m.

Visual style matches existing dark sci-fi aesthetic — cyan energy beams on asteroid surface.

### API

```ts
addWaypointMarker(id: string, x: number, z: number, groundY: number, scene: Scene): void
removeWaypointMarker(id: string, scene: Scene): void
clearWaypointMarkers(scene: Scene): void
updateWaypointMarkers(elapsed: number): void
```

### Integration

- Level controller creates one marker per objective at init, sampling `groundY` from the heightmap at each objective's `(x, z)`.
- `updateWaypointMarkers` registered as a tickable for animation — runs in both lander and EVA states.
- Markers are never hidden — they are a world feature visible at all times.

## 3. FPS Compass Strip

### New file: `src/components/FpsCompass.vue`

Horizontal strip at top-center of screen, EVA-only. Dark sci-fi style matching `FpsHud.vue` (dark glass background, no tan/Mars theming).

### Visual Elements

- 330px wide strip with scrolling tick track.
- Tick marks at 5-degree intervals, taller ticks at 45-degree intervals.
- Cardinal direction labels (N, NE, E, SE, S, SW, W, NW).
- Center pointer triangle indicating current heading.
- Heading readout in degrees below pointer.

### Objective Dots on Compass

- Small circular markers positioned by relative bearing to player.
- Clamped to strip edges when objective is outside the visible arc (±40 degrees).
- Color-coded by objective type:
  - Gather: cyan (`#66ffee`)
  - Exterminate: red (`#ff4444`)
  - Rescue: yellow (`#ffcc44`)

### Bearing Math

New file: `src/lib/math/bearing.ts`

Ported from irover's `sitePoiBearing.ts`:

- `headingRadToCompassDeg(rad)`: Convert Three.js Y-rotation to compass degrees (0=N).
- `worldBearingDegTo(fromX, fromZ, toX, toZ)`: Absolute bearing from one position to another.
- `signedRelativeBearingDeg(heading, bearing)`: Relative bearing for compass display, -180 to +180.

### Data Flow

`FpsTelemetry` gains:
- `headingRad: number` — player camera Y rotation.
- `objectives: CompassObjective[]` — array of `{ id, label, relativeDeg, type }`.

`LevelViewController` computes relative bearings each frame during EVA state using player position and heading from `FpsPlayerController` / `FpsCamera`.

`LevelView.vue` passes telemetry to `FpsCompass` as props.

## 4. Minimap Overlay

### New file: `src/components/MapOverlay.vue`

Bottom-left corner overlay, toggled with M key. Works in both lander and EVA states. Dark sci-fi style.

### Terrain Canvas

New file: `src/lib/terrain/mapColors.ts`

- `generateMapCanvas(heightmap, gridSize)`: Renders heightmap to a grayscale canvas. Dark pixels = low elevation, light pixels = high. Single color mode — no hypsometric ramp needed.
- Canvas generated once at level init, passed to Vue layer as a prop.

### Visual Elements

- ~260px wide panel, dark glass background matching existing HUD.
- Terrain elevation canvas with `image-rendering: pixelated`.
- Player dot: cyan pulsing dot at player's world position mapped to canvas coordinates.
- Objective markers: dots at each objective position, color-coded by type (same scheme as compass).
- No grid lines or coordinates — clean and minimal.

### Position Mapping

```ts
function worldToPixel(wx: number, wz: number, gridSize: number, displayW: number, displayH: number) {
  return {
    x: (wx / gridSize + 0.5) * displayW,
    y: (wz / gridSize + 0.5) * displayH,
  }
}
```

### Data Flow

- `LevelViewController` exposes a callback for map data: heightmap canvas ref, player `x`/`z`, objective positions.
- M key binding added to `LEVEL_BINDINGS` in `src/lib/defaultBindings.ts`.
- `LevelView.vue` owns a `showMap` ref toggled by M key, renders `MapOverlay` conditionally.
- In lander mode: player position = lander position. In EVA: player position = FPS player position.

## File Summary

| File | Action |
|------|--------|
| `src/lib/missions/types.ts` | Add `x`, `z` to `ConcreteObjective` |
| `src/lib/missions/asteroidMissionGenerator.ts` | Generate flat zones, assign positions to objectives |
| `src/views/LevelViewController.ts` | Read objective positions for terrain + markers, compute compass data |
| `src/three/WaypointMarkers.ts` | New — 3D beam markers |
| `src/lib/math/bearing.ts` | New — heading/bearing math |
| `src/components/FpsCompass.vue` | New — compass strip, EVA-only |
| `src/lib/terrain/mapColors.ts` | New — heightmap-to-canvas renderer |
| `src/components/MapOverlay.vue` | New — minimap overlay |
| `src/components/FpsHud.vue` | Add `headingRad` + `objectives` to `FpsTelemetry` |
| `src/lib/defaultBindings.ts` | Add M key binding |
| `src/views/LevelView.vue` | Wire compass, minimap, M key toggle |

## Testing

Focus on `src/lib/` pure logic — no Vue/Three.js tests needed:

- `bearing.spec.ts` — heading conversion, relative bearing math, edge cases (wrap-around).
- `asteroidMissionGenerator.spec.ts` — objective count scales with difficulty, all objectives have valid `x`/`z`, positions respect spacing rules.
- `mapColors.spec.ts` — canvas generation produces expected dimensions, pixel values scale with height.
