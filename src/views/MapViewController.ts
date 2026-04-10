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
import { Timer, type TimerHandle } from '@/lib/Timer'
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
import { SUN, PLANETS } from '@/lib/planets/catalog'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import * as THREE from 'three'
import { OrbitCaptureSystem, type OrbitHudState } from '@/lib/orbitCapture'
import {
  influenceRadius,
  eventHorizonRadius,
} from '@/lib/physics/gravity'
import { ShuttleController, MAP_PHYSICS } from '@/three/ShuttleController'
import {
  VehicleCamera,
  MAP_CAMERA_CONFIG,
  MAP_ORBIT_CAMERA_CONFIG,
  MAP_INSPECT_CAMERA_CONFIG,
} from '@/three/VehicleCamera'
import { buildSlingshotChargeCameraConfig } from '@/three/slingshotChargeCamera'
import orbitConfig from '@/data/shuttle/orbit-capture.json'
import { PortalArrivalSequence } from '@/three/PortalArrivalSequence'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VibePortal } from '@/lib/portal'
import { MapState } from '@/lib/mapState'
import {
  MapIntroState,
  INTRO_ZOOM_STEPS,
  type IntroCinematicStep,
  type MapIntroUiState,
} from '@/lib/mapIntroState'
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
import { DevConsole } from '@/lib/devConsole'
import { GravitationalEventManager } from '@/lib/physics/gravitationalEvent'
import { computeShuttleBaseFuelDrain } from '@/lib/shuttleBaseFuelDrain'
import { ShipHealth } from '@/lib/shipHealth'
import type { ShipHealthConfig } from '@/lib/shipHealth'
import shipHealthData from '@/data/shuttle/ship-health.json'
import {
  getCurrentShuttleThrusterEfficiencyModifiers,
  getCurrentShuttleThrusterChargeModifiers,
  getCurrentShuttleSlingshotBurstMultiplier,
  getCurrentUpgradeValue,
  hasGravitySurfingUnlock,
  getPlayerUpgradeLevelsSnapshot,
  hydratePlayerUpgradeLevelsFromStorage,
  saveCurrentPlayerUpgradesToStorage,
  CURRENT_PLAYER_UPGRADE_LEVELS,
  UPGRADE_DEFINITIONS,
  type UpgradeId,
} from '@/lib/upgrades'
import { tryPurchaseNextUpgradeLevel } from '@/lib/upgradePurchase'
import { HabitatState } from '@/lib/habitatState'
import { HabitatInteriorScene } from '@/three/HabitatInteriorScene'
import {
  RESERVE_FUEL_ID,
  LANDER_FUEL_ID,
} from '@/lib/shop/shopSession'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import { tickDemandTimer, resetDemand } from '@/lib/shop/planetDemand'
import {
  createProfile,
  loadProfile,
  markMapIntroSeen,
  saveProfile,
  addCredits,
  spendCredits,
} from '@/lib/player/profile'
import type { PlayerProfile } from '@/lib/player/types'
import {
  createInventory,
  addItem,
  getStack,
  consumeItem,
  canFitItem,
  DEFAULT_MAX_SLOTS,
  DEFAULT_MAX_WEIGHT_KG,
} from '@/lib/inventory/inventory'
import type { Inventory } from '@/lib/inventory/types'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import '@/lib/shop/tradeGoods'
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  GeneratedAsteroidMission,
} from '@/lib/missions/types'
import { getGatherItemForPlanet } from '@/lib/missions/planetOrbitalConfig'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'
import {
  clearActiveMission,
  consumePendingMapReturnWorld,
  saveActiveMission,
} from '@/lib/missions/missionStorage'
import '@/lib/missions/missionMaterials'
import { MapIntroFacade } from '@/lib/map/intro/MapIntroFacade'
import { MapLifeCycleFacade } from '@/lib/map/lifecycle/MapLifeCycleFacade'
import { MapMessageFacade } from '@/lib/map/messages/MapMessageFacade'
import { MapMissionFacade } from '@/lib/map/missions/MapMissionFacade'
import { MapModeCoordinator } from '@/lib/map/mode/MapModeCoordinator'
import { MapOrbitFacade } from '@/lib/map/orbit/MapOrbitFacade'
import { MapShopFacade } from '@/lib/map/shop/MapShopFacade'
import { MapPlanetariumScene } from '@/three/MapPlanetariumScene'
import { MapSceneEnvironment } from '@/three/MapSceneEnvironment'
import { MapShuttleEffects } from '@/three/MapShuttleEffects'
import { MapSceneVisuals } from '@/three/MapSceneVisuals'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import {
  buildMapBodies,
  computeGravityProximity,
  computeMaxGravityProximity,
  isEmissiveMaterial,
  makeGravityWell,
  mapWarpStandoffWorldUnits,
  shouldShowAsteroidMissionMapSite,
} from '@/lib/map/mapViewControllerHelpers'

