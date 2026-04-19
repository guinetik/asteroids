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
import { AggroBehavior, type AggroEyeProjectileConfig } from './aggroBehavior'
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

/**
 * Clearance beyond combined {@link EnemyTypeConfig.hitRadius} values before
 * separation is considered satisfied (world units).
 */
const ENEMY_SEPARATION_PADDING = 0.55

/**
 * Separation push magnitude when fully overlapped (world units / second); scaled
 * by how deep inside the comfort zone the other enemy is.
 */
const ENEMY_SEPARATION_ACCEL = 14

/**
 * Squared XZ distance below which two enemies are treated as coincident for
 * repulsion direction (avoids normalize of near-zero).
 */
const ENEMY_SEPARATION_COINCIDENT_DIST_SQ = 1e-6

/**
 * Golden-ish angle step so coincident spawns spread on different axes.
 */
const ENEMY_SEPARATION_COINCIDENT_ANGLE_STEP = 2.399963229728653

/**
 * After behavior intents are computed, apply XZ displacement = intent + separation
 * so alive enemies do not sit on the same spot (boids-style repulsion in XZ only).
 *
 * @param handles - All director handles (dead entries ignored)
 * @param dt - Delta time in seconds
 */
function applyMovementWithSeparation(handles: readonly EnemyHandle[], dt: number): void {
  const alive: EnemyHandle[] = []
  for (const h of handles) {
    if (h.enemy.alive) alive.push(h)
  }
  const n = alive.length
  if (n === 0) return

  const startX: number[] = new Array(n)
  const startZ: number[] = new Array(n)
  const radius: number[] = new Array(n)
  const intentX: number[] = new Array(n)
  const intentZ: number[] = new Array(n)

  for (let i = 0; i < n; i++) {
    const h = alive[i]!
    startX[i] = h.enemy.position.x
    startZ[i] = h.enemy.position.z
    radius[i] = h.config.hitRadius

    const output = h.lastOutput
    const speed = output.isMoving
      ? (output.isChasing ? h.config.speed : h.config.wanderSpeed)
      : 0
    if (output.isMoving && speed > 0) {
      intentX[i] = output.moveDir.x * speed * dt
      intentZ[i] = output.moveDir.z * speed * dt
    } else {
      intentX[i] = 0
      intentZ[i] = 0
    }
  }

  const sepX: number[] = new Array(n).fill(0)
  const sepZ: number[] = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dx = startX[i]! - startX[j]!
      const dz = startZ[i]! - startZ[j]!
      const distSq = dx * dx + dz * dz
      const minDist = radius[i]! + radius[j]! + ENEMY_SEPARATION_PADDING
      const minSq = minDist * minDist
      if (distSq >= minSq) continue

      let nx: number
      let nz: number
      if (distSq <= ENEMY_SEPARATION_COINCIDENT_DIST_SQ) {
        const ang = i * ENEMY_SEPARATION_COINCIDENT_ANGLE_STEP
        nx = Math.cos(ang)
        nz = Math.sin(ang)
      } else {
        const inv = 1 / Math.sqrt(distSq)
        nx = dx * inv
        nz = dz * inv
      }

      const dist = distSq <= ENEMY_SEPARATION_COINCIDENT_DIST_SQ ? 0 : Math.sqrt(distSq)
      const urgency = dist <= ENEMY_SEPARATION_COINCIDENT_DIST_SQ ? 1 : (minDist - dist) / minDist
      sepX[i]! += nx * urgency * ENEMY_SEPARATION_ACCEL
      sepZ[i]! += nz * urgency * ENEMY_SEPARATION_ACCEL
    }
  }

  for (let i = 0; i < n; i++) {
    const h = alive[i]!
    h.enemy.position.x = startX[i]! + intentX[i]! + sepX[i]! * dt
    h.enemy.position.z = startZ[i]! + intentZ[i]! + sepZ[i]! * dt
  }
}

/**
 * Spawns enemies, runs AI ticks, separation, and contact/hostage rules each frame.
 */
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

    const eyeProjectile: AggroEyeProjectileConfig | undefined =
      config.preferredRange <= 0 &&
      config.projectileSpeed > 0 &&
      config.fireRate > 0 &&
      config.eyeLaserMaxRange > config.eyeLaserMinRange
        ? {
            fireRate: config.fireRate,
            minRange: config.eyeLaserMinRange,
            maxRange: config.eyeLaserMaxRange,
          }
        : undefined

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
          eyeProjectile,
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

      // Tick behavior (movement applied below with pairwise separation)
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
    }

    applyMovementWithSeparation(this.handles, dt)

    for (const handle of this.handles) {
      if (!handle.enemy.alive) continue

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
