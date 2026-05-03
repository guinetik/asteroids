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

Channel-to-material mapping for the shuttle GLB:

| Channel    | GLB material names                                                              |
| ---------- | ------------------------------------------------------------------------------- |
| primary    | `wingtop`, `wing flap top`, `nose top`, `side stb/prt`, `OMS pod stb/prt`, `tail`, `shut-doors-top/side` |
| secondary  | `belly`, `belly flap`, `fusolage aft eng`, `OMS pod prt/stb back`, `OMS pods side`, `RCS aft stb/prt`    |
| trim       | `nose tip`, `bay prt/stb wedges`, `bay prt/stb edges`, `doors edge`, `cockpit side`                      |
| accent     | `shut-handrails`, `arrows top`, `shut-cam-cargo`, `bay prt/stb evarail`, `bay prt/stb doorlatc`, `eng out` |

`eng out` is the outer cylindrical surface of the SSME engine bells (the three
nozzles cloned by `placeNozzles` at the rear). It sits on the `accent` channel
so the engine cluster picks up the same `gradientStops[2]` color the spec
allocates to "engine bell". `eng in` (bell interior) and `RCS out` are
deliberately left unmapped: keeping the bell interior dark preserves contrast
for the flame plume sprite, and the RCS quads are currently hidden in
`placeNozzles`. Note that because `placeNozzles` clones the original `eng`
node *after* `preparePaintableMaterials` has already prepared its materials,
all three nozzles share the same prepared material reference and therefore
repaint together when the player swaps shaders.

Channel-to-mesh mapping for the lander GLB (one shared `Lunar_Lander` material
cloned per painted mesh — channel is selected by mesh node name, normalized
case-insensitively with `_` → ` `):

| Channel    | GLB mesh names                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| primary    | `Top Section`, `Bottom Section`, `Door`                                                              |
| secondary  | `Landing Legs`, `Ladder`, `Extras`, `RCS_Scaffolding`                                                |
| trim       | `Antennas`, `Antennas Side`, `Antenna Front`                                                         |
| engine     | `Thruster`, all 16 `RCS_<quadrant>_<dir>` quad clusters (`RCS_BL_Aft`, `RCS_FR_Up`, …)               |

The original mapping only covered 10 meshes; 17 (the front antenna, the 16 RCS
quads, and the RCS scaffolding) were falling through and rendering stock. The
RCS scaffolding is matched on the secondary branch *before* the looser `rcs `
prefix on the engine branch, so it doesn't get vacuumed up by the engine
match.

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

| Vehicle                 | Ramp axis | Mode    | Ramp str | Detail str | Diffuse map      |
| ----------------------- | --------- | ------- | -------- | ---------- | ---------------- |
| Shuttle (Factory Stock) | `x`       | bypass  | 0        | 0          | restored (GLB)   |
| Shuttle (paid paints)   | `x`       | replace | 0.35     | 0.55       | dropped (`null`) |
| Lander (Factory Stock)  | `y`       | tint    | 0.22     | 0          | preserved        |
| Lander (paid paints)    | `y`       | replace | 0.30     | 0          | preserved (none in GLB) |
| Multitool               | `y`       | tint    | 0.26     | 0          | preserved        |

Lander paid paints reuse the shuttle's replace-mode pipeline (full color
override + saturation boost + finish profile + Fresnel rim → bloom + base
glow) but do **not** activate the procedural panel-seam overlay — the lander
mesh is small enough that the geometric panel breaks already give it surface
variety, and procedural seams at lander scale would compete with the real
geometry rather than add to it. Lander Factory Stock keeps the legacy LERP
path so the bundled lander stays subtle (otherwise everyone would feel pushed
to buy a paint just to see chroma on the hull).

## Per-paint finish profile (shuttle, replace mode)

Each paid shuttle paintjob can declare an optional `finish` block in
`pimp-my-shuttle.json` with `default` + per-channel (`primary`, `secondary`,
`trim`, `accent`) overrides. Recognised fields per block: `metalness`,
`roughness`, `envMapIntensity`, `emissive` (hex), `emissiveIntensity`. Catalog
validation lives in `src/lib/cosmetics/catalog.ts`; missing fields fall back
through the chain channel block → default block → `SHUTTLE_PAINT_FINISH_FALLBACK`
→ authored GLB stock value. Authored `emissive` is preserved when the finish
specifies neither `emissive` nor `emissiveIntensity` so we never accidentally
trim a baked glow.

Shuttle paid paints:

