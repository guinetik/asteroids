/**
 * Tuning constants for the gas collection minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

/** Ship acceleration in px/s² when holding a direction. */
export const SHIP_ACCELERATION = 800

/** Velocity drag multiplier applied per second (0–1, lower = more drag). */
export const SHIP_DRAG = 0.92

/** Maximum ship speed in px/s. */
export const SHIP_MAX_SPEED = 400

/** Downward acceleration on drones in px/s². */
export const DRONE_GRAVITY = 120

/** Base launch speed added to ship velocity in px/s. */
export const DRONE_LAUNCH_SPEED = 160

/** Launch angle in radians (shallow upward-right arc). */
export const DRONE_LAUNCH_ANGLE = -Math.PI / 6

/** Radius in px for ship-drone collision. */
export const DRONE_COLLECT_RADIUS = 36

/** Maximum gas yield per drone in seconds of air time. */
export const MAX_AIR_TIME_YIELD = 3

/** Total drones per attempt. */
export const MAX_DRONES = 5

/** Minimum air time in seconds before a drone can be collected. */
export const DRONE_GRACE_PERIOD = 0.3

/** Downward gravity pull on the ship in px/s². */
export const SHIP_GRAVITY = 60

/** Y position of the planet cook zone — ship below this = dead. */
export const COOK_ZONE_Y = 310

/** Ship hitbox half-width for collision and rendering. */
export const SHIP_HALF_WIDTH = 24

/** Ship hitbox half-height for collision and rendering. */
export const SHIP_HALF_HEIGHT = 12
