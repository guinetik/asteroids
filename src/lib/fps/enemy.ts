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

  /** Fired when HP reaches zero. */
  onDeath: (() => void) | null = null

  constructor(config: EnemyConfig) {
    this.maxHp = config.maxHp
    this.hp = config.maxHp
    this.hitRadius = config.hitRadius
  }

  /** Whether the enemy is still alive. */
  get alive(): boolean {
    return this.hp > 0
  }

  /**
   * Apply damage. Fires onDeath when HP reaches zero.
   *
   * @param amount - Damage to apply
   */
  takeDamage(amount: number): void {
    if (!this.alive) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.onDeath?.()
    }
  }
}
