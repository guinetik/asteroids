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
 * A circular flat zone protected from terrain deformation.
 * Used as landing pads / objective areas.
 */
export interface FlatZone {
  /** Centre X in world coordinates. */
  x: number
  /** Centre Z in world coordinates. */
  z: number
  /** Radius in world units — area inside is flattened. */
  radius: number
}

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
  /** Circular zones that remain flat (no craters, ridges, or noise deformation). */
  flatZones?: FlatZone[]
  /** Optional biome identifier used to tune broad relief and breakup detail. */
  biome?: string
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
    case 'volcanic':
      return {
        broadReliefScale: 1.08,
        disturbanceContrast: 1.25,
        disturbanceBias: 0.1,
        mediumBreakupScale: 1.3,
        microBreakupScale: 1.1,
        dustSoftening: 0.75,
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
  const microAmp = 14 * surface.boulderDensity * tuning.microBreakupScale

  const dustFactor = clamp01(1 - surface.dustCoverage * 0.85 * tuning.dustSoftening)

  return medium * mediumAmp * disturbance + micro * microAmp * microMask * dustFactor
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

/**
 * Returns a protection mask for flat zones. Value 0 = fully protected,
 * 1 = no protection. Smooth blend at edges via cosine falloff.
 *
 * @param worldX - World X coordinate
 * @param worldZ - World Z coordinate
 * @param flatZones - Array of flat zone definitions
 * @returns Protection factor (0 = flat, 1 = normal terrain)
 */
function flatZoneProtection(worldX: number, worldZ: number, flatZones: FlatZone[]): number {
  const BLEND_FRACTION = 0.3 // outer 30% of radius blends smoothly
  let minProtection = 1

  for (const zone of flatZones) {
    const dx = worldX - zone.x
    const dz = worldZ - zone.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    if (dist >= zone.radius) continue

    const blendStart = zone.radius * (1 - BLEND_FRACTION)
    if (dist <= blendStart) {
      return 0 // fully protected
    }

    // Smooth blend from protected to normal
    const t = (dist - blendStart) / (zone.radius - blendStart)
    const protection = t * t * (3 - 2 * t) // smoothstep
    minProtection = Math.min(minProtection, protection)
  }

  return minProtection
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Default flat zone radius for landing/objective areas (world units). */
export const FLAT_ZONE_RADIUS = 300

/** Minimum distance between flat zone centres as a fraction of worldSize. */
export const FLAT_ZONE_MIN_SPACING_FRACTION = 0.25

/** Margin from world edge for flat zone placement as a fraction of worldSize. */
export const FLAT_ZONE_EDGE_MARGIN_FRACTION = 0.15

/**
 * Pick N well-spread random points on the terrain for flat zones.
 * Uses rejection sampling to ensure minimum spacing.
 *
 * @param count - Number of zones to place.
 * @param worldSize - World extent in meters.
 * @param seed - RNG seed (uses its own stream to avoid perturbing terrain).
 * @param radius - Flat zone radius in world units.
 * @returns Array of FlatZone definitions.
 */
export function generateFlatZones(
  count: number,
  worldSize: number,
  seed: number,
  radius = FLAT_ZONE_RADIUS,
): FlatZone[] {
  const rng = seededRandom(seed + 9999) // offset seed to avoid correlation with terrain
  const half = worldSize / 2
  const margin = worldSize * FLAT_ZONE_EDGE_MARGIN_FRACTION
  const minSpacing = worldSize * FLAT_ZONE_MIN_SPACING_FRACTION
  const minSpacingSq = minSpacing * minSpacing
  const zones: FlatZone[] = []
  const maxAttempts = 200

  for (let placed = 0; placed < count && placed < maxAttempts; ) {
    const x = -half + margin + rng() * (worldSize - 2 * margin)
    const z = -half + margin + rng() * (worldSize - 2 * margin)

    // Check spacing against already-placed zones
    let tooClose = false
    for (const existing of zones) {
      const dx = x - existing.x
      const dz = z - existing.z
      if (dx * dx + dz * dz < minSpacingSq) {
        tooClose = true
        break
      }
    }

    if (!tooClose) {
      zones.push({ x, z, radius })
      placed++
    }
  }

  return zones
}

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
  const { seed, resolution, worldSize, biome } = options
  const hm = new Heightmap(resolution, worldSize)
  const rng = seededRandom(seed)
  const noise = new SimplexNoise(seed)
  const tuning = getBiomeTuning(biome)
  const cellSize = worldSize / (resolution - 1)

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

  // -------------------------------------------------------------------------
  // Pass 4: Flat zones — lerp protected areas toward their centre height
  // -------------------------------------------------------------------------
  const flatZones = options.flatZones ?? []
  if (flatZones.length > 0) {
    // Sample centre height for each zone
    const centreHeights = flatZones.map((z) => hm.heightAt(z.x, z.z))

    for (let gz = 0; gz < resolution; gz++) {
      for (let gx = 0; gx < resolution; gx++) {
        const wx = -worldSize / 2 + gx * cellSize
        const wz = -worldSize / 2 + gz * cellSize
        const protection = flatZoneProtection(wx, wz, flatZones)

        if (protection < 1) {
          // Find which zone this cell is closest to
          let bestDist = Infinity
          let flatHeight = 0
          for (let i = 0; i < flatZones.length; i++) {
            const dx = wx - flatZones[i]!.x
            const dz = wz - flatZones[i]!.z
            const dist = dx * dx + dz * dz
            if (dist < bestDist) {
              bestDist = dist
              flatHeight = centreHeights[i]!
            }
          }

          const idx = gz * resolution + gx
          const current = hm.grid[idx]!
          hm.grid[idx] = flatHeight + (current - flatHeight) * protection
        }
      }
    }
  }

  return hm
}
