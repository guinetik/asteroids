/**
 * Keplerian orbital mechanics — pure functions.
 *
 * Solves the two-body problem for elliptical orbits using classical
 * orbital elements. No visualization dependencies.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
import type { OrbitalElements, Vec3 } from './types'

/** Full circle in radians. */
const TWO_PI = 2 * Math.PI

/**
 * Solves Kepler's equation M = E - e·sin(E) for the eccentric anomaly E
 * using Newton-Raphson iteration.
 *
 * @param M - Mean anomaly in radians.
 * @param e - Orbital eccentricity (0 = circular, 0..1 = elliptical).
 * @param tolerance - Convergence threshold (default 1e-10).
 * @param maxIter - Maximum iteration count (default 50).
 * @returns Eccentric anomaly E in radians.
 *
 * @author guinetik
 */
export function solveKeplerEquation(
  M: number,
  e: number,
  tolerance = 1e-10,
  maxIter = 50,
): number {
  if (e === 0) return M
  let E = M
  for (let i = 0; i < maxIter; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) < tolerance) break
  }
  return E
}

/**
 * Computes the mean anomaly M = 2π·(t − epoch) / period.
 *
 * @param period - Orbital period in the same units as `time` and `epoch`.
 * @param time - Current time.
 * @param epoch - Reference epoch at which M = 0 (default 0).
 * @returns Mean anomaly in radians.
 *
 * @author guinetik
 */
export function meanAnomaly(period: number, time: number, epoch = 0): number {
  return TWO_PI * ((time - epoch) / period)
}

/**
 * Converts eccentric anomaly E to true anomaly ν using the half-angle formula:
 * ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))
 *
 * @param E - Eccentric anomaly in radians.
 * @param e - Orbital eccentricity.
 * @returns True anomaly ν in radians.
 *
 * @author guinetik
 */
export function trueAnomalyFromEccentric(E: number, e: number): number {
  if (e === 0) return E
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
}

/**
 * Computes the orbital radius using the conic section formula:
 * r = a(1−e²) / (1 + e·cos(ν))
 *
 * @param semiMajorAxis - Semi-major axis a.
 * @param eccentricity - Orbital eccentricity e.
 * @param trueAnomaly - True anomaly ν in radians.
 * @returns Orbital radius r.
 *
 * @author guinetik
 */
export function keplerRadius(
  semiMajorAxis: number,
  eccentricity: number,
  trueAnomaly: number,
): number {
  if (eccentricity === 0) return semiMajorAxis
  const p = semiMajorAxis * (1 - eccentricity * eccentricity)
  return p / (1 + eccentricity * Math.cos(trueAnomaly))
}

/**
 * Computes the 3D heliocentric position of a body at a given time by
 * applying the full Keplerian pipeline:
 *   M → E (Newton-Raphson) → ν → r → orbital plane (x,y) → ecliptic 3D
 *
 * The rotation from orbital plane to ecliptic uses the three Euler angles
 * Ω (longitudeOfAscendingNode), i (inclination), ω (argumentOfPeriapsis).
 *
 * @param elements - Classical Keplerian orbital elements (angles in radians).
 * @param time - Current time in the same units as `elements.period` and `elements.epoch`.
 * @returns 3D position vector in ecliptic coordinates.
 *
 * @author guinetik
 */
export function orbitalPosition3D(elements: OrbitalElements, time: number): Vec3 {
  const { semiMajorAxis, eccentricity, inclination, longitudeOfAscendingNode, argumentOfPeriapsis,
    period, epoch = 0 } = elements

  const M = meanAnomaly(period, time, epoch)
  const E = solveKeplerEquation(M, eccentricity)
  const nu = trueAnomalyFromEccentric(E, eccentricity)
  const r = keplerRadius(semiMajorAxis, eccentricity, nu)

  // Position in the orbital plane
  const xOrb = r * Math.cos(nu)
  const yOrb = r * Math.sin(nu)

  // Pre-compute trig values
  const cosOmega = Math.cos(longitudeOfAscendingNode)
  const sinOmega = Math.sin(longitudeOfAscendingNode)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)
  const cosW = Math.cos(argumentOfPeriapsis)
  const sinW = Math.sin(argumentOfPeriapsis)

  // Rotate to ecliptic coordinates
  const x = (cosOmega * cosW - sinOmega * sinW * cosI) * xOrb +
            (-cosOmega * sinW - sinOmega * cosW * cosI) * yOrb
  const y = (sinOmega * cosW + cosOmega * sinW * cosI) * xOrb +
            (-sinOmega * sinW + cosOmega * cosW * cosI) * yOrb
  const z = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb

  return { x, y, z }
}

/**
 * Generates an array of 3D points tracing the complete orbital path.
 *
 * Evenly samples the true anomaly across [0, 2π) using the mean anomaly
 * parametrisation and applies the same ecliptic rotation as `orbitalPosition3D`.
 *
 * @param elements - Classical Keplerian orbital elements (angles in radians).
 * @param numSegments - Number of sample points (default 128).
 * @returns Array of Vec3 positions forming the orbit trace.
 *
 * @author guinetik
 */
export function orbitPathPoints(elements: OrbitalElements, numSegments = 128): Vec3[] {
  const { semiMajorAxis, eccentricity, inclination, longitudeOfAscendingNode, argumentOfPeriapsis } =
    elements

  // Pre-compute trig values once for the rotation
  const cosOmega = Math.cos(longitudeOfAscendingNode)
  const sinOmega = Math.sin(longitudeOfAscendingNode)
  const cosI = Math.cos(inclination)
  const sinI = Math.sin(inclination)
  const cosW = Math.cos(argumentOfPeriapsis)
  const sinW = Math.sin(argumentOfPeriapsis)

  const points: Vec3[] = []

  for (let j = 0; j < numSegments; j++) {
    const M = (TWO_PI * j) / numSegments
    const E = solveKeplerEquation(M, eccentricity)
    const nu = trueAnomalyFromEccentric(E, eccentricity)
    const r = keplerRadius(semiMajorAxis, eccentricity, nu)

    const xOrb = r * Math.cos(nu)
    const yOrb = r * Math.sin(nu)

    const x = (cosOmega * cosW - sinOmega * sinW * cosI) * xOrb +
              (-cosOmega * sinW - sinOmega * cosW * cosI) * yOrb
    const y = (sinOmega * cosW + cosOmega * sinW * cosI) * xOrb +
              (-sinOmega * sinW + cosOmega * cosW * cosI) * yOrb
    const z = (sinW * sinI) * xOrb + (cosW * sinI) * yOrb

    points.push({ x, y, z })
  }

  return points
}
