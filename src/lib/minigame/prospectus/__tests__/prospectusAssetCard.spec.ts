import { describe, it, expect } from 'vitest'
import { buildProspectusAssetCard } from '@/lib/minigame/prospectus/prospectusAssetCard'

describe('buildProspectusAssetCard', () => {
  it('binds Hektor catalog values', () => {
    const card = buildProspectusAssetCard('hektor')
    expect(card).not.toBeNull()
    expect(card!.assetRef).toBe('ASSET 2306-J')
    expect(card!.crossRef).toContain('624 HEKTOR')
    expect(card!.region).toMatch(/Jovian Trojans/i)
    expect(card!.diameterKm).toBeGreaterThan(0)
    expect(card!.composition).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.any(String), percentage: expect.any(Number) }),
      ]),
    )
    // Recommendation flavor is fixed copy.
    expect(card!.recommendation).toMatch(/extraction queue/)
    expect(card!.recommendation).toMatch(/demolition cycle/)
  })

  it('returns null for unknown body ids', () => {
    expect(buildProspectusAssetCard('unknown-body')).toBeNull()
  })
})
