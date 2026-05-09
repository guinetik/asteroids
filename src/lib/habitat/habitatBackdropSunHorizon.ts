/**
 * Habitat canopy backdrop: aligns the sun center with the deck horizon for a reference viewpoint.
 *
 * From the reference eye, matches the elevation angle of the sun center to that of the nearest
 * deck-edge hit along the sun's horizontal azimuth through the cabin footprint on XZ. That reads
 * as half the disk above the window sill / deck line and half below when viewed from the cabin centre.
 *
 * Footprint dimensions must stay aligned with {@link HabitatInteriorScene} cylinder geometry.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */

/** Minimal 3D vector for pure placement math (no Three.js dependency). */
export interface HabitatBackdropVec3 {
  /** World-space X coordinate in metres (scene units). */
  readonly x: number
  /** World-space Y coordinate in metres (scene units). */
  readonly y: number
  /** World-space Z coordinate in metres (scene units). */
  readonly z: number
}

/**
 * Axis-aligned cabin prism footprint on XZ at deck height `floorY`, matching the habitat cylinder bounds.
 */
export interface HabitatBackdropFootprint {
  /** Half-width along ±X from the cabin centre (matches cylinder radius). */
  readonly cylinderRadius: number
  /** Half-extent along ±Z from the cabin centre (half of cylinder length). */
  readonly cylinderHalfLengthZ: number
  /** Walkable deck height (world Y). */
  readonly floorY: number
}

/**
 * Default footprint — must match habitat interior `CYLINDER_RADIUS`, `CYLINDER_LENGTH`, and floor Y.
 */
export const HABITAT_BACKDROP_DEFAULT_FOOTPRINT: HabitatBackdropFootprint = {
  cylinderRadius: 5,
  cylinderHalfLengthZ: 8,
  floorY: 0,
}

/** Eye height used only for sun-vs-deck horizon alignment (matches habitat FPS standing eye height). */
export const HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_HEIGHT = 1.7

/** Reference position XZ for horizon alignment — cabin centreline at spawn (between bed and table). */
export const HABITAT_BACKDROP_SUN_ALIGNMENT_EYE_XZ: Pick<HabitatBackdropVec3, 'x' | 'z'> = {
  x: 0,
  z: 0,
}

/**
 * Extra world +Y nudge applied after geometric horizon alignment so the disk reads slightly
 * higher through the canopy sill (art direction).
 */
export const HABITAT_BACKDROP_SUN_EXTRA_UP_BIAS_WORLD_UNITS = 6

/**
 * Reference heliocentric distance for habitat sun scaling: Mercury semi-major axis (AU), matching
 * `planetarium.json` mercury.orbit.semiMajorAxis.
 */
export const SUN_BACKDROP_REFERENCE_ORBIT_AU = 0.387

/**
 * Lower clamp on `(referenceDistance / shipToSunDistance)` before exponentiation so the sun at
 * very distant orbits still receives enough boost to stay above the angular floor.
 */
export const SUN_BACKDROP_DISTANCE_RATIO_FLOOR = 0.1

/**
 * Exponent on the distance ratio — pulls Mars and outer-planet sun disks down versus Mercury
 * without collapsing Neptune to only the minimum disk size.
 */
export const SUN_BACKDROP_DISTANCE_BOOST_EXPONENT = 1.05

const RAY_T_EPSILON = 1e-6
const BOUND_SLACK = 1e-4

/**
 * Smallest positive ray parameter `t` so `(ox + t ux, oz + t uz)` exits the closed rectangle
 * `|x| <= radius`, `|z| <= halfLenZ`, assuming `(ox, oz)` lies strictly inside.
 *
 * @param ox - Ray origin X on the deck plane projection (same as world X).
 * @param oz - Ray origin Z on the deck plane projection (same as world Z).
 * @param ux - Unit horizontal direction X toward the sun (XZ projection of sun vector).
 * @param uz - Unit horizontal direction Z toward the sun (XZ projection of sun vector).
 * @param radius - Cabin half-width along X (cylinder radius).
 * @param halfLenZ - Cabin half-length along Z.
 * @returns Positive distance along the ray to the first boundary hit, or `null` if none found.
 */
