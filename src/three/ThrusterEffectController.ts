import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleController } from './ShuttleController'

const PARTICLE_COUNT = 300
const THRUST_SPAWN_RATE = 100 // particles per second
const BRAKE_SPAWN_RATE = 80
const PARTICLE_LIFETIME = 0.6 // seconds
const THRUST_SPREAD = 3
const BRAKE_SPREAD = 5
const PARTICLE_SIZE = 4
const THRUST_COLOR = new THREE.Color(0xff8800)
const BRAKE_COLOR = new THREE.Color(0x4488ff)
const THRUST_OFFSET = new THREE.Vector3(-7, 0, 0) // engine nozzles: rear of shuttle (-X)
const BRAKE_OFFSET = new THREE.Vector3(7, 0, 0) // dampener: in front of shuttle nose (+X)
const PUSH_FORCE = 20
const FAR_AWAY = 99999

/** Internal particle state for the pool-based particle system. */
interface Particle {
  alive: boolean
  age: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

/**
 * Particle-based visual feedback for shuttle thrust and braking.
 * Orange particles trail from engines during thrust,
 * blue particles radiate during inertia dampening.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class ThrusterEffectController implements Tickable {
  readonly thrustPoints: THREE.Points
  readonly brakePoints: THREE.Points

  private thrustParticles: Particle[]
  private brakeParticles: Particle[]
  private thrustSpawnAccumulator = 0
  private brakeSpawnAccumulator = 0
  private readonly shuttle: ShuttleController

  constructor(shuttle: ShuttleController) {
    this.shuttle = shuttle

    this.thrustParticles = this.createParticlePool()
    this.brakeParticles = this.createParticlePool()

    this.thrustPoints = this.createPoints(THRUST_COLOR)
    this.brakePoints = this.createPoints(BRAKE_COLOR)
  }

  tick(dt: number): void {
    const isThrusting = this.shuttle.isThrusting
    const isBraking = this.shuttle.isBraking
    if (isThrusting || isBraking) {
      console.log('[Thruster] thrust:', isThrusting, 'brake:', isBraking, 'pos:', this.shuttle.position.toArray())
    }

    if (isThrusting) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      while (this.thrustSpawnAccumulator >= 1) {
        this.spawnParticle(this.thrustParticles, THRUST_OFFSET, THRUST_SPREAD)
        this.thrustSpawnAccumulator -= 1
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (isBraking) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      while (this.brakeSpawnAccumulator >= 1) {
        this.spawnParticle(this.brakeParticles, BRAKE_OFFSET, BRAKE_SPREAD)
        this.brakeSpawnAccumulator -= 1
      }
    } else {
      this.brakeSpawnAccumulator = 0
    }

    this.updateParticles(this.thrustParticles, this.thrustPoints, dt)
    this.updateParticles(this.brakeParticles, this.brakePoints, dt)
  }

  dispose(): void {
    this.thrustPoints.geometry.dispose()
    ;(this.thrustPoints.material as THREE.PointsMaterial).dispose()
    this.brakePoints.geometry.dispose()
    ;(this.brakePoints.material as THREE.PointsMaterial).dispose()
  }

  private createParticlePool(): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
      alive: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  }

  private createPoints(color: THREE.Color): THREE.Points {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    })

    return new THREE.Points(geometry, material)
  }

  private spawnParticle(pool: Particle[], offset: THREE.Vector3, spread: number): void {
    const particle = pool.find((p) => !p.alive)
    if (!particle) return

    particle.alive = true
    particle.age = 0

    const worldOffset = offset.clone().applyQuaternion(this.shuttle.group.quaternion)
    particle.position.copy(this.shuttle.position).add(worldOffset)

    particle.velocity.set(
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
      (Math.random() - 0.5) * spread,
    )

    // Add shuttle-relative push direction
    const pushDir = offset.clone().normalize().multiplyScalar(-PUSH_FORCE)
    pushDir.applyQuaternion(this.shuttle.group.quaternion)
    particle.velocity.add(pushDir)
  }

  private updateParticles(pool: Particle[], points: THREE.Points, dt: number): void {
    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        // Park dead particles far off-screen
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        continue
      }

      p.age += dt
      if (p.age >= PARTICLE_LIFETIME) {
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
}
