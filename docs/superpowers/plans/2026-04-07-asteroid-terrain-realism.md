# Asteroid Terrain Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make asteroid terrain filler read less like uniform wave noise and more like biome-aware regolith, rubble, and fractured surface while preserving existing crater, ridge, seed, and flat-zone behavior.

**Architecture:** Keep `generateTerrain()` as the single public entry point and concentrate the work in `src/lib/terrain/terrainGenerator.ts`. Preserve crater, ridge, and flat-zone passes, but replace the current always-on FBM filler with a layered system: subtle broad relief, a disturbance mask, masked medium breakup, sparse micro-breakup, and dust attenuation. Validate the new behavior with focused generator tests rather than UI-level tests.

**Tech Stack:** TypeScript, Vitest, Bun, existing `Heightmap` + `SimplexNoise` terrain utilities

---

## File Structure

**Modify:**
- `src/lib/terrain/terrainGenerator.ts`
- `src/lib/terrain/__tests__/terrainGenerator.spec.ts`
- `src/lib/asteroids/types.ts`
- `src/views/LevelViewController.ts`

**Responsibilities:**
- `src/lib/terrain/terrainGenerator.ts`
  - Keep the public generator API unchanged.
  - Add internal biome tuning and masked-relief helpers.
  - Preserve deterministic seeded generation.
- `src/lib/terrain/__tests__/terrainGenerator.spec.ts`
  - Add generator-level regression coverage for the new distribution rules.
  - Prove dust, roughness, and boulder density change the terrain in the intended direction.
- `src/lib/asteroids/types.ts`
  - Clarify TSDoc so the existing `SurfaceFeatures` fields match the new generator meaning.
- `src/views/LevelViewController.ts`
  - Thread asteroid biome into terrain generation without changing the level controller contract.

### Task 1: Lock In Terrain Behavior With Failing Tests

**Files:**
- Modify: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`
- Test: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`

- [ ] **Step 1: Add reusable terrain metrics helpers to the spec**

Add these helpers near the top of `src/lib/terrain/__tests__/terrainGenerator.spec.ts` below the surface fixtures:

```ts
function minMax(grid: Float32Array): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i]!
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

function countAboveAbs(grid: Float32Array, threshold: number): number {
  let count = 0
  for (let i = 0; i < grid.length; i++) {
    if (Math.abs(grid[i]!) > threshold) count++
  }
  return count
}

function localRoughness(grid: Float32Array, resolution: number): number {
  let sum = 0
  let samples = 0
  for (let z = 1; z < resolution - 1; z++) {
    for (let x = 1; x < resolution - 1; x++) {
      const i = z * resolution + x
      const c = grid[i]!
      const dx = Math.abs(c - grid[i + 1]!)
      const dz = Math.abs(c - grid[i + resolution]!)
      sum += dx + dz
      samples += 2
    }
  }
  return samples === 0 ? 0 : sum / samples
}
```

- [ ] **Step 2: Add a failing test proving dust suppresses local roughness more than total range**

Append this test inside the `describe('generateTerrain', ...)` block:

```ts
it('high dustCoverage suppresses local roughness while preserving macro relief', () => {
  const dusty: SurfaceFeatures = { ...ROCKY_SURFACE, dustCoverage: 0.9, roughness: 0.8 }
  const exposed: SurfaceFeatures = { ...ROCKY_SURFACE, dustCoverage: 0.05, roughness: 0.8 }

  const dustyHm = generateTerrain(dusty, { seed: 42, resolution: 96, worldSize: 1200 })
  const exposedHm = generateTerrain(exposed, { seed: 42, resolution: 96, worldSize: 1200 })

  const dustyRange = minMax(dustyHm.grid)
  const exposedRange = minMax(exposedHm.grid)
  const dustySpan = dustyRange.max - dustyRange.min
  const exposedSpan = exposedRange.max - exposedRange.min

  expect(localRoughness(dustyHm.grid, dustyHm.resolution))
    .toBeLessThan(localRoughness(exposedHm.grid, exposedHm.resolution))
  expect(dustySpan).toBeGreaterThan(exposedSpan * 0.45)
})
```

- [ ] **Step 3: Add a failing test proving boulder density creates sparse strong breakup instead of global wobble**

Append this test below the previous one:

```ts
it('higher boulderDensity increases sparse strong detail without affecting most cells', () => {
  const lowBoulders: SurfaceFeatures = { ...ROCKY_SURFACE, boulderDensity: 0.05, roughness: 0.55 }
  const highBoulders: SurfaceFeatures = { ...ROCKY_SURFACE, boulderDensity: 0.95, roughness: 0.55 }

  const low = generateTerrain(lowBoulders, { seed: 77, resolution: 96, worldSize: 1200 })
  const high = generateTerrain(highBoulders, { seed: 77, resolution: 96, worldSize: 1200 })

  expect(countAboveAbs(high.grid, 18)).toBeGreaterThan(countAboveAbs(low.grid, 18))
  expect(localRoughness(high.grid, high.resolution))
    .toBeLessThan(localRoughness(low.grid, low.resolution) * 2.5)
})
```

