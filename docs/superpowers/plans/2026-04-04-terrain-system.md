# Terrain System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, data-driven terrain generation system in `src/lib/terrain/` that takes `SurfaceFeatures` from asteroid definitions and produces heightmap grids with craters, ridges, and noise — then wire `TerrainGrid` (the Three.js renderer) to consume it.

**Architecture:** Pure terrain math lives in `src/lib/terrain/` (no Three.js). A `Heightmap` class stores a `Float32Array` grid with O(1) bilinear-interpolated lookups for `heightAt`, `normalAt`, `slopeAt`. A `TerrainGenerator` takes `SurfaceFeatures` + seed and fills a `Heightmap` using `SimplexNoise`, crater stamps, and ridge features. The existing `TerrainGrid` in `src/three/` becomes a thin renderer that reads from a `Heightmap`. This separation means the same terrain math can drive collision, physics, minimap, or any future renderer.

**Tech Stack:** TypeScript, Vitest, SimplexNoise (ported from irover), existing `SurfaceFeatures` type from `src/lib/asteroids/types.ts`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/math/simplexNoise.ts` | Seeded 2D simplex noise (ported from irover) |
| `src/lib/math/__tests__/simplexNoise.spec.ts` | Noise determinism + range tests |
| `src/lib/terrain/heightmap.ts` | `Heightmap` class — Float32Array grid, bilinear `heightAt`, finite-diff `normalAt`/`slopeAt` |
| `src/lib/terrain/__tests__/heightmap.spec.ts` | Grid sampling, interpolation, normal/slope math |
| `src/lib/terrain/terrainGenerator.ts` | `generateTerrain(surface, seed, size)` → fills a `Heightmap` with noise + craters + ridges |
| `src/lib/terrain/__tests__/terrainGenerator.spec.ts` | Determinism, feature density, height ranges |
| `src/three/TerrainGrid.ts` | Modify: consume `Heightmap` instead of inline noise/craters |
| `src/views/LanderViewController.ts` | Modify: create `Heightmap` via generator, pass to `TerrainGrid` |

---

### Task 1: Port SimplexNoise

**Files:**
- Create: `src/lib/math/simplexNoise.ts`
- Create: `src/lib/math/__tests__/simplexNoise.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/math/__tests__/simplexNoise.spec.ts
import { describe, it, expect } from 'vitest'
import { SimplexNoise } from '../simplexNoise'

