/**
 * Survey minigame — gravitometric probe calibration.
 *
 * Manages terminal placement, probe spawning/collection, timer,
 * and EVA terminal interaction for a single survey objective.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
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
import { SurveyProbeController } from '@/three/SurveyProbeController'
import { generateValidatedProbePositions } from '@/lib/survey/probePositions'
import type { WorldCollider } from '@/lib/physics/worldCollision'

/** Default time limit if objective doesn't specify one. */
const DEFAULT_TIME_LIMIT = 90

/** Default probe count if objective doesn't specify one. */
const DEFAULT_PROBE_COUNT = 5

/**
 * Survey minigame instance for one survey objective.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class SurveyMinigame implements MiniGame, MiniGameEvents {
  readonly objectiveIndex: number

  private _status: MiniGameStatus = 'idle'
  private _timeRemaining: number
  private _isPlayerNear = false

  /** Step definitions — updated each frame to reflect current state. */
  private readonly _steps: MiniGameStep[] = [
    { label: 'Locate the terminal', complete: false, active: true },
    { label: 'Begin the survey', complete: false, active: false },
    { label: 'Collect the probes', complete: false, active: false },
    { label: 'Deliver the data', complete: false, active: false },
  ]

  private readonly terminal: TerminalModel
  /** Static collision volumes owned by this survey objective. */
  readonly worldColliders: readonly WorldCollider[]
  private probeController: SurveyProbeController | null = null
  private readonly scene: THREE.Scene
  private readonly heightmap: Heightmap
  private readonly objective: ConcreteObjective
  private readonly seed: number

  /** Refuel callback — called when survey activates. */
  onRefuel: (() => void) | null = null

  /** Register a tickable with the tick handler. */
  onRegisterTickable: ((tickable: Tickable) => void) | null = null

  /** Unregister a tickable from the tick handler. */
  onUnregisterTickable: ((tickable: Tickable) => void) | null = null

  /** Called each time the lander collects a survey probe. */
  onProbeCollect: (() => void) | null = null

  // ── MiniGameEvents ──────────────────────────────────────────
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null = null

  /** Current minigame status. */
  get status(): MiniGameStatus {
    return this._status
  }

  /** Whether the player is near the terminal. */
  get isPlayerNearInteraction(): boolean {
    return this._isPlayerNear
  }

  /** Time remaining in seconds (null if not active). */
  get timeRemaining(): number | null {
    return this._status === 'active' ? this._timeRemaining : null
  }

  /** Probes collected (null if no probe controller). */
  get progressCurrent(): number | null {
    return this.probeController ? this.probeController.collected : null
  }

  /** Total probes (null if no probe controller). */
  get progressTotal(): number | null {
    return this.probeController ? this.probeController.total : null
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly MiniGameStep[] {
    return this._steps
  }

  /** The terminal model (for scene access). */
  get terminalGroup(): THREE.Group {
    return this.terminal.group
  }

  constructor(
    objectiveIndex: number,
    objective: ConcreteObjective,
    scene: THREE.Scene,
    heightmap: Heightmap,
    seed: number,
  ) {
    this.objectiveIndex = objectiveIndex
    this.objective = objective
    this.scene = scene
    this.heightmap = heightmap
    this.seed = seed
    this._timeRemaining = objective.timeLimit ?? DEFAULT_TIME_LIMIT

    // Place terminal at the flat zone
    const groundY = heightmap.heightAt(objective.x, objective.z)
    this.terminal = new TerminalModel()
    this.terminal.placeAt(objective.x + 5, groundY, objective.z)
    this.worldColliders = [this.terminal.createWorldCollider(`survey-terminal-${objectiveIndex}`)]
    scene.add(this.terminal.group)
  }

  /** Per-frame update. */
  tick(dt: number, ctx: MiniGameContext): void {
    this.terminal.tick(dt)
    if (this._status === 'completed') return

    // Timer countdown
    if (this._status === 'active') {
      this._timeRemaining -= dt
      if (this._timeRemaining <= 0) {
        this._timeRemaining = 0
        this._status = 'failed'
        this.cleanupProbes()
        return
      }

      // Probe collection in lander
      if (ctx.levelState === 'lander' && ctx.landerPosition && this.probeController) {
        const pos = new THREE.Vector3(
          ctx.landerPosition.x,
          ctx.landerPosition.y,
          ctx.landerPosition.z,
        )
        this.probeController.checkCollection(pos)
      }
    }

    // Terminal interaction in EVA
    this._isPlayerNear = false
    if (ctx.levelState === 'eva' && ctx.playerPosition) {
      const dx = ctx.playerPosition.x - this.terminal.position.x
      const dz = ctx.playerPosition.z - this.terminal.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist <= TERMINAL_INTERACT_RANGE) {
        this._isPlayerNear = true
        this.advanceStep(0) // Located the terminal

        if (this._status === 'idle') {
          this.onPrompt?.('[E] BEGIN GRAVITOMETRIC SURVEY')
          if (ctx.terminalInteractPressed) this.activate()
        } else if (this._status === 'failed') {
          this.onPrompt?.('[E] RETRY GRAVITOMETRIC SURVEY')
          if (ctx.terminalInteractPressed) this.activate()
        } else if (this._status === 'active' && this.probeController?.allCollected) {
          this.onPrompt?.('[E] DELIVER CALIBRATION DATA')
          if (ctx.terminalInteractPressed) this.deliver()
        }
      }
    }

    // Step 2: track probe collection progress
    if (this._status === 'active' && this.probeController?.allCollected) {
      this.advanceStep(2)
    }
  }

  /** Mark a step complete and activate the next one. */
  private advanceStep(index: number): void {
    const step = this._steps[index]
    if (!step || step.complete) return
    step.complete = true
    step.active = false
    // Activate the next incomplete step
    const next = this._steps.find((s) => !s.complete)
    if (next) next.active = true
    this.onStepChange?.(this.objectiveIndex, this._steps)
  }

  /** Reset all steps to initial state (for retry). */
  private resetSteps(): void {
    for (const step of this._steps) {
      step.complete = false
      step.active = false
    }
    this._steps[0]!.active = true
  }

  /** Start or restart the survey. */
  private activate(): void {
    this.cleanupProbes()
    this.resetSteps()
    this.advanceStep(0) // Already at terminal
    this.advanceStep(1) // Just started

    this._status = 'active'
    this._timeRemaining = this.objective.timeLimit ?? DEFAULT_TIME_LIMIT

    // Refuel lander
    this.onRefuel?.()

    // Generate probe positions
    const probePositions = generateValidatedProbePositions(
      this.objective.probeCount ?? DEFAULT_PROBE_COUNT,
      this.objective.x,
      this.objective.z,
      this.seed + this.objectiveIndex,
      this.heightmap,
    )
    const positions = probePositions.map((p) => {
      const groundY = this.heightmap.tryHeightAt(p.x, p.z)
      if (groundY === null) {
        throw new Error(
          `[SurveyMinigame] Validated survey column unexpectedly invalid at (${String(p.x)}, ${String(p.z)}).`,
        )
      }
      return new THREE.Vector3(p.x, groundY + p.y, p.z)
    })

    this.probeController = new SurveyProbeController(this.scene)
    this.probeController.onCollect = () => this.onProbeCollect?.()
    this.probeController.spawn(positions, this.terminal.position)
    this.onRegisterTickable?.(this.probeController)
    this.onPrompt?.(null)
  }

  /** Deliver collected data — objective complete. */
  private deliver(): void {
    this.advanceStep(3)
    this._status = 'completed'
    this.onPrompt?.(null)
    this.onComplete?.(this.objectiveIndex)
  }

  /** Remove probes from the scene. */
  private cleanupProbes(): void {
    if (this.probeController) {
      this.onUnregisterTickable?.(this.probeController)
      this.probeController.dispose()
      this.probeController = null
    }
  }

  /** Clean up all 3D resources. */
  dispose(): void {
    this.cleanupProbes()
    this.terminal.dispose()
    this.scene.remove(this.terminal.group)
  }
}
