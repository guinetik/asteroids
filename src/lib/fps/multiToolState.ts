/**
 * Multi-tool mode, aiming, and trigger state.
 *
 * Pure TS — no Three.js dependency. Owns mode selection, ADS state,
 * and per-mode trigger pattern interpretation. Future home of power
 * system and targeting.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
import type { Tickable } from '@/lib/Tickable'

/** Available multi-tool modes. */
export type MultiToolMode = 'drill' | 'weapon' | 'heal'

/** Trigger pattern — how mouse input maps to firing. */
export type TriggerType = 'hold' | 'auto' | 'click'

/** Per-mode configuration from JSON. */
export interface ModeConfig {
  /** HUD label (e.g. "DRL"). */
  label: string
  /** Mode color hex string. */
  color: string
  /** Trigger pattern type. */
  trigger: TriggerType
  /** Shots per second for auto trigger. */
  fireRate?: number
}

/** Shape of multitool-config.json. */
export interface MultiToolConfig {
  /** Per-mode configuration. */
  modes: Record<MultiToolMode, ModeConfig>
  /** ADS (aim down sights) configuration. */
  ads: {
    /** FOV multiplier when aiming (e.g. 0.85 = 85% of base FOV). */
    fovMultiplier: number
    /** How fast FOV lerps to target (per second). */
    zoomSpeed: number
  }
}

/**
 * Multi-tool state machine — mode, aiming, and trigger patterns.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
export class MultiToolState implements Tickable {
  private _mode: MultiToolMode = 'drill'
  private _aiming = false
  private _isFiring = false
  private _mouseDown = false
  private _mouseJustPressed = false
  private autoTimer = 0
  private readonly config: MultiToolConfig

  constructor(config: MultiToolConfig) {
    this.config = config
  }

  /** Current active mode. */
  get mode(): MultiToolMode {
    return this._mode
  }

  /** Whether ADS is active. */
  get aiming(): boolean {
    return this._aiming
  }

  /** Whether a shot/action was triggered this frame. */
  get isFiring(): boolean {
    return this._isFiring
  }

  /** Config for the current mode. */
  get modeConfig(): ModeConfig {
    return this.config.modes[this._mode]
  }

  /** ADS configuration. */
  get adsConfig(): MultiToolConfig['ads'] {
    return this.config.ads
  }

  /** Switch active mode. */
  setMode(mode: MultiToolMode): void {
    this._mode = mode
    this.autoTimer = 0
  }

  /** Toggle ADS state. */
  setAiming(aiming: boolean): void {
    this._aiming = aiming
  }

  /**
   * Feed raw mouse state each frame.
   *
   * @param mouseDown - Whether left mouse button is currently held
   * @param mouseJustPressed - Whether left mouse was pressed this frame
   */
  setInput(mouseDown: boolean, mouseJustPressed: boolean): void {
    this._mouseDown = mouseDown
    this._mouseJustPressed = mouseJustPressed
  }

  /** Advance trigger logic by one frame. */
  tick(dt: number): void {
    this._isFiring = false

    if (!this._aiming) {
      this.autoTimer = 0
      return
    }

    const cfg = this.config.modes[this._mode]

    switch (cfg.trigger) {
      case 'hold':
        this._isFiring = this._mouseDown
        break

      case 'auto': {
        if (this._mouseDown) {
          if (this._mouseJustPressed) {
            // First press always fires immediately
            this._isFiring = true
            this.autoTimer = 0
          } else {
            const interval = 1 / (cfg.fireRate ?? 1)
            this.autoTimer += dt
            if (this.autoTimer >= interval) {
              this._isFiring = true
              this.autoTimer -= interval
            }
          }
        } else {
          this.autoTimer = 0
        }
        break
      }

      case 'click':
        this._isFiring = this._mouseJustPressed
        break
    }

    if (this._isFiring) {
      console.log(`[MultiTool] fire: ${this._mode}`)
    }
  }
}
