/**
 * Telemetry computation from Keplerian orbital state.
 *
 * Derives real-world physical quantities (distance, velocity, local solar
 * time, light travel time, sparklines) from a planet's orbital elements and
 * the current simulation time. All values are referenced to real solar-system
 * data tables; scene-unit radii are scaled to physical AU on the fly.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */
import type { OrbitalElements } from './types'
import {
  meanAnomaly,
  solveKeplerEquation,
  trueAnomalyFromEccentric,
  keplerRadius,
} from './kepler'

/** Full circle in radians. */
const TWO_PI = 2 * Math.PI

/** Degrees per radian. */
const DEG = 180 / Math.PI

// ---------------------------------------------------------------------------
// Real-world data tables
// ---------------------------------------------------------------------------

/** Semi-major axes in AU for each planet. */
const REAL_AU: Record<string, number> = {
  mercury: 0.387,
  venus: 0.723,
  earth: 1.0,
  mars: 1.524,
  ceres: 2.767,
  jupiter: 5.203,
  saturn: 9.537,
  uranus: 19.191,
  neptune: 30.069,
  pluto: 39.482,
}

/** Orbital periods in Earth days. */
const REAL_PERIOD_DAYS: Record<string, number> = {
  mercury: 87.97,
  venus: 224.7,
  earth: 365.25,
  mars: 686.97,
  ceres: 1681.63,
  jupiter: 4332.59,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182.0,
  pluto: 90560.0,
}

/**
 * Sidereal rotation periods in hours.
 * Negative values indicate retrograde rotation.
 */
const REAL_ROTATION_HOURS: Record<string, number> = {
  mercury: 1407.6,
  venus: -5832.5,
  earth: 23.934,
  mars: 24.623,
  ceres: 9.074,
  jupiter: 9.925,
  saturn: 10.656,
  uranus: -17.24,
  neptune: 16.11,
  pluto: -153.29,
}

/** Masses in Earth masses. */
const REAL_MASS_EARTH: Record<string, number> = {
  mercury: 0.0553,
  venus: 0.815,
  earth: 1.0,
  mars: 0.107,
  ceres: 0.00016,
  jupiter: 317.8,
  saturn: 95.16,
  uranus: 14.54,
  neptune: 17.15,
  pluto: 0.0022,
}

/** Equatorial radii in kilometres. */
const REAL_RADIUS_KM: Record<string, number> = {
  mercury: 2439.7,
  venus: 6051.8,
  earth: 6371.0,
  mars: 3389.5,
  ceres: 473,
  jupiter: 69911,
  saturn: 58232,
  uranus: 25362,
  neptune: 24622,
  pluto: 1188.3,
}

/**
 * Speed of light in AU per minute.
 * Light takes ~8.317 minutes to travel 1 AU (149 597 870.7 km at 299 792.458 km/s).
 * 299792.458 km/s × 60 s/min = 17987547.48 km/min; 149597870.7 / 17987547.48 ≈ 0.12023.
 */
const SPEED_OF_LIGHT_AU_PER_MIN = 0.12023

// ---------------------------------------------------------------------------
// Sparkline internals
// ---------------------------------------------------------------------------

/** Number of data points retained per sparkline. */
const SPARKLINE_LENGTH = 16

/** Minimum simulation-time ticks between sparkline samples. */
const SAMPLE_INTERVAL = 30

/** Per-planet velocity history buffers. */
const velocityHistory: Record<string, number[]> = {}

/** Per-planet distance history buffers. */
const distanceHistory: Record<string, number[]> = {}

/** Id of the planet recorded during the last sample. */
let _lastPlanetId = ''

/** Tick counter for throttled sampling. */
let _sampleCounter = 0

/**
 * Appends `value` to `buf[planetId]`, keeping it at most `SPARKLINE_LENGTH`
 * elements by shifting the oldest entry.
 *
 * @param buf - The history map to update.
 * @param planetId - Planet identifier key.
 * @param value - New data point to append.
 */
function pushHistory(buf: Record<string, number[]>, planetId: string, value: number): void {
  if (!buf[planetId]) buf[planetId] = []
  const arr = buf[planetId]!
  arr.push(value)
  if (arr.length > SPARKLINE_LENGTH) arr.shift()
}

