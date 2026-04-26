# Eros Asteroid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 433 Eros as an early/mid playable asteroid, using `eros.glb` and limiting natural mission selection to Earth and Mars boards at difficulty 2-4.

**Architecture:** Keep the feature data-driven. Add Eros as a JSON asteroid definition, include it in the existing asteroid catalog, and extend the mission asteroid difficulty map with optional host-planet filtering. Preserve current global asteroid behavior for entries that omit `planetIds`.

**Tech Stack:** Vue 3, TypeScript, Vite static JSON imports, Vitest, Three.js GLB assets, Bun commands only.

---

## File Structure

- Create `src/data/asteroids/eros.json`: Eros physical, composition, surface, visual, and lighting data.
- Modify `src/lib/asteroids/catalog.ts`: import and validate Eros with the existing catalog.
- Modify `src/data/asteroids/difficulty-map.json`: add the Eros difficulty and host availability entry.
- Modify `src/lib/missions/asteroidMissionGenerator.ts`: support optional `planetIds` in difficulty map entries and pass the mission host planet into asteroid selection.
- Modify `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`: add deterministic selection tests for Earth, Mars, and non-Earth/Mars hosts.

## Task 1: Host-Aware Asteroid Selection Tests

**Files:**
- Modify: `src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts`

- [ ] **Step 1: Export the selector in the test import**

Change the existing import from `../asteroidMissionGenerator` so it includes `pickAsteroidForDifficulty`:

```ts
import {
  generateAsteroidMission,
  generateAsteroidWaypointNearHostPlanet,
  generateWaypointInRegion,
  interpolateRange,
  isMissionWaypointSolarDistanceClearOfPlanets,
  nearEarthInnerCatalogForWaypointSpawn,
  nearEarthOuterCatalogForWaypointSpawn,
  objectiveCountForDifficulty,
  pickAsteroidForDifficulty,
  rollObjective,
  syntheticEarthHostAnchor,
  LEVEL_GRID_SIZE,
  MIN_ASTEROID_MISSION_REWARD,
  WAYPOINT_ANNULUS_INNER_FRACTION_AT_MIN_DIFFICULTY,
} from '../asteroidMissionGenerator'
```

- [ ] **Step 2: Add deterministic host filtering tests**

Add this `describe` block after the `rollObjective` tests and before waypoint tests:

```ts
describe('pickAsteroidForDifficulty', () => {
  it('allows Eros for Earth-hosted early/mid missions', () => {
    const picks = new Set<string>()
    for (let i = 0; i < 80; i++) {
      picks.add(pickAsteroidForDifficulty(3, 'earth'))
    }

    expect(picks.has('eros')).toBe(true)
  })

  it('allows Eros for Mars-hosted early/mid missions', () => {
    const picks = new Set<string>()
    for (let i = 0; i < 80; i++) {
      picks.add(pickAsteroidForDifficulty(3, 'mars'))
    }

    expect(picks.has('eros')).toBe(true)
  })

  it('does not select Eros for unrelated hosts when global alternatives exist', () => {
    for (let i = 0; i < 80; i++) {
      expect(pickAsteroidForDifficulty(3, 'venus')).not.toBe('eros')
    }
  })

  it('preserves global fallback when no host is supplied', () => {
    const picks = new Set<string>()
    for (let i = 0; i < 80; i++) {
      picks.add(pickAsteroidForDifficulty(3))
    }

    expect(picks.has('bennu')).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests and confirm the expected failure**

Run:

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
```

Expected: FAIL because `pickAsteroidForDifficulty` does not accept a host planet yet and `eros` is not in the map/catalog.

## Task 2: Eros Asteroid Data

**Files:**
- Create: `src/data/asteroids/eros.json`
- Modify: `src/lib/asteroids/catalog.ts`

- [ ] **Step 1: Create `src/data/asteroids/eros.json`**

Use this complete JSON:

