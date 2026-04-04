/**
 * Reusable pool-based particle emitter for thruster VFX.
 *
 * Each emitter manages a fixed-size pool of particles with configurable
 * color, size, lifetime, and spread. Vehicle controllers call {@link emit}
 * to spawn particles at world-space positions with directional push.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Hide dead particles far off-screen instead of branching in the shader. */
const FAR_AWAY = 99999

/** Configuration for a single particle emitter instance. */
export interface ParticleEmitterConfig {
  /** Maximum particles alive at once */
  poolSize: number
  /** Particle color */
  color: THREE.Color
  /** Screen-space pixel size (sizeAttenuation = false) */
  size: number
  /** Seconds before a particle dies */
  lifetime: number
  /** Random velocity jitter radius (units/s per axis) */
  spread: number
  /** Material opacity (0–1) */
  opacity?: number
}

/** Internal particle state for the pool. */
interface Particle {
  alive: boolean
  age: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

/**
 * Pool-based particle emitter rendered as {@link THREE.Points}.
 * Particles are spawned via {@link emit} and automatically aged out.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class ParticleEmitter implements Tickable {
  /** Add this to the scene to render particles. */
  readonly points: THREE.Points

  private readonly pool: Particle[]
  private readonly lifetime: number
  private readonly spread: number

  constructor(config: ParticleEmitterConfig) {
    this.lifetime = config.lifetime
    this.spread = config.spread

    this.pool = Array.from({ length: config.poolSize }, () => ({
      alive: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))

    const positions = new Float32Array(config.poolSize * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color: config.color,
      size: config.size,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: config.opacity ?? 0.9,
    })

    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
  }

  /**
   * Spawn a single particle at a world-space position with a push velocity.
   *
   * @param worldPosition - Where the particle appears (world coords)
   * @param pushVelocity - Directional velocity added on top of random spread
   */
  emit(worldPosition: THREE.Vector3, pushVelocity: THREE.Vector3): void {
    const particle = this.pool.find((p) => !p.alive)
    if (!particle) return

    particle.alive = true
    particle.age = 0
    particle.position.copy(worldPosition)

    particle.velocity.set(
      (Math.random() - 0.5) * this.spread,
      (Math.random() - 0.5) * this.spread,
      (Math.random() - 0.5) * this.spread,
    )
    particle.velocity.add(pushVelocity)
  }

  tick(dt: number): void {
    const posAttr = this.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        continue
      }

      p.age += dt
      if (p.age >= this.lifetime) {
        p.alive = false
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        continue
      }

      p.position.addScaledVector(p.velocity, dt)
      positions[i3] = p.position.x
      positions[i3 + 1] = p.position.y
      positions[i3 + 2] = p.position.z
    }

    posAttr.needsUpdate = true
  }

  dispose(): void {
    this.points.geometry.dispose()
    ;(this.points.material as THREE.PointsMaterial).dispose()
  }
}
