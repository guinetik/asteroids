/**
 * Shared contracts for the arcade-cabinet Asteroids simulation.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */

/** Lifecycle phase for the classic Asteroids cabinet game. */
export type AsteroidsGamePhase = 'attract' | 'playing' | 'respawning' | 'gameOver'

/** Size bucket used for Asteroids rock splitting and scoring. */
export type AsteroidSize = 'large' | 'medium' | 'small'

/** Saucer type. Small saucers are faster and worth more points. */
export type SaucerSize = 'large' | 'small'

/** Source of deterministic random values in the range [0, 1). */
export type RandomSource = () => number

/** Keyboard/button state consumed by one simulation tick. */
export interface AsteroidsInputs {
  /** True while the player is rotating counter-clockwise; example: left arrow or `A`. */
  rotateLeft: boolean
  /** True while the player is rotating clockwise; example: right arrow or `D`. */
  rotateRight: boolean
  /** True while the player is thrusting; example: up arrow or `W`. */
  thrust: boolean
  /** True while the player is firing; example: spacebar. */
  fire: boolean
  /** True on hyperspace request; example: `X`. */
  hyperspace: boolean
  /** True on attract/game-over start request; example: enter. */
  start: boolean
}

/** Mobile point with velocity in cabinet-screen coordinates. */
export interface AsteroidsBody {
  /** Stable entity id for renderer diffing; positive integer values such as `12`. */
  id: number
  /** Horizontal screen position in pixels; wraps around [0, width]. */
  x: number
  /** Vertical screen position in pixels; wraps around [0, height]. */
  y: number
  /** Horizontal velocity in pixels per second; positive moves right. */
  vx: number
  /** Vertical velocity in pixels per second; positive moves down. */
  vy: number
  /** Collision radius in pixels; examples: `2` for bullets, `34` for large rocks. */
  radius: number
}

/** Player ship state. */
export interface AsteroidsShip extends AsteroidsBody {
  /** Heading in radians; `0` points to the right. */
  angle: number
  /** Seconds remaining where collisions are ignored after respawn. */
  invulnerableTimer: number
  /** Seconds remaining before the ship becomes visible after a hit. */
  respawnTimer: number
  /** Whether the renderer should draw the ship this frame. */
  visible: boolean
}

/** Bullet fired by either the player or a saucer. */
export interface AsteroidsBullet extends AsteroidsBody {
  /** Seconds remaining before the bullet expires. */
  life: number
}

/** Asteroid rock entity. */
export interface AsteroidEntity extends AsteroidsBody {
  /** Rock size bucket controlling radius, score, and split behavior. */
  size: AsteroidSize
  /** Current visual rotation angle in radians. */
  angle: number
  /** Visual angular velocity in radians per second. */
  angularVelocity: number
  /** Unit polygon vertices describing the jagged vector outline. */
  vertices: readonly { x: number; y: number }[]
}

/** Enemy saucer entity. */
export interface SaucerEntity extends AsteroidsBody {
  /** Saucer size bucket controlling radius, speed, score, and aiming error. */
  size: SaucerSize
  /** Seconds until the next saucer shot. */
  fireTimer: number
}

/** Complete serializable simulation state. */
export interface AsteroidsGameState {
  /** Current lifecycle phase. */
  phase: AsteroidsGamePhase
  /** Simulation viewport width in pixels. */
  width: number
  /** Simulation viewport height in pixels. */
  height: number
  /** Current run score. */
  score: number
  /** Best score known by this simulation instance. */
  highScore: number
  /** Remaining ship lives; classic run starts with `3`. */
  lives: number
  /** Current wave number; starts at `1`. */
  wave: number
  /** Monotonic id counter assigned to new entities. */
  nextEntityId: number
  /** Player ship state. */
  ship: AsteroidsShip
  /** Player bullets currently alive. */
  bullets: AsteroidsBullet[]
  /** Saucer bullets currently alive. */
  saucerBullets: AsteroidsBullet[]
  /** Asteroids currently alive. */
  asteroids: AsteroidEntity[]
  /** Current saucer, or null when no saucer is active. */
  saucer: SaucerEntity | null
  /** Seconds until the player can fire again. */
  fireCooldown: number
  /** Seconds until the next saucer can spawn. */
  saucerSpawnTimer: number
  /** Seconds until hyperspace can be requested again. */
  hyperspaceCooldown: number
  /** Optional short status message for overlay chrome. */
  message: string | null
}

/** Constructor options for {@link AsteroidsGame}. */
export interface AsteroidsGameOptions {
  /** Simulation viewport width in pixels; example: `800`. */
  width: number
  /** Simulation viewport height in pixels; example: `600`. */
  height: number
  /** Optional deterministic random source. Defaults to `Math.random`. */
  random?: RandomSource
  /** Initial high score loaded by the overlay controller. */
  highScore?: number
  /** Optional full state snapshot, useful for restores and deterministic scenario setup. */
  initialState?: AsteroidsGameState
}
