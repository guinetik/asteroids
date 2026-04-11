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
export const DRONE_GRAVITY = 140

/** Pure launch impulse speed in px/s — strong kick, not affected by drag initially. */
export const DRONE_LAUNCH_SPEED = 280

/** Launch angle in radians — 45° for a classic parabolic arc. */
export const DRONE_LAUNCH_ANGLE = -Math.PI / 4

/** Drone air drag multiplier per second (0–1). Only applies after launch phase. */
export const DRONE_DRAG = 0.93

/** Seconds after launch before drag kicks in — lets the impulse carry. */
export const DRONE_DRAG_DELAY = 0.4

/** Radius in px for ship-drone collision. */
export const DRONE_COLLECT_RADIUS = 36

/** Maximum gas yield per drone in seconds of air time. */
export const MAX_AIR_TIME_YIELD = 3

/** Starting drone count — drones are reusable if caught. */
export const MAX_DRONES = 3

/** Minimum air time in seconds before a drone can be collected. Long enough to clear the ship. */
export const DRONE_GRACE_PERIOD = 0.8

/** Downward gravity pull on the ship in px/s². */
export const SHIP_GRAVITY = 60

/** Y position of the planet cook zone — ship below this starts overheating. */
export const COOK_ZONE_Y = 310

/** Seconds the ship can survive in the cook zone before death. */
export const COOK_ZONE_TOLERANCE = 0.5

/** Y offset above cook zone where heat warning effects begin. */
export const HEAT_WARNING_OFFSET = 60

/** Gas puff spawn interval — average seconds between spawns. */
export const PUFF_SPAWN_INTERVAL = 0.6

/** Gas puff rise speed range — min px/s. */
export const PUFF_SPEED_MIN = 40

/** Gas puff rise speed range — max px/s. */
export const PUFF_SPEED_MAX = 80

/** Gas puff collision radius in px. */
export const PUFF_RADIUS_MIN = 16

/** Gas puff collision radius max in px. */
export const PUFF_RADIUS_MAX = 30

/** Gas units per puff collected by a drone. */
export const GAS_PER_PUFF = 0.35

/** Radius for drone-puff collision in px. */
export const DRONE_PUFF_COLLECT_RADIUS = 24

/** Base timer in seconds for the minimum gatherQuantity (2). */
export const TIMER_BASE = 30

/** Extra seconds added per unit of gatherQuantity above 2. */
export const TIMER_PER_GAS = 5

/** Ship hitbox half-width for collision and rendering. */
export const SHIP_HALF_WIDTH = 24

/** Ship hitbox half-height for collision and rendering. */
export const SHIP_HALF_HEIGHT = 12
