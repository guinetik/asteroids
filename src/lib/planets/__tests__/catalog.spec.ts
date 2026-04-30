import { describe, it, expect } from 'vitest'
import {
  SUN,
  PLANETS,
  PLANET_IDS,
  PINNED_BODIES,
  PINNED_BODY_IDS,
  ASTEROID_BELTS,
  getPinnedBody,
  getPlanet,
} from '../catalog'

describe('SUN', () => {
  it('has id "sun"', () => {
    expect(SUN.id).toBe('sun')
  })

  it('has name "Sun"', () => {
    expect(SUN.name).toBe('Sun')
  })

  it('has shader type "star"', () => {
    expect(SUN.shader.type).toBe('star')
  })

  it('has a positive displayRadius', () => {
    expect(SUN.displayRadius).toBeGreaterThan(0)
  })
})

describe('PLANETS', () => {
  it('has length 10', () => {
    expect(PLANETS).toHaveLength(10)
  })

  it('is ordered by the order field', () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i]!.order).toBeGreaterThan(PLANETS[i - 1]!.order)
    }
  })

  it('has unique ids', () => {
    const ids = PLANETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has the correct id sequence [mercury..pluto]', () => {
    const expectedIds = [
      'mercury',
      'venus',
      'earth',
      'mars',
      'ceres',
      'jupiter',
      'saturn',
      'uranus',
      'neptune',
      'pluto',
    ]
    expect(PLANETS.map((p) => p.id)).toEqual(expectedIds)
  })

  it('has orbital angles in radians (Earth argumentOfPeriapsis ~1.797 rad, not ~102 deg)', () => {
    const earth = PLANETS.find((p) => p.id === 'earth')!
    expect(earth.orbit.argumentOfPeriapsis).toBeCloseTo(1.797, 2)
    expect(earth.orbit.argumentOfPeriapsis).toBeLessThan(Math.PI * 2)
  })

  it('has axial tilt in radians (Earth ~0.409 rad, not ~23.44 deg)', () => {
    const earth = PLANETS.find((p) => p.id === 'earth')!
    expect(earth.axialTilt).toBeCloseTo(0.409, 2)
    expect(earth.axialTilt).toBeLessThan(Math.PI * 2)
  })

  it('no planet has a "prose" property', () => {
    for (const planet of PLANETS) {
      expect((planet as unknown as Record<string, unknown>)['prose']).toBeUndefined()
    }
  })

  it('no planet has a "useModel" property', () => {
    for (const planet of PLANETS) {
      expect((planet as unknown as Record<string, unknown>)['useModel']).toBeUndefined()
    }
  })

  it('Saturn has a ring with positive innerRadius', () => {
    const saturn = PLANETS.find((p) => p.id === 'saturn')!
    expect(saturn.ring).toBeDefined()
    expect(saturn.ring!.innerRadius).toBeGreaterThan(0)
  })

  it('Earth has 1 moon named "Moon"', () => {
    const earth = PLANETS.find((p) => p.id === 'earth')!
    expect(earth.moons).toHaveLength(1)
    expect(earth.moons[0]!.name).toBe('Moon')
  })

  it('Jupiter has 4 moons: Io, Europa, Ganymede, Callisto', () => {
    const jupiter = PLANETS.find((p) => p.id === 'jupiter')!
    expect(jupiter.moons).toHaveLength(4)
    const moonNames = jupiter.moons.map((m) => m.name)
    expect(moonNames).toContain('Io')
    expect(moonNames).toContain('Europa')
    expect(moonNames).toContain('Ganymede')
    expect(moonNames).toContain('Callisto')
  })
})

describe('PLANET_IDS', () => {
  it('has length 10', () => {
    expect(PLANET_IDS).toHaveLength(10)
  })

  it('all entries are strings', () => {
    for (const id of PLANET_IDS) {
      expect(typeof id).toBe('string')
    }
  })
})

describe('PINNED_BODIES', () => {
  it('contains Hektor as a pinned GLB-backed body', () => {
    const hektor = getPinnedBody('hektor')

    expect(PINNED_BODIES).toHaveLength(1)
    expect(PINNED_BODY_IDS).toEqual(['hektor'])
    expect(hektor.name).toBe('624 Hektor')
    expect(hektor.type).toBe('Jupiter Trojan')
    expect(hektor.modelUrl).toBe('/models/hektor.glb')
    expect(hektor.noKiosks).toBe(true)
  })

  it('sizes Hektor smaller than Ceres', () => {
    const hektor = getPinnedBody('hektor')
    const ceres = getPlanet('ceres')

    expect(hektor.displayRadius).toBeLessThan(ceres.displayRadius)
  })

  it('converts Hektor orbital phase and tilt from degrees to radians', () => {
    const hektor = getPinnedBody('hektor')

    expect(hektor.orbit.meanAnomalyOffset).toBeCloseTo(Math.PI / 3)
    expect(hektor.axialTilt).toBeCloseTo((78 * Math.PI) / 180)
  })
})

describe('ASTEROID_BELTS', () => {
  it('has length 2', () => {
    expect(ASTEROID_BELTS).toHaveLength(2)
  })

  it('contains main-belt and kuiper-belt', () => {
    const ids = ASTEROID_BELTS.map((b) => b.id)
    expect(ids).toContain('main-belt')
    expect(ids).toContain('kuiper-belt')
  })

  it('has orbital angles in radians', () => {
    for (const belt of ASTEROID_BELTS) {
      // inclination in JSON is <= 1.8 degrees, so in radians must be < 0.1
      expect(belt.orbit.inclination).toBeLessThan(0.1)
      expect(belt.orbit.inclination).toBeGreaterThanOrEqual(0)
    }
  })

  it('no belt has a "glbFile" property', () => {
    for (const belt of ASTEROID_BELTS) {
      expect((belt as unknown as Record<string, unknown>)['glbFile']).toBeUndefined()
    }
  })
})

describe('getPlanet', () => {
  it('returns the correct planet for a known id', () => {
    const earth = getPlanet('earth')
    expect(earth.id).toBe('earth')
    expect(earth.name).toBe('Earth')
  })

  it('throws for an unknown id', () => {
    expect(() => getPlanet('unknown-planet')).toThrow('Unknown planet id: "unknown-planet"')
  })
})

describe('getPinnedBody', () => {
  it('throws for an unknown id', () => {
    expect(() => getPinnedBody('unknown-body')).toThrow('Unknown pinned body id: "unknown-body"')
  })
})