- [ ] **Step 4: Add a failing test proving roughness creates stronger disturbed patches, not just a global amplitude jump**

Append this test below the boulder test:

```ts
it('roughness increases disturbed-zone intensity more than calm-zone height spread', () => {
  const smooth: SurfaceFeatures = { ...ROCKY_SURFACE, roughness: 0.15, dustCoverage: 0.25 }
  const rough: SurfaceFeatures = { ...ROCKY_SURFACE, roughness: 0.9, dustCoverage: 0.25 }

  const smoothHm = generateTerrain(smooth, { seed: 99, resolution: 96, worldSize: 1200 })
  const roughHm = generateTerrain(rough, { seed: 99, resolution: 96, worldSize: 1200 })

  const smoothStrong = countAboveAbs(smoothHm.grid, 14)
  const roughStrong = countAboveAbs(roughHm.grid, 14)

  expect(roughStrong).toBeGreaterThan(smoothStrong)
  expect(localRoughness(roughHm.grid, roughHm.resolution))
    .toBeGreaterThan(localRoughness(smoothHm.grid, smoothHm.resolution))
})
```

- [ ] **Step 5: Run the focused terrain spec to verify the new assertions fail against the current formula**

Run: `bun test:unit src/lib/terrain/__tests__/terrainGenerator.spec.ts`

Expected:
- existing deterministic/crater tests still pass
- at least one of the three new tests fails because the current generator still uses uniform filler noise

- [ ] **Step 6: Commit the failing-test checkpoint**

```bash
git add src/lib/terrain/__tests__/terrainGenerator.spec.ts
git commit -m "chore: capture terrain realism goals"
```

### Task 2: Replace Uniform Filler Noise With Masked Relief

**Files:**
- Modify: `src/lib/terrain/terrainGenerator.ts`
- Modify: `src/views/LevelViewController.ts`
- Test: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`

- [ ] **Step 1: Add biome tuning types and constants near the top of `terrainGenerator.ts`**

Insert this block below the existing generation constants:

```ts
interface TerrainBiomeTuning {
  broadReliefScale: number
  disturbanceContrast: number
  disturbanceBias: number
  mediumBreakupScale: number
  microBreakupScale: number
  dustSoftening: number
}

const BROAD_RELIEF_BASE_SCALE = 14
const BROAD_RELIEF_FREQUENCY = 0.0018
const DISTURBANCE_MASK_FREQUENCY = 0.0035
const MEDIUM_BREAKUP_FREQUENCY = 0.014
const MICRO_BREAKUP_FREQUENCY = 0.045
const MICRO_BREAKUP_THRESHOLD = 0.58

const DEFAULT_BIOME_TUNING: TerrainBiomeTuning = {
  broadReliefScale: 1,
  disturbanceContrast: 1,
  disturbanceBias: 0,
  mediumBreakupScale: 1,
  microBreakupScale: 1,
  dustSoftening: 1,
}
```

- [ ] **Step 2: Add internal helpers for biome lookup, remapping, and breakup sampling**

Add these private helpers above `generateTerrain()`:

```ts
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function getBiomeTuning(biome?: string): TerrainBiomeTuning {
  switch (biome) {
    case 'sandy':
      return {
        broadReliefScale: 0.9,
        disturbanceContrast: 0.85,
        disturbanceBias: -0.08,
        mediumBreakupScale: 0.75,
        microBreakupScale: 0.55,
        dustSoftening: 1.2,
      }
    case 'rocky':
      return {
        broadReliefScale: 1,
        disturbanceContrast: 1.15,
        disturbanceBias: 0.05,
        mediumBreakupScale: 1.2,
        microBreakupScale: 1.15,
        dustSoftening: 0.9,
      }
    case 'metallic':
      return {
        broadReliefScale: 0.95,
        disturbanceContrast: 1.2,
        disturbanceBias: 0.08,
        mediumBreakupScale: 1.1,
        microBreakupScale: 1.25,
        dustSoftening: 0.8,
      }
    case 'icy':
      return {
        broadReliefScale: 1.1,
        disturbanceContrast: 0.8,
        disturbanceBias: -0.04,
        mediumBreakupScale: 0.7,
        microBreakupScale: 0.45,
        dustSoftening: 1.15,
      }
    default:
      return DEFAULT_BIOME_TUNING
  }
}

