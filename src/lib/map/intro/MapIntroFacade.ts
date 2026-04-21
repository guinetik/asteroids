import * as THREE from 'three'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import type { VehicleCamera } from '@/three/VehicleCamera'
import type { ShuttleController } from '@/three/ShuttleController'
import type { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { VirusModel } from '@/three/VirusModel'
import { CityModel } from '@/three/CityModel'
import { easeInOut } from '@/three/MapCamera'
import {
  INTRO_ZOOM_STEPS,
  type IntroCinematicStep,
  type MapIntroState,
} from '@/lib/mapIntroState'
import {
  EARTH_MOON_INDEX,
  PHOBOS_MOON_INDEX,
  INTRO_CITY_CAMERA_LOOK_DROP,
  INTRO_CITY_END_Y,
  INTRO_CITY_MODEL_BASE_SCALE,
  INTRO_CITY_MODEL_SIZE_MULTIPLIER,
  INTRO_CITY_START_Y,
  INTRO_CITY_YAW_SPEED,
  INTRO_VIRUS_YAW_SPEED,
  MAP_INTRO_CAMERA_START_FOV,
  MAP_INTRO_CAMERA_START_POSITION,
  MAP_INTRO_CAMERA_START_TARGET,
  MAP_INTRO_MARS_PHOBOS_CAMERA_OFFSET,
  MAP_INTRO_MARS_PHOBOS_FOV,
  MAP_INTRO_PHOBOS_APPROACH_OFFSET,
  MAP_INTRO_PHOBOS_CAMERA_OFFSET,
  MAP_INTRO_PHOBOS_FOV,
  MAP_INTRO_HERO_FOV,
  MAP_INTRO_HERO_LOOK_AT_OFFSET,
  MAP_INTRO_HERO_OFFSET,
  MAP_INTRO_JUPITER_CAMERA_OFFSET,
  MAP_INTRO_JUPITER_CITY_FOV,
  MAP_INTRO_JUPITER_CLOSE_OFFSET,
  MAP_INTRO_JUPITER_FOV,
  MAP_INTRO_MOON_CAMERA_OFFSET,
  MAP_INTRO_MOON_FOV,
  MAP_INTRO_SATURN_CAMERA_OFFSET,
  MAP_INTRO_SATURN_FOV,
} from '@/lib/map/mapViewControllerConfig'

/** Resolves a planet controller by catalog id for intro cinematics. */
type FindPlanetController = (planetId: string) => PlanetSystemController | null

/** Encapsulates the opening solar-map flythrough camera and hero models. */
export class MapIntroFacade {
  private readonly tempLookCamera = new THREE.PerspectiveCamera()
  private readonly tempFromPosition = new THREE.Vector3()
  private readonly tempToPosition = new THREE.Vector3()
  private readonly tempFromLook = new THREE.Vector3()
  private readonly tempToLook = new THREE.Vector3()
  private readonly tempMidPosition = new THREE.Vector3()
  private readonly tempMidLook = new THREE.Vector3()
  private readonly tempCurveA = new THREE.Vector3()
  private readonly tempCurveB = new THREE.Vector3()
  private readonly tempFromQuaternion = new THREE.Quaternion()
  private readonly tempToQuaternion = new THREE.Quaternion()
  private readonly tempMidQuaternion = new THREE.Quaternion()
  private readonly tempMarsWorldPos = new THREE.Vector3()

  static preload(): void {
    VirusModel.preload()
    CityModel.preload()
  }

  private readonly introCamera: THREE.PerspectiveCamera
  private introVirusModel: VirusModel | null = null
  private introCityModel: CityModel | null = null
  private readonly introMoonWorldPos = new THREE.Vector3()

  constructor(scene: THREE.Scene, aspect: number) {
    this.introCamera = new THREE.PerspectiveCamera(MAP_INTRO_CAMERA_START_FOV, aspect, 0.1, 50000)
    this.resetCamera()
    scene.add(this.introCamera)
  }

  resize(aspect: number): void {
    this.introCamera.aspect = aspect
    this.introCamera.updateProjectionMatrix()
  }

  resetCamera(): void {
    this.introCamera.position.copy(MAP_INTRO_CAMERA_START_POSITION)
    this.introCamera.lookAt(MAP_INTRO_CAMERA_START_TARGET)
    this.introCamera.fov = MAP_INTRO_CAMERA_START_FOV
    this.introCamera.updateProjectionMatrix()
  }

  syncOrbitControlsEnabled(vehicleCamera: VehicleCamera | null, mapIntro: MapIntroState): void {
    if (!vehicleCamera || !mapIntro.controlsLocked) return
    vehicleCamera.controls.enabled = mapIntro.phase === 'awaiting_message_open'
  }

  tick(params: {
    sceneObjects: MapSceneObjects | null
    vehicleCamera: VehicleCamera | null
    shuttleController: ShuttleController | null
    mapIntro: MapIntroState
    isMapOpen: boolean
    isHabitatActive: boolean
    findPlanetControllerById: FindPlanetController
  }): void {
    const { sceneObjects, vehicleCamera, shuttleController, mapIntro, isMapOpen, isHabitatActive } =
      params
    if (!sceneObjects || !vehicleCamera || !shuttleController || isMapOpen) return

    const renderPass = sceneObjects.composer.passes[0] as RenderPass

    if (mapIntro.phase === 'cinematic_zoom') {
      const step = mapIntro.cinematicStep
      if (!step || step === 'done') return
      const raw = mapIntro.cinematicStepProgress
      const t = INTRO_ZOOM_STEPS.has(step) ? easeInOut(raw) : raw
      this.tickIntroProps(step, sceneObjects.scene, params.findPlanetControllerById)
      this.tickIntroStep(step, t, renderPass, vehicleCamera, shuttleController, params.findPlanetControllerById)
      return
    }

    if (mapIntro.controlsLocked) {
      this.introCamera.position.copy(vehicleCamera.camera.position)
      this.introCamera.quaternion.copy(vehicleCamera.camera.quaternion)
      this.introCamera.fov = vehicleCamera.camera.fov
      this.introCamera.updateProjectionMatrix()
      renderPass.camera = this.introCamera
      return
    }

    if (!isHabitatActive) {
      renderPass.camera = vehicleCamera.camera
    }
  }

  dispose(scene: THREE.Scene): void {
    this.disposeIntroVirus(scene)
    this.disposeIntroCity(scene)
    scene.remove(this.introCamera)
  }

  private tickIntroStep(
    step: IntroCinematicStep,
    t: number,
    renderPass: RenderPass,
    vehicleCamera: VehicleCamera,
    shuttleController: ShuttleController,
    findPlanetControllerById: FindPlanetController,
  ): void {
    switch (step) {
      case 'hold_solar_system':
        return this.tickIntroHoldSolarSystem(renderPass)
      case 'zoom_phobos':
        return this.tickIntroZoomPhobos(t, renderPass, findPlanetControllerById)
      case 'hold_phobos':
        return this.tickIntroHoldPhobos(renderPass, findPlanetControllerById)
      case 'zoom_virus':
        return this.tickIntroZoomVirus(t, renderPass, findPlanetControllerById)
      case 'hold_virus':
        return this.tickIntroHoldVirus(renderPass, findPlanetControllerById)
      case 'zoom_moon':
        return this.tickIntroZoomMoon(t, renderPass, findPlanetControllerById)
      case 'hold_moon':
        return this.tickIntroHoldMoon(renderPass, findPlanetControllerById)
      case 'zoom_jupiter':
        return this.tickIntroZoomJupiter(t, renderPass, findPlanetControllerById)
      case 'hold_jupiter':
        return this.tickIntroHoldJupiter(renderPass, findPlanetControllerById)
      case 'zoom_city':
        return this.tickIntroZoomCity(t, renderPass, findPlanetControllerById)
      case 'hold_city':
        return this.tickIntroHoldCity(renderPass, findPlanetControllerById)
      case 'zoom_saturn':
        return this.tickIntroZoomSaturn(t, renderPass, findPlanetControllerById)
      case 'hold_saturn':
        return this.tickIntroHoldSaturn(renderPass, findPlanetControllerById)
      case 'zoom_shuttle':
        return this.tickIntroZoomShuttle(t, renderPass, shuttleController, findPlanetControllerById)
      case 'hold_shuttle':
        return this.tickIntroHoldShuttle(renderPass, shuttleController)
      case 'handoff':
        return this.tickIntroHandoff(t, renderPass, vehicleCamera, shuttleController)
    }
  }

  private tickIntroProps(
    step: IntroCinematicStep,
    scene: THREE.Scene,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const virusActive = step === 'zoom_virus' || step === 'hold_virus'
    if (virusActive && !this.introVirusModel) {
      this.spawnIntroVirus(scene, findPlanetControllerById)
    } else if (!virusActive && this.introVirusModel) {
      this.disposeIntroVirus(scene)
    }
    if (this.introVirusModel) {
      this.introVirusModel.group.rotation.y += INTRO_VIRUS_YAW_SPEED * (1 / 60)
      const mars = findPlanetControllerById('mars')
      if (mars) {
        const pos = mars.getMoonWorldPosition(PHOBOS_MOON_INDEX, this.introMoonWorldPos)
        if (pos) this.introVirusModel.placeAt(pos.x, pos.y + 0.15, pos.z)
      }
    }

    const cityActive = step === 'zoom_city' || step === 'hold_city'
    if (cityActive && !this.introCityModel) {
      this.spawnIntroCity(scene, findPlanetControllerById)
    } else if (!cityActive && this.introCityModel) {
      this.disposeIntroCity(scene)
    }
    if (this.introCityModel) {
      this.introCityModel.group.rotation.y += INTRO_CITY_YAW_SPEED * (1 / 60)
      const jupiter = findPlanetControllerById('jupiter')
      if (jupiter) {
        this.introCityModel.group.position.x = jupiter.getWorldX()
        this.introCityModel.group.position.z = jupiter.getWorldZ()
      }
    }
  }

  private spawnIntroVirus(scene: THREE.Scene, findPlanetControllerById: FindPlanetController): void {
    const mars = findPlanetControllerById('mars')
    if (!mars) return
    const pos = mars.getMoonWorldPosition(PHOBOS_MOON_INDEX, this.introMoonWorldPos)
    if (!pos) return

    VirusModel.create({ scale: 0.3 }).then((virus) => {
      if (this.introVirusModel) return
      this.introVirusModel = virus
      virus.placeAt(pos.x + 0.08, pos.y + 0.05, pos.z)
      scene.add(virus.group)
    })
  }

  private disposeIntroVirus(scene: THREE.Scene): void {
    if (!this.introVirusModel) return
    scene.remove(this.introVirusModel.group)
    this.introVirusModel.dispose()
    this.introVirusModel = null
  }

  private spawnIntroCity(scene: THREE.Scene, findPlanetControllerById: FindPlanetController): void {
    const jupiter = findPlanetControllerById('jupiter')
    if (!jupiter) return

    CityModel.create({
      scale: INTRO_CITY_MODEL_BASE_SCALE * INTRO_CITY_MODEL_SIZE_MULTIPLIER,
      hologram: true,
    }).then((city) => {
      if (this.introCityModel) return
      this.introCityModel = city
      city.group.position.set(
        jupiter.getWorldX(),
        jupiter.getWorldY() + INTRO_CITY_START_Y,
        jupiter.getWorldZ(),
      )
      scene.add(city.group)
    })
  }

  private disposeIntroCity(scene: THREE.Scene): void {
    if (!this.introCityModel) return
    scene.remove(this.introCityModel.group)
    this.introCityModel.dispose()
    this.introCityModel = null
  }

  private tickIntroZoomPhobos(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const mars = findPlanetControllerById('mars')
    if (!mars) return
    const phobos = this.getPhobosWorldPos(mars)
    if (!phobos) return

    const marsCenter = this.tempMarsWorldPos.set(mars.getWorldX(), mars.getWorldY(), mars.getWorldZ())
    const abovePhobos = phobos.clone().add(MAP_INTRO_PHOBOS_APPROACH_OFFSET)
    const camDest = this.tempToPosition.copy(marsCenter).add(MAP_INTRO_MARS_PHOBOS_CAMERA_OFFSET)
    const approachT = THREE.MathUtils.smoothstep(t, 0, 0.76)
    const descendT = THREE.MathUtils.smoothstep(t, 0.52, 1)
    this.introCamera.position.lerpVectors(MAP_INTRO_CAMERA_START_POSITION, abovePhobos, approachT)
    this.introCamera.position.lerp(camDest, descendT)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_CAMERA_START_FOV, MAP_INTRO_MARS_PHOBOS_FOV, t)
    this.introCamera.updateProjectionMatrix()
    const look = new THREE.Vector3().lerpVectors(MAP_INTRO_CAMERA_START_TARGET, marsCenter, t)
    this.introCamera.lookAt(look)
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldSolarSystem(renderPass: RenderPass): void {
    this.introCamera.position.copy(MAP_INTRO_CAMERA_START_POSITION)
    this.introCamera.fov = MAP_INTRO_CAMERA_START_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(MAP_INTRO_CAMERA_START_TARGET)
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldPhobos(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const mars = findPlanetControllerById('mars')
    if (!mars) return
    const marsCenter = this.tempMarsWorldPos.set(mars.getWorldX(), mars.getWorldY(), mars.getWorldZ())
    this.introCamera.position.copy(marsCenter).add(MAP_INTRO_MARS_PHOBOS_CAMERA_OFFSET)
    this.introCamera.fov = MAP_INTRO_MARS_PHOBOS_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(marsCenter)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomVirus(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const mars = findPlanetControllerById('mars')
    if (!mars) return
    const phobos = this.getPhobosWorldPos(mars)
    if (!phobos) return

    const marsCenter = this.tempMarsWorldPos.set(mars.getWorldX(), mars.getWorldY(), mars.getWorldZ())
    const widePos = this.tempFromPosition.copy(marsCenter).add(MAP_INTRO_MARS_PHOBOS_CAMERA_OFFSET)
    const closePos = this.tempToPosition.copy(phobos).add(MAP_INTRO_PHOBOS_CAMERA_OFFSET)
    this.introCamera.position.lerpVectors(widePos, closePos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_MARS_PHOBOS_FOV, MAP_INTRO_PHOBOS_FOV, t)
    this.introCamera.updateProjectionMatrix()
    const look = this.tempFromLook.lerpVectors(marsCenter, phobos, t)
    this.introCamera.lookAt(look)
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldVirus(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const mars = findPlanetControllerById('mars')
    if (!mars) return
    const phobos = this.getPhobosWorldPos(mars)
    if (!phobos) return

    this.introCamera.position.copy(phobos).add(MAP_INTRO_PHOBOS_CAMERA_OFFSET)
    this.introCamera.fov = MAP_INTRO_PHOBOS_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(phobos)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomJupiter(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const earth = findPlanetControllerById('earth')
    const jupiter = findPlanetControllerById('jupiter')
    if (!earth || !jupiter) return
    const moon = this.getEarthMoonWorldPos(earth)
    if (!moon) return
    const earthCenter = this.tempFromLook.set(earth.getWorldX(), earth.getWorldY(), earth.getWorldZ())
    const fromPos = this.tempFromPosition.copy(earthCenter).add(MAP_INTRO_MOON_CAMERA_OFFSET)
    const jupiterCenter = this.tempToLook.set(jupiter.getWorldX(), jupiter.getWorldY(), jupiter.getWorldZ())
    const toPos = this.tempToPosition.copy(jupiterCenter).add(MAP_INTRO_JUPITER_CAMERA_OFFSET)

    const systemCenter = this.tempMidLook.copy(earthCenter).add(jupiterCenter).multiplyScalar(0.5)
    const transitHeight = Math.max(fromPos.y, toPos.y) + 180
    const midPos = this.tempMidPosition.copy(systemCenter)
    midPos.y = transitHeight

    this.applyArcQuaternionBlend(moon, fromPos, systemCenter, midPos, jupiterCenter, toPos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_MOON_FOV, MAP_INTRO_JUPITER_FOV, t)
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldJupiter(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const jupiter = findPlanetControllerById('jupiter')
    if (!jupiter) return
    const jupiterCenter = new THREE.Vector3(jupiter.getWorldX(), jupiter.getWorldY(), jupiter.getWorldZ())
    this.introCamera.position.copy(jupiterCenter).add(MAP_INTRO_JUPITER_CAMERA_OFFSET)
    this.introCamera.fov = MAP_INTRO_JUPITER_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(jupiterCenter)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomMoon(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const mars = findPlanetControllerById('mars')
    const earth = findPlanetControllerById('earth')
    if (!mars || !earth) return
    const phobos = this.getPhobosWorldPos(mars)
    const moon = this.getEarthMoonWorldPos(earth)
    if (!phobos || !moon) return

    const fromPos = this.tempFromPosition
      .copy(phobos)
      .add(MAP_INTRO_PHOBOS_CAMERA_OFFSET.clone().multiplyScalar(1.5))
    const earthCenter = this.tempToLook.set(earth.getWorldX(), earth.getWorldY(), earth.getWorldZ())
    const toPos = this.tempToPosition.copy(earthCenter).add(MAP_INTRO_MOON_CAMERA_OFFSET)

    const systemCenter = this.tempMidLook.copy(phobos).add(earthCenter).multiplyScalar(0.5)
    const transitHeight = Math.max(fromPos.y, toPos.y) + 160
    const midPos = this.tempMidPosition.copy(systemCenter)
    midPos.y = transitHeight

    this.applyArcQuaternionBlend(phobos, fromPos, systemCenter, midPos, moon, toPos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_PHOBOS_FOV, MAP_INTRO_MOON_FOV, t)
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldMoon(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const earth = findPlanetControllerById('earth')
    if (!earth) return
    const moon = this.getEarthMoonWorldPos(earth)
    if (!moon) return
    const earthCenter = this.tempFromLook.set(earth.getWorldX(), earth.getWorldY(), earth.getWorldZ())
    this.introCamera.position.copy(earthCenter).add(MAP_INTRO_MOON_CAMERA_OFFSET)
    this.introCamera.fov = MAP_INTRO_MOON_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(moon)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomSaturn(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const jupiter = findPlanetControllerById('jupiter')
    const saturn = findPlanetControllerById('saturn')
    if (!jupiter || !saturn) return

    const jupiterCenter = this.tempFromLook.set(jupiter.getWorldX(), jupiter.getWorldY(), jupiter.getWorldZ())
    const saturnCenter = this.tempToLook.set(saturn.getWorldX(), saturn.getWorldY(), saturn.getWorldZ())
    const fromPos = this.tempFromPosition.copy(jupiterCenter).add(MAP_INTRO_JUPITER_CAMERA_OFFSET)
    const toPos = this.tempToPosition.copy(saturnCenter).add(MAP_INTRO_SATURN_CAMERA_OFFSET)
    const systemCenter = this.tempMidLook.copy(jupiterCenter).add(saturnCenter).multiplyScalar(0.5)
    const midPos = this.tempMidPosition.copy(systemCenter)
    midPos.y = Math.max(fromPos.y, toPos.y) + 180

    this.applyArcQuaternionBlend(jupiterCenter, fromPos, systemCenter, midPos, saturnCenter, toPos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_JUPITER_FOV, MAP_INTRO_SATURN_FOV, t)
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldSaturn(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const saturn = findPlanetControllerById('saturn')
    if (!saturn) return

    const saturnCenter = new THREE.Vector3(saturn.getWorldX(), saturn.getWorldY(), saturn.getWorldZ())
    this.introCamera.position.copy(saturnCenter).add(MAP_INTRO_SATURN_CAMERA_OFFSET)
    this.introCamera.fov = MAP_INTRO_SATURN_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(saturnCenter)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomCity(
    t: number,
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const jupiter = findPlanetControllerById('jupiter')
    if (!jupiter) return

    const jupiterCenter = new THREE.Vector3(jupiter.getWorldX(), jupiter.getWorldY(), jupiter.getWorldZ())
    const cityY = jupiterCenter.y + THREE.MathUtils.lerp(INTRO_CITY_START_Y, INTRO_CITY_END_Y, t)
    if (this.introCityModel) {
      this.introCityModel.group.position.y = cityY
    }

    const offset = new THREE.Vector3().lerpVectors(
      MAP_INTRO_JUPITER_CAMERA_OFFSET,
      MAP_INTRO_JUPITER_CLOSE_OFFSET,
      t,
    )
    this.introCamera.position.copy(jupiterCenter).add(offset)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_JUPITER_FOV, MAP_INTRO_JUPITER_CITY_FOV, t)
    this.introCamera.updateProjectionMatrix()
    const look = new THREE.Vector3(jupiterCenter.x, cityY - INTRO_CITY_CAMERA_LOOK_DROP, jupiterCenter.z)
    this.introCamera.lookAt(look)
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldCity(
    renderPass: RenderPass,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const jupiter = findPlanetControllerById('jupiter')
    if (!jupiter) return

    const jupiterCenter = new THREE.Vector3(jupiter.getWorldX(), jupiter.getWorldY(), jupiter.getWorldZ())
    this.introCamera.position.copy(jupiterCenter).add(MAP_INTRO_JUPITER_CLOSE_OFFSET)
    this.introCamera.fov = MAP_INTRO_JUPITER_CITY_FOV
    this.introCamera.updateProjectionMatrix()
    const look = new THREE.Vector3(
      jupiterCenter.x,
      jupiterCenter.y + INTRO_CITY_END_Y - INTRO_CITY_CAMERA_LOOK_DROP,
      jupiterCenter.z,
    )
    this.introCamera.lookAt(look)
    renderPass.camera = this.introCamera
  }

  private tickIntroZoomShuttle(
    t: number,
    renderPass: RenderPass,
    shuttleController: ShuttleController,
    findPlanetControllerById: FindPlanetController,
  ): void {
    const saturn = findPlanetControllerById('saturn')
    const fromPos = saturn
      ? this.tempFromPosition
          .set(saturn.getWorldX(), saturn.getWorldY(), saturn.getWorldZ())
          .add(MAP_INTRO_SATURN_CAMERA_OFFSET)
      : this.tempFromPosition.copy(MAP_INTRO_CAMERA_START_POSITION)
    const fromLook = saturn
      ? this.tempFromLook.set(
          saturn.getWorldX(),
          saturn.getWorldY(),
          saturn.getWorldZ(),
        )
      : this.tempFromLook.copy(MAP_INTRO_CAMERA_START_TARGET)

    const heroPos = shuttleController.group.position
      .clone()
      .add(MAP_INTRO_HERO_OFFSET.clone().applyQuaternion(shuttleController.group.quaternion))
    const heroLook = shuttleController.group.position.clone().add(MAP_INTRO_HERO_LOOK_AT_OFFSET)

    this.applyQuaternionBlend(fromLook, fromPos, heroLook, heroPos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_SATURN_FOV, MAP_INTRO_HERO_FOV, t)
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
  }

  private tickIntroHoldShuttle(renderPass: RenderPass, shuttleController: ShuttleController): void {
    const heroPos = shuttleController.group.position
      .clone()
      .add(MAP_INTRO_HERO_OFFSET.clone().applyQuaternion(shuttleController.group.quaternion))
    const heroLook = shuttleController.group.position.clone().add(MAP_INTRO_HERO_LOOK_AT_OFFSET)

    this.introCamera.position.copy(heroPos)
    this.introCamera.fov = MAP_INTRO_HERO_FOV
    this.introCamera.updateProjectionMatrix()
    this.introCamera.lookAt(heroLook)
    renderPass.camera = this.introCamera
  }

  private tickIntroHandoff(
    t: number,
    renderPass: RenderPass,
    vehicleCamera: VehicleCamera,
    shuttleController: ShuttleController,
  ): void {
    const heroPos = shuttleController.group.position
      .clone()
      .add(MAP_INTRO_HERO_OFFSET.clone().applyQuaternion(shuttleController.group.quaternion))
    const heroLook = shuttleController.group.position.clone().add(MAP_INTRO_HERO_LOOK_AT_OFFSET)
    const orbitPos = vehicleCamera.camera.position
    const orbitLook = vehicleCamera.controls.target

    this.applyQuaternionBlend(heroLook, heroPos, orbitLook, orbitPos, t)
    this.introCamera.fov = THREE.MathUtils.lerp(MAP_INTRO_HERO_FOV, vehicleCamera.camera.fov, t)
    this.introCamera.updateProjectionMatrix()
    renderPass.camera = this.introCamera
  }

  private getPhobosWorldPos(mars: PlanetSystemController): THREE.Vector3 | null {
    return mars.getMoonWorldPosition(PHOBOS_MOON_INDEX, this.introMoonWorldPos)
  }

  private getEarthMoonWorldPos(earth: PlanetSystemController): THREE.Vector3 | null {
    return earth.getMoonWorldPosition(EARTH_MOON_INDEX, this.introMoonWorldPos)
  }

  private applyQuaternionBlend(
    fromLook: THREE.Vector3,
    fromPos: THREE.Vector3,
    toLook: THREE.Vector3,
    toPos: THREE.Vector3,
    t: number,
  ): void {
    this.tempLookCamera.position.copy(fromPos)
    this.tempLookCamera.lookAt(fromLook)
    this.tempFromQuaternion.copy(this.tempLookCamera.quaternion)

    this.tempLookCamera.position.copy(toPos)
    this.tempLookCamera.lookAt(toLook)
    this.tempToQuaternion.copy(this.tempLookCamera.quaternion)

    this.introCamera.position.lerpVectors(fromPos, toPos, t)
    this.introCamera.quaternion.copy(this.tempFromQuaternion).slerp(this.tempToQuaternion, t)
  }

  private applyArcQuaternionBlend(
    fromLook: THREE.Vector3,
    fromPos: THREE.Vector3,
    midLook: THREE.Vector3,
    midPos: THREE.Vector3,
    toLook: THREE.Vector3,
    toPos: THREE.Vector3,
    t: number,
  ): void {
    this.tempCurveA.lerpVectors(fromPos, midPos, t)
    this.tempCurveB.lerpVectors(midPos, toPos, t)
    this.introCamera.position.lerpVectors(this.tempCurveA, this.tempCurveB, t)

    this.tempLookCamera.position.copy(fromPos)
    this.tempLookCamera.lookAt(fromLook)
    this.tempFromQuaternion.copy(this.tempLookCamera.quaternion)

    this.tempLookCamera.position.copy(midPos)
    this.tempLookCamera.lookAt(midLook)
    this.tempMidQuaternion.copy(this.tempLookCamera.quaternion)

    this.tempLookCamera.position.copy(toPos)
    this.tempLookCamera.lookAt(toLook)
    this.tempToQuaternion.copy(this.tempLookCamera.quaternion)

    if (t < 0.5) {
      this.introCamera.quaternion
        .copy(this.tempFromQuaternion)
        .slerp(this.tempMidQuaternion, t / 0.5)
      return
    }

    this.introCamera.quaternion
      .copy(this.tempMidQuaternion)
      .slerp(this.tempToQuaternion, (t - 0.5) / 0.5)
  }
}
