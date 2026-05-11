# Ryugu Asteroid — Design Spec

**Date:** 2026-05-10
**Status:** Approved

## Goal

Introduce Ryugu as the next playable asteroid, reachable through three existing mission givers:

- **Jay Mercer** (Earth host) — gather, survey, and mineral-analysis runs
- **Martian Marine Corps** (Mars host) — combat (bunker) + mineral-analysis + a new gather contract
- **The Cinderline** (Mercury host) — combat (bunker) vigil

Ryugu is an early-game asteroid (difficulty 1–3) and the second carbonaceous near-Earth rock after Bennu.

## Scope

### 1. Asteroid profile — `src/data/asteroids/ryugu.json`

Author a new asteroid JSON modeled on real Hayabusa2 / JAXA data, using `bennu.json` as the structural template.

Key real-world properties:

- **Designation:** 162173 Ryugu
- **Type:** Carbonaceous (Cb-type)
- **Biome:** `rocky` (shares Bennu's rocky surface texture set)
- **Model:** `/models/asteroids/ryugu.glb` (already on disk)
- **Diameter:** ~900 m mean; spinning-top shape with a pronounced equatorial ridge
- **Rotation period:** ~7.6 h
- **Density:** ~1190 kg/m³ (rubble pile)
- **Surface gravity:** ~1.2 × 10⁻⁴ m/s²
- **Mean surface temperature:** ~300 K
- **Albedo:** ~0.045 (very dark)
- **Composition:** hydrated phyllosilicates (~50%), magnetite, organics, iron sulfides, carbonates, olivine — close to Bennu but with a higher hydrated-silicate fraction
- **Visual tone:** slightly warmer base color than Bennu (Bennu is bluish-gray; Ryugu reads warmer gray-brown), to keep the two visually distinguishable on approach
- **Shape:** elongation ~1.05, single lobe, equatorial ridge bumps `irregularity` toward the upper end of the rocky range

Lighting block follows Bennu defaults.

### 2. Difficulty map — `src/data/asteroids/difficulty-map.json`

Append three entries (one per host planet) so Ryugu surfaces in the right contract pools:

```json
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["earth"] },
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mars"] },
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mercury"] }
```

Earth → Jay's missions. Mars → MMC's missions. Mercury → Cinderline's missions (the host-giver override at Mercury already routes Cinderline as the giver).

### 3. New MMC gather mission — `src/data/missions/givers/martian-marines-bunker.json`

Add a gather contract so MMC has a true haul job (currently only mineral-analysis + bunker):

- **id:** `mmc_foundry_haul`
- **name:** "Foundry Haul — Cohort Supply"
- **briefing:** Sampaio voice. Cohort foundry on Phobos needs raw ore; pilot lands, opens cargo bay with F, fills the hold, returns. No partial loads — foundry quote is by weight.
- **objectiveSlots:** one `gather` slot, `resourceAmount: { min: 100, max: 250 }`, reward `{ min: 900, max: 2200 }`
- **completionBonus:** `{ min: 400, max: 1200 }`
- **regionByDifficulty:** `{ "near-earth": [1, 4], "asteroid-belt": [4, 7] }`
- **planetIds:** `["mars"]`

Also add `"gather"` to MMC's top-level `objectiveTypes` array.

### 4. No changes elsewhere

- Jay already covers gather/survey/mineral-analysis with `near-earth: [1, 2]` and `[1, 3]` bands — Ryugu at difficulty 1–3 from Earth slots in directly.
- Cinderline's `cinderline_anvil_substation` already covers `near-earth: [1, 4]` on Mercury — Ryugu plugs in directly.
- No new arcade/loot/upgrade content. No achievements.

## Out of scope

- **Daphne** and **Ultima Thule** models are on disk but not introduced in this spec — separate work.
- Specialized Ryugu lore missions (Hayabusa-sample-return flavor) — could be a follow-up but not needed for it to be playable.

## Acceptance

- `bun run type-check`, `bun run lint`, `bun run test:unit` all pass.
- Generating contracts on Earth/Mars/Mercury at difficulty 1–3 can produce Ryugu as the target asteroid.
- MMC's contract pool on Mars at difficulty 1–4 can produce the new `mmc_foundry_haul` gather contract.
- Cinderline bunker contract on Mercury at difficulty 1–3 can target Ryugu.
