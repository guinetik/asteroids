import * as THREE from 'three'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { type InputManager } from '@/lib/InputManager'
import { useAudio } from '@/audio/useAudio'
import {
  OrbitCaptureSystem,
  type OrbitHudState,
  type CaptureBody,
} from '@/lib/orbitCapture'
import { canReleaseSlingshot } from '@/lib/slingshotLaunchPolicy'
import {
  getCurrentShuttleSlingshotBurstMultiplier,
  getCurrentShuttleThrusterChargeModifiers,
  getCurrentShuttleThrusterEfficiencyModifiers,
} from '@/lib/upgrades'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import { isShuttleAimingAtPlanet } from '@/lib/map/mapViewControllerHelpers'
import { MAP_CAMERA_CONFIG, MAP_ORBIT_CAMERA_CONFIG, type VehicleCamera } from '@/three/VehicleCamera'
import { buildSlingshotChargeCameraConfig, buildSlingshotExitCameraConfig, SLINGSHOT_EXIT_CAMERA_DURATION_SEC } from '@/three/slingshotChargeCamera'
import { MAP_PHYSICS, type ShuttleController } from '@/three/ShuttleController'
import type { MapSceneVisuals } from '@/three/MapSceneVisuals'

interface SharedDeps {
  shuttleController: ShuttleController
  vehicleCamera: VehicleCamera | null
  sceneVisuals: MapSceneVisuals | null
}

interface OrbitInputDeps extends SharedDeps {
  inputManager: InputManager
  mapIntroControlsLocked: boolean
}

interface OrbitTickDeps extends SharedDeps {
  inputManager: InputManager
  mapIntroControlsLocked: boolean
}

export class MapOrbitFacade {
  private _system: OrbitCaptureSystem | null = null
  private _approachStartPos: THREE.Vector3 | null = null
  private _approachProgress = 0
  private _slingshotCharge = 0
  private _orbitRingIsPreview = false
  private _chargeSoundPlaying = false
  private _exitCameraProgress = 0
  private _exitCameraActive = false

  get system(): OrbitCaptureSystem | null {
    return this._system
  }

  set system(value: OrbitCaptureSystem | null) {
    this._system = value
  }

  get approachStartPos(): THREE.Vector3 | null {
    return this._approachStartPos
  }

  set approachStartPos(value: THREE.Vector3 | null) {
    this._approachStartPos = value
  }

  get approachProgress(): number {
    return this._approachProgress
  }

  set approachProgress(value: number) {
    this._approachProgress = value
  }

  get slingshotCharge(): number {
    return this._slingshotCharge
  }

  set slingshotCharge(value: number) {
    this._slingshotCharge = value
  }

  get orbitRingIsPreview(): boolean {
    return this._orbitRingIsPreview
  }

  set orbitRingIsPreview(value: boolean) {
    this._orbitRingIsPreview = value
  }

  /** Whether the slingshot exit camera transition is active. */
  get exitCameraActive(): boolean {
    return this._exitCameraActive
  }

  /** Current exit camera blend progress (0 = orbit, 1 = free-flight). */
  get exitCameraProgress(): number {
    return this._exitCameraProgress
  }

  initialize(captureBodies: CaptureBody[]): void {
    this._system = new OrbitCaptureSystem(captureBodies)
  }

  beginForcedOrbit(
    bodyWorldX: number,
    bodyWorldZ: number,
    { shuttleController, vehicleCamera, sceneVisuals }: SharedDeps,
  ): void {
    if (!this._system) return
    sceneVisuals?.hideApproachTether()
    this._system.beginCapture(bodyWorldX + 1, bodyWorldZ)
    const orbitR = this._system.targetOrbitRadius
    shuttleController.group.position.set(bodyWorldX + orbitR, 0, bodyWorldZ)
    this._system.checkArrival(bodyWorldX + orbitR, bodyWorldZ)
    const awayAngle = Math.atan2(-bodyWorldZ, orbitR)
    shuttleController.group.rotation.set(0, awayAngle, 0)
    shuttleController.freeze()
    shuttleController.setInputEnabled(false)
    vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
    vehicleCamera?.setTarget(shuttleController.group)
    sceneVisuals?.showOrbitRing(orbitR)
    sceneVisuals?.setOrbitRingPosition(bodyWorldX, 0, bodyWorldZ)
    sceneVisuals?.showProgradeMarkers()
    this._slingshotCharge = 0
    this.hideLaunchArrow(sceneVisuals)
    this._orbitRingIsPreview = false
  }

