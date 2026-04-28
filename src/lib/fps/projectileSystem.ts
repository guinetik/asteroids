/**
 * Manages projectile lifecycle: spawn, movement, terrain collision, cleanup.
 *
 * Pure game logic — owns projectile state and Three.js meshes. Checks
 * terrain collision via heightmap each frame. Calls onImpact when a
 * projectile hits terrain (or a mineable rock for LAS) so the ViewController
 * can spawn particles. Combat bolts pick the **nearest** hit along each step
 * among enemies; **weapon** (LAS) bolts also target hostages (friendly fire)
 * and stop on registered rocks without mining. **Drill** does not damage hostages.
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
import type { LanderController } from '@/three/LanderController'
import { segmentIntersectsAabb3 } from '@/lib/physics/segmentAabb3'
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

/** HP restored when a science bolt hits a hostage (initial behavior). */
const HEAL_BOLT_AMOUNT = 25

/** HP restored when a science bolt triggers its first enemy hit reward. */
export const SCIENCE_ENEMY_HEAL_AMOUNT = 10

/** Seconds an enemy is frozen after its first science-bolt hit. */
export const SCIENCE_ENEMY_FREEZE_SECONDS = 2

/**
 * What surface or body a bolt struck when {@link ProjectileSystem.onImpact} runs.
 * Used for VFX and contact SFX; drill mining uses {@link ProjectileSystem.onRockHit} in addition
 * for `drill_rock`.
 */
export type ProjectileImpactKind =
  | 'terrain'
  | 'drill_rock'
  | 'science_rock'
  | 'science_rocket'
  | 'enemy'
  | 'hostage'
  /** Map EVA: science bolt struck the player shuttle hull AABB and applied hull repair. */
  | 'shuttle_hull'
  /** Map EVA: science bolt advanced satellite servicing repair on a rigged sub-object. */
  | 'satellite_repair'

/**
 * Carried with {@link ProjectileSystem.onImpact} so listeners can style feedback per mode/surface
 * (e.g. short sizzle on terrain vs looping sizzle on drilled rock).
 */
export interface ProjectileImpactContext {
  boltKind: MultiToolMode
  kind: ProjectileImpactKind
}

/**
 * Map EVA: science-bolt repair vs the tactical shuttle. Swept AABB of the huge-scale hull;
 * when {@link isHullFull} is true, bolts do not stop or heal.
 */
export interface MapEvaShuttleHullHealTarget {
  /**
   * @returns True when no further repair should register (hull at max) — projectiles pass through.
   */
  isHullFull(): boolean
  /**
   * @returns Tight world-space AABB of the EVA-scaled shuttle hull, or null when not available.
   */
  getHullAabb(): { min: THREE.Vector3; max: THREE.Vector3 } | null
  /**
   * Apply one heal tick after AABB contact; host drives HP + VFX + persist.
   *
   * @param amount - Same as hostage/lander ({@link HEAL_BOLT_AMOUNT}).
   * @returns Whether hull became 100% this frame.
   */
  onHealFromBolt(amount: number): { becameFull: boolean }
}

/**
 * Map EVA: science multitool vs the in-scene satellite repair controller
 * (swept AABB per damaged part).
 */
