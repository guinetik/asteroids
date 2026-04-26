/**
 * Generic finite state machine with enter/tick/exit lifecycle,
 * timed auto-transitions, and guarded triggers.
 *
 * Port of gcanvas StateMachine to strict TypeScript.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { Tickable } from './Tickable'

/**
 * Describes a guarded, actioned transition to a target state.
 *
 * @typeParam T - The union of all valid state name strings.
 */
export interface TransitionConfig<T extends string> {
  /** The state to transition to when this transition fires. */
  target: T
  /**
   * Optional predicate. If it returns `false` the transition is blocked.
   * Receives the same data payload passed to `trigger()`.
   */
  guard?: (data?: unknown) => boolean
  /**
   * Optional side-effect to run before the transition executes.
   * Called only after the guard passes.
   */
  action?: (data?: unknown) => void
}

/**
 * Configuration for a single state node.
 *
 * @typeParam T - The union of all valid state name strings.
 */
export interface StateConfig<T extends string> {
  /** Called once when the machine enters this state. Receives optional data payload. */
  enter?: (data?: unknown) => void
  /** Called every tick while this state is active. Receives delta time in seconds. */
  tick?: (dt: number) => void
  /** Called once when the machine exits this state. Receives optional data payload. */
  exit?: (data?: unknown) => void
  /**
   * Optional duration in seconds. When `stateTime >= duration` the machine
   * auto-transitions to `next` (or calls `onComplete` if no `next` is set).
   */
  duration?: number
  /** State to transition to automatically once `duration` expires. */
  next?: T
  /**
   * Callback invoked when `duration` expires and no `next` state is defined.
   * The machine stays in the current state; the callback is responsible for
   * any further action.
   */
  onComplete?: () => void
  /**
   * Trigger map. Keys are trigger names; values are either a target state string
   * or a full {@link TransitionConfig} with optional guard and action.
   */
  on?: Record<string, T | TransitionConfig<T>>
}

/**
 * Top-level configuration passed to the {@link StateMachine} constructor.
 *
 * @typeParam T - The union of all valid state name strings.
 */
export interface StateMachineConfig<T extends string> {
  /** The state the machine enters on construction. If omitted, `state` starts as `null`. */
  initial?: T
  /** Full state map. Every state that may ever be entered must appear here. */
  states: Record<T, StateConfig<T>>
  /**
   * Optional context object. When provided, every lifecycle callback is called
   * with `this` bound to this object.
   */
  context?: unknown
}

/**
 * Generic finite state machine.
 *
 * Supports:
 * - Named states with `enter` / `tick` / `exit` lifecycle hooks
 * - Timed auto-transitions via `duration` + `next`
 * - Named triggers with optional guards and actions
 * - Context binding so callbacks can reference a shared object via `this`
 * - `fromSequence` static factory for linear phase chains
 *
 * Implements {@link Tickable} so it can be registered in any game loop.
 *
 * @typeParam T - String union of all valid state names.
 *
 * @example
 * ```ts
 * type S = 'idle' | 'running'
 * const sm = new StateMachine<S>({
 *   initial: 'idle',
 *   states: {
 *     idle: { on: { start: 'running' } },
 *     running: { tick: (dt) => console.log('running', dt) },
 *   },
 * })
 * sm.trigger('start') // → true, transitions to 'running'
 * sm.tick(0.016)      // calls running.tick
 * ```
 */
export class StateMachine<T extends string> implements Tickable {
  /** Internal state map, keyed by state name. */
  private states: Record<string, StateConfig<T>>
  /** The active state name, or `null` before the first state is entered. */
  private currentState: T | null = null
  /** The state that was active before the most recent transition. */
  private _previousState: T | null = null
  /** Seconds spent in the current state. */
  private _stateTime = 0
  /** Whether the machine is paused (ticks are no-ops while paused). */
  private _paused = false
  /** Optional context object for `this`-binding in callbacks. */
  private context: unknown

  /**
   * Optional callback fired after every successful state change.
   *
   * @param current - The state just entered.
   * @param previous - The state just exited (or `null` for the first transition).
   * @param data - The data payload that was passed to `setState` or `trigger`.
   */
  onStateChange: ((current: T, previous: T | null, data?: unknown) => void) | null = null

