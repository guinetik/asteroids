import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Timer } from '../Timer'

/** Manually drive RAF by capturing callbacks and invoking them with controlled timestamps. */
let rafCallbacks: Array<(time: number) => void> = []
let rafIdCounter = 1

describe('Timer', () => {
  beforeEach(() => {
    rafCallbacks = []
    rafIdCounter = 1
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallbacks.push(cb)
      return rafIdCounter++
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    Timer.cancelAll()
    vi.restoreAllMocks()
  })

  /** Flush one RAF frame at the given timestamp. */
  function flushFrame(timeMs: number): void {
    const cbs = [...rafCallbacks]
    rafCallbacks = []
    for (const cb of cbs) cb(timeMs)
  }

  describe('after', () => {
    it('fires callback after elapsed delay', () => {
      const fn = vi.fn()
      Timer.after(0.05, fn)

      flushFrame(0) // seeds lastTime
      flushFrame(60) // dt = 0.06s ≥ 0.05s delay → fires

      expect(fn).toHaveBeenCalledOnce()
    })

    it('does not fire before delay elapses', () => {
      const fn = vi.fn()
      Timer.after(0.1, fn)

      flushFrame(0)
      flushFrame(50) // dt = 0.05s, only half the delay

      expect(fn).not.toHaveBeenCalled()
    })

    it('accumulates delta across multiple frames', () => {
      const fn = vi.fn()
      Timer.after(0.2, fn)

      flushFrame(0)
      flushFrame(80)  // dt = 0.08s
      flushFrame(160) // dt = 0.08s, total = 0.16s

      expect(fn).not.toHaveBeenCalled()

      flushFrame(220) // dt = 0.06s, total = 0.22s ≥ 0.2s → fires

      expect(fn).toHaveBeenCalledOnce()
    })
  })

  describe('cancel', () => {
    it('prevents callback from firing', () => {
      const fn = vi.fn()
      const handle = Timer.after(0.1, fn)

      flushFrame(0)
      Timer.cancel(handle)
      flushFrame(200)

      expect(fn).not.toHaveBeenCalled()
    })

    it('does not affect other timers', () => {
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const h1 = Timer.after(0.05, fn1)
      Timer.after(0.05, fn2)

      flushFrame(0)
      Timer.cancel(h1)
      flushFrame(60)

      expect(fn1).not.toHaveBeenCalled()
      expect(fn2).toHaveBeenCalledOnce()
    })
  })

  describe('sequence', () => {
    it('fires steps in order with correct delays', () => {
      const order: number[] = []
      Timer.sequence([
        { delay: 0.05, fn: () => order.push(1) },
        { delay: 0.05, fn: () => order.push(2) },
        { delay: 0.05, fn: () => order.push(3) },
      ])

      flushFrame(0)
      flushFrame(60)   // 0.06s → step 1 fires
      expect(order).toEqual([1])

      flushFrame(120)  // 0.06s after step 1 → step 2 fires
      expect(order).toEqual([1, 2])

      flushFrame(180)  // 0.06s after step 2 → step 3 fires
      expect(order).toEqual([1, 2, 3])
    })

    it('cancel stops the entire chain', () => {
      const order: number[] = []
      const handle = Timer.sequence([
        { delay: 0.05, fn: () => order.push(1) },
        { delay: 0.05, fn: () => order.push(2) },
      ])

      flushFrame(0)
      flushFrame(60)  // step 1 fires
      Timer.cancel(handle)
      flushFrame(120) // step 2 should NOT fire

      expect(order).toEqual([1])
    })

    it('cancel before any step fires prevents all steps', () => {
      const fn = vi.fn()
      const handle = Timer.sequence([
        { delay: 0.1, fn },
        { delay: 0.1, fn },
      ])

      flushFrame(0)
      Timer.cancel(handle)
      flushFrame(300)

      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('delta clamping', () => {
    it('clamps large gaps to MAX_DELTA_S (0.1s)', () => {
      const fn = vi.fn()
      Timer.after(0.5, fn)

      flushFrame(0)
      // Jump 5 seconds — should clamp to 0.1s per frame
      flushFrame(5000)

      // Only 0.1s elapsed, not 5s
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('RAF lifecycle', () => {
    it('stops RAF when no timers remain', () => {
      const cancelSpy = vi.fn()
      vi.stubGlobal('cancelAnimationFrame', cancelSpy)

      const fn = vi.fn()
      Timer.after(0.05, fn)

      flushFrame(0)
      flushFrame(60) // fires, list now empty

      expect(fn).toHaveBeenCalledOnce()
      expect(Timer.activeCount).toBe(0)
    })

    it('restarts RAF when timer added after idle', () => {
      const rafSpy = vi.fn((cb: (time: number) => void) => {
        rafCallbacks.push(cb)
        return rafIdCounter++
      })
      vi.stubGlobal('requestAnimationFrame', rafSpy)

      const fn1 = vi.fn()
      Timer.after(0.05, fn1)
      const callsAfterFirst = rafSpy.mock.calls.length

      flushFrame(0)
      flushFrame(60) // fires, loop stops

      // Add another timer — RAF should restart
      const fn2 = vi.fn()
      Timer.after(0.05, fn2)
      expect(rafSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst + 1)
    })

    it('cancelAll stops RAF loop', () => {
      Timer.after(10, vi.fn())
      Timer.after(10, vi.fn())

      flushFrame(0)

      Timer.cancelAll()
      expect(Timer.activeCount).toBe(0)
    })
  })
})
