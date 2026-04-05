import { describe, it, expect, vi } from 'vitest'
import { StateMachine } from '../stateMachine'

type TestState = 'idle' | 'walking' | 'running'

function makeSimpleMachine() {
  return new StateMachine<TestState>({
    initial: 'idle',
    states: { idle: {}, walking: {}, running: {} },
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
      sm.tick(1.0)
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

  describe('tick', () => {
    it('calls current state tick callback with dt', () => {
      const tickFn = vi.fn()
      const sm = new StateMachine<TestState>({
        initial: 'idle',
        states: { idle: { tick: tickFn }, walking: {}, running: {} },
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
        states: { idle: { tick: tickFn }, walking: {}, running: {} },
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
        states: { idle: { tick: tickFn }, walking: {}, running: {} },
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
      sm.tick(0.6)
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
      expect(sm.state).toBe('idle')
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
            on: { startWalking: { target: 'walking', guard: () => false } },
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
            on: { startWalking: { target: 'walking', guard: () => true } },
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

  describe('context binding', () => {
    it('calls callbacks with context as this', () => {
      const ctx = { value: 42, captured: null as unknown }
      const _sm = new StateMachine<TestState>({
        initial: 'idle',
        states: {
          idle: {
            enter() { (this as typeof ctx).captured = this },
          },
          walking: {},
          running: {},
        },
        context: ctx,
      })
      expect(ctx.captured).toBe(ctx)
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
      sm.tick(1.1)
      sm.tick(1.1)
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
})
