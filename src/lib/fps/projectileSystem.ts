/**
 * Manages projectile lifecycle: spawn, movement, terrain collision, cleanup.
 *
 * Pure game logic — owns projectile state and Three.js meshes. Checks
 * terrain collision via heightmap each frame. Calls onImpact when a
 * projectile hits terrain so the ViewController can spawn particles.
 * Combat bolts pick the **nearest** hit along each step among enemies; **weapon**
 * (LAS) bolts also target hostages (friendly fire). **Drill** does not damage hostages.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { Enemy } from './enemy'
import type { Hostage } from './hostage'
import type { MultiToolMode } from './multiToolState'
import projectileBoltVertexShader from '@/three/shaders/effects/projectileBolt.vert.glsl?raw'
import projectileBoltFragmentShader from '@/three/shaders/effects/projectileBolt.frag.glsl?raw'

/** Bolt projectile speed (units/s). */
const BOLT_SPEED = 200
/** Bolt length (units). */
const BOLT_LENGTH = 6.0
/** Bolt width (units). */
const BOLT_WIDTH = 0.04
/** Max bolt lifetime before removal (seconds). */
const BOLT_MAX_LIFETIME = 4.0
/** Terrain collision margin — bolt Y vs floor Y. */
const TERRAIN_HIT_MARGIN = 0.5
/** Damage per weapon/drill bolt hit on enemies; weapon bolts also damage hostages (friendly fire). */
const BOLT_DAMAGE = 25

/** HP restored when a med bolt hits a hostage. */
const HEAL_BOLT_AMOUNT = 25

/** Sphere registration for a mineable surface rock. */
export interface MineableRockEntry {
  /** Stable spawn index from the rock distribution. */
  spawnIndex: number
  /** Sphere center in world space. */
  cx: number
  cy: number
  cz: number
  /** Sphere radius for swept collision. */
  radius: number
}

/** Internal projectile state. */
interface Projectile {
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  velocity: THREE.Vector3
  age: number
  /** Which multi-tool mode spawned this bolt — drives damage vs heal. */
  boltKind: MultiToolMode
}

