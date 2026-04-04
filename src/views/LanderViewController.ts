/**
 * Bridges Vue lifecycle to the lander demo scene.
 * Flat spacetime grid with the lunar lander — no gravity wells.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd.md
 */
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
import { SceneManager } from '@/three/SceneManager'
import { LanderController } from '@/three/LanderController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { AmbientLight, DirectionalLight } from 'three'

const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1
const AMBIENT_LIGHT_INTENSITY = 0.6
const DIR_LIGHT_INTENSITY = 1.5
const GRID_SIZE = 2000

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

  /** Called each frame with lander telemetry for HUD display */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
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

    // Lander — start at origin
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setSpaceTimeGrid(this.spaceTimeGrid)
    await this.landerController.load()
    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.setShuttleRef(this.landerController.group)
    this.tickHandler.register(this.landerController, TICK_PRIORITY_PHYSICS)

    // One-shot action bridge
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    if (this.landerController && this.onTelemetry) {
      const ts = this.landerController.thrusterSystem
      this.onTelemetry({
        speed: this.landerController.speed,
        heading: this.landerController.heading,
        posX: this.landerController.position.x,
        posZ: this.landerController.position.z,
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

  dispose(): void {
    this.gameLoop?.stop()
    this.landerController?.dispose()
    this.spaceTimeGrid?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
