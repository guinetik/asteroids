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
import type { Inventory } from '@/lib/inventory/types'
import type { PlayerProfile } from '@/lib/player/types'
import {
  addLitterPollution,
  addSushiBladder,
  addSushiTired,
  addSushiHunger,
  addSushiLove,
  recordSushiBowlRefill,
  recordSushiPet,
  saveProfile,
  setBowlServings,
  setLitterPollution,
  SUSHI_NEEDS_MAX,
} from '@/lib/player/profile'
import { removeItem } from '@/lib/inventory/inventory'
import { STARTER_CAT_FOOD_ID } from '@/lib/map/player/playerInventoryHelpers'
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

/** Hunger restored each time Sushi consumes one serving from the bowl (0..100 scale). */
const SUSHI_HUNGER_RESTORE_PER_SERVING = 25
/** Love granted each time the player pets Sushi (0..100 scale). */
const SUSHI_LOVE_PER_PET = 50
/** Bowl-fill brings the bowl to this serving count (one full bag). */
const SUSHI_BOWL_FULL_SERVINGS = 10
/** Cat food units removed from the player's inventory per bowl refill. */
const SUSHI_CAT_FOOD_REFILL_COST = 1

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
  /**
   * Fired when the hatch wheel-knob animation completes — the controller should
   * initiate the journey-gated habitat exit (fade out + FSM leave).
   */
  onHatchExit?: () => void
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
  /**
   * Whether this is the player's first entry into the habitat this session. The facade uses
   * this to decide between the bed wake-up cinematic (first entry) and the hatch snap (return).
   */
  isFirstHabitatEntry: () => boolean
  /** Clears the Earth startup HUD suppression flag on entry/exit. */
  setEarthStartupOrbitHudSuppressed: (suppressed: boolean) => void
  /** Controller journey trigger dispatcher; facade forwards `shuttle_control_opened`. */
  notifyJourneyTrigger: (trigger: JourneyTriggerId) => void
  /** Persisted achievement ids used by habitat visual rewards. */
  getUnlockedAchievementIds: () => readonly string[]
  /** Read the live player profile (Pinia-backed). */
  getProfile: () => PlayerProfile
  /** Write a new profile back to the controller (the controller saves + emits). */
  setProfile: (profile: PlayerProfile) => void
  /** Read the live shuttle inventory. */
  getInventory: () => Inventory
  /** Write a new inventory back to the controller. */
  setInventory: (inventory: Inventory) => void
  /** Re-evaluate achievements after a Sushi care event mutates profile state. */
  evaluateAchievements: () => void
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
      if (target === 'table') {
        uiAudio.notifyType()
        deps?.notifyJourneyTrigger('shuttle_control_opened')
        deps?.callbacks.onShuttleControl?.(true)
        // Release pointer lock so the shuttle-control UI can receive clicks.
        this.pointerLock.releaseLock()
      } else if (target === 'hatch') {
        // Knob animation finished — hand off to the controller for journey-gated exit.
        deps?.callbacks.onHatchExit?.()
      }
    }
    next.onPrompt = (prompt) => {
      deps?.callbacks.onHabitatPrompt?.(prompt)
    }
    next.setSushiBridgeCallbacks({
      getHunger: () => (deps ? deps.getProfile().sushiHunger : 0),
      getLove: () => (deps ? deps.getProfile().sushiLove : 0),
      getBowlServings: () => (deps ? deps.getProfile().bowlServings : 0),
      getBladder: () => (deps ? deps.getProfile().sushiBladder : 0),
      getLitterPollution: () => (deps ? deps.getProfile().litterPollution : 0),
      getTired: () => (deps ? deps.getProfile().sushiTired : 0),
      addTired: (delta) => this.handleSushiAddTired(delta),
      addHunger: (delta) => this.handleSushiAddHunger(delta),
      onWoke: () => this.handleSushiWoke(),
      canFillBowl: () => {
        if (!deps) return false
        const profile = deps.getProfile()
        if (profile.bowlServings >= SUSHI_BOWL_FULL_SERVINGS) return false
        const inv = deps.getInventory()
        const stack = inv.stacks.find((s) => s.itemId === STARTER_CAT_FOOD_ID)
        return (stack?.quantity ?? 0) >= SUSHI_CAT_FOOD_REFILL_COST
      },
      hasCatFood: () => {
        if (!deps) return false
        const inv = deps.getInventory()
        const stack = inv.stacks.find((s) => s.itemId === STARTER_CAT_FOOD_ID)
        return (stack?.quantity ?? 0) >= SUSHI_CAT_FOOD_REFILL_COST
      },
      onEatServing: () => this.handleSushiEatServing(),
      onPetted: () => this.handleSushiPetted(),
      onUsedLitter: () => this.handleSushiUsedLitter(),
      onEmptyLitter: () => this.handleEmptyLitter(),
      onFillBowl: () => this.handleSushiFillBowl(),
    })
    this.scene = next
    return next
  }

  /**
   * Apply the side-effects of Sushi consuming one serving: decrement bowl servings,
   * restore hunger, save, re-evaluate achievements.
   */
  private handleSushiEatServing(): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    if (profile.bowlServings <= 0) return
    let next = setBowlServings(profile, profile.bowlServings - 1)
    next = addSushiHunger(next, SUSHI_HUNGER_RESTORE_PER_SERVING)
    deps.setProfile(next)
    saveProfile(next)
    deps.evaluateAchievements()
  }

  /**
   * Apply the side-effects of the player petting Sushi: add love, bump pet stat, save,
   * re-evaluate achievements so the "Beloved" reward fires automatically at threshold.
   */
  private handleSushiPetted(): void {
    const deps = this.deps
    if (!deps) return
    let next = deps.getProfile()
    next = addSushiLove(next, SUSHI_LOVE_PER_PET)
    next = recordSushiPet(next)
    deps.setProfile(next)
    saveProfile(next)
    deps.evaluateAchievements()
  }

  /**
   * Apply the side-effects of Sushi finishing a litterbox visit: drop bladder back to
   * empty and persist the profile. No achievements wired off this for now — it's a
   * pure care-loop reset.
   */
  /**
   * Apply an in-memory tiredness delta from the cat (called per chase frame). To avoid
   * thrashing localStorage, this only mutates the working profile — the periodic decay
   * tick in {@link MapViewController} captures the latest state on its save cadence.
   *
   * @param delta - Tiredness delta in points; positive while chasing the laser.
   */
  private handleSushiAddTired(delta: number): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    const next = addSushiTired(profile, delta)
    if (next === profile) return
    deps.setProfile(next)
  }

  /**
   * Mirror of {@link handleSushiAddTired} for hunger, called by the cat controller
   * each frame while sprinting after the laser pointer. In-memory only — the
   * regular passive needs tick is what persists the field to localStorage.
   *
   * @param delta - Hunger delta in points; positive while chasing the laser.
   */
  private handleSushiAddHunger(delta: number): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    const next = addSushiHunger(profile, delta)
    if (next === profile) return
    deps.setProfile(next)
  }

  /**
   * Sushi just woke from a nap. Reset tiredness to zero and persist immediately so a
   * tab refresh during the wake transition can't strand him at full tired.
   */
  private handleSushiWoke(): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    const next = addSushiTired(profile, -SUSHI_NEEDS_MAX)
    if (next === profile) return
    deps.setProfile(next)
    saveProfile(next)
  }

  private handleSushiUsedLitter(): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    let next = addSushiBladder(profile, -SUSHI_NEEDS_MAX)
    next = addLitterPollution(next, 1)
    if (next === profile) return
    deps.setProfile(next)
    saveProfile(next)
    deps.evaluateAchievements()
  }

  /**
   * Player cleaned the litterbox — reset pollution to zero and persist.
   */
  private handleEmptyLitter(): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    if (profile.litterPollution <= 0) return
    const next = setLitterPollution(profile, 0)
    if (next === profile) return
    deps.setProfile(next)
    saveProfile(next)
  }

  /**
   * Apply the side-effects of refilling the bowl. Only counts toward the achievement
   * counter when the bowl was empty (zero servings) before this call — top-offs of a
   * partially-full bowl still bring the bowl to {@link SUSHI_BOWL_FULL_SERVINGS} but do
   * not bump the lifetime refill stat.
   */
  private handleSushiFillBowl(): void {
    const deps = this.deps
    if (!deps) return
    const profile = deps.getProfile()
    if (profile.bowlServings >= SUSHI_BOWL_FULL_SERVINGS) return
    const inv = deps.getInventory()
    const removed = removeItem(inv, STARTER_CAT_FOOD_ID, SUSHI_CAT_FOOD_REFILL_COST)
    if (!removed.ok) return
    deps.setInventory(removed.inventory)
    const wasEmpty = profile.bowlServings <= 0
    let nextProfile = setBowlServings(profile, SUSHI_BOWL_FULL_SERVINGS)
    if (wasEmpty) nextProfile = recordSushiBowlRefill(nextProfile)
    deps.setProfile(nextProfile)
    saveProfile(nextProfile)
    if (wasEmpty) deps.evaluateAchievements()
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
    // On return visits the waking_up cinematic is skipped — snap the player to the hatch
    // entry position so it feels like stepping through the door rather than waking in bed.
    if (!deps.isFirstHabitatEntry() && this.scene) {
      this.scene.setHatchSpawn()
    }
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
    if (this.scene && this.pointerLockAttached) {
      if (this.pointerLock.consumeLeftMouseJustPressed()) {
        this.scene.onPrimaryClick()
      }
      // Forward LMB-held each frame so the scene can drive the laser-pointer
      // chase: dot position is raycast against the floor plane and the cat's
      // chase target is updated for as long as the button is held.
      this.scene.setLaserPointerHeld(this.pointerLock.isLeftMouseDown)
    }
    this.scene?.tick(dt)
  }

  /**
   * Re-request pointer lock using the session's tracked canvas element.
   *
   * Must be called from within a user-gesture context (click/keydown handler) so the browser
   * grants the lock without a security error. Safe to call while already locked — the session
   * guards against a redundant `requestPointerLock()` call.
   */
  reRequestLock(): void {
    if (!this.pointerLockAttached) return
    this.pointerLock.requestLock()
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
    this.pointerLock.releaseLock()
    this.pointerLock.detach()
    this.pointerLockAttached = false
  }
}
