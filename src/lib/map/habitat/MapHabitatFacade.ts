/**
 * Owns the habitat-interior lifecycle for the map view.
 *
 * Responsibilities pulled out of {@link MapViewController}:
 *   - Lazy-load + cache the {@link HabitatInteriorScene} on first entry.
 *   - Swap the post-processing `RenderPass` scene/camera between map and habitat on the
 *     per-frame transition tick, including the wake-up pitch/height animation.
 *   - Pointer-lock lifecycle via shared {@link FpsPointerLockSession} (same helper Level
 *     already uses), so mouse-look and click-to-relock don't need ad-hoc listeners.
 *   - Enter/exit fan-out: audio cues, inspect-mode reset, Vue HUD callbacks, shuttle-control
 *     dialog close.
 *
 * The facade does NOT own the {@link HabitatState} FSM — the controller still drives it so
 * mode-coordinator gates (habitat vs map vs EVA) stay in one place.
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import * as THREE from 'three'
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { HabitatInteriorScene } from '@/three/HabitatInteriorScene'
import type { HabitatPhase } from '@/lib/habitatState'
import type { MapSceneObjects } from '@/three/MapSceneSetup'
import type { VehicleCamera } from '@/three/VehicleCamera'
import type { MapShuttleEffects } from '@/three/MapShuttleEffects'
import type { ShuttleController } from '@/three/ShuttleController'
import type { ShuttleAudioDirector } from '@/audio/ShuttleAudioDirector'
import { MapModeCoordinator } from '@/lib/map/mode/MapModeCoordinator'
import { uiAudio } from '@/audio/UiAudioDirector'
import { FpsPointerLockSession } from '@/lib/fps/FpsPointerLockSession'
import type { JourneyTriggerId } from '@/lib/journeys'

/**
 * Starting pitch for the wake-up cinematic — looking straight up at the ceiling, as if you
 * just opened your eyes lying flat on the bunk.
 */
const WAKE_UP_START_PITCH = Math.PI / 2

/** Camera Y position while lying in bed — lerped up to the standing height during wake-up. */
const WAKE_UP_LYING_HEIGHT = 0.5

/**
 * Eased progress at which the head-tilt phase **starts**. Until this point the camera holds
 * the {@link WAKE_UP_START_PITCH} (ceiling) so the player has time to register where they
 * are before the head moves.
 */
const WAKE_UP_PITCH_PHASE_START = 0.25

/**
 * Eased progress at which the head-tilt phase finishes (pitch reaches `0`). Combined with
 * {@link WAKE_UP_PITCH_PHASE_START} this defines a slow, deliberate head rotation rather
 * than a snap-down.
 */
const WAKE_UP_PITCH_PHASE_END = 0.85

/**
 * Eased progress at which the stand-up phase begins (camera Y starts lerping). Overlaps
 * the back half of the pitch window so head-tilt finishing and body rising blend together.
 */
const WAKE_UP_STAND_PHASE_START = 0.55

/** Callbacks the facade fires out to the Vue HUD. */
export interface MapHabitatCallbacks {
  /** Vue-side entry/exit signal — drives the HUD visibility for habitat-only elements. */
  onHabitatActive?: (active: boolean) => void
  /** Open/close the shuttle-control dialog. */
  onShuttleControl?: (visible: boolean) => void
  /** Prompt text shown while the player is looking at an interactable. */
  onHabitatPrompt?: (prompt: string | null) => void
}

