# Map Scale Tuning + Death Overlay

**Date:** 2026-04-05  
**Status:** Draft

## Goal

Increase the map's orbital scale so there's breathing room between planets (especially Earth and the Sun), and add a death overlay screen that pauses gameplay while the simulation continues visually.

## Part 1: Scale Tuning

### Constants

| Constant | Old | New | File |
|----------|-----|-----|------|
| `ORBIT_SCALE` | 0.1 | 0.5 | `src/lib/planets/constants.ts` |
| `SIZE_SCALE` | 50 | 80 | `src/lib/planets/constants.ts` |

### Downstream Adjustments

**Gravity config** (`src/data/shuttle/map-gravity.json`):
- `influenceScale`: 80 → 400 (5x to match orbit scale increase)
- `eventHorizonScale`: 8 → 40 (5x)
- `gravityConstant`: 0.5 → stays 0.5 (force is distance-dependent, scales naturally)

**MapViewController** (`src/views/MapViewController.ts`):
- `SPAWN_OFFSET_BEHIND_EARTH`: 1.5 → 7.5 (5x)
- `gridDepthScale`: may need tuning after visual check

**Automatically handled** (no code changes):
- Grid size: computed as `2400 * ORBIT_SCALE`
- Planet orbit positions: use `ORBIT_SCALE` in `PlanetSystemController`
- Asteroid belt radii: use `ORBIT_SCALE` in `AsteroidBeltController`
- Planet/moon/sun mesh sizes: use `SIZE_SCALE`
- Orbit capture radii: use `SIZE_SCALE` (not `ORBIT_SCALE`)

## Part 2: Death Overlay

### Flow

```
checkDeath() triggers → isDead = true → tumble animation plays →
shuttle reaches body center → onDeath fires →
MapViewController sets deathState reactive flag →
DeathOverlay shows over the scene →
simulation keeps running (orrery ticks, camera stays put) →
player clicks RESTART → respawnAtEarth() → overlay hides
```

### DeathOverlay.vue

Semi-transparent dark overlay with centered content:
- Death cause text: "SOLAR RADIATION" (future: "COLLISION" for planets)
- "RESTART" button

Reactive props:
```ts
interface DeathOverlayState {
  visible: boolean
  cause: string   // "SOLAR RADIATION", future: "COLLISION"
}
```

Positioned `fixed inset-0` with `z-50` above all HUD elements. Background `bg-black/60` for see-through effect. Pointer events enabled only on the overlay (button is clickable).

### MapViewController Changes

- `onDeath` callback: instead of calling `respawnAtEarth()` directly, emit a `DeathOverlayState` to Vue via a new `onDeathOverlay` callback
- Camera freezes at last position (stop calling `vehicleCamera.tick` or just let orbit controls idle — camera target stays on dead shuttle position)
- New `restart()` public method: calls `respawnAtEarth()`, emits `{ visible: false }` to hide overlay
- Gravity warning and distortion VFX clear when dead (already gated on `!shuttleController.dead`)

### MapView.vue Changes

- Import and place `DeathOverlay` component
- Reactive `deathOverlay` state wired from `onDeathOverlay` callback
- Restart button calls `viewController.restart()`

### CSS Classes (main.css)

```css
.death-overlay { @apply fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60; }
.death-overlay-cause { @apply text-red-500 text-4xl font-bold font-mono tracking-widest; text-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
.death-overlay-restart { @apply mt-8 px-8 py-3 border border-red-500 text-red-400 font-mono text-lg cursor-pointer pointer-events-auto hover:bg-red-500/20 transition-colors; }
```

## Files Summary

### New
| File | Purpose |
|------|---------|
| `src/components/DeathOverlay.vue` | Death screen overlay with restart button |

### Modified
| File | Change |
|------|--------|
| `src/lib/planets/constants.ts` | `ORBIT_SCALE` 0.1→0.5, `SIZE_SCALE` 50→80 |
| `src/data/shuttle/map-gravity.json` | Scale up influence/horizon radii |
| `src/views/MapViewController.ts` | Spawn offset, death overlay callback, restart() method |
| `src/views/MapView.vue` | Add DeathOverlay component |
| `src/assets/css/main.css` | Death overlay Tailwind classes |
