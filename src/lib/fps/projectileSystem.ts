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
  private damageMultiplier = 1
  private readonly _hostageCenter = new THREE.Vector3()
  private static readonly boltGeometry = (() => {
    const geometry = new THREE.CylinderGeometry(BOLT_WIDTH, BOLT_WIDTH, BOLT_LENGTH, 6, 1, false)
    geometry.rotateX(Math.PI / 2)
    return geometry
  })()

  /** Called when a projectile hits terrain. Position is the impact point. */
  onImpact: ((position: THREE.Vector3) => void) | null = null
  /** Called when a projectile hits an enemy. */
  onEnemyHit: ((enemy: Enemy, position: THREE.Vector3) => void) | null = null

  /**
   * Called when a player bolt hits a hostage — damage (weapon/drill) or heal (med).
   *
   * @param hostage - Hit hostage
   * @param position - Impact position in world space
   * @param effect - Whether the bolt hurt or healed
   */
  onHostageBolt: ((
    hostage: Hostage,
    position: THREE.Vector3,
    effect: 'damage' | 'heal',
  ) => void) | null = null

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
    const projectile = this.pool.pop() ?? this.createProjectile()
    const mesh = projectile.mesh
    const material = projectile.material

    mesh.position.copy(origin)
    mesh.lookAt(this._lookTarget.copy(origin).add(direction))
    material.uniforms['uColor']!.value.copy(color)
    material.uniforms['uTime']!.value = 0
    mesh.visible = true
    this.scene.add(mesh)

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

      if (p.boltKind === 'heal') {
        const healHit = this.closestHostageHealHit(this._prevPos, pos)
        if (healHit) {
          healHit.hostage.heal(HEAL_BOLT_AMOUNT)
          this.onHostageBolt?.(healHit.hostage, pos.clone(), 'heal')
          hitHostage = true
        }
      } else {
        const combatHit = this.closestCombatBoltHit(this._prevPos, pos, p.boltKind)
        if (combatHit?.kind === 'enemy') {
          combatHit.enemy.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this.onEnemyHit?.(combatHit.enemy, pos.clone())
          hitEnemy = true
        } else if (combatHit?.kind === 'hostage') {
          combatHit.hostage.takeDamage(BOLT_DAMAGE * this.damageMultiplier)
          this.onHostageBolt?.(combatHit.hostage, pos.clone(), 'damage')
          hitHostage = true
        }
      }

      // Terrain collision
      const floorY = this.heightmap.heightAt(pos.x, pos.z)
      const hitTerrain = pos.y <= floorY + TERRAIN_HIT_MARGIN

      // Remove on hit or timeout
      if (hitEnemy || hitHostage || hitTerrain || p.age >= BOLT_MAX_LIFETIME) {
        if (hitTerrain || hitEnemy || hitHostage) {
          this.onImpact?.(pos.clone())
        }
        this.removeProjectile(i)
      }
    }
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
    this.scene.remove(p.mesh)
    p.mesh.visible = false
    this.projectiles.splice(index, 1)
    this.pool.push(p)
  }

  dispose(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i)
    }
    for (const projectile of this.pool) {
      projectile.material.dispose()
    }
    this.pool.length = 0
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
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          float scale = 1.0 + uTime * 0.3;
          vec3 scaled = position * vec3(scale, scale, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(scaled, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float dist = abs(vUv.x - 0.5) * 2.0;
          float core = smoothstep(1.0, 0.1, dist);
          float whiteLine = smoothstep(0.3, 0.0, dist);
          vec3 col = mix(uColor * 1.5, vec3(1.0), whiteLine * 0.4);
          float taper = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
          float alpha = core * taper;
          alpha *= 0.9 + 0.1 * sin(uTime * 50.0 + vUv.y * 20.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
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
