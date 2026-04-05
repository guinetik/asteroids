/**
 * Aggro-based enemy behavior — idle wander near spawn, chase on aggro.
 *
 * Two states:
 * - **Idle:** Wander randomly within {@link AggroBehaviorConfig.wanderRadius}
 *   of the spawn point. Picks a random target, walks to it, pauses, repeats.
 * - **Chase:** When the player enters {@link AggroBehaviorConfig.aggroRadius},
 *   move toward the player at full speed. Returns to idle when the player
 *   exceeds {@link AggroBehaviorConfig.leashRadius}.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'

/** Configuration for aggro behavior — sourced from EnemyTypeConfig. */
export interface AggroBehaviorConfig {
  /** Distance at which the enemy starts chasing the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Chase movement speed (units/s). */
  speed: number
}

/** Minimum distance to wander target before picking a new one. */
const WANDER_ARRIVE_THRESHOLD = 2.0

/** Pause duration (seconds) between wander targets. */
const WANDER_PAUSE_MIN = 1.0
const WANDER_PAUSE_MAX = 3.0

/** Weave amplitude for organic-looking movement. */
const WEAVE_AMPLITUDE = 0.25
const WEAVE_FREQUENCY = 1.5

type AggroState = 'idle' | 'chase'

/**
 * Aggro behavior — wander when idle, chase when player is near.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class AggroBehavior implements EnemyBehavior {
  private readonly config: AggroBehaviorConfig
  private state: AggroState = 'idle'
  private elapsed = 0

  // Wander state
  private wanderTargetX = 0
  private wanderTargetZ = 0
  private wanderPause = 0
  private spawnX = 0
  private spawnZ = 0
  private spawnSet = false

  constructor(config: AggroBehaviorConfig) {
    this.config = config
  }

  /** @inheritdoc */
  tick(
    dt: number,
    enemyX: number,
    enemyZ: number,
    playerX: number,
    playerZ: number,
  ): EnemyBehaviorOutput {
    this.elapsed += dt

    // Record spawn position on first tick
    if (!this.spawnSet) {
      this.spawnX = enemyX
      this.spawnZ = enemyZ
      this.spawnSet = true
      this.pickWanderTarget()
    }

    const dx = playerX - enemyX
    const dz = playerZ - enemyZ
    const distToPlayer = Math.sqrt(dx * dx + dz * dz)

    // --- State transitions ---
    if (this.state === 'idle' && distToPlayer < this.config.aggroRadius) {
      this.state = 'chase'
    } else if (this.state === 'chase' && distToPlayer > this.config.leashRadius) {
      this.state = 'idle'
      this.pickWanderTarget()
    }

    // --- Behavior ---
    if (this.state === 'chase') {
      return this.tickChase(dx, dz, distToPlayer)
    }
    return this.tickIdle(dt, enemyX, enemyZ)
  }

  private tickChase(
    dx: number,
    dz: number,
    distToPlayer: number,
  ): EnemyBehaviorOutput {
    if (distToPlayer < 0.01) {
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: true, isAgitated: true }
    }

    const invDist = 1 / distToPlayer
    let dirX = dx * invDist
    let dirZ = dz * invDist

    // Weave for organic movement
    const sideX = -dirZ
    const sideZ = dirX
    const weave = Math.sin(this.elapsed * WEAVE_FREQUENCY) * WEAVE_AMPLITUDE
    dirX += sideX * weave
    dirZ += sideZ * weave

    // Re-normalize
    const len = Math.sqrt(dirX * dirX + dirZ * dirZ)
    if (len > 0) {
      dirX /= len
      dirZ /= len
    }

    const isAgitated = distToPlayer < this.config.agitateRadius

    return { moveDir: { x: dirX, z: dirZ }, isMoving: true, isChasing: true, isAgitated }
  }

  private tickIdle(
    dt: number,
    enemyX: number,
    enemyZ: number,
  ): EnemyBehaviorOutput {
    // Pause between wander targets
    if (this.wanderPause > 0) {
      this.wanderPause -= dt
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false }
    }

    const wx = this.wanderTargetX - enemyX
    const wz = this.wanderTargetZ - enemyZ
    const wanderDist = Math.sqrt(wx * wx + wz * wz)

    // Arrived at wander target — pick a new one after a pause
    if (wanderDist < WANDER_ARRIVE_THRESHOLD) {
      this.wanderPause = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN)
      this.pickWanderTarget()
      return { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false }
    }

    // Move toward wander target
    const invDist = 1 / wanderDist
    return {
      moveDir: { x: wx * invDist, z: wz * invDist },
      isMoving: true,
      isChasing: false,
      isAgitated: false,
    }
  }

  private pickWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * this.config.wanderRadius
    this.wanderTargetX = this.spawnX + Math.cos(angle) * radius
    this.wanderTargetZ = this.spawnZ + Math.sin(angle) * radius
  }
}
