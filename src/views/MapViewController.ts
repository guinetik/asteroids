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
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import { ORBIT_SCALE } from '@/lib/planets/constants'

/** Tick priority for the compositor (runs after animation, before render). */
const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/**
 * Minimum mass (M☉) for a planet to contribute to the space-time grid.
 * Below this, the gravity well is sub-pixel. Filters out terrestrials
 * and dwarf planets, keeping Sun + Jupiter/Saturn/Uranus/Neptune.
 */
const GRID_MASS_THRESHOLD = 1e-5

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
  private spaceTimeGrid: SpaceTimeGrid | null = null
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

    // Planets — Jupiter and Saturn start at opposite sides
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

    // Asteroid belts (async — GLB loading)
    const beltPromises = ASTEROID_BELTS.map((belt) => AsteroidBeltController.create(belt))
    const belts = await Promise.all(beltPromises)
    for (const controller of belts) {
      scene.add(controller.group)
      this.beltControllers.push(controller)
    }

    // Space-time grid (gravity well visualization)
    const kuiperOuterEdge = 2400 * ORBIT_SCALE
    const gridSize = kuiperOuterEdge * 2.2
    const gridDepthScale = 10   // Well depth scale (Sun = 10 units deep)
    const gridWidthScale = 12   // Well width scale — wider so Uranus/Neptune wells are visible
    const gridMassExponent = 0.2 // Compress mass range so planets are visible (vs 0.5 = sqrt)
    this.spaceTimeGrid = new SpaceTimeGrid(gridSize, 200, gridDepthScale, gridWidthScale, gridMassExponent)
    scene.add(this.spaceTimeGrid.mesh)

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

    // Update gravity sources on the space-time grid
    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.clearSources()
      if (this.sunController) {
        this.spaceTimeGrid.addSource({
          x: this.sunController.getWorldX(),
          z: this.sunController.getWorldZ(),
          mass: this.sunController.mass,
        })
      }
      // Only gas/ice giants have enough mass to visibly warp the grid
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
    for (const controller of this.beltControllers) controller.dispose()
    for (const controller of this.planetControllers) controller.dispose()
    this.spaceTimeGrid?.dispose()
    this.sunController?.dispose()
    this.starField?.dispose()

    // Dispose scene
    if (this.sceneObjects) {
      this.sceneObjects.controls.dispose()
      this.sceneObjects.renderer.dispose()
    }
  }
}
