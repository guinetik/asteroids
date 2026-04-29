/**
 * Ambient surface dust and footstep particle effects.
 *
 * Three subsystems:
 * 1. Ambient drift — ground-anchored slab of grit around the active anchor.
 * 2. Footstep puffs — bursts at player feet while walking in EVA.
 * 3. Eye-level motes — discreet airborne motes around the FPS camera (EVA only).
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
const DRIFT_BASE_COUNT = 1000
/** Minimum particles even on low-dust asteroids. */
const DRIFT_MIN_COUNT = 70
/**
 * Default drift particle size in world units (sizeAttenuation = true). The
 * actual size is mode-dependent — see DRIFT_SIZE_LANDER / DRIFT_SIZE_EVA below
 * — because the lander third-person camera sits ~75u from the slab while the
 * FPS camera is ~5u away. One size cannot work at both distances.
 */
const DRIFT_PARTICLE_SIZE = 0.2
/** Drift size when in lander or cinematic mode (third-person camera, far). */
const DRIFT_SIZE_LANDER = 0.6
/** Drift size when in EVA mode (first-person camera, close). */
const DRIFT_SIZE_EVA = 0.15
const DRIFT_LIFETIME = 6
const DRIFT_OPACITY = 0.5
const DRIFT_SPREAD = 0.1
/** Half-size of the volume box around the camera (world units). */
const DRIFT_VOLUME_HALF = 38
/**
 * Vertical offset (fraction of DRIFT_MAX_HEIGHT) at which the lander-mode
 * slab starts below the lander. EVA always uses 0 (no underground spawning).
 * 0.5 = half above, half below the lander.
 */
const DRIFT_LANDER_BELOW_FRAC = 0.5
/**
 * Bulk drift speed (units/s) along the sun-anti direction. Set to 0 to keep
 * the field static — particles still wander via DRIFT_SPREAD jitter, but no
 * collective "wind" direction, matching the airless asteroid setting.
 */
const DRIFT_SPEED = 0
/** Height range above ground for ambient particles (world units). */
const DRIFT_MAX_HEIGHT = 14
/**
 * Forward bias on the spawn box, expressed as a fraction of DRIFT_VOLUME_HALF.
 * Pushes new particles into the path of the moving anchor so the field doesn't
 * feel like it's only behind you. 0 = isotropic, 1 = box fully in front.
 */
const DRIFT_FORWARD_BIAS = 0.55
/**
 * Blend between the per-asteroid baseColor (0) and a neutral gray (1).
 * Keeps a hint of asteroid character without the dust looking "painted".
 */
const DUST_NEUTRAL_BLEND = 0.65
/** Neutral gray-tan dust tint blended in via DUST_NEUTRAL_BLEND. */
const DUST_NEUTRAL_COLOR = new THREE.Color(0.78, 0.76, 0.72)

// ── Footstep puffs ──
const PUFF_POOL_SIZE = 60
/** Particle size in world units (sizeAttenuation = true). */
const PUFF_PARTICLE_SIZE = 0.18
const PUFF_LIFETIME = 1.2
const PUFF_SPREAD = 1
const PUFF_OPACITY = 0.6
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
/**
 * Push force applied to ambient particles near the wash. Kept low so the
 * thruster wash deflects nearby grit instead of stripping the whole field
 * on every frame the main engine fires.
 */
const WASH_PUSH_STRENGTH = 6

// ── Eye-level motes (EVA only) ──
/**
 * Motion-driven motes streaming past the FPS camera. Spawn rate scales with
 * player movement — almost none when standing still, full rate when running,
 * with a bonus while airborne to sell jetpack/floating air-mobility.
 */
const EYE_MOTE_COUNT = 150
/** Particle size in world units (sizeAttenuation = true). */
const EYE_MOTE_SIZE = 0.06
const EYE_MOTE_LIFETIME = 5
const EYE_MOTE_OPACITY = 0.5
/** Random velocity jitter so motes wander. */
const EYE_MOTE_SPREAD = 0.15
/** Sphere radius around the eye where motes are spawned. */
const EYE_MOTE_BUBBLE = 6
/** Vertical offset above playerPosition to roughly match eye height. */
const EYE_MOTE_HEIGHT = 1.5
/** Forward-bias fraction of EYE_MOTE_BUBBLE applied while the player moves. */
const EYE_MOTE_FORWARD_BIAS = 0.6
/** Player ground speed (m/s) at which the spawn rate reaches its base value. */
const EYE_MOTE_SPEED_FULL = 3.0
/** Multiplier on spawn rate when airborne (jetpack / jump). */
const EYE_MOTE_AIRBORNE_GAIN = 1.6
/** Floor on motion intensity so a few motes still appear when standing still. */
const EYE_MOTE_IDLE_FLOOR = 0.08

/**
 * Manages ambient surface dust drift and EVA footstep puffs.
 */
