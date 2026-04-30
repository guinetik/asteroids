import { describe, it, expect } from 'vitest'
import { generateDanHistogram } from '@/lib/minigame/prospectus/danHistogram'

describe('generateDanHistogram', () => {
  it('produces a stable histogram for a fixed seed', () => {
    const a = generateDanHistogram('hektor-dan', 24)
    const b = generateDanHistogram('hektor-dan', 24)
    expect(a).toEqual(b)
    expect(a).toHaveLength(24)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('produces different histograms for different seeds', () => {
    expect(generateDanHistogram('hektor-dan', 24)).not.toEqual(
      generateDanHistogram('saturn-dan', 24),
    )
  })
})
