/**
 * Bridges Vue lifecycle to the lander demo scene.
 * Flat spacetime grid with the lunar lander — no gravity wells.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { LANDER_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { VehicleCamera, LANDER_CAMERA_CONFIG } from '@/three/VehicleCamera'
import { LanderController } from '@/three/LanderController'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight } from 'three'

const AMBIENT_LIGHT_INTENSITY = 0.6
const DIR_LIGHT_INTENSITY = 1.5
const GRID_SIZE = 2000
const SPAWN_HEIGHT = 80
const TERRAIN_SEED = 42
const TERRAIN_RESOLUTION = 128

/** Temporary test surface — will come from asteroid data later */
const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

/**
 * Bridges Vue lifecycle to the lander demo scene.
 * Creates a flat spacetime grid and the lander for testing flight controls.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
export class LanderViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private vehicleCamera: VehicleCamera | null = null
  private landerController: LanderController | null = null
  private terrainGrid: TerrainGrid | null = null

  /** Called each frame with lander telemetry for HUD display */
  onTelemetry: ((telemetry: LanderTelemetry) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(LANDER_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene + camera
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.vehicleCamera = new VehicleCamera(LANDER_CAMERA_CONFIG, this.sceneManager.renderer.domElement)
    this.sceneManager.setCamera(this.vehicleCamera)
    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Procedural asteroid terrain from SurfaceFeatures
    const heightmap = generateTerrain(TEST_SURFACE, {
      seed: TERRAIN_SEED,
      resolution: TERRAIN_RESOLUTION,
      worldSize: GRID_SIZE,
    })
    this.terrainGrid = new TerrainGrid(heightmap)
    this.sceneManager.addToScene(this.terrainGrid.mesh)

    // Lighting — directional sun + ambient fill
    const ambientLight = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const dirLight = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    dirLight.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(dirLight)

    // Lander — spawn above the grid so gravity is visible
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(heightmap)
    await this.landerController.load()
    this.landerController.group.position.y = SPAWN_HEIGHT
    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.addToScene(this.landerController.flameEmitter.points)
    for (const emitter of this.landerController.rcsEmitters.values()) {
      this.sceneManager.addToScene(emitter.points)
    }
    this.vehicleCamera.setTarget(this.landerController.group)
    this.tickHandler.register(this.landerController, TICK_PRIORITY_PHYSICS)

    // Telemetry bridge (runs just after input)
    this.tickHandler.register(this, TICK_PRIORITY_INPUT + 1)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    if (this.landerController && this.onTelemetry) {
      const ts = this.landerController.thrusterSystem
      this.onTelemetry({
        altitude: this.landerController.position.y,
        velocityY: this.landerController.body.velocityY,
        posX: this.landerController.position.x,
        posZ: this.landerController.position.z,
        fuelLevel: ts.fuelLevel,
        fuelCapacity: ts.fuelCapacity,
        mainEngineCharge: ts.getState('mainEngine').charge,
        mainEngineCapacity: ts.getState('mainEngine').capacity,
        rcsCharge: ts.getState('rcs').charge,
        rcsCapacity: ts.getState('rcs').capacity,
        hp: this.landerController.hp,
        maxHp: this.landerController.maxHp,
      })
    }
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.landerController?.dispose()
    this.terrainGrid?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
