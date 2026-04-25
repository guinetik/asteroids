# Mesh-Backed Asteroid Terrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the procedurally-generated flat heightmap terrain in `/level` with a GLB asteroid model, so missions feel like they're on an actual asteroid with edges you can fall off, not a "flying carpet" of rocks.

**Architecture:** Preserve the existing `Heightmap` / `CollisionWorld` interface so nothing downstream (FPS movement, enemies, lander physics, minigames, rock distribution) needs rewriting. Add a `bakeHeightmapFromMesh` utility that raycasts downward at each grid cell into a loaded asteroid GLB and stores the hit height. Mark grid cells where the ray missed as "invalid" — the rock distributor skips them, and a new player-adrift check fails the mission when the player walks over the edge (mirroring the existing lander-adrift logic). The GLB itself is rendered instead of the old procedural `TerrainMesh`.

**Tech Stack:** Three.js `Raycaster`, existing `Heightmap` + `CollisionWorld` plumbing, Vite `?raw`-free (just GLB loading via existing `loadGLB`), Vitest + JSDOM.

**Out of scope for this plan (follow-ups):**
- Random per-mission orientation of the asteroid GLB
- Kubrick-style cinematic camera beats in the arrival sequence (structural timing fixed here, cinematography later)
- Custom shaders / per-biome material swapping on the GLB
- Bake-time asteroid-face selection (pick the flattest face automatically)

---

## File Structure

**New files:**
- `src/lib/terrain/meshHeightmap.ts` — raycast-based bake helper (`bakeHeightmapFromMesh`)
- `src/lib/terrain/__tests__/meshHeightmap.spec.ts` — unit tests using Three.js math only
- `src/three/AsteroidSurfaceController.ts` — loads a GLB, bakes its heightmap, exposes both render group and collision heightmap

**Modified files:**
- `src/lib/terrain/heightmap.ts` — add `validity: Uint8Array`, `setValid/isValid` accessors, `OFF_SURFACE_HEIGHT` sentinel
- `src/lib/terrain/__tests__/heightmap.spec.ts` — add validity tests
- `src/lib/terrain/asteroidRockDistribution.ts` — accept `isValidGround` predicate, reject invalid cells
- `src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts` — add invalid-cell rejection test
- `src/views/LevelViewController.ts` — instantiate `AsteroidSurfaceController` instead of `generateTerrain` + `TerrainMesh`, add `isPlayerAdrift` check, pass `isValidGround` to rock distribution
- `src/three/ArrivalSequence.ts` — make approach altitude + park altitude relative to landing-point Y, not absolute
- `src/lib/asteroids/types.ts` — add optional `surface.modelPath` field
- Asteroid JSONs under `src/data/asteroids/*.json` — set `surface.modelPath` (default `/models/asteroid.glb`)

**Unchanged (verified no-op):**
- `src/lib/physics/worldCollision.ts` — consumes `Heightmap.heightAt/normalAt/slopeAt` through the same interface
- `src/three/controllers/SurfaceRockController.ts` — consumes the distribution output
- `src/lib/minigame/ExterminateMinigame.ts` / `RescueMinigame.ts` — consume `heightmap.heightAt`
- `src/lib/fps/*` — enemy simulation reads `heightAt`
- `src/three/LanderController.ts` — collision via `CollisionWorld`

---

## Task 1: Heightmap validity tracking

Add a parallel `Uint8Array` to `Heightmap` that marks which grid cells came from a real surface hit vs. a "ray missed the mesh" void. Existing procedural terrain paths will initialize all cells to valid (preserving current behavior).

**Files:**
- Modify: `src/lib/terrain/heightmap.ts`
- Test: `src/lib/terrain/__tests__/heightmap.spec.ts`

- [ ] **Step 1: Write failing test for validity tracking**

Add at the end of `src/lib/terrain/__tests__/heightmap.spec.ts`:

