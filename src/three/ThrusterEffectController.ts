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
    ;(this.thrustPoints.material as THREE.ShaderMaterial).dispose()
    this.brakePoints.geometry.dispose()
    ;(this.brakePoints.material as THREE.ShaderMaterial).dispose()
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
    const sizes = new Float32Array(PARTICLE_COUNT)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: color },
      },
      vertexShader: `
        attribute float size;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          // Soft circle falloff
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.2, 0.5, dist);
          gl_FragColor = vec4(color, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
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
    const sizeAttr = points.geometry.getAttribute('size') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const sizes = sizeAttr.array as Float32Array

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i]!
      const i3 = i * 3

      if (!p.alive) {
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        sizes[i] = 0
        continue
      }

      p.age += dt
      if (p.age >= PARTICLE_LIFETIME) {
        p.alive = false
        positions[i3] = FAR_AWAY
        positions[i3 + 1] = FAR_AWAY
        positions[i3 + 2] = FAR_AWAY
        sizes[i] = 0
        continue
      }

      // Fade out: full size at birth, zero at death
      const life = 1 - p.age / PARTICLE_LIFETIME
      sizes[i] = PARTICLE_SIZE * life

      p.position.addScaledVector(p.velocity, dt)
      positions[i3] = p.position.x
      positions[i3 + 1] = p.position.y
      positions[i3 + 2] = p.position.z
    }

    posAttr.needsUpdate = true
    sizeAttr.needsUpdate = true
  }
}
