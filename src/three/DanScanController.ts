/**
 * Visual controller for the DAN runtime encounter.
 *
 * Owns the neutron particle pool spawned from the crater floor, the downward
 * scanner beam emitted from the parked lander, and the completion pulse ring
 * that fires when the encounter resolves successfully. Mirrors
 * {@link PhotometryProbeController} structurally but renders crater-bowl
 * particles instead of a single side-standoff probe.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { ProjectileSystem } from '@/lib/fps/projectileSystem'
import type { DanTierTuning } from '@/lib/minigame/DanMinigame'

/** Maximum number of live DAN neutron particles allocated in the pool. */
const MAX_DAN_PARTICLES = 64

/** Hit-sphere radius used when registering particles with the projectile system. */
export const DAN_PARTICLE_HIT_RADIUS = 0.7

/** Particle marker geometry radius, in world units. */
const DAN_PARTICLE_RADIUS = 0.55

/** Cyan-green particle accent color. */
const DAN_PARTICLE_COLOR = 0x66ffd9

/** Beam outer color while the scan is running. */
const DAN_BEAM_COLOR = 0x88ffe6

/** Beam core radius in world units. */
const DAN_BEAM_CORE_RADIUS = 0.6

/** Beam glow halo radius in world units. */
const DAN_BEAM_GLOW_RADIUS = 4.0

/** Beam core opacity at full scan intensity. */
const DAN_BEAM_CORE_OPACITY = 0.88

/** Beam glow opacity at full scan intensity. */
const DAN_BEAM_GLOW_OPACITY = 0.22

/** Pulse-ring radius animation top, in world units. */
const COMPLETION_PULSE_RADIUS = 38

/** Pulse-ring duration, in seconds. */
const COMPLETION_PULSE_DURATION = 1.4

/** Pulse-ring tube thickness in world units. */
const COMPLETION_PULSE_TUBE = 0.8

/** Beam fade-out window after `endScan`, in seconds. */
const BEAM_FADE_OUT_SECONDS = 0.6

/** Lander emitter offset along the lander up axis used as the beam origin. */
const DAN_LANDER_EMITTER_DOWN_OFFSET = 4

/** Default vertical thickness used when sampling the bowl floor for spawn Y. */
const PARTICLE_SPAWN_FLOOR_OFFSET = 0.5

/**
 * Downward acceleration applied to particles each tick. Asteroids have
 * essentially zero gravity, so neutrons fly outward to space instead of
 * arcing back to the bowl floor. A tiny non-zero value keeps the spread
 * cone honest without yanking particles out of the player's reach.
 */
const PARTICLE_GRAVITY_DOWN = 0.4

/**
 * Particle-pool entry. One per allocated mesh; recycled on expiry or capture.
 *
 * @author guinetik
 * @date 2026-04-28
 */
interface DanParticleEntry {
  /** Pool slot index, also used as the projectile registry spawn index. */
  spawnIndex: number
  /** Visible mesh placed at world coordinates while alive. */
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  /** Reused velocity vector. */
  velocity: THREE.Vector3
  /** Time remaining before the particle expires (seconds). */
  lifetimeRemaining: number
  /** True while the particle is active and registered in the projectile system. */
  alive: boolean
}

/**
 * Constructor options for {@link DanScanController}.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export interface DanScanControllerOptions {
  /** Three.js scene receiving particle and beam visuals. */
  scene: THREE.Scene
  /** Crater center X in world space. */
  craterX: number
  /** Crater bowl floor Y in world space (used as the particle spawn base). */
  craterY: number
  /** Crater center Z in world space. */
  craterZ: number
  /** Crater radius in world units. */
  craterRadius: number
  /** Crater depth in world units, used to size the spawn cone height. */
  craterDepth: number
  /** Particle tuning preset rolled by the mission generator. */
  particleTuning: DanTierTuning
  /** Projectile system used to register particle hit spheres. */
  projectileSystem: ProjectileSystem
  /** Fired when a SCI projectile captures one of the registered particles. */
  onParticleHit: () => void
  /** Deterministic seed for spawn-position jitter. */
  seed: number
}

/**
 * Renders the DAN neutron particle storm, lander beam, and completion pulse.
 *
 * @author guinetik
 * @date 2026-04-28
 */
export class DanScanController implements Tickable {
  private readonly options: DanScanControllerOptions
  private readonly particles: DanParticleEntry[] = []
  private particleSpawnAccumulator = 0
  private spawning = false
  private elapsed = 0
  private rngState: number

