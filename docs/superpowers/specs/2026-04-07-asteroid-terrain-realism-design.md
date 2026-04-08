# Asteroid Terrain Realism Design

**Date:** 2026-04-07
**Status:** Draft

## Overview

The current terrain generator already produces good macro features: crater bowls, crater rims, ridges, and protected flat objective zones. The visual problem is the filler terrain between those features. The base noise is distributed too uniformly across the map, which makes the surface read as continuous rolling waves instead of asteroid regolith, rubble fields, and fractured rock.

This design keeps the existing data-driven asteroid JSON model and the current crater/ridge feature language. The change is to the terrain formula: replace the always-on undulating filler with a biome-aware, patch-masked relief model that produces calmer areas, rough pockets, and sparse localized breakup.

## Goals

- Preserve the current crater and ridge passes as the primary macro terrain language.
- Keep terrain generation fully data-driven from `AsteroidDefinition.surface` and `AsteroidDefinition.biome`.
- Make the in-between terrain read less like smooth wave noise and more like asteroid regolith, rubble, and fractured surface.
- Increase surface variety without adding hand-authored terrain layouts.
- Preserve deterministic generation for a given seed.

## Non-Goals

- Redesign the mission flat-zone system.
- Replace the current crater or ridge algorithms.
- Add literal instanced boulders or mesh scatter in this change.
- Expand the asteroid JSON schema unless implementation proves the current fields are insufficient.

## Current Problem

`generateTerrain()` currently uses a multi-octave simplex FBM pass as the base terrain, then adds craters and ridges, then flattens protected mission areas. The main issue is not the presence of noise, but the way it is applied:

- medium-scale undulation is spread too evenly over the whole terrain
- roughness primarily increases global wobble instead of localized breakup
- high and medium frequency relief do not meaningfully vary by region
- dust and boulder-related surface data do not strongly affect the terrain distribution

The result is readable as procedural terrain, but not specifically asteroid-like.

## Chosen Approach

Adopt a **biome-aware hybrid surface model**:

1. Keep the current crater pass.
2. Keep the current ridge pass.
3. Replace the current base-noise interpretation with:
   - subtle broad support relief
   - a low-frequency disturbance mask
   - masked medium-frequency breakup
   - sparse high-frequency micro-breakup
4. Use existing `surface` fields and `biome` to bias how much detail appears, where it appears, and how sharp it feels.

This matches common game terrain practice for believable natural surfaces: detail should be multi-scale, spatially masked, and non-uniformly distributed.

## Terrain Generation Model

### Pass 1: Broad Support Relief

Generate a very low-frequency base field that provides large-scale unevenness without obvious rolling hills.

Requirements:

- amplitude must be noticeably lower than the current FBM base
- frequency must be lower than the current visible filler pattern
- output should support macro shape, not dominate it

This pass prevents the terrain from feeling mathematically flat, but should not create a recognizable repeating wave pattern by itself.

### Pass 2: Craters

Retain the current crater generation model:

- seeded placement
- parabolic bowl interior
- raised rim band

No shape redesign is required for this work. Existing crater controls remain:

- `craterDensity`
- `craterMaxScale`

### Pass 3: Ridges

Retain the current ridge generation model:

- seeded placement
- noise-warped centreline
- tapered endpoints

Existing ridge control remains:

- `ridgeFrequency`

### Pass 4: Disturbance Mask

Generate a separate low-frequency mask describing how disturbed a region is. This is the key realism pass.

Mask behavior:

- most of the map should fall into calm or lightly disturbed values
- some regions should become rough pockets
- a smaller number of regions should become strongly broken

Implementation requirements:

- use a separate seeded noise field from the broad support relief
- remap the raw noise with a nonlinear curve so low values dominate
- allow biome and surface data to bias the mask contrast and threshold

This mask determines where localized breakup is allowed to appear.

### Pass 5: Medium Breakup

Generate medium-scale breakup and multiply its contribution by the disturbance mask.

Behavior goals:

- broken patches should feel like rough regolith or fractured ground
- calm zones should remain relatively quiet
- terrain should no longer look uniformly noisy across the full map

This pass replaces most of what the current global undulation is visually doing.

### Pass 6: Sparse Micro-Breakup

Generate a higher-frequency detail field, but only allow it where the disturbance mask is already strong.

Behavior goals:

- micro-detail should be sparse, not map-wide
- it should create occasional chunky, knobby, or fractured texture
- it should never become a full-screen ripple pattern

This pass is especially important for making `boulderDensity` matter without needing literal boulder meshes yet.

### Pass 7: Dust Attenuation

