# Cosmetic Shader Model Mapping

## Context

`Pimp My Shuttle!` already ships shader-like cosmetic rows in
`src/data/cosmetics/pimp-my-shuttle.json`. Each paint, trail, flag, title, and multitool option
has a stable id, a player-facing name, a flavor description, and `gradientStops`.

This document records the current shuttle / lander model mappings inspected from
`public/models/shuttle.glb` and `public/models/lander.glb`, then sketches how those catalog
gradients can drive a later Three.js material pass. No model integration happens in this pass.

## Catalog Contract

Treat each `gradientStops` array as a compact material recipe:

- Stop 0 = primary body color.
- Stop 1 = secondary panel color.
- Stop 2 = trim / accent color.
- Stop 3, if added later = emissive, edge light, decal, or special-finish color.

For three-stop catalog rows, the renderer can derive supporting values:

- `darkTrim` by mixing stop 2 toward black.
- `lightTrim` by mixing stop 1 toward white.
- `edgeGlow` by using the most saturated stop at low emissive intensity.
- `roughness` / `metalness` from an optional future `finish` field, not from color alone.

Current shop UI uses `linear-gradient(135deg, ...gradientStops)`. The render pass should consume
the same stops and avoid a parallel hardcoded shader table.

## Shuttle Zones

The shuttle has useful named materials. A first pass can clone those materials and tint
`MeshStandardMaterial.color`, preserving existing base-color, normal, roughness, and metalness
textures.

| Zone | Material names |
| --- | --- |
| Primary hull | `wingtop`, `wing flap top`, `nose top`, `side stb`, `side prt`, `OMS pod stb`, `OMS pod prt`, `tail`, `shut-doors-top`, `shut-doors-side` |
| Secondary hull | `belly`, `belly flap`, `fusolage aft eng`, `OMS pod prt back`, `OMS pod stb back`, `RCS aft stb`, `RCS aft prt` |
| Trim / edges | `nose tip`, `bay prt wedges`, `bay stb wedges`, `bay prt edges`, `bay stb edges`, `doors edge`, `cockpit side` |
| Accent details | `shut-handrails`, `arrows top`, `shut-cam-cargo`, `bay prt evarail`, `bay stb evarail`, `bay prt doorlatc`, `bay stb doorlatc` |
| Glass / windows | `shut-glass`, `shut-bay-win-out`, `winodws top blac`, `winodws top whi1`, `winodws top whit`, `winodws top whi2` |
| Payload bay / interior | `shut-bay`, `shut-bay-fwd`, `shut-bay-aft`, `doors inside`, `shut-bay-win-ins`, `shut-bay-win-sid` |
| Engine hardware | `eng in`, `eng out`, `RCS out` |

Recommended initial paint mapping:

- Primary hull uses stop 0.
- Secondary hull uses stop 1.
- Trim / edges use stop 2.
- Accent details use stop 2 at stronger saturation or stop 1 when stop 2 is very dark.
- Glass stays mostly original, with only a subtle tint from stop 1 or a future glass recipe.
- Interior and engine hardware stay neutral unless a cosmetic explicitly targets them.

Important caveat: many shuttle surfaces use baked texture maps. Multiplying a material color over
those textures will tint labels, panel lines, weathering, and existing markings too. That is good
enough for a first shader-like cosmetic pass, but a cleaner Destiny-style pass wants either mask
textures or deliberate paintable material slots.

## Lander Zones

The lander currently has one shared material, `Lunar_Lander`, with base-color, normal, and
metallic-roughness textures. There are no useful material slots, so a render pass must traverse
meshes by node / mesh name and clone the shared material per zone before tinting.

| Zone | Mesh / node names |
| --- | --- |
| Primary body | `Top Section_Lunar Lander_0`, `Bottom Section_Lunar Lander_0`, `Door_Lunar Lander_0` |
| Secondary hardware | `Landing Legs_Lunar Lander_0`, `Ladder_Lunar Lander_0`, `Extras_Lunar Lander_0` |
| Trim / antennae | `Antennas_Lunar Lander_0`, `Antennas_Lunar Lander_0.001`, `Antennas Side_Lunar Lander_0` |
| Engine hardware | `Thruster_Lunar Lander_0`, every `Thrusters_Lunar Lander_0*` mesh |

Recommended initial paint mapping:

- Primary body uses stop 0.
- Landing legs, ladder, and extras use stop 1.
- Antennae and thin detail pieces use stop 2.
- Thruster meshes stay dark neutral with a faint stop 2 tint, so trail color remains readable.