describe('SimplexNoise', () => {
  it('returns values in [-1, 1] range', () => {
    const noise = new SimplexNoise(42)
    for (let i = 0; i < 1000; i++) {
      const v = noise.n2(i * 0.1, i * 0.17)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for same seed', () => {
    const a = new SimplexNoise(123)
    const b = new SimplexNoise(123)
    expect(a.n2(5.5, 3.2)).toBe(b.n2(5.5, 3.2))
    expect(a.n2(-10, 20)).toBe(b.n2(-10, 20))
  })

  it('produces different output for different seeds', () => {
    const a = new SimplexNoise(1)
    const b = new SimplexNoise(2)
    expect(a.n2(5.5, 3.2)).not.toBe(b.n2(5.5, 3.2))
  })

  it('returns 0 at origin (known simplex property)', () => {
    const noise = new SimplexNoise(1)
    expect(noise.n2(0, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/math/__tests__/simplexNoise.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Port SimplexNoise from irover**

Copy `D:\Developer\irover\src\lib\math\simplexNoise.ts` to `src/lib/math/simplexNoise.ts`. Add TSDoc header:

```typescript
/**
 * Seeded 2D simplex noise generator.
 * Returns values in approximately [-1, 1]. Zero Three.js dependency.
 * Ported from irover's terrain system.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/math/__tests__/simplexNoise.spec.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/math/simplexNoise.ts src/lib/math/__tests__/simplexNoise.spec.ts
git commit -m "feat(math): port SimplexNoise from irover for terrain generation"
```

---

### Task 2: Heightmap Class

**Files:**
- Create: `src/lib/terrain/heightmap.ts`
- Create: `src/lib/terrain/__tests__/heightmap.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/terrain/__tests__/heightmap.spec.ts
import { describe, it, expect } from 'vitest'
import { Heightmap } from '../heightmap'

describe('Heightmap', () => {
  it('stores and retrieves exact grid values', () => {
    const hm = new Heightmap(4, 100) // 4x4 grid, 100 world units
    hm.set(0, 0, 5.0)
    hm.set(3, 3, 10.0)
    expect(hm.get(0, 0)).toBe(5.0)
    expect(hm.get(3, 3)).toBe(10.0)
  })

  it('returns 0 for out-of-bounds queries', () => {
    const hm = new Heightmap(4, 100)
    expect(hm.heightAt(9999, 9999)).toBe(0)
    expect(hm.heightAt(-9999, -9999)).toBe(0)
  })

  it('bilinear interpolates between grid cells', () => {
    const hm = new Heightmap(2, 100) // 2x2 grid
    // Set corners: bottom-left=0, bottom-right=10, top-left=0, top-right=10
    hm.set(0, 0, 0)
    hm.set(1, 0, 10)
    hm.set(0, 1, 0)
    hm.set(1, 1, 10)
    // Center of grid should be ~5
    const center = hm.heightAt(0, 0) // world origin = grid center
    expect(center).toBeCloseTo(5, 0)
  })

  it('computes normal pointing up on flat terrain', () => {
    const hm = new Heightmap(8, 100)
    // All zeros = flat
    const n = hm.normalAt(0, 0)
    expect(n.x).toBeCloseTo(0, 1)
    expect(n.y).toBeCloseTo(1, 1)
    expect(n.z).toBeCloseTo(0, 1)
  })

  it('computes slope of 0 on flat terrain', () => {
    const hm = new Heightmap(8, 100)
    expect(hm.slopeAt(0, 0)).toBeCloseTo(0, 2)
  })

  it('computes non-zero slope on tilted terrain', () => {
    const hm = new Heightmap(8, 100)
    const step = 100 / 7 // world units per cell
    // Create a ramp along X
    for (let gz = 0; gz < 8; gz++) {
      for (let gx = 0; gx < 8; gx++) {
        hm.set(gx, gz, gx * 5) // 5 units height per grid step
      }
    }
    expect(hm.slopeAt(0, 0)).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/terrain/__tests__/heightmap.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Heightmap**

```typescript
// src/lib/terrain/heightmap.ts
/**
 * Grid-based heightmap with O(1) bilinear-interpolated lookups.
 *
 * Stores terrain elevation in a Float32Array grid. World coordinates
 * are centered at origin (−worldSize/2 to +worldSize/2). Provides
 * heightAt, normalAt, and slopeAt for physics and rendering.
 *
 * No Three.js dependency — returns plain {x, y, z} for normals.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */

/** Plain 3D vector returned by normalAt (no Three.js dependency). */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Normal sample distance in world units */
const NORMAL_SAMPLE_DIST = 0.5

export class Heightmap {
  /** Raw height data. Index: grid[gz * resolution + gx] */
  readonly grid: Float32Array
  /** Number of cells per axis */
  readonly resolution: number
  /** World-space extent (centered at origin) */
  readonly worldSize: number

  constructor(resolution: number, worldSize: number) {
    this.resolution = resolution
    this.worldSize = worldSize
    this.grid = new Float32Array(resolution * resolution)
  }

  /** Set height at grid coordinates. */
  set(gx: number, gz: number, height: number): void {
    if (gx < 0 || gx >= this.resolution || gz < 0 || gz >= this.resolution) return
    this.grid[gz * this.resolution + gx] = height
  }

  /** Get height at grid coordinates (no interpolation). */
  get(gx: number, gz: number): number {
    if (gx < 0 || gx >= this.resolution || gz < 0 || gz >= this.resolution) return 0
    return this.grid[gz * this.resolution + gx]
  }

  /** Bilinear-interpolated height at world coordinates. */
  heightAt(x: number, z: number): number {
    const half = this.worldSize / 2
    const gx = ((x + half) / this.worldSize) * (this.resolution - 1)
    const gz = ((z + half) / this.worldSize) * (this.resolution - 1)

    const ix = Math.floor(gx)
    const iz = Math.floor(gz)

    if (ix < 0 || ix >= this.resolution - 1 || iz < 0 || iz >= this.resolution - 1) return 0

    const fx = gx - ix
    const fz = gz - iz
    const g = this.grid
    const r = this.resolution

    return (
      g[iz * r + ix]! * (1 - fx) * (1 - fz) +
      g[iz * r + ix + 1]! * fx * (1 - fz) +
      g[(iz + 1) * r + ix]! * (1 - fx) * fz +
      g[(iz + 1) * r + ix + 1]! * fx * fz
    )
  }

  /** Surface normal via finite differences. */
  normalAt(x: number, z: number): Vec3 {
    const s = NORMAL_SAMPLE_DIST
    const hL = this.heightAt(x - s, z)
    const hR = this.heightAt(x + s, z)
    const hD = this.heightAt(x, z - s)
    const hU = this.heightAt(x, z + s)
    const nx = hL - hR
    const ny = 2 * s
    const nz = hD - hU
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    return { x: nx / len, y: ny / len, z: nz / len }
  }

  /** Slope magnitude (0 = flat, higher = steeper). */
  slopeAt(x: number, z: number): number {
    const dx = (this.heightAt(x + 1, z) - this.heightAt(x - 1, z)) / 2
    const dz = (this.heightAt(x, z + 1) - this.heightAt(x, z - 1)) / 2
    return Math.sqrt(dx * dx + dz * dz)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/terrain/__tests__/heightmap.spec.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/terrain/heightmap.ts src/lib/terrain/__tests__/heightmap.spec.ts
git commit -m "feat(terrain): add Heightmap class with bilinear sampling and normal/slope"
```

---

### Task 3: Terrain Generator

**Files:**
- Create: `src/lib/terrain/terrainGenerator.ts`
- Create: `src/lib/terrain/__tests__/terrainGenerator.spec.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/terrain/__tests__/terrainGenerator.spec.ts
import { describe, it, expect } from 'vitest'
import { generateTerrain } from '../terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

const ROCKY_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

const ICY_SURFACE: SurfaceFeatures = {
  craterDensity: 0.15,
  craterMaxScale: 0.1,
  boulderDensity: 0.0,
  ridgeFrequency: 0.8,
  roughness: 0.25,
  dustCoverage: 0.85,
}

describe('generateTerrain', () => {
  it('returns a Heightmap with the requested resolution', () => {
    const hm = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    expect(hm.resolution).toBe(64)
    expect(hm.worldSize).toBe(500)
  })

  it('is deterministic for the same seed', () => {
    const a = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    const b = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    expect(a.heightAt(10, 10)).toBe(b.heightAt(10, 10))
    expect(a.heightAt(-50, 30)).toBe(b.heightAt(-50, 30))
  })

  it('produces different terrain for different seeds', () => {
    const a = generateTerrain(ROCKY_SURFACE, { seed: 1, resolution: 64, worldSize: 500 })
    const b = generateTerrain(ROCKY_SURFACE, { seed: 2, resolution: 64, worldSize: 500 })
    expect(a.heightAt(10, 10)).not.toBe(b.heightAt(10, 10))
  })

  it('rocky surface has more height variation than icy surface', () => {
    const rocky = generateTerrain(ROCKY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    const icy = generateTerrain(ICY_SURFACE, { seed: 42, resolution: 64, worldSize: 500 })
    let rockyRange = 0
    let icyRange = 0
    let rockyMin = Infinity, rockyMax = -Infinity
    let icyMin = Infinity, icyMax = -Infinity
    for (let i = 0; i < rocky.grid.length; i++) {
      rockyMin = Math.min(rockyMin, rocky.grid[i]!)
      rockyMax = Math.max(rockyMax, rocky.grid[i]!)
      icyMin = Math.min(icyMin, icy.grid[i]!)
      icyMax = Math.max(icyMax, icy.grid[i]!)
    }
    rockyRange = rockyMax - rockyMin
    icyRange = icyMax - icyMin
    expect(rockyRange).toBeGreaterThan(icyRange)
  })

  it('high craterDensity produces more negative heights (bowls)', () => {
    const highCraters: SurfaceFeatures = { ...ROCKY_SURFACE, craterDensity: 0.9, craterMaxScale: 0.4 }
    const lowCraters: SurfaceFeatures = { ...ROCKY_SURFACE, craterDensity: 0.1, craterMaxScale: 0.05 }
    const high = generateTerrain(highCraters, { seed: 42, resolution: 64, worldSize: 500 })
    const low = generateTerrain(lowCraters, { seed: 42, resolution: 64, worldSize: 500 })
    let highNeg = 0, lowNeg = 0
    for (let i = 0; i < high.grid.length; i++) {
      if (high.grid[i]! < -1) highNeg++
      if (low.grid[i]! < -1) lowNeg++
    }
    expect(highNeg).toBeGreaterThan(lowNeg)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test:unit src/lib/terrain/__tests__/terrainGenerator.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement generateTerrain**

```typescript
// src/lib/terrain/terrainGenerator.ts
/**
 * Data-driven terrain generator that fills a Heightmap from SurfaceFeatures.
 *
 * Takes the 6 normalized surface parameters from an asteroid definition
 * and produces terrain with layered simplex noise, impact craters, and ridges.
 * All values from SurfaceFeatures (0–1) scale the terrain features.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
import { Heightmap } from './heightmap'
import { SimplexNoise } from '@/lib/math/simplexNoise'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

/** Options for terrain generation beyond the surface features. */
export interface TerrainGenOptions {
  /** Random seed for deterministic generation */
  seed: number
  /** Heightmap grid resolution (cells per axis) */
  resolution: number
  /** World-space extent in game units */
  worldSize: number
}

/** Base height scale — roughness multiplies this */
const BASE_HEIGHT_SCALE = 30
/** Noise frequency — lower = broader features */
const BASE_FREQUENCY = 0.006
/** Number of noise octaves */
const OCTAVES = 5
/** Amplitude falloff per octave */
const PERSISTENCE = 0.5
/** Frequency multiplier per octave */
const LACUNARITY = 2.2

/** Crater generation */
const CRATER_BASE_COUNT = 15
const CRATER_MIN_RADIUS_FRAC = 0.02
const CRATER_DEPTH_SCALE = 0.6
const CRATER_RIM_HEIGHT = 0.35
const CRATER_RIM_WIDTH = 1.4

/** Ridge generation */
const RIDGE_BASE_COUNT = 6
const RIDGE_MIN_LENGTH_FRAC = 0.15
const RIDGE_MAX_LENGTH_FRAC = 0.4
const RIDGE_HEIGHT = 15
const RIDGE_WIDTH_FRAC = 0.04
const RIDGE_NOISE_FREQ = 0.02

/** Seeded pseudo-random number generator */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

interface Crater {
  x: number
  z: number
  radius: number
  depth: number
}

interface Ridge {
  x1: number
  z1: number
  x2: number
  z2: number
  height: number
  width: number
}

/**
 * Generate a complete terrain heightmap from asteroid surface features.
 *
 * @param surface - The 6 normalized (0–1) surface parameters from an asteroid definition
 * @param options - Seed, resolution, and world size
 * @returns A filled Heightmap ready for rendering and collision
 */
export function generateTerrain(surface: SurfaceFeatures, options: TerrainGenOptions): Heightmap {
  const { seed, resolution, worldSize } = options
  const hm = new Heightmap(resolution, worldSize)
  const rng = seededRandom(seed)
  const noise = new SimplexNoise(seed)

  const heightScale = BASE_HEIGHT_SCALE * (0.3 + surface.roughness * 0.7)
  const half = worldSize / 2
  const step = worldSize / (resolution - 1)

  // Pass 1: fractal noise base
  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const wx = -half + gx * step
      const wz = -half + gz * step
      let h = 0
      let amp = 1
      let freq = BASE_FREQUENCY
      let maxAmp = 0
      for (let o = 0; o < OCTAVES; o++) {
        h += noise.n2(wx * freq, wz * freq) * amp
        maxAmp += amp
        amp *= PERSISTENCE
        freq *= LACUNARITY
      }
      hm.set(gx, gz, (h / maxAmp) * heightScale)
    }
  }

  // Pass 2: impact craters
  const craterCount = Math.round(CRATER_BASE_COUNT * surface.craterDensity)
  const maxCraterRadius = worldSize * surface.craterMaxScale * 0.5
  const minCraterRadius = worldSize * CRATER_MIN_RADIUS_FRAC
  const craters: Crater[] = []
  const spawnHalf = worldSize * 0.4
  for (let i = 0; i < craterCount; i++) {
    const radius = minCraterRadius + rng() * (maxCraterRadius - minCraterRadius)
    craters.push({
      x: (rng() - 0.5) * 2 * spawnHalf,
      z: (rng() - 0.5) * 2 * spawnHalf,
      radius,
      depth: radius * CRATER_DEPTH_SCALE,
    })
  }

  // Pass 3: ridges
  const ridgeCount = Math.round(RIDGE_BASE_COUNT * surface.ridgeFrequency)
  const ridges: Ridge[] = []
  for (let i = 0; i < ridgeCount; i++) {
    const cx = (rng() - 0.5) * 2 * spawnHalf
    const cz = (rng() - 0.5) * 2 * spawnHalf
    const angle = rng() * Math.PI
    const minLen = worldSize * RIDGE_MIN_LENGTH_FRAC
    const maxLen = worldSize * RIDGE_MAX_LENGTH_FRAC
    const length = minLen + rng() * (maxLen - minLen)
    const halfLen = length / 2
    ridges.push({
      x1: cx - Math.cos(angle) * halfLen,
      z1: cz - Math.sin(angle) * halfLen,
      x2: cx + Math.cos(angle) * halfLen,
      z2: cz + Math.sin(angle) * halfLen,
      height: RIDGE_HEIGHT * (0.5 + rng() * 0.5) * (0.3 + surface.ridgeFrequency * 0.7),
      width: worldSize * RIDGE_WIDTH_FRAC * (0.6 + rng() * 0.4),
    })
  }

  // Apply craters and ridges to the heightmap
  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      const wx = -half + gx * step
      const wz = -half + gz * step
      let h = hm.get(gx, gz)

      // Craters
      for (const c of craters) {
        const dx = wx - c.x
        const dz = wz - c.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        const norm = dist / c.radius
        if (norm < CRATER_RIM_WIDTH) {
          if (norm < 1) {
            h -= c.depth * (1 - norm * norm)
          } else {
            const rimNorm = (norm - 1) / (CRATER_RIM_WIDTH - 1)
            h += c.depth * CRATER_RIM_HEIGHT * (1 - rimNorm * rimNorm)
          }
        }
      }

      // Ridges
      for (const r of ridges) {
        const ldx = r.x2 - r.x1
        const ldz = r.z2 - r.z1
        const lenSq = ldx * ldx + ldz * ldz
        const t = Math.max(0, Math.min(1, ((wx - r.x1) * ldx + (wz - r.z1) * ldz) / lenSq))
        const px = r.x1 + t * ldx
        const pz = r.z1 + t * ldz
        const perpDist = Math.sqrt((wx - px) ** 2 + (wz - pz) ** 2)
        const warp = 1 + 0.3 * noise.n2(wx * RIDGE_NOISE_FREQ, wz * RIDGE_NOISE_FREQ)
        const halfW = r.width * warp * 0.5
        if (perpDist < halfW) {
          const falloff = 1 - perpDist / halfW
          const taper = Math.min(1, t * 5, (1 - t) * 5)
          h += r.height * falloff * falloff * taper
        }
      }

      hm.set(gx, gz, h)
    }
  }

  return hm
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/terrain/__tests__/terrainGenerator.spec.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/terrain/terrainGenerator.ts src/lib/terrain/__tests__/terrainGenerator.spec.ts
git commit -m "feat(terrain): add data-driven terrain generator from SurfaceFeatures"
```

---

### Task 4: Wire TerrainGrid to Heightmap

**Files:**
- Modify: `src/three/TerrainGrid.ts` — strip inline noise/crater/ridge generation, consume `Heightmap`
- Modify: `src/views/LanderViewController.ts` — create `Heightmap` via `generateTerrain`, pass to `TerrainGrid`

- [ ] **Step 1: Rewrite TerrainGrid to consume a Heightmap**

`TerrainGrid` becomes a thin renderer. It takes a `Heightmap` and builds the line-segment mesh from it. The `getHeightAt` method delegates to the heightmap.

```typescript
// src/three/TerrainGrid.ts — simplified
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'

const GRID_COLOR = 0x665544
const GRID_OPACITY = 0.5

/**
 * Renders a Heightmap as a wireframe line-segment grid on the XZ plane.
 * Pure renderer — all terrain math lives in the Heightmap.
 */
export class TerrainGrid implements Tickable {
  readonly mesh: THREE.LineSegments
  private readonly geometry: THREE.BufferGeometry
  private readonly heightmap: Heightmap

  constructor(heightmap: Heightmap, gridResolution?: number) {
    this.heightmap = heightmap
    const res = gridResolution ?? 80
    this.geometry = this.createGridGeometry(heightmap.worldSize, res)
    this.applyHeights(heightmap.worldSize, res)

    const material = new THREE.LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: GRID_OPACITY,
    })
    this.mesh = new THREE.LineSegments(this.geometry, material)
  }

  getHeightAt(x: number, z: number): number {
    return this.heightmap.heightAt(x, z)
  }

  tick(_dt: number): void {}

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.LineBasicMaterial).dispose()
  }

  private applyHeights(worldSize: number, resolution: number): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = this.heightmap.heightAt(positions[i]!, positions[i + 2]!)
    }
    posAttr.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }

  private createGridGeometry(worldSize: number, resolution: number): THREE.BufferGeometry {
    const halfSize = worldSize / 2
    const step = worldSize / resolution
    const vertices: number[] = []
    for (let i = 0; i <= resolution; i++) {
      const z = -halfSize + i * step
      for (let j = 0; j < resolution; j++) {
        const x1 = -halfSize + j * step
        const x2 = x1 + step
        vertices.push(x1, 0, z, x2, 0, z)
      }
    }
    for (let i = 0; i <= resolution; i++) {
      const x = -halfSize + i * step
      for (let j = 0; j < resolution; j++) {
        const z1 = -halfSize + j * step
        const z2 = z1 + step
        vertices.push(x, 0, z1, x, 0, z2)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    return geometry
  }
}
```

- [ ] **Step 2: Update LanderViewController to use the generator pipeline**

```typescript
// In LanderViewController.ts init():
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

// Temporary test surface — will come from asteroid data later
const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

// Replace the old TerrainGrid construction:
const heightmap = generateTerrain(TEST_SURFACE, { seed: 42, resolution: 128, worldSize: GRID_SIZE })
this.terrainGrid = new TerrainGrid(heightmap)
```

- [ ] **Step 3: Run type-check**

Run: `bun run type-check`
Expected: Clean

- [ ] **Step 4: Visual verification**

Run: `bun dev`
Navigate to `/lander`, verify terrain renders with craters and ridges.

- [ ] **Step 5: Commit**

```bash
git add src/three/TerrainGrid.ts src/views/LanderViewController.ts
git commit -m "refactor(terrain): TerrainGrid consumes Heightmap, generator drives features"
```

---

### Task 5: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `bun test:unit`
Expected: All tests pass including new terrain + existing thruster/physics tests

- [ ] **Step 2: Run linter**

Run: `bun lint`
Fix any issues.

- [ ] **Step 3: Final commit if lint fixes needed**

```bash
git add -A
git commit -m "chore: lint fixes for terrain system"
```
