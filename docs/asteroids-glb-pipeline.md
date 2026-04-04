# Asteroids pack (`asteroids.glb`)

## Source

- **`3d/asteroids.glb`** — Sketchfab-style export (~4.5 MB): **10** named asteroid meshes, shared PBR material with base/color, normal, occlusion, metallic-roughness.

## Game build: `public/models/asteroids.glb`

```bash
bun run models:asteroids:build
```

Uses **`gltf-transform optimize`** with **`--join false`** so each **`Asteroid_no_*`** mesh stays separate (pooling / variety). Settings: **2K** WebP textures, **simplify** ~0.58 ratio, **meshopt** + quantization. Last run: **~4.5 MB → ~0.7 MB** on disk (varies with source).

## Three.js

Requires **`MeshoptDecoder`**, **`EXT_texture_webp`**, and **`KHR_mesh_quantization`** on `GLTFLoader`.

## Tuning

Edit `models:asteroids:build` in `package.json`: `--simplify-ratio`, `--texture-size` (e.g. `1024` for smaller builds).
