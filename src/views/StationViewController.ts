/**
 * Bridges Vue lifecycle to the station-interior FPS scene.
 *
 * Loads the authored Yamada layout from `src/data/stations/yamada.json`,
 * builds the full station (rooms + corridors) via {@link buildStation},
 * and drives the entrance proximity prompts + interact callbacks.
 *
 * @author guinetik
 * @date 2026-05-13
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import type { Router } from 'vue-router'
import type { Tickable } from '@/lib/Tickable'
import { AmbientLight, Color, DirectionalLight, MathUtils, Vector3 } from 'three'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { buildMultiToolConfig } from '@/lib/fps/buildMultiToolConfig'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { WallImpactDecalPool } from '@/three/WallImpactDecalPool'
import type { MultiToolMode } from '@/lib/fps/multiToolState'
import { DevConsole } from '@/lib/devConsole'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS, HABITAT_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { StarFieldController } from '@/three/StarFieldController'
import { FpsCamera } from '@/three/FpsCamera'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import { FpsAudioDirector } from '@/audio/FpsAudioDirector'
import { StationAudioDirector } from '@/audio/StationAudioDirector'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { StationCollider, type StationRect } from '@/lib/station/StationCollider'
import { buildStation, type BuiltStation, type PropInteractor } from '@/three/StationBuilder'
import { computeDeathPresentationState, stepDamageFlash } from '@/lib/fps/fpsPresentation'
import { drawMazeCanvas } from '@/views/stationMazeCanvas'
import { getCurrentUpgradeValue } from '@/lib/upgrades'
import {
  syncTronHologramTimeSeconds,
  disposeTronHologramMaterials,
} from '@/three/tronHologramMaterial'
import type { PropInteractorMeta, PropStatus } from '@/three/stationProps'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { StationEntrance } from '@/three/StationEntrance'
import { loadStationLayout } from '@/lib/station/loadStationLayout'
import type { ExteriorSunSpec, StationLayout, StationTheme } from '@/lib/station/StationLayout'
import { createSunMesh, type SunMeshResult } from '@/three/meshes/createSunMesh'
import { SUN } from '@/lib/planets/catalog'
import { StationPostProcessing } from '@/three/atmosphere/StationPostProcessing'

/**
 * URL prefix where station-interior layouts are served as static JSON.
 * Files live under `public/data/stations/<stationId>.json` and are loaded
 * at runtime by {@link StationViewController.fetchLayout}.
 */
const STATION_LAYOUT_URL_PREFIX = '/data/stations'

/** Default visual theme when a station layout omits `theme`. */
const DEFAULT_STATION_THEME: StationTheme = 'station'
/** Theme-specific LUTs served from `public/`. */
const STATION_THEME_LUT_URLS: Readonly<Record<StationTheme, string>> = {
  station: '/station.CUBE',
  derelict: '/derelict.CUBE',
}

// ---------------------------------------------------------------------------
// Room layout constants.
// ---------------------------------------------------------------------------

/** Floor surface Y, used by the player collider. Matches the visible
 * top of the raised floor tiles in the room builder. */
const FLOOR_Y = 0.25
/**
 * Ceiling Y for projectile collision. Matches `WALL_HEIGHT` in
 * `StationBuilder.ts` plus a small margin so bolts grazing the actual
 * geometry still register as ceiling hits. Used to stop multitool bolts
 * that would otherwise fly out the open top of a half-cylinder room.
 */
const STATION_CEILING_Y = 3.2

/** Per-mode hex tints applied to wall-impact decals (matches bolt color). */
const WALL_DECAL_COLOR: Readonly<Record<MultiToolMode, number>> = {
  drill: 0x3b82f6,
  weapon: 0xff00ff,
  science: 0x22c55e,
}
/** Spawn yaw facing the exit hatch at the south end of the hub corridor. */
const SPAWN_YAW = Math.PI
/** Maximum distance for an entrance to show its interact prompt. */
const ENTRANCE_INTERACT_DISTANCE = 2.5

// ---------------------------------------------------------------------------
// Lighting constants.
// ---------------------------------------------------------------------------

/** Ambient light intensity. */
const AMBIENT_LIGHT_INTENSITY = 0.5
/** Directional fill light intensity. */
const DIR_LIGHT_INTENSITY = 0.8
/** Directional fill light height. */
const DIR_LIGHT_HEIGHT = 20
/** Directional fill light colour. */
const DIR_LIGHT_COLOR = 0xffffff

// ---------------------------------------------------------------------------
// Camera constants.
// ---------------------------------------------------------------------------

/**
 * Player eye height inside the station (world units).
 * Human-scale for indoor habitat scenes.
 */
const STATION_EYE_HEIGHT = 1.7
/** Maximum up/down pitch while auto-looking at station interactions. */
const STATION_PITCH_CLAMP = Math.PI / 3
/** Indoor movement scale applied to the FPS suit config for station interiors. */
const STATION_MOVEMENT_SPEED_SCALE = 0.175

/** Seconds between walking footsteps inside the station. */
const STATION_WALK_FOOTSTEP_INTERVAL = 0.65
/** Seconds between sprinting footsteps inside the station. */
const STATION_SPRINT_FOOTSTEP_INTERVAL = 0.46

/**
 * Per-second passive O2 drain inside a derelict station. The base FPS
 * config tunes this for outdoor EVA (0.2/s → ~8 min run). Derelicts are
 * meant to feel like a hostile leak — bumped above the outdoor rate so
 * the player can watch the bar fall and feel pressure to leave / find
 * a regen point. Halved from the original 1.5 because the procgen
 * puzzle adds dwell time the original test floor didn't have.
 *
 * The `suitO2Capacity` upgrade flows through twice: once via
 * {@link buildFpsPlayerConfig} (bigger tank), and again here (we scale
 * the drain down by the upgrade), so investing in O2 pays double
 * dividends in hazard rooms.
 */
