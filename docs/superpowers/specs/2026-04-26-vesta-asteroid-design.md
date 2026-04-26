# Vesta Asteroid - Design Spec

**Date:** 2026-04-26
**Status:** Approved for implementation

## Overview

Add 4 Vesta as a playable asteroid using the source asset
`3d/asteroids/vesta.glb`. The asset should be processed through the existing
asteroid normalization pipeline and referenced at runtime from
`/models/asteroids/vesta.glb`.

Vesta should sit between the early near-Earth bodies and the high-risk metallic
or exotic asteroids. It is a large, bright, differentiated main-belt body with
basaltic crust, heavy cratering, and major trough and impact-basin terrain.

## Research Baseline

NASA Dawn mission summaries describe Vesta as the second most massive body in
the main asteroid belt, a differentiated rocky protoplanet with crust, mantle,
and core. Vesta is associated with HED meteorites: howardites, eucrites, and
diogenites. Dawn mapped a heavily cratered surface with the huge Rheasilvia and
Veneneia impact basins and planet-encircling trough systems.

Use these gameplay baseline values:

- `designation`: `4 Vesta`
- `type`: `Basaltic achondrite (V-type)`
- `biome`: `rocky`
- `shape.dimensions`: `[572600, 557200, 446400]`
- `shape.elongation`: `1.28`
- `shape.lobeCount`: `1`
- `physical.mass`: `2.59027e20`
- `physical.density`: `3456`
- `physical.surfaceGravity`: `0.22`
- `physical.rotationPeriod`: `5.342`
- `visual.albedo`: about `0.42`

## Asteroid Definition

Create `src/data/asteroids/vesta.json` with the same schema as existing
asteroid data. Composition should reflect Vesta's basaltic achondrite identity:

- Basaltic Lava: 30%
- Pyroxene: 25%
- Plagioclase Feldspar: 18%
- Olivine: 10%
- Iron-Nickel Alloy: 8%
- Magnetite: 5%
- Iron Sulfides: 4%

Surface tuning should emphasize an old, bright, heavily processed protoplanet:

- High crater density around `0.8`
- Large crater scale around `0.35`
- Moderate boulder density around `0.25`
- High ridge/trough frequency around `0.75`
- Roughness around `0.6`
- Dust coverage around `0.28`
- Model path `/models/asteroids/vesta.glb`
- Model scale `1300`, matching normalized asteroid assets
- Rocky texture treatment with a low texture repeat for large terrain features

Visual tuning should make Vesta brighter and more neutral than Eros:

- `baseColor`: pale basalt gray/tan, approximately `[0.7, 0.66, 0.55]`
- `valleyTone`: about `0.4`
- `peakTone`: about `1.45`
- Lighting should be crisp and neutral, with enough contrast to read troughs
  and basin terrain.

## Gameplay Placement

Vesta is an early-mid to mid-game asteroid:

- `minDifficulty`: `3`
- `maxDifficulty`: `5`
- Offered by Mars, Jupiter, and Saturn asteroid boards

This overlaps Eros at difficulty 3-4 and Psyche at difficulty 4-5. The overlap is
intentional: Vesta should feel like the first larger main-belt protoplanet option
before the metallic Psyche tier.

## Asset Pipeline

Run the existing normalization pipeline for the Vesta source asset:

```bash
$env:ASTEROID_ONLY = 'vesta'; bun run models:asteroids:normalize; Remove-Item Env:ASTEROID_ONLY
```

The pipeline should generate `public/models/asteroids/vesta.glb`. The source
asset remains in `3d/asteroids/vesta.glb`.

## Testing

Add focused unit tests for:

- Vesta appears in the asteroid catalog and catalog validation covers it.
- Vesta can be selected from Mars, Jupiter, and Saturn at difficulty 4.
- Vesta is not selected from unrelated hosts such as Earth at difficulty 4.
- Existing no-host fallback behavior still excludes host-specific bodies.

Run the repository acceptance checks after implementation:

- `bun run lint`
- `bun run type-check`
- `bun run test:unit`
