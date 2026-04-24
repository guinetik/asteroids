import { describe, it, expect } from 'vitest'
import { Heightmap } from '../heightmap'

describe('Heightmap', () => {
  it('stores and retrieves exact grid values', () => {
    const hm = new Heightmap(4, 100)
    hm.set(0, 0, 5.0)
    hm.set(3, 3, 10.0)
    expect(hm.get(0, 0)).toBe(5.0)
    expect(hm.get(3, 3)).toBe(10.0)
  })

  it('returns 0 for out-of-bounds queries', () => {
    const hm = new Heightmap(4, 100)
    expect(hm.heightAt(9999, 9999)).toBe(0)
    expect(hm.heightAt(-9999, -9999)).toBe(0)
  })

  it('bilinear interpolates between grid cells', () => {
    const hm = new Heightmap(2, 100)
    hm.set(0, 0, 0)
    hm.set(1, 0, 10)
    hm.set(0, 1, 0)
    hm.set(1, 1, 10)
    const center = hm.heightAt(0, 0)
    expect(center).toBeCloseTo(5, 0)
  })

  it('computes normal pointing up on flat terrain', () => {
    const hm = new Heightmap(8, 100)
    const n = hm.normalAt(0, 0)
    expect(n.x).toBeCloseTo(0, 1)
    expect(n.y).toBeCloseTo(1, 1)
    expect(n.z).toBeCloseTo(0, 1)
  })

  it('computes slope of 0 on flat terrain', () => {
    const hm = new Heightmap(8, 100)
    expect(hm.slopeAt(0, 0)).toBeCloseTo(0, 2)
  })

  it('computes non-zero slope on tilted terrain', () => {
    const hm = new Heightmap(8, 100)
    for (let gz = 0; gz < 8; gz++) {
      for (let gx = 0; gx < 8; gx++) {
        hm.set(gx, gz, gx * 5)
      }
    }
    expect(hm.slopeAt(0, 0)).toBeGreaterThan(0)
  })

  describe('validity tracking', () => {
    it('defaults all cells to valid so procedural terrain paths are unaffected', () => {
      const hm = new Heightmap(4, 100)
      expect(hm.isValid(0, 0)).toBe(true)
      expect(hm.isValid(3, 3)).toBe(true)
      expect(hm.isValidAt(0, 0)).toBe(true)
    })

    it('marks cells invalid via setValid and reports them via isValid', () => {
      const hm = new Heightmap(4, 100)
      hm.setValid(1, 2, false)
      expect(hm.isValid(1, 2)).toBe(false)
      expect(hm.isValid(0, 0)).toBe(true)
    })

    it('isValidAt maps world coords to the nearest cell', () => {
      const hm = new Heightmap(4, 100)
      hm.setValid(0, 0, false)
      // worldSize 100 centred at 0, resolution 4 → cell at (0,0) covers roughly (-50,-50)..(-16.67,-16.67)
      expect(hm.isValidAt(-40, -40)).toBe(false)
      expect(hm.isValidAt(40, 40)).toBe(true)
    })

    it('out-of-bounds isValidAt returns false', () => {
      const hm = new Heightmap(4, 100)
      expect(hm.isValidAt(9999, 9999)).toBe(false)
    })
  })
})
