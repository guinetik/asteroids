# Space Shuttle GLB pipeline (programmatic, no Blender)

This note describes how to combine NASA’s split Shuttle assets into a **single game-ready GLB** using **Node** tooling ([glTF Transform](https://gltf-transform.dev/)), and what **cannot** be solved by a dumb merge.

## What you have today

| Asset | Role |
|--------|------|
| `Space Shuttle (D).glb` | Main orbiter: Draco-compressed mesh, embedded WebP/JPEG textures, **animations** `shutAction` and `shut.layerAction` (Blender export; also uses `KHR_draco_mesh_compression`, `KHR_materials_specular`, `EXT_texture_webp`). |
| `Space Shuttle (D) door-prt.glb` / `door-stb.glb` | Small add-on meshes; **invalid for portable GLB** until fixed: they reference **external** `SHUT-DOO.JPG` and `SHUT-DOA.JPG` via `images[].uri` inside a `.glb` (validator flags `URI_GLB`). |
| `Space Shuttle (D) eng.glb` / `rcs.glb` | Additional geometry; validate clean aside from optional `FB_ngon_encoding` (Blender) and unused materials. |

### Aft thruster add-ons (`eng.glb`, `rcs.glb`) — why they are not “on the back” after merge

Those two files are **extra nozzle/thruster detail** meshes (materials like `eng in` / `eng out`, `RCS out`). Each file has a root **`eng`** or **`rcs`** node plus a `<3DSRoot>` axis flip—**no translation** into the main orbiter’s frame. **Merging only appends them to the scene**; it does **not** snap them onto the grey **OMS pod** caps or the flat circles you see in the viewport.

The big shuttle asset already includes separate meshes/materials for the aft area (e.g. **OMS pod prt / stb**, **OMS pod prt back / stb back**, **RCS aft prt / stb**). The add-ons are meant to **sit on or replace** those regions visually, but you must **place** them:

1. **Runtime (Three.js)** — After `GLTFLoader` loads your merged `shuttle.glb`, `traverse` to find `Object3D`s named `eng` and `rcs` (names are preserved). Separately find nodes whose names match the OMS aft pieces (e.g. containing `OMS` and `back`). Adjust **`position` / `rotation`** (and scale if units differ) until the detail meshes line up with the two rear pod faces. Use **world-space** helpers: `getWorldPosition`, `attach()` to a parent node, or copy the transform from a reference empty you align once in a DCC. This is the usual approach when source files use **different coordinate origins**.

2. **One-time in Blender / Maya** — Import the main orbiter + `eng.glb` + `rcs.glb`, move each add-on until it sits in the OMS pod openings, **parent** to the orbiter hierarchy (or bake transforms), export a single GLB. No merge step needed for placement afterward.

3. **Programmatic glTF edit** — Possible with `@gltf-transform/core` (set node translation/rotation on `eng` / `rcs`) once you have **numeric offsets** from measurements; merging alone will not compute those offsets.

**Summary:** Treat **`eng`** and **`rcs`** as **floating parts** until you align them to the **aft OMS pods**—either by hand in-engine or once in a 3D editor. This is separate from texture work; those meshes have **no** external textures.

Until the missing JPEGs sit next to those door GLBs (or you embed them—see below), **`gltf-transform merge` will fail** when it tries to read the door files.

### Recreating `SHUT-DOO.JPG` and `SHUT-DOA.JPG` (NASA did not ship them)

These are **plain sRGB albedo** maps for the materials `shut-doors-side` and `shut-doors-top` on the door meshes. You are not matching a published resolution—only **what the UVs actually sample**.

**Resolution (practical):** Use **square** textures. **`1024×1024` JPEG** is enough for a small prop; **`512×512`** is fine for early blocking. Going to **2048** only helps if the camera hugs the payload bay doors.

**UV usage (from `door-prt.glb` accessors):**

| File | Material | What the mesh samples |
|------|-----------|------------------------|
| `SHUT-DOO.JPG` | `shut-doors-side` | **Full** texture: U and V run **0 → 1** (use the whole square). |
| `SHUT-DOA.JPG` | `shut-doors-top` | **Bottom half only:** V runs **0 → 0.5**, U **0 → 1**. The **top half** of the image (V from 0.5 to 1) is **never sampled**—leave it empty, duplicate the lower band, or paint a simple extension; it will not show on this mesh. |

**What to paint:** Orbiter payload-bay door blankets read as **off-white / light gray** with **subtle fabric or blanket noise** (no need for photo accuracy for a game). The materials multiply the texture by a light gray `baseColorFactor` (~0.78), so a **neutral mid-to-light gray** with mild variation reads “Shuttle blanket.” For consistency with the big orbiter, **eyedropper** a region from the main `Space Shuttle (D).glb` belly or fuselage texture (export a still from Blender, or sample in-engine) and build two maps in the same ballpark—**side** can have slightly more horizontal streak; **top** can be a bit flatter or noisier so the two faces do not look identical.

**Minimum viable placeholder:** Fill `SHUT-DOO` with a flat **#c8c8c8** (or your sampled gray) plus **2–3% monochromatic noise**; for `SHUT-DOA`, same treatment in the **lower** half of the image (or full image—only the bottom half is used). Save as **baseline JPEG** (quality ~85–92) to match the original naming.

## What “merge” does vs. what a DCC does

- **Merge (glTF Transform)** concatenates multiple glTF **documents** into one file: meshes, materials, skins, **animation clips**, scenes. Use **`--merge-scenes`** so everything ends up in **one scene** (typical for Three.js `Scene` loading).
- **Merge does not** automatically:
  - Parent separate meshes to **bones** in another file’s skeleton.
  - Resolve **duplicate node or animation names** (rename in a script if loaders get confused).
  - Fix **scale/orientation** differences between exports (often 1 unit = 1 m vs 1 cm).

If doors/engines must follow **the same rig** as the main body, that is a **content** problem: either NASA supplied them as skinned children of the same armature, or you **reparent in code** (Three.js: attach meshes to `Bone` or nodes updated from animation) or in a DCC. A merge only makes **one download** and **one `GLTFLoader` load**—it does not replace rigging work.

## Recommended Node workflow

Dependencies are already in the repo: `@gltf-transform/cli`, `@gltf-transform/core`, `@gltf-transform/functions`.

### 1. Unblock door GLBs (pick one)

**A. Supply NASA textures (simplest)**  
Copy `SHUT-DOO.JPG` and `SHUT-DOA.JPG` from the original NASA package into `public/models/` (same folder as the door GLBs). Re-run validation:

```bash
bunx gltf-transform validate "public/models/Space Shuttle (D) door-prt.glb"
```

**B. Re-export from Blender**  
Export doors as GLB with **embedded** images so no `uri` fields point outside the container.

**C. Embed with glTF Transform (after A)**  
Reading and writing with NodeIO usually **inlines** image buffers into the output GLB:

```bash
bunx gltf-transform copy "public/models/Space Shuttle (D) door-prt.glb" "public/models/Space Shuttle (D) door-prt-embedded.glb"
```

(Requires the JPEG files present for the read to succeed.)

### 2. Merge into one GLB

Order **main first** so your primary scene and animations stay the “base”; append pieces after:

```bash
bunx gltf-transform merge ^
  "public/models/Space Shuttle (D).glb" ^
  "public/models/Space Shuttle (D) door-prt.glb" ^
  "public/models/Space Shuttle (D) door-stb.glb" ^
  "public/models/Space Shuttle (D) eng.glb" ^
  "public/models/Space Shuttle (D) rcs.glb" ^
  "public/models/Space Shuttle (D) merged.glb" ^
  --merge-scenes
```

Or use the repo script (same arguments, checks for missing door textures):

```bash
bun run models:shuttle:merge
```

### 3. Game-ready passes (optional, after merge)

Run **`inspect`** on the merged file, then apply transforms as needed:

| Goal | Command (examples) |
|------|---------------------|
| Fewer duplicate buffers | `gltf-transform dedup` |
| Strip unused nodes/materials | `gltf-transform prune` |
| Web delivery: smaller GPU upload | `gltf-transform meshopt` or `draco` (Three.js needs matching loaders/extensions) |
| Quantized attributes | `gltf-transform quantize` |
| Single-shot | `gltf-transform optimize merged.glb optimized.glb` (tune flags; see `optimize -h`) |

**Three.js r183:** use `DRACOLoader` + `MeshoptDecoder` if you emit those extensions. Test in browser after compression.

### 4. Python option

For parity, you can drive the **same** CLI from Python (`subprocess`) or use **`pygltflib`** to read/write JSON + buffers—lower-level, more code for merge + animation bookkeeping. For this project, **Node + glTF Transform** is the path of least resistance.

## Programmatic merge (advanced)

`mergeDocuments()` in `@gltf-transform/functions` merges documents; scenes stay separate unless you join them manually (see [mergeDocuments](https://gltf-transform.donmccurdy.com/modules/functions/functions/mergeDocuments.html) examples). The CLI **`merge --merge-scenes`** is usually enough.

## Summary

- **One GLB without Blender:** `gltf-transform merge … --merge-scenes` after door GLBs can be read (textures on disk or embedded).
- **Animations:** Clips from each file are combined; naming collisions are possible—inspect after merge.
- **Game-ready:** Follow with `dedup`, `prune`, and optional `meshopt`/`draco` + texture compression, validated in Three.js.