/** Deps the facade needs to read/mutate controller state. */
export interface MapHabitatFacadeDeps {
  /** Live `MapSceneObjects` (renderer + composer). Null-safe while init is in progress. */
  getSceneObjects: () => MapSceneObjects | null
  /** Chase camera — disabled while the habitat owns the render pass. */
  getVehicleCamera: () => VehicleCamera | null
  /** Shuttle effects — pause thruster audio while in the habitat. */
  getShuttleEffects: () => MapShuttleEffects | null
  /** Shuttle controller — cargo-door toggle when exiting inspect mode. */
  getShuttleController: () => ShuttleController | null
  /** Inspect-mode accessor; facade clears inspect on exit so doors close. */
  getInspectMode: () => boolean
  setInspectMode: (value: boolean) => void
  /** Shared audio director — enter/exit beds + transitions. */
  shuttleAudio: ShuttleAudioDirector
  /** Mode coordinator — resolves fade + render state from the HabitatState FSM. */
  modeCoordinator: MapModeCoordinator
  /** Controller hook called after first habitat entry completes — arms journey UI. */
  armJourneyUiFromHabitatEntry: () => void
  /** Clears the Earth startup HUD suppression flag on entry/exit. */
  setEarthStartupOrbitHudSuppressed: (suppressed: boolean) => void
  /** Controller journey trigger dispatcher; facade forwards `shuttle_control_opened`. */
  notifyJourneyTrigger: (trigger: JourneyTriggerId) => void
  /** Persisted achievement ids used by habitat visual rewards. */
  getUnlockedAchievementIds: () => readonly string[]
  /** HUD callbacks. */
  callbacks: MapHabitatCallbacks
}

/**
 * Stateful facade. Construction is cheap — call `attach(deps)` once during `init`.
 */
export class MapHabitatFacade {
  private scene: HabitatInteriorScene | null = null
  private readonly pointerLock = new FpsPointerLockSession()
  private pointerLockAttached = false
  private deps: MapHabitatFacadeDeps | null = null

  /** Wire the facade to its controller. */
  attach(deps: MapHabitatFacadeDeps): void {
    this.deps = deps
  }

  /** Live habitat scene reference, or `null` before first entry. */
  get interiorScene(): HabitatInteriorScene | null {
    return this.scene
  }

  /** Lazy-load the interior scene on first entry. Safe to call repeatedly. */
  async ensureScene(): Promise<HabitatInteriorScene> {
    if (this.scene) return this.scene
    const deps = this.deps
    const next = new HabitatInteriorScene()
    next.setUnlockedAchievementIds(deps?.getUnlockedAchievementIds() ?? [])
    await next.load()
    next.onInteract = (target) => {
      if (target !== 'table') return
      uiAudio.notifyType()
      deps?.notifyJourneyTrigger('shuttle_control_opened')
      deps?.callbacks.onShuttleControl?.(true)
      // Release pointer lock so the shuttle-control UI can receive clicks.
      this.pointerLock.releaseLock()
    }
    next.onPrompt = (prompt) => {
      deps?.callbacks.onHabitatPrompt?.(prompt)
    }
    this.scene = next
    return next
  }

  /**
   * Push updated achievement ids into the live habitat scene.
   *
   * @param unlockedAchievementIds - Current persisted achievement ids.
   */
  setUnlockedAchievementIds(unlockedAchievementIds: readonly string[]): void {
    this.scene?.setUnlockedAchievementIds(unlockedAchievementIds)
  }

  /** Per-frame transition tick — swaps composer scene + runs the wake-up animation. */
  tickTransition(phase: HabitatPhase, progress: number): void {
    const deps = this.deps
    if (!deps) return
    const sceneObjects = deps.getSceneObjects()
    if (!sceneObjects || !this.scene) return

    const renderPass = sceneObjects.composer.passes[0] as RenderPass
    const renderState = deps.modeCoordinator.resolveHabitatRenderState(phase, progress)

    if (renderState.disableVehicleControls) {
      const vehicleCamera = deps.getVehicleCamera()
      if (vehicleCamera) vehicleCamera.controls.enabled = false
    }

    if (!renderState.useHabitatScene) return
    ;(renderPass as { scene: THREE.Scene }).scene = this.scene.getScene()
    renderPass.camera = this.scene.getCamera()

    if (renderState.wakeUpProgress !== null) {
      const t = renderState.wakeUpProgress
      const cam = this.scene.fpsCamera
      const spawn = this.scene.getSpawnPosition()
      cam.yaw = spawn.yaw

      // Pitch: hold at ceiling (`+π/2`) until {@link WAKE_UP_PITCH_PHASE_START}, then lerp
      // down to forward (`0`) by {@link WAKE_UP_PITCH_PHASE_END}. The leading hold gives the
      // player a beat to register the ceiling before the head begins to tilt.
      const pitchT = Math.max(
        0,
        Math.min(
          1,
          (t - WAKE_UP_PITCH_PHASE_START) / (WAKE_UP_PITCH_PHASE_END - WAKE_UP_PITCH_PHASE_START),
        ),
      )
      cam.pitch = WAKE_UP_START_PITCH * (1 - pitchT)

      // Stand-up: hold lying height until {@link WAKE_UP_STAND_PHASE_START}, then lerp up to
      // standing eye height by the end of the timeline. The pitch + stand windows overlap
      // intentionally so head-tilt finishing and body rising blend together.
      const standT = Math.max(
        0,
        Math.min(1, (t - WAKE_UP_STAND_PHASE_START) / (1 - WAKE_UP_STAND_PHASE_START)),
      )
      cam.camera.position.y =
        WAKE_UP_LYING_HEIGHT + (spawn.position.y - WAKE_UP_LYING_HEIGHT) * standT

      cam.tick(0)
    }
  }

