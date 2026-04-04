# Lunar lander GLB (`lander.glb`)

## Source

- **Blender export:** `3d/lander_from_blender.glb` (your named RCS / **Antenna Front** setup). Replace or update this file when you re-export from Blender.
- **Older Fab source:** `3d/lander_original_pristine.glb` is the previous pipeline input; the build script now targets **`lander_from_blender.glb`** only.
- **Folder `3d/Textures/`:** Reference / DCC source. The GLB embeds textures; the optimizer resizes/compresses **embedded** images.

## Game build: `public/models/lander.glb`

```bash
bun run models:lander:build
```

This runs `scripts/optimize-lander-glb.mjs`, which mirrors **`gltf-transform optimize`** but:

- **Does not join meshes** (same as `--join false`) so **node/mesh names stay separate** for VFX and `getObjectByName`.
- **Skips mesh simplification** (decimation) for:
  - **`Antennas_Lunar Lander_0.001`** — *Antenna Front* in your scene
  - **Every mesh whose name starts with `Thrusters_Lunar Lander_0`** — all RCS pieces + the shared `Thrusters_Lunar Lander_0` body if present  
- Still runs **weld**, **textures** (2K WebP), **meshopt**, **quantization**, etc. on the rest of the lander.

**Environment (optional):**

| Variable | Default | Meaning |
|----------|---------|---------|
| `LANDER_SIMPLIFY_RATIO` | `0.58` | Fraction of vertices to **keep** on meshes that are allowed to simplify |
| `LANDER_SIMPLIFY_ERROR` | `0.001` | Simplifier error limit |
| `LANDER_TEXTURE_SIZE` | `2048` | Max texture dimension |

## Three.js

The output **requires** `MeshoptDecoder`, **`EXT_texture_webp`**, and **`KHR_mesh_quantization`** support on `GLTFLoader` (same as other optimized GLBs in this repo).

## Rigs, thrusters, and particle attach points

After Blender splits and naming (`RCS_*`, **Antenna Front**), rebuild with `models:lander:build` so the game GLB stays in sync. Per-thruster emitters use **node names** you set in Blender (e.g. `RCS_FL_Up`); the optimizer preserves meshes that match the skip rules above.
