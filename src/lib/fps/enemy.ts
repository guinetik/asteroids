/**
 * Base enemy entity with health.
 *
 * Minimal game object — has a position, HP, and alive state.
 * Projectile system checks collision against enemies and calls
 * {@link takeDamage} on hit.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
import * as THREE from 'three'
import type { ChaseTargetSite } from './chaseTargeting'

/** Configuration for spawning an enemy. */
export interface EnemyConfig {
  /** Maximum health points. */
  maxHp: number
  /** Collision radius for projectile hit detection. */
  hitRadius: number
}

/**
 * Base enemy entity.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
export class Enemy {
  /** World-space position — sync with visual mesh externally. */
  readonly position = new THREE.Vector3()
  /** Current health points. */
  hp: number
  /** Max health points. */
  readonly maxHp: number
  /** Collision radius for projectile hit checks. */
  readonly hitRadius: number
  /** Seconds remaining on the science-bolt freeze effect. */
  private freezeRemainingSeconds = 0
  /** Whether this enemy has already granted its once-per-life science reward. */
  private scienceRewardClaimed = false

  /**
   * Primary death hook — typically used by the controller that owns this
   * enemy (e.g. {@link BacteriophageController.die}). Auxiliary observers
   * (loot drops, analytics) should subscribe via {@link addDeathListener}
   * instead so the controller's hook is never clobbered.
   */
  onDeath: (() => void) | null = null

  /** Auxiliary death observers; fired alongside {@link onDeath}. */
  private readonly deathListeners = new Set<() => void>()

  constructor(config: EnemyConfig) {
    this.maxHp = config.maxHp
    this.hp = config.maxHp
    this.hitRadius = config.hitRadius
  }

  /** Whether the enemy is still alive. */
  get alive(): boolean {
    return this.hp > 0
  }

  /** Whether movement, attacks, and contact damage are currently disabled. */
  get frozen(): boolean {
    return this.freezeRemainingSeconds > 0
  }

  /**
   * Advance transient enemy status effects.
   *
   * @param dt - Delta time in seconds.
   */
  tickStatus(dt: number): void {
    this.freezeRemainingSeconds = Math.max(0, this.freezeRemainingSeconds - dt)
  }

  /**
   * Apply the one-time science-bolt reward and freeze to this enemy.
   *
   * @param freezeSeconds - Duration for the enemy freeze, in seconds.
   * @returns True only the first time a science projectile ever affects this enemy.
   */
  applyFirstScienceHit(freezeSeconds: number): boolean {
    if (this.scienceRewardClaimed || !this.alive) return false
    this.scienceRewardClaimed = true
    this.freezeRemainingSeconds = Math.max(this.freezeRemainingSeconds, freezeSeconds)
    return true
  }

  /**
   * Subscribe an auxiliary death observer. Listener errors are swallowed so
   * one bad subscriber cannot break others or the controller's primary hook.
   *
   * @param listener - Callback invoked exactly once when HP reaches zero.
   * @returns Unsubscribe function.
   */
  addDeathListener(listener: () => void): () => void {
    this.deathListeners.add(listener)
    return () => this.deathListeners.delete(listener)
  }

  /**
   * Apply damage. Fires onDeath and all death listeners when HP reaches zero.
   *
   * @param amount - Damage to apply
   */
  takeDamage(amount: number): void {
    if (!this.alive) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.onDeath?.()
      for (const listener of Array.from(this.deathListeners)) {
        try {
          listener()
        } catch {
          // best-effort notification — auxiliary observers are isolated
        }
      }
    }
  }
}

/** Output from an enemy behavior tick — drives movement and visual state. */
export interface EnemyBehaviorOutput {
  /** Normalized movement direction on the XZ plane (zero = idle). */
  moveDir: { x: number; z: number }
  /** Whether the enemy is actively moving. */
  isMoving: boolean
  /** Whether the enemy is chasing the player (vs idle wander). */
  isChasing: boolean
  /** Whether the enemy is agitated (close to player). */
  isAgitated: boolean
  /** Whether the enemy wants to fire a projectile this frame. */
  wantsToFire: boolean
  /** World X to face and aim ranged attacks toward. */
  aimTargetX: number
  /** World Y to face and aim ranged attacks toward. */
  aimTargetY: number
  /** World Z to face and aim ranged attacks toward. */
  aimTargetZ: number
}

/**
 * Behavior interface — pluggable AI for enemies.
 * The director calls tick() each frame and applies the output.
 */
export interface EnemyBehavior {
  /**
   * Compute movement intent for this frame.
   *
   * @param hostageSites - Alive hostage positions for shared aggro (may be empty)
   */
  tick(
    dt: number,
    enemyX: number,
    enemyZ: number,
    playerX: number,
    playerY: number,
    playerZ: number,
    hostageSites: ReadonlyArray<ChaseTargetSite>,
  ): EnemyBehaviorOutput
}
