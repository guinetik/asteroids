import * as THREE from 'three'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ASTEROID_BELTS, PLANETS, SUN } from '@/lib/planets/catalog'
import { ORBIT_SCALE } from '@/lib/planets/constants'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import { createMapScene, handleMapResize, type MapSceneObjects } from '@/three/MapSceneSetup'
import { StarFieldController } from '@/three/StarFieldController'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { createGravityDistortionPass } from '@/three/GravityDistortionPass'
import { createSlingshotSpeedPass } from '@/three/SlingshotSpeedPass'
import mapGravityData from '@/data/shuttle/map-gravity.json'

export interface MapPlanetariumSceneRefs {
  sceneObjects: MapSceneObjects
  starField: StarFieldController
  sunController: SunController
  planetControllers: PlanetSystemController[]
  beltControllers: AsteroidBeltController[]
  spaceTimeGrid: SpaceTimeGrid
  gravityPass: ShaderPass
  slingshotSpeedPass: ShaderPass
  mapGridSize: number
}

export class MapPlanetariumScene {
  private refs: MapPlanetariumSceneRefs | null = null

  async initialize(canvas: HTMLCanvasElement, renderCamera: THREE.PerspectiveCamera): Promise<MapPlanetariumSceneRefs> {
    const sceneObjects = createMapScene(canvas)
    const scene = sceneObjects.scene

    // Move camera fill light from the setup camera to the runtime render camera.
    const oldCamera = sceneObjects.camera
    const cameraLight = oldCamera.children[0]
    if (cameraLight) {
      oldCamera.remove(cameraLight)
      renderCamera.add(cameraLight)
    }
    scene.remove(oldCamera)
    scene.add(renderCamera)

    const renderPass = sceneObjects.composer.passes[0] as RenderPass
    renderPass.camera = renderCamera

    const starField = new StarFieldController({ count: 4000, radius: 40000, size: 1.5 })
    scene.add(starField.points)

    const sunController = new SunController(SUN)
    scene.add(sunController.group)

    const initialPhases: Record<string, number> = {
      jupiter: 0,
      saturn: 0.5,
    }
    const planetControllers = PLANETS.map((planet) => {
      const controller = new PlanetSystemController(planet, initialPhases[planet.id])
      scene.add(controller.group)
      for (const line of controller.orbitLines) {
        scene.add(line)
      }
      return controller
    })

    const beltControllers = await Promise.all(
      ASTEROID_BELTS.map((belt) => AsteroidBeltController.create(belt)),
    )
    for (const controller of beltControllers) {
      scene.add(controller.group)
    }

    const kuiperOuterEdge = 2400 * ORBIT_SCALE
    const mapGridSize = kuiperOuterEdge * 2.2
    const spaceTimeGrid = new SpaceTimeGrid(
      mapGridSize,
      MAP_CONFIG.MAP_SPACE_TIME_GRID_RESOLUTION,
      80,
      40,
      0.2,
    )
    scene.add(spaceTimeGrid.mesh)
    spaceTimeGrid.addStaticSource({ x: 0, z: 0, mass: SUN.mass })

    const gravityPass = createGravityDistortionPass(
      mapGravityData.lensStrength,
      mapGravityData.chromStrength,
    )
    sceneObjects.composer.addPass(gravityPass)

    const slingshotSpeedPass = createSlingshotSpeedPass()
    sceneObjects.composer.addPass(slingshotSpeedPass)

    this.refs = {
      sceneObjects,
      starField,
      sunController,
      planetControllers,
      beltControllers,
      spaceTimeGrid,
      gravityPass,
      slingshotSpeedPass,
      mapGridSize,
    }
    return this.refs
  }

  resize(): void {
    if (!this.refs) return
    handleMapResize(this.refs.sceneObjects)
  }

  dispose(): void {
    if (!this.refs) return
    for (const controller of this.refs.beltControllers) controller.dispose()
    for (const controller of this.refs.planetControllers) controller.dispose()
    this.refs.spaceTimeGrid.dispose()
    this.refs.sunController.dispose()
    this.refs.starField.dispose()
    this.refs = null
  }
}
