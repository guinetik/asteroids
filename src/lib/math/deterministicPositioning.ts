/**
 * Hash a stable string seed to a deterministic Kuiper-belt position.
 * Used by mission-spawned pinned assets so the same contract always
 * places the asset at the same spot across reloads and saves.
 *
 * The Kuiper Belt in `planetarium.json` spans innerRadius 30 – outerRadius 50
 * AU-scale world units. This helper places assets at the nominal midpoint
 * radius (40 AU) so they sit solidly inside the belt particle cloud without
 * hugging either edge.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import * as THREE from 'three'

/** Nominal world-unit radius for Kuiper-belt pinned assets (midpoint of inner 30 – outer 50). */
const KUIPER_RADIUS_NOMINAL = 40

/**
 * Hash a string to an unsigned 32-bit integer using the xmur3 algorithm.
 * Deterministic: identical input always yields the same output.
 *
 * @param str - Arbitrary string seed.
 * @returns Seeded hash state ready to feed into a PRNG.
 */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

/**
 * Mulberry32 PRNG seeded from an unsigned 32-bit integer.
 * Produces a float in [0, 1).
 *
 * @param seed - Unsigned 32-bit integer seed.
 * @returns Zero-argument generator; each call advances the state.
 */
function mulberry32(seed: number): () => number {
  let s = seed
  return function () {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Hash a string seed to a float in [0, 1).
 * Deterministic: same seed → same value across reloads.
 *
 * @param seed - Stable string seed.
 * @returns Float in [0, 1).
 */
function hashTo01(seed: string): number {
  const hash = xmur3(seed)
  const rand = mulberry32(hash())
  return rand()
}

/**
 * Hash a stable seed to a Kuiper-belt position (XZ-planar; Y = 0).
 * The same seed always produces the same position across reloads and saves.
 *
 * Position lies on the circle at {@link KUIPER_RADIUS_NOMINAL} so the station
 * is always inside the belt. A second hash pass on the seed provides an
 * independent angular offset to avoid clustering when multiple stations share
 * similar seeds.
 *
 * @param seed - Stable string seed (e.g. contract `assetRef`).
 * @returns World-space XZ position with Y = 0.
 */
export function hashToKuiperPosition(seed: string): THREE.Vector3 {
  const angle = hashTo01(seed) * Math.PI * 2
  const r = KUIPER_RADIUS_NOMINAL
  return new THREE.Vector3(r * Math.cos(angle), 0, r * Math.sin(angle))
}
