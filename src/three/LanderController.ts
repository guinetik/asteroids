/**
 * Controls the lunar lander model — loading, movement, and thruster physics.
 * Simplified flight model for flat-grid testing (no gravity wells).
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { SpaceTimeGrid } from './SpaceTimeGrid'
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
import { loadGLB } from './loadGLB'

const LANDER_MODEL_PATH = '/models/lander.glb'

/** Lander model scale — adjust to match game units */
const MODEL_SCALE = 5

const THRUST_FORCE = 10
const BRAKE_FACTOR = 0.94
const YAW_TORQUE = 2.5
const YAW_LATERAL_FORCE = 2
const YAW_MAX_SPEED = 3.5
const YAW_DAMPING = 0.98
const MAX_THRUST_SPEED = 50

/**
 * Controls the lunar lander model — loading, movement, and thruster physics.
 * Implements Tickable for per-frame physics and animation updates.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class LanderController implements Tickable {
  readonly group = new THREE.Group()

  private velocity = new THREE.Vector3()
  private angularVelocity = 0
  private readonly inputManager: InputManager
  private spaceTimeGrid: SpaceTimeGrid | null = null
  readonly thrusterSystem = new ThrusterSystem()

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager
  }

  setSpaceTimeGrid(grid: SpaceTimeGrid): void {
    this.spaceTimeGrid = grid
  }

  async load(): Promise<void> {
    const scene = await loadGLB(LANDER_MODEL_PATH)
    scene.scale.setScalar(MODEL_SCALE)
    this.group.add(scene)
  }

  get position(): THREE.Vector3 {
    return this.group.position
  }

  get isThrusting(): boolean {
    return this.inputManager.isActionActive('thrust') && this.thrusterSystem.canFire('thrust')
  }

  get isBraking(): boolean {
    return this.inputManager.isActionActive('brake') && this.thrusterSystem.canFire('brake')
  }

  get isYawingLeft(): boolean {
    return this.inputManager.isActionActive('yawLeft') && this.thrusterSystem.canFire('rcs')
  }

  get isYawingRight(): boolean {
    return this.inputManager.isActionActive('yawRight') && this.thrusterSystem.canFire('rcs')
  }

  get speed(): number {
    return this.velocity.length()
  }

  get heading(): number {
    return this.group.rotation.y
  }

  tick(dt: number): void {
    this.updateMovement(dt)
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  private updateMovement(dt: number): void {
    // Yaw (A/D)
    if (this.isYawingLeft) {
      this.angularVelocity += YAW_TORQUE * dt
    }
    if (this.isYawingRight) {
      this.angularVelocity -= YAW_TORQUE * dt
    }

    this.angularVelocity *= YAW_DAMPING
    this.angularVelocity = Math.max(-YAW_MAX_SPEED, Math.min(YAW_MAX_SPEED, this.angularVelocity))
    this.group.rotateY(this.angularVelocity * dt)

    // RCS lateral push
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion)
    right.y = 0
    right.normalize()
    if (this.isYawingLeft) {
      this.velocity.addScaledVector(right, -YAW_LATERAL_FORCE * dt)
    }
    if (this.isYawingRight) {
      this.velocity.addScaledVector(right, YAW_LATERAL_FORCE * dt)
    }

    // Thrust (W)
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.group.quaternion)
    forward.y = 0
    forward.normalize()
    if (this.isThrusting) {
      this.velocity.addScaledVector(forward, THRUST_FORCE * dt)
    }

    // Brake (S)
    if (this.isBraking) {
      this.velocity.multiplyScalar(BRAKE_FACTOR)
    }

    // Lock to XZ plane
    this.velocity.y = 0

    // Clamp speed
    const currentSpeed = this.velocity.length()
    if (currentSpeed > MAX_THRUST_SPEED) {
      this.velocity.setLength(MAX_THRUST_SPEED)
    }

    // Apply velocity
    this.group.position.addScaledVector(this.velocity, dt)
    if (this.spaceTimeGrid) {
      this.group.position.y = -this.spaceTimeGrid.getDepthAt(
        this.group.position.x,
        this.group.position.z,
      )
    } else {
      this.group.position.y = 0
    }

    this.thrusterSystem.tick(dt, {
      thrust: this.isThrusting,
      brake: this.isBraking,
      rcs: this.isYawingLeft || this.isYawingRight,
    })
  }
}
