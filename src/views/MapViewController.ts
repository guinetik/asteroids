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
import type {
  ShuttleTelemetry,
  GravityWarningState,
  GravitationalAnomalyHudState,
} from '@/lib/ShuttleTelemetry'
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
import { DEFAULT_TIME_SCALE, ORBIT_SCALE, SIZE_SCALE } from '@/lib/planets/constants'
import { SUN, PLANETS, ASTEROID_BELTS } from '@/lib/planets/catalog'
import { createMapScene, handleMapResize, type MapSceneObjects } from '@/three/MapSceneSetup'
import { StarFieldController } from '@/three/StarFieldController'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import * as THREE from 'three'
import { OrbitCaptureSystem, type OrbitHudState } from '@/lib/orbitCapture'
import {
  gravityAt,
  influenceRadius,
  eventHorizonRadius,
  type GravityConfig,
} from '@/lib/physics/gravity'
import type { GravityWell } from '@/three/ShuttleController'
import type { GravitySource } from '@/lib/physics/gravity'
import { ShuttleController, MAP_PHYSICS } from '@/three/ShuttleController'
import mapGravityData from '@/data/shuttle/map-gravity.json'
import { ThrusterEffectController } from '@/three/ThrusterEffectController'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import {
  VehicleCamera,
  MAP_CAMERA_CONFIG,
  MAP_ORBIT_CAMERA_CONFIG,
  MAP_INSPECT_CAMERA_CONFIG,
  MAP_DEATH_CAMERA_CONFIG,
} from '@/three/VehicleCamera'
import { buildSlingshotChargeCameraConfig } from '@/three/slingshotChargeCamera'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { PortalArrivalSequence } from '@/three/PortalArrivalSequence'
import { PortalBoundarySystem } from '@/three/PortalBoundarySystem'
import { createGravityDistortionPass } from '@/three/GravityDistortionPass'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VibePortal } from '@/lib/portal'
import { MapState } from '@/lib/mapState'
import { MapIntroState, type MapIntroUiState } from '@/lib/mapIntroState'
import { MapCamera, easeInOut } from '@/three/MapCamera'
import { findNearestBodies, formatDistance, type MapBody } from '@/lib/mapProjection'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'
import { computeRelativeOrbitalSpeedMultiplier } from '@/lib/orbitSpeedProfile'
import { canReleaseSlingshot } from '@/lib/slingshotLaunchPolicy'
import {
  appendWorldLinePoint,
  shouldRecordWorldLinePoint,
  type WorldLineHistoryPoint,
} from '@/lib/worldLineHistory'
import mapOverlayData from '@/data/shuttle/map-overlay.json'
import { shipMessageSystem } from '@/lib/messages/runtime'
import { isMainThrusterSpentForMessage } from '@/lib/messages/tutorialTriggers'
import { DevConsole } from '@/lib/devConsole'
import { AmbientSpaceController } from '@/three/AmbientSpaceController'
import { GravitationalEventManager } from '@/lib/physics/gravitationalEvent'
import { computeShuttleBaseFuelDrain } from '@/lib/shuttleBaseFuelDrain'
import { ShipHealth } from '@/lib/shipHealth'
import type { ShipHealthConfig } from '@/lib/shipHealth'
import shipHealthData from '@/data/shuttle/ship-health.json'
import { getCurrentShuttleThrusterEfficiencyModifiers, getCurrentUpgradeValue } from '@/lib/upgrades'
import { HabitatState } from '@/lib/habitatState'
import { HabitatInteriorScene } from '@/three/HabitatInteriorScene'
import {
  createShopSession,
  tickShopSession,
  buyTradeGood,
  sellTradeGood,
  REFUEL_COST,
  RESERVE_FUEL_COST,
  RESERVE_FUEL_ID,
  LANDER_FUEL_ID,
  LANDER_FUEL_COST,
  REPAIR_COST,
} from '@/lib/shop/shopSession'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import { tickDemandTimer, resetDemand } from '@/lib/shop/planetDemand'
import { createProfile, spendCredits } from '@/lib/player/profile'
import type { PlayerProfile } from '@/lib/player/types'
import { createInventory, addItem, getStack, consumeItem, canFitItem } from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import '@/lib/shop/tradeGoods'
import {
  createMissionBoard,
  offerMission,
  acceptMission,
  completeMission,
  deliverMission,
  tickMissionBoard,
  getActiveMissionsForPlanet,
} from '@/lib/missions/shuttleMissionSession'
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import { getGatherItemForPlanet } from '@/lib/missions/planetOrbitalConfig'
import '@/lib/missions/missionMaterials'

type EmissiveMaterial =
  | THREE.MeshLambertMaterial
  | THREE.MeshPhongMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial
  | THREE.MeshToonMaterial

/**
 * Whether a material exposes emissive controls.
 *
 * @param material - Material attached to a shuttle mesh
 * @returns True when the material supports emissive tinting
 */
function isEmissiveMaterial(material: THREE.Material): material is EmissiveMaterial {
  return (
    material instanceof THREE.MeshLambertMaterial ||
    material instanceof THREE.MeshPhongMaterial ||
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial ||
    material instanceof THREE.MeshToonMaterial
  )
}

/** Tick priority for the compositor (runs after animation, before render). */
const TICK_PRIORITY_COMPOSIT = TICK_PRIORITY_RENDER - 1

/** One-shot action bridge runs just after input. */
const ONE_SHOT_PRIORITY = TICK_PRIORITY_INPUT + 1

/**
 * Minimum mass (M☉) for a planet to contribute to the space-time grid.
 * Below this, the gravity well is sub-pixel. Filters out terrestrials
 * and dwarf planets, keeping Sun + Jupiter/Saturn-scale wells.
 */
/** Only Jupiter (9.55e-4) and Saturn (2.86e-4) deform the grid (Uranus/Neptune are below 1e-4). */
const GRID_MASS_THRESHOLD = 1e-4

/**
 * Gaussian σ multiplier for Jupiter and Saturn on the map fabric only (wider bowls;
 * center depth unchanged). Tune for readability at solar-system scale.
 */
const MAP_GRID_GAS_GIANT_WELL_WIDTH_MULT = 1.85

/** Baseline wireframe segments per axis on the map space-time grid (lower = faster deform pass). */
const MAP_SPACE_TIME_GRID_BASE_RESOLUTION = 100

/** Density multiplier on segment count; resolved value is `Math.round(base × boost)`. */
const MAP_SPACE_TIME_GRID_RESOLUTION_BOOST = 1.5

/** Resolved segment count for the map space-time grid wireframe. */
const MAP_SPACE_TIME_GRID_RESOLUTION = Math.round(
  MAP_SPACE_TIME_GRID_BASE_RESOLUTION * MAP_SPACE_TIME_GRID_RESOLUTION_BOOST,
)

/**
 * Visual scale for the shuttle in the map view.
 * The shuttle model is ~14 units at default scale; this brings it to ~0.14 units,
 * smaller than most planet display radii but clearly visible.
 */
const MAP_SHUTTLE_SCALE = 0.01

/**
 * Approximate bounding size of the shuttle model in local (unscaled) units.
 * Used with the constant-screen-size formula to prevent the shuttle from
 * disappearing when the camera is pulled far back.
 */
const MAP_SHUTTLE_BASE_SIZE = 14

/**
 * Minimum apparent size of the shuttle as a fraction of screen height.
 * When the shuttle would appear smaller than this, the scale is boosted
 * so it stays readable as a navigation marker at any zoom level.
 */
const MAP_SHUTTLE_MIN_APPARENT_SIZE = 0.012

/** How fast the shuttle scale lerps toward its target (per second). */
const MAP_SHUTTLE_SCALE_LERP = 8

/**
 * Fixed apparent size of the tactical reticle as a fraction of screen height.
 * The reticle's world-space scale is recalculated every frame to maintain this.
 */
const MAP_RETICLE_APPARENT_SIZE = 0.06

/**
 * Shuttle overscale multiplier at which the reticle begins fading in.
 * Below this factor the shuttle model is still clearly visible on its own.
 */
const MAP_RETICLE_FADE_START = 1.5

/**
 * Shuttle overscale multiplier at which the reticle reaches full opacity.
 * Above this the shuttle is so small only the reticle marks its position.
 */
const MAP_RETICLE_FADE_END = 5.0

/**
 * Minimum planar speed (world units/s) before the reticle motion wedge appears.
 * Keeps the pointer from jittering when nearly stopped.
 */
const MAP_RETICLE_MIN_SPEED = 0.12

/**
 * If projected motion direction in NDC has squared length below this, skip updating
 * the wedge rotation for this frame.
 */
const MAP_RETICLE_MIN_NDC_DELTA_SQ = 1e-10

/** Offset behind Earth so the shuttle doesn't overlap the planet mesh. */
const SPAWN_OFFSET_BEHIND_EARTH = 7.5

/** How much grid slope affects shuttle speed (multiplier on slope value). */
const CURVATURE_SPEED_FACTOR = 0.3

/**
 * When both camera view spans (XZ at the orbit target) exceed this fraction of the
 * grid width, the whole fabric is in view — use a cheaper deform cadence (no debunching).
 */
const GRID_DEFORM_WHOLE_MAP_COVERAGE = 0.82

/**
 * Multiplier on the grid’s base deform interval while the whole map is visible.
 * Keeps low-frequency global warping smooth without touching every vertex every pass.
 */
const GRID_DEFORM_INTERVAL_SCALE_WHOLE_MAP = 3

/** Duration in seconds for the approach animation lerp. */
const APPROACH_DURATION = 1.5

/** Seconds to fully charge slingshot (0 → 1). */
const SLINGSHOT_CHARGE_TIME = 2.0

/** Seconds without fuel in free flight before game over (adrift). */
const ADRIFT_TIMEOUT = 60


/** The Sun supports a much faster orbital lane than planets. */
const SUN_ORBIT_SPEED_MULTIPLIER = 12

/** The Sun should be orbitable without advertising capture across the whole inner system. */
const SUN_CAPTURE_RADIUS_MULTIPLIER = 0.2

/** Earth defines the baseline orbital lane speed multiplier of 1. */
const EARTH_PLANET_ID = 'earth'

/**
 * Earth catalog `displayRadius` — baseline for scaling dev-warp standoff to other bodies.
 */
const EARTH_CATALOG_DISPLAY_RADIUS =
  PLANETS.find((p) => p.id === EARTH_PLANET_ID)?.displayRadius ?? 0.0077

/**
 * World-space offset from a body's centre along the anti-sunward radial, scaled by catalog size.
 */
function mapWarpStandoffWorldUnits(displayRadius: number): number {
  return SPAWN_OFFSET_BEHIND_EARTH * (displayRadius / EARTH_CATALOG_DISPLAY_RADIUS)
}

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

