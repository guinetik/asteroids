/**
 * Procedural asteroid terrain grid on the XZ plane.
 *
 * Same line-segment rendering strategy as {@link SpaceTimeGrid} but instead
 * of gravity-well deformation, vertices are displaced by layered simplex-style
 * noise to create a rocky, irregular asteroid surface.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const DEFAULT_GRID_SIZE = 2000
const DEFAULT_GRID_RESOLUTION = 80
const GRID_COLOR = 0x665544
const GRID_OPACITY = 0.5

/** Terrain generation parameters */
const DEFAULT_HEIGHT_SCALE = 25
const DEFAULT_NOISE_FREQUENCY = 0.006
const DEFAULT_OCTAVES = 5
const DEFAULT_PERSISTENCE = 0.5
const DEFAULT_LACUNARITY = 2.2

/** Crater generation */
const DEFAULT_CRATER_COUNT = 12
const CRATER_MIN_RADIUS = 40
const CRATER_MAX_RADIUS = 150
const CRATER_DEPTH_SCALE = 0.6
const CRATER_RIM_HEIGHT = 0.35
const CRATER_RIM_WIDTH = 1.4

/** Ridge generation */
const DEFAULT_RIDGE_COUNT = 5
const RIDGE_MIN_LENGTH = 200
const RIDGE_MAX_LENGTH = 600
const RIDGE_HEIGHT = 15
const RIDGE_WIDTH = 60
const RIDGE_NOISE_FREQ = 0.02

/** Configuration for terrain generation. */
export interface TerrainConfig {
  /** Peak height of terrain features */
  heightScale?: number
  /** Base noise frequency — lower = broader hills */
  frequency?: number
  /** Number of noise layers */
  octaves?: number
  /** Amplitude falloff per octave (0–1) */
  persistence?: number
  /** Frequency multiplier per octave */
  lacunarity?: number
  /** Random seed for terrain variation */
  seed?: number
  /** Number of impact craters */
  craterCount?: number
  /** Number of ridges */
  ridgeCount?: number
}

/** Seeded pseudo-random number generator for deterministic terrain */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** A crater: circular depression with a raised rim */
interface Crater {
  x: number
  z: number
  radius: number
  depth: number
}

/** A ridge: elevated linear feature with noise-warped edges */
interface Ridge {
  x1: number
  z1: number
  x2: number
  z2: number
  height: number
  width: number
}

/**
 * Simple 2D hash-based value noise.
 * Not true simplex, but cheap and good enough for terrain vis.
 */
function hash(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 43758.5453) * 43758.5453
  return n - Math.floor(n)
}

/** Smooth interpolation */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 2D value noise with smooth interpolation */
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz

  const sx = smoothstep(fx)
  const sz = smoothstep(fz)

  const n00 = hash(ix, iz, seed)
  const n10 = hash(ix + 1, iz, seed)
  const n01 = hash(ix, iz + 1, seed)
  const n11 = hash(ix + 1, iz + 1, seed)

  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx

  return (nx0 + (nx1 - nx0) * sz) * 2 - 1 // range [-1, 1]
}

/** Multi-octave fractal noise */
function fractalNoise(
  x: number,
  z: number,
  seed: number,
  octaves: number,
  frequency: number,
  persistence: number,
  lacunarity: number,
): number {
  let total = 0
  let amplitude = 1
  let maxAmplitude = 0
  let freq = frequency

  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * freq, z * freq, seed + i * 100) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    freq *= lacunarity
  }

  return total / maxAmplitude
}

