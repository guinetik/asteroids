/**
 * Tuning constants for the ice harvest minigame.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */

/** Logical canvas width in pixels. */
export const CANVAS_WIDTH = 800

/** Logical canvas height in pixels. */
export const CANVAS_HEIGHT = 500

// ─── Ship ────────────────────────────────────────────────────────────────────

/** Ship acceleration in px/s² when holding a direction. */
export const SHIP_ACCELERATION = 800

/** Velocity drag multiplier applied per second (0–1, lower = more drag). */
export const SHIP_DRAG = 0.92

/** Maximum ship speed in px/s. */
export const SHIP_MAX_SPEED = 400

/** Downward gravity pull on the ship in px/s². */
export const SHIP_GRAVITY = 40

/** Ship hitbox half-width for collision and rendering. */
export const SHIP_HALF_WIDTH = 24

/** Ship hitbox half-height for collision and rendering. */
export const SHIP_HALF_HEIGHT = 12

/** Starting hull HP. */
export const HULL_MAX_HP = 100

// ─── Cook Zone ───────────────────────────────────────────────────────────────

/** Y position of the dense ring plane — ship below this starts taking damage. */
export const COOK_ZONE_Y = 390

/** Seconds the ship can survive in the cook zone before death. */
export const COOK_ZONE_TOLERANCE = 0.5

/** Y offset above cook zone where heat warning effects begin. */
export const HEAT_WARNING_OFFSET = 60

// ─── Harpoon ─────────────────────────────────────────────────────────────────

/** Harpoon launch speed in px/s. */
export const HARPOON_LAUNCH_SPEED = 350

/** Harpoon launch angle in radians — ~30° forward-down arc. */
export const HARPOON_LAUNCH_ANGLE = Math.PI / 6

/** Downward gravity on the harpoon in px/s². */
export const HARPOON_GRAVITY = 120

/** Cooldown between harpoon shots in seconds. */
export const HARPOON_COOLDOWN = 1.5

/** Maximum harpoon air time before it despawns (seconds). */
export const HARPOON_MAX_AIR_TIME = 3.0

// ─── Ice Chunks ──────────────────────────────────────────────────────────────

/** Collision radius by chunk size in px. */
export const CHUNK_RADIUS_SMALL = 10

/** Collision radius by chunk size in px. */
export const CHUNK_RADIUS_MEDIUM = 18

/** Collision radius by chunk size in px. */
export const CHUNK_RADIUS_LARGE = 28

/** Horizontal speed range for chunks in px/s. */
export const CHUNK_SPEED_MIN = 80

/** Horizontal speed range for chunks in px/s. */
export const CHUNK_SPEED_MAX = 200

/** Hull damage dealt by a small chunk. */
export const CHUNK_DAMAGE_SMALL = 10

/** Hull damage dealt by a medium chunk. */
export const CHUNK_DAMAGE_MEDIUM = 20

/** Hull damage dealt by a large chunk. */
export const CHUNK_DAMAGE_LARGE = 35

/** Number of shards produced by a small chunk. */
export const CHUNK_SHARDS_SMALL = 1

/** Number of shards produced by a medium chunk. */
export const CHUNK_SHARDS_MEDIUM = 3

/** Number of shards produced by a large chunk. */
export const CHUNK_SHARDS_LARGE = 5

/** Starting spawn interval in seconds between chunks. */
export const CHUNK_SPAWN_INTERVAL_START = 1.2

/** Minimum spawn interval (ramps down over time). */
export const CHUNK_SPAWN_INTERVAL_MIN = 0.4

/** Seconds for spawn interval to ramp from start to min. */
export const CHUNK_SPAWN_RAMP_DURATION = 60

/** Probability weights for chunk sizes [small, medium, large]. */
export const CHUNK_SIZE_WEIGHTS = [0.5, 0.35, 0.15]

// ─── Shards ──────────────────────────────────────────────────────────────────

/** Ice units per shard. */
export const SHARD_VALUE = 0.25

/** Time to live for shards before evaporation in seconds. */
export const SHARD_TTL = 3.0

/** Collection radius for ship-shard pickup in px. */
export const SHARD_COLLECT_RADIUS = 30

/** Shard scatter speed range when a chunk shatters (px/s). */
export const SHARD_SCATTER_SPEED = 80

/** Shard visual radius in px. */
export const SHARD_RADIUS = 4