The lander will show less crisp region separation than the shuttle until the model has distinct
paint material slots or mask textures. Cloning per mesh is still the right MVP because it is
deterministic and keeps the catalog data-driven.

## Option Recipes

### Shuttle Paintjobs

| Option | Stops | Model treatment |
| --- | --- | --- |
| `Factory Stock` | `#f1f5f9`, `#cbd5e1`, `#475569` | Mostly white ceramic primary, pale slate secondary, graphite trim. Preserve original texture contrast. |
| `Neon Comet` | `#ff2bd6`, `#3b82f6`, `#0f172a` | Magenta main hull, royal-cobalt secondary panels, ink-deep trim / belly hardware. Magenta accent emissive on small details; rim glow tinted blue (`#60a5fa`) so the silhouette reads cool against the warm primary. |
| `Red Sparrow` (id `shuttle-paintjob-europa-velvet`) | `#ef4444`, `#991b1b`, `#1c1917` | Carmine primary, deep blood-bay secondary, ash-black trim. High metalness + low roughness = automotive carmine clearcoat; red emissive on accents reads like taillights; bright ember rim (`#f87171`). Flavor text tags this as Mr. Finch's favorite. Keep the legacy id so existing player profiles don't lose this paintjob. |
| `The Space Time Matrix` (id `shuttle-paintjob-solar-vice`) | `#86efac`, `#16a34a`, `#052e16` | Phosphor-mint primary, matrix-green core panels, deep-void trim. High metalness + low roughness = mirrored data plates; matrix-green emissive on accents; phosphor-green (`#4ade80`) rim. Keep the legacy id so existing player profiles don't lose this paintjob. |
| `Void Chrome` | `#020617`, `#4c1d95`, `#94a3b8` | Near-black primary, violet secondary edge panels, cool slate trim. Keep roughness lower than stock in a future finish recipe to sell chrome. |
| `Cinderline Gold` | `#78350f`, `#f59e0b`, `#1c1917` | Burnt brass primary, amber secondary, blackened trim. The dark stop should land on belly / edges so it reads like ash, not mud. |
| `Saturn Club` | `#faf7e8`, `#a8a29e`, `#0f172a` | Champagne primary, ring-dust secondary, deep ink trim. Best Fantasia signature option because it preserves shuttle readability while feeling premium. |

### Lander Paintjobs

| Option | Stops | Model treatment |
| --- | --- | --- |
| `Factory Stock` | `#fafaf9`, `#d6d3d1`, `#57534e` | Bone epoxy body, stone hardware, dark warm trim. |
| `Dust Angel` | `#fef3c7`, `#ec4899`, `#fdf2f8` | Cream body, bubblegum-pink landing gear / panels, ultra-pale pink trim. Bubblegum-pink emissive bells and a cotton-candy rim glow give it its own girly identity, well clear of Mariner Red. |
| `Frostbite Safety` | `#22d3ee`, `#fef08a`, `#0ea5e9` | Cyan shell, yellow legs / secondary hardware, blue trim. Reads as safety livery from distance. |
| `Mariner Red` | `#b91c1c`, `#7f1d1d`, `#1f2937` | Crimson body, dark red lower hardware, graphite trim and thrusters. |
| `Hazard Bloom` | `#eab308`, `#000000`, `#84cc16` | Yellow body, black legs / ladder / breaks, acid green antennae or small trim. True hazard stripes need decals or a mask later. |

### Trails

Trail cosmetics should use the same gradient convention but map stops spatially instead of to
model zones:

- Stop 0 = hot inner core.
- Stop 1 = visible plume body.
- Stop 2 = outer falloff / smoke / UV edge.

`Plasma Kiss`, `Blue Shift`, `Ember Wake`, `Cyan RCS`, `Magenta RCS`, and `Amber RCS` are already
authored in that order. The later particle / shader pass can feed those stops into plume material
uniforms without inventing new trail recipes.

## Multitool / Gun Zones

`public/models/multitool.glb` is optimized from `3d/multitool.glb` by
`scripts/optimize-multitool-glb.mjs`. The model is effectively a pistol-shaped multitool. It has
one shared material, `02_-_Default`, with base-color, emissive, normal, occlusion, and
metallic-roughness textures.

There are no material slots for body panels / grips / muzzle as separate paint regions. The good
news is the export preserves separate gameplay nodes:

