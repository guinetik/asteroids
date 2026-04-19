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
import type { EvaCollisionResolver } from '@/lib/physics/evaCollisionResolver'
import { FpsCamera, type FpsCameraConfig } from './FpsCamera'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
} from './tronHologramMaterial'

/** Acceleration applied per second of thrust in a single axis (world units / s²). */
const EVA_THRUST_ACCEL = 2.5

/** Hard cap on EVA speed (world units / s). */
const EVA_MAX_SPEED = 4

/** Velocity damping per second while the player is actively thrusting (light — preserves momentum). */
const EVA_ACTIVE_DAMPING = 0.08

/** Velocity damping per second while no thrust input is held (gentle — preserves drift). */
const EVA_IDLE_DAMPING = 0.5

/** Below this speed with no thrust input the controller snaps velocity to zero. */
const EVA_ZERO_VELOCITY_EPSILON = 0.05

/** Body radius (world units) used for sphere-vs-collider resolution. Sized close to the
 * helmet silhouette — larger values (e.g. 0.9) read as correct near the shuttle but hold
 * the player an awkward metre off small props like the satellite POI (~0.9 m long). */
const EVA_BODY_RADIUS = 0.35

/** Maximum distance (world units) from the tether anchor before the line pulls taut. */
const EVA_TETHER_MAX_LENGTH = 60

/** Tether cable color — cyan to match the TRON "our-world" palette. */
const TETHER_COLOR = 0x00e5ff

/** Grid tint for the TRON hologram tether material. */
const TETHER_GRID_TINT = new THREE.Color(0.02, 0.06, 0.09)

/** Suit-local offset for the player-side tether endpoint.
 *  Uses the underside of the suit so the cable hangs from the player's lower body
 *  instead of appearing to sprout from the camera/head. */
const TETHER_PLAYER_ATTACH_LOCAL_OFFSET = new THREE.Vector3(0, -1.05, 0.08)

/** Extra drop applied to the player-side tether attach point while looking down. */
const TETHER_PLAYER_LOOKDOWN_DROP = 0.55

/** Extra backward shift applied while looking down to keep the tether out of the camera frustum. */
const TETHER_PLAYER_LOOKDOWN_BACKSHIFT = 0.32

/** Hidden guide point behind the player used as the visible end of the rope in first person. */
const TETHER_PLAYER_GUIDE_LOCAL_OFFSET = new THREE.Vector3(0, -1.28, 0.86)

/** Extra guide-point drop while looking down. */
const TETHER_PLAYER_GUIDE_LOOKDOWN_DROP = 0.2

/** Extra guide-point backshift while looking down. */
const TETHER_PLAYER_GUIDE_LOOKDOWN_BACKSHIFT = 0.24

/** Hide the final rope segments nearest the camera and end the visible tether at the guide point. */
const TETHER_RENDER_HIDDEN_SEGMENTS = 3

/** Radius of the tether tube (world units). */
const TETHER_RADIUS = 0.02

/** Number of segments along the tether curve. */
const TETHER_SEGMENTS = 32

/** Radial divisions around the tube. */
const TETHER_RADIAL_SEGMENTS = 8

/** Minimal slack ratio preserved even while the rope is almost fully taut. */
const TETHER_MIN_SLACK_RATIO = 0.015

/** Extra slack added when the player has room to drift before the tether goes taut. */
const TETHER_MAX_SLACK_RATIO = 0.05

/** Verlet substeps used to keep the rope stable. */
const TETHER_SIMULATION_SUBSTEPS = 2

/** Constraint solver iterations per frame for the rope segments. */
const TETHER_CONSTRAINT_ITERATIONS = 10

/** Mild drag so the rope settles instead of vibrating forever. */
const TETHER_POINT_DAMPING = 0.985

/** How much player-end motion feeds into the rope as a soft traveling wave. */
const TETHER_PLAYER_MOTION_COUPLING = 0.16

/** Damp the injected endpoint motion so the rope stays calm and EVA-like. */
const TETHER_PLAYER_MOTION_DAMPING = 0.72

/** Local shuttle-space offset where the tether attaches on the shuttle underside. */
const TETHER_ANCHOR_LOCAL_OFFSET = new THREE.Vector3(0, -1.15, 0.55)

