# Shuttle Compass Strip

**Date:** 2026-04-12
**Author:** guinetik

## Problem

The shuttle HUD shows heading as a plain number (HDG 270) which gives no spatial context. Cardinal directions (N/S/E/W) are meaningless in space. Players need to know where celestial bodies are relative to their heading.

## Design

A horizontal heading strip at top center of the map HUD. Planet abbreviations slide along the strip as bearings relative to the shuttle. Position (AU) flanks the left, speed flanks the right.

### Layout

```
  X:1.00 Z:0.00 AU   [ Ve ··· Sol ····· Ea ··· ▼ ··· Ma ········ Ju ]   SPD 2.4
```

- Center triangle marker indicates shuttle's current heading
- Planet abbreviations slide left/right as the shuttle yaws
- Each label colored with the planet's `accentColor`
- Labels fade out or clamp at strip edges (same pattern as FpsCompass)
- Sun included as "Sol"

### Abbreviations

Sol, Me, Ve, Ea, Ma, Ce, Ju, Sa, Ur, Ne, Pl

### Data Flow

- `ShuttleTelemetry` already provides `heading`, `posX`, `posZ`, `speed`
- MapViewController computes bearing to each planet per frame: `atan2(planet.z - shuttle.z, planet.x - shuttle.x)`
- Passes array of `{ label, bearingRad, color }` to the component via telemetry

### Component

New `ShuttleCompass.vue` in `src/components/`. Replaces the `hud-top-cluster` heading display in `ShuttleHud.vue`. Follows the existing FpsCompass scrolling pattern (pixel-per-degree offset, clamping) but with planet labels instead of cardinal directions.

### Z-Index Fix

Bump `.shuttle-hud` from `z-20` to `z-30` so it clears the intro letterbox overlay.
