/**
 * Visual feedback for shuttle thrust, braking, and RCS.
 * Orange particles trail from engines during thrust,
 * blue particles radiate during inertia dampening,
 * white puffs at wingtips for yaw RCS,
 * and rear-engine idle sprites flicker while fuel is available.
 *
 * Delegates particle management to {@link ParticleEmitter}.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleController } from './ShuttleController'
import { ParticleEmitter } from './ParticleEmitter'
import { getIdleThrusterSpritePulse } from './idleThrusterSpritePulse'
import { resolveThrusterEffectState } from './thrusterEffectState'
import { useAudio } from '@/audio/useAudio'
import { ShuttleThrusterSound } from '@/audio/ShuttleThrusterSound'
import { InertialDampenerSound } from '@/audio/InertialDampenerSound'
import type { PlayerProfile } from '@/lib/player/types'
import { getPlayerCosmetics } from '@/lib/cosmetics/profileCosmetics'
import { resolveThrusterTrailColors } from './cosmetics/thrusterTrailColors'

const THRUST_SPAWN_RATE = 2000
const BRAKE_SPAWN_RATE = 1500
const RCS_SPAWN_RATE = 250

/**
 * 3 nozzle emit points matching ShuttleController ENG_POSITIONS * MODEL_SCALE.
 * After the -90deg X rotation: raw Y becomes -Z, raw Z becomes Y in world.
 */
const NOZZLE_OFFSETS = [
  new THREE.Vector3(-5.1, 0.72, 0),
  new THREE.Vector3(-5.1, -0.46, -0.52),
  new THREE.Vector3(-5.1, -0.46, 0.52),
]

const PUSH_FORCE = 32
const RCS_PUSH_FORCE = 8
const LEFT_WINGTIP = new THREE.Vector3(-4, -1.2, -4.5)
const RIGHT_WINGTIP = new THREE.Vector3(-4, -1.2, 4.5)
const IDLE_THRUSTER_SPRITE_SIZE = 1.4
const IDLE_THRUSTER_SPRITE_X_OFFSET = -0.8
const IDLE_THRUSTER_SPRITE_DEPTH_BIAS = -0.02
const IDLE_THRUSTER_TEXTURE_SIZE = 64
const IDLE_THRUSTER_COLOR_CORE = '#fff5cc'
const IDLE_THRUSTER_COLOR_EDGE = '#ff9a1f'

/**
 * If the shuttle's per-frame world translation exceeds this many units we
 * treat the move as a teleport (portal warp, respawn, slingshot launch) and
 * skip the spawn-position interpolation — otherwise particles would smear
 * across the gap between spawn and arrival points.
 */
const SHUTTLE_TELEPORT_DISTANCE_THRESHOLD = 200

/** Reusable scratch — interpolated shuttle world position for one particle. */
const SPAWN_INTERP_POS_SCRATCH = /* @__PURE__ */ new THREE.Vector3()
/** Reusable scratch — final world spawn position handed to {@link ParticleEmitter.emit}. */
const SPAWN_WORLD_POS_SCRATCH = /* @__PURE__ */ new THREE.Vector3()
/** Reusable scratch — push direction recomputed once per frame per emitter. */
const SPAWN_PUSH_DIR_SCRATCH = /* @__PURE__ */ new THREE.Vector3()