/** The Sun orbit lane should sit on the relativity bump radius. */
const SUN_BUMP_ORBIT_RADIUS = influenceRadius(SUN.mass, MAP_GRAVITY_CONFIG)

/** Opening cutscene starts with a wide solar-system establishing shot. */
const MAP_INTRO_CAMERA_START_POSITION = new THREE.Vector3(0, 320, 900)
const MAP_INTRO_CAMERA_START_TARGET = new THREE.Vector3(0, 0, 0)
const MAP_INTRO_CAMERA_START_FOV = 32
const MAP_INTRO_HERO_OFFSET = new THREE.Vector3(-24, 6, 14)
const MAP_INTRO_HERO_LOOK_AT_OFFSET = new THREE.Vector3(0, 1.5, 0)
const MAP_INTRO_HERO_FOV = 42
const MAP_INTRO_HERO_HOLD_START = 0.38
const MAP_INTRO_HERO_HOLD_END = 0.82
const EARTH_DEPARTURE_MESSAGE_DISTANCE = 12
const EARTH_DEPARTURE_MIN_HISTORY_POINTS = 3
const VENUS_ORBIT_WARNING_DISTANCE = 1.5

/**
 * Wraps a GravitySource into a GravityWell that ShuttleController can consume,
 * using map-scale gravity config.
 */
