/**
 * Particle-based visual feedback for shuttle thrust, braking, and RCS.
 * Orange particles trail from engines during thrust,
 * blue particles radiate during inertia dampening,
 * white puffs at wingtips for yaw RCS.
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

const THRUST_SPAWN_RATE = 100
const BRAKE_SPAWN_RATE = 80
const RCS_SPAWN_RATE = 40

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

  private readonly thrustEmitter: ParticleEmitter
  private readonly brakeEmitter: ParticleEmitter
  private readonly rcsEmitter: ParticleEmitter
  private thrustSpawnAccumulator = 0
  private brakeSpawnAccumulator = 0
  private rcsSpawnAccumulator = 0
  private readonly shuttle: ShuttleController

  constructor(shuttle: ShuttleController) {
    this.shuttle = shuttle

    this.thrustEmitter = new ParticleEmitter({
      poolSize: 300,
      color: new THREE.Color(0xff8800),
      size: 4,
      lifetime: 0.3,
      spread: 3,
    })

    this.brakeEmitter = new ParticleEmitter({
      poolSize: 300,
      color: new THREE.Color(0x4488ff),
      size: 4,
      lifetime: 0.3,
      spread: 5,
    })

    this.rcsEmitter = new ParticleEmitter({
      poolSize: 50,
      color: new THREE.Color(0xccddff),
      size: 2,
      lifetime: 0.2,
      spread: 1.5,
    })

    this.thrustPoints = this.thrustEmitter.points
    this.brakePoints = this.brakeEmitter.points
    this.rcsPoints = this.rcsEmitter.points
  }

  tick(dt: number): void {
    if (this.shuttle.isThrusting) {
      this.thrustSpawnAccumulator += THRUST_SPAWN_RATE * dt
      while (this.thrustSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        const worldPos = nozzle.clone().applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const pushDir = new THREE.Vector3(-PUSH_FORCE, 0, 0)
          .applyQuaternion(this.shuttle.group.quaternion)
        this.thrustEmitter.emit(worldPos, pushDir)
        this.thrustSpawnAccumulator -= 1
      }
    } else {
      this.thrustSpawnAccumulator = 0
    }

    if (this.shuttle.isBraking) {
      this.brakeSpawnAccumulator += BRAKE_SPAWN_RATE * dt
      while (this.brakeSpawnAccumulator >= 1) {
        const nozzle = NOZZLE_OFFSETS[Math.floor(Math.random() * NOZZLE_OFFSETS.length)]!
        const worldPos = nozzle.clone().applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const pushDir = new THREE.Vector3(-PUSH_FORCE, 0, 0)
          .applyQuaternion(this.shuttle.group.quaternion)
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
        const worldPos = wingtip.clone().applyQuaternion(this.shuttle.group.quaternion)
          .add(this.shuttle.position)
        const push = isYawingLeft
          ? new THREE.Vector3(0, 0, RCS_PUSH_FORCE)
          : new THREE.Vector3(0, 0, -RCS_PUSH_FORCE)
        const worldPush = push.applyQuaternion(this.shuttle.group.quaternion)
        this.rcsEmitter.emit(worldPos, worldPush)
        this.rcsSpawnAccumulator -= 1
      }
    } else {
      this.rcsSpawnAccumulator = 0
    }

    this.thrustEmitter.tick(dt)
    this.brakeEmitter.tick(dt)
    this.rcsEmitter.tick(dt)
  }

  dispose(): void {
    this.thrustEmitter.dispose()
    this.brakeEmitter.dispose()
    this.rcsEmitter.dispose()
  }
}
