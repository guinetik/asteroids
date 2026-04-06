/**
 * Ranged enemy behavior — engage at distance, hold position, fire projectiles.
 *
 * States:
 * - **Idle:** Wander near spawn (same as AggroBehavior).
 * - **Engage (approach):** Move toward player until within preferred range.
 * - **Engage (hold):** Stop, face player, fire on cooldown.
 * - **Engage (retreat):** Back away if player gets within min range.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'

/** Configuration for ranged behavior. */
export interface RangedBehaviorConfig {
  /** Distance at which the enemy starts engaging the player. */
  aggroRadius: number
  /** Distance at which the enemy gives up and returns to idle. */
  leashRadius: number
  /** Distance at which the enemy becomes visually agitated. */
  agitateRadius: number
  /** Maximum wander distance from spawn point. */
  wanderRadius: number
  /** Movement speed while wandering (units/s). */
  wanderSpeed: number
  /** Engagement movement speed (units/s). */
  speed: number
  /** Preferred engagement distance — holds position here. */
  preferredRange: number
  /** Minimum distance — backs away if player is closer. */
  minRange: number
  /** Shots per second. */
  fireRate: number
}

/** Minimum distance to wander target before picking a new one. */
const WANDER_ARRIVE_THRESHOLD = 2.0
/** Minimum pause duration (seconds) between wander movements. */
const WANDER_PAUSE_MIN = 1.0
/** Maximum pause duration (seconds) between wander movements. */
const WANDER_PAUSE_MAX = 3.0

/** Internal state for ranged behavior. */
type RangedState = 'idle' | 'engage'

/**
 * Ranged behavior — wander when idle, engage at preferred distance and fire.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class RangedBehavior implements EnemyBehavior {
  private readonly config: RangedBehaviorConfig
  private state: RangedState = 'idle'
  private elapsed = 0
  private fireCooldown = 0

  // Wander state
  private wanderTargetX = 0
  private wanderTargetZ = 0
  private wanderPause = 0
  private spawnX = 0
  private spawnZ = 0
  private spawnSet = false

  /** @param config - Tuning parameters for this ranged enemy instance. */
  constructor(config: RangedBehaviorConfig) {
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

    if (!this.spawnSet) {
      this.spawnX = enemyX
      this.spawnZ = enemyZ
      this.spawnSet = true
      this.pickWanderTarget()
    }

    const dx = playerX - enemyX
    const dz = playerZ - enemyZ
    const distToPlayer = Math.sqrt(dx * dx + dz * dz)

    // State transitions
    if (this.state === 'idle' && distToPlayer < this.config.aggroRadius) {
      this.state = 'engage'
    } else if (this.state === 'engage' && distToPlayer > this.config.leashRadius) {
      this.state = 'idle'
      this.pickWanderTarget()
    }

    if (this.state === 'engage') {
      return this.tickEngage(dt, dx, dz, distToPlayer)
    }
    return this.tickIdle(dt, enemyX, enemyZ)
  }

  /**
   * Handles per-frame logic while the enemy is engaged with the player.
   *
   * @param dt - Delta time in seconds.
   * @param dx - X-axis distance from enemy to player.
   * @param dz - Z-axis distance from enemy to player.
   * @param distToPlayer - Euclidean distance from enemy to player.
   */
  private tickEngage(
    dt: number,
    dx: number,
    dz: number,
    distToPlayer: number,
  ): EnemyBehaviorOutput {
    const inRange = distToPlayer <= this.config.preferredRange
    const tooClose = distToPlayer < this.config.minRange
    const isAgitated = inRange

    // Fire cooldown — only fire when cooldown was already at zero entering this tick
    const wasReady = this.fireCooldown <= 0
    this.fireCooldown = Math.max(0, this.fireCooldown - dt)
    let wantsToFire = false
    if (inRange && wasReady) {
      wantsToFire = true
      this.fireCooldown = 1 / this.config.fireRate
    }

    // Movement
    if (tooClose) {
      // Back away from player
      const invDist = distToPlayer > 0.01 ? 1 / distToPlayer : 0
      return {
        moveDir: { x: -dx * invDist, z: -dz * invDist },
        isMoving: true,
        isChasing: true,
        isAgitated: true,
        wantsToFire,
      }
    }

    if (!inRange) {
      // Approach player
      const invDist = distToPlayer > 0.01 ? 1 / distToPlayer : 0
      return {
        moveDir: { x: dx * invDist, z: dz * invDist },
        isMoving: true,
        isChasing: true,
        isAgitated: false,
        wantsToFire: false,
      }
    }

    // Hold position — in range, not too close
    return {
      moveDir: { x: 0, z: 0 },
      isMoving: false,
      isChasing: true,
      isAgitated,
      wantsToFire,
    }
  }

  /**
   * Handles per-frame logic while the enemy is idle and wandering near spawn.
   *
   * @param dt - Delta time in seconds.
   * @param enemyX - Current X position of the enemy.
   * @param enemyZ - Current Z position of the enemy.
   */
  private tickIdle(
    dt: number,
    enemyX: number,
    enemyZ: number,
  ): EnemyBehaviorOutput {
    if (this.wanderPause > 0) {
      this.wanderPause -= dt
      return {
        moveDir: { x: 0, z: 0 },
        isMoving: false,
        isChasing: false,
        isAgitated: false,
        wantsToFire: false,
      }
    }

    const wx = this.wanderTargetX - enemyX
    const wz = this.wanderTargetZ - enemyZ
    const wanderDist = Math.sqrt(wx * wx + wz * wz)

    if (wanderDist < WANDER_ARRIVE_THRESHOLD) {
      this.wanderPause =
        WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN)
      this.pickWanderTarget()
      return {
        moveDir: { x: 0, z: 0 },
        isMoving: false,
        isChasing: false,
        isAgitated: false,
        wantsToFire: false,
      }
    }

    const invDist = 1 / wanderDist
    return {
      moveDir: { x: wx * invDist, z: wz * invDist },
      isMoving: true,
      isChasing: false,
      isAgitated: false,
      wantsToFire: false,
    }
  }

  /** Picks a new random wander target within wanderRadius of the spawn point. */
  private pickWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.random() * this.config.wanderRadius
    this.wanderTargetX = this.spawnX + Math.cos(angle) * radius
    this.wanderTargetZ = this.spawnZ + Math.sin(angle) * radius
  }
}
