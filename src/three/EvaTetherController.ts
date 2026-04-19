/**
 * Tethered EVA controller for the shuttle scene prototype.
 *
 * Camera-relative 6-DoF thrust (WASD + Space/Shift), zero-g physics with mild
 * damping, and a line-based tether that clamps the player to a configurable
 * anchor (the shuttle). Reuses {@link FpsCamera} for pointer-lock mouse look
 * and helmet lighting; positions/rotates a body Object3D that the camera
 * follows.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import { FpsCamera, type FpsCameraConfig } from './FpsCamera'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
} from './tronHologramMaterial'

/** Acceleration applied per second of thrust in a single axis (world units / s²). */
const EVA_THRUST_ACCEL = 14

/** Hard cap on EVA speed (world units / s). */
const EVA_MAX_SPEED = 16

/** Velocity damping per second while the player is actively thrusting (light — preserves momentum). */
const EVA_ACTIVE_DAMPING = 0.15

/** Velocity damping per second while no thrust input is held (strong — auto-park). */
const EVA_IDLE_DAMPING = 2.5

/** Below this speed with no thrust input the controller snaps velocity to zero. */
const EVA_ZERO_VELOCITY_EPSILON = 0.05

/** Maximum distance (world units) from the tether anchor before the line pulls taut. */
const EVA_TETHER_MAX_LENGTH = 60

/** Tether cable color — cyan to match the TRON "our-world" palette. */
const TETHER_COLOR = 0x00e5ff

/** Grid tint for the TRON hologram tether material. */
const TETHER_GRID_TINT = new THREE.Color(0.02, 0.06, 0.09)

/** World-space offset applied to the tether's player-side endpoint so the cable
 *  appears to attach to the EVA suit's chest instead of the camera eye. */
const TETHER_PLAYER_ATTACH_OFFSET = new THREE.Vector3(0, -0.45, 0)

/** Radius of the tether tube (world units). */
const TETHER_RADIUS = 0.08

/** Number of segments along the tether curve. */
const TETHER_SEGMENTS = 32

/** Radial divisions around the tube. */
const TETHER_RADIAL_SEGMENTS = 8

/** Peak sag displacement applied at the midpoint of the tether curve. */
const TETHER_SAG_AMOUNT = 0.8

/** Local shuttle-space offset where the tether attaches (roughly the cargo-bay rim). */
const TETHER_ANCHOR_LOCAL_OFFSET = new THREE.Vector3(0, 0.4, 1.2)

/** Spring stiffness applied once the player passes {@link EVA_TETHER_MAX_LENGTH}. */
const TETHER_SPRING_K = 55

/** Extra velocity damping along the tether axis while the cable is taut. */
const TETHER_TAUT_DAMPING = 4

/** Fraction of tether length the cable is allowed to stretch before a hard stop. */
const TETHER_HARD_STOP_OVERSHOOT = 0.2

/** O2 tank capacity (arbitrary units — seconds of EVA at full drain). */
const EVA_O2_CAPACITY = 180

/** O2 drained per second just by being in vacuum. */
const EVA_O2_DRAIN_PER_SEC = 1

/** RTG battery capacity (arbitrary units). */
const EVA_RTG_CAPACITY = 100

/** RTG drained per second of continuous thrust input. */
const EVA_RTG_DRAIN_PER_SEC = 6

/** RTG passively recharged per second while no thrust input is active. */
const EVA_RTG_RECHARGE_PER_SEC = 4

/** Default FPS camera tuning for EVA. */
const EVA_CAMERA_CONFIG: FpsCameraConfig = {
  eyeHeight: 0,
  sensitivity: 0.0022,
  pitchClamp: Math.PI / 2 - 0.05,
  fov: 75,
}

/**
 * Camera-tethered EVA body with 6-DoF thruster input and a visible tether line.
 *
 * Add {@link group} to the scene for the player body, {@link tetherLine} for the
 * visible tether, and {@link fpsCamera}.helmetLightRig for the helmet light.
 * Call {@link setAnchor} with the shuttle's Object3D, then register this
 * controller and its {@link fpsCamera} with the tick handler.
 */
export class EvaTetherController implements Tickable {
  /** Player body origin — the camera follows this. */
  readonly group = new THREE.Group()
  /** Pointer-lock first-person camera with helmet light rig. */
  readonly fpsCamera: FpsCamera
  /** Tube mesh that visualizes the tether from the player to the anchor. */
  readonly tetherLine: THREE.Mesh
  /** Current world velocity (exposed for HUD speed readout). */
  readonly velocity = new THREE.Vector3()

