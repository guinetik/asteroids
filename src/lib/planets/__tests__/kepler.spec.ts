import { describe, it, expect } from 'vitest'
import {
  solveKeplerEquation,
  meanAnomaly,
  trueAnomalyFromEccentric,
  keplerRadius,
  orbitalPosition3D,
  orbitPathPoints,
} from '../kepler'
import type { OrbitalElements } from '../types'

const TWO_PI = 2 * Math.PI

// ---------------------------------------------------------------------------
// solveKeplerEquation
// ---------------------------------------------------------------------------
describe('solveKeplerEquation', () => {
  it('e=0 returns M unchanged', () => {
    const M = 1.2
    expect(solveKeplerEquation(M, 0)).toBeCloseTo(M, 10)
  })

  it('M=0 returns E=0', () => {
    expect(solveKeplerEquation(0, 0.5)).toBeCloseTo(0, 10)
  })

  it('satisfies Kepler equation for e=0.2056 (Mercury)', () => {
    const e = 0.2056
    const M = 1.0
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('satisfies Kepler equation for e=0.5', () => {
    const e = 0.5
    const M = 2.0
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('satisfies Kepler equation for e=0.9 (highly eccentric)', () => {
    const e = 0.9
    const M = 0.5
    const E = solveKeplerEquation(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('converges across full [0, 2pi] range for e=0.9', () => {
    const e = 0.9
    const steps = 20
    // Use i < steps to avoid the 2π boundary where M % TWO_PI wraps to 0
    for (let i = 0; i < steps; i++) {
      const M = (TWO_PI * i) / steps
      const E = solveKeplerEquation(M, e)
      expect(E - e * Math.sin(E)).toBeCloseTo(M, 6)
    }
  })
})

// ---------------------------------------------------------------------------
// meanAnomaly
// ---------------------------------------------------------------------------
describe('meanAnomaly', () => {
  it('returns 0 at epoch', () => {
    expect(meanAnomaly(365, 0, 0)).toBeCloseTo(0, 10)
  })

  it('returns 2pi after one period', () => {
    expect(meanAnomaly(365, 365, 0)).toBeCloseTo(TWO_PI, 10)
  })

  it('default epoch is 0', () => {
    expect(meanAnomaly(365, 365)).toBeCloseTo(TWO_PI, 10)
  })

  it('returns pi at half period', () => {
    expect(meanAnomaly(365, 182.5, 0)).toBeCloseTo(Math.PI, 10)
  })

  it('handles non-zero epoch', () => {
    const epoch = 100
    expect(meanAnomaly(365, epoch, epoch)).toBeCloseTo(0, 10)
    expect(meanAnomaly(365, epoch + 365, epoch)).toBeCloseTo(TWO_PI, 10)
  })
})

// ---------------------------------------------------------------------------
// trueAnomalyFromEccentric
// ---------------------------------------------------------------------------
describe('trueAnomalyFromEccentric', () => {
  it('e=0 returns E unchanged', () => {
    const E = 1.5
    expect(trueAnomalyFromEccentric(E, 0)).toBeCloseTo(E, 10)
  })

  it('E=0 returns 0', () => {
    expect(trueAnomalyFromEccentric(0, 0.5)).toBeCloseTo(0, 10)
  })

  it('E=pi returns pi', () => {
    expect(trueAnomalyFromEccentric(Math.PI, 0.5)).toBeCloseTo(Math.PI, 10)
  })

  it('nu > E for 0 < E < pi when e > 0', () => {
    const E = 1.0
    const nu = trueAnomalyFromEccentric(E, 0.5)
    expect(nu).toBeGreaterThan(E)
  })

  it('round-trip with half-angle formula', () => {
    const e = 0.6
    const E = 1.2
    const nu = trueAnomalyFromEccentric(E, e)
    // Invert: tan(E/2) = sqrt((1-e)/(1+e)) * tan(nu/2)
    const tanHalfE = Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)
    const ERecovered = 2 * Math.atan(tanHalfE)
    expect(ERecovered).toBeCloseTo(E, 8)
  })
})

// ---------------------------------------------------------------------------
// keplerRadius
// ---------------------------------------------------------------------------
describe('keplerRadius', () => {
  it('e=0 returns a always', () => {
    const a = 5
    expect(keplerRadius(a, 0, 0)).toBeCloseTo(a, 10)
    expect(keplerRadius(a, 0, 1.5)).toBeCloseTo(a, 10)
    expect(keplerRadius(a, 0, Math.PI)).toBeCloseTo(a, 10)
  })

  it('nu=0 gives periapsis a(1-e)', () => {
    const a = 10
    const e = 0.3
    expect(keplerRadius(a, e, 0)).toBeCloseTo(a * (1 - e), 8)
  })

  it('nu=pi gives apoapsis a(1+e)', () => {
    const a = 10
    const e = 0.3
    expect(keplerRadius(a, e, Math.PI)).toBeCloseTo(a * (1 + e), 8)
  })

  it('periapsis < apoapsis', () => {
    const a = 7
    const e = 0.5
    expect(keplerRadius(a, e, 0)).toBeLessThan(keplerRadius(a, e, Math.PI))
  })

  it('satisfies conic section equation r(1 + e·cos(nu)) = a(1-e²)', () => {
    const a = 8
    const e = 0.4
    const nu = 1.2
    const r = keplerRadius(a, e, nu)
    expect(r * (1 + e * Math.cos(nu))).toBeCloseTo(a * (1 - e * e), 8)
  })
})

// ---------------------------------------------------------------------------
// orbitalPosition3D
// ---------------------------------------------------------------------------
describe('orbitalPosition3D', () => {
  const circularEcliptic: OrbitalElements = {
    semiMajorAxis: 10,
    eccentricity: 0,
    inclination: 0,
    longitudeOfAscendingNode: 0,
    argumentOfPeriapsis: 0,
    period: 365,
    epoch: 0,
  }

  it('circular ecliptic at t=0: position on +x axis', () => {
    const pos = orbitalPosition3D(circularEcliptic, 0)
    expect(pos.x).toBeCloseTo(10, 5)
    expect(pos.y).toBeCloseTo(0, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  it('circular ecliptic at t=period/4: position on +y axis', () => {
    const pos = orbitalPosition3D(circularEcliptic, 365 / 4)
    expect(pos.x).toBeCloseTo(0, 4)
    expect(pos.y).toBeCloseTo(10, 4)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  it('circular: radius = semiMajorAxis at all times', () => {
    const times = [0, 50, 100, 200, 300, 365]
    for (const t of times) {
      const pos = orbitalPosition3D(circularEcliptic, t)
      const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
      expect(r).toBeCloseTo(10, 4)
    }
  })

  it('inclined orbit produces non-zero z', () => {
    const inclined: OrbitalElements = {
      ...circularEcliptic,
      inclination: Math.PI / 4, // 45°
    }
    const pos = orbitalPosition3D(inclined, 365 / 4)
    expect(Math.abs(pos.z)).toBeGreaterThan(0.1)
  })

  it('respects epoch offset', () => {
    const withEpoch: OrbitalElements = { ...circularEcliptic, epoch: 100 }
    // t=epoch means M=0, so position should match t=0 for no-epoch version
    const posA = orbitalPosition3D(withEpoch, 100)
    const posB = orbitalPosition3D(circularEcliptic, 0)
    expect(posA.x).toBeCloseTo(posB.x, 5)
    expect(posA.y).toBeCloseTo(posB.y, 5)
    expect(posA.z).toBeCloseTo(posB.z, 5)
  })

  it('elliptical: periapsis radius = a(1-e)', () => {
    const elliptical: OrbitalElements = {
      semiMajorAxis: 10,
      eccentricity: 0.5,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 365,
      epoch: 0,
    }
    // At t=0, M=0, E=0, nu=0: periapsis
    const pos = orbitalPosition3D(elliptical, 0)
    const r = Math.sqrt(pos.x ** 2 + pos.y ** 2 + pos.z ** 2)
    expect(r).toBeCloseTo(10 * (1 - 0.5), 5)
  })
})

// ---------------------------------------------------------------------------
// orbitPathPoints
// ---------------------------------------------------------------------------
describe('orbitPathPoints', () => {
  const circularEcliptic: OrbitalElements = {
    semiMajorAxis: 10,
    eccentricity: 0,
    inclination: 0,
    longitudeOfAscendingNode: 0,
    argumentOfPeriapsis: 0,
    period: 365,
    epoch: 0,
  }

  it('returns 128 points by default', () => {
    const pts = orbitPathPoints(circularEcliptic)
    expect(pts).toHaveLength(128)
  })

  it('returns configurable number of points', () => {
    const pts = orbitPathPoints(circularEcliptic, 64)
    expect(pts).toHaveLength(64)
  })

  it('circular: all points at radius a', () => {
    const pts = orbitPathPoints(circularEcliptic, 36)
    for (const p of pts) {
      const r = Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2)
      expect(r).toBeCloseTo(10, 4)
    }
  })

  it('circular ecliptic: all z = 0', () => {
    const pts = orbitPathPoints(circularEcliptic, 36)
    for (const p of pts) {
      expect(p.z).toBeCloseTo(0, 10)
    }
  })

  it('elliptical: min radius = a(1-e), max radius = a(1+e)', () => {
    const elliptical: OrbitalElements = {
      semiMajorAxis: 10,
      eccentricity: 0.4,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 365,
      epoch: 0,
    }
    const pts = orbitPathPoints(elliptical, 360)
    const radii = pts.map(p => Math.sqrt(p.x ** 2 + p.y ** 2 + p.z ** 2))
    const minR = Math.min(...radii)
    const maxR = Math.max(...radii)
    expect(minR).toBeCloseTo(10 * (1 - 0.4), 2)
    expect(maxR).toBeCloseTo(10 * (1 + 0.4), 2)
  })

  it('each point has x, y, z', () => {
    const pts = orbitPathPoints(circularEcliptic, 4)
    for (const p of pts) {
      expect(p).toHaveProperty('x')
      expect(p).toHaveProperty('y')
      expect(p).toHaveProperty('z')
    }
  })

  it('inclined orbit: non-zero z range', () => {
    const inclined: OrbitalElements = {
      ...circularEcliptic,
      inclination: Math.PI / 6, // 30°
    }
    const pts = orbitPathPoints(inclined, 36)
    const zValues = pts.map(p => p.z)
    const maxZ = Math.max(...zValues)
    const minZ = Math.min(...zValues)
    expect(maxZ - minZ).toBeGreaterThan(1)
  })
})
