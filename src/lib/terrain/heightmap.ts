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
  /** X component */
  x: number
  /** Y component */
  y: number
  /** Z component */
  z: number
}

/** Normal sample distance in world units */
const NORMAL_SAMPLE_DIST = 0.5

/**
 * Float32Array heightmap grid with bilinear-interpolated lookups.
 * World coordinates centered at origin. Resolution = cells per axis.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */
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
    return this.grid[gz * this.resolution + gx]!
  }

  /** Whether world coordinates are inside the interpolated terrain domain. */
  contains(x: number, z: number): boolean {
    const half = this.worldSize / 2
    const gx = ((x + half) / this.worldSize) * (this.resolution - 1)
    const gz = ((z + half) / this.worldSize) * (this.resolution - 1)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    return ix >= 0 && ix < this.resolution - 1 && iz >= 0 && iz < this.resolution - 1
  }

  /** Bilinear-interpolated height at world coordinates, or null when outside bounds. */
  tryHeightAt(x: number, z: number): number | null {
    if (!this.contains(x, z)) return null
    return this.heightAt(x, z)
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
