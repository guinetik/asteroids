import { describe, it, expect } from 'vitest'
import { SimplexNoise } from '../simplexNoise'

describe('SimplexNoise', () => {
  it('returns values in [-1, 1] range', () => {
    const noise = new SimplexNoise(42)
    for (let i = 0; i < 1000; i++) {
      const v = noise.n2(i * 0.1, i * 0.17)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is deterministic for same seed', () => {
    const a = new SimplexNoise(123)
    const b = new SimplexNoise(123)
    expect(a.n2(5.5, 3.2)).toBe(b.n2(5.5, 3.2))
    expect(a.n2(-10, 20)).toBe(b.n2(-10, 20))
  })

  it('produces different output for different seeds', () => {
    const a = new SimplexNoise(1)
    const b = new SimplexNoise(2)
    expect(a.n2(5.5, 3.2)).not.toBe(b.n2(5.5, 3.2))
  })

  it('returns 0 at origin (known simplex property)', () => {
    const noise = new SimplexNoise(1)
    expect(noise.n2(0, 0)).toBe(0)
  })
})
