/**
 * State machine + fade driver for the map-turret mining session.
 *
 * Lifecycle: idle → opening → active → closing → idle. The host
 * ({@link MapViewController}) treats `isActive === true` as a signal to
 * early-return from its tick loop, freezing flight/gravity/health sim.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import {
  TURRET_CLOSING_COMPLETE_THRESHOLD,
  TURRET_FADE_IN_DURATION,
  TURRET_FADE_OUT_DURATION,
  TURRET_OPENING_COMPLETE_THRESHOLD,
} from './turretConstants'

/** Discrete session phases. */
export type TurretPhase = 'idle' | 'opening' | 'active' | 'closing'

/** Per-frame input bag the host hands to the session. */
export interface TurretSessionTickInput {
  /** True when exit binding was pressed this frame. */
  exitPressed: boolean
}

/** Host-supplied collaborators. Kept small so tests can stub with no Three state. */
export interface TurretSessionDeps {
  /** One-shot hook fired at idle → opening. Host registers rocks, attaches rig, etc. */
  onOpen: () => void
  /** One-shot hook fired at closing → idle. Host tears down rig, unregisters rocks. */
  onClose: () => void
  /** Per-frame hook while phase === 'active'. Host runs beam tick + yield commits. */
  tickActive: (input: TurretSessionTickInput, dt: number) => void
  /** True if the shuttle entered death state during the session. Forces closing. */
  shuttleIsDead: () => boolean
}

/**
 * Turret session state machine. Owns `phase` and `fadeOpacity`; everything
 * else (camera, beam, input polling) lives in {@link TurretSessionDeps}.
 */
export class TurretSession {
  private readonly deps: TurretSessionDeps
  private _phase: TurretPhase = 'idle'
  private _fadeOpacity = 0

  /** @param deps - Host-supplied collaborators for hooks and active-frame logic. */
  constructor(deps: TurretSessionDeps) {
    this.deps = deps
  }

  /** Current phase. */
  get phase(): TurretPhase {
    return this._phase
  }

  /** Current fade opacity [0, 1]. 0 = fully transparent, 1 = fully black. */
  get fadeOpacity(): number {
    return this._fadeOpacity
  }

  /** True while phase !== 'idle'. Host uses this to branch the tick loop. */
  get isActive(): boolean {
    return this._phase !== 'idle'
  }

  /** Enter the session. No-op if already active. */
  open(): void {
    if (this._phase !== 'idle') return
    this._phase = 'opening'
    this._fadeOpacity = 0
    this.deps.onOpen()
  }

  /** Request an exit. No-op unless currently active. */
  requestExit(): void {
    if (this._phase === 'active') {
      this._phase = 'closing'
    }
  }

  /** Advance state machine by one frame. */
  tick(dt: number, input: TurretSessionTickInput): void {
    switch (this._phase) {
      case 'idle':
        return

      case 'opening': {
        this._fadeOpacity = Math.min(1, this._fadeOpacity + dt / TURRET_FADE_IN_DURATION)
        if (this._fadeOpacity >= TURRET_OPENING_COMPLETE_THRESHOLD) {
          this._phase = 'active'
        }
        return
      }

      case 'active': {
        if (this.deps.shuttleIsDead()) {
          this._phase = 'closing'
          return
        }
        if (input.exitPressed) {
          this._phase = 'closing'
          return
        }
        if (this._fadeOpacity > 0) {
          this._fadeOpacity = Math.max(0, this._fadeOpacity - dt / TURRET_FADE_OUT_DURATION)
        }
        this.deps.tickActive(input, dt)
        return
      }

      case 'closing': {
        this._fadeOpacity = Math.max(0, this._fadeOpacity - dt / TURRET_FADE_OUT_DURATION)
        if (this._fadeOpacity <= TURRET_CLOSING_COMPLETE_THRESHOLD) {
          this._phase = 'idle'
          this._fadeOpacity = 0
          this.deps.onClose()
        }
        return
      }
    }
  }
}