  // Beam visuals
  private beamCore: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null = null
  private beamGlow: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null = null
  private beamFadeRemaining = 0
  private beamVisible = false
  private landerPosition: THREE.Vector3 | null = null
  private landerUp: THREE.Vector3 | null = null

  // Completion pulse
  private completionPulse: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null
  private completionPulseRemaining = 0

  // Reused scratch
  private readonly _spawnPoint = new THREE.Vector3()
  private readonly _emitter = new THREE.Vector3()
  private readonly _beamEnd = new THREE.Vector3()

  /**
   * Construct the controller with the crater context and projectile system.
   *
   * @param options - Crater + scene + tuning bindings.
   */
  constructor(options: DanScanControllerOptions) {
    this.options = options
    this.rngState = Math.max(1, Math.floor(options.seed) | 0)
    this.preallocateParticles()
  }

  /**
   * Update the lander world-space anchor used when positioning the downward beam.
   * Pass `null` to clear (e.g., during disposal).
   *
   * @param position - Lander world-space position.
   * @param up - Lander up-axis world direction.
   */
  setLanderAnchor(
    position: { x: number; y: number; z: number } | null,
    up: { x: number; y: number; z: number } | null = null,
  ): void {
    if (!position) {
      this.landerPosition = null
      this.landerUp = null
      return
    }
    if (!this.landerPosition) {
      this.landerPosition = new THREE.Vector3()
      this.landerUp = new THREE.Vector3(0, 1, 0)
    }
    this.landerPosition.set(position.x, position.y, position.z)
    if (up) {
      this.landerUp!.set(up.x, up.y, up.z).normalize()
    }
  }

  /** Begin spawning particles and show the lander beam. */
  beginScan(): void {
    this.spawning = true
    this.beamVisible = true
    this.beamFadeRemaining = 0
    this.particleSpawnAccumulator = 0
    this.ensureBeam()
  }

  /** Stop spawning particles and start fading the beam to black. */
  endScan(): void {
    this.spawning = false
    this.beamFadeRemaining = BEAM_FADE_OUT_SECONDS
  }

