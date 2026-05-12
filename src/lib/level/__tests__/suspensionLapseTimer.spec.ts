import { describe, it, expect } from 'vitest'
import { createSuspensionLapseTimer, tickSuspensionLapseTimer } from '../suspensionLapseTimer'

describe('SuspensionLapseTimer', () => {
  it('starts at the configured total and not expired', () => {
    const t = createSuspensionLapseTimer(60)
    expect(t.remaining).toBe(60)
    expect(t.expired).toBe(false)
  })

  it('decrements remaining by dt and flips expired at zero', () => {
    let t = createSuspensionLapseTimer(2)
    t = tickSuspensionLapseTimer(t, 1.5)
    expect(t.remaining).toBeCloseTo(0.5)
    expect(t.expired).toBe(false)
    t = tickSuspensionLapseTimer(t, 1)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })

  it('stays at zero and expired once fired', () => {
    let t = createSuspensionLapseTimer(1)
    t = tickSuspensionLapseTimer(t, 5)
    t = tickSuspensionLapseTimer(t, 5)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })

  it('ignores zero or negative dt', () => {
    let t = createSuspensionLapseTimer(10)
    t = tickSuspensionLapseTimer(t, 0)
    expect(t.remaining).toBe(10)
    t = tickSuspensionLapseTimer(t, -5)
    expect(t.remaining).toBe(10)
  })
})
