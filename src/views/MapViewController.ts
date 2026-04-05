/**
 * Lifecycle controller for the map view.
 *
 * Creates and wires all planetarium systems: scene setup, sun,
 * planets, asteroid belts, starfield, and the player shuttle.
 * The shuttle serves as the player character in the game hub,
 * navigating the solar system orrery.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { DEFAULT_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_ANIMATION,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { DEFAULT_TIME_SCALE, ORBIT_SCALE } from '@/lib/planets/constants'
import { SUN, PLANETS, ASTEROID_BELTS } from '@/lib/planets/catalog'
import { createMapScene, handleMapResize, type MapSceneObjects } from '@/three/MapSceneSetup'
import { StarFieldController } from '@/three/StarFieldController'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { ShuttleController } from '@/three/ShuttleController'
import { VehicleCamera, MAP_CAMERA_CONFIG } from '@/three/VehicleCamera'

/** Tick priority for the compositor (runs after animation, before render). */
const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/** One-shot action bridge runs just after input. */
const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1

/**
 * Minimum mass (M☉) for a planet to contribute to the space-time grid.
 * Below this, the gravity well is sub-pixel. Filters out terrestrials
 * and dwarf planets, keeping Sun + Jupiter/Saturn/Uranus/Neptune.
 */
const GRID_MASS_THRESHOLD = 1e-5

/**
 * Visual scale for the shuttle in the map view.
 * The shuttle model is ~14 units at default scale; this brings it to ~0.7 units,
 * comparable to planet display radii.
 */
const MAP_SHUTTLE_SCALE = 0.05

/** Spawn the shuttle near Earth's orbit distance (~300 scene-AU * ORBIT_SCALE). */
const SPAWN_ORBIT_RADIUS = 300 * ORBIT_SCALE

