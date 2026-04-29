import { describe, expect, it } from 'vitest'
import { MAP_ASTEROID_BELT_NEAR_LOD_CAP } from '@/lib/map/mapViewControllerConfig'
import { getMapAsteroidBeltLodFraction } from '../mapViewControllerHelpers'

describe('getMapAsteroidBeltLodFraction', () => {
  it('caps densest zoom so belt meshes stay within sane GPU budgets', () => {
    expect(getMapAsteroidBeltLodFraction(0)).toBe(MAP_ASTEROID_BELT_NEAR_LOD_CAP)
    expect(getMapAsteroidBeltLodFraction(2.49)).toBe(MAP_ASTEROID_BELT_NEAR_LOD_CAP)
  })

  it('drops density at the default map zoom band', () => {
    expect(getMapAsteroidBeltLodFraction(3)).toBe(0.35)
    expect(getMapAsteroidBeltLodFraction(-3)).toBe(0.35)
  })

  it('continues reducing density as the camera zooms farther out', () => {
    expect(getMapAsteroidBeltLodFraction(8)).toBe(0.2)
    expect(getMapAsteroidBeltLodFraction(20)).toBe(0.1)
    expect(getMapAsteroidBeltLodFraction(50)).toBe(0.05)
  })
})
