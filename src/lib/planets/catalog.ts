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
  PinnedBody,
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
  readonly meanAnomalyOffset?: number
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
  readonly mass: number
  readonly shader: ShaderConfig
  readonly modelUrl?: string
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
  readonly pinnedBodies?: readonly PlanetJSON[]
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
    ...(o.meanAnomalyOffset !== undefined ? { meanAnomalyOffset: o.meanAnomalyOffset * DEG } : {}),
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
    mass: p.mass,
    shader: p.shader,
    ...(p.modelUrl !== undefined ? { modelUrl: p.modelUrl } : {}),
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

/** Contract-pinned bodies, ordered by their authored order field. */
export const PINNED_BODIES: readonly PinnedBody[] = (data.pinnedBodies ?? []).map(convertPlanet)

/** All orbit-capturable solar bodies excluding the Sun. */
export const SOLAR_BODIES: readonly Planet[] = [...PLANETS, ...PINNED_BODIES]

/** Array of planet id strings, in the same order as PLANETS. */
export const PLANET_IDS: string[] = PLANETS.map((p) => p.id)

/** Array of pinned body id strings, in the same order as PINNED_BODIES. */
export const PINNED_BODY_IDS: string[] = PINNED_BODIES.map((p) => p.id)

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
for (const body of PINNED_BODIES) {
  if (_seenIds.has(body.id)) {
    throw new Error(`Duplicate pinned body id in planetarium.json: "${body.id}"`)
  }
  _seenIds.add(body.id)
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
  const planet = PLANETS.find((p) => p.id === id)
  if (!planet) {
    throw new Error(`Unknown planet id: "${id}"`)
  }
  return planet
}

/**
 * Look up a pinned body by its unique id string.
 *
 * @param id - The pinned body id (e.g. `"hektor"`).
 * @returns The matching pinned body.
 * @throws {Error} If no pinned body with the given id exists in the catalog.
 */
export function getPinnedBody(id: string): PinnedBody {
  const body = PINNED_BODIES.find((p) => p.id === id)
  if (!body) {
    throw new Error(`Unknown pinned body id: "${id}"`)
  }
  return body
}