/**
 * Shuttle-specific thruster VFX controller.
 * Creates three {@link ParticleEmitter} instances (thrust, brake, RCS)
 * and drives them from shuttle input state each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class ThrusterEffectController implements Tickable {
  readonly thrustPoints: THREE.Points
  readonly brakePoints: THREE.Points
  readonly rcsPoints: THREE.Points

  private readonly idleThrusterSprites: THREE.Sprite[] = []
  private readonly thrustEmitter: ParticleEmitter
  private readonly brakeEmitter: ParticleEmitter
  private readonly rcsEmitter: ParticleEmitter
  private thrustSpawnAccumulator = 0
  private brakeSpawnAccumulator = 0
  private rcsSpawnAccumulator = 0
  private elapsedTime = 0
  private prevThrusting = false
  private prevBraking = false
  private prevRcsActive = false
  /**
   * Shuttle world position at the *start* of this frame. Used to interpolate
   * particle spawn positions along the shuttle's per-frame trajectory so
   * batched spawns (33+ particles per frame at 60fps) don't clump into a
   * single visible puff per frame, which made the trail read as Asteroids-
   * style discrete dots whenever the shuttle was moving fast or the camera
   * was zoomed out. `null` until the first tick captures it.
   */
  private prevShuttleWorldPos: THREE.Vector3 | null = null
  private readonly shuttle: ShuttleController
  private readonly thrusterSound = new ShuttleThrusterSound()
  private readonly inertialDampenerSound = new InertialDampenerSound()
  private brakeInitialVelocity = 0

  /** When false, no audio is played or stopped (e.g. while inside the habitat). */
  private _audioEnabled = true

  /** Handle for the looping thrust sound so it can be faded without restart. */
  private _thrusterHandle: ReturnType<ReturnType<typeof useAudio>['play']> | null = null
  /**
   * 0–1 envelope for the thrust loop.
   * Rises while W is held, falls while released. Sound stops when it reaches 0.
   */
  private _thrusterFadeT = 0
  /** Peak volume of the thrust loop. */
  private static readonly THRUSTER_TARGET_VOL = 0.6
  /** Seconds to reach full volume from silence. */
  private static readonly THRUSTER_FADE_IN = 0.6
  /** Seconds to fade to silence after key release. */
  private static readonly THRUSTER_FADE_OUT = 0.35

  constructor(shuttle: ShuttleController) {
    this.shuttle = shuttle

    // Scale spread and particle size so VFX match the shuttle's visual scale
    const s = shuttle.group.scale.x

    this.thrustEmitter = new ParticleEmitter({
      poolSize: 2200,
      color: new THREE.Color(0xffcc66),
      size: Math.max(10, 10 * s),
      lifetime: 0.5,
      spread: 2 * s,
      opacity: 0.9,
      soft: true,
      sizeGrowth: 1.8,
    })

    this.brakeEmitter = new ParticleEmitter({
      poolSize: 2000,
      color: new THREE.Color(0x4488ff),
      size: Math.max(8, 8 * s),
      lifetime: 0.45,
      spread: 3 * s,
      opacity: 0.7,
      soft: true,
      sizeGrowth: 2.0,
    })

    this.rcsEmitter = new ParticleEmitter({
      poolSize: 400,
      color: new THREE.Color(0xddeeff),
      size: Math.max(3, 2.5 * s),
      lifetime: 0.5,
      spread: 1.5 * s,
      opacity: 0.6,
      soft: true,
      sizeGrowth: 2.5,
    })

    this.thrustPoints = this.thrustEmitter.points
    this.brakePoints = this.brakeEmitter.points
    this.rcsPoints = this.rcsEmitter.points

    const idleThrusterTexture = createIdleThrusterTexture()
    for (const nozzle of NOZZLE_OFFSETS) {
      const material = new THREE.SpriteMaterial({
        map: idleThrusterTexture,
        color: new THREE.Color(IDLE_THRUSTER_COLOR_EDGE),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.copy(nozzle)
      sprite.position.x += IDLE_THRUSTER_SPRITE_X_OFFSET
      sprite.position.y += IDLE_THRUSTER_SPRITE_DEPTH_BIAS
      sprite.visible = false
      sprite.scale.setScalar(IDLE_THRUSTER_SPRITE_SIZE)
      this.shuttle.group.add(sprite)
      this.idleThrusterSprites.push(sprite)
    }
  }

  /**
   * Apply a `shuttle-thruster-trail` catalog row to every emitter + sprite
   * owned by this controller. Slot mapping:
   *
   *   - `core` (gradient stop 1) → main thrust, wingtip RCS puffs, and idle
   *     nozzle sprite tint. RCS uses the same themed midtone as main thrust
   *     so the chosen color actually reads on the small wingtip puffs — the
   *     soft radial particle texture preserves the smoky look regardless of
   *     tint.
   *   - `wake` (gradient stop 2) → inertial-dampener brake plume so the
   *     counter-thrust beat reads visually distinct from forward thrust.
   *
   * Unknown / mismatched ids are silently ignored so callers can route the
   * id straight from a profile snapshot without pre-validating.
   *
   * @param optionId - `shuttle-thruster-trail` catalog row id.
   */
  applyShuttleThrusterTrail(optionId: string): void {
    const colors = resolveThrusterTrailColors(optionId, 'shuttle-thruster-trail')
    if (!colors) return
    this.thrustEmitter.setColor(colors.core)
    this.brakeEmitter.setColor(colors.wake)
    this.rcsEmitter.setColor(colors.core)
    for (const sprite of this.idleThrusterSprites) {
      const material = sprite.material as THREE.SpriteMaterial
      material.color.copy(colors.core)
      material.needsUpdate = true
    }
  }

  /**
   * Convenience wrapper that reads the active `shuttle-thruster-trail` id
   * out of the profile cosmetics block and forwards it to
   * {@link applyShuttleThrusterTrail}.
   *
   * @param profile - Active player profile.
   */
  applyShuttleThrusterTrailFromProfile(profile: PlayerProfile): void {
    this.applyShuttleThrusterTrail(getPlayerCosmetics(profile).shuttleThrusterTrailId)
  }

  /**
   * Enable or disable thruster audio without affecting VFX.
   * Pass `false` when the player enters a non-flight context (e.g. habitat) so
   * WASD input doesn't bleed shuttle thruster sounds into unrelated scenes.
   */
  setAudioEnabled(enabled: boolean): void {
    this._audioEnabled = enabled
    if (!enabled) {
      this._stopThrusterSound()
      this.thrusterSound.stop()
      this.inertialDampenerSound.stop()
      this.brakeInitialVelocity = 0
    }
  }

  private _stopThrusterSound(): void {
    this._thrusterHandle?.stop()
    this._thrusterHandle = null
    this._thrusterFadeT = 0
  }

  tick(dt: number): void {
    this.elapsedTime += dt
    const scale = this.shuttle.group.scale.x
    const effectState = resolveThrusterEffectState(
      this.shuttle.isThrusting,
      this.shuttle.isBraking,
      this.shuttle.thrusterSystem.fuelLevel > 0 && !this.shuttle.dead,
      this.shuttle.slingshotLaunchFxActive,
    )

    if (this._audioEnabled) {
      const audio = useAudio()
      const isRcsActive = this.shuttle.isYawingLeft || this.shuttle.isYawingRight
      if (effectState.emitThrust || effectState.emitBrake || isRcsActive) {
        audio.unlock()
      }

      if (effectState.emitThrust) {
        // Start the loop only if nothing is running (handles both fresh press and re-press during fade-out)
        if (this._thrusterHandle === null) {
          this._thrusterHandle = audio.play('sfx.thrusterBurst', { loop: true })
        }
        // Ramp up — continues naturally from wherever fade-out left off
        this._thrusterFadeT = Math.min(
          1,
          this._thrusterFadeT + dt / ThrusterEffectController.THRUSTER_FADE_IN,
        )
      } else {
        // Ramp down — handle stays alive until silence so re-press can reverse direction
        if (this._thrusterHandle !== null) {
          this._thrusterFadeT = Math.max(
            0,
            this._thrusterFadeT - dt / ThrusterEffectController.THRUSTER_FADE_OUT,
          )
          if (this._thrusterFadeT <= 0) {
            this._stopThrusterSound()
          }
        }
      }
      if (this._thrusterHandle !== null) {
        this._thrusterHandle.setVolume(
          this._thrusterFadeT * ThrusterEffectController.THRUSTER_TARGET_VOL,
        )
      }

      if (effectState.emitBrake && !this.prevBraking) {
        this.brakeInitialVelocity = Math.max(this.shuttle.speed, 0.001)
      }

      this.inertialDampenerSound.update(
        {
          currentVelocity: this.shuttle.speed,
          initialVelocity: this.brakeInitialVelocity,
          dampenerActive: effectState.emitBrake,
          sfxVolume: audio.getCategoryVolume('sfx'),
        },
        dt,
      )

      this.thrusterSound.update(
        {
          rcsLeft: this.shuttle.isYawingLeft ? 1 : 0,
          rcsRight: this.shuttle.isYawingRight ? 1 : 0,
          angularSpeed: this.shuttle.currentAngularVelocity,
          sfxVolume: audio.getCategoryVolume('sfx'),
        },
        dt,
      )

      this.prevThrusting = effectState.emitThrust
      this.prevBraking = effectState.emitBrake
      this.prevRcsActive = isRcsActive
    } else {
      this._stopThrusterSound()
      this.thrusterSound.stop()
      this.inertialDampenerSound.stop()
      this.prevThrusting = false
      this.prevBraking = false
      this.prevRcsActive = false
      this.brakeInitialVelocity = 0
    }

    this.captureFrameStartShuttlePos()

    if (effectState.emitThrust) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      const count = Math.floor(this.thrustSpawnAccumulator)
      this.thrustSpawnAccumulator -= count
      if (count > 0) {
        SPAWN_PUSH_DIR_SCRATCH.set(-PUSH_FORCE * scale, 0, 0).applyQuaternion(
          this.shuttle.group.quaternion,
        )
        for (let i = 0; i < count; i++) {
          const t = i / count
          const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
          this.computeInterpolatedNozzleWorldPos(nozzle, scale, t, SPAWN_WORLD_POS_SCRATCH)
          this.thrustEmitter.emit(SPAWN_WORLD_POS_SCRATCH, SPAWN_PUSH_DIR_SCRATCH)
        }
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (effectState.emitBrake) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      const count = Math.floor(this.brakeSpawnAccumulator)
      this.brakeSpawnAccumulator -= count
      if (count > 0) {
        SPAWN_PUSH_DIR_SCRATCH.set(-PUSH_FORCE * scale, 0, 0).applyQuaternion(
          this.shuttle.group.quaternion,
        )
        for (let i = 0; i < count; i++) {
          const t = i / count
          const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
          this.computeInterpolatedNozzleWorldPos(nozzle, scale, t, SPAWN_WORLD_POS_SCRATCH)
          this.brakeEmitter.emit(SPAWN_WORLD_POS_SCRATCH, SPAWN_PUSH_DIR_SCRATCH)
        }
      }
    } else {
      this.brakeSpawnAccumulator = 0
    }

    const isYawingLeft = this.shuttle.isYawingLeft
    const isYawingRight = this.shuttle.isYawingRight
    if (isYawingLeft || isYawingRight) {
      this.rcsSpawnAccumulator += RCS_SPAWN_RATE * dt
      const count = Math.floor(this.rcsSpawnAccumulator)
      this.rcsSpawnAccumulator -= count
      if (count > 0) {
        const wingtip = isYawingLeft ? RIGHT_WINGTIP : LEFT_WINGTIP
        const pushForce = RCS_PUSH_FORCE * scale
        SPAWN_PUSH_DIR_SCRATCH.set(0, 0, isYawingLeft ? pushForce : -pushForce).applyQuaternion(
          this.shuttle.group.quaternion,
        )
        for (let i = 0; i < count; i++) {
          const t = i / count
          this.computeInterpolatedNozzleWorldPos(wingtip, scale, t, SPAWN_WORLD_POS_SCRATCH)
          this.rcsEmitter.emit(SPAWN_WORLD_POS_SCRATCH, SPAWN_PUSH_DIR_SCRATCH)
        }
      }
    } else {
      this.rcsSpawnAccumulator = 0
    }

    this.commitFrameEndShuttlePos()

    this.updateIdleThrusterSprites(effectState.emitIdleThrust)
    this.thrustEmitter.tick(dt)
    this.brakeEmitter.tick(dt)
    this.rcsEmitter.tick(dt)
  }

  /**
   * Lazily initialize {@link prevShuttleWorldPos} on the first tick that runs
   * with a placed shuttle, and treat sudden large jumps (portals, respawns,
   * slingshot warps) as teleports so we don't smear a frame's worth of
   * particles across the warp gap.
   */
  private captureFrameStartShuttlePos(): void {
    if (!this.prevShuttleWorldPos) {
      this.prevShuttleWorldPos = this.shuttle.position.clone()
      return
    }
    if (
      this.prevShuttleWorldPos.distanceToSquared(this.shuttle.position) >
      SHUTTLE_TELEPORT_DISTANCE_THRESHOLD * SHUTTLE_TELEPORT_DISTANCE_THRESHOLD
    ) {
      this.prevShuttleWorldPos.copy(this.shuttle.position)
    }
  }

  /** Snapshot the shuttle's end-of-frame world position for next tick's interpolation. */
  private commitFrameEndShuttlePos(): void {
    if (!this.prevShuttleWorldPos) return
    this.prevShuttleWorldPos.copy(this.shuttle.position)
  }

  /**
   * Build the world-space spawn position for one particle, distributing the
   * frame's batched spawns evenly between the shuttle's previous and current
   * world positions. Quaternion is taken at the current frame on the
   * assumption that per-frame rotation is small (acceptable approximation
   * for a continuous plume; if the shuttle is mid-spin the trail still reads
   * correctly because the quaternion differs only by a few degrees per
   * frame).
   *
   * Result is written into `out` to avoid allocating a fresh `Vector3` per
   * particle.
   *
   * @param localOffset - Nozzle / wingtip offset in shuttle-local space.
   * @param scale - Shuttle group scale (uniform across axes).
   * @param t - Interpolation parameter `i / count` for this particle.
   * @param out - Reusable destination vector populated in place.
   */
  private computeInterpolatedNozzleWorldPos(
    localOffset: THREE.Vector3,
    scale: number,
    t: number,
    out: THREE.Vector3,
  ): void {
    const prev = this.prevShuttleWorldPos ?? this.shuttle.position
    SPAWN_INTERP_POS_SCRATCH.copy(prev).lerp(this.shuttle.position, t)
    out
      .copy(localOffset)
      .multiplyScalar(scale)
      .applyQuaternion(this.shuttle.group.quaternion)
      .add(SPAWN_INTERP_POS_SCRATCH)
  }

  dispose(): void {
    this._stopThrusterSound()
    this.thrusterSound.dispose()
    this.inertialDampenerSound.dispose()
    for (const sprite of this.idleThrusterSprites) {
      this.shuttle.group.remove(sprite)
      ;(sprite.material as THREE.SpriteMaterial).map?.dispose()
      ;(sprite.material as THREE.SpriteMaterial).dispose()
    }
    this.thrustEmitter.dispose()
    this.brakeEmitter.dispose()
    this.rcsEmitter.dispose()
  }

  private updateIdleThrusterSprites(active: boolean): void {
    if (!active) {
      for (const sprite of this.idleThrusterSprites) {
        sprite.visible = false
      }
      return
    }

    const pulse = getIdleThrusterSpritePulse(this.elapsedTime)
    for (const sprite of this.idleThrusterSprites) {
      const material = sprite.material as THREE.SpriteMaterial
      sprite.visible = true
      sprite.scale.setScalar(IDLE_THRUSTER_SPRITE_SIZE * pulse.scale)
      material.opacity = pulse.opacity
    }
  }
}

/** Procedural soft disc used for idle RCS / thruster sprites. */
function createIdleThrusterTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = IDLE_THRUSTER_TEXTURE_SIZE
  canvas.height = IDLE_THRUSTER_TEXTURE_SIZE

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Unable to create idle thruster sprite texture.')
  }

  const center = IDLE_THRUSTER_TEXTURE_SIZE / 2
  const gradient = context.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, IDLE_THRUSTER_COLOR_CORE)
  gradient.addColorStop(0.45, IDLE_THRUSTER_COLOR_EDGE)
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')

  context.fillStyle = gradient
  context.fillRect(0, 0, IDLE_THRUSTER_TEXTURE_SIZE, IDLE_THRUSTER_TEXTURE_SIZE)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
