# Eros Asteroid - Design Spec

**Date:** 2026-04-26
**Status:** Approved for implementation

## Overview

Add 433 Eros as a playable asteroid using the newly added
`public/models/asteroids/eros.glb` asset. Eros should expand the early asteroid
pool as a brighter, elongated, stony near-Earth body that feels distinct from
Bennu while remaining accessible before Psyche.

The implementation stays data-driven: asteroid physical, surface, visual, and
mission availability values live in JSON, while TypeScript catalog and generator
code only import, validate, and select those data records.

## Research Baseline

433 Eros is a real S-type Amor near-Earth asteroid visited by NASA's NEAR
Shoemaker mission. Public NASA and mission summaries describe it as an elongated
stony asteroid, roughly 34.4 x 11.2 x 11.2 km, with density near Earth's crust,
a rotation period near 5.27 hours, and surface composition dominated by
iron- and magnesium-bearing silicates such as olivine and pyroxene mixed with
metallic nickel-iron.

For game data, use these baseline values:

- `designation`: `433 Eros`
- `type`: `Siliceous (S-type)`
- `biome`: `sandy`
- `shape.dimensions`: `[34400, 11200, 11200]`
- `shape.elongation`: `3.07`
- `shape.lobeCount`: `1`
- `physical.mass`: `6.687e15`
- `physical.density`: `2670`
- `physical.rotationPeriod`: `5.27`
- `visual.albedo`: about `0.25`

The surface gravity can be tuned for this game's existing scale rather than
simulating full irregular-body gravity. It should sit above Bennu and Itokawa
but below Psyche, around `0.006`.

## Asteroid Definition

Create `src/data/asteroids/eros.json` with the same schema as the existing
asteroids. The composition should sum to 100 and reflect an ordinary-chondrite
style S-type body:

- Olivine: 34%
- Pyroxene: 32%
- Plagioclase Feldspar: 12%
- Iron-Nickel Alloy: 10%
- Iron Sulfides: 7%
- Magnetite: 5%

Surface tuning should emphasize Eros' long, cratered, ridge-marked stony
profile:

- Moderate-high crater density, around `0.6`
- Large crater scale around `0.28`
- Moderate boulder density, around `0.35`
- Ridge frequency around `0.55`
- Roughness around `0.55`
- Dust coverage around `0.35`
- Model path `/models/asteroids/eros.glb`
- Model scale matching the current large asteroid assets, initially `1300`
- Sandy/rocky texture treatment unless visual testing shows the model's
  authored material should pass through instead

Visual tuning should make Eros brighter and warmer than Bennu:

- `baseColor`: warm tan/ochre, approximately `[0.62, 0.53, 0.39]`
- `valleyTone`: about `0.45`
- `peakTone`: about `1.35`
- Lighting should be neutral-warm with enough ambient fill to read the elongated
  model silhouette during early missions.

## Gameplay Placement

Eros is an early/mid asteroid:

- `minDifficulty`: `2`
- `maxDifficulty`: `4`
- Offered by Earth and Mars asteroid boards

Difficulty overlap is intentional. At difficulty 2-4, Eros becomes an
alternative to Bennu rather than a strict progression step. The difference is
visual and narrative: Bennu is dark, carbonaceous, rubble-pile terrain; Eros is
brighter, elongated, stony, and slightly more demanding in mass/gravity.

## Planet-Specific Availability

Extend asteroid difficulty map entries with an optional `planetIds` field:

```json
{ "asteroidId": "eros", "minDifficulty": 2, "maxDifficulty": 4, "planetIds": ["earth", "mars"] }
```

When `planetIds` is present, the asteroid is selectable only for missions
posted from those host planets. Existing entries can omit the field and remain
globally selectable by difficulty.

Update the mission generator to pass the host planet into asteroid selection.
The fallback behavior remains unchanged: if no entries match, return the first
difficulty-map asteroid. If entries match difficulty but none match the host,
fall back to globally available entries for that difficulty so a planet-specific
addition cannot break mission generation.

## Code Changes

Implementation should touch only the asteroid data and selection path:

- Add `src/data/asteroids/eros.json`
- Import and include Eros in `src/lib/asteroids/catalog.ts`
- Extend the difficulty map type in `src/lib/missions/asteroidMissionGenerator.ts`
  with optional `planetIds`
- Update `pickAsteroidForDifficulty` to accept an optional host planet id
- Call `pickAsteroidForDifficulty(difficulty, anchor.planetId)` in
  `generateAsteroidMission`
- Add Eros to `src/data/asteroids/difficulty-map.json`
- Add tests covering Eros availability from Earth/Mars and non-selection from
  unrelated host planets when global alternatives exist

## Testing

Add focused unit coverage in `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
or a nearby mission-selection test. The tests should verify:

- Eros can appear for Earth-hosted difficulty 2-4 missions
- Eros can appear for Mars-hosted difficulty 2-4 missions
- Eros does not appear for another host at difficulty 2-4
- Mission generation still succeeds for all difficulties and host types

Run the repository acceptance checks after implementation:

- `bun run lint`
- `bun run type-check`
- `bun run test:unit`
