// src/views/HomeViewController.ts
import type { Tickable } from '@/lib/Tickable'
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
import { ShuttleController } from '@/three/ShuttleController'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { StarFieldController } from '@/three/StarFieldController'
import { AmbientLight, DirectionalLight } from 'three'

const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1
const AMBIENT_LIGHT_INTENSITY = 1
const DIR_LIGHT_INTENSITY = 2
const DIR_LIGHT_X = 5
const DIR_LIGHT_Y = 10
const DIR_LIGHT_Z = 5

/**
 * Bridges Vue lifecycle to the game loop and Three.js scene.
 * Creates and wires all game systems on init, tears down on dispose.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class HomeViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starFieldController: StarFieldController | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Stars
    this.starFieldController = new StarFieldController()
    this.sceneManager.addToScene(this.starFieldController.points)

    // Lighting
    const ambientLight = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const dirLight = new DirectionalLight(0xffffff, DIR_LIGHT_INTENSITY)
    dirLight.position.set(DIR_LIGHT_X, DIR_LIGHT_Y, DIR_LIGHT_Z)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(dirLight)

    // Shuttle
    this.shuttleController = new ShuttleController(this.inputManager)
    await this.shuttleController.load()
    this.sceneManager.addToScene(this.shuttleController.group)
    this.sceneManager.setShuttleRef(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Thruster effects
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    this.sceneManager.addToScene(this.thrusterController.thrustPoints)
    this.sceneManager.addToScene(this.thrusterController.brakePoints)
    this.tickHandler.register(this.thrusterController, TICK_PRIORITY_ANIMATION)

    // One-shot action bridge (runs just after input)
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(_dt: number): void {
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
    if (this.inputManager?.wasActionPressed('toggleCamera')) {
      this.sceneManager?.toggleCamera()
    }
  }

  dispose(): void {
    this.gameLoop?.stop()
    this.thrusterController?.dispose()
    this.shuttleController?.dispose()
    this.starFieldController?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
