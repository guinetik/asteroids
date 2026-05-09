/**
 * Tests for habitat backdrop sun horizon alignment math.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  computeSunDistanceWeightedAngularBoost,
  computeSunYOffsetForDeckHorizon,
  firstHorizontalRayExitDistance,
  HABITAT_BACKDROP_DEFAULT_FOOTPRINT,
} from '@/lib/habitat/habitatBackdropSunHorizon'
import { ORBIT_SCALE } from '@/lib/planets/constants'

describe('computeSunDistanceWeightedAngularBoost', () => {
  const BASE_BOOST = 2

  it('matches base boost at Mercury-class distance', () => {
    const mercuryDist = 0.387 * ORBIT_SCALE
    expect(
      computeSunDistanceWeightedAngularBoost({
        shipToSunDistance: mercuryDist,
        orbitScale: ORBIT_SCALE,
        baseAngularBoost: BASE_BOOST,
      }),
    ).toBeCloseTo(BASE_BOOST, 5)
  })

  it('is substantially smaller at Mars-class distance than at Mercury', () => {
    const mercuryDist = 0.387 * ORBIT_SCALE
    const marsDist = 1.524 * ORBIT_SCALE
    const atMercury = computeSunDistanceWeightedAngularBoost({
      shipToSunDistance: mercuryDist,
      orbitScale: ORBIT_SCALE,
      baseAngularBoost: BASE_BOOST,
    })
    const atMars = computeSunDistanceWeightedAngularBoost({
      shipToSunDistance: marsDist,
      orbitScale: ORBIT_SCALE,
      baseAngularBoost: BASE_BOOST,
    })
    expect(atMars).toBeLessThan(atMercury * 0.55)
    expect(atMars).toBeGreaterThan(0)
  })
})

describe('firstHorizontalRayExitDistance', () => {
  it('hits the side wall first when looking from centre toward −X, −Z', () => {
    const ox = 0
    const oz = 0
    const len = Math.hypot(-64, -39)
    const ux = -64 / len
    const uz = -39 / len
    const t = firstHorizontalRayExitDistance(ox, oz, ux, uz, 5, 8)
    expect(t).not.toBeNull()
    expect(t!).toBeGreaterThan(5)
    expect(t!).toBeLessThan(6.5)
  })
})

describe('computeSunYOffsetForDeckHorizon', () => {
  it('raises a low sun toward the deck horizon from cabin-centre eye height', () => {
    const bias = computeSunYOffsetForDeckHorizon({
      sunPosition: { x: -64, y: -49, z: -39 },
      referenceEye: { x: 0, y: 1.7, z: 0 },
      footprint: HABITAT_BACKDROP_DEFAULT_FOOTPRINT,
    })
    expect(bias).toBeGreaterThan(15)
    expect(bias).toBeLessThan(45)
  })

  it('returns zero when sun shares the eye XZ (horizontal distance degenerate)', () => {
    expect(
      computeSunYOffsetForDeckHorizon({
        sunPosition: { x: 0, y: -40, z: 0 },
        referenceEye: { x: 0, y: 1.7, z: 0 },
        footprint: HABITAT_BACKDROP_DEFAULT_FOOTPRINT,
      }),
    ).toBe(0)
  })
})
