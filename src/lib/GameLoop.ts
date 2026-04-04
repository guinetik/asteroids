import type { TickHandler } from './TickHandler'

const MAX_DELTA_MS = 100
const MAX_DELTA_S = MAX_DELTA_MS / 1000
const MS_TO_S = 1 / 1000

/**
 * Core animation frame loop that drives the TickHandler each frame.
 * Clamps delta time to prevent spiral-of-death on tab-away.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
export class GameLoop {
  private _isRunning = false
  private rafId = 0
  private lastTime = 0

  constructor(private readonly tickHandler: TickHandler) {}

  get isRunning(): boolean {
    return this._isRunning
  }

  start(): void {
    if (this._isRunning) return
    this._isRunning = true
    this.lastTime = 0
    this.rafId = requestAnimationFrame(this.frame)
  }

  stop(): void {
    if (!this._isRunning) return
    this._isRunning = false
    cancelAnimationFrame(this.rafId)
  }

  private frame = (timeMs: number): void => {
    if (!this._isRunning) return

    if (this.lastTime === 0) {
      this.lastTime = timeMs
      this.rafId = requestAnimationFrame(this.frame)
      return
    }

    const rawDelta = (timeMs - this.lastTime) * MS_TO_S
    const dt = Math.min(rawDelta, MAX_DELTA_S)
    this.lastTime = timeMs

    this.tickHandler.tick(dt)

    this.rafId = requestAnimationFrame(this.frame)
  }
}
