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
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { FpsCamera } from '@/three/FpsCamera'
import { TerrainMesh } from '@/three/TerrainMesh'
import { generateTerrain, FLAT_ZONE_RADIUS } from '@/lib/terrain/terrainGenerator'
import type { FlatZone } from '@/lib/terrain/terrainGenerator'
import { getAsteroidById, ASTEROID_CATALOG } from '@/lib/asteroids/catalog'
import type { AsteroidDefinition } from '@/lib/asteroids/types'
import { loadActiveMission } from '@/lib/missions/missionStorage'
import { LEVEL_GRID_SIZE, generateAsteroidMission } from '@/lib/missions/asteroidMissionGenerator'
import type { GeneratedAsteroidMission, ConcreteObjective } from '@/lib/missions/types'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import { CollisionWorld } from '@/lib/physics/worldCollision'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry, CompassObjective } from '@/components/FpsHud.vue'
import { headingRadToCompassDeg, worldBearingDegTo, signedRelativeBearingDeg } from '@/lib/math/bearing'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
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
import {
  addWaypointMarker,
  updateWaypointMarkers,
  clearWaypointMarkers,
} from '@/three/WaypointMarkers'
import { generateMapCanvas } from '@/lib/terrain/mapColors'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { SurveyProbeController } from '@/three/SurveyProbeController'
import { generateProbePositions } from '@/lib/survey/probePositions'
import playerConfigJson from '@/data/fps/player-config.json'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

// ── Scene constants ─────────────────────────────────────────────
const TERRAIN_RESOLUTION = 512

const LANDER_SPAWN_HEIGHT = 700

/** Maximum random offset from center for lander spawn position (XZ). */
const SPAWN_POSITION_RANGE = 2000
const LANDER_SPAWN_LIGHT_ALIGNMENT_X = 5
const LANDER_GAMEPLAY_START_OFFSET_X = 0
const LANDER_GAMEPLAY_START_OFFSET_Y = 0
const EVA_SPAWN_OFFSET_X = 8

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

function offsetGameplayLanderSpawn(position: Vector3): Vector3 {
  return position.clone().add(new Vector3(
    LANDER_GAMEPLAY_START_OFFSET_X,
    LANDER_GAMEPLAY_START_OFFSET_Y,
    0,
  ))
}

/** Runtime state for a single survey objective. */
interface SurveyRuntimeState {
  /** Index into missionObjectives array. */
  objectiveIndex: number
  /** Current phase. */
  status: 'idle' | 'active' | 'delivered' | 'failed'
  /** Terminal model placed at flat zone. */
  terminal: TerminalModel
  /** Probe controller (created on activation). */
  probeController: SurveyProbeController | null
  /** Time remaining in seconds (set on activation). */
  timeRemaining: number
}

/** Resolved level context — asteroid definition + terrain seed + mission. */
interface LevelContext {
  asteroid: AsteroidDefinition
  seed: number
  mission: GeneratedAsteroidMission
}

/** Maximum attempts to generate a mission matching the requested type. */
const MISSION_TYPE_RETRY_LIMIT = 20

/**
 * Resolve the asteroid and terrain seed for the current level.
 * Priority: ?asteroidId= URL param (generates ad-hoc mission) > active mission > fallback.
 * Optional ?mission= param forces a specific objective type (e.g. ?mission=survey).
 */
