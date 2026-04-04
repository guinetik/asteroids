/**
 * Bridges Vue lifecycle to the FPS demo scene.
 * Terrain grid only — testbed for first-person EVA mechanics.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { VehicleCamera } from '@/three/VehicleCamera'
import type { VehicleCameraConfig } from '@/three/VehicleCamera'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight, Vector3 } from 'three'

const AMBIENT_LIGHT_INTENSITY = 0.4
const DIR_LIGHT_INTENSITY = 1.2
const GRID_SIZE = 2000
const TERRAIN_SEED = 77
const TERRAIN_RESOLUTION = 128

/** Eye-level free-look camera for FPS prototyping. */
const FPS_CAMERA_CONFIG: VehicleCameraConfig = {
  idleOffset: new Vector3(0, 12, 30),
  lerpSpeed: 5,
  idleTimeout: 999,
  minY: 2,
  fov: 75,
}

/** Surface features for the demo asteroid. */
const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.5,
  craterMaxScale: 0.2,
  boulderDensity: 0.4,
  ridgeFrequency: 0.4,
  roughness: 0.6,
  dustCoverage: 0.3,
}

/**
 * Minimal FPS demo scene — terrain grid with lighting.
 * Placeholder for first-person EVA mechanics development.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
export class FpsViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private sceneManager: SceneManager | null = null
  private vehicleCamera: VehicleCamera | null = null
  private terrainGrid: TerrainGrid | null = null

  async init(container: HTMLElement): Promise<void> {
    this.tickHandler = new TickHandler()

    // Scene + camera
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.vehicleCamera = new VehicleCamera(FPS_CAMERA_CONFIG, this.sceneManager.renderer.domElement)
    this.sceneManager.setCamera(this.vehicleCamera)
    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Procedural terrain
    const heightmap = generateTerrain(TEST_SURFACE, {
      seed: TERRAIN_SEED,
      resolution: TERRAIN_RESOLUTION,
      worldSize: GRID_SIZE,
    })
    this.terrainGrid = new TerrainGrid(heightmap)
    this.sceneManager.addToScene(this.terrainGrid.mesh)

    // Lighting
    const ambient = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    // No telemetry yet
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.terrainGrid?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
  }
}
