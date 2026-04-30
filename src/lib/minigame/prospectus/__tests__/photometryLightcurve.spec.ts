import { describe, it, expect } from 'vitest'
import { generatePhotometryLightcurve } from '@/lib/minigame/prospectus/photometryLightcurve'

describe('generatePhotometryLightcurve', () => {
  it('produces a stable plot for a fixed seed', () => {
    const a = generatePhotometryLightcurve('hektor-photometry', 64)
    const b = generatePhotometryLightcurve('hektor-photometry', 64)
    expect(a).toEqual(b)
    expect(a).toHaveLength(64)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('produces different plots for different seeds', () => {
    const a = generatePhotometryLightcurve('hektor-photometry', 64)
    const b = generatePhotometryLightcurve('saturn-photometry', 64)
    expect(a).not.toEqual(b)
  })
})
