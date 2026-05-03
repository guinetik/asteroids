/**
 * Civilian hostage entity — world position, HP pool, and collision radius.
 *
 * Used by the FPS rescue demo: enemies may aggro and damage hostages; the
 * multi-tool heal bolt restores HP. Mirrors {@link Enemy} health rules without
 * mixing rescue targets into the enemy projectile/enemy lists.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'

/** Tunable defaults for hostage entities in FPS levels. */
export const HOSTAGE_DEFAULT_MAX_HP = 100
/** Sphere radius (world units) for player bolt hit tests against hostages. */
export const HOSTAGE_DEFAULT_HIT_RADIUS = 1.2
/**
 * Default vertical offset from ground anchor to hit sphere center when not computed from mesh bounds.
 */
export const HOSTAGE_HIT_CENTER_Y = 0.95

/**
 * Vertical offset applied while incapacitated. The dying clip collapses the
 * rig flat on the ground, so the kneeling-pose offset (~0.95m) puts the hit
 * sphere above the visible body and forces the player to jump or shoot from
 * above to revive. Anchoring near ground level keeps the sphere on the corpse.
 */
export const HOSTAGE_DEAD_HIT_CENTER_Y = 0.35

/**
 * Multiplier applied to {@link Hostage.hitRadius} while incapacitated. A
 * horizontal corpse is wider than a kneeling rig is tall, so widening the
 * sphere makes the SCI heal bolt connect with the silhouette without
 * requiring a precise vertical-down shot.
 */
export const HOSTAGE_DEAD_HIT_RADIUS_SCALE = 1.45

/** Configuration for constructing a {@link Hostage}. */
export interface HostageConfig {
  /** Maximum health points (default {@link HOSTAGE_DEFAULT_MAX_HP}). */
  maxHp?: number
  /** Collision radius for projectile hit checks. */
  hitRadius?: number
  /**
   * World-space hit sphere center = {@link Hostage.position} + (0, this, 0).
   * Prefer values derived from the GLB AABB (see FPS hostage spawn) so LAS/heals align with the body.
   */
  hitCenterOffsetY?: number
}

/**
 * Rescue target with HP — damage from enemies or friendly fire, heal from med bolt.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/asteroid-lander-gdd.md
 */
export class Hostage {
  /** World-space anchor — sync with visual root; hit sphere uses {@link hitCenterOffsetY}. */
  readonly position = new THREE.Vector3()

  /** Current health points. */
  hp: number

  /** Maximum health points. */
  readonly maxHp: number

  /**
   * Collision radius for projectile hit checks. Mutable: enlarged by
   * {@link HOSTAGE_DEAD_HIT_RADIUS_SCALE} while incapacitated so the SCI heal
   * bolt can connect with the horizontal corpse silhouette; restored on
   * {@link revive}.
   */
  hitRadius: number

  /**
   * Meters above {@link position} for projectile / contact sphere center.
   * Mutable: dropped to {@link HOSTAGE_DEAD_HIT_CENTER_Y} while incapacitated
   * so the hit sphere sits on the body lying on the ground rather than
   * floating where the kneeling rig used to be; restored on {@link revive}.
   */
  hitCenterOffsetY: number

  /** Alive-pose hit radius — preserved so {@link revive} can restore it. */
  private readonly aliveHitRadius: number

  /** Alive-pose hit center offset — preserved so {@link revive} can restore it. */
  private readonly aliveHitCenterOffsetY: number

  /** Fired when HP reaches zero after damage. */
  onDeath: (() => void) | null = null

  /**
   * Fired when {@link revive} restores HP to an incapacitated hostage. Drives
   * the visual transition (cancel dying clip, replay praying, re-show HP bar)
   * inside `HostageInstance`.
   */
  onRevive: (() => void) | null = null

  /**
   * @param config - HP pool, hit volume (defaults match player-scale 100 HP demo)
   */
  constructor(config: Partial<HostageConfig> = {}) {
    this.maxHp = config.maxHp ?? HOSTAGE_DEFAULT_MAX_HP
    this.hp = this.maxHp
    this.aliveHitRadius = config.hitRadius ?? HOSTAGE_DEFAULT_HIT_RADIUS
    this.aliveHitCenterOffsetY = config.hitCenterOffsetY ?? HOSTAGE_HIT_CENTER_Y
    this.hitRadius = this.aliveHitRadius
    this.hitCenterOffsetY = this.aliveHitCenterOffsetY
  }

  /** World Y of the projectile hit sphere center. */
  get hitCenterWorldY(): number {
    return this.position.y + this.hitCenterOffsetY
  }

  /** Whether the hostage is still alive. */
  get alive(): boolean {
    return this.hp > 0
  }

  /**
   * World position of the projectile hit sphere center.
   *
   * @returns Center used by {@link ProjectileSystem} and enemy projectiles
   */
  hitCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.position.x, this.hitCenterWorldY, this.position.z)
  }

  /**
   * Apply damage. Invokes {@link onDeath} when HP reaches zero.
   *
   * @param amount - Damage to subtract
   */
  takeDamage(amount: number): void {
    if (!this.alive) return
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.hitCenterOffsetY = HOSTAGE_DEAD_HIT_CENTER_Y
      this.hitRadius = this.aliveHitRadius * HOSTAGE_DEAD_HIT_RADIUS_SCALE
      this.onDeath?.()
    }
  }

  /**
   * Restore health (e.g. med bolt). Does not exceed {@link maxHp}. No-op while
   * incapacitated — use {@link revive} to bring a downed hostage back.
   *
   * @param amount - HP to add
   */
  heal(amount: number): void {
    if (!this.alive) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
  }

  /**
   * Bring an incapacitated hostage back online at full HP and fire
   * {@link onRevive}. No-op when the hostage is already alive — heal increments
   * for the alive case live in {@link heal}.
   */
  revive(): void {
    if (this.alive) return
    this.hp = this.maxHp
    this.hitCenterOffsetY = this.aliveHitCenterOffsetY
    this.hitRadius = this.aliveHitRadius
    this.onRevive?.()
  }
}
