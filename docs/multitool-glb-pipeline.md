# Multitool GLB (`multitool.glb`)

## Source

- **Blender export:** `3d/multitool.glb` (named nodes for LEDs, power indicators, trigger, and lock). Replace this file when you re-export from Blender.

## Game build: `public/models/multitool.glb`

```bash
bun run models:multitool:build
```

This runs `scripts/optimize-multitool-glb.mjs`, which mirrors **`gltf-transform optimize`** but:

- **Does not join meshes** so separate nodes/meshes remain for `getObjectByName` and VFX.
- **Skips mesh simplification** (decimation) for meshes attached to these **node** names:
  - `pistal_led_back_left` or `pistol_led_back_left` (source may use the `pistal` spelling)
  - `pistol_led_back_right`
  - `pistol_led_front`
  - `pistol_power_indicator_1`, `pistol_power_indicator_2`
  - `pistol_trigger`
  - `pistol_trigger_lock`
- Still simplifies the main body (`pistol_body`) and runs **weld**, **textures** (2K WebP), **meshopt**, etc.

**Environment (optional):**

| Variable | Default | Meaning |
|----------|---------|---------|
| `MULTITOOL_SIMPLIFY_RATIO` | `0.58` | Fraction of vertices to **keep** on meshes that are allowed to simplify |
| `MULTITOOL_SIMPLIFY_ERROR` | `0.001` | Simplifier error limit |
| `MULTITOOL_TEXTURE_SIZE` | `2048` | Max texture dimension |

## Three.js

The output **requires** `MeshoptDecoder`, **`EXT_texture_webp`**, and **`KHR_mesh_quantization`** support on `GLTFLoader` (same as other optimized GLBs in this repo).
