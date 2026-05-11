# Ryugu Asteroid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Ryugu as an early-game (difficulty 1–3) carbonaceous near-Earth asteroid, reachable via Jay (Earth), MMC (Mars) — with a new MMC gather contract — and Cinderline (Mercury).

**Architecture:** Pure data changes. One new asteroid JSON, three new entries in the difficulty map, one new mission entry on an existing giver. No new TS code, no runtime logic.

**Tech Stack:** JSON data files under `src/data/`, validated by existing Vitest suite + type-check via the asteroid/mission loaders.

**Spec:** `docs/superpowers/specs/2026-05-10-ryugu-asteroid-design.md`

---

## File Map

- **Create:** `src/data/asteroids/ryugu.json` — new asteroid profile
- **Modify:** `src/data/asteroids/difficulty-map.json` — three new entries pairing Ryugu with earth/mars/mercury at difficulty 1–3
- **Modify:** `src/data/missions/givers/martian-marines-bunker.json` — add `"gather"` to `objectiveTypes`, add `mmc_foundry_haul` mission

---

### Task 1: Create the Ryugu asteroid profile

**Files:**
- Create: `src/data/asteroids/ryugu.json`

Reference template: `src/data/asteroids/bennu.json` (closest match — also a rocky/C-type near-Earth rubble pile).

- [ ] **Step 1: Confirm the model file is in place**

Run: `ls public/models/asteroids/ryugu.glb`
Expected: file exists (already present in `git status` as untracked).

- [ ] **Step 2: Create `src/data/asteroids/ryugu.json`**

```json
{
  "id": "ryugu",
  "name": "Ryugu",
  "designation": "162173 Ryugu",
  "type": "Carbonaceous (Cb-type)",
  "biome": "rocky",
  "description": "A near-Earth carbonaceous asteroid visited by JAXA's Hayabusa2 mission. Its spinning-top profile carries a pronounced equatorial ridge, and its dark, dry-looking surface is rich in hydrated minerals and primitive organics — a sibling rock to Bennu, slightly larger and warmer in tone.",
  "composition": [
    { "name": "Hydrated Silicates", "formula": "Mg3Si2O5(OH)4", "percentage": 50 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 14 },
    { "name": "Organic Compounds", "percentage": 12 },
    { "name": "Iron Sulfides", "formula": "FeS", "percentage": 9 },
    { "name": "Carbonates", "formula": "CaCO3", "percentage": 8 },
    { "name": "Olivine", "formula": "(Mg,Fe)2SiO4", "percentage": 7 }
  ],
  "shape": {
    "dimensions": [450, 450, 440],
    "elongation": 1.05,
    "lobeCount": 1,
    "irregularity": 0.5
  },
  "surface": {
    "craterDensity": 0.55,
    "craterMaxScale": 0.35,
    "boulderDensity": 0.95,
    "ridgeFrequency": 0.55,
    "roughness": 0.85,
    "dustCoverage": 0.35,
    "modelPath": "/models/asteroids/ryugu.glb",
    "modelScale": 1300,
    "surfaceTextures": "/textures/asteroids/rocky",
    "surfaceTextureRepeat": 13,
    "surfaceModulatorStrength": 1.0,
    "surfaceModulatorColorBlend": 0.1,
    "surfaceAOStrength": 0.5,
    "surfaceEmissionStrength": 0.5
  },
  "visual": {
    "albedo": 0.045,
    "baseColor": [0.28, 0.26, 0.24],
    "valleyTone": 0.1,
    "peakTone": 2.05
  },
  "physical": {
    "mass": 4.5e11,
    "density": 1190,
    "surfaceGravity": 1.2e-4,
    "rotationPeriod": 7.6,
    "surfaceTemperature": 300,
    "meanDiameterKm": 0.9
  },
  "lighting": {
    "sunAzimuth": 45,
    "sunElevation": 35,
    "sunColor": [1.0, 0.93, 0.82],
    "sunIntensity": 1,
    "ambientIntensity": 2
  }
}
```

- [ ] **Step 3: Verify type-check still passes (asteroid loader will pick up the file)**

Run: `bun run type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add public/models/asteroids/ryugu.glb src/data/asteroids/ryugu.json
git commit -m "feat(asteroids): add Ryugu profile (C-type near-Earth)"
```

---

### Task 2: Wire Ryugu into the difficulty map

**Files:**
- Modify: `src/data/asteroids/difficulty-map.json`

- [ ] **Step 1: Add three Ryugu entries**

