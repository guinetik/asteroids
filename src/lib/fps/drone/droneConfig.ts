/**
 * Tuning constants for the station patrol drone enemy.
 *
 * Every numeric lever from the design spec's "Tuning targets" table lives here
 * so controllers, directors, models, and tests share one source of truth. No
 * magic numbers should leak into the controller / model layers — they must
 * import from this module instead.
 *
 * @author guinetik
 * @date 2026-05-16
 * @spec docs/superpowers/specs/2026-05-16-station-drone-enemy-design.md
 */

// ---------------------------------------------------------------------------
// Combat / stats
// ---------------------------------------------------------------------------

/** Maximum hull HP per drone — smaller than the 200-HP turret on purpose. */
export const DRONE_MAX_HP = 120

/** Damage per laser dart hit on the player. Lower than the turret's 12. */
export const DRONE_DART_DAMAGE = 8

/** Laser dart projectile speed in units/s. Slightly easier to side-step than the turret. */
export const DRONE_DART_SPEED = 11

/** Number of shots fired per burst — matches turret cadence feel. */
export const DRONE_BURST_SHOT_COUNT = 3

/** Seconds between successive shots inside a single burst. Spec calls for "slower 3 burst". */
export const DRONE_BURST_INTERVAL_SECONDS = 0.3

/** Seconds of rest after a burst completes before the controller may fire again. */
export const DRONE_BURST_REST_SECONDS = 5

/** Player-detection range in world units. Engage radius before FSM enters alerting. */
export const DRONE_DETECT_RANGE = 9

/** Range hysteresis used to exit alerting/firing — must exceed {@link DRONE_DETECT_RANGE}. */
export const DRONE_DETECT_RANGE_HYSTERESIS = 10

/** Distance band inside which the controller actually pulls the trigger. */
export const DRONE_FIRE_RANGE = 8

/** Collision sphere radius in world units. Smaller silhouette than the turret. */
export const DRONE_HIT_RADIUS = 0.55

// ---------------------------------------------------------------------------
// FSM timing
// ---------------------------------------------------------------------------

/** Seconds spent in the alerting beat before the FSM transitions to firing. */
export const DRONE_ALERT_SECONDS = 0.45

/** Seconds the FSM stays in cooling before it may return to patrolling. */
export const DRONE_COOLING_SECONDS = 1.5

// ---------------------------------------------------------------------------
// Wander / hover
// ---------------------------------------------------------------------------

/** Horizontal patrol speed inside the room AABB (units/s). */
export const DRONE_PATROL_SPEED = 1.8

/** Distance (units) at which the wander step considers the target "reached". */
export const DRONE_ARRIVE_RADIUS = 0.3

/** Seconds before the wander state re-rolls a new target even if it hasn't arrived. */
export const DRONE_REROLL_SECONDS = 6

/** Amplitude (units) of the vertical hover bob applied on top of the hover height. */
export const DRONE_HOVER_BOB_AMPLITUDE = 0.08

/** Hover-bob angular frequency in radians/second. ~0.4 Hz feels organic. */
export const DRONE_HOVER_BOB_FREQUENCY = 2.5

// ---------------------------------------------------------------------------
// Spawn density
// ---------------------------------------------------------------------------

/** Default probability that any single drone slot rolls a successful spawn. */
export const DRONE_SLOT_SPAWN_PROBABILITY = 0.7

/**
 * Per-room spawn bucket — maps a room footprint area (tile count
 * `width * depth`) to the maximum number of drone slots that may roll.
 *
 * Keep in sync with the spec table. Buckets are evaluated in order; the
 * first bucket whose `maxArea` is greater than or equal to the room area
 * wins. The final entry uses `Infinity` as a catch-all for big rooms.
 */
export const DRONE_ROOM_SPAWN_BUCKETS: ReadonlyArray<{
  /** Inclusive upper bound on `width * depth` tile count for this bucket. */
  readonly maxArea: number
  /** Maximum number of drone slots to roll in rooms that fall in this bucket. */
  readonly maxDrones: number
}> = [
  { maxArea: 2, maxDrones: 0 },
  { maxArea: 4, maxDrones: 2 },
  { maxArea: 6, maxDrones: 3 },
  { maxArea: Infinity, maxDrones: 4 },
]

// ---------------------------------------------------------------------------
// VFX (mirrors TURRET_KILL_* but smaller — drone is a smaller silhouette)
// ---------------------------------------------------------------------------

/** Particle count for the bright destruction flash. Smaller than turret's 36. */
export const DRONE_KILL_FLASH_COUNT = 20

/** Spark particle count on death. Smaller than turret's 140. */
export const DRONE_KILL_SPARK_COUNT = 80

/** Smoke puff count on death. Smaller than turret's 72. */
export const DRONE_KILL_SMOKE_COUNT = 40

/** Hull debris fragment count on death. Smaller than turret's 24. */
export const DRONE_KILL_DEBRIS_COUNT = 14

/** Ground shockwave ring particle count on death. Smaller than turret's 64. */
export const DRONE_KILL_SHOCKWAVE_COUNT = 32
