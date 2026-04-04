import { describe, it, expect } from 'vitest'
import { MINERAL_VISUALS } from '../minerals'

describe('MINERAL_VISUALS', () => {
  it('has valid visual properties for all minerals', () => {
    for (const [name, visual] of Object.entries(MINERAL_VISUALS)) {
      expect(visual.color).toHaveLength(3)
      for (const channel of visual.color) {
        expect(channel, `${name} color channel`).toBeGreaterThanOrEqual(0)
        expect(channel, `${name} color channel`).toBeLessThanOrEqual(1)
      }
      expect(visual.metalness, `${name} metalness`).toBeGreaterThanOrEqual(0)
      expect(visual.metalness, `${name} metalness`).toBeLessThanOrEqual(1)
      expect(visual.roughness, `${name} roughness`).toBeGreaterThanOrEqual(0)
      expect(visual.roughness, `${name} roughness`).toBeLessThanOrEqual(1)
      expect(typeof visual.emissive, `${name} emissive`).toBe('boolean')
    }
  })

  it('Iron-Nickel Alloy has high metalness', () => {
    const ironNickel = MINERAL_VISUALS['Iron-Nickel Alloy']
    expect(ironNickel).toBeDefined()
    expect(ironNickel!.metalness).toBeGreaterThan(0.7)
  })

  it('Water Ice has zero metalness', () => {
    const waterIce = MINERAL_VISUALS['Water Ice']
    expect(waterIce).toBeDefined()
    expect(waterIce!.metalness).toBe(0)
  })

  it('Basaltic Lava is emissive', () => {
    const lava = MINERAL_VISUALS['Basaltic Lava']
    expect(lava).toBeDefined()
    expect(lava!.emissive).toBe(true)
  })

  it('non-emissive minerals have emissive === false', () => {
    const nonEmissive = Object.entries(MINERAL_VISUALS).filter(
      ([name]) => name !== 'Basaltic Lava',
    )
    for (const [name, visual] of nonEmissive) {
      expect(visual.emissive, `${name} should not be emissive`).toBe(false)
    }
  })

  it('contains all 20 required minerals', () => {
    const requiredMinerals = [
      'Hydrated Silicates',
      'Magnetite',
      'Iron Sulfides',
      'Carbonates',
      'Organic Compounds',
      'Olivine',
      'Pyroxene',
      'Plagioclase Feldspar',
      'Iron-Nickel Alloy',
      'Troilite',
      'Enstatite',
      'Water Ice',
      'Carbon Dioxide Ice',
      'Ammonia Hydrate',
      'Silicate Dust',
      'Sodium Chloride',
      'Basaltic Lava',
      'Sulfur Deposits',
      'Iron Oxide',
      'Volcanic Glass',
    ]
    for (const mineral of requiredMinerals) {
      expect(MINERAL_VISUALS[mineral], `missing mineral: ${mineral}`).toBeDefined()
    }
  })
})
