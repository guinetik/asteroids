import * as THREE from 'three'
import type { InputManager } from '@/lib/InputManager'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import {
  findNearestGravitySurfRail,
  gravitySurfDirectionFromHeading,
  gravitySurfRailHeading,
  gravitySurfVelocityVector,
  type GravitySurfRailAxis,
  type GravitySurfRailTarget,
} from '@/lib/map/gravitySurfing'
import type { GravitationalEventManager } from '@/lib/physics/gravitationalEvent'
import type { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import type { ShuttleController } from '@/three/ShuttleController'
import { MAP_PHYSICS } from '@/three/ShuttleController'

type GravitySurfState =
  | { mode: 'free' }
  | {
      mode: 'coupling'
      axis: GravitySurfRailAxis
      lineCoord: number
      alongCoord: number
      directionSign: number
      startX: number
      startZ: number
      targetX: number
      targetZ: number
      elapsed: number
      duration: number
    }
  | {
      mode: 'surfing'
      axis: GravitySurfRailAxis
      lineCoord: number
      alongCoord: number
      directionSign: number
      cruiseSpeed: number
      targetCruiseSpeed: number
    }
  | {
      mode: 'decoupling'
      axis: GravitySurfRailAxis
      lineCoord: number
      alongCoord: number
      signedSpeed: number
      useBrakeThruster: boolean
      elapsed: number
      duration: number
    }

export interface GravitySurfingControllerDeps {
  gravitationalEventManager: GravitationalEventManager | null
  gridVisible: boolean
  hasGravitySurfingUnlock: boolean
  inputManager: InputManager | null
  mapGridSize: number
  orbitState: string
  slingshotBurstActive: boolean
  shuttleController: ShuttleController | null
  spaceTimeGrid: SpaceTimeGrid | null
}

/** Minimum shuttle speed to allow gravity surf attachment — prevents ambiguous direction at rest. */
const GRAVITY_SURF_MIN_ATTACH_SPEED = 0.15

function easeInOut01(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1)
  return clamped * clamped * (3 - 2 * clamped)
}

export class GravitySurfingController {
  private state: GravitySurfState = { mode: 'free' }
  private tiltPitch = 0
  private tiltRoll = 0

  /** Emitted each frame during coupling with (shipPos, railPos, progress 0→1). */
  onCouplingProgress:
    | ((shipPosition: THREE.Vector3, railPosition: THREE.Vector3, progress: number, dt: number) => void)
    | null = null

  /** Emitted when coupling starts. */
  onCouplingStart: (() => void) | null = null

  /** Emitted when coupling ends (transitions to surfing or cancelled). */
  onCouplingEnd: (() => void) | null = null

  isActive(): boolean {
    return this.state.mode !== 'free'
  }

  canShowAttachPrompt(deps: GravitySurfingControllerDeps): boolean {
    return this.state.mode === 'free' && this.getRailTarget(deps) !== null
  }

  onGridVisibilityChanged(visible: boolean, deps: GravitySurfingControllerDeps): void {
    if (!visible && this.state.mode !== 'free') {
      this.beginDecoupleInternal(deps, false)
    }
  }

  reset(deps: GravitySurfingControllerDeps): void {
    const shuttle = deps.shuttleController
    this.state = { mode: 'free' }
    this.tiltPitch = 0
    this.tiltRoll = 0
    if (!shuttle) return
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.setExternalBrakeActive(false)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
  }

  requestToggle(deps: GravitySurfingControllerDeps): void {
    if (!deps.inputManager?.wasActionPressed('gravitySurfingToggle')) {
      return
    }
    if (this.state.mode === 'surfing' || this.state.mode === 'coupling') {
      this.beginDecoupleInternal(deps, this.state.mode === 'surfing')
      return
    }
    if (this.state.mode === 'decoupling') {
      return
    }
    const target = this.getRailTarget(deps)
    if (!target) {
      return
    }
    this.beginCoupling(target, deps)
  }

