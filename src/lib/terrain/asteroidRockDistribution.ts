import { SimplexNoise } from '@/lib/math/simplexNoise'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

export interface RockExclusionZone {
  x: number
  z: number
  radius: number
}

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

interface EjectaCrater {
  x: number
  z: number
  radius: number
  rimAbundance: number
}

export interface AsteroidRockDistributionOptions {
  seed: number
  worldSize: number
  surface: SurfaceFeatures
  exclusions?: readonly RockExclusionZone[]
  slopeAt?: (x: number, z: number) => number
}

const REFERENCE_WORLD_SIZE = 8000
const EDGE_MARGIN_FRACTION = 0.08
const MIN_DIAMETER = 2.8
const MAX_DIAMETER = 18
const LARGE_BOULDER_DIAMETER = 34
const MIN_ROCKS = 450
const MAX_ROCKS = 1600
const MIN_SPACING_FACTOR = 0.58
const MAX_ATTEMPTS_FACTOR = 12

function seededRandom(seed: number): () => number {
  let s = Math.max(1, Math.abs(seed) | 0)
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function qOfK(k: number): number {
  return 1.79 + 0.152 / Math.max(k, 0.001)
}

function sampleDiameter(k: number, minD: number, maxD: number, u: number): number {
  const q = qOfK(k)
  const bias = 1 + q * 0.3
  const t = Math.pow(u, bias)
  return minD + t * (maxD - minD)
}

function sampleBoulderDiameter(surface: SurfaceFeatures, boost: number, rng: () => number): number {
  const bigChance =
    0.08
    + surface.boulderDensity * 0.18
    + surface.roughness * 0.08
    + clamp(boost * 0.22, 0, 0.18)

  if (rng() > clamp(bigChance, 0.08, 0.4)) {
    return sampleDiameter(surface.boulderDensity + surface.roughness * 0.2, MIN_DIAMETER, MAX_DIAMETER, rng())
  }

  const t = Math.pow(rng(), 0.55)
  return MAX_DIAMETER + t * (LARGE_BOULDER_DIAMETER - MAX_DIAMETER)
}

function effectiveRockAbundance(surface: SurfaceFeatures): number {
  const base =
    0.02
    + surface.boulderDensity * 0.18
    + surface.roughness * 0.08
    + surface.craterDensity * 0.05
    - surface.dustCoverage * 0.08
  return clamp(base, 0.02, 0.28)
}

function targetRockCount(worldSize: number, k: number): number {
  const densityT = clamp((k - 0.02) / 0.26, 0, 1)
  const areaScale = Math.pow(worldSize / REFERENCE_WORLD_SIZE, 2)
  return Math.round((MIN_ROCKS + (MAX_ROCKS - MIN_ROCKS) * densityT) * areaScale)
}

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

export function generateAsteroidRockDistribution(
  options: AsteroidRockDistributionOptions,
): AsteroidRockSpawn[] {
  const { seed, worldSize, surface, slopeAt } = options
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
    const acceptRate = clamp(localK / 0.35, 0.1, 1)
    if (!isEjecta && rng() > acceptRate) continue

    let diameter = sampleBoulderDiameter(surface, boost, rng)
    if (isEjecta) {
      diameter = Math.min(LARGE_BOULDER_DIAMETER, diameter * (1 + clamp(boost * 1.8, 0.08, 0.45)))
    }

    const radius = diameter * 0.5
    if (isInsideExclusion(x, z, radius, exclusions)) continue
    if (slopeAt && slopeAt(x, z) > maxSlope) continue
    if (overlapsExisting(x, z, radius, accepted)) continue

    const tiltStrength = 0.04 + surface.roughness * 0.12
    const hdNoise = noise.n2(attempt * 0.11, attempt * 0.07)
    const heightRatio = clamp(baseHeightRatio + 0.1 + hdNoise * 0.08 + (isEjecta ? 0.05 : 0), 0.3, 0.88)
    const burialChance = 0.02 + surface.dustCoverage * 0.14 + surface.craterDensity * 0.04
    const burial = rng() < burialChance ? 0.04 + rng() * 0.12 : 0

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
