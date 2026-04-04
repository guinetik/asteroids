import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GameLoop } from '../GameLoop'
import { TickHandler } from '../TickHandler'

describe('GameLoop', () => {
  let tickHandler: TickHandler
  let loop: GameLoop

  beforeEach(() => {
    tickHandler = new TickHandler()
    loop = new GameLoop(tickHandler)
    vi.spyOn(tickHandler, 'tick')
  })

  afterEach(() => {
    loop.stop()
    vi.restoreAllMocks()
  })

  it('is not running initially', () => {
    expect(loop.isRunning).toBe(false)
  })

  it('is running after start()', () => {
    loop.start()
    expect(loop.isRunning).toBe(true)
  })

  it('is not running after stop()', () => {
    loop.start()
    loop.stop()
    expect(loop.isRunning).toBe(false)
  })

  it('does not double-start', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    loop.start()
    loop.start()
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  it('clamps delta time to MAX_DELTA', () => {
    const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame')
    loop.start()

    // Simulate first frame at t=16ms (sets lastTime, skips tick)
    const rafCalls = rafSpy.mock.calls
    const firstCallback = rafCalls[0]![0]!
    firstCallback(16)

    // Simulate second frame at t=516ms (huge gap from 16ms, should clamp to MAX_DELTA_S)
    const secondCallback = rafSpy.mock.calls[1]![0]!
    secondCallback(516)

    expect(tickHandler.tick).toHaveBeenCalledWith(0.1) // MAX_DELTA_S = 0.1
  })
})
