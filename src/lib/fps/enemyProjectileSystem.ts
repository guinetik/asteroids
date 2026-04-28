/**
 * Enemy projectile system — manages enemy-fired projectiles and
 * checks collision against the player.
 *
 * Pure domain logic. No Three.js. The VC creates visual meshes
 * and syncs their positions via callbacks.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { Hostage } from './hostage'

/** Maximum age (seconds) before a projectile is automatically removed. */
const MAX_LIFETIME = 4.0

/** Sphere radius (units) used for player-projectile collision detection. */
const PLAYER_HIT_RADIUS = 1.5
/** Tolerance for burst timers landing exactly on a frame boundary. */
const BURST_TIMER_EPSILON_SECONDS = 1e-9

/**
 * Internal state for a single enemy-fired projectile.
 */
interface EnemyProjectile {
  /** Unique numeric identifier for this projectile. */
  id: number
  /** Current X position in world space. */
  x: number
  /** Current Y position in world space. */
  y: number
  /** Current Z position in world space. */
  z: number
  /** X velocity (units/s). */
  vx: number
  /** Y velocity (units/s). */
  vy: number
  /** Z velocity (units/s). */
  vz: number
  /** Elapsed time since spawn (seconds). */
  age: number
  /** Damage dealt to the player on collision. */
  damage: number
  /** X position at spawn, reported back via onPlayerHit. */
  sourceX: number
  /** Z position at spawn, reported back via onPlayerHit. */
  sourceZ: number
}

/**
 * Internal queue entry for a short sequential projectile burst.
 */
interface EnemyProjectileBurst {
  /** World X coordinate where every burst shot spawns. */
  x: number
  /** World Y coordinate where every burst shot spawns. */
  y: number
  /** World Z coordinate where every burst shot spawns. */
  z: number
  /** Normalized X direction shared by all burst shots. */
  dirX: number
  /** Normalized Y direction shared by all burst shots. */
  dirY: number
  /** Normalized Z direction shared by all burst shots. */
  dirZ: number
  /** Projectile speed applied to each shot. */
  speed: number
  /** Projectile damage applied to each shot. */
  damage: number
  /** Shots left to spawn after the immediate first shot. */
  remaining: number
  /** Seconds between queued shots. */
  intervalSeconds: number
  /** Seconds until the next queued shot should spawn. */
  timerSeconds: number
}