Use `dustCoverage` to suppress sharp micro-relief before suppressing broader forms.

Rules:

- high dust reduces high-frequency amplitude strongly
- high dust softens patch transitions
- high dust should not erase the broad support relief or major crater/ridge language

This makes dusty biomes feel blanketed rather than jagged.

### Pass 8: Flat-Zone Protection

Keep the existing flat-zone protection pass at the end of terrain generation.

Requirements:

- objective zones must remain usable as landing and interaction spaces
- the blend should still preserve a natural transition at zone boundaries

## Data-Driven Mapping

The existing asteroid JSON schema remains the source of truth. The meaning of the current fields changes as follows.

### `roughness`

`roughness` controls the strength of breakup in disturbed regions, not the amount of map-wide wobble.

High `roughness`:

- increases medium-breakup amplitude
- allows rough pockets to become harsher
- can slightly increase disturbance-mask contrast

Low `roughness`:

- keeps disturbed regions subtle
- preserves calmer filler terrain

### `dustCoverage`

`dustCoverage` controls smoothing and suppression of sharp relief.

High `dustCoverage`:

- suppresses micro-breakup
- reduces edge harshness
- broadens soft regolith-like zones

Low `dustCoverage`:

- preserves exposed, sharper surface relief

### `boulderDensity`

`boulderDensity` controls sparse chunky breakup in the heightfield.

High `boulderDensity`:

- increases the amplitude or frequency of sparse micro-breakup
- increases the chance that disturbed regions feel knobby or rubble-like

Low `boulderDensity`:

- keeps disturbed regions more eroded or smoothed

### `ridgeFrequency`

`ridgeFrequency` still controls ridge count, and may also slightly bias nearby terrain toward a more fractured feel.

This must stay a secondary influence. Ridge terrain bias should support the macro ridge pass, not overwhelm the generator.

### `craterDensity` and `craterMaxScale`

These remain the crater placement and scale controls and are not redefined by this work.

### `biome`

`biome` supplies preset remapping biases for the same generator, not a separate terrain system.

Initial intended biome behavior:

- `sandy`: calmer filler, softer transitions, broader regolith patches
- `rocky`: stronger patch contrast, more fractured disturbed regions
- `metallic`: harsher exposed relief, less dust softening, sharper breakup
- `icy`: smoother broad forms with restrained breakup and occasional sharper disturbed bands
- default/unknown: use neutral tuning

## Formula Constraints

The implementation must obey these constraints:

- most terrain cells should remain in the calm-to-moderate relief range
- the highest-frequency breakup must occupy a minority of the map
- roughness must affect disturbed zones more than calm zones
- dust must primarily erase sharpness, not macro silhouette
- biome must bias the same generator rather than fork it into unrelated code paths
- all passes must remain deterministic under the existing seed model

## Architecture

The work should remain centered in `src/lib/terrain/terrainGenerator.ts`.

Preferred structure:

- keep public API shape unchanged: `generateTerrain(surface, options): Heightmap`
- add focused private helpers for:
  - biome tuning lookup
  - disturbance mask sampling/remapping
  - medium-breakup sampling
  - sparse micro-breakup sampling
- keep `Heightmap`, `TerrainMesh`, and `LevelViewController` interfaces unchanged

This keeps the generator decoupled and preserves the existing call sites.

## Tuning Strategy

Tune visually in this order:

1. Reduce global undulation first.
2. Add broad support relief conservatively.
3. Introduce disturbance masking until the terrain stops reading as uniformly noisy.
4. Add medium breakup to rough zones.
5. Add sparse micro-breakup only after medium breakup looks believable.
6. Tune biome and dust biases last.

The main failure mode to avoid is replacing one uniform pattern with another. If the new detail is still too evenly distributed, the change is not successful.

## Verification

Verification should focus on visual behavior and generator properties:

- compare before/after terrain on at least `itokawa`, `bennu`, and `psyche`
- verify crater and ridge readability remains intact
- verify objective flat zones remain usable
- verify deterministic output for the same asteroid/mission seed
- verify terrain does not become implausibly flat after dust attenuation
- verify high-frequency detail is visibly patchy rather than map-wide

## File Impact

Expected implementation impact is intentionally small:

- `src/lib/terrain/terrainGenerator.ts`: primary formula change
- optional small supporting updates in asteroid type docs if field meanings need clarification
- no required JSON schema changes
- no required consumer API changes

## Open Decision

Start without expanding the asteroid JSON schema. If implementation reveals that existing fields cannot provide enough art direction, add at most one or two new surface controls in a follow-up design rather than expanding the scope of this change upfront.