Append (before the closing `]`, after the existing `itokawa` near-earth entry — keep the file's "small, near-earth first" ordering):

```json
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["earth"] },
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mars"] },
{ "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mercury"] },
```

Final file body after the edit (full file, for clarity):

```json
[
  { "asteroidId": "itokawa", "minDifficulty": 1, "maxDifficulty": 2 },
  { "asteroidId": "itokawa", "minDifficulty": 1, "maxDifficulty": 2, "planetIds": ["earth"] },
  { "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["earth"] },
  { "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mars"] },
  { "asteroidId": "ryugu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["mercury"] },
  { "asteroidId": "bennu", "minDifficulty": 2, "maxDifficulty": 4 },
  { "asteroidId": "bennu", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["earth"] },
  { "asteroidId": "xg7", "minDifficulty": 1, "maxDifficulty": 3, "planetIds": ["earth"] },
  { "asteroidId": "eros", "minDifficulty": 2, "maxDifficulty": 4, "planetIds": ["earth", "mars"] },
  {
    "asteroidId": "vesta",
    "minDifficulty": 3,
    "maxDifficulty": 5,
    "planetIds": ["mars", "jupiter", "saturn"]
  },
  { "asteroidId": "psyche", "minDifficulty": 4, "maxDifficulty": 7 },
  { "asteroidId": "xg7", "minDifficulty": 6, "maxDifficulty": 8 },
  { "asteroidId": "kr3", "minDifficulty": 8, "maxDifficulty": 10 },
  {
    "asteroidId": "hektor",
    "minDifficulty": 5,
    "maxDifficulty": 10,
    "planetIds": ["jupiter"],
    "requiresLiberated": true
  }
]
```

- [ ] **Step 2: Run the existing asteroid mission generator tests**

Run: `bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`
Expected: all green. (This file is already modified on the branch — re-run to confirm no Ryugu-related regressions.)

- [ ] **Step 3: Commit**

```bash
git add src/data/asteroids/difficulty-map.json
git commit -m "feat(asteroids): map Ryugu to earth/mars/mercury at difficulty 1-3"
```

---

### Task 3: Add MMC foundry haul (gather) mission

**Files:**
- Modify: `src/data/missions/givers/martian-marines-bunker.json`

- [ ] **Step 1: Add `"gather"` to `objectiveTypes` and append the new mission**

Replace the `objectiveTypes` line:

```json
"objectiveTypes": ["bunker", "mineral-analysis"],
```

with:

```json
"objectiveTypes": ["bunker", "mineral-analysis", "gather"],
```

Then append this mission as the last entry of the `missions` array (after `mmc_field_assay`):

```json
{
  "id": "mmc_foundry_haul",
  "name": "Foundry Haul — Cohort Supply",
  "briefing": "Pilot. Phobos foundry is running hot and the ore queue is shorter than I like. Deploy the lander with F, set down on the rock, open the cargo bay, and load until the gauge tops out. Foundry quote is by weight — partial holds bounce on the paperwork and I am not the one signing for a half-empty run. Bring it home clean. — Sampaio, MMC",
  "objectiveSlots": [
    {
      "type": "gather",
      "weight": 1,
      "params": { "type": "gather", "resourceAmount": { "min": 100, "max": 250 } },
      "reward": { "min": 900, "max": 2200 }
    }
  ],
  "completionBonus": { "min": 400, "max": 1200 },
  "regionByDifficulty": { "near-earth": [1, 4], "asteroid-belt": [4, 7] },
  "planetIds": ["mars"]
}
```

(Remember the comma after the previous mission's closing `}`.)

- [ ] **Step 2: Run the full unit test suite**

Run: `bun test:unit`
Expected: all green.

- [ ] **Step 3: Run type-check and lint**

Run: `bun run type-check && bun run lint`
Expected: no errors, no warnings.

- [ ] **Step 4: Commit**

```bash
git add src/data/missions/givers/martian-marines-bunker.json
git commit -m "feat(missions): add MMC foundry haul gather contract on Mars"
```

---

### Task 4: Manual smoke check

- [ ] **Step 1: Run dev server**

Run: `bun dev`

- [ ] **Step 2: From a save with difficulty 1–3 unlocked at Earth, Mars, and Mercury, open the contracts board on each host and confirm:**

- Earth (Jay) — at least one contract targets Ryugu across reloads
- Mars (MMC) — `mmc_foundry_haul` appears, and Ryugu shows up as a target
- Mercury (Cinderline) — Anvil substation bunker contract can target Ryugu

(Refresh the contract pool a few times if needed — selection is randomized within the difficulty band.)

- [ ] **Step 3: Land on Ryugu via /level to confirm the model loads, surface textures render, and lighting reads right.**

If anything looks off (e.g., model scale, color tone, ridge prominence), tune `modelScale`, `visual.baseColor`, or `surface.ridgeFrequency` in `ryugu.json` and recommit as a follow-up fix.

---

## Acceptance

- `bun run type-check` clean.
- `bun run lint` 0 errors / 0 warnings.
- `bun run test:unit` all green.
- Ryugu shows up in contract pools on Earth/Mars/Mercury at difficulty 1–3.
- `mmc_foundry_haul` shows up in the MMC contract pool on Mars.
- Ryugu loads and renders correctly when landed on.