function resolveLevelContext(): LevelContext {
  const params = new URLSearchParams(window.location.search)
  const paramId = params.get('asteroidId')
  const missionType = params.get('mission')

  let mission: GeneratedAsteroidMission

  if (paramId) {
    mission = generateMissionWithType(5, missionType)
    mission.asteroidId = paramId
  } else {
    mission = loadActiveMission() ?? generateMissionWithType(5, missionType)
  }

  const asteroid = getAsteroidById(mission.asteroidId) ?? ASTEROID_CATALOG[0]!
  const seed = hashSeed(mission.id)

  return { asteroid, seed, mission }
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
  private collisionWorld: CollisionWorld | null = null
  private readonly collisionCleanup: Array<() => void> = []
  private stateMachine: StateMachine<LevelState> | null = null

  // ── Lander ───────────────────────────────────────────────────
  private landerController: LanderController | null = null
  private vehicleCamera: VehicleCamera | null = null

  // ── EVA ──────────────────────────────────────────────────────
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null

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

  /** Survey runtime states — one per survey objective. */
  private surveyStates: SurveyRuntimeState[] = []

  /** Called each frame during EVA with terminal prompt text (null to hide). */
  onTerminalPrompt: ((text: string | null) => void) | null = null

  private readonly initialLanderSpawn = new Vector3()

  // ── Elapsed time (seconds) ──────────────────────────────────
  private elapsed = 0

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
  onStateInfo: ((info: { state: string; grounded: boolean; canExfil: boolean }) => void) | null = null

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

  /** Called once with the minimap canvas after terrain generation. */
  onMapCanvas: ((canvas: HTMLCanvasElement) => void) | null = null

  /** Called each frame with player world position for minimap. */
  onPlayerPosition: ((x: number, z: number) => void) | null = null

  /** Initialise all systems and start the game loop. */
  async init(container: HTMLElement): Promise<void> {
    const playerConfig = playerConfigJson as FpsPlayerConfig

    // ── Input + tick handler ────────────────────────────────────
    this.inputManager = new InputManager(LEVEL_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // ── Scene ───────────────────────────────────────────────────
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // ── Asteroid data ────────────────────────────────────────────
    const { asteroid, seed, mission } = resolveLevelContext()
    this.mission = mission
    this.missionObjectives = mission.objectives
    this.asteroidName = asteroid.name

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
        })
    this.terrainMesh = new TerrainMesh(this.heightmap)
    this.collisionWorld = new CollisionWorld(this.heightmap)
    this.sceneManager.addToScene(this.terrainMesh.mesh)
    this.terrainMesh.mesh.receiveShadow = true

    // ── Objective waypoint markers ──────────────────────────────
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      const groundY = this.heightmap.heightAt(obj.x, obj.z)
      addWaypointMarker(`obj-${i}`, obj.x, obj.z, groundY, this.sceneManager!.scene)
    }


    // ── Survey terminals ───────────────────────────────────────
    for (let i = 0; i < mission.objectives.length; i++) {
      const obj = mission.objectives[i]!
      if (obj.type !== 'survey') continue
      const surveyGroundY = this.heightmap!.heightAt(obj.x, obj.z)
      const terminal = new TerminalModel()
      terminal.placeAt(obj.x + 5, surveyGroundY, obj.z)
      this.sceneManager!.addToScene(terminal.group)
      this.surveyStates.push({
        objectiveIndex: i,
        status: 'idle',
        terminal,
        probeController: null,
        timeRemaining: obj.timeLimit ?? 90,
      })
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
    const spawnX = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE + LANDER_SPAWN_LIGHT_ALIGNMENT_X
    const spawnZ = (Math.random() - 0.5) * 2 * SPAWN_POSITION_RANGE
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
      this.stateMachine?.trigger('die')
    }
    this.sceneManager.addToScene(this.playerController.group)

    // ── Multi-tool ──────────────────────────────────────────────
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)
    this.multiTool.setVisible(false)
    this.multiToolState = new MultiToolState(multiToolConfigJson as MultiToolConfig)

    // ── Projectile system + particles ───────────────────────────
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, this.heightmap)
    this.impactEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new Color(0xffaa44),
      size: 3,
      lifetime: 0.4,
      spread: 15,
      opacity: 0.8,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    this.projectileSystem.onImpact = (pos) => {
      const up = new Vector3(0, 1, 0)
      for (let i = 0; i < 8; i++) {
        this.impactEmitter!.emit(pos, up.clone().multiplyScalar(5))
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)

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

    // ── Start ───────────────────────────────────────────────────
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
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
  }

  private exitEva(): void {
    // Replenish O2 and stamina (back in lander, connected to life support)
    this.playerController!.replenish()

    // Hide EVA visuals
    this.playerController!.group.visible = false
    this.multiTool!.setVisible(false)

    // Unregister EVA tickables
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
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

  // ═══════════════════════════════════════════════════════════════
  // Exfil / Complete states
  // ═══════════════════════════════════════════════════════════════

  private enterExfil(): void {
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

    // Start reverse cutscene
    this.arrivalSequence!.playExfil(this.landerController!.group.position)

    this.arrivalSequence!.onFadeOut = (opacity) => {
      this.onArrivalFade?.(opacity)
    }
  }

  private enterComplete(): void {
    // Navigate to star map
    import('@/router').then(({ default: router }) => {
      router.push('/map')
    })
  }

  private restartLevel(): void {
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
      this.onArrivalFade?.(0)
      this.stateMachine.setState('lander' as LevelState)
    }

    if (this.stateMachine?.is('lander') && this.isLanderAdrift()) {
      this.failLanderRun('Adrift')
    }

    // F key → state triggers (only one can succeed per press)
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine && !this.landerDestroyed) {
      // Skip state-machine triggers if player is near a survey terminal (terminal handles F key)
      const nearTerminal = this.isPlayerNearSurveyTerminal()
      if (!nearTerminal) {
        if (!this.stateMachine.trigger('exfiltrate')) {
          if (!this.stateMachine.trigger('exitVehicle')) {
            this.stateMachine.trigger('enterVehicle')
          }
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
    this.tickSurveys(dt)

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

      if (lander) {
        const groundH = this.heightmap?.heightAt(lander.position.x, lander.position.z) ?? 0
        this.atmosphereCtx.landerAltitude = Math.max(0, lander.position.y - groundH)
        const engineFiring = lander.isMainEngineActive
        this.atmosphereCtx.landerThrust = engineFiring ? 1 : 0

        // Thrust vibration — strongest at liftoff, fades with altitude
        if (engineFiring && this.vehicleCamera) {
          const alt = this.atmosphereCtx.landerAltitude
          const altFade = 1 - Math.min(1, alt / THRUST_VIBRATION_FADE_ALT)
          const intensity = THRUST_VIBRATION_MIN + (THRUST_VIBRATION_MAX - THRUST_VIBRATION_MIN) * altFade * altFade
          this.vehicleCamera.shake(intensity, THRUST_VIBRATION_DURATION)
        }
        this.atmosphereCtx.landerVelocityY = lander.body.velocityY
        this.atmosphereCtx.landerGrounded = lander.body.grounded
        this.atmosphereCtx.landerPosition.copy(lander.position)
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

      this.onStateInfo?.({ state: currentState, grounded, canExfil })

      // Lander telemetry
      if (currentState === 'lander' && this.onLanderTelemetry && this.landerController) {
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
          surveyTimeRemaining: this.getActiveSurveyTimeRemaining(),
          surveyProbesCollected: this.getActiveSurveyProbesCollected(),
          surveyProbesTotal: this.getActiveSurveyProbesTotal(),
        })
        this.onPlayerPosition?.(this.landerController!.group.position.x, this.landerController!.group.position.z)
      }

      // FPS telemetry
      if (currentState === 'eva' && this.onFpsTelemetry && this.playerController) {
        const ts = this.playerController.thrusterSystem
        const headingRad = this.fpsCamera!.camera.rotation.y
        const playerPos = this.playerController.group.position
        const compassHeading = headingRadToCompassDeg(headingRad)
        const objectives: CompassObjective[] = this.missionObjectives.map((obj, i) => ({
          id: `obj-${i}`,
          label: obj.type.toUpperCase(),
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
  private tickEva(_dt: number): void {
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
      this.multiTool?.setState(
        this.playerController.speed,
        this.inputManager!.isActionActive('sprint'),
        this.playerController.grounded,
      )
    }
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


  /** Per-frame survey logic — timer countdown, probe collection, terminal interaction. */
  private tickSurveys(dt: number): void {
    const currentState = this.stateMachine?.state ?? ''

    for (const survey of this.surveyStates) {
      if (survey.status === 'delivered' || survey.status === 'failed') continue

      // Timer countdown when active
      if (survey.status === 'active') {
        survey.timeRemaining -= dt
        if (survey.timeRemaining <= 0) {
          survey.timeRemaining = 0
          survey.status = 'failed'
          continue
        }

        // Check probe collection while in lander
        if (currentState === 'lander' && this.landerController && survey.probeController) {
          survey.probeController.checkCollection(this.landerController.position)
        }
      }

      // Terminal interaction during EVA
      if (currentState === 'eva' && this.playerController) {
        const playerPos = this.playerController.group.position
        const termPos = survey.terminal.position
        const dx = playerPos.x - termPos.x
        const dz = playerPos.z - termPos.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist <= TERMINAL_INTERACT_RANGE) {
          if (survey.status === 'idle') {
            this.onTerminalPrompt?.('[F] BEGIN GRAVITOMETRIC SURVEY')
            if (this.inputManager?.wasActionPressed('interact')) {
              this.activateSurvey(survey)
            }
          } else if (survey.status === 'active' && survey.probeController?.allCollected) {
            this.onTerminalPrompt?.('[F] DELIVER CALIBRATION DATA')
            if (this.inputManager?.wasActionPressed('interact')) {
              survey.status = 'delivered'
              this.onTerminalPrompt?.(null)
              this.onObjectiveComplete?.(survey.objectiveIndex)
            }
          }
        }
      }
    }

    // Clear prompt if no terminal is in range
    if (currentState === 'eva' && this.playerController) {
      const nearAny = this.surveyStates.some((s) => {
        if (s.status === 'delivered' || s.status === 'failed') return false
        const playerPos = this.playerController!.group.position
        const dx = playerPos.x - s.terminal.position.x
        const dz = playerPos.z - s.terminal.position.z
        return Math.sqrt(dx * dx + dz * dz) <= TERMINAL_INTERACT_RANGE
      })
      if (!nearAny) this.onTerminalPrompt?.(null)
    }
  }

  /** Activate a survey — spawn probes, refuel lander, start timer. */
  private activateSurvey(survey: SurveyRuntimeState): void {
    const obj = this.missionObjectives[survey.objectiveIndex]!
    survey.status = 'active'
    survey.timeRemaining = obj.timeLimit ?? 90

    // Refuel the lander
    this.landerController?.thrusterSystem.refuel()

    // Generate and spawn probes
    const seed = hashSeed(this.mission!.id) + survey.objectiveIndex
    const probePositions = generateProbePositions(
      obj.probeCount ?? 5,
      obj.x,
      obj.z,
      seed,
    )
    // Convert to Three.js vectors and add ground height
    const positions = probePositions.map((p) => {
      const groundY = this.heightmap?.heightAt(p.x, p.z) ?? 0
      return new Vector3(p.x, groundY + p.y, p.z)
    })

    survey.probeController = new SurveyProbeController(this.sceneManager!.scene)
    survey.probeController.spawn(positions, survey.terminal.position)
    this.tickHandler!.register(survey.probeController, TICK_PRIORITY_PHYSICS + 4)

    this.onTerminalPrompt?.(null)
  }

  /** Get remaining time for the first active survey (null if none). */
  private getActiveSurveyTimeRemaining(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active ? active.timeRemaining : null
  }

  /** Get collected probes for the first active survey (null if none). */
  private getActiveSurveyProbesCollected(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active?.probeController ? active.probeController.collected : null
  }

  /** Get total probes for the first active survey (null if none). */
  private getActiveSurveyProbesTotal(): number | null {
    const active = this.surveyStates.find((s) => s.status === 'active')
    return active?.probeController ? active.probeController.total : null
  }

  /** Check if the EVA player is within interact range of any survey terminal. */
  private isPlayerNearSurveyTerminal(): boolean {
    if (!this.playerController || this.stateMachine?.state !== 'eva') return false
    const playerPos = this.playerController.group.position
    return this.surveyStates.some((s) => {
      if (s.status === 'delivered' || s.status === 'failed') return false
      const dx = playerPos.x - s.terminal.position.x
      const dz = playerPos.z - s.terminal.position.z
      return Math.sqrt(dx * dx + dz * dz) <= TERMINAL_INTERACT_RANGE
    })
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
  // Dispose
  // ═══════════════════════════════════════════════════════════════

  /** Tear down all systems and stop the game loop. */
  dispose(): void {
    DevConsole.unregister('LevelView')
    if (this.sceneManager) clearWaypointMarkers(this.sceneManager.scene)
    for (const survey of this.surveyStates) {
      survey.terminal.dispose()
      if (survey.probeController) {
        this.tickHandler?.unregister(survey.probeController)
        survey.probeController.dispose()
      }
    }
    this.surveyStates.length = 0
    this.gameLoop?.stop()
    this.teardownPointerLock()
    this.clearCollisionRegistrations()
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.arrivalSequence?.dispose()
    this.landerExplosion?.dispose()
    this.landerController?.dispose()
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
