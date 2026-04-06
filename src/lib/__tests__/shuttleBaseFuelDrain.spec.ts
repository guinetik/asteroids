/**
 * Tests for passive shuttle fuel drain.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { describe, expect, it } from 'vitest'
import { computeShuttleBaseFuelDrain, SHUTTLE_BASE_FUEL_DRAIN_RATE } from '../shuttleBaseFuelDrain'

describe('computeShuttleBaseFuelDrain', () => {
  it('drains three fuel units per second by default', () => {
    expect(computeShuttleBaseFuelDrain(2, true)).toBeCloseTo(6, 5)
  })

  it('returns zero for negative frame time', () => {
    expect(computeShuttleBaseFuelDrain(-1, true)).toBe(0)
  })

  it('returns zero when passive shuttle drain is disabled', () => {
    expect(computeShuttleBaseFuelDrain(2, false)).toBe(0)
  })

  it('exports the passive shuttle systems drain rate', () => {
    expect(SHUTTLE_BASE_FUEL_DRAIN_RATE).toBe(3)
  })
})