```ts
  describe('validity tracking', () => {
    it('defaults all cells to valid so procedural terrain paths are unaffected', () => {
      const hm = new Heightmap(4, 100)
      expect(hm.isValid(0, 0)).toBe(true)
      expect(hm.isValid(3, 3)).toBe(true)
      expect(hm.isValidAt(0, 0)).toBe(true)
    })

    it('marks cells invalid via setValid and reports them via isValid', () => {
      const hm = new Heightmap(4, 100)
      hm.setValid(1, 2, false)
      expect(hm.isValid(1, 2)).toBe(false)
      expect(hm.isValid(0, 0)).toBe(true)
    })

    it('isValidAt maps world coords to the nearest cell', () => {
      const hm = new Heightmap(4, 100)
      hm.setValid(0, 0, false)
      // worldSize 100 centred at 0, resolution 4 → cell at (0,0) covers roughly (-50,-50)..(-16.67,-16.67)
      expect(hm.isValidAt(-40, -40)).toBe(false)
      expect(hm.isValidAt(40, 40)).toBe(true)
    })

    it('out-of-bounds isValidAt returns false', () => {
      const hm = new Heightmap(4, 100)
      expect(hm.isValidAt(9999, 9999)).toBe(false)
    })
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/terrain/__tests__/heightmap.spec.ts`
Expected: FAIL — `isValid is not a function` / `setValid is not a function` / `isValidAt is not a function`.

- [ ] **Step 3: Add validity tracking to `Heightmap`**

Edit `src/lib/terrain/heightmap.ts`. After the existing `grid` field, add:

```ts
  /** Per-cell validity (1 = surface hit, 0 = void). Index: validity[gz * resolution + gx]. */
  readonly validity: Uint8Array
```

In the constructor, after `this.grid = new Float32Array(...)`:

```ts
    this.validity = new Uint8Array(resolution * resolution)
    this.validity.fill(1)
```

Add these methods after `get`:

```ts
  /** Mark a grid cell as valid (surface hit) or invalid (void). */
  setValid(gx: number, gz: number, valid: boolean): void {
    if (gx < 0 || gx >= this.resolution || gz < 0 || gz >= this.resolution) return
    this.validity[gz * this.resolution + gx] = valid ? 1 : 0
  }

  /** Whether the given grid cell represents real surface. */
  isValid(gx: number, gz: number): boolean {
    if (gx < 0 || gx >= this.resolution || gz < 0 || gz >= this.resolution) return false
    return this.validity[gz * this.resolution + gx] === 1
  }

  /** Whether the given world coordinate falls inside a valid surface cell. */
  isValidAt(x: number, z: number): boolean {
    const half = this.worldSize / 2
    const gx = ((x + half) / this.worldSize) * (this.resolution - 1)
    const gz = ((z + half) / this.worldSize) * (this.resolution - 1)
    const ix = Math.round(gx)
    const iz = Math.round(gz)
    return this.isValid(ix, iz)
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/terrain/__tests__/heightmap.spec.ts`
Expected: PASS (all validity tests + existing ones green).

- [ ] **Step 5: Add TSDoc on the new public API**

Add a file-level `@spec` pointing to this plan on the new methods. Ensure ESLint's `jsdoc/require-jsdoc` stays clean:

```
/**
 * Brief description of what this module does.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
```

(Check if the file already has a header; if so, leave it. Otherwise add one.)

- [ ] **Step 6: Run the full merge-ready check**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all three green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/terrain/heightmap.ts src/lib/terrain/__tests__/heightmap.spec.ts
git commit -m "feat(terrain): add per-cell validity tracking to Heightmap"
```

---

## Task 2: `bakeHeightmapFromMesh` utility

Raycast downward at each grid cell into a Three.js mesh, write hit height into a `Heightmap`, mark misses invalid. This is the core of the mesh-backed terrain.

**Files:**
- Create: `src/lib/terrain/meshHeightmap.ts`
- Test: `src/lib/terrain/__tests__/meshHeightmap.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/terrain/__tests__/meshHeightmap.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { bakeHeightmapFromMesh, OFF_SURFACE_HEIGHT } from '../meshHeightmap'

