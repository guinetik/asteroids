import { describe, it, expect } from 'vitest'
import {
  computeFrustum,
  lerpFrustum,
  easeInOut,
  lerpCameraAnchor,
  computeTargetFrustumHalfSize,
} from '../MapCamera'

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

describe('lerpCameraAnchor', () => {
  it('returns ship start position at t=0 (map just opening)', () => {
    expect(lerpCameraAnchor(4510, 0)).toBeCloseTo(4510)
  })

  it('returns origin (sun) at t=1 (map fully open)', () => {
    expect(lerpCameraAnchor(4510, 1)).toBeCloseTo(0)
  })

  it('returns halfway point at t=0.5', () => {
    expect(lerpCameraAnchor(4510, 0.5)).toBeCloseTo(2255)
  })

  it('handles negative ship coordinates (opposite side of sun)', () => {
    expect(lerpCameraAnchor(-2000, 0)).toBeCloseTo(-2000)
    expect(lerpCameraAnchor(-2000, 1)).toBeCloseTo(0)
  })

  it('returns 0 for any t when ship is already at origin', () => {
    expect(lerpCameraAnchor(0, 0)).toBeCloseTo(0)
    expect(lerpCameraAnchor(0, 0.5)).toBeCloseTo(0)
    expect(lerpCameraAnchor(0, 1)).toBeCloseTo(0)
  })
})

describe('computeTargetFrustumHalfSize', () => {
  const ASPECT = 16 / 9

  it('clamps to minimum when ship is near the sun', () => {
    // Earth orbit (~150 world units) is inside the minimum frustum.
    expect(computeTargetFrustumHalfSize(150, 0, ASPECT)).toBeCloseTo(1350)
  })

  it('clamps to minimum when ship is exactly at the sun', () => {
    expect(computeTargetFrustumHalfSize(0, 0, ASPECT)).toBeCloseTo(1350)
  })

  it('scales with margin when ship is displaced along X (Neptune on horizontal axis)', () => {
    // 4510 world units along X → 4510 * 1.2 = 5412
    expect(computeTargetFrustumHalfSize(4510, 0, ASPECT)).toBeCloseTo(5412)
  })

  it('scales by aspect when ship is displaced along Z (vertical screen axis)', () => {
    // Vertical extent is halfSize/aspect, so Z-displacement requires halfSize × aspect.
    // 4510 * (16/9) * 1.2 ≈ 9621
    expect(computeTargetFrustumHalfSize(0, 4510, ASPECT)).toBeCloseTo(4510 * ASPECT * 1.2)
  })

  it('picks the larger of the two axis requirements', () => {
    // Z-axis requirement (3000 * aspect * 1.2 ≈ 6400) beats X-axis (4000 * 1.2 = 4800).
    const expected = Math.max(4000, 3000 * ASPECT) * 1.2
    expect(computeTargetFrustumHalfSize(4000, 3000, ASPECT)).toBeCloseTo(expected)
  })

  it('uses minimum when scaled distance falls below it', () => {
    // Ship at 1000 world units along X → 1000 * 1.2 = 1200 < 1350, so minimum wins.
    expect(computeTargetFrustumHalfSize(1000, 0, ASPECT)).toBeCloseTo(1350)
  })

  it('handles negative ship coordinates (opposite side of sun)', () => {
    expect(computeTargetFrustumHalfSize(-4510, 0, ASPECT)).toBeCloseTo(5412)
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
