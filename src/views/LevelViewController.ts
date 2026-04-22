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
import { TerrainMesh } from '@/three/TerrainMesh'
import { generateTerrain, FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { FlatZone } from '@/lib/terrain/terrainGenerator'
import { getAsteroidById, ASTEROID_CATALOG } from '@/lib/asteroids/catalog'
import type { AsteroidDefinition } from '@/lib/asteroids/types'
import { loadActiveMission } from '@/lib/missions/missionStorage'
import { persistCompletedAsteroidMissionRewards } from '@/lib/missions/asteroidMissionRewards'
import { hasLevelRouteQueryOverrideFromSearchParams } from '@/lib/level/levelRouteAccess'
import { LEVEL_GRID_SIZE, generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'
import { getCurrentUpgradeValue, hydratePlayerUpgradeLevelsFromStorage } from '@/lib/upgrades'
import type { GeneratedAsteroidMission, ConcreteObjective } from '@/lib/missions/types'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import { CollisionWorld } from '@/lib/physics/worldCollision'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry, CompassObjective } from '@/components/FpsHud.vue'
import { headingRadToCompassDeg, worldBearingDegTo, signedRelativeBearingDeg } from '@/lib/math/bearing'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { RockTargetIndicator } from '@/three/RockTargetIndicator'
import { createLevelStateMachine, LANDER_INTERACT_RANGE, EXFIL_PROXIMITY_RANGE } from '@/lib/level/levelStateMachine'
import type { LevelState } from '@/lib/level/levelStateMachine'
import type { StateMachine } from '@/lib/stateMachine'
import { ArrivalSequence } from '@/three/ArrivalSequence'
import { LanderExplosion } from '@/three/LanderExplosion'
import { StarFieldController } from '@/three/StarFieldController'
import * as THREE from 'three'
import {
  Color,
  Vector3,
} from 'three'
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
} from '@/three/WaypointMarkers'
import { generateMapCanvas } from '@/lib/terrain/mapColors'
import { OBJECTIVE_LABELS } from '@/lib/minigame/MiniGame'
import type { MiniGame, MiniGameContext, MiniGameStep } from '@/lib/minigame/MiniGame'
import { SurveyMinigame } from '@/lib/minigame/SurveyMinigame'
import { ExterminateMinigame } from '@/lib/minigame/ExterminateMinigame'
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
import { CollectMinigame } from '@/lib/minigame/CollectMinigame'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { buildMultiToolConfig } from '@/lib/fps/buildMultiToolConfig'
import { getSpecialMissionById } from '@/lib/missions/specialMissions'
import { SurfaceRockController } from '@/three/controllers/SurfaceRockController'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import { addItem } from '@/lib/inventory/inventory'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { loadProfile, saveProfile } from '@/lib/player/profile'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { GatherMinigame } from '@/lib/minigame/GatherMinigame'

// ── Scene constants ─────────────────────────────────────────────
const TERRAIN_RESOLUTION = 512

const LANDER_SPAWN_HEIGHT = 700

/** Maximum random offset from center for lander spawn position (XZ). */
const SPAWN_POSITION_RANGE = 2000
const LANDER_SPAWN_LIGHT_ALIGNMENT_X = 5
const LANDER_GAMEPLAY_START_OFFSET_X = 0
const LANDER_GAMEPLAY_START_OFFSET_Y = 0
const EVA_SPAWN_OFFSET_X = 8

/**
 * Lateral velocity (units/s) added to the player when an enemy makes contact
 * or a projectile hits. Tuned to be larger than {@link FpsPlayerConfig}.movement.maxSpeed
 * (currently 20 units/s) so the impulse is unmistakably a shove instead of a
 * gentle nudge that the next walking-input frame snaps away. Pairs with the
 * grounded knockback-override window in {@link FpsPlayerController.applyLateralImpulse}
 * which prevents that next frame from clobbering the impulse.
 */
const CONTACT_KNOCKBACK = 26

/**
 * Duration (seconds) of the red damage vignette after the player takes a hit.
 * Mirrors `DAMAGE_FLASH_DURATION` in {@link FpsViewController} so the level
 * scene gets the same hit feedback as the standalone FPS demo.
 */
const DAMAGE_FLASH_DURATION = 0.3

/**
 * Strength of the random pitch/yaw camera flinch applied on every hit. Tuned
 * to be noticeable without being disorienting; reused for both contact damage
 * and projectile damage so projectile and melee hits feel the same.
 */
const DAMAGE_FLINCH_STRENGTH = 80

/**
 * Camera flinch magnitude (mouse-delta units) at the centre of an objective
 * blast. Falls off linearly with distance so a far blast is barely felt.
 * Tuned to be heavier than {@link DAMAGE_FLINCH_STRENGTH} since the blast
 * outranges most weapons.
 */
const EXPLOSION_FLINCH_STRENGTH = 240
/**
 * Maximum world-space distance at which the player still feels camera shake
 * and full-volume audio for an objective explosion. Beyond this both fade out.
 */
const EXPLOSION_FEEDBACK_RANGE = 90
/**
 * Impact speed passed to {@link LanderExplosion.explode} for objective
 * detonations. The lander emitter caps at this; reusing it means nest /
 * virus blasts share the same fire+debris particle budget as a hard crash.
 */
const OBJECTIVE_EXPLOSION_IMPACT = 22

// ── Fall damage ─────────────────────────────────────────────────
// Player fall damage is intentionally generous and *never lethal*:
// small drops are silent, big drops sting, and a free-fall from
// orbit will not kill you outright — the floor leaves the player
// alive with at least {@link FALL_DAMAGE_MIN_HP_AFTER} hp so they
// can keep playing instead of dying to gravity. Tuned against
// `player-config.json` (gravity = 4 units/s², jumpForce = 12) so
// that:
//   • a normal jump impact (~12 units/s) → 0 damage
//   • a hop off a small ledge (~22 units/s) → 0 damage
//   • a fall from a real cliff (~30 units/s) → ~1 damage
//   • terminal-velocity slam (~100 units/s) → clamped to FALL_DAMAGE_MAX
/** Impact speed (units/s, magnitude) below which no fall damage is dealt. */
const FALL_DAMAGE_SAFE_SPEED = 28
/** HP lost per unit/s of impact speed above {@link FALL_DAMAGE_SAFE_SPEED}. */
const FALL_DAMAGE_PER_UNIT = 0.55
/**
 * Hard ceiling on a single fall damage event. Even a terminal-velocity
 * crash cannot exceed this. Kept well below max HP so the player can
 * absorb several bad landings in a row.
 */
const FALL_DAMAGE_MAX = 22
/**
 * Floor for the player's HP after a fall damage hit. Fall damage is
 * clamped so that `hp >= FALL_DAMAGE_MIN_HP_AFTER` immediately after
 * impact — gravity itself can never deal the killing blow. Set high
 * enough that the player still has a clear "I'm alive" beat after a
 * catastrophic fall.
 */
const FALL_DAMAGE_MIN_HP_AFTER = 5
/**
 * Camera flinch magnitude applied alongside fall damage. Lighter than
 * {@link DAMAGE_FLINCH_STRENGTH} (combat hit) so the feedback reads as
 * "thudding into the ground" rather than "took a punch from the side".
 */
const FALL_DAMAGE_FLINCH_STRENGTH = 35

/** Thrust vibration at ground level (liftoff rumble). */
const THRUST_VIBRATION_MAX = 1.2
/** Thrust vibration at high altitude (cruise hum). */
const THRUST_VIBRATION_MIN = 0.15
/** Altitude at which vibration fully fades to minimum. */
const THRUST_VIBRATION_FADE_ALT = 80
/** Refresh duration — re-applied every frame so it stays active while firing. */
const THRUST_VIBRATION_DURATION = 0.1
const LANDER_ALTITUDE_CEILING_ABOVE_SHUTTLE = 100
const EVA_SPAWN_TOP_Y_OFFSET = 12
const ADRIFT_BOUNDS_MARGIN = 24
const ADRIFT_DEPTH_MARGIN = 18
const LANDER_COLLIDER_ID = 'lander'
const SHUTTLE_COLLIDER_ID = 'shuttle'
const LANDER_COLLIDER_MIN = new Vector3(-9, -2, -9)
const LANDER_COLLIDER_MAX = new Vector3(9, 18, 9)
const SHUTTLE_COLLIDER_MIN = new Vector3(-2.4, -0.9, -1.35)
const SHUTTLE_COLLIDER_MAX = new Vector3(2.4, 0.9, 1.35)


