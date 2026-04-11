/**
 * Tuning constants for the logistics route minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Lanes ──────────────────────────────────────────────────────────────────

/** Number of shipping lanes. */
export const LANE_COUNT = 5

/** X position where the lane area begins (px). */
export const LANE_START_X = 64

/** Horizontal spacing between lane centers (px). */
export const LANE_SPACING = 100

// ─── Ship ───────────────────────────────────────────────────────────────────

/** Ship acceleration in px/s² when holding W/S. */
export const SHIP_ACCEL = 1100

/** Velocity drag multiplier applied per frame (0–1, lower = more drag). */
export const SHIP_DRAG = 0.96

/** Maximum vertical ship speed in px/s. */
export const SHIP_MAX_SPEED_Y = 550

/** Maximum horizontal ship speed in px/s. */
export const SHIP_MAX_SPEED_X = 450

/** Soft spring strength pulling ship back to center (units/s²). */
export const SPRING_STRENGTH = 2.0

/** Ship collision half-width in px. */
export const SHIP_HALF_SIZE = 14

/** Edge padding — ship can't get closer than this to canvas edge (px). */
export const EDGE_PADDING = 30

/** Starting X position — center of the lane area. */
export const SHIP_START_X = LANE_START_X + LANE_SPACING * ((LANE_COUNT + 1) / 2)

/** Starting Y position — lower third of canvas. */
export const SHIP_START_Y = CANVAS_HEIGHT * 0.7

// ─── Hull ───────────────────────────────────────────────────────────────────

/** Starting and maximum hull HP. */
export const HULL_MAX_HP = 100

/** HP lost on traffic collision. */
export const TRAFFIC_DAMAGE = 15

/** Seconds of invulnerability after taking damage. */
export const DAMAGE_GRACE_PERIOD = 1.0

/** Knockback impulse speed applied on traffic collision (px/s). */
export const KNOCKBACK_SPEED = 120

// ─── Route Symbols ──────────────────────────────────────────────────────────

/** Minimum manifest length (floor). */
export const MIN_MANIFEST_LENGTH = 4

/** Collection radius — fly within this distance to collect a symbol (px). */
export const SYMBOL_COLLECT_RADIUS = 20

/** Seconds between symbol spawns. */
export const SYMBOL_SPAWN_INTERVAL = 1.1

// ─── Traffic ────────────────────────────────────────────────────────────────

/** Traffic shuttle collision radius (px). */
export const TRAFFIC_RADIUS = 12

/** Random X jitter applied to traffic lane position (±px). */
export const TRAFFIC_LANE_JITTER = 8

/** Minimum vertical gap between any two traffic shuttles (px). */
export const MIN_TRAFFIC_GAP = 120

/** Traffic speed multiplier range — min factor of scroll speed. */
export const TRAFFIC_SPEED_MIN_FACTOR = 0.8

/** Traffic speed multiplier range — added random range. */
export const TRAFFIC_SPEED_RANDOM_RANGE = 0.6

// ─── Difficulty Scaling ─────────────────────────────────────────────────────

/** Base scroll speed at targetGas <= 4 (px/s). */
export const BASE_SCROLL_SPEED = 180

/** Additional scroll speed per targetGas unit above 4 (px/s). */
export const SCROLL_SPEED_PER_TARGET = 20

/** Base max traffic on screen at targetGas <= 4. */
export const BASE_TRAFFIC_COUNT = 4

/** Spawn interval for traffic shuttles (seconds). */
export const TRAFFIC_SPAWN_INTERVAL = 1.2
