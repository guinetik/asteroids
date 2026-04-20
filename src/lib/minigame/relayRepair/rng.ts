/**
 * Deterministic PRNG utilities shared by the relay repair puzzle variance
 * system. Same input always produces the same output — safe to use for
 * reproducible puzzle layouts keyed by mission id.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

/**
 * FNV-1a 32-bit hash of a string. Stable across runs; returns an unsigned
 * 32-bit integer suitable for seeding `mulberry32`.
 *
 * @param s - Input string.
 * @returns Unsigned 32-bit hash.
 */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * Mulberry32 PRNG. Returns a function that yields deterministic floats in
 * [0, 1) given the seed.
 *
 * @param seed - Unsigned 32-bit seed.
 * @returns A zero-argument function that returns the next float.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
