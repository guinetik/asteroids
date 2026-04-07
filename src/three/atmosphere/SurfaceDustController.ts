/**
 * Ambient surface dust and footstep particle effects.
 *
 * Two subsystems:
 * 1. Ambient drift — slow-moving dust motes following the camera
 * 2. Footstep puffs — bursts at player feet while walking in EVA
 *
 * Density and color driven by asteroid data (dustCoverage, baseColor).
 * Drift direction follows sunDirection (solar radiation pressure).
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-atmosphere-effects-design.md
 */
import * as THREE from 'three'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import type { AtmosphereContext } from './AtmosphereContext'

// ── Ambient drift ──
/** Base particle count at dustCoverage = 1.0. Actual count is this * dustCoverage. */
const DRIFT_BASE_COUNT = 120
/** Minimum particles even on low-dust asteroids. */
const DRIFT_MIN_COUNT = 30
const DRIFT_PARTICLE_SIZE = 1.5
const DRIFT_LIFETIME = 8
const DRIFT_OPACITY = 0.2
const DRIFT_SPREAD = 0.5
/** Half-size of the volume box around the camera. */
const DRIFT_VOLUME_HALF = 80
/** Slow drift speed from solar radiation. */
const DRIFT_SPEED = 1.5
/** Height range above ground for ambient particles. */
const DRIFT_MAX_HEIGHT = 25

// ── Footstep puffs ──
const PUFF_POOL_SIZE = 40
const PUFF_PARTICLE_SIZE = 2
const PUFF_LIFETIME = 1.2
const PUFF_SPREAD = 1
const PUFF_OPACITY = 0.3
/** Particles per footstep burst. */
const PUFF_BURST_COUNT = 10
/** Minimum speed (m/s) to trigger footstep puffs. */
const PUFF_SPEED_THRESHOLD = 0.5
/** Distance between footstep triggers (meters). */
const PUFF_STEP_DISTANCE = 2.5
/** Upward puff speed base. Scales inversely with surface gravity. */
const PUFF_UP_SPEED = 2.0
/** Sprint speed threshold — puffs get bigger above this. */
const PUFF_SPRINT_THRESHOLD = 4.0

// ── Wash interaction ──
/** Radius around lander where ambient particles get pushed. */
const WASH_PUSH_RADIUS = 30
/** Push force applied to ambient particles near the wash. */
const WASH_PUSH_STRENGTH = 20

/**
 * Manages ambient surface dust drift and EVA footstep puffs.
 */
export class SurfaceDustController {
  /** Ambient drift emitter — recycling particles around the camera. */
  readonly driftEmitter: ParticleEmitter
  /** Footstep puff emitter — burst particles at player feet. */
  readonly puffEmitter: ParticleEmitter

  private driftDirection = new THREE.Vector3()
  private distanceSinceLastPuff = 0
  private lastPlayerPos = new THREE.Vector3()
  private initialized = false
  /** Cached pool size for drift rate calculation — poolSize is private on ParticleEmitter. */
  private readonly driftPoolSize: number

  constructor(ctx: AtmosphereContext) {
    const dustColor = new THREE.Color(ctx.baseColor[0], ctx.baseColor[1], ctx.baseColor[2]).multiplyScalar(1.3)

    const driftCount = Math.max(DRIFT_MIN_COUNT, Math.round(DRIFT_BASE_COUNT * ctx.dustCoverage))
    this.driftPoolSize = driftCount
    this.driftEmitter = new ParticleEmitter({
      poolSize: driftCount,
      color: dustColor,
      size: DRIFT_PARTICLE_SIZE,
      lifetime: DRIFT_LIFETIME,
      spread: DRIFT_SPREAD,
      opacity: DRIFT_OPACITY,
    })

    this.puffEmitter = new ParticleEmitter({
      poolSize: PUFF_POOL_SIZE,
      color: dustColor,
      size: PUFF_PARTICLE_SIZE,
      lifetime: PUFF_LIFETIME,
      spread: PUFF_SPREAD,
      opacity: PUFF_OPACITY,
    })

    // Drift direction from sun (solar radiation pressure pushes away from sun)
    this.driftDirection.copy(ctx.sunDirection).negate().setY(0).normalize().multiplyScalar(DRIFT_SPEED)
  }

