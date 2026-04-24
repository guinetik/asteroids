import { describe, expect, it } from 'vitest'
import {
  generateAsteroidRockDistribution,
  type RockExclusionZone,
} from '../asteroidRockDistribution'
import type { SurfaceFeatures } from '@/lib/asteroids/types'

const SURFACE: SurfaceFeatures = {
  craterDensity: 0.72,
  craterMaxScale: 0.28,
  boulderDensity: 0.66,
  ridgeFrequency: 0.34,
  roughness: 0.81,
  dustCoverage: 0.14,
}

describe('generateAsteroidRockDistribution', () => {
  it('is deterministic for a given seed', () => {
    const a = generateAsteroidRockDistribution({
      seed: 42,
      worldSize: 8000,
      surface: SURFACE,
    })
    const b = generateAsteroidRockDistribution({
      seed: 42,
      worldSize: 8000,
      surface: SURFACE,
    })

    expect(a).toEqual(b)
  })

  it('keeps rocks inside the playable area and out of exclusion zones', () => {
    const exclusions: RockExclusionZone[] = [
      { x: 0, z: 0, radius: 400 },
      { x: 1200, z: -900, radius: 250 },
    ]

    const rocks = generateAsteroidRockDistribution({
      seed: 7,
      worldSize: 8000,
      surface: SURFACE,
      exclusions,
    })

    expect(rocks.length).toBeGreaterThan(0)
    const half = 4000
    const margin = 8000 * 0.08

    for (const rock of rocks) {
      expect(rock.x).toBeGreaterThanOrEqual(-half + margin)
      expect(rock.x).toBeLessThanOrEqual(half - margin)
      expect(rock.z).toBeGreaterThanOrEqual(-half + margin)
      expect(rock.z).toBeLessThanOrEqual(half - margin)

      for (const zone of exclusions) {
        const dx = rock.x - zone.x
        const dz = rock.z - zone.z
        const minDist = zone.radius + rock.diameter * 0.5
        expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(minDist * minDist)
      }
    }
  })

  it('uses asteroid surface density to scale the final count', () => {
    const sparse = generateAsteroidRockDistribution({
      seed: 9,
      worldSize: 8000,
      surface: {
        ...SURFACE,
        boulderDensity: 0.05,
        roughness: 0.2,
        craterDensity: 0.15,
        dustCoverage: 0.82,
      },
    })
    const dense = generateAsteroidRockDistribution({
      seed: 9,
      worldSize: 8000,
      surface: SURFACE,
    })

    expect(dense.length).toBeGreaterThan(sparse.length)
  })

  it('rejects rocks whose position is off-surface', () => {
    // Treat positive-X half of the world as off-surface.
    const rocks = generateAsteroidRockDistribution({
      seed: 13,
      worldSize: 8000,
      surface: SURFACE,
      isValidGround: (x) => x <= 0,
    })
    expect(rocks.length).toBeGreaterThan(0)
    for (const rock of rocks) {
      expect(rock.x).toBeLessThanOrEqual(0)
    }
  })
})
