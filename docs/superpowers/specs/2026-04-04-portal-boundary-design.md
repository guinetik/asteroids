# Outbound Portal Boundary Walls — Design Spec

**Author:** guinetik
**Date:** 2026-04-04
**Status:** Approved

## Overview

4 red grid walls at the edges of the SpaceTimeGrid that serve as outbound portals. When the shuttle gets close, the walls fade in. Crossing a wall triggers `VibePortal.depart()` and redirects the player to another game in the Vibe Jam.

## Visual Design

Each wall is a flat vertical grid of red line segments, matching the aesthetic of the SpaceTimeGrid but oriented vertically. Uses `THREE.LineSegments` with red `LineBasicMaterial`, transparent, opacity controlled by proximity.

### Dimensions

Walls sit at the edges of the SpaceTimeGrid (4000 units wide):
- North wall: z = -2000, spans x from -2000 to +2000
- South wall: z = +2000, spans x from -2000 to +2000
- East wall: x = +2000, spans z from -2000 to +2000
- West wall: x = -2000, spans z from -2000 to +2000

Each wall has a fixed height of 200 units (from y = 0 upward) and is subdivided into a grid pattern with 20 segments horizontally and vertically.

## Proximity Visibility

Walls are invisible (opacity = 0) by default. Each frame, the system checks the shuttle's distance to each wall using simple axis-aligned distance:
- For x-axis walls: `distance = abs(shuttle.x - wallX)`
- For z-axis walls: `distance = abs(shuttle.z - wallZ)`

When distance < 500 units, the wall fades in. Opacity is interpolated linearly: `opacity = WALL_MAX_OPACITY * (1 - distance / VISIBILITY_DISTANCE)`. Closer = more opaque, max opacity 0.6 at the wall surface.

When distance >= 500, opacity is 0 and the wall is effectively invisible.

## Crossing Detection

Each frame, after updating visibility, the system checks if the shuttle has crossed any wall boundary:
- `position.x > 2000` or `position.x < -2000`
- `position.z > 2000` or `position.z < -2000`

On crossing, immediately call `VibePortal.depart()` with the shuttle's current state:
- `speed`: shuttle's current speed scalar
- `rotation_y`: shuttle's current heading
- Any other relevant state from `VibeJamParams`

This triggers an instant `window.location.href` redirect to the jam portal.

## Architecture

### `PortalBoundary` — `src/three/PortalBoundary.ts`

A single wall segment. Responsibilities:
- Creates a vertical grid mesh (`THREE.LineSegments`) at the specified position and axis
- `updateOpacity(distance: number)`: sets material opacity based on distance from the shuttle
- `dispose()`: cleans up geometry and materials
- Exposes `mesh` (`THREE.LineSegments`) for scene addition

Constructor parameters:
- `position`: the wall's fixed coordinate on its axis (e.g., 2000 or -2000)
- `axis`: `'x'` or `'z'` — which axis the wall is perpendicular to
- `width`: span along the other axis (4000)
- `height`: wall height (200)
- `segments`: grid subdivision count (20)

### `PortalBoundarySystem` — `src/three/PortalBoundarySystem.ts`

Manages all 4 walls and handles game logic. Implements `Tickable`. Responsibilities:
- Creates 4 `PortalBoundary` instances at the grid edges
- Each `tick(dt)`: reads shuttle position, updates each wall's opacity, checks for boundary crossing
- On crossing: calls `VibePortal.depart()` with shuttle state
- `dispose()`: disposes all 4 walls
- Exposes each wall's mesh for scene addition (or a `walls` array the view can iterate)

Constructor parameters:
- `gridSize`: total grid width (4000) — walls placed at ±gridSize/2
- `shuttlePosition`: `THREE.Vector3` reference to the shuttle's live position
- `getShuttleState()`: callback that returns the current shuttle state for `depart()`

### View Controller Integration

In `ShuttleViewController.init()`, after creating the shuttle:
```
const boundarySystem = new PortalBoundarySystem(4000, shuttle.position, getState)
for (const wall of boundarySystem.walls) sceneManager.addToScene(wall)
tickHandler.register(boundarySystem, TICK_PRIORITY_ANIMATION)
```

~5 lines of wiring, same pattern as portal arrival.

## Constants

| Name | Value | Description |
|------|-------|-------------|
| `WALL_VISIBILITY_DISTANCE` | 500 | Distance at which walls begin to fade in |
| `WALL_HEIGHT` | 200 | Fixed wall height in world units |
| `WALL_COLOR` | 0xff2222 | Red color for wall grid lines |
| `WALL_MAX_OPACITY` | 0.6 | Maximum opacity when shuttle is at the wall |
| `WALL_GRID_SEGMENTS` | 20 | Number of grid subdivisions per wall |

## Constraints

- No exit animation — crossing triggers instant redirect
- All 4 walls go to the same jam portal URL
- Walls do not follow SpaceTimeGrid Y deformation — fixed at y=0
- No collision or bounce — shuttle passes through and departs