  private readonly tetherMaterial: THREE.ShaderMaterial
  private tetherGeometry: THREE.TubeGeometry | null = null
  private readonly tetherCurvePoints: THREE.Vector3[]
  private readonly forwardVec = new THREE.Vector3()
  private readonly rightVec = new THREE.Vector3()
  private readonly upVec = new THREE.Vector3(0, 1, 0)
  private readonly thrustDir = new THREE.Vector3()

  private anchor: THREE.Object3D | null = null
  private input: InputManager | null = null
  private thrusting = false
  private o2 = EVA_O2_CAPACITY
  private rtg = EVA_RTG_CAPACITY

  constructor() {
    this.fpsCamera = new FpsCamera(EVA_CAMERA_CONFIG)
    this.fpsCamera.setTarget(this.group)

    this.tetherMaterial = createTronHologramMaterial({
      color: TETHER_COLOR,
      gridTint: TETHER_GRID_TINT,
    })
    this.tetherMaterial.depthTest = false
    this.tetherMaterial.depthWrite = false
    this.tetherCurvePoints = []
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      this.tetherCurvePoints.push(new THREE.Vector3())
    }

    this.tetherLine = new THREE.Mesh(undefined, this.tetherMaterial)
    this.tetherLine.frustumCulled = false
    this.tetherLine.renderOrder = 999
    const mat = this.tetherMaterial
    this.tetherLine.onBeforeRender = () => {
      syncTronHologramTimeSeconds([mat], performance.now() * 0.001)
    }
  }

  /** World-space anchor point for the tether — shuttle position + local offset. */
  private readonly anchorWorld = new THREE.Vector3()
  private getAnchorWorld(): THREE.Vector3 | null {
    if (!this.anchor) return null
    this.anchor.updateMatrixWorld()
    this.anchorWorld.copy(TETHER_ANCHOR_LOCAL_OFFSET).applyMatrix4(this.anchor.matrixWorld)
    return this.anchorWorld
  }

  /** Provide the input manager that supplies EVA action state. */
  setInput(input: InputManager): void {
    this.input = input
  }

  /** Set the tether anchor (typically the shuttle group). */
  setAnchor(anchor: THREE.Object3D | null): void {
    this.anchor = anchor
  }

  /** Teleport the EVA body to a world-space position and zero velocity. */
  setPosition(pos: THREE.Vector3): void {
    this.group.position.copy(pos)
    this.velocity.set(0, 0, 0)
    if (this.anchor) this.anchor.updateMatrixWorld(true)
    this.updateTether()
  }

  /** Feed raw pointer-lock mouse deltas to the camera. */
  applyMouseDelta(dx: number, dy: number): void {
    this.fpsCamera.applyMouseDelta(dx, dy)
  }

  /** True if any thrust input was active on the last tick (for VFX/HUD). */
  get isThrusting(): boolean {
    return this.thrusting
  }

  /** Current speed magnitude (world units / s). */
  get speed(): number {
    return this.velocity.length()
  }

  /** Yaw angle of the camera in radians (for the HUD compass). */
  get headingRad(): number {
    return this.fpsCamera.yaw
  }

  /** Current O2 level remaining (0..capacity). */
  get o2Level(): number {
    return this.o2
  }

  /** Max O2 tank capacity. */
  get o2Capacity(): number {
    return EVA_O2_CAPACITY
  }

  /** Current RTG charge remaining (0..capacity). */
  get rtgLevel(): number {
    return this.rtg
  }

  /** Max RTG capacity. */
  get rtgCapacity(): number {
    return EVA_RTG_CAPACITY
  }

  /** Reset O2 and RTG to full — call on entering EVA. */
  refillLifeSupport(): void {
    this.o2 = EVA_O2_CAPACITY
    this.rtg = EVA_RTG_CAPACITY
  }

  tick(dt: number): void {
    this.thrusting = false
    this.o2 = Math.max(0, this.o2 - EVA_O2_DRAIN_PER_SEC * dt)
    if (this.input && this.rtg > 0) {
      const yaw = this.fpsCamera.yaw
      const pitch = this.fpsCamera.pitch
      const cp = Math.cos(pitch)
      this.forwardVec.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp)
      this.rightVec.set(Math.cos(yaw), 0, -Math.sin(yaw))

      this.thrustDir.set(0, 0, 0)
      if (this.input.isActionActive('evaForward')) this.thrustDir.add(this.forwardVec)
      if (this.input.isActionActive('evaBack')) this.thrustDir.addScaledVector(this.forwardVec, -1)
      if (this.input.isActionActive('evaStrafeRight')) this.thrustDir.add(this.rightVec)
      if (this.input.isActionActive('evaStrafeLeft')) this.thrustDir.addScaledVector(this.rightVec, -1)
      if (this.input.isActionActive('evaUp')) this.thrustDir.add(this.upVec)
      if (this.input.isActionActive('evaDown')) this.thrustDir.addScaledVector(this.upVec, -1)

      if (this.thrustDir.lengthSq() > 0) {
        this.thrustDir.normalize()
        this.velocity.addScaledVector(this.thrustDir, EVA_THRUST_ACCEL * dt)
        this.thrusting = true
        this.rtg = Math.max(0, this.rtg - EVA_RTG_DRAIN_PER_SEC * dt)
      }
    }
    if (!this.thrusting && this.rtg < EVA_RTG_CAPACITY) {
      this.rtg = Math.min(EVA_RTG_CAPACITY, this.rtg + EVA_RTG_RECHARGE_PER_SEC * dt)
    }

    const dampingRate = this.thrusting ? EVA_ACTIVE_DAMPING : EVA_IDLE_DAMPING
    const dampingFactor = Math.max(0, 1 - dampingRate * dt)
    this.velocity.multiplyScalar(dampingFactor)
    if (!this.thrusting && this.velocity.lengthSq() < EVA_ZERO_VELOCITY_EPSILON * EVA_ZERO_VELOCITY_EPSILON) {
      this.velocity.set(0, 0, 0)
    }

    const maxSpeedSq = EVA_MAX_SPEED * EVA_MAX_SPEED
    if (this.velocity.lengthSq() > maxSpeedSq) {
      this.velocity.setLength(EVA_MAX_SPEED)
    }

    this.group.position.addScaledVector(this.velocity, dt)

    const anchorPos = this.getAnchorWorld()
    if (anchorPos) {
      const dx = this.group.position.x - anchorPos.x
      const dy = this.group.position.y - anchorPos.y
      const dz = this.group.position.z - anchorPos.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > EVA_TETHER_MAX_LENGTH && dist > 0) {
        const overshoot = dist - EVA_TETHER_MAX_LENGTH
        const nx = dx / dist
        const ny = dy / dist
        const nz = dz / dist
        const springAccel = TETHER_SPRING_K * overshoot
        this.velocity.x -= nx * springAccel * dt
        this.velocity.y -= ny * springAccel * dt
        this.velocity.z -= nz * springAccel * dt
        const outwardVel = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz
        if (outwardVel > 0) {
          const damp = Math.min(1, TETHER_TAUT_DAMPING * dt)
          this.velocity.x -= nx * outwardVel * damp
          this.velocity.y -= ny * outwardVel * damp
          this.velocity.z -= nz * outwardVel * damp
        }
        if (overshoot > EVA_TETHER_MAX_LENGTH * TETHER_HARD_STOP_OVERSHOOT) {
          const scale =
            (EVA_TETHER_MAX_LENGTH * (1 + TETHER_HARD_STOP_OVERSHOOT)) / dist
          this.group.position.set(
            anchorPos.x + dx * scale,
            anchorPos.y + dy * scale,
            anchorPos.z + dz * scale,
          )
        }
      }
    }

    this.updateTether()
  }

  private updateTether(): void {
    const a = this.getAnchorWorld()
    if (!a) return
    const bx = this.group.position.x + TETHER_PLAYER_ATTACH_OFFSET.x
    const by = this.group.position.y + TETHER_PLAYER_ATTACH_OFFSET.y
    const bz = this.group.position.z + TETHER_PLAYER_ATTACH_OFFSET.z
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      const t = i / TETHER_SEGMENTS
      const sag = -TETHER_SAG_AMOUNT * Math.sin(Math.PI * t)
      const pt = this.tetherCurvePoints[i]
      if (!pt) continue
      pt.set(
        a.x + (bx - a.x) * t,
        a.y + (by - a.y) * t + sag,
        a.z + (bz - a.z) * t,
      )
    }
    const curve = new THREE.CatmullRomCurve3(this.tetherCurvePoints)
    const next = new THREE.TubeGeometry(
      curve,
      TETHER_SEGMENTS,
      TETHER_RADIUS,
      TETHER_RADIAL_SEGMENTS,
      false,
    )
    if (this.tetherGeometry) this.tetherGeometry.dispose()
    this.tetherGeometry = next
    this.tetherLine.geometry = next
  }

  dispose(): void {
    if (this.tetherGeometry) this.tetherGeometry.dispose()
    disposeTronHologramMaterials([this.tetherMaterial])
  }
}