function buildFlatPlaneMesh(size: number, elevation: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1)
  geo.rotateX(-Math.PI / 2) // face +Y
  geo.translate(0, elevation, 0)
  return new THREE.Mesh(geo)
}

/** Build a small disc (radius `r`) at `elevation`, centred at origin, facing +Y. */
function buildDiscMesh(radius: number, elevation: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 64)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, elevation, 0)
  return new THREE.Mesh(geo)
}

describe('bakeHeightmapFromMesh', () => {
  it('records hit heights at every grid cell when the mesh covers the world', () => {
    const mesh = buildFlatPlaneMesh(100, 5)
    const hm = bakeHeightmapFromMesh(mesh, {
      resolution: 16,
      worldSize: 100,
      rayStartAltitude: 50,
    })
    // Every cell should be valid and at height 5
    for (let gz = 0; gz < 16; gz++) {
      for (let gx = 0; gx < 16; gx++) {
        expect(hm.isValid(gx, gz)).toBe(true)
        expect(hm.get(gx, gz)).toBeCloseTo(5, 3)
      }
    }
  })

  it('marks off-mesh cells invalid and writes the sentinel height', () => {
    // Disc radius 20 at elevation 0 inside a world of size 100 — corners miss the disc.
    const mesh = buildDiscMesh(20, 0)
    const hm = bakeHeightmapFromMesh(mesh, {
      resolution: 16,
      worldSize: 100,
      rayStartAltitude: 50,
    })
    // Centre cell should be valid
    expect(hm.isValidAt(0, 0)).toBe(true)
    // Corner should be off-surface
    expect(hm.isValidAt(-48, -48)).toBe(false)
    expect(hm.heightAt(-48, -48)).toBeLessThanOrEqual(OFF_SURFACE_HEIGHT)
  })

  it('is deterministic (pure function of mesh + options)', () => {
    const mesh = buildFlatPlaneMesh(100, 3)
    const a = bakeHeightmapFromMesh(mesh, { resolution: 8, worldSize: 100, rayStartAltitude: 50 })
    const b = bakeHeightmapFromMesh(mesh, { resolution: 8, worldSize: 100, rayStartAltitude: 50 })
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
    expect(Array.from(a.validity)).toEqual(Array.from(b.validity))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/terrain/__tests__/meshHeightmap.spec.ts`
Expected: FAIL — `Cannot find module '../meshHeightmap'`.

- [ ] **Step 3: Implement `meshHeightmap.ts`**

Create `src/lib/terrain/meshHeightmap.ts`:

```ts
/**
 * Bake a Heightmap from a Three.js mesh by casting rays straight down at each grid cell.
 * Cells whose rays don't hit the mesh are marked invalid and set to OFF_SURFACE_HEIGHT.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { Heightmap } from './heightmap'

/** Sentinel Y value written to cells where the bake ray missed the mesh. */
export const OFF_SURFACE_HEIGHT = -1e4

/** Options controlling how a mesh is sampled into a heightmap. */
export interface BakeHeightmapFromMeshOptions {
  /** Grid resolution (cells per axis). Higher = sharper, slower. */
  resolution: number
  /** World-space extent of the heightmap, centred at origin. */
  worldSize: number
  /** Y altitude each downward ray starts from. Must be above the mesh's highest point. */
  rayStartAltitude: number
}

/**
 * Bake a heightmap by raycasting downward at each grid cell.
 *
 * @param mesh - Asteroid mesh to sample. Must have computed bounding volumes (usually already true from glTF loaders).
 * @param options - Resolution, world extent, and ray start altitude.
 * @returns A fully-populated Heightmap with per-cell validity flags.
 */
export function bakeHeightmapFromMesh(
  mesh: THREE.Object3D,
  options: BakeHeightmapFromMeshOptions,
): Heightmap {
  const { resolution, worldSize, rayStartAltitude } = options
  const hm = new Heightmap(resolution, worldSize)
  const raycaster = new THREE.Raycaster()
  raycaster.firstHitOnly = true // harmless when BVH isn't attached
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()
  const half = worldSize / 2
  const step = worldSize / (resolution - 1)

  for (let gz = 0; gz < resolution; gz++) {
    const z = -half + gz * step
    for (let gx = 0; gx < resolution; gx++) {
      const x = -half + gx * step
      origin.set(x, rayStartAltitude, z)
      raycaster.set(origin, down)
      const hits = raycaster.intersectObject(mesh, true)
      const first = hits[0]
      if (!first) {
        hm.set(gx, gz, OFF_SURFACE_HEIGHT)
        hm.setValid(gx, gz, false)
        continue
      }
      hm.set(gx, gz, first.point.y)
      hm.setValid(gx, gz, true)
    }
  }

  return hm
}
```

Note: `Raycaster.firstHitOnly` is a hint respected by `three-mesh-bvh` if present; harmless otherwise.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/terrain/__tests__/meshHeightmap.spec.ts`
Expected: PASS (all three tests).

- [ ] **Step 5: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/terrain/meshHeightmap.ts src/lib/terrain/__tests__/meshHeightmap.spec.ts
git commit -m "feat(terrain): bakeHeightmapFromMesh via raycast sampling"
```

---

## Task 3: Rock distribution respects surface validity

Rocks should not spawn on off-surface (void) cells. Add an optional `isValidGround` predicate to the rock distribution API and reject invalid samples.

**Files:**
- Modify: `src/lib/terrain/asteroidRockDistribution.ts`
- Test: `src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts`:

```ts
  it('rejects rocks whose position is off-surface', () => {
    // Treat positive-X half of the world as off-surface.
    const rocks = generateAsteroidRockDistribution({
      seed: 13,
      worldSize: 8000,
      surface: SURFACE,
      isValidGround: (x) => x <= 0,
    })
    expect(rocks.length).toBeGreaterThan(0)
    for (const rock of rocks) {
      expect(rock.x).toBeLessThanOrEqual(0)
    }
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test:unit src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts`
Expected: FAIL — rocks spawn with `x > 0` because `isValidGround` is ignored.

- [ ] **Step 3: Extend the options type + rejection loop**

Edit `src/lib/terrain/asteroidRockDistribution.ts`.

Replace the `AsteroidRockDistributionOptions` interface:

```ts
export interface AsteroidRockDistributionOptions {
  seed: number
  worldSize: number
  surface: SurfaceFeatures
  exclusions?: readonly RockExclusionZone[]
  slopeAt?: (x: number, z: number) => number
  /**
   * Whether the given world coordinate is on real surface. When provided, rocks
   * sampled to an invalid cell are rejected before any other check — ensures
   * mesh-backed asteroid terrain doesn't spawn rocks floating in the void.
   */
  isValidGround?: (x: number, z: number) => boolean
}
```

In `generateAsteroidRockDistribution`, destructure the new option:

```ts
  const { seed, worldSize, surface, slopeAt, isValidGround } = options
```

Immediately after the `(x, z)` sample in the placement loop (before the `slopeAt` check), add:

```ts
    if (isValidGround && !isValidGround(x, z)) continue
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test:unit src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts`
Expected: PASS (all tests, including the new rejection one).

- [ ] **Step 5: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/terrain/asteroidRockDistribution.ts src/lib/terrain/__tests__/asteroidRockDistribution.spec.ts
git commit -m "feat(terrain): skip rocks on off-surface cells via isValidGround"
```

---

## Task 4: `AsteroidSurfaceController` (loads GLB, owns bake)

Wraps the GLB load + heightmap bake into a single controller that the level scene can swap in place of the procedural terrain + mesh. Three.js layer, no unit tests per project convention.

**Files:**
- Create: `src/three/AsteroidSurfaceController.ts`

- [ ] **Step 1: Create the controller**

Create `src/three/AsteroidSurfaceController.ts`:

```ts
/**
 * GLB-backed asteroid surface. Loads a model, bakes a collision heightmap from
 * its geometry via downward raycasting, and exposes both the render group and
 * the baked heightmap. Replaces the procedural TerrainMesh + generateTerrain
 * pair for the level scene.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/superpowers/plans/2026-04-23-mesh-asteroid-terrain.md
 */
import * as THREE from 'three'
import { loadGLB } from './loadGLB'
import {
  bakeHeightmapFromMesh,
  type BakeHeightmapFromMeshOptions,
} from '@/lib/terrain/meshHeightmap'
import type { Heightmap } from '@/lib/terrain/heightmap'

/** Public URL path for the default asteroid mesh. */
export const DEFAULT_ASTEROID_MODEL_PATH = '/models/asteroid.glb'

/** Options for constructing an {@link AsteroidSurfaceController}. */
export interface AsteroidSurfaceControllerOptions {
  /** URL path to the asteroid GLB. Defaults to {@link DEFAULT_ASTEROID_MODEL_PATH}. */
  modelPath?: string
  /** Heightmap bake parameters. */
  bake: BakeHeightmapFromMeshOptions
  /** Uniform scale applied to the loaded model before baking. Default 1. */
  scale?: number
}

/** Result bundle from {@link AsteroidSurfaceController.create}. */
export interface AsteroidSurfaceControllerResult {
  /** Root scene group for the asteroid. Add this to the scene graph. */
  group: THREE.Group
  /** Baked heightmap for physics/queries. */
  heightmap: Heightmap
  /** Dispose GPU resources. */
  dispose: () => void
}

/**
 * Load the GLB, scale it, bake a heightmap from it, and return a render group
 * plus the heightmap. The returned group is ready to be added to the scene.
 */
export async function createAsteroidSurface(
  options: AsteroidSurfaceControllerOptions,
): Promise<AsteroidSurfaceControllerResult> {
  const modelPath = options.modelPath ?? DEFAULT_ASTEROID_MODEL_PATH
  const scene = await loadGLB(modelPath)

  const group = new THREE.Group()
  group.name = 'asteroidSurface'
  if (options.scale !== undefined && options.scale !== 1) {
    scene.scale.setScalar(options.scale)
  }
  // Shadow flags mirror the old TerrainMesh defaults.
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })
  scene.updateMatrixWorld(true)
  group.add(scene)

  // Raycast against the (already transformed) scene. `bakeHeightmapFromMesh`
  // walks descendants via `intersectObject(mesh, true)`.
  const heightmap = bakeHeightmapFromMesh(scene, options.bake)

  return {
    group,
    heightmap,
    dispose: () => {
      group.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          ;(child as THREE.Mesh).geometry?.dispose()
        }
        const material = (child as THREE.Mesh).material
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose())
        } else if (material) {
          ;(material as THREE.Material).dispose()
        }
      })
    },
  }
}
```

- [ ] **Step 2: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/three/AsteroidSurfaceController.ts
git commit -m "feat(three): AsteroidSurfaceController loads GLB + bakes heightmap"
```

---

## Task 5: Add optional `modelPath` to asteroid JSON schema

Data-driven per-asteroid model selection. Optional field — falling back to `DEFAULT_ASTEROID_MODEL_PATH` when absent so existing JSONs stay valid.

**Files:**
- Modify: `src/lib/asteroids/types.ts`
- Modify: `src/data/asteroids/*.json` (all six files)

- [ ] **Step 1: Add `modelPath` to the `SurfaceFeatures` interface**

Open `src/lib/asteroids/types.ts` and find the `SurfaceFeatures` interface. Add the optional field (alphabetically or at the end — match existing style):

```ts
  /**
   * Optional URL path to a GLB model used for the level surface. When omitted,
   * the level view falls back to `DEFAULT_ASTEROID_MODEL_PATH`.
   */
  modelPath?: string
```

- [ ] **Step 2: Populate JSONs with the default path**

For each of `src/data/asteroids/{2019-xg7,2021-kr3,bennu,itokawa,psyche}.json` (skip `difficulty-map.json`), add inside the `surface` block:

```json
    "modelPath": "/models/asteroid.glb",
```

Place it alongside the other surface keys (e.g. after `dustCoverage`).

- [ ] **Step 3: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/asteroids/types.ts src/data/asteroids/*.json
git commit -m "feat(data): add optional surface.modelPath to asteroid JSON schema"
```

---

## Task 6: Wire `AsteroidSurfaceController` into `LevelViewController`

Replace the procedural terrain + `TerrainMesh` pair with a single mesh-backed surface. Pass `isValidGround` to the rock distribution. This is the task that actually flips the behavior.

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Import the new controller**

In `src/views/LevelViewController.ts`, add alongside the existing terrain imports:

```ts
import { createAsteroidSurface, type AsteroidSurfaceControllerResult } from '@/three/AsteroidSurfaceController'
```

- [ ] **Step 2: Add the surface-result field and a bake altitude constant**

Near the other private fields (look for `private terrainMesh: TerrainMesh | null = null`), add:

```ts
  private asteroidSurface: AsteroidSurfaceControllerResult | null = null
```

Near the other terrain constants (look for `const TERRAIN_RESOLUTION = 512`), add:

```ts
/** Y altitude from which bake rays start. Must sit above any asteroid geometry. */
const TERRAIN_BAKE_START_ALTITUDE = 5000
```

- [ ] **Step 3: Replace the terrain init block**

Find the block around line 660–672 that currently reads:

```ts
    this.heightmap = asteroid.surface.flatShading
      ? new Heightmap(TERRAIN_RESOLUTION, LEVEL_GRID_SIZE)
      : generateTerrain(asteroid.surface, {
          resolution: TERRAIN_RESOLUTION,
          worldSize: LEVEL_GRID_SIZE,
          seed: hashSeed(mission.id),
          biome: asteroid.biome,
        })
    this.collisionWorld = new CollisionWorld(this.heightmap)
    // ... (keep surrounding code unchanged)
    this.terrainMesh = new TerrainMesh(this.heightmap)
```

Replace with:

```ts
    this.asteroidSurface = await createAsteroidSurface({
      modelPath: asteroid.surface.modelPath,
      bake: {
        resolution: TERRAIN_RESOLUTION,
        worldSize: LEVEL_GRID_SIZE,
        rayStartAltitude: TERRAIN_BAKE_START_ALTITUDE,
      },
    })
    this.heightmap = this.asteroidSurface.heightmap
    this.collisionWorld = new CollisionWorld(this.heightmap)
    this.sceneManager.scene.add(this.asteroidSurface.group)
```

Remove the `this.terrainMesh = new TerrainMesh(this.heightmap)` line and any `this.sceneManager.scene.add(this.terrainMesh.mesh)` that follows. Delete the `import { TerrainMesh } from '@/three/TerrainMesh'` import and the unused `terrainMesh` field.

- [ ] **Step 4: Pass `isValidGround` to the rock distribution call**

Find the `SurfaceRockController.create({ ... heightmap: this.heightmap, ... })` call (roughly line 688–692) and the underlying distribution args. In `generateAsteroidRockDistribution`'s options (inside `SurfaceRockController.create`'s `generateAsteroidRockDistribution` call at `src/three/controllers/SurfaceRockController.ts:214`), the distribution is driven by `options.heightmap`. Extend `SurfaceRockControllerOptions` (same file) to accept an explicit `isValidGround`? No — the cleanest path is:

Inside `SurfaceRockController.create`, replace the existing distribution call:

```ts
    const spawns = generateAsteroidRockDistribution({
      seed: options.seed,
      worldSize: options.heightmap.worldSize,
      surface: options.surface,
      exclusions: options.exclusions,
      slopeAt: (x, z) => options.heightmap.slopeAt(x, z),
    })
```

with:

```ts
    const spawns = generateAsteroidRockDistribution({
      seed: options.seed,
      worldSize: options.heightmap.worldSize,
      surface: options.surface,
      exclusions: options.exclusions,
      slopeAt: (x, z) => options.heightmap.slopeAt(x, z),
      isValidGround: (x, z) => options.heightmap.isValidAt(x, z),
    })
```

No signature change required; `Heightmap.isValidAt` was added in Task 1.

- [ ] **Step 5: Dispose the surface in `dispose()`**

Find the level controller's `dispose` (or cleanup teardown). After the existing terrain cleanup, add:

```ts
    this.asteroidSurface?.dispose()
    this.asteroidSurface = null
```

- [ ] **Step 6: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green. If the `generateTerrain` / `Heightmap` imports in the level controller are now unused, delete them; if they're used elsewhere in the file, leave them.

- [ ] **Step 7: Smoke-test in the browser**

Run: `bun dev`. Load `/level` (enter via the map → pick a mission). Verify:
- The asteroid mesh renders instead of the old procedural terrain.
- The lander lands on the asteroid.
- Rocks spawn on the surface (not floating in space).
- Enemies / minigames still run.

If something is broken, commit what's green and file a bug — don't paper over it here.

- [ ] **Step 8: Commit**

```bash
git add src/views/LevelViewController.ts src/three/controllers/SurfaceRockController.ts
git commit -m "feat(level): use GLB asteroid surface instead of procedural terrain"
```

---

## Task 7: Player-adrift detection

When the player walks over the edge of the asteroid into an off-surface cell (or falls below the surface silhouette), fail the mission with `'Adrift'` — mirror the existing lander logic.

**Files:**
- Modify: `src/views/LevelViewController.ts`

- [ ] **Step 1: Add a helper mirroring `isLanderAdrift`**

Find `isLanderAdrift()` (around line 2630). Add a sibling method immediately after it:

```ts
  private isPlayerAdrift(): boolean {
    if (!this.playerController || !this.heightmap) return false
    const pos = this.playerController.group.position
    // Off-surface cell → the player walked over the edge.
    if (!this.heightmap.isValidAt(pos.x, pos.z)) return true
    // Below-surface → we somehow clipped through; treat as adrift too.
    const groundY = this.heightmap.heightAt(pos.x, pos.z)
    return pos.y < groundY - ADRIFT_DEPTH_MARGIN
  }
```

- [ ] **Step 2: Call the new check in the tick loop**

Find the existing lander-adrift check (around line 1728):

```ts
    if (this.stateMachine?.is('lander') && this.isLanderAdrift()) {
      this.failLanderRun('Adrift')
    }
```

Immediately after it, add:

```ts
    if (this.stateMachine?.is('eva') && this.isPlayerAdrift()) {
      this.failLanderRun('Adrift')
    }
```

`failLanderRun` is the shared mission-fail entry — the existing lander-adrift check already calls it, and we reuse it here for EVA. Don't rename; the lander/eva distinction is handled inside the state machine transition.

- [ ] **Step 3: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 4: Smoke-test**

Run: `bun dev`. Land, EVA out, walk toward the edge of the asteroid. Stepping past the silhouette should fail the mission with `'Adrift'`.

- [ ] **Step 5: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat(level): fail mission when player walks off the asteroid (adrift)"
```

---

## Task 8: Make arrival-sequence altitudes relative to the landing point

Currently `APPROACH_ALTITUDE` and `LANDER_PARK_ALTITUDE` are absolute Y values assuming ground Y ≈ 0. With a mesh asteroid, the landing-point Y is wherever the picked spawn cell baked to — could be hundreds of units. Fix by layering the altitudes on top of `landerSpawnTarget.y`.

**Files:**
- Modify: `src/three/ArrivalSequence.ts`

- [ ] **Step 1: Re-declare the altitudes as offsets**

In `src/three/ArrivalSequence.ts`, replace the existing constants:

```ts
/** Shuttle approach altitude (Y). */
const APPROACH_ALTITUDE = 800
```

with:

```ts
/** Shuttle approach altitude measured ABOVE the landing point's ground Y. */
const APPROACH_ALTITUDE_OFFSET = 800
```

And:

```ts
/** Absolute Y altitude for the parked shuttle (above lander spawn height of 600). */
const LANDER_PARK_ALTITUDE = 875
```

with:

```ts
/** Parked shuttle altitude measured ABOVE the landing point's ground Y. */
const LANDER_PARK_ALTITUDE_OFFSET = 875
```

- [ ] **Step 2: Replace absolute uses with offsets**

In the constructor, find `this.shuttleEndPos.set(landerSpawnTarget.x, APPROACH_ALTITUDE, ...)` and change to:

```ts
    this.shuttleEndPos.set(
      landerSpawnTarget.x,
      landerSpawnTarget.y + APPROACH_ALTITUDE_OFFSET,
      landerSpawnTarget.z - APPROACH_END_DISTANCE,
    )
```

Same transformation for `this.shuttleStartPos.set(..., APPROACH_ALTITUDE, ...)`.

In `parkShuttle()` (around line 400–425), find the line that sets the parked Y to `LANDER_PARK_ALTITUDE` and change to `this.landerSpawnTarget.y + LANDER_PARK_ALTITUDE_OFFSET`.

(If there are other call-sites using the old names, grep: `grep -n 'APPROACH_ALTITUDE\|LANDER_PARK_ALTITUDE' src/three/ArrivalSequence.ts` — update each in the same pattern.)

- [ ] **Step 3: Run merge-ready checks**

Run: `bun run type-check && bun run lint && bun run test:unit`
Expected: all green.

- [ ] **Step 4: Smoke-test**

Run: `bun dev`. Start a new mission. Verify:
- Shuttle approaches from a reasonable altitude above the asteroid surface (not absurdly low or high).
- Shuttle parks overhead after the cinematic.
- Exfil sequence can still dock the lander.

- [ ] **Step 5: Commit**

```bash
git add src/three/ArrivalSequence.ts
git commit -m "feat(arrival): make approach + park altitudes relative to landing Y"
```

---

## Task 9: End-to-end validation + regression sweep

Final defensive pass. Run through every existing feature that touches the terrain to make sure nothing silently broke.

- [ ] **Step 1: Run the full merge-ready command sequence**

```bash
bun run type-check
bun run lint
bun run test:unit
```

All three must be green.

- [ ] **Step 2: Manual regression checklist**

Run `bun dev` and walk the following:

1. **Arrival cinematic** — shuttle approaches, flips, opens doors, drops lander. No visual glitches; lander lands on the asteroid.
2. **Lander flight** — fuel, thrust, gravity. Touch down multiple spots on the surface.
3. **Lander adrift** — deliberately fly past the edge of the asteroid. Mission fails `'Adrift'`.
4. **EVA walk** — step out, walk around. Rocks and nests visible on the surface; no floating props.
5. **EVA adrift (new)** — walk to the edge, step off. Mission fails `'Adrift'`.
6. **Exterminate minigame** — spawn into a mission with a nest, kill defenders, arm charges, detonate. Crater appears on the asteroid surface.
7. **Rescue minigame** — spawn into a rescue mission, find hostages, escort back. Pathing still works.
8. **Gather minigame** — (if reachable) mine rocks, resources count.
9. **Exfil** — return to lander, take off, dock with shuttle overhead.

If any step regresses, file it and stop — don't paper over.

- [ ] **Step 3: Final commit (if any regression fixes were needed)**

If steps 1–9 passed with no touch-ups, skip this step. Otherwise commit any fixes with a `fix(level): …` message.

---

## Follow-ups (not in this plan)

Deliberately out of scope; open as separate specs if/when prioritised:

1. **Random per-mission orientation.** Seeded random rotation applied to the GLB before bake, so every drop lands on a different face. Requires a "find the flattest face" heuristic so flat zones can still be placed.
2. **Kubrick camera beats in the arrival sequence.** Wide-shot of the asteroid silhouette rotating, shuttle entering from screen edge, parallax reveal. Cinematography layer, not physics.
3. **Per-biome asteroid GLB variants.** `asteroid2.glb`, `asteroid3.glb` already exist; wire them up via `modelPath` in JSON when content variety becomes a priority.
4. **Custom PBR shaders on the asteroid GLB.** Match the existing biome look (rust, basalt, icy). Today we inherit whatever materials shipped in the GLB.
5. **Surface dust / atmosphere tied to the mesh silhouette** rather than the old worldSize square.
