/**
 * Shared per-frame + per-asteroid state consumed by all atmosphere controllers.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import { Vector3, Color } from 'three'

/** Per-asteroid lighting configuration loaded from asteroid JSON. */
export interface AsteroidLighting {
  /** Compass bearing of the sun in degrees (0 = north/+Z, 90 = east/+X). */
  sunAzimuth: number
  /** Angle above the horizon in degrees (0 = horizon, 90 = overhead). */
  sunElevation: number
  /** Sun color as [R, G, B] normalized 0-1. */
  sunColor: [number, number, number]
  /** Sun directional light intensity. Range: 0.5-3.0. */
  sunIntensity: number
  /** Hemisphere/ambient fill intensity. Range: 0.05-0.4. */
  ambientIntensity: number
}

/** Shared atmosphere state populated each frame by LevelViewController. */
export interface AtmosphereContext {
  // ── Per-frame state (updated every tick) ──
  /** Meters above ground under lander. 0 when grounded. */
  landerAltitude: number
  /** Normalized main engine power. 0 = off, 1 = full thrust. */
  landerThrust: number
  /** Vertical speed in m/s. Negative = falling. */
  landerVelocityY: number
  /** Whether the lander is on the ground. */
  landerGrounded: boolean
  /** Lander world position. */
  landerPosition: Vector3
  /** EVA walk/sprint speed in m/s. */
  playerSpeed: number
  /** Whether EVA player is on the ground. */
  playerGrounded: boolean
  /** EVA player world position. */
  playerPosition: Vector3
  /** Surface normal under the active entity. */
  groundNormal: Vector3
  /** Current game phase. */
  activeMode: 'lander' | 'eva' | 'cinematic'

  // ── Per-asteroid config (set once on level load) ──
  /** Unit vector pointing toward the sun (derived from azimuth + elevation). */
  sunDirection: Vector3
  /** Sun light color. */
  sunColor: Color
  /** Sun directional light intensity. */
  sunIntensity: number
  /** Hemisphere/ambient fill intensity. */
  ambientIntensity: number
  /** From asteroid surface.dustCoverage (0-1). */
  dustCoverage: number
  /** From asteroid visual.albedo. Affects ground scatter brightness. */
  albedo: number
  /** Asteroid biome string. Drives dust color palette. */
  biome: string
  /** Surface color for tinting dust particles. From visual.baseColor. */
  baseColor: [number, number, number]
}

/** Degrees to radians. */
const DEG_TO_RAD = Math.PI / 180

/**
 * Convert azimuth + elevation angles to a unit direction vector.
 * Azimuth 0 = +Z (north), 90 = +X (east). Elevation 0 = horizon, 90 = straight up.
 */
export function sunDirectionFromAngles(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = azimuthDeg * DEG_TO_RAD
  const el = elevationDeg * DEG_TO_RAD
  return new Vector3(
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ).normalize()
}

/**
 * Create a default AtmosphereContext with zeroed per-frame state.
 * Per-asteroid fields are populated from the lighting config and asteroid data.
 */
export function createAtmosphereContext(
  lighting: AsteroidLighting,
  opts: {
    dustCoverage: number
    albedo: number
    biome: string
    baseColor: [number, number, number]
  },
): AtmosphereContext {
  return {
    landerAltitude: 0,
    landerThrust: 0,
    landerVelocityY: 0,
    landerGrounded: true,
    landerPosition: new Vector3(),
    playerSpeed: 0,
    playerGrounded: true,
    playerPosition: new Vector3(),
    groundNormal: new Vector3(0, 1, 0),
    activeMode: 'cinematic',
    sunDirection: sunDirectionFromAngles(lighting.sunAzimuth, lighting.sunElevation),
    sunColor: new Color(lighting.sunColor[0], lighting.sunColor[1], lighting.sunColor[2]),
    sunIntensity: lighting.sunIntensity,
    ambientIntensity: lighting.ambientIntensity,
    dustCoverage: opts.dustCoverage,
    albedo: opts.albedo,
    biome: opts.biome,
    baseColor: opts.baseColor,
  }
}
