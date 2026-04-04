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

  /** Update camera aspect ratio on window resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  tick(_dt: number): void {
    if (!this.target) return

    // Position at target + eye height
    this.camera.position.set(
      this.target.position.x,
      this.target.position.y + this.config.eyeHeight,
      this.target.position.z,
    )

    // Apply yaw + pitch rotation
    this.euler.set(this.pitch, this.yaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)
  }

  dispose(): void {
    // No event listeners owned — pointer lock managed by ViewController
  }
}
