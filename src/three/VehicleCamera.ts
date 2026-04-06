/**
 * Configurable 3rd-person camera that tracks a vehicle.
 *
 * Extracted from SceneManager so each scene can define its own camera
 * behavior. Orbit target stays locked to the vehicle; in free flight,
 * ship yaw swings the camera offset so the view turns with heading (optional).
 * After idle time without orbit-drag the camera eases to the default chase offset.
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
  /**
   * Seconds without orbit-drag before lerping to the default {@link idleOffset} chase framing.
   * While below this threshold, manual orbit angle is kept; ship-yaw coupling is controlled by
   * {@link VehicleCamera.setShipYawCoupling}.
   * Use `0` to always use chase framing whenever not dragging.
   */
  idleTimeout: number
  /** Camera never goes below this Y */
  minY: number
  /** Perspective FOV in degrees */
  fov: number
  /** Maximum orbit controls zoom distance (0 = unlimited) */
  maxDistance?: number
}

/**
 * After orbit-drag ends, wait this many seconds (camera-only idle) before easing back to
 * default behind-ship framing. Ship yaw still swings the view during this window.
 */
const SHUTTLE_MAP_CHASE_RETURN_IDLE_SECONDS = 10

/**
 * Map hub free flight: return to default chase sooner than the full shuttle scene so manual
 * orbit does not fight thrust for as long while driving.
 */
const MAP_FREE_FLIGHT_CAMERA_CHASE_IDLE_SECONDS = 3

/** Shuttle preset: behind and above, looking at the nose. */
export const SHUTTLE_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new THREE.Vector3(-80, 40, 0),
  lerpSpeed: 5,
  idleTimeout: SHUTTLE_MAP_CHASE_RETURN_IDLE_SECONDS,
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
  idleTimeout: MAP_FREE_FLIGHT_CAMERA_CHASE_IDLE_SECONDS,
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
  idleOffset: new THREE.Vector3(0, 0.25, 0),
  lerpSpeed: 5,
  idleTimeout: 0,
  minY: -Infinity,
  fov: 40,
  maxDistance: 0.5,
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
 * Manual orbit is kept until the player stops dragging for {@link VehicleCameraConfig.idleTimeout}
 * seconds, then the camera eases to the default chase offset. When {@link setShipYawCoupling} is
 * enabled (default), the camera–target offset rotates with the target's full orientation delta each
 * frame (not only Euler Y), matching chase framing. Orbit drag inertia is cleared on pointer end so
 * damped azimuth/polar deltas do not keep drifting while the ship accelerates.
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
  /** Previous target orientation — drives camera-offset rotation when coupling is on. */
  private readonly lastTargetQuat = new THREE.Quaternion()
  private readonly quatDeltaScratch = new THREE.Quaternion()
  private readonly quatInvScratch = new THREE.Quaternion()
  private readonly scratchOffset = new THREE.Vector3()
  private readonly frameDelta = new THREE.Vector3()
  /**
   * When true, ship Y rotation swings the camera–target offset (e.g. free flight).
   * When false, yaw changes are absorbed so manual orbit framing is unchanged (e.g. planet orbit).
   */
  private shipYawCouplingEnabled = true

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
    this.lastTargetQuat.copy(object.quaternion)
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

  /**
   * Enables or disables rotating the camera offset with the target’s orientation each frame.
   *
   * @param enabled - `true` for driving/free flight; `false` when the scene pins the view
   *   (e.g. planetary orbit so A/D only aims the shuttle).
   */
  setShipYawCoupling(enabled: boolean): void {
    this.shipYawCouplingEnabled = enabled
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
    if (this.target) {
      this.lastTargetQuat.copy(this.target.quaternion)
    }
  }

  /**
   * Applies orbit/zoom/FOV tuning without resetting manual orbit-drag state.
   *
   * Used when a value (e.g. slingshot charge) updates every frame: a full {@link setConfig} would
   * clear `isMouseActive` and force the chase lerp, which fights OrbitControls pitch and feels
   * like vertical look is disabled.
   *
   * @param config - New tuning values; {@link idleOffset} and {@link idleTimeout} still affect
   *   chase behavior when the player is not dragging, but ongoing drags are preserved.
   */
  applyConfigTuning(config: VehicleCameraConfig): void {
    this.config = config
    this.camera.fov = config.fov
    this.camera.updateProjectionMatrix()
    this.controls.maxDistance = config.maxDistance ?? Infinity
  }

  tick(dt: number): void {
    if (!this.target) return

    const targetPos = this.target.position

    // Track vehicle movement delta
    this.frameDelta.subVectors(targetPos, this.lastTargetPos)
    this.lastTargetPos.copy(targetPos)

    // Keep orbit target on the vehicle
    this.controls.target.copy(targetPos)

    // Move camera by the same delta
    this.camera.position.add(this.frameDelta)

    // Optionally rotate camera–target offset with the target’s orientation delta (e.g. free
    // flight). Euler-Y–only rotation diverges from chase framing that uses the full quaternion.
    const q = this.target.quaternion
    if (this.shipYawCouplingEnabled) {
      this.quatInvScratch.copy(this.lastTargetQuat).invert()
      this.quatDeltaScratch.copy(q).multiply(this.quatInvScratch)
      this.scratchOffset.copy(this.camera.position).sub(targetPos)
      this.scratchOffset.applyQuaternion(this.quatDeltaScratch)
      this.camera.position.copy(targetPos).add(this.scratchOffset)
    }
    this.lastTargetQuat.copy(q)

    // After enough time without orbit-drag, ease to default chase framing
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
    this.clearOrbitInternalInertia()
  }

  /**
   * Zeros OrbitControls’ internal damped rotation/pan payloads so post-drag inertia does not keep
   * twisting the view while the vehicle translates.
   */
  private clearOrbitInternalInertia(): void {
    const c = this.controls as unknown as {
      _sphericalDelta: THREE.Spherical
      _panOffset: THREE.Vector3
    }
    c._sphericalDelta.set(0, 0, 0)
    c._panOffset.set(0, 0, 0)
  }
}