export interface EvaSatelliteServicingScienceBoltTarget {
  /**
   * @param from - Previous bolt position, world space.
   * @param to - New bolt position, world space.
   * @param outEntry - First entry point on a damaged part’s AABB, for impact VFX.
   * @returns True when a bolt was consumed.
   */
  tryScienceRepairSegment(from: THREE.Vector3, to: THREE.Vector3, outEntry: THREE.Vector3): boolean
}

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
  /** Which multi-tool mode spawned this bolt — drives damage vs science/heal effects. */
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

  /** Live count of in-flight projectiles. Read-only; consumed by the debug HUD. */
  get projectileCount(): number {
    return this.projectiles.length
  }

  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly enemies: Enemy[] = []
  private readonly hostages: Hostage[] = []
  private readonly rocks: MineableRockEntry[] = []
  private terrainCollisionEnabled = true
  private lander: LanderController | null = null
  private mapEvaShuttleHullHeal: MapEvaShuttleHullHealTarget | null = null
  /** Map EVA satellite-servicing minigame — science bolts repair rigged sub-objects. */
  private evaSatelliteServicingScience: EvaSatelliteServicingScienceBoltTarget | null = null
  /** Registered survey target (gather-mission rocket). Null when no gather mission is active. */
  private surveyTarget: THREE.Object3D | null = null
  /** Survey-target half extents (X, Y, Z) used for AABB hit testing. */
  private readonly _surveyHalfExtents = new THREE.Vector3()
  /** Reused scratch — survey target world position. */
  private readonly _surveyCenter = new THREE.Vector3()
  private damageMultiplier = 1
  private readonly _hostageCenter = new THREE.Vector3()
  private readonly _landerCenter = new THREE.Vector3()
  private static readonly boltGeometry = (() => {
    const geometry = new THREE.CylinderGeometry(BOLT_WIDTH, BOLT_WIDTH, BOLT_LENGTH, 6, 1, false)
    geometry.rotateX(Math.PI / 2)
    return geometry
  })()

  /**
   * Called when a projectile hits a solid (terrain, rock, enemy, or hostage).
   *
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   * @param context - Which tool mode and surface/body; see {@link ProjectileImpactContext}.
   */
  onImpact: ((position: THREE.Vector3, context: ProjectileImpactContext) => void) | null = null
  /**
   * Called when a projectile hits an enemy.
   *
   * @param enemy - Enemy that took the hit
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   */
  onEnemyHit:
    | ((
        enemy: Enemy,
        position: THREE.Vector3,
        boltKind: MultiToolMode,
        firstScienceHit: boolean,
      ) => void)
    | null = null

  /**
   * Called when a player bolt hits a hostage — damage (weapon/drill) or heal (science).
   *
   * @param hostage - Hit hostage
   * @param position - **Transient** impact point. Mutated on the next callback;
   *   copy if you need to keep it past the synchronous handler body.
   * @param effect - Whether the bolt hurt or healed
   */
  onHostageBolt:
    | ((hostage: Hostage, position: THREE.Vector3, effect: 'damage' | 'heal') => void)
    | null = null

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
   * Called when a **science** bolt hits a registered mineable rock.
   *
   * @param spawnIndex - Stable id of the hit rock.
   * @param position - **Transient** impact point. Mutated on the next
   *   callback; copy if you need to keep it past the synchronous handler body.
   */
  onScienceRockHit: ((spawnIndex: number, position: THREE.Vector3) => void) | null = null

  /**
   * Called when a **science** bolt hits the registered survey target
   * (the gather-mission delivery rocket). Hidden mechanic — never
   * surfaced via HUD.
   *
   * @param position - **Transient** impact point. Mutated on the next
   *   callback; copy if you need to keep it past the synchronous handler body.
   */
  onScienceRocketHit: ((position: THREE.Vector3) => void) | null = null

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
   * Enable or disable terrain-heightmap collision for player bolts.
   *
   * The bunker interior hides the asteroid surface but still reuses this
   * projectile system; disabling terrain collision there prevents invisible
   * asteroid geometry from eating shots and spawning terrain impact VFX.
   *
   * @param enabled - True for surface EVA, false while inside bunker interiors.
   */
  setTerrainCollisionEnabled(enabled: boolean): void {
    this.terrainCollisionEnabled = enabled
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

  /** Register a hostage for bolt collision (weapon friendly fire + science heal; not drill). */
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

  /** Register the lander for science bolt healing detection (green hull pulse). */
  setLander(lander: LanderController | null): void {
    this.lander = lander
  }

  /**
   * Register map EVA shuttle hull repair, or `null` to clear. Only science bolts; skipped when
   * {@link MapEvaShuttleHullHealTarget.isHullFull} is true.
   */
  setMapEvaShuttleHullHeal(target: MapEvaShuttleHullHealTarget | null): void {
    this.mapEvaShuttleHullHeal = target
  }

  /**
   * Register the EVA satellite-servicing science-bolt path, or `null` for map EVA without
   * an active in-scene repair minigame.
   */
  setEvaSatelliteServicingScience(target: EvaSatelliteServicingScienceBoltTarget | null): void {
    this.evaSatelliteServicingScience = target
  }

  /**
   * Register (or clear) the rocket-survey target. Pass `null` to clear.
   * Half extents define a local-axis AABB around the rocket world
   * position; the science-bolt branch checks this AABB before falling
   * through to the rock cascade.
   *
   * @param target - Object3D whose world position centers the AABB; pass `null` to clear.
   * @param halfExtents - Vector3 of half-extents (X, Y, Z) on the AABB; pass `null` to clear.
   */
  setSurveyTarget(target: THREE.Object3D | null, halfExtents: THREE.Vector3 | null): void {
    this.surveyTarget = target
    if (halfExtents) {
      this._surveyHalfExtents.copy(halfExtents)
    } else {
      this._surveyHalfExtents.set(0, 0, 0)
    }
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
        this._pickFrom,
        this._pickTo,
        rock.cx,
        rock.cy,
        rock.cz,
        rock.radius,
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

      // Science bolts: contextual Prey-style puzzle resolver with prioritized targets.
      // Order: hostages (heal), enemies (one-time status), satellite POI repair (before
      // shuttle hull — otherwise the huge-scale shuttle AABB eats shots toward the
      // satellite), lander, survey, rocks.
      let hitEnemy = false
      let hitHostage = false
      let hitRock = false
      let hitRocket = false
      let hitMapShuttleHull = false
      let hitSatelliteRepair = false

      if (p.boltKind === 'science') {
        const hostageHit = this.closestHostageHealHit(this._prevPos, pos)
        if (hostageHit) {
          hostageHit.hostage.heal(HEAL_BOLT_AMOUNT)
          this._callbackPos.copy(pos)
          this.onHostageBolt?.(hostageHit.hostage, this._callbackPos, 'heal')
          hitHostage = true
        } else {
          const scienceEnemyHit = this.closestEnemyHit(this._prevPos, pos)
          if (scienceEnemyHit) {
            const firstScienceHit = scienceEnemyHit.enemy.applyFirstScienceHit(
              SCIENCE_ENEMY_FREEZE_SECONDS,
            )
            this._callbackPos.copy(pos)
            this.onEnemyHit?.(scienceEnemyHit.enemy, this._callbackPos, p.boltKind, firstScienceHit)
            hitEnemy = true
          }
        }
        if (!hitEnemy && !hitHostage) {
          let landerHit = false
          if (
            this.evaSatelliteServicingScience?.tryScienceRepairSegment(
              this._prevPos,
              pos,
              this._callbackPos,
            ) === true
          ) {
            hitSatelliteRepair = true
            hitHostage = true
          } else {
            const healTgt = this.mapEvaShuttleHullHeal
            if (healTgt && !healTgt.isHullFull()) {
              const aabb = healTgt.getHullAabb()
              if (
                aabb &&
                segmentIntersectsAabb3(this._prevPos, pos, aabb.min, aabb.max, this._callbackPos)
              ) {
                healTgt.onHealFromBolt(HEAL_BOLT_AMOUNT)
                hitMapShuttleHull = true
                hitHostage = true
              }
            }
            if (!hitMapShuttleHull) {
              if (this.lander) {
                this.lander.group.getWorldPosition(this._landerCenter)
                const distSq = pos.distanceToSquared(this._landerCenter)
                // ~13.4 unit radius around lander center
                if (distSq < 180) {
                  this.lander.healHull(HEAL_BOLT_AMOUNT)
                  this._callbackPos.copy(pos)
                  hitHostage = true // reuse flag so onImpact fires for VFX
                  landerHit = true
                }
              }
              if (!landerHit) {
                const surveyImpact = this.surveyTargetHit(this._prevPos, pos, this._callbackPos)
                if (surveyImpact !== null) {
                  this.onScienceRocketHit?.(this._callbackPos)
                  hitRocket = true
                } else {
                  const rockHit = this.closestRockHit(this._prevPos, pos)
                  if (rockHit) {
                    this._callbackPos.copy(pos)
                    this.onScienceRockHit?.(rockHit.spawnIndex, this._callbackPos)
                    hitRock = true
                  }
                }
              }
            }
          }
        }
      } else {
        const combatHit = this.closestCombatBoltHit(this._prevPos, pos, p.boltKind)
        if (combatHit?.kind === 'enemy') {
          combatHit.enemy.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this._callbackPos.copy(pos)
          this.onEnemyHit?.(combatHit.enemy, this._callbackPos, p.boltKind, false)
          hitEnemy = true
        } else if (combatHit?.kind === 'hostage') {
          combatHit.hostage.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this._callbackPos.copy(pos)
          this.onHostageBolt?.(combatHit.hostage, this._callbackPos, 'damage')
          hitHostage = true
        }

        // Drill and weapon bolts both stop on rocks here. Drill bolts trigger
        // the mining callback; weapon bolts just register the impact (sparks +
        // sizzle) so the player gets visual+audio feedback that their shot
        // connected with a rock instead of passing through. Science bolts are
        // routed earlier (above) into the prospect path. Combat hits win first
        // so a rock right next to an enemy doesn't eat the bolt.
        if (!hitEnemy && !hitHostage && (p.boltKind === 'drill' || p.boltKind === 'weapon')) {
          const rockHit = this.closestRockHit(this._prevPos, pos)
          if (rockHit) {
            this._callbackPos.copy(pos)
            if (p.boltKind === 'drill') {
              this.onRockHit?.(rockHit.spawnIndex, this._callbackPos)
            }
            hitRock = true
          }
        }
      }

      // Terrain collision
      const floorY = this.terrainCollisionEnabled ? this.heightmap.heightAt(pos.x, pos.z) : null
      const hitTerrain = floorY !== null && pos.y <= floorY + TERRAIN_HIT_MARGIN

      // Remove on hit or timeout
      if (
        hitEnemy ||
        hitHostage ||
        hitRock ||
        hitRocket ||
        hitTerrain ||
        p.age >= BOLT_MAX_LIFETIME
      ) {
        if (hitTerrain || hitEnemy || hitHostage || hitRock || hitRocket) {
          if (!hitMapShuttleHull && !hitSatelliteRepair) {
            this._callbackPos.copy(pos)
          }
          let kind: ProjectileImpactKind
          if (hitEnemy) {
            kind = 'enemy'
          } else if (hitMapShuttleHull) {
            kind = 'shuttle_hull'
          } else if (hitSatelliteRepair) {
            kind = 'satellite_repair'
          } else if (hitRocket) {
            kind = 'science_rocket'
          } else if (hitHostage) {
            kind = 'hostage'
          } else if (hitRock) {
            if (p.boltKind === 'drill') kind = 'drill_rock'
            else if (p.boltKind === 'science') kind = 'science_rock'
            else kind = 'terrain'
          } else {
            kind = 'terrain'
          }
          this.onImpact?.(this._callbackPos, { boltKind: p.boltKind, kind })
        }
        this.removeProjectile(i)
      }
    }
  }

  /**
   * Whether the swept segment from `from` to `to` intersects the
   * registered survey target AABB. Returns the (clamped) impact point
   * via `out`, or `null` when no intersection.
   *
   * @param from - Segment start in world space.
   * @param to - Segment end in world space.
   * @param out - Reused Vector3 written with the impact point on hit.
   * @returns The same `out` reference on hit, or `null` when no intersection.
   */
  private surveyTargetHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
    out: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (!this.surveyTarget) return null
    this.surveyTarget.getWorldPosition(this._surveyCenter)
    const minX = this._surveyCenter.x - this._surveyHalfExtents.x
    const maxX = this._surveyCenter.x + this._surveyHalfExtents.x
    const minY = this._surveyCenter.y - this._surveyHalfExtents.y
    const maxY = this._surveyCenter.y + this._surveyHalfExtents.y
    const minZ = this._surveyCenter.z - this._surveyHalfExtents.z
    const maxZ = this._surveyCenter.z + this._surveyHalfExtents.z
    // Slab method — axis-aligned box / segment intersection.
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    let tEnter = 0
    let tExit = 1
    const slab = (origin: number, delta: number, lo: number, hi: number): boolean => {
      if (Math.abs(delta) < 1e-6) return origin >= lo && origin <= hi
      const t1 = (lo - origin) / delta
      const t2 = (hi - origin) / delta
      const tMin = Math.min(t1, t2)
      const tMax = Math.max(t1, t2)
      if (tMin > tEnter) tEnter = tMin
      if (tMax < tExit) tExit = tMax
      return tEnter <= tExit
    }
    if (!slab(from.x, dx, minX, maxX)) return null
    if (!slab(from.y, dy, minY, maxY)) return null
    if (!slab(from.z, dz, minZ, maxZ)) return null
    if (tEnter > 1 || tExit < 0) return null
    out.set(from.x + dx * tEnter, from.y + dy * tEnter, from.z + dz * tEnter)
    return out
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
   * Closest hostage along the segment for a science bolt (heal effect).
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
   * Closest enemy along the segment for a science bolt status effect.
   *
   * @param from - Segment start (previous projectile position).
   * @param to - Segment end (current projectile position).
   */
  private closestEnemyHit(
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): { enemy: Enemy; t: number } | null {
    let best: { enemy: Enemy; t: number } | null = null
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
        best = { enemy, t }
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
    this.evaSatelliteServicingScience = null
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
