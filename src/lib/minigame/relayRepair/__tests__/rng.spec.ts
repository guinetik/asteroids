import { describe, it, expect } from 'vitest'
import { hashString, mulberry32 } from '../rng'

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('earth_l1_relay_reterm')).toBe(hashString('earth_l1_relay_reterm'))
  })

  it('returns different hashes for different inputs', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
  })

  it('returns an unsigned 32-bit integer', () => {
    const h = hashString('some-mission')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
    expect(Number.isInteger(h)).toBe(true)
  })
})

describe('mulberry32', () => {
  it('returns floats in [0, 1)', () => {
    const rng = mulberry32(42)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 10; i++) expect(a()).toBeCloseTo(b(), 10)
  })

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })
})
