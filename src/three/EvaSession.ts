/**
 * Portable EVA session orchestrator.
 *
 * Owns the full EVA state machine (idle → opening → active → idle), the
 * pointer-lock glue, the "world feels huge" scale swap, and the shuttle↔EVA
 * camera hand-off. Scene-specific knowledge (which POI, which objects to
 * enlarge) is injected via {@link EvaSessionConfig} so the exact same session
 * can run inside `ShuttleViewController`, `MapViewController`, or any future
 * view that wants an orbital EVA loop.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { InputManager } from '@/lib/InputManager'
import type { TickHandler } from '@/lib/TickHandler'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { TICK_PRIORITY_PHYSICS, TICK_PRIORITY_RENDER } from '@/lib/tickPriorities'
import { useAudio } from '@/audio/useAudio'
import { EvaRcsSound } from '@/audio/EvaRcsSound'
import { EvaCollisionResolver, type EvaCollider } from '@/lib/physics/evaCollisionResolver'
import { EvaTetherController } from './EvaTetherController'

/**
 * The surface EvaSession needs from its host scene. {@link SceneManager} satisfies this
 * naturally; the solar-map view supplies a minimal adapter since it drives rendering
 * through an EffectComposer rather than a SceneManager.
 */
export interface EvaSceneHost {
  /** Parent for EVA objects; must match the scene currently rendered. */
  addToScene(object: THREE.Object3D): void
  /** Detach EVA objects. */
  removeFromScene(object: THREE.Object3D): void
  /** Hand render camera to the EVA first-person camera (null = revert to vehicle camera). */
  setActiveCamera(camera: THREE.PerspectiveCamera | null): void
  /** Renderer whose canvas receives pointer lock. */
  readonly renderer: { domElement: HTMLElement }
}

/**
 * Horizontal (XZ) distance at which the player can initiate EVA near the POI. Uses
 * planar distance rather than 3D so the vertical `poiLocalY` offset doesn't push the
 * prompt out of range — the player parks right over the waypoint column and climbs.
 */
const EVA_TRIGGER_RANGE = 8

/** Horizontal (XZ) distance at which the EVA player can re-enter the vehicle. */
const EVA_RETURN_RANGE = 6

/** Vehicle must be slower than this (world units / s) to initiate EVA. */
const EVA_MAX_VEHICLE_SPEED = 0.5

/** Door open progress (0..1) at which EVA egress is allowed. */
const EVA_DOOR_OPEN_THRESHOLD = 0.98

/** Local offset (vehicle space) where the EVA player appears on exit. */
const EVA_SPAWN_OFFSET = new THREE.Vector3(0, 2.5, 6)

/** Stub HP for the FPS HUD while the EVA flow doesn't track real damage. */
const EVA_STUB_HP = 100

/** First-person EVA RCS sits quieter than ship-mounted jets. */
const EVA_RCS_AUDIO_VOLUME = 0.42

/**
 * 3D distance (world units) at which the EVA player sees the "START MAINTENANCE [F]"
 * prompt near a POI. Sized a touch larger than the POI props themselves + the player
 * body radius so the prompt appears as you approach rather than requiring a hull bump.
 */
const EVA_TERMINAL_PROMPT_RANGE = 3.5

/**
 * Minimal vehicle contract the EVA session depends on. {@link ShuttleController}
 * satisfies this naturally; any future player vehicle can opt in by exposing the
 * same surface.
 */
export interface EvaSessionVehicle {
  /** Scene graph root for positioning and tether anchoring. */
  group: THREE.Object3D
  /** Current speed magnitude (world units / s). */
  speed: number
  /** Heading angle (radians) used to seed the initial EVA camera yaw. */
  heading: number
  /** Freeze vehicle physics (no movement, no gravity effects). */
  freeze(): void
  /** Resume vehicle physics. */
  unfreeze(): void
  /** Enable/disable the vehicle's input reads. */
  setInputEnabled(enabled: boolean): void
  /** Begin opening cargo-bay doors (idempotent if already open). */
  openDoors(): void
  /** Begin closing cargo-bay doors (idempotent if already closed). */
  closeDoors(): void
  /** Door animation progress in [0,1]. */
  doorOpenProgress: number
}