/**
 * Projectile system — spawns, moves, and collides bolt projectiles.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
export class ProjectileSystem implements Tickable {
  private readonly projectiles: Projectile[] = []
  private readonly pool: Projectile[] = []
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly enemies: Enemy[] = []
  private readonly hostages: Hostage[] = []
  private readonly rocks: MineableRockEntry[] = []
  private damageMultiplier = 1
  private readonly _hostageCenter = new THREE.Vector3()
  private static readonly boltGeometry = (() => {
    const geometry = new THREE.CylinderGeometry(BOLT_WIDTH, BOLT_WIDTH, BOLT_LENGTH, 6, 1, false)
    geometry.rotateX(Math.PI / 2)
    return geometry
  })()

  /**
   * Called when a projectile hits terrain.
   *
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   */
  onImpact: ((position: THREE.Vector3) => void) | null = null
  /**
   * Called when a projectile hits an enemy.
   *
   * @param enemy - Enemy that took the hit
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   */
  onEnemyHit: ((enemy: Enemy, position: THREE.Vector3) => void) | null = null

  /**
   * Called when a player bolt hits a hostage — damage (weapon/drill) or heal (med).
   *
   * @param hostage - Hit hostage
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   * @param effect - Whether the bolt hurt or healed
   */
  onHostageBolt: ((
    hostage: Hostage,
    position: THREE.Vector3,
    effect: 'damage' | 'heal',
  ) => void) | null = null

  /**
   * Called when a **drill** bolt hits a registered mineable rock.
   *
   * @param spawnIndex - Stable id of the hit rock (matches the
   *   collider id `surface-rock-${spawnIndex}`).
   * @param position - **Transient** impact point. Mutated on the next
   *   callback; copy if you need to keep it past the synchronous handler body.
   */
  onRockHit: ((spawnIndex: number, position: THREE.Vector3) => void) | null = null

  /**
   * Reused scratch position for impact/hit callbacks. Allocated once per
   * `ProjectileSystem` so callers do not have to clone every frame; the
   * **transient** contract on the callback typedefs documents that consumers
   * must copy if they need to keep the value past the synchronous call.
   */
  private readonly _callbackPos = new THREE.Vector3()

  constructor(scene: THREE.Scene, heightmap: Heightmap) {
    this.scene = scene
    this.heightmap = heightmap
  }

  /** Register an enemy for projectile collision checks. */
  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy)
  }

  /**
   * Set the damage multiplier applied to every bolt hit.
   * A multiplier of 1 is base damage; values above 1 increase damage.
   *
   * @param multiplier - Damage scale factor (e.g. 1.35 for +35% damage).
   */
  setDamageMultiplier(multiplier: number): void {
    this.damageMultiplier = multiplier
  }

  /** Remove an enemy from collision checks. */
  removeEnemy(enemy: Enemy): void {
    const idx = this.enemies.indexOf(enemy)
    if (idx >= 0) this.enemies.splice(idx, 1)
  }

  /** Register a hostage for bolt collision (weapon friendly fire + med heal; not drill). */
  addHostage(hostage: Hostage): void {
    this.hostages.push(hostage)
  }

  /** Remove a hostage from collision checks (e.g. after death). */
  removeHostage(hostage: Hostage): void {
    const idx = this.hostages.indexOf(hostage)
    if (idx >= 0) this.hostages.splice(idx, 1)
  }

  /**
   * Register a mineable surface rock. Drill bolts (only) will collide
   * with the registered sphere and emit `onRockHit`.
   */
  addRock(entry: MineableRockEntry): void {
    this.rocks.push(entry)
  }

  /** Remove a rock from drill collision checks (e.g. after depletion). */
  removeRock(spawnIndex: number): void {
    const idx = this.rocks.findIndex((r) => r.spawnIndex === spawnIndex)
    if (idx >= 0) this.rocks.splice(idx, 1)
  }

  /**
   * Ray-pick the nearest registered mineable rock along
   * `origin → origin + dir * maxDistance`. Returns the spawn index
   * and intersection distance, or `null` when nothing is hit.
   *
   * Cheap — reuses the same swept-sphere math as drill bolts but
   * with arbitrary segment length, so the HUD can highlight the rock
   * the player is currently aiming at without spinning up a Three.js
   * `Raycaster` against thousands of instanced rocks.
   *
   * @param origin Camera world-space position.
   * @param dir Normalised camera forward.
   * @param maxDistance Maximum range of the pick (world units).
   */
  pickRock(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    maxDistance: number,
  ): { spawnIndex: number; distance: number } | null {
    if (this.rocks.length === 0) return null
    const tx = origin.x + dir.x * maxDistance
    const ty = origin.y + dir.y * maxDistance
    const tz = origin.z + dir.z * maxDistance
    this._pickFrom.copy(origin)
    this._pickTo.set(tx, ty, tz)
    let best: { spawnIndex: number; distance: number } | null = null
    for (const rock of this.rocks) {
      const t = this.segmentEnterSphereT(
        this._pickFrom, this._pickTo,
        rock.cx, rock.cy, rock.cz, rock.radius,
      )
      if (t === null) continue
      const distance = t * maxDistance
      if (best === null || distance < best.distance) {
        best = { spawnIndex: rock.spawnIndex, distance }
      }
    }
    return best
  }

  /** Reused scratch for {@link pickRock}. */
  private readonly _pickFrom = new THREE.Vector3()
  private readonly _pickTo = new THREE.Vector3()

  /**
   * Spawn a bolt projectile.
   *
   * @param origin - World-space spawn position
   * @param direction - Normalized travel direction
   * @param color - Bolt color
   * @param boltKind - Active multi-tool mode for this shot
   */
  spawn(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    color: THREE.Color,
    boltKind: MultiToolMode,
  ): void {
    let projectile = this.pool.pop()
    if (!projectile) {
      projectile = this.createProjectile()
      this.scene.add(projectile.mesh)
    }
    const mesh = projectile.mesh
    const material = projectile.material

    mesh.position.copy(origin)
    mesh.lookAt(this._lookTarget.copy(origin).add(direction))
    material.uniforms['uColor']!.value.copy(color)
    material.uniforms['uTime']!.value = 0
    mesh.visible = true

    this.projectiles.push({
      mesh,
      material,
      velocity: direction.clone().multiplyScalar(BOLT_SPEED),
      age: 0,
      boltKind,
    })
  }

  private readonly _prevPos = new THREE.Vector3()
  private readonly _lookTarget = new THREE.Vector3()

  tick(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.age += dt

      // Save previous position for swept collision
      this._prevPos.copy(p.mesh.position)
      p.mesh.position.addScaledVector(p.velocity, dt)

      // Feed time uniform
      if (p.material.uniforms['uTime']) {
        p.material.uniforms['uTime'].value = p.age
      }

      const pos = p.mesh.position

      // Med bolts: only hostages (closest along segment). Weapon/drill: enemies; weapon also contests hostages (friendly fire) with closest-hit wins.
      let hitEnemy = false
      let hitHostage = false
      let hitRock = false

      if (p.boltKind === 'heal') {
        const healHit = this.closestHostageHealHit(this._prevPos, pos)
        if (healHit) {
          healHit.hostage.heal(HEAL_BOLT_AMOUNT)
          this._callbackPos.copy(pos)
          this.onHostageBolt?.(healHit.hostage, this._callbackPos, 'heal')
          hitHostage = true
        }
      } else {
        const combatHit = this.closestCombatBoltHit(this._prevPos, pos, p.boltKind)
        if (combatHit?.kind === 'enemy') {
          combatHit.enemy.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this._callbackPos.copy(pos)
          this.onEnemyHit?.(combatHit.enemy, this._callbackPos)
          hitEnemy = true
        } else if (combatHit?.kind === 'hostage') {
          combatHit.hostage.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this._callbackPos.copy(pos)
          this.onHostageBolt?.(combatHit.hostage, this._callbackPos, 'damage')
          hitHostage = true
        }

        // Drill bolts also mine registered rocks. Combat hits win first
        // so a rock standing right next to an enemy doesn't eat the bolt.
        if (!hitEnemy && !hitHostage && p.boltKind === 'drill') {
          const rockHit = this.closestRockHit(this._prevPos, pos)
          if (rockHit) {
            this._callbackPos.copy(pos)
            this.onRockHit?.(rockHit.spawnIndex, this._callbackPos)
            hitRock = true
          }
        }
      }

      // Terrain collision
      const floorY = this.heightmap.heightAt(pos.x, pos.z)
      const hitTerrain = pos.y <= floorY + TERRAIN_HIT_MARGIN

      // Remove on hit or timeout
      if (hitEnemy || hitHostage || hitRock || hitTerrain || p.age >= BOLT_MAX_LIFETIME) {
        if (hitTerrain || hitEnemy || hitHostage || hitRock) {
          this._callbackPos.copy(pos)
          this.onImpact?.(this._callbackPos)
        }
        this.removeProjectile(i)
      }
    }
  }

  /**
   * Closest mineable rock along the swept segment. Used only by drill
   * bolts; weapon bolts and med bolts ignore the rock registry.
   */
  private closestRockHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): { spawnIndex: number; t: number } | null {
    let best: { spawnIndex: number; t: number } | null = null
    for (const rock of this.rocks) {
      const t = this.segmentEnterSphereT(from, to, rock.cx, rock.cy, rock.cz, rock.radius)
      if (t !== null && (best === null || t < best.t)) {
        best = { spawnIndex: rock.spawnIndex, t }
      }
    }
    return best
  }

  /**
   * Smallest parameter t in [0, 1] where the segment from→to enters the sphere, or 0 if `from` is already inside.
   * Returns null if the segment does not intersect the sphere.
   */
  private segmentEnterSphereT(
    from: THREE.Vector3,
    to: THREE.Vector3,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
  ): number | null {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const fx = from.x - cx
    const fy = from.y - cy
    const fz = from.z - cz

    const distStartSq = fx * fx + fy * fy + fz * fz
    const rSq = radius * radius
    if (distStartSq <= rSq) {
      return 0
    }

    const a = dx * dx + dy * dy + dz * dz
    const SEGMENT_LEN_EPS_SQ = 1e-16
    if (a < SEGMENT_LEN_EPS_SQ) {
      return null
    }

    const b = 2 * (fx * dx + fy * dy + fz * dz)
    const c = distStartSq - rSq
    const discriminant = b * b - 4 * a * c
    if (discriminant < 0) {
      return null
    }

    const sqrtD = Math.sqrt(discriminant)
    const t0 = (-b - sqrtD) / (2 * a)
    const t1 = (-b + sqrtD) / (2 * a)
    let best: number | null = null
    if (t0 >= 0 && t0 <= 1 && (best === null || t0 < best)) {
      best = t0
    }
    if (t1 >= 0 && t1 <= 1 && (best === null || t1 < best)) {
      best = t1
    }
    return best
  }

  /**
   * Closest hostage along the segment for a med bolt (heal).
   *
   * @param from - Segment start (previous projectile position)
   * @param to - Segment end (current projectile position)
   */
  private closestHostageHealHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): { hostage: Hostage; t: number } | null {
    let best: { hostage: Hostage; t: number } | null = null
    for (const hostage of this.hostages) {
      if (!hostage.alive) continue
      hostage.hitCenter(this._hostageCenter)
      const t = this.segmentEnterSphereT(
        from,
        to,
        this._hostageCenter.x,
        this._hostageCenter.y,
        this._hostageCenter.z,
        hostage.hitRadius,
      )
      if (t !== null && (best === null || t < best.t)) {
        best = { hostage, t }
      }
    }
    return best
  }

  /**
   * Closest hit among enemies (weapon + drill) and hostages (weapon only — LAS friendly fire).
   *
   * @param from - Segment start
   * @param to - Segment end
   * @param boltKind - `weapon` checks hostages; `drill` does not damage hostages
   */
  private closestCombatBoltHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
    boltKind: MultiToolMode,
  ):
    | { kind: 'enemy'; enemy: Enemy; t: number }
    | { kind: 'hostage'; hostage: Hostage; t: number }
    | null {
    let best:
      | { kind: 'enemy'; enemy: Enemy; t: number }
      | { kind: 'hostage'; hostage: Hostage; t: number }
      | null = null

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      const t = this.segmentEnterSphereT(
        from,
        to,
        enemy.position.x,
        enemy.position.y,
        enemy.position.z,
        enemy.hitRadius,
      )
      if (t !== null && (best === null || t < best.t)) {
        best = { kind: 'enemy', enemy, t }
      }
    }

    if (boltKind === 'weapon') {
      for (const hostage of this.hostages) {
        if (!hostage.alive) continue
        hostage.hitCenter(this._hostageCenter)
        const t = this.segmentEnterSphereT(
          from,
          to,
          this._hostageCenter.x,
          this._hostageCenter.y,
          this._hostageCenter.z,
          hostage.hitRadius,
        )
        if (t !== null && (best === null || t < best.t)) {
          best = { kind: 'hostage', hostage, t }
        }
      }
    }

    return best
  }

  private removeProjectile(index: number): void {
    const p = this.projectiles[index]!
    p.mesh.visible = false
    this.projectiles.splice(index, 1)
    this.pool.push(p)
  }

  dispose(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i)
    }
    for (const projectile of this.pool) {
      this.scene.remove(projectile.mesh)
      projectile.material.dispose()
    }
    this.pool.length = 0
  }

  /**
   * Pre-allocate `count` projectile instances and add their meshes to the
   * scene as invisible. Without this the pool starts empty and the first
   * shots of a session each compile a fresh `ShaderMaterial` program
   * synchronously the next time the renderer draws — visible as a hitch
   * the first time the player fires while turning.
   *
   * Safe to call once during `init()` after the scene is built so the
   * level's `renderer.compileAsync(scene, camera)` warmup pass walks over
   * the prewarmed meshes (`compile` traverses with `traverse`, not
   * `traverseVisible`, so invisible meshes still get warmed).
   *
   * @param count - Number of projectiles to prewarm. Conservative default
   *   matches a short multitool burst.
   *
   * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v4)
   */
  prewarmPool(count: number = 16): void {
    for (let i = 0; i < count; i++) {
      const projectile = this.createProjectile()
      this.scene.add(projectile.mesh)
      this.pool.push(projectile)
    }
  }

  private createProjectile(): Projectile {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color() },
        uTime: { value: 0 },
      },
      vertexShader: projectileBoltVertexShader,
      fragmentShader: projectileBoltFragmentShader,
    })

    const mesh = new THREE.Mesh(ProjectileSystem.boltGeometry, material)
    mesh.frustumCulled = false
    mesh.visible = false

    return {
      mesh,
      material,
      velocity: new THREE.Vector3(),
      age: 0,
      boltKind: 'weapon',
    }
  }
}