  /** Add emitters to scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.driftEmitter.points)
    scene.add(this.puffEmitter.points)
  }

  /** Per-frame update. */
  update(ctx: AtmosphereContext, dt: number): void {
    this.driftEmitter.tick(dt)
    this.puffEmitter.tick(dt)

    // Determine active camera position (follow whichever mode is active)
    const camPos = ctx.activeMode === 'eva' ? ctx.playerPosition : ctx.landerPosition

    // ── Ambient drift: continuously spawn to maintain density ──
    this.spawnDriftParticles(camPos, dt)

    // ── Thruster wash interaction: push ambient particles away from lander ──
    if (ctx.landerThrust > 0 && ctx.landerAltitude < WASH_PUSH_RADIUS) {
      this.pushParticlesFromWash(ctx)
    }

    // ── Footstep puffs ──
    if (ctx.activeMode === 'eva' && ctx.playerGrounded && ctx.playerSpeed > PUFF_SPEED_THRESHOLD) {
      if (!this.initialized) {
        this.lastPlayerPos.copy(ctx.playerPosition)
        this.initialized = true
      }
      const moved = ctx.playerPosition.distanceTo(this.lastPlayerPos)
      this.distanceSinceLastPuff += moved
      this.lastPlayerPos.copy(ctx.playerPosition)

      if (this.distanceSinceLastPuff >= PUFF_STEP_DISTANCE) {
        this.distanceSinceLastPuff = 0
        this.spawnFootstepPuff(ctx)
      }
    } else {
      this.distanceSinceLastPuff = 0
      if (ctx.activeMode === 'eva') {
        this.lastPlayerPos.copy(ctx.playerPosition)
        this.initialized = true
      }
    }
  }

  private spawnDriftParticles(center: THREE.Vector3, dt: number): void {
    // Spawn a few particles per frame to maintain the cloud
    const spawnCount = Math.ceil((this.driftPoolSize / DRIFT_LIFETIME) * dt)
    for (let i = 0; i < spawnCount; i++) {
      const pos = new THREE.Vector3(
        center.x + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
        center.y - DRIFT_MAX_HEIGHT * 0.5 + Math.random() * DRIFT_MAX_HEIGHT,
        center.z + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
      )
      this.driftEmitter.emit(pos, this.driftDirection.clone())
    }
  }

  private spawnFootstepPuff(ctx: AtmosphereContext): void {
    const isSprinting = ctx.playerSpeed > PUFF_SPRINT_THRESHOLD
    const count = isSprinting ? PUFF_BURST_COUNT : Math.ceil(PUFF_BURST_COUNT * 0.6)
    const upSpeed = PUFF_UP_SPEED * (isSprinting ? 1.5 : 1.0)

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const outSpeed = 0.5 + Math.random() * 1.5
      const pos = new THREE.Vector3(
        ctx.playerPosition.x + (Math.random() - 0.5) * 0.5,
        ctx.playerPosition.y + 0.1,
        ctx.playerPosition.z + (Math.random() - 0.5) * 0.5,
      )
      const vel = new THREE.Vector3(
        Math.cos(angle) * outSpeed,
        upSpeed * (0.5 + Math.random() * 0.5),
        Math.sin(angle) * outSpeed,
      )
      this.puffEmitter.emit(pos, vel)
    }
  }

  /**
   * Push ambient drift particles away from the lander thruster wash.
   * This is a velocity bias, not a physics simulation.
   */
  private pushParticlesFromWash(ctx: AtmosphereContext): void {
    const posAttr = this.driftEmitter.points.geometry.getAttribute('position') as THREE.BufferAttribute
    const count = posAttr.count
    for (let i = 0; i < count; i++) {
      const px = posAttr.getX(i)
      const pz = posAttr.getZ(i)
      // Skip dead particles (at 99999)
      if (px > 90000) continue
      const dx = px - ctx.landerPosition.x
      const dz = pz - ctx.landerPosition.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < WASH_PUSH_RADIUS && dist > 0.1) {
        const factor = (1 - dist / WASH_PUSH_RADIUS) * WASH_PUSH_STRENGTH * ctx.landerThrust * 0.016
        posAttr.setX(i, px + (dx / dist) * factor)
        posAttr.setZ(i, pz + (dz / dist) * factor)
      }
    }
    posAttr.needsUpdate = true
  }

  /** Release GPU and CPU resources. */
  dispose(): void {
    this.driftEmitter.dispose()
    this.puffEmitter.dispose()
  }
}
