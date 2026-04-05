/**
 * Lifecycle controller for the map view.
 *
 * Creates and wires all planetarium systems: scene setup, sun,
 * planets, asteroid belts, starfield, and the player shuttle.
 * The shuttle serves as the player character in the game hub,
 * navigating the solar system orrery.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import type { Tickable } from '@/lib/Tickable'
import type { ShuttleTelemetry, GravityWarningState } from '@/lib/ShuttleTelemetry'
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
import { DEFAULT_TIME_SCALE, ORBIT_SCALE } from '@/lib/planets/constants'
import { SUN, PLANETS, ASTEROID_BELTS } from '@/lib/planets/catalog'
import { createMapScene, handleMapResize, type MapSceneObjects } from '@/three/MapSceneSetup'
import { StarFieldController } from '@/three/StarFieldController'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import * as THREE from 'three'
import { OrbitCaptureSystem, type OrbitHudState } from '@/lib/orbitCapture'
import { gravityAt, influenceRadius, eventHorizonRadius, type GravityConfig } from '@/lib/physics/gravity'
import type { GravityWell } from '@/three/ShuttleController'
import type { GravitySource } from '@/lib/physics/gravity'
import { ShuttleController, MAP_PHYSICS } from '@/three/ShuttleController'
import mapGravityData from '@/data/shuttle/map-gravity.json'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { VehicleCamera, MAP_CAMERA_CONFIG, MAP_ORBIT_CAMERA_CONFIG, MAP_INSPECT_CAMERA_CONFIG, MAP_DEATH_CAMERA_CONFIG } from '@/three/VehicleCamera'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { PortalArrivalSequence } from '@/three/PortalArrivalSequence'
import { PortalBoundarySystem } from '@/three/PortalBoundarySystem'
import { createGravityDistortionPass } from '@/three/GravityDistortionPass'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VibePortal } from '@/lib/portal'

/** Tick priority for the compositor (runs after animation, before render). */
const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/** One-shot action bridge runs just after input. */
const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1

/**
 * Minimum mass (M☉) for a planet to contribute to the space-time grid.
 * Below this, the gravity well is sub-pixel. Filters out terrestrials
 * and dwarf planets, keeping Sun + Jupiter/Saturn/Uranus/Neptune.
 */
const GRID_MASS_THRESHOLD = 1e-5

/**
 * Visual scale for the shuttle in the map view.
 * The shuttle model is ~14 units at default scale; this brings it to ~0.14 units,
 * smaller than most planet display radii but clearly visible.
 */
const MAP_SHUTTLE_SCALE = 0.01

/** Offset behind Earth so the shuttle doesn't overlap the planet mesh. */
const SPAWN_OFFSET_BEHIND_EARTH = 7.5

/** Duration in seconds for the approach animation lerp. */
const APPROACH_DURATION = 1.5

/** Seconds to fully charge slingshot (0 → 1). */
const SLINGSHOT_CHARGE_TIME = 2.0

/** Seconds without fuel in free flight before game over (adrift). */
const ADRIFT_TIMEOUT = 60

/** Fuel units restored per second while orbiting Earth. */
const EARTH_REFUEL_RATE = 50

/** Maximum arrow length at full charge (in shuttle local space, pre-scale). */
const ARROW_MAX_LENGTH = 300
const ARROW_COLOR_SAFE = 0x00ffff
const ARROW_COLOR_BLOCKED = 0xff3333
const ARROW_HEAD_LENGTH = 40
const ARROW_HEAD_WIDTH = 20
/** If forward dot (shuttle→planet) > this, aim is blocked (pointing at planet). */
const AIM_BLOCK_THRESHOLD = 0.3

/** Number of segments for the dashed orbit ring. */
const ORBIT_RING_SEGMENTS = 64

/** Orbit ring visual style. */
const ORBIT_RING_COLOR = 0x00ccff
const ORBIT_RING_OPACITY = 0.4
const ORBIT_RING_DASH_SIZE = 0.3
const ORBIT_RING_GAP_SIZE = 0.2