```json
{
  "id": "eros",
  "name": "Eros",
  "designation": "433 Eros",
  "type": "Siliceous (S-type)",
  "biome": "sandy",
  "description": "A large elongated near-Earth asteroid visited by NASA's NEAR Shoemaker mission. Its stony surface is rich in olivine and pyroxene, marked by impact craters, ridges, and warm dust-toned regolith.",
  "composition": [
    { "name": "Olivine", "formula": "(Mg,Fe)2SiO4", "percentage": 34 },
    { "name": "Pyroxene", "formula": "(Mg,Fe)SiO3", "percentage": 32 },
    { "name": "Plagioclase Feldspar", "formula": "(Na,Ca)(Al,Si)4O8", "percentage": 12 },
    { "name": "Iron-Nickel Alloy", "formula": "Fe-Ni", "percentage": 10 },
    { "name": "Iron Sulfides", "formula": "FeS", "percentage": 7 },
    { "name": "Magnetite", "formula": "Fe3O4", "percentage": 5 }
  ],
  "shape": {
    "dimensions": [34400, 11200, 11200],
    "elongation": 3.07,
    "lobeCount": 1,
    "irregularity": 0.55,
    "rotationLottery": { "x": 0, "z": 0 }
  },
  "surface": {
    "craterDensity": 0.6,
    "craterMaxScale": 0.28,
    "boulderDensity": 0.35,
    "ridgeFrequency": 0.55,
    "roughness": 0.55,
    "dustCoverage": 0.35,
    "modelPath": "/models/asteroids/eros.glb",
    "modelScale": 1300,
    "surfaceTextures": "/textures/asteroids/sandy",
    "surfaceTextureRepeat": 100,
    "surfaceModulatorStrength": 0.45,
    "surfaceModulatorColorBlend": 0.15,
    "surfaceAOStrength": 1.0,
    "surfaceEmissionStrength": 1.0
  },
  "visual": {
    "albedo": 0.25,
    "baseColor": [0.62, 0.53, 0.39],
    "valleyTone": 0.45,
    "peakTone": 1.35
  },
  "physical": {
    "mass": 6.687e15,
    "density": 2670,
    "surfaceGravity": 0.006,
    "rotationPeriod": 5.27,
    "surfaceTemperature": 248
  },
  "lighting": {
    "sunAzimuth": 135,
    "sunElevation": 38,
    "sunColor": [1.0, 0.96, 0.88],
    "sunIntensity": 1.6,
    "ambientIntensity": 1.35
  }
}
```

- [ ] **Step 2: Import Eros into `src/lib/asteroids/catalog.ts`**

Add the import near the other asteroid JSON imports:

```ts
import erosData from '@/data/asteroids/eros.json'
```

Update `ASTEROID_CATALOG`:

```ts
export const ASTEROID_CATALOG: AsteroidDefinition[] = [
  bennuData,
  erosData,
  itokawaData,
  psycheData,
  xg7Data,
  kr3Data,
].map((data) => validateAsteroid(data as unknown as AsteroidDefinition))
```

- [ ] **Step 3: Run the asteroid mission test again**

Run:

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
```

Expected: still FAIL because `difficulty-map.json` and host filtering are not implemented yet.

## Task 3: Difficulty Map Data

**Files:**
- Modify: `src/data/asteroids/difficulty-map.json`

- [ ] **Step 1: Add Eros to the difficulty map**

Replace the file with:

```json
[
  { "asteroidId": "itokawa", "minDifficulty": 1, "maxDifficulty": 2 },
  { "asteroidId": "bennu", "minDifficulty": 2, "maxDifficulty": 4 },
  { "asteroidId": "eros", "minDifficulty": 2, "maxDifficulty": 4, "planetIds": ["earth", "mars"] },
  { "asteroidId": "psyche", "minDifficulty": 4, "maxDifficulty": 7 },
  { "asteroidId": "xg7", "minDifficulty": 6, "maxDifficulty": 8 },
  { "asteroidId": "kr3", "minDifficulty": 8, "maxDifficulty": 10 }
]
```

- [ ] **Step 2: Run the asteroid mission test again**

Run:

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
```

