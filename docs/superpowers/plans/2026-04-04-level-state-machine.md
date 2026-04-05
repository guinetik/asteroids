# Level State Machine & EVA Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic StateMachine\<T\>, wire it into the `/level` route with arrival → lander ↔ EVA state flow, and implement the F-key enter/exit transitions.

**Architecture:** Generic `StateMachine<T>` in `src/lib/` (pure TS, implements Tickable). Level-specific state config in `src/lib/level/`. `LevelViewController` creates all systems once, uses state machine enter/exit callbacks to register/unregister tickables. `LevelView.vue` provides CSS letterbox overlay.

**Tech Stack:** TypeScript, Vitest, Three.js, Vue 3

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/stateMachine.ts` | Create | Generic StateMachine\<T\> — lifecycle, triggers, timed transitions |
| `src/lib/__tests__/stateMachine.spec.ts` | Create | Unit tests for StateMachine\<T\> |
| `src/lib/level/levelStateMachine.ts` | Create | LevelState type + factory that builds the state machine config |
| `src/lib/level/__tests__/levelStateMachine.spec.ts` | Create | Level state transition tests |
| `src/lib/defaultBindings.ts` | Modify | Add LEVEL_BINDINGS (lander + FPS + interact) |
| `src/views/LevelView.vue` | Modify | Add letterbox overlay divs |
| `src/views/LevelViewController.ts` | Rewrite | Full scene orchestrator with state machine |

---

### Task 1: StateMachine\<T\> — Types and Constructor

**Files:**
- Create: `src/lib/stateMachine.ts`
- Create: `src/lib/__tests__/stateMachine.spec.ts`

- [ ] **Step 1: Write failing test — constructor sets initial state**

```ts
// src/lib/__tests__/stateMachine.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { StateMachine } from '../stateMachine'

type TestState = 'idle' | 'walking' | 'running'

function makeSimpleMachine() {
  return new StateMachine<TestState>({
    initial: 'idle',
    states: {
      idle: {},
      walking: {},
      running: {},
    },
  })
}

