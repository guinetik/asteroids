# Virus GLB (`virus.glb`)

## Source

- **Authoring export:** `3d/virus.glb` (e.g. Sketchfab). Replace when you update the asset.

## Game build: `public/models/virus.glb`

```bash
bun run models:virus:build
```

Runs `scripts/optimize-virus-glb.mjs`, which:

1. **Dedup / instance / palette / flatten / weld** — usual glTF-Transform hygiene.
2. **Simplify → join → weld → simplify** — pre-join decimate (so pieces shrink), then merge draws, then decimate again with extra chained ratios (single passes hit a topology plateau on this model).
3. **Strip NORMAL attributes** — smaller buffers; Three.js recomputes normals on load (`VIRUS_STRIP_NORMALS=false` to keep baked normals).
4. **`reorder` (size) + Meshopt** — encode positions/indices efficiently.
5. **`gltf-transform draco`** — final mesh compression to reach a sub‑1 MB download (`VIRUS_APPLY_DRACO=false` to keep Meshopt-only for debugging).

## Three.js

Shipping build uses **`KHR_draco_mesh_compression`** and **`KHR_mesh_quantization`**. `loadGLB()` in `src/three/loadGLB.ts` registers **both** `MeshoptDecoder` and `DRACOLoader` so Meshopt-only and Draco assets keep working.

## Tuning (environment)

| Variable | Default | Meaning |
|----------|---------|---------|
| `VIRUS_PRE_JOIN_SIMPLIFY_RATIO` | `0.052` | Vertex keep ratio before join |
| `VIRUS_POST_JOIN_SIMPLIFY_RATIO` | `0.018` | First vertex keep ratio after join |
| `VIRUS_JOIN_EXTRA_SIMPLIFY_RATIOS` | `0.4,0.38,0.36` | Comma-separated extra ratios (after post ratio) |
| `VIRUS_SIMPLIFY_ERROR` | `1` | Error limit for ratio-based simplify steps |
| `VIRUS_FINAL_SIMPLIFY_ERROR` | `0` | If &gt; `0`, final `ratio=0` simplify with this error cap |
| `VIRUS_STRIP_NORMALS` | `true` | Strip NORMAL attributes before encode |
| `VIRUS_APPLY_DRACO` | `true` | Run Draco as the last step |
| `VIRUS_TEXTURE_SIZE` | `512` | Max texture size (no-op when there are no textures) |
