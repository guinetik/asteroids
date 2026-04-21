/**
 * Tractor-beam particle burst. Spawned at an asteroid's last position on
 * depletion; particles steer toward the shuttle nose target and die by
 * arrival or lifetime.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter, type Particle } from './ParticleEmitter'
import {
  TURRET_TRACTOR_ARRIVAL_RADIUS,
  TURRET_TRACTOR_BURST_COUNT,
  TURRET_TRACTOR_MAX_LIFETIME,
  TURRET_TRACTOR_PARTICLE_SPEED,
  TURRET_TRACTOR_STEER_ACCEL,
} from '@/lib/map/turret/turretConstants'

/** Warm-white tint fallback when no dominant mineral is tracked per burst. */
const TRACTOR_DEFAULT_COLOR = new THREE.Color(1.0, 0.85, 0.5)

/**
 * Particle burst emitter that steers live particles toward a target
 * Object3D's world position.
 */
export class TurretTractorEmitter {
  /** Attach this to the scene to render particles. */
  readonly points: THREE.Points
  private readonly emitter: ParticleEmitter
  private targetWorld = new THREE.Vector3()
  private target: THREE.Object3D | null = null
  private readonly scratchDir = new THREE.Vector3()
  private readonly scratchVel = new THREE.Vector3()

  constructor() {
    this.emitter = new ParticleEmitter({
      poolSize: TURRET_TRACTOR_BURST_COUNT * 4, // enough for concurrent bursts
      color: TRACTOR_DEFAULT_COLOR.clone(),
      size: 0.8,
      lifetime: TURRET_TRACTOR_MAX_LIFETIME,
      spread: TURRET_TRACTOR_PARTICLE_SPEED * 0.5,
      opacity: 0.9,
      sizeAttenuation: true,
      soft: true,
      sizeGrowth: 0.4,
      steeringUpdate: (particle, dt) => this.steerParticle(particle, dt),
    })
    this.points = this.emitter.points
  }

  /** Set the target Object3D the particles steer toward (typically the shuttle nose). */
  setTarget(target: THREE.Object3D | null): void {
    this.target = target
  }

  /** Emit a burst at `worldPosition`; particles will start flying toward the current target. */
  spawnBurst(worldPosition: THREE.Vector3): void {
    for (let i = 0; i < TURRET_TRACTOR_BURST_COUNT; i++) {
      this.emitter.emit(worldPosition, this.scratchVel.set(0, 0, 0))
    }
  }

  /** Advance the internal emitter (steering callback runs here). */
  tick(dt: number): void {
    if (this.target) {
      this.target.getWorldPosition(this.targetWorld)
    }
    this.emitter.tick(dt)
  }

  /** Dispose underlying emitter resources. */
  dispose(): void {
    this.emitter.dispose()
  }

  private steerParticle(particle: Particle, dt: number): void {
    if (!this.target) return
    this.scratchDir.subVectors(this.targetWorld, particle.position)
    const dist = this.scratchDir.length()
    if (dist <= TURRET_TRACTOR_ARRIVAL_RADIUS) {
      // Force-die: teleport to FAR_AWAY by setting age past lifetime on next tick.
      particle.age = Number.POSITIVE_INFINITY
      return
    }
    this.scratchDir.multiplyScalar(1 / dist) // normalize
    particle.velocity.addScaledVector(this.scratchDir, TURRET_TRACTOR_STEER_ACCEL * dt)
    // Speed clamp so particles don't run away faster than the beam duration allows.
    const speed = particle.velocity.length()
    const maxSpeed = TURRET_TRACTOR_PARTICLE_SPEED * 6
    if (speed > maxSpeed) {
      particle.velocity.multiplyScalar(maxSpeed / speed)
    }
  }
}