const STATION_O2_DRAIN_PER_SECOND = 0.75
/** Lerp factor per second for turning the camera toward an interacted station door. */
const DOOR_CAMERA_TURN_RATE = 6
/** Seconds the door-look sequence owns camera yaw/pitch after F is pressed. */
const DOOR_CAMERA_TURN_DURATION_S = 0.55
/** Vertical offset from the door anchor used as the look-at point. */
const DOOR_LOOK_TARGET_Y_OFFSET = STATION_EYE_HEIGHT

/**
 * HP per second drained by lava-floor tiles. Tuned high so the player
 * dies within a fraction of a second of stepping in — "absurd damage"
 * is the point: stations are dangerous and the player learns to read
 * the floor before walking onto it.
 */
const LAVA_DAMAGE_PER_SECOND = 75

/** Seconds the red damage vignette stays at full opacity before decaying. */
const DAMAGE_FLASH_DURATION = 0.3

/** Speed the camera tilts down (rad/s) during the death animation. */
const DEATH_PITCH_SPEED = 1.2
/** Final camera pitch when the death animation settles (~80° down). */
const DEATH_PITCH_TARGET = -1.4
/** Seconds for the death black-fade to reach full opacity. */
const DEATH_FADE_DURATION = 2.0
/** Seconds after death before the YOU DIED + REWIND overlay appears. */
const DEATH_MESSAGE_DELAY = 1.5

// ---------------------------------------------------------------------------
// Tick priority offsets.
// ---------------------------------------------------------------------------

/** Pre-render tick offset for per-frame logic + hatch. */
const TICK_OFFSET_PRE_RENDER = 1
/** Camera tick offset — just before the renderer. */
const TICK_OFFSET_CAMERA = 2

// ---------------------------------------------------------------------------
// Starfield constants.
// ---------------------------------------------------------------------------

/**
 * Star count used inside station interiors. The open-shuttle default (3000)
 * spreads stars over the whole celestial sphere, but stations view space
 * through small window apertures — a typical pane only covers ~1–2 % of the
 * sky, so only a few dozen stars land inside it and the window reads as
 * empty. Packing the sphere ~10× denser puts hundreds of stars in each
 * aperture without any per-window placement logic.
 */
const STATION_STAR_COUNT = 9000

/**
 * Point size (in pixels) for station-interior stars. Bumped above the
 * default so single stars remain readable on high-DPI displays when filtered
 * by a small window cutout.
 */
const STATION_STAR_SIZE = 4

/**
 * Radius of the station's celestial sphere. Must sit inside the FPS camera's
 * `far` clip (5000 in {@link FpsCamera}) — the default `StarFieldController`
 * radius of 10000 puts every star past the far plane, producing inconsistent
 * clipping artefacts. Stations are small (the player drifts at most ~20 m
 * from the centre), so a 2 km sphere is still far enough that parallax is
 * imperceptible while staying well clear of the far plane.
 */
const STATION_STAR_RADIUS = 2000

/**
 * Vue lifecycle bridge for the `/station` route.
 */
