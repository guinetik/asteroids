/**
 * Manages projectile lifecycle: spawn, movement, terrain collision, cleanup.
 *
 * Pure game logic — owns projectile state and Three.js meshes. Checks
 * terrain collision via heightmap each frame. Calls onImpact when a
 * projectile hits terrain so the ViewController can spawn particles.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Heightmap } from '@/lib/terrain/heightmap'
import type { Enemy } from './enemy'

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
/** Damage per bolt hit. */
const BOLT_DAMAGE = 25

/** Internal projectile state. */
interface Projectile {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  age: number
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
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly enemies: Enemy[] = []

  /** Called when a projectile hits terrain. Position is the impact point. */
  onImpact: ((position: THREE.Vector3) => void) | null = null
  /** Called when a projectile hits an enemy. */
  onEnemyHit: ((enemy: Enemy, position: THREE.Vector3) => void) | null = null

  constructor(scene: THREE.Scene, heightmap: Heightmap) {
    this.scene = scene
    this.heightmap = heightmap
  }

  /** Register an enemy for projectile collision checks. */
  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy)
  }

  /** Remove an enemy from collision checks. */
  removeEnemy(enemy: Enemy): void {
    const idx = this.enemies.indexOf(enemy)
    if (idx >= 0) this.enemies.splice(idx, 1)
  }

  /**
   * Spawn a bolt projectile.
   *
   * @param origin - World-space spawn position
   * @param direction - Normalized travel direction
   * @param color - Bolt color
   */
  spawn(origin: THREE.Vector3, direction: THREE.Vector3, color: THREE.Color): void {
    const geometry = new THREE.CylinderGeometry(BOLT_WIDTH, BOLT_WIDTH, BOLT_LENGTH, 6, 1, false)
    geometry.rotateX(Math.PI / 2)

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: color.clone() },
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

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(origin)
    mesh.lookAt(origin.clone().add(direction))
    mesh.frustumCulled = false
    this.scene.add(mesh)

    this.projectiles.push({
      mesh,
      velocity: direction.clone().multiplyScalar(BOLT_SPEED),
      age: 0,
    })
  }

  private readonly _prevPos = new THREE.Vector3()

  tick(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.age += dt

      // Save previous position for swept collision
      this._prevPos.copy(p.mesh.position)
      p.mesh.position.addScaledVector(p.velocity, dt)

      // Feed time uniform
      const mat = p.mesh.material as THREE.ShaderMaterial
      if (mat.uniforms['uTime']) {
        mat.uniforms['uTime'].value = p.age
      }

      const pos = p.mesh.position

      // Enemy collision — ray segment check (prevents tunneling)
      let hitEnemy = false
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue
        if (this.rayHitsSphere(this._prevPos, pos, enemy.position, enemy.hitRadius)) {
          enemy.takeDamage(BOLT_DAMAGE)
          this.onEnemyHit?.(enemy, pos.clone())
          hitEnemy = true
          break
        }
      }

      // Terrain collision
      const floorY = this.heightmap.heightAt(pos.x, pos.z)
      const hitTerrain = pos.y <= floorY + TERRAIN_HIT_MARGIN

      // Remove on hit or timeout
      if (hitEnemy || hitTerrain || p.age >= BOLT_MAX_LIFETIME) {
        if (hitTerrain || hitEnemy) {
          this.onImpact?.(pos.clone())
        }
        this.removeProjectile(i)
      }
    }
  }

  /**
   * Check if a line segment (from → to) passes within radius of a sphere center.
   * Closest-point-on-segment approach — handles fast projectiles that skip past targets.
   */
  private rayHitsSphere(from: THREE.Vector3, to: THREE.Vector3, center: THREE.Vector3, radius: number): boolean {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const fx = from.x - center.x
    const fy = from.y - center.y
    const fz = from.z - center.z
    const segLenSq = dx * dx + dy * dy + dz * dz
    if (segLenSq === 0) {
      return fx * fx + fy * fy + fz * fz <= radius * radius
    }
    // Project center onto segment, clamp to [0, 1]
    let t = -(fx * dx + fy * dy + fz * dz) / segLenSq
    t = Math.max(0, Math.min(1, t))
    const closestX = from.x + t * dx - center.x
    const closestY = from.y + t * dy - center.y
    const closestZ = from.z + t * dz - center.z
    return closestX * closestX + closestY * closestY + closestZ * closestZ <= radius * radius
  }

  private removeProjectile(index: number): void {
    const p = this.projectiles[index]!
    this.scene.remove(p.mesh)
    p.mesh.geometry.dispose()
    ;(p.mesh.material as THREE.ShaderMaterial).dispose()
    this.projectiles.splice(index, 1)
  }

  dispose(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      this.removeProjectile(i)
    }
  }
}
