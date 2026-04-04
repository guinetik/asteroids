# Multi-Tool Mode Switching — Design Spec

**Date:** 2026-04-04
**GDD Reference:** docs/asteroid-lander-gdd-v03.md — Layer 4: The Multi-Tool

---

## Overview

Mode switching, ADS (aim down sights), and trigger system for the FPS multi-tool. Three modes (drill/weapon/heal) with keybind switching, per-mode crosshairs, color-coded tinting, and mode-specific trigger behaviors. No actual tool effects — this is the input/state/visual foundation.

---

## MultiToolState

New class: `src/lib/fps/multiToolState.ts` — implements `Tickable`.

Pure TS, no Three.js dependency. Owns all tool state. Future home of power system and targeting.

### State

- `mode: MultiToolMode` — current active mode (`'drill' | 'weapon' | 'heal'`), default `'drill'`
- `aiming: boolean` — whether ADS is active (right mouse held)
- `isFiring: boolean` — true for frames where a shot/action is triggered, reset each tick

### Methods

- `setMode(mode: MultiToolMode)` — switch active mode
- `setAiming(aiming: boolean)` — toggle ADS state
- `setInput(mouseDown: boolean, mouseJustPressed: boolean)` — feed raw mouse state each frame
- `tick(dt: number)` — process trigger logic, reset isFiring

### Trigger System

Each mode declares a trigger type. `MultiToolState` interprets raw mouse input through the active mode's trigger pattern:

| Trigger Type | Behavior | Config |
|-------------|----------|--------|
| `hold` | `isFiring = true` every frame while mouse held + aiming | — |
| `auto` | `isFiring = true` at fixed rate while mouse held + aiming | `fireRate` (shots/s) |
| `click` | `isFiring = true` once per mouse-down, must release to fire again | — |

### Tick Logic

1. Reset `isFiring = false`
2. If not aiming, skip firing logic
3. Based on active mode's trigger type:
   - **hold:** `isFiring = mouseDown`
   - **auto:** if mouseDown, accumulate timer += dt. When timer >= 1/fireRate, set `isFiring = true`, reset timer. When !mouseDown, reset timer.
   - **click:** `isFiring = mouseJustPressed`
4. If `isFiring`, log `[MultiTool] fire: {mode}` to console

---

## Data Config

`src/data/fps/multitool-config.json`:

```json
{
  "modes": {
    "drill": { "label": "DRL", "color": "#3b82f6", "trigger": "hold" },
    "weapon": { "label": "LAS", "color": "#ef4444", "trigger": "auto", "fireRate": 5 },
    "heal": { "label": "MED", "color": "#22c55e", "trigger": "click" }
  },
  "ads": {
    "fovMultiplier": 0.85,
    "zoomSpeed": 8
  }
}
```

---

## Input Bindings

Add to `FPS_BINDINGS` in `src/lib/defaultBindings.ts`:

| Action | Key |
|--------|-----|
| `toolDrill` | Digit1 |
| `toolWeapon` | Digit2 |
| `toolHeal` | Digit3 |

ADS (right mouse) and fire (left mouse) are handled via pointer lock mouse events in FpsViewController — not through InputManager (mouse buttons, not keyboard).

---

## MultiToolController Changes

Modify `src/three/MultiToolController.ts`:

- `setMode(mode, color)` — tints model mesh by setting `material.emissive` to the mode's color at low intensity (~0.15). Traverses all meshes in the model.

No new state — all state lives in MultiToolState. Controller is purely visual.

---

## FpsCamera ADS

Modify `src/three/FpsCamera.ts`:

- `setAiming(aiming: boolean)` — sets target FOV state
- In `tick()`: lerp `camera.fov` between base FOV and zoomed FOV (base × fovMultiplier) at zoomSpeed rate. Call `updateProjectionMatrix()` when FOV changes.

---

## FpsHud Changes

Modify `src/components/FpsHud.vue`:

### Action Bar (bottom center)

Three tool slots displayed horizontally:
- Each slot: key number (1/2/3) + label (DRL/LAS/MED)
- Active slot highlighted with mode color background
- Inactive slots dimmed

### Per-Mode Crosshair

Replaces the static `+` text with mode-specific shapes, all colored by active mode color:
- **drill:** circle with crosshair center
- **weapon:** standard cross
- **heal:** plus/cross shape

All CSS/SVG — placeholder shapes, real designs later. Color is the differentiator for now.

### ADS Indicator

Crosshair opacity increases when aiming (subtle brightness change).

### New Telemetry Fields

```ts
activeMode: 'drill' | 'weapon' | 'heal'
aiming: boolean
isFiring: boolean
```

---

## FpsViewController Wiring

Modify `src/views/FpsViewController.ts`:

### Mouse Events

In `setupPointerLock()`, add `mousedown`/`mouseup` listeners:
- Track left button state (`mouseDown`, `mouseJustPressed`)
- Track right button state (`rightMouseDown`)
- Feed to `MultiToolState.setInput()` and `MultiToolState.setAiming()` each frame

### Keybinds

In the telemetry tick, check InputManager for `toolDrill`/`toolWeapon`/`toolHeal` → call `multiToolState.setMode()`.

### Tick Order

1. InputManager (priority 0)
2. FpsPlayerController (priority 10)
3. MultiToolState (priority 11)
4. FpsViewController self-tick — reads state, syncs controller/camera/HUD
5. MultiToolController (priority 28)
6. FpsCamera (priority 28)
7. SceneManager render (priority 30)

### Sync in self-tick

- Read `multiToolState.mode` → call `multiToolController.setMode(mode, color)`
- Read `multiToolState.aiming` → call `fpsCamera.setAiming(aiming)`
- Emit telemetry including `activeMode`, `aiming`, `isFiring`

---

## File Plan

### New Files

| File | Purpose |
|------|---------|
| `src/lib/fps/multiToolState.ts` | Mode, ADS, trigger patterns, isFiring — pure TS, Tickable |
| `src/lib/fps/__tests__/multiToolState.spec.ts` | Tests for mode switching, trigger types, ADS gating |
| `src/data/fps/multitool-config.json` | Mode labels, colors, trigger types, fire rate, ADS config |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/defaultBindings.ts` | Add toolDrill, toolWeapon, toolHeal to FPS_BINDINGS |
| `src/three/MultiToolController.ts` | Add setMode() for mesh tinting |
| `src/three/FpsCamera.ts` | Add setAiming() for FOV lerp |
| `src/components/FpsHud.vue` | Action bar + per-mode crosshair |
| `src/views/FpsViewController.ts` | Mouse events, wire MultiToolState, sync controller/camera/HUD |