  tick(dt: number, deps: GravitySurfingControllerDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle || this.state.mode === 'free') {
      return
    }

    if (this.state.mode === 'coupling') {
      const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
      const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
      const eased = easeInOut01(t)
      const x = THREE.MathUtils.lerp(this.state.startX, this.state.targetX, eased)
      const z = THREE.MathUtils.lerp(this.state.startZ, this.state.targetZ, eased)
      shuttle.group.position.set(x, 0, z)
      shuttle.group.rotation.y = gravitySurfRailHeading(this.state.axis, this.state.directionSign)
      shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
      this.onCouplingProgress?.(
        shuttle.group.position,
        new THREE.Vector3(this.state.targetX, 0, this.state.targetZ),
        t,
        dt,
      )
      this.state.elapsed = nextElapsed
      if (nextElapsed >= this.state.duration) {
        this.onCouplingEnd?.()
        this.state = {
          mode: 'surfing',
          axis: this.state.axis,
          lineCoord: this.state.lineCoord,
          alongCoord: this.state.axis === 'x' ? shuttle.position.x : shuttle.position.z,
          directionSign: this.state.directionSign,
          cruiseSpeed: 0,
          targetCruiseSpeed:
            this.state.directionSign
            * MAP_PHYSICS.maxThrustSpeed
            * MAP_CONFIG.GRAVITY_SURF_CRUISE_SPEED_MULTIPLIER,
        }
      }
    }

    if (this.state.mode === 'surfing') {
      const brakeActive = this.isBrakeActive(shuttle, deps)
      shuttle.setExternalBrakeActive(brakeActive)
      if (brakeActive) {
        const effectiveBrake = Math.min(
          1,
          MAP_PHYSICS.brakeFactor + Math.abs(shuttle.group.position.y) * MAP_PHYSICS.brakeDepthPenalty,
        )
        const frameScaledBrake = Math.pow(effectiveBrake, dt * 60)
        this.state.cruiseSpeed *= frameScaledBrake
        if (Math.abs(this.state.cruiseSpeed) < MAP_CONFIG.GRAVITY_SURF_STOP_SPEED) {
          this.state.cruiseSpeed = 0
          // At full stop while braking — flip direction and accelerate the other way
          this.state.directionSign *= -1
          this.state.targetCruiseSpeed *= -1
        }
      } else {
        this.state.cruiseSpeed = THREE.MathUtils.damp(
          this.state.cruiseSpeed,
          this.state.targetCruiseSpeed,
          MAP_CONFIG.GRAVITY_SURF_ACCEL_PER_SEC,
          dt,
        )
      }
      shuttle.thrusterSystem.tick(
        dt,
        { thrust: false, brake: brakeActive, rcs: false },
        shuttle.getThrusterRuntimeModifiers(),
      )
      this.state.alongCoord += this.state.cruiseSpeed * dt
      const { x, z } = this.worldPositionFromState(this.state)
      shuttle.group.position.set(x, 0, z)
      shuttle.group.rotation.y = gravitySurfRailHeading(this.state.axis, this.state.directionSign)
      shuttle.setVelocity(gravitySurfVelocityVector(this.state.axis, this.state.cruiseSpeed))
    }

    if (this.state.mode === 'decoupling') {
      const brakeActive = this.state.useBrakeThruster
        && shuttle.thrusterSystem.canFire('brake', shuttle.getThrusterRuntimeModifiers())
      shuttle.setExternalBrakeActive(brakeActive)
      const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
      const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
      const signedSpeed = THREE.MathUtils.lerp(this.state.signedSpeed, 0, easeInOut01(t))
      if (brakeActive) {
        shuttle.thrusterSystem.tick(
          dt,
          { thrust: false, brake: true, rcs: false },
          shuttle.getThrusterRuntimeModifiers(),
        )
      }
      this.state.signedSpeed = signedSpeed
      this.state.elapsed = nextElapsed
      this.state.alongCoord += signedSpeed * dt
      const { x, z } = this.worldPositionFromState(this.state)
      shuttle.group.position.set(x, 0, z)
      shuttle.setVelocity(gravitySurfVelocityVector(this.state.axis, signedSpeed))
      if (nextElapsed >= this.state.duration || Math.abs(signedSpeed) < 0.01) {
        this.completeDecouple(true, deps)
      }
    }

