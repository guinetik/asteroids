import { describe, it, expect, beforeEach } from 'vitest'
import { computeTelemetry, resetTelemetryHistory } from '../telemetry'
import type { OrbitalElements } from '../types'

const earthOrbit: OrbitalElements = {
  semiMajorAxis: 300,
  eccentricity: 0.0167,
  inclination: 0,
  longitudeOfAscendingNode: 0,
  argumentOfPeriapsis: 102.937 * (Math.PI / 180),
  period: 365.25,
}

const marsOrbit: OrbitalElements = {
  semiMajorAxis: 370,
  eccentricity: 0.0934,
  inclination: 1.85 * (Math.PI / 180),
  longitudeOfAscendingNode: 49.558 * (Math.PI / 180),
  argumentOfPeriapsis: 286.502 * (Math.PI / 180),
  period: 686.97,
}

describe('computeTelemetry', () => {
  beforeEach(() => {
    resetTelemetryHistory()
  })

  it('returns all 13 fields', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result).toHaveProperty('massEarths')
    expect(result).toHaveProperty('radiusKm')
    expect(result).toHaveProperty('solarDistanceAU')
    expect(result).toHaveProperty('orbitalVelocityKmS')
    expect(result).toHaveProperty('trueAnomalyDeg')
    expect(result).toHaveProperty('meanAnomalyDeg')
    expect(result).toHaveProperty('localSolarTime')
    expect(result).toHaveProperty('lightTravelMin')
    expect(result).toHaveProperty('orbitalPeriodDays')
    expect(result).toHaveProperty('phaseAngleDeg')
    expect(result).toHaveProperty('orbitProgressPie')
    expect(result).toHaveProperty('velocitySparkline')
    expect(result).toHaveProperty('distanceSparkline')
  })

  it('returns Earth mass as 1.0', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.massEarths).toBe(1.0)
  })

  it('returns Earth radius as 6371.0 km', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.radiusKm).toBe(6371.0)
  })

  it('returns Mars orbital period as 686.97 days', () => {
    const result = computeTelemetry('mars', marsOrbit, 100)
    expect(result.orbitalPeriodDays).toBe(686.97)
  })

  it('returns Earth solar distance near 1 AU (0.95–1.05)', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.solarDistanceAU).toBeGreaterThan(0.95)
    expect(result.solarDistanceAU).toBeLessThan(1.05)
  })

  it('returns Earth orbital velocity roughly 28–31 km/s', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.orbitalVelocityKmS).toBeGreaterThan(28)
    expect(result.orbitalVelocityKmS).toBeLessThan(31)
  })

  it('returns true anomaly in [0, 360)', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.trueAnomalyDeg).toBeGreaterThanOrEqual(0)
    expect(result.trueAnomalyDeg).toBeLessThan(360)
  })

  it('returns local solar time in HH:MM:SS format', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.localSolarTime).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('returns orbit progress pie in {p:NN} format', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.orbitProgressPie).toMatch(/^\{p:\d+\}$/)
  })

  it('returns light travel time roughly 7–9 minutes for Earth', () => {
    const result = computeTelemetry('earth', earthOrbit, 100)
    expect(result.lightTravelMin).toBeGreaterThan(7)
    expect(result.lightTravelMin).toBeLessThan(9)
  })
})

describe('resetTelemetryHistory', () => {
  it('clears history without error', () => {
    // First build up some history
    for (let i = 0; i < 5; i++) {
      computeTelemetry('earth', earthOrbit, i * 30)
    }
    expect(() => resetTelemetryHistory()).not.toThrow()
    // After reset a fresh call should still work
    const result = computeTelemetry('earth', earthOrbit, 0)
    expect(result.velocitySparkline).toBeDefined()
    expect(result.distanceSparkline).toBeDefined()
  })
})