export class StationViewController implements Tickable {
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private station: BuiltStation | null = null
  private stationCollider: StationCollider | null = null
  private postProcessing: StationPostProcessing | null = null
  /** Multitool view-model GLB attached to the FPS camera. */
  private multiTool: MultiToolController | null = null
  /** Multitool mode + RTG state machine (pure TS). */
  private multiToolState: MultiToolState | null = null
  /** Bolt projectiles + station wall/floor/ceiling collision. */
  private projectileSystem: ProjectileSystem | null = null
  /** Orange spark burst played when a bolt detonates on a wall, floor, or prop. */
  private impactEmitter: ParticleEmitter | null = null
  /** Wall-aligned glow decals stamped at each projectile impact. */
  private wallImpactDecals: WallImpactDecalPool | null = null
  /** Reused upward velocity scratch for impact-emitter spawns. */
  private readonly _impactUp = new Vector3(0, 1, 0)
  /** Reused emit-velocity scratch for impact-emitter spawns. */
  private readonly _impactVel = new Vector3()
  private spawnPos: Vector3 = new Vector3()
  private starfield: StarFieldController | null = null
  private exteriorSun: SunMeshResult | null = null
  /** Sim time accumulated for the exterior sun's shader uniforms. */
  private exteriorSunTime = 0
  /** Sim time accumulated for the TRON hologram tile markers. */
  private hologramTime = 0
  /** Seconds left before the active peek-terminal map clears. `0` = idle. */
  private mazePeekRemaining = 0
  /** Interactor event id whose terminal is currently displaying a map. */
  private mazePeekTerminalEvent: string | null = null
  /** Lazily-created canvas reused across map peeks (one per controller). */
  private mazePeekCanvas: HTMLCanvasElement | null = null
  /**
   * Audio director constructed with the `'habitat'` footstep surface so
   * step recipes + cadence match the `/habitat` scene's hard-floor feel.
   * `FpsAudioDirector` already owns its own `FootstepSystem` and ticks
   * it from `update(dt, state)`; rolling our own here would double-fire.
   */
  private readonly fpsAudio = new FpsAudioDirector('habitat')
  /** Station-scoped audio: ambiance, door whooshes, terminal beep, lava SFX. */
  private readonly stationAudio = new StationAudioDirector()
  /** True last tick we were inside a hazard rect — handed to the audio director. */
  private inHazardThisFrame = false
  private readonly pointerLock = new FpsPointerLockSession()
  private router: Router | null = null
  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null
  /** Prompt callback driven by entrance proximity. `null` clears the HUD. */
  onPrompt: ((prompt: string | null) => void) | null = null
  /** Per-tick player telemetry for the HUD (HP / O2 / STA bars). */
  onFpsTelemetry: ((telemetry: FpsTelemetry) => void) | null = null
  /**
   * Fires when the closest in-range prop interactor changes. The UI uses
   * this to render previews (e.g. "DRILLBITS x 20" above the F prompt
   * when looking at a chest) without having to poll.
   */
  onActiveInteractorMeta: ((meta: PropInteractorMeta | null) => void) | null = null
  /** Interact callback fired when the player presses F near an entrance. */
  onInteract: ((event: string) => void) | null = null
  /** Per-tick red-vignette opacity for the damage HUD. */
  onDamageFlash: ((opacity: number) => void) | null = null
  /** Fired once when the player's HP reaches zero. */
  onPlayerDeath: (() => void) | null = null
  /** Black death-fade opacity per tick (0 → 1 over `DEATH_FADE_DURATION`). */
  onDeathFade: ((opacity: number) => void) | null = null
  /** Toggles the YOU DIED message + REWIND overlay after the message delay. */
  onDeathMessage: ((visible: boolean) => void) | null = null
  /** Scratch vector reused for the per-frame entrance proximity check. */
  private readonly _proximityScratch = new Vector3()
  /** World-space look-at target for the active door interaction camera turn. */
  private readonly _doorLookTarget = new Vector3()
  /** Cached prompt text so we only fire `onPrompt` when it changes. */
  private currentPrompt: string | null = null
  private currentInteractorMeta: PropInteractorMeta | null = null
  /** Seconds the red vignette has left before decaying back to zero. */
  private damageFlashTimer = 0
  /** Seconds since the player's HP hit zero; drives the death animation. */
  private deathStateTime = 0
  /** Player X last frame — used to compute realised speed for the audio dir. */
  private lastFootstepX = 0
  /** Player Z last frame. */
  private lastFootstepZ = 0
  /** True once `lastFootstep{X,Z}` have been seeded (skip the first frame's huge delta). */
  private footstepBaselineCaptured = false
  /** Player HP from the previous tick — detects damage between frames. */
  private lastHp: number | null = null
  /** True once `onDeathMessage(true)` has fired (so we don't refire each tick). */
  private deathMessageShown = false
  /** True while the camera is smoothly turning toward the interacted door. */
  private doorLookSequenceActive = false
  /** Seconds elapsed in the current door-look sequence. */
  private doorLookSequenceTime = 0

