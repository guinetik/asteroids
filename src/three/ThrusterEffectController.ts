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

const THRUST_SPAWN_RATE = 800
const BRAKE_SPAWN_RATE = 600
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

const PUSH_FORCE = 20
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
      poolSize: 1500,
      color: new THREE.Color(0xffcc66),
      size: Math.max(6, 6 * s),
      lifetime: 0.5,
      spread: 2 * s,
      opacity: 0.9,
      sizeGrowth: 1.8,
    })

    this.brakeEmitter = new ParticleEmitter({
      poolSize: 1500,
      color: new THREE.Color(0x4488ff),
      size: Math.max(5, 5 * s),
      lifetime: 0.45,
      spread: 3 * s,
      opacity: 0.7,
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

    if (effectState.emitThrust) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      while (this.thrustSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        const worldPos = nozzle
          .clone()
          .multiplyScalar(scale)
          .applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const pushDir = new THREE.Vector3(-PUSH_FORCE * scale, 0, 0).applyQuaternion(
          this.shuttle.group.quaternion,
        )
        this.thrustEmitter.emit(worldPos, pushDir)
        this.thrustSpawnAccumulator -= 1
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (effectState.emitBrake) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      while (this.brakeSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        const worldPos = nozzle
          .clone()
          .multiplyScalar(scale)
          .applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const pushDir = new THREE.Vector3(-PUSH_FORCE * scale, 0, 0).applyQuaternion(
          this.shuttle.group.quaternion,
        )
        this.brakeEmitter.emit(worldPos, pushDir)
        this.brakeSpawnAccumulator -= 1
      }
    } else {
      this.brakeSpawnAccumulator = 0
    }

    const isYawingLeft = this.shuttle.isYawingLeft
    const isYawingRight = this.shuttle.isYawingRight
    if (isYawingLeft || isYawingRight) {
      this.rcsSpawnAccumulator += RCS_SPAWN_RATE * dt
      while (this.rcsSpawnAccumulator >= 1) {
        const wingtip = isYawingLeft ? RIGHT_WINGTIP : LEFT_WINGTIP
        const worldPos = wingtip
          .clone()
          .multiplyScalar(scale)
          .applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const pushForce = RCS_PUSH_FORCE * scale
        const push = isYawingLeft
          ? new THREE.Vector3(0, 0, pushForce)
          : new THREE.Vector3(0, 0, -pushForce)
        const worldPush = push.applyQuaternion(this.shuttle.group.quaternion)
        this.rcsEmitter.emit(worldPos, worldPush)
        this.rcsSpawnAccumulator -= 1
      }
    } else {
      this.rcsSpawnAccumulator = 0
    }

    this.updateIdleThrusterSprites(effectState.emitIdleThrust)
    this.thrustEmitter.tick(dt)
    this.brakeEmitter.tick(dt)
    this.rcsEmitter.tick(dt)
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