/**
 * Orbit / grid / debris toggle snapshot for syncing the map HUD after intro suppression.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export interface MapViewLayerToggleState {
  /** Planet orbit lines visible. */
  orbitsVisible: boolean
  /** Space-time fabric grid visible. */
  gridVisible: boolean
  /** User debris toggle (ambient layers); meshes may still be hidden while orbiting. */
  ambientVisible: boolean
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
  private introFacade: MapIntroFacade | null = null

  private shuttleController: ShuttleController | null = null
  private shuttleEffects: MapShuttleEffects | null = null
  private planetariumScene: MapPlanetariumScene | null = null
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

  private orbitFacade = new MapOrbitFacade()
  private lifeCycleFacade = new MapLifeCycleFacade()
  private modeCoordinator = new MapModeCoordinator()
  private yRecovery = false
  private inspectMode = false
  private habitatState = new HabitatState()
  private habitatScene: HabitatInteriorScene | null = null
  private shopFacade = new MapShopFacade()
  private pendingModuleInstallTimer: TimerHandle | null = null
  private missionFacade = new MapMissionFacade()
  /**
   * Set in {@link init} from {@link loadProfile} or {@link createProfile}.
   * Starting placeholder matches fresh profile credits until init runs.
   */
  private playerProfile: PlayerProfile = createProfile('Pilot')
  private playerInventory: Inventory = createInventory(
    Math.round(DEFAULT_MAX_SLOTS * getCurrentUpgradeValue('shuttleCargoBay')),
    Math.round(DEFAULT_MAX_WEIGHT_KG * getCurrentUpgradeValue('shuttleCargoBay')),
  )
  private portalArrival: PortalArrivalSequence | null = null
  private sceneEnvironment: MapSceneEnvironment | null = null
  private gravityPass: ShaderPass | null = null
  private slingshotSpeedPass: ShaderPass | null = null
  private adriftTimer = 0
  private shipHealth: ShipHealth | null = null
  private mapState = new MapState()
  private mapIntro = new MapIntroState()

  /**
   * After {@link beginStartupIntro} starts the cinematic, the next `cinematic_zoom` → `interactive`
   * transition runs {@link finishStartupCinematicOpenOrbit}. Cleared when fired or reset.
   */
  private awaitingStartupCinematicOrbitHandoff = false

  /** RAF {@link Timer} for auto habitat after startup cinematic; cleared on dispose or manual enter. */
  private postStartupIntroHabitatTimerHandle: TimerHandle | null = null

  /**
   * True only after {@link finishStartupCinematicOpenOrbit} until habitat FPS — hides orbit HUD during
   * the post-cinematic beat + transition (skipped when intro is bypassed for returning players).
   */
  private suppressOrbitShuttleHudForEarthStartup = false

  private mapCamera: MapCamera | null = null
  private worldLineHistory: WorldLineHistoryPoint[] = []
  private messageFacade = new MapMessageFacade()

  /** Whether planet orbit lines are currently visible. */
  private orbitsVisible = true

  /** Whether the space-time fabric grid is currently visible (default off until Gravity Surfing). */
  private gridVisible = false

  /** Saved layer toggles while the opening intro suppresses orbit lines / fabric / debris. */
  private introLayerRestore: MapViewLayerToggleState | null = null

  /** Current shuttle display scale, lerped each frame toward the screen-size target. */
  private currentShuttleScale: number = MAP_CONFIG.MAP_SHUTTLE_SCALE

  /** Increments per anomaly HUD message so Vue can re-run enter animation. */
  private gravitationalAnomalyHudToken = 0
  private sceneVisuals: MapSceneVisuals | null = null

  /** World-space shuttle position reused for asteroid belt nearby tumble (avoid per-frame alloc). */
  private readonly _beltShuttleWorldScratch = new THREE.Vector3()

  /**
   * Root at the mission waypoint world position; uniform screen scaling applies to the cyan marker
   * and the optional GLB asteroid preview.
   */

  /** Called when map overlay state changes for Vue HUD. */
  onMapOverlay: ((state: MapOverlayState) => void) | null = null

  /** Called when the opening map intro UI should update. */
  onMapIntro: ((state: MapIntroUiState) => void) | null = null

  /** Called when orbit / fabric / debris toggles change (including intro restore). */
  onMapViewLayerToggles: ((state: MapViewLayerToggleState) => void) | null = null

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

  /**
   * When true, Vue should hide orbit shuttle chrome until habitat FPS (Earth first-mail cinematic path only).
   */
  onEarthStartupOrbitHudSuppressed: ((suppressed: boolean) => void) | null = null

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
  onShopState:
    | ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void)
    | null = null
  /** Fired when credits change (for the HUD badge). */
  onCreditsUpdate: ((credits: number) => void) | null = null
  /**
   * Fired when upgrade levels change outside the engineering-bay purchase flow (e.g. dev console),
   * so the map HUD can refresh Gravity Surfing / Space Fabric gating.
   */
  onUpgradeHudRefresh: (() => void) | null = null
  /** Fired when scripted installs should reuse the upgrade-installed announcement HUD. */
  onUpgradeInstalledAnnouncement:
    | ((
        headline: string,
        upgradeName: string,
        tier: number,
        creditsSpent: number,
        metaText?: string,
      ) => void)
    | null = null
  /** Fired when fuel cell count changes (for HUD refuel button). */
  onFuelCellCount: ((count: number) => void) | null = null

  private get missionBoard(): ShuttleMissionBoard {
    return this.missionFacade.board
  }

  private set missionBoard(value: ShuttleMissionBoard) {
    this.missionFacade.board = value
  }

  private get missionOverlayOpen(): boolean {
    return this.missionFacade.overlayOpen
  }

  private set missionOverlayOpen(value: boolean) {
    this.missionFacade.overlayOpen = value
  }

  private get missionButtonVisible(): boolean {
    return this.missionFacade.buttonVisible
  }

  private set missionButtonVisible(value: boolean) {
    this.missionFacade.buttonVisible = value
  }

  /** Called when mission button visibility changes in OrbitPrompt. */
  onMissionButton: ((visible: boolean, planetName: string) => void) | null = null

  /** Called when the mission minigame overlay should open/close. */
  onMissionOverlay:
    | ((visible: boolean, mission: ActiveShuttleMission | null, canFit: boolean) => void)
    | null = null

  /** Called when the mission board state changes (for shuttle control terminal). */
  onMissionBoardUpdate: ((board: ShuttleMissionBoard) => void) | null = null

  /** Called when a mission minigame is completed (items gathered). */
  onMissionComplete: ((mission: ActiveShuttleMission | null) => void) | null = null

  /** Called when a mission is delivered (credits awarded). */
  onMissionDeliver: ((mission: ActiveShuttleMission | null) => void) | null = null

  /** Called when the player begins an asteroid mission (E at waypoint). */
  onBeginAsteroidMission: ((mission: GeneratedAsteroidMission) => void) | null = null

  private get orbitSystem(): OrbitCaptureSystem | null {
    return this.orbitFacade.system
  }

  private set orbitSystem(value: OrbitCaptureSystem | null) {
    this.orbitFacade.system = value
  }

  private get orbitRingIsPreview(): boolean {
    return this.orbitFacade.orbitRingIsPreview
  }

  private set orbitRingIsPreview(value: boolean) {
    this.orbitFacade.orbitRingIsPreview = value
  }

  private get approachStartPos(): THREE.Vector3 | null {
    return this.orbitFacade.approachStartPos
  }

  private set approachStartPos(value: THREE.Vector3 | null) {
    this.orbitFacade.approachStartPos = value
  }

  private get approachProgress(): number {
    return this.orbitFacade.approachProgress
  }

  private set approachProgress(value: number) {
    this.orbitFacade.approachProgress = value
  }

  private get slingshotCharge(): number {
    return this.orbitFacade.slingshotCharge
  }

  private set slingshotCharge(value: number) {
    this.orbitFacade.slingshotCharge = value
  }

  async init(container: HTMLElement): Promise<void> {
    // Create canvas
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    // --- Input ---
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    hydratePlayerUpgradeLevelsFromStorage()
    const storedProfile = typeof localStorage === 'undefined' ? null : loadProfile()
    this.playerProfile = storedProfile ?? createProfile('Pilot')
    const emptyHold = this.createInventoryForCurrentCargoBayLevel()
    const savedInventory = typeof localStorage === 'undefined' ? null : loadInventory()
    this.playerInventory = savedInventory
      ? this.ensureMinimumStarterFuelCells(this.applyCargoBayLimits(savedInventory))
      : this.inventoryWithStarterFuelCells(emptyHold)
    this.persistPlayerProfile()
    this.emitFuelCellCount()
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // --- Camera / planetarium scene ---
    this.vehicleCamera = new VehicleCamera(MAP_CAMERA_CONFIG, canvas)
    this.planetariumScene = new MapPlanetariumScene()
    const planetarium = await this.planetariumScene.initialize(canvas, this.vehicleCamera.camera)
    this.sceneObjects = planetarium.sceneObjects
    this.sceneVisuals = new MapSceneVisuals(this.sceneObjects)
    this.sunController = planetarium.sunController
    this.planetControllers = planetarium.planetControllers
    this.beltControllers = planetarium.beltControllers
    this.spaceTimeGrid = planetarium.spaceTimeGrid
    this.gravityPass = planetarium.gravityPass
    this.slingshotSpeedPass = planetarium.slingshotSpeedPass
    this.mapGridSize = planetarium.mapGridSize
    const { scene } = this.sceneObjects

    this.introFacade = new MapIntroFacade(scene, canvas.clientWidth / canvas.clientHeight)

    // --- Map overlay camera (ortho, created once, used when M pressed) ---
    this.mapCamera = new MapCamera()
    scene.add(this.mapCamera.camera)

    this.tickHandler.register(this.vehicleCamera, MAP_CONFIG.TICK_PRIORITY_COMPOSIT - 1)

    // Habitat FPS camera mouse look
    document.addEventListener('mousemove', this.onHabitatMouseMove)

    // --- Intro cinematic prop preloads (fire-and-forget) ---
    MapIntroFacade.preload()
    this.applyInitialSpaceFabricVisibilityFromUpgrades()
    this.emitMapViewLayerToggles()

    this.gravitationalEventManager = new GravitationalEventManager({
      worldHalfExtent: this.mapGridSize / 2,
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
      MAP_CONFIG.MAP_GRAVITY_CONFIG,
    )
    this.shuttleController.setSpaceTimeGrid(this.spaceTimeGrid)

    // Register gravity wells — Sun + all planets
    if (this.sunController) {
      this.shuttleController.addGravityWell(
        makeGravityWell(this.sunController, MAP_CONFIG.MAP_GRAVITY_CONFIG),
      )
    }
    for (const controller of this.planetControllers) {
      this.shuttleController.addGravityWell(
        makeGravityWell(controller, MAP_CONFIG.MAP_GRAVITY_CONFIG),
      )
    }

    this.shuttleController.onDeath = () => {
      this.triggerDeath('Crashed Into The Sun')
    }

    // Ship health — temperature + radiation damage
    // Scale maxHp by hull upgrade level (multiplier: 1.0 → 2.0)
    const hullMultiplier = getCurrentUpgradeValue('shuttleHull')
    const healthConfig: ShipHealthConfig = {
      ...(shipHealthData as ShipHealthConfig),
      maxHp: (shipHealthData as ShipHealthConfig).maxHp * hullMultiplier,
    }
    this.shipHealth = new ShipHealth(healthConfig)
    this.shipHealth.onDeath = (cause) => {
      this.triggerDeath(cause)
    }

    await this.shuttleController.load()
    this.shuttleController.group.scale.setScalar(MAP_CONFIG.MAP_SHUTTLE_SCALE)
    this.sceneVisuals?.attachShuttle(this.shuttleController.group)

    // Spawn next to Earth — find its controller by matching PLANETS order
    const earthIndex = PLANETS.findIndex((p) => p.id === 'earth')
    const earthController = this.planetControllers[earthIndex]
    if (earthController) {
      const ex = earthController.getWorldX()
      const ez = earthController.getWorldZ()
      // Place slightly behind Earth (away from the Sun)
      const awayFromSun = Math.atan2(ez, ex)
      this.shuttleController.group.position.set(
        ex + Math.cos(awayFromSun) * MAP_CONFIG.SPAWN_OFFSET_BEHIND_EARTH,
        0,
        ez + Math.sin(awayFromSun) * MAP_CONFIG.SPAWN_OFFSET_BEHIND_EARTH,
      )
    }

    // Render shuttle after Sun corona so opaque shuttle pixels overwrite additive glow
    this.shuttleController.group.traverse((child) => {
      child.renderOrder = 10
    })
    scene.add(this.shuttleController.group)
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    this.shuttleEffects = new MapShuttleEffects(this.sceneObjects, this.shuttleController)
    for (const tickable of this.shuttleEffects.getTickables()) {
      this.tickHandler.register(tickable, TICK_PRIORITY_ANIMATION)
    }

    // --- Orbit capture system ---
    const earthOrbit =
      PLANETS.find((planet) => planet.id === MAP_CONFIG.EARTH_PLANET_ID)?.orbit ?? PLANETS[0]!.orbit
    const captureBodies = [
      {
        name: SUN.name,
        displayRadius: SUN.displayRadius,
        captureRadiusOverride: MAP_CONFIG.SUN_BUMP_ORBIT_RADIUS,
        orbitRadiusOverride: MAP_CONFIG.SUN_BUMP_ORBIT_RADIUS,
        captureRadiusMultiplier: MAP_CONFIG.SUN_CAPTURE_RADIUS_MULTIPLIER,
        orbitalSpeedMultiplier: MAP_CONFIG.SUN_ORBIT_SPEED_MULTIPLIER,
        getWorldX: () => this.sunController!.getWorldX(),
        getWorldZ: () => this.sunController!.getWorldZ(),
      },
      ...PLANETS.map((planet, i) => ({
        name: planet.name,
        displayRadius: planet.displayRadius,
        orbitalSpeedMultiplier:
          MAP_CONFIG.SLINGSHOT_SPEED_OVERRIDES[planet.id] ??
          computeRelativeOrbitalSpeedMultiplier(planet.orbit, earthOrbit),
        getWorldX: () => this.planetControllers[i]!.getWorldX(),
        getWorldZ: () => this.planetControllers[i]!.getWorldZ(),
      })),
    ]
    this.orbitFacade.initialize(captureBodies)

    // Portal arrival, completed-mission return at waypoint, or default Earth orbit
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
    let usedMissionCompletionMapSpawn = false
    if (!arrived) {
      const pendingReturn = consumePendingMapReturnWorld()
      if (pendingReturn && this.shuttleController && this.orbitSystem) {
        this.spawnShuttleAtCompletedMissionWaypoint(pendingReturn.worldX, pendingReturn.worldZ)
        usedMissionCompletionMapSpawn = true
        this.mapIntro.skip()
        this.emitIntroUiState()
      }
    }
    if (!arrived && earthController && !usedMissionCompletionMapSpawn) {
      const ex = earthController.getWorldX()
      const ez = earthController.getWorldZ()
      this.orbitFacade.beginForcedOrbit(ex, ez, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
      })

      if (this.playerProfile.hasSeenIntro) {
        this.mapIntro.skip()
        this.emitIntroUiState()
      } else {
        this.messageFacade.notifyMapStartEarthOrbit(this.onMessageUpdate)
        this.beginStartupIntro()
      }
    } else if (!usedMissionCompletionMapSpawn) {
      this.mapIntro.skip()
      this.emitIntroUiState()
    }
    this.resetWorldLineHistory()

    this.sceneEnvironment = new MapSceneEnvironment({
      sceneObjects: this.sceneObjects,
      shuttleGroup: this.shuttleController.group,
      shuttlePosition: this.shuttleController.group.position,
      camera: this.vehicleCamera.camera,
      boundarySize: this.mapGridSize,
      getShuttleState: () => ({
        speed: this.shuttleController?.speed,
        rotation_y: this.shuttleController?.heading,
      }),
    })
    for (const tickable of this.sceneEnvironment.getTickables()) {
      this.tickHandler.register(tickable, TICK_PRIORITY_ANIMATION)
    }
    this.sceneEnvironment.boundarySystem.onDepart = (state) => {
      new VibePortal().depart(state as Record<string, string | number>)
    }

    // One-shot action bridge (doors toggle, telemetry)
    this.tickHandler.register(this, MAP_CONFIG.ONE_SHOT_PRIORITY)

    // --- Register orrery animation tick ---
    const orreryTickable: Tickable = {
      tick: (dt: number) => this.tickOrrery(dt),
    }
    this.tickHandler.register(orreryTickable, TICK_PRIORITY_ANIMATION)

    // --- Compositor: renders via EffectComposer ---
    const compositorTickable: Tickable = {
      tick: () => {
        // Intro / startup camera must sync after orrery (animation) and VehicleCamera tick, or the
        // render camera lags planets by a frame and Earth appears to twitch (angle jitter).
        this.tickStartupIntroCamera()
        this.sceneObjects!.composer.render()
      },
    }
    this.tickHandler.register(compositorTickable, MAP_CONFIG.TICK_PRIORITY_COMPOSIT)

    // --- Resize ---
    this.resizeHandler = () => {
      if (this.sceneObjects) {
        this.planetariumScene?.resize()
        this.vehicleCamera?.resize(window.innerWidth, window.innerHeight)
        this.introFacade?.resize(window.innerWidth / window.innerHeight)
      }
    }
    window.addEventListener('resize', this.resizeHandler)

    // --- Dev tools ---
    DevConsole.register('MapView', {
      skipIntro: () => {
        this.clearStartupCinematicOrbitHandoff()
        this.mapIntro.skip()
        this.markMapIntroSeenAndSyncProfile()
        this.restoreIntroMapLayers()
        this.introFacade?.dispose(this.sceneObjects!.scene)
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
      grantGravitySurfing: () => {
        this.devSetPlayerUpgradeLevel('gravitySurfing', 1)
      },
      giveCredits: (amount = 1000) => {
        if (!Number.isFinite(amount)) return
        this.playerProfile = addCredits(this.playerProfile, Math.max(0, Math.round(amount)))
        this.persistPlayerProfile()
        this.onCreditsUpdate?.(this.playerProfile.credits)
        this.emitShopState()
      },
      setUpgradeLevel: (upgradeId: UpgradeId, level: number) => {
        this.devSetPlayerUpgradeLevel(upgradeId, level)
      },
      startConsortiumCertificationMessage: () => {
        this.devStartConsortiumCertificationMessage()
      },
    })

    this.missionFacade.hydrateFromStorage(this.onMissionBoardUpdate)
    this.onCreditsUpdate?.(this.playerProfile.credits)

    // Start
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /**
   * One-shot actions, orbit state machine, and telemetry emission (runs just after input).
   */
  tick(dt: number): void {
    const mapIntroPhaseBeforeTick = this.mapIntro.phase
    this.mapIntro.tick(dt)
    if (
      mapIntroPhaseBeforeTick === 'cinematic_zoom' &&
      this.mapIntro.phase === 'awaiting_message_open'
    ) {
      this.markMapIntroSeenAndSyncProfile()
    }
    if (
      mapIntroPhaseBeforeTick === 'cinematic_zoom' &&
      this.mapIntro.phase === 'interactive' &&
      this.awaitingStartupCinematicOrbitHandoff
    ) {
      this.awaitingStartupCinematicOrbitHandoff = false
      this.finishStartupCinematicOpenOrbit()
    }
    this.syncIntroOrbitControlsEnabled()
    this.emitIntroUiState()
    const introLocked = this.mapIntro.controlsLocked

    this.syncVehicleCameraShipYawCoupling()

    const mapToggleAction = this.modeCoordinator.resolveMapToggleAction({
      introLocked,
      habitatActive: this.habitatState.isActive,
      toggleMapPressed: this.inputManager?.wasActionPressed('toggleMap') ?? false,
      closeMapPressed: this.inputManager?.wasActionPressed('closeMap') ?? false,
      mapPhase: this.mapState.phase,
      mapIsOpen: this.mapState.isOpen,
      orbitState: this.orbitSystem?.state ?? 'free',
      isDead: this.shuttleController?.dead ?? false,
    })
    if (mapToggleAction === 'open') {
      this.mapState.open()
      this.onOpenMap()
    } else if (mapToggleAction === 'close') {
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

    const inspectToggle = this.modeCoordinator.resolveInspectToggle({
      togglePressed: this.inputManager?.wasActionPressed('toggleDoors') ?? false,
      inspectMode: this.inspectMode,
      orbitState: this.orbitSystem?.state ?? 'free',
    })
    if (inspectToggle) {
      if (inspectToggle.toggleDoors) {
        this.shuttleController?.toggleDoors()
      }
      this.inspectMode = inspectToggle.nextInspectMode
      const bloomPass = this.sceneObjects?.composer.passes.find(
        (p) => p instanceof UnrealBloomPass,
      ) as UnrealBloomPass | undefined
      if (inspectToggle.cameraMode === 'inspect') {
        this.vehicleCamera?.setConfig(MAP_INSPECT_CAMERA_CONFIG)
        if (this.vehicleCamera) {
          this.vehicleCamera.controls.enableZoom = inspectToggle.enableZoom
        }
      } else {
        const isOrbiting = this.orbitSystem?.state === 'orbiting'
        this.vehicleCamera?.setConfig(isOrbiting ? MAP_ORBIT_CAMERA_CONFIG : MAP_CAMERA_CONFIG)
        if (this.vehicleCamera) {
          this.vehicleCamera.controls.enableZoom = inspectToggle.enableZoom
        }
      }
      if (bloomPass) {
        bloomPass.threshold = inspectToggle.bloomThreshold
        bloomPass.strength = inspectToggle.bloomStrength
      }
    }

    // Habitat interior (H key) — enter/exit first-person interior
    const habitatTransition = this.modeCoordinator.resolveHabitatTransition({
      togglePressed: this.inputManager?.wasActionPressed('focusHabitat') ?? false,
      habitatActive: this.habitatState.isActive,
      habitatPhase: this.habitatState.phase,
      inspectMode: this.inspectMode,
      canEnterHabitat: Boolean(this.shuttleController && this.sceneObjects),
    })
    if (habitatTransition.toggleDoors) {
      this.shuttleController?.toggleDoors()
    }
    this.inspectMode = habitatTransition.nextInspectMode
    if (habitatTransition.action === 'enter') {
      this.habitatState.enter()
    } else if (habitatTransition.action === 'leave') {
      this.habitatState.leave()
    }

    // Orbit action (E key) — press to capture/cancel, hold to charge slingshot
    if (this.orbitSystem && this.shuttleController && this.inputManager) {
      const previousCharge = this.slingshotCharge
      this.orbitFacade.handleOrbitInput(dt, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
        inputManager: this.inputManager,
        mapIntroControlsLocked: this.mapIntro.controlsLocked,
      })
      if (previousCharge > 0 && this.slingshotCharge === 0 && this.orbitSystem?.state === 'free') {
        this.yRecovery = true
      }
    }

    // Shop action (B key) — toggle shop while orbiting
    if (
      this.inputManager?.wasActionPressed('shopAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.shopFacade.session
    ) {
      if (this.shopFacade.dialogOpen) {
        this.shopFacade.close()
        this.onShopState?.(null, this.playerProfile, this.playerInventory)
      } else {
        this.shopFacade.open(this.onShopState, this.playerProfile, this.playerInventory)
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
        this.missionFacade.toggleOrbitMissionOverlay({
          targetName: this.orbitSystem?.target?.name ?? null,
          inventory: this.playerInventory,
          onMissionOverlay: this.onMissionOverlay,
        })
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
        const speedDelta = slope * MAP_CONFIG.CURVATURE_SPEED_FACTOR * dt
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
    if (this.orbitSystem?.state === 'approaching' && this.shuttleController) {
      this.orbitFacade.tickApproach(dt, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
      })
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
        adriftCountdown:
          this.adriftTimer > 0 ? MAP_CONFIG.ADRIFT_TIMEOUT - this.adriftTimer : -1,
        hp: this.shipHealth?.hp ?? 100,
        maxHp: this.shipHealth?.maxHp ?? 100,
        temperature: this.shipHealth?.temperature ?? 0,
        temperatureVisible: this.shipHealth?.temperatureVisible ?? false,
        damageIntensity: this.shipHealth?.damageIntensity ?? 0,
      })
    }

    // Orbit HUD state
    if (this.orbitSystem && this.shuttleController && this.onOrbitState) {
      const hudState = this.orbitFacade.buildHudState(this.shuttleController, this.inspectMode)
      if (hudState) this.onOrbitState(hudState)
    }

    // Constant-screen-size shuttle scale — keeps the ship visible when zoomed out
    this.tickShuttleScale(dt)

    // Ambient particles are only active during free flight, not orbit/approach
    if (this.sceneEnvironment) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      this.sceneEnvironment.setAmbientActive(orbitState === 'free')
    }

    // Adrift check — 60s with no fuel in free flight = game over
    if (this.shuttleController && !this.shuttleController.dead) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const hasFuel = this.shuttleController.thrusterSystem.fuelLevel > 0
      if (orbitState === 'free' && !hasFuel) {
        this.adriftTimer += dt
        if (this.adriftTimer >= MAP_CONFIG.ADRIFT_TIMEOUT) {
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
            px,
            pz,
          )
        : 0
      const isHealingAtEarth =
        orbitState === 'orbiting' && this.orbitSystem?.target?.name === 'Earth'
      const heatMitigation = getCurrentUpgradeValue('shuttleHeatResistance')
      const coldMitigation = getCurrentUpgradeValue('shuttleFreezeResistance')
      this.shipHealth.tick(
        dt,
        sunDist,
        radiationProximity,
        isHealingAtEarth,
        heatMitigation,
        heatMitigation,
        coldMitigation,
        coldMitigation,
        getCurrentUpgradeValue('shuttleRadiationResistance'),
      )
      this.shuttleEffects?.setTemperature(this.shipHealth.temperature)
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

    // Slingshot speed lines — ramp down as burst settles
    if (this.slingshotSpeedPass && this.shuttleController) {
      if (this.shuttleController.slingshotBurstActive) {
        const progress = this.shuttleController.slingshotBurstProgress
        // Ramp up in first 5%, hold, then fade out in last 40%
        const rampUp = Math.min(1, progress / 0.05)
        const fadeOut = progress < 0.6 ? 1.0 : 1 - (progress - 0.6) / 0.4
        this.slingshotSpeedPass.uniforms.intensity!.value = rampUp * fadeOut
        this.slingshotSpeedPass.uniforms.time!.value += dt
      } else {
        this.slingshotSpeedPass.uniforms.intensity!.value = 0
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
      const lodFraction = camY < 5 ? 1.0 : camY < 20 ? 0.5 : camY < 50 ? 0.25 : 0.1
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
        if (controller.mass < MAP_CONFIG.GRID_MASS_THRESHOLD) continue
        const planetId = PLANETS[i]?.id
        const gasGiantWideWell = planetId === 'jupiter' || planetId === 'saturn'
        this.spaceTimeGrid.addSource({
          x: controller.getWorldX(),
          z: controller.getWorldZ(),
          mass: controller.mass,
          ...(gasGiantWideWell
            ? { wellWidthMultiplier: MAP_CONFIG.MAP_GRID_GAS_GIANT_WELL_WIDTH_MULT }
            : {}),
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
      this.orbitFacade.tickOrbit(dt, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
        inputManager: this.inputManager,
        mapIntroControlsLocked: this.mapIntro.controlsLocked,
        planetControllers: this.planetControllers,
      })
      this.updateShopSession()
      this.updateMissionState()
      this.missionFacade.tick(dt)
    }

    // Waypoint marker scale + VFX (must not gate begin-mission proximity — marker refs can lag).
    if (this.sceneObjects && this.vehicleCamera && this.shuttleController) {
      this.missionFacade.tickWaypointVisuals({
        scene: this.sceneObjects.scene,
        vehicleCamera: this.vehicleCamera,
        shuttlePosition: this.shuttleController.position,
        simTime: this.simTime,
        apparentSize: MAP_CONFIG.WAYPOINT_APPARENT_SIZE,
      })
    }

    if (this.shuttleController && !this.shuttleController.dead) {
      const mission = this.missionFacade.tryBeginAsteroidMission({
        shuttlePosition: this.shuttleController.position,
        orbitSystem: this.orbitSystem,
        beginMissionPressed: this.inputManager?.wasActionPressed('beginMission') ?? false,
        cancelOrbitApproachFromMap: () => this.cancelOrbitApproachFromMap(),
      })
      if (mission) {
        this.onBeginAsteroidMission?.(mission)
      }
    }

    // Shop session restock tick
    this.shopFacade.tick(dt)

    // Global demand variance tick
    tickDemandTimer(dt)

    this.recordWorldLinePoint()
    this.messageFacade.triggerRuntimeMessages({
      worldLineHistoryLength: this.worldLineHistory.length,
      earthDepartureMinHistoryPoints: MAP_CONFIG.EARTH_DEPARTURE_MIN_HISTORY_POINTS,
      earthDistance: this.getDistanceToPlanet('earth'),
      earthDepartureDistance: MAP_CONFIG.EARTH_DEPARTURE_MESSAGE_DISTANCE,
      isBraking: this.shuttleController?.isBraking ?? false,
      thrustState: this.shuttleController?.thrusterSystem.getState('thrust') ?? null,
      canFireThrust:
        this.shuttleController?.thrusterSystem.canFire('thrust', {
          burnRateMultiplier: getCurrentShuttleThrusterEfficiencyModifiers(),
        }) ?? false,
      shipSolarDistance: this.shuttleController
        ? Math.sqrt(
            this.shuttleController.position.x ** 2 + this.shuttleController.position.z ** 2,
          )
        : null,
      venusOrbitRadius: (() => {
        const venusController = this.getPlanetControllerById('venus')
        if (!venusController) return null
        return Math.sqrt(venusController.getWorldX() ** 2 + venusController.getWorldZ() ** 2)
      })(),
      venusOrbitWarningDistance: MAP_CONFIG.VENUS_ORBIT_WARNING_DISTANCE,
      onMessageUpdate: this.onMessageUpdate,
    })
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
   * Sets planet / moon orbit line visibility without using the public toggle.
   *
   * @param visible - Whether orbit lines should render.
   */
  private applyOrbitsVisible(visible: boolean): void {
    this.orbitsVisible = visible
    for (const controller of this.planetControllers) {
      for (const line of controller.orbitLines) {
        line.visible = visible
      }
    }
  }

  /**
   * Applies default Space Fabric visibility from the Gravity Surfing upgrade (map load only).
   */
  private applyInitialSpaceFabricVisibilityFromUpgrades(): void {
    if (hasGravitySurfingUnlock()) {
      this.applyGridVisible(true)
    } else {
      this.applyGridVisible(false)
    }
  }

  /**
   * Sets space-time fabric visibility and refreshes deform when enabling.
   *
   * @param visible - Whether the grid mesh should render.
   */
  private applyGridVisible(visible: boolean): void {
    const showFabric = Boolean(visible && hasGravitySurfingUnlock())
    this.gridVisible = showFabric
    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.mesh.visible = showFabric
      if (showFabric) {
        this.syncSpaceTimeGridVisualBudget()
        this.spaceTimeGrid.forceFullVisualDeform()
      }
    }
  }

  /**
   * Hides orbits, fabric, and debris for the opening cinematic; remembers prior toggles.
   */
  private suppressIntroMapLayers(): void {
    if (this.introLayerRestore !== null) return
    this.introLayerRestore = {
      orbitsVisible: this.orbitsVisible,
      gridVisible: this.gridVisible,
      ambientVisible: this.sceneEnvironment?.ambientVisible ?? true,
    }
    this.applyOrbitsVisible(false)
    this.applyGridVisible(false)
    this.sceneEnvironment?.setMapIntroSuppressed(true)
    this.emitMapViewLayerToggles()
  }

  /**
   * Restores orbit / fabric / debris after intro completes or is skipped from dev tools.
   */
  private restoreIntroMapLayers(): void {
    if (this.introLayerRestore === null) return
    const saved = this.introLayerRestore
    this.introLayerRestore = null
    this.applyOrbitsVisible(saved.orbitsVisible)
    this.applyGridVisible(saved.gridVisible)
    this.sceneEnvironment?.setMapIntroSuppressed(false)
    this.emitMapViewLayerToggles()
  }

  private emitMapViewLayerToggles(): void {
    this.onMapViewLayerToggles?.({
      orbitsVisible: this.orbitsVisible,
      gridVisible: this.gridVisible,
      ambientVisible: this.sceneEnvironment?.ambientVisible ?? true,
    })
  }

  /**
   * Toggles the visibility of all planet and moon orbit lines.
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleOrbits(): boolean {
    this.applyOrbitsVisible(!this.orbitsVisible)
    return this.orbitsVisible
  }

  /**
   * Toggles the visibility of the space-time fabric grid mesh.
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleSpaceTimeGrid(): boolean {
    if (!hasGravitySurfingUnlock()) {
      return this.gridVisible
    }
    this.applyGridVisible(!this.gridVisible)
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
      spanX >= this.mapGridSize * MAP_CONFIG.GRID_DEFORM_WHOLE_MAP_COVERAGE &&
      spanZ >= this.mapGridSize * MAP_CONFIG.GRID_DEFORM_WHOLE_MAP_COVERAGE

    const intervalScale = coversWholeMap ? MAP_CONFIG.GRID_DEFORM_INTERVAL_SCALE_WHOLE_MAP : 1

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
    if (!this.sceneEnvironment) return true
    return this.sceneEnvironment.toggleAmbient()
  }

  /** Write current profile and shuttle inventory to localStorage. */
  private persistPlayerProfile(): void {
    saveProfile(this.playerProfile)
    saveInventory(this.playerInventory)
  }

  /**
   * Marks the map intro cinematic as seen, persists, and syncs profile fields (e.g. `hasSeenIntro`)
   * to Vue. No-op when already true.
   */
  private markMapIntroSeenAndSyncProfile(): void {
    if (this.playerProfile.hasSeenIntro) return
    this.playerProfile = markMapIntroSeen(this.playerProfile)
    this.persistPlayerProfile()
    this.emitShopState()
  }

  /** Sync latest profile/inventory to Vue without implicitly opening the shop overlay. */
  private emitShopState(): void {
    this.shopFacade.emitState(this.onShopState, this.playerProfile, this.playerInventory)
  }

  /** Build a fresh inventory using the current cargo-bay upgrade multiplier. */
  private createInventoryForCurrentCargoBayLevel(): Inventory {
    const cargoMultiplier = getCurrentUpgradeValue('shuttleCargoBay')
    return createInventory(
      Math.round(DEFAULT_MAX_SLOTS * cargoMultiplier),
      Math.round(DEFAULT_MAX_WEIGHT_KG * cargoMultiplier),
    )
  }

  /**
   * Add starter shuttle and lander fuel cells to an empty cargo hold (new game or death respawn).
   *
   * @param emptyHold - Fresh inventory with correct bay limits and no stacks.
   * @returns Inventory including one reserve shuttle cell and one lander cell when `addItem` succeeds.
   */
  private inventoryWithStarterFuelCells(emptyHold: Inventory): Inventory {
    let inv = emptyHold
    const addReserve = addItem(inv, RESERVE_FUEL_ID, MAP_CONFIG.STARTER_SHUTTLE_FUEL_CELL_COUNT)
    if (!addReserve.ok) return inv
    inv = addReserve.inventory
    const addLander = addItem(inv, LANDER_FUEL_ID, MAP_CONFIG.STARTER_LANDER_FUEL_CELL_COUNT)
    return addLander.ok ? addLander.inventory : inv
  }

  /**
   * Ensure at least one shuttle reserve and one lander fuel cell (e.g. after loading a save that
   * predates fuel grants or had zero stacks).
   *
   * @param inventory - Current hold (already cargo-bay sized).
   * @returns Updated inventory when adds succeed; otherwise the input reference.
   */
  private ensureMinimumStarterFuelCells(inventory: Inventory): Inventory {
    let inv = inventory
    const reserveQty = getStack(inv, RESERVE_FUEL_ID)?.quantity ?? 0
    if (reserveQty < MAP_CONFIG.STARTER_SHUTTLE_FUEL_CELL_COUNT) {
      const delta = MAP_CONFIG.STARTER_SHUTTLE_FUEL_CELL_COUNT - reserveQty
      const r = addItem(inv, RESERVE_FUEL_ID, delta)
      if (r.ok) inv = r.inventory
    }
    const landerQty = getStack(inv, LANDER_FUEL_ID)?.quantity ?? 0
    if (landerQty < MAP_CONFIG.STARTER_LANDER_FUEL_CELL_COUNT) {
      const delta = MAP_CONFIG.STARTER_LANDER_FUEL_CELL_COUNT - landerQty
      const r = addItem(inv, LANDER_FUEL_ID, delta)
      if (r.ok) inv = r.inventory
    }
    return inv
  }

  /** Keep the current inventory contents but resize slot/weight caps to the installed cargo bay. */
  private applyCargoBayLimits(inventory: Inventory): Inventory {
    const cargoMultiplier = getCurrentUpgradeValue('shuttleCargoBay')
    return {
      ...inventory,
      maxSlots: Math.round(DEFAULT_MAX_SLOTS * cargoMultiplier),
      maxWeightKg: Math.round(DEFAULT_MAX_WEIGHT_KG * cargoMultiplier),
    }
  }

  /** Create or destroy shop session based on orbit state. */
  private updateShopSession(): void {
    const targetName = this.orbitSystem?.target?.name ?? null
    const targetPlanetId = targetName
      ? (PLANETS.find((planet) => planet.name === targetName)?.id ?? null)
      : null
    const { openedPlanetId } = this.shopFacade.updateOrbitState({
      orbitState: this.orbitSystem?.state ?? 'free',
      targetName,
      targetPlanetId,
      onShopButton: this.onShopButton,
      onShopState: this.onShopState,
      profile: this.playerProfile,
      inventory: this.playerInventory,
    })
    if (openedPlanetId) {
      this.offerMissionAtPlanet(openedPlanetId)
      this.offerAsteroidMissionFromDifficulty()
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
  }

  /** Update mission button visibility based on orbit state. */
  private updateMissionState(): void {
    this.missionFacade.updateMissionState({
      orbitState: this.orbitSystem?.state ?? 'free',
      targetName: this.orbitSystem?.target?.name ?? null,
      inventory: this.playerInventory,
      onMissionButton: this.onMissionButton,
      onMissionOverlay: this.onMissionOverlay,
    })
  }

  /**
   * Snapshot of upgrade levels for shuttle terminal UI.
   */
  getUpgradeLevelsSnapshot(): Record<UpgradeId, number> {
    return getPlayerUpgradeLevelsSnapshot()
  }

  /** Current persisted player profile snapshot for Vue/UI sync. */
  getPlayerProfileSnapshot(): PlayerProfile {
    return { ...this.playerProfile }
  }

  /** Current shuttle inventory snapshot for Vue/UI sync. */
  getPlayerInventorySnapshot(): Inventory {
    return {
      ...this.playerInventory,
      stacks: this.playerInventory.stacks.map((stack) => ({ ...stack })),
    }
  }

  /**
   * Buy the next level for an upgrade if the player has enough credits.
   *
   * @param upgradeId - Upgrade to advance by one level.
   * @returns True when purchase succeeded.
   */
  purchaseNextUpgradeLevel(upgradeId: UpgradeId): boolean {
    if (UPGRADE_DEFINITIONS[upgradeId].hiddenFromShop) return false
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    const result = tryPurchaseNextUpgradeLevel(this.playerProfile, upgradeId, current)
    if (!result.ok) return false
    this.playerProfile = result.profile
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = result.newLevel
    if (upgradeId === 'shuttleCargoBay') {
      this.playerInventory = this.applyCargoBayLimits(this.playerInventory)
      this.emitShopState()
    }
    this.persistPlayerProfile()
    saveCurrentPlayerUpgradesToStorage()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    return true
  }

  /**
   * Dev-only: clamp and persist a single upgrade level, then sync map systems that depend on it.
   *
   * @param upgradeId - Catalog id (e.g. `gravitySurfing`).
   * @param level - Target level `0..maxLevel`.
   */
  private devSetPlayerUpgradeLevel(upgradeId: UpgradeId, level: number): void {
    if (!import.meta.env.DEV) return
    const def = UPGRADE_DEFINITIONS[upgradeId]
    const clamped = Math.max(0, Math.min(def.maxLevel, Math.floor(level)))
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = clamped
    saveCurrentPlayerUpgradesToStorage()
    if (upgradeId === 'gravitySurfing') {
      if (!hasGravitySurfingUnlock()) {
        this.applyGridVisible(false)
      }
      this.emitMapViewLayerToggles()
    }
    this.onUpgradeHudRefresh?.()
    console.info(`[MapView] set upgrade ${upgradeId} → level ${clamped}`)
  }

  /** Open the shop dialog (called by Vue ShopButton click). */
  openShop(): void {
    this.shopFacade.open(this.onShopState, this.playerProfile, this.playerInventory)
  }

  /** Close the shop dialog (called by Vue). */
  closeShop(): void {
    this.shopFacade.close()
  }

  /** Offer a mission when docking at a planet. */
  offerMissionAtPlanet(planetId: string): void {
    this.missionFacade.offerMissionAtPlanet(planetId, this.onMissionBoardUpdate)
  }

  /** Accept the offered mission (from shuttle control UI). */
  missionAccept(): void {
    this.missionFacade.missionAccept(this.onMissionBoardUpdate)
  }

  /** Generate and offer an asteroid mission based on current difficulty. */
  offerAsteroidMissionFromDifficulty(): void {
    this.missionFacade.offerAsteroidMissionFromDifficulty(this.onMissionBoardUpdate)
  }

  /** Accept the offered asteroid mission (from shuttle control UI). */
  asteroidMissionAccept(): void {
    this.missionFacade.asteroidMissionAccept(this.onMissionBoardUpdate)
  }

  /** Complete the mission minigame (from overlay UI). */
  missionComplete(missionId: string): void {
    this.playerInventory = this.missionFacade.missionComplete({
      missionId,
      inventory: this.playerInventory,
      onMissionOverlay: this.onMissionOverlay,
      onMissionBoardUpdate: this.onMissionBoardUpdate,
      onMissionComplete: this.onMissionComplete,
    })
  }

  /** Deliver a completed mission (from shuttle control UI). */
  missionDeliver(missionId: string): void {
    const result = this.missionFacade.missionDeliver({
      missionId,
      profile: this.playerProfile,
      inventory: this.playerInventory,
      scienceStationLevel: getCurrentUpgradeValue('shuttleScienceStation'),
      onMissionBoardUpdate: this.onMissionBoardUpdate,
      onMissionDeliver: this.onMissionDeliver,
    })
    if (result.creditsChanged) {
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.persistPlayerProfile()
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
  }

  /** Open the mission overlay (called by Vue OrbitPrompt click). */
  openMissionOverlay(): void {
    this.missionFacade.openMissionOverlay({
      targetName: this.orbitSystem?.target?.name ?? null,
      inventory: this.playerInventory,
      onMissionOverlay: this.onMissionOverlay,
    })
  }

  /** Enter the habitat interior (called from map nav “H Habitat” / startup handoff). */
  enterHabitat(): void {
    this.cancelPostStartupIntroHabitatTimer()
    if (!this.shuttleController || !this.sceneObjects) return
    if (this.habitatState.isActive) return
    if (!this.inspectMode) {
      this.shuttleController.toggleDoors()
      this.inspectMode = true
    }
    this.habitatState.enter()
  }

  /** Buy a trade good from the shop. */
  shopBuyTradeGood(slotIndex: number, quantity: number): void {
    const result = this.shopFacade.buyTradeGood(
      slotIndex,
      quantity,
      this.playerProfile,
      this.playerInventory,
    )
    if (result.ok) {
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.persistPlayerProfile()
      this.emitShopState()
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.emitFuelCellCount()
    }
  }

  /** Sell an item from inventory at the current planet. */
  shopSellItem(itemId: string, quantity: number): void {
    const result = this.shopFacade.sellTradeGood(
      itemId,
      quantity,
      this.playerProfile,
      this.playerInventory,
    )
    if (result.ok) {
      this.playerProfile = result.profile
      this.playerInventory = result.inventory
      this.persistPlayerProfile()
      this.emitShopState()
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.emitFuelCellCount()
    }
  }

  /** Refuel the shuttle (instant, costs credits). */
  shopRefuel(): void {
    if (!this.shuttleController) return
    const result = this.shopFacade.refuel(this.playerProfile)
    if (!result.ok) return
    this.playerProfile = result.profile
    this.persistPlayerProfile()
    this.shuttleController.thrusterSystem.refuel()
    this.emitShopState()
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Buy a reserve fuel cell (inventory item). */
  shopBuyReserveFuel(): void {
    const result = this.shopFacade.buyReserveFuel(this.playerProfile, this.playerInventory)
    if (!result.ok) return
    this.playerProfile = result.profile
    this.playerInventory = result.inventory
    this.persistPlayerProfile()
    this.emitShopState()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitFuelCellCount()
  }

  /** Buy a lander fuel cell (inventory item). */
  shopBuyLanderFuel(): void {
    const result = this.shopFacade.buyLanderFuel(this.playerProfile, this.playerInventory)
    if (!result.ok) return
    this.playerProfile = result.profile
    this.playerInventory = result.inventory
    this.persistPlayerProfile()
    this.emitShopState()
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Repair hull to 100% (Earth only, 250 credits). */
  shopRepairHull(): void {
    if (!this.shipHealth) return
    const result = this.shopFacade.repairHull(this.playerProfile)
    if (!result.ok) return
    this.playerProfile = result.profile
    this.persistPlayerProfile()
    this.shipHealth.repairFull()
    if (this.shopFacade.session) {
      this.emitShopState()
    }
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /** Emit the current fuel cell count to the Vue HUD. */
  private emitFuelCellCount(): void {
    const stack = getStack(this.playerInventory, RESERVE_FUEL_ID)
    this.onFuelCellCount?.(stack?.quantity ?? 0)
  }

  /** Install a minimum upgrade tier from a scripted consumable flow. */
  private installUpgradeFromConsumable(upgradeId: UpgradeId, targetLevel: number): void {
    const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
    if (current >= targetLevel) return
    CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = targetLevel
    saveCurrentPlayerUpgradesToStorage()
    if (upgradeId === 'gravitySurfing') {
      this.applyGridVisible(true)
      this.emitMapViewLayerToggles()
    }
    this.onUpgradeHudRefresh?.()
    const definition = UPGRADE_DEFINITIONS[upgradeId]
    this.onUpgradeInstalledAnnouncement?.(
      'UPGRADE INSTALLED',
      definition.label,
      targetLevel,
      0,
      upgradeId === 'gravitySurfing'
        ? 'Tier 1 · Grid Coupling Module'
        : `Tier ${targetLevel} · Auto-install`,
    )
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

  /** Use a terminal-triggered inventory item. */
  useInventoryItem(itemId: string): void {
    if (itemId !== 'grid-coupling-module') return

    const gravitySurfingLevel = CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing ?? 0
    const heatLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleHeatResistance ?? 0
    const freezeLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleFreezeResistance ?? 0
    if (gravitySurfingLevel >= 1 && heatLevel >= 1 && freezeLevel >= 1) return

    const stack = getStack(this.playerInventory, itemId)
    if (!stack || stack.quantity <= 0) return

    const result = consumeItem(this.playerInventory, itemId, 1)
    if (!result.ok) return

    this.playerInventory = result.inventory
    this.persistPlayerProfile()
    this.emitShopState()

    if (this.pendingModuleInstallTimer !== null) {
      Timer.cancel(this.pendingModuleInstallTimer)
      this.pendingModuleInstallTimer = null
    }

    this.pendingModuleInstallTimer = Timer.sequence([
      {
        delay: 0,
        fn: () => {
          this.installUpgradeFromConsumable('gravitySurfing', 1)
        },
      },
      {
        delay: 3,
        fn: () => {
          this.installUpgradeFromConsumable('shuttleHeatResistance', 1)
        },
      },
      {
        delay: 6,
        fn: () => {
          this.installUpgradeFromConsumable('shuttleFreezeResistance', 1)
          this.pendingModuleInstallTimer = null
        },
      },
    ])
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
    const minWorldSize =
      MAP_CONFIG.MAP_SHUTTLE_MIN_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
    const requiredScale = minWorldSize / MAP_CONFIG.MAP_SHUTTLE_BASE_SIZE
    const targetScale = Math.max(MAP_CONFIG.MAP_SHUTTLE_SCALE, requiredScale)
    this.currentShuttleScale = THREE.MathUtils.lerp(
      this.currentShuttleScale,
      targetScale,
      Math.min(1, MAP_CONFIG.MAP_SHUTTLE_SCALE_LERP * dt),
    )
    this.shuttleController.group.scale.setScalar(this.currentShuttleScale)

    this.sceneVisuals?.updateShipReticle({
      shuttlePosition: this.shuttleController.group.position,
      shuttleVelocity: this.shuttleController.currentVelocity,
      shuttleScale: this.currentShuttleScale,
      cameraPosition: this.vehicleCamera.camera.position,
      cameraFov: this.vehicleCamera.camera.fov,
      cameraAzimuth: this.vehicleCamera.controls.getAzimuthalAngle(),
      isFreeFlight: this.orbitSystem?.state === 'free',
    })
  }

  /** Reset shuttle after death — clear death state, place into Earth orbit. */
  /** Unified death handler — explode or freeze ship, zoom camera, show overlay. */
  private triggerDeath(cause: string): void {
    if (!this.shuttleController) return
    this.lifeCycleFacade.triggerDeath(cause, {
      shuttleController: this.shuttleController,
      shuttleEffects: this.shuttleEffects,
      vehicleCamera: this.vehicleCamera,
      onDeathOverlay: this.onDeathOverlay,
      isEmissiveMaterial,
    })
  }

  private respawnAtEarth(): void {
    if (!this.shuttleController || !this.orbitSystem) return

    // Ship destroyed — credits and cargo gone; shuttle contracts / active asteroid mission voided.
    this.shopFacade.clear(
      this.onShopButton,
      this.onShopState,
      this.playerProfile,
      this.playerInventory,
    )
    const respawnState = this.lifeCycleFacade.buildRespawnPlayerState(this.playerProfile, () =>
      this.inventoryWithStarterFuelCells(this.createInventoryForCurrentCargoBayLevel()),
    )
    this.playerProfile = respawnState.playerProfile
    this.playerInventory = respawnState.playerInventory
    clearActiveMission()
    this.missionFacade.reset(
      this.sceneObjects?.scene ?? null,
      this.onMissionOverlay,
      this.onMissionButton,
      this.onMissionBoardUpdate,
    )
    this.persistPlayerProfile()
    resetDemand()
    this.onShopButton?.(false, '')
    this.emitShopState()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitFuelCellCount()

    const earthIndex = PLANETS.findIndex((p) => p.id === 'earth')
    const earthController = this.planetControllers[earthIndex]
    const didRespawn = this.lifeCycleFacade.respawnAtEarth({
      shuttleController: this.shuttleController,
      vehicleCamera: this.vehicleCamera,
      sceneVisuals: this.sceneVisuals,
      shipHealth: this.shipHealth,
      orbitFacade: this.orbitFacade,
      earthController: earthController ?? null,
      isEmissiveMaterial,
    })
    if (!didRespawn) return

    // Reset slingshot state
    this.yRecovery = false
    this.adriftTimer = 0
    this.resetWorldLineHistory()
    this.updateMissionState()
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
    return computeGravityProximity(sourceX, sourceZ, mass, px, pz, MAP_CONFIG.MAP_GRAVITY_CONFIG)
  }

  /** Max proximity across Sun + all planets at a point. */
  private computeMaxProximity(px: number, pz: number): number {
    const sources = this.sunController
      ? [this.sunController, ...this.planetControllers]
      : this.planetControllers
    return computeMaxGravityProximity(px, pz, sources, MAP_CONFIG.MAP_GRAVITY_CONFIG)
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

  /**
   * Exit planet approach autopilot and restore free flight (shared by E cancel and mission begin).
   */
  private cancelOrbitApproachFromMap(): void {
    if (!this.shuttleController) return
    this.orbitFacade.cancelApproachFromMap({
      shuttleController: this.shuttleController,
      vehicleCamera: this.vehicleCamera,
      sceneVisuals: this.sceneVisuals,
    })
  }

  /**
   * Place the shuttle at the asteroid mission waypoint after exfil (free flight, no marker load).
   *
   * @param worldX - Solar map world X from the completed mission waypoint.
   * @param worldZ - Solar map world Z from the completed mission waypoint.
   */
  private spawnShuttleAtCompletedMissionWaypoint(worldX: number, worldZ: number): void {
    if (!this.shuttleController || !this.orbitSystem) return
    this.shuttleController.group.position.set(worldX, 0, worldZ)
    this.shuttleController.setVelocity(new THREE.Vector3(0, 0, 0))
    const yaw = Math.atan2(worldZ, worldX) + Math.PI / 2
    this.shuttleController.group.rotation.set(0, yaw, 0)
    this.prepareShuttleAfterDevWarp()
  }

  /**
   * After a dev teleport, exit orbit capture UI/state so free-flight matches the new pose.
   */
  private prepareShuttleAfterDevWarp(): void {
    if (!this.shuttleController) return
    this.orbitFacade.prepareShuttleAfterDevWarp({
      shuttleController: this.shuttleController,
      vehicleCamera: this.vehicleCamera,
      sceneVisuals: this.sceneVisuals,
    })
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
      console.info(`[MapView] warp("earth") — ids: sun, ${PLANETS.map((p) => p.id).join(', ')}`)
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
      console.info(`[MapView] Try: sun, ${PLANETS.map((p) => p.id).join(', ')}`)
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

    const runtime = this.modeCoordinator.resolveMapTransitionRuntime(
      this.mapState.phase,
      this.mapState.progress,
    )
    const aspect = window.innerWidth / window.innerHeight

    // Update ortho frustum based on transition progress
    this.mapCamera.updateTransition(runtime.transitionProgress, aspect)

    // Swap render camera to ortho during map phases
    const renderPass = this.sceneObjects.composer.passes[0] as RenderPass
    if (runtime.useMapCamera) {
      renderPass.camera = this.mapCamera.camera
    }

    // Emit overlay state when fully open
    if (runtime.showOverlay) {
      this.emitMapOverlay()
    } else {
      this.onMapOverlay?.(this.modeCoordinator.buildHiddenMapOverlayState())
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
    const restoreState = this.modeCoordinator.shouldRestoreFreeFlightAfterMapClose(
      this.orbitSystem?.state ?? 'free',
      this.shuttleController.slingshotBurstActive,
    )
    if (restoreState.unfreezeShuttle) {
      this.shuttleController.unfreeze()
      if (restoreState.enableInput) {
        this.shuttleController.setInputEnabled(true)
      }
    }
    // If orbiting, shuttle stays frozen but input stays disabled (orbit manages this)

    // Restore grid color/opacity (fabric stress cleared until next orrery tick)
    this.spaceTimeGrid?.applyBaselineLineAppearance()

    // Hide overlay
    this.onMapOverlay?.(this.modeCoordinator.buildHiddenMapOverlayState())
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
    const bodies: MapBody[] = buildMapBodies({
      sun: this.sunController,
      planets: this.planetControllers,
    })

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
        const infR = influenceRadius(b.mass, MAP_CONFIG.MAP_GRAVITY_CONFIG)
        const horR = eventHorizonRadius(b.mass, MAP_CONFIG.MAP_GRAVITY_CONFIG)

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

    let missionWaypoint: MapOverlayState['missionWaypoint'] = null
    const boardMission = this.missionBoard.activeAsteroidMission
    if (shouldShowAsteroidMissionMapSite(boardMission)) {
      const wp = boardMission!.waypoint
      const wpScreen = this.mapCamera!.projectToScreen(new THREE.Vector3(wp.worldX, 0, wp.worldZ))
      const dx = wp.worldX - px
      const dz = wp.worldZ - pz
      const dist = Math.sqrt(dx * dx + dz * dz)
      missionWaypoint = {
        screenX: wpScreen.x * 100,
        screenY: wpScreen.y * 100,
        name: boardMission!.name,
        distance: formatDistance(dist),
      }
    }

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
      missionWaypoint,
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

    this.restoreIntroMapLayers()
    this.emitIntroUiState()
  }

  /** Start the opening cutscene only when an active startup message exists. */
  private beginStartupIntro(): void {
    if (!this.messageFacade.hasActiveMessage() || !this.vehicleCamera) {
      this.clearStartupCinematicOrbitHandoff()
      this.mapIntro.skip()
      this.markMapIntroSeenAndSyncProfile()
      this.emitIntroUiState()
      return
    }

    this.awaitingStartupCinematicOrbitHandoff = true
    this.mapIntro.start({ skipBlockingMessageAfterCinematic: true })
    this.suppressIntroMapLayers()
    this.vehicleCamera.controls.enabled = false
    this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
    this.introFacade?.resetCamera()
    this.emitIntroUiState()
  }

  /**
   * Clears pending Earth-orbit cinematic handoff (dev skip, no-mail startup, or teardown).
   */
  private clearStartupCinematicOrbitHandoff(): void {
    this.awaitingStartupCinematicOrbitHandoff = false
    this.cancelPostStartupIntroHabitatTimer()
    this.setEarthStartupOrbitHudSuppressed(false)
  }

  private setEarthStartupOrbitHudSuppressed(suppressed: boolean): void {
    if (this.suppressOrbitShuttleHudForEarthStartup === suppressed) return
    this.suppressOrbitShuttleHudForEarthStartup = suppressed
    this.onEarthStartupOrbitHudSuppressed?.(suppressed)
  }

  private cancelPostStartupIntroHabitatTimer(): void {
    if (this.postStartupIntroHabitatTimerHandle === null) return
    Timer.cancel(this.postStartupIntroHabitatTimerHandle)
    this.postStartupIntroHabitatTimerHandle = null
  }

  /**
   * When the Earth-orbit cinematic ends: unlock orbit HUD, then after
   * {@link MAP_CONFIG.POST_STARTUP_INTRO_HABITAT_DELAY_SEC}
   * seconds auto-enter the habitat (same as pressing H).
   */
  private finishStartupCinematicOpenOrbit(): void {
    this.markMapIntroSeenAndSyncProfile()
    if (this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = true
    }
    this.restoreIntroMapLayers()
    this.shuttleController?.setInputEnabled(true)
    this.setEarthStartupOrbitHudSuppressed(true)
    this.emitIntroUiState()
    this.cancelPostStartupIntroHabitatTimer()
    this.postStartupIntroHabitatTimerHandle = Timer.after(
      MAP_CONFIG.POST_STARTUP_INTRO_HABITAT_DELAY_SEC,
      () => {
        this.postStartupIntroHabitatTimerHandle = null
        this.tryEnterHabitatAfterStartupIntro()
      },
    )
  }

  /** Invoked from {@link Timer} after the startup cinematic handoff — mirrors {@link enterHabitat}. */
  private tryEnterHabitatAfterStartupIntro(): void {
    if (!this.shuttleController || !this.sceneObjects) return
    if (this.habitatState.isActive) return
    if (this.mapState.isOpen) return
    this.enterHabitat()
  }

  /**
   * During intro, orbit drag is allowed only on the “new message” prompt so the player can
   * look around; it stays off for the cinematic and the message reader dialog.
   */
  private syncIntroOrbitControlsEnabled(): void {
    this.introFacade?.syncOrbitControlsEnabled(this.vehicleCamera, this.mapIntro)
  }

  /**
   * Animate the intro camera through 6 cinematic beats.
   *
   * Beat 1: Wide solar system → Saturn/Enceladus
   * Beat 2: Hold on Enceladus (discovery)
   * Beat 3: Viroid reveal (VirusModel prop)
   * Beat 4a: Sweep to Jupiter
   * Beat 4b: Cloud city reveal (CityModel prop)
   * Beat 5: Sweep to shuttle, hero hold, orbit handoff
   */
  private tickStartupIntroCamera(): void {
    this.introFacade?.tick({
      sceneObjects: this.sceneObjects,
      vehicleCamera: this.vehicleCamera,
      shuttleController: this.shuttleController,
      mapIntro: this.mapIntro,
      isMapOpen: this.mapState.isOpen,
      isHabitatActive: this.habitatState.isActive,
      findPlanetControllerById: (planetId) => this.getPlanetControllerById(planetId),
    })
  }

  /** Push the current intro UI state to Vue. */
  private emitIntroUiState(): void {
    this.onMapIntro?.(this.mapIntro.uiState)
  }

  /** Dev-only: enqueue the Consortium message and start its authored special mission immediately. */
  private devStartConsortiumCertificationMessage(): void {
    const mission = getSpecialMissionById('consortium-certification')
    if (!mission) {
      console.warn('[MapView] Special mission consortium-certification not found.')
      return
    }

    this.messageFacade.enqueueById('consortium-certification-offer', this.onMessageUpdate)

    const acceptedMission: GeneratedAsteroidMission = {
      ...mission,
      status: 'accepted',
    }
    this.missionBoard = {
      ...this.missionBoard,
      offeredAsteroidMission: null,
      activeAsteroidMission: acceptedMission,
    }
    saveActiveMission(acceptedMission)
    this.onMissionBoardUpdate?.(this.missionBoard)
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

    const renderState = this.modeCoordinator.resolveHabitatRenderState(
      this.habitatState.phase,
      this.habitatState.progress,
    )
    if (renderState.disableVehicleControls && this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = false
    }

    if (renderState.useHabitatScene) {
      ;(renderPass as { scene: THREE.Scene }).scene = this.habitatScene.getScene()
      renderPass.camera = this.habitatScene.getCamera()

      if (renderState.wakeUpProgress !== null) {
        const t = renderState.wakeUpProgress
        const cam = this.habitatScene.fpsCamera
        const spawn = this.habitatScene.getSpawnPosition()
        cam.yaw = spawn.yaw
        const START_PITCH = -Math.PI / 2
        cam.pitch = START_PITCH * (1 - t)
        const lyingHeight = 0.5
        const standingHeight = spawn.position.y
        cam.camera.position.y = lyingHeight + (standingHeight - lyingHeight) * t
        cam.tick(0)
      }
    }
  }

  /** Compute the fade overlay opacity based on habitat state. */
  private getHabitatFadeOpacity(): number {
    return this.modeCoordinator.getHabitatFadeOpacity(
      this.habitatState.phase,
      this.habitatState.progress,
    )
  }

  private onEnterHabitat(): void {
    this.onHabitatActive?.(true)
    this.setEarthStartupOrbitHudSuppressed(false)
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
    this.setEarthStartupOrbitHudSuppressed(false)
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
    this.clearStartupCinematicOrbitHandoff()
    if (this.sceneObjects?.scene) {
      this.introFacade?.dispose(this.sceneObjects.scene)
    }
    this.missionFacade.dispose(this.sceneObjects?.scene ?? null)
    document.removeEventListener('mousemove', this.onHabitatMouseMove)
    this.sceneObjects?.renderer.domElement.removeEventListener('click', this.onHabitatClick)
    this.habitatScene?.dispose()
    this.habitatScene = null
    DevConsole.unregister('MapView')
    this.onUpgradeHudRefresh = null
    this.sceneEnvironment?.dispose()
    this.sceneEnvironment = null
    this.sceneVisuals?.dispose()
    this.sceneVisuals = null
    this.gameLoop?.stop()

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
    }

    // Dispose controllers
    this.portalArrival?.dispose()
    this.shuttleEffects?.dispose()
    this.shuttleEffects = null
    if (this.pendingModuleInstallTimer !== null) {
      Timer.cancel(this.pendingModuleInstallTimer)
      this.pendingModuleInstallTimer = null
    }
    this.shuttleController?.dispose()
    this.beltControllers = []
    this.planetControllers = []
    this.gravitationalEventManager?.setNearbyHudCallbacks(null)
    this.gravitationalEventManager?.clear()
    this.gravitationalEventManager = null
    this.planetariumScene?.dispose()
    this.planetariumScene = null
    this.spaceTimeGrid = null
    this.sunController = null

    // Dispose camera and scene
    this.mapCamera = null
    this.introFacade = null
    this.vehicleCamera?.dispose()
    this.inputManager?.dispose()
    if (this.sceneObjects) {
      this.sceneObjects.renderer.dispose()
    }
  }
}
