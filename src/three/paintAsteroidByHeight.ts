/**
 * Vertex-color bake for asteroid GLBs.
 *
 * Walks every mesh in the loaded scene and assigns a vertex color sampled
 * from a 2-tone palette derived from the asteroid's `baseColor`. The lookup
 * value blends two signals:
 *
 *   1. **Position-noise** (dominant): multi-octave value noise sampled in
 *      local object space. Provides organic "rocky" variation that is
 *      independent of the asteroid's radial profile, so even near-spherical
 *      bodies (Bennu) read with rich tone variation rather than flat color.
 *   2. **Radial altitude** (subtle): each vertex's distance from the asteroid
 *      center, normalized to the model's altitude range. Adds a touch of
 *      "peaks bright, valleys dark" character that still reads on the
 *      silhouette without dominating the look.
 *
 * The result is a cell-shaded, texture-free surface with no possibility of
 * pixel blowout — the palette is bounded by `baseColor * VALLEY_TONE` and
 * `baseColor * PEAK_TONE`.
 *
 * @author guinetik
 * @date 2026-04-25
 */
import * as THREE from 'three'

/** Default multiplier on `baseColor` at the lowest sampled lookup (valleys). */
const DEFAULT_VALLEY_TONE = 0.55
/** Default multiplier on `baseColor` at the highest sampled lookup (peaks). */
const DEFAULT_PEAK_TONE = 1.25
/**
 * Per-vertex multiplicative jitter range, centered on 1. `0.08` = ±4%.
 * Adds subtle high-frequency noise on top of the macro gradient so even
 * adjacent vertices in a flat region don't share an identical color.
 */
const VARIATION_RANGE = 0.08
/**
 * Weight of the noise term in the gradient lookup (`0..1`). The remainder is
 * the radial altitude term. Higher = more organic surface variation, less
 * "peaks bright" silhouette character.
 */
const NOISE_WEIGHT = 1.75
/**
 * Base frequency of the multi-octave noise, in cycles per object-space unit.
 * GLBs are normalized near unit radius, so ~3 cycles across the body gives
 * broad continent-sized features per octave. Each successive octave doubles
 * the frequency.
 */
const NOISE_FREQUENCY = 5
/** Number of FBM octaves summed. More = richer detail, slower bake. */
const NOISE_OCTAVES = 8
/** Per-octave amplitude falloff. 0.5 = standard FBM. */
const NOISE_GAIN = 0.5

/**
 * 32-bit integer hash mixer. Used to seed the value-noise lattice without
 * pulling in a noise library.
 *
 * @param x - Integer lattice X.
 * @param y - Integer lattice Y.
 * @param z - Integer lattice Z.
 * @returns Pseudo-random value in `[0, 1)`.
 */