| Paint                 | default metal/rough | trim metal/rough | accent           |
| --------------------- | ------------------- | ---------------- | ---------------- |
| Neon Comet            | 0.65 / 0.30         | 0.90 / 0.18      | magenta emissive |
| Red Sparrow           | 0.70 / 0.25         | (default)        | red emissive     |
| The Space Time Matrix | 0.85 / 0.25         | 0.95 / 0.12      | green emissive   |
| Void Chrome           | 0.95 / 0.18         | 1.00 / 0.06      | violet emissive  |
| Cinderline Gold       | 0.90 / 0.28         | (default)        | amber emissive   |
| Saturn Club           | 0.75 / 0.20         | 0.85 / 0.15      | (no glow)        |

Lander paid paints (channels: primary / secondary / trim / **engine**):

| Paint            | default metal/rough | trim metal/rough | engine emissive          |
| ---------------- | ------------------- | ---------------- | ------------------------ |
| Dust Angel       | 0.25 / 0.55         | 0.55 / 0.40      | bubblegum pink `#f472b6` |
| Frostbite Safety | 0.55 / 0.35         | 0.85 / 0.20      | safety yellow `#fef08a`  |
| Mariner Red      | 0.70 / 0.25         | 0.95 / 0.12      | red `#dc2626`            |
| Hazard Bloom     | 0.50 / 0.45         | 0.80 / 0.25      | acid green `#84cc16`     |

Per-channel paint colors are also pushed through an HSL saturation boost of
`+0.12` so they read more vividly against the GLB lighting (greys are skipped
so neutral paints stay neutral).

## Silhouette outer glow (Fresnel rim → bloom)

Space is black. A dark paint (Void Chrome especially) on the night side of a
planet would otherwise dissolve into the starfield. Each paid paint declares an
optional `rim` block on its finish profile — the shader injects a Fresnel-driven
contribution into `totalEmissiveRadiance` so the silhouette of the ship glows in
the paint's accent color regardless of scene lighting. The rim isn't just a
mesh-local edge tint, though — it's tuned so the existing
`LevelPostProcessing` `BloomEffect` (luminance threshold `0.25`, intensity
`0.35`, mipmap blur radius `0.5`) picks it up and spreads it past the silhouette
into surrounding pixels. The result is a Photoshop-style outer glow halo, not a
hairline edge.

```glsl
// fragment, after <emissivemap_fragment>
vec3 N = normalize(vNormal);          // view-space surface normal
vec3 V = normalize(vViewPosition);    // camera-to-fragment (toward camera)
float fresnel = 1.0 - clamp(dot(N, V), 0.0, 1.0);
float rim = pow(clamp(fresnel + uPaintRimBias, 0.0, 1.0), uPaintRimPower);
totalEmissiveRadiance += uPaintRimColor * (rim * uPaintRimIntensity);
```

Rim values per paid shuttle paint:

Shuttle paid paints:

| Paint                 | Rim color  | Intensity | Power | Bias  |
| --------------------- | ---------- | --------- | ----- | ----- |
| Neon Comet            | `#60a5fa`  | 2.8       | 1.4   | 0.08  |
| Red Sparrow           | `#f87171`  | 2.4       | 1.4   | 0.08  |
| The Space Time Matrix | `#4ade80`  | 2.7       | 1.4   | 0.08  |
| Void Chrome           | `#a78bfa`  | 4.0       | 1.2   | 0.10  |
| Cinderline Gold       | `#f59e0b`  | 3.0       | 1.4   | 0.08  |
| Saturn Club           | `#fef3c7`  | 1.8       | 1.8   | 0.05  |

Lander paid paints (rim intensities tuned a touch lower because the lander is
a smaller silhouette — same HDR spillover at shuttle intensities would over-
bloom the small ship):

| Paint            | Rim color  | Intensity | Power | Bias  |
| ---------------- | ---------- | --------- | ----- | ----- |
| Dust Angel       | `#f9a8d4`  | 1.8       | 1.7   | 0.06  |
| Frostbite Safety | `#67e8f9`  | 2.2       | 1.5   | 0.07  |
| Mariner Red      | `#f87171`  | 2.4       | 1.5   | 0.08  |
| Hazard Bloom     | `#bef264`  | 2.6       | 1.4   | 0.08  |

Tuning rationale:

- **Intensity > 1.0 (HDR).** Bloom extracts pixels with luminance above the
  bloom threshold; pushing rim contributions into HDR space (rather than
  staying inside `[0,1]`) gives bloom bright source pixels to spread, which is
  what makes the halo visibly extend past the silhouette.
- **Lower power widens the rim band.** Powers were dropped from the original
  `2.0–3.0` range to `1.2–1.8` so the rim covers more pixels at glancing
  angles. More source area for bloom = wider, softer outer glow rather than a
  hairline edge that bloom barely notices.