describe('StateMachine', () => {
  describe('constructor', () => {
    it('enters the initial state', () => {
      const sm = makeSimpleMachine()
      expect(sm.state).toBe('idle')
    })

    it('tracks no previous state after init', () => {
      const sm = makeSimpleMachine()
      expect(sm.previousState).toBeNull()
    })

    it('starts with stateTime at zero', () => {
      const sm = makeSimpleMachine()
      expect(sm.stateTime).toBe(0)
    })

    it('starts unpaused', () => {
      const sm = makeSimpleMachine()
      expect(sm.paused).toBe(false)
    })

    it('state is null when no initial provided', () => {
      const sm = new StateMachine<TestState>({
        states: { idle: {}, walking: {}, running: {} },
      })
      expect(sm.state).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: FAIL — module `../stateMachine` not found

- [ ] **Step 3: Implement StateMachine types and constructor**

```ts
// src/lib/stateMachine.ts
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
 * Guarded transition with optional pre-transition action.
 *
 * @typeParam T - Union of valid state names
 */
export interface TransitionConfig<T extends string> {
  /** Target state to transition to. */
  target: T
  /** If provided, transition only fires when this returns true. */
  guard?: (data?: unknown) => boolean
  /** Runs before the transition (after guard passes). */
  action?: (data?: unknown) => void
}

/**
 * Configuration for a single state in the machine.
 *
 * @typeParam T - Union of valid state names
 */
export interface StateConfig<T extends string> {
  /** Called when entering this state. */
  enter?: (data?: unknown) => void
  /** Called every tick while in this state. */
  tick?: (dt: number) => void
  /** Called when exiting this state. */
  exit?: (data?: unknown) => void
  /** Auto-transition after this many seconds. */
  duration?: number
  /** Target state when duration expires. */
  next?: T
  /** Called when duration expires and no next state. */
  onComplete?: () => void
  /** Named triggers → transitions. Value is a state name or TransitionConfig. */
  on?: Record<string, T | TransitionConfig<T>>
}

/**
 * Top-level config for building a StateMachine.
 *
 * @typeParam T - Union of valid state names
 */
export interface StateMachineConfig<T extends string> {
  /** State to enter immediately on construction. */
  initial?: T
  /** Map of state names to their configuration. */
  states: Record<T, StateConfig<T>>
  /** Context object bound as `this` in all callbacks. */
  context?: unknown
}

/**
 * Generic finite state machine.
 * Implements {@link Tickable} so it can be registered in a TickHandler.
 *
 * @typeParam T - Union of valid state names
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class StateMachine<T extends string> implements Tickable {
  private states: Record<string, StateConfig<T>>
  private currentState: T | null = null
  private _previousState: T | null = null
  private _stateTime = 0
  private _paused = false
  private context: unknown

  /** Fired on every state change. */
  onStateChange: ((current: T, previous: T | null, data?: unknown) => void) | null = null

  constructor(config: StateMachineConfig<T>) {
    this.states = { ...config.states }
    this.context = config.context ?? null

    if (config.initial) {
      this.setState(config.initial)
    }
  }

  /** Current state name, or null if not yet entered. */
  get state(): T | null {
    return this.currentState
  }

  /** Previous state name, or null. */
  get previousState(): T | null {
    return this._previousState
  }

  /** Seconds spent in the current state. */
  get stateTime(): number {
    return this._stateTime
  }

  /** Whether tick processing is paused. */
  get paused(): boolean {
    return this._paused
  }

  /** 0–1 progress through a timed state. 0 if no duration. */
  get progress(): number {
    const config = this.currentStateConfig
    if (!config?.duration) return 0
    return Math.min(1, this._stateTime / config.duration)
  }

  /** Seconds remaining in a timed state. Infinity if no duration. */
  get remaining(): number {
    const config = this.currentStateConfig
    if (!config?.duration) return Infinity
    return Math.max(0, config.duration - this._stateTime)
  }

  /** Whether the current state has a duration. */
  get isTimed(): boolean {
    return this.currentStateConfig?.duration !== undefined
  }

  /** Config object for the current state. */
  private get currentStateConfig(): StateConfig<T> | null {
    return this.currentState ? (this.states[this.currentState] ?? null) : null
  }

  /** Check if currently in the given state. */
  is(stateName: T): boolean {
    return this.currentState === stateName
  }

  /** Check if currently in any of the given states. */
  isAny(...stateNames: T[]): boolean {
    return this.currentState !== null && stateNames.includes(this.currentState)
  }

  /**
   * Transition to a new state. Calls exit on current, enter on new.
   *
   * @returns true if transition occurred, false if state unknown
   */
  setState(newState: T, data?: unknown): boolean {
    if (!this.states[newState]) return false

    // Exit current
    if (this.currentState) {
      const config = this.states[this.currentState]
      if (config?.exit) this.call(config.exit, data)
    }

    // Update tracking
    this._previousState = this.currentState
    this.currentState = newState
    this._stateTime = 0

    // Enter new
    const newConfig = this.states[newState]
    if (newConfig?.enter) this.call(newConfig.enter, data)

    // Global callback
    this.onStateChange?.(newState, this._previousState, data)

    return true
  }

  /**
   * Fire a named trigger against the current state's `on` map.
   *
   * @returns true if a transition occurred
   */
  trigger(name: string, data?: unknown): boolean {
    const config = this.currentStateConfig
    if (!config?.on) return false

    const transition = config.on[name]
    if (!transition) return false

    // String shorthand → direct transition
    if (typeof transition === 'string') {
      return this.setState(transition, data)
    }

    // Object with guard/action
    if (transition.guard && !this.call(transition.guard, data)) return false
    if (transition.action) this.call(transition.action, data)
    if (transition.target) return this.setState(transition.target, data)

    return false
  }

  /** Advance stateTime, call tick, check timed transitions. */
  tick(dt: number): void {
    if (this._paused || !this.currentState) return

    this._stateTime += dt

    const config = this.states[this.currentState]
    if (!config) return

    if (config.tick) this.call(config.tick, dt)

    // Timed auto-transition
    if (config.duration !== undefined && this._stateTime >= config.duration) {
      if (config.next) {
        this.setState(config.next)
      } else if (config.onComplete) {
        this.call(config.onComplete)
      }
    }
  }

  /** Pause tick processing. */
  pause(): void {
    this._paused = true
  }

  /** Resume tick processing. */
  resume(): void {
    this._paused = false
  }

  /** Reset to a specific state or the first defined state. */
  reset(state?: T): void {
    this._stateTime = 0
    this._previousState = null

    if (state) {
      this.setState(state)
    } else {
      const firstState = Object.keys(this.states)[0] as T | undefined
      if (firstState) this.setState(firstState)
    }
  }

  /** Add or update a state definition at runtime. */
  addState(name: T, config: StateConfig<T>): void {
    this.states[name] = config
  }

  /**
   * Build a state machine from a linear phase sequence.
   *
   * @param phases - Array of phase definitions
   * @param options - Loop, onComplete, context
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
      const nextPhase = isLast
        ? (options.loop ? phases[0]!.name : undefined)
        : phases[i + 1]!.name

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

  /** Call a callback with context binding. */
  private call<R>(fn: (...args: never[]) => R, ...args: unknown[]): R | undefined {
    if (typeof fn === 'function') {
      return this.context
        ? (fn as Function).call(this.context, ...args)
        : (fn as Function)(...args)
    }
    return undefined
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/stateMachine.ts src/lib/__tests__/stateMachine.spec.ts
git commit -m "feat: StateMachine<T> — types, constructor, initial state"
```

---

### Task 2: StateMachine\<T\> — setState and Lifecycle

**Files:**
- Modify: `src/lib/__tests__/stateMachine.spec.ts`

- [ ] **Step 1: Write failing tests for setState lifecycle**

Append to `describe('StateMachine', () => {`:

```ts
  describe('setState', () => {
    it('calls exit on current state then enter on new state', () => {
      const order: string[] = []
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { exit: () => order.push('idle.exit') },
          walking: { enter: () => order.push('walking.enter') },
          running: {},
        },
      })

      sm.setState('walking')

      expect(order).toEqual(['idle.exit', 'walking.enter'])
    })

    it('updates state and previousState', () => {
      const sm = makeSimpleMachine()

      sm.setState('walking')

      expect(sm.state).toBe('walking')
      expect(sm.previousState).toBe('idle')
    })

    it('resets stateTime to zero', () => {
      const sm = makeSimpleMachine()
      sm.tick(1.0) // accumulate time
      sm.setState('walking')
      expect(sm.stateTime).toBe(0)
    })

    it('passes data to exit and enter callbacks', () => {
      const exitData: unknown[] = []
      const enterData: unknown[] = []
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { exit: (d) => exitData.push(d) },
          walking: { enter: (d) => enterData.push(d) },
          running: {},
        },
      })

      sm.setState('walking', { reason: 'test' })

      expect(exitData).toEqual([{ reason: 'test' }])
      expect(enterData).toEqual([{ reason: 'test' }])
    })

    it('returns false for unknown state', () => {
      const sm = makeSimpleMachine()
      const result = sm.setState('nonexistent' as TestState)
      expect(result).toBe(false)
      expect(sm.state).toBe('idle')
    })

    it('fires onStateChange callback', () => {
      const sm = makeSimpleMachine()
      const calls: Array<{ current: string; previous: string | null }> = []
      sm.onStateChange = (current, previous) => calls.push({ current, previous })

      sm.setState('walking')

      expect(calls).toEqual([{ current: 'walking', previous: 'idle' }])
    })
  })
```

- [ ] **Step 2: Run tests to verify new tests pass** (implementation already exists from Task 1)

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/stateMachine.spec.ts
git commit -m "test: StateMachine setState lifecycle + onStateChange"
```

---

### Task 3: StateMachine\<T\> — tick, Timed Transitions, Pause

**Files:**
- Modify: `src/lib/__tests__/stateMachine.spec.ts`

- [ ] **Step 1: Write tests for tick, timed transitions, and pause**

Append to `describe('StateMachine', () => {`:

```ts
  describe('tick', () => {
    it('calls current state tick callback with dt', () => {
      const tickFn = vi.fn()
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { tick: tickFn },
          walking: {},
          running: {},
        },
      })

      sm.tick(0.016)

      expect(tickFn).toHaveBeenCalledWith(0.016)
    })

    it('accumulates stateTime', () => {
      const sm = makeSimpleMachine()
      sm.tick(0.5)
      sm.tick(0.3)
      expect(sm.stateTime).toBeCloseTo(0.8)
    })

    it('does nothing when paused', () => {
      const tickFn = vi.fn()
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { tick: tickFn },
          walking: {},
          running: {},
        },
      })

      sm.pause()
      sm.tick(0.016)

      expect(tickFn).not.toHaveBeenCalled()
      expect(sm.stateTime).toBe(0)
    })

    it('resumes after pause', () => {
      const tickFn = vi.fn()
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { tick: tickFn },
          walking: {},
          running: {},
        },
      })

      sm.pause()
      sm.resume()
      sm.tick(0.016)

      expect(tickFn).toHaveBeenCalled()
    })
  })

  describe('timed transitions', () => {
    it('auto-transitions when duration expires', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { duration: 1.0, next: 'walking' },
          walking: {},
          running: {},
        },
      })

      sm.tick(0.5)
      expect(sm.state).toBe('idle')

      sm.tick(0.6) // total 1.1 > 1.0
      expect(sm.state).toBe('walking')
    })

    it('calls onComplete when duration expires with no next', () => {
      const onComplete = vi.fn()
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { duration: 1.0, onComplete },
          walking: {},
          running: {},
        },
      })

      sm.tick(1.1)

      expect(onComplete).toHaveBeenCalled()
      expect(sm.state).toBe('idle') // stays in same state
    })

    it('reports progress 0-1 for timed states', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { duration: 2.0, next: 'walking' },
          walking: {},
          running: {},
        },
      })

      sm.tick(1.0)
      expect(sm.progress).toBeCloseTo(0.5)
      expect(sm.remaining).toBeCloseTo(1.0)
      expect(sm.isTimed).toBe(true)
    })

    it('progress returns 0 for untimed states', () => {
      const sm = makeSimpleMachine()
      expect(sm.progress).toBe(0)
      expect(sm.remaining).toBe(Infinity)
      expect(sm.isTimed).toBe(false)
    })
  })
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/stateMachine.spec.ts
git commit -m "test: StateMachine tick, timed transitions, pause/resume"
```

---

### Task 4: StateMachine\<T\> — Triggers with Guards

**Files:**
- Modify: `src/lib/__tests__/stateMachine.spec.ts`

- [ ] **Step 1: Write tests for triggers**

Append to `describe('StateMachine', () => {`:

```ts
  describe('trigger', () => {
    it('transitions on string trigger', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { on: { startWalking: 'walking' } },
          walking: {},
          running: {},
        },
      })

      const result = sm.trigger('startWalking')

      expect(result).toBe(true)
      expect(sm.state).toBe('walking')
    })

    it('returns false for unknown trigger', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: { on: { startWalking: 'walking' } },
          walking: {},
          running: {},
        },
      })

      const result = sm.trigger('nonexistent')
      expect(result).toBe(false)
      expect(sm.state).toBe('idle')
    })

    it('blocks transition when guard returns false', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: {
            on: {
              startWalking: { target: 'walking', guard: () => false },
            },
          },
          walking: {},
          running: {},
        },
      })

      const result = sm.trigger('startWalking')

      expect(result).toBe(false)
      expect(sm.state).toBe('idle')
    })

    it('allows transition when guard returns true', () => {
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: {
            on: {
              startWalking: { target: 'walking', guard: () => true },
            },
          },
          walking: {},
          running: {},
        },
      })

      const result = sm.trigger('startWalking')

      expect(result).toBe(true)
      expect(sm.state).toBe('walking')
    })

    it('runs action before transition', () => {
      const order: string[] = []
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: {
            on: {
              startWalking: {
                target: 'walking',
                action: () => order.push('action'),
              },
            },
            exit: () => order.push('exit'),
          },
          walking: { enter: () => order.push('enter') },
          running: {},
        },
      })

      sm.trigger('startWalking')

      expect(order).toEqual(['action', 'exit', 'enter'])
    })

    it('returns false when state has no on map', () => {
      const sm = makeSimpleMachine()
      expect(sm.trigger('anything')).toBe(false)
    })
  })
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/stateMachine.spec.ts
git commit -m "test: StateMachine triggers with guards and actions"
```

---

### Task 5: StateMachine\<T\> — Context Binding, is/isAny, fromSequence

**Files:**
- Modify: `src/lib/__tests__/stateMachine.spec.ts`

- [ ] **Step 1: Write tests for context, helpers, and fromSequence**

Append to `describe('StateMachine', () => {`:

```ts
  describe('context binding', () => {
    it('calls callbacks with context as this', () => {
      const ctx = { value: 42 }
      let captured: unknown = null
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: {
            enter() {
              captured = this
            },
          },
          walking: {},
          running: {},
        },
        context: ctx,
      })

      expect(captured).toBe(ctx)
    })
  })

  describe('is / isAny', () => {
    it('is() checks current state', () => {
      const sm = makeSimpleMachine()
      expect(sm.is('idle')).toBe(true)
      expect(sm.is('walking')).toBe(false)
    })

    it('isAny() checks against multiple states', () => {
      const sm = makeSimpleMachine()
      expect(sm.isAny('idle', 'walking')).toBe(true)
      expect(sm.isAny('walking', 'running')).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets to given state', () => {
      const sm = makeSimpleMachine()
      sm.setState('walking')
      sm.reset('idle')
      expect(sm.state).toBe('idle')
      expect(sm.previousState).toBeNull()
      expect(sm.stateTime).toBe(0)
    })

    it('resets to first state when none given', () => {
      const sm = makeSimpleMachine()
      sm.setState('running')
      sm.reset()
      expect(sm.state).toBe('idle')
    })
  })

  describe('fromSequence', () => {
    it('builds a linear phase chain', () => {
      type Phase = 'warmup' | 'active' | 'cooldown'
      const sm = StateMachine.fromSequence<Phase>([
        { name: 'warmup', duration: 1.0 },
        { name: 'active', duration: 2.0 },
        { name: 'cooldown', duration: 0.5 },
      ])

      expect(sm.state).toBe('warmup')

      sm.tick(1.1)
      expect(sm.state).toBe('active')

      sm.tick(2.1)
      expect(sm.state).toBe('cooldown')
    })

    it('loops when option set', () => {
      type Phase = 'a' | 'b'
      const sm = StateMachine.fromSequence<Phase>(
        [
          { name: 'a', duration: 1.0 },
          { name: 'b', duration: 1.0 },
        ],
        { loop: true },
      )

      sm.tick(1.1) // a → b
      sm.tick(1.1) // b → a
      expect(sm.state).toBe('a')
    })

    it('calls onComplete at end of non-looping sequence', () => {
      type Phase = 'only'
      const onComplete = vi.fn()
      const sm = StateMachine.fromSequence<Phase>(
        [{ name: 'only', duration: 1.0 }],
        { onComplete },
      )

      sm.tick(1.1)

      expect(onComplete).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Run tests**

Run: `bun test:unit src/lib/__tests__/stateMachine.spec.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/__tests__/stateMachine.spec.ts
git commit -m "test: StateMachine context, is/isAny, reset, fromSequence"
```

---

### Task 6: StateMachine\<T\> — Lint pass

**Files:**
- Modify: `src/lib/stateMachine.ts` (if needed)

- [ ] **Step 1: Run lint**

Run: `bun lint`
Expected: No new errors or warnings from stateMachine.ts

- [ ] **Step 2: Run full test suite to check nothing broke**

Run: `bun test:unit`
Expected: All tests pass

- [ ] **Step 3: Commit if any lint fixes were needed**

```bash
git add src/lib/stateMachine.ts
git commit -m "chore: lint fixes for StateMachine"
```

---

### Task 7: Level State Machine — Types and Factory

**Files:**
- Create: `src/lib/level/levelStateMachine.ts`
- Create: `src/lib/level/__tests__/levelStateMachine.spec.ts`

- [ ] **Step 1: Write failing tests for level state transitions**

```ts
// src/lib/level/__tests__/levelStateMachine.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { createLevelStateMachine, type LevelState } from '../levelStateMachine'

describe('Level State Machine', () => {
  describe('arrival → lander', () => {
    it('starts in arrival state', () => {
      const sm = createLevelStateMachine({ onStateChange: vi.fn() })
      expect(sm.state).toBe('arrival')
    })

    it('auto-transitions to lander after ARRIVAL_DURATION seconds', () => {
      const sm = createLevelStateMachine({ onStateChange: vi.fn() })

      sm.tick(2.9)
      expect(sm.state).toBe('arrival')

      sm.tick(0.2) // total 3.1
      expect(sm.state).toBe('lander')
    })
  })

  describe('lander → eva (exitVehicle)', () => {
    it('blocks exitVehicle when guard returns false', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => false,
      })

      // Skip arrival
      sm.tick(3.1)
      expect(sm.state).toBe('lander')

      const result = sm.trigger('exitVehicle')
      expect(result).toBe(false)
      expect(sm.state).toBe('lander')
    })

    it('allows exitVehicle when lander is grounded', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
      })

      sm.tick(3.1) // → lander
      const result = sm.trigger('exitVehicle')

      expect(result).toBe(true)
      expect(sm.state).toBe('eva')
    })
  })

  describe('eva → lander (enterVehicle)', () => {
    it('blocks enterVehicle when player is far from lander', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => false,
      })

      sm.tick(3.1) // → lander
      sm.trigger('exitVehicle') // → eva

      const result = sm.trigger('enterVehicle')
      expect(result).toBe(false)
      expect(sm.state).toBe('eva')
    })

    it('allows enterVehicle when player is near lander', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => true,
      })

      sm.tick(3.1) // → lander
      sm.trigger('exitVehicle') // → eva

      const result = sm.trigger('enterVehicle')
      expect(result).toBe(true)
      expect(sm.state).toBe('lander')
    })
  })

  describe('round-trip', () => {
    it('supports lander → eva → lander → eva', () => {
      const sm = createLevelStateMachine({
        onStateChange: vi.fn(),
        isLanderGrounded: () => true,
        isPlayerNearLander: () => true,
      })

      sm.tick(3.1) // arrival → lander
      sm.trigger('exitVehicle') // → eva
      sm.trigger('enterVehicle') // → lander
      sm.trigger('exitVehicle') // → eva

      expect(sm.state).toBe('eva')
    })
  })

  describe('callbacks', () => {
    it('fires onStateChange on every transition', () => {
      const onChange = vi.fn()
      const sm = createLevelStateMachine({
        onStateChange: onChange,
        isLanderGrounded: () => true,
      })

      sm.tick(3.1) // arrival → lander

      expect(onChange).toHaveBeenCalledWith('lander', 'arrival', undefined)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test:unit src/lib/level/__tests__/levelStateMachine.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement level state machine factory**

```ts
// src/lib/level/levelStateMachine.ts
/**
 * Level state machine — orchestrates arrival cutscene, lander flight,
 * and EVA on-foot phases within a single scene.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import { StateMachine } from '@/lib/stateMachine'

/** All possible states for an asteroid level. */
export type LevelState = 'arrival' | 'lander' | 'eva' | 'exfil' | 'complete' | 'failed'

/** Duration of the arrival cutscene in seconds. */
export const ARRIVAL_DURATION = 3.0

/** Distance threshold for entering the lander on foot (world units). */
export const LANDER_INTERACT_RANGE = 15

/** Options for creating the level state machine. */
export interface LevelStateMachineOptions {
  /** Called on every state transition. */
  onStateChange: (current: LevelState, previous: LevelState | null, data?: unknown) => void
  /** Guard: is the lander currently grounded? Defaults to () => false. */
  isLanderGrounded?: () => boolean
  /** Guard: is the player within interact range of the lander? Defaults to () => false. */
  isPlayerNearLander?: () => boolean
}

/**
 * Create a configured level state machine.
 * Guards are injected so this remains pure and testable.
 *
 * @param options - Callbacks and guard functions
 * @returns A StateMachine\<LevelState\> starting in 'arrival'
 */
export function createLevelStateMachine(
  options: LevelStateMachineOptions,
): StateMachine<LevelState> {
  const isGrounded = options.isLanderGrounded ?? (() => false)
  const isNearLander = options.isPlayerNearLander ?? (() => false)

  const sm = new StateMachine<LevelState>({
    initial: 'arrival',
    states: {
      arrival: {
        duration: ARRIVAL_DURATION,
        next: 'lander',
      },
      lander: {
        on: {
          exitVehicle: {
            target: 'eva',
            guard: () => isGrounded(),
          },
        },
      },
      eva: {
        on: {
          enterVehicle: {
            target: 'lander',
            guard: () => isNearLander(),
          },
        },
      },
      exfil: {},
      complete: {},
      failed: {},
    },
  })

  sm.onStateChange = options.onStateChange

  return sm
}
```

- [ ] **Step 4: Run tests**

Run: `bun test:unit src/lib/level/__tests__/levelStateMachine.spec.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/level/levelStateMachine.ts src/lib/level/__tests__/levelStateMachine.spec.ts
git commit -m "feat: level state machine — arrival/lander/eva with guards"
```

---

### Task 8: LEVEL_BINDINGS — Add interact key

**Files:**
- Modify: `src/lib/defaultBindings.ts`

- [ ] **Step 1: Add LEVEL_BINDINGS**

Add after the existing `FPS_BINDINGS` block:

```ts
/** Level bindings — combines lander + FPS + interact (F key). */
export const LEVEL_BINDINGS: Record<string, string[]> = {
  // Lander controls
  mainEngine: ['Space'],
  rcsLeft: ['KeyA'],
  rcsRight: ['KeyD'],
  rcsFore: ['KeyW'],
  rcsAft: ['KeyS'],
  rcsDescend: ['KeyC'],
  rcsAscend: ['ShiftLeft'],
  // FPS controls
  moveForward: ['KeyW'],
  moveBack: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft'],
  toolDrill: ['Digit1'],
  toolWeapon: ['Digit2'],
  toolHeal: ['Digit3'],
  // Shared
  interact: ['KeyF'],
}
```

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/defaultBindings.ts
git commit -m "feat: LEVEL_BINDINGS — lander + FPS + interact (F key)"
```

---

### Task 9: LevelView.vue — Letterbox Overlay

**Files:**
- Modify: `src/views/LevelView.vue`

- [ ] **Step 1: Rewrite LevelView.vue with letterbox bars**

```vue
<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { LevelViewController } from './LevelViewController'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)

onMounted(async () => {
  if (container.value) {
    viewController.onLetterbox = (visible) => {
      letterboxVisible.value = visible
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <div
    class="letterbox-bar letterbox-bar--top"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <div
    class="letterbox-bar letterbox-bar--bottom"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
</template>

<style>
.letterbox-bar {
  position: fixed;
  left: 0;
  right: 0;
  height: 12%;
  background: black;
  z-index: 40;
  transition: height 0.6s ease-in-out;
  pointer-events: none;
}
.letterbox-bar--top {
  top: 0;
}
.letterbox-bar--bottom {
  bottom: 0;
}
.letterbox-bar--hidden {
  height: 0;
}
</style>
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: Pass (will fail on `onLetterbox` until LevelViewController is updated in Task 10)

Note: This step will show a type error for `onLetterbox`. That's expected — it gets fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/views/LevelView.vue
git commit -m "feat: LevelView letterbox overlay bars with CSS transition"
```

---

### Task 10: LevelViewController — Full Rewrite

**Files:**
- Rewrite: `src/views/LevelViewController.ts`

This is the largest task. It creates all systems once, uses the state machine to wire/unwire them.

- [ ] **Step 1: Write the full LevelViewController**

```ts
// src/views/LevelViewController.ts
/**
 * Orchestrates the asteroid level scene — arrival cutscene,
 * lander flight, and EVA on-foot phases in a single Three.js scene.
 *
 * All systems are created once during init(). The state machine
 * enter/exit callbacks register/unregister tickables to swap modes.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { Tickable } from '@/lib/Tickable'
import { GameLoop } from '@/lib/GameLoop'
import { TickHandler } from '@/lib/TickHandler'
import { InputManager } from '@/lib/InputManager'
import { LEVEL_BINDINGS } from '@/lib/defaultBindings'
import {
  TICK_PRIORITY_INPUT,
  TICK_PRIORITY_PHYSICS,
  TICK_PRIORITY_RENDER,
} from '@/lib/tickPriorities'
import { SceneManager } from '@/three/SceneManager'
import { VehicleCamera, LANDER_CAMERA_CONFIG } from '@/three/VehicleCamera'
import { LanderController } from '@/three/LanderController'
import { FpsPlayerController } from '@/three/FpsPlayerController'
import type { FpsPlayerConfig } from '@/three/FpsPlayerController'
import { FpsCamera } from '@/three/FpsCamera'
import { TerrainGrid } from '@/three/TerrainGrid'
import { generateTerrain } from '@/lib/terrain/terrainGenerator'
import type { SurfaceFeatures } from '@/lib/asteroids/types'
import { Heightmap } from '@/lib/terrain/heightmap'
import { MultiToolController } from '@/three/MultiToolController'
import { MultiToolState } from '@/lib/fps/multiToolState'
import type { MultiToolConfig } from '@/lib/fps/multiToolState'
import { ProjectileSystem } from '@/lib/fps/projectileSystem'
import { ParticleEmitter } from '@/three/ParticleEmitter'
import { createLevelStateMachine, LANDER_INTERACT_RANGE } from '@/lib/level/levelStateMachine'
import type { LevelState } from '@/lib/level/levelStateMachine'
import type { StateMachine } from '@/lib/stateMachine'
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Color,
  Vector3,
} from 'three'
import playerConfigJson from '@/data/fps/player-config.json'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

// ── Scene constants ───────────────────────────────────────────────
const AMBIENT_LIGHT_INTENSITY = 0.6
const DIR_LIGHT_INTENSITY = 1.5
const GRID_SIZE = 2000
const TERRAIN_SEED = 42
const TERRAIN_RESOLUTION = 128

const LANDER_SPAWN_HEIGHT = 300
const EVA_SPAWN_OFFSET_X = 8

/** Cinematic camera offset during arrival (wide angle, side view). */
const ARRIVAL_CAM_OFFSET = new Vector3(80, 30, 60)
const ARRIVAL_CAM_FOV = 50
const ARRIVAL_CAM_NEAR = 0.1
const ARRIVAL_CAM_FAR = 5000

/** Test surface features — will come from asteroid data later. */
const TEST_SURFACE: SurfaceFeatures = {
  craterDensity: 0.7,
  craterMaxScale: 0.3,
  boulderDensity: 0.5,
  ridgeFrequency: 0.3,
  roughness: 0.8,
  dustCoverage: 0.2,
}

/**
 * Asteroid level scene controller.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
export class LevelViewController implements Tickable {
  // ── Core ─────────────────────────────────────────────────────
  private gameLoop: GameLoop | null = null
  private tickHandler: TickHandler | null = null
  private inputManager: InputManager | null = null
  private sceneManager: SceneManager | null = null
  private heightmap: Heightmap | null = null
  private terrainGrid: TerrainGrid | null = null
  private stateMachine: StateMachine<LevelState> | null = null

  // ── Lander ───────────────────────────────────────────────────
  private landerController: LanderController | null = null
  private vehicleCamera: VehicleCamera | null = null

  // ── EVA ──────────────────────────────────────────────────────
  private fpsCamera: FpsCamera | null = null
  private playerController: FpsPlayerController | null = null
  private multiTool: MultiToolController | null = null
  private multiToolState: MultiToolState | null = null
  private projectileSystem: ProjectileSystem | null = null
  private impactEmitter: ParticleEmitter | null = null

  // ── Arrival ──────────────────────────────────────────────────
  private arrivalCamera: PerspectiveCamera | null = null

  // ── Mouse state (EVA) ────────────────────────────────────────
  private leftMouseDown = false
  private leftMouseJustPressed = false
  private rightMouseDown = false

  // ── Pointer lock listeners (stored for cleanup) ──────────────
  private boundOnMouseMove: ((e: MouseEvent) => void) | null = null
  private boundOnMouseDown: ((e: MouseEvent) => void) | null = null
  private boundOnMouseUp: ((e: MouseEvent) => void) | null = null
  private boundOnLockChange: (() => void) | null = null

  /** Called when letterbox visibility should change. */
  onLetterbox: ((visible: boolean) => void) | null = null

  // ═══════════════════════════════════════════════════════════════
  // Init
  // ═══════════════════════════════════════════════════════════════

  async init(container: HTMLElement): Promise<void> {
    const playerConfig = playerConfigJson as FpsPlayerConfig

    // ── Input + tick handler ────────────────────────────────────
    this.inputManager = new InputManager(LEVEL_BINDINGS)
    this.tickHandler = new TickHandler()
    this.tickHandler.register(this.inputManager, TICK_PRIORITY_INPUT)

    // ── Scene ───────────────────────────────────────────────────
    this.sceneManager = new SceneManager()
    this.sceneManager.mount(container)

    // ── Terrain ─────────────────────────────────────────────────
    const flat = new URLSearchParams(window.location.search).has('flat')
    this.heightmap = flat
      ? new Heightmap(TERRAIN_RESOLUTION, GRID_SIZE)
      : generateTerrain(TEST_SURFACE, {
          seed: TERRAIN_SEED,
          resolution: TERRAIN_RESOLUTION,
          worldSize: GRID_SIZE,
        })
    this.terrainGrid = new TerrainGrid(this.heightmap)
    this.sceneManager.addToScene(this.terrainGrid.mesh)

    // ── Lighting ────────────────────────────────────────────────
    const ambient = new AmbientLight(0xffffff, AMBIENT_LIGHT_INTENSITY)
    const sun = new DirectionalLight(0xffffee, DIR_LIGHT_INTENSITY)
    sun.position.set(100, 200, 50)
    this.sceneManager.addToScene(ambient)
    this.sceneManager.addToScene(sun)

    // ── Lander (created once, stays in scene) ───────────────────
    this.landerController = new LanderController(this.inputManager)
    this.landerController.setHeightmap(this.heightmap)
    await this.landerController.load()
    this.landerController.group.position.set(0, LANDER_SPAWN_HEIGHT, 0)
    this.sceneManager.addToScene(this.landerController.group)
    this.sceneManager.addToScene(this.landerController.flameEmitter.points)
    for (const emitter of this.landerController.rcsEmitters.values()) {
      this.sceneManager.addToScene(emitter.points)
    }

    // ── Vehicle camera (lander 3rd person) ──────────────────────
    this.vehicleCamera = new VehicleCamera(
      LANDER_CAMERA_CONFIG,
      this.sceneManager.renderer.domElement,
    )
    this.vehicleCamera.setTarget(this.landerController.group)

    // ── Arrival camera (cinematic) ──────────────────────────────
    const aspect = container.clientWidth / container.clientHeight
    this.arrivalCamera = new PerspectiveCamera(
      ARRIVAL_CAM_FOV, aspect, ARRIVAL_CAM_NEAR, ARRIVAL_CAM_FAR,
    )

    // ── FPS camera ──────────────────────────────────────────────
    this.fpsCamera = new FpsCamera(playerConfig.camera)

    // ── FPS player controller ───────────────────────────────────
    this.playerController = new FpsPlayerController(
      this.inputManager,
      this.fpsCamera,
      playerConfig,
      this.heightmap,
    )
    this.sceneManager.addToScene(this.playerController.group)

    // ── Multi-tool ──────────────────────────────────────────────
    this.multiTool = new MultiToolController()
    await this.multiTool.load(this.fpsCamera.camera, this.sceneManager.scene)
    this.multiToolState = new MultiToolState(multiToolConfigJson as MultiToolConfig)

    // ── Projectile system + particles ───────────────────────────
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene, this.heightmap)
    this.impactEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new Color(0xffaa44),
      size: 3,
      lifetime: 0.4,
      spread: 15,
      opacity: 0.8,
    })
    this.sceneManager.addToScene(this.impactEmitter.points)
    this.projectileSystem.onImpact = (pos) => {
      const up = new Vector3(0, 1, 0)
      for (let i = 0; i < 8; i++) {
        this.impactEmitter!.emit(pos, up.clone().multiplyScalar(5))
      }
    }
    this.multiTool.setProjectileSystem(this.projectileSystem)

    // ── State machine ───────────────────────────────────────────
    this.stateMachine = createLevelStateMachine({
      onStateChange: (current, previous) => this.onStateTransition(current, previous),
      isLanderGrounded: () => this.landerController?.body.grounded ?? false,
      isPlayerNearLander: () => this.isPlayerNearLander(),
    })

    // ── Always-active tickables ─────────────────────────────────
    this.tickHandler.register(this.stateMachine, TICK_PRIORITY_INPUT + 1)
    this.tickHandler.register(this, TICK_PRIORITY_RENDER - 1)
    this.tickHandler.register(this.sceneManager, TICK_PRIORITY_RENDER)

    // ── Arrival state starts with lander physics + cinematic cam ─
    this.enterArrival()

    // ── Start ───────────────────────────────────────────────────
    this.gameLoop = new GameLoop(this.tickHandler)
    this.gameLoop.start()
  }

  // ═══════════════════════════════════════════════════════════════
  // State transition dispatcher
  // ═══════════════════════════════════════════════════════════════

  private onStateTransition(current: LevelState, _previous: LevelState | null): void {
    // Exit previous state (cleanup done before enter of new state
    // is handled by the state machine's exit callbacks — but since
    // we use onStateChange instead of per-state callbacks, we do
    // both enter/exit here based on the transition pair)

    switch (_previous) {
      case 'arrival':
        this.exitArrival()
        break
      case 'lander':
        this.exitLander()
        break
      case 'eva':
        this.exitEva()
        break
    }

    switch (current) {
      case 'lander':
        this.enterLander()
        break
      case 'eva':
        this.enterEva()
        break
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Arrival state
  // ═══════════════════════════════════════════════════════════════

  private enterArrival(): void {
    // Lander physics active (gravity pulls it down) but no player input
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)

    // Cinematic camera
    this.sceneManager!.setActiveCamera(this.arrivalCamera!)
    this.updateArrivalCamera()

    // Letterbox
    this.onLetterbox?.(true)
  }

  private exitArrival(): void {
    // Unregister lander from tick — enterLander will re-register it
    this.tickHandler!.unregister(this.landerController!)

    // Letterbox starts closing (CSS transition handles animation)
    this.onLetterbox?.(false)
  }

  /** Position the arrival camera to look at the lander from a cinematic angle. */
  private updateArrivalCamera(): void {
    if (!this.arrivalCamera || !this.landerController) return
    const landerPos = this.landerController.group.position
    this.arrivalCamera.position.copy(landerPos).add(ARRIVAL_CAM_OFFSET)
    this.arrivalCamera.lookAt(landerPos)
  }

  // ═══════════════════════════════════════════════════════════════
  // Lander state
  // ═══════════════════════════════════════════════════════════════

  private enterLander(): void {
    this.tickHandler!.register(this.landerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.vehicleCamera!, TICK_PRIORITY_RENDER - 2)
    this.sceneManager!.setCamera(this.vehicleCamera!)
    // Clear direct camera so SceneManager uses vehicleCamera
    this.sceneManager!.setActiveCamera(null as unknown as PerspectiveCamera)
  }

  private exitLander(): void {
    this.tickHandler!.unregister(this.landerController!)
    this.tickHandler!.unregister(this.vehicleCamera!)
  }

  // ═══════════════════════════════════════════════════════════════
  // EVA state
  // ═══════════════════════════════════════════════════════════════

  private enterEva(): void {
    // Position player at lander + offset
    const landerPos = this.landerController!.group.position
    this.playerController!.group.position.set(
      landerPos.x + EVA_SPAWN_OFFSET_X,
      landerPos.y,
      landerPos.z,
    )

    // Register EVA tickables
    this.tickHandler!.register(this.playerController!, TICK_PRIORITY_PHYSICS)
    this.tickHandler!.register(this.multiToolState!, TICK_PRIORITY_PHYSICS + 1)
    this.tickHandler!.register(this.projectileSystem!, TICK_PRIORITY_PHYSICS + 2)
    this.tickHandler!.register(this.impactEmitter!, TICK_PRIORITY_PHYSICS + 3)
    this.tickHandler!.register(this.fpsCamera!, TICK_PRIORITY_RENDER - 2)
    this.tickHandler!.register(this.multiTool!, TICK_PRIORITY_RENDER - 2)

    // FPS camera
    this.fpsCamera!.setTarget(this.playerController!.group)
    this.sceneManager!.setActiveCamera(this.fpsCamera!.camera)
    this.sceneManager!.setCamera(null as unknown as VehicleCamera)

    // Pointer lock
    this.setupPointerLock()
    this.sceneManager!.renderer.domElement.requestPointerLock()
  }

  private exitEva(): void {
    // Unregister EVA tickables
    this.tickHandler!.unregister(this.playerController!)
    this.tickHandler!.unregister(this.multiToolState!)
    this.tickHandler!.unregister(this.projectileSystem!)
    this.tickHandler!.unregister(this.impactEmitter!)
    this.tickHandler!.unregister(this.fpsCamera!)
    this.tickHandler!.unregister(this.multiTool!)

    // Release pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    this.teardownPointerLock()

    // Reset mouse state
    this.leftMouseDown = false
    this.leftMouseJustPressed = false
    this.rightMouseDown = false
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  tick(dt: number): void {
    // ── F key → state triggers ──────────────────────────────────
    if (this.inputManager?.wasActionPressed('interact') && this.stateMachine) {
      this.stateMachine.trigger('exitVehicle')
      this.stateMachine.trigger('enterVehicle')
    }

    // ── Arrival: track lander with cinematic camera ─────────────
    if (this.stateMachine?.is('arrival')) {
      this.updateArrivalCamera()
    }

    // ── EVA: feed inputs to tool + camera ───────────────────────
    if (this.stateMachine?.is('eva')) {
      this.tickEva(dt)
    }
  }

  /** Per-frame EVA logic — tool input, camera bob, aiming. */
  private tickEva(_dt: number): void {
    // Tool keybinds
    if (this.inputManager && this.multiToolState) {
      if (this.inputManager.wasActionPressed('toolDrill')) this.multiToolState.setMode('drill')
      if (this.inputManager.wasActionPressed('toolWeapon')) this.multiToolState.setMode('weapon')
      if (this.inputManager.wasActionPressed('toolHeal')) this.multiToolState.setMode('heal')

      this.multiToolState.setAiming(this.rightMouseDown)
      this.multiToolState.setInput(this.leftMouseDown, this.leftMouseJustPressed)
      this.multiToolState.setSpeed(this.playerController?.speed ?? 0)
      this.leftMouseJustPressed = false
    }

    // Sync tool visuals
    if (this.multiToolState && this.multiTool) {
      this.multiTool.setMode(this.multiToolState.modeConfig.color, this.multiToolState.mode)
      this.multiTool.setAiming(this.multiToolState.aiming)
      this.multiTool.setRtgLevel(this.multiToolState.rtgLevel / this.multiToolState.rtgCapacity)
      this.playerController?.setAiming(this.multiToolState.aiming)
      if (this.multiToolState.isFiring) {
        this.multiTool.fire()
      }
    }

    // ADS camera zoom
    if (this.multiToolState && this.fpsCamera) {
      const ads = this.multiToolState.adsConfig
      this.fpsCamera.setAiming(
        this.multiToolState.aiming,
        ads.fovMultiplier,
        ads.zoomSpeed,
      )
    }

    // Camera bob from velocity
    if (this.playerController && this.fpsCamera) {
      const pos = this.playerController.group.position
      const slope = this.heightmap?.slopeAt(pos.x, pos.z) ?? 0
      this.fpsCamera.setVelocity(
        this.playerController.speed,
        this.playerController.body.velocityY,
        slope,
      )
      this.multiTool?.setState(
        this.playerController.speed,
        this.inputManager!.isActionActive('sprint'),
        this.playerController.grounded,
      )
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════

  /** Check if the FPS player is within interact range of the lander. */
  private isPlayerNearLander(): boolean {
    if (!this.playerController || !this.landerController) return false
    const playerPos = this.playerController.group.position
    const landerPos = this.landerController.group.position
    const dx = playerPos.x - landerPos.x
    const dz = playerPos.z - landerPos.z
    return Math.sqrt(dx * dx + dz * dz) <= LANDER_INTERACT_RANGE
  }

  // ═══════════════════════════════════════════════════════════════
  // Pointer lock (EVA only)
  // ═══════════════════════════════════════════════════════════════

  private setupPointerLock(): void {
    const canvas = this.sceneManager!.renderer.domElement

    this.boundOnMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement === canvas) {
        this.fpsCamera?.applyMouseDelta(e.movementX, e.movementY)
      }
    }

    this.boundOnMouseDown = (e: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return
      if (e.button === 0) {
        this.leftMouseDown = true
        this.leftMouseJustPressed = true
      }
      if (e.button === 2) this.rightMouseDown = true
    }

    this.boundOnMouseUp = (e: MouseEvent): void => {
      if (e.button === 0) this.leftMouseDown = false
      if (e.button === 2) this.rightMouseDown = false
    }

    this.boundOnLockChange = (): void => {
      const locked = document.pointerLockElement === canvas
      if (!locked) {
        this.leftMouseDown = false
        this.leftMouseJustPressed = false
        this.rightMouseDown = false
      }
    }

    document.addEventListener('mousemove', this.boundOnMouseMove)
    document.addEventListener('mousedown', this.boundOnMouseDown)
    document.addEventListener('mouseup', this.boundOnMouseUp)
    document.addEventListener('pointerlockchange', this.boundOnLockChange)
    canvas.addEventListener('contextmenu', this.preventContextMenu)

    canvas.addEventListener('click', this.requestLockOnClick)
  }

  private teardownPointerLock(): void {
    if (this.boundOnMouseMove) document.removeEventListener('mousemove', this.boundOnMouseMove)
    if (this.boundOnMouseDown) document.removeEventListener('mousedown', this.boundOnMouseDown)
    if (this.boundOnMouseUp) document.removeEventListener('mouseup', this.boundOnMouseUp)
    if (this.boundOnLockChange) document.removeEventListener('pointerlockchange', this.boundOnLockChange)

    const canvas = this.sceneManager?.renderer.domElement
    if (canvas) {
      canvas.removeEventListener('contextmenu', this.preventContextMenu)
      canvas.removeEventListener('click', this.requestLockOnClick)
    }

    this.boundOnMouseMove = null
    this.boundOnMouseDown = null
    this.boundOnMouseUp = null
    this.boundOnLockChange = null
  }

  private preventContextMenu = (e: Event): void => {
    e.preventDefault()
  }

  private requestLockOnClick = (): void => {
    const canvas = this.sceneManager?.renderer.domElement
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
    }
  }

  // ══════════════════════════════════════════════════════════���════
  // Dispose
  // ═══════════════════════════════════════════════════════════════

  dispose(): void {
    this.gameLoop?.stop()
    this.teardownPointerLock()
    this.projectileSystem?.dispose()
    this.impactEmitter?.dispose()
    this.multiTool?.dispose()
    this.playerController?.dispose()
    this.fpsCamera?.dispose()
    this.landerController?.dispose()
    this.terrainGrid?.dispose()
    this.vehicleCamera?.dispose()
    this.sceneManager?.dispose()
    this.inputManager?.dispose()
  }
}
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: Pass

- [ ] **Step 3: Run lint**

Run: `bun lint`
Expected: No new errors from LevelViewController.ts

- [ ] **Step 4: Commit**

```bash
git add src/views/LevelViewController.ts
git commit -m "feat: LevelViewController — state machine wiring arrival/lander/eva"
```

---

### Task 11: SceneManager Camera Clearing Fix

The `LevelViewController` needs to clear the direct camera when switching to VehicleCamera and vice versa. Currently `SceneManager.setActiveCamera()` doesn't accept null. We need a small fix.

**Files:**
- Modify: `src/three/SceneManager.ts`

- [ ] **Step 1: Update setActiveCamera to accept null**

In `src/three/SceneManager.ts`, change the method signature:

```ts
  /** Set a raw perspective camera for rendering (FPS mode). Pass null to clear. */
  setActiveCamera(camera: THREE.PerspectiveCamera | null): void {
    this.directCamera = camera
    if (camera && this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    }
  }
```

Also update `setCamera` to accept null:

```ts
  /** Connect a vehicle camera for rendering. Pass null to clear. */
  setCamera(camera: VehicleCamera | null): void {
    this.vehicleCamera = camera
    if (camera && this.container) {
      const { clientWidth, clientHeight } = this.container
      camera.resize(clientWidth, clientHeight)
    }
  }
```

- [ ] **Step 2: Run type-check**

Run: `bun run type-check`
Expected: Pass. The `null as unknown as` casts in LevelViewController are no longer needed.

- [ ] **Step 3: Clean up LevelViewController casts**

In `src/views/LevelViewController.ts`, remove the unsafe casts:

In `enterLander()`, change:
```ts
this.sceneManager!.setActiveCamera(null as unknown as PerspectiveCamera)
```
to:
```ts
this.sceneManager!.setActiveCamera(null)
```

In `enterEva()`, change:
```ts
this.sceneManager!.setCamera(null as unknown as VehicleCamera)
```
to:
```ts
this.sceneManager!.setCamera(null)
```

- [ ] **Step 4: Run type-check again**

Run: `bun run type-check`
Expected: Pass

- [ ] **Step 5: Commit**

```bash
git add src/three/SceneManager.ts src/views/LevelViewController.ts
git commit -m "fix: SceneManager setCamera/setActiveCamera accept null for mode switching"
```

---

### Task 12: Integration Test — Manual Verification

**Files:** None (manual testing)

- [ ] **Step 1: Run full test suite**

Run: `bun test:unit`
Expected: All tests pass, including new stateMachine and levelStateMachine tests

- [ ] **Step 2: Run type-check + lint**

Run: `bun run type-check && bun lint`
Expected: Clean

- [ ] **Step 3: Start dev server and test in browser**

Run: `bun dev`

Navigate to `http://localhost:5173/level`

Verify:
1. Letterbox bars visible at top and bottom
2. Lander appears high above, falls under gravity
3. Cinematic camera tracks the lander from a side angle
4. After ~3 seconds, letterbox bars slide away
5. Camera snaps to 3rd person vehicle-follow
6. WASD/Space controls the lander (fly around)
7. Land on terrain (low velocity contact)
8. Press F while grounded → camera switches to first person, pointer lock activates
9. WASD to walk, Space to jump, Shift to sprint, 1/2/3 tool modes
10. Walk back to lander, press F → camera switches back to 3rd person lander
11. Space to take off again

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git add -u
git commit -m "chore: integration fixes from manual testing"
```
