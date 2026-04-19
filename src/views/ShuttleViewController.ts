// src/views/ShuttleViewController.ts
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import { DevConsole } from '@/lib/devConsole'
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
import { CityModel } from '@/three/CityModel'
import { RelayAntennaController } from '@/three/RelayAntennaController'
import { SatelliteModel } from '@/three/SatelliteModel'
import { EvaSession, type EvaHugeScaleTarget } from '@/three/EvaSession'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { AmbientLight, PointLight, Vector3 } from 'three'
import { PortalArrivalSequence } from '@/three/PortalArrivalSequence'
import { PortalBoundarySystem } from '@/three/PortalBoundarySystem'
import { VibePortal } from '@/lib/portal'
import { computeShuttleBaseFuelDrain } from '@/lib/shuttleBaseFuelDrain'

const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1
const AMBIENT_LIGHT_INTENSITY = 0.3
const SUN_LIGHT_INTENSITY = 3
const SUN_LIGHT_DISTANCE = 10000
const SPAWN_MIN_RADIUS = 400
const SPAWN_MAX_RADIUS = 1500

/** Visual radius of the shuttle-scene sun sphere (passed to {@link CelestialBody} as `radius`). */
const SHUTTLE_SUN_VISUAL_RADIUS = 50

/** World units between the sun surface and the city prop’s pivot along +Y. */
const CITY_CLEARANCE_ABOVE_SUN_SURFACE = 4

/** Uniform scale for `city.glb` when `?city=true`; tune if asset units change. */
const SHUTTLE_CITY_MODEL_SCALE = 10

/** Distance from the shuttle's spawn point to place the prototype relay antenna. */
const RELAY_ANTENNA_SPAWN_DISTANCE = 80

/** Distance from the shuttle's spawn point to place the GLB satellite. */
const GLB_SATELLITE_SPAWN_DISTANCE = 80

/** Lateral offset between the procedural relay and the GLB satellite so both are visible. */
const GLB_SATELLITE_LATERAL_OFFSET = 40

/** Uniform scale for `satellite.glb` (10.73 units native); tune if asset units change. */
const GLB_SATELLITE_MODEL_SCALE = 0.06

/** Local rotation (radians) applied to satellite.glb to make its panels sit as wings. */
const GLB_SATELLITE_LOCAL_ROTATION = { x: 0, y: 0, z: Math.PI / 2 }

/** Scale multiplier applied to the shuttle while the player is EVA. */
const EVA_HUGE_SHUTTLE = 2.5

/** Scale multiplier applied to the relay antenna prop while EVA. */
const EVA_HUGE_RELAY = 2.5

/** Scale multiplier applied to the GLB satellite while EVA. */
const EVA_HUGE_SATELLITE = 2.5

