# DAN Crater Placement Implementation Plan (B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to ask the question *"for this asteroid + this mission seed, where on the surface is a usable crater bowl, and what rotation should the GLB have so that bowl ends up on the player-facing surface?"* — and get back a deterministic answer with the crater's world-space center, radius, depth, and the chosen Euler rotation.

This slice does **not** wire any of this into `LevelViewController`, does not place lander/terminal/particles/enemies, does not touch the DAN minigame, and does not touch the HUD. B2 consumes this API to stage the DAN encounter.

**Spec:** `docs/superpowers/specs/2026-04-27-dan-mission-design.md`

**Depends on:** Plan A (DAN data model). DAN concrete objectives carry no crater fields themselves — the crater specification is computed at level load from the asteroid id + mission seed + DAN tuning. Plan A does not need to be merged before this plan starts; the two are orthogonal at the file level.

---

## Architecture

The current asteroid pipeline (in `LevelViewController.ts:532` → `createAsteroidSurface()` → `bakeHeightmapFromMesh()`):

1. Load asteroid GLB.
2. Rotate the loaded scene by `rotationFromSeed(seed, asteroid.shape.rotationLottery)` (`AsteroidSurfaceController.ts:139`).
3. Bake a heightmap by raycasting straight down at each grid cell (`meshHeightmap.ts:54`). BVH-accelerated, finishes in milliseconds for a typical asteroid.

**Legacy note:** `src/lib/terrain/terrainGenerator.ts` still ships a procedural heightmap generator with `applyCrater()` for parabolic crater synthesis. **The current asteroid level pipeline does not use this generator** — heightmaps are baked from real GLB geometry. The procedural path remains useful for one thing: parabolic crater synthesis applied to an already-baked heightmap when no natural depression is suitable. This plan lifts that math into a reusable utility.

**Two primitives this plan delivers:**

1. **Crater detection** — pure function that scans any baked `Heightmap` for bowl-shaped local minima and returns them as queryable metadata.
2. **Crater synthesis** — pure function that overlays a parabolic crater bowl onto an existing `Heightmap` at a requested world-space center and radius. Lifted from the legacy `applyCrater()` math; works on baked heightmaps, not just procedural ones.

**One orchestrator:**

3. **DAN crater placement** — given an asteroid definition, mission seed, and DAN crater spec (target radius, minimum depth), tries multiple seed-derived rotations of the GLB, bakes a heightmap for each, scans for natural craters, scores candidates, and returns either the best natural crater + its rotation OR a synthesis spec + the seed default rotation as a fallback. The fallback synthesis happens against the heightmap that the level layer eventually bakes — this plan returns the *spec*, B2 applies it.

Why multi-bake is acceptable: `bakeHeightmapFromMesh` is BVH-accelerated and runs in single-digit milliseconds for a typical asteroid. Eight candidate rotations adds ~50–80ms to level boot — negligible relative to GLB load time.

---

## Acceptance Criteria

