/**
 * Bridges Vue lifecycle to the FPS demo scene.
 * Terrain grid + first-person player with O2-fueled movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { FpsCamera } from '@/three/FpsCamera'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { AmbientLight, DirectionalLight } from 'three'
import playerConfigJson from '@/data/fps/player-config.json'

const AMBIENT_LIGHT_INTENSITY = 0.4
const DIR_LIGHT_INTENSITY = 1.2
const GRID_SIZE = 2000
const TERRAIN_SEED = 77
const TERRAIN_RESOLUTION = 128
const SPAWN_HEIGHT = 5

const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.5,
  craterMaxScale: 0.2,
  boulderDensity: 0.4,
  ridgeFrequency: 0.4,
  roughness: 0.6,
  dustCoverage: 0.3,
}

/**
 * FPS demo scene — terrain grid with first-person player movement.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-fps-movement-design.md
 */
export class FpsViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private terrainGrid: TerrainGrid | null = null

  /** Called each frame with player telemetry for HUD display. */
  onTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    const config = playerConfigJson as FpsPlayerConfig

    // Input
    this.inputManager = new InputManager(FPS_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Terrain
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

    // FPS Camera
    this.fpsCamera = new FpsCamera(config.camera)

    // Player
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      heightmap,
    )
    this.playerController.group.position.set(0, SPAWN_HEIGHT, 0)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)

    // Use FpsCamera's perspective camera for rendering
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Death handler — reset scene
    this.playerController.onDeath = () => {
      window.location.reload()
    }

    // Register tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - 2)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Pointer lock
    this.setupPointerLock()

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    // Feed player velocity to camera for bob/wobble
    if (this.playerController && this.fpsCamera) {
      this.fpsCamera.setVelocity(
        this.playerController.speed,
        this.playerController.body.velocityY,
      )
    }

    if (this.playerController && this.onTelemetry) {
      const ts = this.playerController.thrusterSystem
      this.onTelemetry({
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
        sprintCharge: ts.getState('sprint').charge,
        sprintCapacity: ts.getState('sprint').capacity,
        speed: this.playerController.speed,
        grounded: this.playerController.grounded,
        deathTimer: this.playerController.deathTimer,
      })
    }
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.sceneManager?.renderer.domElement.requestPointerLock()
  }

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement

    // Mouse move → camera look
    const onMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }
    document.addEventListener('mousemove', onMouseMove)

    // Pointer lock change
    const onLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      this.onPointerLockChange?.(locked)
    }
    document.addEventListener('pointerlockchange', onLockChange)

    // Click to lock
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
      }
    })

    // Auto-lock
    canvas.requestPointerLock()
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.terrainGrid?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
