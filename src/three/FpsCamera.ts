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
/**
 * How much terrain tilt feeds into camera (0 = none, 1 = full).
 *
 * Set to 0 by the FPS perf-fixes pass — coupling the camera to the player
 * group's terrain tilt was contributing to the disorienting "weird walking
 * on uneven terrain" feel. The bob/roll wobble fed by `setVelocity` covers
 * the motion-feedback need without reading the platformer's surface normal.
 *
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
 */
const TERRAIN_TILT_FACTOR = 0
/** How fast terrain tilt lerps (per second). */
const TERRAIN_TILT_LERP_SPEED = 4

/** Helmet light to keep the immediate look direction readable in EVA. */
const HELMET_LIGHT_COLOR = 0xf4f7ff
const HELMET_LIGHT_INTENSITY = 110
/**
 * Halved from 240 in the v4 perf pass. The previous range lit fragments
 * up to 240 units away — well past the player's typical interaction
 * radius — and added per-fragment spotlight cost across that whole cone.
 * 120 still reaches noticeably past the immediate look direction.
 *
 * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v4)
 */
const HELMET_LIGHT_DISTANCE = 120
const HELMET_LIGHT_ANGLE = Math.PI * 0.16
const HELMET_LIGHT_PENUMBRA = 0.9
const HELMET_LIGHT_DECAY = 1.35
const HELMET_LIGHT_X_OFFSET = -0.18
const HELMET_LIGHT_Y_OFFSET = 0.22
const HELMET_LIGHT_Z_OFFSET = -0.08
const HELMET_LIGHT_TARGET_DISTANCE = 180
const HELMET_LIGHT_CONE_RADIUS = 20
const HELMET_LIGHT_CONE_LENGTH = 180
const HELMET_LIGHT_CONE_OPACITY = 0.035

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
  readonly helmetLightRig: THREE.Group
  readonly helmetLight: THREE.SpotLight
  readonly helmetLightTarget: THREE.Object3D
  readonly helmetLightCone: THREE.Mesh

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
  private terrainSlope = 0
  private terrainPitch = 0
  private terrainRoll = 0
  private _aiming = false
  private currentFov: number
  private baseFov: number
  private targetFov: number
  private adsZoomSpeed = 8

  constructor(config: FpsCameraConfig) {
    this.config = config
    this.camera = new THREE.PerspectiveCamera(config.fov, 1, 0.01, 5000)
    this.baseFov = config.fov
    this.currentFov = config.fov
    this.targetFov = config.fov
    this.helmetLightRig = new THREE.Group()

    this.helmetLight = new THREE.SpotLight(
      HELMET_LIGHT_COLOR,
      HELMET_LIGHT_INTENSITY,
      HELMET_LIGHT_DISTANCE,
      HELMET_LIGHT_ANGLE,
      HELMET_LIGHT_PENUMBRA,
      HELMET_LIGHT_DECAY,
    )
    this.helmetLight.position.set(
      HELMET_LIGHT_X_OFFSET,
      HELMET_LIGHT_Y_OFFSET,
      HELMET_LIGHT_Z_OFFSET,
    )

    this.helmetLightTarget = new THREE.Object3D()
    this.helmetLightTarget.position.set(0, 0, -HELMET_LIGHT_TARGET_DISTANCE)
    this.helmetLight.target = this.helmetLightTarget

    const coneGeometry = new THREE.CylinderGeometry(
      0,
      HELMET_LIGHT_CONE_RADIUS,
      HELMET_LIGHT_CONE_LENGTH,
      20,
      1,
      true,
    )
    coneGeometry.translate(0, -HELMET_LIGHT_CONE_LENGTH * 0.5, 0)
    const coneMaterial = new THREE.MeshBasicMaterial({
      color: HELMET_LIGHT_COLOR,
      transparent: true,
      opacity: HELMET_LIGHT_CONE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    this.helmetLightCone = new THREE.Mesh(coneGeometry, coneMaterial)
    this.helmetLightCone.position.copy(this.helmetLight.position)
    this.helmetLightCone.renderOrder = 1

    this.helmetLightRig.add(this.helmetLight)
    this.helmetLightRig.add(this.helmetLightTarget)
    this.helmetLightRig.add(this.helmetLightCone)
    this.helmetLightRig.visible = false
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
   * Feed player velocity and terrain info for camera bob and roll wobble.
   *
   * @param lateralSpeed - XZ speed magnitude
   * @param velocityY - Vertical velocity (positive = up)
   * @param terrainSlope - Terrain slope at player position (0 = flat, higher = steeper)
   */
  setVelocity(lateralSpeed: number, velocityY: number, terrainSlope = 0): void {
    this.lateralSpeed = lateralSpeed
    this.verticalVelocity = velocityY
    this.terrainSlope = terrainSlope
  }

  /**
   * Toggle ADS (aim down sights) zoom.
   *
   * @param aiming - Whether player is aiming
   * @param fovMultiplier - FOV multiplier when aiming (e.g. 0.85)
   * @param zoomSpeed - Lerp speed for FOV transition
   */
  setAiming(aiming: boolean, fovMultiplier = 0.85, zoomSpeed = 8): void {
    this._aiming = aiming
    this.targetFov = aiming ? this.baseFov * fovMultiplier : this.baseFov
    this.adsZoomSpeed = zoomSpeed
  }

  /** Update camera aspect ratio on window resize. */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  tick(dt: number): void {
    if (!this.target) return

    // ADS FOV zoom
    if (this.currentFov !== this.targetFov) {
      this.currentFov += (this.targetFov - this.currentFov) * Math.min(1, this.adsZoomSpeed * dt)
      if (Math.abs(this.currentFov - this.targetFov) < 0.01) {
        this.currentFov = this.targetFov
      }
      this.camera.fov = this.currentFov
      this.camera.updateProjectionMatrix()
    }

    // Roll wobble — proportional to speed AND terrain roughness
    // Flat ground = minimal wobble, rough terrain = more wobble
    const slopeFactor = Math.min(1, this.terrainSlope * 3)
    const targetRoll = -Math.sin(this.yaw * 2 + performance.now() * 0.003)
      * this.lateralSpeed * MAX_ROLL_WOBBLE * 0.05 * slopeFactor
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

    // Subtle terrain tilt — lerp toward a fraction of the player's terrain rotation
    const targetTerrainPitch = this.target.rotation.x * TERRAIN_TILT_FACTOR
    const targetTerrainRoll = this.target.rotation.z * TERRAIN_TILT_FACTOR
    this.terrainPitch += (targetTerrainPitch - this.terrainPitch)
      * Math.min(1, TERRAIN_TILT_LERP_SPEED * dt)
    this.terrainRoll += (targetTerrainRoll - this.terrainRoll)
      * Math.min(1, TERRAIN_TILT_LERP_SPEED * dt)

    // Apply yaw + pitch + roll + terrain tilt
    this.euler.set(
      this.pitch + this.terrainPitch,
      this.yaw,
      this.roll + this.terrainRoll,
    )
    this.camera.quaternion.setFromEuler(this.euler)
    this.helmetLightRig.position.copy(this.camera.position)
    this.helmetLightRig.quaternion.copy(this.camera.quaternion)

    const beamDirection = this.helmetLightTarget.position.clone().sub(this.helmetLight.position).normalize()
    this.helmetLightCone.position.copy(this.helmetLight.position)
    this.helmetLightCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDirection)
  }

  dispose(): void {
    this.helmetLight.dispose()
    this.helmetLightCone.geometry.dispose()
    if (Array.isArray(this.helmetLightCone.material)) {
      this.helmetLightCone.material.forEach((m) => m.dispose())
    } else {
      this.helmetLightCone.material.dispose()
    }
  }
}
