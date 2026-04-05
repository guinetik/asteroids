/**
 * Configurable 3rd-person camera that tracks a vehicle.
 *
 * Extracted from SceneManager so each scene can define its own camera
 * behavior. Orbit target stays locked to the vehicle; camera smoothly
 * returns to an idle offset when the mouse is released.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Tickable } from '@/lib/Tickable'

/** Tuning knobs for a vehicle camera. */
export interface VehicleCameraConfig {
  /** 3rd-person offset relative to the vehicle's local space */
  idleOffset: THREE.Vector3
  /** How fast the camera lerps back to idle (units/s) */
  lerpSpeed: number
  /** Seconds of mouse inactivity before returning to idle */
  idleTimeout: number
  /** Camera never goes below this Y */
  minY: number
  /** Perspective FOV in degrees */
  fov: number
  /** Maximum orbit controls zoom distance (0 = unlimited) */
  maxDistance?: number
}

/** Shuttle preset: behind and above, looking at the nose. */
export const SHUTTLE_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-80, 40, 0),
  lerpSpeed: 5,
  idleTimeout: 10,
  minY: 15,
  fov: 60,
}

/** Lander preset: in front (stairs side), higher angle. */
export const LANDER_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(60, 40, 0),
  lerpSpeed: 5,
  idleTimeout: 1.0,
  minY: 5,
  fov: 60,
}

/** Map preset: same proportions as shuttle cam, scaled for ~0.14 unit ship. */
export const MAP_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-0.8, 0.4, 0),
  lerpSpeed: 5,
  idleTimeout: 10,
  minY: -Infinity,
  fov: 60,
}

/** Map death preset: pulls back and up from last shuttle position. */
export const MAP_DEATH_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-3, 2, 0),
  lerpSpeed: 1.5,
  idleTimeout: 0,
  minY: -Infinity,
  fov: 60,
}

/** Map inspect preset: top-down on shuttle for cargo/menu view. */
export const MAP_INSPECT_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(0, 0.5, 0),
  lerpSpeed: 5,
  idleTimeout: 0,
  minY: -Infinity,
  fov: 50,
  maxDistance: 1,
}

/** Map orbit preset: pulled back above planet to show full orbit circle. */
export const MAP_ORBIT_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(0, 10, 0),
  lerpSpeed: 2,
  idleTimeout: 999,
  minY: 1,
  fov: 60,
  maxDistance: 15,
}

/**
 * 3rd-person camera that tracks a vehicle with orbit controls.
 * Mouse interaction overrides the idle position; releasing the mouse
 * smoothly returns the camera to its configured offset.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class VehicleCamera implements Tickable {
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls

  private config: VehicleCameraConfig
  private target: THREE.Object3D | null = null
  private mouseIdleTimer = 0
  private isMouseActive = false
  private lastTargetPos = new THREE.Vector3()

  constructor(config: VehicleCameraConfig, domElement: HTMLElement) {
    this.config = config

    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 50000)

    this.controls = new OrbitControls(this.camera, domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.1

    this.controls.addEventListener('start', this.onControlStart)
    this.controls.addEventListener('end', this.onControlEnd)
  }

  /** Set the vehicle to track. Snaps camera to idle position immediately. */
  setTarget(object: THREE.Object3D): void {
    this.target = object
    this.lastTargetPos.copy(object.position)
    this.controls.target.copy(object.position)

    const idleOffset = this.config.idleOffset.clone().applyQuaternion(object.quaternion)
    this.camera.position.copy(object.position).add(idleOffset)
    this.camera.position.y = Math.max(this.camera.position.y, this.config.minY)
  }

  /** Update aspect ratio on resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Transition to a new camera config. Resets idle timer so the offset lerps immediately. */
  setConfig(config: VehicleCameraConfig): void {
    this.config = config
    this.camera.fov = config.fov
    this.camera.updateProjectionMatrix()
    this.controls.maxDistance = config.maxDistance ?? Infinity
    // Force idle lerp to start immediately
    this.mouseIdleTimer = config.idleTimeout + 1
    this.isMouseActive = false
  }

  tick(dt: number): void {
    if (!this.target) return

    const targetPos = this.target.position

    // Track vehicle movement delta
    const delta = targetPos.clone().sub(this.lastTargetPos)
    this.lastTargetPos.copy(targetPos)

    // Keep orbit target on the vehicle
    this.controls.target.copy(targetPos)

    // Move camera by the same delta
    this.camera.position.add(delta)

    // Return to idle offset when mouse is released
    if (!this.isMouseActive) {
      this.mouseIdleTimer += dt

      if (this.mouseIdleTimer > this.config.idleTimeout) {
        const idleOffset = this.config.idleOffset.clone()
          .applyQuaternion(this.target.quaternion)
        const targetCamPos = targetPos.clone().add(idleOffset)
        targetCamPos.y = Math.max(targetCamPos.y, this.config.minY)

        this.camera.position.lerp(targetCamPos, this.config.lerpSpeed * dt)
      }
    }

    // Always clamp
    if (this.camera.position.y < this.config.minY) {
      this.camera.position.y = this.config.minY
    }

    this.controls.update()
  }

  dispose(): void {
    this.controls.removeEventListener('start', this.onControlStart)
    this.controls.removeEventListener('end', this.onControlEnd)
    this.controls.dispose()
  }

  private onControlStart = (): void => {
    this.isMouseActive = true
    this.mouseIdleTimer = 0
  }

  private onControlEnd = (): void => {
    this.isMouseActive = false
    this.mouseIdleTimer = 0
  }
}
