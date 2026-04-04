import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleController } from './ShuttleController'

const PARTICLE_COUNT = 300
const THRUST_SPAWN_RATE = 100 // particles per second
const BRAKE_SPAWN_RATE = 80
const PARTICLE_LIFETIME = 0.3 // seconds
const THRUST_SPREAD = 3
const BRAKE_SPREAD = 5
const PARTICLE_SIZE = 4
const THRUST_COLOR = new THREE.Color(0xff8800)
const BRAKE_COLOR = new THREE.Color(0x4488ff)
/**
 * 3 nozzle emit points matching ShuttleController ENG_POSITIONS * MODEL_SCALE.
 * After the -90deg X rotation: raw Y becomes -Z, raw Z becomes Y in world.
 */
const NOZZLE_OFFSETS = [
  new THREE.Vector3(-5.1, 0.72, 0),    // top center
  new THREE.Vector3(-5.1, -0.46, -0.52), // bottom left
  new THREE.Vector3(-5.1, -0.46, 0.52),  // bottom right
]
const PUSH_FORCE = 20
const FAR_AWAY = 99999

// RCS wingtip attitude thrusters
const RCS_PARTICLE_COUNT = 50
const RCS_SPAWN_RATE = 40
const RCS_LIFETIME = 0.2 // seconds — short puffs
const RCS_SPREAD = 1.5
const RCS_SIZE = 2
const RCS_COLOR = new THREE.Color(0xccddff) // white-ish, like oxygen venting
const RCS_PUSH_FORCE = 8
const LEFT_WINGTIP = new THREE.Vector3(-4, -1.2, -4.5) // rear-left wingtip
const RIGHT_WINGTIP = new THREE.Vector3(-4, -1.2, 4.5)  // rear-right wingtip

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
  readonly rcsPoints: THREE.Points

  private thrustParticles: Particle[]
  private brakeParticles: Particle[]
  private rcsParticles: Particle[]
  private thrustSpawnAccumulator = 0
  private brakeSpawnAccumulator = 0
  private rcsSpawnAccumulator = 0
  private readonly shuttle: ShuttleController

  constructor(shuttle: ShuttleController) {
    this.shuttle = shuttle

    this.thrustParticles = this.createParticlePool(PARTICLE_COUNT)
    this.brakeParticles = this.createParticlePool(PARTICLE_COUNT)
    this.rcsParticles = this.createParticlePool(RCS_PARTICLE_COUNT)

    this.thrustPoints = this.createPoints(THRUST_COLOR, PARTICLE_COUNT, PARTICLE_SIZE)
    this.brakePoints = this.createPoints(BRAKE_COLOR, PARTICLE_COUNT, PARTICLE_SIZE)
    this.rcsPoints = this.createPoints(RCS_COLOR, RCS_PARTICLE_COUNT, RCS_SIZE)
  }

  tick(dt: number): void {
    const isThrusting = this.shuttle.isThrusting
    const isBraking = this.shuttle.isBraking

    if (isThrusting) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      while (this.thrustSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        this.spawnParticle(this.thrustParticles, nozzle, THRUST_SPREAD)
        this.thrustSpawnAccumulator -= 1
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (isBraking) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      while (this.brakeSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        this.spawnParticle(this.brakeParticles, nozzle, BRAKE_SPREAD)
        this.brakeSpawnAccumulator -= 1
      }
    } else {
      this.brakeSpawnAccumulator = 0
    }

    // RCS wingtip puffs when yawing
    const isYawingLeft = this.shuttle.isYawingLeft
    const isYawingRight = this.shuttle.isYawingRight
    if (isYawingLeft || isYawingRight) {
      this.rcsSpawnAccumulator += RCS_SPAWN_RATE * dt
      while (this.rcsSpawnAccumulator >= 1) {
        // Yaw left = fire from right wingtip outward (+Z)
        // Yaw right = fire from left wingtip outward (-Z)
        const wingtip = isYawingLeft ? RIGHT_WINGTIP : LEFT_WINGTIP
        const pushDir = isYawingLeft
          ? new THREE.Vector3(0, 0, RCS_PUSH_FORCE)
          : new THREE.Vector3(0, 0, -RCS_PUSH_FORCE)
        this.spawnRcsParticle(wingtip, pushDir)
        this.rcsSpawnAccumulator -= 1
      }
    } else {
      this.rcsSpawnAccumulator = 0
    }

    this.updateParticles(this.thrustParticles, this.thrustPoints, dt, PARTICLE_LIFETIME)
    this.updateParticles(this.brakeParticles, this.brakePoints, dt, PARTICLE_LIFETIME)
    this.updateParticles(this.rcsParticles, this.rcsPoints, dt, RCS_LIFETIME)
  }

  dispose(): void {
    this.thrustPoints.geometry.dispose()
    ;(this.thrustPoints.material as THREE.PointsMaterial).dispose()
    this.brakePoints.geometry.dispose()
    ;(this.brakePoints.material as THREE.PointsMaterial).dispose()
    this.rcsPoints.geometry.dispose()
    ;(this.rcsPoints.material as THREE.PointsMaterial).dispose()
  }

  private createParticlePool(count: number): Particle[] {
    return Array.from({ length: count }, () => ({
      alive: false,
      age: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    }))
  }

  private createPoints(color: THREE.Color, count: number, size: number): THREE.Points {
    const positions = new Float32Array(count * 3)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    })

    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return points
  }

  private spawnRcsParticle(wingtip: THREE.Vector3, pushDir: THREE.Vector3): void {
    const particle = this.rcsParticles.find((p) => !p.alive)
    if (!particle) return

    particle.alive = true
    particle.age = 0

    const worldOffset = wingtip.clone().applyQuaternion(this.shuttle.group.quaternion)
    particle.position.copy(this.shuttle.position).add(worldOffset)

    particle.velocity.set(
      (Math.random() - 0.5) * RCS_SPREAD,
      (Math.random() - 0.5) * RCS_SPREAD,
      (Math.random() - 0.5) * RCS_SPREAD,
    )

    const worldPush = pushDir.clone().applyQuaternion(this.shuttle.group.quaternion)
    particle.velocity.add(worldPush)
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

    // Always push particles out the back of the shuttle (-X in local space)
    const pushDir = new THREE.Vector3(-PUSH_FORCE, 0, 0)
    pushDir.applyQuaternion(this.shuttle.group.quaternion)
    particle.velocity.add(pushDir)
  }

  private updateParticles(pool: Particle[], points: THREE.Points, dt: number, lifetime: number): void {
    const posAttr = points.geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        continue
      }

      p.age += dt
      if (p.age >= lifetime) {
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
