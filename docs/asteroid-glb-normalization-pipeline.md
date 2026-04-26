# Asteroid GLB Normalization Pipeline

`scripts/normalize-asteroid-glbs.mjs` converts source asteroid models from `3d/astro_*.glb`
into runtime-ready files under `public/models/asteroids/`.

## Goal

The generated models are normalized to the same practical scale and pivot as
`public/models/asteroid.glb`, while preserving each asteroid model's native proportions. This lets
asteroid data files swap `surface.modelPath` without retuning the existing `modelScale: 1300`
value.

## Pipeline

Run:

```bash
bun run models:asteroids:normalize
```

The script:

- reads every `3d/astro_*.glb` file in deterministic order;
- strips embedded textures and images;
- assigns one neutral double-sided PBR material for runtime texture overrides;
- preserves existing UVs and generates missing UVs so `surface.texturePath` can still tile across
  the model;
- removes tangents, because the normalized assets no longer carry normal maps;
- regenerates normals after simplification so imported normals do not leave the stripped material
  unlit;
- centers each source model, then fits it to the reference model's bounding-box center and max
  dimension with a uniform scale;
- optimizes geometry with deduplication, flattening, welding, simplification, sparse accessors,
  pruning, and Meshopt compression.

## Outputs

The current source files produce:

- `public/models/asteroids/bennu.glb`
- `public/models/asteroids/itokawa.glb`
- `public/models/asteroids/kr3.glb`
- `public/models/asteroids/psyche.glb`
- `public/models/asteroids/vesta.glb`

To swap Bennu to its normalized model:

```json
"modelPath": "/models/asteroids/bennu.glb",
"modelScale": 1300
```

## Tuning

The simplification pass defaults to `ASTEROID_SIMPLIFY_RATIO=0.58` and
`ASTEROID_SIMPLIFY_ERROR=0.001`. Override either environment variable before running the script to
trade visual fidelity for smaller GLBs.