/**
 * Procedural asteroid terrain grid rendered as {@link THREE.LineSegments}.
 * Vertices are displaced on the Y axis by fractal noise to create
 * rocky, uneven terrain. Implements {@link Tickable} for future animation.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class TerrainGrid implements Tickable {
  readonly mesh: THREE.LineSegments

  private readonly geometry: THREE.BufferGeometry
  private readonly gridSize: number
  private readonly gridResolution: number
  private readonly heightScale: number
  private readonly seed: number
  private readonly frequency: number
  private readonly octaves: number
  private readonly persistence: number
  private readonly lacunarity: number
  private readonly craters: Crater[]
  private readonly ridges: Ridge[]

  constructor(
    gridSize = DEFAULT_GRID_SIZE,
    gridResolution = DEFAULT_GRID_RESOLUTION,
    config: TerrainConfig = {},
  ) {
    this.gridSize = gridSize
    this.gridResolution = gridResolution
    this.heightScale = config.heightScale ?? DEFAULT_HEIGHT_SCALE
    this.frequency = config.frequency ?? DEFAULT_NOISE_FREQUENCY
    this.octaves = config.octaves ?? DEFAULT_OCTAVES
    this.persistence = config.persistence ?? DEFAULT_PERSISTENCE
    this.lacunarity = config.lacunarity ?? DEFAULT_LACUNARITY
    this.seed = config.seed ?? Math.random() * 10000

    const rng = seededRandom(this.seed)
    this.craters = this.generateCraters(rng, config.craterCount ?? DEFAULT_CRATER_COUNT)
    this.ridges = this.generateRidges(rng, config.ridgeCount ?? DEFAULT_RIDGE_COUNT)

    this.geometry = this.createGridGeometry()
    this.applyTerrain()

    const material = new THREE.LineBasicMaterial({
      color: GRID_COLOR,
      transparent: true,
      opacity: GRID_OPACITY,
    })

    this.mesh = new THREE.LineSegments(this.geometry, material)
  }

  /**
   * Get terrain height at any XZ position.
   * Combines fractal noise base + craters + ridges.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @returns Y height at that position
   */
  getHeightAt(x: number, z: number): number {
    // Base fractal noise
    let height = fractalNoise(
      x, z, this.seed,
      this.octaves, this.frequency, this.persistence, this.lacunarity,
    ) * this.heightScale

    // Craters — circular depressions with raised rims
    for (const crater of this.craters) {
      const dx = x - crater.x
      const dz = z - crater.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      const r = crater.radius
      const norm = dist / r

      if (norm < CRATER_RIM_WIDTH) {
        if (norm < 1) {
          // Inside crater — smooth bowl depression
          const bowl = 1 - norm * norm
          height -= crater.depth * bowl
        } else {
          // Rim zone — raised lip that falls off
          const rimNorm = (norm - 1) / (CRATER_RIM_WIDTH - 1)
          const rimFalloff = 1 - rimNorm * rimNorm
          height += crater.depth * CRATER_RIM_HEIGHT * rimFalloff
        }
      }
    }

    // Ridges — elevated linear features with noise-warped edges
    for (const ridge of this.ridges) {
      const ldx = ridge.x2 - ridge.x1
      const ldz = ridge.z2 - ridge.z1
      const lenSq = ldx * ldx + ldz * ldz

      // Project point onto ridge line segment
      const t = Math.max(0, Math.min(1,
        ((x - ridge.x1) * ldx + (z - ridge.z1) * ldz) / lenSq,
      ))
      const projX = ridge.x1 + t * ldx
      const projZ = ridge.z1 + t * ldz
      const perpDist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2)

      // Noise-warped width for natural look
      const warp = 1 + 0.3 * valueNoise(x * RIDGE_NOISE_FREQ, z * RIDGE_NOISE_FREQ, this.seed + 500)
      const halfWidth = ridge.width * warp * 0.5
      if (perpDist < halfWidth) {
        const falloff = 1 - (perpDist / halfWidth)
        // Smooth falloff with taper at ridge endpoints
        const taper = Math.min(1, t * 5, (1 - t) * 5)
        height += ridge.height * falloff * falloff * taper
      }
    }

    return height
  }

  tick(_dt: number): void {
    // Static terrain — no per-frame updates needed
  }

  dispose(): void {
    this.geometry.dispose()
    ;(this.mesh.material as THREE.LineBasicMaterial).dispose()
  }

  private generateCraters(rng: () => number, count: number): Crater[] {
    const halfSize = this.gridSize * 0.4
    const craters: Crater[] = []
    for (let i = 0; i < count; i++) {
      const radius = CRATER_MIN_RADIUS + rng() * (CRATER_MAX_RADIUS - CRATER_MIN_RADIUS)
      craters.push({
        x: (rng() - 0.5) * 2 * halfSize,
        z: (rng() - 0.5) * 2 * halfSize,
        radius,
        depth: radius * CRATER_DEPTH_SCALE,
      })
    }
    return craters
  }

  private generateRidges(rng: () => number, count: number): Ridge[] {
    const halfSize = this.gridSize * 0.4
    const ridges: Ridge[] = []
    for (let i = 0; i < count; i++) {
      const cx = (rng() - 0.5) * 2 * halfSize
      const cz = (rng() - 0.5) * 2 * halfSize
      const angle = rng() * Math.PI
      const length = RIDGE_MIN_LENGTH + rng() * (RIDGE_MAX_LENGTH - RIDGE_MIN_LENGTH)
      const halfLen = length / 2
      ridges.push({
        x1: cx - Math.cos(angle) * halfLen,
        z1: cz - Math.sin(angle) * halfLen,
        x2: cx + Math.cos(angle) * halfLen,
        z2: cz + Math.sin(angle) * halfLen,
        height: RIDGE_HEIGHT * (0.5 + rng() * 0.5),
        width: RIDGE_WIDTH * (0.6 + rng() * 0.4),
      })
    }
    return ridges
  }

  private applyTerrain(): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]!
      const z = positions[i + 2]!
      positions[i + 1] = this.getHeightAt(x, z)
    }

    posAttr.needsUpdate = true
    this.geometry.computeBoundingSphere()
  }

  private createGridGeometry(): THREE.BufferGeometry {
    const halfSize = this.gridSize / 2
    const step = this.gridSize / this.gridResolution
    const vertices: number[] = []

    // Lines along X (rows)
    for (let i = 0; i <= this.gridResolution; i++) {
      const z = -halfSize + i * step
      for (let j = 0; j < this.gridResolution; j++) {
        const x1 = -halfSize + j * step
        const x2 = x1 + step
        vertices.push(x1, 0, z, x2, 0, z)
      }
    }

    // Lines along Z (columns)
    for (let i = 0; i <= this.gridResolution; i++) {
      const x = -halfSize + i * step
      for (let j = 0; j < this.gridResolution; j++) {
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