export class SurfaceDustController {
  /** Ambient drift emitter — recycling particles around the camera. */
  readonly driftEmitter: ParticleEmitter
  /** Footstep puff emitter — burst particles at player feet. */
  readonly puffEmitter: ParticleEmitter
  /** Eye-level mote emitter — discreet airborne motes around the EVA camera. */
  readonly eyeMoteEmitter: ParticleEmitter

  private driftDirection = new THREE.Vector3()
  private distanceSinceLastPuff = 0
  private lastPlayerPos = new THREE.Vector3()
  private initialized = false
  /** Last anchor (camera-target) position, used to derive a per-frame heading for spawn bias. */
  private lastAnchorPos = new THREE.Vector3()
  /** Smoothed unit-vector heading of the anchor; near-zero when stationary. */
  private anchorHeading = new THREE.Vector3()
  /** Scratch vector reused inside spawnDriftParticles to avoid per-frame allocs. */
  private readonly spawnScratch = new THREE.Vector3()
  /** Scratch vector for deriving an instantaneous heading without mutating anchorHeading mid-lerp. */
  private readonly headingScratch = new THREE.Vector3()
  /** Cached pool size for drift rate calculation — poolSize is private on ParticleEmitter. */
  private readonly driftPoolSize: number

  constructor(ctx: AtmosphereContext) {
    // Asteroid-tinted color (used for footstep puffs — kicked-up surface material).
    const asteroidColor = new THREE.Color(ctx.baseColor[0], ctx.baseColor[1], ctx.baseColor[2])
    // Neutral grayish dust (used for ambient drift — generic loose grit, not asteroid-specific).
    const driftColor = DUST_NEUTRAL_COLOR.clone()
    // Eye-level motes use the neutral-blended look so they don't dominate the view.
    const eyeColor = asteroidColor.clone().lerp(DUST_NEUTRAL_COLOR, DUST_NEUTRAL_BLEND)

    const driftCount = Math.max(DRIFT_MIN_COUNT, Math.round(DRIFT_BASE_COUNT * ctx.dustCoverage))
    this.driftPoolSize = driftCount
    this.driftEmitter = new ParticleEmitter({
      poolSize: driftCount,
      color: driftColor,
      size: DRIFT_PARTICLE_SIZE,
      lifetime: DRIFT_LIFETIME,
      spread: DRIFT_SPREAD,
      opacity: DRIFT_OPACITY,
      sizeAttenuation: true,
      soft: true,
    })

    this.puffEmitter = new ParticleEmitter({
      poolSize: PUFF_POOL_SIZE,
      color: asteroidColor,
      size: PUFF_PARTICLE_SIZE,
      lifetime: PUFF_LIFETIME,
      spread: PUFF_SPREAD,
      opacity: PUFF_OPACITY,
      sizeAttenuation: true,
      soft: true,
    })

    this.eyeMoteEmitter = new ParticleEmitter({
      poolSize: EYE_MOTE_COUNT,
      color: eyeColor,
      size: EYE_MOTE_SIZE,
      lifetime: EYE_MOTE_LIFETIME,
      spread: EYE_MOTE_SPREAD,
      opacity: EYE_MOTE_OPACITY,
      sizeAttenuation: true,
      soft: true,
    })

    // Drift direction from sun (solar radiation pressure pushes away from sun)
    this.driftDirection
      .copy(ctx.sunDirection)
      .negate()
      .setY(0)
      .normalize()
      .multiplyScalar(DRIFT_SPEED)
  }

  /** Add emitters to scene. */
  addToScene(scene: THREE.Scene): void {
    scene.add(this.driftEmitter.points)
    scene.add(this.puffEmitter.points)
    scene.add(this.eyeMoteEmitter.points)
  }