  /** Compute the fade overlay opacity from the FSM phase + progress. */
  getFadeOpacity(phase: HabitatPhase, progress: number): number {
    const deps = this.deps
    if (!deps) return 0
    return deps.modeCoordinator.getHabitatFadeOpacity(phase, progress)
  }

  /**
   * Called when the habitat FSM reaches `habitat` from `waking_up`.
   * Announces entry, arms journey UI, pauses shuttle audio, and grabs pointer lock.
   */
  handleEnter(): void {
    const deps = this.deps
    if (!deps) return
    deps.callbacks.onHabitatActive?.(true)
    deps.armJourneyUiFromHabitatEntry()
    deps.setEarthStartupOrbitHudSuppressed(false)
    deps.getShuttleEffects()?.thrusterController.setAudioEnabled(false)
    deps.shuttleAudio.notifyEnterHabitat()
    this.attachPointerLock()
  }

  /**
   * Called when the habitat FSM returns to `map`. Restores the map render pass,
   * resumes shuttle audio, closes doors if inspect was open, and releases pointer lock.
   */
  handleExit(): void {
    const deps = this.deps
    if (!deps) return
    const sceneObjects = deps.getSceneObjects()
    if (!sceneObjects) return

    deps.getShuttleEffects()?.thrusterController.setAudioEnabled(true)
    deps.shuttleAudio.notifyExitHabitat()

    const renderPass = sceneObjects.composer.passes[0] as RenderPass
    ;(renderPass as { scene: THREE.Scene }).scene = sceneObjects.scene
    const vehicleCamera = deps.getVehicleCamera()
    if (vehicleCamera) {
      renderPass.camera = vehicleCamera.camera
      vehicleCamera.controls.enabled = true
    }

    if (deps.getInspectMode()) {
      deps.getShuttleController()?.toggleDoors()
      deps.setInspectMode(false)
    }

    this.detachPointerLock()
    deps.callbacks.onShuttleControl?.(false)
    deps.callbacks.onHabitatActive?.(false)
    deps.callbacks.onHabitatPrompt?.(null)
    deps.setEarthStartupOrbitHudSuppressed(false)
  }

  /** Advance the interior scene one frame. Safe no-op when the scene hasn't loaded yet. */
  tickScene(dt: number): void {
    if (this.scene && this.pointerLockAttached && this.pointerLock.consumeLeftMouseJustPressed()) {
      this.scene.onPrimaryClick()
    }
    this.scene?.tick(dt)
  }

  /** Release the interior scene + listeners. */
  dispose(): void {
    this.detachPointerLock()
    this.scene?.dispose()
    this.scene = null
    this.deps = null
  }

  private attachPointerLock(): void {
    const deps = this.deps
    if (!deps || this.pointerLockAttached) return
    const sceneObjects = deps.getSceneObjects()
    if (!sceneObjects) return
    this.pointerLock.attach(sceneObjects.renderer.domElement, {
      onMouseDelta: (dx, dy) => {
        this.scene?.fpsCamera.applyMouseDelta(dx, dy)
      },
    })
    this.pointerLockAttached = true
    this.pointerLock.requestLock()
  }

  private detachPointerLock(): void {
    if (!this.pointerLockAttached) return
    this.pointerLock.detach()
    this.pointerLockAttached = false
  }
}