/**
 * Bridges Vue lifecycle to the map scene with player shuttle.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
export class MapViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneObjects: MapSceneObjects | null = null
  private vehicleCamera: VehicleCamera | null = null
  private shuttleController: ShuttleController | null = null
  private starField: StarFieldController | null = null
  private sunController: SunController | null = null
  private planetControllers: PlanetSystemController[] = []
  private beltControllers: AsteroidBeltController[] = []
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private simTime = 0
  private resizeHandler: (() => void) | null = null

  /** Called each frame with full shuttle telemetry for HUD display. */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Create canvas
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    // Scene setup (renderer, scene, bloom, temporary controls)
    this.sceneObjects = createMapScene(canvas)
    const { scene } = this.sceneObjects

    // --- Input ---
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // --- Camera: replace OrbitControls with VehicleCamera ---
    this.sceneObjects.controls.dispose()
    this.vehicleCamera = new VehicleCamera(MAP_CAMERA_CONFIG, canvas)

    // Move camera fill light from the map scene's original camera to vehicle camera
    const oldCamera = this.sceneObjects.camera
    const cameraLight = oldCamera.children[0]
    if (cameraLight) {
      oldCamera.remove(cameraLight)
      this.vehicleCamera.camera.add(cameraLight)
    }
    scene.remove(oldCamera)
    scene.add(this.vehicleCamera.camera)

    // Swap the EffectComposer's render pass to use the vehicle camera
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    renderPass.camera = this.vehicleCamera.camera

    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_COMPOSIT - 1)

    // --- Starfield ---
    this.starField = new StarFieldController()
    scene.add(this.starField.points)

    // --- Sun ---
    this.sunController = new SunController(SUN)
    scene.add(this.sunController.group)

    // --- Planets ---
    const INITIAL_PHASES: Record<string, number> = {
      jupiter: 0,
      saturn: 0.5,
    }
    for (const planet of PLANETS) {
      const controller = new PlanetSystemController(planet, INITIAL_PHASES[planet.id])
      scene.add(controller.group)
      for (const line of controller.orbitLines) {
        scene.add(line)
      }
      this.planetControllers.push(controller)
    }

    // --- Asteroid belts (async — GLB loading) ---
    const beltPromises = ASTEROID_BELTS.map((belt) => AsteroidBeltController.create(belt))
    const belts = await Promise.all(beltPromises)
    for (const controller of belts) {
      scene.add(controller.group)
      this.beltControllers.push(controller)
    }

    // --- Space-time grid (gravity well visualization) ---
    const kuiperOuterEdge = 2400 * ORBIT_SCALE
    const gridSize = kuiperOuterEdge * 2.2
    const gridDepthScale = 10
    const gridWidthScale = 12
    const gridMassExponent = 0.2
    this.spaceTimeGrid = new SpaceTimeGrid(gridSize, 200, gridDepthScale, gridWidthScale, gridMassExponent)
    scene.add(this.spaceTimeGrid.mesh)

    // --- Shuttle (player character) ---
    this.shuttleController = new ShuttleController(this.inputManager)
    this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)
    // No gravity wells — map is a free-roam hub, gravity is visual only
    await this.shuttleController.load()
    this.shuttleController.group.scale.setScalar(MAP_SHUTTLE_SCALE)

    // Spawn near Earth's orbit at a random angle
    const spawnAngle = Math.random() * Math.PI * 2
    this.shuttleController.group.position.set(
      Math.cos(spawnAngle) * SPAWN_ORBIT_RADIUS,
      0,
      Math.sin(spawnAngle) * SPAWN_ORBIT_RADIUS,
    )

    scene.add(this.shuttleController.group)
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // One-shot action bridge (doors toggle, telemetry)
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // --- Register orrery animation tick ---
    const orreryTickable: Tickable = {
      tick: (dt: number) => this.tickOrrery(dt),
    }
    this.tickHandler.register(orreryTickable, TICK_PRIORITY_ANIMATION)

    // --- Compositor: renders via EffectComposer ---
    const compositorTickable: Tickable = {
      tick: () => {
        this.sceneObjects!.composer.render()
      },
    }
    this.tickHandler.register(compositorTickable, TICK_PRIORITY_COMPOSIT)

    // --- Resize ---
    this.resizeHandler = () => {
      if (this.sceneObjects) {
        handleMapResize(this.sceneObjects)
        this.vehicleCamera?.resize(window.innerWidth, window.innerHeight)
      }
    }
    window.addEventListener('resize', this.resizeHandler)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /**
   * One-shot actions and telemetry emission (runs just after input).
   */
  tick(_dt: number): void {
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
    if (this.shuttleController && this.onTelemetry) {
      const ts = this.shuttleController.thrusterSystem
      this.onTelemetry({
        speed: this.shuttleController.speed,
        heading: this.shuttleController.heading,
        posX: this.shuttleController.position.x,
        posZ: this.shuttleController.position.z,
        fuelLevel: ts.fuelLevel,
        fuelCapacity: ts.fuelCapacity,
        thrustCharge: ts.getState('thrust').charge,
        thrustCapacity: ts.getState('thrust').capacity,
        brakeCharge: ts.getState('brake').charge,
        brakeCapacity: ts.getState('brake').capacity,
        rcsCharge: ts.getState('rcs').charge,
        rcsCapacity: ts.getState('rcs').capacity,
      })
    }
  }

  /**
   * Advance the orrery simulation and update gravity grid sources.
   */
  private tickOrrery(dt: number): void {
    this.simTime += dt * DEFAULT_TIME_SCALE

    this.sunController?.tick(dt, this.simTime)

    for (const controller of this.planetControllers) {
      controller.tick(dt, this.simTime)
    }

    for (const controller of this.beltControllers) {
      controller.tick(dt, this.simTime)
    }

    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.clearSources()
      if (this.sunController) {
        this.spaceTimeGrid.addSource({
          x: this.sunController.getWorldX(),
          z: this.sunController.getWorldZ(),
          mass: this.sunController.mass,
        })
      }
      for (const controller of this.planetControllers) {
        if (controller.mass < GRID_MASS_THRESHOLD) continue
        this.spaceTimeGrid.addSource({
          x: controller.getWorldX(),
          z: controller.getWorldZ(),
          mass: controller.mass,
        })
      }
      this.spaceTimeGrid.tick(dt)
    }
  }

  dispose(): void {
    this.gameLoop?.stop()

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }

    // Dispose controllers
    this.shuttleController?.dispose()
    for (const controller of this.beltControllers) controller.dispose()
    for (const controller of this.planetControllers) controller.dispose()
    this.spaceTimeGrid?.dispose()
    this.sunController?.dispose()
    this.starField?.dispose()

    // Dispose camera and scene
    this.vehicleCamera?.dispose()
    this.inputManager?.dispose()
    if (this.sceneObjects) {
      this.sceneObjects.renderer.dispose()
    }
  }
}