Expected: still FAIL because `planetIds` is not respected yet.

## Task 4: Host Filtering Implementation

**Files:**
- Modify: `src/lib/missions/asteroidMissionGenerator.ts`

- [ ] **Step 1: Extend the difficulty-map entry type**

Replace `DifficultyMapEntry` with:

```ts
/** Entry from the difficulty-map JSON. */
interface DifficultyMapEntry {
  asteroidId: string
  minDifficulty: number
  maxDifficulty: number
  planetIds?: string[]
}
```

- [ ] **Step 2: Add a host filter helper**

Add this helper below `DifficultyMapEntry`:

```ts
/**
 * Whether a difficulty-map entry is available for a host planet.
 *
 * Entries without `planetIds` stay globally available.
 *
 * @param entry - Candidate asteroid map entry.
 * @param hostPlanetId - Mission board planet id, when known.
 * @returns `true` when the entry can be selected for the host.
 */
function isAsteroidEntryAvailableForHost(
  entry: DifficultyMapEntry,
  hostPlanetId?: string,
): boolean {
  if (!entry.planetIds) return true
  if (!hostPlanetId) return false
  return entry.planetIds.includes(hostPlanetId)
}
```

- [ ] **Step 3: Update `pickAsteroidForDifficulty`**

Replace the existing function with:

```ts
/**
 * Pick a random asteroid template that fits the given difficulty and host planet.
 *
 * Host-specific entries only appear for listed planets. Global entries remain available
 * everywhere, and are used as a fallback if the host has no matching specific entries.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @param hostPlanetId - Optional planet id for the board posting the mission.
 * @returns Asteroid id from the catalog.
 */
export function pickAsteroidForDifficulty(difficulty: number, hostPlanetId?: string): string {
  const difficultyEntries = (difficultyMap as DifficultyMapEntry[]).filter(
    (e) => difficulty >= e.minDifficulty && difficulty <= e.maxDifficulty,
  )
  if (difficultyEntries.length === 0) {
    return (difficultyMap as DifficultyMapEntry[])[0]!.asteroidId
  }

  const hostEntries = difficultyEntries.filter((entry) =>
    isAsteroidEntryAvailableForHost(entry, hostPlanetId),
  )
  const entries =
    hostEntries.length > 0
      ? hostEntries
      : difficultyEntries.filter((entry) => !entry.planetIds)

  if (entries.length === 0) {
    return (difficultyMap as DifficultyMapEntry[])[0]!.asteroidId
  }

  return entries[Math.floor(Math.random() * entries.length)]!.asteroidId
}
```

- [ ] **Step 4: Pass the host planet from generated missions**

Replace:

```ts
const asteroidId = pickAsteroidForDifficulty(difficulty)
```

with:

```ts
const asteroidId = pickAsteroidForDifficulty(difficulty, anchor.planetId)
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
bun test:unit src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts
```

Expected: PASS.

## Task 5: Quality Gates

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS with zero oxlint errors, zero ESLint errors, and zero ESLint warnings.

- [ ] **Step 2: Run type-check**

Run:

```bash
bun run type-check
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run unit tests**

Run:

```bash
bun run test:unit
```

Expected: PASS.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git diff -- src/data/asteroids/eros.json src/lib/asteroids/catalog.ts src/data/asteroids/difficulty-map.json src/lib/missions/asteroidMissionGenerator.ts src/lib/missions/__tests__/asteroidMissionGenerator.spec.ts docs/superpowers/specs/2026-04-26-eros-asteroid-design.md docs/superpowers/plans/2026-04-26-eros-asteroid.md
```

Expected: only the Eros asteroid spec, plan, data, selector, catalog, and test changes are present.

## Self-Review

- Spec coverage: The plan adds Eros data, visual properties, model path, difficulty 2-4, Earth/Mars availability, catalog import, host-aware selection, and tests.
- Placeholder scan: No `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `planetIds?: string[]`, `pickAsteroidForDifficulty(difficulty, hostPlanetId?)`, and `anchor.planetId` are used consistently across tests and implementation.