/** Map-scale gravity tuning loaded from JSON. */
const MAP_GRAVITY_CONFIG: GravityConfig = {
  gravityConstant: mapGravityData.gravityConstant,
  minDistance: mapGravityData.minDistance,
  influenceScale: mapGravityData.influenceScale,
  eventHorizonScale: mapGravityData.eventHorizonScale,
}

/**
 * Wraps a GravitySource into a GravityWell that ShuttleController can consume,
 * using map-scale gravity config.
 */
function makeGravityWell(source: GravitySource, config: GravityConfig): GravityWell & GravitySource {
  return {
    mass: source.mass,
    getWorldX: () => source.getWorldX(),
    getWorldZ: () => source.getWorldZ(),
    getGravityAt(pos: THREE.Vector3): THREE.Vector3 {
      const g = gravityAt(source.getWorldX(), source.getWorldZ(), source.mass, pos.x, pos.z, config)
      return new THREE.Vector3(g.ax, 0, g.az)
    },
  }
}

/**
 * Bridges Vue lifecycle to the map scene with player shuttle.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
export class MapViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneObjects: MapSceneObjects | null = null
  private vehicleCamera: VehicleCamera | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starField: StarFieldController | null = null
  private sunController: SunController | null = null
  private planetControllers: PlanetSystemController[] = []
  private beltControllers: AsteroidBeltController[] = []
  private spaceTimeGrid: SpaceTimeGrid | null = null
  private simTime = 0
  private resizeHandler: (() => void) | null = null

  private orbitSystem: OrbitCaptureSystem | null = null
  private orbitRing: THREE.LineLoop | null = null
  private approachStartPos: THREE.Vector3 | null = null
  private approachProgress = 0
  private yRecovery = false
  private slingshotCharge = 0
  private launchArrow: THREE.ArrowHelper | null = null
  private inspectMode = false
  private portalArrival: PortalArrivalSequence | null = null
  private boundarySystem: PortalBoundarySystem | null = null
  private gravityPass: ShaderPass | null = null
  private adriftTimer = 0

  /** Called each frame with full shuttle telemetry for HUD display. */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  /** Called each frame with orbit-capture HUD state. */
  onOrbitState: ((state: OrbitHudState) => void) | null = null

  /** Called each frame with gravity warning state for HUD. */
  onGravityWarning: ((state: GravityWarningState) => void) | null = null

  /** Called when shuttle dies — shows death overlay. */
  onDeathOverlay: ((visible: boolean, cause: string) => void) | null = null

  async init(container: HTMLElement): Promise<void> {
    // Create canvas
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    // Scene setup (renderer, scene, bloom, temporary controls)
    this.sceneObjects = createMapScene(canvas)
    const { scene } = this.sceneObjects

    // --- Input ---
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // --- Camera: replace OrbitControls with VehicleCamera ---
    this.sceneObjects.controls.dispose()
    this.vehicleCamera = new VehicleCamera(MAP_CAMERA_CONFIG, canvas)

    // Move camera fill light from the map scene's original camera to vehicle camera
    const oldCamera = this.sceneObjects.camera
    const cameraLight = oldCamera.children[0]
    if (cameraLight) {
      oldCamera.remove(cameraLight)
      this.vehicleCamera.camera.add(cameraLight)
    }
    scene.remove(oldCamera)
    scene.add(this.vehicleCamera.camera)

    // Swap the EffectComposer's render pass to use the vehicle camera
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    renderPass.camera = this.vehicleCamera.camera

    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_COMPOSIT - 1)

    // --- Starfield ---
    this.starField = new StarFieldController()
    scene.add(this.starField.points)

    // --- Sun ---
    this.sunController = new SunController(SUN)
    scene.add(this.sunController.group)

    // --- Planets ---
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

    // --- Asteroid belts (async — GLB loading) ---
    const beltPromises = ASTEROID_BELTS.map((belt) => AsteroidBeltController.create(belt))
    const belts = await Promise.all(beltPromises)
    for (const controller of belts) {
      scene.add(controller.group)
      this.beltControllers.push(controller)
    }

    // --- Space-time grid (gravity well visualization) ---
    const kuiperOuterEdge = 2400 * ORBIT_SCALE
    const gridSize = kuiperOuterEdge * 2.2
    const gridDepthScale = 40
    const gridWidthScale = 150
    const gridMassExponent = 0.2
    this.spaceTimeGrid = new SpaceTimeGrid(gridSize, 200, gridDepthScale, gridWidthScale, gridMassExponent)
    scene.add(this.spaceTimeGrid.mesh)

    // --- Shuttle (player character) ---
    this.shuttleController = new ShuttleController(this.inputManager, MAP_PHYSICS, MAP_GRAVITY_CONFIG)
    this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)

    // Register gravity wells — Sun + all planets
    if (this.sunController) {
      this.shuttleController.addGravityWell(makeGravityWell(this.sunController, MAP_GRAVITY_CONFIG))
    }
    for (const controller of this.planetControllers) {
      this.shuttleController.addGravityWell(makeGravityWell(controller, MAP_GRAVITY_CONFIG))
    }

    this.shuttleController.onDeath = () => {
      this.vehicleCamera?.setConfig(MAP_DEATH_CAMERA_CONFIG)
      this.onDeathOverlay?.(true, 'Solar Radiation')
    }

    await this.shuttleController.load()
    this.shuttleController.group.scale.setScalar(MAP_SHUTTLE_SCALE)

    // Spawn next to Earth — find its controller by matching PLANETS order
    const earthIndex = PLANETS.findIndex((p) => p.id === 'earth')
    const earthController = this.planetControllers[earthIndex]
    if (earthController) {
      const ex = earthController.getWorldX()
      const ez = earthController.getWorldZ()
      // Place slightly behind Earth (away from the Sun)
      const awayFromSun = Math.atan2(ez, ex)
      this.shuttleController.group.position.set(
        ex + Math.cos(awayFromSun) * SPAWN_OFFSET_BEHIND_EARTH,
        0,
        ez + Math.sin(awayFromSun) * SPAWN_OFFSET_BEHIND_EARTH,
      )
    }

    // Render shuttle after Sun corona so opaque shuttle pixels overwrite additive glow
    this.shuttleController.group.traverse((child) => {
      child.renderOrder = 10
    })
    scene.add(this.shuttleController.group)
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    // Thruster effects (scale-aware — offsets and push forces adapt to group scale)
    this.thrusterController = new ThrusterEffectController(this.shuttleController)
    scene.add(this.thrusterController.thrustPoints)
    scene.add(this.thrusterController.brakePoints)
    scene.add(this.thrusterController.rcsPoints)
    this.tickHandler.register(this.thrusterController, TICK_PRIORITY_ANIMATION)

    // --- Orbit capture system ---
    const captureBodies = PLANETS.map((planet, i) => ({
      name: planet.name,
      displayRadius: planet.displayRadius,
      getWorldX: () => this.planetControllers[i]!.getWorldX(),
      getWorldZ: () => this.planetControllers[i]!.getWorldZ(),
    }))
    this.orbitSystem = new OrbitCaptureSystem(captureBodies)

    // Portal arrival or default Earth orbit
    this.portalArrival = new PortalArrivalSequence()
    const arrived = this.portalArrival.tryArrive(
      this.shuttleController,
      this.spaceTimeGrid,
      {
        addToScene: (obj) => scene.add(obj),
        removeFromScene: (obj) => scene.remove(obj),
        registerTick: (t, p) => this.tickHandler!.register(t, p),
        unregisterTick: (t) => this.tickHandler!.unregister(t),
      },
      TICK_PRIORITY_ANIMATION,
    )
    if (!arrived && earthController) {
      const ex = earthController.getWorldX()
      const ez = earthController.getWorldZ()
      this.orbitSystem.beginCapture(ex + 1, ez)
      const orbitR = this.orbitSystem.targetOrbitRadius
      this.shuttleController.group.position.set(ex + orbitR, 0, ez)
      this.orbitSystem.checkArrival(ex + orbitR, ez)
      // Face away from Earth — default slingshot direction is outward
      const awayAngle = Math.atan2(-ez, (ex + orbitR) - ex)
      this.shuttleController.group.rotation.set(0, awayAngle, 0)
      this.shuttleController.freeze()
      this.shuttleController.setInputEnabled(false)
      this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
      this.showOrbitRing(orbitR)
      if (this.orbitRing) {
        this.orbitRing.position.set(ex, 0, ez)
      }
    }

    // --- Portal boundary walls at grid edges ---
    const boundarySize = kuiperOuterEdge * 2.2
    this.boundarySystem = new PortalBoundarySystem(
      boundarySize,
      this.shuttleController.group.position,
      () => ({
        speed: this.shuttleController?.speed,
        rotation_y: this.shuttleController?.heading,
      }),
    )
    for (const wall of this.boundarySystem.walls) {
      scene.add(wall)
    }
    this.tickHandler.register(this.boundarySystem, TICK_PRIORITY_ANIMATION)
    this.boundarySystem.onDepart = (state) => {
      new VibePortal().depart(state as Record<string, string | number>)
    }

    // One-shot action bridge (doors toggle, telemetry)
    this.tickHandler.register(this, ONE_SHOT_PRIORITY)

    // --- Register orrery animation tick ---
    const orreryTickable: Tickable = {
      tick: (dt: number) => this.tickOrrery(dt),
    }
    this.tickHandler.register(orreryTickable, TICK_PRIORITY_ANIMATION)

    // --- Gravity distortion post-processing ---
    this.gravityPass = createGravityDistortionPass(
      mapGravityData.lensStrength,
      mapGravityData.chromStrength,
    )
    this.sceneObjects.composer.addPass(this.gravityPass)

    // --- Compositor: renders via EffectComposer ---
    const compositorTickable: Tickable = {
      tick: () => {
        this.sceneObjects!.composer.render()
      },
    }
    this.tickHandler.register(compositorTickable, TICK_PRIORITY_COMPOSIT)

    // --- Resize ---
    this.resizeHandler = () => {
      if (this.sceneObjects) {
        handleMapResize(this.sceneObjects)
        this.vehicleCamera?.resize(window.innerWidth, window.innerHeight)
      }
    }
    window.addEventListener('resize', this.resizeHandler)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /**
   * One-shot actions, orbit state machine, and telemetry emission (runs just after input).
   */
  tick(dt: number): void {
    // Door toggle + inspect mode (F key zooms camera tight on shuttle)
    if (this.inputManager?.wasActionPressed('toggleDoors')) {
      this.shuttleController?.toggleDoors()
      this.inspectMode = !this.inspectMode
      const bloomPass = this.sceneObjects?.composer.passes.find(
        (p) => p instanceof UnrealBloomPass,
      ) as UnrealBloomPass | undefined
      if (this.inspectMode) {
        this.vehicleCamera?.setConfig(MAP_INSPECT_CAMERA_CONFIG)
        if (this.vehicleCamera) {
          this.vehicleCamera.controls.enableZoom = false
        }
        if (bloomPass) {
          bloomPass.threshold = 1.5
          bloomPass.strength = 0.2
        }
      } else {
        const isOrbiting = this.orbitSystem?.state === 'orbiting'
        this.vehicleCamera?.setConfig(isOrbiting ? MAP_ORBIT_CAMERA_CONFIG : MAP_CAMERA_CONFIG)
        if (this.vehicleCamera) {
          this.vehicleCamera.controls.enableZoom = true
        }
        if (bloomPass) {
          bloomPass.threshold = 0.45
          bloomPass.strength = 0.72
        }
      }
    }

    // Orbit action (E key) — press to capture/cancel, hold to charge slingshot
    if (this.orbitSystem && this.shuttleController && this.inputManager) {
      const state = this.orbitSystem.state
      const ePressed = this.inputManager.wasActionPressed('orbitAction')
      const eHeld = this.inputManager.isActionActive('orbitAction')

      // Free → press E to capture
      if (state === 'free' && ePressed) {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        if (this.orbitSystem.beginCapture(px, pz)) {
          this.approachStartPos = new THREE.Vector3(px, 0, pz)
          this.approachProgress = 0

          this.shuttleController.freeze()
          this.shuttleController.setInputEnabled(false)
          this.vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
          this.showOrbitRing(this.orbitSystem.targetOrbitRadius)
        }
      }

      // Approaching → press E to cancel
      if (state === 'approaching' && ePressed) {
        this.orbitSystem.cancelApproach()
        this.approachStartPos = null
        this.shuttleController.unfreeze()
        this.shuttleController.setInputEnabled(true)
        this.vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
        this.hideOrbitRing()
      }

      // Orbiting → hold E to charge, release to launch
      if (state === 'orbiting') {
        if (eHeld) {
          this.slingshotCharge = Math.min(1, this.slingshotCharge + dt / SLINGSHOT_CHARGE_TIME)
          this.updateLaunchArrow()
        } else if (this.slingshotCharge > 0 && !this.isAimingAtPlanet()) {
          // E released — launch in aimed direction (blocked if aiming at planet)
          const forward = new THREE.Vector3(1, 0, 0)
            .applyQuaternion(this.shuttleController.group.quaternion)
          forward.y = 0
          forward.normalize()
          const speed = orbitConfig.orbitLaunchSpeed * this.slingshotCharge
          const vel = forward.multiplyScalar(speed)
          this.orbitSystem.launchSlingshot(0, dt)
          this.shuttleController.unfreeze()
          this.shuttleController.setInputEnabled(true)
          this.shuttleController.orbitYawLeft = false
          this.shuttleController.orbitYawRight = false
          this.shuttleController.setVelocity(vel)
          this.shuttleController.setSlingshotSpeed(speed)
          // Launch costs fuel proportional to charge
          this.shuttleController.thrusterSystem.consumeFuel(
            this.slingshotCharge * this.shuttleController.thrusterSystem.fuelCapacity * 0.1,
          )

          this.vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
          if (this.vehicleCamera) {
            this.vehicleCamera.controls.target.copy(this.shuttleController.position)
          }
          this.hideOrbitRing()
          this.hideLaunchArrow()
          this.slingshotCharge = 0
          this.yRecovery = true
        } else if (!eHeld && this.slingshotCharge > 0) {
          // Released while aiming at planet — reset charge
          this.slingshotCharge = 0
          this.hideLaunchArrow()
        }
      }
    }

    // After slingshot, lerp Y back to 0
    if (this.yRecovery && this.shuttleController) {
      this.shuttleController.setIgnoreGridY(true)
      const y = this.shuttleController.group.position.y
      if (Math.abs(y) < 0.01) {
        this.shuttleController.group.position.y = 0
        this.yRecovery = false
        this.shuttleController.setIgnoreGridY(false)
      } else {
        this.shuttleController.group.position.y = y * (1 - 3 * dt)
      }
    }

    // Orbit approach — animated lerp toward orbit insertion point
    if (this.orbitSystem?.state === 'approaching' && this.shuttleController && this.approachStartPos) {
      this.approachProgress = Math.min(1, this.approachProgress + dt / APPROACH_DURATION)
      // Ease-out curve for smooth deceleration
      const t = 1 - Math.pow(1 - this.approachProgress, 3)

      // Target point on orbit circle tracks the moving planet
      const target = this.orbitSystem.getApproachTarget()
      if (target) {
        const x = this.approachStartPos.x + (target.x - this.approachStartPos.x) * t
        const z = this.approachStartPos.z + (target.z - this.approachStartPos.z) * t
        this.shuttleController.group.position.set(x, 0, z)

        // Face toward the planet during approach
        const body = this.orbitSystem.target
        if (body) {
          const dx = body.getWorldX() - x
          const dz = body.getWorldZ() - z
          this.shuttleController.group.rotation.y = Math.atan2(-dz, dx)
        }
      }

      // Ring follows planet during approach
      if (this.orbitRing && this.orbitSystem.target) {
        this.orbitRing.position.set(
          this.orbitSystem.target.getWorldX(), 0,
          this.orbitSystem.target.getWorldZ(),
        )
      }

      // Arrive when lerp completes
      if (this.approachProgress >= 1) {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        this.orbitSystem.checkArrival(px, pz)
        this.approachStartPos = null

        // Face away from planet — default launch direction is outward
        if (this.orbitSystem.target) {
          const bx = this.orbitSystem.target.getWorldX()
          const bz = this.orbitSystem.target.getWorldZ()
          const awayAngle = Math.atan2(-(pz - bz), px - bx)
          this.shuttleController.group.rotation.set(0, awayAngle, 0)
        }
      }
    }

    // Telemetry
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

    // Orbit HUD state
    if (this.orbitSystem && this.shuttleController && this.onOrbitState) {
      const hudState = this.orbitSystem.getHudState(
        this.shuttleController.position.x,
        this.shuttleController.position.z,
      )
      hudState.chargeLevel = this.slingshotCharge
      hudState.inspectMode = this.inspectMode
      this.onOrbitState(hudState)
    }

    // Adrift check — 60s with no fuel in free flight = game over
    if (this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const hasFuel = this.shuttleController.thrusterSystem.fuelLevel > 0
      if (orbitState === 'free' && !hasFuel) {
        this.adriftTimer += dt
        if (this.adriftTimer >= ADRIFT_TIMEOUT) {
          this.vehicleCamera?.setConfig(MAP_DEATH_CAMERA_CONFIG)
          this.onDeathOverlay?.(true, 'Adrift')
          this.shuttleController.freeze()
        }
      } else {
        this.adriftTimer = 0
      }
    }

    // Gravity proximity — VFX distortion + HUD warning
    // Only active in free flight (not during orbit capture)
    if (this.shuttleController && this.gravityPass) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      if (orbitState === 'free' && !this.shuttleController.dead) {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        let maxProximity = 0
        let nearestSourceX = 0
        let nearestSourceZ = 0
        let nearestName: string | null = null

        // Check Sun
        if (this.sunController) {
          const prox = this.computeProximity(
            this.sunController.getWorldX(),
            this.sunController.getWorldZ(),
            this.sunController.mass,
            px, pz,
          )
          if (prox > maxProximity) {
            maxProximity = prox
            nearestSourceX = this.sunController.getWorldX()
            nearestSourceZ = this.sunController.getWorldZ()
            nearestName = 'Sun'
          }
        }

        // Check planets
        for (let i = 0; i < this.planetControllers.length; i++) {
          const c = this.planetControllers[i]!
          const prox = this.computeProximity(c.getWorldX(), c.getWorldZ(), c.mass, px, pz)
          if (prox > maxProximity) {
            maxProximity = prox
            nearestSourceX = c.getWorldX()
            nearestSourceZ = c.getWorldZ()
            nearestName = PLANETS[i]?.name ?? null
          }
        }

        // Update shader uniforms
        this.gravityPass.uniforms.proximity!.value = maxProximity
        if (maxProximity > 0 && this.vehicleCamera) {
          const sourceWorld = new THREE.Vector3(nearestSourceX, 0, nearestSourceZ)
          const projected = sourceWorld.project(this.vehicleCamera.camera)
          this.gravityPass.uniforms.sourceUV!.value.set(
            (projected.x + 1) * 0.5,
            (projected.y + 1) * 0.5,
          )
        }

        // Emit HUD warning
        if (this.onGravityWarning) {
          this.onGravityWarning({
            proximity: maxProximity,
            bodyName: nearestName,
            visible: maxProximity > 0,
          })
        }
      } else {
        // Not in free state or dead — clear effects
        this.gravityPass.uniforms.proximity!.value = 0
        if (this.onGravityWarning) {
          this.onGravityWarning({ proximity: 0, bodyName: null, visible: false })
        }
      }
    }
  }

  /**
   * Advance the orrery simulation and update gravity grid sources.
   */
  private tickOrrery(dt: number): void {
    this.simTime += dt * DEFAULT_TIME_SCALE

    this.sunController?.tick(dt, this.simTime)

    for (const controller of this.planetControllers) {
      controller.tick(dt, this.simTime)
    }

    for (const controller of this.beltControllers) {
      controller.tick(dt, this.simTime)
    }

    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.clearSources()
      if (this.sunController) {
        this.spaceTimeGrid.addSource({
          x: this.sunController.getWorldX(),
          z: this.sunController.getWorldZ(),
          mass: this.sunController.mass,
        })
      }
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

    // Orbit position driving — runs AFTER planets move to avoid jitter
    if (this.orbitSystem?.state === 'orbiting' && this.shuttleController && this.inputManager) {
      const pos = this.orbitSystem.tickOrbit(dt)
      const planetY = this.orbitSystem.target
        ? this.planetControllers.find((_c, i) =>
          PLANETS[i]?.name === this.orbitSystem!.target?.name)?.group.position.y ?? 0
        : 0
      if (pos) {
        this.shuttleController.group.position.set(pos.x, planetY, pos.z)
      }
      // A/D yaw — input is disabled so read InputManager directly and set orbit flags for VFX
      const yawLeft = this.inputManager.isActionActive('yawLeft')
        && this.shuttleController.thrusterSystem.canFire('rcs')
      const yawRight = this.inputManager.isActionActive('yawRight')
        && this.shuttleController.thrusterSystem.canFire('rcs')
      this.shuttleController.orbitYawLeft = yawLeft
      this.shuttleController.orbitYawRight = yawRight
      if (yawLeft) {
        this.shuttleController.group.rotateY(MAP_PHYSICS.yawTorque * dt)
      }
      if (yawRight) {
        this.shuttleController.group.rotateY(-MAP_PHYSICS.yawTorque * dt)
      }
      this.shuttleController.thrusterSystem.tick(dt, {
        thrust: false,
        brake: false,
        rcs: yawLeft || yawRight,
      })
      // Refuel while orbiting Earth
      if (this.orbitSystem.target?.name === 'Earth') {
        this.shuttleController.thrusterSystem.addFuel(EARTH_REFUEL_RATE * dt)
      }
      if (this.orbitSystem.target && this.vehicleCamera) {
        const bx = this.orbitSystem.target.getWorldX()
        const bz = this.orbitSystem.target.getWorldZ()
        this.vehicleCamera.controls.target.set(bx, planetY, bz)
        if (this.orbitRing) {
          this.orbitRing.position.set(bx, planetY, bz)
        }
      }
    }
  }

  /**
   * Compute gravity proximity for a single source (0 = at influence edge, 1 = at event horizon).
   * Returns 0 if outside influence radius.
   */
  /** Reset shuttle after death — clear death state, place into Earth orbit. */
  /** Called by Vue when the player clicks Restart on the death overlay. */
  restart(): void {
    this.respawnAtEarth()
    this.onDeathOverlay?.(false, '')
  }

  /** Reset shuttle after death — clear death state, place into Earth orbit. */
  private respawnAtEarth(): void {
    if (!this.shuttleController || !this.orbitSystem) return

    // Clear death state
    this.shuttleController.resetDeath()
    this.shuttleController.freeze()
    this.shuttleController.setInputEnabled(false)

    // Return orbit system to free state
    if (this.orbitSystem.state === 'approaching') {
      this.orbitSystem.cancelApproach()
    } else if (this.orbitSystem.state === 'orbiting') {
      this.orbitSystem.launchSlingshot(0, 0)
    }

    // Find Earth
    const earthIndex = PLANETS.findIndex((p) => p.id === 'earth')
    const earthController = this.planetControllers[earthIndex]
    if (!earthController) return

    const ex = earthController.getWorldX()
    const ez = earthController.getWorldZ()

    // Force into Earth orbit (same pattern as init)
    this.orbitSystem.beginCapture(ex + 1, ez)
    const orbitR = this.orbitSystem.targetOrbitRadius
    this.shuttleController.group.position.set(ex + orbitR, 0, ez)
    this.orbitSystem.checkArrival(ex + orbitR, ez)

    // Face away from Earth
    const awayAngle = Math.atan2(-ez, orbitR)
    this.shuttleController.group.rotation.set(0, awayAngle, 0)

    // Camera + orbit ring
    this.vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
    this.vehicleCamera?.setTarget(this.shuttleController.group)
    this.showOrbitRing(orbitR)
    if (this.orbitRing) {
      this.orbitRing.position.set(ex, 0, ez)
    }

    // Reset slingshot state
    this.slingshotCharge = 0
    this.hideLaunchArrow()
    this.yRecovery = false
    this.adriftTimer = 0
  }

  /**
   * Compute gravity proximity for a single source (0 = at influence edge, 1 = at event horizon).
   * Returns 0 if outside influence radius.
   */
  private computeProximity(
    sourceX: number, sourceZ: number, mass: number,
    px: number, pz: number,
  ): number {
    const dx = sourceX - px
    const dz = sourceZ - pz
    const dist = Math.sqrt(dx * dx + dz * dz)
    const influence = influenceRadius(mass, MAP_GRAVITY_CONFIG)
    const horizon = eventHorizonRadius(mass, MAP_GRAVITY_CONFIG)
    if (dist >= influence) return 0
    return Math.min(1, 1 - (dist - horizon) / (influence - horizon))
  }

  /** Returns true if the shuttle is aiming toward the captured planet. */
  private isAimingAtPlanet(): boolean {
    if (!this.shuttleController || !this.orbitSystem?.target) return false
    const forward = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(this.shuttleController.group.quaternion)
    forward.y = 0
    forward.normalize()
    const toPlanet = new THREE.Vector3(
      this.orbitSystem.target.getWorldX() - this.shuttleController.position.x,
      0,
      this.orbitSystem.target.getWorldZ() - this.shuttleController.position.z,
    ).normalize()
    return forward.dot(toPlanet) > AIM_BLOCK_THRESHOLD
  }

  /** Update the slingshot direction arrow length based on charge. */
  private updateLaunchArrow(): void {
    if (!this.shuttleController) return
    if (!this.launchArrow) {
      // Create once as child of shuttle — local +X = forward, tracks automatically
      this.launchArrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        ARROW_MAX_LENGTH,
        ARROW_COLOR_SAFE,
        ARROW_HEAD_LENGTH,
        ARROW_HEAD_WIDTH,
      )
      this.shuttleController.group.add(this.launchArrow)
    }
    // Scale length with charge, color red if aiming at planet
    const blocked = this.isAimingAtPlanet()
    this.launchArrow.setColor(new THREE.Color(blocked ? ARROW_COLOR_BLOCKED : ARROW_COLOR_SAFE))
    this.launchArrow.setLength(
      ARROW_MAX_LENGTH * this.slingshotCharge,
      ARROW_HEAD_LENGTH * this.slingshotCharge,
      ARROW_HEAD_WIDTH * this.slingshotCharge,
    )
  }

  /** Remove the launch arrow from shuttle group. */
  private hideLaunchArrow(): void {
    if (this.launchArrow && this.shuttleController) {
      this.shuttleController.group.remove(this.launchArrow)
      this.launchArrow.dispose()
      this.launchArrow = null
    }
  }

  /** Create a dashed circle ring at the given radius and add to scene. */
  private showOrbitRing(radius: number): void {
    this.hideOrbitRing()
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= ORBIT_RING_SEGMENTS; i++) {
      const angle = (i / ORBIT_RING_SEGMENTS) * Math.PI * 2
      points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineDashedMaterial({
      color: ORBIT_RING_COLOR,
      transparent: true,
      opacity: ORBIT_RING_OPACITY,
      dashSize: ORBIT_RING_DASH_SIZE,
      gapSize: ORBIT_RING_GAP_SIZE,
    })
    this.orbitRing = new THREE.LineLoop(geometry, material)
    this.orbitRing.computeLineDistances()
    this.sceneObjects?.scene.add(this.orbitRing)
  }

  /** Remove the orbit ring from scene. */
  private hideOrbitRing(): void {
    if (this.orbitRing) {
      this.sceneObjects?.scene.remove(this.orbitRing)
      this.orbitRing.geometry.dispose()
      ;(this.orbitRing.material as THREE.LineDashedMaterial).dispose()
      this.orbitRing = null
    }
  }

  dispose(): void {
    this.hideOrbitRing()
    this.gameLoop?.stop()

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }

    // Dispose controllers
    this.portalArrival?.dispose()
    this.boundarySystem?.dispose()
    this.thrusterController?.dispose()
    this.shuttleController?.dispose()
    for (const controller of this.beltControllers) controller.dispose()
    for (const controller of this.planetControllers) controller.dispose()
    this.spaceTimeGrid?.dispose()
    this.sunController?.dispose()
    this.starField?.dispose()

    // Dispose camera and scene
    this.vehicleCamera?.dispose()
    this.inputManager?.dispose()
    if (this.sceneObjects) {
      this.sceneObjects.renderer.dispose()
    }
  }
}
