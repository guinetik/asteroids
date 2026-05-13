/**
 * Bridges Vue lifecycle to the station-interior FPS scene.
 *
 * Renders a parametric room assembled from the modular hallway pack:
 * a `ROOM_WIDTH × ROOM_DEPTH` grid of floor + ceiling tiles surrounded
 * by perimeter walls.
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
import { StationCollider } from '@/lib/station/StationCollider'
import { buildStationRoom, type StationRoom } from '@/three/StationRoomBuilder'
import type { EntranceSpec, StationEntrance } from '@/three/StationEntrance'

// ---------------------------------------------------------------------------
// Room layout constants.
// ---------------------------------------------------------------------------

/** Number of wall pieces along the room's X axis. */
const ROOM_WIDTH = 4
/** Number of wall pieces along the room's Z axis. */
const ROOM_DEPTH = 3
/** Number of wall pieces stacked vertically. */
const ROOM_HEIGHT = 2
/** Floor surface Y, used by the player collider. Matches the visible
 * top of the raised floor tiles in {@link buildStationRoom}. */
const FLOOR_Y = 0.25
/** Spawn yaw facing +Z. */
const SPAWN_YAW = 0
/** Maximum distance for an entrance to show its interact prompt. */
const ENTRANCE_INTERACT_DISTANCE = 2.5
/** Single hard-coded entrance on the south wall — exit back to `/`. */
const ROOM_ENTRANCES: ReadonlyArray<EntranceSpec> = [
  {
    side: 'S',
    index: 1,
    storey: 0,
    prompt: 'F  Leave',
    event: 'station:exit',
    openStyle: 'crack',
  },
]

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

// ---------------------------------------------------------------------------
// Tick priority offsets.
// ---------------------------------------------------------------------------

/** Pre-render tick offset for per-frame logic + hatch. */
const TICK_OFFSET_PRE_RENDER = 1
/** Camera tick offset — just before the renderer. */
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
  private room: StationRoom | null = null
  private spawnPos: Vector3 = new Vector3()
  private starfield: StarFieldController | null = null
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
   * @param _stationId - Unused while layout is being redesigned.
   * @param router - Vue router used to navigate back to `/` on exit.
   */
  async init(container: HTMLElement, _stationId: string, router: Router): Promise<void> {
    this.router = router

    const config = buildFpsPlayerConfig()
    config.camera = { ...config.camera, eyeHeight: STATION_EYE_HEIGHT }

    // Merge FPS movement (WASD + jump + sprint + tools) with habitat's
    // F-key interact binding so the entrance prompt can fire.
    this.inputManager = new InputManager({ ...FPS_BINDINGS, ...HABITAT_BINDINGS })
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // Parametric room.
    this.room = await buildStationRoom({
      width: ROOM_WIDTH,
      depth: ROOM_DEPTH,
      height: ROOM_HEIGHT,
      entrances: ROOM_ENTRANCES.map((e) => ({ ...e })),
    })
    this.sceneManager.addToScene(this.room.group)

    this.spawnPos.set(0, FLOOR_Y, 0)

    // Lighting.
    const ambient = new AmbientLight(new Color(DIR_LIGHT_COLOR), AMBIENT_LIGHT_INTENSITY)
    const dir = new DirectionalLight(DIR_LIGHT_COLOR, DIR_LIGHT_INTENSITY)
    dir.position.set(0, DIR_LIGHT_HEIGHT, 0)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(dir)

    // Starfield visible above the open ground.
    this.starfield = new StarFieldController()
    this.sceneManager.addToScene(this.starfield.points)

    // Collider — single rect covering the room's interior floor.
    const collider = new StationCollider(
      [
        {
          minX: -this.room.halfWidth,
          maxX: this.room.halfWidth,
          minZ: -this.room.halfDepth,
          maxZ: this.room.halfDepth,
          y: FLOOR_Y,
        },
      ],
      [],
    )

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
    if (!this.room || !this.playerController || !this.inputManager) return

    for (const entrance of this.room.entrances) entrance.tick(dt)

    const pos = this.playerController.group.position
    let activePrompt: string | null = null
    let activeEntrance: StationEntrance | null = null
    let bestDistSq = ENTRANCE_INTERACT_DISTANCE * ENTRANCE_INTERACT_DISTANCE

    for (const entrance of this.room.entrances) {
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
      activeEntrance.triggerOpen(() => this.onInteract?.(event))
    }
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
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
    this.fpsAudio.dispose()
  }
}