| Zone | Node names | Mesh names |
| --- | --- | --- |
| Primary body | `pistol_body` | `pistol001_02 - Default_0` |
| Rear LEDs | `pistal_led_back_left`, `pistol_led_back_right` | `pistol001_02 - Default_0.002`, `pistol001_02 - Default_0.001` |
| Front LED / muzzle light | `pistol_led_front` | `pistol001_02 - Default_0.003` |
| Power indicators | `pistol_power_indicator_1`, `pistol_power_indicator_2` | `pistol001_02 - Default_0.006`, `pistol001_02 - Default_0.007` |
| Trigger | `pistol_trigger` | `pistol001_02 - Default_0.005` |
| Trigger lock | `pistol_trigger_lock` | `pistol001_02 - Default_0.004` |

Recommended initial paint mapping:

- `pistol_body` uses stop 0 as a material-color multiply over the baked base-color texture.
- `pistol_trigger` and `pistol_trigger_lock` use stop 1, giving the hand-contact hardware a
  distinct read.
- LED / power indicator nodes keep their emissive texture but tint emissive/color toward stop 2.
- If stop 2 is pale cream / white, derive a saturated accent from stop 1 for emissive nodes so the
  indicators remain visible.

Catalog treatment:

| Option | Stops | Model treatment |
| --- | --- | --- |
| `Fleet Issue` | `#e7e5e4`, `#78716c`, `#292524` | Light stock chassis, stone trigger/lock, dark subdued indicators. |
| `Arcade Relic` | `#7c3aed`, `#22c55e`, `#fef9c3` | Purple chassis, green trigger/lock or display-adjacent hardware, warm cream LEDs / labels. If cream reads too flat on emissive nodes, use green for emissive and cream for small trim. |
| `Surgical Pink` | `#ffffff`, `#f472b6`, `#fda4af` | White chassis, shock-pink trigger/lock, rose LED tint. This is the cleanest match for the current single-body mesh. |
| `Graphite Bloom` | `#111827`, `#64748b`, `#c084fc` | Dark graphite chassis, slate trigger/lock, violet emissive indicators. Best candidate for an oil-slick feel if a later finish recipe can lower roughness and add a small purple rim. |

Multitool caveat: because the main body is one baked mesh and one material, we cannot isolate grip
panels, muzzle casing, rails, or decals by name today. The later high-quality path is to split the
source model into named material slots such as `tool.body`, `tool.grip`, `tool.trim`,
`tool.emissive`, and `tool.trigger`, or author a paint mask texture.

## Renderer Integration Brainstorm

Add a thin Three.js adapter later, probably under `src/three/cosmetics/`, with no new content
definitions:

```ts
type PaintChannel = 'primary' | 'secondary' | 'trim' | 'accent' | 'glass' | 'engine'

interface CosmeticPaintRecipe {
  readonly primary: string
  readonly secondary: string
  readonly trim: string
  readonly accent: string
}
```

The adapter would:

1. Read the active cosmetic id from `PlayerCosmetics`.
2. Resolve it through `findCosmeticOptionById`.
3. Convert `gradientStops` into a `CosmeticPaintRecipe`.
4. Traverse the loaded model root.
5. Clone materials before mutating, so stock model materials are not globally polluted.
6. Apply colors by exact shuttle material name or exact lander node name.
7. Reapply whenever the active cosmetic selection changes.

Keep exact GLB names in one mapping file per model:

- `src/three/cosmetics/shuttleMaterialZones.ts`
- `src/three/cosmetics/landerMaterialZones.ts`
- `src/three/cosmetics/multitoolMaterialZones.ts`

That keeps the mapping brittle in one obvious place. It also gives us a small unit-test target that
can assert every mapped material / node still exists when a model asset changes.

## When To Upgrade Beyond Tinting

Tinting is the fastest credible pass because the catalog already has gradients and the shuttle has
usable material names. Upgrade when one of these becomes important:

- A shader needs stripes, decals, split panels, or asymmetry.
- A baked texture marking must stay neutral while only paint changes.
- `Hazard Bloom` needs actual hazard stripes.
- `Void Chrome` and `The Space Time Matrix` need real finish behavior, not just color.
- Flags and shuttle titles need placement instead of UI-only persistence.

At that point the better model path is either paint mask textures or deliberately named material
slots: `paint.primary`, `paint.secondary`, `paint.trim`, `paint.accent`, `glass`, `engine`,
`decal.flag`, and `decal.title`.
