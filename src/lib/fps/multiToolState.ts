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
import { ThrusterSystem } from '@/lib/physics/thrusterSystem'
import type { ThrusterSystemConfig } from '@/lib/physics/thrusterSystem'

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

/** RTG configuration. */
export interface RtgConfig {
  /** RTG fuel pool capacity. */
  fuelCapacity: number
  /** Minimum seconds between decay bursts. */
  burstMin: number
  /** Maximum seconds between decay bursts. */
  burstMax: number
  /** Fuel added per burst. */
  burstAmount: number
  /** Per-mode thruster configs. */
  thrusters: Record<MultiToolMode, {
    capacity: number
    burnRate: number
    rechargeRate: number
    fuelCostPerRecharge: number
  }>
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
  /** RTG power system configuration. */
  rtg: RtgConfig
}

/**
 * Multi-tool state machine — mode, aiming, and trigger patterns.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-multitool-switching-design.md
 */
export class MultiToolState implements Tickable {
  private static readonly DRILL_RECOVERY_RATIO = 0.5

  private _mode: MultiToolMode = 'weapon'
  private _aiming = false
  private _isFiring = false
  private _mouseDown = false
  private _mouseJustPressed = false
  private _speed = 0
  private autoTimer = 0
  private drillRecoveryLocked = false
  private drillRecoveryRequiresRelease = false
  private readonly config: MultiToolConfig

  /** RTG-powered thruster system for tool energy. */
  readonly thrusterSystem: ThrusterSystem<MultiToolMode>
  /** Time until next RTG decay burst. */
  private rtgBurstTimer: number
  private readonly rtgConfig: RtgConfig

  constructor(config: MultiToolConfig) {
    this.config = config
    this.rtgConfig = config.rtg

    const tsConfig: ThrusterSystemConfig<MultiToolMode> = {
      fuelCapacity: config.rtg.fuelCapacity,
      thrusters: config.rtg.thrusters,
    }
    this.thrusterSystem = new ThrusterSystem<MultiToolMode>(tsConfig)

    // First burst comes quickly
    this.rtgBurstTimer = config.rtg.burstMin
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

  /** Current RTG fuel level. */
  get rtgLevel(): number {
    return this.thrusterSystem.fuelLevel
  }

  /** RTG fuel capacity. */
  get rtgCapacity(): number {
    return this.thrusterSystem.fuelCapacity
  }

  /** Current active mode's charge level. */
  get modeCharge(): number {
    return this.thrusterSystem.getState(this._mode).charge
  }

  /** Current active mode's charge capacity. */
  get modeChargeCapacity(): number {
    return this.thrusterSystem.getState(this._mode).capacity
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
    if (!mouseDown) {
      this.drillRecoveryRequiresRelease = false
    }
  }

  /** Feed player speed for drill safety lock. */
  setSpeed(speed: number): void {
    this._speed = speed
  }

  /** Advance trigger logic, RTG decay, and thruster system by one frame. */
  tick(dt: number): void {
    this._isFiring = false

    const drillState = this.thrusterSystem.getState('drill')
    if (
      this.drillRecoveryLocked &&
      drillState.charge >= drillState.capacity * MultiToolState.DRILL_RECOVERY_RATIO
    ) {
      this.drillRecoveryLocked = false
      this.drillRecoveryRequiresRelease = this._mouseDown
    }

    // --- RTG stochastic recharge ---
    this.rtgBurstTimer -= dt
    if (this.rtgBurstTimer <= 0) {
      // Decay burst — dump fuel into the pool
      this.thrusterSystem.addFuel(this.rtgConfig.burstAmount)
      // Schedule next burst at random interval
      this.rtgBurstTimer = this.rtgConfig.burstMin +
        Math.random() * (this.rtgConfig.burstMax - this.rtgConfig.burstMin)
    }

    // --- Determine firing intent ---
    let wantsFire = false

    if (this._aiming && !(this._mode === 'drill' && this._speed > 0.1)) {
      const cfg = this.config.modes[this._mode]

      switch (cfg.trigger) {
        case 'hold':
          wantsFire = this._mouseDown
          break

        case 'auto': {
          if (this._mouseDown) {
            if (this._mouseJustPressed) {
              wantsFire = true
              this.autoTimer = 0
            } else {
              const interval = 1 / (cfg.fireRate ?? 1)
              this.autoTimer += dt
              if (this.autoTimer >= interval) {
                wantsFire = true
                this.autoTimer -= interval
              }
            }
          } else {
            this.autoTimer = 0
          }
          break
        }

        case 'click':
          wantsFire = this._mouseJustPressed
          break
      }
    }

    // --- Gate on charge ---
    const blockedByDrillRecovery = this._mode === 'drill' && (
      this.drillRecoveryLocked || this.drillRecoveryRequiresRelease
    )
    const hasChargeToFire = this.thrusterSystem.canFire(this._mode)
    const canFire = wantsFire && !blockedByDrillRecovery && hasChargeToFire
    this._isFiring = canFire

    // --- Thruster system tick — active mode drains when firing ---
    this.thrusterSystem.tick(dt, {
      drill: this._isFiring && this._mode === 'drill',
      weapon: this._isFiring && this._mode === 'weapon',
      heal: this._isFiring && this._mode === 'heal',
    })

    if (
      (this._mode === 'drill' && wantsFire && !hasChargeToFire) ||
      this.thrusterSystem.getState('drill').charge <= 0
    ) {
      this.drillRecoveryLocked = true
      this.drillRecoveryRequiresRelease = true
    }

  }
}
