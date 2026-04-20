import { describe, it, expect } from 'vitest'
import { computeQuality } from '../quality'
import {
  IDEAL_PATH_LENGTH,
  LOCK_THRESHOLD,
  QUALITY_CAP_WITHOUT_SINK,
  QUALITY_SCALE,
} from '../constants'

describe('computeQuality', () => {
  it('returns 1 when the sink is reached regardless of active-cell count', () => {
    expect(computeQuality(0, true)).toBe(1)
    expect(computeQuality(IDEAL_PATH_LENGTH, true)).toBe(1)
  })

  it('returns 0 when no cells are active and the sink is not reached', () => {
    expect(computeQuality(0, false)).toBe(0)
  })

  it('scales linearly below the cap', () => {
    const half = Math.floor(IDEAL_PATH_LENGTH / 2)
    const expected = (half / IDEAL_PATH_LENGTH) * QUALITY_SCALE
    expect(computeQuality(half, false)).toBeCloseTo(expected, 6)
  })

  it('caps at QUALITY_CAP_WITHOUT_SINK when sink is not reached', () => {
    const huge = IDEAL_PATH_LENGTH * 10
    expect(computeQuality(huge, false)).toBe(QUALITY_CAP_WITHOUT_SINK)
  })

  it('never crosses LOCK_THRESHOLD without sink', () => {
    for (let n = 0; n <= IDEAL_PATH_LENGTH * 3; n++) {
      expect(computeQuality(n, false)).toBeLessThan(LOCK_THRESHOLD)
    }
  })
})
