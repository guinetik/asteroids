/**
 * Procedural terrain generator driven by SurfaceFeatures data.
 *
 * Builds a Heightmap in three passes: multi-octave simplex noise for the
 * base terrain, parabolic crater bowls, and noise-warped ridges. All
 * random placement uses a seeded LCG so output is deterministic per seed.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */

import { SimplexNoise } from '@/lib/math/simplexNoise'
import { Heightmap } from '@/lib/terrain/heightmap'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum world-space height added by the noise pass. */
const BASE_HEIGHT_SCALE = 40

/** Number of FBM octaves for the base noise pass. */
const NOISE_OCTAVES = 5

/** Amplitude decay per octave. */
const NOISE_PERSISTENCE = 0.5

/** Frequency growth per octave. */
const NOISE_LACUNARITY = 2.2

/** Base spatial frequency of the noise field (cycles per world unit). */
const NOISE_BASE_FREQUENCY = 0.006

/** Crater count multiplier applied to craterDensity. */
const CRATER_COUNT_SCALE = 15

/** Crater depth as a fraction of crater radius. */
const CRATER_DEPTH_RATIO = 0.6

/** Crater rim height as a fraction of crater depth. */
const CRATER_RIM_HEIGHT_RATIO = 0.35

/** Crater rim outer edge as a multiple of crater radius. */
const CRATER_RIM_EXTENT = 1.4

/** Minimum crater radius as a fraction of worldSize. */
const CRATER_MIN_RADIUS_FRACTION = 0.02

/** Ridge count multiplier applied to ridgeFrequency. */
const RIDGE_COUNT_SCALE = 6

/** Base height of ridges in world units. */
const RIDGE_BASE_HEIGHT = 15

/** Width of a ridge as a fraction of worldSize. */
const RIDGE_WIDTH_FRACTION = 0.04

/** Frequency used for noise-warping ridge edges. */
const RIDGE_WARP_FREQUENCY = 0.08

/** Amplitude of noise warp applied to ridge cross-section. */
const RIDGE_WARP_AMPLITUDE = 0.3

/** Fraction of ridge length used for tapered endpoints. */
const RIDGE_TAPER_FRACTION = 0.2

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic pseudo-random number generator using a Park-Miller LCG.
 * @param seed - Integer seed value.
 * @returns A function returning values in [0, 1).
 */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options controlling terrain generation resolution and seeding.
 */