  handleOrbitInput(dt: number, deps: OrbitInputDeps): void {
    const { shuttleController, inputManager, vehicleCamera, sceneVisuals } = deps
    if (!this._system) return

    const state = this._system.state
    const ePressed = inputManager.wasActionPressed('orbitAction')
    const eHeld = inputManager.isActionActive('orbitAction')

    if (state === 'free') {
      const vel = shuttleController.currentVelocity
      const preview = this._system.getNearestPreviewBody(
        shuttleController.position.x,
        shuttleController.position.z,
        vel.x,
        vel.z,
        MAP_CONFIG.ORBIT_PREVIEW_MULTIPLIER,
      )
      if (preview) {
        if (!this._orbitRingIsPreview) {
          sceneVisuals?.showOrbitRing(preview.orbitRadius, MAP_CONFIG.ORBIT_PREVIEW_OPACITY)
          this._orbitRingIsPreview = true
        }
        sceneVisuals?.setOrbitRingPosition(preview.worldX, 0, preview.worldZ)
      } else if (this._orbitRingIsPreview) {
        sceneVisuals?.hideOrbitRing()
        this._orbitRingIsPreview = false
      }
    }

    if (state === 'free' && ePressed) {
      const px = shuttleController.position.x
      const pz = shuttleController.position.z
      if (this._system.beginCapture(px, pz)) {
        useAudio().play('sfx.orbitCapture')
        shuttleController.cancelSlingshotBurst()
        this._approachStartPos = new THREE.Vector3(px, 0, pz)
        this._approachProgress = 0
        shuttleController.freeze()
        shuttleController.setInputEnabled(false)
        vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
        sceneVisuals?.showOrbitRing(this._system.targetOrbitRadius)
        sceneVisuals?.showApproachTether()
        this._orbitRingIsPreview = false
      }
    }

    if (state === 'approaching' && ePressed) {
      this.cancelApproachFromMap(deps)
    }

    if (state !== 'orbiting') return

    if (eHeld) {
      if (!this._chargeSoundPlaying) {
        useAudio().play('sfx.slingshot.charge', { loop: true })
        this._chargeSoundPlaying = true
      }
      this._slingshotCharge = Math.min(1, this._slingshotCharge + dt / MAP_CONFIG.SLINGSHOT_CHARGE_TIME)
      vehicleCamera?.applyConfigTuning(buildSlingshotChargeCameraConfig(this._slingshotCharge))
      this.updateLaunchArrow(shuttleController, sceneVisuals)
      return
    }

    // E released — stop the charge whine regardless of what happens next
    this.stopChargeSound()

    if (this._slingshotCharge <= 0) return

    const trajectoryBlocked = this.isAimingAtPlanet(shuttleController)
    if (!canReleaseSlingshot(this._slingshotCharge, trajectoryBlocked)) {
      this._slingshotCharge = 0
      vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
      this.hideLaunchArrow(sceneVisuals)
      return
    }

    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
    const heading = Math.atan2(-fwd.z, fwd.x)
    const launchVelocity = this._system.launchSlingshot(heading, dt)
    const vel = new THREE.Vector3(launchVelocity.vx, 0, launchVelocity.vz)
    const finalSpeed = Math.sqrt(launchVelocity.vx ** 2 + launchVelocity.vz ** 2)
    const burstSpeed = shuttleController.beginSlingshotBurst(
      finalSpeed,
      getCurrentShuttleSlingshotBurstMultiplier(),
      orbitConfig.slingshotSettleDuration,
    )
    vel.setLength(burstSpeed)

    shuttleController.unfreeze()
    shuttleController.orbitYawLeft = false
    shuttleController.orbitYawRight = false
    shuttleController.setVelocity(vel)
    shuttleController.setSlingshotSpeed(burstSpeed)
    shuttleController.triggerSlingshotLaunchFx(orbitConfig.slingshotLaunchFxDuration)
    useAudio().play('sfx.slingshot')
    useAudio().play('sfx.slingshot.burst')
    shuttleController.thrusterSystem.consumeFuel(
      this._slingshotCharge * shuttleController.thrusterSystem.fuelCapacity * 0.1,
    )

    this._exitCameraProgress = 0
    this._exitCameraActive = true
    if (vehicleCamera) {
      vehicleCamera.controls.target.copy(shuttleController.position)
    }
    sceneVisuals?.hideOrbitRing()
    sceneVisuals?.hideProgradeMarkers()
    this._orbitRingIsPreview = false
    this.hideLaunchArrow(sceneVisuals)
    this._slingshotCharge = 0
  }

