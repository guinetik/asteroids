/**
 * Bridges Vue lifecycle to the station-interior FPS scene.
 *
 * Loads a data-driven station JSON, builds floor/wall meshes and a
 * collider, drops in a gravity-walk FPS player, and places an exit hatch
 * that routes back to `/` when the player presses F within range.
 *
 * @author guinetik
 * @date 2026-05-12
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import type { Router } from 'vue-router'
import type { Tickable } from '@/lib/Tickable'
import { AmbientLight, Color, DirectionalLight, Vector3 } from 'three'
import { DevConsole } from '@/lib/devConsole'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { FPS_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { FpsCamera } from '@/three/FpsCamera'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import { FpsAudioDirector } from '@/audio/FpsAudioDirector'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import { buildFpsPlayerConfig } from '@/lib/fps/buildFpsPlayerConfig'
import { loadStationLevel, type StationLevel } from '@/lib/station/StationLevelLoader'
import type { StationLevelJson } from '@/lib/station/types'
import {
  HATCH_INTERACT_DISTANCE,
  StationHatchController,
} from '@/three/StationHatchController'
import yamadaStation from '@/data/stations/yamada-station.json'

/** Catalog of bundled station-interior JSONs, keyed by `station` query param. */
const STATION_CATALOG: Record<string, StationLevelJson> = {
  'yamada-titania': yamadaStation as unknown as StationLevelJson,
}

/** Fallback ambient intensity used when the JSON value is zero or missing. */
const AMBIENT_LIGHT_INTENSITY_FALLBACK = 0.35
/** Intensity of the single overhead directional fill light. */
const DIR_LIGHT_INTENSITY = 0.6
/** Height of the overhead directional fill light above origin. */
const DIR_LIGHT_HEIGHT = 10
/** Color of the overhead directional fill light. */
const DIR_LIGHT_COLOR = 0xffffff
/**
 * Tick offset placing per-frame logic and the hatch just before
 * {@link TICK_PRIORITY_RENDER}, after physics but before the camera lerps.
 */
const TICK_OFFSET_PRE_RENDER = 1
/**
 * Tick offset placing the camera right before the renderer, after this
 * controller and the hatch have updated transforms.
 */
const TICK_OFFSET_CAMERA = 2

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
  private level: StationLevel | null = null
  private hatch: StationHatchController | null = null
  private readonly fpsAudio = new FpsAudioDirector()
  private readonly pointerLock = new FpsPointerLockSession()
  private router: Router | null = null
  /** Reused scratch for hatch-proximity check. */
  private readonly _proximityScratch = new Vector3()

  /** Called when pointer lock state changes. */
  onPointerLockChange: ((locked: boolean) => void) | null = null

  /**
   * Mount the scene into the given container, loading the station id from
   * the URL query.
   *
   * @param container - HTML element to render into.
   * @param stationId - Station JSON id (from `?station=`).
   * @param router - Vue router used to navigate back to `/` on exit.
   */
  async init(container: HTMLElement, stationId: string, router: Router): Promise<void> {
    this.router = router
    const json = STATION_CATALOG[stationId]
    if (!json) {
      throw new Error(`Unknown station id: ${stationId}`)
    }

    const config = buildFpsPlayerConfig()

    this.inputManager = new InputManager(FPS_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Level
    this.level = loadStationLevel(json)
    this.sceneManager.addToScene(this.level.group)

    // Lighting
    const ambient = new AmbientLight(
      new Color(json.ambient.color),
      json.ambient.intensity > 0 ? json.ambient.intensity : AMBIENT_LIGHT_INTENSITY_FALLBACK,
    )
    const dir = new DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    dir.position.set(0, DIR_LIGHT_HEIGHT, 0)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(dir)

    // Camera + player
    this.fpsCamera = new FpsCamera(config.camera)
    // Seed yaw directly on the camera — `yaw` is a public property and the
    // camera applies it via its target's rotation on the first tick. Using
    // `applyMouseDelta(0, 0)` (as the plan suggested) is a no-op for yaw so
    // it would leave the player facing the camera's default direction.
    this.fpsCamera.yaw = this.level.spawnYaw
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      config,
      this.level.collider,
    )
    this.playerController.group.position.copy(this.level.spawnPos)
    this.sceneManager.addToScene(this.playerController.group)
    this.fpsCamera.setTarget(this.playerController.group)
    this.sceneManager.setActiveCamera(this.fpsCamera.camera)

    // Hatch
    this.hatch = new StationHatchController({
      position: this.level.hatchPos,
      yaw: this.level.hatchYaw,
      onExit: () => {
        void this.router?.push('/')
      },
    })
    this.sceneManager.addToScene(this.hatch.group)

    // Tick order
    this.tickHandler.register(this.playerController, TICK_PRIORITY_PHYSICS)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - TICK_OFFSET_PRE_RENDER)
    this.tickHandler.register(this.hatch, TICK_PRIORITY_RENDER - TICK_OFFSET_PRE_RENDER)
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
   * Per-frame proximity + interact check for the hatch, plus the audio
   * director update.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (!this.playerController || !this.hatch || !this.level || !this.inputManager) return
    this._proximityScratch.copy(this.playerController.group.position)
    const d = this._proximityScratch.distanceTo(this.level.hatchPos)
    if (d < HATCH_INTERACT_DISTANCE && this.inputManager.wasActionPressed('beginMission')) {
      this.hatch.triggerExit()
    }

    this.fpsAudio.update(dt, {
      grounded: this.playerController.grounded,
      sprinting: this.playerController.isSprinting,
      speed: this.playerController.speed,
      hovering: false,
      o2Level: this.playerController.o2Level,
      o2Capacity: this.playerController.o2Capacity,
    })
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
    this.pointerLock.requestLock()
  }

  /** Tear down the scene. */
  dispose(): void {
    DevConsole.unregister('StationView')
    this.gameLoop?.stop()
    this.hatch?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
  }
}