function sampleDisturbanceMask(
  noise: SimplexNoise,
  x: number,
  z: number,
  roughness: number,
  tuning: TerrainBiomeTuning,
): number {
  const raw = noise.n2(x * DISTURBANCE_MASK_FREQUENCY, z * DISTURBANCE_MASK_FREQUENCY) * 0.5 + 0.5
  const contrasted = clamp01((raw - 0.5) * tuning.disturbanceContrast + 0.5 + tuning.disturbanceBias)
  const power = 1.8 - roughness * 0.6
  return Math.pow(contrasted, power)
}
```
```ts
function sampleBreakupHeight(
  noise: SimplexNoise,
  x: number,
  z: number,
  surface: SurfaceFeatures,
  tuning: TerrainBiomeTuning,
  disturbance: number,
): number {
  const medium = noise.n2(x * MEDIUM_BREAKUP_FREQUENCY, z * MEDIUM_BREAKUP_FREQUENCY)
  const mediumAmp = 18 * surface.roughness * tuning.mediumBreakupScale

  const microMask = smoothstep(MICRO_BREAKUP_THRESHOLD, 1, disturbance)
  const micro = noise.n2(x * MICRO_BREAKUP_FREQUENCY, z * MICRO_BREAKUP_FREQUENCY)
  const microAmp = 10 * surface.boulderDensity * tuning.microBreakupScale

  const dustFactor = 1 - surface.dustCoverage * 0.85 * tuning.dustSoftening

  return medium * mediumAmp * disturbance + micro * microAmp * microMask * dustFactor
}
```

- [ ] **Step 3: Extend the public function signature to accept biome context without breaking callers**

Update the options interface and function setup:

```ts
export interface TerrainGenOptions {
  seed: number
  resolution: number
  worldSize: number
  flatZones?: FlatZone[]
  biome?: string
}
```
```ts
export function generateTerrain(surface: SurfaceFeatures, options: TerrainGenOptions): Heightmap {
  const { seed, resolution, worldSize, biome } = options
  const hm = new Heightmap(resolution, worldSize)
  const rng = seededRandom(seed)
  const noise = new SimplexNoise(seed)
  const tuning = getBiomeTuning(biome)
  const cellSize = worldSize / (resolution - 1)
```

- [ ] **Step 4: Replace the current base FBM write loop with broad relief plus masked breakup**

Replace the current “Pass 1: Multi-octave simplex noise base” loop with:

```ts
  // -------------------------------------------------------------------------
  // Pass 1: Broad support relief + masked breakup
  // -------------------------------------------------------------------------
  const broadReliefAmp =
    BROAD_RELIEF_BASE_SCALE * (0.35 + surface.roughness * 0.25) * tuning.broadReliefScale

  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const worldX = gx * cellSize
      const worldZ = gz * cellSize

      const broadRelief = fbm(
        noise,
        worldX,
        worldZ,
        BROAD_RELIEF_FREQUENCY,
        3,
        0.55,
        2.1,
      ) * broadReliefAmp

      const disturbance = sampleDisturbanceMask(
        noise,
        worldX,
        worldZ,
        surface.roughness,
        tuning,
      )

      const breakup = sampleBreakupHeight(
        noise,
        worldX,
        worldZ,
        surface,
        tuning,
        disturbance,
      )

      hm.set(gx, gz, broadRelief + breakup)
    }
  }
```

- [ ] **Step 5: Keep crater, ridge, and flat-zone passes intact, and thread biome from the level**

Preserve the current crater/ridge/flat-zone sections as-is. Then update the call site in `src/views/LevelViewController.ts` from:

```ts
: generateTerrain(asteroid.surface, {
    seed,
    resolution: TERRAIN_RESOLUTION,
    worldSize: LEVEL_GRID_SIZE,
    flatZones,
  })
```

to:

```ts
: generateTerrain(asteroid.surface, {
    seed,
    resolution: TERRAIN_RESOLUTION,
    worldSize: LEVEL_GRID_SIZE,
    flatZones,
    biome: asteroid.biome,
  })
