import { describe, it, expect } from 'vitest'
import { getThermalZoneBands } from '../mapThermalZones'
import type { ShipHealthConfig } from '../shipHealth'

const baseCfg: ShipHealthConfig = {
  maxHp: 100,
  healRate: 10,
  hotBoundary: 128,
  heatZone2Boundary: 83,
  heatZone3Boundary: 38,
  coldBoundary: 300,
  coldZone3Boundary: 2100,
  tempDriftRate: 10,
  damageThreshold: 70,
  maxTempDamage: 4,
  radiationThreshold: 0.3,
  maxRadiationDamage: 15,
  displayThreshold: 20,
  protectedTempCap: 75,
}

describe('getThermalZoneBands', () => {
  it('returns five bands in inner-to-outer order', () => {
    const bands = getThermalZoneBands(baseCfg)
    expect(bands.map((b) => b.kind)).toEqual(['hot3', 'hot2', 'hot1', 'cold2', 'cold3'])
  })

  it('hot3 starts at the Sun (inner=0) and ends at heatZone3Boundary', () => {
    const [hot3] = getThermalZoneBands(baseCfg)
    expect(hot3!.innerWorldRadius).toBe(0)
    expect(hot3!.outerWorldRadius).toBe(38)
  })

  it('heat bands tile without gaps from 0 to hotBoundary', () => {
    const [hot3, hot2, hot1] = getThermalZoneBands(baseCfg)
    expect(hot3!.outerWorldRadius).toBe(hot2!.innerWorldRadius)
    expect(hot2!.outerWorldRadius).toBe(hot1!.innerWorldRadius)
    expect(hot1!.outerWorldRadius).toBe(baseCfg.hotBoundary)
  })

  it('leaves a safe gap between hotBoundary and coldBoundary', () => {
    const [, , hot1, cold2] = getThermalZoneBands(baseCfg)
    expect(hot1!.outerWorldRadius).toBeLessThan(cold2!.innerWorldRadius)
  })

  it('cold bands tile from coldBoundary outward', () => {
    const [, , , cold2, cold3] = getThermalZoneBands(baseCfg)
    expect(cold2!.innerWorldRadius).toBe(baseCfg.coldBoundary)
    expect(cold2!.outerWorldRadius).toBe(cold3!.innerWorldRadius)
  })

  it('cold3 outer radius extends well past the boundary so it reaches the map edge', () => {
    const bands = getThermalZoneBands(baseCfg)
    const cold3 = bands[bands.length - 1]!
    expect(cold3.outerWorldRadius / cold3.innerWorldRadius).toBeGreaterThanOrEqual(5)
  })
})
