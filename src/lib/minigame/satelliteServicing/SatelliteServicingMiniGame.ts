/**
 * Satellite servicing minigame — in-scene 3D minigame where the player EVAs
 * broken components on a satellite; each part is repaired by shooting it with
 * the map EVA science multitool until its health is restored. This class is
 * the OrbitalMiniGame contract bridge: it tracks the damaged component list,
 * exposes progress, and fires onComplete when every component has been repaired.
 * Wireframe overlays and hit testing live in `SatelliteRepairController`.
 *
 * @author guinetik
 * @date 2026-04-19
 * @spec docs/superpowers/specs/2026-04-19-eva-minigame-wiring-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'

/**
 * Satellite servicing minigame. Driven by `SatelliteRepairController` in the
 * 3D scene; this class is purely the lifecycle + progress contract.
 *
 * @author guinetik
 * @date 2026-04-19
 */
export class SatelliteServicingMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** This minigame drives the 3D scene directly — no Vue overlay. */
  readonly presentation = 'in_scene' as const

  /** Names of components that start damaged. Immutable after construction. */
  readonly brokenComponents: readonly string[]

  private readonly _repaired: Set<string> = new Set()
  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Approach Satellite', complete: true, active: false },
    { label: 'Fix Damaged Parts', complete: false, active: true },
    { label: 'Confirm Repair', complete: false, active: false },
  ]

  /** Minigame completed — fires with mission id. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Creates a new `SatelliteServicingMiniGame`.
   *
   * @param missionId - The shuttle mission id this minigame tracks.
   * @param brokenComponents - Names of satellite sub-objects that need repair.
   */
  constructor(missionId: string, brokenComponents: readonly string[]) {
    this.missionId = missionId
    this.brokenComponents = [...brokenComponents]
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Number of components repaired so far. */
  get progressCurrent(): number {
    return this._repaired.size
  }

  /** Total number of components to repair. */
  get progressTotal(): number {
    return this.brokenComponents.length
  }

  /**
   * Per-frame update. No-op — progress is driven by controller calls to
   * `markRepaired`.
   *
   * @param _dt - Delta time (unused).
   * @param _ctx - Map scene context (unused).
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — controller-driven.
  }

  /**
   * Mark a component as repaired. Unknown component names are ignored.
   * When every `brokenComponents` entry has been repaired, transitions to
   * completed and fires `onComplete`.
   *
   * @param componentName - Name of the rigged sub-object that was repaired.
   */
  markRepaired(componentName: string): void {
    if (this._status !== 'active') return
    if (!this.brokenComponents.includes(componentName)) return
    if (this._repaired.has(componentName)) return
    this._repaired.add(componentName)
    if (this._repaired.size >= this.brokenComponents.length) {
      this.complete()
    }
  }

  /**
   * Finalize the minigame. Idempotent — subsequent calls are ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    this._steps[1]!.complete = true
    this._steps[1]!.active = false
    this._steps[2]!.complete = true
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op. */
  dispose(): void {
    // No resources to clean up; controller handles scene cleanup separately.
  }
}
