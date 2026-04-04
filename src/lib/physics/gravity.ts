/**
 * Gravity math primitives — pure physics, no rendering.
 * Pluggable into any object that has mass and position.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */

/**
 * Gravitational constant scaled for game units.
 * Real G = 6.674e-11 m³/(kg·s²). Exaggerated so solar-mass
 * bodies produce meaningful acceleration at game distances.
 */
const GRAVITY_CONSTANT = 500000

/** Minimum distance to prevent infinite force at center */
const MIN_GRAVITY_DISTANCE = 15

/** Influence radius scale — how far gravity reaches visually. Scales with sqrt(mass). */
const INFLUENCE_RADIUS_SCALE = 400

/** Event horizon scale — point of no return. Scales with sqrt(mass). */
const EVENT_HORIZON_SCALE = 230

/**
 * Any object that has mass and position can be a gravity source.
 * This is the minimal contract — no rendering, no Three.js.
 */
export interface GravitySource {
  readonly mass: number // solar masses (M☉)
  getWorldX(): number
  getWorldZ(): number
}

/**
 * Computed gravity pull result in the XZ plane.
 */
export interface GravityVector {
  ax: number // acceleration X
  az: number // acceleration Z
}

/**
 * Calculate the influence radius for a body of given mass.
 * This is where gravity becomes "significant" for gameplay.
 */
export function influenceRadius(mass: number): number {
  return INFLUENCE_RADIUS_SCALE * Math.sqrt(mass)
}

/**
 * Event horizon radius — point of no return.
 * Inspired by Schwarzschild radius rs = 2GM/c², scaled for gameplay.
 */
export function eventHorizonRadius(mass: number): number {
  return EVENT_HORIZON_SCALE * Math.sqrt(mass)
}

/**
 * Check if a point has crossed any source's event horizon.
 * Returns the first source crossed, or null.
 */
export function checkEventHorizon(
  sources: GravitySource[],
  px: number,
  pz: number,
): GravitySource | null {
  for (const source of sources) {
    const dx = source.getWorldX() - px
    const dz = source.getWorldZ() - pz
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < eventHorizonRadius(source.mass)) {
      return source
    }
  }
  return null
}

/**
 * Calculate gravitational acceleration at a point from a single source.
 * Uses inverse-square law with cubic ease-in ramp from the influence edge.
 * Returns zero outside the influence radius.
 *
 * @param sourceX - Source world X
 * @param sourceZ - Source world Z
 * @param mass - Source mass in solar masses
 * @param px - Query point X
 * @param pz - Query point Z
 * @returns Acceleration vector pointing toward the source
 */
export function gravityAt(
  sourceX: number,
  sourceZ: number,
  mass: number,
  px: number,
  pz: number,
): GravityVector {
  const dx = sourceX - px
  const dz = sourceZ - pz
  const dist = Math.max(Math.sqrt(dx * dx + dz * dz), MIN_GRAVITY_DISTANCE)

  const radius = influenceRadius(mass)

  // Zero pull outside influence radius, full 1/r² inside
  if (dist >= radius) {
    return { ax: 0, az: 0 }
  }

  const forceMag = (GRAVITY_CONSTANT * mass) / (dist * dist)
  const nx = dx / dist
  const nz = dz / dist

  return { ax: nx * forceMag, az: nz * forceMag }
}

/**
 * Sum gravitational acceleration from multiple sources at a point.
 */
export function totalGravityAt(
  sources: GravitySource[],
  px: number,
  pz: number,
): GravityVector {
  let ax = 0
  let az = 0

  for (const source of sources) {
    const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, px, pz)
    ax += g.ax
    az += g.az
  }

  return { ax, az }
}
