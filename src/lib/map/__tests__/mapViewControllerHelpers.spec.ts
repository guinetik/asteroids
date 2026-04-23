import { describe, expect, it } from 'vitest'
import { getMapAsteroidBeltLodFraction } from '../mapViewControllerHelpers'

describe('getMapAsteroidBeltLodFraction', () => {
  it('keeps full density only for very close inspection', () => {
    expect(getMapAsteroidBeltLodFraction(0)).toBe(1)
    expect(getMapAsteroidBeltLodFraction(2.49)).toBe(1)
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