  /**
   * Constructs a new StateMachine from the given configuration.
   * If `config.initial` is provided the machine immediately enters that state,
   * calling its `enter` hook.
   *
   * @param config - Full machine configuration.
   */
  constructor(config: StateMachineConfig<T>) {
    this.states = { ...config.states }
    this.context = config.context ?? null
    if (config.initial) {
      this.setState(config.initial)
    }
  }

  /** The currently active state name, or `null` if no state has been entered. */
  get state(): T | null {
    return this.currentState
  }

  /** The state that was active before the most recent transition, or `null`. */
  get previousState(): T | null {
    return this._previousState
  }

  /** Seconds elapsed since the current state was entered. */
  get stateTime(): number {
    return this._stateTime
  }

  /** `true` while the machine is paused; ticks are no-ops in this mode. */
  get paused(): boolean {
    return this._paused
  }

  /**
   * Normalised progress through the current timed state, in `[0, 1]`.
   * Returns `0` for states without a `duration`.
   */
  get progress(): number {
    const config = this.currentStateConfig
    if (!config?.duration) return 0
    return Math.min(1, this._stateTime / config.duration)
  }

  /**
   * Seconds remaining until the current timed state auto-transitions.
   * Returns `Infinity` for states without a `duration`.
   */
  get remaining(): number {
    const config = this.currentStateConfig
    if (!config?.duration) return Infinity
    return Math.max(0, config.duration - this._stateTime)
  }

  /**
   * `true` when the current state has a `duration` defined.
   */
  get isTimed(): boolean {
    return this.currentStateConfig?.duration !== undefined
  }

  /** Returns the config object for the current state, or `null`. */
  private get currentStateConfig(): StateConfig<T> | null {
    return this.currentState ? (this.states[this.currentState] ?? null) : null
  }

  /**
   * Returns `true` if the machine is currently in `stateName`.
   *
   * @param stateName - State to test against.
   */
  is(stateName: T): boolean {
    return this.currentState === stateName
  }

  /**
   * Returns `true` if the current state is any of the provided names.
   *
   * @param stateNames - One or more state names to test against.
   */
  isAny(...stateNames: T[]): boolean {
    return this.currentState !== null && stateNames.includes(this.currentState)
  }

  /**
   * Immediately transitions the machine to `newState`.
   *
   * Sequence:
   * 1. Calls `exit` on the current state (if any).
   * 2. Updates `currentState` and `previousState`.
   * 3. Resets `stateTime` to zero.
   * 4. Calls `enter` on the new state.
   * 5. Fires `onStateChange`.
   *
   * @param newState - The state to transition to. Must exist in the states map.
   * @param data - Optional payload forwarded to `exit` and `enter` callbacks.
   * @returns `true` on success, `false` if `newState` is not a known state.
   */
  setState(newState: T, data?: unknown): boolean {
    if (!this.states[newState]) return false
    if (this.currentState) {
      const config = this.states[this.currentState]
      if (config?.exit) this.call(config.exit, data)
    }
    this._previousState = this.currentState
    this.currentState = newState
    this._stateTime = 0
    const newConfig = this.states[newState]
    if (newConfig?.enter) this.call(newConfig.enter, data)
    this.onStateChange?.(newState, this._previousState, data)
    return true
  }

  /**
   * Fires a named trigger on the current state.
   *
   * Looks up the trigger name in the current state's `on` map. If found:
   * - For a plain string value, transitions immediately.
   * - For a {@link TransitionConfig}, runs the guard (blocks if it returns `false`),
   *   runs the action, then transitions.
   *
   * @param name - The trigger event name.
   * @param data - Optional payload forwarded to guard, action, and state callbacks.
   * @returns `true` if a transition occurred, `false` otherwise.
   */
  trigger(name: string, data?: unknown): boolean {
    const config = this.currentStateConfig
    if (!config?.on) return false
    const transition = config.on[name]
    if (!transition) return false
    if (typeof transition === 'string') {
      return this.setState(transition, data)
    }
    if (transition.guard && !this.call(transition.guard, data)) return false
    if (transition.action) this.call(transition.action, data)
    if (transition.target) return this.setState(transition.target, data)
    return false
  }

