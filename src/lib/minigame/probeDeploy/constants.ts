/**
 * Tuning constants for the probe deploy minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Planet ─────────────────────────────────────────────────────────────────

/** Planet center X in canvas pixels. */
export const PLANET_X = 550

/** Planet center Y in canvas pixels. */
export const PLANET_Y = 250

/** Planet visual radius in px. */
export const PLANET_R = 220

/** Base planet rotation speed in radians/s. */
export const PLANET_ROTATION_SPEED = 0.4

/** Additional rotation speed per targetGas unit above 2 (rad/s). */
export const ROTATION_SPEED_PER_TARGET = 0.025

// ─── Ship ───────────────────────────────────────────────────────────────────

/** Ship fixed X position — orbital lane on the left. */
export const SHIP_X = 80

/** Ship acceleration in px/s² when holding W/S. */
export const SHIP_ACCEL = 800

/** Velocity drag multiplier applied per frame (0–1). */
export const SHIP_DRAG = 0.96

/** Maximum vertical ship speed in px/s. */
export const SHIP_MAX_SPEED = 450

/** Ship collision half-size in px. */
export const SHIP_HALF_SIZE = 14

/** Edge padding — ship can't get closer than this to canvas edge (px). */
export const EDGE_PADDING = 30

// ─── Hull ───────────────────────────────────────────────────────────────────

/** Starting and maximum hull HP. */
export const HULL_MAX_HP = 100

/** HP lost on meteorite collision. */
export const METEORITE_DAMAGE = 15

/** Seconds of invulnerability after taking damage. */
export const DAMAGE_GRACE_PERIOD = 1.0

/** Knockback impulse speed on meteorite collision (px/s). */
export const KNOCKBACK_SPEED = 120

// ─── Probes ─────────────────────────────────────────────────────────────────

/** Probe horizontal flight speed in px/s. */
export const PROBE_SPEED = 500

/** Cooldown between probe launches in seconds. */
export const PROBE_COOLDOWN = 1.5

// ─── Targets ────────────────────────────────────────────────────────────────

/** Radius for a probe to "hit" a surface target (px). */
export const TARGET_HIT_RADIUS = 20

/** Half-angle (radians) from the ship-facing edge where a target is droppable. */
export const TARGET_DROPPABLE_ARC = Math.PI / 3

/** Target visual radius in px. */
export const TARGET_VISUAL_RADIUS = 12

// ─── Meteorites ─────────────────────────────────────────────────────────────

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_SMALL = 10

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_MEDIUM = 18

/** Collision radius by meteorite size in px. */
export const METEORITE_RADIUS_LARGE = 28

/** Horizontal speed range for meteorites in px/s. */
export const METEORITE_SPEED_MIN = 80

/** Horizontal speed range for meteorites in px/s. */
export const METEORITE_SPEED_MAX = 200

/** Starting spawn interval in seconds. */
export const METEORITE_SPAWN_INTERVAL_START = 1.5

/** Minimum spawn interval (ramps down over time). */
export const METEORITE_SPAWN_INTERVAL_MIN = 0.5

/** Seconds for spawn interval to ramp from start to min. */
export const METEORITE_SPAWN_RAMP_DURATION = 45

/** Probability weights for meteorite sizes [small, medium, large]. */
export const METEORITE_SIZE_WEIGHTS = [0.5, 0.35, 0.15]

// ─── Difficulty Scaling ─────────────────────────────────────────────────────

/** Minimum number of targets. */
export const MIN_TARGETS = 3

/** Maximum number of targets. */
export const MAX_TARGETS = 5

/** Base timer in seconds. */
export const TIMER_BASE = 45

/** Additional timer per target in seconds. */
export const TIMER_PER_TARGET = 5
