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
import type { Hostage } from './hostage'
import type { ChaseTargetSite } from './chaseTargeting'

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
const EMPTY_HOSTAGES: readonly Hostage[] = []

/** Default behavior output before the first tick fills aim targets. */
const INITIAL_BEHAVIOR_OUTPUT: EnemyBehaviorOutput = {
  moveDir: { x: 0, z: 0 },
  isMoving: false,
  isChasing: false,
  isAgitated: false,
  wantsToFire: false,
  aimTargetX: 0,
  aimTargetY: 0,
  aimTargetZ: 0,
}

export class EnemyDirector implements Tickable {
  private readonly handles: EnemyHandle[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0
  private hostageEntities: readonly Hostage[] = EMPTY_HOSTAGES
  /** Rebuilt each tick from {@link hostageEntities} — passed to behaviors. */
  private readonly chaseSiteScratch: ChaseTargetSite[] = []

  /** Fired when an enemy touches the player. */
  onContactDamage: ((handle: EnemyHandle, damage: number) => void) | null = null

  /**
   * Fired when an enemy touches a hostage (player was not in contact range).
   *
   * @param handle - Aggressor enemy
   * @param hostage - Damaged hostage entity
   * @param damage - Contact damage amount from enemy config
   */
  onHostageContactDamage: ((handle: EnemyHandle, hostage: Hostage, damage: number) => void) | null = null

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
   * Alive hostages for aggro, ranged aim, and melee contact against rescue targets.
   * Pass empty when the level has no hostages.
   *
   * @param hostages - Domain entities whose positions are read each tick
   */
  setHostageTargets(hostages: readonly Hostage[]): void {
    this.hostageEntities = hostages
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
      lastOutput: { ...INITIAL_BEHAVIOR_OUTPUT },
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
    this.chaseSiteScratch.length = 0
    for (const h of this.hostageEntities) {
      if (!h.alive) continue
      this.chaseSiteScratch.push({
        x: h.position.x,
        y: h.hitCenterWorldY,
        z: h.position.z,
      })
    }

    for (const handle of this.handles) {
      if (!handle.enemy.alive) continue

      // Tick behavior
      const output = handle.behavior.tick(
        dt,
        handle.enemy.position.x,
        handle.enemy.position.z,
        this.playerX,
        this.playerY,
        this.playerZ,
        this.chaseSiteScratch,
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

      // Contact damage — player first, then nearest alive hostage
      handle.contactCooldown = Math.max(0, handle.contactCooldown - dt)
      if (handle.contactCooldown <= 0) {
        const cx = handle.enemy.position.x - this.playerX
        const cy = handle.enemy.position.y - this.playerY
        const cz = handle.enemy.position.z - this.playerZ
        const contactDist = Math.sqrt(cx * cx + cy * cy + cz * cz)
        if (contactDist <= handle.config.contactRadius) {
          this.onContactDamage?.(handle, handle.config.contactDamage)
          handle.contactCooldown = handle.config.contactCooldown
        } else {
          for (const hostage of this.hostageEntities) {
            if (!hostage.alive) continue
            const tcx = handle.enemy.position.x - hostage.position.x
            const tcy = handle.enemy.position.y - hostage.hitCenterWorldY
            const tcz = handle.enemy.position.z - hostage.position.z
            const hostageContactDist = Math.sqrt(tcx * tcx + tcy * tcy + tcz * tcz)
            if (hostageContactDist <= handle.config.contactRadius) {
              hostage.takeDamage(handle.config.contactDamage)
              this.onHostageContactDamage?.(handle, hostage, handle.config.contactDamage)
              handle.contactCooldown = handle.config.contactCooldown
              break
            }
          }
        }
      }
    }
  }
}