export interface TerrainGenOptions {
  /** Integer seed for all random placements. Same seed → identical output. */
  seed: number
  /** Number of grid cells per axis. Higher = more detail, more memory. */
  resolution: number
  /** World-space size in meters. Grid spans −worldSize/2 to +worldSize/2. */
  worldSize: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fractional Brownian Motion — sums multiple octaves of simplex noise.
 * @param noise - SimplexNoise instance to sample from.
 * @param nx - Normalized X coordinate (0–1).
 * @param nz - Normalized Z coordinate (0–1).
 * @param frequency - Base frequency for the first octave.
 * @param octaves - Number of octaves to sum.
 * @param persistence - Amplitude decay per octave.
 * @param lacunarity - Frequency growth per octave.
 * @returns Summed noise value (not normalized).
 */
function fbm(
  noise: SimplexNoise,
  nx: number,
  nz: number,
  frequency: number,
  octaves: number,
  persistence: number,
  lacunarity: number,
): number {
  let value = 0
  let amplitude = 1
  let freq = frequency
  for (let o = 0; o < octaves; o++) {
    value += noise.n2(nx * freq, nz * freq) * amplitude
    amplitude *= persistence
    freq *= lacunarity
  }
  return value
}

/**
 * Applies a single parabolic crater bowl to the scratch buffer.
 * Cells inside the radius receive a bowl depression; those in the rim
 * band (radius to RIM_EXTENT * radius) receive a raised rim.
 *
 * @param buf - Scratch height buffer (length = resolution²).
 * @param resolution - Grid cells per axis.
 * @param worldSize - World extent in meters.
 * @param cx - Crater centre X in grid coordinates.
 * @param cz - Crater centre Z in grid coordinates.
 * @param radius - Crater radius in grid cells.
 * @param depth - Bowl depth in world units.
 */
function applyCrater(
  buf: Float32Array,
  resolution: number,
  worldSize: number,
  cx: number,
  cz: number,
  radius: number,
  depth: number,
): void {
  const rimHeight = depth * CRATER_RIM_HEIGHT_RATIO
  const rimOuter = radius * CRATER_RIM_EXTENT
  // Convert radius from world units to grid cells
  const cellSize = worldSize / (resolution - 1)
  const radiusCells = radius / cellSize
  const rimOuterCells = rimOuter / cellSize

  const minGx = Math.max(0, Math.floor(cx - rimOuterCells - 1))
  const maxGx = Math.min(resolution - 1, Math.ceil(cx + rimOuterCells + 1))
  const minGz = Math.max(0, Math.floor(cz - rimOuterCells - 1))
  const maxGz = Math.min(resolution - 1, Math.ceil(cz + rimOuterCells + 1))

  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const dx = gx - cx
      const dz = gz - cz
      const dist = Math.sqrt(dx * dx + dz * dz)
      const t = dist / radiusCells

      let delta = 0
      if (t <= 1) {
        // Parabolic bowl interior
        delta = -depth * (1 - t * t)
      } else if (dist <= rimOuterCells) {
        // Raised rim band: linear falloff from inner to outer edge
        const rimT = (dist - radiusCells) / (rimOuterCells - radiusCells)
        delta = rimHeight * (1 - rimT)
      }
      buf[gz * resolution + gx]! += delta
    }
  }
}

/**
 * Applies a single noise-warped ridge to the scratch buffer.
 * The ridge runs from (x0, z0) to (x1, z1) in grid coordinates.
 * Each grid cell's perpendicular distance to the ridge centreline
 * determines its height contribution; endpoints are tapered.
 *
 * @param buf - Scratch height buffer (length = resolution²).
 * @param resolution - Grid cells per axis.
 * @param worldSize - World extent in meters.
 * @param noise - SimplexNoise instance for edge warping.
 * @param x0 - Ridge start X in grid coordinates.
 * @param z0 - Ridge start Z in grid coordinates.
 * @param x1 - Ridge end X in grid coordinates.
 * @param z1 - Ridge end Z in grid coordinates.
 * @param height - Peak ridge height in world units.
 * @param halfWidthCells - Half-width of ridge in grid cells.
 */
function applyRidge(
  buf: Float32Array,
  resolution: number,
  worldSize: number,
  noise: SimplexNoise,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  height: number,
  halfWidthCells: number,
): void {
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len < 0.001) return

  const ux = dx / len // unit along ridge
  const uz = dz / len
  const taperCells = len * RIDGE_TAPER_FRACTION

  const minGx = Math.max(0, Math.floor(Math.min(x0, x1) - halfWidthCells - 2))
  const maxGx = Math.min(resolution - 1, Math.ceil(Math.max(x0, x1) + halfWidthCells + 2))
  const minGz = Math.max(0, Math.floor(Math.min(z0, z1) - halfWidthCells - 2))
  const maxGz = Math.min(resolution - 1, Math.ceil(Math.max(z0, z1) + halfWidthCells + 2))

  const invWorldSize = 1 / worldSize

  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      const relX = gx - x0
      const relZ = gz - z0
      // Signed distance along and perpendicular to ridge
      const along = relX * ux + relZ * uz
      if (along < 0 || along > len) continue
      const perpX = relX - along * ux
      const perpZ = relZ - along * uz
      // Noise warp on perpendicular distance
      const warp = noise.n2(gx * invWorldSize * RIDGE_WARP_FREQUENCY * worldSize,
        gz * invWorldSize * RIDGE_WARP_FREQUENCY * worldSize) * RIDGE_WARP_AMPLITUDE
      const perp = Math.sqrt(perpX * perpX + perpZ * perpZ) + warp * halfWidthCells
      if (perp >= halfWidthCells) continue
      // Cross-section: cosine bell
      const tPerp = perp / halfWidthCells
      const crossSection = Math.cos(tPerp * Math.PI * 0.5)
      // Taper at endpoints
      const taper = Math.min(along / taperCells, 1, (len - along) / taperCells)
      buf[gz * resolution + gx]! += height * crossSection * taper
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a procedural heightmap from surface feature parameters.
 *
 * Three-pass algorithm:
 *  1. Multi-octave simplex noise scaled by roughness.
 *  2. Parabolic crater bowls placed by a seeded RNG.
 *  3. Noise-warped, tapered ridges placed by the same RNG.
 *
 * @param surface - Surface feature parameters from an AsteroidDefinition.
 * @param options - Seed, grid resolution, and world-space size.
 * @returns A fully populated Heightmap ready for physics and rendering.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
