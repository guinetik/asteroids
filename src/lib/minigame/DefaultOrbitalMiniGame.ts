/**
 * Default orbital minigame — instant button completion.
 *
 * Wraps the existing "Complete Mission" button behavior in the
 * OrbitalMiniGame interface. tick() is a no-op; complete() is
 * called directly by the overlay UI.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from './OrbitalMiniGame'

/**
 * Default orbital minigame — instant completion via button press.
 *
 * tick() is a no-op; the UI calls complete() directly when the player
 * presses the "Complete Mission" button while orbiting the target planet.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export class DefaultOrbitalMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Default minigame renders as a Vue overlay card. */
  readonly presentation = 'overlay' as const

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Complete Mission', complete: false, active: true },
  ]

  /** Minigame completed — fires with mission id. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  constructor(missionId: string) {
    this.missionId = missionId
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — null for button-driven minigames. */
  get progressCurrent(): number | null {
    return null
  }

  /** Progress denominator — null for button-driven minigames. */
  get progressTotal(): number | null {
    return null
  }

  /**
   * Per-frame update. No-op — this minigame is UI-driven.
   *
   * @param _dt - Delta time in seconds (unused)
   * @param _ctx - Current map scene context (unused)
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — UI-driven completion
  }

  /**
   * Complete the minigame. Transitions status to 'completed', fires
   * onStepChange and onComplete callbacks. Idempotent — subsequent
   * calls after the first are silently ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    this._steps[0]!.complete = true
    this._steps[0]!.active = false
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op for this minigame. */
  dispose(): void {
    // No resources to clean up
  }
}
