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

/** Maximum age (seconds) before a projectile is automatically removed. */
const MAX_LIFETIME = 4.0

/** Sphere radius (units) used for player-projectile collision detection. */
const PLAYER_HIT_RADIUS = 1.5

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
 * Manages enemy-fired projectiles with player collision detection.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-spire-enemy-design.md
 */
export class EnemyProjectileSystem implements Tickable {
  private readonly projectiles: EnemyProjectile[] = []
  private nextId = 1
  private playerX = 0
  private playerY = 0
  private playerZ = 0

  /** Fired when a projectile hits the player. Args: damage, sourceX, sourceZ. */
  onPlayerHit: ((damage: number, sourceX: number, sourceZ: number) => void) | null = null

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

  /** @inheritdoc */
  tick(dt: number): void {
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
      const hit = discriminant >= 0 && (a === 0 ? c <= 0 : (() => {
        const sqrtD = Math.sqrt(discriminant)
        const t0 = (-b - sqrtD) / (2 * a)
        const t1 = (-b + sqrtD) / (2 * a)
        return t0 <= 1 && t1 >= 0
      })())

      // Move
      p.x += segX
      p.y += segY
      p.z += segZ

      if (hit) {
        this.onPlayerHit?.(p.damage, p.sourceX, p.sourceZ)
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

  /** Remove all active projectiles and fire onProjectileRemoved for each. */
  dispose(): void {
    for (const p of this.projectiles) {
      this.onProjectileRemoved?.(p.id)
    }
    this.projectiles.length = 0
  }
}
