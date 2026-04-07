/**
 * Generates deterministic probe positions for a gravitometric survey.
 *
 * Probes are scattered randomly within a cylindrical volume above a
 * flat zone center. Uses a seeded PRNG for reproducibility.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */

/** Minimum horizontal distance from zone center (world units). */
const MIN_RADIUS = 100

/** Maximum horizontal distance from zone center (world units). */
const MAX_RADIUS = 500

/** Minimum probe altitude above ground (world units). */
const MIN_ALTITUDE = 30

/** Maximum probe altitude above ground (world units). */
const MAX_ALTITUDE = 150

/** Simple position output (no Three.js dependency in domain code). */
export interface ProbePosition {
  /** World X. */
  x: number
  /** World Y (altitude above ground). */
  y: number
  /** World Z. */
  z: number
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * @param seed - Integer seed.
 * @returns Function that returns the next random number in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generate probe positions scattered above a flat zone.
 *
 * @param count - Number of probes.
 * @param centerX - Flat zone center X.
 * @param centerZ - Flat zone center Z.
 * @param seed - Random seed for deterministic placement.
 * @returns Array of probe positions.
 */
export function generateProbePositions(
  count: number,
  centerX: number,
  centerZ: number,
  seed: number,
): ProbePosition[] {
  const rng = mulberry32(seed)
  const positions: ProbePosition[] = []

  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2
    const radius = MIN_RADIUS + rng() * (MAX_RADIUS - MIN_RADIUS)
    const altitude = MIN_ALTITUDE + rng() * (MAX_ALTITUDE - MIN_ALTITUDE)

    positions.push({
      x: centerX + Math.cos(angle) * radius,
      y: altitude,
      z: centerZ + Math.sin(angle) * radius,
    })
  }

  return positions
}