- **Small positive bias.** Most paints add a `0.05–0.10` Fresnel bias so even
  near-front-facing fragments contribute a faint baseline emissive — keeps the
  glow connected across rounded surfaces instead of breaking into floating
  highlights at sharp grazing angles.
- **Void Chrome leans hardest.** Power `1.2`, intensity `4.0` — its near-black
  hull needs the strongest violet halo to read against the starfield.

`intensity = 0` short-circuits the rim branch in the shader (still one uniform
compare per fragment, but no `pow` or color blend), so Factory Stock sets it to
zero rather than recompiling.

## Self-illumination (base glow)

Even with rim light, faces directly facing the camera on the dark side of a
planet still got no light. To keep the ship readable in deep umbra, the
shader injects a constant self-illumination term right after the rim:

```glsl
if (uPaintBaseGlow > 0.0) {
  totalEmissiveRadiance += diffuseColor.rgb * uPaintBaseGlow;
}
```

Because `diffuseColor` already carries the per-channel paint × ramp × detail at
this point, every paint glows in its own color at a constant fraction of its
shaded value. Tuned at `0.20` for shuttle replace mode (20% of paint color
baseline) — high enough to compensate for the mid-tone brightness lost when
the GLB diffuse map was dropped. Lander replace mode uses `0.15` because the
lander is small enough that `0.20` makes it feel like a lantern hanging off
the dark side of a planet rather than a hull. Set to `0` for Factory Stock
alongside ramp + detail + rim, so the bypass remains a true no-op.

Procedural detail floors were also dialed back to keep panel seams from
gouging into the paint:

- `seamShade` floor `0.55 → 0.78` (panel-line darkening).
- `scuffShade` floor `0.88 → 0.94` (low-frequency wear).
- `grainShade` floor `0.96 → 0.97` (high-frequency grain).

Paint color strength was also bumped from the legacy `0.88` to `1.0` so paid
paints read at full chroma now that the stock diffuse map no longer competes
with them.

- **Tint mode** layers the ramp on top of the authored albedo and lerps the
  per-channel paint color into it at low strength. Used by multitool, and by
  the lander's Factory Stock (paid lander paints now use replace mode).
- **Replace mode** drops the diffuse map when the GLB has one
  (`material.map = null`) and lets `material.color * paintRamp * paintDetail`
  carry all surface color. Procedural panel seams + scuffs + grain in the
  fragment shader simulate the panel detail the dropped texture used to
  provide. The lander GLB carries no diffuse map to begin with so there's
  nothing to drop, and the procedural detail is left at `0` because the
  lander's geometric panel breaks already supply visual variety at its scale.
- **Bypass mode** sets ramp + detail strengths to 0 so the OBC chunk multiplies
  by `1.0` and `1.0` — the material renders identically to its authored GLB
  pipeline (no shader recompile required).

Each paintable shuttle material captures `stockColor` and `stockMap` at clone
time so Factory Stock can fully restore the authored finish.

Bounds along the ramp axis are computed once per target list and cached via
`WeakMap`. `meshToVehicleLocal` matrices are captured at collection time so the
ramp shader doesn't need access to the live scene graph.

## Files

- `src/three/cosmetics/paintRampShader.ts` — texture builder + OBC injector,
  optional `detailStrength` for procedural panel seams + scuffs.
- `src/three/cosmetics/shuttlePaintMaterials.ts` — replace mode + Factory Stock
  branch (used by the arrival sequence preview).
- `src/three/cosmetics/landerPaintMaterials.ts` — lander paint + ramp (tint mode).
- `src/three/cosmetics/multitoolPaintMaterials.ts` — multitool paint + ramp (tint mode).
- `src/three/ShuttleController.ts` — mirrors the replace-mode pipeline for the
  in-flight shuttle (the controller has its own per-material book-keeping
  separate from the standalone module).
- `src/components/shop/PimpMyShuttleDialog.vue` — Destiny-shard swatch markup.
- `src/assets/css/main.css` — `.cosmetic-shader-shard*` styles.

## Notes

- All `CanvasTexture` instances are cached by `stops.join('|')`. Picking the
  same option N times reuses one GPU texture.
- `paintRampUniforms` lives on `material.userData`; the swap path reuses the
  existing OBC closure when only the texture / strength changes (no shader
  recompile cost). Toggling the diffuse map on/off does require a recompile via
  `material.needsUpdate = true` because of the `USE_MAP` define.
- Two-stop gradients (e.g. flag pennants) work fine — the texture builder falls
  back to a duplicated stop.
- The procedural detail uses 8 panel seams along the ramp axis (`floor(t * 8)`),
  a low-frequency scuff hash (`floor(localXY * 0.06)`), and a high-frequency
  grain hash. All driven by a 6-line `paintHash21` so the shader stays cheap.
