/**
 * Procedural scatter of surface rocks and ejecta for asteroid heightmaps.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/asteroid-lander-gdd.md
 */
import { SimplexNoise } from '@/lib/math/simplexNoise'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

/** Circular keep-out zone (landing pads, structures) where rocks may not spawn. */
export interface RockExclusionZone {
  x: number
  z: number
  radius: number
}

/** One placed rock instance consumed by the terrain mesh builder. */
export interface AsteroidRockSpawn {
  x: number
  z: number
  diameter: number
  heightRatio: number
  burial: number
  rotationY: number
  tiltX: number
  tiltZ: number
  isEjecta: boolean
}

/** Synthetic crater used only to bias ejecta rock density near rims. */
interface EjectaCrater {
  x: number
  z: number
  radius: number
  rimAbundance: number
}

/** Knobs for {@link generateAsteroidRockDistribution}. */
export interface AsteroidRockDistributionOptions {
  seed: number
  worldSize: number
  surface: SurfaceFeatures
  exclusions?: readonly RockExclusionZone[]
  slopeAt?: (x: number, z: number) => number
  /**
   * Whether the given world coordinate is on real surface. When provided, rocks
   * sampled to an invalid cell are rejected before any other check — ensures
   * mesh-backed asteroid terrain doesn't spawn rocks floating in the void.
   */
  isValidGround?: (x: number, z: number) => boolean
}

const REFERENCE_WORLD_SIZE = 8000
const EDGE_MARGIN_FRACTION = 0.08
/** Smallest plausible surface boulder (world units); below this FPS mining reads as gravel. */
const MIN_DIAMETER = 2.35
const MAX_DIAMETER = 12.5
const LARGE_BOULDER_DIAMETER = 22
/** Rock count when `targetRockCount` interpolation hits its sparse extreme (`densityT === 0`). */
const MIN_ROCKS = 200
/** Rock count when `targetRockCount` interpolation hits its dense extreme (`densityT === 1`). */
const MAX_ROCKS = 785
const MIN_SPACING_FACTOR = 0.58
const MAX_ATTEMPTS_FACTOR = 20
/**
 * Floor on the area scaling factor used by {@link targetRockCount}. Small
 * asteroids still need enough rocks to make gather missions playable, so
 * we don't let `(worldSize/REFERENCE)²` shrink the target below half.
 */
const MIN_AREA_SCALE = 0.5
/**
 * Floor on the per-cell acceptance probability for non-ejecta samples.
 * `targetCount` already encodes density; the sieve only adds spatial
 * variation around ejecta. Keeping this high means we don't waste the
 * attempts budget on a redundant rate-limiter.
 */
const MIN_NON_EJECTA_ACCEPT_RATE = 0.6
/** Denominator that maps `localK` to a 0→1 acceptance probability. */
const ACCEPT_RATE_K_SCALE = 0.1
const MIN_BURIAL_FRACTION = 0.14
const MAX_BURIAL_FRACTION = 0.38
const BASE_BURIAL_FRACTION = 0.16
const DUST_BURIAL_FRACTION = 0.14
const CRATER_BURIAL_FRACTION = 0.05
const RANDOM_BURIAL_FRACTION = 0.12
const EJECTA_BURIAL_MULTIPLIER = 0.65

