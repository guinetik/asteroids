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
import type { MiniGame, MiniGameStatus, MiniGameContext, MiniGameEvents } from './MiniGame'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'
import { TerminalModel, TERMINAL_INTERACT_RANGE } from '@/three/TerminalModel'
import { SurveyProbeController } from '@/three/SurveyProbeController'
import { generateProbePositions } from '@/lib/survey/probePositions'

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

  private readonly terminal: TerminalModel
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

  // ── MiniGameEvents ──────────────────────────────────────────
  onPrompt: ((text: string | null) => void) | null = null
  onComplete: ((objectiveIndex: number) => void) | null = null

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
    scene.add(this.terminal.group)
  }

  /** Per-frame update. */
  tick(dt: number, ctx: MiniGameContext): void {
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

        if (this._status === 'idle') {
          this.onPrompt?.('[F] BEGIN GRAVITOMETRIC SURVEY')
          if (ctx.interactPressed) this.activate()
        } else if (this._status === 'failed') {
          this.onPrompt?.('[F] RETRY GRAVITOMETRIC SURVEY')
          if (ctx.interactPressed) this.activate()
        } else if (this._status === 'active' && this.probeController?.allCollected) {
          this.onPrompt?.('[F] DELIVER CALIBRATION DATA')
          if (ctx.interactPressed) this.deliver()
        }
      }
    }
  }

  /** Start or restart the survey. */
  private activate(): void {
    this.cleanupProbes()

    this._status = 'active'
    this._timeRemaining = this.objective.timeLimit ?? DEFAULT_TIME_LIMIT

    // Refuel lander
    this.onRefuel?.()

    // Generate probe positions
    const probePositions = generateProbePositions(
      this.objective.probeCount ?? DEFAULT_PROBE_COUNT,
      this.objective.x,
      this.objective.z,
      this.seed + this.objectiveIndex,
    )
    const positions = probePositions.map((p) => {
      const groundY = this.heightmap.heightAt(p.x, p.z)
      return new THREE.Vector3(p.x, groundY + p.y, p.z)
    })

    this.probeController = new SurveyProbeController(this.scene)
    this.probeController.spawn(positions, this.terminal.position)
    this.onRegisterTickable?.(this.probeController)
    this.onPrompt?.(null)
  }

  /** Deliver collected data — objective complete. */
  private deliver(): void {
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
