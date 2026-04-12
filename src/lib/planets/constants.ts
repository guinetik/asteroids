/**
 * Planetarium simulation constants.
 *
 * Only includes orbital mechanics and simulation parameters.
 * View-layer constants (camera, bloom, typography) are deferred
 * to the Three.js port.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-planetarium-data-layer-design.md
 */

/** Scale factor: AU to Three.js world units. 1 AU = 150 world units. */
export const ORBIT_SCALE = 150

/** Scale factor: body display sizes. Sun radius ~1.375, Earth ~0.385. */
export const SIZE_SCALE = 80.0

/** Default simulation speed multiplier. */
export const DEFAULT_TIME_SCALE = 2.0

/** Divisor applied to rotation speed for animation damping. */
export const ROTATION_SPEED_DIVISOR = 20.0

/** Divisor applied to moon orbital speed for animation damping. */
export const MOON_ORBIT_SPEED_DIVISOR = 5.0

/** Number of sample points when generating orbit path geometry. */
export const ORBIT_PATH_SEGMENTS = 128

/** Geometry subdivision level for planet spheres. */
export const SPHERE_SEGMENTS = 64

/** Geometry subdivision level for moon spheres. */
export const MOON_SPHERE_SEGMENTS = 32
