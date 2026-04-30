/**
 * Orchestrates the asteroid level scene — arrival cutscene,
 * lander flight, and EVA on-foot phases in a single Three.js scene.
 *
 * All systems are created once during init(). The state machine
 * enter/exit callbacks register/unregister tickables to swap modes.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import { DevConsole } from '@/lib/devConsole'
import { LanderAudioDirector } from '@/audio/LanderAudioDirector'
import { FpsAudioDirector } from '@/audio/FpsAudioDirector'
import { LevelAudioDirector } from '@/audio/LevelAudioDirector'
import { PhotometryScanSound } from '@/audio/PhotometryScanSound'
import { useAudio } from '@/audio/useAudio'
import type { AudioPlaybackHandle } from '@/audio/audioTypes'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { LEVEL_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { VehicleCamera, LANDER_CAMERA_CONFIG } from '@/three/VehicleCamera'
import { LanderController } from '@/three/LanderController'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import { FpsCamera } from '@/three/FpsCamera'
import { FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { FlatZone } from '@/lib/terrain/terrainGenerator'
import { persistCompletedAsteroidMissionRewards } from '@/lib/missions/asteroidMissionRewards'
import { LEVEL_GRID_SIZE } from '@/lib/missions/asteroidMissionGenerator'
import { getCurrentUpgradeValue, hydratePlayerUpgradeLevelsFromStorage } from '@/lib/upgrades'
import type { GeneratedAsteroidMission, ConcreteObjective } from '@/lib/missions/types'
import { computePhotometryAdriftRadialLimit } from '@/lib/photometry/photometryGeometry'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { ProspectOverlayController } from '@/three/ProspectOverlayController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import {
  createAsteroidSurface,
  type AsteroidSurfaceControllerResult,
} from '@/three/AsteroidSurfaceController'
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'
import type { FpsTelemetry, RockTargetInfo } from '@/lib/ui/fpsHudTypes'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { SCIENCE_ENEMY_HEAL_AMOUNT, type ProjectileImpactContext } from '@/lib/fps/projectileSystem'
import type { EnemyHandle } from '@/lib/fps/enemyDirector'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import {
  createLevelStateMachine,
  LANDER_INTERACT_RANGE,
  EXFIL_PROXIMITY_RANGE,
} from '@/lib/level/levelStateMachine'
import type { LevelState } from '@/lib/level/levelStateMachine'
import type { StateMachine } from '@/lib/stateMachine'
import { ArrivalSequence } from '@/three/ArrivalSequence'
import { BunkerHatchModel } from '@/three/bunker/BunkerHatchModel'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { tintForGiver } from '@/lib/level/bunkerFactionTint'
import { NestModel } from '@/three/NestModel'
import { VirusModel } from '@/three/VirusModel'
import { HostageModel } from '@/three/HostageModel'
import { LanderExplosion } from '@/three/LanderExplosion'
import { StarFieldController } from '@/three/StarFieldController'
import * as THREE from 'three'
import { Color, Vector3 } from 'three'
import { createAtmosphereContext } from '@/three/atmosphere/AtmosphereContext'
import type { AtmosphereContext } from '@/three/atmosphere/AtmosphereContext'
import { LevelLightingRig } from '@/three/atmosphere/LevelLightingRig'
import { LevelPostProcessing } from '@/three/atmosphere/LevelPostProcessing'
import { ThrusterWashController } from '@/three/atmosphere/ThrusterWashController'
import { SurfaceDustController } from '@/three/atmosphere/SurfaceDustController'
import { applyLanderAtmosphereState } from '@/three/atmosphere/landerAtmosphereState'
import {
  addWaypointMarker,
  updateWaypointMarkers,
  clearWaypointMarkers,
  setWaypointMarkersVisible,
} from '@/three/WaypointMarkers'
import { generateMapCanvas } from '@/lib/terrain/mapColors'
import type { MiniGame, MiniGameStep } from '@/lib/minigame/MiniGame'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { buildMultiToolConfig } from '@/lib/fps/buildMultiToolConfig'
import { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import { createEnemyVisualWarmup, type EnemyVisualWarmup } from '@/three/EnemyVisualWarmup'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import { loadProfile } from '@/lib/player/profile'
import { getItemDefinition } from '@/lib/inventory/catalog'
import {
  LootSystem,
  type LootPickup,
  type LootType,
  createContractLootPolicy,
} from '@/lib/fps/lootSystem'
import { TRADE_GOODS } from '@/lib/shop/tradeGoods'
import { addItem } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { LootPickupController } from '@/three/LootPickupController'
import { contractSystem } from '@/lib/contracts/runtime'
import {
  countLanderFuelCells,
  useLanderFuelCell as consumeLanderFuelCell,
} from '@/lib/level/landerFuelCell'
import {
  hashLevelSeed,
  resolveLevelContext,
  resolveLevelLutUrl,
  rotationFromSeed,
} from '@/lib/level/levelContext'
import {
  resampleObjectiveNearShip,
  sampleSpawnOnSurface,
} from '@/lib/level/levelObjectivePlacement'
import {
  chooseDanCraterPlacement,
  type DanCraterPlacement,
  DEFAULT_DAN_CRATER_RADIUS,
  DEFAULT_DAN_CRATER_MIN_DEPTH,
  DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE,
} from '@/lib/level/danCraterPlacement'
import { DanMinigame } from '@/lib/minigame/DanMinigame'
import { LevelCollisionFacade } from '@/lib/level/LevelCollisionFacade'
import { LevelCombatMiningFacade } from '@/lib/level/LevelCombatMiningFacade'
import { RocketSurveyFacade } from '@/lib/level/RocketSurveyFacade'
import { GatherMinigame } from '@/lib/minigame/GatherMinigame'
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
import { BunkerMinigame } from '@/lib/minigame/BunkerMinigame'
import { LevelPersistenceFacade } from '@/lib/level/LevelPersistenceFacade'
import { LevelMinigameFacade } from '@/lib/level/LevelMinigameFacade'
import { LevelStateLifecycleFacade } from '@/lib/level/LevelStateLifecycleFacade'
import { LevelTelemetryFacade } from '@/lib/level/LevelTelemetryFacade'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import { LEVEL_VIEW_CONTROLLER_CONFIG } from '@/lib/level/levelViewControllerConfig'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { isDebugHudEnabled } from '@/lib/debug/debugMetrics'
import { DebugMetricsTracker } from '@/lib/debug/DebugMetricsTracker'
import {
  computeDeathPresentationState,
  computeHypoxiaFadeOpacity,
  computeKnockbackAwayFromSource,
  computeNonLethalFallDamage,
  computeRelativeDamageAngle,
  stepDamageFlash,
} from '@/lib/fps/fpsPresentation'

const LEVEL_TERRAIN_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.terrain
const LEVEL_OBJECTIVE_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.objectivePlacement
const LEVEL_COMBAT_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.combat
const LEVEL_FALL_DAMAGE_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.fallDamage
const LEVEL_ATMOSPHERE_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.atmosphere
const LEVEL_BOUNDS_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.bounds
const LEVEL_COLLISION_CONFIG = LEVEL_VIEW_CONTROLLER_CONFIG.collision
/** Dev-console `landNearObjective`: offset from waypoint toward ship (along ground XZ). */
const DEV_LAND_NEAR_OBJECTIVE_OFFSET_M = 16
/** Terrain clearance above the height sample so physics settles rather than spawning inside dirt. */
const DEV_LAND_SPAWN_CLEARANCE_ABOVE_GROUND_M = 2.75
const LANDER_LOCAL_FORWARD = new THREE.Vector3(-1, 0, 0)
const LANDER_LOCAL_UP = new THREE.Vector3(0, 1, 0)
/** Seconds to fade to black before performing a bunker scene swap. */
const BUNKER_SWAP_FADE_OUT_SECONDS = 0.5
/** Seconds to fade back from black after the swap. */
const BUNKER_SWAP_FADE_IN_SECONDS = 0.5
/** Cause shown after the normal dead-state presentation finishes in the bunker. */
const BUNKER_OPERATOR_DEATH_CAUSE = 'Operator KIA'

/**
 * Boot / preload status emitted to {@link LevelView} while the level scene
 * warms up. `preparing` = still loading, `ready` = assets loaded + scene
 * ready (transient — the level auto-advances), `started` = arrival cinematic
 * running, overlay should be gone.
 */
export interface LevelViewBootState {
  /** Lifecycle phase. */
  phase: 'preparing' | 'ready' | 'started'
  /** Human-readable label for the current step. */
  label: string
  /** Asteroid name shown on the overlay (empty until mission resolves). */
  asteroidName: string
  /** Mission template/title shown on the overlay (empty until resolved). */
  missionName: string
}

/** Applies the gameplay spawn offset so the lander clears the portal geometry. */
function offsetGameplayLanderSpawn(position: Vector3): Vector3 {
  return position.clone().add(LEVEL_TERRAIN_CONFIG.gameplayStartOffset)
}