/** A scene object + scale multiplier pair for the "world feels huge" swap. */
export interface EvaHugeScaleTarget {
  object: THREE.Object3D
  factor: number
}

/** Dependencies + callbacks wired to the host view. */
export interface EvaSessionConfig {
  sceneManager: EvaSceneHost
  tickHandler: TickHandler
  /**
   * Scale applied to the FPS helmet spot + fill lights at session start; restored to the
   * original intensities on session end. Defaults to `1`. The solar-map view uses a
   * smaller factor because the scene already has strong sun illumination and bloom.
   */
  helmetLightIntensityScale?: number
  inputManager: InputManager
  /** Resolve the player vehicle. Returning null is treated as "no EVA possible". */
  getVehicle: () => EvaSessionVehicle | null
  /** World-space POI position for the proximity check (null = no POI active). */
  getPoi: () => THREE.Vector3 | null
  /**
   * Optional gate: return false while external state forbids EVA (e.g. the shuttle is
   * captured in a planetary orbit). The session shows a blocking prompt instead of the
   * "EVA [F]" offer. Defaults to always-allowed when not supplied.
   */
  canEva?: () => { allowed: true } | { allowed: false; reason: string }
  /**
   * Start the terminal minigame for the POI the player is currently near. The host
   * view is expected to open an overlay, run the minigame, then call
   * {@link EvaSession.endMinigame} when the overlay is dismissed or completed.
   */
  onStartEvaMinigame?: () => void
  /**
   * Optional predicate. When it returns true, the POI terminal prompt and the
   * F-press that would call `beginMinigame` are suppressed — the session stays
   * in its `active` sub-state. Used for in-scene minigames (satellite servicing)
   * where the host attaches a controller on EVA-enter and drives repairs inline,
   * so entering the "minigame" sub-state (which releases pointer lock for a Vue
   * overlay) would be wrong.
   */
  isInSceneMinigameActive?: () => boolean
  /** Objects to scale up during EVA. Read once at session enter. */
  getHugeScaleTargets: () => EvaHugeScaleTarget[]
  /**
   * Build 3D colliders the EVA player should bounce off (shuttle hull, mission POI).
   * Called once at session start, *after* huge-scale has been applied, so
   * {@link EvaCollider} AABBs can be computed from current world bounds.
   */
  getColliders?: () => EvaCollider[]
  /** Multiplier applied to the spawn offset so the player emerges outside the scaled vehicle. */
  spawnOffsetScale: number
  /** Fired true when EVA becomes active, false when it ends. */
  onEvaModeChange?: (active: boolean) => void
  /** Per-frame FPS HUD telemetry while EVA is active. */
  onEvaTelemetry?: (telemetry: FpsTelemetry) => void
  /** Prompt text for the view-level HUD ("EVA [F]", "Return to Shuttle [F]", etc.). */
  onActionPrompt?: (prompt: string | null) => void
}

/**
 * Self-contained EVA session. Register as a {@link Tickable}; call {@link dispose}
 * on teardown. Exposes {@link isActive} for the host view to switch HUD variants.
 */
export class EvaSession implements Tickable {
  private readonly config: EvaSessionConfig
  private readonly rcsSound = new EvaRcsSound()
  private mode: 'idle' | 'opening' | 'active' | 'minigame' = 'idle'
  private controller: EvaTetherController | null = null
  private readonly collisionResolver = new EvaCollisionResolver()
  private preEvaScales: { object: THREE.Object3D; scale: number }[] = []
  private preEvaHelmetLightIntensity: { spot: number; fill: number } | null = null
  private lastPrompt: string | null = null
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnCanvasClick: (() => void) | null = null

  constructor(config: EvaSessionConfig) {
    this.config = config
  }

