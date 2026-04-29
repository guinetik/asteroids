/**
 * Planetarium type definitions.
 *
 * Data model for the solar system: planets, moons, orbital elements,
 * shader configs, rings, and asteroid belts. All properties readonly.
 * No prose text — this is the game data layer.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */

/** 3D cartesian coordinate. */
export interface Vec3 {
  /** X component. */
  readonly x: number
  /** Y component. */
  readonly y: number
  /** Z component. */
  readonly z: number
}

/**
 * Classical Keplerian orbital elements.
 *
 * Angles are in radians after catalog conversion (stored as degrees in JSON).
 */
export interface OrbitalElements {
  /** Semi-major axis in scene units (planets) or relative to parent (moons). */
  readonly semiMajorAxis: number
  /** Eccentricity: 0 = circular, 0..1 = elliptical. */
  readonly eccentricity: number
  /** Inclination from the ecliptic plane, in radians. */
  readonly inclination: number
  /** Longitude of ascending node, in radians. */
  readonly longitudeOfAscendingNode: number
  /** Argument of periapsis, in radians. */
  readonly argumentOfPeriapsis: number
  /** Orbital period in Earth days. */
  readonly period: number
  /** Optional time offset for mean anomaly calculation. */
  readonly epoch?: number
  /** Optional starting phase offset in radians. Example: Hektor leads Jupiter by ~1.047 rad. */
  readonly meanAnomalyOffset?: number
}

/** Shader program selector for procedural rendering. */
export type ShaderType = 'star' | 'rockyPlanet' | 'gasGiant'

/** Shader program type and uniform values for procedural body rendering. */
export interface ShaderConfig {
  /** Which shader program to use. */
  readonly type: ShaderType
  /** Uniform name-value pairs passed to the shader. */
  readonly uniforms: Record<string, number | number[]>
}

/** Planetary ring geometry and appearance. */
export interface RingConfig {
  /** Inner edge as a multiplier of planet display radius. */
  readonly innerRadius: number
  /** Outer edge as a multiplier of planet display radius. */
  readonly outerRadius: number
  /** Ring opacity (0..1). */
  readonly opacity: number
  /** Ring color as [r, g, b] normalized 0..1. */
  readonly color: readonly number[]
}

/** A natural satellite orbiting a planet. */
export interface Moon {
  /** Display name, e.g. "Europa", "Titan". */
  readonly name: string
  /** Orbital elements relative to parent planet. */
  readonly orbit: OrbitalElements
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for procedural rendering. */
  readonly shader: ShaderConfig
  /** Rotation speed factor for self-rotation animation. */
  readonly rotationSpeed: number
}

/** Planetary classification. */
export type PlanetType =
  | 'Terrestrial'
  | 'Gas Giant'
  | 'Ice Giant'
  | 'Dwarf Planet'
  | 'Jupiter Trojan'

/** A planet or dwarf planet in the solar system. */
export interface Planet {
  /** Unique key, e.g. "earth", "jupiter". */
  readonly id: string
  /** Display name, e.g. "Earth", "Jupiter". */
  readonly name: string
  /** Sort order from the sun (1 = Mercury, 10 = Pluto). */
  readonly order: number
  /** Planetary classification. */
  readonly type: PlanetType
  /** Accent color as a CSS hex string, e.g. "#6AA4D4". */
  readonly accentColor: string
  /** Heliocentric orbital elements. */
  readonly orbit: OrbitalElements
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for procedural rendering. */
  readonly shader: ShaderConfig
  /** Optional GLB model URL. When set, this body uses the model instead of procedural geometry. */
  readonly modelUrl?: string
  /** Optional ring system (Saturn, Uranus). */
  readonly ring?: RingConfig
  /** Natural satellites. Empty array if none. */
  readonly moons: readonly Moon[]
  /** Rotation speed factor for self-rotation animation. */
  readonly rotationSpeed: number
  /** Axial tilt in radians (converted from degrees by catalog). */
  readonly axialTilt: number
  /** Mass in solar masses (M☉). Earth ~3.00e-6, Jupiter ~9.55e-4. */
  readonly mass: number
}

/** Contract-pinned body that is always rendered but whose orbit access is save-gated. */
export type PinnedBody = Planet

/** Solar data — the central star. */
export interface SunData {
  /** Stable id used by gameplay systems (e.g. contracts), conventionally `'sun'`. */
  readonly id: string
  /** Display name. */
  readonly name: string
  /** Visual radius in scene units. */
  readonly displayRadius: number
  /** Shader program and uniforms for star rendering. */
  readonly shader: ShaderConfig
  /** Rotation speed factor for animation. */
  readonly rotationSpeed: number
  /** Mass in solar masses (M☉). Always 1.0 for the Sun. */
  readonly mass: number
}

/** A resonance gap in an asteroid belt caused by Jupiter's gravity. */
export interface KirkwoodGap {
  /** Normalized position within the belt (0..1). */
  readonly position: number
  /** Normalized width of the gap (0..1). */
  readonly width: number
}

/** A belt of asteroids (Main Belt or Kuiper Belt). */
export interface AsteroidBelt {
  /** Unique key, e.g. "main-belt", "kuiper-belt". */
  readonly id: string
  /** Display name, e.g. "Asteroid Belt". */
  readonly name: string
  /** Center-line orbital elements. */
  readonly orbit: OrbitalElements
  /** Inner edge in scene units. */
  readonly innerRadius: number
  /** Outer edge in scene units. */
  readonly outerRadius: number
  /** Maximum particle count for rendering. */
  readonly maxParticles: number
  /** Vertical spread of the belt in scene units. */
  readonly thickness: number
  /** Base orbital speed factor. */
  readonly orbitalSpeed: number
  /** Tumble speed for individual asteroid rotation. */
  readonly tumbleSpeed: number
  /** Min/max particle size range. */
  readonly sizeRange: readonly [number, number]
  /** Exponent for size distribution (higher = more small particles). */
  readonly sizeExponent: number
  /** Kirkwood resonance gaps. */
  readonly kirkwoodGaps: readonly KirkwoodGap[]
  /** Optional emissive tint as [r, g, b] normalized 0..1. */
  readonly emissiveColor?: readonly [number, number, number]
}