/**
 * Manages enemy-fired projectiles with player collision detection.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class EnemyProjectileSystem implements Tickable {
  private readonly projectiles: EnemyProjectile[] = []
  private readonly bursts: EnemyProjectileBurst[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0
  private readonly hostages: Hostage[] = []

  /** Fired when a projectile hits the player. Args: damage, sourceX, sourceZ. */
  onPlayerHit: ((damage: number, sourceX: number, sourceZ: number) => void) | null = null

  /**
   * Fired when a projectile hits a hostage instead of the player.
   *
   * @param hostage - Hit hostage
   * @param damage - Projectile damage amount
   * @param sourceX - Spawn X (knockback / feedback)
   * @param sourceZ - Spawn Z
   */
  onHostageHit:
    | ((hostage: Hostage, damage: number, sourceX: number, sourceZ: number) => void)
    | null = null

  /** Fired each frame per projectile with updated position. Args: id, x, y, z. */
  onProjectileMove: ((id: number, x: number, y: number, z: number) => void) | null = null

  /** Fired when a projectile is removed (hit or expired). Args: id. */
  onProjectileRemoved: ((id: number) => void) | null = null

  /** Number of active projectiles. */
  get projectileCount(): number {
    return this.projectiles.length
  }

  /** Update the player position used for collision checks. */
  setPlayerPosition(x: number, y: number, z: number): void {
    this.playerX = x
    this.playerY = y
    this.playerZ = z
  }

  /** Register hostages for projectile collision (after the player check). */
  addHostage(hostage: Hostage): void {
    this.hostages.push(hostage)
  }

  /** Remove a hostage from collision checks. */
  removeHostage(hostage: Hostage): void {
    const idx = this.hostages.indexOf(hostage)
    if (idx >= 0) this.hostages.splice(idx, 1)
  }

  /**
   * Spawn an enemy projectile.
   *
   * @param x - Spawn X position
   * @param y - Spawn Y position
   * @param z - Spawn Z position
   * @param dirX - Normalized direction X
   * @param dirY - Normalized direction Y
   * @param dirZ - Normalized direction Z
   * @param speed - Projectile speed (units/s)
   * @param damage - Damage on player hit
   * @returns Projectile ID for visual tracking
   */
  spawn(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    speed: number,
    damage: number,
  ): number {
    const id = this.nextId++
    this.projectiles.push({
      id,
      x,
      y,
      z,
      vx: dirX * speed,
      vy: dirY * speed,
      vz: dirZ * speed,
      age: 0,
      damage,
      sourceX: x,
      sourceZ: z,
    })
    return id
  }

  /**
   * Spawn an enemy projectile burst in quick succession.
   *
   * The first shot is created immediately so firing feedback happens on the
   * trigger frame. Remaining shots are queued into {@link tick}, which makes
   * fast bursts visible as distinct projectiles instead of stacked duplicates.
   *
   * @param x - Spawn X position shared by every burst shot.
   * @param y - Spawn Y position shared by every burst shot.
   * @param z - Spawn Z position shared by every burst shot.
   * @param dirX - Normalized direction X shared by every burst shot.
   * @param dirY - Normalized direction Y shared by every burst shot.
   * @param dirZ - Normalized direction Z shared by every burst shot.
   * @param speed - Projectile speed in units/s.
   * @param damage - Damage on player or hostage hit.
   * @param count - Number of shots in the burst, e.g. `3`.
   * @param intervalSeconds - Delay between shots, e.g. `0.06`.
   * @returns Number of shots accepted for spawning.
   */
  spawnBurst(
    x: number,
    y: number,
    z: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    speed: number,
    damage: number,
    count: number,
    intervalSeconds: number,
  ): number {
    const shotCount = Math.max(0, Math.floor(count))
    if (shotCount === 0) return 0

    this.spawn(x, y, z, dirX, dirY, dirZ, speed, damage)
    const remaining = shotCount - 1
    if (remaining === 0) return shotCount

    if (intervalSeconds <= 0) {
      for (let i = 0; i < remaining; i++) {
        this.spawn(x, y, z, dirX, dirY, dirZ, speed, damage)
      }
      return shotCount
    }

    this.bursts.push({
      x,
      y,
      z,
      dirX,
      dirY,
      dirZ,
      speed,
      damage,
      remaining,
      intervalSeconds,
      timerSeconds: intervalSeconds,
    })
    return shotCount
  }

  /** @inheritdoc */
  tick(dt: number): void {
    this.tickBursts(dt)

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.age += dt

      // Segment-sphere collision: check if the path travelled this tick
      // passes through the player hit sphere (catches fast projectiles).
      const ox = p.x - this.playerX
      const oy = p.y - this.playerY
      const oz = p.z - this.playerZ
      const segX = p.vx * dt
      const segY = p.vy * dt
      const segZ = p.vz * dt
      const a = segX * segX + segY * segY + segZ * segZ
      const b = 2 * (ox * segX + oy * segY + oz * segZ)
      const c = ox * ox + oy * oy + oz * oz - PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS
      const discriminant = b * b - 4 * a * c
      const hitPlayer =
        discriminant >= 0 &&
        (a === 0
          ? c <= 0
          : (() => {
              const sqrtD = Math.sqrt(discriminant)
              const t0 = (-b - sqrtD) / (2 * a)
              const t1 = (-b + sqrtD) / (2 * a)
              return t0 <= 1 && t1 >= 0
            })())

      // Move
      p.x += segX
      p.y += segY
      p.z += segZ

      if (hitPlayer) {
        this.onPlayerHit?.(p.damage, p.sourceX, p.sourceZ)
        this.onProjectileRemoved?.(p.id)
        this.projectiles.splice(i, 1)
        continue
      }

      let hitHostage: Hostage | null = null
      for (const h of this.hostages) {
        if (!h.alive) continue
        const hx = h.position.x
        const hy = h.hitCenterWorldY
        const hz = h.position.z
        const r = h.hitRadius
        const oxh = p.x - segX - hx
        const oyh = p.y - segY - hy
        const ozh = p.z - segZ - hz
        const ah = segX * segX + segY * segY + segZ * segZ
        const bh = 2 * (oxh * segX + oyh * segY + ozh * segZ)
        const ch = oxh * oxh + oyh * oyh + ozh * ozh - r * r
        const dh = bh * bh - 4 * ah * ch
        const segHitsHostage =
          dh >= 0 &&
          (ah === 0
            ? ch <= 0
            : (() => {
                const sqrtDh = Math.sqrt(dh)
                const t0h = (-bh - sqrtDh) / (2 * ah)
                const t1h = (-bh + sqrtDh) / (2 * ah)
                return t0h <= 1 && t1h >= 0
              })())
        if (segHitsHostage) {
          hitHostage = h
          break
        }
      }

      if (hitHostage) {
        hitHostage.takeDamage(p.damage)
        this.onHostageHit?.(hitHostage, p.damage, p.sourceX, p.sourceZ)
        this.onProjectileRemoved?.(p.id)
        this.projectiles.splice(i, 1)
        continue
      }

      // Expire
      if (p.age >= MAX_LIFETIME) {
        this.onProjectileRemoved?.(p.id)
        this.projectiles.splice(i, 1)
        continue
      }

      // Report position
      this.onProjectileMove?.(p.id, p.x, p.y, p.z)
    }
  }

  private tickBursts(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i]!
      burst.timerSeconds -= dt
      while (burst.remaining > 0 && burst.timerSeconds <= BURST_TIMER_EPSILON_SECONDS) {
        this.spawn(
          burst.x,
          burst.y,
          burst.z,
          burst.dirX,
          burst.dirY,
          burst.dirZ,
          burst.speed,
          burst.damage,
        )
        burst.remaining--
        burst.timerSeconds += burst.intervalSeconds
      }
      if (burst.remaining === 0) {
        this.bursts.splice(i, 1)
      }
    }
  }

  /** Remove all active projectiles and fire onProjectileRemoved for each. */
  dispose(): void {
    this.bursts.length = 0
    for (const p of this.projectiles) {
      this.onProjectileRemoved?.(p.id)
    }
    this.projectiles.length = 0
  }
}
