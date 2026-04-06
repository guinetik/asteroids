/**
 * Tests for slingshot burst/settle speed profiling.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, expect, it } from 'vitest'
import { getSlingshotSettleSpeed } from '../slingshotBurstProfile'

describe('getSlingshotSettleSpeed', () => {
  it('starts at the burst speed', () => {
    expect(getSlingshotSettleSpeed(25, 2.5, 2, 0)).toBeCloseTo(25, 5)
  })

  it('ends at the final settled speed', () => {
    expect(getSlingshotSettleSpeed(25, 2.5, 2, 2)).toBeCloseTo(2.5, 5)
  })

  it('interpolates linearly through the settle window', () => {
    expect(getSlingshotSettleSpeed(25, 2.5, 2, 1)).toBeCloseTo(13.75, 5)
  })

  it('clamps to the settled speed after the settle window', () => {
    expect(getSlingshotSettleSpeed(25, 2.5, 2, 4)).toBeCloseTo(2.5, 5)
  })

  it('falls back to the final speed when settle duration is zero', () => {
    expect(getSlingshotSettleSpeed(25, 2.5, 0, 0)).toBeCloseTo(2.5, 5)
  })
})
