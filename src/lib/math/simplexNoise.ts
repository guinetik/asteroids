/**
 * Seeded 2D simplex noise generator.
 * Returns values in approximately [-1, 1]. Zero Three.js dependency.
 * Ported from irover's terrain system.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/plans/2026-04-04-terrain-system.md
 */

/** Skew factor for 2D simplex noise triangulation. */
const F2 = 0.5 * (Math.sqrt(3) - 1)
/** Unskew factor for 2D simplex noise triangulation. */
const G2 = (3 - Math.sqrt(3)) / 6
/** Gradient vectors for 2D simplex noise — 8 directions at equal spacing. */
const GRAD3: readonly [number, number][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * Seeded 2D simplex noise. Produces values in approximately [-1, 1].
 * Uses a Park-Miller LCG to shuffle a permutation table based on the seed,
 * guaranteeing deterministic output for a given seed across runs.
 */
export class SimplexNoise {
  /** Permutation table, doubled to avoid index wrapping. */
  private perm: Uint8Array
  /** Permutation table mod 8 for gradient index lookup. */
  private pm8: Uint8Array

  /**
   * Creates a new SimplexNoise instance with the given seed.
   * @param seed - Integer seed value. Same seed always produces the same noise field.
   */
  constructor(seed: number) {
    this.perm = new Uint8Array(512)
    this.pm8 = new Uint8Array(512)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    // Use seed directly as LCG input; multiplying by M causes integer seeds to collapse to 0 mod M
    let s = (Math.abs(seed) * 16807 + 1) % 2147483647 || 1
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647
      const j = Math.floor((s / 2147483647) * (i + 1))
      const tmp = p[i]!
      p[i] = p[j]!
      p[j] = tmp
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]!
      this.pm8[i] = this.perm[i]! % 8
    }
  }

  /**
   * Samples 2D simplex noise at coordinates (x, y).
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Noise value in approximately [-1, 1]
   */
  n2(x: number, y: number): number {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    const dot = (gi: number, dx: number, dy: number): number => {
      const g = GRAD3[gi]!
      return g[0] * dx + g[1] * dy
    }
    let n0 = 0,
      n1 = 0,
      n2 = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 >= 0) {
      t0 *= t0
      n0 = t0 * t0 * dot(this.pm8[ii + this.perm[jj]!]!, x0, y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 >= 0) {
      t1 *= t1
      n1 = t1 * t1 * dot(this.pm8[ii + i1 + this.perm[jj + j1]!]!, x1, y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 >= 0) {
      t2 *= t2
      n2 = t2 * t2 * dot(this.pm8[ii + 1 + this.perm[jj + 1]!]!, x2, y2)
    }
    return 70 * (n0 + n1 + n2)
  }
}