/** Simple string hash to derive a numeric seed from a mission id. */
function hashSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Applies the gameplay spawn offset so the lander clears the portal geometry. */
function offsetGameplayLanderSpawn(position: Vector3): Vector3 {
  return position.clone().add(new Vector3(
    LANDER_GAMEPLAY_START_OFFSET_X,
    LANDER_GAMEPLAY_START_OFFSET_Y,
    0,
  ))
}

/** Resolved level context — asteroid definition + terrain seed + mission. */
interface LevelContext {
  asteroid: AsteroidDefinition
  seed: number
  mission: GeneratedAsteroidMission
  /**
   * True when the mission was loaded from persisted shuttle storage (not URL dev overrides).
   * Completion should grant CR and clear active mission; false for `asteroidId` / query bypass runs.
   */
  persistCompletionRewards: boolean
}

/** Maximum attempts to generate a mission matching the requested type. */
const MISSION_TYPE_RETRY_LIMIT = 20

/**
 * Resolve the asteroid and terrain seed for the current level.
 *
 * Priority: `asteroidId` (ad-hoc) → query override (`difficulty` + `mission` type) → stored active
 * mission only (no silent procedural fallback when storage is missing).
 */
function resolveLevelContext(): LevelContext {
  const params = new URLSearchParams(window.location.search)
  const paramId = params.get('asteroidId')
  const missionType = params.get('mission')
  const difficulty = Math.max(1, Math.min(10, Number(params.get('difficulty')) || 5))
  const queryOverride = hasLevelRouteQueryOverrideFromSearchParams(params)

  let mission: GeneratedAsteroidMission
  let persistCompletionRewards = false
  const specialMission = missionType ? getSpecialMissionById(missionType) : undefined

  if (specialMission) {
    mission = specialMission
    persistCompletionRewards = true
  } else if (paramId) {
    mission = generateMissionWithType(difficulty, missionType)
    mission.asteroidId = paramId
  } else if (queryOverride) {
    mission = generateMissionWithType(difficulty, missionType)
  } else {
    const stored = loadActiveMission()
    if (!stored) {
      throw new Error(
        '[Level] No active mission in storage. Use /map to launch one, or open /level with '
          + '?mission=<special-id>, ?asteroidId=…, or both ?difficulty=1-10&mission='
          + 'gather|exterminate|rescue|survey|collect',
      )
    }
    mission = stored
    persistCompletionRewards = true
  }

  const asteroid = getAsteroidById(mission.asteroidId) ?? ASTEROID_CATALOG[0]!
  const seed = hashSeed(mission.id)

  return { asteroid, seed, mission, persistCompletionRewards }
}

/**
 * Generate a mission, optionally forcing a specific objective type.
 * Retries until a mission with the requested type is found.
 *
 * @param difficulty - Mission difficulty (1-10).
 * @param type - Optional objective type to require (e.g. 'survey').
 * @returns Generated mission.
 */
