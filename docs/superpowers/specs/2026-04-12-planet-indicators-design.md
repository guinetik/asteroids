# Planet Indicator Dots + Labels

**Date:** 2026-04-12
**Author:** guinetik

## Problem

When zoomed out in the map view, planets become too small to see — especially Ceres and Pluto which have inclined orbits (Y offset). The ship already has a cyan reticle that maintains constant screen size; planets need the same treatment.

## Design

Add a constant-screen-size colored dot + name label sprite to each planet that fades in when the planet mesh becomes too small to track visually.

### Visual

- Canvas-drawn sprite: small filled circle (planet `accentColor`) + name text to the right
- Additive blending, depth write disabled — same style as ship reticle
- Positioned at the planet group's world position each frame

### Fade Behavior

- Compute planet's apparent screen fraction: `(displayRadius * SIZE_SCALE * 2) / (dist * 2 * tan(halfFov))`
- When apparent size drops below `PLANET_INDICATOR_FADE_SCREEN_FRACTION`, fade in with hermite smoothing
- Indicator maintains constant screen size via: `apparentSize * 2 * dist * tan(halfFov)`

### Constants (in `mapViewControllerConfig.ts`)

- `PLANET_INDICATOR_APPARENT_SIZE = 0.04` — target screen-height fraction
- `PLANET_INDICATOR_FADE_SCREEN_FRACTION = 0.008` — planet apparent size below which indicator fades in

### Implementation Location

- Sprite creation + per-frame update inside `PlanetSystemController`
- `tick()` gains a `camera: THREE.PerspectiveCamera` parameter for distance/fov calculation
- Canvas texture: ~256x64, dot on left, name text on right, planet accent color
