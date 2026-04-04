/**
 * Planetarium catalog — static solar system data with angle conversion.
 *
 * Imports planetarium.json, converts all angular fields from degrees to
 * radians on module load, and exposes typed read-only exports. Throws on
 * load if the data contains duplicate planet ids or order values.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */

import type {
  OrbitalElements,
  ShaderConfig,
  Moon,
  Planet,
  SunData,
  RingConfig,
  KirkwoodGap,
  AsteroidBelt,
} from './types'

import rawData from '@/data/planets/planetarium.json'

/** Degrees-to-radians conversion factor. */
const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// Internal JSON-shape interfaces (raw data before conversion)
// ---------------------------------------------------------------------------

/** Raw orbital elements as stored in JSON — angles in degrees. */
interface OrbitJSON {
  readonly semiMajorAxis: number
  readonly eccentricity: number
  readonly inclination: number
  readonly longitudeOfAscendingNode: number
  readonly argumentOfPeriapsis: number
  readonly period: number
  readonly epoch?: number
}

/** Raw moon data as stored in JSON. */
interface MoonJSON {
  readonly name: string
  readonly orbit: OrbitJSON
  readonly displayRadius: number
  readonly shader: ShaderConfig
  readonly rotationSpeed: number
}

/** Raw planet data as stored in JSON. */
interface PlanetJSON {
  readonly id: string
  readonly name: string
  readonly order: number
  readonly type: Planet['type']
  readonly accentColor: string
  readonly orbit: OrbitJSON
  readonly displayRadius: number
  readonly axialTilt: number
  readonly rotationSpeed: number
  readonly shader: ShaderConfig
  readonly ring?: RingConfig
  readonly moons: readonly MoonJSON[]
}

/** Raw asteroid belt data as stored in JSON. */
interface AsteroidBeltJSON {
  readonly id: string
  readonly name: string
  readonly orbit: OrbitJSON
  readonly innerRadius: number
  readonly outerRadius: number
  readonly maxParticles: number
  readonly thickness: number
  readonly orbitalSpeed: number
  readonly tumbleSpeed: number
  readonly sizeRange: readonly [number, number]
  readonly sizeExponent: number
  readonly kirkwoodGaps: readonly KirkwoodGap[]
  readonly emissiveColor?: readonly [number, number, number]
}

/** Shape of the top-level planetarium.json object. */
interface PlanetariumJSON {
  readonly sun: SunData
  readonly planets: readonly PlanetJSON[]
  readonly asteroidBelts?: readonly AsteroidBeltJSON[]
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert raw orbital elements from degrees to radians.
 *
 * @param o - Raw orbit JSON with angular fields in degrees.
 * @returns OrbitalElements with angles converted to radians.
 */
function convertOrbit(o: OrbitJSON): OrbitalElements {
  return {
    semiMajorAxis: o.semiMajorAxis,
    eccentricity: o.eccentricity,
    inclination: o.inclination * DEG,
    longitudeOfAscendingNode: o.longitudeOfAscendingNode * DEG,
    argumentOfPeriapsis: o.argumentOfPeriapsis * DEG,
    period: o.period,
    ...(o.epoch !== undefined ? { epoch: o.epoch } : {}),
  }
}

/**
 * Convert a raw moon JSON object to a typed Moon.
 *
 * @param m - Raw moon data from JSON.
 * @returns Moon with orbit angles in radians.
 */
function convertMoon(m: MoonJSON): Moon {
  return {
    name: m.name,
    orbit: convertOrbit(m.orbit),
    displayRadius: m.displayRadius,
    shader: m.shader,
    rotationSpeed: m.rotationSpeed,
  }
}

/**
 * Convert a raw planet JSON object to a typed Planet.
 *
 * @param p - Raw planet data from JSON.
 * @returns Planet with orbit and axialTilt angles in radians.
 */
function convertPlanet(p: PlanetJSON): Planet {
  return {
    id: p.id,
    name: p.name,
    order: p.order,
    type: p.type,
    accentColor: p.accentColor,
    orbit: convertOrbit(p.orbit),
    displayRadius: p.displayRadius,
    axialTilt: p.axialTilt * DEG,
    rotationSpeed: p.rotationSpeed,
    shader: p.shader,
    ...(p.ring !== undefined ? { ring: p.ring } : {}),
    moons: p.moons.map(convertMoon),
  }
}

/**
 * Convert a raw asteroid belt JSON object to a typed AsteroidBelt.
 *
 * @param b - Raw belt data from JSON (no glbFile field).
 * @returns AsteroidBelt with orbit angles in radians.
 */
function convertAsteroidBelt(b: AsteroidBeltJSON): AsteroidBelt {
  return {
    id: b.id,
    name: b.name,
    orbit: convertOrbit(b.orbit),
    innerRadius: b.innerRadius,
    outerRadius: b.outerRadius,
    maxParticles: b.maxParticles,
    thickness: b.thickness,
    orbitalSpeed: b.orbitalSpeed,
    tumbleSpeed: b.tumbleSpeed,
    sizeRange: b.sizeRange,
    sizeExponent: b.sizeExponent,
    kirkwoodGaps: b.kirkwoodGaps,
    ...(b.emissiveColor !== undefined ? { emissiveColor: b.emissiveColor } : {}),
  }
}

// ---------------------------------------------------------------------------
// Build catalog at module scope
// ---------------------------------------------------------------------------

const data = rawData as unknown as PlanetariumJSON

/** The Sun — central star data. */
export const SUN: SunData = data.sun

/** All planets (and Pluto), ordered by distance from the Sun. */
export const PLANETS: readonly Planet[] = data.planets.map(convertPlanet)

/** Array of planet id strings, in the same order as PLANETS. */
export const PLANET_IDS: string[] = PLANETS.map(p => p.id)

/** Main Belt and Kuiper Belt, with orbital angles in radians. */
export const ASTEROID_BELTS: readonly AsteroidBelt[] = (data.asteroidBelts ?? []).map(
  convertAsteroidBelt,
)

// ---------------------------------------------------------------------------
// Validation — throw on load if data is inconsistent
// ---------------------------------------------------------------------------

const _seenIds = new Set<string>()
const _seenOrders = new Set<number>()
for (const planet of PLANETS) {
  if (_seenIds.has(planet.id)) {
    throw new Error(`Duplicate planet id in planetarium.json: "${planet.id}"`)
  }
  _seenIds.add(planet.id)

  if (_seenOrders.has(planet.order)) {
    throw new Error(`Duplicate planet order in planetarium.json: ${planet.order}`)
  }
  _seenOrders.add(planet.order)
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a planet by its unique id string.
 *
 * @param id - The planet id (e.g. `"earth"`, `"jupiter"`).
 * @returns The matching Planet.
 * @throws {Error} If no planet with the given id exists in the catalog.
 */
export function getPlanet(id: string): Planet {
  const planet = PLANETS.find(p => p.id === id)
  if (!planet) {
    throw new Error(`Unknown planet id: "${id}"`)
  }
  return planet
}
