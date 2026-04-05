# Map View — Shuttle Player Character

**Date:** 2026-04-05
**Status:** Approved (self-approved per user directive)

## Goal

Add the shuttle as a flyable player character in the MapView, making it the main game hub where the player navigates the solar system.

## Context

- **ShuttleView** already has a complete shuttle flight system: ShuttleController (model + physics + input), ThrusterEffectController (particle VFX), VehicleCamera (3rd-person follow), InputManager (keyboard), and ShuttleHud (telemetry display).
- **MapView** renders a solar system orrery: SunController, PlanetSystemControllers, AsteroidBeltControllers, SpaceTimeGrid, StarField, and EffectComposer with bloom post-processing.
- The map uses its own scene setup (`MapSceneSetup.ts`) with OrbitControls, not the shared `SceneManager`.

## Design

### Scale Adaptation

The map operates at `ORBIT_SCALE = 0.03` units per scene-AU:
- Earth orbit: ~9 units from center
- Jupiter orbit: ~20.5 units
- Full map diameter: ~144 units

The shuttle model is ~14 units long in shuttle view. For the map, apply a group scale of **0.05×** → ~0.7 units, smaller than most planet display radii but clearly visible.

### Camera Integration

Replace the map's free-orbit OrbitControls with VehicleCamera tracking the shuttle:
1. Create map scene as usual (renderer, scene, bloom composer)
2. Dispose the map scene's OrbitControls
3. Create VehicleCamera with a new `MAP_CAMERA_CONFIG` preset (closer offset, matched FOV)
4. Swap the EffectComposer's RenderPass camera to use VehicleCamera's camera
5. Move the camera fill light from old camera to VehicleCamera's camera

New `MAP_CAMERA_CONFIG`:
- `idleOffset`: (-6, 4, 0) — close behind and above, appropriate for map scale
- `lerpSpeed`: 3
- `idleTimeout`: 5
- `minY`: 0.5
- `fov`: 50 (match map's existing FOV)

### Gravity — Skip for Hub

The map's gravity constants (tuned for display) would be overwhelming at shuttle physics scale. For the hub:
- **Do NOT** connect gravity wells to the shuttle via `addGravityWell()`
- **DO** connect the SpaceTimeGrid — the shuttle sinks into gravity wells visually (Y deformation), providing satisfying feedback when near massive bodies

### Spawn Position

Spawn the shuttle near Earth's orbit (~9 units from center) at a random angle. No portal arrival or boundary walls — the map is free-roam.

### Thruster Effects

Reuse `ThrusterEffectController` as-is. Particle sizes and lifetimes may look slightly oversized at map scale, but this is acceptable and can be tuned later.

### HUD

Add `ShuttleHud` to `MapView.vue` with the same reactive telemetry pattern as `ShuttleView.vue`.

## Files Modified

| File | Change |
|------|--------|
| `src/three/VehicleCamera.ts` | Add `MAP_CAMERA_CONFIG` export |
| `src/views/MapViewController.ts` | Add InputManager, ShuttleController, VehicleCamera, ThrusterEffectController, telemetry |
| `src/views/MapView.vue` | Add ShuttleHud component and telemetry reactive state |
| `src/three/MapSceneSetup.ts` | Increase camera far plane to accommodate VehicleCamera range |

## Files NOT Modified

- `ShuttleController.ts` — used as-is, no gravity wells added
- `ThrusterEffectController.ts` — used as-is
- `ShuttleHud.vue` — reused directly

## Out of Scope

- Gravity interaction between shuttle and celestial bodies (future: map-scale gravity tuning)
- Planet landing/docking interactions
- Map-specific HUD elements (minimap, planet labels)
- Physics speed tuning for map scale (can be done later with a config object)
