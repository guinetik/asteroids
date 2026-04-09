# Shuttle view — city GLB dev placement

## Summary

`ShuttleView` can load `public/models/city.glb` and place it above the shuttle scene sun when the URL query flag `city=true` is present.

## Implementation

- **Model:** `src/three/CityModel.ts` — preload/clone pattern (aligned with `VirusModel`), `fixMaterials` for point-light rendering.
- **Placement:** World position `(0, sunVisualRadius + clearance, 0)` so the prop sits on the +Y side of the sun sphere.
- **Query:** Vue passes `{ city: true }` into `ShuttleViewController.init` when `?city=true`.

## Usage

Navigate to the shuttle route with `?city=true` (e.g. `/shuttle?city=true` depending on router base).