  /** True while the player is out on EVA (post-door-open, pre-return). Stays true
   * during the maintenance minigame sub-state so HUD/visor/bloom overrides persist. */
  get isActive(): boolean {
    return this.mode === 'active' || this.mode === 'minigame'
  }

  /** True while a maintenance minigame overlay is open. Lets the host view gate input
   * handling (pointer lock, keybinds) on the overlay without toggling EVA mode. */
  get isMinigameOpen(): boolean {
    return this.mode === 'minigame'
  }

  tick(_dt: number): void {
    const vehicle = this.config.getVehicle()
    if (!vehicle) {
      this.setPrompt(null)
      return
    }

    if (this.mode === 'opening') {
      this.setPrompt('OPENING BAY…')
      if (vehicle.doorOpenProgress >= EVA_DOOR_OPEN_THRESHOLD) {
        this.startSession(vehicle)
      }
      return
    }

    if (this.mode === 'idle') {
      const poi = this.config.getPoi()
      if (!poi) {
        this.setPrompt(null)
        return
      }
      const dx = vehicle.group.position.x - poi.x
      const dz = vehicle.group.position.z - poi.z
      const distToPoiXZ = Math.sqrt(dx * dx + dz * dz)
      if (distToPoiXZ >= EVA_TRIGGER_RANGE) {
        this.setPrompt(null)
        return
      }
      if (vehicle.speed > EVA_MAX_VEHICLE_SPEED) {
        this.setPrompt('STOP SHIP TO EVA')
        return
      }
      const gate = this.config.canEva?.() ?? { allowed: true }
      if (!gate.allowed) {
        this.setPrompt(gate.reason)
        return
      }
      this.setPrompt('EVA [F]')
      if (this.config.inputManager.wasActionPressed('evaToggle')) {
        this.beginOpening(vehicle)
      }
      return
    }

    if (this.mode === 'minigame') {
      // Player is in the maintenance overlay — suppress EVA prompts + RCS audio. The
      // host view calls endMinigame() when the overlay closes, flipping back to active.
      this.setPrompt(null)
      return
    }

    if (!this.controller) return
    this.updateRcsAudio(_dt)

    // POI terminal proximity (3D) takes priority over the shuttle-return prompt so
    // the player can't miss the maintenance action by accidentally re-entering range
    // of the shuttle.
    const poi = this.config.getPoi()
    if (poi) {
      const pdx = this.controller.group.position.x - poi.x
      const pdy = this.controller.group.position.y - poi.y
      const pdz = this.controller.group.position.z - poi.z
      const distToPoi = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz)
      if (distToPoi < EVA_TERMINAL_PROMPT_RANGE) {
        // In-scene minigames (e.g. satellite servicing) attach their controller on
        // EVA-enter and drive repairs inline with pointer lock held. Skip the
        // terminal prompt + F-press so the player isn't told to press F and so F
        // doesn't accidentally transition us into the overlay-oriented sub-state.
        const inSceneActive = this.config.isInSceneMinigameActive?.() ?? false
        if (!inSceneActive) {
          this.setPrompt('START MAINTENANCE [F]')
          if (this.config.inputManager.wasActionPressed('evaToggle')) {
            this.beginMinigame()
          }
          this.emitTelemetry()
          return
        }
      }
    }

