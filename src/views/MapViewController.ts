/**
 * Lifecycle controller for the map view.
 *
 * Creates and wires all planetarium systems: scene setup, sun,
 * planets, asteroid belts, starfield. Drives simulation time
 * and renders via EffectComposer each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-map-view-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { TICK_PRIORITY_ANIMATION, TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import { DEFAULT_TIME_SCALE } from '@/lib/planets/constants'
import { SUN, PLANETS, ASTEROID_BELTS } from '@/lib/planets/catalog'
import { createMapScene, handleMapResize, type MapSceneObjects } from '@/three/MapSceneSetup'
import { StarFieldController } from '@/three/StarFieldController'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'

/** Tick priority for the compositor (runs after animation, before render). */
const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/**
 * Bridges Vue lifecycle to the map scene.
 */
export class MapViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private sceneObjects: MapSceneObjects | null = null
  private starField: StarFieldController | null = null
  private sunController: SunController | null = null
  private planetControllers: PlanetSystemController[] = []
  private beltControllers: AsteroidBeltController[] = []
  private simTime = 0
  private resizeHandler: (() => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Create canvas
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    // Scene setup
    this.sceneObjects = createMapScene(canvas)
    const { scene } = this.sceneObjects

    // Tick handler
    this.tickHandler = new TickHandler()

    // Starfield
    this.starField = new StarFieldController()
    scene.add(this.starField.points)

    // Sun
    this.sunController = new SunController(SUN)
    scene.add(this.sunController.group)

    // Planets
    for (const planet of PLANETS) {
      const controller = new PlanetSystemController(planet)
      scene.add(controller.group)
      for (const line of controller.orbitLines) {
        scene.add(line)
      }
      this.planetControllers.push(controller)
    }

    // Asteroid belts
    for (const belt of ASTEROID_BELTS) {
      const controller = new AsteroidBeltController(belt)
      scene.add(controller.group)
      this.beltControllers.push(controller)
    }

    // Register tick: this controller drives simTime and passes to children
    this.tickHandler.register(this, TICK_PRIORITY_ANIMATION)

    // Register compositor render as the final tick
    const compositorTickable: Tickable = {
      tick: () => {
        this.sceneObjects!.controls.update()
        this.sceneObjects!.composer.render()
      },
    }
    this.tickHandler.register(compositorTickable, TICK_PRIORITY_COMPOSIT)

    // Resize handling
    this.resizeHandler = () => {
      if (this.sceneObjects) handleMapResize(this.sceneObjects)
    }
    window.addEventListener('resize', this.resizeHandler)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(dt: number): void {
    this.simTime += dt * DEFAULT_TIME_SCALE

    // Tick sun
    this.sunController?.tick(dt, this.simTime)

    // Tick planets
    for (const controller of this.planetControllers) {
      controller.tick(dt, this.simTime)
    }

    // Tick belts
    for (const controller of this.beltControllers) {
      controller.tick(dt, this.simTime)
    }
  }

  dispose(): void {
    this.gameLoop?.stop()

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }

    // Dispose controllers
    for (const controller of this.beltControllers) controller.dispose()
    for (const controller of this.planetControllers) controller.dispose()
    this.sunController?.dispose()
    this.starField?.dispose()

    // Dispose scene
    if (this.sceneObjects) {
      this.sceneObjects.controls.dispose()
      this.sceneObjects.renderer.dispose()
    }
  }
}