function generateMissionWithType(
  difficulty: number,
  type: string | null,
): GeneratedAsteroidMission {
  if (!type) return generateAsteroidMission(difficulty)

  for (let i = 0; i < MISSION_TYPE_RETRY_LIMIT; i++) {
    const mission = generateAsteroidMission(difficulty)
    if (mission.objectives.some((o) => o.type === type)) return mission
  }
  // Fallback — return whatever was generated
  return generateAsteroidMission(difficulty)
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
  private terrainMesh: TerrainMesh | null = null
  private surfaceRocks: SurfaceRockController | null = null
  private collisionWorld: CollisionWorld | null = null
  private readonly collisionCleanup: Array<() => void> = []
  /**
   * Per-spawn collider cleanups keyed by `spawnIndex`. Stored as a map
   * (rather than a flat array) so the gather loop can drop just the
   * mined-out rock's collider without rebuilding the whole registry.
   */
  private readonly surfaceRockCollisionCleanup = new Map<number, () => void>()
  private rockYieldSystem: RockYieldSystem | null = null
  private stateMachine: StateMachine<LevelState> | null = null

  // ── Lander ───────────────────────────────────────────────────
  private landerController: LanderController | null = null
  private vehicleCamera: VehicleCamera | null = null

  // ── EVA ──────────────────────────────────────────────────────
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
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
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null
  private rockTargetIndicator: RockTargetIndicator | null = null
  /** Reused scratch — camera world position used by rock target picking. */
  private readonly _rockPickOrigin = new Vector3()
  /** Reused scratch — camera forward used by rock target picking. */
  private readonly _rockPickDir = new Vector3()
  /** Reused scratch — rock world center fed into the indicator sprite. */
  private readonly _rockTargetCenter = new Vector3()
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
  /**
   * Particle lifetime for the tractor stream (seconds). Must match
   * the value passed to `new ParticleEmitter({ lifetime })` below;
   * the velocity is computed as `distance / lifetime` so the
   * particle reaches the gun muzzle right as it dies.
   */
  private static readonly TRACTOR_LIFETIME_SEC = 0.32
  /** Particles emitted per drill bolt impact. Keep small — pool is shared. */
  private static readonly TRACTOR_PARTICLES_PER_HIT = 4
  /** Reused scratch — gun muzzle world position for tractor velocity calc. */
  private readonly _tractorMuzzle = new Vector3()
  /** Reused scratch — rock center used as tractor spawn origin. */
  private readonly _tractorOrigin = new Vector3()
  /** Reused scratch — direction from rock to muzzle, scaled by speed. */
  private readonly _tractorVel = new Vector3()

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
  private asteroidName = ''
  private missionAnnounced = false

  /** Active minigames — one per objective that has a minigame. */
  private minigames: MiniGame[] = []

  /** Called each frame during EVA with terminal prompt text (null to hide). */
  onTerminalPrompt: ((text: string | null) => void) | null = null

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

  private readonly initialLanderSpawn = new Vector3()

  /** Reused (0,1,0) seed for impact/explosion particle bursts. Treat as immutable. */
  private readonly _impactUp = new Vector3(0, 1, 0)
  /** Reused velocity scratch passed to `ParticleEmitter.emit` (which copies internally). */
  private readonly _impactVel = new Vector3()

  // ── Elapsed time (seconds) ──────────────────────────────────
  private elapsed = 0

  /**
   * Throttle for HUD telemetry callbacks. The lander/EVA telemetry build
   * allocates a fresh literal (and `objectives.map(...)` for EVA) every
   * call, and Vue then reactivity-broadcasts it through every text node
   * and `:style` binding in `FpsHud.vue`. Emitting that at 60 Hz produced
   * visible camera-rotation hitching with enemies on screen.
   *
   * 15 Hz is imperceptible for HUD readouts and standard for telemetry
   * overlays. Reset on EVA/lander enter so the first tick still emits.
   *
   * @spec docs/superpowers/specs/2026-04-18-fps-perf-fixes-design.md
   */
  private static readonly TELEMETRY_INTERVAL_S = 1 / 15
  private telemetryAccumulator = LevelViewController.TELEMETRY_INTERVAL_S

  // ── Mouse state (EVA) ────────────────────────────────────────
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  // ── Pointer lock listeners (stored for cleanup) ───────────────
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnMouseDown: ((e: MouseEvent) => void) | null = null
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null
  private boundOnLockChange: (() => void) | null = null

  /** Called when letterbox visibility should change. */
  onLetterbox: ((visible: boolean) => void) | null = null

  /** Called each frame with current state + grounded + canExfil for HUD prompts. */
  onStateInfo: ((info: { state: string; grounded: boolean; canExfil: boolean; canEnterLander: boolean }) => void) | null = null

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
  async init(container: HTMLElement): Promise<void> {
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
    const { asteroid, seed, mission, persistCompletionRewards } = resolveLevelContext()
    this.persistShuttleMissionRewards = persistCompletionRewards
    this.mission = mission
    this.missionObjectives = mission.objectives
    this.asteroidName = asteroid.name

    const spawnX = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE + LANDER_SPAWN_LIGHT_ALIGNMENT_X
    const spawnZ = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE

    // ── Terrain ─────────────────────────────────────────────────
    const flat = new URLSearchParams(window.location.search).has('flat')
    const flatZones: FlatZone[] = mission.objectives.map((obj) => ({
      x: obj.x,
      z: obj.z,
      radius: FLAT_ZONE_RADIUS,
    }))
    this.heightmap = flat
      ? new Heightmap(TERRAIN_RESOLUTION, LEVEL_GRID_SIZE)
      : generateTerrain(asteroid.surface, {
          seed,
          resolution: TERRAIN_RESOLUTION,
          worldSize: LEVEL_GRID_SIZE,
          flatZones,
          biome: asteroid.biome,
        })
    this.terrainMesh = new TerrainMesh(this.heightmap)
    this.collisionWorld = new CollisionWorld(this.heightmap)
    this.sceneManager.addToScene(this.terrainMesh.mesh)
    this.terrainMesh.mesh.receiveShadow = true

    this.surfaceRocks = await SurfaceRockController.create({
      heightmap: this.heightmap,
      surface: asteroid.surface,
      seed,
      exclusions: [
        ...flatZones,
        { x: spawnX, z: spawnZ, radius: FLAT_ZONE_RADIUS * 0.65 },
      ],
      baseColor: asteroid.visual.baseColor,
    })
    this.sceneManager.addToScene(this.surfaceRocks.group)
    const rockColliders = this.surfaceRocks.buildColliders(this.heightmap)
    for (let i = 0; i < rockColliders.length; i++) {
      const collider = rockColliders[i]!
      this.surfaceRockCollisionCleanup.set(i, this.collisionWorld.addCollider(collider))
    }

    // ── Objective waypoint markers ──────────────────────────────
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      const groundY = this.heightmap.heightAt(obj.x, obj.z)
      addWaypointMarker(`obj-${i}`, obj.x, obj.z, groundY, this.sceneManager!.scene)
    }

    // ── Minimap canvas ─────────────────────────────────────────
    const mapCanvas = generateMapCanvas(this.heightmap!.grid, TERRAIN_RESOLUTION)
    this.onMapCanvas?.(mapCanvas)

    // ── Starfield ────────────────────────────────────────────────
    const starField = new StarFieldController({ count: 2000, size: 1.5 })
    this.sceneManager.addToScene(starField.points)

    // ── Atmosphere context (per-asteroid config) ───────────────
    this.atmosphereCtx = createAtmosphereContext(asteroid.lighting, {
      dustCoverage: asteroid.surface.dustCoverage,
      albedo: asteroid.visual.albedo,
      biome: asteroid.biome,
      baseColor: asteroid.visual.baseColor,
    })

    // ── Lighting rig (replaces hardcoded lights) ───────────────
    this.lightingRig = new LevelLightingRig(this.atmosphereCtx)
    this.lightingRig.addToScene(this.sceneManager.scene)

    // ── Lander (created once, stays in scene) ───────────────────
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(this.heightmap)
    this.landerController.setCollisionWorld(this.collisionWorld)
    await this.landerController.load()
    this.landerController.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
      }
    })
    const gameplayStart = offsetGameplayLanderSpawn(new Vector3(spawnX, LANDER_SPAWN_HEIGHT, spawnZ))
    this.initialLanderSpawn.copy(gameplayStart)
    this.landerController.group.position.copy(gameplayStart)

    this.landerController.onCrash = (damage, impactSpeed) => {
      this.landerExplosion!.explode(this.landerController!.group.position.clone(), impactSpeed)
      // Proportional camera shake — harder crash = bigger shake
      const shakeIntensity = Math.min(damage * 0.15, 8)
      this.vehicleCamera?.shake(shakeIntensity, 0.5)
    }

    this.landerController.onDeath = () => {
      this.failLanderRun('Lander Destroyed', { explode: true, hideLander: true })
    }

    this.landerController.onFuelEmpty = () => {
      this.failLanderRun('Out of Fuel')
    }

    const storedProfile = typeof localStorage === 'undefined' ? null : loadProfile()
    const savedLanderHp = storedProfile?.landerHullHp
    if (
      savedLanderHp !== undefined
      && savedLanderHp > 0
      && this.landerController
    ) {
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
    const landerSpawn = new Vector3(spawnX, LANDER_SPAWN_HEIGHT, spawnZ)
    this.arrivalSequence = new ArrivalSequence(landerSpawn)
    await this.arrivalSequence.load()
    this.sceneManager.scene.add(this.arrivalSequence.shuttleGroup)
    this.registerLevelColliders()

    this.arrivalSequence.onLanderDetach = (position) => {
      if (this.landerController) {
        const gameplayStart = offsetGameplayLanderSpawn(position)
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
      this.collisionWorld,
    )
    this.playerController.group.visible = false
    this.playerController.onDeath = () => {
      // Lander rescue — if the player dies while standing next to the lander
      // (typically hypoxia after running the O2 tank dry), treat it as if they
      // managed to climb back into the cockpit: replenish life support and
      // transition into the lander instead of the dead state. Prevents the
      // case where the player walks the last meter to the airlock and dies
      // mid-press of the interact key.
      if (this.isPlayerNearLander() && this.stateMachine?.is('eva')) {
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
      size: 3,
      lifetime: 0.4,
      spread: 15,
      opacity: 0.8,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    // Tractor stream — particles fly from the struck rock toward the
    // gun muzzle. Soft+screen-space sizing keeps them readable across
    // distances. Lifetime is short so the player perceives an
    // "extraction" pull rather than a slow trail. Pool size budgets
    // ~6 spawns per drill tick at the system's worst-case fire rate.
    this.tractorEmitter = new ParticleEmitter({
      poolSize: 96,
      color: new Color(0x66ffee),
      size: 6,
      lifetime: LevelViewController.TRACTOR_LIFETIME_SEC,
      spread: 1.4,
      opacity: 0.85,
      soft: true,
      sizeAttenuation: false,
      sizeGrowth: 0.4,
    })
    this.sceneManager.addToScene(this.tractorEmitter.points)
    // Rock target indicator — single shared sprite that hops between
    // the rock the player is currently aiming at while drill mode is
    // active. Hidden by default; visibility toggled in `tickEva`.
    this.rockTargetIndicator = new RockTargetIndicator()
    this.sceneManager.addToScene(this.rockTargetIndicator.sprite)
    this.projectileSystem.onImpact = (pos) => {
      for (let i = 0; i < 8; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(5)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
    }
    this.projectileSystem.onEnemyHit = (enemy, pos) => {
      // Fan the hit out to whichever minigame owns this enemy so the matching
      // visual controller plays its hit-flash. Mirrors the bookkeeping in
      // `FpsViewController` where a single `onEnemyHit` callback dispatches
      // to all controller maps.
      for (const mg of this.minigames) {
        mg.notifyEnemyHit?.(enemy)
      }
      // Impact spark burst at the contact point — same magnitude as FpsView.
      for (let i = 0; i < 12; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(8)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)

    // ── Universal rock mining ───────────────────────────────────
    // Every surface rock can be drilled regardless of mission type;
    // gather objectives just listen to the same yield stream.
    const miningSeed = hashSeed(mission.id)
    this.rockYieldSystem = new RockYieldSystem({
      composition: asteroid.composition,
      seed: miningSeed,
    })
    if (this.surfaceRocks) {
      const rockSpawns = this.surfaceRocks.spawns
      const rockColliderEntries = this.surfaceRocks.buildColliders(this.heightmap)
      for (let i = 0; i < rockSpawns.length; i++) {
        const spawn = rockSpawns[i]!
        const collider = rockColliderEntries[i]!
        const center = typeof collider.center === 'function' ? collider.center() : collider.center
        this.rockYieldSystem.registerRock({ spawnIndex: i, diameter: spawn.diameter })
        this.projectileSystem.addRock({
          spawnIndex: i,
          cx: center.x,
          cy: center.y,
          cz: center.z,
          radius: collider.radius,
        })
      }
    }
    this.rockYieldSystem.onConsume = (spawnIndex) => {
      this.surfaceRocks?.hideRock(spawnIndex)
      this.removeRockCollider(spawnIndex)
      this.projectileSystem?.removeRock(spawnIndex)
    }
    this.rockYieldSystem.onMineralExtracted = (itemId, kg) => {
      const inventory = loadInventory()
      if (!inventory) return
      const quantity = Math.max(1, Math.round(kg))
      const def = getItemDefinition(itemId)
      const label = def?.label ?? itemId
      const result = addItem(inventory, itemId, quantity)
      if (!result.ok) {
        // Inventory full / over weight — surface a warning toast so the
        // player understands why this hit produced no pickup. The mineral
        // is still considered extracted by the gather minigame (which
        // listens upstream of this handler) so quotas keep advancing.
        this.onResourcePickupFailed?.(label, result.reason ?? 'Inventory full')
        return
      }
      saveInventory(result.inventory)
      this.onResourcePickup?.(itemId, quantity, label)
      this.levelAudio.notifyResourcePickup()
    }
    this.projectileSystem.onRockHit = (spawnIndex, pos) => {
      this.rockYieldSystem?.mineRock(spawnIndex)
      this.surfaceRocks?.flashRock(spawnIndex)
      for (let i = 0; i < 6; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(6)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
      this.spawnTractorBurst(spawnIndex, pos)
    }

    // ── Objective minigames ──────────────────────────────────────
    const missionSeed = hashSeed(mission.id)
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      if (obj.type === 'survey') {
        const minigame = new SurveyMinigame(
          i, obj, this.sceneManager!.scene, this.heightmap!, missionSeed,
        )
        minigame.onPrompt = (text) => this.onTerminalPrompt?.(text)
        minigame.onComplete = (idx) => this.onObjectiveComplete?.(idx)
        minigame.onStepChange = (idx, steps) => this.onStepChange?.(idx, steps)
        minigame.onRefuel = () => this.landerController?.thrusterSystem.refuel()
        minigame.onRegisterTickable = (t) => this.tickHandler!.register(t, TICK_PRIORITY_PHYSICS + 4)
        minigame.onUnregisterTickable = (t) => this.tickHandler?.unregister(t)
        this.minigames.push(minigame)
      } else if (obj.type === 'exterminate') {
        const minigame = await ExterminateMinigame.create(
          i,
          obj,
          this.sceneManager!.scene,
          this.heightmap!,
          this.projectileSystem,
          mission.difficulty,
        )
        minigame.onPrompt = (text) => this.onTerminalPrompt?.(text)
        minigame.onComplete = (idx) => this.onObjectiveComplete?.(idx)
        minigame.onStepChange = (idx, steps) => this.onStepChange?.(idx, steps)
        minigame.onDamagePlayer = (damage, sourceX, sourceZ, source) => {
          this.applyPlayerDamageFeedback(damage, sourceX, sourceZ, source)
        }
        minigame.onKillPlayer = () => {
          const playerPos = this.playerController?.group.position
          this.applyPlayerDamageFeedback(
            999,
            playerPos?.x ?? 0,
            (playerPos?.z ?? 0) - 1,
          )
        }
        minigame.onDestroyLander = () => {
          this.failLanderRun('Lander Destroyed by Nest Blast', { explode: true, hideLander: true })
        }
        minigame.onExplosion = (pos) => {
          this.triggerObjectiveExplosion(pos, 32, 10)
        }
        this.minigames.push(minigame)
      } else if (obj.type === 'rescue') {
        const minigame = await RescueMinigame.create(
          i,
          obj,
          this.sceneManager!.scene,
          this.heightmap!,
          this.projectileSystem,
          mission.difficulty,
        )
        minigame.onPrompt = (text) => this.onTerminalPrompt?.(text)
        minigame.onComplete = (idx) => this.onObjectiveComplete?.(idx)
        minigame.onStepChange = (idx, steps) => this.onStepChange?.(idx, steps)
        minigame.onDamagePlayer = (damage, sourceX, sourceZ, source) => {
          this.applyPlayerDamageFeedback(damage, sourceX, sourceZ, source)
        }
        minigame.onKillPlayer = () => {
          const playerPos = this.playerController?.group.position
          this.applyPlayerDamageFeedback(
            999,
            playerPos?.x ?? 0,
            (playerPos?.z ?? 0) - 1,
          )
        }
        minigame.onDestroyLander = () => {
          this.failLanderRun('Lander Destroyed by Virus Blast', { explode: true, hideLander: true })
        }
        minigame.onExplosion = (pos) => {
          this.triggerObjectiveExplosion(pos, 36, 9)
        }
        minigame.onFail = (_idx, cause) => {
          this.onDeathOverlay?.(true, cause)
        }
        this.minigames.push(minigame)
      } else if (obj.type === 'collect') {
        const minigame = new CollectMinigame(i, obj, this.sceneManager!.scene, this.heightmap!)
        minigame.onPrompt = (text) => this.onTerminalPrompt?.(text)
        minigame.onComplete = (idx) => this.onObjectiveComplete?.(idx)
        minigame.onStepChange = (idx, steps) => this.onStepChange?.(idx, steps)
        this.minigames.push(minigame)
      } else if (obj.type === 'gather' && this.rockYieldSystem) {
        const minigame = new GatherMinigame({
          objectiveIndex: i,
          objective: obj,
          scene: this.sceneManager!.scene,
          heightmap: this.heightmap!,
          composition: asteroid.composition,
          difficulty: mission.difficulty,
          seed: missionSeed,
          rockYieldSystem: this.rockYieldSystem,
        })
        minigame.onPrompt = (text) => this.onTerminalPrompt?.(text)
        minigame.onComplete = (idx) => this.onObjectiveComplete?.(idx)
        minigame.onStepChange = (idx, steps) => this.onStepChange?.(idx, steps)
        this.minigames.push(minigame)
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
      hasCompletedEva: () => this.hasExitedVehicle,
    })

    // ── Always-active tickables ─────────────────────────────────
    this.tickHandler.register(this.stateMachine, TICK_PRIORITY_INPUT + 1)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // ── Arrival state starts with lander physics + cinematic cam ─
    this.enterArrival()

    // ── Dev tools ────────────────────────────────────────────────
    DevConsole.register('LevelView', {
      takeDamage: (amount = 10) => this.playerController?.takeDamage(amount),
      heal: () => this.playerController?.replenish(),
      kill: () => this.playerController?.takeDamage(999),
      landerDamage: (amount = 20) => this.landerController?.takeDamage(amount),
      landerDestroy: () => this.landerController?.takeDamage(999),
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
    const camera = this.fpsCamera?.camera
      ?? this.vehicleCamera?.camera
      ?? this.sceneManager.activeCamera
    if (!camera) return

    const restoreLightVisibility: Array<{ light: THREE.Light, visible: boolean }> = []
    scene.traverse((obj) => {
      const maybeLight = obj as THREE.Light
      if (maybeLight.isLight) {
        restoreLightVisibility.push({ light: maybeLight, visible: maybeLight.visible })
        maybeLight.visible = true
      }
    })

    try {
      if (typeof renderer.compileAsync === 'function') {
        await renderer.compileAsync(scene, camera)
      } else if (typeof renderer.compile === 'function') {
        renderer.compile(scene, camera)
      }
    } catch (err) {
      console.warn('[LevelViewController] shader precompile failed; gameplay may hitch on first appearance of new materials', err)
    } finally {
      for (const entry of restoreLightVisibility) {
        entry.light.visible = entry.visible
      }
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
        // Don't run normal exitEva when dying — enterDead handles its own cleanup
        if (current !== 'dead') this.exitEva()
        break
    }

    switch (current) {
      case 'lander':
        this.enterLander()
        break
      case 'eva':
        this.enterEva()
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

  // ═══════════════════════════════════════════════════════════════
  // Lander state
  // ═══════════════════════════════════════════════════════════════

  private enterLander(): void {
    // Force the throttled HUD telemetry to emit on the very next tick so the
    // lander HUD lights up immediately on state change.
    this.telemetryAccumulator = LevelViewController.TELEMETRY_INTERVAL_S
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.vehicleCamera!, TICK_PRIORITY_RENDER - 2)
    this.tickHandler!.register(this.landerExplosion!, TICK_PRIORITY_PHYSICS + 3)
    this.vehicleCamera!.controls.enabled = true
    this.sceneManager!.setCamera(this.vehicleCamera!)
    this.sceneManager!.setActiveCamera(null)
    if (this.postProcessing && this.vehicleCamera) {
      this.postProcessing.setCamera(this.vehicleCamera.camera)
    }

    // Mission announcement — first lander entry only (after arrival cutscene)
    if (!this.missionAnnounced && this.mission) {
      this.missionAnnounced = true
      this.onMissionAnnounce?.(this.asteroidName, this.mission.name)
    }
  }

  private exitLander(): void {
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
    this.tickHandler!.unregister(this.landerExplosion!)
    this.vehicleCamera!.controls.enabled = false

    // Kill any lingering thruster particles so they don't freeze in the scene
    this.landerController!.flameEmitter.reset()
    for (const emitter of this.landerController!.rcsEmitters.values()) {
      emitter.reset()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EVA state
  // ═══════════════════════════════════════════════════════════════

  private enterEva(): void {
    // Force the throttled HUD telemetry to emit on the very next tick so the
    // EVA HUD lights up immediately on state change.
    this.telemetryAccumulator = LevelViewController.TELEMETRY_INTERVAL_S
    this.hasExitedVehicle = true
    this.playerController!.group.position.copy(this.findSafeEvaSpawnPosition())

    // Show EVA visuals
    this.playerController!.group.visible = true
    this.multiTool!.setVisible(true)

    // Register EVA tickables
    this.tickHandler!.register(this.playerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.multiToolState!, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler!.register(this.projectileSystem!, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler!.register(this.impactEmitter!, TICK_PRIORITY_PHYSICS + 3)
    if (this.tractorEmitter) {
      this.tickHandler!.register(this.tractorEmitter, TICK_PRIORITY_PHYSICS + 3)
    }
    if (this.surfaceRocks) {
      this.tickHandler!.register(this.surfaceRocks, TICK_PRIORITY_PHYSICS + 3)
    }
    this.tickHandler!.register(this.fpsCamera!, TICK_PRIORITY_RENDER - 2)
    this.tickHandler!.register(this.multiTool!, TICK_PRIORITY_RENDER - 2)
    this.fpsCamera!.helmetLightRig.visible = true

    // FPS camera
    this.fpsCamera!.setTarget(this.playerController!.group)
    this.sceneManager!.setActiveCamera(this.fpsCamera!.camera)
    this.sceneManager!.setCamera(null)
    if (this.postProcessing && this.fpsCamera) {
      this.postProcessing.setCamera(this.fpsCamera.camera)
    }

    // Pointer lock
    this.setupPointerLock()
    this.sceneManager!.renderer.domElement.requestPointerLock()

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

    // Hide EVA visuals
    this.playerController!.group.visible = false
    this.multiTool!.setVisible(false)

    // Unregister EVA tickables
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
    if (this.tractorEmitter) this.tickHandler!.unregister(this.tractorEmitter)
    if (this.surfaceRocks) this.tickHandler!.unregister(this.surfaceRocks)
    this.rockTargetIndicator?.hide()
    this.tickHandler!.unregister(this.fpsCamera!)
    this.tickHandler!.unregister(this.multiTool!)
    this.fpsCamera!.helmetLightRig.visible = false

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()

    // Reset mouse state
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false

    // Cuts breathing, floating, and any in-flight contact-damage loop.
    this.fpsAudio.stop()
  }

  // ═══════════════════════════════════════════════════════════════
  // Dead / Failed states
  // ═══════════════════════════════════════════════════════════════

  private enterDead(): void {
    // Stop player movement but keep fpsCamera ticking for the death pitch-down
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
    if (this.tractorEmitter) this.tickHandler!.unregister(this.tractorEmitter)
    if (this.surfaceRocks) this.tickHandler!.unregister(this.surfaceRocks)
    this.rockTargetIndicator?.hide()
    this.tickHandler!.unregister(this.multiTool!)
    // NOTE: fpsCamera stays registered — it renders the death camera drop
    this.fpsCamera!.helmetLightRig.visible = false

    // Hide the gun
    this.multiTool!.setVisible(false)

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false

    // exitEva is skipped on the dead path so we must cut EVA audio here
    // explicitly. The director's stop() also resets footstep cadence.
    this.fpsAudio.stop()

    // Fade + message are driven by the dead state tick, not set here
  }

  private enterFailed(): void {
    this.restartLevel()
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
    return this.minigames.find((mg) => mg.objectiveIndex === objectiveIndex)
  }

  // ═══════════════════════════════════════════════════════════════
  // Exfil / Complete states
  // ═══════════════════════════════════════════════════════════════

  private enterExfil(): void {
    // Fire mission complete if all objectives done
    // TODO: apply multitoolScience multiplier when FPS mission CR reward system is implemented
    if (this.allObjectivesComplete()) {
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

    if (
      this.persistShuttleMissionRewards
      && this.mission
      && this.allObjectivesComplete()
    ) {
      hydratePlayerUpgradeLevelsFromStorage()
      const rewardMult = getCurrentUpgradeValue('shuttleScienceStation')
      persistCompletedAsteroidMissionRewards(this.mission, rewardMult)
    }

    import('@/router').then(({ default: router }) => {
      router.push('/map')
    })
  }

  private restartLevel(): void {
    this.clearLanderHullPersistTimer()

    this.onDeathOverlay?.(false, '')
    this.onDeathFade?.(0)
    this.onDeathMessage?.(false)
    this.onArrivalFade?.(0)
    this.onLetterbox?.(false)

    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()

    this.landerDestroyed = false
    this.hasExitedVehicle = false

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

    // Tick arrival sequence if active
    if (this.arrivalSequence) {
      this.arrivalSequence.tick(dt)
    }

    // Animate waypoint beams
    const activePos = this.stateMachine?.is('eva')
      ? this.playerController?.group.position
      : this.landerController?.position
    updateWaypointMarkers(this.elapsed, activePos?.x, activePos?.z)

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

    // F key → state triggers (only one can succeed per press)
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine && !this.landerDestroyed) {
      if (!this.stateMachine.trigger('exfiltrate')) {
        if (!this.stateMachine.trigger('exitVehicle')) {
          this.stateMachine.trigger('enterVehicle')
        }
      }
    }

    // EVA: feed inputs to tool + camera
    if (this.stateMachine?.is('eva')) {
      this.tickEva(dt)

      // Hypoxia visual — fade + pulse when O2 is empty and HP is draining
      const o2Empty = this.playerController!.o2Level <= 0
      const hpRatio = this.playerController!.hp / this.playerController!.maxHp
      if (o2Empty) {
        // Base fade from HP loss (0% HP → 0.7 opacity, 100% HP → 0)
        const baseFade = (1 - hpRatio) * 0.7
        // Breathing pulse that gets faster as HP drops
        const pulseSpeed = 2 + (1 - hpRatio) * 4 // 2 Hz at full HP → 6 Hz near death
        const pulse = Math.sin(performance.now() * 0.001 * pulseSpeed * Math.PI * 2)
        const pulseAmount = 0.08 + (1 - hpRatio) * 0.12 // subtle at first, stronger near death
        this.onDeathFade?.(Math.min(1, baseFade + pulse * pulseAmount))
      } else {
        this.onDeathFade?.(0)
      }
    }

    this.enforceLanderAltitudeCeiling()
    this.tickMinigames(dt)

    // Damage flash decay — same shape as `FpsViewController.tick`. The Vue
    // overlay reads this every frame so we always emit (0 once cleared) to
    // keep its `v-if` in sync.
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - dt)
      this.onDamageFlash?.(this.damageFlashTimer / DAMAGE_FLASH_DURATION)
    } else {
      this.onDamageFlash?.(0)
    }


    // Dead: camera drops, screen fades, message appears
    if (this.stateMachine?.is('dead') && this.fpsCamera) {
      const DEATH_PITCH_SPEED = 1.2
      const DEATH_PITCH_TARGET = -1.4 // ~80 degrees down
      const FADE_DURATION = 2.0 // seconds to full black
      const MESSAGE_DELAY = 1.5 // seconds before showing YOU DIED

      // Camera drops
      if (this.fpsCamera.pitch > DEATH_PITCH_TARGET) {
        this.fpsCamera.pitch -= DEATH_PITCH_SPEED * dt
      }

      // Gradual fade to black
      const elapsed = this.stateMachine.stateTime
      const fadeProgress = Math.min(1, elapsed / FADE_DURATION)
      this.onDeathFade?.(fadeProgress)

      // Show message after delay
      if (elapsed >= MESSAGE_DELAY) {
        this.onDeathMessage?.(true)
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
          const altFade = 1 - Math.min(1, alt / THRUST_VIBRATION_FADE_ALT)
          const intensity = THRUST_VIBRATION_MIN + (THRUST_VIBRATION_MAX - THRUST_VIBRATION_MIN) * altFade * altFade
          this.vehicleCamera.shake(intensity, THRUST_VIBRATION_DURATION)
          vibrationFactor = intensity / THRUST_VIBRATION_MAX
        }
        this.landerAudio.update(dt, { engineFiring, vibrationFactor })
      } else if (this.atmosphereCtx) {
        // Not in lander mode — clear thrust so wash/shake effects stay silent.
        this.atmosphereCtx.landerThrust = 0
        this.landerAudio.update(dt, { engineFiring: false, vibrationFactor: 0 })
      }

      if (player) {
        this.atmosphereCtx.playerSpeed = player.speed
        this.atmosphereCtx.playerGrounded = player.grounded
        this.atmosphereCtx.playerPosition.copy(player.group.position)
      }

      this.atmosphereCtx.activeMode = currentState === 'eva' ? 'eva'
        : currentState === 'lander' ? 'lander'
        : 'cinematic'

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
      const grounded = this.landerController?.body.grounded ?? false

      const canExfil =
        currentState === 'lander' &&
        this.hasExitedVehicle &&
        this.isLanderNearShuttle()

      const canEnterLander =
        currentState === 'eva' &&
        this.isPlayerNearLander()

      this.onStateInfo?.({ state: currentState, grounded, canExfil, canEnterLander })

      // Throttle the high-cardinality HUD payloads (lander/EVA telemetry +
      // player-position) to TELEMETRY_INTERVAL_S. The Vue HUD bindings re-read
      // every property on every callback, which made camera rotation feel
      // jittery while enemies were on screen. State info above stays per-frame
      // because it drives the action prompts (canExfil/canEnterLander).
      this.telemetryAccumulator += dt
      const shouldEmitTelemetry = this.telemetryAccumulator >= LevelViewController.TELEMETRY_INTERVAL_S
      if (shouldEmitTelemetry) {
        this.telemetryAccumulator = 0
      }

      // Lander telemetry
      if (shouldEmitTelemetry && currentState === 'lander' && this.onLanderTelemetry && this.landerController) {
        const ts = this.landerController.thrusterSystem
        this.onLanderTelemetry({
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
          surveyTimeRemaining: this.getActiveMinigame()?.timeRemaining ?? null,
          surveyProbesCollected: this.getActiveMinigame()?.progressCurrent ?? null,
          surveyProbesTotal: this.getActiveMinigame()?.progressTotal ?? null,
        })
        this.onPlayerPosition?.(this.landerController!.group.position.x, this.landerController!.group.position.z)
      }

      // FPS telemetry
      if (shouldEmitTelemetry && currentState === 'eva' && this.onFpsTelemetry && this.playerController) {
        const ts = this.playerController.thrusterSystem
        const headingRad = this.fpsCamera!.camera.rotation.y
        const playerPos = this.playerController.group.position
        const compassHeading = headingRadToCompassDeg(headingRad)
        const objectives: CompassObjective[] = this.missionObjectives.map((obj, i) => ({
          id: `obj-${i}`,
          label: (OBJECTIVE_LABELS[obj.type] ?? obj.type).toUpperCase(),
          relativeDeg: signedRelativeBearingDeg(
            compassHeading,
            worldBearingDegTo(playerPos.x, playerPos.z, obj.x, obj.z),
          ),
          type: obj.type,
        }))
        this.onFpsTelemetry({
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
          headingRad,
          objectives,
        })
        this.onPlayerPosition?.(this.playerController!.group.position.x, this.playerController!.group.position.z)
      }
    }
  }

  /** Per-frame EVA logic — tool input, camera bob, aiming. */
  private tickEva(dt: number): void {
    // Tool keybinds
    if (this.inputManager && this.multiToolState) {
      if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
      if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
      if (this.inputManager.wasActionPressed('toolHeal')) this.multiToolState.setMode('heal')

      this.multiToolState.setAiming(this.rightMouseDown)
      this.multiToolState.setInput(this.leftMouseDown, this.leftMouseJustPressed)
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
      this.leftMouseJustPressed = false
    }

    // Sync tool visuals
    if (this.multiToolState && this.multiTool) {
      this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
      this.multiTool.setAiming(this.multiToolState.aiming)
      this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
      this.multiTool.setModeChargeLevel(this.multiToolState.modeCharge / this.multiToolState.modeChargeCapacity)
      this.playerController?.setAiming(this.multiToolState.aiming)
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
    }

    // ADS camera zoom
    if (this.multiToolState && this.fpsCamera) {
      const ads = this.multiToolState.adsConfig
      this.fpsCamera.setAiming(
        this.multiToolState.aiming,
        ads.fovMultiplier,
        ads.zoomSpeed,
      )
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

      // Fall damage — only on the airborne → grounded transition. The
      // body's `impactVelocityY` is set during this frame's player tick
      // (which runs before `LevelViewController.tick` thanks to the tick
      // priority ordering), so it's safe to read here.
      if (grounded && !this._prevGrounded) {
        this.applyEvaFallDamage()
      }

      this._prevGrounded = grounded

      // All player-movement audio (footsteps, breathing crossfade,
      // floating onset with delay+fade, contact-damage loop decay) is
      // owned by the director.
      this.fpsAudio.update(dt, {
        grounded,
        sprinting: sprintingNow,
        speed: this.playerController.speed,
      })
    }

    this.updateRockTargetIndicator()
  }

  /**
   * Refresh the rock-targeting HP bar each frame. Only active while
   * the multi-tool is in drill mode — the bar otherwise immediately
   * hides regardless of where the camera is pointing.
   *
   * Cheap path: a swept-sphere ray pick against the registered rock
   * collider list (already maintained by `ProjectileSystem` for drill
   * bolts), so we don't double-pay for spatial structures.
   */
  private updateRockTargetIndicator(): void {
    const indicator = this.rockTargetIndicator
    const projectiles = this.projectileSystem
    const rockYield = this.rockYieldSystem
    const rocks = this.surfaceRocks
    const heightmap = this.heightmap
    const camera = this.fpsCamera?.camera
    const tool = this.multiToolState
    if (!indicator || !projectiles || !rockYield || !rocks || !heightmap || !camera || !tool) {
      this.rockTargetIndicator?.hide()
      return
    }
    if (tool.mode !== 'drill') {
      indicator.hide()
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
      indicator.hide()
      return
    }
    const roll = rockYield.peekRock(hit.spawnIndex)
    if (!roll) {
      indicator.hide()
      return
    }
    const center = rocks.getRockCenter(hit.spawnIndex, heightmap, this._rockTargetCenter)
    if (!center) {
      indicator.hide()
      return
    }
    const radius = rocks.getRockRadius(hit.spawnIndex)
    const def = getItemDefinition(roll.itemId)
    indicator.setTarget({
      spawnIndex: hit.spawnIndex,
      centerX: center.x,
      centerY: center.y,
      centerZ: center.z,
      radius: radius ?? undefined,
      remainingKg: roll.remainingKg,
      totalKg: roll.totalKg,
      label: def?.label ?? roll.itemId,
    })
  }

  private enforceLanderAltitudeCeiling(): void {
    if (!this.stateMachine?.is('lander')) return
    if (!this.landerController || !this.arrivalSequence || this.landerDestroyed) return

    const ceilingY =
      this.arrivalSequence.shuttleGroup.position.y + LANDER_ALTITUDE_CEILING_ABOVE_SHUTTLE

    if (this.landerController.position.y <= ceilingY) return

    this.landerController.position.y = ceilingY
    if (this.landerController.body.velocityY > 0) {
      this.landerController.body.velocityY = 0
    }
  }


  /** Per-frame minigame logic — delegates to each minigame instance. */
  private tickMinigames(dt: number): void {
    const ctx = this.buildMinigameContext()
    for (const mg of this.minigames) {
      mg.tick(dt, ctx)
    }

    // Clear prompt if no minigame interaction is in range
    if (ctx.levelState === 'eva' && !this.minigames.some((mg) => mg.isPlayerNearInteraction)) {
      this.onTerminalPrompt?.(null)
    }
  }

  /** Build the context object passed to minigames each frame. */
  private buildMinigameContext(): MiniGameContext {
    const state = this.stateMachine?.state ?? ''
    const lander = this.landerController
    const player = this.playerController
    return {
      levelState: state,
      landerPosition: lander ? { x: lander.position.x, y: lander.position.y, z: lander.position.z } : null,
      landerGrounded: lander?.body.grounded ?? false,
      playerPosition: state === 'eva' && player
        ? { x: player.group.position.x, y: player.group.position.y, z: player.group.position.z }
        : null,
      interactPressed: this.inputManager?.wasActionPressed('interact') ?? false,
      terminalInteractPressed: this.inputManager?.wasActionPressed('terminalInteract') ?? false,
    }
  }

  /** Get the first active minigame (for HUD telemetry). */
  private getActiveMinigame(): MiniGame | undefined {
    return this.minigames.find((mg) => mg.status === 'active')
  }

  /** Check if all mission objectives with minigames are complete. */
  private allObjectivesComplete(): boolean {
    if (this.minigames.length === 0) return false
    return this.minigames.every((mg) => mg.status === 'completed')
  }

  private registerLevelColliders(): void {
    if (!this.collisionWorld || !this.landerController || !this.arrivalSequence) return

    this.clearCollisionRegistrations()

    this.collisionCleanup.push(
      this.collisionWorld.addCollider(
        {
          id: LANDER_COLLIDER_ID,
          ...this.createLocalAabbCollider(this.landerController.group, LANDER_COLLIDER_MIN, LANDER_COLLIDER_MAX),
        },
      ),
    )

    this.collisionCleanup.push(
      this.collisionWorld.addCollider(
        {
          id: SHUTTLE_COLLIDER_ID,
          ...this.createLocalAabbCollider(this.arrivalSequence.shuttleGroup, SHUTTLE_COLLIDER_MIN, SHUTTLE_COLLIDER_MAX),
        },
      ),
    )
  }

  private clearCollisionRegistrations(): void {
    while (this.collisionCleanup.length > 0) {
      this.collisionCleanup.pop()?.()
    }
  }

  private clearSurfaceRockCollisionRegistrations(): void {
    for (const cleanup of this.surfaceRockCollisionCleanup.values()) cleanup()
    this.surfaceRockCollisionCleanup.clear()
  }

  /**
   * Drop the collider for a single mined-out rock. No-op if the rock
   * has already been removed (idempotent so the depletion callback
   * can fire safely even after dispose).
   */
  private removeRockCollider(spawnIndex: number): void {
    const cleanup = this.surfaceRockCollisionCleanup.get(spawnIndex)
    if (!cleanup) return
    cleanup()
    this.surfaceRockCollisionCleanup.delete(spawnIndex)
  }

  /**
   * Spawn a tiny burst of tractor-beam particles flying from the
   * struck rock toward the player's gun muzzle. Sets each particle's
   * velocity such that it covers the gap in roughly one emitter
   * lifetime; minor mid-flight player movement is masked by the
   * additive blending and short fade.
   *
   * Silent when any of the required systems are not initialised
   * (e.g. mined while the EVA gun model is still streaming in).
   *
   * @param spawnIndex Surface rock spawn id.
   * @param impactPos World-space hit position from the projectile system.
   */
  private spawnTractorBurst(spawnIndex: number, impactPos: THREE.Vector3): void {
    const tractor = this.tractorEmitter
    const tool = this.multiTool
    if (!tractor || !tool) return
    tool.getMuzzleWorldPosition(this._tractorMuzzle)
    if (this.surfaceRocks && this.heightmap) {
      const center = this.surfaceRocks.getRockCenter(spawnIndex, this.heightmap, this._tractorOrigin)
      if (!center) this._tractorOrigin.copy(impactPos)
    } else {
      this._tractorOrigin.copy(impactPos)
    }
    this._tractorVel.copy(this._tractorMuzzle).sub(this._tractorOrigin)
    const distance = this._tractorVel.length()
    if (distance < 0.01) return
    const speed = distance / LevelViewController.TRACTOR_LIFETIME_SEC
    this._tractorVel.multiplyScalar(speed / distance)
    for (let i = 0; i < LevelViewController.TRACTOR_PARTICLES_PER_HIT; i++) {
      tractor.emit(this._tractorOrigin, this._tractorVel)
    }
  }

  private createLocalAabbCollider(object: THREE.Object3D, localMin: THREE.Vector3, localMax: THREE.Vector3) {
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
    if (!this.landerController || !this.collisionWorld) {
      const landerPos = this.landerController?.group.position
      return new THREE.Vector3(
        (landerPos?.x ?? 0) + EVA_SPAWN_OFFSET_X,
        landerPos?.y ?? 0,
        landerPos?.z ?? 0,
      )
    }

    const lander = this.landerController.group
    const collisionWorld = this.collisionWorld
    const groundY = collisionWorld.getGroundHeight(lander.position.x, lander.position.z)
    return new THREE.Vector3(
      lander.position.x,
      Math.max(groundY, lander.position.y) + EVA_SPAWN_TOP_Y_OFFSET,
      lander.position.z,
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

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
    source?: 'projectile' | 'contact',
  ): void {
    this.playerController?.takeDamage(damage)
    this.damageFlashTimer = DAMAGE_FLASH_DURATION

    // Damage audio (composite ranged thud / mauling loop) is owned by
    // the FPS audio director. See `FpsAudioDirector.notifyProjectileDamage`
    // and `notifyContactDamage` for the full per-cue rationale.
    if (source === 'projectile') {
      this.fpsAudio.notifyProjectileDamage()
    } else if (source === 'contact') {
      this.fpsAudio.notifyContactDamage()
    }

    const playerPos = this.playerController?.group.position
    if (!playerPos) return

    const dx = playerPos.x - sourceX
    const dz = playerPos.z - sourceZ
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > 0.01) {
      this.playerController?.applyLateralImpulse(
        (dx / dist) * CONTACT_KNOCKBACK,
        (dz / dist) * CONTACT_KNOCKBACK,
      )
    }

    // Camera flinch + screen-space damage direction (only meaningful while
    // the FPS camera is active; the lander-cam path just skips it).
    if (this.fpsCamera && this.stateMachine?.is('eva')) {
      this.fpsCamera.applyMouseDelta(
        (Math.random() - 0.5) * DAMAGE_FLINCH_STRENGTH,
        -Math.random() * DAMAGE_FLINCH_STRENGTH,
      )
      const worldAngle = Math.atan2(sourceX - playerPos.x, sourceZ - playerPos.z)
      const relAngle = worldAngle - this.fpsCamera.yaw
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
    if (impactSpeed <= FALL_DAMAGE_SAFE_SPEED) return

    const overshoot = impactSpeed - FALL_DAMAGE_SAFE_SPEED
    const rawDamage = Math.min(overshoot * FALL_DAMAGE_PER_UNIT, FALL_DAMAGE_MAX)

    // No-kill clamp — we only ever deal up to (currentHp - floor) damage,
    // so the player always lives. Using the controller's `_hp` would be
    // cleaner but it's private; the public `hp` getter is sufficient
    // because both are in lock-step (no other code path mutates between
    // the read and the takeDamage call within the same tick frame).
    const survivableDamage = Math.max(0, player.hp - FALL_DAMAGE_MIN_HP_AFTER)
    const damage = Math.min(rawDamage, survivableDamage)
    if (damage <= 0) return

    player.takeDamage(damage)

    // Same red-vignette pulse the combat path uses (`damageFlashTimer` is
    // decayed each frame in `tick` and broadcast via `onDamageFlash`, which
    // `LevelView.vue` pipes into the shared `DamageVignette` overlay). The
    // result is the player gets the exact same "I just took damage" HUD cue
    // for a fall as they do for an enemy hit.
    this.damageFlashTimer = DAMAGE_FLASH_DURATION

    if (this.fpsCamera && this.stateMachine?.is('eva')) {
      // Pure downward flinch — pitch nose-down a touch to sell the
      // "knees buckle" feel; no horizontal jitter so it doesn't get
      // confused with combat damage.
      this.fpsCamera.applyMouseDelta(
        (Math.random() - 0.5) * (FALL_DAMAGE_FLINCH_STRENGTH * 0.3),
        FALL_DAMAGE_FLINCH_STRENGTH,
      )
    }

    // Composite fall-damage cue (thump + vocal grunt) is owned by
    // FpsAudioDirector — it volume-scales both layers from severity
    // and routes through the manifest's restart-policy on the grunt.
    this.fpsAudio.notifyFallDamage(damage / FALL_DAMAGE_MAX)
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
  private triggerObjectiveExplosion(
    pos: Vector3,
    sparkBursts: number,
    sparkBaseSpeed: number,
  ): void {
    // Fire + debris from the lander explosion emitter — same particle budget
    // as a hard crash, scaled by impact speed.
    this.landerExplosion?.explode(pos, OBJECTIVE_EXPLOSION_IMPACT)

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
      attenuation = Math.max(0, 1 - dist / EXPLOSION_FEEDBACK_RANGE)
    }

    this.levelAudio.notifyObjectiveExplosion(attenuation)

    if (
      attenuation > 0 &&
      this.fpsCamera &&
      this.stateMachine?.is('eva')
    ) {
      const kick = EXPLOSION_FLINCH_STRENGTH * attenuation
      this.fpsCamera.applyMouseDelta(
        (Math.random() - 0.5) * kick,
        -Math.random() * kick,
      )
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

  /** Check if the lander is within exfil range of the parked shuttle. */
  private isLanderNearShuttle(): boolean {
    if (!this.landerController || !this.arrivalSequence) return false
    const landerY = this.landerController.position.y
    const shuttleY = this.arrivalSequence.shuttleGroup.position.y
    return Math.abs(landerY - shuttleY) <= EXFIL_PROXIMITY_RANGE
  }

  private isLanderAdrift(): boolean {
    if (!this.landerController || !this.heightmap || this.landerDestroyed) return false

    const landerPos = this.landerController.group.position
    const halfSize = this.heightmap.worldSize / 2
    const outsideX = Math.abs(landerPos.x) > halfSize + ADRIFT_BOUNDS_MARGIN
    const outsideZ = Math.abs(landerPos.z) > halfSize + ADRIFT_BOUNDS_MARGIN
    if (!outsideX && !outsideZ) return false

    const clampedX = Math.max(-halfSize, Math.min(halfSize, landerPos.x))
    const clampedZ = Math.max(-halfSize, Math.min(halfSize, landerPos.z))
    const edgeTerrainY = this.heightmap.heightAt(clampedX, clampedZ)

    return landerPos.y < edgeTerrainY - ADRIFT_DEPTH_MARGIN
  }

  // ═══════════════════════════════════════════════════════════════
  // Pointer lock (EVA only)
  // ═══════════════════════════════════════════════════════════════

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement

    this.boundOnMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }

    this.boundOnMouseDown = (e: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return
      if (e.button === 0) {
        this.leftMouseDown = true
        this.leftMouseJustPressed = true
      }
      if (e.button === 2) this.rightMouseDown = true
    }

    this.boundOnMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) this.leftMouseDown = false
      if (e.button === 2) this.rightMouseDown = false
    }

    this.boundOnLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      if (!locked) {
        this.leftMouseDown = false
        this.leftMouseJustPressed = false
        this.rightMouseDown = false
      }
    }

    document.addEventListener('mousemove', this.boundOnMouseMove)
    document.addEventListener('mousedown', this.boundOnMouseDown)
    document.addEventListener('mouseup', this.boundOnMouseUp)
    document.addEventListener('pointerlockchange', this.boundOnLockChange)
    canvas.addEventListener('contextmenu', this.preventContextMenu)
    canvas.addEventListener('click', this.requestLockOnClick)
  }

  private teardownPointerLock(): void {
    if (this.boundOnMouseMove) document.removeEventListener('mousemove', this.boundOnMouseMove)
    if (this.boundOnMouseDown) document.removeEventListener('mousedown', this.boundOnMouseDown)
    if (this.boundOnMouseUp) document.removeEventListener('mouseup', this.boundOnMouseUp)
    if (this.boundOnLockChange) document.removeEventListener('pointerlockchange', this.boundOnLockChange)

    const canvas = this.sceneManager?.renderer.domElement
    if (canvas) {
      canvas.removeEventListener('contextmenu', this.preventContextMenu)
      canvas.removeEventListener('click', this.requestLockOnClick)
    }

    this.boundOnMouseMove = null
    this.boundOnMouseDown = null
    this.boundOnMouseUp = null
    this.boundOnLockChange = null
  }

  private preventContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private requestLockOnClick = (): void => {
    const canvas = this.sceneManager?.renderer.domElement
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Persisted lander hull
  // ═══════════════════════════════════════════════════════════════

  /** Write lander HP into the player profile in localStorage. */
  private flushLanderHullToProfile(): void {
    if (typeof localStorage === 'undefined' || !this.landerController) return
    const stored = loadProfile()
    if (!stored) return
    const hp = this.landerController.hp
    if (stored.landerHullHp === hp) return
    saveProfile({ ...stored, landerHullHp: hp })
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
    for (const mg of this.minigames) {
      mg.dispose()
    }
    this.minigames.length = 0
    this.gameLoop?.stop()
    this.landerAudio.dispose()
    this.fpsAudio.dispose()
    this.levelAudio.dispose()
    this.teardownPointerLock()
    this.clearCollisionRegistrations()
    this.clearSurfaceRockCollisionRegistrations()
    this.projectileSystem?.dispose()
    if (this.rockYieldSystem) {
      this.rockYieldSystem.onMineralExtracted = null
      this.rockYieldSystem.onConsume = null
      this.rockYieldSystem = null
    }
    this.impactEmitter?.dispose()
    this.tractorEmitter?.dispose()
    this.tractorEmitter = null
    this.rockTargetIndicator?.dispose()
    this.rockTargetIndicator = null
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.arrivalSequence?.dispose()
    this.landerExplosion?.dispose()
    this.landerController?.dispose()
    this.surfaceRocks?.dispose()
    this.terrainMesh?.dispose()
    this.thrusterWash?.dispose()
    this.surfaceDust?.dispose()
    this.lightingRig?.dispose()
    this.postProcessing?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