    const rdx = this.controller.group.position.x - vehicle.group.position.x
    const rdz = this.controller.group.position.z - vehicle.group.position.z
    const distToVehicleXZ = Math.sqrt(rdx * rdx + rdz * rdz)
    if (distToVehicleXZ < EVA_RETURN_RANGE) {
      this.setPrompt('Return to Shuttle [F]')
      if (this.config.inputManager.wasActionPressed('evaToggle')) {
        this.endSession(vehicle)
        return
      }
    } else {
      this.setPrompt(null)
    }
    this.emitTelemetry()
  }

  private beginOpening(vehicle: EvaSessionVehicle): void {
    this.mode = 'opening'
    vehicle.openDoors()
    vehicle.setInputEnabled(false)
  }

  private startSession(vehicle: EvaSessionVehicle): void {
    const { sceneManager, tickHandler, inputManager } = this.config
    this.mode = 'active'
    vehicle.freeze()
    this.applyHugeScales()

    const controller = new EvaTetherController()
    controller.setInput(inputManager)
    controller.setAnchor(vehicle.group)
    controller.refillLifeSupport()

    const spawn = EVA_SPAWN_OFFSET.clone()
      .multiplyScalar(this.config.spawnOffsetScale)
      .applyQuaternion(vehicle.group.quaternion)
    controller.setPosition(
      new THREE.Vector3().copy(vehicle.group.position).add(spawn),
    )
    controller.fpsCamera.yaw = vehicle.heading
    controller.fpsCamera.pitch = 0

    // Colliders must be built after applyHugeScales so AABBs reflect the ×100 shuttle
    // and any per-type POI scale boosts (e.g. telescope ×20).
    this.collisionResolver.clear()
    const colliders = this.config.getColliders?.() ?? []
    for (const c of colliders) this.collisionResolver.add(c)
    controller.setCollisionResolver(this.collisionResolver)

    sceneManager.addToScene(controller.group)
    sceneManager.addToScene(controller.tetherLine)
    sceneManager.addToScene(controller.fpsCamera.helmetLightRig)
    controller.fpsCamera.helmetLightRig.visible = true

    const helmetScale = this.config.helmetLightIntensityScale ?? 1
    if (helmetScale !== 1) {
      const spot = controller.fpsCamera.helmetLight
      const fill = controller.fpsCamera.helmetFillLight
      this.preEvaHelmetLightIntensity = { spot: spot.intensity, fill: fill.intensity }
      spot.intensity *= helmetScale
      fill.intensity *= helmetScale
    }

    tickHandler.register(controller, TICK_PRIORITY_PHYSICS)
    tickHandler.register(controller.fpsCamera, TICK_PRIORITY_RENDER - 1)
    sceneManager.setActiveCamera(controller.fpsCamera.camera)

    this.controller = controller
    this.attachPointerLock()
    this.config.onEvaModeChange?.(true)
  }

  /**
   * Enter the minigame sub-state. Releases pointer lock and clears the EVA prompt so
   * the overlay can take input. The host view opens its overlay via
   * {@link EvaSessionConfig.onStartEvaMinigame}.
   */
  private beginMinigame(): void {
    if (this.mode !== 'active') return
    this.mode = 'minigame'
    this.rcsSound.stop()
    this.detachPointerLock()
    this.setPrompt(null)
    this.config.onStartEvaMinigame?.()
  }

  /**
   * Return to the active EVA state after a minigame overlay closes. Idempotent —
   * safe to call if the session has already ended (e.g. disposed while open).
   */
  endMinigame(): void {
    if (this.mode !== 'minigame') return
    this.mode = 'active'
    this.attachPointerLock()
  }

  private endSession(vehicle: EvaSessionVehicle): void {
    const { sceneManager, tickHandler } = this.config
    this.mode = 'idle'
    this.detachPointerLock()
    sceneManager.setActiveCamera(null)
    if (this.controller) {
      if (this.preEvaHelmetLightIntensity) {
        this.controller.fpsCamera.helmetLight.intensity = this.preEvaHelmetLightIntensity.spot
        this.controller.fpsCamera.helmetFillLight.intensity = this.preEvaHelmetLightIntensity.fill
        this.preEvaHelmetLightIntensity = null
      }
      tickHandler.unregister(this.controller)
      tickHandler.unregister(this.controller.fpsCamera)
      sceneManager.removeFromScene(this.controller.group)
      sceneManager.removeFromScene(this.controller.tetherLine)
      sceneManager.removeFromScene(this.controller.fpsCamera.helmetLightRig)
      this.controller.dispose()
      this.controller = null
    }
    this.collisionResolver.clear()
    this.restoreHugeScales()
    this.rcsSound.stop()
    vehicle.setInputEnabled(true)
    vehicle.unfreeze()
    vehicle.closeDoors()
    this.config.onEvaModeChange?.(false)
    this.setPrompt(null)
  }

  private applyHugeScales(): void {
    this.preEvaScales = []
    for (const { object, factor } of this.config.getHugeScaleTargets()) {
      this.preEvaScales.push({ object, scale: object.scale.x })
      object.scale.multiplyScalar(factor)
    }
  }

  private restoreHugeScales(): void {
    for (const entry of this.preEvaScales) {
      entry.object.scale.setScalar(entry.scale)
    }
    this.preEvaScales = []
  }

  private emitTelemetry(): void {
    if (!this.config.onEvaTelemetry || !this.controller) return
    this.config.onEvaTelemetry({
      hp: EVA_STUB_HP,
      maxHp: EVA_STUB_HP,
      o2Level: this.controller.o2Level,
      o2Capacity: this.controller.o2Capacity,
      sprintCharge: 0,
      sprintCapacity: 0,
      speed: this.controller.speed,
      grounded: false,
      activeMode: 'drill',
      aiming: false,
      isFiring: false,
      rtgLevel: this.controller.rtgLevel,
      rtgCapacity: this.controller.rtgCapacity,
      modeCharge: 0,
      modeCapacity: 0,
      headingRad: this.controller.headingRad,
      objectives: [],
    })
  }

  private updateRcsAudio(dt: number): void {
    if (!this.controller) return

    const audio = useAudio()
    const hasRtg = this.controller.rtgLevel > 0
    const forward = hasRtg && this.config.inputManager.isActionActive('evaForward') ? 1 : 0
    const back = hasRtg && this.config.inputManager.isActionActive('evaBack') ? 1 : 0
    const left = hasRtg && this.config.inputManager.isActionActive('evaStrafeLeft') ? 1 : 0
    const right = hasRtg && this.config.inputManager.isActionActive('evaStrafeRight') ? 1 : 0
    const up = hasRtg && this.config.inputManager.isActionActive('evaUp') ? 1 : 0
    const down = hasRtg && this.config.inputManager.isActionActive('evaDown') ? 1 : 0

    if (forward || back || left || right || up || down) {
      audio.unlock()
    }

    this.rcsSound.update(
      {
        forward,
        back,
        left,
        right,
        up,
        down,
        sfxVolume: audio.getCategoryVolume('sfx') * EVA_RCS_AUDIO_VOLUME,
      },
      dt,
    )
  }

  private setPrompt(prompt: string | null): void {
    if (this.lastPrompt === prompt) return
    this.lastPrompt = prompt
    this.config.onActionPrompt?.(prompt)
  }

  private attachPointerLock(): void {
    const canvas = this.config.sceneManager.renderer.domElement
    this.boundOnMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.controller?.applyMouseDelta(e.movementX, e.movementY)
      }
    }
    this.boundOnCanvasClick = (): void => {
      if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock()
      }
    }
    document.addEventListener('mousemove', this.boundOnMouseMove)
    canvas.addEventListener('click', this.boundOnCanvasClick)
    canvas.requestPointerLock()
  }

  private detachPointerLock(): void {
    if (this.boundOnMouseMove) {
      document.removeEventListener('mousemove', this.boundOnMouseMove)
      this.boundOnMouseMove = null
    }
    if (this.boundOnCanvasClick) {
      const canvas = this.config.sceneManager.renderer.domElement
      canvas.removeEventListener('click', this.boundOnCanvasClick)
      this.boundOnCanvasClick = null
    }
    if (document.pointerLockElement) document.exitPointerLock()
  }

  dispose(): void {
    if (this.mode !== 'idle') {
      const vehicle = this.config.getVehicle()
      if (vehicle) {
        this.endSession(vehicle)
      } else {
        this.mode = 'idle'
        this.detachPointerLock()
        this.restoreHugeScales()
      }
    }
    this.rcsSound.dispose()
  }
}
