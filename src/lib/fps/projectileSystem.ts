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

  /** Called when a projectile hits terrain. Position is the impact point. */
  onImpact: ((position: THREE.Vector3) => void) | null = null

  constructor(scene: THREE.Scene, heightmap: Heightmap) {
    this.scene = scene
    this.heightmap = heightmap
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

  tick(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.age += dt
      p.mesh.position.addScaledVector(p.velocity, dt)

      // Feed time uniform
      const mat = p.mesh.material as THREE.ShaderMaterial
      if (mat.uniforms['uTime']) {
        mat.uniforms['uTime'].value = p.age
      }

      // Terrain collision
      const pos = p.mesh.position
      const floorY = this.heightmap.heightAt(pos.x, pos.z)
      const hitTerrain = pos.y <= floorY + TERRAIN_HIT_MARGIN

      // Remove on hit or timeout
      if (hitTerrain || p.age >= BOLT_MAX_LIFETIME) {
        if (hitTerrain) {
          this.onImpact?.(pos.clone())
        }
        this.removeProjectile(i)
      }
    }
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
