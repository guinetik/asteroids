/**
 * Enemy director — domain service that spawns, ticks, and manages enemies.
 *
 * Pure game logic. No Three.js dependencies. The ViewController reads
 * enemy positions each frame and syncs visual controllers.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { EnemyBehavior, EnemyBehaviorOutput } from './enemy'
import { Enemy } from './enemy'
import { AggroBehavior } from './aggroBehavior'
import { RangedBehavior } from './rangedBehavior'
import { getEnemyTypeConfig } from './enemyTypes'
import type { EnemyTypeConfig } from './enemyTypes'

/** Handle returned by spawn — used by the VC to bridge domain ↔ visuals. */
export interface EnemyHandle {
  /** Unique ID for this enemy instance. */
  readonly id: number
  /** Domain enemy entity (HP, position, hitRadius). */
  readonly enemy: Enemy
  /** AI behavior driving movement. */
  readonly behavior: EnemyBehavior
  /** Enemy type key (e.g. 'bacteriophage'). */
  readonly type: string
  /** Type config for reading speeds, radii, etc. */
  readonly config: EnemyTypeConfig
  /** Latest behavior output — read by VC each frame for visual sync. */
  lastOutput: EnemyBehaviorOutput
  /** Contact damage cooldown timer (seconds remaining). */
  contactCooldown: number
}

/**
 * Enemy director — manages spawning, AI ticking, and contact damage.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class EnemyDirector implements Tickable {
  private readonly handles: EnemyHandle[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0

  /** Fired when an enemy touches the player. */
  onContactDamage: ((handle: EnemyHandle, damage: number) => void) | null = null

  /** All currently tracked enemy handles (alive and dead). */
  get enemies(): readonly EnemyHandle[] {
    return this.handles
  }

  /** Update the player position reference for aggro and contact checks. */
  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerX = x
    this.playerY = y
    this.playerZ = z
  }

  /**
   * Spawn an enemy at the given world position.
   *
   * @param type - Enemy type key from enemy-types.json
   * @param x - World X position
   * @param y - World Y position
   * @param z - World Z position
   * @returns Handle for the spawned enemy
   */
  spawn(type: string, x: number, y: number, z: number): EnemyHandle {
    const config = getEnemyTypeConfig(type)

    const enemy = new Enemy({ maxHp: config.maxHp, hitRadius: config.hitRadius })
    enemy.position.set(x, y, z)

    const behavior = config.preferredRange > 0
      ? new RangedBehavior({
          aggroRadius: config.aggroRadius,
          leashRadius: config.leashRadius,
          agitateRadius: config.agitateRadius,
          wanderRadius: config.wanderRadius,
          wanderSpeed: config.wanderSpeed,
          speed: config.speed,
          preferredRange: config.preferredRange,
          minRange: config.minRange,
          fireRate: config.fireRate,
        })
      : new AggroBehavior({
          aggroRadius: config.aggroRadius,
          leashRadius: config.leashRadius,
          agitateRadius: config.agitateRadius,
          wanderRadius: config.wanderRadius,
          wanderSpeed: config.wanderSpeed,
          speed: config.speed,
        })

    const handle: EnemyHandle = {
      id: this.nextId++,
      enemy,
      behavior,
      type,
      config,
      lastOutput: { moveDir: { x: 0, z: 0 }, isMoving: false, isChasing: false, isAgitated: false, wantsToFire: false },
      contactCooldown: 0,
    }

    this.handles.push(handle)
    return handle
  }

  /** Remove an enemy from the director. */
  despawn(handle: EnemyHandle): void {
    const idx = this.handles.indexOf(handle)
    if (idx >= 0) this.handles.splice(idx, 1)
  }

  /** Remove all enemies. */
  despawnAll(): void {
    this.handles.length = 0
  }

  /** @inheritdoc */
  tick(dt: number): void {
    for (const handle of this.handles) {
      if (!handle.enemy.alive) continue

      // Tick behavior
      const output = handle.behavior.tick(
        dt,
        handle.enemy.position.x,
        handle.enemy.position.z,
        this.playerX,
        this.playerZ,
      )
      handle.lastOutput = output

      // Apply movement — chase uses full speed, idle wander uses wanderSpeed
      const speed = output.isMoving
        ? (output.isChasing ? handle.config.speed : handle.config.wanderSpeed)
        : 0

      if (output.isMoving && speed > 0) {
        handle.enemy.position.x += output.moveDir.x * speed * dt
        handle.enemy.position.z += output.moveDir.z * speed * dt
      }

      // Contact damage
      handle.contactCooldown = Math.max(0, handle.contactCooldown - dt)
      if (handle.contactCooldown <= 0) {
        const cx = handle.enemy.position.x - this.playerX
        const cy = handle.enemy.position.y - this.playerY
        const cz = handle.enemy.position.z - this.playerZ
        const contactDist = Math.sqrt(cx * cx + cy * cy + cz * cz)
        if (contactDist <= handle.config.contactRadius) {
          this.onContactDamage?.(handle, handle.config.contactDamage)
          handle.contactCooldown = handle.config.contactCooldown
        }
      }
    }
  }
}
