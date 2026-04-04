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
})
