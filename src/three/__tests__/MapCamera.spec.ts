import { describe, it, expect } from 'vitest'
import { computeFrustum, lerpFrustum, easeInOut } from '../MapCamera'

describe('computeFrustum', () => {
  it('returns symmetric frustum for 16:9 aspect ratio', () => {
    const f = computeFrustum(2600, 16 / 9)
    expect(f.left).toBeCloseTo(-2600)
    expect(f.right).toBeCloseTo(2600)
    expect(f.top).toBeCloseTo(2600 / (16 / 9))
    expect(f.bottom).toBeCloseTo(-2600 / (16 / 9))
  })

  it('returns symmetric frustum for 1:1 aspect ratio', () => {
    const f = computeFrustum(100, 1)
    expect(f.left).toBeCloseTo(-100)
    expect(f.right).toBeCloseTo(100)
    expect(f.top).toBeCloseTo(100)
    expect(f.bottom).toBeCloseTo(-100)
  })
})

describe('lerpFrustum', () => {
  it('returns initial size at t=0', () => {
    expect(lerpFrustum(50, 2600, 0)).toBeCloseTo(50)
  })

  it('returns final size at t=1', () => {
    expect(lerpFrustum(50, 2600, 1)).toBeCloseTo(2600)
  })

  it('returns midpoint at t=0.5', () => {
    expect(lerpFrustum(50, 2600, 0.5)).toBeCloseTo((50 + 2600) / 2)
  })
})

describe('easeInOut', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOut(0)).toBeCloseTo(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeInOut(1)).toBeCloseTo(1)
  })

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })

  it('is below 0.5 at t=0.25', () => {
    expect(easeInOut(0.25)).toBeLessThan(0.5)
  })
})