  tickApproach(dt: number, { shuttleController, sceneVisuals }: SharedDeps): void {
    if (!this._system || this._system.state !== 'approaching' || !this._approachStartPos) return

    this._approachProgress = Math.min(1, this._approachProgress + dt / MAP_CONFIG.APPROACH_DURATION)
    const t = 1 - Math.pow(1 - this._approachProgress, 3)
    const target = this._system.getApproachTarget()
    if (target) {
      const x = this._approachStartPos.x + (target.x - this._approachStartPos.x) * t
      const z = this._approachStartPos.z + (target.z - this._approachStartPos.z) * t
      shuttleController.group.position.set(x, 0, z)

      const body = this._system.target
      if (body) {
        const bodyX = body.getWorldX()
        const bodyY = body.getWorldY()
        const bodyZ = body.getWorldZ()
        const dx = bodyX - x
        const dz = bodyZ - z
        shuttleController.group.rotation.y = Math.atan2(-dz, dx)
        sceneVisuals?.updateApproachTether(
          shuttleController.group.position,
          new THREE.Vector3(bodyX, bodyY, bodyZ),
          t,
          dt,
        )
      }
    }

    if (this._system.target) {
      sceneVisuals?.setOrbitRingPosition(
        this._system.target.getWorldX(),
        this._system.target.getWorldY(),
        this._system.target.getWorldZ(),
      )
    }

    if (this._approachProgress < 1) return

    const px = shuttleController.position.x
    const pz = shuttleController.position.z
    this._system.checkArrival(px, pz)
    this._approachStartPos = null
    sceneVisuals?.hideApproachTether()
    sceneVisuals?.showProgradeMarkers()

    if (this._system.target) {
      const bx = this._system.target.getWorldX()
      const bz = this._system.target.getWorldZ()
      const awayAngle = Math.atan2(-(pz - bz), px - bx)
      shuttleController.group.rotation.set(0, awayAngle, 0)
    }
  }

