import { describe, it, expect } from 'vitest'
import {
  cargoThermalToleranceBand,
  classifyThermalZone,
  computeOvershoot,
  createCargoState,
  tickCargo,
  createDeliveryTimer,
  tickDeliveryTimer,
} from '../cargoIntegrity'

describe('cargoThermalToleranceBand', () => {
  it('returns a valid baseline band at L1/L1', () => {
    const band = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    expect(band.innerSafeRadius).toBeGreaterThan(0)
    expect(band.outerSafeRadius).toBeGreaterThan(band.innerSafeRadius)
  })

  it('moves the inner edge sunward (smaller radius) as heatLevel increases', () => {
    const l1 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    const l3 = cargoThermalToleranceBand({ heatLevel: 3, freezeLevel: 1 })
    expect(l3.innerSafeRadius).toBeLessThan(l1.innerSafeRadius)
  })

  it('moves the outer edge outward as freezeLevel increases', () => {
    const l1 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 1 })
    const l3 = cargoThermalToleranceBand({ heatLevel: 1, freezeLevel: 3 })
    expect(l3.outerSafeRadius).toBeGreaterThan(l1.outerSafeRadius)
  })

  it('clamps the inner edge so it never crosses zero', () => {
    const extreme = cargoThermalToleranceBand({ heatLevel: 99, freezeLevel: 1 })
    expect(extreme.innerSafeRadius).toBeGreaterThan(0)
  })
})

describe('classifyThermalZone', () => {
  const band = { innerSafeRadius: 2, outerSafeRadius: 14 }

  it('returns safe inside the band', () => {
    expect(classifyThermalZone(8, band)).toBe('safe')
  })

  it('returns hot inside the inner edge', () => {
    expect(classifyThermalZone(1, band)).toBe('hot')
  })

  it('returns cold outside the outer edge', () => {
    expect(classifyThermalZone(20, band)).toBe('cold')
  })

  it('treats the band edges as safe (inclusive)', () => {
    expect(classifyThermalZone(band.innerSafeRadius, band)).toBe('safe')
    expect(classifyThermalZone(band.outerSafeRadius, band)).toBe('safe')
  })
})

describe('computeOvershoot', () => {
  const band = { innerSafeRadius: 2, outerSafeRadius: 14 }

  it('returns 0 in-band', () => {
    expect(computeOvershoot(8, band)).toBe(0)
  })

  it('returns positive distance past the hot edge', () => {
    expect(computeOvershoot(1, band)).toBe(1)
  })

  it('returns positive distance past the cold edge', () => {
    expect(computeOvershoot(20, band)).toBe(6)
  })
})

describe('createCargoState / tickCargo', () => {
  it('starts at 100% integrity', () => {
    expect(createCargoState().integrity).toBe(100)
  })

  it('does not lose integrity in the safe zone', () => {
    const c0 = createCargoState()
    const c1 = tickCargo(c0, { dt: 5, zone: 'safe', overshoot: 0 })
    expect(c1.integrity).toBe(100)
  })

  it('bleeds integrity in the hot zone proportional to overshoot and dt', () => {
    const c0 = createCargoState()
    const c1 = tickCargo(c0, { dt: 1, zone: 'hot', overshoot: 1 })
    expect(c1.integrity).toBeLessThan(100)
    const c2 = tickCargo(c1, { dt: 1, zone: 'hot', overshoot: 1 })
    expect(c2.integrity).toBeLessThan(c1.integrity)
  })

  it('bleeds faster with larger overshoot', () => {
    const a = tickCargo(createCargoState(), { dt: 1, zone: 'hot', overshoot: 1 })
    const b = tickCargo(createCargoState(), { dt: 1, zone: 'hot', overshoot: 5 })
    expect(100 - b.integrity).toBeGreaterThan(100 - a.integrity)
  })

  it('clamps integrity at zero', () => {
    let c = createCargoState()
    for (let i = 0; i < 1000; i++) {
      c = tickCargo(c, { dt: 1, zone: 'hot', overshoot: 10 })
    }
    expect(c.integrity).toBe(0)
  })

  it('is a no-op when dt is zero or negative', () => {
    const c0 = createCargoState()
    expect(tickCargo(c0, { dt: 0, zone: 'hot', overshoot: 5 }).integrity).toBe(100)
    expect(tickCargo(c0, { dt: -1, zone: 'hot', overshoot: 5 }).integrity).toBe(100)
  })

  it('cold zone bleeds the same as hot for equal overshoot', () => {
    const hot = tickCargo(createCargoState(), { dt: 1, zone: 'hot', overshoot: 3 })
    const cold = tickCargo(createCargoState(), { dt: 1, zone: 'cold', overshoot: 3 })
    expect(hot.integrity).toBe(cold.integrity)
  })
})

describe('createDeliveryTimer / tickDeliveryTimer', () => {
  it('starts at total and not expired', () => {
    const t = createDeliveryTimer(240)
    expect(t.remaining).toBe(240)
    expect(t.total).toBe(240)
    expect(t.expired).toBe(false)
  })

  it('decrements remaining and flips expired at zero', () => {
    let t = createDeliveryTimer(3)
    t = tickDeliveryTimer(t, 2)
    expect(t.remaining).toBe(1)
    expect(t.expired).toBe(false)
    t = tickDeliveryTimer(t, 2)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })

  it('stays at zero once expired', () => {
    let t = createDeliveryTimer(1)
    t = tickDeliveryTimer(t, 100)
    t = tickDeliveryTimer(t, 100)
    expect(t.remaining).toBe(0)
    expect(t.expired).toBe(true)
  })

  it('is a no-op for zero or negative dt', () => {
    const t0 = createDeliveryTimer(60)
    expect(tickDeliveryTimer(t0, 0).remaining).toBe(60)
    expect(tickDeliveryTimer(t0, -5).remaining).toBe(60)
  })
})