function hashLattice(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 374761393)
  h += Math.imul(y | 0, 668265263)
  h += Math.imul(z | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Smooth interpolant `3t² − 2t³`, the classic Hermite curve used to blend
 * between value-noise lattice samples without sharp axis-aligned bands.
 *
 * @param t - Interpolant in `[0, 1]`.
 * @returns Smoothed value in `[0, 1]`.
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Trilinear value noise on a unit lattice. Output centered on `0.5`.
 *
 * @param x - Sample X.
 * @param y - Sample Y.
 * @param z - Sample Z.
 * @returns Value in `[0, 1]`.
 */
function valueNoise3D(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = smoothstep(x - xi)
  const v = smoothstep(y - yi)
  const w = smoothstep(z - zi)
  const c000 = hashLattice(xi, yi, zi)
  const c100 = hashLattice(xi + 1, yi, zi)
  const c010 = hashLattice(xi, yi + 1, zi)
  const c110 = hashLattice(xi + 1, yi + 1, zi)
  const c001 = hashLattice(xi, yi, zi + 1)
  const c101 = hashLattice(xi + 1, yi, zi + 1)
  const c011 = hashLattice(xi, yi + 1, zi + 1)
  const c111 = hashLattice(xi + 1, yi + 1, zi + 1)
  const x00 = c000 + (c100 - c000) * u
  const x10 = c010 + (c110 - c010) * u
  const x01 = c001 + (c101 - c001) * u
  const x11 = c011 + (c111 - c011) * u
  const y0 = x00 + (x10 - x00) * v
  const y1 = x01 + (x11 - x01) * v
  return y0 + (y1 - y0) * w
}

/**
 * Multi-octave fractal noise (FBM). Sums `octaves` levels of value noise at
 * doubling frequency and halving amplitude (for the default gain).
 *
 * @param x - Sample X.
 * @param y - Sample Y.
 * @param z - Sample Z.
 * @returns Value in roughly `[0, 1]` — clamped by caller as needed.
 */
function fbm(x: number, y: number, z: number): number {
  let total = 0
  let amplitude = 1
  let frequency = 1
  let maxValue = 0
  for (let i = 0; i < NOISE_OCTAVES; i++) {
    total += valueNoise3D(x * frequency, y * frequency, z * frequency) * amplitude
    maxValue += amplitude
    amplitude *= NOISE_GAIN
    frequency *= 2
  }
  return total / maxValue
}

/**
 * Deterministic 1-D hash → `[0, 1)`. Used for per-vertex jitter.
 *
 * @param i - Vertex index.
 * @returns Pseudo-random value in `[0, 1)`.
 */
function vertexHash(i: number): number {
  let x = i * 374761393 + 668265263
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/**
 * Paint every mesh in `root` with vertex colors from a 2-tone palette,
 * driven by FBM noise on local position with a subtle radial-altitude
 * contribution. Strips embedded color maps so the painted vertex colors
 * drive the look. Existing normal/roughness maps stay intact for relief.
 *
 * @param root - Loaded GLB scene root (the asteroid mesh group).
 * @param baseColor - Per-asteroid tint as `[r, g, b]` in `[0, 1]`.
 * @param valleyTone - Multiplier on `baseColor` at the darkest vertex
 * (radial valleys + low FBM). Defaults to `0.55`. Push this up toward 1.0
 * for uniformly-bright bodies (ice, fresh snow, polished metal) where
 * peak/valley contrast wouldn't make physical sense.
 * @param peakTone - Multiplier on `baseColor` at the brightest vertex.
 * Defaults to `1.25`. Final color is clamped at 1.0 per channel.
 */
export function paintAsteroidByHeight(
  root: THREE.Object3D,
  baseColor: readonly [number, number, number],
  valleyTone: number = DEFAULT_VALLEY_TONE,
  peakTone: number = DEFAULT_PEAK_TONE,
): void {
  // First pass: gather min/max radial distance for the altitude term.
  let minR = Infinity
  let maxR = -Infinity
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!positions) return
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i)
      const z = positions.getZ(i)
      const r = Math.sqrt(x * x + y * y + z * z)
      if (r < minR) minR = r
      if (r > maxR) maxR = r
    }
  })

  if (!isFinite(minR) || !isFinite(maxR) || maxR <= minR) return

  const range = maxR - minR
  const lowR = baseColor[0] * valleyTone
  const lowG = baseColor[1] * valleyTone
  const lowB = baseColor[2] * valleyTone
  const highR = baseColor[0] * peakTone
  const highG = baseColor[1] * peakTone
  const highB = baseColor[2] * peakTone

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const geom = mesh.geometry
    const positions = geom.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!positions) return

    const colors = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i)
      const z = positions.getZ(i)
      const r = Math.sqrt(x * x + y * y + z * z)
      const altitudeT = (r - minR) / range
      const noiseT = fbm(x * NOISE_FREQUENCY, y * NOISE_FREQUENCY, z * NOISE_FREQUENCY)
      const t = noiseT * NOISE_WEIGHT + altitudeT * (1 - NOISE_WEIGHT)
      const tClamped = t < 0 ? 0 : t > 1 ? 1 : t
      const jitter = 1 + (vertexHash(i) - 0.5) * VARIATION_RANGE
      colors[i * 3] = (lowR + (highR - lowR) * tClamped) * jitter
      colors[i * 3 + 1] = (lowG + (highG - lowG) * tClamped) * jitter
      colors[i * 3 + 2] = (lowB + (highB - lowB) * tClamped) * jitter
    }
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue
      mat.map?.dispose()
      mat.map = null
      mat.color.setRGB(1, 1, 1)
      mat.vertexColors = true
      mat.needsUpdate = true
    }
  })
}
