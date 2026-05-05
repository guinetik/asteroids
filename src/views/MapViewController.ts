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
import type { Tickable } from '@/lib/Tickable'
import type {
  ShuttleTelemetry,
  GravityWarningState,
  GravitationalAnomalyHudState,
  RadiationWarningState,
  CompassBearing,
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
import { isDebugHudEnabled } from '@/lib/debug/debugMetrics'
import { DebugMetricsTracker } from '@/lib/debug/DebugMetricsTracker'
import { DEFAULT_TIME_SCALE, ORBIT_SCALE } from '@/lib/planets/constants'
import { PINNED_BODIES, PLANETS, SUN } from '@/lib/planets/catalog'
import type { Planet } from '@/lib/planets/types'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import { SunController } from '@/three/controllers/SunController'
import { PlanetSystemController } from '@/three/controllers/PlanetSystemController'
import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { SpaceTimeGrid } from '@/three/SpaceTimeGrid'
import * as THREE from 'three'
import { OrbitCaptureSystem, type OrbitCaptureState, type OrbitHudState } from '@/lib/orbitCapture'
import { ShuttleController, MAP_PHYSICS } from '@/three/ShuttleController'
import { LANDER_BASE_HP } from '@/three/LanderController'
import { EvaSession, type EvaHugeScaleTarget, type EvaSceneHost } from '@/three/EvaSession'
import {
  createAabbColliderFromObject,
  createCylinderColliderFromHullNodes,
  type EvaCollider,
} from '@/lib/physics/evaCollisionResolver'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import {
  VehicleCamera,
  MAP_CAMERA_CONFIG,
  MAP_ORBIT_CAMERA_CONFIG,
  MAP_INSPECT_CAMERA_CONFIG,
  MAP_PORTAL_ARRIVAL_CAMERA_CONFIG,
  MAP_PORTAL_CINEMATIC_CAMERA_CONFIG,
} from '@/three/VehicleCamera'
import { PortalArrivalSequence } from '@/three/PortalArrivalSequence'
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VibePortal } from '@/lib/portal'
import { MapState } from '@/lib/mapState'
import { MapIntroState, type MapIntroUiState } from '@/lib/mapIntroState'
import { MapCamera } from '@/three/MapCamera'
import type { MapOverlayState } from '@/lib/ShuttleTelemetry'
import { computeRelativeOrbitalSpeedMultiplier } from '@/lib/orbitSpeedProfile'
import mapOverlayData from '@/data/shuttle/map-overlay.json'
import {
  registerMapDevCommands,
  unregisterMapDevCommands,
} from '@/lib/map/dev/registerMapDevCommands'
import { GravitationalEventManager } from '@/lib/physics/gravitationalEvent'
import { computeShuttleBaseFuelDrain } from '@/lib/shuttleBaseFuelDrain'
import type { ShipHealthConfig } from '@/lib/shipHealth'
import shipHealthData from '@/data/shuttle/ship-health.json'
import { IDLE_RADIATION_STATE, MapShipHealthFacade } from '@/lib/map/health/MapShipHealthFacade'
import {
  getCurrentShuttleThrusterEfficiencyModifiers,
  getCurrentUpgradeValue,
  hasGravitySurfingUnlock,
  hasOrbitalSurfingUnlock,
  getPlayerUpgradeLevelsSnapshot,
  hydratePlayerUpgradeLevelsFromStorage,
  onUpgradeInstalled,
  resetPlayerUpgradesToDefaults,
  setPlayerUpgradeLevel,
  CURRENT_PLAYER_UPGRADE_LEVELS,
  UPGRADE_DEFINITIONS,
  type UpgradeId,
} from '@/lib/upgrades'
import { tryPurchaseNextUpgradeLevel } from '@/lib/upgradePurchase'
import { HabitatState } from '@/lib/habitatState'
import { MapHabitatFacade } from '@/lib/map/habitat/MapHabitatFacade'
import { RESERVE_FUEL_ID } from '@/lib/shop/shopSession'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import type { ShopResult } from '@/lib/shop/types'
import { tickDemandTimer, resetDemand } from '@/lib/shop/planetDemand'
import {
  createProfile,
  getBodyAccess,
  getMissionPayMultiplier,
  isBodyRendered,
  isPlayerNameConfirmed,
  loadProfile,
  markMapIntroSeen,
  markPlayerNameConfirmed,
  saveProfile,
  addCredits,
  recordGravitySurfStart,
  recordManifoldRide,
  recordMissionObjectiveComplete,
  recordPortalDeparture,
  recordSolarBodyFirstOrbit,
  recordSlingshotLaunch,
  recordWorldLineDistance,
  setBodyAccess,
  setLastDockedPlanet,
} from '@/lib/player/profile'
import type { BodyAccessState, PlayerProfile } from '@/lib/player/types'
import {
  hasCompletedJourney,
  WELCOME_JOURNEY_ID,
  ACT_1_CONTRACT_IDS,
  type JourneyTrackerState,
  type JourneyTriggerId,
} from '@/lib/journeys'
import { MapJourneyFacade } from '@/lib/map/journeys/MapJourneyFacade'
import { orbitBodyKeyFromCaptureName } from '@/lib/player/orbitBodyKey'
import { addItem, getStack, consumeItem } from '@/lib/inventory/inventory'
import {
  applyCargoBayLimits as applyCargoBayLimitsHelper,
  createInventoryForCargoBay,
  ensureMinimumStarterFuelCells as ensureMinimumStarterFuelCellsHelper,
  inventoryWithStarterFuelCells as inventoryWithStarterFuelCellsHelper,
} from '@/lib/map/player/playerInventoryHelpers'
import type { Inventory } from '@/lib/inventory/types'
import { clearInventory, loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import '@/lib/shop/tradeGoods'
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  ActiveTurretMiningMission,
  GeneratedAsteroidMission,
} from '@/lib/missions/types'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'
import type { MissionTrackerFocus, MissionTrackerRow } from '@/lib/missions/missionHudRows'
import { ref, type Ref } from 'vue'
import {
  resolveSpecialMissionWaypoint,
  type WorldPositionXZ,
} from '@/lib/missions/specialMissionWaypoint'
import { generateEvaWaypoint } from '@/lib/missions/evaWaypointGenerator'
import {
  clearActiveMission,
  clearCompletedEvaSites,
  clearMissionBoard,
  consumePendingMapReturnWorld,
  loadActiveMission,
  saveActiveMission,
  saveMissionBoard,
} from '@/lib/missions/missionStorage'
import { offerTurretMiningMission } from '@/lib/missions/turretMiningSession'
import '@/lib/missions/missionMaterials'
import { MapIntroFacade } from '@/lib/map/intro/MapIntroFacade'
import { MapLifeCycleFacade } from '@/lib/map/lifecycle/MapLifeCycleFacade'
import { MapMessageFacade } from '@/lib/map/messages/MapMessageFacade'
import { MapMissionFacade } from '@/lib/map/missions/MapMissionFacade'
import type { OrbitalMiniGame, OrbitalMiniGameEvents } from '@/lib/minigame/OrbitalMiniGame'
import { createOrbitalMiniGame } from '@/lib/minigame/orbitalMiniGameFactory'
import { SatelliteRepairController } from '@/three/SatelliteRepairController'
import { SatelliteServicingMiniGame } from '@/lib/minigame/satelliteServicing/SatelliteServicingMiniGame'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import { PLANET_ORBITAL_CONFIGS } from '@/lib/missions/planetOrbitalConfig'
import { MapModeCoordinator } from '@/lib/map/mode/MapModeCoordinator'
import { MapOrbitFacade } from '@/lib/map/orbit/MapOrbitFacade'
import { MapShopFacade } from '@/lib/map/shop/MapShopFacade'
import { MapCosmeticShopFacade } from '@/lib/map/shop/MapCosmeticShopFacade'
import {
  applyOwnedCosmetic,
  purchaseCosmeticOption,
  purchaseShuttleTitle,
} from '@/lib/cosmetics/purchase'
import { sellPremiumTradeGood } from '@/lib/cosmetics/premiumTrade'
import {
  FANTASIA_INTRO_MESSAGE_ID,
  markFantasiaCosmeticIntroIfNeeded,
} from '@/lib/cosmetics/fantasiaIntro'
import type {
  CosmeticPurchaseResult,
  PremiumTradeSession,
  ShuttleTitlePurchaseResult,
} from '@/lib/cosmetics/types'
import {
  TurretSessionController,
  type TurretHudState,
} from '@/lib/map/turret/TurretSessionController'
import { applyBeltCompositionTints } from '@/lib/map/turret/compositionTint'
import { MapPlanetariumScene } from '@/three/MapPlanetariumScene'
import { MapSceneEnvironment } from '@/three/MapSceneEnvironment'
import { MapShuttleEffects } from '@/three/MapShuttleEffects'
import { MapSceneVisuals } from '@/three/MapSceneVisuals'
import {
  MAP_ASTEROID_BELT_TACMAP_LOD_FRAC,
  MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG,
} from '@/lib/map/mapViewControllerConfig'
import {
  computeGravityProximity,
  computeMaxGravityProximity,
  getMapAsteroidBeltLodFraction,
  isEmissiveMaterial,
  makeGravityWell,
  mapWarpStandoffWorldUnits,
} from '@/lib/map/mapViewControllerHelpers'
import { GravitySurfingController } from '@/lib/map/GravitySurfingController'
import {
  OrbitalSurfingController,
  type OrbitalSurfingDeps,
} from '@/lib/map/OrbitalSurfingController'
import { ManifoldSpline } from '@/three/ManifoldSpline'
import { ShuttleAudioDirector } from '@/audio/ShuttleAudioDirector'
import { uiAudio } from '@/audio/UiAudioDirector'
import { shipMessageSystem } from '@/lib/messages/runtime'
import {
  contractSystem,
  onContractAccepted,
  onContractCompleted,
  onContractStepActivated,
} from '@/lib/contracts/runtime'
import type { ContractStoreSnapshot } from '@/lib/contracts/contractTypes'
import type { ContractStepActivatedPayload } from '@/lib/contracts/ContractSystem'
import {
  COMPASS_LABELS,
  computeCompassBearings,
  type CompassTargetInput,
} from '@/lib/map/compass/compassBearings'
import { MapBloomController } from '@/three/MapBloomController'
import { MapOverlayProjector } from '@/lib/map/overlay/MapOverlayProjector'
import { AsteroidImpactSystem } from '@/lib/map/collisions/AsteroidImpactSystem'
import {
  findPlanetCollision,
  type PlanetCollisionSample,
} from '@/lib/map/collisions/planetCollision'
import {
  EVA_MAP_CAMERA_FAR,
  EVA_MAP_HELMET_LIGHT_SCALE,
  EVA_MAP_HUGE_POI_BY_TYPE,
  EVA_MAP_HUGE_SHUTTLE,
  EVA_MAP_HUGE_SUN,
  EVA_MAP_SPAWN_OFFSET_SCALE,
  EVA_POI_PROMPT_BUFFER,
  TURRET_FORCE_CLAMP_OVERSCALE,
} from '@/lib/map/eva/evaMapConstants'
import {
  EVA_MAP_MULTITOOL_FRAME_SYNC_PRIORITY,
  MapEvaMultitoolFacade,
} from '@/lib/map/eva/MapEvaMultitoolFacade'
import type { MapEvaShuttleHullHealTarget } from '@/lib/fps/projectileSystem'
import { applyShuttleBuffs } from '@/lib/shuttle/buffs'

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
  /** Planet indicator labels visible. */
  labelsVisible: boolean
  /** User debris toggle (ambient layers); meshes may still be hidden while orbiting. */
  ambientVisible: boolean
}

/** Boot/preload status for the map-screen loader overlay. */
export interface MapViewBootState {
  phase: 'preparing' | 'ready' | 'started'
  label: string
}

/** Warm yellow used for the Sun tick on the compass strip. */
const COMPASS_SUN_COLOR = '#FFF0B0'

/** Special mission id → offer-message id used for auto-staging. */
const SPECIAL_MISSION_OFFER_IDS: Record<string, string> = {
  'consortium-certification': 'consortium-certification-offer',
  'jovian-prospection-hektor-photometry': 'jovian-prospection-hektor-photometry-offer',
  'jovian-prospection-hektor-dan': 'jovian-prospection-hektor-dan-offer',
  'jovian-prospection-hektor-prospectus': 'jovian-prospection-hektor-prospectus-offer',
  'jovian-prospection-saturn-photometry': 'jovian-prospection-saturn-photometry-offer',
  'jovian-prospection-saturn-dan': 'jovian-prospection-saturn-dan-offer',
}

/** Vertical offset (world units) used when parking the camera on a mission focus target. */
const MISSION_FOCUS_CAMERA_HEIGHT = 15