- `findCratersInHeightmap(heightmap, options)` is pure, returns `Crater[]` (each with world-space `x`, `z`, `radius`, `depth`), and reliably finds known-shape bowls in synthetic test heightmaps.
- `applyCraterToHeightmap(heightmap, options)` is pure, mutates the heightmap's grid in place to add a parabolic bowl with raised rim, matching the depth/rim ratios already used by `terrainGenerator.applyCrater()`.
- `chooseDanCraterPlacement(asteroid, seed, spec)` is async (it loads the GLB), returns `{ rotation, crater, source }` where `source ∈ 'natural' | 'synthesized'`. For the same `(asteroid, seed, spec)` it returns the same result every call.
- The orchestrator never throws on a normal asteroid — synthesis fallback always produces a valid result.
- All existing terrain and asteroid tests pass unchanged. No regression in level boot for non-DAN missions because no caller of these new APIs is added in this slice.
- `bun run type-check`, `bun run lint`, `bun test:unit` all pass.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/terrain/craterDetection.ts` | NEW | Pure heightmap scan for bowl-shaped depressions |
| `src/lib/terrain/craterSynthesis.ts` | NEW | Apply parabolic crater bowl to an existing heightmap |
| `src/lib/level/danCraterPlacement.ts` | NEW | Orchestrator: rotation search + crater scoring + synthesis fallback |
| `src/lib/terrain/__tests__/craterDetection.spec.ts` | NEW | Unit tests against synthetic heightmaps |
| `src/lib/terrain/__tests__/craterSynthesis.spec.ts` | NEW | Unit tests against blank heightmaps |
| `src/lib/level/__tests__/danCraterPlacement.spec.ts` | NEW | Determinism test + synthesis-fallback test |
| `src/lib/terrain/terrainGenerator.ts` | Reference only | Source of truth for the parabolic crater math we are lifting |
| `src/three/AsteroidSurfaceController.ts` | Reference only | Reference for how the bake pipeline is invoked |
| `src/lib/terrain/meshHeightmap.ts` | Reference only | Reference for how raycast bake works |
| `src/views/LevelViewController.ts` | NOT modified | B2 wires the orchestrator in |

---

## Task 1: Crater Detection Utility

- [ ] **Step 1: Define the `Crater` type**

In `src/lib/terrain/craterDetection.ts`, with the standard file-level TSDoc header:

```ts
/** A bowl-shaped depression detected on or applied to a heightmap, in world-space coordinates. */
export interface Crater {
  /** World-space X of the bowl center. */
  x: number
  /** World-space Z of the bowl center. */
  z: number
  /** Approximate bowl radius in world units (rim outer is roughly 1.4× this). */
  radius: number
  /** Approximate bowl depth in world units (positive number; floor is `rimHeight - depth` below local plane). */
  depth: number
}
```

- [ ] **Step 2: Define detection options**

```ts
/** Tunable thresholds for `findCratersInHeightmap`. */
export interface FindCratersOptions {
  /** Minimum bowl radius in world units to count as a crater. Filters out noise. */
  minRadius: number
  /** Minimum bowl depth in world units. Filters out shallow dips. */
  minDepth: number
  /** Maximum craters to return. Returned in descending quality order. Default 16. */
  maxResults?: number
  /**
   * Optional restriction to a sub-region of the heightmap. When set, only craters whose
   * centers fall inside this rectangle are returned. World-space coordinates.
   */
  region?: { minX: number; maxX: number; minZ: number; maxZ: number }
}
```

- [ ] **Step 3: Implement `findCratersInHeightmap`**

```ts
export function findCratersInHeightmap(heightmap: Heightmap, options: FindCratersOptions): Crater[]
```

Algorithm (the implementing agent may refine; the contract is the test cases):

1. **Local minima sweep.** For each interior valid grid cell, compare its height against neighbors in a window of `cellsForRadius(minRadius)`. A cell is a candidate if it is the lowest in its window and surrounded by higher terrain in at least the four cardinal directions.
2. **Bowl-fit estimation.** For each candidate, walk outward in concentric rings until the height stops descending (or starts rising past a threshold). The radius of the last descending ring is the estimated bowl radius. The height delta from center to that ring is the estimated depth.
3. **Filter.** Drop candidates with `radius < minRadius`, `depth < minDepth`, or center outside `region` if provided. Drop candidates whose ring walk hit invalid (void) cells before reaching `minRadius`.
4. **Score and sort.** Quality score = `depth × radius` (rewards large, deep bowls). Sort descending. Return up to `maxResults`.

The function must:
- Treat invalid (validity = 0) cells as opaque — never include them in a bowl's interior.
- Be deterministic for a given heightmap input.
- Run in `O(resolution²)` time.

- [ ] **Step 4: Add unit tests**

`src/lib/terrain/__tests__/craterDetection.spec.ts`:

- Empty heightmap (all zeros) returns no craters.
- Heightmap with a single synthesized bowl (use the synthesis utility from Task 2 — these tests can run after Task 2) returns exactly one crater whose center is within 1 cell of the synthesis center and whose `radius` and `depth` are within 25% of the synthesized values.
- Heightmap with two well-separated bowls returns two craters in descending quality order.
- Heightmap with a single bowl that is shallower than `minDepth` returns no craters.
- Heightmap with all cells marked invalid returns no craters.
- Region filter excludes craters whose center is outside the rectangle.

Use small heightmaps (e.g. 64×64, worldSize 200) to keep tests fast.

---

## Task 2: Crater Synthesis Utility

- [ ] **Step 1: Define synthesis options**

In `src/lib/terrain/craterSynthesis.ts`:

```ts
/** Inputs for `applyCraterToHeightmap`. World-space coordinates. */
export interface ApplyCraterOptions {
  /** World-space X of the bowl center. */
  x: number
  /** World-space Z of the bowl center. */
  z: number
  /** Bowl radius in world units. */
  radius: number
  /** Bowl depth in world units (positive number). Defaults to `radius * 0.6` if omitted. */
  depth?: number
}
```

- [ ] **Step 2: Lift the parabolic crater math**

Reference: `src/lib/terrain/terrainGenerator.ts` lines 51–60 (constants) and 317–357 (`applyCrater()`).

Constants stay aligned with the legacy ones — copy them into `craterSynthesis.ts` and export:

```ts
/** Rim height as a fraction of bowl depth. Matches legacy terrain generator. */
export const CRATER_RIM_HEIGHT_RATIO = 0.35
/** Outer rim band as a multiple of crater radius. Matches legacy terrain generator. */
export const CRATER_RIM_EXTENT = 1.4
/** Default depth-to-radius ratio when caller omits explicit depth. */
export const DEFAULT_CRATER_DEPTH_RATIO = 0.6
```

- [ ] **Step 3: Implement `applyCraterToHeightmap`**

```ts
export function applyCraterToHeightmap(heightmap: Heightmap, options: ApplyCraterOptions): Crater
```

Behavior:

- Convert the world-space center to grid coordinates using `heightmap.worldSize` and `heightmap.resolution`.
- Run the same parabolic-bowl + rim-band loop from the legacy `applyCrater()`, mutating `heightmap.grid` in place.
- Skip cells whose validity is 0 (do not deepen void cells).
- Return the `Crater` describing what was applied (echoes inputs, depth defaulted if omitted).

This function is a heightmap-domain operation. It does **not** know about asteroid GLBs, rotations, or DAN — pure geometry mutation.

- [ ] **Step 4: Optionally remove the duplicate from `terrainGenerator.ts`**

If lifting the math leaves `terrainGenerator.applyCrater` as a thin internal helper, leave it alone — the legacy path still uses it. Do not refactor the legacy generator in this slice. Two implementations of the same parabolic bowl is acceptable while the legacy path is still alive.

- [ ] **Step 5: Add unit tests**

`src/lib/terrain/__tests__/craterSynthesis.spec.ts`:

- Applying a crater to a flat zero heightmap then sampling the center returns approximately `-depth`.
- Sampling at `radius` distance from center returns approximately `0` (parabolic curve hits baseline at the edge).
- Sampling at `radius * 1.2` returns a positive value (raised rim).
- Sampling at `radius * 2` returns approximately `0` (outside rim band).
- Applying the same crater twice doubles the depression at center.
- Applying a crater whose center is outside the heightmap is a no-op (no errors thrown).
- Cells marked invalid before synthesis remain at their original value.

---

## Task 3: DAN Crater Placement Orchestrator

- [ ] **Step 1: Define the public API**

In `src/lib/level/danCraterPlacement.ts`:

```ts
/** Tuning knobs for the DAN crater chooser. */
export interface DanCraterSpec {
  /** Target bowl radius in world units. Natural craters within ±50% pass the size match. */
  targetRadius: number
  /** Minimum acceptable bowl depth for natural craters. Below this, prefer synthesis. */
  minDepth: number
  /**
   * Quality threshold a natural crater must clear before being chosen over synthesis.
   * Score = `depth * radius`. Tunable; suggested starting point in implementation notes below.
   */
  minQualityScore: number
  /** Number of rotation candidates to bake and scan. Defaults to 8. */
  candidateRotationCount?: number
}

