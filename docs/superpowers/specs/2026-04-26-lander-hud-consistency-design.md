# Lander HUD Consistency Design

## Overview

The lander HUD should match the evolved vehicle HUD language used by FPS EVA and shuttle
views. Flight motion readouts stay top-center, while health, thruster charge, and fuel move to
the bottom dock. This removes the old top-left lander-only stack without changing lander
telemetry, controls, physics, or mission behavior.

## Goals

- Move lander resource readouts from the top-left stack into the shared bottom dock pattern.
- Keep navigation and landing-motion readouts separate from resource readouts.
- Reuse existing HUD CSS vocabulary where possible so shuttle and lander stay visually aligned.
- Preserve survey mission information without overlapping the bottom resource dock.

## Layout

### Top Center

The top-center cluster shows compact flight telemetry:

- `ALT` with altitude to one decimal place.
- `VEL` with vertical velocity to one decimal place.
- `X/Z` position rounded to whole world units.

This mirrors the shuttle/FPS convention where motion and heading information live near the top
center of the viewport.

### Bottom Dock

The bottom dock follows the shuttle pattern:

- Left column: `HULL` horizontal bar.
- Center column: vertical lander charge gauges.
- Right column: `FUEL` horizontal bar.

The center gauges keep lander semantics:

- `ENG` red vertical bar for main engine charge.
- `RCS` white vertical bar for attitude/translation control charge.

### Survey Overlay

Survey timer, probe count, and mission instruction remain a separate overlay. It should be
positioned above or near the bottom dock so the active objective is visible without colliding
with core vehicle resources.

## Implementation Approach

Use the existing shared classes already consumed by `ShuttleHud.vue`:

- `hud-top-cluster`
- `hud-top-cluster__readout`
- `hud-bottom-dock`
- `hud-bottom-dock__column`
- `hud-bottom-dock__column--hull`
- `hud-bottom-dock__column--fuel`
- `hud-thruster-gauges`
- `hud-gauge`
- `hud-gauge-track`
- `hud-gauge-fill`
- `hud-gauge-label`

`LanderHud.vue` should change its markup structure to use those classes instead of rendering all
readouts inside `.lander-hud`. The existing helper functions for percentage and color bands can
stay local to the component.

The old `.lander-hud` top-left flex stack should either become a full-screen HUD container or be
removed in favor of a component root that matches `.shuttle-hud` behavior. Any lander-specific CSS
left behind should be deleted if no longer referenced.

## Data Flow

No telemetry contract changes are required. `LanderView.vue` already passes a reactive
`LanderTelemetry` object into `LanderHud.vue`, and the component already receives everything needed:

- Altitude, vertical velocity, and position.
- Fuel level and capacity.
- Main engine charge and capacity.
- RCS charge and capacity.
- Hull HP and max HP.
- Optional survey mission status.

## Testing

This is a presentation-only change, so focused verification is:

- `bun run lint`
- `bun run type-check`
- `bun run test:unit`

Manual visual check:

- Enter lander mode and confirm no top-left resource stack remains.
- Confirm `ALT`, `VEL`, and `X/Z` sit top-center.
- Confirm `HULL | ENG/RCS | FUEL` sit bottom-center in the same visual family as shuttle.
- Confirm survey mission text does not overlap the resource dock.