  /**
   * Per-frame update — advance particles, beam pulse, completion pulse.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    this.tickParticleSpawn(dt)
    this.tickParticles(dt)
    this.tickBeam(dt)
    this.tickCompletionPulse(dt)
  }

  /** Spawn a one-shot expanding pulse ring marking successful completion. */
  triggerCompletionPulse(): void {
    if (!this.completionPulse) {
      const geometry = new THREE.TorusGeometry(1, COMPLETION_PULSE_TUBE, 12, 48)
      const material = new THREE.MeshBasicMaterial({
        color: DAN_BEAM_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      this.completionPulse = new THREE.Mesh(geometry, material)
      this.completionPulse.name = 'dan-completion-pulse'
      this.completionPulse.rotation.x = Math.PI / 2
      this.options.scene.add(this.completionPulse)
    }
    this.completionPulse.position.set(this.options.craterX, this.options.craterY, this.options.craterZ)
    this.completionPulse.scale.setScalar(1)
    this.completionPulse.material.opacity = 1
    this.completionPulseRemaining = COMPLETION_PULSE_DURATION
  }

  /** Number of currently live particles. Read by debug tooling and tests. */
  get liveParticleCount(): number {
    let count = 0
    for (const entry of this.particles) {
      if (entry.alive) count++
    }
    return count
  }

  /** Whether the beam is currently rendered (visible or fading out). */
  get isBeamActive(): boolean {
    return this.beamVisible || this.beamFadeRemaining > 0
  }

  /**
   * Capture a particle by its registry spawn index. Called by the level layer
   * after the projectile system reports a SCI hit on a registered DAN particle.
   *
   * @param spawnIndex - Pool slot index originally registered.
   */
  captureParticle(spawnIndex: number): void {
    const entry = this.particles[spawnIndex]
    if (!entry || !entry.alive) return
    this.expireParticle(entry)
    this.options.onParticleHit()
  }

  /** Tear down all visuals and unregister from the projectile system. */
  dispose(): void {
    for (const entry of this.particles) {
      if (entry.alive) {
        this.options.projectileSystem.removeDanParticle(entry.spawnIndex)
      }
      this.options.scene.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      entry.mesh.material.dispose()
    }
    this.particles.length = 0

    if (this.beamCore) {
      this.options.scene.remove(this.beamCore)
      this.beamCore.geometry.dispose()
      this.beamCore.material.dispose()
      this.beamCore = null
    }
    if (this.beamGlow) {
      this.options.scene.remove(this.beamGlow)
      this.beamGlow.geometry.dispose()
      this.beamGlow.material.dispose()
      this.beamGlow = null
    }
    if (this.completionPulse) {
      this.options.scene.remove(this.completionPulse)
      this.completionPulse.geometry.dispose()
      this.completionPulse.material.dispose()
      this.completionPulse = null
    }
  }

  /** Allocate the full particle pool up-front so spawn cost stays uniform. */
  private preallocateParticles(): void {
    const geometry = new THREE.SphereGeometry(DAN_PARTICLE_RADIUS, 8, 6)
    for (let i = 0; i < MAX_DAN_PARTICLES; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: DAN_PARTICLE_COLOR,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `dan-particle-${i}`
      mesh.visible = false
      this.options.scene.add(mesh)
      this.particles.push({
        spawnIndex: i,
        mesh,
        velocity: new THREE.Vector3(),
        lifetimeRemaining: 0,
        alive: false,
      })
    }
  }

  /** Probability roll: spawn one particle (or burst) per tick interval. */
  private tickParticleSpawn(dt: number): void {
    if (!this.spawning) return
    this.particleSpawnAccumulator += dt
    if (this.particleSpawnAccumulator < this.options.particleTuning.tickIntervalSeconds) return
    this.particleSpawnAccumulator -= this.options.particleTuning.tickIntervalSeconds

    if (this.rng() < this.options.particleTuning.particleSpawnProbability) {
      this.spawnParticle()
    }
    if (this.rng() < this.options.particleTuning.particleBurstChance) {
      this.spawnParticle()
      this.spawnParticle()
    }
  }

  /** Update particle physics, expire on lifetime end. */
  private tickParticles(dt: number): void {
    for (const entry of this.particles) {
      if (!entry.alive) continue
      entry.lifetimeRemaining -= dt
      if (entry.lifetimeRemaining <= 0) {
        this.expireParticle(entry)
        continue
      }
      // Simple ballistic motion — outward from the bowl floor with downward gravity.
      entry.velocity.y -= PARTICLE_GRAVITY_DOWN * dt
      entry.mesh.position.x += entry.velocity.x * dt
      entry.mesh.position.y += entry.velocity.y * dt
      entry.mesh.position.z += entry.velocity.z * dt
    }
  }

  /** Allocate one pool entry and register it with the projectile system. */
  private spawnParticle(): void {
    const slot = this.particles.find((entry) => !entry.alive)
    if (!slot) return

    // Random spawn point inside the crater bowl, biased to the center.
    const angle = this.rng() * Math.PI * 2
    const radius = Math.sqrt(this.rng()) * this.options.craterRadius * 0.6
    const x = this.options.craterX + Math.cos(angle) * radius
    const z = this.options.craterZ + Math.sin(angle) * radius
    const y = this.options.craterY + PARTICLE_SPAWN_FLOOR_OFFSET

    const speed =
      this.options.particleTuning.particleSpeedMin +
      this.rng() *
        (this.options.particleTuning.particleSpeedMax -
          this.options.particleTuning.particleSpeedMin)
    const upBias = 0.55 + this.rng() * 0.4
    const lateral = Math.sqrt(Math.max(0, 1 - upBias * upBias))
    const lateralAngle = this.rng() * Math.PI * 2

    slot.mesh.position.set(x, y, z)
    slot.mesh.visible = true
    slot.velocity.set(Math.cos(lateralAngle) * lateral, upBias, Math.sin(lateralAngle) * lateral)
    slot.velocity.multiplyScalar(speed)
    slot.lifetimeRemaining =
      this.options.particleTuning.particleLifetimeMin +
      this.rng() *
        (this.options.particleTuning.particleLifetimeMax -
          this.options.particleTuning.particleLifetimeMin)
    slot.alive = true

    this.options.projectileSystem.addDanParticle({
      spawnIndex: slot.spawnIndex,
      cx: x,
      cy: y,
      cz: z,
      radius: DAN_PARTICLE_HIT_RADIUS,
    })
  }

  /** Hide and unregister one entry; keep the mesh allocated for reuse. */
  private expireParticle(entry: DanParticleEntry): void {
    entry.alive = false
    entry.mesh.visible = false
    this.options.projectileSystem.removeDanParticle(entry.spawnIndex)
  }

  /** Position and fade the lander beam. */
  private tickBeam(dt: number): void {
    if (this.beamFadeRemaining > 0) {
      this.beamFadeRemaining -= dt
      if (this.beamFadeRemaining <= 0) {
        this.beamFadeRemaining = 0
        this.beamVisible = false
        this.hideBeam()
      }
    }
    if (!this.beamVisible && this.beamFadeRemaining <= 0) return
    if (!this.beamCore || !this.beamGlow) return
    if (!this.landerPosition) {
      // No lander anchor — render the beam as a vertical column above the crater.
      this._emitter.set(this.options.craterX, this.options.craterY + 30, this.options.craterZ)
      this._beamEnd.set(this.options.craterX, this.options.craterY, this.options.craterZ)
    } else {
      this._emitter
        .copy(this.landerPosition)
        .addScaledVector(this.landerUp ?? new THREE.Vector3(0, 1, 0), -DAN_LANDER_EMITTER_DOWN_OFFSET)
      this._beamEnd.set(this.options.craterX, this.options.craterY, this.options.craterZ)
    }

    const delta = this._beamEnd.clone().sub(this._emitter)
    const length = delta.length()
    if (length <= 0.001) return

    const center = this._emitter.clone().addScaledVector(delta, 0.5)
    const unit = delta.clone().multiplyScalar(1 / length)
    const orientation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      unit,
    )
    this.beamCore.position.copy(center)
    this.beamCore.scale.set(1, length, 1)
    this.beamCore.quaternion.copy(orientation)
    this.beamGlow.position.copy(center)
    this.beamGlow.scale.set(1, length, 1)
    this.beamGlow.quaternion.copy(orientation)

    const fade =
      this.beamFadeRemaining > 0 ? Math.max(0, this.beamFadeRemaining / BEAM_FADE_OUT_SECONDS) : 1
    this.beamCore.material.opacity = DAN_BEAM_CORE_OPACITY * fade
    this.beamGlow.material.opacity = DAN_BEAM_GLOW_OPACITY * fade
  }

  /** Allocate beam meshes lazily so disposal of inactive minigames is cheap. */
  private ensureBeam(): void {
    if (this.beamCore && this.beamGlow) return
    const coreGeometry = new THREE.CylinderGeometry(
      DAN_BEAM_CORE_RADIUS,
      DAN_BEAM_CORE_RADIUS,
      1,
      12,
    )
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: DAN_BEAM_COLOR,
      transparent: true,
      opacity: DAN_BEAM_CORE_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.beamCore = new THREE.Mesh(coreGeometry, coreMaterial)
    this.beamCore.name = 'dan-scan-beam-core'
    this.options.scene.add(this.beamCore)

    const glowGeometry = new THREE.CylinderGeometry(
      DAN_BEAM_GLOW_RADIUS,
      DAN_BEAM_GLOW_RADIUS,
      1,
      16,
    )
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: DAN_BEAM_COLOR,
      transparent: true,
      opacity: DAN_BEAM_GLOW_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.beamGlow = new THREE.Mesh(glowGeometry, glowMaterial)
    this.beamGlow.name = 'dan-scan-beam-glow'
    this.options.scene.add(this.beamGlow)
  }

  /** Hide beam meshes without disposing them (kept for reuse on retry). */
  private hideBeam(): void {
    if (this.beamCore) this.beamCore.material.opacity = 0
    if (this.beamGlow) this.beamGlow.material.opacity = 0
  }

  /** Animate completion pulse expansion + fade. */
  private tickCompletionPulse(dt: number): void {
    if (this.completionPulseRemaining <= 0 || !this.completionPulse) return
    this.completionPulseRemaining -= dt
    if (this.completionPulseRemaining <= 0) {
      this.completionPulse.material.opacity = 0
      this.completionPulse.visible = false
      this.completionPulseRemaining = 0
      return
    }
    const t = 1 - this.completionPulseRemaining / COMPLETION_PULSE_DURATION
    const radius = 1 + t * COMPLETION_PULSE_RADIUS
    this.completionPulse.scale.setScalar(radius)
    this.completionPulse.material.opacity = 1 - t
  }

  /** Mulberry32 — small deterministic RNG for spawn jitter. */
  private rng(): number {
    let state = (this.rngState += 0x6d2b79f5)
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}
