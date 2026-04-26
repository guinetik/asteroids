import { describe, it, expect } from 'vitest'
import { ASTEROID_CATALOG, getAsteroidById } from '../catalog'
import { MINERAL_VISUALS } from '../minerals'

const EXPECTED_ASTEROID_IDS = [['bennu'], ['eros'], ['itokawa'], ['psyche'], ['xg7'], ['kr3']]

describe('ASTEROID_CATALOG', () => {
  it('contains all playable asteroids', () => {
    expect(ASTEROID_CATALOG).toHaveLength(EXPECTED_ASTEROID_IDS.length)
  })

  it('has unique IDs', () => {
    const ids = ASTEROID_CATALOG.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" has all required string fields',
    (id) => {
      const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)
      expect(asteroid).toBeDefined()
      expect(asteroid!.name).toBeTruthy()
      expect(asteroid!.designation).toBeTruthy()
      expect(asteroid!.type).toBeTruthy()
      expect(asteroid!.biome).toBeTruthy()
      expect(asteroid!.description).toBeTruthy()
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" composition sums to 100',
    (id) => {
      const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)!
      const sum = asteroid.composition.reduce((acc, m) => acc + m.percentage, 0)
      expect(sum).toBe(100)
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" has valid shape ranges',
    (id) => {
      const s = ASTEROID_CATALOG.find((a) => a.id === id)!.shape
      expect(s.elongation).toBeGreaterThanOrEqual(1)
      expect(s.lobeCount).toBeGreaterThanOrEqual(1)
      expect(s.irregularity).toBeGreaterThanOrEqual(0)
      expect(s.irregularity).toBeLessThanOrEqual(1)
      for (const d of s.dimensions) {
        expect(d).toBeGreaterThan(0)
      }
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" has valid surface ranges',
    (id) => {
      const s = ASTEROID_CATALOG.find((a) => a.id === id)!.surface
      const fields = [
        s.craterDensity,
        s.craterMaxScale,
        s.boulderDensity,
        s.ridgeFrequency,
        s.roughness,
        s.dustCoverage,
      ]
      for (const f of fields) {
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
      }
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" has valid visual ranges',
    (id) => {
      const v = ASTEROID_CATALOG.find((a) => a.id === id)!.visual
      expect(v.albedo).toBeGreaterThanOrEqual(0)
      expect(v.albedo).toBeLessThanOrEqual(1)
      // baseColor channels are unbounded above — they double as a tint
      // multiplier in UV mode (e.g. Psyche's gold tint goes >1 to push
      // warmer than the texture's RGB allows on its own).
      for (const ch of v.baseColor) {
        expect(ch).toBeGreaterThanOrEqual(0)
      }
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" has valid physical ranges',
    (id) => {
      const p = ASTEROID_CATALOG.find((a) => a.id === id)!.physical
      expect(p.mass).toBeGreaterThan(0)
      expect(p.density).toBeGreaterThan(0)
      expect(p.surfaceGravity).toBeGreaterThan(0)
      expect(p.rotationPeriod).toBeGreaterThan(0)
      expect(p.surfaceTemperature).toBeGreaterThan(0)
    },
  )

  it.each(EXPECTED_ASTEROID_IDS)(
    'asteroid "%s" minerals all exist in MINERAL_VISUALS',
    (id) => {
      const asteroid = ASTEROID_CATALOG.find((a) => a.id === id)!
      for (const mineral of asteroid.composition) {
        expect(MINERAL_VISUALS[mineral.name]).toBeDefined()
      }
    },
  )
})

describe('getAsteroidById', () => {
  it('returns the correct asteroid for a known ID', () => {
    const bennu = getAsteroidById('bennu')
    expect(bennu).toBeDefined()
    expect(bennu!.name).toBe('Bennu')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getAsteroidById('nonexistent')).toBeUndefined()
  })
})