/** Where the chosen DAN crater came from. */
export type DanCraterSource = 'natural' | 'synthesized'

/** Result of the DAN crater placement orchestrator. */
export interface DanCraterPlacement {
  /** Euler rotation to apply when calling `createAsteroidSurface`. */
  rotation: { x: number; y: number; z: number }
  /** World-space crater the DAN encounter should center on. */
  crater: Crater
  /** Whether the crater was found in the GLB or must be synthesized post-bake. */
  source: DanCraterSource
}
```

- [ ] **Step 2: Implement candidate rotation generation**

A small helper inside `danCraterPlacement.ts`:

```ts
/**
 * Derive N rotation candidates from a mission seed. The first candidate is always
 * `rotationFromSeed(seed, lottery)` so a missing-natural-crater fallback uses the
 * same orientation a non-DAN mission would have used.
 */
function deriveCandidateRotations(
  seed: number,
  lottery: RotationLottery | undefined,
  count: number,
): Array<{ x: number; y: number; z: number }>
```

Implementation suggestion: candidate 0 is `rotationFromSeed(seed, lottery)`. Candidates 1..N−1 perturb each axis by `(2π × i) / N` modulo `2π`, respecting any axis locks in `lottery` so elongated bodies (Itokawa-style) keep their long axis horizontal across all candidates. Document the rationale in TSDoc.

- [ ] **Step 3: Implement the orchestrator**

```ts
export async function chooseDanCraterPlacement(
  asteroid: AsteroidDefinition,
  seed: number,
  spec: DanCraterSpec,
  bakeOptions: BakeHeightmapFromMeshOptions,
): Promise<DanCraterPlacement>
```

Algorithm:

1. Load the GLB once: `const scene = await loadGLB(asteroid.surface.modelPath)`. Apply scale.
2. For each candidate rotation:
   a. Set `scene.rotation.set(...)` from the candidate.
   b. Call `scene.updateMatrixWorld(true)`.
   c. `const hm = bakeHeightmapFromMesh(scene, bakeOptions)`.
   d. `const craters = findCratersInHeightmap(hm, { minRadius: spec.targetRadius * 0.5, minDepth: spec.minDepth, maxResults: 4 })`.
   e. Score each crater: `quality = c.depth * c.radius * sizeMatchFactor(c.radius, spec.targetRadius)` where `sizeMatchFactor` peaks at 1 when `c.radius === spec.targetRadius` and decays toward 0 as it diverges. The implementing agent may use a simple triangular falloff: `1 - clamp(abs(c.radius - target) / target, 0, 1)`.
   f. Track the best `(rotation, crater, score)` tuple seen so far.
3. After all candidates have been baked: if `bestScore >= spec.minQualityScore`, return `{ rotation: bestRotation, crater: bestCrater, source: 'natural' }`.
4. Otherwise: return `{ rotation: deriveCandidateRotations(seed, lottery, 1)[0], crater: { x: 0, z: 0, radius: spec.targetRadius, depth: spec.targetRadius * DEFAULT_CRATER_DEPTH_RATIO }, source: 'synthesized' }`. The synthesis fallback always centers the crater at world XZ origin (the asteroid's barycenter, where the lander already parks per `LevelViewController.ts:570`).
5. Dispose of the GLB scene afterward to avoid leaking GPU resources.

The function is async because of the GLB load. The level layer can `await` it in parallel with other startup work.

**Implementation notes for the agent:**

- Reuse `bakeHeightmapFromMesh` directly. The BVH cache built on first bake is reused across rotation changes because `three-mesh-bvh` attaches its tree to the geometry, not the world transform.
- Calling `scene.updateMatrixWorld(true)` before each bake is required so the raycast sees the new world-space triangle positions.
- The bake is fast (single-digit ms) but not free. Default `candidateRotationCount = 8` keeps total cost under ~80ms on typical hardware. The implementing agent may bench and adjust.

- [ ] **Step 4: Suggested initial tuning constants**

Document at the top of the file as exported constants:

```ts
/** Default DAN crater target radius in world units. Sized for the lander + EVA combat space. */
export const DEFAULT_DAN_CRATER_RADIUS = 60
/** Default minimum depth for a natural crater to qualify (world units). */
export const DEFAULT_DAN_CRATER_MIN_DEPTH = 8
/** Default quality threshold: natural craters below this score lose to synthesis fallback. */
export const DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE = 600
/** Default number of rotation candidates to try. */
export const DEFAULT_DAN_CRATER_ROTATION_CANDIDATES = 8
```

These are first-cut numbers. B2 may tune them when the encounter is playable. The implementing agent should expose them via `DanCraterSpec` defaults so the level layer can override per mission.

---

## Task 4: Orchestrator Tests

- [ ] **Step 1: Determinism test**

`src/lib/level/__tests__/danCraterPlacement.spec.ts`:

```ts
it('returns the same placement for the same (asteroid, seed, spec)', async () => {
  const asteroid = getAsteroidById('bennu')! // or any asteroid known to load in tests
  const spec: DanCraterSpec = {
    targetRadius: DEFAULT_DAN_CRATER_RADIUS,
    minDepth: DEFAULT_DAN_CRATER_MIN_DEPTH,
    minQualityScore: DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE,
  }
  const bakeOpts: BakeHeightmapFromMeshOptions = {
    resolution: 64,
    worldSize: 800,
    rayStartAltitude: 1000,
  }

  const a = await chooseDanCraterPlacement(asteroid, 12345, spec, bakeOpts)
  const b = await chooseDanCraterPlacement(asteroid, 12345, spec, bakeOpts)

  expect(a.rotation).toEqual(b.rotation)
  expect(a.crater).toEqual(b.crater)
  expect(a.source).toBe(b.source)
})
```

Note: this test loads a real GLB. If the test environment cannot load GLBs (JSDOM + missing GL context), gate the test with a `describe.skipIf(...)` and document that the orchestrator is exercised at runtime. The implementing agent should report whether GLB load works in the test env before deciding.

- [ ] **Step 2: Synthesis-fallback test**

```ts
it('returns synthesis fallback when minQualityScore is unreachable', async () => {
  const asteroid = getAsteroidById('bennu')!
  const spec: DanCraterSpec = {
    targetRadius: DEFAULT_DAN_CRATER_RADIUS,
    minDepth: DEFAULT_DAN_CRATER_MIN_DEPTH,
    minQualityScore: Number.POSITIVE_INFINITY,
  }
  const bakeOpts: BakeHeightmapFromMeshOptions = {
    resolution: 64,
    worldSize: 800,
    rayStartAltitude: 1000,
  }

  const result = await chooseDanCraterPlacement(asteroid, 12345, spec, bakeOpts)

  expect(result.source).toBe('synthesized')
  expect(result.crater.x).toBe(0)
  expect(result.crater.z).toBe(0)
  expect(result.crater.radius).toBe(DEFAULT_DAN_CRATER_RADIUS)
})
```

- [ ] **Step 3: Rotation candidate generation test**

Pure unit test for `deriveCandidateRotations` (export it for testing or use a re-export pattern):

- Returns the requested count.
- First entry equals `rotationFromSeed(seed, lottery)`.
- Respects axis locks in the lottery (locked axes remain locked across all candidates).
- Same seed + lottery + count produces the same array.

If the test environment can't load GLBs, this pure test is the primary correctness signal for the orchestrator. The synthesis-fallback path can also be tested by mocking `bakeHeightmapFromMesh` to return a flat heightmap (no craters detectable → fallback fires).

---

## Task 5: Verify

- [ ] **Step 1: Run the new test files**

```bash
bun test:unit src/lib/terrain/__tests__/craterDetection.spec.ts
bun test:unit src/lib/terrain/__tests__/craterSynthesis.spec.ts
bun test:unit src/lib/level/__tests__/danCraterPlacement.spec.ts
```

All pass. If the orchestrator tests are GLB-dependent and the test env doesn't support GLB load, they should be cleanly skipped with a documented reason — not silently passing.

- [ ] **Step 2: Run full terrain + level test sweep**

```bash
bun test:unit src/lib/terrain/
bun test:unit src/lib/level/
```

No regressions in existing tests. Pay attention to any test that uses `terrainGenerator.applyCrater` directly — it stays untouched in this slice.

- [ ] **Step 3: Run type-check and lint**

```bash
bun run type-check
bun run lint
```

Zero errors, zero warnings. Every new export has TSDoc.

- [ ] **Step 4: Boot a non-DAN level manually**

Open `/level` with a non-DAN mission (any photometry, gather, or bunker contract). Confirm boot time is unchanged and no asteroid surface regression — this slice adds new modules but does not call them anywhere yet.

---

## Out Of Scope For This Slice

The following are deliberately deferred to B2:

- Wiring `chooseDanCraterPlacement` into `LevelViewController` (B2 does this only when the active objective is `dan`).
- Re-baking or re-generating the heightmap with the chosen rotation (B2 calls `createAsteroidSurface` with the returned rotation).
- Applying the synthesis fallback to the heightmap (B2 calls `applyCraterToHeightmap` after the level's heightmap is baked when `source === 'synthesized'`).
- Placing the lander, terminal, particles, or enemies (B2 owns scene placement using the returned crater coordinates).
- Tuning the crater radius / quality score / candidate count for actual gameplay (B2 will iterate after the encounter is playable).

---

## Follow-Up Slice (B2)

Plan B2 will:

- Add `src/lib/minigame/DanMinigame.ts` mirroring `PhotometryMinigame.ts`.
- Add `src/three/DanScanController.ts` for particles, beam, completion pulse.
- In `LevelViewController.ts`: detect `dan` objective, call `chooseDanCraterPlacement` before `createAsteroidSurface`, pass returned rotation through, apply synthesis fallback to the baked heightmap when `source === 'synthesized'`, place lander + terminal at crater center.
- Wire `DanMinigame` through `LevelMinigameFacade`, `LevelTelemetryFacade`, `LanderHud.vue` using the same hooks photometry uses today.
- Register DAN particles with `ProjectileSystem` so SCI bolts capture them via the same registry pattern as mineable rocks.
- Introduce partial-credit reward path on `ConcreteObjective` (`rewardMin` field + quality arg on `onComplete`).