function makeGravityWell(
  source: GravitySource,
  config: GravityConfig,
): GravityWell & GravitySource {
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
  private introCamera: THREE.PerspectiveCamera | null = null
  private shuttleController: ShuttleController | null = null
  private thrusterController: ThrusterEffectController | null = null
  private starField: StarFieldController | null = null
  private sunController: SunController | null = null
  private planetControllers: PlanetSystemController[] = []
  private beltControllers: AsteroidBeltController[] = []
  private spaceTimeGrid: SpaceTimeGrid | null = null
  /** Transient spacetime “depressions” that drift across the sheet near the shuttle. */
  private gravitationalEventManager: GravitationalEventManager | null = null
  /** World width/depth of the map space-time grid (passed to {@link SpaceTimeGrid}). */
  private mapGridSize = 0
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
  private habitatState = new HabitatState()
  private habitatScene: HabitatInteriorScene | null = null
  private shopSession: ShopSession | null = null
  private shopDialogOpen = false
  private missionBoard: ShuttleMissionBoard = createMissionBoard()
  private missionOverlayOpen = false
  private missionButtonVisible = false
  private playerProfile: PlayerProfile = createProfile('Pilot')
  private playerInventory: Inventory = createInventory()
  private portalArrival: PortalArrivalSequence | null = null
  private boundarySystem: PortalBoundarySystem | null = null
  private gravityPass: ShaderPass | null = null
  private adriftTimer = 0
  private shipHealth: ShipHealth | null = null
  private explosionEmitter: ParticleEmitter | null = null
  private mapState = new MapState()
  private mapIntro = new MapIntroState()
  private mapCamera: MapCamera | null = null
  private worldLineHistory: WorldLineHistoryPoint[] = []
  private didDispatchEarthDistanceMessage = false
  private didDispatchBrakeMessage = false
  private didDispatchMainThrusterMessage = false
  private didDispatchVenusOrbitMessage = false

  /** Ambient debris/cloud/comet particle field anchored to the shuttle. */
  private ambientSpace: AmbientSpaceController | null = null

  /** Whether planet orbit lines are currently visible. */
  private orbitsVisible = true

  /** Whether the space-time fabric grid is currently visible. */
  private gridVisible = true

  /** Current shuttle display scale, lerped each frame toward the screen-size target. */
  private currentShuttleScale = MAP_SHUTTLE_SCALE

  /** Increments per anomaly HUD message so Vue can re-run enter animation. */
  private gravitationalAnomalyHudToken = 0

  /**
   * Root group (world position + uniform scale) for the zoom-out tactical reticle:
   * ring marker plus a velocity wedge that spins to match on-screen motion.
   */
  private shipReticleGroup: THREE.Group | null = null

  /** Axis ring / tick sprite; drawn once, does not rotate with velocity. */
  private shipReticleRing: THREE.Sprite | null = null

  /** Wedge sprite rotated into planar velocity direction as projected on the view. */
  private shipReticlePointer: THREE.Sprite | null = null

  private readonly _reticleProjA = new THREE.Vector3()

  private readonly _reticleProjB = new THREE.Vector3()

  private readonly _reticleVelPlanar = new THREE.Vector3()

  /** World-space shuttle position reused for asteroid belt nearby tumble (avoid per-frame alloc). */
  private readonly _beltShuttleWorldScratch = new THREE.Vector3()

  /** Called when map overlay state changes for Vue HUD. */
  onMapOverlay: ((state: MapOverlayState) => void) | null = null

  /** Called when the opening map intro UI should update. */
  onMapIntro: ((state: MapIntroUiState) => void) | null = null

  /** Called each frame with full shuttle telemetry for HUD display. */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  /** Called each frame with orbit-capture HUD state. */
  onOrbitState: ((state: OrbitHudState) => void) | null = null

  /** Called each frame with gravity warning state for HUD. */
  onGravityWarning: ((state: GravityWarningState) => void) | null = null

  /** Nearby synthetic spacetime anomaly — brief HUD toasts on start/finish. */
  onGravitationalAnomalyHud: ((state: GravitationalAnomalyHudState) => void) | null = null

  /** Called when shuttle dies — shows death overlay. */
  onDeathOverlay: ((visible: boolean, cause: string) => void) | null = null

  /** Called when the ship-message queue changes and Vue should refresh. */
  onMessageUpdate: (() => void) | null = null

  /** Fired when player enters/leaves habitat. */
  onHabitatActive: ((active: boolean) => void) | null = null
  /** Fired when the shuttle control overlay should open/close. */
  onShuttleControl: ((visible: boolean) => void) | null = null
  /** Fired when the habitat interaction prompt changes. */
  onHabitatPrompt: ((prompt: string | null) => void) | null = null
  /** Fired with fade opacity (0 = clear, 1 = black) during habitat transitions. */
  onHabitatFade: ((opacity: number) => void) | null = null
  /** Fired when the shop button should show/hide. */
  onShopButton: ((visible: boolean, planetName: string) => void) | null = null
  /** Fired when the shop dialog state changes. */
  onShopState: ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void) | null = null
  /** Fired when credits change (for the HUD badge). */
  onCreditsUpdate: ((credits: number) => void) | null = null
  /** Fired when fuel cell count changes (for HUD refuel button). */
  onFuelCellCount: ((count: number) => void) | null = null

  /** Called when mission button visibility changes in OrbitPrompt. */
  onMissionButton: ((visible: boolean, planetName: string) => void) | null = null

  /** Called when the mission minigame overlay should open/close. */
  onMissionOverlay: ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void) | null = null

  /** Called when the mission board state changes (for shuttle control terminal). */
  onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null = null

  /** Called when a mission minigame is completed (items gathered). */
  onMissionComplete: ((mission: ActiveShuttleMission | null) => void) | null = null

  /** Called when a mission is delivered (credits awarded). */
  onMissionDeliver: ((mission: ActiveShuttleMission | null) => void) | null = null

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

    this.introCamera = new THREE.PerspectiveCamera(
      MAP_INTRO_CAMERA_START_FOV,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      50000,
    )
    this.introCamera.position.copy(MAP_INTRO_CAMERA_START_POSITION)
    this.introCamera.lookAt(MAP_INTRO_CAMERA_START_TARGET)
    scene.add(this.introCamera)

    // --- Map overlay camera (ortho, created once, used when M pressed) ---
    this.mapCamera = new MapCamera()
    scene.add(this.mapCamera.camera)

    // Swap the EffectComposer's render pass to use the vehicle camera
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    renderPass.camera = this.vehicleCamera.camera

    this.tickHandler.register(this.vehicleCamera, TICK_PRIORITY_COMPOSIT - 1)

    // Habitat FPS camera mouse look
    document.addEventListener('mousemove', this.onHabitatMouseMove)

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
    this.mapGridSize = gridSize
    const gridDepthScale = 80
    const gridWidthScale = 40
    const gridMassExponent = 0.2
    this.spaceTimeGrid = new SpaceTimeGrid(
      gridSize,
      MAP_SPACE_TIME_GRID_RESOLUTION,
      gridDepthScale,
      gridWidthScale,
      gridMassExponent,
    )
    scene.add(this.spaceTimeGrid.mesh)

    // Sun is static — add once, never cleared
    this.spaceTimeGrid.addStaticSource({ x: 0, z: 0, mass: SUN.mass })

    this.gravitationalEventManager = new GravitationalEventManager({
      worldHalfExtent: gridSize / 2,
      autoSpawnEnabled: true,
    })
    this.gravitationalEventManager.setNearbyHudCallbacks({
      onNearbyAnomalyStart: (d, sx, sz) => {
        this.gravitationalAnomalyHudToken += 1
        const dist = Math.hypot(d.x - sx, d.z - sz)
        this.onGravitationalAnomalyHud?.({
          visible: true,
          token: this.gravitationalAnomalyHudToken,
          title: 'Spacetime disturbance',
          subtitle: `Fabric depression · ~${Math.round(dist)} u · ${d.durationSec.toFixed(1)} s drift`,
        })
      },
      onNearbyAnomalyFinish: () => {
        this.gravitationalAnomalyHudToken += 1
        this.onGravitationalAnomalyHud?.({
          visible: true,
          token: this.gravitationalAnomalyHudToken,
          title: 'Disturbance passed',
          subtitle: 'Local grid stabilizing',
        })
      },
    })

    // --- Shuttle (player character) ---
    this.shuttleController = new ShuttleController(
      this.inputManager,
      MAP_PHYSICS,
      MAP_GRAVITY_CONFIG,
    )
    this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)

    // Register gravity wells — Sun + all planets
    if (this.sunController) {
      this.shuttleController.addGravityWell(makeGravityWell(this.sunController, MAP_GRAVITY_CONFIG))
    }
    for (const controller of this.planetControllers) {
      this.shuttleController.addGravityWell(makeGravityWell(controller, MAP_GRAVITY_CONFIG))
    }

    this.shuttleController.onDeath = () => {
      this.triggerDeath('Crashed Into The Sun')
    }

    // Ship health — temperature + radiation damage
    this.shipHealth = new ShipHealth(shipHealthData as ShipHealthConfig)
    this.shipHealth.onDeath = (cause) => {
      this.triggerDeath(cause)
    }

    await this.shuttleController.load()
    this.shuttleController.group.scale.setScalar(MAP_SHUTTLE_SCALE)
    this.createShipReticle()

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

    // Explosion particle emitter — shared for all death types
    this.explosionEmitter = new ParticleEmitter({
      poolSize: 200,
      color: new THREE.Color(0xff6622),
      size: Math.max(1, 6 * MAP_SHUTTLE_SCALE),
      lifetime: 1.5,
      spread: 8 * MAP_SHUTTLE_SCALE,
      opacity: 0.9,
    })
    scene.add(this.explosionEmitter.points)
    this.tickHandler.register(this.explosionEmitter, TICK_PRIORITY_ANIMATION)

    // --- Ambient space (dust, rocks, gas clouds, comets) ---
    this.ambientSpace = new AmbientSpaceController(scene)
    this.ambientSpace.attach(this.shuttleController.group)
    this.ambientSpace.setCamera(this.vehicleCamera.camera)
    this.tickHandler.register(this.ambientSpace, TICK_PRIORITY_ANIMATION)

    // --- Orbit capture system ---
    const earthOrbit =
      PLANETS.find((planet) => planet.id === EARTH_PLANET_ID)?.orbit ?? PLANETS[0]!.orbit
    const captureBodies = [
      {
        name: SUN.name,
        displayRadius: SUN.displayRadius,
        captureRadiusOverride: SUN_BUMP_ORBIT_RADIUS,
        orbitRadiusOverride: SUN_BUMP_ORBIT_RADIUS,
        captureRadiusMultiplier: SUN_CAPTURE_RADIUS_MULTIPLIER,
        orbitalSpeedMultiplier: SUN_ORBIT_SPEED_MULTIPLIER,
        getWorldX: () => this.sunController!.getWorldX(),
        getWorldZ: () => this.sunController!.getWorldZ(),
      },
      ...PLANETS.map((planet, i) => ({
        name: planet.name,
        displayRadius: planet.displayRadius,
        orbitalSpeedMultiplier: computeRelativeOrbitalSpeedMultiplier(planet.orbit, earthOrbit),
        getWorldX: () => this.planetControllers[i]!.getWorldX(),
        getWorldZ: () => this.planetControllers[i]!.getWorldZ(),
      })),
    ]
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
      const awayAngle = Math.atan2(-ez, ex + orbitR - ex)
      this.shuttleController.group.rotation.set(0, awayAngle, 0)
      this.shuttleController.freeze()
      this.shuttleController.setInputEnabled(false)
      this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
      this.showOrbitRing(orbitR)
      if (this.orbitRing) {
        this.orbitRing.position.set(ex, 0, ez)
      }

      shipMessageSystem.notifyTrigger('map_start_earth_orbit')
      this.emitMessageUpdate()
      this.beginStartupIntro()
    } else {
      this.mapIntro.skip()
      this.emitIntroUiState()
    }
    this.resetWorldLineHistory()

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
        if (this.introCamera) {
          this.introCamera.aspect = window.innerWidth / window.innerHeight
          this.introCamera.updateProjectionMatrix()
        }
      }
    }
    window.addEventListener('resize', this.resizeHandler)

    // --- Dev tools ---
    DevConsole.register('MapView', {
      skipIntro: () => {
        this.mapIntro.skip()
        this.emitIntroUiState()
      },
      getShuttlePosition: () => {
        const pos = this.shuttleController?.group.position
        if (pos)
          console.info(
            `[MapView] Shuttle: x=${pos.x.toFixed(1)} y=${pos.y.toFixed(1)} z=${pos.z.toFixed(1)}`,
          )
      },
      teleportToSun: () => {
        if (this.sunController && this.shuttleController) {
          this.shuttleController.group.position.set(
            this.sunController.getWorldX() + 50,
            0,
            this.sunController.getWorldZ(),
          )
        }
      },
      warp: (bodyId: string) => {
        this.devWarpNearBody(bodyId)
      },
      toggleOrbits: () => this.toggleOrbits(),
      toggleSpaceTimeGrid: () => this.toggleSpaceTimeGrid(),
      toggleAmbient: () => this.toggleAmbient(),
      spawnGravitationalEvent: () => this.gravitationalEventManager?.spawnRandomInWorld() ?? null,
      spawnGravitationalEventNearPlayer: (maxOffset = 200) => {
        if (!this.gravitationalEventManager || !this.shuttleController) return null
        const p = this.shuttleController.group.position
        return this.gravitationalEventManager.spawnNear(p.x, p.z, maxOffset)
      },
      clearGravitationalEvents: () => this.gravitationalEventManager?.clear(),
      setGravitationalEventAutoSpawn: (enabled: boolean) => {
        this.gravitationalEventManager?.setAutoSpawnEnabled(Boolean(enabled))
      },
    })

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /**
   * One-shot actions, orbit state machine, and telemetry emission (runs just after input).
   */
  tick(dt: number): void {
    this.mapIntro.tick(dt)
    this.tickStartupIntroCamera()
    this.emitIntroUiState()
    const introLocked = this.mapIntro.controlsLocked

    this.syncVehicleCameraShipYawCoupling()

    // Map toggle (M key) — opens/closes tactical map
    if (!introLocked && !this.habitatState.isActive && this.inputManager?.wasActionPressed('toggleMap')) {
      if (!this.mapState.isOpen) {
        // Guard: block during death or orbit approach
        const orbitState = this.orbitSystem?.state ?? 'free'
        const isDead = this.shuttleController?.dead ?? false
        if (!isDead && orbitState !== 'approaching') {
          this.mapState.open()
          this.onOpenMap()
        }
      } else if (this.mapState.phase === 'open') {
        this.mapState.close()
      }
    }

    // Also close on Escape
    if (
      !introLocked &&
      this.inputManager?.wasActionPressed('closeMap') &&
      this.mapState.phase === 'open'
    ) {
      this.mapState.close()
    }

    // Tick map transition
    if (this.mapState.isOpen) {
      this.mapState.tick(dt)
      this.tickMapTransition()

      // When closing completes, restore flying state
      if (this.mapState.phase === 'closed') {
        this.onCloseMap()
      }

      // Skip all gameplay logic while map is open
      return
    }

    // Habitat state machine
    if (this.habitatState.isActive) {
      const prevPhase = this.habitatState.phase
      this.habitatState.tick(dt)

      // Lazy-load scene on first entry
      if (this.habitatState.phase !== 'map' && !this.habitatScene) {
        this.ensureHabitatScene()
      }

      this.tickHabitatTransition()

      // Detect waking_up → habitat (wake-up complete, give player control)
      if (prevPhase === 'waking_up' && this.habitatState.phase === 'habitat') {
        this.onEnterHabitat()
      }

      // When exit completes, restore map state
      if (this.habitatState.phase === 'map') {
        this.onExitHabitat()
      }

      // While in habitat, tick the interior scene
      if (this.habitatState.phase === 'habitat' && this.habitatScene) {
        this.habitatScene.tick(dt)

        // Check for exit via Escape/H inside the habitat's own input
        if (this.habitatScene.inputManager.wasActionPressed('exitHabitat')) {
          this.habitatState.leave()
        }
      }

      // Emit fade overlay state
      this.onHabitatFade?.(this.getHabitatFadeOpacity())

      // Skip map gameplay while in habitat
      if (this.habitatState.phase !== 'map') return
    }

    if (introLocked) {
      return
    }

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

    // Habitat interior (H key) — enter/exit first-person interior
    if (
      this.inputManager?.wasActionPressed('focusHabitat') &&
      this.shuttleController &&
      this.sceneObjects
    ) {
      if (!this.habitatState.isActive) {
        // Enter habitat
        if (!this.inspectMode) {
          this.shuttleController.toggleDoors()
          this.inspectMode = true
        }
        this.habitatState.enter()
      } else if (this.habitatState.phase === 'habitat') {
        // Leave habitat
        this.habitatState.leave()
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
          this.vehicleCamera?.applyConfigTuning(
            buildSlingshotChargeCameraConfig(this.slingshotCharge),
          )
          this.updateLaunchArrow()
        } else if (this.slingshotCharge > 0) {
          const trajectoryBlocked = this.isAimingAtPlanet()
          if (!canReleaseSlingshot(this.slingshotCharge, trajectoryBlocked)) {
            this.slingshotCharge = 0
            this.vehicleCamera?.setConfig(MAP_ORBIT_CAMERA_CONFIG)
            this.hideLaunchArrow()
          } else {
            const heading = this.shuttleController.group.rotation.y
            const launchVelocity = this.orbitSystem.launchSlingshot(heading, dt)
            const vel = new THREE.Vector3(launchVelocity.vx, 0, launchVelocity.vz)
            const finalSpeed = Math.sqrt(launchVelocity.vx ** 2 + launchVelocity.vz ** 2)
            const burstSpeed = this.shuttleController.beginSlingshotBurst(
              finalSpeed,
              orbitConfig.slingshotBurstMultiplier,
              orbitConfig.slingshotSettleDuration,
            )
            vel.setLength(burstSpeed)

            this.shuttleController.unfreeze()
            this.shuttleController.orbitYawLeft = false
            this.shuttleController.orbitYawRight = false
            this.shuttleController.setVelocity(vel)
            this.shuttleController.setSlingshotSpeed(burstSpeed)
            this.shuttleController.triggerSlingshotLaunchFx(orbitConfig.slingshotLaunchFxDuration)

            // Launch costs are still tied to the committed full-charge release.
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
          }
        }
      }
    }

    // Shop action (B key) — toggle shop while orbiting
    if (
      this.inputManager?.wasActionPressed('shopAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.shopSession
    ) {
      if (this.shopDialogOpen) {
        this.shopDialogOpen = false
        this.onShopState?.(null, this.playerProfile, this.playerInventory)
      } else {
        this.shopDialogOpen = true
        this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
      }
    }

    // Mission action (I key) — open mission overlay while orbiting
    if (
      this.inputManager?.wasActionPressed('missionAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.missionButtonVisible
    ) {
      if (this.missionOverlayOpen) {
        this.missionOverlayOpen = false
        this.onMissionOverlay?.(false, null, false)
      } else {
        const targetName = this.orbitSystem?.target?.name ?? null
        const planet = targetName ? PLANETS.find((p) => p.name === targetName) : null
        if (planet) {
          const missions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
          if (missions.length > 0) {
            const mission = missions[0]!
            const gatherItem = getGatherItemForPlanet(planet.id)
            const canFit = gatherItem
              ? canFitItem(this.playerInventory, gatherItem, mission.template.gatherQuantity)
              : false
            this.missionOverlayOpen = true
            this.onMissionOverlay?.(true, mission, canFit)
          }
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

    // Spacetime curvature effects — local Y displacement + slope speed modifier
    // Only in free flight, not during orbit capture or yRecovery
    if (
      this.shuttleController &&
      this.spaceTimeGrid &&
      !this.yRecovery &&
      !this.shuttleController.dead &&
      (this.orbitSystem?.state ?? 'free') === 'free'
    ) {
      const px = this.shuttleController.position.x
      const pz = this.shuttleController.position.z

      // Slope speed modifier — downhill accelerates, uphill decelerates
      const vel = this.shuttleController.currentVelocity
      const speed = vel.length()
      if (speed > 0.01) {
        const dirX = vel.x / speed
        const dirZ = vel.z / speed
        const slope = this.spaceTimeGrid.getSlopeAt(px, pz, dirX, dirZ)
        // Positive slope = moving downhill = speed boost
        const speedDelta = slope * CURVATURE_SPEED_FACTOR * dt
        const newSpeed = Math.max(0, speed + speedDelta)
        vel.setLength(newSpeed)
        this.shuttleController.setVelocity(vel)
      }

      // Barycenter pull on Y — as proximity increases, grid Y lerps toward 0 (body center)
      // At proximity=0 (outside influence) → pure grid Y
      // At proximity=1 (event horizon) → Y=0 (at the body)
      const proximity = this.computeMaxProximity(px, pz)
      if (proximity > 0) {
        const gridY = this.shuttleController.group.position.y
        this.shuttleController.group.position.y = gridY * (1 - proximity)
      }
    }

    // Orbit approach — animated lerp toward orbit insertion point
    if (
      this.orbitSystem?.state === 'approaching' &&
      this.shuttleController &&
      this.approachStartPos
    ) {
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
          this.orbitSystem.target.getWorldX(),
          0,
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

    if (this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      this.shuttleController.thrusterSystem.consumeFuel(
        computeShuttleBaseFuelDrain(dt, orbitState !== 'orbiting'),
      )
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
        adriftCountdown: this.adriftTimer > 0 ? ADRIFT_TIMEOUT - this.adriftTimer : -1,
        hp: this.shipHealth?.hp ?? 100,
        maxHp: this.shipHealth?.maxHp ?? 100,
        temperature: this.shipHealth?.temperature ?? 0,
        temperatureVisible: this.shipHealth?.temperatureVisible ?? false,
        damageIntensity: this.shipHealth?.damageIntensity ?? 0,
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

    // Constant-screen-size shuttle scale — keeps the ship visible when zoomed out
    this.tickShuttleScale(dt)

    // Ambient particles are only active during free flight, not orbit/approach
    if (this.ambientSpace) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      this.ambientSpace.setActive(orbitState === 'free')
    }

    // Adrift check — 60s with no fuel in free flight = game over
    if (this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const hasFuel = this.shuttleController.thrusterSystem.fuelLevel > 0
      if (orbitState === 'free' && !hasFuel) {
        this.adriftTimer += dt
        if (this.adriftTimer >= ADRIFT_TIMEOUT) {
          this.triggerDeath('Adrift')
        }
      } else {
        this.adriftTimer = 0
      }
    }

    // Ship health — temperature drift + radiation/temp damage
    if (this.shipHealth && this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const px = this.shuttleController.position.x
      const pz = this.shuttleController.position.z
      const sunDist = Math.sqrt(px * px + pz * pz)
      const radiationProximity = this.sunController
        ? this.computeProximity(
            this.sunController.getWorldX(),
            this.sunController.getWorldZ(),
            this.sunController.mass,
            px, pz,
          )
        : 0
      const isHealingAtEarth = orbitState === 'orbiting'
        && this.orbitSystem?.target?.name === 'Earth'
      this.shipHealth.tick(
        dt, sunDist, radiationProximity, isHealingAtEarth,
        getCurrentUpgradeValue('heatShieldResistance'),
        getCurrentUpgradeValue('heatShieldArmor'),
      )
    }

    // Planet collision — instant death if shuttle flies into a planet mesh
    if (this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      if (orbitState === 'free') {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        for (let i = 0; i < this.planetControllers.length; i++) {
          const c = this.planetControllers[i]!
          const dx = c.getWorldX() - px
          const dz = c.getWorldZ() - pz
          const dist = Math.sqrt(dx * dx + dz * dz)
          const collisionRadius = PLANETS[i]!.displayRadius * SIZE_SCALE
          if (dist < collisionRadius) {
            this.triggerDeath(`Crashed Into ${PLANETS[i]!.name}`)
            return
          }
        }
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
            px,
            pz,
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
    // Pause simulation while map is open
    if (this.mapState.isOpen) return

    this.simTime += dt * DEFAULT_TIME_SCALE

    this.sunController?.tick(dt, this.simTime)

    for (const controller of this.planetControllers) {
      controller.tick(dt, this.simTime)
    }

    // Asteroid belt LOD — show fewer instances when camera is zoomed out
    if (this.vehicleCamera) {
      const camY = Math.abs(this.vehicleCamera.camera.position.y)
      // Camera Y increases as user zooms out via orbit controls
      // Close (camY < 5): full detail. Far (camY > 100): minimal
      const lodFraction = camY < 5 ? 1.0
        : camY < 20 ? 0.5
        : camY < 50 ? 0.25
        : 0.1
      for (const controller of this.beltControllers) {
        controller.setLodFraction(lodFraction)
      }
    }

    const shuttleWorldForBelts: THREE.Vector3 | null = this.shuttleController
      ? this.shuttleController.group.getWorldPosition(this._beltShuttleWorldScratch)
      : null
    for (const controller of this.beltControllers) {
      controller.tick(dt, this.simTime, shuttleWorldForBelts)
    }

    const shuttleX = this.shuttleController?.group.position.x ?? 0
    const shuttleZ = this.shuttleController?.group.position.z ?? 0
    this.gravitationalEventManager?.tick(dt, shuttleX, shuttleZ)

    if (this.spaceTimeGrid) {
      // Only re-add moving planets that are massive enough (Jupiter, Saturn, etc.)
      // Sun is a static source — added once at init
      this.spaceTimeGrid.clearSources()
      for (let i = 0; i < this.planetControllers.length; i++) {
        const controller = this.planetControllers[i]!
        if (controller.mass < GRID_MASS_THRESHOLD) continue
        const planetId = PLANETS[i]?.id
        const gasGiantWideWell = planetId === 'jupiter' || planetId === 'saturn'
        this.spaceTimeGrid.addSource({
          x: controller.getWorldX(),
          z: controller.getWorldZ(),
          mass: controller.mass,
          ...(gasGiantWideWell ? { wellWidthMultiplier: MAP_GRID_GAS_GIANT_WELL_WIDTH_MULT } : {}),
        })
      }
      if (this.gravitationalEventManager) {
        for (const src of this.gravitationalEventManager.getGridSourcesNear(shuttleX, shuttleZ)) {
          this.spaceTimeGrid.addSource(src)
        }
      }
      this.syncSpaceTimeGridVisualBudget()
      this.spaceTimeGrid.tick(dt)
    }

    // Orbit position driving — runs AFTER planets move to avoid jitter
    if (this.orbitSystem?.state === 'orbiting' && this.shuttleController && this.inputManager) {
      const pos = this.orbitSystem.tickOrbit(dt)
      const planetY = this.orbitSystem.target
        ? (this.planetControllers.find(
            (_c, i) => PLANETS[i]?.name === this.orbitSystem!.target?.name,
          )?.group.position.y ?? 0)
        : 0
      if (pos) {
        this.shuttleController.group.position.set(pos.x, planetY, pos.z)
      }
      // A/D yaw — input is disabled so read InputManager directly and set orbit flags for VFX
      const yawLeft =
        !this.mapIntro.controlsLocked &&
        this.inputManager.isActionActive('yawLeft') &&
        this.shuttleController.thrusterSystem.canFire('rcs', {
          burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
        })
      const yawRight =
        !this.mapIntro.controlsLocked &&
        this.inputManager.isActionActive('yawRight') &&
        this.shuttleController.thrusterSystem.canFire('rcs', {
          burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
        })
      this.shuttleController.orbitYawLeft = yawLeft
      this.shuttleController.orbitYawRight = yawRight
      if (yawLeft) {
        this.shuttleController.group.rotateY(MAP_PHYSICS.yawTorque * dt)
      }
      if (yawRight) {
        this.shuttleController.group.rotateY(-MAP_PHYSICS.yawTorque * dt)
      }
      this.shuttleController.thrusterSystem.tick(
        dt,
        {
          thrust: false,
          brake: false,
          rcs: yawLeft || yawRight,
        },
        { burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers() },
      )
      if (this.orbitSystem.target && this.vehicleCamera) {
        const bx = this.orbitSystem.target.getWorldX()
        const bz = this.orbitSystem.target.getWorldZ()
        this.vehicleCamera.controls.target.set(bx, planetY, bz)
        if (this.orbitRing) {
          this.orbitRing.position.set(bx, planetY, bz)
        }
      }
      this.updateShopSession()
      this.updateMissionState()
      this.missionBoard = tickMissionBoard(this.missionBoard, dt)
    }

    // Shop session restock tick
    if (this.shopSession) {
      this.shopSession = tickShopSession(this.shopSession, dt)
    }

    // Global demand variance tick
    tickDemandTimer(dt)

    this.recordWorldLinePoint()
    this.triggerRuntimeMessages()
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

  /**
   * Toggles the visibility of all planet and moon orbit lines.
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleOrbits(): boolean {
    this.orbitsVisible = !this.orbitsVisible
    for (const controller of this.planetControllers) {
      for (const line of controller.orbitLines) {
        line.visible = this.orbitsVisible
      }
    }
    return this.orbitsVisible
  }

  /**
   * Toggles the visibility of the space-time fabric grid mesh.
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleSpaceTimeGrid(): boolean {
    this.gridVisible = !this.gridVisible
    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.mesh.visible = this.gridVisible
      if (this.gridVisible) {
        this.syncSpaceTimeGridVisualBudget()
        this.spaceTimeGrid.forceFullVisualDeform()
      }
    }
    return this.gridVisible
  }

  /**
   * Drives grid wireframe LOD from orbit-camera distance and FOV.
   * Analytical shuttle depth/slope math is unchanged; only vertex deformation cost drops.
   */
  private syncSpaceTimeGridVisualBudget(): void {
    if (!this.spaceTimeGrid || !this.vehicleCamera || this.mapGridSize <= 0) {
      return
    }

    const cam = this.vehicleCamera.camera
    const target = this.vehicleCamera.controls.target
    const dist = cam.position.distanceTo(target)
    if (dist < 1e-4) {
      return
    }

    const vFovRad = THREE.MathUtils.degToRad(cam.fov)
    const halfViewZ = dist * Math.tan(vFovRad / 2)
    const halfViewX = halfViewZ * cam.aspect

    const spanX = 2 * halfViewX
    const spanZ = 2 * halfViewZ
    const coversWholeMap =
      spanX >= this.mapGridSize * GRID_DEFORM_WHOLE_MAP_COVERAGE &&
      spanZ >= this.mapGridSize * GRID_DEFORM_WHOLE_MAP_COVERAGE

    const intervalScale = coversWholeMap ? GRID_DEFORM_INTERVAL_SCALE_WHOLE_MAP : 1

    this.spaceTimeGrid.setVisualDeformBudget({
      intervalScale,
      useSpatialCull: !coversWholeMap,
      cullCenterX: target.x,
      cullCenterZ: target.z,
      cullHalfExtentX: halfViewX,
      cullHalfExtentZ: halfViewZ,
    })
  }

  /**
   * Toggles all ambient space particle layers (dust, rocks, clouds, comets).
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleAmbient(): boolean {
    if (!this.ambientSpace) return true
    return this.ambientSpace.toggle()
  }

  /** Create or destroy shop session based on orbit state. */
  private updateShopSession(): void {
    const orbitState = this.orbitSystem?.state ?? 'free'
    const targetName = this.orbitSystem?.target?.name ?? null

    if (orbitState === 'orbiting' && targetName && !this.shopSession) {
      const planet = PLANETS.find((p) => p.name === targetName)
      if (planet) {
        this.shopSession = createShopSession(planet.id)
        this.offerMissionAtPlanet(planet.id)
        this.onShopButton?.(true, targetName)
        this.onCreditsUpdate?.(this.playerProfile.credits)
      } else {
        // Non-planet body (e.g. Sun) — no shop
        this.onShopButton?.(false, '')
      }
    } else if (orbitState !== 'orbiting' && this.shopSession) {
      this.shopSession = null
      this.shopDialogOpen = false
      this.onShopButton?.(false, '')
      this.onShopState?.(null, this.playerProfile, this.playerInventory)
    }
  }

  /** Update mission button visibility based on orbit state. */
  private updateMissionState(): void {
    const orbitState = this.orbitSystem?.state ?? 'free'
    const targetName = this.orbitSystem?.target?.name ?? null

    if (orbitState === 'orbiting' && targetName) {
      const planet = PLANETS.find((p) => p.name === targetName)
      if (planet) {
        const activeMissions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
        const hasActiveMission = activeMissions.length > 0
        if (hasActiveMission !== this.missionButtonVisible) {
          this.missionButtonVisible = hasActiveMission
          this.onMissionButton?.(hasActiveMission, targetName)
        }
      }
    } else if (this.missionButtonVisible) {
      this.missionButtonVisible = false
      this.onMissionButton?.(false, '')
      if (this.missionOverlayOpen) {
        this.missionOverlayOpen = false
        this.onMissionOverlay?.(false, null, false)
      }
    }
  }

  /** Open the shop dialog (called by Vue ShopButton click). */
  openShop(): void {
    if (this.shopSession) {
      this.shopDialogOpen = true
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    }
  }

  /** Close the shop dialog (called by Vue). */
  closeShop(): void {
    this.shopDialogOpen = false
  }

  /** Offer a mission when docking at a planet. */
  offerMissionAtPlanet(planetId: string): void {
    if (!this.missionBoard.offeredMission) {
      this.missionBoard = offerMission(this.missionBoard, planetId)
      this.onMissionBoardUpdate?.(this.missionBoard)
    }
  }

  /** Accept the offered mission (from shuttle control UI). */
  missionAccept(): void {
    this.missionBoard = acceptMission(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }

  /** Complete the mission minigame (from overlay UI). */
  missionComplete(missionId: string): void {
    const result = completeMission(this.missionBoard, missionId, this.playerInventory)
    if (result.ok) {
      this.missionBoard = result.board
      this.playerInventory = result.inventory
      this.missionOverlayOpen = false
      this.onMissionOverlay?.(false, null, false)
      this.onMissionBoardUpdate?.(this.missionBoard)
      this.onMissionComplete?.(result.board.activeMissions.find(
        (m) => m.template.id === missionId,
      ) ?? null)
    }
  }

  /** Deliver a completed mission (from shuttle control UI). */
  missionDeliver(missionId: string): void {
    const mission = this.missionBoard.activeMissions.find((m) => m.template.id === missionId)
    const result = deliverMission(this.missionBoard, missionId, this.playerProfile, this.playerInventory)
    if (result.ok) {
      this.missionBoard = result.board
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onMissionBoardUpdate?.(this.missionBoard)
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.onMissionDeliver?.(mission ?? null)
    }
  }

  /** Open the mission overlay (called by Vue OrbitPrompt click). */
  openMissionOverlay(): void {
    if (!this.missionButtonVisible || this.missionOverlayOpen) return
    const targetName = this.orbitSystem?.target?.name ?? null
    const planet = targetName ? PLANETS.find((p) => p.name === targetName) : null
    if (!planet) return
    const missions = getActiveMissionsForPlanet(this.missionBoard, planet.id)
    if (missions.length === 0) return
    const mission = missions[0]!
    const gatherItem = getGatherItemForPlanet(planet.id)
    const canFit = gatherItem
      ? canFitItem(this.playerInventory, gatherItem, mission.template.gatherQuantity)
      : false
    this.missionOverlayOpen = true
    this.onMissionOverlay?.(true, mission, canFit)
  }

  /** Buy a trade good from the shop. */
  shopBuyTradeGood(slotIndex: number, quantity: number): void {
    if (!this.shopSession) return
    const result = buyTradeGood(
      this.shopSession,
      this.playerProfile,
      this.playerInventory,
      slotIndex,
      quantity,
    )
    if (result.ok) {
      this.shopSession = result.session
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.emitFuelCellCount()
    }
  }

  /** Sell an item from inventory at the current planet. */
  shopSellItem(itemId: string, quantity: number): void {
    if (!this.shopSession) return
    const result = sellTradeGood(
      this.shopSession,
      this.playerProfile,
      this.playerInventory,
      itemId,
      quantity,
    )
    if (result.ok) {
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.emitFuelCellCount()
    }
  }

  /** Refuel the shuttle (instant, costs credits). */
  shopRefuel(): void {
    if (!this.shuttleController) return
    const updated = spendCredits(this.playerProfile, REFUEL_COST)
    if (!updated) return
    this.playerProfile = updated
    this.shuttleController.thrusterSystem.refuel()
    this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Buy a reserve fuel cell (inventory item). */
  shopBuyReserveFuel(): void {
    if (!this.shopSession) return
    const updated = spendCredits(this.playerProfile, RESERVE_FUEL_COST)
    if (!updated) return
    const addResult = addItem(this.playerInventory, RESERVE_FUEL_ID, 1)
    if (!addResult.ok) return
    this.playerProfile = updated
    this.playerInventory = addResult.inventory
    this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitFuelCellCount()
  }

  /** Buy a lander fuel cell (inventory item). */
  shopBuyLanderFuel(): void {
    if (!this.shopSession) return
    const updated = spendCredits(this.playerProfile, LANDER_FUEL_COST)
    if (!updated) return
    const addResult = addItem(this.playerInventory, LANDER_FUEL_ID, 1)
    if (!addResult.ok) return
    this.playerProfile = updated
    this.playerInventory = addResult.inventory
    this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Repair hull to 100% (Earth only, 250 credits). */
  shopRepairHull(): void {
    if (!this.shipHealth) return
    const updated = spendCredits(this.playerProfile, REPAIR_COST)
    if (!updated) return
    this.playerProfile = updated
    this.shipHealth.repairFull()
    if (this.shopSession) {
      this.onShopState?.(this.shopSession, this.playerProfile, this.playerInventory)
    }
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Emit the current fuel cell count to the Vue HUD. */
  private emitFuelCellCount(): void {
    const stack = getStack(this.playerInventory, RESERVE_FUEL_ID)
    this.onFuelCellCount?.(stack?.quantity ?? 0)
  }

  /** Consume a fuel cell from inventory and restore 50% fuel. */
  useFuelCell(): void {
    if (!this.shuttleController) return
    const stack = getStack(this.playerInventory, RESERVE_FUEL_ID)
    if (!stack || stack.quantity <= 0) return
    const result = consumeItem(this.playerInventory, RESERVE_FUEL_ID, 1)
    if (!result.ok) return
    this.playerInventory = result.inventory
    const halfTank = this.shuttleController.thrusterSystem.fuelCapacity * 0.5
    this.shuttleController.thrusterSystem.addFuel(halfTank)
    this.emitFuelCellCount()
  }

  /**
   * Builds the zoom-out tactical reticle: a static ring plus a wedge that aligns
   * with planar velocity as seen on screen (`tickShuttleScale` updates opacity
   * and pointer rotation each frame).
   */
  private createShipReticle(): void {
    const scene = this.sceneObjects?.scene
    if (!scene) return

    const size = 128
    const ringCanvas = document.createElement('canvas')
    ringCanvas.width = size
    ringCanvas.height = size
    const ctx = ringCanvas.getContext('2d')!
    const cx = size / 2
    const cy = size / 2
    const ringR = 46
    const tickInner = 53
    const tickOuter = 63

    // Outer soft glow halo
    ctx.beginPath()
    ctx.arc(cx, cy, ringR + 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.18)'
    ctx.lineWidth = 10
    ctx.stroke()

    // Main ring
    ctx.beginPath()
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 230, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.stroke()

    // Four axis tick marks outside the ring
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(cx + cos * tickInner, cy + sin * tickInner)
      ctx.lineTo(cx + cos * tickOuter, cy + sin * tickOuter)
      ctx.strokeStyle = 'rgba(0, 230, 255, 0.95)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const ringTex = new THREE.CanvasTexture(ringCanvas)
    ringTex.needsUpdate = true

    const ringMat = new THREE.SpriteMaterial({
      map: ringTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.shipReticleRing = new THREE.Sprite(ringMat)

    // Motion wedge: drawn along +canvas X so `atan2` of projected velocity in NDC maps cleanly.
    const wedgeCanvas = document.createElement('canvas')
    wedgeCanvas.width = size
    wedgeCanvas.height = size
    const wctx = wedgeCanvas.getContext('2d')!
    const tipX = cx + 50
    const baseX = cx + 14
    const halfW = 13
    wctx.beginPath()
    wctx.moveTo(tipX, cy)
    wctx.lineTo(baseX, cy - halfW)
    wctx.lineTo(baseX, cy + halfW)
    wctx.closePath()
    wctx.fillStyle = 'rgba(0, 235, 255, 0.92)'
    wctx.fill()
    wctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
    wctx.lineWidth = 1
    wctx.stroke()

    const wedgeTex = new THREE.CanvasTexture(wedgeCanvas)
    wedgeTex.needsUpdate = true

    const wedgeMat = new THREE.SpriteMaterial({
      map: wedgeTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.shipReticlePointer = new THREE.Sprite(wedgeMat)
    this.shipReticlePointer.visible = false

    this.shipReticleGroup = new THREE.Group()
    this.shipReticleGroup.add(this.shipReticleRing)
    this.shipReticleGroup.add(this.shipReticlePointer)
    this.shipReticleGroup.visible = false
    scene.add(this.shipReticleGroup)
  }

  /**
   * Maintains a minimum apparent screen size for the shuttle model so it
   * remains visible as a navigation marker when the camera is pulled far back.
   *
   * Uses the constant-screen-size formula:
   *   requiredScale = (MIN_APPARENT_SIZE * 2 * dist * tan(fov/2)) / BASE_SIZE
   *
   * The actual scale is lerped toward the target each frame to avoid a
   * visible pop at the transition distance.
   */
  private tickShuttleScale(dt: number): void {
    if (!this.shuttleController || !this.vehicleCamera) return
    const dist = this.vehicleCamera.camera.position.distanceTo(
      this.shuttleController.group.position,
    )
    const halfFovRad = THREE.MathUtils.degToRad(this.vehicleCamera.camera.fov / 2)
    const minWorldSize = MAP_SHUTTLE_MIN_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
    const requiredScale = minWorldSize / MAP_SHUTTLE_BASE_SIZE
    const targetScale = Math.max(MAP_SHUTTLE_SCALE, requiredScale)
    this.currentShuttleScale = THREE.MathUtils.lerp(
      this.currentShuttleScale,
      targetScale,
      Math.min(1, MAP_SHUTTLE_SCALE_LERP * dt),
    )
    this.shuttleController.group.scale.setScalar(this.currentShuttleScale)

    // ── Tactical reticle ──────────────────────────────────────────────────────
    if (this.shipReticleGroup && this.shipReticleRing && this.shipReticlePointer) {
      // How many times the scale has been boosted above the base value
      const overscale = this.currentShuttleScale / MAP_SHUTTLE_SCALE
      // Smoothly map overscale → [0, 1] opacity window
      const t = THREE.MathUtils.clamp(
        (overscale - MAP_RETICLE_FADE_START) / (MAP_RETICLE_FADE_END - MAP_RETICLE_FADE_START),
        0,
        1,
      )
      const reticleAlpha = t * t * (3 - 2 * t) // smoothstep

      if (reticleAlpha > 0.005) {
        this.shipReticleGroup.visible = true
        this.shipReticleGroup.position.copy(this.shuttleController.group.position)
        const reticleWorld = MAP_RETICLE_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
        this.shipReticleGroup.scale.setScalar(reticleWorld)
        ;(this.shipReticleRing.material as THREE.SpriteMaterial).opacity = reticleAlpha

        const cam = this.vehicleCamera.camera
        const vel = this.shuttleController.currentVelocity
        const speed = Math.hypot(vel.x, vel.z)
        if (speed >= MAP_RETICLE_MIN_SPEED) {
          this._reticleVelPlanar.set(vel.x, 0, vel.z).normalize()
          this._reticleProjA.copy(this.shuttleController.group.position).project(cam)
          this._reticleProjB
            .copy(this.shuttleController.group.position)
            .add(this._reticleVelPlanar)
            .project(cam)
          const ndcDx = this._reticleProjB.x - this._reticleProjA.x
          const ndcDy = this._reticleProjB.y - this._reticleProjA.y
          if (ndcDx * ndcDx + ndcDy * ndcDy >= MAP_RETICLE_MIN_NDC_DELTA_SQ) {
            this.shipReticlePointer.visible = true
            ;(this.shipReticlePointer.material as THREE.SpriteMaterial).rotation = Math.atan2(
              ndcDy,
              ndcDx,
            )
            ;(this.shipReticlePointer.material as THREE.SpriteMaterial).opacity = reticleAlpha
          } else {
            this.shipReticlePointer.visible = false
          }
        } else {
          this.shipReticlePointer.visible = false
        }
      } else {
        this.shipReticleGroup.visible = false
      }
    }
  }

  /** Reset shuttle after death — clear death state, place into Earth orbit. */
  /** Unified death handler — explode or freeze ship, zoom camera, show overlay. */
  private triggerDeath(cause: string): void {
    if (!this.shuttleController) return

    const isCold = cause === 'Hull Frozen' || cause === 'Adrift'

    if (isCold) {
      // Freeze effect — tint shuttle blue/icy, keep visible
      this.shuttleController.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          for (const material of materials) {
            if (!isEmissiveMaterial(material)) continue
            material.emissive.set(0x4488ff)
            material.emissiveIntensity = 0.6
          }
        }
      })
    } else {
      // Explosion burst at shuttle position
      if (this.explosionEmitter) {
        const pos = this.shuttleController.position.clone()
        for (let i = 0; i < 150; i++) {
          const dir = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 1.5,
            (Math.random() - 0.5) * 2,
          ).multiplyScalar(MAP_SHUTTLE_SCALE * 3)
          this.explosionEmitter.emit(pos, dir)
        }
      }
      // Hide shuttle mesh
      this.shuttleController.group.visible = false
    }

    // Disable all input + freeze movement
    this.shuttleController.setInputEnabled(false)
    this.shuttleController.freeze()

    // Camera + overlay
    this.vehicleCamera?.setConfig(MAP_DEATH_CAMERA_CONFIG)
    this.onDeathOverlay?.(true, cause)
  }

  private respawnAtEarth(): void {
    if (!this.shuttleController || !this.orbitSystem) return

    // Reset shop and economy state
    this.shopSession = null
    this.playerProfile = createProfile('Pilot')
    this.playerInventory = createInventory()
    resetDemand()
    this.onShopButton?.(false, '')
    this.onShopState?.(null, this.playerProfile, this.playerInventory)
    this.onCreditsUpdate?.(this.playerProfile.credits)

    // Clear death state + show shuttle again, remove ice tint
    this.shuttleController.resetDeath()
    this.shuttleController.group.visible = true
    this.shuttleController.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) {
          if (!isEmissiveMaterial(material) || material.emissiveIntensity <= 0) continue
          material.emissive.set(0x000000)
          material.emissiveIntensity = 0
        }
      }
    })
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
    this.shipHealth?.reset()
    this.resetWorldLineHistory()
  }

  /**
   * Compute gravity proximity for a single source (0 = at influence edge, 1 = at event horizon).
   * Returns 0 if outside influence radius.
   */
  private computeProximity(
    sourceX: number,
    sourceZ: number,
    mass: number,
    px: number,
    pz: number,
  ): number {
    const dx = sourceX - px
    const dz = sourceZ - pz
    const dist = Math.sqrt(dx * dx + dz * dz)
    const influence = influenceRadius(mass, MAP_GRAVITY_CONFIG)
    const horizon = eventHorizonRadius(mass, MAP_GRAVITY_CONFIG)
    if (dist >= influence) return 0
    return Math.min(1, 1 - (dist - horizon) / (influence - horizon))
  }

  /** Max proximity across Sun + all planets at a point. */
  private computeMaxProximity(px: number, pz: number): number {
    let max = 0
    if (this.sunController) {
      max = Math.max(
        max,
        this.computeProximity(
          this.sunController.getWorldX(),
          this.sunController.getWorldZ(),
          this.sunController.mass,
          px,
          pz,
        ),
      )
    }
    for (const c of this.planetControllers) {
      max = Math.max(max, this.computeProximity(c.getWorldX(), c.getWorldZ(), c.mass, px, pz))
    }
    return max
  }

  /** Returns true if the shuttle is aiming toward the captured planet. */
  private isAimingAtPlanet(): boolean {
    if (!this.shuttleController || !this.orbitSystem?.target) return false
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(
      this.shuttleController.group.quaternion,
    )
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

  /**
   * Rotating the shuttle with A/D should swing the chase cam only in free flight;
   * during planet orbit capture, yaw is for aiming and must not drag the camera offset.
   */
  private syncVehicleCameraShipYawCoupling(): void {
    if (!this.vehicleCamera) return
    const orbitState = this.orbitSystem?.state ?? 'free'
    const driving = orbitState === 'free'
    this.vehicleCamera.setShipYawCoupling(driving)
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

  /**
   * After a dev teleport, exit orbit capture UI/state so free-flight matches the new pose.
   */
  private prepareShuttleAfterDevWarp(): void {
    this.orbitSystem?.resetToFreeFlight()
    this.approachStartPos = null
    this.slingshotCharge = 0
    this.hideLaunchArrow()
    this.hideOrbitRing()
    this.shuttleController?.unfreeze()
    this.shuttleController?.setInputEnabled(true)
    this.vehicleCamera?.setConfig(MAP_CAMERA_CONFIG)
    if (this.shuttleController) {
      this.vehicleCamera?.setTarget(this.shuttleController.group)
    }
  }

  /**
   * Dev-console warp: move the shuttle just outside a body's current location (anti-sunward).
   *
   * @param bodyId - Case-insensitive catalog id: `sun` or any planet id (`earth`, `mars`, …).
   */
  private devWarpNearBody(bodyId: string): void {
    const shuttle = this.shuttleController
    if (!shuttle) {
      console.warn('[MapView] warp: shuttle not ready')
      return
    }

    const key = bodyId.trim().toLowerCase()
    if (!key) {
      console.info(
        `[MapView] warp("earth") — ids: sun, ${PLANETS.map((p) => p.id).join(', ')}`,
      )
      return
    }

    this.prepareShuttleAfterDevWarp()
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))

    if (key === 'sun') {
      if (!this.sunController) return
      const sx = this.sunController.getWorldX()
      const sz = this.sunController.getWorldZ()
      const standoff = mapWarpStandoffWorldUnits(SUN.displayRadius)
      shuttle.group.position.set(sx + standoff, 0, sz)
      shuttle.group.rotation.set(0, 0, 0)
      console.info(`[MapView] warp → Sun (~${standoff.toFixed(1)} u along +X)`)
      return
    }

    const planet = PLANETS.find((p) => p.id === key)
    if (!planet) {
      console.warn(`[MapView] warp: unknown body "${bodyId}"`)
      console.info(
        `[MapView] Try: sun, ${PLANETS.map((p) => p.id).join(', ')}`,
      )
      return
    }

    const idx = PLANETS.indexOf(planet)
    const ctrl = this.planetControllers[idx]
    if (!ctrl) return

    const bx = ctrl.getWorldX()
    const bz = ctrl.getWorldZ()
    const standoff = mapWarpStandoffWorldUnits(planet.displayRadius)
    const awayFromSun = Math.atan2(bz, bx)
    shuttle.group.position.set(
      bx + Math.cos(awayFromSun) * standoff,
      0,
      bz + Math.sin(awayFromSun) * standoff,
    )
    shuttle.group.rotation.set(0, awayFromSun, 0)
    console.info(
      `[MapView] warp → ${planet.name} (standoff ${standoff.toFixed(1)} u; body ${bx.toFixed(1)}, ${bz.toFixed(1)})`,
    )
  }

  /** Called when the map first opens. Freezes everything, positions ortho camera. */
  private onOpenMap(): void {
    if (!this.shuttleController || !this.mapCamera) return

    // Freeze shuttle — no physics, no thrusters, no fuel
    this.shuttleController.freeze()
    this.shuttleController.setInputEnabled(false)

    // Disable OrbitControls
    if (this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = false
    }

    // Dim the spacetime grid so labels are readable
    if (this.spaceTimeGrid) {
      const mat = this.spaceTimeGrid.mesh.material as THREE.LineBasicMaterial
      mat.opacity = 0.15
      mat.transparent = true
    }

    // Position ortho camera above ship
    const px = this.shuttleController.position.x
    const pz = this.shuttleController.position.z
    const aspect = window.innerWidth / window.innerHeight
    this.mapCamera.positionAboveShip(px, pz, aspect)
  }

  /** Runs each frame while map is opening/open/closing — updates camera transition and overlay. */
  private tickMapTransition(): void {
    if (!this.mapCamera || !this.sceneObjects) return

    const progress = easeInOut(this.mapState.progress)
    const aspect = window.innerWidth / window.innerHeight

    // Update ortho frustum based on transition progress
    this.mapCamera.updateTransition(progress, aspect)

    // Swap render camera to ortho during map phases
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (this.mapState.phase === 'opening' || this.mapState.phase === 'open') {
      renderPass.camera = this.mapCamera.camera
    }

    // Emit overlay state when fully open
    if (this.mapState.phase === 'open') {
      this.emitMapOverlay()
    } else {
      // During transitions, hide overlay
      this.onMapOverlay?.({
        visible: false,
        labels: [],
        shipX: 0,
        shipY: 0,
        headingDeg: 0,
        speed: 0,
        distances: [],
        gravityRings: [],
        trajectoryPoints: [],
      })
    }

    // No explicit render needed — the compositor tickable runs after this and calls composer.render()
  }

  /** Called when closing transition completes — restore flying state. */
  private onCloseMap(): void {
    if (!this.shuttleController || !this.sceneObjects) return

    // Swap render camera back to perspective
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (this.vehicleCamera) {
      renderPass.camera = this.vehicleCamera.camera
      this.vehicleCamera.controls.enabled = true
    }

    // Check if we were orbiting before map opened — restore appropriate state
    const orbitState = this.orbitSystem?.state ?? 'free'
    if (orbitState === 'free') {
      this.shuttleController.unfreeze()
      if (!this.shuttleController.slingshotBurstActive) {
        this.shuttleController.setInputEnabled(true)
      }
    }
    // If orbiting, shuttle stays frozen but input stays disabled (orbit manages this)

    // Restore grid color/opacity (fabric stress cleared until next orrery tick)
    this.spaceTimeGrid?.applyBaselineLineAppearance()

    // Hide overlay
    this.onMapOverlay?.({
      visible: false,
      labels: [],
      shipX: 0,
      shipY: 0,
      headingDeg: 0,
      speed: 0,
      distances: [],
      gravityRings: [],
      trajectoryPoints: [],
    })
  }

  /** Build projected persistent world-line points for the tactical map. */
  private buildWorldLineTrajectory() {
    if (!this.mapCamera || !this.shuttleController || this.shuttleController.dead) {
      return []
    }

    const currentPoint = {
      x: this.shuttleController.position.x,
      z: this.shuttleController.position.z,
    }
    const lastPoint = this.worldLineHistory[this.worldLineHistory.length - 1]
    const points =
      lastPoint && lastPoint.x === currentPoint.x && lastPoint.z === currentPoint.z
        ? this.worldLineHistory
        : [...this.worldLineHistory, currentPoint]

    return points.map((sample) => {
      const projected = this.mapCamera!.projectToScreen(new THREE.Vector3(sample.x, 0, sample.z))
      return {
        screenX: projected.x * 100,
        screenY: projected.y * 100,
      }
    })
  }

  /** Record the current ship position into the persistent sampled world line. */
  private recordWorldLinePoint(): void {
    if (!this.shuttleController) return
    const orbitState = this.orbitSystem?.state ?? 'free'
    if (!shouldRecordWorldLinePoint(orbitState, this.shuttleController.dead)) return

    this.worldLineHistory = appendWorldLinePoint(
      this.worldLineHistory,
      {
        x: this.shuttleController.position.x,
        z: this.shuttleController.position.z,
      },
      mapOverlayData.worldLineSampleDistance,
    )
  }

  /** Reset the world line at the start of a new run and seed it with the current ship position. */
  private resetWorldLineHistory(): void {
    this.worldLineHistory = []
    this.recordWorldLinePoint()
  }

  /** Compute and emit the full map overlay state for the Vue HUD. */
  private emitMapOverlay(): void {
    if (!this.mapCamera || !this.shuttleController || !this.onMapOverlay) return

    const px = this.shuttleController.position.x
    const pz = this.shuttleController.position.z

    // Build body list from Sun + planets
    const bodies: MapBody[] = []
    if (this.sunController) {
      bodies.push({
        name: 'Sun',
        x: this.sunController.getWorldX(),
        z: this.sunController.getWorldZ(),
        mass: this.sunController.mass,
      })
    }
    for (let i = 0; i < this.planetControllers.length; i++) {
      const c = this.planetControllers[i]!
      bodies.push({
        name: PLANETS[i]?.name ?? '',
        x: c.getWorldX(),
        z: c.getWorldZ(),
        mass: c.mass,
      })
    }

    // Project ship position
    const shipScreen = this.mapCamera.projectToScreen(new THREE.Vector3(px, 0, pz))

    // Project body labels with distance
    const labels = bodies.map((b) => {
      const screen = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      const dx = b.x - px
      const dz = b.z - pz
      const dist = Math.sqrt(dx * dx + dz * dz)
      return {
        name: b.name,
        screenX: screen.x * 100,
        screenY: screen.y * 100,
        distance: formatDistance(dist),
      }
    })

    // Nearest bodies for distance lines
    const nearest = findNearestBodies(px, pz, bodies, mapOverlayData.nearestBodyCount)
    const distances = nearest.map((b) => {
      const bodyScreen = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
      return {
        name: b.name,
        shipX: shipScreen.x * 100,
        shipY: shipScreen.y * 100,
        bodyX: bodyScreen.x * 100,
        bodyY: bodyScreen.y * 100,
        distance: formatDistance(b.distance),
      }
    })

    // Heading arrow — convert heading to CSS rotation degrees
    const heading = this.shuttleController.heading
    const headingDeg = -((heading * 180) / Math.PI) + 90

    // Gravity rings — project influence and event horizon radii to screen %
    const gravityRings = bodies
      .filter((b) => b.mass >= mapOverlayData.influenceMassThreshold)
      .map((b) => {
        const center = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x, 0, b.z))
        const infR = influenceRadius(b.mass, MAP_GRAVITY_CONFIG)
        const horR = eventHorizonRadius(b.mass, MAP_GRAVITY_CONFIG)

        // Project radius: offset point vs center to get screen-space radius
        const edgeInf = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x + infR, 0, b.z))
        const edgeHor = this.mapCamera!.projectToScreen(new THREE.Vector3(b.x + horR, 0, b.z))

        return {
          name: b.name,
          centerX: center.x * 100,
          centerY: center.y * 100,
          influenceRadius: Math.abs(edgeInf.x - center.x) * 100,
          horizonRadius: Math.abs(edgeHor.x - center.x) * 100,
        }
      })

    const trajectoryPoints = this.buildWorldLineTrajectory()

    this.onMapOverlay({
      visible: true,
      labels,
      shipX: shipScreen.x * 100,
      shipY: shipScreen.y * 100,
      headingDeg,
      speed: this.shuttleController.speed,
      distances,
      gravityRings,
      trajectoryPoints,
    })
  }

  /** Open the startup ship message from the centered intro CTA. */
  openIntroMessage(): void {
    if (this.mapIntro.openMessage()) {
      this.emitIntroUiState()
    }
  }

  /** Complete the startup intro and hand control over to the player. */
  completeIntroMessage(): void {
    if (!this.mapIntro.completeMessage()) return

    if (this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = true
    }

    this.emitIntroUiState()
  }

  /** Start the opening cutscene only when an active startup message exists. */
  private beginStartupIntro(): void {
    const activeMessage = shipMessageSystem.getActiveMessage()
    if (!activeMessage || !this.vehicleCamera) {
      this.mapIntro.skip()
      this.emitIntroUiState()
      return
    }

    this.mapIntro.start()
    this.vehicleCamera.controls.enabled = false
    this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
    if (this.introCamera) {
      this.introCamera.position.copy(MAP_INTRO_CAMERA_START_POSITION)
      this.introCamera.lookAt(MAP_INTRO_CAMERA_START_TARGET)
      this.introCamera.fov = MAP_INTRO_CAMERA_START_FOV
      this.introCamera.updateProjectionMatrix()
    }
    this.emitIntroUiState()
  }

  /** Animate from the system overview shot into the live orbit camera. */
  private tickStartupIntroCamera(): void {
    if (
      !this.sceneObjects ||
      !this.vehicleCamera ||
      !this.introCamera ||
      !this.shuttleController ||
      this.mapState.isOpen
    )
      return

    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (this.mapIntro.phase === 'cinematic_zoom') {
      const progress = easeInOut(this.mapIntro.cinematicProgress)
      const targetPosition = this.vehicleCamera.camera.position
      const targetLookAt = this.vehicleCamera.controls.target
      const heroPosition = this.shuttleController.group.position
        .clone()
        .add(MAP_INTRO_HERO_OFFSET.clone().applyQuaternion(this.shuttleController.group.quaternion))
      const heroTarget = this.shuttleController.group.position
        .clone()
        .add(MAP_INTRO_HERO_LOOK_AT_OFFSET)

      if (progress < MAP_INTRO_HERO_HOLD_START) {
        const heroProgress = easeInOut(progress / MAP_INTRO_HERO_HOLD_START)
        const currentTarget = new THREE.Vector3().lerpVectors(
          MAP_INTRO_CAMERA_START_TARGET,
          heroTarget,
          heroProgress,
        )
        this.introCamera.position.lerpVectors(
          MAP_INTRO_CAMERA_START_POSITION,
          heroPosition,
          heroProgress,
        )
        this.introCamera.fov = THREE.MathUtils.lerp(
          MAP_INTRO_CAMERA_START_FOV,
          MAP_INTRO_HERO_FOV,
          heroProgress,
        )
        this.introCamera.updateProjectionMatrix()
        this.introCamera.lookAt(currentTarget)
        renderPass.camera = this.introCamera
        return
      }

      if (progress < MAP_INTRO_HERO_HOLD_END) {
        this.introCamera.position.copy(heroPosition)
        this.introCamera.fov = MAP_INTRO_HERO_FOV
        this.introCamera.updateProjectionMatrix()
        this.introCamera.lookAt(heroTarget)
        renderPass.camera = this.introCamera
        return
      }

      const orbitProgress = easeInOut(
        (progress - MAP_INTRO_HERO_HOLD_END) / (1 - MAP_INTRO_HERO_HOLD_END),
      )
      const currentTarget = new THREE.Vector3().lerpVectors(heroTarget, targetLookAt, orbitProgress)

      this.introCamera.position.lerpVectors(heroPosition, targetPosition, orbitProgress)
      this.introCamera.fov = THREE.MathUtils.lerp(
        MAP_INTRO_HERO_FOV,
        this.vehicleCamera.camera.fov,
        orbitProgress,
      )
      this.introCamera.updateProjectionMatrix()
      this.introCamera.lookAt(currentTarget)
      renderPass.camera = this.introCamera
      return
    }

    if (this.mapIntro.controlsLocked) {
      this.introCamera.position.copy(this.vehicleCamera.camera.position)
      this.introCamera.quaternion.copy(this.vehicleCamera.camera.quaternion)
      this.introCamera.fov = this.vehicleCamera.camera.fov
      this.introCamera.updateProjectionMatrix()
      renderPass.camera = this.introCamera
      return
    }

    if (!this.habitatState.isActive) {
      renderPass.camera = this.vehicleCamera.camera
    }
  }

  /** Push the current intro UI state to Vue. */
  private emitIntroUiState(): void {
    this.onMapIntro?.(this.mapIntro.uiState)
  }

  /** Notify Vue that a new ship message may have entered the queue. */
  private emitMessageUpdate(): void {
    this.onMessageUpdate?.()
  }

  /** Dispatch one-time gameplay tutorial messages from map-state conditions. */
  private triggerRuntimeMessages(): void {
    this.triggerEarthDistanceMessage()
    this.triggerBrakeMessage()
    this.triggerMainThrusterMessage()
    this.triggerVenusOrbitMessage()
  }

  /** Fire Jay's navigation note after the player has meaningfully left Earth. */
  private triggerEarthDistanceMessage(): void {
    if (
      this.didDispatchEarthDistanceMessage ||
      this.worldLineHistory.length < EARTH_DEPARTURE_MIN_HISTORY_POINTS
    ) {
      return
    }

    const earthDistance = this.getDistanceToPlanet('earth')
    if (earthDistance === null || earthDistance < EARTH_DEPARTURE_MESSAGE_DISTANCE) return

    this.didDispatchEarthDistanceMessage = true
    shipMessageSystem.notifyTrigger('map_leave_earth_distance')
    this.emitMessageUpdate()
  }

  /** Fire Jay's brake note after the player uses the dampeners for the first time. */
  private triggerBrakeMessage(): void {
    if (this.didDispatchBrakeMessage || !this.shuttleController) return
    if (!this.shuttleController.isBraking) return

    this.didDispatchBrakeMessage = true
    shipMessageSystem.notifyTrigger('map_brake_used')
    this.emitMessageUpdate()
  }

  /** Fire Jay's fuel-management note after the red thrust bar is fully spent once. */
  private triggerMainThrusterMessage(): void {
    if (this.didDispatchMainThrusterMessage || !this.shuttleController) return

    const thrustState = this.shuttleController.thrusterSystem.getState('thrust')
    const canFireThrust = this.shuttleController.thrusterSystem.canFire('thrust', {
      burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
    })
    if (!isMainThrusterSpentForMessage(thrustState, canFireThrust)) return

    this.didDispatchMainThrusterMessage = true
    shipMessageSystem.notifyTrigger('map_main_thruster_depleted')
    this.emitMessageUpdate()
  }

  /** Fire Jay's heat warning when the shuttle comes close to the Venus orbit line. */
  private triggerVenusOrbitMessage(): void {
    if (this.didDispatchVenusOrbitMessage || !this.shuttleController) return

    const venusController = this.getPlanetControllerById('venus')
    if (!venusController) return

    const venusOrbitRadius = Math.sqrt(
      venusController.getWorldX() ** 2 + venusController.getWorldZ() ** 2,
    )
    const shipSolarDistance = Math.sqrt(
      this.shuttleController.position.x ** 2 + this.shuttleController.position.z ** 2,
    )

    if (Math.abs(shipSolarDistance - venusOrbitRadius) > VENUS_ORBIT_WARNING_DISTANCE) return

    this.didDispatchVenusOrbitMessage = true
    shipMessageSystem.notifyTrigger('map_venus_orbit_warning')
    this.emitMessageUpdate()
  }

  /** Return the current world distance from the shuttle to a named planet. */
  private getDistanceToPlanet(planetId: string): number | null {
    if (!this.shuttleController) return null

    const controller = this.getPlanetControllerById(planetId)
    if (!controller) return null

    const dx = controller.getWorldX() - this.shuttleController.position.x
    const dz = controller.getWorldZ() - this.shuttleController.position.z
    return Math.sqrt(dx * dx + dz * dz)
  }

  /** Look up a live planet controller by catalog id. */
  private getPlanetControllerById(planetId: string): PlanetSystemController | null {
    const index = PLANETS.findIndex((planet) => planet.id === planetId)
    return index >= 0 ? (this.planetControllers[index] ?? null) : null
  }

  /** Lazy-load the habitat interior scene on first entry. */
  private async ensureHabitatScene(): Promise<HabitatInteriorScene> {
    if (!this.habitatScene) {
      this.habitatScene = new HabitatInteriorScene()
      await this.habitatScene.load()
      this.habitatScene.onInteract = (target) => {
        if (target === 'table') {
          this.onShuttleControl?.(true)
          document.exitPointerLock()
        }
      }
      this.habitatScene.onPrompt = (prompt) => {
        this.onHabitatPrompt?.(prompt)
      }
    }
    return this.habitatScene
  }

  private tickHabitatTransition(): void {
    if (!this.sceneObjects || !this.habitatScene) return

    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass

    const phase = this.habitatState.phase
    if (phase === 'transitioning_in') {
      // During fade-out, keep rendering the map scene — the fade overlay covers it
      if (this.vehicleCamera) {
        this.vehicleCamera.controls.enabled = false
      }
    } else if (phase === 'waking_up' || phase === 'habitat' || phase === 'transitioning_out') {
      // Swap to habitat scene
      ;(renderPass as { scene: THREE.Scene }).scene = this.habitatScene.getScene()
      renderPass.camera = this.habitatScene.getCamera()
      if (this.vehicleCamera) {
        this.vehicleCamera.controls.enabled = false
      }

      // During waking_up: animate camera from lying on bed (looking up) to standing
      if (phase === 'waking_up') {
        const t = easeInOut(this.habitatState.progress)
        const cam = this.habitatScene.fpsCamera
        const spawn = this.habitatScene.getSpawnPosition()
        // Keep yaw locked toward the table during wake-up
        cam.yaw = spawn.yaw
        // Start pitch looking straight up (-PI/2), lerp to 0 (level)
        const START_PITCH = -Math.PI / 2
        cam.pitch = START_PITCH * (1 - t)
        // Eye height rises from floor to standing
        const lyingHeight = 0.5
        const standingHeight = spawn.position.y
        cam.camera.position.y = lyingHeight + (standingHeight - lyingHeight) * t
        // Manually update camera quaternion so the animation renders correctly
        cam.tick(0)
      }
    }
  }

  /** Compute the fade overlay opacity based on habitat state. */
  private getHabitatFadeOpacity(): number {
    const phase = this.habitatState.phase
    const p = this.habitatState.progress
    if (phase === 'transitioning_in') {
      // Fade to black as we transition in
      return easeInOut(p)
    }
    if (phase === 'waking_up') {
      // Fade from black as we wake up (first 40% of wake-up)
      const fadeProgress = Math.min(1, p / 0.4)
      return 1 - easeInOut(fadeProgress)
    }
    if (phase === 'transitioning_out') {
      // Fade to black, then clear
      if (p > 0.5) {
        // First half: fade to black
        return easeInOut((1 - p) / 0.5)
      }
      // Second half: fade from black (back to map)
      return easeInOut(p / 0.5)
    }
    return 0
  }

  private onEnterHabitat(): void {
    this.onHabitatActive?.(true)
    // Request pointer lock for FPS mouse look
    const el = this.sceneObjects?.renderer.domElement
    if (el) {
      el.requestPointerLock()
      // Re-acquire pointer lock on click (e.g. after alt-tab)
      el.addEventListener('click', this.onHabitatClick)
    }
  }

  private onExitHabitat(): void {
    if (!this.sceneObjects) return

    // Restore map scene + camera
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    ;(renderPass as { scene: THREE.Scene }).scene = this.sceneObjects.scene
    if (this.vehicleCamera) {
      renderPass.camera = this.vehicleCamera.camera
      this.vehicleCamera.controls.enabled = true
    }

    // Close doors
    if (this.inspectMode) {
      this.shuttleController?.toggleDoors()
      this.inspectMode = false
    }

    this.sceneObjects?.renderer.domElement.removeEventListener('click', this.onHabitatClick)
    document.exitPointerLock()
    this.onShuttleControl?.(false)
    this.onHabitatActive?.(false)
    this.onHabitatPrompt?.(null)
  }

  /** Re-acquire pointer lock after losing it (e.g. alt-tab). */
  private onHabitatClick = (): void => {
    if (this.habitatState.phase !== 'habitat') return
    if (document.pointerLockElement) return
    this.sceneObjects?.renderer.domElement.requestPointerLock()
  }

  /** Feed mouse deltas to the habitat FPS camera when pointer is locked. */
  private onHabitatMouseMove = (e: MouseEvent): void => {
    if (this.habitatState.phase !== 'habitat' || !this.habitatScene) return
    if (!document.pointerLockElement) return
    this.habitatScene.fpsCamera.applyMouseDelta(e.movementX, e.movementY)
  }

  dispose(): void {
    document.removeEventListener('mousemove', this.onHabitatMouseMove)
    this.sceneObjects?.renderer.domElement.removeEventListener('click', this.onHabitatClick)
    this.habitatScene?.dispose()
    this.habitatScene = null
    DevConsole.unregister('MapView')
    this.ambientSpace?.dispose()
    if (this.shipReticleGroup) {
      const disposeSprite = (s: THREE.Sprite) => {
        const m = s.material as THREE.SpriteMaterial
        m.map?.dispose()
        m.dispose()
      }
      if (this.shipReticleRing) disposeSprite(this.shipReticleRing)
      if (this.shipReticlePointer) disposeSprite(this.shipReticlePointer)
      this.sceneObjects?.scene.remove(this.shipReticleGroup)
      this.shipReticleGroup = null
      this.shipReticleRing = null
      this.shipReticlePointer = null
    }
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
    this.gravitationalEventManager?.setNearbyHudCallbacks(null)
    this.gravitationalEventManager?.clear()
    this.gravitationalEventManager = null
    this.spaceTimeGrid?.dispose()
    this.sunController?.dispose()
    this.starField?.dispose()

    // Dispose camera and scene
    this.mapCamera = null
    this.vehicleCamera?.dispose()
    this.inputManager?.dispose()
    if (this.sceneObjects) {
      this.sceneObjects.renderer.dispose()
    }
  }
}
