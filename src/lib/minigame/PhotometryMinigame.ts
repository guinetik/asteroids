/**
 * Photometry minigame — off-axis X-ray asteroid exposure.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type {
  MiniGame,
  MiniGameStatus,
  MiniGameContext,
  MiniGameEvents,
  MiniGameStep,
} from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { PhotometryProbeController } from '@/three/PhotometryProbeController'
import type { WorldCollider } from '@/lib/physics/worldCollision'
import {
  computePhotometryProbeTarget,
  computePhotometryStandoffDistance,
  findClosestPhotometrySurfacePoint,
} from '@/lib/photometry/photometryGeometry'

/** Default mission timer for photometry objectives. */
const DEFAULT_TIME_LIMIT = 210

/** Default scan hold duration in seconds. */
const DEFAULT_SCAN_HOLD_SECONDS = 8

/** Approximate mid-height used for the standoff when terrain bounds are not available. */
export const DEFAULT_PHOTOMETRY_ASTEROID_MID_Y = 180

/** Surface marker height used only to find the closest asteroid X/Z focus. */
const SCAN_TARGET_SURFACE_SAMPLE_HEIGHT = 0

/** Max inferred lander speed that still counts as a stable exposure hold. */
const SCAN_STABLE_SPEED = 80

/** Radius around the asteroid focus point that counts as a beam hit. */
const SCAN_TARGET_LOCK_RADIUS = 70

/** Max horizontal range from the probe standoff where scan UI and beam are visible. */
const SCAN_STANDOFF_VISUAL_HORIZONTAL_RANGE = 450

/** Length of the forward scan beam used for lock testing. */
const SCAN_BEAM_LENGTH = 2600

/** Lander-local roof offset used as the beam emitter. */
const LANDER_SCAN_EMITTER_TOP_OFFSET = 24

/** Scan progress lost per second when the lander drifts out of lock. */
const SCAN_DECAY_RATE = 0.5

/** Terminal visual offset from objective site. */
const TERMINAL_OFFSET_X = 5

/** HUD instruction shown before the standoff probe is collected. */
const PHOTOMETRY_INSTRUCTION_FLY_TO_PROBE = 'FLY TO PHOTOMETRY PROBE'

/** HUD instruction shown after probe pickup when the lander drifts away from the standoff. */
const PHOTOMETRY_INSTRUCTION_RETURN_TO_STANDOFF = 'RETURN TO PHOTOMETRY STANDOFF'

/** HUD instruction shown while the beam is visible but not locked to the target marker. */
const PHOTOMETRY_INSTRUCTION_ALIGN_TARGET = 'ALIGN WITH TARGET MARKER'

/** HUD instruction shown while scan lock is green and progress is increasing. */
const PHOTOMETRY_INSTRUCTION_HOLD_POSITION = 'FIRING X-RAY - HOLD POSITION'

/** HUD instruction shown once the asteroid flash is collecting the final dataset. */
const PHOTOMETRY_INSTRUCTION_COLLECTING_DATA = 'COLLECTING PHOTOMETRY DATA'

/** HUD instruction shown after data collection finishes and telemetry is ready. */
const PHOTOMETRY_INSTRUCTION_RETURN_TELEMETRY = 'RETURN TELEMETRY TO TERMINAL'

/** Seconds the post-scan data collection prompt stays visible. */
const PHOTOMETRY_DATA_COLLECTION_SECONDS = 5

/**
 * Audio state emitted by photometry scan logic.
 *
 * @author guinetik
 * @date 2026-04-26
 */
export interface PhotometryScanAudioState {
  /** True while the scan beam is visible. */
  visible: boolean
  /** True while the visible scan beam is aligned and earning scan progress. */
  locked: boolean
  /** Scan progress fraction in `[0, 1]`, for example `0.5`. */
  progress: number
}

/**
 * Photometry minigame instance for one objective.
 *
 * @author guinetik
 * @date 2026-04-26
 */