    if (deps.spaceTimeGrid) {
      const surfaceY = -deps.spaceTimeGrid.getDepthAt(
        shuttle.group.position.x,
        shuttle.group.position.z,
      )
      shuttle.group.position.y = surfaceY
      this.applySurfTilt(deps, dt, surfaceY)
    }
  }

  private getRailTarget(deps: GravitySurfingControllerDeps): GravitySurfRailTarget | null {
    if (
      !deps.shuttleController
      || !deps.gridVisible
      || !deps.hasGravitySurfingUnlock
      || deps.orbitState !== 'free'
      || deps.slingshotBurstActive
      || deps.shuttleController.speed < GRAVITY_SURF_MIN_ATTACH_SPEED
    ) {
      return null
    }
    return findNearestGravitySurfRail({
      x: deps.shuttleController.position.x,
      z: deps.shuttleController.position.z,
      gridSize: deps.mapGridSize,
      gridResolution: MAP_CONFIG.MAP_SPACE_TIME_GRID_RESOLUTION,
      maxSnapDistanceCells: MAP_CONFIG.GRAVITY_SURF_SNAP_DISTANCE_CELLS,
    })
  }

  private beginCoupling(target: GravitySurfRailTarget, deps: GravitySurfingControllerDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    // Derive direction from velocity (not heading) — velocity is the true direction of travel.
    // The min-speed gate in getRailTarget guarantees velocity is meaningful here.
    const vel = shuttle.currentVelocity
    const velComponent = target.axis === 'x' ? vel.x : vel.z
    const directionSign = velComponent >= 0 ? 1 : -1
    this.state = {
      mode: 'coupling',
      axis: target.axis,
      lineCoord: target.lineCoord,
      alongCoord: target.alongCoord,
      directionSign,
      startX: shuttle.position.x,
      startZ: shuttle.position.z,
      targetX: target.snappedX,
      targetZ: target.snappedZ,
      elapsed: 0,
      duration: MAP_CONFIG.GRAVITY_SURF_COUPLE_DURATION_SEC,
    }
    shuttle.freeze()
    shuttle.setInputEnabled(false)
    shuttle.setExternalBrakeActive(false)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    this.onCouplingStart?.()
  }

  private beginDecouple(deps: GravitySurfingControllerDeps): void {
    this.beginDecoupleInternal(deps, false)
  }

  private beginDecoupleInternal(
    deps: GravitySurfingControllerDeps,
    useBrakeThruster: boolean,
  ): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    if (this.state.mode === 'free' || this.state.mode === 'decoupling') {
      return
    }
    if (this.state.mode === 'coupling') {
      this.onCouplingEnd?.()
      this.state = { mode: 'free' }
      this.tiltPitch = 0
      this.tiltRoll = 0
      shuttle.unfreeze()
      shuttle.setInputEnabled(true)
      shuttle.setExternalBrakeActive(false)
      shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
      shuttle.group.rotation.x = 0
      shuttle.group.rotation.z = 0
      return
    }
    this.state = {
      mode: 'decoupling',
      axis: this.state.axis,
      lineCoord: this.state.lineCoord,
      alongCoord: this.state.alongCoord,
      signedSpeed: this.state.cruiseSpeed,
      useBrakeThruster,
      elapsed: 0,
      duration: MAP_CONFIG.GRAVITY_SURF_DECOUPLE_DURATION_SEC,
    }
  }

  private completeDecouple(spawnWave: boolean, deps: GravitySurfingControllerDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    if (spawnWave) {
      const forward = new THREE.Vector3(1, 0, 0)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), shuttle.heading)
      const waveX = shuttle.position.x + forward.x * MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_FORWARD_OFFSET
      const waveZ = shuttle.position.z + forward.z * MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_FORWARD_OFFSET
      deps.gravitationalEventManager?.spawnRandomInWorld({
        x: waveX,
        z: waveZ,
        dirX: forward.x,
        dirZ: forward.z,
        speed: MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_SPEED,
        durationSec: MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_DURATION_SEC,
        gridMass: MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_MASS,
        wellWidthMultiplier: MAP_CONFIG.GRAVITY_SURF_DECOUPLE_WAVE_WIDTH_MULT,
      })
    }
    this.state = { mode: 'free' }
    this.tiltPitch = 0
    this.tiltRoll = 0
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.setExternalBrakeActive(false)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
  }

  private isBrakeActive(
    shuttle: ShuttleController,
    deps: GravitySurfingControllerDeps,
  ): boolean {
    return Boolean(
      deps.inputManager?.isActionActive('brake')
      && shuttle.thrusterSystem.canFire('brake', shuttle.getThrusterRuntimeModifiers()),
    )
  }

  private worldPositionFromState(state: {
    axis: GravitySurfRailAxis
    lineCoord: number
    alongCoord: number
  }): { x: number; z: number } {
    return state.axis === 'x'
      ? { x: state.alongCoord, z: state.lineCoord }
      : { x: state.lineCoord, z: state.alongCoord }
  }

  private applySurfTilt(
    deps: GravitySurfingControllerDeps,
    dt: number,
    surfaceY: number,
  ): void {
    const shuttle = deps.shuttleController
    const grid = deps.spaceTimeGrid
    if (!shuttle || !grid) return

    const sampleDistance = Math.max(
      2,
      deps.mapGridSize / MAP_CONFIG.MAP_SPACE_TIME_GRID_RESOLUTION,
    )
    const forwardDir = new THREE.Vector3(1, 0, 0)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), shuttle.heading)
    const rightDir = new THREE.Vector3(forwardDir.z, 0, -forwardDir.x)
    const px = shuttle.group.position.x
    const pz = shuttle.group.position.z

    const forwardY = -grid.getDepthAt(
      px + forwardDir.x * sampleDistance,
      pz + forwardDir.z * sampleDistance,
    )
    const rightY = -grid.getDepthAt(
      px + rightDir.x * sampleDistance,
      pz + rightDir.z * sampleDistance,
    )
    const leftY = -grid.getDepthAt(
      px - rightDir.x * sampleDistance,
      pz - rightDir.z * sampleDistance,
    )

    const targetPitch = THREE.MathUtils.clamp(
      (surfaceY - forwardY) / sampleDistance,
      -MAP_CONFIG.GRAVITY_SURF_MAX_PITCH_RAD,
      MAP_CONFIG.GRAVITY_SURF_MAX_PITCH_RAD,
    )
    const targetRoll = THREE.MathUtils.clamp(
      (rightY - leftY) / (sampleDistance * 2),
      -MAP_CONFIG.GRAVITY_SURF_MAX_ROLL_RAD,
      MAP_CONFIG.GRAVITY_SURF_MAX_ROLL_RAD,
    )

    const ease = Math.min(1, dt * MAP_CONFIG.GRAVITY_SURF_TILT_RESPONSE_PER_SEC)
    this.tiltPitch = THREE.MathUtils.lerp(this.tiltPitch, targetPitch, ease)
    this.tiltRoll = THREE.MathUtils.lerp(this.tiltRoll, targetRoll, ease)
    shuttle.group.rotation.x = this.tiltPitch
    shuttle.group.rotation.z = this.tiltRoll
  }
}
