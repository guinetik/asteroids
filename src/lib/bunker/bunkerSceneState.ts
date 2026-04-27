/**
 * Sub-state machine for the bunker interior.
 *
 * Drives the per-tick flow inside the bunker: enter → idle in antechamber →
 * waves (active + breather) → final clear → exit prompt → exiting. Owns the
 * breather countdown timer and emits transitions through `onTransition`.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */

/** Discrete sub-states of the bunker interior. */
export type BunkerSubState =
  | 'entering'
  | 'antechamber-idle'
  | 'wave-active'
  | 'wave-breather'
  | 'final-clear'
  | 'exit-prompt'
  | 'exiting'

/** Default seconds between waves while no enemies are alive. */
const DEFAULT_BREATHER_SECONDS = 3.0

/** Seconds spent on the brief `final-clear` celebration before transitioning to `exit-prompt`. */
const FINAL_CLEAR_HOLD_SECONDS = 0.6

/** Constructor options for {@link BunkerSceneState}. */
export interface BunkerSceneStateOptions {
  /** Total wave count this tier requires. */
  totalWaves: number
  /** Seconds between waves. Defaults to {@link DEFAULT_BREATHER_SECONDS}. */
  breatherSeconds?: number
  /** Fired on every transition. Argument is the new state. */
  onTransition?: (next: BunkerSubState, previous: BunkerSubState) => void
}

/**
 * Bunker interior sub-FSM. Transitions are driven by the minigame via the
 * `notify*` methods; the only time-based transition is the breather → next
 * wave handoff and the brief final-clear hold.
 */
export class BunkerSceneState {
  private _current: BunkerSubState = 'entering'
  private _currentWaveIndex = -1
  private timer = 0
  private readonly totalWaves: number
  private readonly breatherSeconds: number
  private readonly onTransition?: (next: BunkerSubState, previous: BunkerSubState) => void

  /**
   * @param opts - Wave count, breather length, optional transition listener
   */
  constructor(opts: BunkerSceneStateOptions) {
    this.totalWaves = opts.totalWaves
    this.breatherSeconds = opts.breatherSeconds ?? DEFAULT_BREATHER_SECONDS
    this.onTransition = opts.onTransition
  }

  /** Current sub-state. */
  get current(): BunkerSubState {
    return this._current
  }

  /** Zero-based index of the wave currently active or last cleared. -1 before wave 1. */
  get currentWaveIndex(): number {
    return this._currentWaveIndex
  }

  /**
   * Advance internal timers. Call once per simulation tick.
   *
   * @param dt - Delta time in seconds
   */
  tick(dt: number): void {
    if (this._current === 'wave-breather') {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0) {
        this._currentWaveIndex += 1
        this.transition('wave-active')
      }
      return
    }
    if (this._current === 'final-clear') {
      this.timer = Math.max(0, this.timer - dt)
      if (this.timer <= 0) {
        this.transition('exit-prompt')
      }
    }
  }

  /** Called by the scene controller after `activate` finishes. */
  notifyActivated(): void {
    if (this._current === 'entering') this.transition('antechamber-idle')
  }

  /** Called when the player presses E on the arena door. */
  notifyDoorInteracted(): void {
    if (this._current !== 'antechamber-idle') return
    this._currentWaveIndex = 0
    this.transition('wave-active')
  }

  /** Called when the active wave's enemies are all dead. */
  notifyWaveCleared(): void {
    if (this._current !== 'wave-active') return
    const isFinal = this._currentWaveIndex >= this.totalWaves - 1
    if (isFinal) {
      this.timer = FINAL_CLEAR_HOLD_SECONDS
      this.transition('final-clear')
    } else {
      this.timer = this.breatherSeconds
      this.transition('wave-breather')
    }
  }

  /** Called when the player presses E on the antechamber exit hatch. */
  notifyHatchInteracted(): void {
    if (this._current !== 'exit-prompt') return
    this.transition('exiting')
  }

  /**
   * Internal transition with listener emission.
   *
   * @param next - The new sub-state
   */
  private transition(next: BunkerSubState): void {
    if (next === this._current) return
    const prev = this._current
    this._current = next
    this.onTransition?.(next, prev)
  }
}
