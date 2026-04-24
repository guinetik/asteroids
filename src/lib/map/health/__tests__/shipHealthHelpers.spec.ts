import { describe, it, expect } from 'vitest'
import {
  buildShipHealthConfig,
  clampInitialHullHp,
  computeThermalCaps,
} from '../shipHealthHelpers'
import type { ShipHealthConfig } from '@/lib/shipHealth'

const rawConfig: ShipHealthConfig = {
  maxHp: 100,
  healRate: 10,
  hotBoundary: 1.0,
  heatZone2Boundary: 0.5,
  heatZone3Boundary: 0.2,
  coldBoundary: 2.0,
  coldZone3Boundary: 14.0,
  tempDriftRate: 10,
  damageThreshold: 70,
  maxTempDamage: 4,
  radiationThreshold: 0.3,
  maxRadiationDamage: 15,
  radiationZone1Boundary: 0.55,
  radiationZone2Boundary: 0.35,
  radiationZone3Boundary: 0.25,
  displayThreshold: 20,
  protectedTempCap: 75,
}

describe('buildShipHealthConfig', () => {
  it('scales maxHp by the hull upgrade multiplier', () => {
    const scaled = buildShipHealthConfig(rawConfig, 2, 100)
    expect(scaled.maxHp).toBe(200)
  })

  it('multiplies every distance boundary by orbit scale', () => {
    const scaled = buildShipHealthConfig(rawConfig, 1, 100)
    expect(scaled.hotBoundary).toBeCloseTo(100, 5)
    expect(scaled.heatZone2Boundary).toBeCloseTo(50, 5)
    expect(scaled.heatZone3Boundary).toBeCloseTo(20, 5)
    expect(scaled.coldBoundary).toBeCloseTo(200, 5)
    expect(scaled.coldZone3Boundary).toBeCloseTo(1400, 5)
    expect(scaled.radiationZone1Boundary).toBeCloseTo(55, 5)
    expect(scaled.radiationZone2Boundary).toBeCloseTo(35, 5)
    expect(scaled.radiationZone3Boundary).toBeCloseTo(25, 5)
  })

  it('leaves non-distance tuning untouched', () => {
    const scaled = buildShipHealthConfig(rawConfig, 2, 100)
    expect(scaled.healRate).toBe(rawConfig.healRate)
    expect(scaled.protectedTempCap).toBe(rawConfig.protectedTempCap)
    expect(scaled.displayThreshold).toBe(rawConfig.displayThreshold)
  })
})

describe('clampInitialHullHp', () => {
  it('returns maxHp when save is undefined', () => {
    expect(clampInitialHullHp(undefined, 200)).toBe(200)
  })

  it('returns maxHp when save is zero or negative', () => {
    expect(clampInitialHullHp(0, 200)).toBe(200)
    expect(clampInitialHullHp(-50, 200)).toBe(200)
  })

  it('returns savedHp when below maxHp', () => {
    expect(clampInitialHullHp(80, 200)).toBe(80)
  })

  it('clamps savedHp to maxHp when save exceeds current cap (hull downgrade)', () => {
    expect(clampInitialHullHp(300, 200)).toBe(200)
  })
})

describe('computeThermalCaps', () => {
  const scaled = buildShipHealthConfig(rawConfig, 1, 100)

  it('returns unclamped MAX/MIN when outside every zone', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 150, heatLevel: 0, coldLevel: 0 })
    expect(caps.heatCap).toBe(100)
    expect(caps.coldCap).toBe(-100)
  })

  it('assigns heat zone 3 at sunDist below heatZone3Boundary', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 10, heatLevel: 0, coldLevel: 0 })
    // heatZone3: heatLevel 0 (no protection) → cap unchanged at 100.
    expect(caps.heatCap).toBe(100)
  })

  it('applies partial cap (protectedTempCap) when heatLevel === heatZone', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 10, heatLevel: 3, coldLevel: 0 })
    expect(caps.heatCap).toBe(75)
  })

  it('grants immunity (cap 0) when heatLevel > heatZone', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 30, heatLevel: 3, coldLevel: 0 })
    // sunDist 30 → zone 2 (between 20 and 50). heatLevel 3 > zone 2 → IMMUNE_CAP.
    expect(caps.heatCap).toBe(0)
  })

  it('does nothing at lower heatLevel vs zone', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 10, heatLevel: 1, coldLevel: 0 })
    expect(caps.heatCap).toBe(100)
  })

  it('applies cold partial cap for matching coldLevel', () => {
    // sunDist 300 → coldZone 2 (beyond 200, below 1400).
    const caps = computeThermalCaps({ config: scaled, sunDist: 300, heatLevel: 0, coldLevel: 2 })
    expect(caps.coldCap).toBe(-75)
  })

  it('grants cold immunity when coldLevel > coldZone', () => {
    const caps = computeThermalCaps({ config: scaled, sunDist: 300, heatLevel: 0, coldLevel: 3 })
    // `-IMMUNE_CAP` produces -0; compare via absolute value to sidestep +0/-0 equality.
    expect(Math.abs(caps.coldCap)).toBe(0)
  })
})
