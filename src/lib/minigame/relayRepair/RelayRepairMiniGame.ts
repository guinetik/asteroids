/**
 * Relay repair minigame — Vue-overlay-presented. Contract bridge for the
 * `OrbitalMiniGame` host. All puzzle state, RAF loop, and rendering live in
 * `RelayRepairCanvas.vue`. The canvas reports current quality via
 * `reportQuality` so HUD code can read `progressCurrent` without reaching
 * into the component.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'

/**
 * Relay repair minigame — see file header for architecture notes.
 *
 * @author guinetik
 * @date 2026-04-20
 */
export class RelayRepairMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** Shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Relay renders inside a Vue overlay. */
  readonly presentation = 'overlay' as const

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Approach Relay Bay', complete: true, active: false },
    { label: 'Reterminate Backbone', complete: false, active: true },
    { label: 'Confirm Carrier Lock', complete: false, active: false },
  ]
  private _quality = 0

  /** Minigame completed — fires with mission id. Set by host. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. Set by host. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new relay repair minigame.
   *
   * @param missionId - shuttle mission id
   */
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

  /** Progress numerator — latest quality rounded to an integer percent. */
  get progressCurrent(): number {
    return Math.round(this._quality * 100)
  }

  /** Progress denominator — always 100 (percent scale). */
  get progressTotal(): number {
    return 100
  }

  /**
   * Per-frame update. No-op — the canvas drives all state via `reportQuality`.
   *
   * @param _dt - Delta time (unused).
   * @param _ctx - Map scene context (unused).
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — canvas-driven.
  }

  /**
   * Called by the canvas each tick with the current quality so the HUD
   * tracker can display progress without reaching into component state.
   *
   * @param quality - Current quality in [0, 1].
   */
  reportQuality(quality: number): void {
    if (this._status !== 'active') return
    this._quality = quality
  }

  /**
   * Finalize the minigame. Idempotent — subsequent calls are ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    const reterm = this._steps[1]
    const confirm = this._steps[2]
    if (reterm) {
      reterm.complete = true
      reterm.active = false
    }
    if (confirm) {
      confirm.complete = true
      confirm.active = false
    }
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op. */
  dispose(): void {
    // No resources held; canvas manages its own RAF + listener teardown.
  }
}
