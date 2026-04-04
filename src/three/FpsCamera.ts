/**
 * Pointer-lock first-person camera.
 * Attaches to a target Object3D at eye height. Mouse deltas
 * drive yaw (rotates target) and pitch (tilts camera).
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

/** Maximum roll wobble from lateral movement (radians). */
const MAX_ROLL_WOBBLE = 0.04
/** How fast roll wobble lerps toward target (per second). */
const ROLL_LERP_SPEED = 6
/** Vertical bob amplitude from Y velocity (units per unit velocity). */
const BOB_AMPLITUDE = 0.08
/** How fast bob lerps (per second). */
const BOB_LERP_SPEED = 8

/** Tuning knobs for the FPS camera. */
export interface FpsCameraConfig {
  /** Vertical offset above player origin (meters). */
  eyeHeight: number
  /** Mouse sensitivity multiplier for raw deltas. */
  sensitivity: number
  /** Maximum pitch angle in radians (default ~85deg). */
  pitchClamp: number
  /** Perspective field of view in degrees. */
  fov: number
}

/**
 * First-person camera with pointer-lock mouse look.
 * Call {@link applyMouseDelta} from a mousemove listener,
 * then {@link tick} each frame to update position/rotation.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsCamera implements Tickable {
  readonly camera: THREE.PerspectiveCamera

  /** Current yaw angle in radians (horizontal rotation). */
  yaw = 0
  /** Current pitch angle in radians (vertical look). */
  pitch = 0

  private readonly config: FpsCameraConfig
  private target: THREE.Object3D | null = null
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private roll = 0
  private bobOffset = 0
  private lateralSpeed = 0
  private verticalVelocity = 0

  constructor(config: FpsCameraConfig) {
    this.config = config
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 5000)
  }

  /** Set the player entity to follow. */
  setTarget(target: THREE.Object3D): void {
    this.target = target
  }

  /**
   * Feed raw pointer-lock mouse deltas.
   *
   * @param dx - Horizontal mouse movement (pixels)
   * @param dy - Vertical mouse movement (pixels)
   */
  applyMouseDelta(dx: number, dy: number): void {
    this.yaw -= dx * this.config.sensitivity
    this.pitch -= dy * this.config.sensitivity
    this.pitch = Math.max(
      -this.config.pitchClamp,
      Math.min(this.config.pitchClamp, this.pitch),
    )
  }

  /** Forward direction on the XZ plane (pitch stripped). */
  getForwardXZ(): THREE.Vector2 {
    return new THREE.Vector2(
      -Math.sin(this.yaw),
      -Math.cos(this.yaw),
    ).normalize()
  }

  /** Right direction on the XZ plane. */
  getRightXZ(): THREE.Vector2 {
    return new THREE.Vector2(
      Math.cos(this.yaw),
      -Math.sin(this.yaw),
    ).normalize()
  }

  /**
   * Feed player velocity for camera bob and roll wobble.
   *
   * @param lateralSpeed - XZ speed magnitude
   * @param velocityY - Vertical velocity (positive = up)
   */
  setVelocity(lateralSpeed: number, velocityY: number): void {
    this.lateralSpeed = lateralSpeed
    this.verticalVelocity = velocityY
  }

  /** Update camera aspect ratio on window resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  tick(dt: number): void {
    if (!this.target) return

    // Roll wobble from lateral speed — lean into movement
    const targetRoll = -Math.sin(this.yaw * 2 + performance.now() * 0.003)
      * this.lateralSpeed * MAX_ROLL_WOBBLE * 0.05
    this.roll += (targetRoll - this.roll) * Math.min(1, ROLL_LERP_SPEED * dt)

    // Vertical bob from Y velocity — camera dips/rises with hops
    const targetBob = this.verticalVelocity * BOB_AMPLITUDE
    this.bobOffset += (targetBob - this.bobOffset) * Math.min(1, BOB_LERP_SPEED * dt)

    // Position at target + eye height + bob
    this.camera.position.set(
      this.target.position.x,
      this.target.position.y + this.config.eyeHeight + this.bobOffset,
      this.target.position.z,
    )

    // Apply yaw + pitch + roll rotation
    this.euler.set(this.pitch, this.yaw, this.roll)
    this.camera.quaternion.setFromEuler(this.euler)
  }

  dispose(): void {
    // No event listeners owned — pointer lock managed by ViewController
  }
}