/**
 * Asteroid level scene controller.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelViewController implements Tickable {
  // ── Core ─────────────────────────────────────────────────────
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private heightmap: Heightmap | null = null
  private asteroidSurface: AsteroidSurfaceControllerResult | null = null
  private surfaceRocks: SurfaceRockController | null = null
  /**
   * Surface hatch prop spawned on bunker missions. Sits at the first
   * objective's XZ on the asteroid surface, animates an idle pulse, and
   * is the prop the player walks up to and presses E on (descent).
   */
  private surfaceBunkerHatch: BunkerHatchModel | null = null
  /**
   * Prospectus-terminal kiosk spawned for `'prospectus-terminal'` objectives.
   * Null when the active mission has no such objective.
   */
  private prospectusTerminal: TerminalModel | null = null
  /**
   * True this frame when the EVA player is within interaction range of the
   * prospectus terminal and the overlay has not yet been opened.
   */
  private prospectusInteractReady = false
  /**
   * World-space position of the surface bunker hatch (set when the hatch is
   * spawned). The player is teleported back to this point when extracting
   * from the bunker so they exit right next to the surface prop.
   */
  private readonly surfaceHatchWorldPos = new THREE.Vector3()
  /**
   * Snapshot of the player's surface position taken on bunker descent. Used
   * to restore the player when they extract back to the asteroid; falls back
   * to {@link surfaceHatchWorldPos} when null.
   */
  private surfacePlayerSnapshot: THREE.Vector3 | null = null
  private prospectOverlay: ProspectOverlayController | null = null
  private enemyVisualWarmup: EnemyVisualWarmup | null = null
  private readonly collision = new LevelCollisionFacade()
  private rockYieldSystem: RockYieldSystem | null = null
  private stateMachine: StateMachine<LevelState> | null = null

  // ── Lander ───────────────────────────────────────────────────
  private landerController: LanderController | null = null
  private vehicleCamera: VehicleCamera | null = null

  // ── EVA ──────────────────────────────────────────────────────
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  /** Scratch vector for allocation-free camera-forward reads each tick. */
  private _playerForwardScratch = new THREE.Vector3()
  /**
   * Single owner for lander cinematic + environmental audio: the
   * level-wide asteroid wind bed, the cockpit hum during arrival /
   * exfil cinematics, the engine-vibration shake loop driven by the
   * per-frame thrust intensity curve, the dropship-separation sting,
   * and the destroyed-lander audio sweep. Replaces the scattered
   * `useAudio().play(...)` / `stopSound(...)` calls and the
   * `_shakeHandle` field this controller used to thread through
   * cinematic callbacks and the crash / fail cleanup paths.
   */
  private readonly landerAudio = new LanderAudioDirector()
  /** Tracks the airborne→grounded transition for fall-damage application. */
  private _prevGrounded = true
  /**
   * Single owner for all FPS player-movement audio (breathing, floating,
   * contact-damage loop, ranged-damage composite). Both this controller
   * and {@link FpsViewController} share the same director implementation
   * so feedback stays consistent between the level and the sandbox.
   */
  private readonly fpsAudio = new FpsAudioDirector()
  /**
   * Single owner for miscellaneous level one-shots that don't belong to
   * either the FPS or lander directors — currently the resource pickup
   * chime and the objective (nest / virus) explosion cue. Replaces the
   * last `useAudio().play(...)` call sites in this controller; the host
   * just fires `notify*` events and lets the director handle volume
   * curves and audio plumbing.
   */
  private readonly levelAudio = new LevelAudioDirector()
  /** Continuous two-layer audio feedback for the photometry scan beam. */
  private readonly photometryScanAudio = new PhotometryScanSound()
  /**
   * DAN scan loop handle. The scan hum (`sfx.dan`) starts when the minigame
   * reports `visible: true` and stops when the audio frame goes quiet —
   * tied directly to scan window + fade. Capture clicks (`sfx.dan.hit`)
   * are one-shots fired per particle, so they do not need a handle.
   */
  private danScanLoopHandle: AudioPlaybackHandle | null = null
  private readonly persistence = new LevelPersistenceFacade()
  private readonly stateLifecycle = new LevelStateLifecycleFacade()
  private combatMining: LevelCombatMiningFacade | null = null
  private rocketSurvey: RocketSurveyFacade | null = null
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private debugMetricsTracker: DebugMetricsTracker | null = null
  private impactEmitter: ParticleEmitter | null = null
  /**
   * Latest rock-target readout for the FPS HUD. Populated each tick by
   * {@link updateRockTarget}; consumed by {@link onFpsTelemetry}.
   */
  private currentRockTarget: RockTargetInfo | null = null
  /** Reused scratch — camera world position used by rock target picking. */
  private readonly _rockPickOrigin = new Vector3()
  /** Reused scratch — camera forward used by rock target picking. */
  private readonly _rockPickDir = new Vector3()
  /**
   * Maximum distance (world units) at which the drill targeting bar
   * appears for a rock. Beyond this the bar hides even if the rock
   * is still in line of sight — keeps the HUD focused on the rock
   * the player can actually mine in a few seconds.
   */
  private static readonly ROCK_TARGET_PICK_RANGE = 60
  /**
   * Cyan particle stream that flies from a struck rock toward the
   * player's gun muzzle, visualising mineral extraction. Lifetime is
   * tuned so particles complete the trip in roughly one frame's
   * worth of movement, hiding the lack of true homing.
   */
  private tractorEmitter: ParticleEmitter | null = null
  // ── Arrival ──────────────────────────────────────────────────
  private arrivalSequence: ArrivalSequence | null = null

  // ── Exfil tracking ────────────────────────────────────────────
  private hasExitedVehicle = false
  private landerDestroyed = false
  private landerExplosion: LanderExplosion | null = null

  // ── Atmosphere ──────────────────────────────────────────────
  private atmosphereCtx: AtmosphereContext | null = null
  private lightingRig: LevelLightingRig | null = null
  private postProcessing: LevelPostProcessing | null = null
  private thrusterWash: ThrusterWashController | null = null
  private surfaceDust: SurfaceDustController | null = null

  // ── Mission ─────────────────────────────────────────────────
  private mission: GeneratedAsteroidMission | null = null
  private missionObjectives: ConcreteObjective[] = []
  /**
   * Crater placement chosen at boot for the DAN objective, when one is in
   * the mission. Null otherwise. Drives lander spawn, terminal placement,
   * and the scan controller's bowl coordinates — all read once during init.
   */
  private danPlacement: DanCraterPlacement | null = null
  private asteroidName = ''
  private missionAnnounced = false

  /** Runtime owner for objective minigame sessions in this level. */
  private readonly minigames = new LevelMinigameFacade()

  /**
   * Loot drop system shared across all minigames in the current run. Created
   * lazily in {@link initialize} once the FPS player exists; ticked from the
   * level loop and observed by every spawned virus enemy via
   * {@link ExterminateMinigame.installEnemySpawnObserver} /
   * {@link RescueMinigame.installEnemySpawnObserver}.
   */
  private dropSystem: LootSystem | null = null

  /** Visual layer for {@link LootSystem}; renders colored pickups (dynamic root for bunker). */
  private lootPickupController: LootPickupController | null = null

  /** Called each frame during EVA with terminal prompt text (null to hide). */
  onTerminalPrompt: ((text: string | null) => void) | null = null

  /**
   * Fired when the player presses E while in range of the prospectus terminal.
   * The Vue layer mounts `ProspectusOverlay` in response.
   */
  onProspectusOpen: (() => void) | null = null

  /**
   * Called by the Vue layer after the overlay resolves to flip the terminal
   * screen color — green for transmit, red for tamper.
   *
   * @param outcomeId - The chosen outcome (`'transmit'` or `'tamper'`).
   */
  flipProspectusTerminalScreen(outcomeId: 'transmit' | 'tamper'): void {
    if (!this.prospectusTerminal) return
    /** Society green on transmit, Society red on tamper. */
    const TRANSMIT_COLOR = 0x00cc66
    /** Danger red on tamper. */
    const TAMPER_COLOR = 0xff2244
    this.prospectusTerminal.setScreenEmissive(
      outcomeId === 'transmit' ? TRANSMIT_COLOR : TAMPER_COLOR,
    )
  }

  /**
   * Emit the current persisted lander fuel-cell count to the Vue HUD.
   *
   * @author guinetik
   * @date 2026-04-30
   * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
   */
  refreshLanderFuelCellCount(): void {
    const inventory = loadInventory()
    this.onLanderFuelCellCount?.(inventory ? countLanderFuelCells(inventory) : 0)
  }

  /**
   * Consume one carried lander fuel cell and add half a tank to the active lander.
   *
   * @author guinetik
   * @date 2026-04-30
   * @spec docs/superpowers/specs/2026-04-30-lander-fuel-cell-refuel-design.md
   */
  useLanderFuelCell(): void {
    if (!this.landerController) return

    const inventory = loadInventory()
    if (!inventory) {
      this.onLanderFuelCellCount?.(0)
      return
    }

    const result = consumeLanderFuelCell(
      inventory,
      this.landerController.thrusterSystem.fuelCapacity,
    )
    if (!result.ok) {
      this.onLanderFuelCellCount?.(result.remainingFuelCells)
      return
    }

    saveInventory(result.inventory)
    this.landerController.thrusterSystem.addFuel(result.fuelToAdd)
    this.onLanderFuelCellCount?.(result.remainingFuelCells)
  }

  /**
   * Called when a unit of resource is *successfully* added to the
   * player inventory in-mission (currently fired by rock mining).
   * The host UI surfaces this to the player as a stacking pickup
   * toast.
   *
   * @param itemId Catalog item id (e.g. `"olivine"`).
   * @param quantity Units added to inventory this tick (already rounded).
   * @param label Human-readable item label (e.g. `"Olivine"`).
   */
  onResourcePickup: ((itemId: string, quantity: number, label: string) => void) | null = null

  /**
   * Called when a mineral was extracted from a rock but could not be
   * stored — typically because the cargo hold is full or out of slots.
   * The host UI surfaces this as a transient warning toast so the
   * player understands why a mining hit produced no green pickup.
   *
   * @param label Human-readable item label (e.g. `"Magnetite"`).
   * @param reason Short reason string from the inventory layer.
   */
  onResourcePickupFailed: ((label: string, reason: string) => void) | null = null

  /** Fired when carried lander fuel-cell count changes for the HUD refuel button. */
  onLanderFuelCellCount: ((count: number) => void) | null = null

  /**
   * Called when a rock is fully analysed by the science gun. The host
   * UI surfaces this as a green "✓ Analysed — <Mineral>-bearing rock"
   * toast in the pickup stack.
   *
   * @param itemId Catalog item id of the rock's primary mineral.
   */
  onProspect: ((itemId: string) => void) | null = null
  /** Called when the rocket-survey scan reveals a marker. Host shows the survey toast. */
  onSurvey: ((label: string) => void) | null = null
  /** Vue layer subscribes to fire the red survivor-lost toast + counter refresh. */
  onSurvivorLost: ((aliveRemaining: number) => void) | null = null
  /** Vue layer subscribes to fire the green survivor-aboard toast + counter refresh. */
  onSurvivorAboard: ((aboardCount: number) => void) | null = null

  private readonly initialLanderSpawn = new Vector3()

  /**
   * When set before {@link ArrivalSequence} calls `onLanderDetach`, replaces the
   * cinematic drop position so `AsteroidDev.LevelView.landNearObjective()` spawns by the mission waypoint.
   */
  private devConsoleForcedLanderSpawn: Vector3 | null = null

  /** Reused (0,1,0) seed for impact/explosion particle bursts. Treat as immutable. */
  private readonly _impactUp = new Vector3(0, 1, 0)
  /** Reused velocity scratch passed to `ParticleEmitter.emit` (which copies internally). */
  private readonly _impactVel = new Vector3()
  /** Reused scratch — rock world center for prospect-complete audio cue. */
  private readonly _prospectCenterScratch = new Vector3()

  // ── Elapsed time (seconds) ──────────────────────────────────
  private elapsed = 0

  /**
   * Active bunker swap fade animator. Non-null while a descent or extract
   * fade-to-black + fade-back-in is in progress; null otherwise. Driven
   * forward each frame from {@link tick}.
   */
  private bunkerSwapFade: {
    /** Total seconds elapsed since the fade started. */
    elapsed: number
    /** Whether the mid-swap callback has fired yet. */
    swapped: boolean
    /** One-shot callback fired at peak black to perform the actual swap. */
    swap: () => void
  } | null = null

  /**
   * Cause to show on the clickable death overlay after the normal FPS death
   * fade/message sequence reaches its message beat. `null` for deaths that
   * only use the regular YOU DIED presentation.
   */
  private pendingDeathOverlayCause: string | null = null

  /**
   * True after a bunker death has shown a manual restart overlay. Prevents the
   * dead state's timeout from taking the normal in-place failed restart path.
   */
  private manualDeathRestartOverlayActive = false

  /**
   * Throttles + emits level HUD telemetry/state prompts.
   */
  private readonly telemetry = new LevelTelemetryFacade()

  // ── Mouse state (EVA) ────────────────────────────────────────
  private readonly pointerLock = new FpsPointerLockSession()

  /** Called when letterbox visibility should change. */
  onLetterbox: ((visible: boolean) => void) | null = null

  /** Called each frame with current state + grounded + canExfil for HUD prompts. */
  onStateInfo:
    | ((info: {
        state: string
        grounded: boolean
        canExfil: boolean
        canEnterLander: boolean
      }) => void)
    | null = null

  /** Called each frame during lander state with lander telemetry. */
  onLanderTelemetry: ((telemetry: LanderTelemetry) => void) | null = null

  /** Called each frame during EVA state with FPS telemetry. */
  onFpsTelemetry: ((telemetry: FpsTelemetry) => void) | null = null

  /** Called each frame with death fade opacity (0 = clear, 1 = black). */
  onDeathFade: ((opacity: number) => void) | null = null

  /** Called when player dies — show death message. */
  onDeathMessage: ((visible: boolean) => void) | null = null
  /** Arrival fade to black (0 = clear, 1 = full black). */
  onArrivalFade: ((opacity: number) => void) | null = null

  /**
   * Boot / preload status for the level loader overlay.
   * Emitted during {@link init} as the scene warms up; the view hides its
   * overlay when phase becomes `'started'`.
   */
  onBootState: ((state: LevelViewBootState) => void) | null = null

  /** Called to show/hide the death overlay with a cause message. */
  onDeathOverlay: ((visible: boolean, cause: string) => void) | null = null

  /** Called once when gameplay starts (after arrival) with asteroid name + mission name. */
  onMissionAnnounce: ((asteroidName: string, missionName: string) => void) | null = null

  /** Called when an objective is completed. */
  onObjectiveComplete: ((objectiveIndex: number) => void) | null = null

  /** Called when all objectives are complete — mission success. */
  onMissionComplete: (() => void) | null = null

  /** Called when a minigame step advances. */
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /** Called once with the minimap canvas after terrain generation. */
  onMapCanvas: ((canvas: HTMLCanvasElement) => void) | null = null

  /** Called each frame with player world position for minimap. */
  onPlayerPosition: ((x: number, z: number) => void) | null = null

  /**
   * Called each frame with the current red-vignette opacity (0 = clear, >0 =
   * post-hit flash decaying back to 0). Wired to the same overlay that
   * `FpsView.vue` uses for its standalone damage flash.
   */
  onDamageFlash: ((opacity: number) => void) | null = null

  /**
   * Called when the player takes a hit, providing the screen-space angle from
   * the player to the damage source (radians, 0 = camera-forward, positive =
   * to the right). Drives the directional pizza-slice indicator on the HUD.
   */
  onDamageDirection: ((angle: number) => void) | null = null

  /** Seconds remaining on the active damage flash. Driven by `tick`. */
  private damageFlashTimer = 0

  /** When true, successful exfil grants CR and clears persisted active shuttle mission. */
  private persistShuttleMissionRewards = false

  /** Throttled write of lander hull HP to {@link loadProfile}. */
  private landerHullPersistTimer: ReturnType<typeof setTimeout> | null = null

  private readonly flushLanderHullOnPageHide = (): void => {
    this.clearLanderHullPersistTimer()
    this.flushLanderHullToProfile()
  }

  /** Initialise all systems and start the game loop. */
  /** Emit a boot-phase update to the level view overlay. */
  private emitBootState(phase: LevelViewBootState['phase'], label: string): void {
    this.onBootState?.({
      phase,
      label,
      asteroidName: this.asteroidName ?? '',
      missionName: this.mission?.name ?? '',
    })
  }

  async init(container: HTMLElement): Promise<void> {
    this.emitBootState('preparing', 'Syncing mission parameters')
    hydratePlayerUpgradeLevelsFromStorage()
    const playerConfig = buildFpsPlayerConfig()

    // ── Input + tick handler ────────────────────────────────────
    this.inputManager = new InputManager(LEVEL_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // ── Scene ───────────────────────────────────────────────────
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // ── Asteroid data ────────────────────────────────────────────
    const { asteroid, seed, mission, persistCompletionRewards } = resolveLevelContext(
      window.location.search,
    )

    // Warm up minigame prop GLBs in parallel with the asteroid surface load
    // so nothing hitches the first time an exterminate, rescue, or virus
    // encounter spawns mid-gameplay. Lander + shuttle are already cached from
    // the map view that preceded us.
    this.emitBootState('preparing', 'Warming surface props')
    const propPreloads = Promise.all([
      NestModel.preload(),
      VirusModel.preload(),
      HostageModel.preload(),
    ])
    this.persistShuttleMissionRewards = persistCompletionRewards
    this.mission = mission
    this.missionObjectives = mission.objectives
    this.asteroidName = asteroid.name

    // ── DAN crater placement (mission-driven rotation override) ───
    // Resolved before `createAsteroidSurface` so the rotation chosen by the
    // crater chooser flows through the bake pipeline. Synthesized fallback
    // renders a crater patch and applies the same bowl to collision heights,
    // keeping visuals and collision aligned at the scan site.
    const danObjective = mission.objectives.find((o) => o.type === 'dan')
    const danPlacement: DanCraterPlacement | null = danObjective
      ? await chooseDanCraterPlacement(
          asteroid,
          seed,
          {
            targetRadius: DEFAULT_DAN_CRATER_RADIUS,
            minDepth: DEFAULT_DAN_CRATER_MIN_DEPTH,
            minQualityScore: DEFAULT_DAN_CRATER_MIN_QUALITY_SCORE,
          },
          {
            resolution: LEVEL_TERRAIN_CONFIG.resolution,
            worldSize: LEVEL_GRID_SIZE,
            rayStartAltitude: LEVEL_TERRAIN_CONFIG.bakeRayStartAltitude,
          },
        )
      : null
    this.danPlacement = danPlacement

    // ── Asteroid surface (GLB-backed) ───────────────────────────
    // Rotation lottery — seeded random Euler so the same mission always
    // lands on the same face but different missions pick different slices
    // of rock as "up". Applied BEFORE the bake so the heightmap / flatten
    // pipeline all see the rotated geometry. DAN missions override the
    // rotation with the chooser's selection so the chosen crater faces up.
    this.emitBootState('preparing', 'Bringing asteroid online')
    this.asteroidSurface = await createAsteroidSurface({
      modelPath: asteroid.surface.modelPath,
      scale: asteroid.surface.modelScale,
      rotation: danPlacement?.rotation ?? rotationFromSeed(seed, asteroid.shape.rotationLottery),
      baseColor: asteroid.visual.baseColor,
      valleyTone: asteroid.visual.valleyTone,
      peakTone: asteroid.visual.peakTone,
      surfaceTextures: asteroid.surface.surfaceTextures,
      surfaceUseEmbeddedUVs: asteroid.surface.surfaceUseEmbeddedUVs,
      surfaceDetailFolder: asteroid.surface.surfaceDetailFolder,
      surfaceDetailRepeat: asteroid.surface.surfaceDetailRepeat,
      surfaceDetailNormalStrength: asteroid.surface.surfaceDetailNormalStrength,
      surfaceTextureRepeat: asteroid.surface.surfaceTextureRepeat,
      surfaceModulatorStrength: asteroid.surface.surfaceModulatorStrength,
      surfaceModulatorColorBlend: asteroid.surface.surfaceModulatorColorBlend,
      surfaceAOStrength: asteroid.surface.surfaceAOStrength,
      surfaceEmissionStrength: asteroid.surface.surfaceEmissionStrength,
      syntheticCrater: danPlacement?.source === 'synthesized' ? danPlacement.crater : undefined,
      bake: {
        resolution: LEVEL_TERRAIN_CONFIG.resolution,
        worldSize: LEVEL_GRID_SIZE,
        rayStartAltitude: LEVEL_TERRAIN_CONFIG.bakeRayStartAltitude,
      },
    })
    this.heightmap = this.asteroidSurface.heightmap
    const collisionWorld = this.collision.initialize(this.heightmap)
    this.sceneManager.addToScene(this.asteroidSurface.group)

    // Pick a spawn cell that actually sits on the baked mesh — critical on GLB
    // terrain where most of the play area is void. Falls back to origin if the
    // centre of the world is somehow invalid (shouldn't happen at normal scales).
    // DAN missions override both the sampled cell and the ship park so the
    // lander touches down at the chosen crater center, where the encounter
    // actually plays out.
    const spawn = sampleSpawnOnSurface(this.heightmap, {
      spawnPositionRange: LEVEL_TERRAIN_CONFIG.spawnPositionRange,
      spawnSampleAttempts: LEVEL_TERRAIN_CONFIG.spawnSampleAttempts,
    })
    const spawnX = danPlacement
      ? danPlacement.crater.x
      : spawn.x + LEVEL_TERRAIN_CONFIG.landerSpawnLightAlignmentX
    const spawnZ = danPlacement ? danPlacement.crater.z : spawn.z
    // Ship parks at the asteroid's barycenter (world XZ origin) by default.
    // For DAN, the ship parks at the crater center so the player can EVA out
    // and walk straight to the terminal next to the bowl.
    const shipSpawnXZ = danPlacement
      ? { x: danPlacement.crater.x, z: danPlacement.crater.z }
      : { x: 0, z: 0 }
    const shipBarycenterY = this.heightmap.heightAt(shipSpawnXZ.x, shipSpawnXZ.z)

    // Resample each objective onto the same asteroid face the ship is parked
    // on. Mission-generator flat zones are laid out in a 3500-unit world square
    // without mesh awareness, so without this they can land in valleys, on
    // steep flanks, or on the far side of the rock. Ring-sample a flat-ish
    // cell near the ship and mutate the objective in place so minigame
    // spawners, waypoint markers, and rock exclusions all see the new pos.
    const claimedPositions: Array<{ x: number; z: number }> = [{ x: spawnX, z: spawnZ }]
    for (const obj of mission.objectives) {
      if (obj.type === 'dan' && danPlacement) {
        // DAN sits at the crater center chosen by chooseDanCraterPlacement
        // — never resample, otherwise the terminal, scan bowl, and lander
        // spawn would drift apart.
        obj.x = danPlacement.crater.x
        obj.z = danPlacement.crater.z
        claimedPositions.push({ x: obj.x, z: obj.z })
        continue
      }
      const resampled = resampleObjectiveNearShip(
        this.heightmap,
        obj,
        { x: spawnX, z: spawnZ },
        claimedPositions,
        {
          minDistanceFromShip: LEVEL_OBJECTIVE_CONFIG.minDistanceFromShip,
          maxDistanceFromShip: LEVEL_OBJECTIVE_CONFIG.maxDistanceFromShip,
          minMutualSpacing: LEVEL_OBJECTIVE_CONFIG.minMutualSpacing,
          maxSlope: LEVEL_OBJECTIVE_CONFIG.maxSlope,
          resampleAttempts: LEVEL_OBJECTIVE_CONFIG.resampleAttempts,
          fallbackPullAttempts: LEVEL_OBJECTIVE_CONFIG.fallbackPullAttempts,
          fallbackPullFactor: LEVEL_OBJECTIVE_CONFIG.fallbackPullFactor,
          fallbackPullDecay: LEVEL_OBJECTIVE_CONFIG.fallbackPullDecay,
        },
      )
      obj.x = resampled.x
      obj.z = resampled.z
      claimedPositions.push({ x: obj.x, z: obj.z })
    }

    // `flatZones` is used for rock-spawn exclusions around objective sites —
    // built after resample so exclusions match the actual waypoint locations.
    const flatZones: FlatZone[] = mission.objectives.map((obj) => ({
      x: obj.x,
      z: obj.z,
      radius: FLAT_ZONE_RADIUS,
    }))

    this.surfaceRocks = await SurfaceRockController.create({
      heightmap: this.heightmap,
      surface: asteroid.surface,
      composition: asteroid.composition,
      seed,
      exclusions: [...flatZones, { x: spawnX, z: spawnZ, radius: FLAT_ZONE_RADIUS * 0.65 }],
      baseColor: asteroid.visual.baseColor,
    })
    this.sceneManager.addToScene(this.surfaceRocks.group)
    const rockColliders = this.surfaceRocks.buildColliders(this.heightmap)
    for (let i = 0; i < rockColliders.length; i++) {
      const collider = rockColliders[i]!
      this.collision.registerSurfaceRockCollider(i, collider)
    }

    // ── Objective waypoint markers ──────────────────────────────
    // Objectives have already been snapped to valid surface above, so the
    // baked ground Y is guaranteed to be a real surface hit, not the void
    // sentinel.
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      const objectiveGroundY = this.heightmap.heightAt(obj.x, obj.z)
      addWaypointMarker(`obj-${i}`, obj.x, obj.z, objectiveGroundY, this.sceneManager!.scene)
    }

    // ── Minimap canvas ─────────────────────────────────────────
    const mapCanvas = generateMapCanvas(this.heightmap!.grid, LEVEL_TERRAIN_CONFIG.resolution)
    this.onMapCanvas?.(mapCanvas)

    // ── Starfield ────────────────────────────────────────────────
    // Radius 4000 sits inside the FpsCamera's 5000-unit far plane so
    // stars stay visible during EVA (the lander VehicleCamera has a
    // 50000 far plane and would render them at any radius). With
    // sizeAttenuation: false on the stars, pulling the sphere in
    // doesn't change how big they look on screen.
    const starField = new StarFieldController({ count: 2000, size: 1.5, radius: 4000 })
    this.sceneManager.addToScene(starField.points)

    // ── Atmosphere context (per-asteroid config) ───────────────
    this.atmosphereCtx = createAtmosphereContext(asteroid.lighting, {
      dustCoverage: asteroid.surface.dustCoverage,
      albedo: asteroid.visual.albedo,
      biome: asteroid.biome,
      baseColor: asteroid.visual.baseColor,
    })

    // ── Lighting rig (replaces hardcoded lights) ───────────────
    this.lightingRig = new LevelLightingRig(this.atmosphereCtx, this.sceneManager.renderer)
    this.lightingRig.addToScene(this.sceneManager.scene)

    // ── Lander (created once, stays in scene) ───────────────────
    this.emitBootState('preparing', 'Fuelling lander')
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(this.heightmap)
    this.landerController.setCollisionWorld(collisionWorld)
    await this.landerController.load()
    this.landerController.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
    const gameplayStart = offsetGameplayLanderSpawn(
      new Vector3(
        shipSpawnXZ.x,
        shipBarycenterY + LEVEL_TERRAIN_CONFIG.landerSpawnHeight,
        shipSpawnXZ.z,
      ),
    )
    this.initialLanderSpawn.copy(gameplayStart)
    this.landerController.group.position.copy(gameplayStart)

    this.landerController.onCrash = (damage, impactSpeed) => {
      this.landerExplosion!.explode(this.landerController!.group.position.clone(), impactSpeed)
      // Proportional camera shake — harder crash = bigger shake
      const shakeIntensity = Math.min(damage * 0.15, 8)
      this.vehicleCamera?.shake(shakeIntensity, 0.5)
    }

    this.landerController.onDeath = () => {
      // DAN missions need to flag the active scan as failed before the
      // failure UX runs — otherwise the player could exfil and still be
      // counted as completing the objective.
      const active = this.minigames.getActive()
      if (active instanceof DanMinigame) {
        active.notifyLanderDestroyed()
      }
      this.failLanderRun('Lander Destroyed', { explode: true, hideLander: true })
    }

    this.landerController.onFuelEmpty = () => {
      this.failLanderRun('Out of Fuel')
    }

    const storedProfile = typeof localStorage === 'undefined' ? null : loadProfile()
    const savedLanderHp = storedProfile?.landerHullHp
    if (savedLanderHp !== undefined && savedLanderHp > 0 && this.landerController) {
      this.landerController.setHullHpFromProfile(savedLanderHp)
    }

    this.landerController.onHullHpChanged = () => {
      this.scheduleLanderHullPersist()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.flushLanderHullOnPageHide)
    }

    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.addToScene(this.landerController.flameEmitter.points)
    for (const emitter of this.landerController.rcsEmitters.values()) {
      this.sceneManager.addToScene(emitter.points)
    }

    // ── Thruster wash (needs lander loaded) ────────────────────
    this.thrusterWash = new ThrusterWashController(this.atmosphereCtx!.baseColor)
    this.thrusterWash.addToScene(this.sceneManager.scene)

    // ── Surface dust (ambient drift + footstep puffs) ──────────
    this.surfaceDust = new SurfaceDustController(this.atmosphereCtx!)
    this.surfaceDust.addToScene(this.sceneManager.scene)

    // ── Vehicle camera (lander 3rd person) ──────────────────────
    this.vehicleCamera = new VehicleCamera(
      LANDER_CAMERA_CONFIG,
      this.sceneManager.renderer.domElement,
    )
    this.vehicleCamera.setTarget(this.landerController.group)

    // ── Cinematic arrival sequence ─────────────────────────────
    this.emitBootState('preparing', 'Linking orbital shuttle')
    const landerSpawn = new Vector3(shipSpawnXZ.x, shipBarycenterY, shipSpawnXZ.z)
    this.arrivalSequence = new ArrivalSequence(landerSpawn)
    await this.arrivalSequence.load()
    this.sceneManager.scene.add(this.arrivalSequence.shuttleGroup)
    this.registerLevelColliders()

    this.arrivalSequence.onLanderDetach = (position) => {
      if (this.landerController) {
        const source = this.devConsoleForcedLanderSpawn ?? position
        this.devConsoleForcedLanderSpawn = null
        const gameplayStart = offsetGameplayLanderSpawn(source)
        this.initialLanderSpawn.copy(gameplayStart)
        this.landerController.group.position.copy(gameplayStart)
      }
      this.landerAudio.notifyLanderSeparation()
    }

    this.arrivalSequence.onFadeOut = (opacity) => {
      this.onArrivalFade?.(opacity)
    }

    this.arrivalSequence.onComplete = () => {
      // Park the shuttle hovering above the landing zone (visible from ground)
      this.arrivalSequence?.parkShuttle()
      // Show the gameplay lander at the spawn height (it will fall with physics)
      if (this.landerController) {
        this.landerController.group.visible = true
      }
      this.landerAudio.notifyArrivalCinematicEnd()
      // Clear the fade
      this.onArrivalFade?.(0)
    }

    // ── FPS camera ──────────────────────────────────────────────
    this.fpsCamera = new FpsCamera(playerConfig.camera)
    this.sceneManager.addToScene(this.fpsCamera.helmetLightRig)

    // ── FPS player controller ───────────────────────────────────
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      playerConfig,
      this.heightmap,
      collisionWorld,
    )
    this.playerController.group.visible = false
    this.playerController.onDeath = () => {
      if (this.stateMachine?.is('bunker-interior')) {
        this.pendingDeathOverlayCause = BUNKER_OPERATOR_DEATH_CAUSE
        this.stateMachine.trigger('die')
        return
      }

      // Lander rescue — if the player dies while standing next to the lander
      // (typically hypoxia after running the O2 tank dry), treat it as if they
      // managed to climb back into the cockpit: replenish life support and
      // transition into the lander instead of the dead state. Prevents the
      // case where the player walks the last meter to the airlock and dies
      // mid-press of the interact key. Suppressed while a DAN scan is
      // running — the encounter requires the player to die or recover on
      // foot, not duck into the lander on a free pass.
      if (
        this.isPlayerNearLander() &&
        this.stateMachine?.is('eva') &&
        !this.isLanderEntryBlockedByDan()
      ) {
        this.playerController!.replenish()
        this.onDeathFade?.(0)
        this.stateMachine.trigger('enterVehicle')
        return
      }
      this.stateMachine?.trigger('die')
    }
    this.sceneManager.addToScene(this.playerController.group)

    // ── Multi-tool ──────────────────────────────────────────────
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)
    this.multiTool.setVisible(false)
    this.multiToolState = new MultiToolState(buildMultiToolConfig())
    // Hover thrust pulls from the RTG instead of breathable O2.
    this.playerController.setHoverFuelSource(this.multiToolState.thrusterSystem)

    // ── Projectile system + particles ───────────────────────────
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, this.heightmap)
    this.projectileSystem.setDamageMultiplier(getCurrentUpgradeValue('multitoolDamage'))
    // Prewarm the bolt pool so its ShaderMaterial program is in the scene
    // graph before the precompile pass — first fire would otherwise compile
    // synchronously on render and hitch the frame.
    this.projectileSystem.prewarmPool()
    this.impactEmitter = new ParticleEmitter({
      // Doubled from 64 → 128 so a nest detonation can drop 30+ sparks at once
      // without recycling particles that the projectile-impact path is still
      // using during the same frame.
      poolSize: 128,
      color: new Color(0xffaa44),
      size: 6.5,
      lifetime: 0.6,
      spread: 12,
      opacity: 1,
      soft: true,
      sizeGrowth: 1.55,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    // Tractor stream — particles fly from the struck rock toward the
    // gun muzzle. Soft+screen-space sizing keeps them readable across
    // distances. Lifetime is short so the player perceives an
    // "extraction" pull rather than a slow trail. Pool size budgets
    // ~6 spawns per drill tick at the system's worst-case fire rate.
    this.tractorEmitter = new ParticleEmitter({
      poolSize: 224,
      color: new Color(0x66ffee),
      size: 4.8,
      lifetime: 0.58,
      spread: 2.8,
      opacity: 1,
      soft: true,
      sizeAttenuation: true,
      sizeGrowth: 0.7,
    })
    this.sceneManager.addToScene(this.tractorEmitter.points)
    this.projectileSystem.onImpact = (pos, context) => {
      for (let i = 0; i < 8; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(5)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
      this.maybePlayShortSurfaceSizzle(context, pos)
    }
    this.projectileSystem.onEnemyHit = (enemy, pos, boltKind, firstScienceHit) => {
      // Fan the hit out to whichever minigame owns this enemy so the matching
      // visual controller plays its hit-flash. Mirrors the bookkeeping in
      // `FpsViewController` where a single `onEnemyHit` callback dispatches
      // to all controller maps.
      this.minigames.notifyEnemyHit(enemy)
      if (boltKind === 'science' && firstScienceHit) {
        this.playerController?.heal(SCIENCE_ENEMY_HEAL_AMOUNT)
      }
      // Impact spark burst at the contact point — same magnitude as FpsView.
      for (let i = 0; i < 12; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(8)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)
    this.projectileSystem.setLander(this.landerController)
    this.projectileSystem.onScienceDanParticleHit = (spawnIndex) => {
      // Route the captured spawn index through the active DAN minigame so its
      // scan controller despawns the visual + registry entry, and the state
      // machine ticks the particle hit counter.
      const active = this.minigames.getActive()
      if (active instanceof DanMinigame) {
        active.controller?.captureParticle(spawnIndex)
      }
    }

    // ── Universal rock mining ───────────────────────────────────
    // Every surface rock can be drilled regardless of mission type;
    // gather objectives just listen to the same yield stream.
    const miningSeed = hashLevelSeed(mission.id)
    this.rockYieldSystem = new RockYieldSystem({
      composition: asteroid.composition,
      seed: miningSeed,
    })
    if (this.surfaceRocks) {
      this.prospectOverlay = new ProspectOverlayController(
        this.sceneManager.scene,
        this.surfaceRocks,
      )
      this.combatMining = new LevelCombatMiningFacade(
        {
          projectileSystem: this.projectileSystem,
          rockYieldSystem: this.rockYieldSystem,
          surfaceRocks: this.surfaceRocks,
          heightmap: this.heightmap,
          impactEmitter: this.impactEmitter,
          tractorEmitter: this.tractorEmitter,
          multiTool: this.multiTool,
          persistence: this.persistence,
          levelAudio: this.levelAudio,
        },
        {
          onResourcePickup: (itemId, quantity, label) =>
            this.onResourcePickup?.(itemId, quantity, label),
          onResourcePickupFailed: (label, reason) => this.onResourcePickupFailed?.(label, reason),
          onRemoveRockCollider: (spawnIndex) => this.removeRockCollider(spawnIndex),
          getElapsedSeconds: () => this.elapsed,
          onProspectProgress: (spawnIndex, scienceHp, initialScienceHp) => {
            this.prospectOverlay?.updateProgress(spawnIndex, scienceHp, initialScienceHp)
          },
          onProspectComplete: (spawnIndex, itemId) => {
            this.prospectOverlay?.markProspected(spawnIndex)
            if (this.surfaceRocks && this.heightmap && this.fpsCamera) {
              const center = this.surfaceRocks.getRockCenter(
                spawnIndex,
                this.heightmap,
                this._prospectCenterScratch,
              )
              if (center) {
                this.levelAudio.notifyProspectComplete(center, this.fpsCamera.camera)
              }
            }
            this.onProspect?.(itemId)
          },
        },
      )
      this.combatMining.registerRocks()
      this.combatMining.attach()

      // Chain overlay cleanup onto the facade's onConsume so a fully-mined
      // rock disposes its wireframe alongside the surface-rock hide.
      const previousConsume = this.rockYieldSystem!.onConsume
      this.rockYieldSystem!.onConsume = (spawnIndex) => {
        previousConsume?.(spawnIndex)
        this.prospectOverlay?.remove(spawnIndex)
      }
    }

    // ── Loot drop system ────────────────────────────────────────
    // Created before the minigames so each one can register its enemy
    // director with the spawn observer below. Policy is contract-driven:
    // pickups only materialize when an active contract has a matching
    // `collect-drops` step. Now supports colored powerups via LootSystem.
    this.dropSystem = new LootSystem({
      policy: createContractLootPolicy(contractSystem),
      onPickup: (pickup) => this.handlePickupCollected(pickup),
      onPowerupCollected: (type) => this.applyLootEffect(type),
    })
    this.lootPickupController = new LootPickupController(this.dropSystem)
    this.sceneManager.addToScene(this.lootPickupController.group)
    this.tickHandler.register(this.lootPickupController, TICK_PRIORITY_RENDER)

    // ── Objective minigames ──────────────────────────────────────
    const missionSeed = hashLevelSeed(mission.id)
    await this.minigames.initializeObjectives({
      mission,
      scene: this.sceneManager!.scene,
      asteroidRoot: this.asteroidSurface?.group ?? null,
      heightmap: this.heightmap!,
      projectileSystem: this.projectileSystem,
      rockYieldSystem: this.rockYieldSystem,
      composition: asteroid.composition,
      missionSeed,
      danCraterPlacement: this.danPlacement,
      bindings: {
        onPrompt: this.onTerminalPrompt,
        onComplete: this.onObjectiveComplete,
        onStepChange: this.onStepChange,
        onSurveyRefuel: () => this.landerController?.thrusterSystem.refuel(),
        onRegisterTickable: (tickable) =>
          this.tickHandler!.register(tickable, TICK_PRIORITY_PHYSICS + 4),
        onUnregisterTickable: (tickable) => this.tickHandler?.unregister(tickable),
        onSurveyProbeCollect: () => this.levelAudio.notifyResourcePickup(),
        onPhotometryScanAudioState: (state) =>
          this.photometryScanAudio.update({ ...state, sfxVolume: 1 }, 0),
        onDanScanAudioState: (state) => {
          // Drive the scan hum from the minigame's audio frame. `visible`
          // covers active scanning AND the fade-out tail at window close;
          // when it flips false, stop the loop and clear the handle.
          if (state.visible) {
            if (!this.danScanLoopHandle) {
              this.danScanLoopHandle = useAudio().play('sfx.dan', { loop: true })
            }
          } else if (this.danScanLoopHandle) {
            this.danScanLoopHandle.stop()
            this.danScanLoopHandle = null
          }
        },
        onDanParticleHit: () => {
          useAudio().play('sfx.dan.hit')
        },
        onDanCompletionPulse: null,
        onDamagePlayer: (damage, sourceX, sourceZ, source) => {
          this.applyPlayerDamageFeedback(damage, sourceX, sourceZ, source)
        },
        onKillPlayer: () => {
          const playerPos = this.playerController?.group.position
          this.applyPlayerDamageFeedback(999, playerPos?.x ?? 0, (playerPos?.z ?? 0) - 1)
        },
        onDestroyLander: (cause) => {
          const messageByCause: Record<'exterminate' | 'rescue' | 'bunker', string> = {
            exterminate: 'Lander Destroyed by Nest Blast',
            rescue: 'Lander Destroyed by Virus Blast',
            bunker: 'Lander Destroyed in Bunker Collapse',
          }
          this.failLanderRun(messageByCause[cause], { explode: true, hideLander: true })
        },
        onExplosion: (kind, x, y, z) => {
          this.triggerObjectiveExplosion(
            new Vector3(x, y, z),
            kind === 'exterminate' ? 32 : 36,
            kind === 'exterminate' ? 10 : 9,
          )
        },
        onRescueFail: (_idx, cause) => {
          this.showDeathOverlay(cause)
        },
        onSurvivorLost: (aliveRemaining: number) => {
          this.onSurvivorLost?.(aliveRemaining)
        },
        onSurvivorAboard: (aboardCount: number) => {
          this.onSurvivorAboard?.(aboardCount)
        },
        onInstallCombatDropObserver: (minigame) => {
          this.installDropObserver(minigame)
        },
        onLootChest: (tier) => {
          return this.handleLootChest(tier)
        },
        onRegisterObjectiveColliders: (colliders: readonly WorldCollider[]) => {
          this.collision.registerObjectiveColliders(colliders)
        },
      },
    })

    // ── Surface bunker hatch prop ────────────────────────────────
    // For bunker missions, drop the surface-side hatch prop at the
    // first objective's XZ. The interior antechamber hatch is owned
    // by the BunkerSceneController; this one lives on the asteroid.
    const firstObjective = mission.objectives[0]
    if (firstObjective?.type === 'bunker' && this.heightmap && this.asteroidSurface) {
      const tint = tintForGiver(mission.giverId)
      const hatch = new BunkerHatchModel(tint)
      const hatchY = this.heightmap.heightAt(firstObjective.x, firstObjective.z)
      hatch.group.position.set(firstObjective.x, hatchY, firstObjective.z)
      // Pulse activation is driven by proximity inside `BunkerMinigame.tick`.
      hatch.active = false
      this.asteroidSurface.group.add(hatch.group)
      hatch.group.updateWorldMatrix(true, true)
      this.collision.addObjectiveCollider(hatch.createWorldCollider('surface-bunker-hatch'))
      this.surfaceBunkerHatch = hatch
      this.surfaceHatchWorldPos.set(firstObjective.x, hatchY, firstObjective.z)
      const bunkerMinigame = this.minigames.getByObjectiveIndex(0)
      if (bunkerMinigame instanceof BunkerMinigame) {
        bunkerMinigame.setSurfaceHatch(hatch, { x: firstObjective.x, z: firstObjective.z })
        bunkerMinigame.onDescend = () => this.handleBunkerDescend()
        bunkerMinigame.onExit = () => this.handleBunkerExit()
      }
    }

    // ── Prospectus terminal kiosk ────────────────────────────────
    // For prospectus-terminal missions, place a Society-blue terminal kiosk
    // at the objective's XZ. The kiosk has no associated minigame; proximity
    // detection and E-key handling run in tickMinigames after the facade tick.
    const prospectusObjective = mission.objectives.find((o) => o.type === 'prospectus-terminal')
    if (prospectusObjective && this.heightmap && this.asteroidSurface) {
      const terminal = new TerminalModel()
      const terminalGroundY = this.heightmap.heightAt(prospectusObjective.x, prospectusObjective.z)
      terminal.placeAt(prospectusObjective.x, terminalGroundY, prospectusObjective.z)
      /** Society blue emissive tint to distinguish this kiosk from survey/DAN terminals. */
      const SOCIETY_BLUE = 0x2c5bb0
      terminal.setScreenEmissive(SOCIETY_BLUE)
      this.asteroidSurface.group.add(terminal.group)
      this.collision.addObjectiveCollider(terminal.createWorldCollider('prospectus-terminal'))
      this.prospectusTerminal = terminal
    }

    // ── Rocket-survey hidden utility for gather missions ─────────
    if (
      this.surfaceRocks &&
      this.heightmap &&
      this.fpsCamera &&
      this.rockYieldSystem &&
      this.projectileSystem &&
      this.impactEmitter
    ) {
      const gatherMinigame = mission.objectives
        .map((_, idx) => this.getMinigame(idx))
        .find((mg): mg is GatherMinigame => mg instanceof GatherMinigame)
      if (gatherMinigame) {
        this.rocketSurvey = new RocketSurveyFacade(
          {
            scene: this.sceneManager.scene,
            projectileSystem: this.projectileSystem,
            rockYieldSystem: this.rockYieldSystem,
            surfaceRocks: this.surfaceRocks,
            heightmap: this.heightmap,
            impactEmitter: this.impactEmitter,
            fpsCamera: this.fpsCamera,
            levelAudio: this.levelAudio,
            gather: gatherMinigame,
          },
          {
            onSurvey: (label) => this.onSurvey?.(label),
          },
        )
        this.rocketSurvey.attach()
      }
    }

    // ── Lander explosion VFX ───────────────────────────────────────
    this.landerExplosion = new LanderExplosion()
    this.sceneManager.addToScene(this.landerExplosion.fireEmitter.points)
    this.sceneManager.addToScene(this.landerExplosion.debrisEmitter.points)

    // ── State machine ───────────────────────────────────────────
    this.stateMachine = createLevelStateMachine({
      onStateChange: (current, previous) => this.onStateTransition(current, previous),
      isLanderGrounded: () => this.landerController?.body.grounded ?? false,
      isPlayerNearLander: () => this.isPlayerNearLander(),
      isLanderNearShuttle: () => this.isLanderNearShuttle(),
      hasCompletedEva: () => this.isEligibleForExfil(),
    })

    // ── Always-active tickables ─────────────────────────────────
    this.tickHandler.register(this.stateMachine, TICK_PRIORITY_INPUT + 1)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // Debug HUD instrumentation. Sits at RENDER + 1 so renderer.info reflects
    // the frame that was just submitted by the SceneManager / postprocessor.
    if (isDebugHudEnabled()) {
      this.debugMetricsTracker = new DebugMetricsTracker({
        renderer: this.sceneManager.renderer,
        tickHandler: this.tickHandler,
        getEnemyCount: () => this.minigames.enemyCount,
        getProjectileCount: () => this.projectileSystem?.projectileCount ?? 0,
      })
      this.tickHandler.register(this.debugMetricsTracker, TICK_PRIORITY_RENDER + 1)
    }

    // Make sure the in-parallel prop GLB preloads have landed before we
    // let the arrival cinematic start ticking, so the first exterminate
    // / rescue / virus mission doesn't hitch on a just-in-time GLB parse.
    this.emitBootState('preparing', 'Calibrating surface operations')
    await propPreloads

    this.emitBootState('ready', 'Ready for drop')
    this.emitBootState('started', 'Running')

    // ── Arrival state starts with lander physics + cinematic cam ─
    this.enterArrival()

    // ── Dev tools ────────────────────────────────────────────────
    DevConsole.register('LevelView', {
      takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
      heal: () => this.playerController?.replenish(),
      kill: () => this.playerController?.takeDamage(999),
      landerDamage: (amount = 20) => this.landerController?.takeDamage(amount),
      landerDestroy: () => this.landerController?.takeDamage(999),
      // Spawn near waypoint (see devLandNearObjective)
      landNearObjective: (objectiveIndex = 0, offsetMeters = DEV_LAND_NEAR_OBJECTIVE_OFFSET_M) =>
        this.devLandNearObjective(objectiveIndex, offsetMeters),
      exfil: () => {
        this.hasExitedVehicle = true
        this.stateMachine?.setState('exfil' as LevelState)
      },
    })

    // ── Post-processing (wraps renderer) ───────────────────────
    const initialCam = this.vehicleCamera?.camera ?? this.fpsCamera?.camera
    if (initialCam) {
      this.postProcessing = new LevelPostProcessing(
        this.sceneManager.renderer,
        this.sceneManager.scene,
        initialCam,
        { lutUrl: resolveLevelLutUrl(mission, asteroid.lighting.lutUrl) },
      )
      this.sceneManager.renderOverride = () => {
        const cam = this.sceneManager!.activeCamera
        if (cam) this.postProcessing!.setCamera(cam)
        this.postProcessing!.render()
      }
      this.sceneManager.onResizeCallback = (w, h) => this.postProcessing!.resize(w, h)
    }

    // ── Shader pre-compile warmup ──────────────────────────────
    // Three.js compiles shader programs the first time a material is drawn.
    // For PBR (`MeshStandardMaterial`) and our many `ShaderMaterial` variants
    // this is a multi-hundred-millisecond — sometimes multi-second — main-thread
    // stall on a cold GPU shader cache. v2 made this **worse** by enabling
    // frustum culling on rocks: instead of compiling once during the loading
    // screen (because every rock batch was always rendered), shader compile
    // was deferred until rotation brought a batch into view, producing the
    // 3s RAF hitches the user reported.
    //
    // `compileAsync` walks the entire scene with `traverse` (not
    // `traverseVisible`), so even hidden meshes — exterminate craters,
    // pooled enemy projectiles, etc. — get warmed up. Where the
    // `KHR_parallel_shader_compile` extension is available the compile
    // happens off-thread; otherwise it still moves the cost to load time
    // (where the existing mission intro masks it) instead of into gameplay.
    //
    // We don't bail on warmup failure — the game still works without it,
    // just with the hitches it had before. A console warn is enough.
    //
    // @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v3)
    await this.precompileShaders()

    // ── Start ───────────────────────────────────────────────────
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
    this.landerAudio.start()
  }

  /**
   * Run a one-shot WebGL shader pre-compile pass over the whole level scene.
   *
   * Should be called exactly once, after every static system has been built
   * (terrain, rocks, lander, enemies, hostages, post-processing) and before
   * the game loop starts. Idempotent — calling it twice is harmless but
   * wastes time.
   *
   * **Why we force lights visible.** Three.js's `compile()` walks lights with
   * `traverseVisible` (not `traverse`), so any light whose `.visible` is
   * `false` at warmup time is **excluded from the program defines**
   * (`NUM_SPOT_LIGHTS`, `NUM_POINT_LIGHTS`, ...). Several lights in the
   * level start invisible and only flip on later — `helmetLightRig`
   * (`enterEva`), `washLight` (lander thrust), `explosionLight` (mid-fight
   * detonation). Without this protection, the moment any of those flips
   * on, every PBR material's program key changes and Three.js recompiles
   * the program **the next time each material is drawn**. For
   * frustum-culled rock batches that's during a camera rotation — exactly
   * the multi-second RAF stall the user reported.
   *
   * We snapshot every light's visibility, force them all visible, run the
   * compile (which uses `traverseVisible` for lights but `traverse` for
   * materials so it warms hidden meshes too), then restore. Any light count
   * <= the warmup max reuses the warmed program; only counts greater than
   * what we set up here would trigger a real recompile.
   *
   * Uses the FPS camera if available (its layer mask is the most permissive
   * for EVA materials), falling back to the vehicle camera and finally to
   * `SceneManager.activeCamera`. The choice of camera does **not** affect
   * which materials are compiled — only which light/fog state the program
   * is configured against.
   *
   * @returns A promise that resolves when every program reports ready.
   *   Resolves immediately on environments that lack `compileAsync` (older
   *   Three.js builds) so callers can `await` unconditionally.
   *
   * @see docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v3)
   */
  private async precompileShaders(): Promise<void> {
    if (!this.sceneManager) return
    const renderer = this.sceneManager.renderer
    const scene = this.sceneManager.scene
    const camera =
      this.fpsCamera?.camera ?? this.vehicleCamera?.camera ?? this.sceneManager.activeCamera
    if (!camera) return

    // `renderer.compile` uses `traverseVisible` under the hood and skips any
    // Object3D with `.visible === false`. The FPS view-model (player body +
    // multi-tool) is staged invisible until the player presses F to exit the
    // lander, so without flipping them on here their materials compile on the
    // first EVA frame and hitch the transition. Flip on + restore.
    const restoreLightVisibility: Array<{ light: THREE.Light; visible: boolean }> = []
    scene.traverse((obj) => {
      const maybeLight = obj as THREE.Light
      if (maybeLight.isLight) {
        restoreLightVisibility.push({ light: maybeLight, visible: maybeLight.visible })
        maybeLight.visible = true
      }
    })

    const stagedHidden: Array<{ obj: THREE.Object3D; visible: boolean }> = []
    const stageVisible = (obj: THREE.Object3D | null | undefined): void => {
      if (!obj) return
      stagedHidden.push({ obj, visible: obj.visible })
      obj.visible = true
    }
    stageVisible(this.playerController?.group)
    // The multi-tool is hidden after GLB load until `enterEva`; a second
    // `precompileShaders` runs after bunker descent while the tool is still
    // visible. Snapshot + restore — do not force false in `finally` or the gun
    // disappears for the rest of the bunker run.
    const multiToolWasVisible = this.multiTool?.getVisible() ?? false
    this.multiTool?.setVisible(true)
    this.enemyVisualWarmup ??= createEnemyVisualWarmup()
    scene.add(this.enemyVisualWarmup.group)
    this.enemyVisualWarmup.stageForCamera(camera)
    stageVisible(this.enemyVisualWarmup.group)

    try {
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(scene, camera)
      } else if (typeof renderer.compile === 'function') {
        renderer.compile(scene, camera)
      }
    } catch (err) {
      console.warn(
        '[LevelViewController] shader precompile failed; gameplay may hitch on first appearance of new materials',
        err,
      )
    } finally {
      for (const entry of restoreLightVisibility) {
        entry.light.visible = entry.visible
      }
      for (const entry of stagedHidden) {
        entry.obj.visible = entry.visible
      }
      if (this.enemyVisualWarmup) {
        this.enemyVisualWarmup.restoreFrustumCulling()
        this.enemyVisualWarmup.group.visible = false
      }
      this.multiTool?.setVisible(multiToolWasVisible)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // State transition dispatcher
  // ═══════════════════════════════════════════════════════════════

  private onStateTransition(current: LevelState, _previous: LevelState | null): void {
    switch (_previous) {
      case 'arrival':
        this.exitArrival()
        break
      case 'lander':
        this.exitLander()
        break
      case 'eva':
        // Don't run normal exitEva when dying (enterDead handles its own cleanup)
        // or when transitioning into the bunker — the bunker scene reuses the
        // EVA tick chain (player movement + tools + camera) and only swaps the
        // visible scene roots.
        if (current !== 'dead' && current !== 'bunker-interior') this.exitEva()
        break
    }

    switch (current) {
      case 'lander':
        this.enterLander()
        break
      case 'eva':
        // Coming back from the bunker also lands here — the EVA tick chain
        // is already registered, so re-running enterEva would double-register.
        if (_previous !== 'bunker-interior') this.enterEva()
        break
      case 'dead':
        this.enterDead()
        break
      case 'failed':
        this.enterFailed()
        break
      case 'exfil':
        this.enterExfil()
        break
      case 'complete':
        this.enterComplete()
        break
    }

    this.syncBunkerInteriorPostProcessing(current)
  }

  /**
   * Bunker EVA reuses the level composer; drop bloom/CA/vignette there only.
   */
  private syncBunkerInteriorPostProcessing(levelState: LevelState): void {
    this.postProcessing?.setBunkerInteriorReducedPipeline(levelState === 'bunker-interior')
  }

  // ═══════════════════════════════════════════════════════════════
  // Arrival state
  // ═══════════════════════════════════════════════════════════════

  /** Saved lighting intensities to restore after cinematic. */
  private savedSunIntensity = 0
  private savedFillIntensity = 0

  private enterArrival(): void {
    // Hide the gameplay lander — the shuttle's cargo lander is visible during the cinematic
    if (this.landerController) {
      this.landerController.group.visible = false
    }

    // Use the arrival sequence camera
    if (this.arrivalSequence) {
      this.sceneManager!.setActiveCamera(this.arrivalSequence.camera)
    }

    // Disable orbit controls during arrival
    this.vehicleCamera!.controls.enabled = false

    // Boost scene lighting for cinematic readability
    if (this.lightingRig) {
      this.savedSunIntensity = this.lightingRig.sun.intensity
      this.savedFillIntensity = this.lightingRig.fill.intensity
      this.lightingRig.sun.intensity = Math.max(this.savedSunIntensity, 4)
      this.lightingRig.fill.intensity = Math.max(this.savedFillIntensity, 1.5)
    }

    this.landerAudio.notifyArrivalCinematicStart()

    // Letterbox
    this.onLetterbox?.(true)
  }

  private exitArrival(): void {
    // Show the lander for gameplay
    if (this.landerController) {
      this.landerController.group.visible = true
    }

    // Restore gameplay lighting
    if (this.lightingRig) {
      this.lightingRig.sun.intensity = this.savedSunIntensity
      this.lightingRig.fill.intensity = this.savedFillIntensity
    }

    // Letterbox starts closing
    this.onLetterbox?.(false)
  }

  /**
   * Dev-console: teleport the lander to a surface point near `mission.objectives[i]`,
   * offset radially inward toward `(0,0)` (parked shuttle) so the playable craft sits between the ship and the site.
   *
   * @param objectiveIndex - 0-based mission objective slot.
   * @param offsetMeters - How far toward the ship from the waypoint (XZ plane).
   */
  private devLandNearObjective(objectiveIndex: number, offsetMeters: number): string | undefined {
    if (!this.mission?.objectives.length) {
      const msg = '[AsteroidDev] landNearObjective: no mission objectives'
      console.warn(msg)
      return msg
    }
    if (!this.heightmap) {
      const msg = '[AsteroidDev] landNearObjective: heightmap unavailable'
      console.warn(msg)
      return msg
    }
    if (!this.landerController) {
      const msg = '[AsteroidDev] landNearObjective: lander unavailable'
      console.warn(msg)
      return msg
    }
    const objectives = this.mission.objectives
    const idx = Math.max(0, Math.min(Math.floor(Number(objectiveIndex)), objectives.length - 1))
    const spawn = this.computeDevLandingWorldNearObjective(objectives[idx]!, offsetMeters)
    if (!spawn) {
      const msg = '[AsteroidDev] landNearObjective: could not sample terrain near objective'
      console.warn(msg)
      return msg
    }

    if (this.stateMachine?.is('arrival')) {
      this.devConsoleForcedLanderSpawn = spawn.clone()
      console.info(
        `[AsteroidDev] landNearObjective: scheduled OBJ ${idx} (~${spawn.x.toFixed(0)}, ${spawn.y.toFixed(0)}, ${spawn.z.toFixed(0)}) for arrival detach`,
      )
      return `[scheduled] OBJ ${idx} near (${spawn.x.toFixed(1)}, ${spawn.z.toFixed(1)})`
    }

    const bad =
      this.stateMachine?.is('exfil') ||
      this.stateMachine?.is('complete') ||
      this.stateMachine?.is('dead') ||
      this.stateMachine?.is('failed') ||
      this.stateMachine?.is('bunker-interior')
    if (bad) {
      const msg = `[AsteroidDev] landNearObjective: not supported in state '${String(this.stateMachine?.state ?? 'null')}'`
      console.warn(msg)
      return msg
    }

    const gameplayStart = offsetGameplayLanderSpawn(spawn.clone())
    this.initialLanderSpawn.copy(gameplayStart)
    this.landerController.resetForRespawn(gameplayStart)
    console.info(
      `[AsteroidDev] landNearObjective: moved OBJ ${idx} (~${gameplayStart.x.toFixed(0)}, ${gameplayStart.y.toFixed(0)}, ${gameplayStart.z.toFixed(0)})`,
    )
    return `[moved] OBJ ${idx} near (${gameplayStart.x.toFixed(1)}, ${gameplayStart.z.toFixed(1)})`
  }

  /**
   * World-space spawn position (before {@link offsetGameplayLanderSpawn}) slightly above baked terrain near an objective waypoint.
   *
   * @param objective - Resampled waypoint with `.x`, `.z` on the playable face.
   * @param offsetMeters - Horizontal pull toward `(0,0)`.
   * @returns `null` when the height probe fails outright.
   */
  private computeDevLandingWorldNearObjective(
    objective: ConcreteObjective,
    offsetMeters: number,
  ): Vector3 | null {
    const ox = objective.x
    const oz = objective.z
    let nx = -ox
    let nz = -oz
    const planarLen = Math.hypot(nx, nz)
    if (planarLen < 1e-3) {
      nx = 1
      nz = 0
    } else {
      nx /= planarLen
      nz /= planarLen
    }
    let tx = ox + nx * offsetMeters
    let tz = oz + nz * offsetMeters
    tx = THREE.MathUtils.clamp(tx, -LEVEL_GRID_SIZE / 2, LEVEL_GRID_SIZE / 2)
    tz = THREE.MathUtils.clamp(tz, -LEVEL_GRID_SIZE / 2, LEVEL_GRID_SIZE / 2)
    const gh = this.heightmap!.tryHeightAt(tx, tz) ?? this.heightmap!.tryHeightAt(ox, oz)
    if (gh == null) {
      return null
    }

    const y = gh + DEV_LAND_SPAWN_CLEARANCE_ABOVE_GROUND_M
    return new Vector3(tx, y, tz)
  }

  // ═══════════════════════════════════════════════════════════════
  // Lander state
  // ═══════════════════════════════════════════════════════════════

  private enterLander(): void {
    // Force the throttled HUD telemetry to emit on the very next tick so the
    // lander HUD lights up immediately on state change.
    this.telemetry.resetThrottle()
    this.stateLifecycle.enterLander(
      {
        tickHandler: this.tickHandler!,
        sceneManager: this.sceneManager!,
        postProcessing: this.postProcessing,
        priorities: { physics: TICK_PRIORITY_PHYSICS, render: TICK_PRIORITY_RENDER },
      },
      {
        landerController: this.landerController!,
        vehicleCamera: this.vehicleCamera!,
        landerExplosion: this.landerExplosion!,
      },
    )

    // Mission announcement — first lander entry only (after arrival cutscene)
    if (!this.missionAnnounced && this.mission) {
      this.missionAnnounced = true
      this.onMissionAnnounce?.(this.asteroidName, this.mission.name)
    }
  }

  private exitLander(): void {
    this.stateLifecycle.exitLander(
      {
        tickHandler: this.tickHandler!,
        sceneManager: this.sceneManager!,
        postProcessing: this.postProcessing,
        priorities: { physics: TICK_PRIORITY_PHYSICS, render: TICK_PRIORITY_RENDER },
      },
      {
        landerController: this.landerController!,
        vehicleCamera: this.vehicleCamera!,
        landerExplosion: this.landerExplosion!,
      },
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // EVA state
  // ═══════════════════════════════════════════════════════════════

  private enterEva(): void {
    // Force the throttled HUD telemetry to emit on the very next tick so the
    // EVA HUD lights up immediately on state change.
    this.telemetry.resetThrottle()
    this.hasExitedVehicle = true
    this.playerController!.group.position.copy(this.findSafeEvaSpawnPosition())

    this.stateLifecycle.enterEva(
      {
        tickHandler: this.tickHandler!,
        sceneManager: this.sceneManager!,
        postProcessing: this.postProcessing,
        priorities: { physics: TICK_PRIORITY_PHYSICS, render: TICK_PRIORITY_RENDER },
      },
      {
        playerController: this.playerController!,
        fpsCamera: this.fpsCamera!,
        multiToolState: this.multiToolState!,
        multiTool: this.multiTool!,
        projectileSystem: this.projectileSystem!,
        impactEmitter: this.impactEmitter!,
        tractorEmitter: this.tractorEmitter,
        surfaceRocks: this.surfaceRocks,
        onClearRockTarget: () => {
          this.currentRockTarget = null
        },
      },
    )

    // Pointer lock
    this.setupPointerLock()
    this.pointerLock.requestLock()

    // Hand FPS audio (breathing, floating, contact-damage loop, ranged
    // damage composite) over to the director. It owns all loop handles
    // and edge-detect state from here until the matching `stop()`.
    this.fpsAudio.start()
  }

  private exitEva(): void {
    // Replenish O2 and stamina (back in lander, connected to life support).
    // Also clear the hypoxia vignette — `tickEva` only updates the fade while
    // in EVA, so without an explicit reset the suit-darken stays on screen
    // through the entire lander leg.
    this.playerController!.replenish()
    this.onDeathFade?.(0)

    this.stateLifecycle.exitEva(
      {
        tickHandler: this.tickHandler!,
        sceneManager: this.sceneManager!,
        postProcessing: this.postProcessing,
        priorities: { physics: TICK_PRIORITY_PHYSICS, render: TICK_PRIORITY_RENDER },
      },
      {
        playerController: this.playerController!,
        fpsCamera: this.fpsCamera!,
        multiToolState: this.multiToolState!,
        multiTool: this.multiTool!,
        projectileSystem: this.projectileSystem!,
        impactEmitter: this.impactEmitter!,
        tractorEmitter: this.tractorEmitter,
        surfaceRocks: this.surfaceRocks,
        onClearRockTarget: () => {
          this.currentRockTarget = null
        },
      },
    )

    // Release pointer lock
    this.pointerLock.releaseLock()
    this.teardownPointerLock()

    // Cuts breathing, floating, and any in-flight contact-damage loop.
    this.fpsAudio.stop()
  }

  // ═══════════════════════════════════════════════════════════════
  // Bunker scene swap (descent + extract)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Look up the currently-active {@link BunkerMinigame}, if one exists.
   * Returns `null` when the active minigame is some other type (rescue,
   * exterminate, etc.) or when no minigame is active. Used by the per-frame
   * tick to read bunker-specific state (e.g. {@link BunkerMinigame.bunkerFloorY})
   * without the call site needing to know about the minigame facade shape.
   *
   * @returns Active bunker minigame, or `null`.
   */
  private getActiveBunkerMinigame(): BunkerMinigame | null {
    const active = this.minigames.getActive()
    return active instanceof BunkerMinigame ? active : null
  }

  /**
   * Player pressed E on the surface hatch within range. Snapshot the player
   * position, fade to black, swap to the bunker scene at peak black, fade
   * back in. Wired by {@link BunkerMinigame.onDescend}.
   */
  private handleBunkerDescend(): void {
    if (this.bunkerSwapFade) return
    const minigame = this.minigames.getByObjectiveIndex(0)
    if (!(minigame instanceof BunkerMinigame)) return
    if (!this.playerController || !this.stateMachine) return

    this.surfacePlayerSnapshot = this.playerController.group.position.clone()
    const descentPos = this.surfacePlayerSnapshot
    this.startBunkerSwapFade(() => {
      // Swap scenes at peak black.
      if (this.asteroidSurface) this.asteroidSurface.group.visible = false
      if (this.surfaceRocks) this.surfaceRocks.group.visible = false
      // Hide surface props the player shouldn't see while inside the bunker:
      // the lander, the orbital shuttle, and the objective waypoint beam.
      if (this.landerController) this.landerController.group.visible = false
      if (this.arrivalSequence) this.arrivalSequence.shuttleGroup.visible = false
      if (this.surfaceBunkerHatch) this.surfaceBunkerHatch.group.visible = false
      this.projectileSystem?.setTerrainCollisionEnabled(false)
      setWaypointMarkersVisible(false)
      minigame.setSceneRootWorldPosition(descentPos.x, descentPos.y, descentPos.z)
      minigame.notifyDescended()
      // Bunker `activate()` adds five arena PointLights that were not in the scene at initial
      // `precompileShaders` — without a second pass, Three.js recompiles PBR the first time that
      // light count hits materials (often on look-strafe), matching multi-frame stalls in
      // docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md (v3).
      void this.precompileShaders()
      // The bunker antechamber's floor sits at the bunker root, which equals
      // `descentPos.y`. Override the player's ground sampler so the asteroid
      // heightmap (which doesn't model the interior) doesn't leak through.
      this.playerController?.setGroundYOverride(descentPos.y)
      const spawn = minigame.playerSpawn
      if (spawn && this.playerController) {
        // playerSpawn is in bunker-local coords; adding the descent position
        // (which is now the bunker root's world position) gives the world spawn.
        this.playerController.group.position.set(
          descentPos.x + spawn.x,
          descentPos.y + spawn.y,
          descentPos.z + spawn.z,
        )
        this.playerController.body.velocityY = 0
      }
      this.stateMachine?.trigger('enterBunker')
    })
  }

  /**
   * Player pressed E on the antechamber exit hatch while the FSM is in
   * `exit-prompt`. Mirror of {@link handleBunkerDescend}: fade out, restore
   * the asteroid scene, place the player back at their surface snapshot,
   * fade in. Wired by {@link BunkerMinigame.onExit}.
   */
  private handleBunkerExit(): void {
    if (this.bunkerSwapFade) return
    const minigame = this.minigames.getByObjectiveIndex(0)
    if (!(minigame instanceof BunkerMinigame)) return
    if (!this.playerController || !this.stateMachine) return

    this.startBunkerSwapFade(() => {
      minigame.notifyExitInteract()
      if (this.asteroidSurface) this.asteroidSurface.group.visible = true
      if (this.surfaceRocks) this.surfaceRocks.group.visible = true
      // Restore surface props hidden on descent.
      if (this.landerController) this.landerController.group.visible = true
      if (this.arrivalSequence) this.arrivalSequence.shuttleGroup.visible = true
      if (this.surfaceBunkerHatch) this.surfaceBunkerHatch.group.visible = true
      this.projectileSystem?.setTerrainCollisionEnabled(true)
      setWaypointMarkersVisible(true)
      const restore = this.surfacePlayerSnapshot ?? this.surfaceHatchWorldPos
      if (this.playerController) {
        this.playerController.group.position.copy(restore)
        this.playerController.body.velocityY = 0
      }
      // Restore terrain-based ground sampling now we're back on the surface.
      this.playerController?.setGroundYOverride(null)
      this.surfacePlayerSnapshot = null
      this.onTerminalPrompt?.(null)
      this.stateMachine?.trigger('exitBunker')
    })
  }

  /**
   * Begin a black-fade swap. Drives the fade through {@link tick}; the
   * supplied `swap` callback fires once at peak black. Subsequent descent /
   * exit requests are ignored while a swap is already in flight.
   *
   * @param swap - Function to run while the screen is fully black
   */
  private startBunkerSwapFade(swap: () => void): void {
    this.bunkerSwapFade = { elapsed: 0, swapped: false, swap }
    this.onArrivalFade?.(0)
  }

  /**
   * Per-frame driver for the bunker descent / extract fade. Runs the
   * 0→1→0 ramp on the shared arrival-fade overlay and fires the swap
   * callback at peak black.
   *
   * @param dt - Frame delta in seconds
   */
  private tickBunkerSwapFade(dt: number): void {
    const fade = this.bunkerSwapFade
    if (!fade) return
    fade.elapsed += dt
    if (fade.elapsed < BUNKER_SWAP_FADE_OUT_SECONDS) {
      const t = fade.elapsed / BUNKER_SWAP_FADE_OUT_SECONDS
      this.onArrivalFade?.(Math.min(1, t))
      return
    }
    if (!fade.swapped) {
      this.onArrivalFade?.(1)
      fade.swap()
      fade.swapped = true
      return
    }
    const inT = (fade.elapsed - BUNKER_SWAP_FADE_OUT_SECONDS) / BUNKER_SWAP_FADE_IN_SECONDS
    if (inT >= 1) {
      this.onArrivalFade?.(0)
      this.bunkerSwapFade = null
      return
    }
    this.onArrivalFade?.(Math.max(0, 1 - inT))
  }

  // ═══════════════════════════════════════════════════════════════
  // Dead / Failed states
  // ═══════════════════════════════════════════════════════════════

  private enterDead(): void {
    // Notify the active DAN scan so its state machine flips to failed before
    // the death overlay routes through the existing fail UX.
    const active = this.minigames.getActive()
    if (active instanceof DanMinigame) {
      active.notifyPlayerDied()
    }
    // Stop player movement but keep fpsCamera ticking for the death pitch-down.
    this.stateLifecycle.enterDead(
      {
        tickHandler: this.tickHandler!,
        sceneManager: this.sceneManager!,
        postProcessing: this.postProcessing,
        priorities: { physics: TICK_PRIORITY_PHYSICS, render: TICK_PRIORITY_RENDER },
      },
      {
        playerController: this.playerController!,
        fpsCamera: this.fpsCamera!,
        multiToolState: this.multiToolState!,
        multiTool: this.multiTool!,
        projectileSystem: this.projectileSystem!,
        impactEmitter: this.impactEmitter!,
        tractorEmitter: this.tractorEmitter,
        surfaceRocks: this.surfaceRocks,
        onClearRockTarget: () => {
          this.currentRockTarget = null
        },
      },
    )

    // Release pointer lock
    this.pointerLock.releaseLock()
    this.teardownPointerLock()

    // exitEva is skipped on the dead path so we must cut EVA audio here
    // explicitly. The director's stop() also resets footstep cadence.
    this.fpsAudio.stop()
    this.levelAudio.notifyEvaDeath()

    // Fade + message are driven by the dead state tick, not set here
  }

  private enterFailed(): void {
    if (this.manualDeathRestartOverlayActive) return
    this.restartLevel()
  }

  /**
   * Show the clickable death overlay and release FPS input capture.
   *
   * Rescue and bunker objective failures can occur while the FPS pointer lock
   * is active. Releasing it here keeps the overlay button interactive even
   * when the controller does not transition through the normal dead state.
   *
   * @param cause - Failure cause shown on the overlay.
   */
  private showDeathOverlay(cause: string): void {
    this.pointerLock.releaseLock()
    this.teardownPointerLock()
    this.fpsAudio.stop()
    this.onDeathOverlay?.(true, cause)
  }

  /** Called from the death overlay restart button. */
  restart(): void {
    this.restartLevel()
  }

  /** Get the resolved mission (for UI to read objectives). */
  getMission(): GeneratedAsteroidMission | null {
    return this.mission
  }

  /** Get the minigame for a given objective index (for step tracking). */
  getMinigame(objectiveIndex: number): MiniGame | undefined {
    return this.minigames.getByObjectiveIndex(objectiveIndex)
  }

  /** Active minigame (first one with `status === 'active'`), if any. */
  getActiveMinigame(): MiniGame | undefined {
    return this.minigames.getActive()
  }

  // ═══════════════════════════════════════════════════════════════
  // Exfil / Complete states
  // ═══════════════════════════════════════════════════════════════

  private enterExfil(): void {
    // Fire mission complete if all objectives done. multitoolScience multiplier
    // is now applied in enterComplete via persistCompletedAsteroidMissionRewards.
    if (this.minigames.areAllComplete()) {
      this.onMissionComplete?.()
    }

    // Unregister lander tickables
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
    this.vehicleCamera!.controls.enabled = false

    // Hide the gameplay lander
    this.landerController!.group.visible = false

    // Letterbox for cinematic framing
    this.onLetterbox?.(true)

    // Switch to cinematic camera
    this.sceneManager!.setActiveCamera(this.arrivalSequence!.camera)
    this.sceneManager!.setCamera(null)

    // Cockpit ambient starts now; the departure sting fires when the ship actually moves
    this.landerAudio.notifyExfilCinematicStart()

    // Start reverse cutscene
    this.arrivalSequence!.playExfil(this.landerController!.group.position)

    this.arrivalSequence!.onFadeOut = (opacity) => {
      this.onArrivalFade?.(opacity)
    }

    // Stop cockpit bed when exfil sequence finishes (onComplete shared with arrival sequence)
    this.arrivalSequence!.onComplete = () => {
      this.landerAudio.notifyExfilCinematicEnd()
      this.onArrivalFade?.(0)
    }
  }

  private enterComplete(): void {
    this.clearLanderHullPersistTimer()
    this.flushLanderHullToProfile()

    if (this.persistShuttleMissionRewards && this.mission && this.minigames.areAllComplete()) {
      hydratePlayerUpgradeLevelsFromStorage()
      const scienceMult =
        getCurrentUpgradeValue('shuttleScienceStation') * getCurrentUpgradeValue('multitoolScience')
      persistCompletedAsteroidMissionRewards(this.mission, scienceMult)
    }

    import('@/router').then(({ default: router }) => {
      router.push('/map')
    })
  }

  private restartLevel(): void {
    this.clearLanderHullPersistTimer()
    this.pendingDeathOverlayCause = null
    this.manualDeathRestartOverlayActive = false

    this.onDeathOverlay?.(false, '')
    this.onDeathFade?.(0)
    this.onDeathMessage?.(false)
    this.onArrivalFade?.(0)
    this.onLetterbox?.(false)

    this.pointerLock.releaseLock()
    this.teardownPointerLock()
    this.projectileSystem?.setTerrainCollisionEnabled(true)

    this.landerDestroyed = false
    // Hull / fuel failure after objectives are done calls this path with every
    // minigame still `completed`. Do not wipe EVA history then — it would block
    // exfil until we also treat `areAllComplete()` as qualification (see
    // `isEligibleForExfil`). Fresh failed runs (not all objectives done) reset.
    if (!this.minigames.areAllComplete()) {
      this.hasExitedVehicle = false
    }

    if (this.landerController) {
      this.landerController.group.visible = true
      this.landerController.resetForRespawn(this.initialLanderSpawn)
      this.landerController.flameEmitter.reset()
      for (const emitter of this.landerController.rcsEmitters.values()) {
        emitter.reset()
      }
    }

    if (this.playerController) {
      this.playerController.replenish()
      this.playerController.group.visible = false
      this.playerController.group.position.copy(this.initialLanderSpawn)
      this.playerController.body.velocityY = 0
      this.playerController.body.grounded = false
    }

    if (this.multiToolState) {
      this.multiToolState.setAiming(false)
      this.multiToolState.setInput(false, false)
    }
    this.multiTool?.setVisible(false)
    this.fpsCamera?.setAiming(false, 1, 1)
    if (this.fpsCamera) {
      this.fpsCamera.helmetLightRig.visible = false
    }

    if (this.arrivalSequence) {
      this.arrivalSequence.parkShuttle()
      this.arrivalSequence.onFadeOut = (opacity) => {
        this.onArrivalFade?.(opacity)
      }
    }

    this.sceneManager?.setActiveCamera(null)
    if (this.vehicleCamera && this.landerController) {
      this.vehicleCamera.setTarget(this.landerController.group)
      this.sceneManager?.setCamera(this.vehicleCamera)
      this.postProcessing?.setCamera(this.vehicleCamera.camera)
    }

    this.stateMachine?.setState('lander')
  }

  private failLanderRun(
    cause: string,
    options: { explode?: boolean; hideLander?: boolean } = {},
  ): void {
    if (!this.landerController || this.landerDestroyed) return

    this.landerDestroyed = true

    if (options.explode) {
      this.landerExplosion!.explode(this.landerController.group.position.clone(), 20)
      this.vehicleCamera?.shake(12, 1.0)
    }

    this.landerController.flameEmitter.reset()
    for (const emitter of this.landerController.rcsEmitters.values()) {
      emitter.reset()
    }

    if (options.hideLander) {
      this.landerController.group.visible = false
    }

    // Stop lander physics/input — the run is over.
    this.tickHandler!.unregister(this.landerController)
    // Release pointer lock so the death overlay is interactive. Without
    // this, dying mid-EVA leaves the cursor captured and the player
    // can't click the overlay buttons. Idempotent when no lock is held
    // (lander-mode deaths, where the canvas isn't pointer-locked).
    this.pointerLock.releaseLock()
    this.onDeathOverlay?.(true, cause)

    // Cut all in-flight gameplay sounds (sfx — engine, RCS, alarms,
    // shake — plus cockpit ambient). The lander tick is no longer
    // running so its engine envelope won't reach zero naturally; the
    // director's destroyed-run sweep handles the blunt cut and drops
    // its own internal handle references so the next rising edge
    // re-creates them cleanly.
    this.landerAudio.notifyLanderRunFailed()
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** Per-frame update — dispatches F key triggers and mode-specific logic. */
  tick(dt: number): void {
    this.elapsed += dt
    this.updateMiningSizzle()

    // Heal-pulse emissive decay — runs always so the green flash fades
    // even when the lander is not registered for ticking (EVA mode).
    this.landerController?.tickFeedback(dt)

    // Tick arrival sequence if active
    if (this.arrivalSequence) {
      this.arrivalSequence.tick(dt)
    }

    // Animate waypoint beams
    const activePos = this.stateMachine?.is('eva')
      ? this.playerController?.group.position
      : this.landerController?.position
    updateWaypointMarkers(this.elapsed, activePos?.x, activePos?.z)

    // Slide the sun shadow frustum to follow the active actor so the
    // tight shadow camera always covers the lander/EVA player.
    if (activePos) {
      this.lightingRig?.setFocus(activePos)
    }

    // ESC → skip arrival cinematic
    if (this.inputManager?.wasActionPressed('skipCinematic') && this.stateMachine?.is('arrival')) {
      this.arrivalSequence?.parkShuttle()
      if (this.landerController) {
        this.landerController.group.visible = true
      }
      this.landerAudio.notifyArrivalCinematicEnd()
      this.onArrivalFade?.(0)
      this.stateMachine.setState('lander' as LevelState)
    }

    if (this.stateMachine?.is('lander') && this.isLanderAdrift()) {
      this.failLanderRun('Adrift')
    }

    if (this.stateMachine?.is('eva') && this.isPlayerAdrift()) {
      this.failLanderRun('Adrift')
    }

    // F key → state triggers (only one can succeed per press)
    if (
      this.inputManager?.wasActionPressed('interact') &&
      this.stateMachine &&
      !this.landerDestroyed
    ) {
      if (!this.stateMachine.trigger('exfiltrate')) {
        if (!this.stateMachine.trigger('exitVehicle')) {
          // Suppress lander entry while a DAN scan is underway — the lander is
          // the defended asset and stepping inside it would skip the EVA combat
          // phase. Failure paths still flow through the existing UX.
          if (!this.isLanderEntryBlockedByDan()) {
            this.stateMachine.trigger('enterVehicle')
          }
        }
      }
    }

    // EVA + bunker share the FPS player tick (movement, tools, camera, audio).
    if (this.stateMachine?.is('eva') || this.stateMachine?.is('bunker-interior')) {
      this.tickEva(dt)

      // While inside the bunker, the asteroid heightmap doesn't model the
      // bunker floor — the player would sink or float at the heightfield
      // value sampled at the bunker's world XZ. Pin the player's foot to
      // the bunker antechamber floor while `bunker-interior` is active.
      // This loses any in-bunker vertical movement, but slice 1 has no
      // vertical bunker geometry so the clamp is correct.
      if (this.stateMachine?.is('bunker-interior') && this.playerController) {
        const bunkerMinigame = this.getActiveBunkerMinigame()
        const floorY = bunkerMinigame?.bunkerFloorY
        if (floorY !== null && floorY !== undefined) {
          this.playerController.group.position.y = floorY
        }
        // Clamp to the nearest room/corridor walkable rectangle. Keeping the
        // rectangles separate prevents the narrow entry spaces from inheriting
        // the arena's width.
        const bounds = bunkerMinigame?.bunkerWalkableBounds ?? []
        if (bounds.length > 0) {
          const p = this.playerController.group.position
          let bestX = p.x
          let bestZ = p.z
          let bestDistSq = Number.POSITIVE_INFINITY
          for (const rect of bounds) {
            const x = Math.max(rect.minX, Math.min(rect.maxX, p.x))
            const z = Math.max(rect.minZ, Math.min(rect.maxZ, p.z))
            const dx = x - p.x
            const dz = z - p.z
            const distSq = dx * dx + dz * dz
            if (distSq < bestDistSq) {
              bestDistSq = distSq
              bestX = x
              bestZ = z
            }
          }
          p.x = bestX
          p.z = bestZ
        }
      }

      // Hypoxia visual — fade + pulse when O2 is empty and HP is draining
      this.onDeathFade?.(
        computeHypoxiaFadeOpacity(
          this.playerController!.o2Level,
          this.playerController!.hp,
          this.playerController!.maxHp,
          performance.now() * 0.001,
        ),
      )
    }

    this.enforceLanderAltitudeCeiling()
    this.tickBunkerSwapFade(dt)
    this.tickMinigames(dt)

    // Damage flash decay — same shape as `FpsViewController.tick`. The Vue
    // overlay reads this every frame so we always emit (0 once cleared) to
    // keep its `v-if` in sync.
    const flash = stepDamageFlash(
      this.damageFlashTimer,
      dt,
      LEVEL_COMBAT_CONFIG.damageFlashDuration,
    )
    this.damageFlashTimer = flash.timer
    this.onDamageFlash?.(flash.opacity)

    // Dead: camera drops, screen fades, message appears
    if (this.stateMachine?.is('dead') && this.fpsCamera) {
      const DEATH_PITCH_SPEED = 1.2
      const DEATH_PITCH_TARGET = -1.4 // ~80 degrees down
      const FADE_DURATION = 2.0 // seconds to full black
      const MESSAGE_DELAY = 1.5 // seconds before showing YOU DIED
      const deathState = computeDeathPresentationState(
        this.fpsCamera.pitch,
        dt,
        this.stateMachine.stateTime,
        DEATH_PITCH_SPEED,
        DEATH_PITCH_TARGET,
        FADE_DURATION,
        MESSAGE_DELAY,
      )
      this.fpsCamera.pitch = deathState.pitch
      this.onDeathFade?.(deathState.fadeOpacity)
      if (deathState.showMessage) {
        this.onDeathMessage?.(true)
        if (this.pendingDeathOverlayCause) {
          this.manualDeathRestartOverlayActive = true
          this.showDeathOverlay(this.pendingDeathOverlayCause)
          this.pendingDeathOverlayCause = null
        }
      }
    }

    // ── Atmosphere context update ──────────────────────────────
    if (this.atmosphereCtx) {
      const lander = this.landerController
      const player = this.playerController
      const currentState = this.stateMachine?.state ?? ''

      // Only read lander input state when the player is actually flying the lander.
      // isMainEngineActive is a live getter on the shared inputManager, so it would
      // return true in EVA mode if the player presses the jump key (same binding).
      if (lander && currentState === 'lander') {
        applyLanderAtmosphereState(this.atmosphereCtx, lander)
        const engineFiring = lander.isMainEngineActive

        // Thrust vibration — strongest at liftoff, fades with altitude.
        // Camera shake stays here (it's a visual concern); the audio
        // shake loop is owned by the LanderAudioDirector and driven
        // via the per-frame update below using the same intensity.
        let vibrationFactor = 0
        if (engineFiring && this.vehicleCamera) {
          const alt = this.atmosphereCtx.landerAltitude
          const altFade = 1 - Math.min(1, alt / LEVEL_ATMOSPHERE_CONFIG.thrustVibrationFadeAltitude)
          const intensity =
            LEVEL_ATMOSPHERE_CONFIG.thrustVibrationMin +
            (LEVEL_ATMOSPHERE_CONFIG.thrustVibrationMax -
              LEVEL_ATMOSPHERE_CONFIG.thrustVibrationMin) *
              altFade *
              altFade
          this.vehicleCamera.shake(intensity, LEVEL_ATMOSPHERE_CONFIG.thrustVibrationDuration)
          vibrationFactor = intensity / LEVEL_ATMOSPHERE_CONFIG.thrustVibrationMax
        }
        this.landerAudio.update(dt, { engineFiring, vibrationFactor })
        const ts = lander.thrusterSystem
        this.landerAudio.tickLanderFuelTelemetry(ts.fuelLevel, ts.fuelCapacity)
      } else if (this.atmosphereCtx) {
        // Not in lander mode — clear thrust so wash/shake effects stay silent.
        this.atmosphereCtx.landerThrust = 0
        this.landerAudio.update(dt, { engineFiring: false, vibrationFactor: 0 })
        this.landerAudio.clearLanderFuelWarningLatch()
      }

      if (player) {
        this.atmosphereCtx.playerSpeed = player.speed
        this.atmosphereCtx.playerGrounded = player.grounded
        this.atmosphereCtx.playerPosition.copy(player.group.position)
      }

      this.atmosphereCtx.activeMode =
        currentState === 'eva' ? 'eva' : currentState === 'lander' ? 'lander' : 'cinematic'

      // Update ground normal
      const activePos = currentState === 'eva' ? player?.group.position : lander?.position
      if (activePos && this.heightmap) {
        const n = this.heightmap.normalAt(activePos.x, activePos.z)
        this.atmosphereCtx.groundNormal.set(n.x, n.y, n.z)
      }

      this.thrusterWash?.update(this.atmosphereCtx, dt)
      this.surfaceDust?.update(this.atmosphereCtx, dt)
    }

    // Broadcast state info for HUD
    if (this.stateMachine) {
      const currentState = this.stateMachine.state ?? ''

      const canExfil =
        currentState === 'lander' && this.isEligibleForExfil() && this.isLanderNearShuttle()

      const canEnterLander =
        currentState === 'eva' && this.isPlayerNearLander() && !this.isLanderEntryBlockedByDan()

      let landerTelemetry: LanderTelemetry | null = null
      if (this.landerController) {
        const ts = this.landerController.thrusterSystem
        const activeMinigame = this.minigames.getActive()
        const activeObjectiveType = activeMinigame
          ? this.missionObjectives[activeMinigame.objectiveIndex]?.type
          : undefined
        const activeProgressTotal = activeMinigame?.progressTotal ?? null
        const progressLabel =
          activeObjectiveType === 'photometry'
            ? activeProgressTotal === 1
              ? 'PROBE'
              : 'SCAN'
            : activeObjectiveType === 'dan'
              ? 'PARTICLES'
              : activeMinigame
                ? 'PROBES'
                : null
        landerTelemetry = {
          altitude: this.landerController.altitudeAboveGround,
          velocityY: this.landerController.body.velocityY,
          posX: this.landerController.position.x,
          posZ: this.landerController.position.z,
          fuelLevel: ts.fuelLevel,
          fuelCapacity: ts.fuelCapacity,
          mainEngineCharge: ts.getState('mainEngine').charge,
          mainEngineCapacity: ts.getState('mainEngine').capacity,
          rcsCharge: ts.getState('rcs').charge,
          rcsCapacity: ts.getState('rcs').capacity,
          hp: this.landerController.hp,
          maxHp: this.landerController.maxHp,
          tiltAngle: this.landerController.tiltAngle,
          grounded: this.landerController.body.grounded,
          descentWarning: this.landerController.descentWarningLevel,
          attitudeWarning: this.landerController.attitudeWarningLevel,
          landingSafety: this.landerController.landingSafetyLevel,
          surveyTimeRemaining: activeMinigame?.timeRemaining ?? null,
          surveyProbesCollected: activeMinigame?.progressCurrent ?? null,
          surveyProbesTotal: activeProgressTotal,
          minigameProgressLabel: progressLabel,
          missionInstruction: activeMinigame?.missionInstruction ?? null,
        }
      }

      let fpsTelemetry: Omit<FpsTelemetry, 'headingRad' | 'objectives' | 'rockTarget'> | null = null
      let fpsHeadingRad = 0
      if (this.playerController && this.fpsCamera) {
        const ts = this.playerController.thrusterSystem
        fpsHeadingRad = this.fpsCamera.camera.rotation.y
        fpsTelemetry = {
          hp: this.playerController.hp,
          maxHp: this.playerController.maxHp,
          o2Level: this.playerController.o2Level,
          o2Capacity: this.playerController.o2Capacity,
          sprintCharge: ts.getState('sprint').charge,
          sprintCapacity: ts.getState('sprint').capacity,
          speed: this.playerController.speed,
          grounded: this.playerController.grounded,
          activeMode: this.multiToolState?.mode ?? 'drill',
          aiming: this.multiToolState?.aiming ?? false,
          isFiring: this.multiToolState?.isFiring ?? false,
          rtgLevel: this.multiToolState?.rtgLevel ?? 0,
          rtgCapacity: this.multiToolState?.rtgCapacity ?? 1,
          modeCharge: this.multiToolState?.modeCharge ?? 0,
          modeCapacity: this.multiToolState?.modeChargeCapacity ?? 1,
        }
      }

      this.telemetry.tick(
        {
          onStateInfo: this.onStateInfo,
          onLanderTelemetry: this.onLanderTelemetry,
          onFpsTelemetry: this.onFpsTelemetry,
          onPlayerPosition: this.onPlayerPosition,
        },
        {
          dt,
          state: currentState,
          canExfil,
          canEnterLander,
          lander:
            this.landerController && landerTelemetry
              ? {
                  telemetry: landerTelemetry,
                  x: this.landerController.group.position.x,
                  z: this.landerController.group.position.z,
                }
              : null,
          fps:
            this.playerController && fpsTelemetry
              ? {
                  telemetry: fpsTelemetry,
                  headingRad: fpsHeadingRad,
                  x: this.playerController.group.position.x,
                  z: this.playerController.group.position.z,
                  missionObjectives: this.missionObjectives,
                  rockTarget: this.currentRockTarget,
                }
              : null,
        },
      )
    }
  }

  /** Per-frame EVA logic — tool input, camera bob, aiming. */
  private tickEva(dt: number): void {
    if (this.dropSystem && this.playerController) {
      const pos = this.playerController.group.position
      this.dropSystem.tick(dt, { x: pos.x, y: pos.y, z: pos.z })
    }

    // Tool keybinds
    if (this.inputManager && this.multiToolState) {
      if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
      if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
      if (this.inputManager.wasActionPressed('toolScience')) this.multiToolState.setMode('science')

      this.multiToolState.setAiming(this.pointerLock.isRightMouseDown)
      this.multiToolState.setInput(
        this.pointerLock.isLeftMouseDown,
        this.pointerLock.consumeLeftMouseJustPressed(),
      )
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
    }

    // Sync tool visuals
    if (this.multiToolState && this.multiTool) {
      this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
      this.multiTool.setAiming(this.multiToolState.aiming)
      this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
      this.multiTool.setModeChargeLevel(
        this.multiToolState.modeCharge / this.multiToolState.modeChargeCapacity,
      )
      this.playerController?.setAiming(this.multiToolState.aiming)
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
    }

    // ADS camera zoom
    if (this.multiToolState && this.fpsCamera) {
      const ads = this.multiToolState.adsConfig
      this.fpsCamera.setAiming(this.multiToolState.aiming, ads.fovMultiplier, ads.zoomSpeed)
    }

    // Camera bob from velocity
    if (this.playerController && this.fpsCamera) {
      const pos = this.playerController.group.position
      const slope = this.heightmap?.slopeAt(pos.x, pos.z) ?? 0
      this.fpsCamera.setVelocity(
        this.playerController.speed,
        this.playerController.body.velocityY,
        slope,
      )
      // Use the player controller's authoritative sprint state so multitool
      // visuals + the FPS audio director (footsteps + breathing cadence)
      // respect the sprint lockout — recomputing from raw input or
      // `canFire` would flicker on each frame of recovered stamina while
      // the player is still locked out.
      const sprintingNow = this.playerController.isSprinting
      this.multiTool?.setState(
        this.playerController.speed,
        sprintingNow,
        this.playerController.grounded,
      )

      const grounded = this.playerController.grounded
      const physicsGrounded = this.playerController.physicsGrounded

      // Fall damage — only on the airborne → grounded transition. The
      // body's `impactVelocityY` is set during this frame's player tick
      // (which runs before `LevelViewController.tick` thanks to the tick
      // priority ordering), so it's safe to read here.
      if (physicsGrounded && !this._prevGrounded) {
        this.applyEvaFallDamage()
      }

      this._prevGrounded = physicsGrounded

      // All player-movement audio (footsteps, breathing crossfade,
      // floating onset with delay+fade, contact-damage loop decay) is
      // owned by the director.
      this.fpsAudio.update(dt, {
        grounded,
        sprinting: sprintingNow,
        speed: this.playerController.speed,
        hovering: this.playerController.isHovering,
        o2Level: this.playerController.o2Level,
        o2Capacity: this.playerController.o2Capacity,
      })
    }

    this.updateRockTarget()
  }

  /**
   * Refresh the rock-targeting readout each frame. Only active while
   * the multi-tool is in drill mode — the readout otherwise clears
   * regardless of where the camera is pointing. Output feeds the FPS
   * HUD via {@link currentRockTarget}; no world-space geometry.
   *
   * Cheap path: a swept-sphere ray pick against the registered rock
   * collider list (already maintained by `ProjectileSystem` for drill
   * bolts), so we don't double-pay for spatial structures.
   */
  private updateRockTarget(): void {
    const projectiles = this.projectileSystem
    const rockYield = this.rockYieldSystem
    const camera = this.fpsCamera?.camera
    const tool = this.multiToolState
    if (!projectiles || !rockYield || !camera || !tool || tool.mode !== 'drill') {
      this.currentRockTarget = null
      return
    }
    this._rockPickOrigin.copy(camera.position)
    this._rockPickDir.set(0, 0, -1).applyQuaternion(camera.quaternion)
    const hit = projectiles.pickRock(
      this._rockPickOrigin,
      this._rockPickDir,
      LevelViewController.ROCK_TARGET_PICK_RANGE,
    )
    if (!hit) {
      this.currentRockTarget = null
      return
    }
    const roll = rockYield.peekRock(hit.spawnIndex)
    if (!roll) {
      this.currentRockTarget = null
      return
    }
    const def = getItemDefinition(roll.itemId)
    this.currentRockTarget = {
      label: def?.label ?? roll.itemId,
      remainingKg: roll.remainingKg,
      totalKg: roll.totalKg,
    }
  }

  private enforceLanderAltitudeCeiling(): void {
    if (!this.stateMachine?.is('lander')) return
    if (!this.landerController || !this.arrivalSequence || this.landerDestroyed) return

    const ceilingY =
      this.arrivalSequence.shuttleGroup.position.y +
      LEVEL_TERRAIN_CONFIG.landerAltitudeCeilingAboveShuttle

    if (this.landerController.position.y <= ceilingY) return

    this.landerController.position.y = ceilingY
    if (this.landerController.body.velocityY > 0) {
      this.landerController.body.velocityY = 0
    }
  }

  /** Per-frame minigame logic — delegates to each minigame instance. */
  private tickMinigames(dt: number): void {
    const state = this.stateMachine?.state ?? ''
    const lander = this.landerController
    const player = this.playerController
    const landerForward = lander
      ? LANDER_LOCAL_FORWARD.clone().applyQuaternion(lander.group.quaternion).normalize()
      : null
    const landerUp = lander
      ? LANDER_LOCAL_UP.clone().applyQuaternion(lander.group.quaternion).normalize()
      : null
    let playerForwardSnap: { x: number; y: number; z: number } | null = null
    if ((state === 'eva' || state === 'bunker-interior') && this.fpsCamera) {
      const v = this.fpsCamera.getForward(this._playerForwardScratch)
      playerForwardSnap = { x: v.x, y: v.y, z: v.z }
    }
    const terminalInteractPressed = this.inputManager?.wasActionPressed('terminalInteract') ?? false
    this.minigames.tick(
      dt,
      {
        levelState: state,
        landerPosition: lander
          ? { x: lander.position.x, y: lander.position.y, z: lander.position.z }
          : null,
        landerForward: landerForward
          ? { x: landerForward.x, y: landerForward.y, z: landerForward.z }
          : null,
        landerUp: landerUp ? { x: landerUp.x, y: landerUp.y, z: landerUp.z } : null,
        landerGrounded: lander?.body.grounded ?? false,
        playerPosition:
          (state === 'eva' || state === 'bunker-interior') && player
            ? { x: player.group.position.x, y: player.group.position.y, z: player.group.position.z }
            : null,
        playerForward: playerForwardSnap,
        interactPressed: this.inputManager?.wasActionPressed('interact') ?? false,
        terminalInteractPressed,
      },
      this.onTerminalPrompt,
    )
    // ── Prospectus terminal proximity — runs after the facade tick so our
    // prompt assignment wins over the facade's null-clear when no minigame is
    // near.
    if (this.prospectusTerminal && state === 'eva' && player) {
      const dx = player.group.position.x - this.prospectusTerminal.position.x
      const dz = player.group.position.z - this.prospectusTerminal.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist <= TERMINAL_INTERACT_RANGE) {
        this.prospectusInteractReady = true
        this.onTerminalPrompt?.('[E] OPEN PROSPECTUS')
        if (terminalInteractPressed && this.onProspectusOpen) {
          this.onProspectusOpen()
        }
      } else {
        this.prospectusInteractReady = false
      }
    } else {
      this.prospectusInteractReady = false
    }
    this.prospectusTerminal?.tick(dt)
    this.surfaceBunkerHatch?.tick(dt)
    const activeMinigame = this.minigames.getActive()
    if (activeMinigame instanceof RescueMinigame && this.landerController) {
      const locked = activeMinigame.isLiftoffLocked
      this.landerController.setLiftoffBlocked(locked)
      if (locked && this.landerController.isLiftoffAttemptedWhileBlocked) {
        activeMinigame.notifyLiftoffAttemptBlocked()
      }
    } else if (this.landerController) {
      this.landerController.setLiftoffBlocked(false)
    }
  }

  private registerLevelColliders(): void {
    if (!this.landerController || !this.arrivalSequence) return

    this.collision.registerStaticColliders([
      {
        id: LEVEL_COLLISION_CONFIG.landerColliderId,
        ...this.createLocalAabbCollider(
          this.landerController.group,
          LEVEL_COLLISION_CONFIG.landerColliderMin,
          LEVEL_COLLISION_CONFIG.landerColliderMax,
        ),
      },
      {
        id: LEVEL_COLLISION_CONFIG.shuttleColliderId,
        ...this.createLocalAabbCollider(
          this.arrivalSequence.shuttleGroup,
          LEVEL_COLLISION_CONFIG.shuttleColliderMin,
          LEVEL_COLLISION_CONFIG.shuttleColliderMax,
        ),
      },
    ])
  }

  /**
   * Drop the collider for a single mined-out rock. No-op if the rock
   * has already been removed (idempotent so the depletion callback
   * can fire safely even after dispose).
   */
  private removeRockCollider(spawnIndex: number): void {
    this.collision.removeSurfaceRockCollider(spawnIndex)
  }

  private createLocalAabbCollider(
    object: THREE.Object3D,
    localMin: THREE.Vector3,
    localMax: THREE.Vector3,
  ) {
    const min = new THREE.Vector3()
    const max = new THREE.Vector3()
    const corners = [
      new THREE.Vector3(localMin.x, localMin.y, localMin.z),
      new THREE.Vector3(localMin.x, localMin.y, localMax.z),
      new THREE.Vector3(localMin.x, localMax.y, localMin.z),
      new THREE.Vector3(localMin.x, localMax.y, localMax.z),
      new THREE.Vector3(localMax.x, localMin.y, localMin.z),
      new THREE.Vector3(localMax.x, localMin.y, localMax.z),
      new THREE.Vector3(localMax.x, localMax.y, localMin.z),
      new THREE.Vector3(localMax.x, localMax.y, localMax.z),
    ]
    const worldCorner = new THREE.Vector3()

    return {
      kind: 'aabb' as const,
      min: () => {
        min.set(Infinity, Infinity, Infinity)
        for (const corner of corners) {
          worldCorner.copy(corner).applyMatrix4(object.matrixWorld)
          min.min(worldCorner)
        }
        return min
      },
      max: () => {
        max.set(-Infinity, -Infinity, -Infinity)
        for (const corner of corners) {
          worldCorner.copy(corner).applyMatrix4(object.matrixWorld)
          max.max(worldCorner)
        }
        return max
      },
      enabled: () => object.visible,
    }
  }

  private findSafeEvaSpawnPosition(): THREE.Vector3 {
    const landerPos = this.landerController?.group.position
    if (!this.landerController) {
      return new THREE.Vector3(
        (landerPos?.x ?? 0) + LEVEL_TERRAIN_CONFIG.evaSpawnOffsetX,
        landerPos?.y ?? 0,
        landerPos?.z ?? 0,
      )
    }

    const lander = this.landerController.group
    const spawn = this.collision.buildEvaSpawnPosition(lander.position, {
      fallbackOffsetX: LEVEL_TERRAIN_CONFIG.evaSpawnOffsetX,
      topYOffset: LEVEL_TERRAIN_CONFIG.evaSpawnTopYOffset,
    })
    return new THREE.Vector3(spawn.x, spawn.y, spawn.z)
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle the player opening a loot chest in the bunker.
   * Randomly rewards trade goods based on tier, checks inventory via onResourcePickup.
   *
   * @param tier - Bunker wave tier.
   * @returns True if items were granted and the chest should visually open.
   */
  private handleLootChest(tier: string): boolean {
    if (!this.onResourcePickup) return false

    const keys = Object.keys(TRADE_GOODS)
    if (keys.length === 0) return false
    const randomKey = keys[Math.floor(Math.random() * keys.length)] as string
    const tradeGood = TRADE_GOODS[randomKey]
    if (!tradeGood) return false

    let quantity = 1
    if (tier === 'medium') quantity = 2
    if (tier === 'hard') quantity = 3

    const inventory = loadInventory()
    if (!inventory) return false

    const addResult = addItem(inventory, randomKey, quantity)
    if (!addResult.ok) {
      this.onResourcePickupFailed?.(tradeGood.label, addResult.reason ?? 'Inventory full')
      return false
    }

    saveInventory(addResult.inventory)
    this.onResourcePickup(randomKey, quantity, tradeGood.label)

    return true
  }

  /**
   * Apply the full hit-feedback bundle when the player takes damage:
   * health drain, knockback away from the source, red vignette flash,
   * camera flinch, and a directional indicator on the HUD.
   *
   * Mirrors {@link FpsViewController}'s contact + projectile damage handling
   * so the level scene reacts to hits the same way the standalone FPS demo
   * does. Safe to call when the player controller is missing — every step
   * is null-guarded.
   *
   * @param damage - HP to deduct from the player.
   * @param sourceX - World X of the damage source (enemy position or
   *   projectile origin).
   * @param sourceZ - World Z of the damage source.
   */
  private applyPlayerDamageFeedback(
    damage: number,
    sourceX: number,
    sourceZ: number,
    source?: 'projectile' | 'contact' | 'hazard',
  ): void {
    this.playerController?.takeDamage(damage)
    this.damageFlashTimer = LEVEL_COMBAT_CONFIG.damageFlashDuration

    // Damage audio (composite ranged thud / mauling loop) is owned by
    // the FPS audio director. See `FpsAudioDirector.notifyProjectileDamage`
    // and `notifyContactDamage` for the full per-cue rationale. Hazard
    // damage (nest aura, etc.) routes to `notifyHazardDamage` which plays
    // a vocal grunt on the manifest's restart policy.
    if (source === 'projectile') {
      this.fpsAudio.notifyProjectileDamage()
    } else if (source === 'contact') {
      this.fpsAudio.notifyContactDamage()
    } else if (source === 'hazard') {
      this.fpsAudio.notifyHazardDamage()
    }

    const playerPos = this.playerController?.group.position
    if (!playerPos) return

    const knockback = computeKnockbackAwayFromSource(
      playerPos.x,
      playerPos.z,
      sourceX,
      sourceZ,
      LEVEL_COMBAT_CONFIG.contactKnockback,
    )
    if (knockback) {
      this.playerController?.applyLateralImpulse(knockback.x, knockback.z)
    }

    // Camera flinch + screen-space damage direction (only meaningful while
    // the FPS camera is active; the lander-cam path just skips it). Bunker
    // combat uses the same FPS rig, so include `bunker-interior` here.
    if (
      this.fpsCamera &&
      (this.stateMachine?.is('eva') || this.stateMachine?.is('bunker-interior'))
    ) {
      this.fpsCamera.applyMouseDelta(
        (Math.random() - 0.5) * LEVEL_COMBAT_CONFIG.damageFlinchStrength,
        -Math.random() * LEVEL_COMBAT_CONFIG.damageFlinchStrength,
      )
      const relAngle = computeRelativeDamageAngle(
        playerPos.x,
        playerPos.z,
        sourceX,
        sourceZ,
        this.fpsCamera.yaw,
      )
      this.onDamageDirection?.(relAngle)
    }
  }

  /**
   * Apply lenient, never-lethal fall damage when the **on-foot** EVA
   * player slams into the ground at speed (jumping into a crater,
   * dropping off a ledge). This is purely the FPS character body
   * impacting terrain — *not* the lander vehicle's touchdown, which
   * is owned by {@link three.LanderController}.
   *
   * Reads {@link PlatformerBody.impactVelocityY} from the player body
   * (the vertical velocity at the moment of ground contact this frame)
   * and converts the portion above {@link FALL_DAMAGE_SAFE_SPEED} into
   * HP loss, scaled by {@link FALL_DAMAGE_PER_UNIT} and capped at
   * {@link FALL_DAMAGE_MAX}.
   *
   * The result is then **clamped against the player's current HP** so
   * the post-hit HP is never less than {@link FALL_DAMAGE_MIN_HP_AFTER}.
   * This is the no-kill guarantee — no matter how high the player
   * falls, they always survive the impact with a usable health bar.
   *
   * Plays a gentle camera flinch + composite impact audio + the
   * standard red vignette for clear feedback when actual damage was
   * dealt. Silent for soft landings (regular jumps, walking off a
   * curb).
   *
   * Called once per airborne → grounded transition from {@link tickEva}.
   * Safe to call when the player controller is missing or already dead.
   */
  private applyEvaFallDamage(): void {
    const player = this.playerController
    if (!player || player.isDead) return

    const impactSpeed = Math.abs(player.body.impactVelocityY)
    const damage = computeNonLethalFallDamage(impactSpeed, player.hp, {
      safeSpeed: LEVEL_FALL_DAMAGE_CONFIG.safeSpeed,
      damagePerUnit: LEVEL_FALL_DAMAGE_CONFIG.damagePerUnit,
      maxDamage: LEVEL_FALL_DAMAGE_CONFIG.maxDamage,
      minHpAfter: LEVEL_FALL_DAMAGE_CONFIG.minHpAfter,
    })
    if (damage <= 0) return

    player.takeDamage(damage)

    // Same red-vignette pulse the combat path uses (`damageFlashTimer` is
    // decayed each frame in `tick` and broadcast via `onDamageFlash`, which
    // `LevelView.vue` pipes into the shared `DamageVignette` overlay). The
    // result is the player gets the exact same "I just took damage" HUD cue
    // for a fall as they do for an enemy hit.
    this.damageFlashTimer = LEVEL_COMBAT_CONFIG.damageFlashDuration

    if (this.fpsCamera && this.stateMachine?.is('eva')) {
      // Pure downward flinch — pitch nose-down a touch to sell the
      // "knees buckle" feel; no horizontal jitter so it doesn't get
      // confused with combat damage.
      this.fpsCamera.applyMouseDelta(
        (Math.random() - 0.5) * (LEVEL_FALL_DAMAGE_CONFIG.flinchStrength * 0.3),
        LEVEL_FALL_DAMAGE_CONFIG.flinchStrength,
      )
    }

    // Composite fall-damage cue (thump + vocal grunt) is owned by
    // FpsAudioDirector — it volume-scales both layers from severity
    // and routes through the manifest's restart-policy on the grunt.
    this.fpsAudio.notifyFallDamage(damage / LEVEL_FALL_DAMAGE_CONFIG.maxDamage)
  }

  /**
   * Trigger the full presentation bundle for an objective explosion (nest
   * detonation, virus blast). Centralised so exterminate and rescue minigames
   * share the same fire+debris emitter, audio, spark burst, and proximity
   * camera kick — keeps the visceral feel consistent across mission types.
   *
   * @param pos - World position of the blast.
   * @param sparkBursts - How many vertical impactEmitter sparks to fire.
   *   Tuned per minigame so rescue (slightly bigger crater area) emits a few
   *   more chunks than the smaller nest blast.
   * @param sparkBaseSpeed - Minimum upward velocity for the spark burst (the
   *   max is base + 10 with random jitter).
   */
  /**
   * Wire the level's loot pipeline into a freshly created combat minigame.
   * Each enemy spawn registers an auxiliary death listener that calls
   * {@link LootSystem.trySpawnLoot} with the enemy type (data-driven bias,
   * policy-gated for psychosphere). Supports colored powerups in both
   * surface and bunker.
   *
   * @param minigame - Combat minigame whose enemy director should feed loot drops.
   */
  private installDropObserver(minigame: {
    installEnemySpawnObserver(listener: (handle: EnemyHandle) => void): () => void
  }): void {
    if (!this.dropSystem) return
    const lootSystem = this.dropSystem
    minigame.installEnemySpawnObserver((handle) => {
      handle.enemy.addDeathListener(() => {
        const pos = handle.enemy.position
        // difficulty defaults to 1; higher waves in bunker will bias toward
        // powerups per dropTables.json (Task 4 will tune per-wave difficulty)
        lootSystem.trySpawnLoot(handle.type, { x: pos.x, y: pos.y, z: pos.z })
      })
    })
  }

  /**
   * Bridge a loot pickup event (psychosphere only) into the player's inventory
   * and contract counter. Powerups use separate onPowerupCollected path.
   *
   * @param pickup - LootPickup from LootSystem (has itemId only for psychosphere).
   */
  private handlePickupCollected(pickup: LootPickup): void {
    if (!pickup.itemId) return
    const quantity = 1
    const result = this.persistence.persistInventoryPickup(pickup.itemId, quantity)
    if (!result.ok) {
      this.onResourcePickupFailed?.(result.label, result.reason ?? 'Inventory full')
      return
    }
    this.onResourcePickup?.(pickup.itemId, quantity, result.label)
    this.levelAudio.notifyResourcePickup()
    contractSystem.notifyDropCollected({ itemId: pickup.itemId, quantity })
  }

  /**
   * Apply immediate powerup effect and trigger colored HUD toast.
   * Uses existing ThrusterSystem.refuel() via fullRefill(), player.heal(),
   * and addFuel patterns. Minimal implementation per Task 4. Toasts use
   * itemId/label matching for distinct colored styling in PickupToast.
   *
   * @param type - Determines effect and visual (red=health, blue=oxygen,
   *               yellow=RTG).
   */
  private applyLootEffect(type: LootType): void {
    if (type === 'psychosphere') return

    const POWERUP_HEALTH_PCT = 0.1
    const POWERUP_OXYGEN_PCT = 0.25

    switch (type) {
      case 'health':
        if (this.playerController) {
          const amount = this.playerController.maxHp * POWERUP_HEALTH_PCT
          this.playerController.heal(amount)
        }
        this.onResourcePickup?.('health', 1, 'Health')
        this.levelAudio.notifyResourcePickup()
        break

      case 'oxygen':
        if (this.playerController) {
          const amount = this.playerController.o2Capacity * POWERUP_OXYGEN_PCT
          this.playerController.thrusterSystem.addFuel(amount)
        }
        this.onResourcePickup?.('oxygen', 1, 'Oxygen')
        this.levelAudio.notifyResourcePickup()
        break

      case 'rtg':
        this.multiToolState?.fullRefill()
        this.onResourcePickup?.('rtg', 1, 'RTG')
        this.levelAudio.notifyResourcePickup()
        break
    }
  }

  private triggerObjectiveExplosion(
    pos: Vector3,
    sparkBursts: number,
    sparkBaseSpeed: number,
  ): void {
    // Fire + debris from the lander explosion emitter — same particle budget
    // as a hard crash, scaled by impact speed.
    this.landerExplosion?.explode(pos, LEVEL_COMBAT_CONFIG.objectiveExplosionImpact)

    // Vertical spark fountain from the shared impact emitter.
    for (let i = 0; i < sparkBursts; i++) {
      this._impactVel.copy(this._impactUp).multiplyScalar(sparkBaseSpeed + Math.random() * 10)
      this.impactEmitter?.emit(pos, this._impactVel)
    }

    // Distance-attenuated audio + camera kick. We compute the distance once
    // and reuse it so both react proportionally — close blasts shake hard
    // and play loud, far blasts read as a distant rumble with a tiny nudge.
    const playerPos = this.playerController?.group.position
    let attenuation = 1
    if (playerPos) {
      const dx = playerPos.x - pos.x
      const dy = playerPos.y - pos.y
      const dz = playerPos.z - pos.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      attenuation = Math.max(0, 1 - dist / LEVEL_COMBAT_CONFIG.explosionFeedbackRange)
    }

    this.levelAudio.notifyObjectiveExplosion(attenuation)

    if (attenuation > 0 && this.fpsCamera && this.stateMachine?.is('eva')) {
      const kick = LEVEL_COMBAT_CONFIG.explosionFlinchStrength * attenuation
      this.fpsCamera.applyMouseDelta((Math.random() - 0.5) * kick, -Math.random() * kick)
    }
  }

  /** Check if the FPS player is within interact range of the lander. */
  private isPlayerNearLander(): boolean {
    if (!this.playerController || !this.landerController) return false
    const playerPos = this.playerController.group.position
    const landerPos = this.landerController.group.position
    const dx = playerPos.x - landerPos.x
    const dz = playerPos.z - landerPos.z
    return Math.sqrt(dx * dx + dz * dz) <= LANDER_INTERACT_RANGE
  }

  /**
   * True while a DAN scan or telemetry walk-back is underway. Used to lock
   * the player out of re-entering the lander during the encounter — the
   * lander is the defended asset for this minigame and stepping inside it
   * would skip the EVA combat phase entirely. Failure paths (death, hull
   * destruction) still resolve through the existing fail UX rather than the
   * normal interact-key flow.
   */
  private isLanderEntryBlockedByDan(): boolean {
    const active = this.minigames.getActive()
    if (!(active instanceof DanMinigame)) return false
    return active.phase === 'scanning' || active.phase === 'awaiting-delivery'
  }

  /**
   * Whether exfiltration is unlocked: at least one EVA (`hasExitedVehicle`) or
   * every objective session completed (lander-only contracts may never set the former).
   *
   * Soft `restartLevel()` after out-of-fuel or hull loss used to clear only
   * `hasExitedVehicle` while objectives stayed complete; `areAllComplete()` covers that
   * plus `restartLevel` no longer clears the EVA flag when the mission is still won.
   *
   * @returns True when the state machine may accept `exfiltrate`.
   */
  private isEligibleForExfil(): boolean {
    return this.hasExitedVehicle || this.minigames.areAllComplete()
  }

  /** Check if the lander is within exfil range of the parked shuttle. */
  private isLanderNearShuttle(): boolean {
    if (!this.landerController || !this.arrivalSequence) return false
    const landerY = this.landerController.position.y
    const shuttleY = this.arrivalSequence.shuttleGroup.position.y
    return Math.abs(landerY - shuttleY) <= EXFIL_PROXIMITY_RANGE
  }

  private isLanderAdrift(): boolean {
    if (!this.landerController || this.landerDestroyed) return false
    if (!this.heightmap) return false

    const landerPos = this.landerController.group.position
    const altitudeAboveGround = this.landerController.altitudeAboveGround
    // ∞ ALT off-body remains playable inside photometry authored radius (~D + D/2 from center).
    if (!Number.isFinite(altitudeAboveGround)) {
      const maxReachFromOrigin = computePhotometryAdriftRadialLimit(this.heightmap)
      const radialFromOrigin = Math.hypot(landerPos.x, landerPos.z)
      return radialFromOrigin > maxReachFromOrigin
    }
    const halfSize = this.heightmap.worldSize / 2
    const outsideX = Math.abs(landerPos.x) > halfSize + LEVEL_BOUNDS_CONFIG.adriftBoundsMargin
    const outsideZ = Math.abs(landerPos.z) > halfSize + LEVEL_BOUNDS_CONFIG.adriftBoundsMargin
    if (!outsideX && !outsideZ) return false

    const clampedX = Math.max(-halfSize, Math.min(halfSize, landerPos.x))
    const clampedZ = Math.max(-halfSize, Math.min(halfSize, landerPos.z))
    const edgeTerrainY = this.heightmap.heightAt(clampedX, clampedZ)

    return landerPos.y < edgeTerrainY - LEVEL_BOUNDS_CONFIG.adriftDepthMargin
  }

  private isPlayerAdrift(): boolean {
    if (!this.playerController || !this.heightmap) return false
    const pos = this.playerController.group.position
    // Off-surface cell → the player walked over the edge.
    if (!this.heightmap.isValidAt(pos.x, pos.z)) return true
    // Below-surface → we somehow clipped through; treat as adrift too.
    const groundY = this.heightmap.heightAt(pos.x, pos.z)
    return pos.y < groundY - LEVEL_BOUNDS_CONFIG.adriftDepthMargin
  }

  // ═══════════════════════════════════════════════════════════════
  // Pointer lock (EVA only)
  // ═══════════════════════════════════════════════════════════════

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement
    this.pointerLock.attach(canvas, {
      onMouseDelta: (movementX, movementY) => {
        this.fpsCamera?.applyMouseDelta(movementX, movementY)
      },
    })
  }

  private teardownPointerLock(): void {
    this.pointerLock.detach()
  }

  // ═══════════════════════════════════════════════════════════════
  // Persisted lander hull
  // ═══════════════════════════════════════════════════════════════

  /** Write lander HP into the player profile in localStorage. */
  private flushLanderHullToProfile(): void {
    if (!this.landerController) return
    this.persistence.flushLanderHullHp(this.landerController.hp)
  }

  /**
   * Throttle lander hull writes. Debouncing would skip saves while HP changes every frame.
   */
  private scheduleLanderHullPersist(): void {
    if (this.landerHullPersistTimer !== null) return
    this.landerHullPersistTimer = setTimeout(() => {
      this.landerHullPersistTimer = null
      this.flushLanderHullToProfile()
    }, 200)
  }

  private clearLanderHullPersistTimer(): void {
    if (this.landerHullPersistTimer !== null) {
      clearTimeout(this.landerHullPersistTimer)
      this.landerHullPersistTimer = null
    }
  }

  /**
   * One-shot sizzle for LAS on terrain/rock and drill on terrain only. Uses `sfx.sizzle.impact`
   * (not the looping `sfx.sizzle`) and {@link worldPointToHearing} for pan + distance.
   *
   * @param context - Impact classification from `ProjectileSystem`.
   * @param impactWorld - **Transient** hit point in world space (copy before any async if needed).
   */
  private maybePlayShortSurfaceSizzle(
    context: ProjectileImpactContext,
    impactWorld: Vector3,
  ): void {
    if (context.boltKind === 'science') return
    if (context.kind === 'enemy' || context.kind === 'hostage') return
    if (context.boltKind === 'drill' && context.kind === 'drill_rock') return
    const isLasSurface = context.boltKind === 'weapon' && context.kind === 'terrain'
    const isLasRock = context.boltKind === 'weapon' && context.kind === 'drill_rock'
    const isDrillGround = context.boltKind === 'drill' && context.kind === 'terrain'
    if (!isLasSurface && !isLasRock && !isDrillGround) return
    this.playShortSurfaceSizzle(impactWorld)
  }

  /**
   * Plays a brief `sfx.sizzle.impact` at `impactWorld` with stereo + distance.
   *
   * @param impactWorld - World-space contact point.
   */
  private playShortSurfaceSizzle(impactWorld: Vector3): void {
    this.levelAudio.playShortSurfaceSizzle(this.fpsCamera?.camera ?? null, impactWorld)
  }

  /** Stop and forget the looping mining-contact sizzle. */
  private stopMiningSizzle(): void {
    this.levelAudio.stopMiningSizzle()
  }

  /** Release the mining-contact loop once the recent-hit grace window expires. */
  private updateMiningSizzle(): void {
    this.levelAudio.updateMiningSizzle(this.elapsed)
  }

  // ═══════════════════════════════════════════════════════════════
  // Dispose
  // ═══════════════════════════════════════════════════════════════

  /** Tear down all systems and stop the game loop. */
  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.flushLanderHullOnPageHide)
    }
    this.clearLanderHullPersistTimer()
    this.flushLanderHullToProfile()
    DevConsole.unregister('LevelView')
    if (this.sceneManager) clearWaypointMarkers(this.sceneManager.scene)
    this.minigames.dispose()
    this.gameLoop?.stop()
    this.landerAudio.dispose()
    this.fpsAudio.dispose()
    this.levelAudio.dispose()
    this.photometryScanAudio.dispose()
    this.stopMiningSizzle()
    this.pointerLock.releaseLock()
    this.teardownPointerLock()
    this.collision.dispose()
    this.combatMining?.detach()
    this.combatMining = null
    this.rocketSurvey?.detach()
    this.rocketSurvey = null
    this.prospectOverlay?.dispose()
    this.prospectOverlay = null
    if (this.debugMetricsTracker && this.tickHandler) {
      this.tickHandler.unregister(this.debugMetricsTracker)
    }
    this.debugMetricsTracker?.dispose()
    this.debugMetricsTracker = null
    this.projectileSystem?.dispose()
    if (this.rockYieldSystem) {
      this.rockYieldSystem.onMineralExtracted = null
      this.rockYieldSystem.onConsume = null
      this.rockYieldSystem = null
    }
    this.impactEmitter?.dispose()
    this.tractorEmitter?.dispose()
    this.tractorEmitter = null
    if (this.tickHandler && this.lootPickupController) {
      this.tickHandler.unregister(this.lootPickupController)
    }
    this.lootPickupController?.dispose()
    this.lootPickupController = null
    this.dropSystem?.clear()
    this.dropSystem = null
    this.currentRockTarget = null
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.arrivalSequence?.dispose()
    this.landerExplosion?.dispose()
    this.landerController?.dispose()
    this.enemyVisualWarmup?.dispose()
    this.enemyVisualWarmup = null
    if (this.surfaceBunkerHatch) {
      this.surfaceBunkerHatch.group.removeFromParent()
      this.surfaceBunkerHatch.dispose()
      this.surfaceBunkerHatch = null
    }
    if (this.prospectusTerminal) {
      this.prospectusTerminal.group.removeFromParent()
      this.prospectusTerminal.dispose()
      this.prospectusTerminal = null
    }
    this.surfaceRocks?.dispose()
    this.asteroidSurface?.dispose()
    this.thrusterWash?.dispose()
    this.surfaceDust?.dispose()
    this.lightingRig?.dispose()
    this.postProcessing?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