/** Diagonal offset (world units) along XZ used so the parked camera sees the target at an angle. */
const MISSION_FOCUS_CAMERA_DISTANCE = 15

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
  private debugMetricsTracker: DebugMetricsTracker | null = null
  private inputManager: InputManager | null = null
  private sceneObjects: MapSceneObjects | null = null
  private vehicleCamera: VehicleCamera | null = null
  /** True while the camera is parked on a mission focus target — drives the ESC prompt. */
  public readonly missionFocusActive: Ref<boolean> = ref(false)
  /**
   * Tracker row id of the currently selected mission. Reactive so the panel
   * highlights the matching row; mirrored into {@link MapMissionFacade} so the
   * world-space waypoint marker recolors. Auto-cleared when the row vanishes
   * from the board (mission completed or focus dismissed).
   */
  public readonly selectedMissionRowId: Ref<string | null> = ref(null)
  private introFacade: MapIntroFacade | null = null

  private shuttleController: ShuttleController | null = null
  private shuttleEffects: MapShuttleEffects | null = null
  private evaSession: EvaSession | null = null
  private currentEvaPrompt: string | null = null
  /** Owns the UnrealBloomPass tweaks for EVA override, inspect swaps, and orbit clamp. */
  private readonly bloomController = new MapBloomController()
  onEvaTelemetry: ((telemetry: FpsTelemetry) => void) | null = null
  /** Short map toast (e.g. hull fully repaired) during map EVA. */
  onEvaToast: ((message: string) => void) | null = null
  onEvaModeChange: ((active: boolean) => void) | null = null
  /**
   * Fired when the EVA player opens a terminal minigame overlay. Payload is the active
   * mission + the minigame instance the UI binds to. `null` means "close the overlay".
   */
  onEvaMinigameChange:
    | ((
        payload: {
          mission: ActiveVisitRelayMission
          minigame: OrbitalMiniGame
        } | null,
      ) => void)
    | null = null
  private activeEvaMinigame: OrbitalMiniGame | null = null
  /** In-scene controller for the currently-active satellite servicing minigame, if any. */
  private satelliteRepairController: SatelliteRepairController | null = null
  /** Current in-scene minigame prompt text, piped to EvaSession via `getInSceneMinigamePrompt`. */
  private currentAimPrompt: string | null = null
  /**
   * POI prompt range cached at EVA session start (after huge-scale has been applied).
   * Fed to {@link EvaSession} via `getPoiPromptRange`. Null outside EVA or when there
   * is no active POI. See {@link buildEvaColliders} for how it is computed.
   */
  private evaPoiPromptRange: number | null = null
  /** Map EVA science multitool + projectiles; see {@link MapEvaMultitoolFacade}. */
  private readonly evaMapMultitoolFacade = new MapEvaMultitoolFacade()
  /**
   * Shuttle hull world-space AABB cached at EVA session start. Fed to
   * {@link EvaSession} via `getVehicleReturnBounds` so the "Return to Shuttle [V]"
   * prompt wraps the visible hull (not the group origin, which may not sit at the
   * cargo bay). Null outside EVA.
   */
  private evaVehicleReturnBounds: { min: THREE.Vector3; max: THREE.Vector3 } | null = null
  /**
   * Stable delegate for map EVA science bolts: reads {@link evaVehicleReturnBounds} and
   * {@link MapShipHealthFacade} state each time the multitool's projectile system queries it.
   */
  private readonly evaMapHullHealTarget: MapEvaShuttleHullHealTarget = {
    isHullFull: () => {
      const s = this.shipHealth
      return !s || s.hp >= s.maxHp
    },
    getHullAabb: () => this.evaVehicleReturnBounds,
    onHealFromBolt: (amount) => {
      const h = this.shipHealth
      const s = this.shuttleController
      if (!h || !s) {
        return { becameFull: false }
      }
      const { applied, becameFull } = h.applyHullHeal(amount)
      if (applied > 0) {
        s.pulseHullHealFeedback()
        this.flushShuttleHullToProfile()
      }
      if (becameFull) {
        this.onEvaToast?.('Hull fully repaired')
      }
      return { becameFull }
    },
  }
  private planetariumScene: MapPlanetariumScene | null = null
  private sunController: SunController | null = null
  private planetControllers: PlanetSystemController[] = []
  private renderedSolarBodies: readonly Planet[] = PLANETS
  private beltControllers: AsteroidBeltController[] = []
  private spaceTimeGrid: SpaceTimeGrid | null = null
  /** Transient spacetime “depressions” that drift across the sheet near the shuttle. */
  private gravitationalEventManager: GravitationalEventManager | null = null
  /** World width/depth of the map space-time grid (passed to {@link SpaceTimeGrid}). */
  private mapGridSize = 0
  private simTime = 0
  private resizeHandler: (() => void) | null = null

  private orbitFacade = new MapOrbitFacade()
  /** Prior frame orbit FSM state — detects `→ orbiting` edges for first-orbit achievements. */
  private previousOrbitCaptureState: OrbitCaptureState = 'free'
  private lifeCycleFacade = new MapLifeCycleFacade()
  private modeCoordinator = new MapModeCoordinator()
  private yRecovery = false
  private inspectMode = false
  /** Pre-tac-map visibility of the space-time grid mesh, restored on map close. */
  private spaceTimeGridVisibleBeforeTacMap: boolean | null = null
  private habitatState = new HabitatState()
  private readonly habitatFacade = new MapHabitatFacade()
  private turretSessionController: TurretSessionController | null = null
  private shopFacade = new MapShopFacade()
  private cosmeticShopFacade = new MapCosmeticShopFacade()
  private pendingModuleInstallTimer: TimerHandle | null = null
  private missionFacade = new MapMissionFacade()
  /**
   * Set in {@link init} from {@link loadProfile} or {@link createProfile}.
   * Starting placeholder matches fresh profile credits until init runs.
   */
  private playerProfile: PlayerProfile = createProfile('Pilot')
  private playerInventory: Inventory = createInventoryForCargoBay(
    getCurrentUpgradeValue('shuttleCargoBay'),
  )
  private portalArrival: PortalArrivalSequence | null = null
  private sceneEnvironment: MapSceneEnvironment | null = null
  private gravityPass: ShaderPass | null = null
  private gravitySurfPass: ShaderPass | null = null
  private slingshotSpeedPass: ShaderPass | null = null
  private adriftTimer = 0
  /** Facade owning the {@link ShipHealth} instance, HP persist timer, and pagehide hook. */
  private readonly healthFacade = new MapShipHealthFacade()

  private get shipHealth() {
    return this.healthFacade.shipHealth
  }

  private get shipHealthConfig(): ShipHealthConfig | null {
    return this.healthFacade.config
  }
  private mapState = new MapState()
  private mapIntro = new MapIntroState()
  /** When true, {@link tickOrrery} skips simTime advancement and planet/belt ticks. Set during portal arrival so Earth stays static. */
  private simFrozen = false
  /** Turret mining freeze gate so the entire solar-system sim pauses while the player is in turret mode. */
  private turretSimFrozen = false

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
  private readonly overlayProjector = new MapOverlayProjector()
  private currentRunWorldLineDistance = 0
  private messageFacade = new MapMessageFacade()

  /** Whether planet orbit lines are currently visible. */
  private orbitsVisible = true

  /** Whether the space-time fabric grid is currently visible (default off until Gravity Surfing). */
  private gridVisible = false

  /** Whether planet indicator labels are visible (user toggle + suppressed during intro/map overlay). */
  private labelsVisible = true

  /** Saved layer toggles while the opening intro suppresses orbit lines / fabric / debris. */
  private introLayerRestore: MapViewLayerToggleState | null = null

  /** Saved layer toggles while EVA forces orbit lines / fabric / labels off (ambient debris unchanged). */
  private evaLayerRestore: MapViewLayerToggleState | null = null

  /**
   * Saved EVA fps camera far plane while EVA temporarily widens it to keep the map's
   * 40k-radius starfield visible. Restored on EVA exit.
   */
  private evaCameraFarRestore: number | null = null

  /** Current shuttle display scale, lerped each frame toward the screen-size target. */
  private currentShuttleScale: number = MAP_CONFIG.MAP_SHUTTLE_SCALE

  /** Gravity Surfing rail locomotion controller. */
  private gravitySurfingController = new GravitySurfingController()

  /** Orbital Surfing manifold highway controller. */
  private orbitalSurfingController = new OrbitalSurfingController()

  /** Manifold spline visual for orbital surfing. */
  private manifoldSpline: ManifoldSpline | null = null

  /**
   * Single owner for shuttle gameplay audio: map / habitat ambient
   * beds, gravitational anomaly proximity loop, slingshot charge +
   * release stings, manifold (wormhole) tunnel loop, cargo door
   * one-shots, mission-clear sting, and the destroyed-shuttle sweep.
   * Replaces the scattered `useAudio().play(...)` / `stopSound(...)`
   * calls and the `manifoldWormholeHandle` field this controller used
   * to thread through orbital surf callbacks.
   */
  private readonly shuttleAudio = new ShuttleAudioDirector()

  /** Increments per anomaly HUD message so Vue can re-run enter animation. */
  private gravitationalAnomalyHudToken = 0
  private sceneVisuals: MapSceneVisuals | null = null
  private unsubscribeJourneyMessageArchive: (() => void) | null = null
  private unsubscribeContractCompleted: (() => void) | null = null
  private unsubscribeContractAccepted: (() => void) | null = null
  private unsubscribeUpgradeInstalled: (() => void) | null = null
  private unsubscribeContractStepActivated: (() => void) | null = null
  /**
   * Journey UI coordinator — owns arming state, the completion→begin interlude timer,
   * and the profile write that follows each trigger.
   */
  private readonly journeyFacade = new MapJourneyFacade()

  /** World-space shuttle position reused for asteroid belt nearby tumble (avoid per-frame alloc). */
  private readonly _beltShuttleWorldScratch = new THREE.Vector3()
  /** Cooldown-tracking impact system reused across every frame (stateful). */
  private readonly asteroidImpactSystem = new AsteroidImpactSystem()
  private experienceStarted = false

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

  /** Called while the scene is preparing, and again when the PLAY gate can open. */
  onBootState: ((state: MapViewBootState) => void) | null = null

  /** Called each frame with full shuttle telemetry for HUD display. */
  onTelemetry: ((telemetry: ShuttleTelemetry) => void) | null = null

  /** Called each frame with orbit-capture HUD state. */
  onOrbitState: ((state: OrbitHudState) => void) | null = null

  /** Called each frame with gravity warning state for HUD. */
  onGravityWarning: ((state: GravityWarningState) => void) | null = null

  /**
   * Called each frame with the resolved radiation exposure state. Drives the
   * top-of-screen banner and the geiger-counter audio loop. Always invoked
   * (even when zone is `0`) so the HUD can clear stale visible state when the
   * ship leaves a band.
   */
  onRadiationWarning: ((state: RadiationWarningState) => void) | null = null

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
  /** Fired with fade opacity (0 = clear, 1 = black) during turret-mode transitions. */
  onTurretFade: ((opacity: number) => void) | null = null
  /** Fired per-frame with turret HUD state (phase + reticle validity). */
  onTurretHudState: ((state: TurretHudState) => void) | null = null
  /** Fired when a resource is picked up (e.g. turret mining commits a unit). */
  onResourcePickup: ((itemId: string, quantity: number, label: string) => void) | null = null
  /** Fired when a resource pickup fails (e.g. inventory full). */
  onResourcePickupFailed: ((label: string, reason: string) => void) | null = null
  /** Fired when the current active journey tracker changes. */
  onJourneyTracker: ((state: JourneyTrackerState | null) => void) | null = null
  /** Fired when the shop button should show/hide. */
  onShopButton: ((visible: boolean, planetName: string) => void) | null = null
  /** Fired when the shop dialog state changes. */
  onShopState:
    | ((session: ShopSession | null, profile: PlayerProfile, inventory: Inventory) => void)
    | null = null
  /** Orbital magenta `Pimp My Shuttle!` button visibility while docked over eligible worlds. */
  onCosmeticShopButton: ((visible: boolean, planetName: string) => void) | null = null
  /**
   * When non-null premium session accompanies an open magenta dialog; callers mirror yellow shop HUD sync.
   */
  onCosmeticShopState:
    | ((session: PremiumTradeSession | null, profile: PlayerProfile, inventory: Inventory) => void)
    | null = null
  /**
   * While orbiting a planet with port services, the player used the Engineering Bay
   * shortcut (default U). Vue should open the shuttle terminal on the upgrades screen.
   */
  onOrbitOpenEngineeringBay: (() => void) | null = null
  /**
   * While orbiting a planet with port services, the player used the Mission Board
   * shortcut (default J). Vue should open the shuttle terminal on the missions program.
   */
  onOrbitOpenMissionBoard: (() => void) | null = null
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
  /** Fired when a journey just completed so the map can show the amber completion banner. */
  onJourneyCompletedAnnouncement:
    | ((eyebrow: string, title: string, metaText: string) => void)
    | null = null
  /** Fired when a new journey is being introduced so the map can show the amber "begins" banner. */
  onJourneyStartedAnnouncement:
    | ((eyebrow: string, title: string, metaText: string) => void)
    | null = null
  /** Fired to gate the objective tracker HUD on/off during intro + between-journey interludes. */
  onJourneyTrackerVisible: ((visible: boolean) => void) | null = null
  /** Fired when fuel cell count changes (for HUD refuel button). */
  onFuelCellCount: ((count: number) => void) | null = null

  /**
   * Callback fired when the player should see the Jovian epilogue video. Set
   * by `MapView.vue` to mount `JovianEpilogueOverlay` after a 5-second delay.
   * `null` until wired by the Vue owner.
   */
  onJovianEpilogueDue: (() => void) | null = null

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

  /** The currently active orbital minigame (if any). Exposed so the overlay can call `complete()`. */
  get activeMinigame(): OrbitalMiniGame | null {
    return this.missionFacade.activeMinigame
  }

  /**
   * Layers `ambient.shuttleMission` (`shuttle.mp3`) during canvas orbital minigames.
   *
   * @param active - True while the mission overlay shows a canvas minigame.
   */
  setShuttleMissionMinigameBed(active: boolean): void {
    this.shuttleAudio.notifyShuttleMissionBed(active)
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

  /** Called when a turret mining mission is delivered. Vue shows a toast. */
  onMiningMissionDeliver:
    | ((mission: ActiveTurretMiningMission, creditsEarned: number) => void)
    | null = null

  /** Called after controller-side persisted progress changes outside Vue handlers. */
  onPersistentProgressUpdate: (() => void) | null = null

  /**
   * Called when an EVA (visit-relay) mission is completed at the in-EVA terminal.
   * Reward is paid in the same call. Vue uses this to show a toast notification and
   * refresh persistent progress (credits, etc.).
   */
  onEvaMissionComplete: ((mission: ActiveVisitRelayMission) => void) | null = null

  /** Called when the player begins an asteroid mission (E at waypoint). */
  onBeginAsteroidMission: ((mission: GeneratedAsteroidMission) => void) | null = null

  /**
   * Called after a portal arrival docks to Earth orbit. Vue should show the
   * {@link PortalWelcomeDialog} at this point. The player's choice is forwarded
   * back via {@link portalWatchIntro} or {@link portalSkipIntro}.
   */
  onPortalWelcome: (() => void) | null = null

  /** True if the current session was entered via a Vibe Jam portal URL. */
  get isPortalArrival(): boolean {
    return this.portalArrival?.isArrival ?? false
  }

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
    this.emitBootState('preparing', 'Loading')

    // Create canvas
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)

    // --- Input ---
    this.inputManager = new InputManager(DEFAULT_BINDINGS)
    hydratePlayerUpgradeLevelsFromStorage()
    this.journeyFacade.attach({
      getProfile: () => this.playerProfile,
      setProfile: (profile) => {
        this.playerProfile = profile
      },
      persistProfile: () => this.persistPlayerProfile(),
      setTutorialMessagesUnlocked: (unlocked) =>
        this.messageFacade.setTutorialMessagesUnlocked(unlocked),
      callbacks: {
        onJourneyTracker: (state) => this.onJourneyTracker?.(state),
        onJourneyTrackerVisible: (visible) => this.onJourneyTrackerVisible?.(visible),
        onJourneyCompletedAnnouncement: (eyebrow, title, meta) =>
          this.onJourneyCompletedAnnouncement?.(eyebrow, title, meta),
        onJourneyStartedAnnouncement: (eyebrow, title, meta) =>
          this.onJourneyStartedAnnouncement?.(eyebrow, title, meta),
      },
    })
    this.unsubscribeJourneyMessageArchive?.()
    this.unsubscribeJourneyMessageArchive = shipMessageSystem.onMessageArchived((messageId) => {
      this.notifyJourneyTrigger(`message_archived:${messageId}`)
    })
    this.unsubscribeContractCompleted?.()
    this.unsubscribeContractCompleted = onContractCompleted((contractId) => {
      this.notifyJourneyTrigger(`contract_completed:${contractId}`)
      this.maybeStageAct1Climax()
    })
    this.unsubscribeContractAccepted?.()
    this.unsubscribeContractAccepted = onContractAccepted((contractId) => {
      this.notifyJourneyTrigger(`contract_accepted:${contractId}`)
    })
    this.unsubscribeUpgradeInstalled?.()
    this.unsubscribeUpgradeInstalled = onUpgradeInstalled((upgradeId) => {
      this.notifyJourneyTrigger(`upgrade_installed:${upgradeId}`)
    })
    this.unsubscribeContractStepActivated?.()
    this.unsubscribeContractStepActivated = onContractStepActivated((payload) =>
      this.handleContractStepActivated(payload),
    )
    this.messageFacade.setTutorialMessagesUnlocked(
      hasCompletedJourney(this.playerProfile, WELCOME_JOURNEY_ID),
    )
    const storedProfile = typeof localStorage === 'undefined' ? null : loadProfile()
    if (storedProfile) {
      this.playerProfile = storedProfile
      // Migration: legacy saves predate the name-confirmed flag. Treat any non-default
      // name as already confirmed so returning players don't get re-prompted.
      if (!isPlayerNameConfirmed() && storedProfile.name && storedProfile.name !== 'Pilot') {
        markPlayerNameConfirmed()
      }
    } else {
      // No saved profile — check for portal arrival to seed the player name.
      // If ?portal=true&username=Racer is present, use "Racer" and treat the name as
      // confirmed; otherwise the placeholder 'Pilot' is overwritten when the player
      // submits their callsign (gated by {@link isPlayerNameConfirmed} in MapView).
      const portalParams = new VibePortal()
      const portalName = portalParams.arrival.username?.trim() ?? ''
      this.playerProfile = createProfile(portalName.length > 0 ? portalName : 'Pilot')
      if (portalName.length > 0) markPlayerNameConfirmed()
      resetPlayerUpgradesToDefaults()
      clearInventory()
      clearMissionBoard()
      clearActiveMission()
      clearCompletedEvaSites()
    }
    const emptyHold = this.createInventoryForCurrentCargoBayLevel()
    const savedInventory = typeof localStorage === 'undefined' ? null : loadInventory()
    this.playerInventory = savedInventory
      ? this.ensureMinimumStarterFuelCells(this.applyCargoBayLimits(savedInventory))
      : this.inventoryWithStarterFuelCells(emptyHold)
    this.persistPlayerProfile()
    this.emitFuelCellCount()
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)
    this.emitBootState('preparing', 'Loading')

    // --- Camera / planetarium scene ---
    this.vehicleCamera = new VehicleCamera(MAP_CAMERA_CONFIG, canvas)
    this.vehicleCamera.setShipYawCouplingSmoothing(MAP_CONFIG.MAP_SHIP_YAW_CAMERA_SMOOTH_TAU_SEC)
    this.planetariumScene = new MapPlanetariumScene()
    this.renderedSolarBodies = this.getRenderedSolarBodies()
    const planetarium = await this.planetariumScene.initialize(
      canvas,
      this.vehicleCamera.camera,
      this.renderedSolarBodies,
    )
    this.emitBootState('preparing', 'Loading')
    this.sceneObjects = planetarium.sceneObjects
    this.bloomController.setHost({
      composer: this.sceneObjects.composer,
      cameraLight: this.sceneObjects.cameraLight,
    })
    this.sceneVisuals = new MapSceneVisuals(this.sceneObjects)
    this.sunController = planetarium.sunController
    this.planetControllers = planetarium.planetControllers
    this.beltControllers = planetarium.beltControllers
    // Tint every belt instance by its primary mineral so the player can read
    // composition on approach. Deterministic per (belt, mesh, instance) so the
    // tint the player sees matches the mineral the turret later rolls out.
    applyBeltCompositionTints(this.beltControllers)
    this.spaceTimeGrid = planetarium.spaceTimeGrid
    this.gravityPass = planetarium.gravityPass
    this.gravitySurfPass = planetarium.gravitySurfPass
    this.slingshotSpeedPass = planetarium.slingshotSpeedPass
    this.mapGridSize = planetarium.mapGridSize
    const { scene } = this.sceneObjects

    this.introFacade = new MapIntroFacade(scene, canvas.clientWidth / canvas.clientHeight)

    // --- Map overlay camera (ortho, created once, used when M pressed) ---
    this.mapCamera = new MapCamera()
    scene.add(this.mapCamera.camera)

    this.tickHandler.register(this.vehicleCamera, MAP_CONFIG.TICK_PRIORITY_COMPOSIT - 1)

    // Habitat facade — owns the interior scene, pointer-lock session, and scene-swap tick.
    this.habitatFacade.attach({
      getSceneObjects: () => this.sceneObjects,
      getVehicleCamera: () => this.vehicleCamera,
      getShuttleEffects: () => this.shuttleEffects,
      getShuttleController: () => this.shuttleController,
      getInspectMode: () => this.inspectMode,
      setInspectMode: (value) => {
        this.inspectMode = value
      },
      shuttleAudio: this.shuttleAudio,
      modeCoordinator: this.modeCoordinator,
      armJourneyUiFromHabitatEntry: () => this.armJourneyUiFromHabitatEntry(),
      setEarthStartupOrbitHudSuppressed: (suppressed) =>
        this.setEarthStartupOrbitHudSuppressed(suppressed),
      notifyJourneyTrigger: (trigger) => this.notifyJourneyTrigger(trigger),
      callbacks: {
        onHabitatActive: (active) => this.onHabitatActive?.(active),
        onShuttleControl: (visible) => this.onShuttleControl?.(visible),
        onHabitatPrompt: (prompt) => this.onHabitatPrompt?.(prompt),
      },
    })

    this.evaMapMultitoolFacade.attach({
      getEvaSession: () => this.evaSession,
      getSceneObjects: () => this.sceneObjects,
      getTickHandler: () => this.tickHandler,
      getMultitoolDamageMultiplier: () => getCurrentUpgradeValue('multitoolDamage'),
      getEvaMapHullHealTarget: () => this.evaMapHullHealTarget,
    })

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
        this.shuttleAudio.notifyAnomalyProximityStart()
      },
      onNearbyAnomalyFinish: () => {
        this.gravitationalAnomalyHudToken += 1
        this.onGravitationalAnomalyHud?.({
          visible: true,
          token: this.gravitationalAnomalyHudToken,
          title: 'Disturbance passed',
          subtitle: 'Local grid stabilizing',
        })
        this.shuttleAudio.notifyAnomalyProximityEnd()
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
      this.triggerDeath('Consumed By The Sun')
    }

    // Route cargo door audio through the single shuttle-audio owner so
    // ShuttleController stays free of direct Howler references.
    this.shuttleController.onDoorsToggled = (open) => {
      this.shuttleAudio.notifyCargoDoorsToggled(open)
    }

    // Ship health — temperature + radiation damage. The facade builds the world-scaled
    // config, wires the throttled HP persist, and installs the `pagehide` flush.
    this.healthFacade.initialize({
      rawData: shipHealthData as ShipHealthConfig,
      hullMultiplier: getCurrentUpgradeValue('shuttleHull'),
      hullBuffMultiplier: applyShuttleBuffs(this.playerProfile, 1, 'hull'),
      orbitScale: ORBIT_SCALE,
      savedHp: this.playerProfile.shuttleHullHp,
      onDeath: (cause) => this.triggerDeath(cause),
      onPersistDue: () => this.flushShuttleHullToProfile(),
    })

    this.emitBootState('preparing', 'Loading')
    await this.shuttleController.load()
    this.shuttleController.group.scale.setScalar(MAP_CONFIG.MAP_SHUTTLE_SCALE)
    this.sceneVisuals?.attachShuttle(this.shuttleController.group)
    const earthController = this.getPlanetControllerById('earth')

    this.spawnShuttleAtLastDockedPlanet()

    // Render shuttle after Sun corona so opaque shuttle pixels overwrite additive glow
    this.shuttleController.group.traverse((child) => {
      child.renderOrder = 10
    })
    scene.add(this.shuttleController.group)
    this.missionFocusActive.value = false
    this.vehicleCamera.setTarget(this.shuttleController.group)
    this.tickHandler.register(this.shuttleController, TICK_PRIORITY_PHYSICS)

    this.shuttleEffects = new MapShuttleEffects(this.sceneObjects, this.shuttleController)
    this.shuttleEffects.applyShuttleThrusterTrailFromProfile(this.playerProfile)
    for (const tickable of this.shuttleEffects.getTickables()) {
      this.tickHandler.register(tickable, TICK_PRIORITY_ANIMATION)
    }

    // --- Gravity surf coupling tether visuals ---
    this.gravitySurfingController.onCouplingStart = () => {
      this.playerProfile = recordGravitySurfStart(this.playerProfile)
      this.persistPlayerProfileAndSyncProgress()
      this.sceneVisuals?.showSurfCouplingTether()
    }
    this.gravitySurfingController.onCouplingProgress = (shipPos, railPos, progress, dt) => {
      this.sceneVisuals?.updateSurfCouplingTether(shipPos, railPos, progress, dt)
    }
    this.gravitySurfingController.onCouplingEnd = () => {
      this.sceneVisuals?.hideSurfCouplingTether()
    }

    // --- Orbital surfing manifold highway ---
    this.manifoldSpline = new ManifoldSpline()
    this.sceneObjects.scene.add(this.manifoldSpline.group)

    this.orbitalSurfingController.onCouplingStart = (arcPoints) => {
      this.manifoldSpline?.show(arcPoints, -MAP_CONFIG.ORBITAL_SURF_TUNNEL_DEPTH)
      this.sceneVisuals?.showSurfCouplingTether()
      this.shuttleAudio.notifyManifoldCouplingStart()
    }
    this.orbitalSurfingController.onCouplingProgress = (shipPos, orbitPos, progress, dt) => {
      this.sceneVisuals?.updateSurfCouplingTether(shipPos, orbitPos, progress, dt)
    }
    this.orbitalSurfingController.onCouplingEnd = () => {
      this.sceneVisuals?.hideSurfCouplingTether()
    }
    this.orbitalSurfingController.onDiveStart = (travelTimeSec) => {
      // Stretch the wormhole clip across the full ride (coupling + dive)
      // so it doesn't loop or end early during the surf.
      this.shuttleAudio.notifyManifoldDiveStarted(
        travelTimeSec,
        MAP_CONFIG.ORBITAL_SURF_COUPLE_DURATION_SEC,
      )
      // Freeze simulation so planets stop moving while in the manifold tunnel
      this.simFrozen = true
      // Hide asteroid belts during the dive
      for (const belt of this.beltControllers) {
        belt.group.visible = false
      }
      // Dark-sector bubble around the shuttle
      this.shuttleEffects?.setManifoldSurfing(true)
    }
    this.orbitalSurfingController.onSurfEnd = () => {
      this.manifoldSpline?.hide()
      this.shuttleEffects?.setManifoldSurfing(false)
      this.shuttleAudio.notifyManifoldSurfEnd()
      // Restore simulation and belt visibility
      this.simFrozen = false
      for (const belt of this.beltControllers) {
        belt.group.visible = true
      }
    }
    this.orbitalSurfingController.onComplete = (planetIndex) => {
      const controller = this.planetControllers[planetIndex]
      if (!controller || !this.shuttleController) return

      this.playerProfile = recordManifoldRide(this.playerProfile)
      this.persistPlayerProfileAndSyncProgress()
      this.notifyJourneyTrigger('orbital_surf_completed')

      // Position the shuttle near the planet so normal E-key capture can engage
      const bx = controller.getWorldX()
      const bz = controller.getWorldZ()

      // Try forced orbit first
      const orbitSystem = this.orbitFacade.system
      if (orbitSystem && orbitSystem.state === 'free') {
        this.orbitFacade.beginForcedOrbit(bx, bz, {
          shuttleController: this.shuttleController,
          vehicleCamera: this.vehicleCamera,
          sceneVisuals: this.sceneVisuals,
        })

        // Verify it actually engaged — if not, fall back to positioning near planet
        if ((orbitSystem.state as string) !== 'orbiting') {
          console.warn('[OrbitalSurf] beginForcedOrbit did not engage, falling back')
          this.shuttleController.group.position.set(bx + 5, 0, bz)
          this.shuttleController.unfreeze()
          this.shuttleController.setInputEnabled(true)
        }
      } else {
        // Orbit system busy — just drop the shuttle near the planet
        this.shuttleController.group.position.set(bx + 5, 0, bz)
        this.shuttleController.unfreeze()
        this.shuttleController.setInputEnabled(true)
      }
    }

    // --- Orbit capture system ---
    const earthOrbit =
      PLANETS.find((planet) => planet.id === MAP_CONFIG.EARTH_PLANET_ID)?.orbit ?? PLANETS[0]!.orbit
    const captureBodies = [
      {
        id: SUN.id,
        name: SUN.name,
        displayRadius: SUN.displayRadius,
        captureRadiusOverride: MAP_CONFIG.SUN_BUMP_ORBIT_RADIUS,
        orbitRadiusOverride: MAP_CONFIG.SUN_BUMP_ORBIT_RADIUS,
        captureRadiusMultiplier: MAP_CONFIG.SUN_CAPTURE_RADIUS_MULTIPLIER,
        orbitalSpeedMultiplier: MAP_CONFIG.SUN_ORBIT_SPEED_MULTIPLIER,
        getWorldX: () => this.sunController!.getWorldX(),
        getWorldY: () => this.sunController!.group.position.y,
        getWorldZ: () => this.sunController!.getWorldZ(),
      },
      ...this.renderedSolarBodies.map((planet, i) => ({
        id: planet.id,
        name: planet.name,
        displayRadius: planet.displayRadius,
        orbitalSpeedMultiplier:
          MAP_CONFIG.SLINGSHOT_SPEED_OVERRIDES[planet.id] ??
          computeRelativeOrbitalSpeedMultiplier(planet.orbit, earthOrbit),
        getWorldX: () => this.planetControllers[i]!.getWorldX(),
        getWorldY: () => this.planetControllers[i]!.getWorldY(),
        getWorldZ: () => this.planetControllers[i]!.getWorldZ(),
      })),
    ]
    this.orbitFacade.initialize(captureBodies)
    this.orbitFacade.setSlingshotBuffMultiplier(
      applyShuttleBuffs(this.playerProfile, 1, 'slingshot'),
    )

    // Portal arrival, completed-mission return at waypoint, or default saved orbit
    this.portalArrival = new PortalArrivalSequence()

    // Freeze the orrery now so Earth stays at its current position during the portal animation.
    if (this.portalArrival.isArrival && earthController) {
      this.simFrozen = true
      const ex = earthController.getWorldX()
      const ez = earthController.getWorldZ()
      const wy = MAP_CONFIG.PORTAL_ARRIVAL_WORMHOLE_Y

      // ── Static cinematic camera ─────────────────────────────────────────
      // Use MAP_PORTAL_CINEMATIC_CAMERA_CONFIG (no maxDistance) so OrbitControls
      // does NOT clamp the parked camera into the wormhole. Camera sits to the
      // side framing both Earth (y=0) and the wormhole (y=wy) in one shot.
      if (this.vehicleCamera) {
        this.vehicleCamera.setConfig(MAP_PORTAL_CINEMATIC_CAMERA_CONFIG)
        // Look at the exact midpoint between Earth (y=0) and the portal (y=wy).
        // Camera is offset to the side and slightly above the midpoint so both
        // bodies sit comfortably inside the frame.
        const mid = wy * 0.5
        this.missionFocusActive.value = false
        this.vehicleCamera.parkAt(
          new THREE.Vector3(ex + wy * 1.8, mid, ez + wy * 1.2),
          new THREE.Vector3(ex, mid, ez),
        )
      }

      // ── Descent callback: eject pulse fired → camera follows ship down ──
      this.portalArrival.onDescentStart = () => {
        if (!this.shuttleController || !this.vehicleCamera) return
        // Reveal ship as it exits the portal
        this.shuttleController.group.visible = true
        this.vehicleCamera.setConfig(MAP_PORTAL_ARRIVAL_CAMERA_CONFIG)
        this.missionFocusActive.value = false
        this.vehicleCamera.setTarget(this.shuttleController.group)
      }

      // ── Complete callback: ship docked → resume sim + orbit + welcome ───
      this.portalArrival.onComplete = () => {
        this.simFrozen = false
        if (!this.shuttleController) return
        this.orbitFacade.beginForcedOrbit(ex, ez, {
          shuttleController: this.shuttleController,
          vehicleCamera: this.vehicleCamera,
          sceneVisuals: this.sceneVisuals,
        })
        this.onPortalWelcome?.()
      }
    }

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
      earthController
        ? {
            // Offset XZ by SPAWN_OFFSET_BEHIND_EARTH so the ship descends
            // beside Earth rather than straight through the planet mesh.
            anchorPos: new THREE.Vector3(
              earthController.getWorldX(),
              MAP_CONFIG.PORTAL_ARRIVAL_WORMHOLE_Y,
              earthController.getWorldZ(),
            ),
            radius: MAP_CONFIG.PORTAL_WORMHOLE_RADIUS,
            // Caller drives the cinematic timing: Earth alone → portal → ship
            manualEject: true,
          }
        : undefined,
    )

    // Cinematic timer: drives the 3-phase portal arrival sequence so each
    // beat has enough screen time before the next phase begins.
    //   Phase 0 (PORTAL_EARTH_HOLD_DURATION s): Earth alone, wormhole hidden
    //   Phase 1 (PORTAL_WORMHOLE_VIEW_DURATION s): wormhole revealed, ship hidden
    //   Phase 2: eject() called → summon pulse → onDescentStart → descent
    if (arrived) {
      // Ship and wormhole start hidden — revealed phase by phase
      this.shuttleController.group.visible = false
      const portalArrival = this.portalArrival!
      portalArrival.setWormholeVisible(false)

      let phaseTimer = 0
      let phaseIndex = 0

      const cinematicTimerTickable: Tickable = {
        tickDebugLabel: 'MapPortalIntroTimer',
        tick: (dt: number) => {
          phaseTimer += dt
          if (phaseIndex === 0 && phaseTimer >= MAP_CONFIG.PORTAL_EARTH_HOLD_DURATION) {
            // Reveal the wormhole — players see it open above Earth
            portalArrival.setWormholeVisible(true)
            phaseTimer = 0
            phaseIndex = 1
          } else if (phaseIndex === 1 && phaseTimer >= MAP_CONFIG.PORTAL_WORMHOLE_VIEW_DURATION) {
            // Begin eject sequence — ship will emerge and descend
            portalArrival.eject()
            this.tickHandler!.unregister(cinematicTimerTickable)
          }
        },
      }
      this.tickHandler.register(cinematicTimerTickable, TICK_PRIORITY_ANIMATION)
    }
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
    const initialOrbitController = this.getRespawnPlanetController()
    if (!arrived && initialOrbitController && !usedMissionCompletionMapSpawn) {
      const ex = initialOrbitController.getWorldX()
      const ez = initialOrbitController.getWorldZ()
      this.orbitFacade.beginForcedOrbit(ex, ez, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
      })

      if (this.playerProfile.hasSeenIntro || initialOrbitController !== earthController) {
        this.mapIntro.skip()
        this.emitIntroUiState()
      } else {
        this.messageFacade.notifyMapStartEarthOrbit(this.onMessageUpdate)
        this.beginStartupIntro()
      }
    } else if (!usedMissionCompletionMapSpawn) {
      // Portal arrival — intro decision is deferred to the welcome dialog (onPortalWelcome).
      // Keep controls locked (mapIntro stays in 'inactive') until the player chooses.
      // Non-portal arrivals that somehow land here just skip normally (shouldn't happen).
      if (!arrived) {
        this.mapIntro.skip()
        this.emitIntroUiState()
      }
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
      this.playerProfile = recordPortalDeparture(this.playerProfile)
      this.persistPlayerProfileAndSyncProgress()
      new VibePortal().depart(state as Record<string, string | number>)
    }

    // One-shot action bridge (doors toggle, telemetry)
    this.tickHandler.register(this, MAP_CONFIG.ONE_SHOT_PRIORITY)

    // EVA session — same portable orchestrator as the shuttle scene, but routed through
    // the map's EffectComposer-based render pipeline.
    this.evaSession = this.createEvaSession()
    if (this.evaSession) {
      this.tickHandler.register(this.evaSession, MAP_CONFIG.ONE_SHOT_PRIORITY + 1)
    }
    this.tickHandler.register(
      this.evaMapMultitoolFacade.frameSync,
      EVA_MAP_MULTITOOL_FRAME_SYNC_PRIORITY,
    )

    // --- Register orrery animation tick ---
    const orreryTickable: Tickable = {
      tickDebugLabel: 'MapOrrery',
      tick: (dt: number) => this.tickOrrery(dt),
    }
    this.tickHandler.register(orreryTickable, TICK_PRIORITY_ANIMATION)

    // --- Compositor: renders via EffectComposer ---
    const compositorTickable: Tickable = {
      tickDebugLabel: 'MapCompositorRender',
      tick: () => {
        // Intro / startup camera must sync after orrery (animation) and VehicleCamera tick, or the
        // render camera lags planets by a frame and Earth appears to twitch (angle jitter).
        this.tickStartupIntroCamera()
        this.sceneObjects!.composer.render()
      },
    }
    this.tickHandler.register(compositorTickable, MAP_CONFIG.TICK_PRIORITY_COMPOSIT)

    // Debug HUD instrumentation. Sits at RENDER + 1 so renderer.info reflects
    // the frame that was just submitted by the EffectComposer.
    if (isDebugHudEnabled()) {
      this.debugMetricsTracker = new DebugMetricsTracker({
        renderer: this.sceneObjects.renderer,
        tickHandler: this.tickHandler,
        getEnemyCount: () => 0,
        getProjectileCount: () => 0,
      })
      this.tickHandler.register(this.debugMetricsTracker, TICK_PRIORITY_RENDER + 1)
    }

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
    registerMapDevCommands({
      skipIntro: () => this.skipIntro(),
      getEvaSession: () => this.evaSession,
      getShuttleController: () => this.shuttleController,
      getSunController: () => this.sunController,
      getGravitationalEventManager: () => this.gravitationalEventManager,
      devWarpNearBody: (bodyId) => this.devWarpNearBody(bodyId),
      toggleOrbits: () => this.toggleOrbits(),
      toggleSpaceTimeGrid: () => this.toggleSpaceTimeGrid(),
      toggleAmbient: () => this.toggleAmbient(),
      toggleLabels: () => this.toggleLabels(),
      devSetPlayerUpgradeLevel: (upgradeId, level) =>
        this.devSetPlayerUpgradeLevel(upgradeId, level),
      giveCredits: (amount) => this.giveCredits(amount),
      devStartConsortiumCertificationMessage: () => this.devStartConsortiumCertificationMessage(),
      devOpenOrbitalMinigame: (item, quantity) => this.devOpenOrbitalMinigame(item, quantity),
      unlockHektor: () => this.devSetBodyAccess('hektor', 'unrestricted'),
      restrictHektor: () => this.devSetBodyAccess('hektor', 'restricted'),
    })

    this.missionFacade.hydrateFromStorage(this.onMissionBoardUpdate)
    /**
     * Act 1 climax staging must run *after* {@link MapMissionFacade.hydrateFromStorage}.
     * If `replayAct1JourneyTriggers` runs earlier, `maybeStageAct1Climax` writes the
     * consortium run to `saveActiveMission` only; hydration then loads a stale full
     * board (without the active asteroid) and calls `clearActiveMission`, leaving
     * the shuttle "Active Missions" empty after refresh.
     */
    this.replayAct1JourneyTriggers()
    this.replayActiveContractStepStaging()
    this.scheduleJovianEpilogueIfDue()
    this.emitJourneyTracker()
    this.onCreditsUpdate?.(this.playerProfile.credits)

    this.gameLoop = new GameLoop(this.tickHandler)
    this.emitBootState('preparing', 'Loading')
    // Hold the loader until intro GLBs are cached AND the cinematic camera has rendered
    // its first frame, so the canvas pixels behind the overlay are already the intro view.
    // Without this, dismissing the overlay flashes the orbit-setup frame (velocity wedge,
    // etc.) until the next requestAnimationFrame.
    await MapIntroFacade.whenPreloaded()
    this.syncPreparedReadyFrame()
    this.sceneObjects.composer.render()
    this.emitBootState('ready', 'Ready')
  }

  /** Start map simulation/audio after the loader overlay receives a user gesture. */
  startExperience(): void {
    if (this.experienceStarted || !this.gameLoop) return
    this.experienceStarted = true
    this.emitBootState('started', 'Loading')
    this.gameLoop.start()
    this.shuttleAudio.start()
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

    const shouldSkipStartupIntro =
      this.inputManager?.wasActionPressed('skipCinematic') === true &&
      (this.mapIntro.phase === 'cinematic_zoom' ||
        this.mapIntro.phase === 'awaiting_message_open' ||
        this.mapIntro.phase === 'reading_message')
    if (shouldSkipStartupIntro) {
      this.skipIntro()
      return
    }

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

    // Mission tracker focus pauses the simulation, like the M overlay.
    if (this.missionFocusActive.value) return

    // Habitat state machine
    if (this.habitatState.isActive) {
      const prevPhase = this.habitatState.phase
      this.habitatState.tick(dt)

      // Lazy-load scene on first entry
      if (this.habitatState.phase !== 'map' && !this.habitatFacade.interiorScene) {
        this.habitatFacade.ensureScene()
      }

      this.habitatFacade.tickTransition(this.habitatState.phase, this.habitatState.progress)

      // Detect waking_up → habitat (wake-up complete, give player control)
      if (prevPhase === 'waking_up' && this.habitatState.phase === 'habitat') {
        this.habitatFacade.handleEnter()
      }

      // When exit completes, restore map state
      if (this.habitatState.phase === 'map') {
        this.habitatFacade.handleExit()
      }

      // While in habitat, tick the interior scene
      const interior = this.habitatFacade.interiorScene
      if (this.habitatState.phase === 'habitat' && interior) {
        this.habitatFacade.tickScene(dt)

        // Check for exit via Escape/H inside the habitat's own input
        if (interior.inputManager.wasActionPressed('exitHabitat')) {
          if (this.canLeaveHabitatJourney()) {
            this.notifyJourneyTrigger('left_habitat')
            this.habitatState.leave()
          } else {
            this.showJourneyLeaveBlockedPrompt()
          }
        }
      }

      // Emit fade overlay state
      this.onHabitatFade?.(
        this.habitatFacade.getFadeOpacity(this.habitatState.phase, this.habitatState.progress),
      )

      // Skip map gameplay while in habitat
      if (this.habitatState.phase !== 'map') return
    }

    if (introLocked) {
      return
    }

    // Turret mode toggle + active branch (mirrors habitat/EVA early-return pattern)
    const turretUnlocked = getCurrentUpgradeValue('turretMiningUnlock') >= 1
    const turretToggle = this.modeCoordinator.resolveTurretToggle({
      togglePressed: this.inputManager?.wasActionPressed('toggleTurret') ?? false,
      turretActive: this.turretSessionController?.isActive ?? false,
      orbitState: this.orbitSystem?.state ?? 'free',
      mapIsOpen: this.mapState.isOpen,
      habitatActive: this.habitatState.isActive,
      evaActive: this.evaSession?.isActive ?? false,
      isDead: this.shuttleController?.dead ?? false,
      unlocked: turretUnlocked,
      introLocked,
    })
    if (turretToggle === 'enter') {
      this.turretSimFrozen = true
      this.ensureTurretSessionController().open()
    }

    if (this.turretSessionController?.isActive) {
      this.turretSimFrozen = true
      this.turretSessionController.tick(dt)
      // The turret camera is mounted on the nose, so yawing back at the hull puts the
      // ship right in front of the map's base lights. Force the zoomed-in bloom clamp
      // (normally driven by tickShuttleScale, which we skip here) so cameraLight fades
      // to 0 and the bloom threshold rises past the hull's diffuse peak.
      this.applyOrbitBloomClamp(TURRET_FORCE_CLAMP_OVERSCALE)
      // Push telemetry during the turret session so the HUD can swap to the
      // MINE gauge and show live charge depletion. The rest of the gameplay
      // tick (orrery sim, orbit transitions, damage, UI toggles) stays paused
      // alongside shuttleController.freeze — the world waits until the player
      // exits turret mode.
      this.emitShuttleTelemetry()
      if (this.turretSessionController.phase !== 'idle') return
      this.turretSimFrozen = false
    }

    // Canvas orbital minigame overlay — freeze the world while the player is in a minigame.
    // Mirrors the turret early-return pattern: telemetry keeps the HUD alive; everything
    // else (physics, damage, input) stays paused until the overlay closes.
    if (this.missionOverlayOpen) {
      this.emitShuttleTelemetry()
      return
    }

    // Orbital surfing toggle — checked BEFORE gravity surfing (orbit path priority).
    // No outer isActive() guard — requestToggle handles cancel-during-coupling internally.
    this.orbitalSurfingController.requestToggle(this.getOrbitalSurfingDeps())
    this.orbitalSurfingController.tick(dt, this.getOrbitalSurfingDeps())
    this.manifoldSpline?.tick(dt)

    // Override ship position to follow the smooth CatmullRom spline (not raw arc points)
    if (
      this.orbitalSurfingController.mode === 'diving' &&
      this.manifoldSpline &&
      this.shuttleController
    ) {
      const splinePos = this.manifoldSpline.getPositionAt(
        this.orbitalSurfingController.getSplineT(),
      )
      this.shuttleController.group.position.copy(splinePos)
    }

    // Gravity surfing — only allow toggle if orbital surfing is not active
    if (!this.orbitalSurfingController.isActive()) {
      this.gravitySurfingController.requestToggle(this.getGravitySurfingDeps())
    }
    this.gravitySurfingController.tick(dt, this.getGravitySurfingDeps())

    const inspectToggle = this.modeCoordinator.resolveInspectToggle({
      togglePressed:
        !this.gravitySurfingController.isActive() &&
        !this.orbitalSurfingController.isActive() &&
        (this.inputManager?.wasActionPressed('toggleDoors') ?? false),
      inspectMode: this.inspectMode,
      orbitState: this.orbitSystem?.state ?? 'free',
    })
    if (inspectToggle) {
      if (inspectToggle.toggleDoors) {
        this.shuttleController?.toggleDoors()
      }
      this.inspectMode = inspectToggle.nextInspectMode
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
      this.bloomController.setRawBloom(inspectToggle.bloomThreshold, inspectToggle.bloomStrength)
    }

    // Habitat interior (H key) — enter/exit first-person interior
    const habitatTransition = this.modeCoordinator.resolveHabitatTransition({
      togglePressed:
        !this.gravitySurfingController.isActive() &&
        !this.orbitalSurfingController.isActive() &&
        (this.inputManager?.wasActionPressed('focusHabitat') ?? false),
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
      if (this.canLeaveHabitatJourney()) {
        this.notifyJourneyTrigger('left_habitat')
        this.habitatState.leave()
      } else {
        this.showJourneyLeaveBlockedPrompt()
      }
    }

    // Death seizes ALL gameplay one-shots (orbit capture, shop, terminals,
    // mission overlays). Skipping the rest of the per-frame action handling
    // prevents bugs like pressing E mid death-fall to trigger an orbit
    // capture on the body that just killed the shuttle.
    const shuttleDead = this.shuttleController?.dead ?? false

    // Orbit action (E key) — press to capture/cancel, hold to charge slingshot
    if (
      !shuttleDead &&
      !this.gravitySurfingController.isActive() &&
      !this.orbitalSurfingController.isActive() &&
      this.orbitSystem &&
      this.shuttleController &&
      this.inputManager
    ) {
      const previousCharge = this.slingshotCharge
      this.orbitFacade.handleOrbitInput(dt, {
        shuttleController: this.shuttleController,
        vehicleCamera: this.vehicleCamera,
        sceneVisuals: this.sceneVisuals,
        inputManager: this.inputManager,
        audio: this.shuttleAudio,
        mapIntroControlsLocked: this.mapIntro.controlsLocked,
        onSlingshotReleased: (bodyName) => this.notifyOrbitalLaunchFromBodyName(bodyName),
      })
      if (previousCharge > 0 && this.slingshotCharge === 0 && this.orbitSystem?.state === 'free') {
        this.yRecovery = true
        this.messageFacade.notifyFirstSlingshot(this.onMessageUpdate)
      }
    }

    // Shop action (B key) — toggle shop while orbiting
    if (
      !shuttleDead &&
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

    if (
      !shuttleDead &&
      this.inputManager?.wasActionPressed('cosmeticShopAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.cosmeticShopFacade.premiumSession
    ) {
      if (this.cosmeticShopFacade.dialogOpen) {
        this.closeCosmeticShop()
      } else {
        this.openCosmeticShop()
      }
    }

    // Engineering Bay (U key) — open shuttle terminal upgrades while orbiting
    if (
      !shuttleDead &&
      this.inputManager?.wasActionPressed('engineeringBayAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.shopFacade.session
    ) {
      this.onOrbitOpenEngineeringBay?.()
    }

    // Mission Board (J key) — open shuttle terminal missions while orbiting
    if (
      !shuttleDead &&
      this.inputManager?.wasActionPressed('missionBoardAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.shopFacade.session
    ) {
      this.onOrbitOpenMissionBoard?.()
    }

    // Mission action (I key) — open mission overlay while orbiting
    if (
      !shuttleDead &&
      this.inputManager?.wasActionPressed('missionAction') &&
      this.orbitSystem?.state === 'orbiting' &&
      this.missionButtonVisible
    ) {
      if (this.missionOverlayOpen) {
        this.closeMissionOverlay()
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
      !this.gravitySurfingController.isActive() &&
      !this.orbitalSurfingController.isActive() &&
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

    if (
      this.shuttleController &&
      !this.shuttleController.dead &&
      !(this.evaSession?.isActive ?? false)
    ) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const passiveFuelMultiplier = this.gravitySurfingController.isActive()
        ? MAP_CONFIG.GRAVITY_SURF_PASSIVE_FUEL_MULTIPLIER
        : this.orbitalSurfingController.isActive()
          ? MAP_CONFIG.ORBITAL_SURF_FUEL_MULTIPLIER
          : 1
      this.shuttleController.thrusterSystem.consumeFuel(
        computeShuttleBaseFuelDrain(dt, orbitState !== 'orbiting') * passiveFuelMultiplier,
      )
    }

    if (this.shuttleController) {
      const ts = this.shuttleController.thrusterSystem
      this.shuttleAudio.tickShuttleFuelTelemetry(
        ts.fuelLevel,
        ts.fuelCapacity,
        !this.shuttleController.dead,
      )
    }

    // Telemetry
    this.emitShuttleTelemetry()

    // Orbit HUD state
    if (this.orbitSystem && this.shuttleController && this.onOrbitState) {
      const hudState = this.orbitFacade.buildHudState(this.shuttleController, this.inspectMode)
      if (hudState) this.onOrbitState(hudState)
    }

    this.trackSolarOrbitAchievements()

    // Constant-screen-size shuttle scale — keeps the ship visible when zoomed out
    this.tickShuttleScale(dt)

    // Ambient particles are only active during free flight, not orbit/approach
    if (this.sceneEnvironment) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      this.sceneEnvironment.setAmbientActive(orbitState === 'free')
    }

    // Adrift check — 60s with no fuel in free flight = game over
    if (this.shuttleController && !this.shuttleController.dead && !this.isSimulationFrozen()) {
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

    // Ship health — temperature drift + radiation/temp damage. Delegated to the facade,
    // which returns the HUD + audio snapshot for this frame.
    if (
      this.shipHealth &&
      this.shuttleController &&
      !this.shuttleController.dead &&
      !this.isSimulationFrozen()
    ) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      const px = this.shuttleController.position.x
      const pz = this.shuttleController.position.z
      const sunDist = Math.sqrt(px * px + pz * pz)
      const isHealingAtEarth =
        orbitState === 'orbiting' && this.orbitSystem?.target?.name === 'Earth'
      const heatLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleHeatResistance ?? 0
      const coldLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleFreezeResistance ?? 0
      const tickOutput = this.healthFacade.tickHealth({
        dt,
        sunDist,
        isHealingAtEarth,
        heatMitigation: getCurrentUpgradeValue('shuttleHeatResistance'),
        coldMitigation: getCurrentUpgradeValue('shuttleFreezeResistance'),
        radiationLevel: CURRENT_PLAYER_UPGRADE_LEVELS.shuttleRadiationResistance ?? 0,
        heatZoneLevel: heatLevel,
        coldZoneLevel: coldLevel,
      })
      this.shuttleEffects?.setTemperature(tickOutput.temperature)
      this.onRadiationWarning?.(tickOutput.radiation)
      this.shuttleAudio.tickRadiationTelemetry(tickOutput.radiationDamageActive)
    } else {
      // Either the simulation is frozen, the shuttle is dead, or shipHealth
      // is missing — clear any latent radiation HUD/audio state so the
      // overlay doesn't get stuck on while time is paused.
      this.onRadiationWarning?.(IDLE_RADIATION_STATE)
      this.shuttleAudio.tickRadiationTelemetry(false)
    }

    // Planet collision — instant death if shuttle flies into a planet mesh
    if (this.shuttleController && !this.shuttleController.dead && !this.isSimulationFrozen()) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      if (orbitState === 'free') {
        const px = this.shuttleController.position.x
        const pz = this.shuttleController.position.z
        const samples: PlanetCollisionSample[] = this.planetControllers.map((c, i) => ({
          name: this.renderedSolarBodies[i]!.name,
          displayRadius: this.renderedSolarBodies[i]!.displayRadius,
          worldX: c.getWorldX(),
          worldZ: c.getWorldZ(),
        }))
        const hit = findPlanetCollision(px, pz, samples)
        if (hit) {
          this.triggerDeath(`Crashed Into ${hit.planetName}`)
          return
        }
      }
    }

    // Gravity proximity — VFX distortion + HUD warning
    // Only active in free flight (not during orbit capture or portal arrival)
    if (this.shuttleController && this.gravityPass) {
      const orbitState = this.orbitSystem?.state ?? 'free'
      if (orbitState === 'free' && !this.shuttleController.dead && !this.isSimulationFrozen()) {
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
            nearestName = this.renderedSolarBodies[i]?.name ?? null
          }
        }

        // Update shader uniforms
        this.gravityPass.uniforms.proximity!.value = maxProximity
        // Chromatic aberration is reserved for radiation exposure — when the
        // shielding is nominal (no radiation damage active), zero out the
        // chroma channel so the player only sees the gravitational lens warp.
        // This keeps the RGB-split visual in lockstep with the RadiationWarning
        // banner: chromatic split == "you are being irradiated".
        const radActive = this.shipHealth?.isTakingRadiationDamage ?? false
        this.gravityPass.uniforms.chromMultiplier!.value = radActive ? 1.0 : 0.0
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
        this.gravityPass.uniforms.chromMultiplier!.value = 0
        if (this.onGravityWarning) {
          this.onGravityWarning({ proximity: 0, bodyName: null, visible: false })
        }
      }
    }

    // Slingshot speed lines — ramp down as burst settles; kill on death or orbit capture
    if (this.slingshotSpeedPass && this.shuttleController) {
      const burstActive =
        this.shuttleController.slingshotBurstActive &&
        !this.shuttleController.dead &&
        (this.orbitSystem?.state ?? 'free') === 'free'
      if (burstActive) {
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

    // Slingshot exit camera transition
    this.orbitFacade.tickExitCamera(dt, this.vehicleCamera)

    if (this.gravitySurfPass && this.shuttleController) {
      const gravitySurfActive =
        this.gravitySurfingController.isActive() && !this.shuttleController.dead
      const speedRatio = Math.min(1, this.shuttleController.speed / 20)
      const targetIntensity = gravitySurfActive ? 0.35 + 0.65 * speedRatio : 0
      const nextIntensity = THREE.MathUtils.lerp(
        this.gravitySurfPass.uniforms.intensity!.value,
        targetIntensity,
        Math.min(1, dt * 6),
      )
      this.gravitySurfPass.uniforms.intensity!.value = nextIntensity
      this.gravitySurfPass.uniforms.time!.value += dt
      this.shuttleEffects?.setGravitySurfing(gravitySurfActive, nextIntensity)
    } else {
      this.shuttleEffects?.setGravitySurfing(false, 0)
    }
  }

  /**
   * Advance the orrery simulation and update gravity grid sources.
   */
  private tickOrrery(dt: number): void {
    // Hide planet indicator labels while the tactical map overlay is open.
    // Belt instancing dominates GPU triangle cost — slash visible instances while the
    // raster tacmap covers most of the view (planetarium often still composites behind UI).
    if (this.mapState.isOpen) {
      for (const controller of this.planetControllers) {
        controller.setIndicatorVisible(false)
      }
      for (const controller of this.beltControllers) {
        controller.setLodFraction(MAP_ASTEROID_BELT_TACMAP_LOD_FRAC)
      }
      return
    }

    // Portal arrival freezes the orrery so Earth stays at a fixed position
    // for the wormhole spawn. Resumed by the portal onComplete callback.
    if (this.isSimulationFrozen()) return

    this.simTime += dt * DEFAULT_TIME_SCALE

    this.sunController?.tick(dt, this.simTime)

    const indicatorCamera = this.vehicleCamera?.camera ?? undefined
    const showLabels = this.labelsVisible && !this.mapState.isOpen
    for (const controller of this.planetControllers) {
      controller.tick(dt, this.simTime, indicatorCamera, showLabels)
    }

    // Asteroid belt LOD — show fewer instances when camera is zoomed out
    if (this.vehicleCamera) {
      const camY = Math.abs(this.vehicleCamera.camera.position.y)
      const lodFraction = getMapAsteroidBeltLodFraction(camY)
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
    this.tickAsteroidImpacts(dt, shuttleWorldForBelts)

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
        const planetId = this.renderedSolarBodies[i]?.id
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
      })
    }

    // Shop/mission UI must sync on every orbit FSM state. If we only run this while
    // `orbiting`, leaving Earth never clears the shop session, so the next planet
    // still shows Earth's stock.
    if (this.orbitSystem) {
      this.updateShopSession()
      this.updateCosmeticShopSession()
      this.updateMissionState()
    }

    this.missionFacade.tick(dt)
    this.satelliteRepairController?.tick(dt)

    // Waypoint marker scale + VFX (must not gate begin-mission proximity — marker refs can lag).
    if (this.sceneObjects && this.vehicleCamera && this.shuttleController) {
      this.missionFacade.tickWaypointVisuals({
        scene: this.sceneObjects.scene,
        vehicleCamera: this.vehicleCamera,
        shuttlePosition: this.shuttleController.position,
        simTime: this.simTime,
        apparentSize: MAP_CONFIG.WAYPOINT_APPARENT_SIZE,
        dt,
        freezeScales: this.evaSession?.isActive ?? false,
        getBodyPosition: (id) => {
          for (const c of this.planetControllers) {
            if (c.id === id) return { x: c.getWorldX(), z: c.getWorldZ() }
          }
          return null
        },
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
      tutorialMessagesUnlocked: hasCompletedJourney(this.playerProfile, WELCOME_JOURNEY_ID),
      worldLineHistoryLength: this.overlayProjector.worldLineLength,
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
        ? Math.sqrt(this.shuttleController.position.x ** 2 + this.shuttleController.position.z ** 2)
        : null,
      venusOrbitRadius: (() => {
        const venusController = this.getPlanetControllerById('venus')
        if (!venusController) return null
        return Math.sqrt(venusController.getWorldX() ** 2 + venusController.getWorldZ() ** 2)
      })(),
      venusOrbitWarningDistance: MAP_CONFIG.VENUS_ORBIT_WARNING_DISTANCE,
      onMessageUpdate: this.onMessageUpdate,
    })

    // Per-frame audio: drive the slingshot charge whine loop on the
    // rising / falling edge of the orbit facade's charge flag. Cheap
    // (no allocations); safe to call every tick regardless of game
    // mode — the director short-circuits when it isn't started.
    this.shuttleAudio.update(dt, {
      slingshotCharging: this.orbitFacade.isChargingSlingshot,
    })
  }

  /** Apply asteroid impact damage + trajectory deflection while flying through belts. */
  private tickAsteroidImpacts(dt: number, shuttleWorldPosition: THREE.Vector3 | null): void {
    if (
      !shuttleWorldPosition ||
      !this.shuttleController ||
      !this.shipHealth ||
      this.shuttleController.dead ||
      (this.orbitSystem?.state ?? 'free') !== 'free' ||
      this.gravitySurfingController.isActive() ||
      this.orbitalSurfingController.isActive()
    ) {
      return
    }

    const resolved = this.asteroidImpactSystem.tick({
      dt,
      shuttlePosition: shuttleWorldPosition,
      velocity: this.shuttleController.currentVelocity,
      beltControllers: this.beltControllers,
    })
    if (!resolved) return

    this.shipHealth.applyDamage(resolved.damage, resolved.damageLabel)
    this.vehicleCamera?.shake(resolved.shakeMagnitude, resolved.shakeDurationSec)
    this.shuttleController.setVelocity(resolved.newVelocity)
  }

  /**
   * Compute gravity proximity for a single source (0 = at influence edge, 1 = at event horizon).
   * Returns 0 if outside influence radius.
   */
  /**
   * Called by Vue when the player chooses to watch the intro from the portal welcome dialog.
   * Triggers the full opening cinematic. No-op if the intro has already been seen.
   */
  portalWatchIntro(): void {
    this.messageFacade.notifyMapStartEarthOrbit(this.onMessageUpdate)
    this.beginStartupIntro()
  }

  /**
   * Called by Vue when the player skips the intro from the portal welcome dialog.
   * Unlocks controls, marks the intro as seen, and queues the Marta welcome
   * message so the player receives it regardless of whether they watched the cinematic.
   */
  portalSkipIntro(): void {
    this.messageFacade.notifyMapStartEarthOrbit(this.onMessageUpdate)
    this.markMapIntroSeenAndSyncProfile()
    this.mapIntro.skip()
    this.emitIntroUiState()
  }

  /** Reset shuttle after death — clear death state, place into Earth orbit. */
  /** Called by Vue when the player clicks Restart on the death overlay. */
  restart(): void {
    this.respawnAtLastDockedPlanet()
    this.onDeathOverlay?.(false, '')
  }

  /**
   * Resolve a capture-body display name to its stable id and forward a
   * `launch-from-body` event to the contract system. Names come from the
   * orbit-capture catalog in {@link initialize}; the Sun is special-cased
   * because it lives outside {@link PLANETS}.
   *
   * @param bodyName - Body display name from the orbit-capture system (e.g. `'Sun'`, `'Mars'`).
   */
  private notifyOrbitalLaunchFromBodyName(bodyName: string): void {
    const bodyId = bodyName === SUN.name ? SUN.id : PLANETS.find((p) => p.name === bodyName)?.id
    if (!bodyId) return
    contractSystem.notifyOrbitalLaunched({ planetId: bodyId })
    this.playerProfile = recordSlingshotLaunch(this.playerProfile, bodyId)
    this.persistPlayerProfileAndSyncProgress()
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
    this.gravitySurfingController.onGridVisibilityChanged(showFabric, this.getGravitySurfingDeps())
    if (this.spaceTimeGrid) {
      this.spaceTimeGrid.mesh.visible = showFabric
      if (showFabric) {
        this.syncSpaceTimeGridVisualBudget()
        this.spaceTimeGrid.forceFullVisualDeform()
      }
    }
  }

  private getGravitySurfingDeps() {
    return {
      gravitationalEventManager: this.gravitationalEventManager,
      gridVisible: this.gridVisible,
      hasGravitySurfingUnlock: hasGravitySurfingUnlock(),
      inputManager: this.inputManager,
      mapGridSize: this.mapGridSize,
      orbitState: this.orbitSystem?.state ?? 'free',
      slingshotBurstActive: this.shuttleController?.slingshotBurstActive ?? false,
      shuttleController: this.shuttleController,
      spaceTimeGrid: this.spaceTimeGrid,
    }
  }

  private getOrbitalSurfingDeps(): OrbitalSurfingDeps {
    return {
      shuttleController: this.shuttleController,
      inputManager: this.inputManager,
      hasOrbitalSurfingUnlock: hasOrbitalSurfingUnlock(),
      orbitState: this.orbitFacade.system?.state ?? 'free',
      gravitySurfingActive: this.gravitySurfingController.isActive(),
      slingshotBurstActive: this.shuttleController?.slingshotBurstActive ?? false,
      planetOrbitPoints: this.planetControllers.map((c) => c.getOrbitPointsXZ()),
      planetWorldPositions: this.planetControllers.map((c) => ({
        x: c.getWorldX(),
        z: c.getWorldZ(),
      })),
      planetNames: this.renderedSolarBodies.map((p) => p.name),
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
      labelsVisible: this.labelsVisible,
      ambientVisible: this.sceneEnvironment?.ambientVisible ?? true,
    }
    this.applyOrbitsVisible(false)
    this.applyGridVisible(false)
    this.labelsVisible = false
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
    this.labelsVisible = saved.labelsVisible
    this.sceneEnvironment?.setMapIntroSuppressed(false)
    if (this.evaSession?.isActive) {
      this.applyOrbitsVisible(false)
      this.applyGridVisible(false)
      this.labelsVisible = false
    }
    this.emitMapViewLayerToggles()
  }

  /**
   * Turns off orbital paths, space-time fabric mesh, and planet labels for FPS EVA; leaves
   * ambient debris unchanged. Snapshots prefs for {@link endEvaMapLayerSuppression}.
   */
  private beginEvaMapLayerSuppression(): void {
    if (this.evaLayerRestore !== null) return
    this.evaLayerRestore = {
      orbitsVisible: this.orbitsVisible,
      gridVisible: this.gridVisible,
      labelsVisible: this.labelsVisible,
      ambientVisible: this.sceneEnvironment?.ambientVisible ?? true,
    }
    this.applyOrbitsVisible(false)
    this.applyGridVisible(false)
    this.labelsVisible = false
    this.emitMapViewLayerToggles()
  }

  /** Restores HUD layer toggles from {@link beginEvaMapLayerSuppression}. */
  private endEvaMapLayerSuppression(): void {
    if (this.evaLayerRestore === null) return
    const saved = this.evaLayerRestore
    this.evaLayerRestore = null
    this.applyOrbitsVisible(saved.orbitsVisible)
    this.applyGridVisible(saved.gridVisible)
    this.labelsVisible = saved.labelsVisible
    this.emitMapViewLayerToggles()
  }

  private emitMapViewLayerToggles(): void {
    this.onMapViewLayerToggles?.({
      orbitsVisible: this.orbitsVisible,
      gridVisible: this.gridVisible,
      labelsVisible: this.labelsVisible,
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

  /**
   * Toggles planet indicator labels (dot + name).
   * Returns the new visibility state so the Vue layer can update button appearance.
   */
  toggleLabels(): boolean {
    this.labelsVisible = !this.labelsVisible
    this.emitMapViewLayerToggles()
    return this.labelsVisible
  }

  /** Write current profile and shuttle inventory to localStorage. */
  private persistPlayerProfile(): void {
    saveProfile(this.playerProfile)
    saveInventory(this.playerInventory)
  }

  /** True until the player submits a real callsign in the name-entry dialog. */
  requiresNameEntry(): boolean {
    return !isPlayerNameConfirmed()
  }

  /** Persist profile/inventory and refresh Vue achievement progress immediately. */
  private persistPlayerProfileAndSyncProgress(): void {
    this.persistPlayerProfile()
    this.onPersistentProgressUpdate?.()
  }

  /**
   * Build the renderable solar-body list from static planets plus unlocked pinned bodies.
   *
   * @returns Bodies in controller order for map rendering, gravity, and orbit capture.
   */
  private getRenderedSolarBodies(): readonly Planet[] {
    const renderedPinnedBodies = PINNED_BODIES.filter((body) =>
      isBodyRendered(getBodyAccess(this.playerProfile, body.id)),
    )
    return [...PLANETS, ...renderedPinnedBodies]
  }

  /**
   * Dev-console helper for contract-gated body access testing.
   *
   * @param bodyId - Pinned body id to update.
   * @param state - New body access state to persist.
   */
  private devSetBodyAccess(bodyId: string, state: BodyAccessState): void {
    if (!import.meta.env.DEV) return
    this.playerProfile = setBodyAccess(this.playerProfile, bodyId, state)
    this.persistPlayerProfile()
    this.emitShopState()
    console.info(`[MapView] ${bodyId} access -> ${state}; reload map to apply visibility`)
  }

  /** Persist shuttle hull HP to the profile (immediate). Invoked by the health facade. */
  private flushShuttleHullToProfile(): void {
    const health = this.shipHealth
    if (!health) return
    const hp = health.hp
    if (this.playerProfile.shuttleHullHp === hp) return
    this.playerProfile = { ...this.playerProfile, shuttleHullHp: hp }
    saveProfile(this.playerProfile)
  }

  private clearShuttleHullPersistTimer(): void {
    this.healthFacade.clearPersistTimer()
  }

  notifyJourneyTrigger(trigger: JourneyTriggerId): void {
    this.journeyFacade.notifyTrigger(trigger)
  }

  /**
   * When Jupiter is newly written into {@link PlayerProfile.orbitedSolarBodies}, notifies
   * `first_orbit:jupiter` for the journey system. No-op when Jupiter was already counted or still
   * uncounted after the preceding write.
   *
   * @param profileBeforeOrbitRecord - Snapshot immediately before the first-orbit write.
   */
  private maybeNotifyFirstJupiterOrbitJourneyTrigger(
    profileBeforeOrbitRecord: PlayerProfile,
  ): void {
    if ((profileBeforeOrbitRecord.orbitedSolarBodies['jupiter'] ?? 0) > 0) return
    if ((this.playerProfile.orbitedSolarBodies['jupiter'] ?? 0) === 0) return
    this.notifyJourneyTrigger('first_orbit:jupiter')
  }

  private emitJourneyTracker(): void {
    this.journeyFacade.emitTracker()
  }

  private canLeaveHabitatJourney(): boolean {
    return this.journeyFacade.canLeaveHabitat()
  }

  private showJourneyLeaveBlockedPrompt(): void {
    const prompt = this.journeyFacade.buildLeaveBlockedPrompt()
    if (prompt) this.onHabitatPrompt?.(prompt)
  }

  /**
   * Arm the journey UI. Called the first time the player enters the habitat post-intro.
   * Delegates to {@link MapJourneyFacade} — idempotent.
   */
  armJourneyUiFromHabitatEntry(): void {
    this.journeyFacade.armUiFromHabitatEntry()
  }

  /**
   * Fantasia mails the player once overall when they berth at Mars, Jupiter, or Saturn orbit.
   */
  private tryEnqueueFantasiaIntroMail(planetBodyKey: string): void {
    const queuedProfile = markFantasiaCosmeticIntroIfNeeded(this.playerProfile, planetBodyKey)
    if (queuedProfile === this.playerProfile) return
    if (!shipMessageSystem.enqueueById(FANTASIA_INTRO_MESSAGE_ID)) return
    this.playerProfile = queuedProfile
    this.persistPlayerProfile()
    this.onMessageUpdate?.()
  }

  /**
   * When the shuttle enters `orbiting`, persist a first-time flag for that body (Sun or planet).
   * Drives exploration achievements and syncs profile to Vue.
   */
  private trackSolarOrbitAchievements(): void {
    const system = this.orbitSystem
    const state = system?.state ?? 'free'
    const becameOrbiting = state === 'orbiting' && this.previousOrbitCaptureState !== 'orbiting'
    this.previousOrbitCaptureState = state
    if (!becameOrbiting || !system?.target) return
    const key = orbitBodyKeyFromCaptureName(system.target.name)
    if (!key) return
    this.tryEnqueueFantasiaIntroMail(key)
    const profileBeforeOrbitRecord = this.playerProfile
    let next = recordSolarBodyFirstOrbit(this.playerProfile, key)
    if (key !== 'sun') {
      next = setLastDockedPlanet(next, key)
    }
    if (next === this.playerProfile) return
    this.playerProfile = next
    this.persistPlayerProfile()
    this.emitShopState()
    this.maybeNotifyFirstJupiterOrbitJourneyTrigger(profileBeforeOrbitRecord)
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

  /** Sync Vue inventory / credits panels for magenta cargo + shader purchases. */
  private emitCosmeticShopState(): void {
    this.cosmeticShopFacade.emitState(
      this.onCosmeticShopState,
      this.playerProfile,
      this.playerInventory,
    )
  }

  /** Sync latest profile/inventory to Vue without implicitly opening the shop overlay. */
  private emitShopState(): void {
    this.shopFacade.emitState(this.onShopState, this.playerProfile, this.playerInventory)
    this.emitCosmeticShopState()
  }

  /** Build a fresh inventory using the current cargo-bay upgrade multiplier. */
  private createInventoryForCurrentCargoBayLevel(): Inventory {
    return createInventoryForCargoBay(getCurrentUpgradeValue('shuttleCargoBay'))
  }

  /** Add starter shuttle + lander fuel cells to a fresh cargo hold (new game / death respawn). */
  private inventoryWithStarterFuelCells(emptyHold: Inventory): Inventory {
    return inventoryWithStarterFuelCellsHelper(emptyHold, this.starterFuelCellCounts())
  }

  /** Ensure the saved hold meets the minimum starter fuel cell quantities. */
  private ensureMinimumStarterFuelCells(inventory: Inventory): Inventory {
    return ensureMinimumStarterFuelCellsHelper(inventory, this.starterFuelCellCounts())
  }

  /** Keep inventory contents but resize caps to match the current `shuttleCargoBay` level. */
  private applyCargoBayLimits(inventory: Inventory): Inventory {
    return applyCargoBayLimitsHelper(inventory, getCurrentUpgradeValue('shuttleCargoBay'))
  }

  /** Current starter fuel cell counts from config. */
  private starterFuelCellCounts() {
    return {
      shuttle: MAP_CONFIG.STARTER_SHUTTLE_FUEL_CELL_COUNT,
      lander: MAP_CONFIG.STARTER_LANDER_FUEL_CELL_COUNT,
    }
  }

  /** Create or destroy shop session based on orbit state. */
  private updateShopSession(): void {
    const targetName = this.orbitSystem?.target?.name ?? null
    const targetPlanetId = targetName
      ? (PLANETS.find((planet) => planet.name === targetName)?.id ?? null)
      : null
    const orbitState = this.orbitSystem?.state ?? 'free'
    const { openedPlanetId } = this.shopFacade.updateOrbitState({
      orbitState,
      targetName,
      targetPlanetId,
      onShopButton: this.onShopButton,
      onShopState: this.onShopState,
      profile: this.playerProfile,
      inventory: this.playerInventory,
    })
    if (openedPlanetId) {
      this.offerEvaMissionAtPlanet(openedPlanetId)
      this.offerAsteroidMissionFromDifficulty(openedPlanetId)
      this.offerTurretMiningMissionAtPlanet(openedPlanetId)
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
    /**
     * Planetary shuttle contracts: refresh whenever orbiting a station, not only on the
     * first shop-session frame (stale offers from another planet used to block Mars, etc.).
     */
    if (orbitState === 'orbiting' && targetPlanetId) {
      this.offerMissionAtPlanet(targetPlanetId)
    }
  }

  /** Update magenta cosmetic kiosk availability keyed to orbit target planets ids. */
  private updateCosmeticShopSession(): void {
    const targetName = this.orbitSystem?.target?.name ?? null
    const targetPlanetId = targetName
      ? (PLANETS.find((planet) => planet.name === targetName)?.id ?? null)
      : null
    const orbitState = this.orbitSystem?.state ?? 'free'
    this.cosmeticShopFacade.updateOrbitState({
      orbitState,
      targetName,
      targetPlanetId,
      onCosmeticShopButton: this.onCosmeticShopButton,
      onCosmeticShopState: this.onCosmeticShopState,
      profile: this.playerProfile,
      inventory: this.playerInventory,
    })
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

  /** Current contract store snapshot for Vue/UI sync. */
  getContractSnapshot(): ContractStoreSnapshot {
    return structuredClone(contractSystem.getSnapshot())
  }

  /**
   * Re-read the persisted profile from storage and adopt it as the controller's
   * in-memory copy. Used after external mutators (e.g. contract reward effects)
   * write to the profile so the UI sees the new state on the next sync.
   *
   * @returns True when the in-memory profile was replaced; false when no stored
   *   profile is available.
   */
  refreshPlayerProfileFromStorage(): boolean {
    const stored = loadProfile()
    if (!stored) return false
    this.playerProfile = stored
    this.onCreditsUpdate?.(this.playerProfile.credits)
    return true
  }

  /**
   * Award credits using the standard persistence + HUD sync flow.
   *
   * @param amount - Positive credit amount to add.
   */
  giveCredits(amount: number): void {
    if (!Number.isFinite(amount)) return
    this.playerProfile = addCredits(this.playerProfile, Math.max(0, Math.round(amount)))
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitShopState()
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
    setPlayerUpgradeLevel(upgradeId, result.newLevel)
    if (upgradeId === 'shuttleCargoBay') {
      this.playerInventory = this.applyCargoBayLimits(this.playerInventory)
      this.emitShopState()
    }
    this.persistPlayerProfile()
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
    const clamped = setPlayerUpgradeLevel(upgradeId, level)
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

  /** Open the magenta cosmetic kiosk while Fantasia's premium multiplier is armed. */
  openCosmeticShop(): void {
    this.cosmeticShopFacade.open(this.onCosmeticShopState, this.playerProfile, this.playerInventory)
  }

  /**
   * Render the currently painted shuttle into an isolated thumbnail for Vue shop UI.
   *
   * The map renderer is reused for a single offscreen render target. The cloned
   * shuttle is rendered in a tiny preview scene, so the paused solar-system scene
   * stays untouched while the dialog gets a cheap bitmap.
   */
  captureShuttleCosmeticPreviewDataUrl(): string | null {
    if (!this.shuttleController) return null
    return this.captureCosmeticPreviewDataUrl(this.shuttleController.group, {
      ambientIntensity: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_AMBIENT_INTENSITY,
      background: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_BACKGROUND,
      cameraDistanceMultiplier: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_CAMERA_DISTANCE_MULTIPLIER,
      cameraOffset: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_CAMERA_OFFSET,
      far: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_FAR,
      fovDeg: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_FOV_DEG,
      keyIntensity: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_KEY_INTENSITY,
      mimeType: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_MIME_TYPE,
      minRadius: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_MIN_CAMERA_DISTANCE,
      near: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_NEAR,
      rimIntensity: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_RIM_INTENSITY,
      sizePx: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_SIZE_PX,
      target: MAP_CONFIG.SHUTTLE_COSMETIC_PREVIEW_TARGET,
    })
  }

  /**
   * Render the currently painted cargo lander into an isolated thumbnail for Vue shop UI.
   */
  captureLanderCosmeticPreviewDataUrl(): string | null {
    const landerRoot = this.shuttleController?.getCargoLanderPreviewRoot()
    if (!landerRoot) return null
    return this.captureCosmeticPreviewDataUrl(landerRoot, {
      ambientIntensity: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_AMBIENT_INTENSITY,
      background: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_BACKGROUND,
      cameraDistanceMultiplier: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_CAMERA_DISTANCE_MULTIPLIER,
      cameraOffset: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_CAMERA_OFFSET,
      far: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_FAR,
      fovDeg: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_FOV_DEG,
      keyIntensity: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_KEY_INTENSITY,
      mimeType: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_MIME_TYPE,
      minRadius: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_MIN_CAMERA_DISTANCE,
      near: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_NEAR,
      rimIntensity: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_RIM_INTENSITY,
      sizePx: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_SIZE_PX,
      target: MAP_CONFIG.LANDER_COSMETIC_PREVIEW_TARGET,
    })
  }

  /**
   * Ensure the map-owned EVA multitool has a model available for shop preview capture.
   */
  async preloadMultitoolCosmeticPreview(): Promise<void> {
    await this.evaMapMultitoolFacade.loadCosmeticPreviewModel(this.playerProfile)
  }

  /**
   * Render the currently painted multitool into an isolated thumbnail for Vue shop UI.
   */
  captureMultitoolCosmeticPreviewDataUrl(): string | null {
    this.evaMapMultitoolFacade.applyMultitoolPaintjobFromProfile(this.playerProfile)
    const multitoolRoot = this.evaMapMultitoolFacade.getCosmeticPreviewRoot()
    if (!multitoolRoot) return null
    return this.captureCosmeticPreviewDataUrl(multitoolRoot, {
      ambientIntensity: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_AMBIENT_INTENSITY,
      background: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_BACKGROUND,
      cameraDistanceMultiplier: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_CAMERA_DISTANCE_MULTIPLIER,
      cameraOffset: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_CAMERA_OFFSET,
      far: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_FAR,
      fovDeg: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_FOV_DEG,
      keyIntensity: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_KEY_INTENSITY,
      mimeType: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_MIME_TYPE,
      minRadius: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_MIN_CAMERA_DISTANCE,
      near: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_NEAR,
      rimIntensity: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_RIM_INTENSITY,
      sizePx: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_SIZE_PX,
      target: MAP_CONFIG.MULTITOOL_COSMETIC_PREVIEW_TARGET,
    })
  }

  private captureCosmeticPreviewDataUrl(
    source: THREE.Object3D,
    config: {
      readonly ambientIntensity: number
      readonly background: string
      readonly cameraDistanceMultiplier: number
      readonly cameraOffset: THREE.Vector3
      readonly far: number
      readonly fovDeg: number
      readonly keyIntensity: number
      readonly mimeType: string
      readonly minRadius: number
      readonly near: number
      readonly rimIntensity: number
      readonly sizePx: number
      readonly target: THREE.Vector3
    },
  ): string | null {
    if (!this.sceneObjects || typeof document === 'undefined') return null

    const renderer = this.sceneObjects.renderer
    const previewScene = new THREE.Scene()
    previewScene.background = new THREE.Color(config.background)

    const previewVehicle = source.clone(true)
    previewVehicle.position.set(0, 0, 0)
    previewVehicle.rotation.set(0, 0, 0)
    previewVehicle.scale.setScalar(1)
    previewVehicle.visible = true
    previewVehicle.traverse((child) => {
      child.layers.set(0)
    })
    previewVehicle.updateMatrixWorld(true)

    const bounds = this.computeVisibleMeshBounds(previewVehicle)
    if (!bounds) return null

    const center = bounds.getCenter(new THREE.Vector3())
    previewVehicle.position.sub(center)
    previewVehicle.updateMatrixWorld(true)
    previewScene.add(previewVehicle)

    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, config.minRadius)
    const cameraDistance = radius * config.cameraDistanceMultiplier
    const camera = new THREE.PerspectiveCamera(config.fovDeg, 1, config.near, config.far)
    camera.position.copy(config.cameraOffset).normalize().multiplyScalar(cameraDistance)
    camera.lookAt(config.target)

    previewScene.add(new THREE.AmbientLight(0xffffff, config.ambientIntensity))
    const keyLight = new THREE.DirectionalLight(0xffffff, config.keyIntensity)
    keyLight.position.copy(camera.position)
    previewScene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0x88ccff, config.rimIntensity)
    rimLight.position.set(-camera.position.x, camera.position.y * 0.5, -camera.position.z)
    previewScene.add(rimLight)

    const size = config.sizePx
    const target = new THREE.WebGLRenderTarget(size, size)
    target.texture.colorSpace = renderer.outputColorSpace
    const previousTarget = renderer.getRenderTarget()
    const previousClearColor = renderer.getClearColor(new THREE.Color())
    const previousClearAlpha = renderer.getClearAlpha()

    renderer.setRenderTarget(target)
    renderer.setClearColor(config.background, 1)
    renderer.clear()
    renderer.render(previewScene, camera)

    const pixels = new Uint8Array(size * size * 4)
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)

    renderer.setRenderTarget(previousTarget)
    renderer.setClearColor(previousClearColor, previousClearAlpha)
    target.dispose()

    const rowStride = size * 4
    const flipped = new Uint8ClampedArray(pixels.length)
    for (let y = 0; y < size; y += 1) {
      const sourceOffset = y * rowStride
      const targetOffset = (size - y - 1) * rowStride
      flipped.set(pixels.subarray(sourceOffset, sourceOffset + rowStride), targetOffset)
    }

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return null
    context.putImageData(new ImageData(flipped, size, size), 0, 0)
    return canvas.toDataURL(config.mimeType)
  }

  private computeVisibleMeshBounds(root: THREE.Object3D): THREE.Box3 | null {
    const bounds = new THREE.Box3()
    let hasBounds = false

    root.traverseVisible((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const geometry = child.geometry
      geometry.computeBoundingBox()
      const meshBounds = geometry.boundingBox
      if (!meshBounds) return
      bounds.union(meshBounds.clone().applyMatrix4(child.matrixWorld))
      hasBounds = true
    })

    return hasBounds ? bounds : null
  }

  /** Close the magenta dialog without clearing the underlying premium visit roll. */
  closeCosmeticShop(): void {
    this.cosmeticShopFacade.close()
    this.onCosmeticShopState?.(null, this.playerProfile, this.playerInventory)
  }

  /**
   * Attempt to buy (or free-apply) a catalog cosmetic option through the map shell.
   *
   * @param optionId - Cosmetic row id from `pimp-my-shuttle.json`.
   */
  cosmeticPurchaseOption(optionId: string): CosmeticPurchaseResult {
    const result = purchaseCosmeticOption(this.playerProfile, optionId)
    if (!result.ok) return result
    this.playerProfile = result.profile
    this.shuttleController?.applyShuttlePaintjobFromProfile(this.playerProfile)
    this.shuttleController?.applyLanderPaintjobFromProfile(this.playerProfile)
    this.shuttleEffects?.applyShuttleThrusterTrailFromProfile(this.playerProfile)
    this.evaMapMultitoolFacade.applyMultitoolPaintjobFromProfile(this.playerProfile)
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitShopState()
    return result
  }

  /**
   * Switch to an already-owned shader without spending credits.
   *
   * @param optionId - Cosmetic row id.
   */
  cosmeticApplyOption(optionId: string): CosmeticPurchaseResult {
    const result = applyOwnedCosmetic(this.playerProfile, optionId)
    if (!result.ok) return result
    this.playerProfile = result.profile
    this.shuttleController?.applyShuttlePaintjobFromProfile(this.playerProfile)
    this.shuttleController?.applyLanderPaintjobFromProfile(this.playerProfile)
    this.shuttleEffects?.applyShuttleThrusterTrailFromProfile(this.playerProfile)
    this.evaMapMultitoolFacade.applyMultitoolPaintjobFromProfile(this.playerProfile)
    this.persistPlayerProfile()
    this.emitShopState()
    return result
  }

  /**
   * Spend registry fees to change the shuttle title when the normalized string changes.
   *
   * @param rawTitle - Player typed title before normalization.
   */
  cosmeticRenameShuttle(rawTitle: string): ShuttleTitlePurchaseResult {
    const result = purchaseShuttleTitle(this.playerProfile, rawTitle)
    if (!result.ok) return result
    this.playerProfile = result.profile
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitShopState()
    return result
  }

  /**
   * Sell trade goods through Fantasia's premium intake wrapper.
   *
   * @param itemId - Stack id backed by trade-good definitions only.
   * @param quantity - Units attempting to offload.
   */
  cosmeticSellPremiumCargo(itemId: string, quantity: number): ShopResult {
    const session = this.cosmeticShopFacade.premiumSession
    if (!session) {
      return {
        ok: false,
        profile: this.playerProfile,
        inventory: this.playerInventory,
        reason: 'No premium buyer session active',
      }
    }

    const result = sellPremiumTradeGood(
      session,
      this.playerProfile,
      this.playerInventory,
      itemId,
      quantity,
    )
    if (!result.ok) return result
    this.playerProfile = result.profile
    this.playerInventory = result.inventory
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    this.emitShopState()
    return result
  }

  /** Offer a mission when docking at a planet. */
  offerMissionAtPlanet(planetId: string): void {
    this.missionFacade.offerMissionAtPlanet(planetId, this.onMissionBoardUpdate)
  }

  /**
   * Accept the offered planetary mission (from shuttle control UI).
   *
   * @returns Whether accept succeeded; `reason` when the cargo hold cannot fit the pickup.
   */
  missionAccept(): { ok: boolean; reason?: string } {
    return this.missionFacade.missionAccept(this.playerInventory, this.onMissionBoardUpdate)
  }

  /**
   * Generate and offer an asteroid mission for the station on `planetId`. Waypoints are
   * anchored near that world's orbit (not global belt radii).
   */
  offerAsteroidMissionFromDifficulty(planetId: string): void {
    const controller = this.getPlanetControllerById(planetId)
    if (!controller) return
    this.missionFacade.offerAsteroidMissionFromDifficulty(
      {
        planetId,
        worldX: controller.getWorldX(),
        worldZ: controller.getWorldZ(),
      },
      this.onMissionBoardUpdate,
      this.playerProfile,
    )
  }

  /** Accept the offered asteroid mission (from shuttle control UI). */
  asteroidMissionAccept(): void {
    this.missionFacade.asteroidMissionAccept(this.onMissionBoardUpdate)
  }

  /** Accept the offered turret mining mission (from shuttle control UI). */
  miningMissionAccept(): void {
    this.missionFacade.miningMissionAccept(this.onMissionBoardUpdate)
  }

  /** Offer an EVA (visit-relay) mission when docking at a planet. */
  offerEvaMissionAtPlanet(planetId: string): void {
    this.missionFacade.offerEvaMissionAtPlanet(planetId, this.onMissionBoardUpdate)
  }

  /**
   * Deliver one mining mission by id. Triggered by the player pressing the
   * Deliver button on the active mission card while docked at the giver
   * planet. Refuses delivery (no-op) if cargo doesn't cover the target.
   *
   * @param missionId - Template id of the mining mission to deliver.
   */
  miningMissionDeliver(missionId: string): void {
    const mission = this.missionFacade.board.activeMiningMissions.find(
      (entry) => entry.template.id === missionId,
    )
    if (!mission) return
    const planetId = mission.giverPlanet
    const payMultiplier = getMissionPayMultiplier(this.playerProfile, planetId)
    const scienceMult = getCurrentUpgradeValue('shuttleScienceStation') * payMultiplier
    const result = this.missionFacade.miningMissionDeliver({
      missionId,
      planetId,
      inventory: this.playerInventory,
      profile: this.playerProfile,
      rewardMultiplier: scienceMult,
      onMissionBoardUpdate: this.onMissionBoardUpdate,
      onMiningMissionDeliver: this.onMiningMissionDeliver,
    })
    if (!result.creditsChanged) return
    this.playerInventory = result.inventory
    this.playerProfile = recordMissionObjectiveComplete(result.profile, 'mining')
    saveInventory(result.inventory)
    this.persistPlayerProfile()
    this.onCreditsUpdate?.(this.playerProfile.credits)
    if (result.contractEvent) {
      contractSystem.notifyMissionCompleted(result.contractEvent)
      this.refreshPlayerProfileFromStorage()
      this.onPersistentProgressUpdate?.()
      this.onCreditsUpdate?.(this.playerProfile.credits)
    }
  }

  /**
   * Offer a turret mining mission when docking at a planet, if no restock timer
   * is running and the planet's pool has an available contract.
   */
  private offerTurretMiningMissionAtPlanet(planetId: string): void {
    const offered = offerTurretMiningMission(this.missionFacade.board, planetId)
    if (offered === this.missionFacade.board) return
    this.missionFacade.board = offered
    saveMissionBoard(offered)
    this.onMissionBoardUpdate?.(this.missionFacade.board)
  }

  /**
   * Lead time (sim seconds) used when accepting an EVA mission — waypoint is placed where
   * the giver planet *will* be this many seconds from now, so the POI sits ahead of the
   * planet's motion instead of drifting away as the player flies out.
   */
  private static readonly EVA_WAYPOINT_PLANET_LEAD_SECONDS = 3

  /**
   * Launch an overlay-presentation EVA minigame for the POI the player is near.
   * Called by `EvaSession.beginMinigame` via `onStartEvaMinigame`, which only
   * fires when `isInSceneMinigameActive()` returns false — i.e. for overlay-
   * based minigames (telescope, relay, default). In-scene minigames (satellite
   * servicing) are auto-attached on EVA enter via `maybeAttachSatelliteRepair`
   * and never reach this method.
   */
  private beginEvaMinigame(): void {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) {
      this.evaSession?.endMinigame()
      return
    }
    const minigameType = mission.template.minigameType ?? 'default'
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame
    if (minigame.presentation === 'in_scene') {
      console.warn(
        `[MapViewController] In-scene minigame "${minigameType}" reached beginEvaMinigame; auto-attach is missing. Falling back to overlay.`,
      )
    }
    // Disable OrbitControls while the overlay is open. Without this, clicks on
    // or through the overlay can reach the canvas underneath and trigger
    // OrbitControls.setPointerCapture on an element that just lost pointer
    // lock — which throws InvalidStateError.
    if (this.vehicleCamera) this.vehicleCamera.controls.enabled = false
    this.onEvaMinigameChange?.({ mission, minigame })
  }

  /**
   * Close the active EVA minigame without awarding the mission. Disposes both
   * the minigame instance and any active in-scene controller, then emits
   * `onEvaMinigameChange(null)` so the Vue overlay (if mounted) unmounts.
   * Used when the player dismisses the overlay via × button.
   */
  evaMinigameClose(): void {
    if (!this.activeEvaMinigame) return
    this.activeEvaMinigame.dispose()
    this.activeEvaMinigame = null
    this.evaMapMultitoolFacade.setEvaSatelliteServicingScience(null)
    this.satelliteRepairController?.dispose()
    this.satelliteRepairController = null
    if (this.vehicleCamera) this.vehicleCamera.controls.enabled = true
    this.onEvaMinigameChange?.(null)
    this.evaSession?.endMinigame()
  }

  /**
   * Fire the minigame's completion path — pays reward via the facade, closes the
   * overlay, and returns the EVA session to 'active'. Safe to invoke from UI `Complete`
   * button or from the minigame's own logic.
   */
  evaMinigameCompleteFromUi(): void {
    this.activeEvaMinigame?.complete()
  }

  private evaMinigameComplete(missionId: string): void {
    // Snapshot the mission *before* the facade strips it from the active list so
    // the toast/audio fan-out has a stable reference to read reward + name from.
    const completed = this.missionFacade.getActiveEvaMissionAtPoi()
    const giverPlanet = completed?.giverPlanet ?? null
    const payMultiplier = getMissionPayMultiplier(this.playerProfile, giverPlanet)
    const result = this.missionFacade.completeEvaMission({
      missionId,
      profile: this.playerProfile,
      rewardMultiplier: payMultiplier,
      onMissionBoardUpdate: this.onMissionBoardUpdate,
    })
    if (result.creditsChanged) {
      this.playerProfile = result.profile
      saveProfile(this.playerProfile)
      this.onCreditsUpdate?.(this.playerProfile.credits)
      this.shuttleAudio.notifyMissionDelivered()
      if (completed) this.onEvaMissionComplete?.(completed)
    }
    this.activeEvaMinigame?.dispose()
    this.activeEvaMinigame = null
    this.evaMapMultitoolFacade.setEvaSatelliteServicingScience(null)
    this.satelliteRepairController?.dispose()
    this.satelliteRepairController = null
    this.currentAimPrompt = null
    if (this.vehicleCamera) this.vehicleCamera.controls.enabled = true
    this.onEvaMinigameChange?.(null)
    this.evaSession?.endMinigame()
  }

  evaMissionAccept(): void {
    const giverPlanetId = this.missionFacade.board.offeringEvaPlanet
    if (!giverPlanetId) return
    const index = PLANETS.findIndex((p) => p.id === giverPlanetId)
    const giverController = index >= 0 ? this.planetControllers[index] : null
    if (!giverController) return
    const leadTime = this.simTime + MapViewController.EVA_WAYPOINT_PLANET_LEAD_SECONDS
    const future = giverController.predictWorldPosXZ(leadTime)
    const waypoint = generateEvaWaypoint(future.x, future.z, giverPlanetId)
    this.missionFacade.evaMissionAccept(waypoint, this.onMissionBoardUpdate)
  }

  /** Complete the mission minigame (from overlay UI). */
  missionComplete(missionId: string): void {
    this.playerInventory = this.missionFacade.missionComplete({
      missionId,
      inventory: this.playerInventory,
      onMissionOverlay: this.onMissionOverlay,
      onMissionBoardUpdate: this.onMissionBoardUpdate,
      onMissionComplete: this.onMissionComplete,
      audio: this.shuttleAudio,
    })
  }

  /** Deliver a completed mission (from shuttle control UI). */
  missionDeliver(missionId: string): void {
    const mission = this.missionFacade.board.activeMissions.find(
      (entry) => entry.template.id === missionId,
    )
    const giverPlanet = mission?.giverPlanet ?? null
    const payMultiplier = getMissionPayMultiplier(this.playerProfile, giverPlanet)
    const result = this.missionFacade.missionDeliver({
      missionId,
      profile: this.playerProfile,
      inventory: this.playerInventory,
      scienceStationLevel: getCurrentUpgradeValue('shuttleScienceStation') * payMultiplier,
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

  /**
   * Dismisses the orbital mission minigame overlay (Close / ESC) without awarding completion.
   */
  closeMissionOverlay(): void {
    this.missionFacade.closeMissionOverlay({
      onMissionOverlay: this.onMissionOverlay,
    })
  }

  /**
   * Open the tactical map overlay from a UI button. Mirrors the M-key path so the
   * nav-bar Map button uses the same gating (no map while habitat is active, dead,
   * intro-locked, or already approaching an orbit).
   */
  requestOpenMap(): void {
    if (this.mapState.isOpen) return
    if (this.habitatState.isActive) return
    if (this.shuttleController?.dead) return
    if (this.orbitSystem?.state === 'approaching') return
    this.mapState.open()
    this.onOpenMap()
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
    const session = this.shopFacade.session
    const slot = session?.tradeSlots[slotIndex]
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
      if (session && slot) {
        contractSystem.notifyTradeTransaction({
          action: 'buy',
          planetId: session.planetId,
          itemId: slot.itemId,
          quantity,
        })
      }
    }
  }

  /** Sell an item from inventory at the current planet. */
  shopSellItem(itemId: string, quantity: number): void {
    const session = this.shopFacade.session
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
      if (session) {
        contractSystem.notifyTradeTransaction({
          action: 'sell',
          planetId: session.planetId,
          itemId,
          quantity,
        })
      }
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
    this.notifyJourneyTrigger('bought_shuttle_fuel')
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

  /** Repair shuttle hull to 100% at any trading post (250 credits). */
  shopRepairHull(): void {
    if (!this.shipHealth) return
    const result = this.shopFacade.repairHull(this.playerProfile)
    if (!result.ok) return
    this.playerProfile = result.profile
    this.clearShuttleHullPersistTimer()
    this.shipHealth.repairFull()
    this.playerProfile = { ...this.playerProfile, shuttleHullHp: this.shipHealth.hp }
    this.persistPlayerProfile()
    if (this.shopFacade.session) {
      this.emitShopState()
    }
    this.onCreditsUpdate?.(this.playerProfile.credits)
  }

  /**
   * Repair lander hull to 100% at any trading post (updates persisted {@link PlayerProfile.landerHullHp}).
   */
  shopRepairLander(): void {
    const result = this.shopFacade.repairLander(this.playerProfile)
    if (!result.ok) return
    const maxLander = LANDER_BASE_HP * getCurrentUpgradeValue('landerHull')
    this.playerProfile = { ...result.profile, landerHullHp: maxLander }
    this.persistPlayerProfile()
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
    setPlayerUpgradeLevel(upgradeId, targetLevel)
    this.syncMapAfterExternalShuttleInstall(upgradeId, targetLevel, {
      defaultMeta: (defId, level) =>
        defId === 'gravitySurfing'
          ? 'Tier 1 · Grid Coupling Module'
          : `Tier ${level} · Auto-install`,
    })
  }

  /**
   * Map-side follow-up when the contract runtime has already run
   * {@link ensureUpgradeAtLeast} (storage + `CURRENT_PLAYER_UPGRADE_LEVELS`).
   * Aligns the fabric/grid with gravity unlock and fires the same HUD + “installed”
   * overlay as the shop, so Manifold/Space Fabric work without a full reload.
   *
   * @param upgradeId - Install id.
   * @param newLevel - New persisted level.
   * @param contractInboxName - Contract folder name for the overlay meta line.
   */
  syncShuttleUpgradeGrantFromContract(
    upgradeId: UpgradeId,
    newLevel: number,
    contractInboxName: string,
  ): void {
    this.syncMapAfterExternalShuttleInstall(upgradeId, newLevel, {
      defaultMeta: () => `Contract reward · ${contractInboxName}`,
    })
  }

  /**
   * Shared path for contract rewards and consumables after `CURRENT` + storage
   * already hold the new level.
   */
  private syncMapAfterExternalShuttleInstall(
    upgradeId: UpgradeId,
    newLevel: number,
    options: { defaultMeta: (defId: UpgradeId, level: number) => string },
  ): void {
    if (upgradeId === 'gravitySurfing') {
      this.applyGridVisible(true)
      this.emitMapViewLayerToggles()
    }
    this.onUpgradeHudRefresh?.()
    const definition = UPGRADE_DEFINITIONS[upgradeId]
    this.onUpgradeInstalledAnnouncement?.(
      'UPGRADE INSTALLED',
      definition.label,
      newLevel,
      0,
      options.defaultMeta(upgradeId, newLevel),
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
    // EvaSession multiplies shuttle.group.scale by EVA_MAP_HUGE_SHUTTLE at session start
    // and restores on exit. If this tick keeps running it will overwrite that every frame
    // and the ship will stay pinned at 0.01 while the tether rope (radius 0.028) dwarfs it.
    if (this.evaSession?.isActive) return
    const dist = this.vehicleCamera.camera.position.distanceTo(
      this.shuttleController.group.position,
    )
    const halfFovRad = THREE.MathUtils.degToRad(this.vehicleCamera.camera.fov / 2)
    const minWorldSize = MAP_CONFIG.MAP_SHUTTLE_MIN_APPARENT_SIZE * 2 * dist * Math.tan(halfFovRad)
    const requiredScale = minWorldSize / MAP_CONFIG.MAP_SHUTTLE_BASE_SIZE
    const targetScale = Math.max(MAP_CONFIG.MAP_SHUTTLE_SCALE, requiredScale)
    const overscale = targetScale / MAP_CONFIG.MAP_SHUTTLE_SCALE
    const reticleT = THREE.MathUtils.clamp(
      (overscale - MAP_CONFIG.MAP_RETICLE_FADE_START) /
        (MAP_CONFIG.MAP_RETICLE_FADE_END - MAP_CONFIG.MAP_RETICLE_FADE_START),
      0,
      1,
    )
    const reticleAlpha = reticleT * reticleT * (3 - 2 * reticleT)
    const orbitState = this.orbitSystem?.state ?? 'free'
    const slingshotCameraResetActive =
      this.shuttleController.slingshotBurstActive || this.orbitFacade.exitCameraActive
    this.vehicleCamera.setIdleRecenterSuppressed(
      orbitState === 'free' && reticleAlpha > 0.005 && !slingshotCameraResetActive,
    )
    this.applyOrbitBloomClamp(overscale)
    this.currentShuttleScale = THREE.MathUtils.lerp(
      this.currentShuttleScale,
      targetScale,
      Math.min(1, MAP_CONFIG.MAP_SHUTTLE_SCALE_LERP * dt),
    )
    this.shuttleController.group.scale.setScalar(this.currentShuttleScale)

    this.sceneVisuals?.updateShipReticle({
      shuttlePosition: this.shuttleController.group.position,
      shuttleHeadingRad: this.shuttleController.heading,
      shuttleScale: this.currentShuttleScale,
      isFreeFlight: this.orbitSystem?.state === 'free',
      dt,
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
      audio: this.shuttleAudio,
    })
  }

  private respawnAtLastDockedPlanet(): void {
    if (!this.shuttleController || !this.orbitSystem) return

    // Ship destroyed — cargo gone; credits kept; shuttle contracts / active asteroid mission voided.
    this.shopFacade.clear(
      this.onShopButton,
      this.onShopState,
      this.playerProfile,
      this.playerInventory,
    )
    this.cosmeticShopFacade.clear(
      this.onCosmeticShopButton,
      this.onCosmeticShopState,
      this.playerProfile,
      this.playerInventory,
    )
    const respawnState = this.lifeCycleFacade.buildRespawnPlayerState(this.playerProfile, () =>
      this.inventoryWithStarterFuelCells(this.createInventoryForCurrentCargoBayLevel()),
    )
    this.playerProfile = respawnState.playerProfile
    this.playerInventory = respawnState.playerInventory
    this.clearShuttleHullPersistTimer()
    if (this.shipHealth) {
      this.playerProfile = { ...this.playerProfile, shuttleHullHp: this.shipHealth.maxHp }
    }
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

    const planetController = this.getRespawnPlanetController()
    const didRespawn = this.lifeCycleFacade.respawnAtPlanet({
      shuttleController: this.shuttleController,
      vehicleCamera: this.vehicleCamera,
      sceneVisuals: this.sceneVisuals,
      shipHealth: this.shipHealth,
      orbitFacade: this.orbitFacade,
      planetController,
      isEmissiveMaterial,
    })
    if (!didRespawn) return

    // Reset slingshot state
    this.gravitySurfingController.reset(this.getGravitySurfingDeps())
    this.orbitalSurfingController.reset(this.getOrbitalSurfingDeps())
    this.manifoldSpline?.hide()
    this.clearGravitySurfVisuals()
    this.yRecovery = false
    this.adriftTimer = 0
    this.resetWorldLineHistory()
    this.updateMissionState()
  }

  /** Place the shuttle near the saved docked planet, falling back to Earth for older/invalid saves. */
  private spawnShuttleAtLastDockedPlanet(): void {
    if (!this.shuttleController) return
    const controller = this.getRespawnPlanetController()
    if (!controller) return
    const px = controller.getWorldX()
    const pz = controller.getWorldZ()
    const awayFromSun = Math.atan2(pz, px)
    this.shuttleController.group.position.set(
      px + Math.cos(awayFromSun) * MAP_CONFIG.SPAWN_OFFSET_BEHIND_EARTH,
      0,
      pz + Math.sin(awayFromSun) * MAP_CONFIG.SPAWN_OFFSET_BEHIND_EARTH,
    )
  }

  /** Resolve the saved respawn planet controller with Earth fallback when the save is missing/invalid. */
  private getRespawnPlanetController(): PlanetSystemController | null {
    const savedPlanetId = this.playerProfile.lastDockedPlanetId ?? 'earth'
    return this.getPlanetControllerById(savedPlanetId) ?? this.getPlanetControllerById('earth')
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
   * Compute zone-based thermal protection caps for the current sun distance.
   *
   * Each thermal upgrade level defines a protection zone keyed to a planet group.
   * Protection has two tiers based on how the player's level compares to the zone:
   *
   * - **Exact match** (`upgradeLevel === zoneLevel`): temperature capped at `protectedTempCap`
   *   (75% bar), hull damage suppressed.
   * - **Over-leveled** (`upgradeLevel > zoneLevel`): full immunity — temperature clamped at 0,
   *   bar invisible, no thermal effect at all.
   * - **Under-leveled** (`upgradeLevel < zoneLevel`): no protection, natural behaviour.
   *
   * Heat zones (inner → outer): Sun proximity (lvl 3) → Mercury (lvl 2) → Venus (lvl 1)
   * Cold zones (closer → farther): Jupiter/Saturn (lvl 2) → Uranus/Neptune/Pluto (lvl 3)
   *
   * @param sunDist - Current distance from the Sun in world units
   * @returns `heatCap` (positive clamp) and `coldCap` (negative clamp) for `tick()`
   */
  private computeThermalCaps(sunDist: number): { heatCap: number; coldCap: number } {
    const heatLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleHeatResistance ?? 0
    const coldLevel = CURRENT_PLAYER_UPGRADE_LEVELS.shuttleFreezeResistance ?? 0
    return (
      this.healthFacade.getThermalCaps(sunDist, heatLevel, coldLevel) ?? {
        heatCap: 100,
        coldCap: -100,
      }
    )
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
   * @param bodyId - Case-insensitive catalog id: `sun`, planet id, or pinned body id.
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
        `[MapView] warp("earth") - ids: sun, ${this.renderedSolarBodies
          .map((p) => p.id)
          .join(', ')}`,
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

    const planet = this.renderedSolarBodies.find((p) => p.id === key)
    if (!planet) {
      console.warn(`[MapView] warp: unknown body "${bodyId}"`)
      console.info(`[MapView] Try: sun, ${this.renderedSolarBodies.map((p) => p.id).join(', ')}`)
      return
    }

    const idx = this.renderedSolarBodies.indexOf(planet)
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

  /**
   * Warp the shuttle into a stable orbit standoff position above the requested
   * planet and immediately request that the tactical map close. Used by the
   * fast-travel UI: callers should run their own fade transition around this
   * call so the warp is invisible.
   *
   * @param planetId - Catalog id of the destination planet (lowercase). The
   *                   sun is intentionally rejected — fast travel is for
   *                   planet-to-planet jumps only.
   * @returns `true` when the warp ran, `false` when the id was unknown or the
   *          shuttle is not ready.
   */
  public fastTravelToPlanet(planetId: string): boolean {
    const key = planetId.trim().toLowerCase()
    if (!key || key === 'sun') {
      console.warn(`[MapView] fastTravel: invalid planetId "${planetId}"`)
      return false
    }
    if (!this.shuttleController) {
      console.warn('[MapView] fastTravel: shuttle not ready')
      return false
    }
    const planet = PLANETS.find((p) => p.id === key)
    if (!planet) {
      console.warn(`[MapView] fastTravel: unknown planet "${planetId}"`)
      return false
    }
    this.devWarpNearBody(key)
    if (this.mapState.isOpen) {
      this.mapState.close()
    }
    return true
  }

  /**
   * Drain the given fraction of the shuttle's *current* fuel reserves. Used by
   * the fast-travel flow to charge the burn cost — `0.8` removes 80% of what
   * the shuttle currently has and leaves the remaining 20% in the tank.
   *
   * @param fraction - 0..1 portion of current fuel to consume.
   * @returns Fuel units actually drained (0 when the shuttle is unavailable).
   */
  public consumeShuttleFuelFraction(fraction: number): number {
    if (!this.shuttleController) return 0
    if (!Number.isFinite(fraction) || fraction <= 0) return 0
    const ts = this.shuttleController.thrusterSystem
    const drain = Math.min(ts.fuelLevel, ts.fuelLevel * Math.max(0, Math.min(1, fraction)))
    if (drain <= 0) return 0
    ts.consumeFuel(drain)
    return drain
  }

  /**
   * Snap the shuttle into a stable orbit around the named planet, mirroring the
   * effect of the player pressing the orbit-action key from a clean approach.
   * Used as the auto-capture step after a fast-travel jump so the player isn't
   * dropped in free flight and forced to engage capture themselves.
   *
   * @param planetId - Catalog id of the planet to orbit. The sun is rejected
   *                   because forced orbit only applies to planets.
   * @returns `true` when the orbit was engaged, `false` when the id was unknown
   *          or required runtime systems are unavailable.
   */
  public lockOrbitAtPlanet(planetId: string): boolean {
    const key = planetId.trim().toLowerCase()
    if (!key || key === 'sun') return false
    if (!this.shuttleController) return false
    const planet = PLANETS.find((p) => p.id === key)
    if (!planet) return false
    const idx = PLANETS.indexOf(planet)
    const ctrl = this.planetControllers[idx]
    if (!ctrl) return false
    this.orbitFacade.beginForcedOrbit(ctrl.getWorldX(), ctrl.getWorldZ(), {
      shuttleController: this.shuttleController,
      vehicleCamera: this.vehicleCamera,
      sceneVisuals: this.sceneVisuals,
    })
    // Persist the new "home" planet so a refresh respawns the player here.
    // Going through the achievement tracker isn't enough — fast travel doesn't
    // exit the `orbiting` capture state (player jumps planet→planet), so the
    // non-orbiting → orbiting transition that normally records this never fires.
    const profileBeforeOrbitRecord = this.playerProfile
    let next = recordSolarBodyFirstOrbit(this.playerProfile, key)
    next = setLastDockedPlanet(next, key)
    if (next !== this.playerProfile) {
      this.playerProfile = next
      this.persistPlayerProfile()
      this.emitShopState()
    }
    this.maybeNotifyFirstJupiterOrbitJourneyTrigger(profileBeforeOrbitRecord)
    this.tryEnqueueFantasiaIntroMail(key)
    return true
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

    // Hide the world-space fabric grid for tac map — the overlay draws its own
    // CSS backdrop. Player's grid toggle preference is captured here so it can be
    // restored unchanged when the map closes.
    if (this.spaceTimeGrid) {
      this.spaceTimeGridVisibleBeforeTacMap = this.spaceTimeGrid.mesh.visible
      this.spaceTimeGrid.mesh.visible = false
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

    this.clearGravitySurfVisuals()

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

    // Restore the pre-tac-map grid visibility — preserves the player's toggle.
    if (this.spaceTimeGrid && this.spaceTimeGridVisibleBeforeTacMap !== null) {
      this.spaceTimeGrid.mesh.visible = this.spaceTimeGridVisibleBeforeTacMap
      this.spaceTimeGridVisibleBeforeTacMap = null
    }

    // Hide overlay
    this.onMapOverlay?.(this.modeCoordinator.buildHiddenMapOverlayState())
  }

  private clearGravitySurfVisuals(): void {
    if (this.gravitySurfPass) {
      this.gravitySurfPass.uniforms.intensity!.value = 0
    }
    this.shuttleEffects?.setGravitySurfing(false, 0)
  }

  /** Record the current ship position into the persistent sampled world line. */
  private recordWorldLinePoint(): void {
    if (!this.shuttleController) return
    const segmentDistance = this.overlayProjector.recordWorldLinePoint(
      {
        orbitState: this.orbitSystem?.state ?? 'free',
        shipX: this.shuttleController.position.x,
        shipZ: this.shuttleController.position.z,
        shipDead: this.shuttleController.dead,
      },
      mapOverlayData.worldLineSampleDistance,
    )
    if (segmentDistance > 0) {
      this.currentRunWorldLineDistance += segmentDistance
      this.playerProfile = recordWorldLineDistance(
        this.playerProfile,
        segmentDistance,
        this.currentRunWorldLineDistance,
      )
      this.persistPlayerProfileAndSyncProgress()
    }
  }

  /** Reset the world line at the start of a new run and seed it with the current ship position. */
  private resetWorldLineHistory(): void {
    if (!this.shuttleController) {
      this.overlayProjector.reset(
        { orbitState: 'free', shipX: 0, shipZ: 0, shipDead: true },
        mapOverlayData.worldLineSampleDistance,
      )
      this.currentRunWorldLineDistance = 0
      return
    }
    this.overlayProjector.reset(
      {
        orbitState: this.orbitSystem?.state ?? 'free',
        shipX: this.shuttleController.position.x,
        shipZ: this.shuttleController.position.z,
        shipDead: this.shuttleController.dead,
      },
      mapOverlayData.worldLineSampleDistance,
    )
    this.currentRunWorldLineDistance = 0
  }

  /** Compute and emit the full map overlay state for the Vue HUD. */
  private emitMapOverlay(): void {
    if (!this.mapCamera || !this.shuttleController || !this.onMapOverlay) return
    const state = this.overlayProjector.buildOverlayState({
      mapCamera: this.mapCamera,
      shipX: this.shuttleController.position.x,
      shipZ: this.shuttleController.position.z,
      heading: this.shuttleController.heading,
      speed: this.shuttleController.speed,
      shipDead: this.shuttleController.dead,
      sunController: this.sunController,
      planetControllers: this.planetControllers,
      shipHealthConfig: this.shipHealthConfig,
      activeAsteroidMission: this.missionBoard.activeAsteroidMission,
      gravityConfig: MAP_CONFIG.MAP_GRAVITY_CONFIG,
      overlayData: mapOverlayData,
    })
    if (state) this.onMapOverlay(state)
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

  /** Skip the startup intro immediately and return the player to normal map control. */
  skipIntro(): void {
    const shouldAutoEnterHabitat = !this.playerProfile.hasSeenIntro
    this.clearStartupCinematicOrbitHandoff()
    this.mapIntro.skip()
    this.markMapIntroSeenAndSyncProfile()
    if (this.vehicleCamera) {
      this.vehicleCamera.controls.enabled = true
    }
    this.restoreIntroMapLayers()
    this.shuttleController?.setInputEnabled(true)
    if (this.sceneObjects?.scene) {
      this.introFacade?.dispose(this.sceneObjects.scene)
    }
    if (shouldAutoEnterHabitat) {
      this.setEarthStartupOrbitHudSuppressed(true)
      this.cancelPostStartupIntroHabitatTimer()
      this.postStartupIntroHabitatTimerHandle = Timer.after(
        MAP_CONFIG.POST_STARTUP_INTRO_HABITAT_DELAY_SEC,
        () => {
          this.postStartupIntroHabitatTimerHandle = null
          this.tryEnterHabitatAfterStartupIntro()
        },
      )
    }
    this.emitIntroUiState()
  }

  /**
   * Start the opening cutscene for first-time Earth-orbit spawns.
   *
   * The startup message is enqueued separately before this runs, but the
   * cinematic itself should not be cancelled just because the inbox has not
   * surfaced an active row on this exact frame.
   */
  private beginStartupIntro(): void {
    if (!this.vehicleCamera) {
      this.clearStartupCinematicOrbitHandoff()
      this.mapIntro.skip()
      this.markMapIntroSeenAndSyncProfile()
      this.emitIntroUiState()
      return
    }

    this.awaitingStartupCinematicOrbitHandoff = true
    this.suppressIntroMapLayers()
    this.vehicleCamera.controls.enabled = false
    this.vehicleCamera.setConfig(MAP_ORBIT_CAMERA_CONFIG)
    this.introFacade?.resetCamera()
    // Hold the cinematic until intro GLBs (virus, city) are ready so step-bound props
    // are guaranteed in-cache before zoom_virus / zoom_city. Without this, slow networks
    // race the step transitions and the prop never appears in-frame.
    MapIntroFacade.whenPreloaded().then(() => {
      if (!this.awaitingStartupCinematicOrbitHandoff) return
      this.mapIntro.start({ skipBlockingMessageAfterCinematic: true })
      this.emitIntroUiState()
    })
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
   * Beat 1: Wide solar system → Phobos
   * Beat 2: Hold on Phobos (discovery)
   * Beat 3: Viroid reveal (VirusModel prop)
   * Beat 4a: Sweep to Jupiter
   * Beat 4b: Cloud city reveal (CityModel prop)
   * Beat 5: Sweep to shuttle, hero hold, orbit handoff
   */
  private tickStartupIntroCamera(): void {
    // EVA and turret both own the render camera while active. Letting the
    // intro facade run would reset `renderPass.camera` back to the vehicle
    // camera each frame, making the FP view invisible.
    if (this.evaSession?.isActive) return
    if (this.turretSessionController?.isActive) return
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
    const state = this.mapIntro.uiState
    const name = (this.playerProfile.name ?? '').trim() || 'PILOT'
    const caption = state.cinematicCaption.replace('{name}', name.toUpperCase())
    this.onMapIntro?.(
      caption === state.cinematicCaption ? state : { ...state, cinematicCaption: caption },
    )
  }

  /**
   * Snap the hidden pre-play frame to the actual ready-state camera so returning players
   * see the parked shuttle view instead of the orbit-setup transition frame.
   */
  private syncPreparedReadyFrame(): void {
    if (this.portalArrival?.isArrival) {
      this.tickStartupIntroCamera()
      return
    }

    if (this.playerProfile.hasSeenIntro && this.vehicleCamera) {
      this.vehicleCamera.tick(0)
      return
    }

    this.tickStartupIntroCamera()
  }

  private emitBootState(phase: MapViewBootState['phase'], label: string): void {
    this.onBootState?.({ phase, label })
  }

  /**
   * Stage a special mission as the active asteroid mission and enqueue its
   * offer message into the relevant inbox folder. Overwrites any existing
   * offered/active asteroid mission slot.
   *
   * @param missionId - Special mission id from `SPECIAL_MISSIONS`.
   * @param offerMessageId - Message id from the catalog enqueued before staging.
   */
  /**
   * Snapshot the current world XZ position of every planet controller
   * (planets + pinned bodies). Used by `resolveSpecialMissionWaypoint` to
   * overlay an accurate target position on the special mission's pre-baked
   * waypoint.
   *
   * @returns Map from body id to world XZ.
   */
  private snapshotBodyWorldPositions(): Map<string, WorldPositionXZ> {
    const map = new Map<string, WorldPositionXZ>()
    for (const controller of this.planetControllers) {
      const id = controller.id
      if (typeof id !== 'string' || id.length === 0) continue
      map.set(id, { x: controller.getWorldX(), z: controller.getWorldZ() })
    }
    return map
  }

  private stageSpecialMission(missionId: string, offerMessageId: string | null): void {
    const mission = getSpecialMissionById(missionId)
    if (!mission) {
      console.warn(`[MapView] Special mission not found: ${missionId}`)
      return
    }

    if (offerMessageId !== null) {
      this.messageFacade.enqueueById(offerMessageId, this.onMessageUpdate)
    }

    const positions = this.snapshotBodyWorldPositions()
    const resolvedWaypoint = resolveSpecialMissionWaypoint(
      mission.asteroidId,
      positions,
      mission.waypoint,
    )

    const acceptedMission: GeneratedAsteroidMission = {
      ...mission,
      status: 'accepted',
      waypoint: resolvedWaypoint,
    }
    this.missionBoard = {
      ...this.missionBoard,
      offeredAsteroidMission: null,
      activeAsteroidMission: acceptedMission,
    }
    saveActiveMission(acceptedMission)
    saveMissionBoard(this.missionBoard)
    this.onMissionBoardUpdate?.(this.missionBoard)
  }

  /** Stage the Act 1 climax Consortium Certification mission. */
  private stageConsortiumCertification(): void {
    this.stageSpecialMission('consortium-certification', 'consortium-certification-offer')
  }

  /**
   * Auto-stage a special mission when a contract step that carries
   * `specialMissionId` becomes the current step. Idempotent: skips if the
   * same special mission is already the active asteroid mission, on the
   * board, or persisted from a prior session.
   *
   * @param payload - The activation payload from `ContractSystem`.
   */
  private handleContractStepActivated(payload: ContractStepActivatedPayload): void {
    const missionId = payload.specialMissionId
    if (!missionId) return

    const offerMessageId = SPECIAL_MISSION_OFFER_IDS[missionId]
    if (!offerMessageId) {
      console.warn(`[MapView] No offer-message id for special mission: ${missionId}`)
      return
    }

    const activeId = this.missionBoard.activeAsteroidMission?.id
    if (activeId === missionId) return
    const stored = loadActiveMission()
    if (stored?.id === missionId) return

    this.stageSpecialMission(missionId, offerMessageId)
  }

  /**
   * Self-heal: walk active contract instances and re-stage any
   * `specialMissionId`-bearing current step whose mission isn't currently in
   * the active asteroid slot. Covers the case where the original step
   * transition fired while MapViewController was unmounted (e.g. while the
   * player was in `/level` completing the prior special mission). Replay
   * does NOT re-enqueue the offer message — the player already received it
   * at the original transition.
   *
   * Idempotent: skips when the slot already holds the right mission.
   */
  private replayActiveContractStepStaging(): void {
    for (const instance of contractSystem.listInstances()) {
      if (instance.status !== 'active') continue
      const contract = contractSystem.getContract(instance.contractId)
      if (!contract) continue
      const step = contract.steps[instance.currentStepIndex]
      if (!step || (step.kind !== 'complete-missions' && step.kind !== 'choice-mission')) continue
      if (step.specialMissionId === undefined) continue

      const missionId = step.specialMissionId
      if (!SPECIAL_MISSION_OFFER_IDS[missionId]) continue

      const activeId = this.missionBoard.activeAsteroidMission?.id
      if (activeId === missionId) continue

      this.stageSpecialMission(missionId, null)
    }
  }

  /**
   * Read-only check: should the Jovian epilogue fire on this map mount?
   * Returns `true` when the contract resolved with the `transmit` outcome AND
   * the player has not yet seen the video. Idempotent — safe to call repeatedly.
   */
  shouldFireJovianEpilogue(): boolean {
    const profile = typeof localStorage === 'undefined' ? null : loadProfile()
    if (!profile) return false
    if (profile.seenJovianEpilogue === true) return false
    const instance = contractSystem.getInstance('jovian-society-prospection')
    if (!instance) return false
    if (instance.status !== 'completed') return false
    if (instance.resolvedOutcomeId !== 'transmit') return false
    return true
  }

  /**
   * If {@link shouldFireJovianEpilogue} is true, schedule a 5-second
   * {@link Timer.after} that fires {@link onJovianEpilogueDue}. The callback
   * re-checks the condition at fire time so a double-mount within the delay
   * window does not show the video twice.
   */
  private scheduleJovianEpilogueIfDue(): void {
    if (!this.shouldFireJovianEpilogue()) return
    Timer.after(5, () => {
      if (this.shouldFireJovianEpilogue()) {
        this.onJovianEpilogueDue?.()
      }
    })
  }

  /**
   * When all three inner-system contracts are complete and the player has not yet
   * acquired (or started acquiring) gravity surfing, stage the Consortium message
   * and active asteroid mission. Guarded on derived state only — idempotent across
   * repeat calls. Intended to be invoked after each `contract_completed` event.
   *
   * If the player already has the **Grid Coupling Module** in the shuttle hold, the
   * pickup run is done — do not re-post the same mission (otherwise every map load
   * after exfil re-spawns the belt waypoint and asteroid until the install step).
   */
  private maybeStageAct1Climax(): void {
    for (const id of ACT_1_CONTRACT_IDS) {
      const instance = contractSystem.getInstance(id)
      if (!instance || instance.status !== 'completed') return
    }

    const gravitySurfingLevel = CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing ?? 0
    if (gravitySurfingLevel >= 1) return

    const hasGridCoupling =
      (getStack(this.playerInventory, 'grid-coupling-module')?.quantity ?? 0) > 0
    if (hasGridCoupling) return

    const activeMissionId = this.missionBoard.activeAsteroidMission?.id
    if (activeMissionId === 'consortium-certification') return

    const storedActive = loadActiveMission()
    if (storedActive?.id === 'consortium-certification') return

    this.stageConsortiumCertification()
  }

  /**
   * Replay journey triggers for saves loaded mid-progress: contract accept/completion,
   * first Jupiter orbit (Act II gate), and Act 1's orbital-surf climax key.
   *
   * `contract_accepted` is fired before `contract_completed` so the Act 1
   * `startTrigger` gate opens before any step-advance triggers run.
   * `first_orbit:jupiter` replays before `contract_completed` so Act II's start gate opens first.
   */
  private replayAct1JourneyTriggers(): void {
    // Returning saves (past the opening cinematic) arm the journey UI immediately
    // so mid-session gate-opens (e.g. accepting USC from the map-side shuttle
    // overlay) can surface their banner without requiring a fresh habitat entry.
    if (this.playerProfile.hasSeenIntro) {
      this.journeyFacade.armed = true
    }
    for (const instance of contractSystem.listInstances()) {
      if (instance.status === 'active' || instance.status === 'completed') {
        this.notifyJourneyTrigger(`contract_accepted:${instance.contractId}`)
      }
    }
    // Act II start gate — before `contract_completed` replay so the gate opens first.
    if ((this.playerProfile.orbitedSolarBodies['jupiter'] ?? 0) > 0) {
      this.notifyJourneyTrigger('first_orbit:jupiter')
    }
    for (const instance of contractSystem.listInstances()) {
      if (instance.status === 'completed') {
        this.notifyJourneyTrigger(`contract_completed:${instance.contractId}`)
      }
    }
    if ((this.playerProfile.achievementStats.manifoldRides ?? 0) >= 1) {
      this.notifyJourneyTrigger('orbital_surf_completed')
    }
    this.maybeStageAct1Climax()
    // Returning from /level remounts MapView and constructs a fresh controller:
    // `journeyTrackerVisible` starts at its default (false). If the player has an
    // active journey that's already been announced (so the replays above returned
    // `changed: false` and skipped the visibility toggle), this call falls through
    // the facade's "no pending announcement" branch and flips the tracker back on.
    // No banner fires because the journey is already in `announcedJourneyStartIds`.
    this.journeyFacade.tryAnnounceNextStart()
  }

  /** Dev-only: enqueue the Consortium message and start its authored special mission immediately. */
  private devStartConsortiumCertificationMessage(): void {
    this.stageConsortiumCertification()
  }

  /** Dev-only: open any orbital minigame overlay by gather-item id. */
  private devOpenOrbitalMinigame(gatherItem: string, quantity = 5): void {
    if (!import.meta.env.DEV) return
    const entry = Object.values(PLANET_ORBITAL_CONFIGS).find((c) => c.gatherItem === gatherItem)
    if (!entry) {
      console.warn(
        `[dev] Unknown gather item "${gatherItem}". Valid items:`,
        Object.values(PLANET_ORBITAL_CONFIGS).map((c) => c.gatherItem),
      )
      return
    }
    const missionId = `dev-${entry.minigameType}-test`
    const fakeMission = {
      template: {
        id: missionId,
        name: `DEV: ${entry.minigameType}`,
        description: `Dev tool — testing the ${entry.minigameType} minigame at ${entry.planetId}.`,
        targetPlanet: entry.planetId,
        gatherQuantity: quantity,
        reward: 0,
      },
      giverPlanet: 'earth',
      status: 'active' as const,
    }
    this.missionFacade.activeMinigame?.dispose()
    this.missionFacade.activeMinigame = createOrbitalMiniGame(
      missionId,
      entry.minigameType,
      quantity,
      entry.planetId,
    )
    this.missionFacade.overlayOpen = true
    this.onMissionOverlay?.(true, fakeMission, true)
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

  /**
   * Park the perspective {@link VehicleCamera} on the mission focus target.
   * Planet focuses resolve the live world position at call time. While
   * parked, OrbitControls rotates/zooms around the waypoint (lookAt), not
   * the shuttle.
   *
   * @param row - The clicked tracker row (drives both camera focus and selection).
   */
  public focusOnMissionTarget(row: MissionTrackerRow): void {
    if (!this.vehicleCamera) return
    const lookAt = this.resolveMissionFocusWorldPosition(row.focus)
    if (!lookAt) return
    const cameraPos = lookAt
      .clone()
      .add(
        new THREE.Vector3(
          MISSION_FOCUS_CAMERA_DISTANCE,
          MISSION_FOCUS_CAMERA_HEIGHT,
          MISSION_FOCUS_CAMERA_DISTANCE,
        ),
      )
    this.vehicleCamera.parkAt(cameraPos, lookAt)
    if (this.shuttleController) {
      this.shuttleController.freeze()
      this.shuttleController.setInputEnabled(false)
    }
    this.missionFocusActive.value = true
    this.selectedMissionRowId.value = row.id
    this.missionFacade.setSelectedMissionRowId(row.id)
  }

  /**
   * Clear the highlighted tracker row (and re-tint the world-space waypoint
   * back to the default color). Called when the selected mission disappears
   * from the board.
   */
  public clearSelectedMissionRow(): void {
    if (this.selectedMissionRowId.value === null) return
    this.selectedMissionRowId.value = null
    this.missionFacade.setSelectedMissionRowId(null)
  }

  /**
   * Return the camera to follow the shuttle and resume the simulation. Safe
   * to call when no focus is active (becomes a no-op).
   */
  public clearMissionFocus(): void {
    if (!this.missionFocusActive.value) return
    this.missionFocusActive.value = false
    if (this.shuttleController) {
      this.shuttleController.unfreeze()
      this.shuttleController.setInputEnabled(true)
    }
    if (this.vehicleCamera && this.shuttleController) {
      this.vehicleCamera.setTarget(this.shuttleController.group)
    }
  }

  /**
   * Resolve a {@link MissionTrackerFocus} to a world-space {@link THREE.Vector3}
   * (Y=0 plane). Returns `null` if a planet id can't be resolved.
   *
   * @param focus - The {@link MissionTrackerFocus} to resolve.
   * @returns Live world position on the Y=0 plane, or `null` if unresolvable.
   */
  private resolveMissionFocusWorldPosition(focus: MissionTrackerFocus): THREE.Vector3 | null {
    if (focus.kind === 'world') {
      return new THREE.Vector3(focus.worldX, 0, focus.worldZ)
    }
    const controller = this.getPlanetControllerById(focus.planetId)
    if (!controller) return null
    return new THREE.Vector3(controller.getWorldX(), 0, controller.getWorldZ())
  }

  /** Lazy-init the turret session controller on first T press. Reuses the EVA scene-host adapter for camera swapping. */
  private ensureTurretSessionController(): TurretSessionController {
    if (!this.turretSessionController) {
      const host = this.buildEvaSceneHost()
      if (!host) {
        throw new Error('Cannot open turret before scene objects are ready')
      }
      this.turretSessionController = new TurretSessionController({
        shuttleController: this.shuttleController!,
        beltControllers: this.beltControllers,
        host,
        commitInventoryUnit: (itemId) => {
          const result = addItem(this.playerInventory, itemId, 1)
          if (!result.ok) return { ok: false as const, reason: result.reason ?? 'Inventory full' }
          this.playerInventory = result.inventory
          saveInventory(this.playerInventory)
          this.emitShopState()
          return { ok: true as const }
        },
        onResourcePickup: (itemId, quantity, label) => {
          this.onResourcePickup?.(itemId, quantity, label)
          uiAudio.notifyItemCollected()
        },
        onResourcePickupFailed: this.onResourcePickupFailed ?? undefined,
        onFadeOpacity: (op) => this.onTurretFade?.(op),
        onHudState: (state) => this.onTurretHudState?.(state),
        onBeamActivated: () => uiAudio.notifyLaserFire(),
      })
    }
    return this.turretSessionController
  }

  /**
   * True whenever a map-level sequence or overlay has paused the solar-system sim.
   *
   * The magenta cosmetic kiosk is a Vue overlay like the tactical map; while it is
   * open, the orrery should stop advancing planet and belt positions behind it.
   */
  private isSimulationFrozen(): boolean {
    return (
      this.simFrozen ||
      this.turretSimFrozen ||
      this.cosmeticShopFacade.dialogOpen ||
      this.missionFocusActive.value
    )
  }

  /**
   * Compute compass bearings from the shuttle to all planets and the Sun.
   * Each bearing is relative to the camera view direction projected onto XZ.
   */
  private computeCompassBearings(): CompassBearing[] {
    if (!this.shuttleController || !this.vehicleCamera) return []
    const cam = this.vehicleCamera.camera
    const target = this.vehicleCamera.controls.target
    const targets: CompassTargetInput[] = [
      { label: COMPASS_LABELS['sun']!, color: COMPASS_SUN_COLOR, x: 0, z: 0 },
      ...this.planetControllers.map((controller) => ({
        label: COMPASS_LABELS[controller.id] ?? controller.id.slice(0, 2).toUpperCase(),
        color: controller.accentColor,
        x: controller.getWorldX(),
        z: controller.getWorldZ(),
      })),
    ]
    return computeCompassBearings({
      shipX: this.shuttleController.position.x,
      shipZ: this.shuttleController.position.z,
      cameraX: cam.position.x,
      cameraZ: cam.position.z,
      targetX: target.x,
      targetZ: target.z,
      targets,
    })
  }

  /**
   * Push a single ShuttleTelemetry frame to the HUD. Extracted so both the
   * normal gameplay tick and the early-return turret branch can call it —
   * the turret needs telemetry too so the MINE gauge shows live charge.
   */
  private emitShuttleTelemetry(): void {
    if (!this.shuttleController || !this.onTelemetry) return
    const ts = this.shuttleController.thrusterSystem
    const manifoldPrompt = this.orbitalSurfingController.getAttachPrompt(
      this.getOrbitalSurfingDeps(),
    )
    const gravitySurfPrompt =
      !manifoldPrompt &&
      this.gravitySurfingController.canShowAttachPrompt(this.getGravitySurfingDeps())
        ? 'Q GRAVITY SURF'
        : null
    const turretMining = ts.getState('turretMining')
    this.onTelemetry({
      speed: this.shuttleController.speed,
      heading: this.shuttleController.heading,
      posX: this.shuttleController.position.x,
      posZ: this.shuttleController.position.z,
      actionPrompt: this.currentEvaPrompt ?? manifoldPrompt ?? gravitySurfPrompt,
      fuelLevel: ts.fuelLevel,
      fuelCapacity: ts.fuelCapacity,
      thrustCharge: ts.getState('thrust').charge,
      thrustCapacity: ts.getState('thrust').capacity,
      brakeCharge: ts.getState('brake').charge,
      brakeCapacity: ts.getState('brake').capacity,
      rcsCharge: ts.getState('rcs').charge,
      rcsCapacity: ts.getState('rcs').capacity,
      turretMiningCharge: turretMining.charge,
      turretMiningCapacity: turretMining.capacity,
      turretActive: this.turretSessionController?.isActive ?? false,
      adriftCountdown: this.adriftTimer > 0 ? MAP_CONFIG.ADRIFT_TIMEOUT - this.adriftTimer : -1,
      hp: this.shipHealth?.hp ?? 100,
      maxHp: this.shipHealth?.maxHp ?? 100,
      temperature: this.shipHealth?.temperature ?? 0,
      temperatureVisible: this.shipHealth?.temperatureVisible ?? false,
      damageIntensity: this.shipHealth?.damageIntensity ?? 0,
      compassBearings: this.computeCompassBearings(),
    })
  }

  /**
   * Clamp map bloom when the constant-screen-size shuttle scaler has pushed the ship far above
   * its baseline map size. Thin wrapper around {@link MapBloomController.applyOrbitClamp} so
   * call sites don't need to thread inspect mode through separately.
   */
  private applyOrbitBloomClamp(overscale: number): void {
    this.bloomController.applyOrbitClamp({ overscale, inspectMode: this.inspectMode })
  }

  /**
   * Minimal {@link EvaSceneHost} adapter backed by `sceneObjects`. `setActiveCamera` swaps
   * the first pass of the EffectComposer the same way {@link captureMapCamera} does when
   * switching to the tactical map.
   */
  private buildEvaSceneHost(): EvaSceneHost | null {
    if (!this.sceneObjects) return null
    const sceneObjects = this.sceneObjects
    const getDefaultCamera = (): THREE.PerspectiveCamera | null =>
      this.vehicleCamera?.camera ?? null
    return {
      renderer: sceneObjects.renderer,
      addToScene: (obj) => sceneObjects.scene.add(obj),
      removeFromScene: (obj) => sceneObjects.scene.remove(obj),
      setActiveCamera: (camera) => {
        const pass = sceneObjects.composer.passes[0] as RenderPass | undefined
        if (!pass) return
        const next = camera ?? getDefaultCamera() ?? pass.camera
        if (camera) {
          const domElement = sceneObjects.renderer.domElement
          camera.aspect = domElement.clientWidth / domElement.clientHeight
          camera.updateProjectionMatrix()
        }
        pass.camera = next
      },
    }
  }

  /**
   * Handles scene bookkeeping when EVA mode changes — bloom swap,
   * orbit / fabric / label HUD suppression ({@link beginEvaMapLayerSuppression} /
   * {@link endEvaMapLayerSuppression}), and forwarding to the external callback.
   * Extracted from the inline `onEvaModeChange` lambda so `createEvaSession` can also call
   * `maybeAttachSatelliteRepair` / `teardownSatelliteRepairOnExit` before it.
   *
   * @param active - True when EVA is starting; false when it is ending.
   */
  private handleEvaModeChange(active: boolean): void {
    if (active) {
      // Spacetime-grid bumps mean the parked shuttle's Y can be on the same side of
      // the orbital plane as a randomly-generated POI Y, collapsing the intended
      // vertical separation. Flip the POI to the opposite side at EVA enter so the
      // satellite is reliably above-or-below the ship, never visually stacked.
      const shuttleY = this.shuttleController?.group.position.y ?? 0
      this.missionFacade.ensureEvaPoiOppositeShuttle(shuttleY)
      const evaCamera = this.evaSession?.getEvaFpsCamera() ?? null
      if (evaCamera && this.evaCameraFarRestore === null) {
        this.evaCameraFarRestore = evaCamera.far
        evaCamera.far = EVA_MAP_CAMERA_FAR
        evaCamera.updateProjectionMatrix()
      }
      this.beginEvaMapLayerSuppression()
    } else {
      this.evaMapMultitoolFacade.disposeEvaFiring()
      this.endEvaMapLayerSuppression()
      const evaCamera = this.evaSession?.getEvaFpsCamera() ?? null
      if (evaCamera && this.evaCameraFarRestore !== null) {
        evaCamera.far = this.evaCameraFarRestore
        evaCamera.updateProjectionMatrix()
      }
      this.evaCameraFarRestore = null
    }
    this.bloomController.setEvaOverride(active)
    // Mirror the active-POI huge-scale onto completed-site POI containers, so a mission
    // that finishes mid-EVA doesn't spawn its "repaired" prop at 1× while everything else
    // is at ×20 (player perceives the sat shrinking + drifting away the instant it turns
    // green). Cleared on EVA exit so completed props revert to their map-view size.
    this.missionFacade.setEvaPoiScaleByType(active ? EVA_MAP_HUGE_POI_BY_TYPE : null)
    if (!active) {
      this.missionFacade.armCompletedEvaSiteCleanup()
      this.evaPoiPromptRange = null
      this.evaVehicleReturnBounds = null
    }
    this.onEvaModeChange?.(active)
    if (active) {
      this.evaMapMultitoolFacade.setupEvaFiring()
      void this.evaMapMultitoolFacade.loadViewModel()
      if (this.satelliteRepairController) {
        this.evaMapMultitoolFacade.setEvaSatelliteServicingScience(this.satelliteRepairController)
      }
      if (this.getActiveSatelliteServicingMission()) {
        this.onEvaToast?.('USE THE MULTITOOL TO FIX THE BROKEN SATELLITE PARTS')
      }
    }
  }

  /**
   * If the player has an accepted, in-progress EVA mission whose POI is the
   * one they're EVAing out to AND whose minigameType is `satellite_servicing`,
   * return it. Otherwise return null.
   *
   * @returns The active satellite-servicing mission at the current POI, or null.
   */
  private getActiveSatelliteServicingMission(): ActiveVisitRelayMission | null {
    const mission = this.missionFacade.getActiveEvaMissionAtPoi()
    if (!mission) return null
    if (mission.template.minigameType !== 'satellite_servicing') return null
    const broken = mission.brokenComponents
    if (!broken || broken.length === 0) return null
    return mission
  }

  /**
   * If a satellite-servicing EVA mission is active at the current POI, build
   * the minigame, attach the in-scene controller, and wire `onComplete` into
   * the existing reward chain. No-op otherwise.
   */
  private maybeAttachSatelliteRepair(): void {
    const mission = this.getActiveSatelliteServicingMission()
    if (!mission) return
    const poiObject = this.missionFacade.getEvaPoiGroup()
    if (!poiObject) {
      console.warn('[MapViewController] No POI object for satellite repair; skipping auto-attach.')
      return
    }
    const minigame = createOrbitalMiniGame(
      mission.template.id,
      mission.template.minigameType,
      0,
      mission.giverPlanet,
      mission,
    ) as OrbitalMiniGame & OrbitalMiniGameEvents
    if (!(minigame instanceof SatelliteServicingMiniGame)) {
      console.warn(
        '[MapViewController] Satellite mission produced non-SatelliteServicingMiniGame; skipping.',
      )
      minigame.dispose()
      return
    }
    minigame.onComplete = (missionId: string) => this.evaMinigameComplete(missionId)
    this.activeEvaMinigame = minigame
    this.satelliteRepairController = new SatelliteRepairController()
    this.satelliteRepairController.attach({
      poiObject,
      minigame,
      mission,
      onAimPromptChange: (prompt: string | null) => {
        this.currentAimPrompt = prompt
      },
      onComponentFullyRepaired: (componentName: string) => {
        const label = componentName.replaceAll('_', ' ')
        this.onEvaToast?.(`Part repaired: ${label}`)
      },
    })
  }

  /**
   * Called on EVA exit. If the satellite-servicing controller is still attached,
   * the player left EVA without repairing every component — abort silently.
   * No reward, no mission removal; the mission stays in the active list with
   * its brokenComponents intact so the next EVA re-attaches with the same damage.
   *
   * If the controller has already been disposed (e.g. because `onComplete` fired
   * mid-EVA and `evaMinigameComplete` ran the cleanup), this is a no-op.
   */
  private teardownSatelliteRepairOnExit(): void {
    if (!this.satelliteRepairController) return
    this.evaMapMultitoolFacade.setEvaSatelliteServicingScience(null)
    this.satelliteRepairController.dispose()
    this.satelliteRepairController = null
    this.activeEvaMinigame?.dispose()
    this.activeEvaMinigame = null
    this.currentAimPrompt = null
  }

  /**
   * Build the EVA session bound to this view. Returns null if required deps are missing.
   */
  private createEvaSession(): EvaSession | null {
    const sceneHost = this.buildEvaSceneHost()
    if (!sceneHost || !this.tickHandler || !this.inputManager) return null
    return new EvaSession({
      sceneManager: sceneHost,
      tickHandler: this.tickHandler,
      inputManager: this.inputManager,
      getVehicle: () => this.shuttleController,
      getPoi: () => this.missionFacade.getEvaPoiWorldPos(),
      canEva: () => {
        const state = this.orbitSystem?.state
        if (state === 'orbiting' || state === 'approaching') {
          return { allowed: false, reason: 'EXIT ORBIT TO EVA', suppressActionPrompt: true }
        }
        if (this.shipHealth && this.shuttleController && this.shipHealthConfig) {
          const px = this.shuttleController.position.x
          const pz = this.shuttleController.position.z
          const sunDist = Math.sqrt(px * px + pz * pz)
          const { heatCap, coldCap } = this.computeThermalCaps(sunDist)
          if (this.shipHealth.isEvaThermalBlocked(heatCap, coldCap)) {
            const t = this.shipHealth.temperature
            const reason =
              t > 0 ? 'THERMAL STRESS — COOL HULL TO EVA' : 'CRYO STRESS — WARM HULL TO EVA'
            return { allowed: false, reason }
          }
        }
        return { allowed: true }
      },
      onStartEvaMinigame: () => this.beginEvaMinigame(),
      isInSceneMinigameActive: () => this.satelliteRepairController != null,
      getInSceneMinigamePrompt: () => this.currentAimPrompt,
      getHugeScaleTargets: () => this.buildEvaHugeScaleTargets(),
      getColliders: () => this.buildEvaColliders(),
      getPoiPromptRange: () => this.evaPoiPromptRange,
      getVehicleReturnBounds: () => this.evaVehicleReturnBounds,
      spawnOffsetScale: EVA_MAP_SPAWN_OFFSET_SCALE,
      helmetLightIntensityScale: EVA_MAP_HELMET_LIGHT_SCALE,
      onEvaModeChange: (active) => {
        if (active) {
          this.maybeAttachSatelliteRepair()
        } else {
          this.teardownSatelliteRepairOnExit()
        }
        this.handleEvaModeChange(active)
      },
      onEvaTelemetry: (t) =>
        this.onEvaTelemetry?.(this.evaMapMultitoolFacade.mergeToolTelemetry(t)),
      onActionPrompt: (p) => {
        this.currentEvaPrompt = p
      },
      onDeath: (cause) => {
        if (this.activeEvaMinigame) {
          this.activeEvaMinigame.dispose()
          this.activeEvaMinigame = null
          if (this.vehicleCamera) this.vehicleCamera.controls.enabled = true
          this.onEvaMinigameChange?.(null)
        }
        this.currentAimPrompt = null
        this.triggerDeath(cause)
      },
    })
  }

  /** Targets scaled up during EVA so nearby objects read as large from the first-person view. */
  private buildEvaHugeScaleTargets(): EvaHugeScaleTarget[] {
    const targets: EvaHugeScaleTarget[] = []
    if (this.shuttleController) {
      targets.push({
        object: this.shuttleController.group,
        factor: EVA_MAP_HUGE_SHUTTLE,
      })
    }
    const poiGroup = this.missionFacade.getEvaPoiGroup()
    const poiType = this.missionFacade.getEvaPoiType()
    if (poiGroup && poiType) {
      const factor = EVA_MAP_HUGE_POI_BY_TYPE[poiType] ?? 1
      if (factor !== 1) {
        targets.push({ object: poiGroup, factor })
      }
    }
    if (this.sunController) {
      targets.push({
        object: this.sunController.group,
        factor: EVA_MAP_HUGE_SUN,
      })
    }
    return targets
  }

  /**
   * Build the 3D colliders the EVA player should bounce off. Called by {@link EvaSession}
   * after huge-scale has been applied, so world-space AABBs reflect the ×100 shuttle and
   * any per-type POI scale boost. Shuttle and POI are static for the session lifetime —
   * shuttle is frozen, POI never moves — so a one-shot snapshot is enough. Also caches
   * the POI prompt range and the shuttle return bounds for the session; the session
   * reads both via its per-tick config hooks.
   */
  private buildEvaColliders(): EvaCollider[] {
    const colliders: EvaCollider[] = []
    this.evaVehicleReturnBounds = null
    this.evaPoiPromptRange = null
    if (this.shuttleController) {
      // Cylinder aligned with the shuttle's longest local axis. Smooth radial surface
      // means the EVA player can slide around the hull without catching on OBB corners,
      // which was the dominant navigation complaint on the previous OBB collider.
      colliders.push(
        createCylinderColliderFromHullNodes(
          this.shuttleController.group,
          this.shuttleController.shuttleHullNodes,
          // Trim 5% off the tail end so the cylinder ends at the fuselage tail rather
          // than overshooting past the engine nozzles — those are thin protrusions the
          // EVA player should clip past, same as wings and the vertical fin. Keep the
          // full nose length (no low-end trim equivalent) so the cockpit stays enclosed.
          // If back-end is on the HIGH axial end in model local space, swap these values.
          { axialKeepLow: 0.05, axialKeepHigh: 1.0 },
        ),
      )
      // Snapshot the shuttle hull's world-space AABB for the bounds-aware "Return to
      // Shuttle [V]" prompt. Using bounds (not group.position) keeps the trigger zone
      // wrapped around the visible hull regardless of where the group origin sits.
      this.shuttleController.group.updateMatrixWorld(true)
      const hullBox = new THREE.Box3()
      hullBox.makeEmpty()
      for (const node of this.shuttleController.shuttleHullNodes) {
        hullBox.expandByObject(node)
      }
      if (!hullBox.isEmpty()) {
        this.evaVehicleReturnBounds = { min: hullBox.min.clone(), max: hullBox.max.clone() }
      }
    }
    const poiGroup = this.missionFacade.getEvaPoiGroup()
    if (poiGroup) {
      poiGroup.updateMatrixWorld(true)
      // Size-aware prompt range so a stock satellite requires close approach while a
      // ×20 telescope still triggers at a reasonable distance.
      const poiBox = new THREE.Box3().setFromObject(poiGroup)
      if (!poiBox.isEmpty()) {
        const size = poiBox.getSize(new THREE.Vector3())
        const maxHalfExtent = Math.max(size.x, size.y, size.z) * 0.5
        this.evaPoiPromptRange = maxHalfExtent + EVA_POI_PROMPT_BUFFER
      }
      // Skip POI collision while a satellite-servicing minigame is active so
      // deployed solar panels / antennas don't block the raycast-aim approach.
      // The inline raycast + F-repair interaction already gates distance.
      const skipForServicing = this.getActiveSatelliteServicingMission() != null
      if (!skipForServicing) {
        colliders.push(createAabbColliderFromObject(poiGroup))
      }
    }
    return colliders
  }

  dispose(): void {
    // Flush before dispose so the final HP write lands in the profile; dispose then removes
    // the pagehide listener and clears any pending throttled-persist timer.
    this.flushShuttleHullToProfile()
    this.healthFacade.dispose()
    this.unsubscribeJourneyMessageArchive?.()
    this.unsubscribeJourneyMessageArchive = null
    this.unsubscribeContractCompleted?.()
    this.unsubscribeContractCompleted = null
    this.unsubscribeContractAccepted?.()
    this.unsubscribeContractAccepted = null
    this.unsubscribeUpgradeInstalled?.()
    this.unsubscribeUpgradeInstalled = null
    this.unsubscribeContractStepActivated?.()
    this.unsubscribeContractStepActivated = null
    this.journeyFacade.dispose()
    this.evaMapMultitoolFacade.dispose()
    this.tickHandler?.unregister(this.evaMapMultitoolFacade.frameSync)
    this.evaSession?.dispose()
    this.evaSession = null
    this.shuttleAudio.dispose()
    this.clearStartupCinematicOrbitHandoff()
    if (this.sceneObjects?.scene) {
      this.introFacade?.dispose(this.sceneObjects.scene)
    }
    this.missionFacade.dispose(this.sceneObjects?.scene ?? null)
    this.habitatFacade.dispose()
    unregisterMapDevCommands()
    this.onUpgradeHudRefresh = null
    this.sceneEnvironment?.dispose()
    this.sceneEnvironment = null
    this.sceneVisuals?.dispose()
    this.sceneVisuals = null
    if (this.debugMetricsTracker && this.tickHandler) {
      this.tickHandler.unregister(this.debugMetricsTracker)
    }
    this.debugMetricsTracker?.dispose()
    this.debugMetricsTracker = null
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
