/**
 * Bridges Vue lifecycle to the lander demo scene.
 * Flat spacetime grid with the lunar lander — no gravity wells.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { LANDER_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_ANIMATION,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { LanderController } from '@/three/LanderController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { AmbientLight, DirectionalLight } from 'three'

const AMBIENT_LIGHT_INTENSITY = 0.6
const DIR_LIGHT_INTENSITY = 1.5
const GRID_SIZE = 2000
const SPAWN_HEIGHT = 80

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
  private landerController: LanderController | null = null
  private spaceTimeGrid: SpaceTimeGrid | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(LANDER_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Flat spacetime grid — no gravity sources
    this.spaceTimeGrid = new SpaceTimeGrid(GRID_SIZE)
    this.sceneManager.addToScene(this.spaceTimeGrid.mesh)
    this.tickHandler.register(this.spaceTimeGrid, TICK_PRIORITY_ANIMATION)

    // Lighting — directional sun + ambient fill
    const ambientLight = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const dirLight = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    dirLight.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(dirLight)

    // Lander — spawn above the grid so gravity is visible
    this.landerController = new LanderController(this.inputManager)
    await this.landerController.load()
    this.landerController.group.position.y = SPAWN_HEIGHT
    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.addToScene(this.landerController.flameEmitter.points)
    this.sceneManager.setShuttleRef(this.landerController.group)
    this.tickHandler.register(this.landerController, TICK_PRIORITY_PHYSICS)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    // Telemetry will be wired once thruster system is built
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.landerController?.dispose()
    this.spaceTimeGrid?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
