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
})
