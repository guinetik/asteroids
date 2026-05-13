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
import { AmbientLight, Color, DirectionalLight, Vector3 } from 'three'
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
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { StationCollider, type StationRect } from '@/lib/station/StationCollider'
import { buildStation, type BuiltStation } from '@/three/StationBuilder'
import type { StationEntrance } from '@/three/StationEntrance'
import { loadStationLayout } from '@/lib/station/loadStationLayout'
import type { ExteriorSunSpec, StationLayout } from '@/lib/station/StationLayout'
import { createSunMesh, type SunMeshResult } from '@/three/meshes/createSunMesh'
import { SUN } from '@/lib/planets/catalog'

/**
 * URL prefix where station-interior layouts are served as static JSON.
 * Files live under `public/data/stations/<stationId>.json` and are loaded
 * at runtime by {@link StationViewController.fetchLayout}.
 */
const STATION_LAYOUT_URL_PREFIX = '/data/stations'

// ---------------------------------------------------------------------------
// Room layout constants.
// ---------------------------------------------------------------------------

/** Floor surface Y, used by the player collider. Matches the visible
 * top of the raised floor tiles in the room builder. */
const FLOOR_Y = 0.25
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
/** Indoor movement scale applied to the FPS suit config for station interiors. */
const STATION_MOVEMENT_SPEED_SCALE = 0.35

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
  private spawnPos: Vector3 = new Vector3()
  private starfield: StarFieldController | null = null
  private exteriorSun: SunMeshResult | null = null
  /** Sim time accumulated for the exterior sun's shader uniforms. */
  private exteriorSunTime = 0
  private readonly fpsAudio = new FpsAudioDirector()
  private readonly pointerLock = new FpsPointerLockSession()
  private router: Router | null = null
  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null
  /** Prompt callback driven by entrance proximity. `null` clears the HUD. */
  onPrompt: ((prompt: string | null) => void) | null = null
  /** Interact callback fired when the player presses F near an entrance. */
  onInteract: ((event: string) => void) | null = null
  /** Scratch vector reused for the per-frame entrance proximity check. */
  private readonly _proximityScratch = new Vector3()
  /** Cached prompt text so we only fire `onPrompt` when it changes. */
  private currentPrompt: string | null = null

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
    this.playerController.group.position.copy(this.spawnPos)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Tick order.
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - TICK_OFFSET_PRE_RENDER)
    this.tickHandler.register(this.fpsCamera, TICK_PRIORITY_RENDER - TICK_OFFSET_CAMERA)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    this.setupPointerLock()

    DevConsole.register('StationView', {
      openDirect: (id = 'yamada-titania') => {
        void this.router?.push(`/station?station=${id}&dev=true`)
      },
    })

    this.fpsAudio.start()
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
    this.tickExteriorSun(dt)

    this.fpsAudio.update(dt, {
      grounded: this.playerController.grounded,
      sprinting: this.playerController.isSprinting,
      speed: this.playerController.speed,
      hovering: false,
      o2Level: this.playerController.o2Level,
      o2Capacity: this.playerController.o2Capacity,
    })
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
    this.updateDoorBlockers()

    let activePrompt: string | null = null
    let activeEntrance: StationEntrance | null = null
    let bestDistSq = ENTRANCE_INTERACT_DISTANCE * ENTRANCE_INTERACT_DISTANCE

    for (const entrance of this.station.entrances) {
      if (entrance.isOpening || entrance.isOpened) continue
      this._proximityScratch.copy(entrance.anchor)
      this._proximityScratch.y = pos.y
      const distSq = this._proximityScratch.distanceToSquared(pos)
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        activePrompt = entrance.prompt
        activeEntrance = entrance
      }
    }

    if (activePrompt !== this.currentPrompt) {
      this.currentPrompt = activePrompt
      this.onPrompt?.(activePrompt)
    }

    if (activeEntrance && this.inputManager.wasActionPressed('interact')) {
      const event = activeEntrance.event
      // Hide the prompt the moment the door starts moving.
      if (this.currentPrompt !== null) {
        this.currentPrompt = null
        this.onPrompt?.(null)
      }
      activeEntrance.triggerOpen(pos, () => this.onInteract?.(event))
      this.updateDoorBlockers()
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

  /** Refresh door collision blockers from the current entrance animation states. */
  private updateDoorBlockers(): void {
    if (!this.station || !this.stationCollider) return
    const blockers: StationRect[] = []
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
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
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