  /** Per-frame update. */
  update(ctx: AtmosphereContext, dt: number): void {
    this.driftEmitter.tick(dt)
    this.puffEmitter.tick(dt)
    this.eyeMoteEmitter.tick(dt)

    // Per-mode drift size — third-person camera needs bigger particles to
    // overcome point-sprite size attenuation at ~75u, FPS needs smaller so
    // close particles don't look like blobs.
    const driftMaterial = this.driftEmitter.points.material as THREE.ShaderMaterial
    const sizeUniform = driftMaterial.uniforms.uBaseSize
    if (sizeUniform) {
      sizeUniform.value = ctx.activeMode === 'eva' ? DRIFT_SIZE_EVA : DRIFT_SIZE_LANDER
    }

    // Determine active camera position (follow whichever mode is active)
    const camPos = ctx.activeMode === 'eva' ? ctx.playerPosition : ctx.landerPosition

    // Anchor the slab to the active actor itself, so dust forms a bubble
    // around the lander (or player) wherever they are — including high above
    // ground while descending or hovering. spawnDriftParticles places most
    // particles above this Y so EVA dust still sits above the surface, not
    // buried in it.
    this.spawnScratch.set(camPos.x, camPos.y, camPos.z)
    const spawnCenter = this.spawnScratch

    // Smoothed XZ heading derived from the anchor's per-frame motion. Used to
    // bias the spawn box forward so the field doesn't only appear behind a
    // moving player or lander. We re-use spawnScratch below, so derive heading
    // from a separate temp computation here.
    const dx = camPos.x - this.lastAnchorPos.x
    const dz = camPos.z - this.lastAnchorPos.z
    const moveLenSq = dx * dx + dz * dz
    if (moveLenSq > 1e-6) {
      const inv = 1 / Math.sqrt(moveLenSq)
      this.headingScratch.set(dx * inv, 0, dz * inv)
      this.anchorHeading.lerp(this.headingScratch, 0.2)
    } else {
      this.anchorHeading.multiplyScalar(0.9)
    }
    this.lastAnchorPos.copy(camPos)

    // ── Ambient drift: continuously spawn to maintain density ──
    this.spawnDriftParticles(spawnCenter, ctx.activeMode, dt)

    // ── Eye-level motes: only when on foot, anchored to the FPS camera ──
    if (ctx.activeMode === 'eva') {
      this.spawnEyeMotes(ctx, dt)
    }

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

  private spawnDriftParticles(
    anchorCenter: THREE.Vector3,
    mode: AtmosphereContext['activeMode'],
    dt: number,
  ): void {
    // Spawn a few particles per frame to maintain the cloud
    const spawnCount = Math.ceil((this.driftPoolSize / DRIFT_LIFETIME) * dt)
    // Forward bias is useful in EVA (camera = player, particles ahead are in
    // your view) but counter-productive in lander mode where the camera sits
    // *behind* the lander — biasing forward pushes particles further from the
    // camera. Skip the bias for lander mode entirely.
    const useBias = mode === 'eva'
    const biasMag = useBias
      ? DRIFT_VOLUME_HALF * DRIFT_FORWARD_BIAS * this.anchorHeading.length()
      : 0
    const biasX = this.anchorHeading.x * biasMag
    const biasZ = this.anchorHeading.z * biasMag
    // Cache anchorCenter coords because spawnScratch is reused below.
    const cx = anchorCenter.x
    const cy = anchorCenter.y
    const cz = anchorCenter.z
    // EVA spawns entirely above the player to avoid burying particles in
    // terrain; lander mode lets particles extend below the lander into the
    // air space the third-person camera looks down through.
    const yLow = mode === 'eva' ? 0 : -DRIFT_MAX_HEIGHT * DRIFT_LANDER_BELOW_FRAC
    const yRange = DRIFT_MAX_HEIGHT
    for (let i = 0; i < spawnCount; i++) {
      this.spawnScratch.set(
        cx + biasX + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
        cy + yLow + Math.random() * yRange,
        cz + biasZ + (Math.random() - 0.5) * DRIFT_VOLUME_HALF * 2,
      )
      this.driftEmitter.emit(this.spawnScratch, this.driftDirection.clone())
    }
  }

  /**
   * Spawn motion-driven motes in a sphere around the EVA camera. Spawn rate
   * scales with the player's ground speed and gets a bonus while airborne, so
   * the field of motes feels tied to walking and jetpack/floating mobility
   * rather than always-on. A small idle floor keeps a hint of motes when
   * standing still.
   */
  private spawnEyeMotes(ctx: AtmosphereContext, dt: number): void {
    const speedFactor = Math.min(1.5, ctx.playerSpeed / EYE_MOTE_SPEED_FULL)
    const airBonus = ctx.playerGrounded ? 1 : EYE_MOTE_AIRBORNE_GAIN
    const motionIntensity = Math.max(EYE_MOTE_IDLE_FLOOR, speedFactor * airBonus)
    const spawnCount = Math.ceil((EYE_MOTE_COUNT / EYE_MOTE_LIFETIME) * dt * motionIntensity)
    const biasMag = EYE_MOTE_BUBBLE * EYE_MOTE_FORWARD_BIAS * this.anchorHeading.length()
    const biasX = this.anchorHeading.x * biasMag
    const biasZ = this.anchorHeading.z * biasMag
    const cx = ctx.playerPosition.x
    const cy = ctx.playerPosition.y + EYE_MOTE_HEIGHT
    const cz = ctx.playerPosition.z
    for (let i = 0; i < spawnCount; i++) {
      // Uniform sphere sampling via rejection-trimmed cube
      let ox: number, oy: number, oz: number, len2: number
      do {
        ox = (Math.random() - 0.5) * 2
        oy = (Math.random() - 0.5) * 2
        oz = (Math.random() - 0.5) * 2
        len2 = ox * ox + oy * oy + oz * oz
      } while (len2 > 1)
      this.spawnScratch.set(
        cx + biasX + ox * EYE_MOTE_BUBBLE,
        cy + oy * EYE_MOTE_BUBBLE * 0.6,
        cz + biasZ + oz * EYE_MOTE_BUBBLE,
      )
      // Tiny push along the sun-anti direction, much subtler than the ground drift.
      this.headingScratch.copy(this.driftDirection).multiplyScalar(0.15)
      this.eyeMoteEmitter.emit(this.spawnScratch, this.headingScratch)
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
    const posAttr = this.driftEmitter.points.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
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
    this.eyeMoteEmitter.dispose()
  }
}
