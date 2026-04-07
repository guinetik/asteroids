# Exfiltration System Design

**Author:** guinetik  
**Date:** 2026-04-06  
**Status:** Approved

## Overview

After completing EVA objectives on an asteroid, the player returns to their lander, flies up toward the parked shuttle, and triggers an exfiltration cutscene — the reverse of the arrival cinematic. On completion, the player is redirected to the star map (`/map`).

## State Machine Changes

Extend `levelStateMachine.ts` with:

- **`lander → exfil`** transition on `exfiltrate` event
  - Guard: lander altitude within ~100 units of shuttle (parked at Y=875) AND player has entered EVA at least once
- **`exfil → complete`** auto-advance when cutscene duration elapses
- **`complete`** — terminal state, triggers redirect to `/map`

New guard dependency injected into `createLevelStateMachine`:
- `isLanderNearShuttle(): boolean` — checks vertical proximity to shuttle
- `hasCompletedEva: boolean` — tracked externally, passed as guard

## LevelViewController Changes

### New State
- `hasExitedVehicle: boolean` — set `true` on first `eva` entry

### New Handlers
- `enterExfil()` — unregister lander tickables, hide lander HUD, start reverse cutscene via `arrivalSequence.playExfil()`, show letterbox
- `enterComplete()` — redirect to `/map` via router

### Tick Changes
- In `lander` state: compute proximity to shuttle. When within range and `hasExitedVehicle` is true, set `canExfil` flag on state info broadcast
- `interact` key (same as enter/exit vehicle) triggers `exfiltrate` event on state machine when `canExfil` conditions are met

### HUD Integration
- Extend `onStateInfo` payload to include `canExfil: boolean`
- Vue HUD layer shows "E — Exfiltrate" prompt when `canExfil` is true

## ArrivalSequence — Reverse Cutscene

Add `playExfil(landerPosition: Vector3)` method to the existing `ArrivalSequence` class.

### Exfil Phases (reversed arrival)

| Phase | Duration | Action |
|-------|----------|--------|
| dock | 3.0s | Lander rises from current position into cargo bay |
| doors | 2.0s | Cargo bay doors swing closed |
| flip | 2.5s | Shuttle rotates 180 degrees back upright |
| depart | 4.0s | Shuttle accelerates away into the starfield |
| fadeout | 1.5s | Screen fades to black |

**Total:** ~13 seconds

### Camera
Cinematic camera follows the shuttle from a tracking angle throughout. Reuses the existing `this.camera` from ArrivalSequence.

### Callbacks
Uses the same callback pattern as arrival:
- `onFadeOut(opacity)` — drives the fade overlay
- `onComplete()` — signals LevelViewController to transition to `complete`

### Model Reuse
The shuttle group and lander model are already loaded and parked in the scene. `playExfil()` animates them in place — no model reloading needed. The parked shuttle (scale 15, doors open, at Y=875) is the starting state for the exfil animation.

### Lander Visual
During the dock phase, the gameplay lander (`LanderController.group`) is hidden and replaced by the cinematic lander mesh (same as arrival) positioned to rise into the cargo bay.

## Constants

| Name | Value | Purpose |
|------|-------|---------|
| `EXFIL_PROXIMITY_RANGE` | 100 | Vertical distance to shuttle that triggers exfil prompt |
| `EXFIL_DOCK_DURATION` | 3.0 | Lander docking phase |
| `EXFIL_DOORS_DURATION` | 2.0 | Cargo doors closing |
| `EXFIL_FLIP_DURATION` | 2.5 | Shuttle rotation |
| `EXFIL_DEPART_DURATION` | 4.0 | Shuttle departure |
| `EXFIL_FADEOUT_DURATION` | 1.5 | Fade to black |

## Routing

- Exfil success → `/map` (return to star map for next mission)
- Death (`failed` state) → `/` (existing behavior, home screen)
