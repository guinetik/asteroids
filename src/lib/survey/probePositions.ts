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

/** Seeded RNG draws per probe for the outer annulus before trying nearer rings. */
const VALIDATED_PROBE_PRIMARY_ATTEMPT_BUDGET = 36

/**
 * Horizontal annulus just inside {@link MIN_RADIUS}: mesh-backed heightmaps often
 * mark peanuts / concave columns invalid outside the rock; this band still reads
 * as a low survey pass while staying off the terminal pad.
 */
const VALIDATED_PROBE_NEAR_MIN_RADIUS = 22

/** Upper bound of the near fallback annulus (strictly below {@link MIN_RADIUS}). */
const VALIDATED_PROBE_NEAR_MAX_RADIUS = 98

/** Extra draws in the near annulus when the primary ring only hits void cells. */
const VALIDATED_PROBE_NEAR_ATTEMPT_BUDGET = 36

/** Golden-angle step (radians): π(3 − √5); used only for deterministic hub wobble offsets. */
const VALIDATED_PROBE_HUB_FALLBACK_ANGLE_STEP_RAD = Math.PI * (3 - Math.sqrt(5))

/** Deterministic samples around the objective after stochastic passes fail. */
const VALIDATED_PROBE_HUB_ATTEMPT_BUDGET = 40

/** Minimum hub radius (world units) — keeps probes off the flat-zone origin. */
const VALIDATED_PROBE_HUB_MIN_RADIUS = 10

/** Maximum hub radius when spiralling from the mission site. */
const VALIDATED_PROBE_HUB_MAX_RADIUS = 88

/**
 * Minimal surface query for survey placement — typically the Heightmap baked from
 * a mesh body's downward raycasts.
 */
export interface HeightmapSurfaceQuery {
  /**
   * Returns terrain height when the bilinear neighborhood is fully valid;
   * otherwise `null` (void / off-asteroid / invalid mask).
   */
  tryHeightAt(x: number, z: number): number | null
}

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

/**
 * Draw one candidate in the horizontal annulus [`rMin`, `rMax`] around the hub.
 *
 * @param rng - Unit RNG.
 * @param centerX - Survey flat-zone center X.
 * @param centerZ - Survey flat-zone center Z.
 * @param rMin - Minimum polar radius.
 * @param rMax - Maximum polar radius.
 * @param heightmap - Validity-aware surface sampler (`tryHeightAt`, not `heightAt`).
 * @returns `(x, z)` plus stratified altitude, or `null` when `heightmap` rejects the column.
 */
function trySampleRing(
  rng: () => number,
  centerX: number,
  centerZ: number,
  rMin: number,
  rMax: number,
  heightmap: HeightmapSurfaceQuery,
): { x: number; z: number; altitude: number } | null {
  const angle = rng() * Math.PI * 2
  const radius = rMin + rng() * (rMax - rMin)
  const x = centerX + Math.cos(angle) * radius
  const z = centerZ + Math.sin(angle) * radius
  if (heightmap.tryHeightAt(x, z) === null) return null
  const altitude = MIN_ALTITUDE + rng() * (MAX_ALTITUDE - MIN_ALTITUDE)
  return { x, z, altitude }
}

/**
 * Generate probe positions that only land on **valid** heightfield columns.
 *
 * Mesh-baked asteroids mark off-body cells invalid; `Heightmap.heightAt`
 * still bilinear-blends those with neighbors and can return huge negative
 * sentinel values — probes then spawn inside the rock. This helper resamples
 * (and tightens the annulus) until every probe sits on real surface.
 *
 * @param count - Number of probes.
 * @param centerX - Flat zone center X.
 * @param centerZ - Flat zone center Z.
 * @param seed - Random seed for deterministic placement.
 * @param heightmap - Surface query (typically the level heightmap).
 * @returns Array of probe positions; length always equals `count`.
 */
export function generateValidatedProbePositions(
  count: number,
  centerX: number,
  centerZ: number,
  seed: number,
  heightmap: HeightmapSurfaceQuery,
): ProbePosition[] {
  const rng = mulberry32(seed)
  const result: ProbePosition[] = []

  for (let probeIndex = 0; probeIndex < count; probeIndex++) {
    let placed: ProbePosition | null = null

    for (let a = 0; a < VALIDATED_PROBE_PRIMARY_ATTEMPT_BUDGET && !placed; a++) {
      const sample = trySampleRing(rng, centerX, centerZ, MIN_RADIUS, MAX_RADIUS, heightmap)
      if (sample) {
        placed = { x: sample.x, y: sample.altitude, z: sample.z }
      }
    }

    for (let a = 0; a < VALIDATED_PROBE_NEAR_ATTEMPT_BUDGET && !placed; a++) {
      const sample = trySampleRing(
        rng,
        centerX,
        centerZ,
        VALIDATED_PROBE_NEAR_MIN_RADIUS,
        VALIDATED_PROBE_NEAR_MAX_RADIUS,
        heightmap,
      )
      if (sample) {
        placed = { x: sample.x, y: sample.altitude, z: sample.z }
      }
    }

    for (let a = 0; a < VALIDATED_PROBE_HUB_ATTEMPT_BUDGET && !placed; a++) {
      const sample = trySampleRing(
        rng,
        centerX,
        centerZ,
        VALIDATED_PROBE_HUB_MIN_RADIUS,
        VALIDATED_PROBE_HUB_MAX_RADIUS,
        heightmap,
      )
      if (sample) {
        placed = { x: sample.x, y: sample.altitude, z: sample.z }
      }
    }

    if (!placed && heightmap.tryHeightAt(centerX, centerZ) !== null) {
      const wobbleAngle = probeIndex * VALIDATED_PROBE_HUB_FALLBACK_ANGLE_STEP_RAD
      const wx = centerX + Math.cos(wobbleAngle) * VALIDATED_PROBE_HUB_MIN_RADIUS
      const wz = centerZ + Math.sin(wobbleAngle) * VALIDATED_PROBE_HUB_MIN_RADIUS
      const altitude = MIN_ALTITUDE + rng() * (MAX_ALTITUDE - MIN_ALTITUDE)
      if (heightmap.tryHeightAt(wx, wz) !== null) {
        placed = { x: wx, y: altitude, z: wz }
      } else {
        placed = { x: centerX, y: altitude, z: centerZ }
      }
    }

    if (!placed) {
      placed = {
        x: centerX,
        y: MIN_ALTITUDE,
        z: centerZ,
      }
    }

    result.push(placed)
  }

  return result
}
