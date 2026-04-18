# Lander Camera Crater Fix

**Date:** 2026-04-18
**Author:** guinetik (with agent assistance)
**Spec:** Stop the lander chase camera from going haywire when the lander
descends into a crater (extreme look-down angle, apparent zoom-out, OrbitControls
fighting the chase lerp).

## Problem

`VehicleCamera` exposed `minY` as an absolute world-Y floor and the lander
preset used `minY: 5`. When the player flew into a deep crater (lander world Y
went well below 5), the camera was clamped to `Y = 5` while the lander could
sit at, e.g., `Y = -50`. With `idleOffset = (60, 40, 0)` the chase logic then
asked the camera to live at `(landerX + 60, max(landerY + 40, 5), landerZ) =
(landerX + 60, 5, landerZ)` — 60 units laterally and ~55 units vertically away
from the lander. Result:

- Camera looks down ~45° at a tiny lander, reads as "way too far / zoomed out".
- OrbitControls' damped pitch fights the chase lerp because the offset shape
  changes every frame as the lander moves.
- The camera position can also be inside terrain at the camera's XZ since the
  world floor was tilted out from under the absolute clamp.

The fix needs to keep the camera tracking the lander vertically without
removing all floor protection (player can still orbit-drag below the lander to
look at its underside, just not flip the framing entirely).

## Fix

Added an optional config field `minYRelativeToTarget?: number` on
`VehicleCameraConfig`. When set, the per-frame Y floor becomes
`target.position.y + minYRelativeToTarget`, overriding the absolute `minY`.

```ts
const effectiveMinY =
  this.config.minYRelativeToTarget !== undefined
    ? targetPos.y + this.config.minYRelativeToTarget
    : this.config.minY
```

Both Y clamps in `tick()` (the chase target Y clamp and the always-on
post-update clamp) now use `effectiveMinY`.

The lander preset switches to:

```ts
export const LANDER_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(60, 40, 0),
  lerpSpeed: 5,
  idleTimeout: 1.0,
  minY: -Infinity,             // disabled — relative form takes over
  minYRelativeToTarget: -8,    // can dip 8 units below the lander, no further
  fov: 60,
  maxDistance: 145,
}
```

Now in a crater the camera sits at roughly `landerY + 40` with the same chase
framing it has at sea level. Orbit-drag still respects a small floor under the
lander so the player can't accidentally invert the camera while looking at the
underside.

## Why not also clamp against terrain?

Camera clipping into terrain (e.g. into a canyon wall offset 60 units laterally
from the lander) is a separate issue — it existed before this change and isn't
what the user reported. Adding terrain-aware camera collision belongs in its
own pass; this change only addresses the "camera pinned above the world while
the vehicle drops below it" symptom.

## Other presets

- `SHUTTLE_CAMERA_CONFIG` — unchanged (`minY: 15`, abs).
- `MAP_CAMERA_CONFIG` / `MAP_DEATH_CAMERA_CONFIG` / `MAP_INSPECT_CAMERA_CONFIG` /
  `MAP_PORTAL_*_CAMERA_CONFIG` — unchanged (`minY: -Infinity`, abs).
- `MAP_ORBIT_CAMERA_CONFIG` — unchanged (`minY: 1`, abs).

Only the lander adopted the relative form because only the lander traverses
heightmap craters at the world scale where an absolute `minY` becomes wrong.

## Verification

- `bun run type-check` — exit 0.
- `bun test:unit` — 1127/1127 pass.

## Files Changed

- `src/three/VehicleCamera.ts` — added `minYRelativeToTarget` field on
  `VehicleCameraConfig`, plumbed through both Y clamps in `tick()`, switched
  `LANDER_CAMERA_CONFIG` to relative form.