/** Park–Miller style PRNG for deterministic rock placement. */
function seededRandom(seed: number): () => number {
  let s = Math.max(1, Math.abs(seed) | 0)
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** Clamps `value` to `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Shape parameter for diameter sampling vs abundance `k`. */
function qOfK(k: number): number {
  return 1.79 + 0.152 / Math.max(k, 0.001)
}

/** Samples a rock diameter from a biased power distribution. */
function sampleDiameter(k: number, minD: number, maxD: number, u: number): number {
  const q = qOfK(k)
  const bias = 1 + q * 0.3
  const t = Math.pow(u, bias)
  return minD + t * (maxD - minD)
}

/** Picks standard vs “hero” boulder sizes from surface traits and ejecta boost. */
function sampleBoulderDiameter(surface: SurfaceFeatures, boost: number, rng: () => number): number {
  const bigChance =
    0.025 + surface.boulderDensity * 0.08 + surface.roughness * 0.035 + clamp(boost * 0.12, 0, 0.09)

  if (rng() > clamp(bigChance, 0.025, 0.18)) {
    return sampleDiameter(
      surface.boulderDensity + surface.roughness * 0.2,
      MIN_DIAMETER,
      MAX_DIAMETER,
      rng(),
    )
  }

  const t = Math.pow(rng(), 0.55)
  return MAX_DIAMETER + t * (LARGE_BOULDER_DIAMETER - MAX_DIAMETER)
}

/** Maps authored surface traits to a 0→1 rock-density scalar. */
function effectiveRockAbundance(surface: SurfaceFeatures): number {
  const base =
    0.012 +
    surface.boulderDensity * 0.1 +
    surface.roughness * 0.045 +
    surface.craterDensity * 0.032 -
    surface.dustCoverage * 0.065
  return clamp(base, 0.02, 0.28)
}

/** Target number of rocks scaled by world area and abundance. */
function targetRockCount(worldSize: number, k: number): number {
  const densityT = clamp((k - 0.02) / 0.26, 0, 1)
  const areaScale = Math.max(
    MIN_AREA_SCALE,
    Math.pow(worldSize / REFERENCE_WORLD_SIZE, 2),
  )
  return Math.round((MIN_ROCKS + (MAX_ROCKS - MIN_ROCKS) * densityT) * areaScale)
}

/** Builds a handful of fake crater rims that boost nearby rock odds. */
function generateEjectaCraters(
  worldSize: number,
  surface: SurfaceFeatures,
  seed: number,
): EjectaCrater[] {
  const rng = seededRandom(seed ^ 0x51f15e)
  const count = Math.max(1, Math.round(2 + surface.craterDensity * 7))
  const half = worldSize * 0.5
  const margin = worldSize * EDGE_MARGIN_FRACTION
  const craters: EjectaCrater[] = []

  for (let i = 0; i < count; i++) {
    const radiusBase = worldSize * (0.025 + surface.craterMaxScale * 0.08)
    const radius = radiusBase * (0.55 + rng())
    const freshness = rng()
    craters.push({
      x: -half + margin + rng() * (worldSize - margin * 2),
      z: -half + margin + rng() * (worldSize - margin * 2),
      radius,
      rimAbundance: 0.035 + freshness * 0.11,
    })
  }

  return craters
}

/** Returns relative ejecta weight and whether the sample lies in ejecta terrain. */
function ejectaBoost(
  x: number,
  z: number,
  craters: readonly EjectaCrater[],
): { boost: number; isEjecta: boolean } {
  let maxBoost = 0
  let isEjecta = false

  for (const crater of craters) {
    const dx = x - crater.x
    const dz = z - crater.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    const normalized = dist / crater.radius
    if (normalized < 0.85 || normalized > 4.5) continue

    const rimDist = Math.max(0.12, normalized - 0.85)
    const boost = crater.rimAbundance / (rimDist * rimDist * rimDist)
    if (boost > maxBoost) {
      maxBoost = boost
      isEjecta = true
    }
  }

  return { boost: maxBoost, isEjecta }
}

/** True when a rock footprint intersects a player / POI exclusion disc. */
function isInsideExclusion(
  x: number,
  z: number,
  radius: number,
  exclusions: readonly RockExclusionZone[],
): boolean {
  for (const zone of exclusions) {
    const dx = x - zone.x
    const dz = z - zone.z
    const limit = zone.radius + radius
    if (dx * dx + dz * dz < limit * limit) return true
  }
  return false
}

/** Minimum-spacing check against rocks already accepted this generation. */
function overlapsExisting(
  x: number,
  z: number,
  radius: number,
  accepted: readonly AsteroidRockSpawn[],
): boolean {
  for (const rock of accepted) {
    const dx = x - rock.x
    const dz = z - rock.z
    const minDist = (radius + rock.diameter * 0.5) * MIN_SPACING_FACTOR
    if (dx * dx + dz * dz < minDist * minDist) return true
  }
  return false
}

/** Generates a rock list for one asteroid surface — deterministic from `seed`. */
export function generateAsteroidRockDistribution(
  options: AsteroidRockDistributionOptions,
): AsteroidRockSpawn[] {
  const { seed, worldSize, surface, slopeAt, isValidGround } = options
  const exclusions = options.exclusions ?? []
  const rng = seededRandom(seed + 4813)
  const noise = new SimplexNoise(seed + 777)
  const half = worldSize * 0.5
  const margin = worldSize * EDGE_MARGIN_FRACTION
  const k = effectiveRockAbundance(surface)
  const targetCount = targetRockCount(worldSize, k)
  const maxAttempts = targetCount * MAX_ATTEMPTS_FACTOR
  const craters = generateEjectaCraters(worldSize, surface, seed)
  const accepted: AsteroidRockSpawn[] = []
  const baseHeightRatio = 0.28 + surface.roughness * 0.22 + surface.boulderDensity * 0.08
  const maxSlope = 0.9 + (1 - surface.roughness) * 1.6 + surface.dustCoverage * 1.1

  for (let attempt = 0; accepted.length < targetCount && attempt < maxAttempts; attempt++) {
    const nx = rng() * 2 - 1
    const nz = rng() * 2 - 1
    const jitterX = noise.n2(attempt * 0.17, 11.3) * worldSize * 0.015
    const jitterZ = noise.n2(7.1, attempt * 0.19) * worldSize * 0.015
    const x = clamp(nx * (half - margin) + jitterX, -half + margin, half - margin)
    const z = clamp(nz * (half - margin) + jitterZ, -half + margin, half - margin)

    const { boost, isEjecta } = ejectaBoost(x, z, craters)
    const localK = clamp(k + boost, 0.02, 0.35)
    const acceptRate = isEjecta
      ? 1
      : clamp(localK / ACCEPT_RATE_K_SCALE, MIN_NON_EJECTA_ACCEPT_RATE, 1)
    if (rng() > acceptRate) continue

    let diameter = sampleBoulderDiameter(surface, boost, rng)
    if (isEjecta) {
      diameter = Math.min(LARGE_BOULDER_DIAMETER, diameter * (1 + clamp(boost * 1.8, 0.08, 0.45)))
    }

    const radius = diameter * 0.5
    if (isValidGround && !isValidGround(x, z)) continue
    if (isInsideExclusion(x, z, radius, exclusions)) continue
    if (slopeAt && slopeAt(x, z) > maxSlope) continue
    if (overlapsExisting(x, z, radius, accepted)) continue

    const tiltStrength = 0.04 + surface.roughness * 0.12
    const hdNoise = noise.n2(attempt * 0.11, attempt * 0.07)
    const heightRatio = clamp(
      baseHeightRatio + 0.1 + hdNoise * 0.08 + (isEjecta ? 0.05 : 0),
      0.3,
      0.88,
    )
    const burialBase =
      BASE_BURIAL_FRACTION +
      surface.dustCoverage * DUST_BURIAL_FRACTION +
      surface.craterDensity * CRATER_BURIAL_FRACTION +
      rng() * RANDOM_BURIAL_FRACTION
    const burial = clamp(
      burialBase * (isEjecta ? EJECTA_BURIAL_MULTIPLIER : 1),
      MIN_BURIAL_FRACTION,
      MAX_BURIAL_FRACTION,
    )

    accepted.push({
      x,
      z,
      diameter,
      heightRatio,
      burial: isEjecta ? burial * 0.4 : burial,
      rotationY: rng() * Math.PI * 2,
      tiltX: (rng() * 2 - 1) * tiltStrength,
      tiltZ: (rng() * 2 - 1) * tiltStrength,
      isEjecta,
    })
  }

  return accepted
}