/**
 * Encodes an array of numbers as a sparkline string scaled to 0–100.
 *
 * @param values - Raw numeric samples.
 * @returns A string of the form `{l:v1,v2,...}` with each value rounded to
 *   an integer in [0, 100].
 */
function toSparkline(values: number[]): string {
  if (values.length === 0) return '{l:}'
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const scaled = values.map((v) => Math.round(((v - min) / range) * 100))
  return `{l:${scaled.join(',')}}`
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * All derived telemetry quantities for a single planet at a given simulation
 * time. Returned by {@link computeTelemetry}.
 */
export interface TelemetryData {
  /** Planet mass relative to Earth (1.0 = Earth). */
  readonly massEarths: number
  /** Equatorial radius in kilometres. */
  readonly radiusKm: number
  /** Current heliocentric distance in astronomical units. */
  readonly solarDistanceAU: number
  /** Instantaneous orbital speed in km/s derived from the vis-viva equation. */
  readonly orbitalVelocityKmS: number
  /** True anomaly ν in degrees, normalised to [0, 360). */
  readonly trueAnomalyDeg: number
  /** Mean anomaly M in degrees, normalised to [0, 360). */
  readonly meanAnomalyDeg: number
  /**
   * Apparent local solar time on the sub-solar meridian as `HH:MM:SS`.
   * Based on the planet's sidereal rotation period and the current true anomaly.
   */
  readonly localSolarTime: string
  /** One-way light travel time from the Sun to the planet, in minutes. */
  readonly lightTravelMin: number
  /** Orbital period taken directly from the real data table, in Earth days. */
  readonly orbitalPeriodDays: number
  /**
   * Phase angle in degrees — equal to the true anomaly in degrees.
   * [0, 360)
   */
  readonly phaseAngleDeg: number
  /**
   * Orbit progress encoded as `{p:NN}` where NN is the mean anomaly as a
   * percentage of a full orbit (0–100).
   */
  readonly orbitProgressPie: string
  /**
   * Sparkline of recent orbital velocity samples, encoded as `{l:v1,v2,...}`
   * with values scaled to 0–100.
   */
  readonly velocitySparkline: string
  /**
   * Sparkline of recent heliocentric distance samples, encoded as
   * `{l:v1,v2,...}` with values scaled to 0–100.
   */
  readonly distanceSparkline: string
}

/**
 * Clears all sparkline history buffers and resets the sample counter.
 * Call this when switching planets or resetting the simulation.
 */
export function resetTelemetryHistory(): void {
  for (const key of Object.keys(velocityHistory)) delete velocityHistory[key]
  for (const key of Object.keys(distanceHistory)) delete distanceHistory[key]
  _lastPlanetId = ''
  _sampleCounter = 0
}

/**
 * Computes all telemetry fields for a planet at a given simulation time.
 *
 * The scene-space semi-major axis (`orbit.semiMajorAxis`) is mapped to the
 * real AU value from the data table, so physical quantities are always in
 * real solar-system units regardless of the scene scale.
 *
 * @param planetId - Lowercase planet identifier, e.g. `'earth'`, `'mars'`.
 * @param orbit - Keplerian orbital elements (angles in radians).
 * @param simTime - Current simulation time in the same units as `orbit.period`
 *   (Earth days).
 * @returns Populated {@link TelemetryData} record.
 *
 * @author guinetik
 */
export function computeTelemetry(
  planetId: string,
  orbit: OrbitalElements,
  simTime: number,
): TelemetryData {
  const { semiMajorAxis, eccentricity, period } = orbit

  // --- Kepler pipeline ---
  const M = meanAnomaly(period, simTime, orbit.epoch ?? 0)
  const E = solveKeplerEquation(M, eccentricity)
  const nu = trueAnomalyFromEccentric(E, eccentricity)
  const sceneR = keplerRadius(semiMajorAxis, eccentricity, nu)

  // --- Scale scene radius → real AU ---
  const realA_AU = REAL_AU[planetId] ?? 1.0
  const currentAU = (sceneR / semiMajorAxis) * realA_AU

  // --- Orbital velocity via vis-viva equation ---
  // GM = 4π² a³ / T²  (in AU³/day²)
  const realA_AU3 = realA_AU * realA_AU * realA_AU
  const T_days = REAL_PERIOD_DAYS[planetId] ?? period
  const GM_AU3_day2 = 4 * Math.PI * Math.PI * realA_AU3 / (T_days * T_days)
  const v_AU_day = Math.sqrt(GM_AU3_day2 * (2 / currentAU - 1 / realA_AU))
  // Convert AU/day → km/s  (1 AU = 149 597 870.7 km, 1 day = 86400 s)
  const KM_PER_AU = 149597870.7
  const SEC_PER_DAY = 86400
  const orbitalVelocityKmS = v_AU_day * KM_PER_AU / SEC_PER_DAY

  // --- Light travel time ---
  const lightTravelMin = currentAU / SPEED_OF_LIGHT_AU_PER_MIN

  // --- Angles ---
  const FULL_CIRCLE_DEG = 360
  const trueAnomalyDeg = ((nu * DEG) % FULL_CIRCLE_DEG + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG
  const meanAnomalyDeg = ((M * DEG) % FULL_CIRCLE_DEG + FULL_CIRCLE_DEG) % FULL_CIRCLE_DEG

  // --- Local solar time ---
  const rotHours = REAL_ROTATION_HOURS[planetId] ?? 24
  const isRetrograde = rotHours < 0
  const rotPeriodDays = Math.abs(rotHours) / 24
  const rotAngle = (simTime / rotPeriodDays) * TWO_PI
  const solarAngle = isRetrograde ? -rotAngle - nu : rotAngle - nu
  const normalised = ((solarAngle % TWO_PI) + TWO_PI) % TWO_PI
  const HOURS_IN_DAY = 24
  const MINUTES_IN_HOUR = 60
  const SECONDS_IN_MINUTE = 60
  const totalSeconds = Math.floor((normalised / TWO_PI) * HOURS_IN_DAY * MINUTES_IN_HOUR * SECONDS_IN_MINUTE)
  const hh = Math.floor(totalSeconds / (MINUTES_IN_HOUR * SECONDS_IN_MINUTE))
  const mm = Math.floor((totalSeconds % (MINUTES_IN_HOUR * SECONDS_IN_MINUTE)) / SECONDS_IN_MINUTE)
  const ss = totalSeconds % SECONDS_IN_MINUTE
  const pad = (n: number) => String(n).padStart(2, '0')
  const localSolarTime = `${pad(hh)}:${pad(mm)}:${pad(ss)}`

  // --- Orbit progress ---
  const orbitProgress = Math.round((meanAnomalyDeg / FULL_CIRCLE_DEG) * 100)
  const orbitProgressPie = `{p:${orbitProgress}}`

  // --- Phase angle ---
  const phaseAngleDeg = trueAnomalyDeg

  // --- Sparkline sampling (throttled) ---
  if (planetId !== _lastPlanetId) {
    _sampleCounter = 0
    _lastPlanetId = planetId
  }
  _sampleCounter++
  if (_sampleCounter >= SAMPLE_INTERVAL) {
    _sampleCounter = 0
    pushHistory(velocityHistory, planetId, orbitalVelocityKmS)
    pushHistory(distanceHistory, planetId, currentAU)
  } else if (!velocityHistory[planetId]) {
    // Always record at least one point on first call
    pushHistory(velocityHistory, planetId, orbitalVelocityKmS)
    pushHistory(distanceHistory, planetId, currentAU)
  }

  const velocitySparkline = toSparkline(velocityHistory[planetId] ?? [])
  const distanceSparkline = toSparkline(distanceHistory[planetId] ?? [])

  return {
    massEarths: REAL_MASS_EARTH[planetId] ?? 1.0,
    radiusKm: REAL_RADIUS_KM[planetId] ?? 6371.0,
    solarDistanceAU: currentAU,
    orbitalVelocityKmS,
    trueAnomalyDeg,
    meanAnomalyDeg,
    localSolarTime,
    lightTravelMin,
    orbitalPeriodDays: T_days,
    phaseAngleDeg,
    orbitProgressPie,
    velocitySparkline,
    distanceSparkline,
  }
}