export class PhotometryMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _timeRemaining: number
  private _isPlayerNear = false
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the terminal', complete: false, active: true },
    { label: 'Launch the photometry probe', complete: false, active: false },
    { label: 'Fly to the standoff probe', complete: false, active: false },
    { label: 'Hold the scan lock', complete: false, active: false },
    { label: 'Return photometry telemetry', complete: false, active: false },
  ]

  private readonly terminal: TerminalModel
  /** Static collision volumes owned by this photometry objective. */
  readonly worldColliders: readonly WorldCollider[]
  private probeController: PhotometryProbeController | null = null
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly objective: ConcreteObjective
  private readonly seed: number
  private readonly asteroidRoot: THREE.Object3D | null
  private readonly probeTarget = new THREE.Vector3()
  private readonly scanTarget = new THREE.Vector3()
  private readonly lastLanderPosition = new THREE.Vector3()
  private hasLastLanderPosition = false
  private scanProgress = 0
  private scanComplete = false
  private scanBeamVisible = false
  private scanBeamLocked = false
  private dataCollectionRemaining = 0

  /** Refuel callback — called when photometry activates. */
  onRefuel: (() => void) | null = null

  /** Register a tickable with the level tick handler. */
  onRegisterTickable: ((tickable: Tickable) => void) | null = null

  /** Unregister a tickable from the level tick handler. */
  onUnregisterTickable: ((tickable: Tickable) => void) | null = null

  /** Called when the lander collects the photometry probe. */
  onProbeCollect: (() => void) | null = null

  /** Called when photometry scan audio visibility, lock, or progress changes. */
  onScanAudioState: ((state: PhotometryScanAudioState) => void) | null = null

  // ── MiniGameEvents ──────────────────────────────────────────
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /** Current minigame status. */
  get status(): MiniGameStatus {
    return this._status
  }

  /** Whether the EVA player is near the terminal. */
  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  /** Time remaining in seconds while active. */
  get timeRemaining(): number | null {
    return this._status === 'active' ? this._timeRemaining : null
  }

  /** Probe collection or scan progress for shared HUD telemetry. */
  get progressCurrent(): number | null {
    if (this._status !== 'active') return null
    if (this.probeController?.allCollected) {
      return Math.floor(this.scanProgress)
    }
    return this.probeController?.collected ?? 0
  }

  /** Probe total or scan hold duration for shared HUD telemetry. */
  get progressTotal(): number | null {
    if (this._status !== 'active') return null
    if (this.probeController?.allCollected) {
      return this.scanHoldSeconds
    }
    return this.probeController?.total ?? 1
  }

  /** Ordered tracker steps. */
  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** Short mission instruction for the lander HUD. */
  get missionInstruction(): string | null {
    if (this._status !== 'active') return null
    if (this.scanComplete) {
      return this.dataCollectionRemaining > 0
        ? PHOTOMETRY_INSTRUCTION_COLLECTING_DATA
        : PHOTOMETRY_INSTRUCTION_RETURN_TELEMETRY
    }
    if (!this.probeController?.allCollected) return PHOTOMETRY_INSTRUCTION_FLY_TO_PROBE
    if (!this.scanBeamVisible) return PHOTOMETRY_INSTRUCTION_RETURN_TO_STANDOFF
    return this.scanBeamLocked
      ? PHOTOMETRY_INSTRUCTION_HOLD_POSITION
      : PHOTOMETRY_INSTRUCTION_ALIGN_TARGET
  }

  /** The terminal model group for scene access. */
  get terminalGroup(): THREE.Group {
    return this.terminal.group
  }

  constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    seed: number,
    asteroidRoot: THREE.Object3D | null = null,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene
    this.heightmap = heightmap
    this.seed = seed
    this.asteroidRoot = asteroidRoot
    this._timeRemaining = objective.timeLimit ?? DEFAULT_TIME_LIMIT

    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.terminal = new TerminalModel()
    this.terminal.placeAt(objective.x + TERMINAL_OFFSET_X, groundY, objective.z)
    this.worldColliders = [this.terminal.createWorldCollider(`photometry-terminal-${objectiveIndex}`)]
    scene.add(this.terminal.group)
  }

  /**
   * Per-frame update.
   *
   * @param dt - Delta time in seconds.
   * @param ctx - Shared minigame context from the level controller.
   */
  tick(dt: number, ctx: MiniGameContext): void {
    this.terminal.tick(dt)
    if (this._status === 'completed') return

    if (this._status === 'active') {
      if (this.tickActive(dt, ctx)) return
    }

    this.tickTerminal(ctx)
  }

  /** Clean up all 3D resources. */
  dispose(): void {
    this.cleanupProbe()
    this.terminal.dispose()
    this.scene.remove(this.terminal.group)
  }

  /** Advance active timer, collection, LOS, and scan state. */
  private tickActive(dt: number, ctx: MiniGameContext): boolean {
    if (!this.scanComplete) {
      this._timeRemaining -= dt
      if (this._timeRemaining <= 0) {
        this._timeRemaining = 0
        this._status = 'failed'
        this.emitScanAudioState(false, false)
        this.cleanupProbe()
        this.onPrompt?.(null)
        return true
      }
    } else {
      this.dataCollectionRemaining = Math.max(0, this.dataCollectionRemaining - dt)
    }

    if (
      ctx.levelState !== 'lander' ||
      !ctx.landerPosition ||
      !ctx.landerForward ||
      !ctx.landerUp ||
      !this.probeController
    ) {
      this.emitScanAudioState(false, false)
      return false
    }

    const landerPosition = new THREE.Vector3(
      ctx.landerPosition.x,
      ctx.landerPosition.y,
      ctx.landerPosition.z,
    )
    const landerForward = new THREE.Vector3(
      ctx.landerForward.x,
      ctx.landerForward.y,
      ctx.landerForward.z,
    ).normalize()
    const landerUp = new THREE.Vector3(ctx.landerUp.x, ctx.landerUp.y, ctx.landerUp.z).normalize()
    this.probeController.checkCollection(landerPosition)

    if (this.probeController.allCollected) {
      if (this.scanComplete) {
        this.emitScanAudioState(false, false)
        return false
      }

      this.advanceStep(2)
      if (!this.isLanderNearProbeStandoff(landerPosition)) {
        this.probeController.hideScanVisuals()
        this.emitScanAudioState(false, false)
        this.scanProgress = Math.max(0, this.scanProgress - dt * SCAN_DECAY_RATE)
        return false
      }

      this.probeController.showScanTarget(this.scanTarget)
      const emitterPosition = landerPosition
        .clone()
        .addScaledVector(landerUp, LANDER_SCAN_EMITTER_TOP_OFFSET)
      this.probeController.updateScanBeam(emitterPosition, landerForward)
      this.tickScanHold(dt, landerPosition, emitterPosition, landerForward)
    }
    return false
  }

  /** Handle terminal prompts and E interactions. */
  private tickTerminal(ctx: MiniGameContext): void {
    this._isPlayerNear = false
    if (ctx.levelState !== 'eva' || !ctx.playerPosition) return

    const dx = ctx.playerPosition.x - this.terminal.position.x
    const dz = ctx.playerPosition.z - this.terminal.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist > TERMINAL_INTERACT_RANGE) return

    this._isPlayerNear = true
    this.advanceStep(0)

    if (this._status === 'idle') {
      this.onPrompt?.('[E] LAUNCH PHOTOMETRY PROBE')
      if (ctx.terminalInteractPressed) this.activate()
    } else if (this._status === 'failed') {
      this.onPrompt?.('[E] RETRY PHOTOMETRY PROBE')
      if (ctx.terminalInteractPressed) this.activate()
    } else if (this._status === 'active' && this.scanComplete) {
      this.onPrompt?.('[E] RETURN PHOTOMETRY TELEMETRY')
      if (ctx.terminalInteractPressed) this.deliver()
    }
  }

  /** Start or restart the photometry objective. */
  private activate(): void {
    this.cleanupProbe()
    this.resetSteps()
    this.advanceStep(0)
    this.advanceStep(1)
    this._status = 'active'
    this._timeRemaining = this.objective.timeLimit ?? DEFAULT_TIME_LIMIT
    this.scanProgress = 0
    this.scanComplete = false
    this.scanBeamVisible = false
    this.scanBeamLocked = false
    this.dataCollectionRemaining = 0
    this.hasLastLanderPosition = false
    this.onRefuel?.()

    const terminalY = this.terminal.position.y
    const target = computePhotometryProbeTarget({
      objectiveX: this.objective.x,
      objectiveZ: this.objective.z,
      terminalY,
      asteroidMidY: this.computeAsteroidMidY(),
      probeDistance: computePhotometryStandoffDistance(this.heightmap),
      seed: this.seed + this.objectiveIndex,
    })
    this.probeTarget.set(target.x, target.y, target.z)
    this.computeScanTarget()

    this.probeController = new PhotometryProbeController(this.scene, this.asteroidRoot)
    this.probeController.onCollect = () => this.onProbeCollect?.()
    this.probeController.spawn({
      terminalPosition: this.terminal.position,
      targetPosition: this.probeTarget,
      launchApexY: target.launchApexY,
    })
    this.onRegisterTickable?.(this.probeController)
    this.onPrompt?.(null)
  }

  /** Complete the objective after telemetry is returned to the terminal. */
  private deliver(): void {
    this.advanceStep(4)
    this._status = 'completed'
    this.onPrompt?.(null)
    this.emitScanAudioState(false, false)
    this.onComplete?.(this.objectiveIndex)
    this.cleanupProbe()
  }

  /** Track stable lander hold progress for the exposure. */
  private tickScanHold(
    dt: number,
    landerPosition: THREE.Vector3,
    emitterPosition: THREE.Vector3,
    landerForward: THREE.Vector3,
  ): void {
    if (this.scanComplete) return

    const speed = this.inferLanderSpeed(dt, landerPosition)
    const beamHitsTarget = this.isScanBeamHittingTarget(emitterPosition, landerForward)
    const stable = beamHitsTarget && speed <= SCAN_STABLE_SPEED
    this.probeController?.setScanLocked(stable)
    if (stable) {
      this.scanProgress = Math.min(this.scanHoldSeconds, this.scanProgress + dt)
    } else {
      this.scanProgress = Math.max(0, this.scanProgress - dt * SCAN_DECAY_RATE)
    }
    this.emitScanAudioState(true, stable)

    if (this.scanProgress >= this.scanHoldSeconds) {
      this.scanComplete = true
      this.dataCollectionRemaining = PHOTOMETRY_DATA_COLLECTION_SECONDS
      this.advanceStep(3)
      this.emitScanAudioState(false, false)
      this.probeController?.triggerAsteroidFlash(PHOTOMETRY_DATA_COLLECTION_SECONDS)
      this.probeController?.hideScanVisuals()
      this.probeController?.hideWaypoint()
    }
  }

  /** Whether the lander is close enough to the probe standoff to operate scan visuals. */
  private isLanderNearProbeStandoff(landerPosition: THREE.Vector3): boolean {
    const dx = landerPosition.x - this.probeTarget.x
    const dz = landerPosition.z - this.probeTarget.z
    return Math.sqrt(dx * dx + dz * dz) <= SCAN_STANDOFF_VISUAL_HORIZONTAL_RANGE
  }

  /** Whether the lander's forward scan ray passes through the fixed asteroid target. */
  private isScanBeamHittingTarget(
    emitterPosition: THREE.Vector3,
    landerForward: THREE.Vector3,
  ): boolean {
    const toTarget = this.scanTarget.clone().sub(emitterPosition)
    const projectedDistance = toTarget.dot(landerForward)
    if (projectedDistance < 0 || projectedDistance > SCAN_BEAM_LENGTH) return false

    const closestPoint = emitterPosition.clone().addScaledVector(landerForward, projectedDistance)
    return closestPoint.distanceTo(this.scanTarget) <= SCAN_TARGET_LOCK_RADIUS
  }

  /** Infer lander speed from frame-to-frame position snapshots. */
  private inferLanderSpeed(dt: number, landerPosition: THREE.Vector3): number {
    if (!this.hasLastLanderPosition || dt <= 0) {
      this.lastLanderPosition.copy(landerPosition)
      this.hasLastLanderPosition = true
      return 0
    }

    const speed = landerPosition.distanceTo(this.lastLanderPosition) / dt
    this.lastLanderPosition.copy(landerPosition)
    return speed
  }

  /** Find a practical asteroid mid-height from the heightmap, with a safe fallback. */
  private computeAsteroidMidY(): number {
    const grid = this.heightmap.grid
    if (!grid || grid.length === 0) return DEFAULT_PHOTOMETRY_ASTEROID_MID_Y

    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (let i = 0; i < grid.length; i++) {
      const value = grid[i]!
      if (value < min) min = value
      if (value > max) max = value
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      return DEFAULT_PHOTOMETRY_ASTEROID_MID_Y
    }
    return (min + max) / 2
  }

  /** Compute the asteroid-side target point used by the LOS visual. */
  private computeScanTarget(): void {
    const closest = findClosestPhotometrySurfacePoint(
      this.heightmap,
      this.probeTarget,
      SCAN_TARGET_SURFACE_SAMPLE_HEIGHT,
    )
    if (closest) {
      this.scanTarget.set(closest.x, this.probeTarget.y, closest.z)
      return
    }

    this.scanTarget.set(this.objective.x, this.probeTarget.y, this.objective.z)
  }

  /** Mark a step complete and activate the next incomplete step. */
  private advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    const next = this._steps.find((candidate) => !candidate.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  /** Reset all tracker steps for a retry. */
  private resetSteps(): void {
    for (const step of this._steps) {
      step.complete = false
      step.active = false
    }
    this._steps[0]!.active = true
  }

  /** Emit scan audio state using current normalized scan progress. */
  private emitScanAudioState(visible: boolean, locked: boolean): void {
    this.scanBeamVisible = visible
    this.scanBeamLocked = visible && locked
    this.onScanAudioState?.({
      visible,
      locked: this.scanBeamLocked,
      progress: visible ? this.scanProgress / Math.max(this.scanHoldSeconds, 1) : 0,
    })
  }

  /** Remove the active probe controller and transient visuals. */
  private cleanupProbe(): void {
    if (!this.probeController) return
    this.emitScanAudioState(false, false)
    this.onUnregisterTickable?.(this.probeController)
    this.probeController.dispose()
    this.probeController = null
  }

  /** Required scan hold duration. */
  private get scanHoldSeconds(): number {
    return this.objective.scanHoldSeconds ?? DEFAULT_SCAN_HOLD_SECONDS
  }
}