export function firstHorizontalRayExitDistance(
  ox: number,
  oz: number,
  ux: number,
  uz: number,
  radius: number,
  halfLenZ: number,
): number | null {
  let best: number | null = null

  const consider = (t: number, insideCheck: (x: number, z: number) => boolean): void => {
    if (!(t > RAY_T_EPSILON)) return
    const x = ox + t * ux
    const z = oz + t * uz
    if (!insideCheck(x, z)) return
    if (best === null || t < best) best = t
  }

  if (Math.abs(ux) > RAY_T_EPSILON) {
    consider((radius - ox) / ux, (_x, z) => Math.abs(z) <= halfLenZ + BOUND_SLACK)
    consider((-radius - ox) / ux, (_x, z) => Math.abs(z) <= halfLenZ + BOUND_SLACK)
  }
  if (Math.abs(uz) > RAY_T_EPSILON) {
    consider((halfLenZ - oz) / uz, (x, _z) => Math.abs(x) <= radius + BOUND_SLACK)
    consider((-halfLenZ - oz) / uz, (x, _z) => Math.abs(x) <= radius + BOUND_SLACK)
  }

  return best
}

/**
 * Computes a world +Y offset for the sun group so its centre matches the deck horizon elevation
 * from {@link params.referenceEye}: same elevation angle as the deck rim hit along the sun azimuth.
 *
 * @param params - Sun placement, eye reference, and cabin footprint.
 * @returns Y offset to add to the sun group's world position (typically positive when the sun sits too low).
 */
export function computeSunYOffsetForDeckHorizon(params: {
  /** Uncorrected sun centre position (before bias). */
  readonly sunPosition: HabitatBackdropVec3
  /** Observer eye position used for alignment (typically cabin centre at standing height). */
  readonly referenceEye: HabitatBackdropVec3
  /** Cabin prism footprint on XZ. */
  readonly footprint: HabitatBackdropFootprint
}): number {
  const { sunPosition: S, referenceEye: E, footprint } = params
  const { cylinderRadius: R, cylinderHalfLengthZ: Lz, floorY } = footprint

  const dx = S.x - E.x
  const dz = S.z - E.z
  const lenS = Math.hypot(dx, dz)
  if (lenS < RAY_T_EPSILON) return 0

  const ux = dx / lenS
  const uz = dz / lenS

  const lenH = firstHorizontalRayExitDistance(E.x, E.z, ux, uz, R, Lz)
  if (lenH === null || lenH < RAY_T_EPSILON) return 0

  const targetSy = E.y + (lenS * (floorY - E.y)) / lenH
  return targetSy - S.y
}

/**
 * Distance-weighted angular boost for the habitat sun only: inner orbits keep dramatic disks,
 * while Mars-class distances read noticeably smaller than Mercury instead of sharing the same cap.
 *
 * @param params - Ship-to-sun distance (scene units), AU→world scale, and the scene's base boost.
 * @returns Effective boost passed into angular-size scaling (still capped by caller max diameter).
 */
export function computeSunDistanceWeightedAngularBoost(params: {
  /** Horizontal distance from shuttle to sun in scene units (orrery XZ). */
  readonly shipToSunDistance: number
  /** AU→world scale (`ORBIT_SCALE`). */
  readonly orbitScale: number
  /** Base multiplier before distance shaping (`SUN_ANGULAR_BOOST` in the backdrop). */
  readonly baseAngularBoost: number
}): number {
  const { shipToSunDistance, orbitScale, baseAngularBoost } = params
  if (shipToSunDistance <= RAY_T_EPSILON) return baseAngularBoost

  const referenceDistanceWorld = SUN_BACKDROP_REFERENCE_ORBIT_AU * orbitScale
  const ratio = Math.min(1, Math.max(SUN_BACKDROP_DISTANCE_RATIO_FLOOR, referenceDistanceWorld / shipToSunDistance))
  return baseAngularBoost * ratio ** SUN_BACKDROP_DISTANCE_BOOST_EXPONENT
}