  /**
   * Advances the machine by `dt` seconds.
   *
   * While not paused:
   * 1. Accumulates `stateTime`.
   * 2. Calls the current state's `tick` callback.
   * 3. Checks timed auto-transition.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    if (this._paused || !this.currentState) return
    this._stateTime += dt
    const config = this.states[this.currentState]
    if (!config) return
    if (config.tick) this.call(config.tick, dt)
    if (config.duration !== undefined && this._stateTime >= config.duration) {
      if (config.next) {
        this.setState(config.next)
      } else if (config.onComplete) {
        this.call(config.onComplete)
      }
    }
  }

  /** Pauses the machine. All subsequent `tick` calls are no-ops until `resume` is called. */
  pause(): void {
    this._paused = true
  }

  /** Resumes the machine after a `pause`. */
  resume(): void {
    this._paused = false
  }

  /**
   * Resets the machine to a clean state.
   *
   * Clears `stateTime` and `previousState`, then enters the given state
   * (or the first registered state if none is specified) by calling `setState`.
   *
   * @param state - The state to reset to. Defaults to the first key in `states`.
   */
  reset(state?: T): void {
    this._stateTime = 0
    this._previousState = null
    if (state) {
      this.setState(state)
    } else {
      const firstState = Object.keys(this.states)[0] as T | undefined
      if (firstState) this.setState(firstState)
    }
    // Clear previousState again: setState sets it to the pre-reset current state,
    // but a reset should start with a clean slate.
    this._previousState = null
  }

  /**
   * Registers a new state at runtime.
   * Useful for dynamically extending the machine after construction.
   *
   * @param name - The state name key.
   * @param config - The state configuration.
   */
  addState(name: T, config: StateConfig<T>): void {
    this.states[name] = config
  }

  /**
   * Factory that builds a `StateMachine` from an ordered array of phases.
   *
   * Each phase automatically transitions to the next one when its `duration`
   * expires. The last phase either loops back to the first (if `loop: true`)
   * or calls `onComplete` and stays put.
   *
   * @param phases - Ordered phase descriptors. Each must have a `name`; `duration`
   *   and lifecycle hooks are optional.
   * @param options - `loop` to wrap around, `onComplete` for end-of-sequence
   *   notification, `context` for callback binding.
   * @returns A fully configured `StateMachine` starting at the first phase.
   *
   * @typeParam S - String union of phase names.
   *
   * @example
   * ```ts
   * type Phase = 'warmup' | 'active' | 'cooldown'
   * const sm = StateMachine.fromSequence<Phase>([
   *   { name: 'warmup',   duration: 3 },
   *   { name: 'active',   duration: 60 },
   *   { name: 'cooldown', duration: 5 },
   * ])
   * ```
   */
  static fromSequence<S extends string>(
    phases: Array<{
      name: S
      duration?: number
      enter?: (data?: unknown) => void
      tick?: (dt: number) => void
      exit?: (data?: unknown) => void
    }>,
    options: { loop?: boolean; onComplete?: () => void; context?: unknown } = {},
  ): StateMachine<S> {
    const states = {} as Record<S, StateConfig<S>>
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i]!
      const isLast = i === phases.length - 1
      const nextPhase = isLast ? (options.loop ? phases[0]!.name : undefined) : phases[i + 1]!.name
      states[phase.name] = {
        duration: phase.duration,
        next: nextPhase,
        enter: phase.enter,
        tick: phase.tick,
        exit: phase.exit,
        onComplete: isLast && !options.loop ? options.onComplete : undefined,
      }
    }
    return new StateMachine<S>({
      initial: phases[0]?.name,
      states,
      context: options.context,
    })
  }

  /**
   * Calls `fn` with the optional context binding and forwarded arguments.
   * Returns `undefined` if `fn` is not a function (defensive guard).
   *
   * @param fn - The callback to invoke.
   * @param args - Arguments to forward.
   * @returns The return value of `fn`, or `undefined`.
   */
  private call<R>(fn: (...args: never[]) => R, ...args: unknown[]): R | undefined {
    if (typeof fn === 'function') {
      const callable = fn as (...a: unknown[]) => R
      return this.context ? callable.call(this.context, ...args) : callable(...args)
    }
    return undefined
  }
}
