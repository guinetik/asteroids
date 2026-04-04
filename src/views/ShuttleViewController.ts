// src/views/ShuttleViewController.ts
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
import { VehicleCamera, SHUTTLE_CAMERA_CONFIG } from '@/three/VehicleCamera'
import { ShuttleController } from '@/three/ShuttleController'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { StarFieldController } from '@/three/StarFieldController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { CelestialBody } from '@/three/CelestialBody'
import { AmbientLight, PointLight, Vector3 } from 'three'

const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1
const AMBIENT_LIGHT_INTENSITY = 0.3
const SUN_LIGHT_INTENSITY = 3
const SUN_LIGHT_DISTANCE = 10000
const SPAWN_MIN_RADIUS = 400
const SPAWN_MAX_RADIUS = 1500

/**
 * Bridges Vue lifecycle to the game loop and Three.js scene.
 * Creates and wires all game systems on init, tears down on dispose.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class ShuttleViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private vehicleCamera: VehicleCamera | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starFieldController: StarFieldController | null = null
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private celestialBodies: CelestialBody[] = []

  /** Called each frame with full shuttle telemetry for HUD display */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Core systems
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // Scene + camera
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)
    this.vehicleCamera = new VehicleCamera(SHUTTLE_CAMERA_CONFIG, this.sceneManager.renderer.domElement)
    this.sceneManager.setCamera(this.vehicleCamera)
    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Stars
    this.starFieldController = new StarFieldController()
    this.sceneManager.addToScene(this.starFieldController.points)

    // Space-time grid on the XZ equator plane — warped by gravity
    this.spaceTimeGrid = new SpaceTimeGrid(4000)
    this.sceneManager.addToScene(this.spaceTimeGrid.mesh)
    this.tickHandler.register(this.spaceTimeGrid, TICK_PRIORITY_ANIMATION)

    // Sun
    const sun = new CelestialBody({
      name: 'Sun',
      mass: 1.0,
      radius: 50,
      color: 0xffcc00,
      glowColor: 0xff8800,
      glowScale: 1.3,
      position: new Vector3(0, 0, 0),
    })
    this.celestialBodies.push(sun)
    this.sceneManager.addToScene(sun.group)
    this.spaceTimeGrid.addSource({ x: 0, z: 0, mass: sun.mass })
    sun.setSpaceTimeGrid(this.spaceTimeGrid)

    // Lighting — point light from sun + dim ambient
    const ambientLight = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sunLight = new PointLight(0xffffee, SUN_LIGHT_INTENSITY, SUN_LIGHT_DISTANCE)
    this.sceneManager.addToScene(ambientLight)
    this.sceneManager.addToScene(sunLight)

    // Shuttle — start at orbital distance from the sun
    this.shuttleController = new ShuttleController(this.inputManager)
    this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)
    for (const body of this.celestialBodies) {
      this.shuttleController.addGravityWell(body)
    }
    await this.shuttleController.load()
    this.shuttleController.thrusterSystem.onAllDepleted = () => {
      this.shuttleController?.respawn()
    }
    const spawnAngle = Math.random() * Math.PI * 2
    const spawnRadius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
    this.shuttleController.group.position.set(
      Math.cos(spawnAngle) * spawnRadius,
      0,
      Math.sin(spawnAngle) * spawnRadius,
    )
    this.sceneManager.addToScene(this.shuttleController.group)
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Thruster effects
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    this.sceneManager.addToScene(this.thrusterController.thrustPoints)
    this.sceneManager.addToScene(this.thrusterController.brakePoints)
    this.sceneManager.addToScene(this.thrusterController.rcsPoints)
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

  dispose(): void {
    this.gameLoop?.stop()
    this.thrusterController?.dispose()
    this.shuttleController?.dispose()
    this.starFieldController?.dispose()
    this.spaceTimeGrid?.dispose()
    for (const body of this.celestialBodies) body.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