  /**
   * Mount the scene into the given container.
   *
   * @param container - HTML element to render into.
   * @param stationId - Layout id to fetch (`<stationId>.json` under `/data/stations/`).
   * @param router - Vue router used to navigate back to `/` on exit.
   */
  async init(container: HTMLElement, stationId: string, router: Router): Promise<void> {
    this.router = router

    const config = buildFpsPlayerConfig()
    config.camera = { ...config.camera, eyeHeight: STATION_EYE_HEIGHT }
    config.movement = {
      ...config.movement,
      moveThrust: config.movement.moveThrust * STATION_MOVEMENT_SPEED_SCALE,
      maxSpeed: config.movement.maxSpeed * STATION_MOVEMENT_SPEED_SCALE,
      maxSprintSpeed: config.movement.maxSprintSpeed * STATION_MOVEMENT_SPEED_SCALE,
    }
    const o2Upgrade = Math.max(1e-3, getCurrentUpgradeValue('suitO2Capacity'))
    config.o2 = { ...config.o2, baseDrainRate: STATION_O2_DRAIN_PER_SECOND / o2Upgrade }

    // Merge FPS movement (WASD + jump + sprint + tools) with habitat's
    // F-key interact binding so the entrance prompt can fire.
    this.inputManager = new InputManager({ ...FPS_BINDINGS, ...HABITAT_BINDINGS })
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Whole station from the authored layout fetched by id.
    const layout = await this.fetchLayout(stationId)
    this.station = await buildStation(layout)
    this.sceneManager.addToScene(this.station.group)

    // Spawn at the hub corridor's origin (Yamada places it at world XZ = 0).
    this.spawnPos.set(0, FLOOR_Y, 0)

    // Lighting.
    const ambient = new AmbientLight(new Color(DIR_LIGHT_COLOR), AMBIENT_LIGHT_INTENSITY)
    const dir = new DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    dir.position.set(0, DIR_LIGHT_HEIGHT, 0)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(dir)

    // Dense starfield — stations view the sky through small window cutouts,
    // so we pack the sphere ~10× denser than the open-shuttle default. Radius
    // is shrunk to stay well inside the FPS camera's far plane.
    this.starfield = new StarFieldController({
      count: STATION_STAR_COUNT,
      size: STATION_STAR_SIZE,
      radius: STATION_STAR_RADIUS,
    })
    this.sceneManager.addToScene(this.starfield.points)

    // Optional exterior sun parked behind a station window.
    if (layout.exteriorSun) {
      this.mountExteriorSun(layout.exteriorSun)
    }

    for (const entrance of this.station.entrances) {
      entrance.onCloseStart = () => this.stationAudio.notifyDoorClose()
    }

    const collider = new StationCollider(this.station.floors, this.station.passages)
    this.stationCollider = collider
    this.updateDoorBlockers()

    // Camera + player.
    this.fpsCamera = new FpsCamera(config.camera)
    this.fpsCamera.yaw = SPAWN_YAW
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      collider,
    )
    this.playerController.jumpEnabled = false
    this.playerController.onDeath = () => {
      this.deathStateTime = 0
      this.deathMessageShown = false
      // Silence breathing + active loops on death — corpses don't pant.
      this.fpsAudio.stop()
      this.stationAudio.stopHazard()
      this.inHazardThisFrame = false
      this.clearMazePeek()
      this.onPlayerDeath?.()
    }
    this.playerController.group.position.copy(this.spawnPos)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)
    this.postProcessing = new StationPostProcessing(
      this.sceneManager.renderer,
      this.sceneManager.scene,
      this.fpsCamera.camera,
      { lutUrl: this.getStationLutUrl(layout) },
    )
    this.sceneManager.renderOverride = () => this.postProcessing?.render()
    this.sceneManager.onResizeCallback = (width, height) =>
      this.postProcessing?.resize(width, height)

    // Multitool: GLB view-model, RTG state, projectile system. The
    // projectile system reuses the station collider for wall/door/prop
    // collisions — same AABB union the player capsule uses — and the
    // FLOOR_Y + STATION_CEILING_Y bracket catches bolts angled at the
    // floor or out through the open top of the half-cylinder roof.
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)
    this.multiToolState = new MultiToolState(buildMultiToolConfig())
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, null)
    this.projectileSystem.setStationCollider(this.stationCollider, FLOOR_Y, STATION_CEILING_Y)
    this.projectileSystem.prewarmPool()
    this.impactEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new Color(0xffaa44),
      size: 6.5,
      lifetime: 0.6,
      spread: 12,
      opacity: 1,
      soft: true,
      sizeGrowth: 1.55,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    this.wallImpactDecals = new WallImpactDecalPool(this.sceneManager.scene)
    this.projectileSystem.onImpact = (pos, context) => {
      for (let i = 0; i < 8; i++) {
        this._impactVel.copy(this._impactUp).multiplyScalar(5)
        this.impactEmitter!.emit(pos, this._impactVel)
      }
      if (context.normal) {
        this.wallImpactDecals!.spawn(pos, context.normal, WALL_DECAL_COLOR[context.boltKind])
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)

    // Tick order.
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this.multiToolState, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler.register(this.projectileSystem, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler.register(this.impactEmitter, TICK_PRIORITY_PHYSICS + 3)
    this.tickHandler.register(this.wallImpactDecals, TICK_PRIORITY_PHYSICS + 4)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - TICK_OFFSET_PRE_RENDER)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - TICK_OFFSET_CAMERA)
    this.tickHandler.register(this.multiTool, TICK_PRIORITY_RENDER - TICK_OFFSET_CAMERA + 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    this.setupPointerLock()

    DevConsole.register('StationView', {
      openDirect: (id = 'yamada-titania') => {
        void this.router?.push(`/station?station=${id}&dev=true`)
      },
    })

    this.fpsAudio.setFootstepIntervals(
      STATION_WALK_FOOTSTEP_INTERVAL,
      STATION_SPRINT_FOOTSTEP_INTERVAL,
    )
    this.fpsAudio.start()
    this.stationAudio.start()
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  /**
   * Per-frame audio director update + entrance proximity check.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (!this.playerController) return

    this.updateEntrancePrompt(dt)
    this.tickDoorLookSequence(dt)
    this.tickExteriorSun(dt)
    this.tickHologramMaterials(dt)
    this.tickMazePeek(dt)
    this.tickHazards(dt)
    this.tickPassiveDamage(dt)
    this.tickDamageFlash(dt)
    this.tickDeathPresentation(dt)
    this.tickMultiTool()
    this.emitFpsTelemetry()

    // Realised speed = actual displacement / dt. Using this instead of
    // `playerController.speed` (commanded velocity) means walking into a
    // wall produces zero displacement → falls below the audio director's
    // MIN_MOVE_SPEED threshold → no phantom footsteps. Same gating
    // problem exists in `/habitat`; views consuming FpsPlayerController
    // should prefer realised speed for any movement-driven SFX.
    const pos = this.playerController.group.position
    let realisedSpeed = 0
    if (this.footstepBaselineCaptured && dt > 0) {
      const dx = pos.x - this.lastFootstepX
      const dz = pos.z - this.lastFootstepZ
      realisedSpeed = Math.sqrt(dx * dx + dz * dz) / dt
    }
    this.lastFootstepX = pos.x
    this.lastFootstepZ = pos.z
    this.footstepBaselineCaptured = true

    this.fpsAudio.update(dt, {
      grounded: this.playerController.grounded,
      sprinting: this.playerController.isSprinting,
      speed: realisedSpeed,
      hovering: false,
      o2Level: this.playerController.o2Level,
      o2Capacity: this.playerController.o2Capacity,
    })
    this.stationAudio.update(dt, { inHazard: this.inHazardThisFrame })
  }

  /**
   * Per-frame: advance door animations, find the closest entrance within
   * range, drive {@link onPrompt}, and trigger the open animation on F.
   * The interact event is deferred until the door finishes opening so the
   * player sees a brief egress beat before any scene swap.
   *
   * @param dt - Frame delta in seconds.
   */
  private updateEntrancePrompt(dt: number): void {
    if (!this.station || !this.playerController || !this.inputManager) return

    const pos = this.playerController.group.position
    for (const entrance of this.station.entrances) entrance.tick(dt, pos)
    for (const prop of this.station.props) prop.tick?.(dt)
    this.updateDoorBlockers()

    let activePrompt: string | null = null
    let activeEntrance: StationEntrance | null = null
    let activeInteractor: PropInteractor | null = null
    let bestDistSq = ENTRANCE_INTERACT_DISTANCE * ENTRANCE_INTERACT_DISTANCE

    for (const entrance of this.station.entrances) {
      if (entrance.isOpening || entrance.isOpened) continue
      this._proximityScratch.copy(entrance.anchor)
      this._proximityScratch.y = pos.y
      const distSq = this._proximityScratch.distanceToSquared(pos)
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        activePrompt = entrance.promptFor(pos)
        activeEntrance = entrance
        activeInteractor = null
      }
    }

    for (const interactor of this.station.interactors) {
      if (interactor.disabled) continue
      this._proximityScratch.copy(interactor.anchor)
      this._proximityScratch.y = pos.y
      const distSq = this._proximityScratch.distanceToSquared(pos)
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        activePrompt = interactor.prompt
        activeEntrance = null
        activeInteractor = interactor
      }
    }

    if (activePrompt !== this.currentPrompt) {
      this.currentPrompt = activePrompt
      this.onPrompt?.(activePrompt)
    }

    const nextMeta = activeInteractor?.meta ?? null
    if (nextMeta !== this.currentInteractorMeta) {
      this.currentInteractorMeta = nextMeta
      this.onActiveInteractorMeta?.(nextMeta)
    }

    if (this.inputManager.wasActionPressed('interact')) {
      if (activeInteractor) {
        // Hide prompt + briefly look at the interactable so the player
        // sees the screen colour change land.
        if (this.currentPrompt !== null) {
          this.currentPrompt = null
          this.onPrompt?.(null)
        }
        this.stationAudio.notifyTerminalInteract()
        this.startDoorLookSequence(activeInteractor.anchor)
        this.onInteract?.(activeInteractor.event)
      } else if (activeEntrance) {
        if (activeEntrance.locked) {
          // Locked: surface the event so future systems (keycard checks,
          // SFX, etc.) can react, but skip the door-look + open animation.
          this.onInteract?.(activeEntrance.event)
        } else {
          const event = activeEntrance.event
          // Hide the prompt the moment the door starts moving.
          if (this.currentPrompt !== null) {
            this.currentPrompt = null
            this.onPrompt?.(null)
          }
          this.stationAudio.notifyDoorOpen()
          this.startDoorLookSequence(activeEntrance.anchor)
          activeEntrance.triggerOpen(pos, () => this.onInteract?.(event))
          this.updateDoorBlockers()
        }
      }
    }
  }

  /**
   * Mark a prop interactor as consumed and update its prop's visual
   * status. Used by the UI layer to one-shot terminals after they
   * dispense a keycard, fire a minigame, etc. No-op if no interactor
   * with the given event id exists.
   *
   * @param event - Event id used to find the interactor.
   * @param status - Visual status to apply to the prop. Defaults to
   *   `'success'` (green screen on a terminal).
   */
  /**
   * Find a prop interactor by event id. Used by the UI to read loot
   * metadata, inspect the disabled state, etc.
   *
   * @param event - Event id to look up.
   * @returns The matching interactor, or `null` if none.
   */
  findInteractorByEvent(event: string): PropInteractor | null {
    if (!this.station) return null
    for (const interactor of this.station.interactors) {
      if (interactor.event === event) return interactor
    }
    return null
  }

  consumeInteractor(event: string, status: PropStatus = 'success'): void {
    if (!this.station) return
    for (const interactor of this.station.interactors) {
      if (interactor.event !== event || interactor.disabled) continue
      interactor.disabled = true
      interactor.prop.setStatus?.(status)
    }
  }

  /**
   * Re-enable a previously consumed prop interactor and restore its
   * visual status. Used by death-restart flows where a one-shot pickup
   * is rolled back, so the station prop must become usable again in the
   * same scene instance.
   *
   * @param event - Event id used to find the interactor.
   * @param status - Visual status to apply to the prop. Defaults to `'idle'`.
   */
  resetInteractor(event: string, status: PropStatus = 'idle'): void {
    if (!this.station) return
    for (const interactor of this.station.interactors) {
      if (interactor.event !== event) continue
      interactor.disabled = false
      interactor.prop.setStatus?.(status)
    }
  }

  /**
   * Find the entrance owning the given event id. Used by the UI layer
   * to toggle locked state or swap prompts when an inventory condition
   * changes (e.g. the player picks up a keycard).
   *
   * @param event - Entrance event id to match.
   * @returns The matching entrance, or `null` if none found.
   */
  findEntrance(event: string): StationEntrance | null {
    if (!this.station) return null
    for (const entrance of this.station.entrances) {
      if (entrance.event === event) return entrance
    }
    return null
  }

  /**
   * Unlock a previously locked entrance and immediately play the open
   * animation. The interact event still fires through `onInteract` once
   * the door reaches its open angle, so the caller's existing event
   * handler runs for the "post-unlock" path as well as the normal one.
   *
   * No-op when the entrance is not found, not locked, or mid-animation.
   *
   * @param event - Entrance event id to unlock.
   * @returns `true` if the entrance was unlocked + opened this call.
   */
  unlockAndOpenEntrance(event: string): boolean {
    if (!this.playerController) return false
    const entrance = this.findEntrance(event)
    if (!entrance || !entrance.locked) return false
    entrance.locked = false
    const pos = this.playerController.group.position
    this.stationAudio.notifyDoorOpen()
    this.startDoorLookSequence(entrance.anchor)
    entrance.triggerOpen(pos, () => this.onInteract?.(event))
    this.updateDoorBlockers()
    if (this.currentPrompt !== null) {
      this.currentPrompt = null
      this.onPrompt?.(null)
    }
    return true
  }

  /**
   * Start a short camera turn toward the world-space anchor of whatever
   * the player just interacted with (door entrance or prop).
   *
   * @param anchor - World-space XYZ of the interaction target.
   */
  private startDoorLookSequence(anchor: Vector3): void {
    this._doorLookTarget.copy(anchor)
    this._doorLookTarget.y = FLOOR_Y + DOOR_LOOK_TARGET_Y_OFFSET
    this.doorLookSequenceActive = true
    this.doorLookSequenceTime = 0
  }

  /**
   * Advance the door-look camera turn.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickDoorLookSequence(dt: number): void {
    if (!this.doorLookSequenceActive || !this.fpsCamera) return
    this.doorLookSequenceTime += dt

    const cam = this.fpsCamera.camera
    const dx = this._doorLookTarget.x - cam.position.x
    const dy = this._doorLookTarget.y - cam.position.y
    const dz = this._doorLookTarget.z - cam.position.z
    const horiz = Math.hypot(dx, dz)
    if (horiz > 1e-5) {
      const desiredYaw = Math.atan2(-dx, -dz)
      const desiredPitch = MathUtils.clamp(
        Math.atan2(dy, horiz),
        -STATION_PITCH_CLAMP,
        STATION_PITCH_CLAMP,
      )
      const k = Math.min(1, DOOR_CAMERA_TURN_RATE * dt)
      let yawErr = desiredYaw - this.fpsCamera.yaw
      while (yawErr > Math.PI) yawErr -= Math.PI * 2
      while (yawErr < -Math.PI) yawErr += Math.PI * 2
      this.fpsCamera.yaw += yawErr * k
      this.fpsCamera.pitch += (desiredPitch - this.fpsCamera.pitch) * k
      this.fpsCamera.pitch = MathUtils.clamp(
        this.fpsCamera.pitch,
        -STATION_PITCH_CLAMP,
        STATION_PITCH_CLAMP,
      )
    }

    if (this.doorLookSequenceTime >= DOOR_CAMERA_TURN_DURATION_S) {
      this.doorLookSequenceActive = false
    }
  }

  /**
   * Build and add the exterior sun mesh at the layout-specified position.
   * The sun's point light is muted because interior lighting is already
   * driven by ambient + directional; we only want the visual disk so the
   * player can see it through the station's windows.
   *
   * @param spec - Authored exterior-sun position + scale.
   */
  private mountExteriorSun(spec: ExteriorSunSpec): void {
    if (!this.sceneManager) return
    const result = createSunMesh(SUN)
    result.group.position.set(spec.pos[0], spec.pos[1], spec.pos[2])
    result.group.scale.setScalar(spec.scale)
    // Habitat pattern: keep the sun's own point light off so we do not
    // double-up on the interior lighting rig.
    result.light.intensity = 0
    this.sceneManager.addToScene(result.group)
    this.exteriorSun = result
  }

  /**
   * Fetch the station layout JSON for the given id from `public/data/stations/`
   * and validate it via {@link loadStationLayout}.
   *
   * @param stationId - Layout id (`<stationId>.json`).
   * @returns A validated {@link StationLayout}.
   * @throws If the fetch fails or the JSON does not pass layout validation.
   */
  private async fetchLayout(stationId: string): Promise<StationLayout> {
    const url = `${STATION_LAYOUT_URL_PREFIX}/${stationId}.json`
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(
        `Failed to load station layout "${stationId}" from ${url}: ${res.status} ${res.statusText}`,
      )
    }
    const raw: unknown = await res.json()
    return loadStationLayout(raw)
  }

  /**
   * Resolve the LUT URL for the loaded station layout's visual theme.
   *
   * @param layout - Loaded station layout.
   * @returns Public URL for the theme grade.
   */
  private getStationLutUrl(layout: StationLayout): string {
    return STATION_THEME_LUT_URLS[layout.theme ?? DEFAULT_STATION_THEME]
  }

  /**
   * Advance the exterior sun's shader uniforms by one frame. No-op when no
   * sun was mounted. Both the star and corona shaders share `uTime`.
   *
   * @param dt - Frame delta in seconds.
   */
  private tickExteriorSun(dt: number): void {
    const sun = this.exteriorSun
    if (!sun) return
    this.exteriorSunTime += dt
    const uTime = sun.uniforms.uTime
    if (uTime) uTime.value = this.exteriorSunTime
    const coronaUTime = sun.coronaUniforms.uTime
    if (coronaUTime) coronaUTime.value = this.exteriorSunTime
  }

  /**
   * Push a frozen {@link FpsTelemetry} snapshot to {@link onFpsTelemetry}.
   * Mode/RTG/objective fields are stubbed because the station view
   * doesn't run combat or compass — the `'station'` HUD variant hides
   * those panels.
   */
  private emitFpsTelemetry(): void {
    if (!this.onFpsTelemetry || !this.playerController || !this.fpsCamera) return
    const ms = this.multiToolState
    this.onFpsTelemetry({
      hp: this.playerController.hp,
      maxHp: this.playerController.maxHp,
      o2Level: this.playerController.o2Level,
      o2Capacity: this.playerController.o2Capacity,
      sprintCharge: this.playerController.sprintCharge,
      sprintCapacity: this.playerController.sprintCapacity,
      speed: this.playerController.speed,
      grounded: this.playerController.grounded,
      activeMode: ms?.mode ?? 'science',
      aiming: ms?.aiming ?? false,
      isFiring: ms?.isFiring ?? false,
      rtgLevel: ms?.rtgLevel ?? 0,
      rtgCapacity: ms?.rtgCapacity ?? 1,
      modeCharge: ms?.modeCharge ?? 0,
      modeCapacity: ms?.modeChargeCapacity ?? 1,
      headingRad: this.fpsCamera.yaw,
      objectives: [],
    })
  }

  /**
   * Apply lava-floor tick damage when the player's footprint sits inside
   * any hazard rect. Fires the grunt SFX (rate-limited at the manifest
   * level), kicks the damage-flash timer, and forwards the death event
   * via `onPlayerDeath`. No-op when the player is dead or off-station.
   */
  private tickHazards(dt: number): void {
    if (!this.station || !this.playerController) return
    if (this.playerController.isDead) {
      this.inHazardThisFrame = false
      this.hideAllHazardMarkers()
      return
    }
    const pos = this.playerController.group.position
    let inHazard = false
    let activeMarker: import('three').Mesh | null = null
    for (const hazard of this.station.hazards) {
      const r = hazard.rect
      if (pos.x < r.minX || pos.x > r.maxX || pos.z < r.minZ || pos.z > r.maxZ) continue
      inHazard = true
      activeMarker = hazard.marker
      this.playerController.takeDamage(LAVA_DAMAGE_PER_SECOND * dt)
      this.fpsAudio.notifyHazardDamage()
      this.damageFlashTimer = DAMAGE_FLASH_DURATION
      break
    }
    for (const hazard of this.station.hazards) {
      const isActive = hazard.marker !== null && hazard.marker === activeMarker
      if (hazard.marker) hazard.marker.visible = isActive
      // Hide the blue secure overlay on the tile the player is
      // currently burning on so the red flash isn't muddied by the
      // underlying additive blue layer.
      if (hazard.secureMarker) hazard.secureMarker.visible = !isActive
    }
    this.inHazardThisFrame = inHazard
  }

  /** Push the per-frame time uniform into every station hologram material. */
  private tickHologramMaterials(dt: number): void {
    if (!this.station || this.station.hologramMaterials.length === 0) return
    this.hologramTime += dt
    syncTronHologramTimeSeconds(this.station.hologramMaterials, this.hologramTime)
  }

  /**
   * Show the planned tile layout for `mazeRoomId` on the prop that owns
   * `terminalEvent`. The map stays visible for `durationS` seconds then
   * clears automatically. Re-calling while a peek is active resets the
   * timer so the player can hold the interact key to keep looking.
   *
   * No-op when the interactor or maze map can't be resolved — that's
   * the safe default for authoring typos (the F prompt still fires its
   * event, the puzzle just doesn't display).
   *
   * @param terminalEvent - Event id of the peek terminal's interactor.
   * @param mazeRoomId - Room id whose `MazeMap` should be rendered.
   * @param durationS - Seconds the map remains visible.
   */
  peekMazeOnTerminal(terminalEvent: string, mazeRoomId: string, durationS: number): void {
    if (!this.station) return
    const interactor = this.findInteractorByEvent(terminalEvent)
    if (!interactor || !interactor.prop.showMap) return
    const maze = this.station.mazeMaps.get(mazeRoomId)
    if (!maze) return
    if (!this.mazePeekCanvas) this.mazePeekCanvas = document.createElement('canvas')
    drawMazeCanvas(this.mazePeekCanvas, maze)
    interactor.prop.showMap(this.mazePeekCanvas)
    this.mazePeekTerminalEvent = terminalEvent
    this.mazePeekRemaining = durationS
  }

  /** Force-clear any active maze peek (death, view dispose, etc.). */
  private clearMazePeek(): void {
    if (!this.mazePeekTerminalEvent) return
    const interactor = this.findInteractorByEvent(this.mazePeekTerminalEvent)
    interactor?.prop.hideMap?.()
    this.mazePeekTerminalEvent = null
    this.mazePeekRemaining = 0
  }

  /** Count down the active map peek and clear it when the timer runs out. */
  private tickMazePeek(dt: number): void {
    if (!this.mazePeekTerminalEvent || this.mazePeekRemaining <= 0) return
    this.mazePeekRemaining -= dt
    if (this.mazePeekRemaining <= 0) this.clearMazePeek()
  }

  /** Force every lava-tile glow marker off (used on death). */
  private hideAllHazardMarkers(): void {
    if (!this.station) return
    for (const hazard of this.station.hazards) {
      if (hazard.marker) hazard.marker.visible = false
      if (hazard.secureMarker) hazard.secureMarker.visible = true
    }
  }

  /**
   * Detect damage applied to the player from sources outside the
   * controller's own logic (currently: hypoxia damage when O2 hits 0,
   * triggered by `FpsPlayerController.tick`). Fires the same grunt SFX
   * + red vignette the lava path uses, so the player gets unmissable
   * feedback that the suit is killing them.
   */
  private tickPassiveDamage(_dt: number): void {
    if (!this.playerController) return
    const hp = this.playerController.hp
    if (this.lastHp !== null && hp < this.lastHp - 1e-3) {
      // Already covered by the lava path's own SFX/flash when applicable
      // — but it's idempotent enough that a redundant call is fine.
      this.fpsAudio.notifyHazardDamage()
      this.damageFlashTimer = DAMAGE_FLASH_DURATION
    }
    this.lastHp = hp
  }

  /** Decay the red-vignette overlay each frame and broadcast its opacity. */
  private tickDamageFlash(dt: number): void {
    const flash = stepDamageFlash(this.damageFlashTimer, dt, DAMAGE_FLASH_DURATION)
    this.damageFlashTimer = flash.timer
    this.onDamageFlash?.(flash.opacity)
  }

  /**
   * Drive the death cinematic — camera pitches down, screen fades to
   * black, the YOU DIED message appears after a delay. No-op while the
   * player is alive.
   */
  private tickDeathPresentation(dt: number): void {
    if (!this.playerController || !this.fpsCamera || !this.playerController.isDead) return
    this.deathStateTime += dt
    const state = computeDeathPresentationState(
      this.fpsCamera.pitch,
      dt,
      this.deathStateTime,
      DEATH_PITCH_SPEED,
      DEATH_PITCH_TARGET,
      DEATH_FADE_DURATION,
      DEATH_MESSAGE_DELAY,
    )
    this.fpsCamera.pitch = state.pitch
    this.onDeathFade?.(state.fadeOpacity)
    if (state.showMessage && !this.deathMessageShown) {
      this.deathMessageShown = true
      this.onDeathMessage?.(true)
    }
  }

  /**
   * Drive the multitool: keys 1/2/3 swap mode, RMB aims, LMB fires.
   * Mirrors the `tickEva` block in `LevelViewController.ts`. Skipped
   * while the player is dead so weapon SFX don't fire over the death
   * fade and the trigger state can't carry across a restart.
   */
  private tickMultiTool(): void {
    if (
      !this.inputManager ||
      !this.multiToolState ||
      !this.multiTool ||
      !this.playerController ||
      !this.fpsCamera
    ) {
      return
    }
    if (this.playerController.isDead) return

    if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
    if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
    if (this.inputManager.wasActionPressed('toolScience')) this.multiToolState.setMode('science')

    this.multiToolState.setAiming(this.pointerLock.isRightMouseDown)
    this.multiToolState.setInput(
      this.pointerLock.isLeftMouseDown,
      this.pointerLock.consumeLeftMouseJustPressed(),
    )
    this.multiToolState.setSpeed(this.playerController.speed)

    this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
    this.multiTool.setAiming(this.multiToolState.aiming)
    this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
    this.multiTool.setModeChargeLevel(
      this.multiToolState.modeCharge / this.multiToolState.modeChargeCapacity,
    )
    this.multiTool.setState(
      this.playerController.speed,
      this.playerController.isSprinting,
      this.playerController.grounded,
    )

    if (this.multiToolState.isFiring) this.multiTool.fire()

    const ads = this.multiToolState.adsConfig
    this.fpsCamera.setAiming(this.multiToolState.aiming, ads.fovMultiplier, ads.zoomSpeed)
  }

  /**
   * Reset the player after a death: refill HP / O2 / stamina, teleport
   * back to the station spawn at world origin, and clear the damage
   * flash so the next visit starts clean. The inventory rollback is
   * owned by the Vue layer (it holds the snapshot taken at mount).
   */
  restart(): void {
    if (!this.playerController) return
    this.playerController.replenish()
    this.playerController.group.position.copy(this.spawnPos)
    if (this.fpsCamera) this.fpsCamera.pitch = 0
    this.damageFlashTimer = 0
    this.deathStateTime = 0
    this.deathMessageShown = false
    this.footstepBaselineCaptured = false
    this.lastHp = null
    this.stationAudio.stopHazard()
    this.inHazardThisFrame = false
    this.clearMazePeek()
    // Bring breathing + footstep loops back online for the new run.
    this.fpsAudio.start()
    this.onDamageFlash?.(0)
    this.onDeathFade?.(0)
    this.onDeathMessage?.(false)
  }

  /** Refresh door collision blockers from the current entrance animation states. */
  private updateDoorBlockers(): void {
    if (!this.station || !this.stationCollider) return
    const blockers: StationRect[] = [...this.station.propBlockers]
    for (const entrance of this.station.entrances) {
      if (!entrance.isPassable) blockers.push(entrance.getBlockerRect())
    }
    this.stationCollider.setBlockers(blockers)
  }

  /** Request pointer lock on the renderer canvas. */
  requestPointerLock(): void {
    this.pointerLock.requestLock()
  }

  /** Attach pointer-lock to the canvas and forward mouse deltas to the camera. */
  private setupPointerLock(): void {
    if (!this.sceneManager) return
    const canvas = this.sceneManager.renderer.domElement
    this.pointerLock.attach(canvas, {
      onMouseDelta: (mx, my) => this.fpsCamera?.applyMouseDelta(mx, my),
      onLockChange: (locked) => this.onPointerLockChange?.(locked),
    })
  }

  /** Tear down the scene. */
  dispose(): void {
    DevConsole.unregister('StationView')
    this.gameLoop?.stop()
    this.starfield?.dispose()
    this.disposeExteriorSun()
    if (this.station) {
      for (const prop of this.station.props) prop.dispose()
      disposeTronHologramMaterials(this.station.hologramMaterials)
    }
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.wallImpactDecals?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.postProcessing?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
    this.stationAudio.dispose()
  }

  /** Detach and free GPU resources owned by the exterior sun, if any. */
  private disposeExteriorSun(): void {
    const sun = this.exteriorSun
    if (!sun) return
    this.sceneManager?.removeFromScene(sun.group)
    sun.mesh.geometry.dispose()
    const mat = sun.mesh.material
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose()
    } else {
      mat.dispose()
    }
    this.exteriorSun = null
  }
}