```

- [ ] **Step 6: Run the focused terrain spec and make the new assertions pass**

Run: `bun test:unit src/lib/terrain/__tests__/terrainGenerator.spec.ts`

Expected:
- all existing tests pass
- all new realism tests pass

- [ ] **Step 7: Commit the generator rewrite**

```bash
git add src/lib/terrain/terrainGenerator.ts src/views/LevelViewController.ts src/lib/terrain/__tests__/terrainGenerator.spec.ts
git commit -m "feat: improve asteroid terrain relief"
```

### Task 3: Clarify Field Semantics And Add Regression Coverage

**Files:**
- Modify: `src/lib/asteroids/types.ts`
- Modify: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`
- Test: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`

- [ ] **Step 1: Update `SurfaceFeatures` TSDoc so the data model matches the new terrain meaning**

Replace the existing property comments in `src/lib/asteroids/types.ts` with:

```ts
export interface SurfaceFeatures {
  /** How densely packed impact craters are across the surface. */
  craterDensity: number
  /** Largest crater as a fraction of asteroid radius. 0.3 = a crater 30% of the radius. */
  craterMaxScale: number
  /** Coverage of loose boulders on the surface. Also biases sparse chunky micro-relief in terrain generation. */
  boulderDensity: number
  /** Frequency of ridges, channels, and linear features. Also lightly biases nearby fractured terrain feel. */
  ridgeFrequency: number
  /** Strength of disturbed-zone breakup. Higher values make rough patches harsher rather than making the whole map uniformly wavy. */
  roughness: number
  /** How much loose dust/regolith blankets the surface. Higher values soften sharp local relief before broader forms. */
  dustCoverage: number
}
```

- [ ] **Step 2: Add a biome-context regression test using the same surface data**

Append this test to `src/lib/terrain/__tests__/terrainGenerator.spec.ts`:

```ts
it('biome changes filler distribution without changing deterministic seeding', () => {
  const neutralA = generateTerrain(ROCKY_SURFACE, {
    seed: 11,
    resolution: 96,
    worldSize: 1200,
  })
  const neutralB = generateTerrain(ROCKY_SURFACE, {
    seed: 11,
    resolution: 96,
    worldSize: 1200,
  })
  const sandy = generateTerrain(ROCKY_SURFACE, {
    seed: 11,
    resolution: 96,
    worldSize: 1200,
    biome: 'sandy',
  })
  const rocky = generateTerrain(ROCKY_SURFACE, {
    seed: 11,
    resolution: 96,
    worldSize: 1200,
    biome: 'rocky',
  })

  expect(localRoughness(sandy.grid, sandy.resolution))
    .toBeLessThan(localRoughness(rocky.grid, rocky.resolution))
  expect(neutralA.heightAt(100, -80)).toBe(neutralB.heightAt(100, -80))
})
```

- [ ] **Step 3: Add a flat-zone regression test to confirm realism passes still respect mission pads**

Append this test below the biome test:

```ts
it('keeps flat zones usable after the new breakup passes', () => {
  const hm = generateTerrain(ROCKY_SURFACE, {
    seed: 123,
    resolution: 96,
    worldSize: 1200,
    biome: 'rocky',
    flatZones: [{ x: 0, z: 0, radius: 120 }],
  })

  const center = hm.heightAt(0, 0)
  const nearEdge = hm.heightAt(40, 35)
  const outside = hm.heightAt(180, 180)

  expect(Math.abs(center - nearEdge)).toBeLessThan(2)
  expect(Math.abs(center - outside)).toBeGreaterThan(1)
})
```

- [ ] **Step 4: Run the focused terrain tests again**

Run: `bun test:unit src/lib/terrain/__tests__/terrainGenerator.spec.ts`

Expected:
- PASS
- biome and flat-zone regressions protect the new formula from drifting back toward uniform waves

- [ ] **Step 5: Run the broader verification commands**

Run: `bun test:unit`

Expected:
- PASS
- no unrelated terrain consumers fail due to the new option shape

Run: `bun run type-check`

Expected:
- PASS
- `generateTerrain()` call sites compile with the optional `biome` property

- [ ] **Step 6: Commit the docs and regression coverage**

```bash
git add src/lib/asteroids/types.ts src/lib/terrain/__tests__/terrainGenerator.spec.ts
git commit -m "chore: document terrain surface semantics"
```

## Self-Review

### Spec Coverage

- Preserve craters and ridges: Task 2 explicitly keeps crater/ridge passes intact.
- Replace uniform filler with broad relief + disturbance mask + masked breakup + micro-breakup + dust attenuation: Task 2 implements each pass directly.
- Keep existing JSON schema: no task adds JSON fields; Task 3 only updates docs.
- Use `biome` and existing surface fields as data-driven controls: Task 2 and Task 3 cover biome + field mapping.
- Preserve deterministic generation: Task 1 and Task 3 keep deterministic checks.
- Preserve flat zones: Task 3 adds a dedicated flat-zone regression test.
- Verify on the existing test suite: Task 3 runs focused and broad verification commands.

### Placeholder Scan

No `TODO`, `TBD`, “handle appropriately”, or “similar to previous task” placeholders remain.

### Type Consistency

- `TerrainGenOptions` uses optional `biome?: string`.
- `generateTerrain(surface, options)` remains the public entry point.
- Test helpers and assertions consistently use `localRoughness`, `countAboveAbs`, and `minMax`.