export function generateTerrain(surface: SurfaceFeatures, options: TerrainGenOptions): Heightmap {
  const { seed, resolution, worldSize } = options
  const hm = new Heightmap(resolution, worldSize)
  const rng = seededRandom(seed)
  const noise = new SimplexNoise(seed)
  const cellSize = worldSize / (resolution - 1)

  // -------------------------------------------------------------------------
  // Pass 1: Multi-octave simplex noise base
  // -------------------------------------------------------------------------
  const heightScale = BASE_HEIGHT_SCALE * (0.3 + surface.roughness * 0.7)

  for (let gz = 0; gz < resolution; gz++) {
    for (let gx = 0; gx < resolution; gx++) {
      // Normalise grid coords to [0, worldSize] for noise sampling
      const nx = gx * cellSize
      const nz = gz * cellSize
      const h = fbm(noise, nx, nz, NOISE_BASE_FREQUENCY, NOISE_OCTAVES, NOISE_PERSISTENCE, NOISE_LACUNARITY)
      hm.set(gx, gz, h * heightScale)
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2: Craters
  // -------------------------------------------------------------------------
  const craterCount = Math.round(CRATER_COUNT_SCALE * surface.craterDensity)
  const maxRadius = worldSize * surface.craterMaxScale * 0.5
  const minRadius = worldSize * CRATER_MIN_RADIUS_FRACTION

  // Read current grid into a scratch buffer so we can accumulate deltas
  // and write back in one go for each crater (applied directly to hm.grid).
  for (let c = 0; c < craterCount; c++) {
    // Random centre in grid coordinates
    const cx = rng() * (resolution - 1)
    const cz = rng() * (resolution - 1)
    const radius = minRadius + rng() * (maxRadius - minRadius)
    const depth = radius * CRATER_DEPTH_RATIO
    applyCrater(hm.grid, resolution, worldSize, cx, cz, radius, depth)
  }

  // -------------------------------------------------------------------------
  // Pass 3: Ridges
  // -------------------------------------------------------------------------
  const ridgeCount = Math.round(RIDGE_COUNT_SCALE * surface.ridgeFrequency)
  const halfWidthWorld = worldSize * RIDGE_WIDTH_FRACTION
  const halfWidthCells = halfWidthWorld / cellSize

  for (let r = 0; r < ridgeCount; r++) {
    // Random start position and direction
    const x0 = rng() * (resolution - 1)
    const z0 = rng() * (resolution - 1)
    const angle = rng() * Math.PI * 2
    // Length: 15–40% of resolution
    const lengthCells = (0.15 + rng() * 0.25) * resolution
    const x1 = x0 + Math.cos(angle) * lengthCells
    const z1 = z0 + Math.sin(angle) * lengthCells
    const ridgeHeight = RIDGE_BASE_HEIGHT * (0.5 + rng() * 0.5) * (0.3 + surface.ridgeFrequency * 0.7)
    applyRidge(hm.grid, resolution, worldSize, noise, x0, z0, x1, z1, ridgeHeight, halfWidthCells)
  }

  return hm
}
