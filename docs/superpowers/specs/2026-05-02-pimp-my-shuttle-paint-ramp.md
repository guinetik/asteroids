# Pimp My Shuttle — Paint Gradient Ramp

**Date:** 2026-05-02
**Status:** Implemented
**Owner:** guinetik

## Problem

The Pimp My Shuttle shop renders each cosmetic option as a smooth multi-stop CSS
gradient swatch (the "color shaders thing"), but the in-game vehicles only sample
those stops as discrete per-channel paint colors:

- `gradientStops[0]` → primary hull (`wingtop`, `nose top`, `top section`, ...).
- `gradientStops[1]` → secondary panels.
- `gradientStops[2]` → trim / accent / engine bell.

The result: a buttery gradient on the shop card, three flat color bands on the
ship. The store thumbnail never matched the actual ship paint.

## Decision

The same gradient that appears in the shop swatch flows across the model. A 1D
gradient ramp texture is built from `gradientStops` and sampled in the fragment
shader along a model-local axis, then layered as a tint multiplier on top of the
existing per-channel albedo paint. Channel separation stays — each panel still
gets its assigned stop — but the ramp on top blends the boundaries so the hull
reads as slices of one continuous gradient.

The shop swatch was redesigned as a "Destiny-style shader shard": the gradient
ribbon dominates, three discrete `P` / `S` / `T` chips in the corner show the
exact channel colors, plus a gloss sweep + radial highlight + soft-light vignette
sell the painted-metal feel.

## Pipeline

```
JSON catalog (`src/data/cosmetics/pimp-my-shuttle.json`)
        │
        │ gradientStops: ["#hex", ...]
        ▼
buildPaintRampTexture(stops)               ← src/three/cosmetics/paintRampShader.ts
        │
        │ 256×4 CanvasTexture (sRGB), cached by stop joint key
        ▼
applyPaintRampShader(material, config)     ← onBeforeCompile injects:
        │
        │   uniform sampler2D uPaintRamp;
        │   uniform vec2      uPaintRampBounds;
        │   uniform float     uPaintRampStrength;
        │   uniform mat4      uPaintRampMatrix;       (mesh-local → vehicle-local)
        │   varying float     vPaintRampU;
        │
        │   // vertex
        │   vPaintRampU = (uPaintRampMatrix * vec4(position, 1.0)).<axis>;
        │
        │   // fragment, after <map_fragment>
        │   float t = clamp((vPaintRampU - bounds.x) / (bounds.y - bounds.x), 0, 1);
        │   vec3 ramp = texture2D(uPaintRamp, vec2(t, 0.5)).rgb;
        │   diffuseColor.rgb *= mix(vec3(1.0), ramp, uPaintRampStrength);
        ▼
updatePaintRampTexture(material, tex)      ← swap on subsequent paint applies
                                             without recompiling the shader.
```

## Per-vehicle wiring

| Vehicle    | Ramp axis | Strength | Bounds source                                |
| ---------- | --------- | -------- | -------------------------------------------- |
| Shuttle    | `x` (raw GLB nose→tail) | 0.20 | bbox of paintable shuttle meshes in vehicle-local space |
| Lander     | `y` (top section → bottom legs) | 0.22 | bbox of paintable lander meshes |
| Multitool  | `y` (slide → grip)              | 0.26 | bbox of paintable multitool meshes |

Each vehicle stores per-material `meshToVehicleLocal` matrices captured at
collection time. Bounds along the ramp axis are computed once per target list
and cached via `WeakMap`.

## Files

- `src/three/cosmetics/paintRampShader.ts` — texture builder + OBC injector.
- `src/three/cosmetics/shuttlePaintMaterials.ts` — wires ramp into the standalone
  shuttle paint module (used by the arrival sequence preview).
- `src/three/cosmetics/landerPaintMaterials.ts` — lander paint + ramp.
- `src/three/cosmetics/multitoolPaintMaterials.ts` — multitool paint + ramp.
- `src/three/ShuttleController.ts` — mirrors the ramp pipeline for the in-flight
  shuttle (the controller has its own per-material book-keeping separate from
  the standalone module).
- `src/components/shop/PimpMyShuttleDialog.vue` — Destiny-shard swatch markup.
- `src/assets/css/main.css` — `.cosmetic-shader-shard*` styles.

## Notes

- All `CanvasTexture` instances are cached by `stops.join('|')`. Picking the
  same option N times reuses one GPU texture.
- The ramp shader respects existing per-channel paint — strength stays low (0.2-0.26)
  so the user-visible difference between channels is preserved.
- `paintRampUniforms` lives on `material.userData`; the swap path reuses the
  existing OBC closure when only the texture changes (no shader recompile cost).
- Two-stop gradients (e.g. flag pennants) work fine — the texture builder falls
  back to a duplicated stop.