/** Spring stiffness applied once the player passes {@link EVA_TETHER_MAX_LENGTH}. */
const TETHER_SPRING_K = 120

/** Extra non-linear spring force as the tether stretches farther past max range. */
const TETHER_OVERSHOOT_BOOST = 8

/** Converts outward velocity into an immediate inward yank once the tether goes taut. */
const TETHER_OUTWARD_PULL = 1.35

/** Extra velocity damping along the tether axis while the cable is taut. */
const TETHER_TAUT_DAMPING = 9

/** Fraction of tether length the cable is allowed to stretch before a hard stop. */
const TETHER_HARD_STOP_OVERSHOOT = 0.1

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
  private readonly tetherPreviousPoints: THREE.Vector3[]
  private readonly ropeSegmentLengths: number[]
  private readonly forwardVec = new THREE.Vector3()
  private readonly rightVec = new THREE.Vector3()
  private readonly upVec = new THREE.Vector3(0, 1, 0)
  private readonly thrustDir = new THREE.Vector3()
  private readonly playerAttachWorld = new THREE.Vector3()
  private readonly playerAttachLocal = new THREE.Vector3()
  private readonly playerLookDownOffset = new THREE.Vector3()
  private readonly playerAttachOffsetWorld = new THREE.Vector3()
  private readonly playerGuideWorld = new THREE.Vector3()
  private readonly playerGuideLocal = new THREE.Vector3()
  private readonly playerGuideLookDownOffset = new THREE.Vector3()
  private readonly playerGuideOffsetWorld = new THREE.Vector3()
  private readonly ropeDelta = new THREE.Vector3()
  private readonly ropeVelocity = new THREE.Vector3()
  private readonly ropeDirection = new THREE.Vector3()
  private readonly playerAttachEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly playerAttachQuat = new THREE.Quaternion()
  private readonly previousPlayerAttachWorld = new THREE.Vector3()
  private readonly playerAttachDelta = new THREE.Vector3()

  private anchor: THREE.Object3D | null = null
  private input: InputManager | null = null
  private collisionResolver: EvaCollisionResolver | null = null
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
    this.tetherPreviousPoints = []
    this.ropeSegmentLengths = new Array(TETHER_SEGMENTS).fill(0)
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      this.tetherCurvePoints.push(new THREE.Vector3())
      this.tetherPreviousPoints.push(new THREE.Vector3())
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

  /** Player-side tether endpoint attached in camera-local suit space. */
  private getPlayerAttachWorld(): THREE.Vector3 {
    const lookDownFactor = THREE.MathUtils.clamp(
      -this.fpsCamera.pitch / EVA_CAMERA_CONFIG.pitchClamp,
      0,
      1,
    )
    this.playerLookDownOffset.set(
      0,
      -TETHER_PLAYER_LOOKDOWN_DROP * lookDownFactor,
      TETHER_PLAYER_LOOKDOWN_BACKSHIFT * lookDownFactor,
    )
    this.playerAttachLocal
      .copy(TETHER_PLAYER_ATTACH_LOCAL_OFFSET)
      .add(this.playerLookDownOffset)

    this.playerAttachEuler.set(0, this.fpsCamera.yaw, 0)
    this.playerAttachQuat.setFromEuler(this.playerAttachEuler)
    this.playerAttachOffsetWorld
      .copy(this.playerAttachLocal)
      .applyQuaternion(this.playerAttachQuat)
    return this.playerAttachWorld
      .copy(this.group.position)
      .add(this.playerAttachOffsetWorld)
  }

  /** Hidden guide point behind the player used as the visible rope end in first person. */
  private getPlayerGuideWorld(): THREE.Vector3 {
    const lookDownFactor = THREE.MathUtils.clamp(
      -this.fpsCamera.pitch / EVA_CAMERA_CONFIG.pitchClamp,
      0,
      1,
    )
    this.playerGuideLookDownOffset.set(
      0,
      -TETHER_PLAYER_GUIDE_LOOKDOWN_DROP * lookDownFactor,
      TETHER_PLAYER_GUIDE_LOOKDOWN_BACKSHIFT * lookDownFactor,
    )
    this.playerGuideLocal
      .copy(TETHER_PLAYER_GUIDE_LOCAL_OFFSET)
      .add(this.playerGuideLookDownOffset)

    this.playerAttachEuler.set(0, this.fpsCamera.yaw, 0)
    this.playerAttachQuat.setFromEuler(this.playerAttachEuler)
    this.playerGuideOffsetWorld
      .copy(this.playerGuideLocal)
      .applyQuaternion(this.playerAttachQuat)
    return this.playerGuideWorld
      .copy(this.group.position)
      .add(this.playerGuideOffsetWorld)
  }

  /** Provide the input manager that supplies EVA action state. */
  setInput(input: InputManager): void {
    this.input = input
  }

  /** Set the tether anchor (typically the shuttle group). */
  setAnchor(anchor: THREE.Object3D | null): void {
    this.anchor = anchor
  }

  /**
   * Supply a 3D sphere-vs-collider resolver so the player bounces off the shuttle and
   * mission POIs instead of floating through them. Null disables collision.
   */
  setCollisionResolver(resolver: EvaCollisionResolver | null): void {
    this.collisionResolver = resolver
  }

  /** Teleport the EVA body to a world-space position and zero velocity. */
  setPosition(pos: THREE.Vector3): void {
    this.group.position.copy(pos)
    this.velocity.set(0, 0, 0)
    if (this.anchor) this.anchor.updateMatrixWorld(true)
    this.resetTether()
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

    if (this.collisionResolver) {
      this.collisionResolver.resolveSphere(this.group.position, EVA_BODY_RADIUS, this.velocity)
    }

    const anchorPos = this.getAnchorWorld()
    if (anchorPos) {
      const dx = this.group.position.x - anchorPos.x
      const dy = this.group.position.y - anchorPos.y
      const dz = this.group.position.z - anchorPos.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > EVA_TETHER_MAX_LENGTH && dist > 0) {
        const overshoot = dist - EVA_TETHER_MAX_LENGTH
        const overshootRatio = overshoot / EVA_TETHER_MAX_LENGTH
        const nx = dx / dist
        const ny = dy / dist
        const nz = dz / dist
        const outwardVel = this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz
        const springAccel =
          TETHER_SPRING_K * overshoot * (1 + overshootRatio * TETHER_OVERSHOOT_BOOST)
        this.velocity.x -= nx * springAccel * dt
        this.velocity.y -= ny * springAccel * dt
        this.velocity.z -= nz * springAccel * dt
        if (outwardVel > 0) {
          const yank = outwardVel * TETHER_OUTWARD_PULL
          this.velocity.x -= nx * yank
          this.velocity.y -= ny * yank
          this.velocity.z -= nz * yank
          const damp = Math.min(1, TETHER_TAUT_DAMPING * dt)
          const postYankOutwardVel =
            this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz
          if (postYankOutwardVel > 0) {
            this.velocity.x -= nx * postYankOutwardVel * damp
            this.velocity.y -= ny * postYankOutwardVel * damp
            this.velocity.z -= nz * postYankOutwardVel * damp
          }
        }
        if (overshoot > EVA_TETHER_MAX_LENGTH * TETHER_HARD_STOP_OVERSHOOT) {
          const scale =
            (EVA_TETHER_MAX_LENGTH * (1 + TETHER_HARD_STOP_OVERSHOOT)) / dist
          this.group.position.set(
            anchorPos.x + dx * scale,
            anchorPos.y + dy * scale,
            anchorPos.z + dz * scale,
          )
          const clampedOutwardVel =
            this.velocity.x * nx + this.velocity.y * ny + this.velocity.z * nz
          if (clampedOutwardVel > 0) {
            this.velocity.x -= nx * clampedOutwardVel
            this.velocity.y -= ny * clampedOutwardVel
            this.velocity.z -= nz * clampedOutwardVel
          }
        }
      }
    }

    this.updateTether(dt)
  }

  private resetTether(): void {
    const a = this.getAnchorWorld()
    if (!a) return
    const b = this.getPlayerAttachWorld()
    this.previousPlayerAttachWorld.copy(b)
    for (let i = 0; i <= TETHER_SEGMENTS; i++) {
      const t = i / TETHER_SEGMENTS
      const pt = this.tetherCurvePoints[i]
      const prev = this.tetherPreviousPoints[i]
      if (!pt || !prev) continue
      pt.lerpVectors(a, b, t)
      prev.copy(pt)
    }
    this.rebuildTetherGeometry()
  }

  private updateTether(dt: number): void {
    const a = this.getAnchorWorld()
    if (!a) return
    const b = this.getPlayerAttachWorld()
    const pointCount = this.tetherCurvePoints.length
    if (pointCount < 2) return

    this.ropeDelta.subVectors(b, a)
    const distance = this.ropeDelta.length()
    if (distance <= 1e-5) {
      this.resetTether()
      return
    }

    const tautRatio = THREE.MathUtils.clamp(distance / EVA_TETHER_MAX_LENGTH, 0, 1)
    const slackRatio = THREE.MathUtils.lerp(TETHER_MAX_SLACK_RATIO, TETHER_MIN_SLACK_RATIO, tautRatio)
    const ropeLength = distance * (1 + slackRatio)
    const segmentLength = ropeLength / TETHER_SEGMENTS
    this.ropeSegmentLengths.fill(segmentLength)
    this.playerAttachDelta
      .subVectors(b, this.previousPlayerAttachWorld)
      .multiplyScalar(TETHER_PLAYER_MOTION_DAMPING)
    this.previousPlayerAttachWorld.copy(b)

    const substepDt = dt / TETHER_SIMULATION_SUBSTEPS
    for (let step = 0; step < TETHER_SIMULATION_SUBSTEPS; step++) {
      for (let i = 1; i < pointCount - 1; i++) {
        const pt = this.tetherCurvePoints[i]
        const prev = this.tetherPreviousPoints[i]
        if (!pt || !prev) continue

        this.ropeVelocity.subVectors(pt, prev).multiplyScalar(TETHER_POINT_DAMPING)
        prev.copy(pt)
        pt.add(this.ropeVelocity)

        const t = i / TETHER_SEGMENTS
        const playerInfluence = Math.pow(t, 2.2) * (1 - tautRatio * 0.35)
        if (playerInfluence > 0.0001) {
          pt.addScaledVector(
            this.playerAttachDelta,
            playerInfluence * TETHER_PLAYER_MOTION_COUPLING,
          )
        }
      }

      for (let iter = 0; iter < TETHER_CONSTRAINT_ITERATIONS; iter++) {
        this.tetherCurvePoints[0]?.copy(a)
        this.tetherCurvePoints[pointCount - 1]?.copy(b)

        for (let i = 0; i < pointCount - 1; i++) {
          const current = this.tetherCurvePoints[i]
          const next = this.tetherCurvePoints[i + 1]
          if (!current || !next) continue

          this.ropeDelta.subVectors(next, current)
          const currentDistance = this.ropeDelta.length()
          if (currentDistance <= 1e-5) continue

          const targetLength = this.ropeSegmentLengths[i] ?? segmentLength
          const error = currentDistance - targetLength
          if (Math.abs(error) <= 1e-4) continue

          const correctionScale = error / currentDistance
          if (i === 0) {
            next.addScaledVector(this.ropeDelta, -correctionScale)
          } else if (i === pointCount - 2) {
            current.addScaledVector(this.ropeDelta, correctionScale)
          } else {
            current.addScaledVector(this.ropeDelta, correctionScale * 0.5)
            next.addScaledVector(this.ropeDelta, -correctionScale * 0.5)
          }
        }
      }
    }

    this.ropeDirection.subVectors(b, a).normalize()
    this.tetherCurvePoints[0]?.copy(a)
    this.tetherCurvePoints[pointCount - 1]?.copy(b)
    this.rebuildTetherGeometry()
  }

  private rebuildTetherGeometry(): void {
    const visibleEnd = this.getPlayerGuideWorld()
    const visiblePointCount = Math.max(2, this.tetherCurvePoints.length - TETHER_RENDER_HIDDEN_SEGMENTS)
    const renderPoints = this.tetherCurvePoints
      .slice(0, visiblePointCount)
      .map((pt) => pt.clone())
    renderPoints[renderPoints.length - 1] = visibleEnd.clone()

    const curve = new THREE.CatmullRomCurve3(renderPoints)
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