/** Scale multiplier applied to the sun while EVA (even bigger). */
const EVA_HUGE_SUN = 4

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
  private portalArrival: PortalArrivalSequence | null = null
  private boundarySystem: PortalBoundarySystem | null = null
  private cityModel: CityModel | null = null
  private relayAntenna: RelayAntennaController | null = null
  private satelliteModel: SatelliteModel | null = null
  private evaSession: EvaSession | null = null
  private currentActionPrompt: string | null = null

  /** Called each frame during EVA with FPS telemetry for the helmet HUD. */
  onEvaTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called when EVA mode enters or exits (true = entered). */
  onEvaModeChange: ((active: boolean) => void) | null = null

  /** Called each frame with full shuttle telemetry for HUD display */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  /**
   * Mount the shuttle scene into `container`.
   *
   * @param container - DOM element for the renderer
   * @param options - Optional flags (e.g. dev city prop)
   */
  async init(
    container: HTMLElement,
    options?: {
      /** When true, spawn `city.glb` above the sun (`?city=true` from the view). */
      city?: boolean
    },
  ): Promise<void> {
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
    this.starFieldController = new StarFieldController({ count: 4000, radius: 40000, size: 1.5 })
    this.sceneManager.addToScene(this.starFieldController.points)

    // Space-time grid on the XZ equator plane — warped by gravity
    this.spaceTimeGrid = new SpaceTimeGrid(4000)
    this.sceneManager.addToScene(this.spaceTimeGrid.mesh)
    this.tickHandler.register(this.spaceTimeGrid, TICK_PRIORITY_ANIMATION)

    // Sun
    const sun = new CelestialBody({
      name: 'Sun',
      mass: 1.0,
      radius: SHUTTLE_SUN_VISUAL_RADIUS,
      color: 0xffcc00,
      glowColor: 0xff8800,
      glowScale: 1.3,
      position: new Vector3(0, 0, 0),
    })
    this.celestialBodies.push(sun)
    this.sceneManager.addToScene(sun.group)
    this.spaceTimeGrid.addSource({ x: 0, z: 0, mass: sun.mass })
    sun.setSpaceTimeGrid(this.spaceTimeGrid)

    if (options?.city) {
      this.cityModel = await CityModel.create({ scale: SHUTTLE_CITY_MODEL_SCALE })
      this.cityModel.placeOnTopOfSphere(SHUTTLE_SUN_VISUAL_RADIUS, CITY_CLEARANCE_ABOVE_SUN_SURFACE)
      this.sceneManager.addToScene(this.cityModel.group)
    }

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
    // Portal arrival or normal spawn
    this.portalArrival = new PortalArrivalSequence()
    const arrived = this.portalArrival.tryArrive(
      this.shuttleController,
      this.spaceTimeGrid,
      {
        addToScene: (obj) => this.sceneManager!.addToScene(obj),
        removeFromScene: (obj) => this.sceneManager!.removeFromScene(obj),
        registerTick: (t, p) => this.tickHandler!.register(t, p),
        unregisterTick: (t) => this.tickHandler!.unregister(t),
      },
      TICK_PRIORITY_ANIMATION,
    )
    if (!arrived) {
      const spawnAngle = Math.random() * Math.PI * 2
      const spawnRadius = SPAWN_MIN_RADIUS + Math.random() * (SPAWN_MAX_RADIUS - SPAWN_MIN_RADIUS)
      this.shuttleController.group.position.set(
        Math.cos(spawnAngle) * spawnRadius,
        0,
        Math.sin(spawnAngle) * spawnRadius,
      )
    }
    this.sceneManager.addToScene(this.shuttleController.group)
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Prototype relay antenna prop — Voyager-style satellite for future EVA maintenance mission.
    // Placed in front of the shuttle's spawn so it's visible right away.
    this.relayAntenna = new RelayAntennaController()
    this.relayAntenna.group.scale.setScalar(0.45)
    const shuttlePos = this.shuttleController.group.position
    const forward = new Vector3(-shuttlePos.x, 0, -shuttlePos.z).normalize()
    this.relayAntenna.group.position.set(
      shuttlePos.x + forward.x * RELAY_ANTENNA_SPAWN_DISTANCE,
      shuttlePos.y,
      shuttlePos.z + forward.z * RELAY_ANTENNA_SPAWN_DISTANCE,
    )
    // Aim the dish at the shuttle (internal model faces -Z, which lookAt aligns to the target).
    this.relayAntenna.group.lookAt(shuttlePos)
    this.sceneManager.addToScene(this.relayAntenna.group)
    this.tickHandler.register(this.relayAntenna, TICK_PRIORITY_ANIMATION)

    // GLB satellite — placed alongside the procedural relay, offset laterally so both read clearly.
    this.satelliteModel = await SatelliteModel.create({
      scale: GLB_SATELLITE_MODEL_SCALE,
      rotation: GLB_SATELLITE_LOCAL_ROTATION,
    })
    const lateral = new Vector3(-forward.z, 0, forward.x) // right-hand perpendicular on XZ
    this.satelliteModel.group.position.set(
      shuttlePos.x + forward.x * GLB_SATELLITE_SPAWN_DISTANCE + lateral.x * GLB_SATELLITE_LATERAL_OFFSET,
      shuttlePos.y,
      shuttlePos.z + forward.z * GLB_SATELLITE_SPAWN_DISTANCE + lateral.z * GLB_SATELLITE_LATERAL_OFFSET,
    )
    this.satelliteModel.group.lookAt(shuttlePos)
    this.sceneManager.addToScene(this.satelliteModel.group)

    // Outbound portal walls at grid edges
    this.boundarySystem = new PortalBoundarySystem(
      4000,
      this.shuttleController.group.position,
      () => ({
        speed: this.shuttleController?.speed,
        rotation_y: this.shuttleController?.heading,
      }),
    )
    for (const wall of this.boundarySystem.walls) {
      this.sceneManager.addToScene(wall)
    }
    this.tickHandler.register(this.boundarySystem, TICK_PRIORITY_ANIMATION)
    this.boundarySystem.onDepart = (state) => {
      new VibePortal().depart(state as Record<string, string | number>)
    }

    // Thruster effects
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    this.sceneManager.addToScene(this.thrusterController.thrustPoints)
    this.sceneManager.addToScene(this.thrusterController.brakePoints)
    this.sceneManager.addToScene(this.thrusterController.rcsPoints)
    this.tickHandler.register(this.thrusterController, TICK_PRIORITY_ANIMATION)

    // One-shot action bridge (runs just after input)
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // EVA session — portable orchestrator. Runs after input so evaToggle fires on the right frame.
    this.evaSession = new EvaSession({
      sceneManager: this.sceneManager,
      tickHandler: this.tickHandler,
      inputManager: this.inputManager,
      getVehicle: () => this.shuttleController,
      getPoi: () => this.relayAntenna?.group.position ?? null,
      getHugeScaleTargets: () => this.buildEvaHugeScaleTargets(),
      spawnOffsetScale: EVA_HUGE_SHUTTLE,
      onEvaModeChange: (active) => this.onEvaModeChange?.(active),
      onEvaTelemetry: (t) => this.onEvaTelemetry?.(t),
      onActionPrompt: (p) => {
        this.currentActionPrompt = p
      },
    })
    this.tickHandler.register(this.evaSession, ONE_SHOT_PRIORITY + 1)

    // --- Dev tools ---
    DevConsole.register('ShuttleView', {
      toggleDoors: () => this.shuttleController?.toggleDoors(),
      freeze: () => this.shuttleController?.freeze(),
      unfreeze: () => this.shuttleController?.unfreeze(),
    })

    // Start the loop
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  tick(dt: number): void {
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
    }
    const evaActive = this.evaSession?.isActive ?? false
    if (this.shuttleController && !this.shuttleController.dead && !evaActive) {
      this.shuttleController.thrusterSystem.consumeFuel(computeShuttleBaseFuelDrain(dt, true))
    }
    if (this.shuttleController && this.onTelemetry) {
      const ts = this.shuttleController.thrusterSystem
      this.onTelemetry({
        speed: this.shuttleController.speed,
        heading: this.shuttleController.heading,
        posX: this.shuttleController.position.x,
        posZ: this.shuttleController.position.z,
        actionPrompt: this.currentActionPrompt,
        fuelLevel: ts.fuelLevel,
        fuelCapacity: ts.fuelCapacity,
        thrustCharge: ts.getState('thrust').charge,
        thrustCapacity: ts.getState('thrust').capacity,
        brakeCharge: ts.getState('brake').charge,
        brakeCapacity: ts.getState('brake').capacity,
        rcsCharge: ts.getState('rcs').charge,
        rcsCapacity: ts.getState('rcs').capacity,
        adriftCountdown: -1,
        hp: 100,
        maxHp: 100,
        temperature: 0,
        temperatureVisible: false,
        damageIntensity: 0,
        compassBearings: [],
      })
    }
  }

  private buildEvaHugeScaleTargets(): EvaHugeScaleTarget[] {
    const targets: EvaHugeScaleTarget[] = []
    if (this.shuttleController) targets.push({ object: this.shuttleController.group, factor: EVA_HUGE_SHUTTLE })
    if (this.relayAntenna) targets.push({ object: this.relayAntenna.group, factor: EVA_HUGE_RELAY })
    if (this.satelliteModel) targets.push({ object: this.satelliteModel.group, factor: EVA_HUGE_SATELLITE })
    const sun = this.celestialBodies[0]
    if (sun) targets.push({ object: sun.group, factor: EVA_HUGE_SUN })
    return targets
  }

  dispose(): void {
    this.evaSession?.dispose()
    this.evaSession = null
    DevConsole.unregister('ShuttleView')
    this.gameLoop?.stop()
    if (this.cityModel) {
      this.sceneManager?.removeFromScene(this.cityModel.group)
      this.cityModel.dispose()
      this.cityModel = null
    }
    if (this.relayAntenna) {
      this.sceneManager?.removeFromScene(this.relayAntenna.group)
      this.relayAntenna.dispose()
      this.relayAntenna = null
    }
    if (this.satelliteModel) {
      this.sceneManager?.removeFromScene(this.satelliteModel.group)
      this.satelliteModel.dispose()
      this.satelliteModel = null
    }
    this.thrusterController?.dispose()
    this.portalArrival?.dispose()
    this.boundarySystem?.dispose()
    this.shuttleController?.dispose()
    this.starFieldController?.dispose()
    this.spaceTimeGrid?.dispose()
    for (const body of this.celestialBodies) body.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