  tickOrbit(dt: number, deps: OrbitTickDeps): boolean {
    const { shuttleController, inputManager, vehicleCamera, sceneVisuals, mapIntroControlsLocked } = deps
    if (!this._system || this._system.state !== 'orbiting') return false

    const pos = this._system.tickOrbit(dt)
    const planetY = this._system.target?.getWorldY() ?? 0
    if (pos) {
      shuttleController.group.position.set(pos.x, planetY, pos.z)
    }

    const yawLeft =
      !mapIntroControlsLocked &&
      inputManager.isActionActive('yawLeft') &&
      shuttleController.thrusterSystem.canFire('rcs', {
        burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
      })
    const yawRight =
      !mapIntroControlsLocked &&
      inputManager.isActionActive('yawRight') &&
      shuttleController.thrusterSystem.canFire('rcs', {
        burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
      })
    shuttleController.orbitYawLeft = yawLeft
    shuttleController.orbitYawRight = yawRight
    if (yawLeft) shuttleController.group.rotateY(MAP_PHYSICS.yawTorque * dt)
    if (yawRight) shuttleController.group.rotateY(-MAP_PHYSICS.yawTorque * dt)

    // W snaps nose toward prograde, S toward retrograde
    const thrustSnap =
      !mapIntroControlsLocked && inputManager.isActionActive('thrust')
    const brakeSnap =
      !mapIntroControlsLocked && inputManager.isActionActive('brake')
    if ((thrustSnap || brakeSnap) && this._system) {
      const targetHeading = thrustSnap
        ? this._system.getProgradeHeading()
        : this._system.getRetrogradeHeading()
      if (targetHeading !== null) {
        const current = shuttleController.group.rotation.y
        let delta = targetHeading - current
        // Normalize to [-PI, PI]
        delta = ((delta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
        shuttleController.group.rotation.y = current + delta * Math.min(1, dt * orbitConfig.progradeSnapLerpSpeed)
      }
    }

    shuttleController.thrusterSystem.tick(
      dt,
      { thrust: false, brake: false, rcs: yawLeft || yawRight },
      {
        burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
        rechargeRateMultiplier: getCurrentShuttleThrusterChargeModifiers(),
      },
    )

    if (this._system.target && vehicleCamera) {
      const bx = this._system.target.getWorldX()
      const bz = this._system.target.getWorldZ()
      vehicleCamera.controls.target.set(bx, planetY, bz)
      sceneVisuals?.setOrbitRingPosition(bx, planetY, bz)
    }

    // Update prograde/retrograde markers
    if (this._system) {
      const proAngle = this._system.getProgradeAngle()
      if (proAngle !== null && this._system.target) {
        const retroAngle = proAngle + Math.PI
        const bx = this._system.target.getWorldX()
        const by = this._system.target.getWorldY()
        const bz = this._system.target.getWorldZ()
        const r = this._system.targetOrbitRadius
        const proPos = new THREE.Vector3(bx + Math.cos(proAngle) * r, by, bz + Math.sin(proAngle) * r)
        const retroPos = new THREE.Vector3(bx + Math.cos(retroAngle) * r, by, bz + Math.sin(retroAngle) * r)
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
        const heading = Math.atan2(-fwd.z, fwd.x)
        const alignment = this._system.getAlignment(heading)
        sceneVisuals?.updateProgradeMarkers(proPos, retroPos, alignment, dt)
      }
    }

    return true
  }

  /**
   * Advance the slingshot exit camera transition.
   * Called from MapViewController.tick() during slingshot settle.
   */
  tickExitCamera(dt: number, vehicleCamera: VehicleCamera | null): void {
    if (!this._exitCameraActive) return
    this._exitCameraProgress = Math.min(1, this._exitCameraProgress + dt / SLINGSHOT_EXIT_CAMERA_DURATION_SEC)
    vehicleCamera?.applyConfigTuning(buildSlingshotExitCameraConfig(this._exitCameraProgress))
    if (this._exitCameraProgress >= 1) {
      this._exitCameraActive = false
      vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
    }
  }

  buildHudState(shuttleController: ShuttleController, inspectMode: boolean): OrbitHudState | null {
    if (!this._system) return null
    const hudState = this._system.getHudState(shuttleController.position.x, shuttleController.position.z)
    hudState.chargeLevel = this._slingshotCharge
    hudState.inspectMode = inspectMode
    // Compute live alignment from shuttle heading
    const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(shuttleController.group.quaternion)
    const heading = Math.atan2(-fwd.z, fwd.x)
    hudState.progradeAlignment = this._system.getAlignment(heading)
    return hudState
  }

  cancelApproachFromMap({ shuttleController, vehicleCamera, sceneVisuals }: SharedDeps): void {
    if (this._system?.state !== 'approaching') return
    this._system.cancelApproach()
    this._approachStartPos = null
    shuttleController.unfreeze()
    shuttleController.setInputEnabled(true)
    vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
    sceneVisuals?.hideApproachTether()
    sceneVisuals?.hideOrbitRing()
    sceneVisuals?.hideProgradeMarkers()
    this._orbitRingIsPreview = false
  }

  prepareShuttleAfterDevWarp({ shuttleController, vehicleCamera, sceneVisuals }: SharedDeps): void {
    this._system?.resetToFreeFlight()
    this._approachStartPos = null
    this.stopChargeSound()
    this._slingshotCharge = 0
    this.hideLaunchArrow(sceneVisuals)
    sceneVisuals?.hideApproachTether()
    sceneVisuals?.hideOrbitRing()
    this._orbitRingIsPreview = false
    shuttleController.unfreeze()
    shuttleController.setInputEnabled(true)
    vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
    vehicleCamera?.setTarget(shuttleController.group)
  }

  private stopChargeSound(): void {
    if (!this._chargeSoundPlaying) return
    useAudio().stopSound('sfx.slingshot.charge')
    this._chargeSoundPlaying = false
  }

  private isAimingAtPlanet(shuttleController: ShuttleController): boolean {
    if (!this._system?.target) return false
    return isShuttleAimingAtPlanet({
      shuttlePosition: shuttleController.position,
      shuttleQuaternion: shuttleController.group.quaternion,
      planetPosition: {
        x: this._system.target.getWorldX(),
        z: this._system.target.getWorldZ(),
      },
    })
  }

  private updateLaunchArrow(shuttleController: ShuttleController, sceneVisuals: MapSceneVisuals | null): void {
    sceneVisuals?.updateLaunchArrow(this._slingshotCharge, this.isAimingAtPlanet(shuttleController))
  }

  private hideLaunchArrow(sceneVisuals: MapSceneVisuals | null): void {
    sceneVisuals?.hideLaunchArrow()
  }
}
