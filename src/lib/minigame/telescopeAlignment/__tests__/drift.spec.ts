import { describe, it, expect } from 'vitest'
import { computeDrift } from '../drift'
import {
  MAX_FOCUS,
  MAX_POINTING,
  DRIFT_FOCUS,
  DRIFT_AZIMUTH,
  DRIFT_AMP_PCT,
} from '../constants'

describe('computeDrift', () => {
  it('returns zero drift at t=0 when phase aligns with sin(0)=0 for focus', () => {
    expect(computeDrift(0, DRIFT_FOCUS, MAX_FOCUS)).toBeCloseTo(0, 6)
  })

  it('never exceeds amp * range over 10 simulated seconds', () => {
    let maxSeen = 0
    for (let t = 0; t < 10; t += 0.016) {
      const d = Math.abs(computeDrift(t, DRIFT_AZIMUTH, MAX_POINTING))
      if (d > maxSeen) maxSeen = d
    }
    expect(maxSeen).toBeLessThanOrEqual(DRIFT_AMP_PCT * MAX_POINTING + 1e-9)
  })

  it('varies with time', () => {
    const a = computeDrift(0.25, DRIFT_AZIMUTH, MAX_POINTING)
    const b = computeDrift(0.75, DRIFT_AZIMUTH, MAX_POINTING)
    expect(a).not.toBe(b)
  })
})
