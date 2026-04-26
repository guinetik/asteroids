/**
 * Generic thruster resource system with shared fuel tank.
 *
 * Parameterized over an arbitrary set of thruster names so it works
 * for the shuttle (thrust/brake/rcs) and the lander (17 named thrusters).
 * Active thrusters drain charge. Idle thrusters recharge, consuming fuel.
 * No fuel = no recharging. All empty = game over.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */

/** Per-thruster tuning knobs. */
export interface ThrusterConfig {
  /** Maximum charge units */
  capacity: number
  /** Charge drained per second while firing */
  burnRate: number
  /** Charge recovered per second while idle (if fuel available) */
  rechargeRate: number
  /** Fuel consumed per unit of charge recharged */
  fuelCostPerRecharge: number
  /**
   * Optional recharge-lockout threshold expressed as a fraction of
   * {@link capacity} (0–1). When set and the thruster fully depletes
   * (charge hits 0 while firing), {@link ThrusterSystem.canFire} returns
   * `false` until the bar refills back up to `capacity * lockoutFraction`.
   * Mirrors the FPS sprint cooldown so depleted thrusters can't stutter
   * back on for one frame as soon as a sliver of charge is recovered.
   * Omit (or pass 0) to keep the legacy "fire as soon as one frame's
   * worth of charge exists" behaviour.
   */
  lockoutFraction?: number
}

/** Full system config: one ThrusterConfig per named thruster + shared fuel tank. */
export interface ThrusterSystemConfig<T extends string = string> {
  /** Per-thruster configuration keyed by thruster name */
  thrusters: Record<T, ThrusterConfig>
  /** Shared fuel tank capacity */
  fuelCapacity: number
}

/** Runtime multipliers that can modify per-thruster behavior without changing the base config. */
export interface ThrusterRuntimeModifiers<T extends string = string> {
  /** Scales charge drain while a thruster is firing. Lower means the bar lasts longer. */
  burnRateMultiplier?: Partial<Record<T, number>>
  /** Scales the recharge rate while a thruster is idle. Higher means charge refills faster. */
  rechargeRateMultiplier?: Partial<Record<T, number>>
  /**
   * Scales fuel cost per unit of charge recovered (per-thruster). Lower means cheaper
   * recharges. A value of `0` disables idle recharge for that thruster (no fuel spent,
   * no charge gained).
   */
  fuelCostMultiplier?: Partial<Record<T, number>>
}

/** Snapshot of a single thruster's runtime state. */
export interface ThrusterState {
  charge: number
  capacity: number
  active: boolean
}

/** Shuttle-specific preset: thrust / brake / rcs / turret-mining beam. */
export type ShuttleThrusterName = 'thrust' | 'brake' | 'rcs' | 'turretMining'

/** Base shuttle fuel tank at upgrade level 0 (before `shuttleFuelCapacity` shop multiplier). */
const SHUTTLE_BASE_FUEL_CAPACITY = 1000

/** Default config matching the original shuttle tuning. */
export const DEFAULT_SHUTTLE_CONFIG: ThrusterSystemConfig<ShuttleThrusterName> = {
  thrusters: {
    thrust: { capacity: 100, burnRate: 25, rechargeRate: 21, fuelCostPerRecharge: 0.5 },
    brake: { capacity: 60, burnRate: 60, rechargeRate: 5, fuelCostPerRecharge: 0.6 },
    rcs: { capacity: 60, burnRate: 8, rechargeRate: 5, fuelCostPerRecharge: 0.2 },
    turretMining: { capacity: 100, burnRate: 14, rechargeRate: 35, fuelCostPerRecharge: 0.8 },
  },
  fuelCapacity: SHUTTLE_BASE_FUEL_CAPACITY,
}

/**
 * @deprecated Use {@link DEFAULT_SHUTTLE_CONFIG} instead.
 * Kept for backwards compatibility with existing tests.
 */
export const DEFAULT_THRUSTER_CONFIG = {
  thrust: DEFAULT_SHUTTLE_CONFIG.thrusters.thrust,
  brake: DEFAULT_SHUTTLE_CONFIG.thrusters.brake,
  rcs: DEFAULT_SHUTTLE_CONFIG.thrusters.rcs,
  fuelCapacity: DEFAULT_SHUTTLE_CONFIG.fuelCapacity,
}

const ONE_FRAME_AT_60FPS = 1 / 60

/**
 * Generic thruster resource system with shared fuel tank.
 * Parameterized over thruster names via {@link ThrusterSystemConfig}.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export class ThrusterSystem<T extends string = ShuttleThrusterName> {
  private readonly charges: Record<T, number>
  private activeState: Record<T, boolean>
  private readonly locked: Record<T, boolean>
  /**
   * Per-thruster latch tracking whether raw input has been observed
   * released since the most recent lockout. Defaults to `true` (no
   * lockout in effect). Set to `false` the moment a lockout latches
   * while the input is held; cleared back to `true` by
   * {@link notifyInputIntent} when the caller reports the input as
   * not held. Unlock requires both this flag and the recharge
   * threshold so a held input can't auto-cycle through the lockout.
   */
  private readonly releasedSinceLockout: Record<T, boolean>
  /** Last raw input intent reported via {@link notifyInputIntent}. */
  private readonly inputIntent: Record<T, boolean>
  private readonly config: ThrusterSystemConfig<T>
  private readonly thrusterNames: T[]
  private fuel: number
  private fuelEmptyFired = false
  private allDepletedFired = false

  /** Fired once when fuel tank hits zero */
  onFuelEmpty: (() => void) | null = null
  /** Fired once when fuel and all charges are zero */
  onAllDepleted: (() => void) | null = null

  constructor(config: ThrusterSystemConfig<T>) {
    this.config = config
    this.thrusterNames = Object.keys(config.thrusters) as T[]
    this.fuel = config.fuelCapacity

    this.charges = {} as Record<T, number>
    this.activeState = {} as Record<T, boolean>
    this.locked = {} as Record<T, boolean>
    this.releasedSinceLockout = {} as Record<T, boolean>
    this.inputIntent = {} as Record<T, boolean>
    for (const name of this.thrusterNames) {
      this.charges[name] = config.thrusters[name].capacity
      this.activeState[name] = false
      this.locked[name] = false
      this.releasedSinceLockout[name] = true
      this.inputIntent[name] = false
    }
  }

  /**
   * Report raw input intent for a thruster. Used by the lockout state
   * machine to detect button release after a depletion lockout — without
   * this, holding the input through the recharge window would auto-fire
   * the moment the bar crosses {@link ThrusterConfig.lockoutFraction}.
   * Call this each frame the caller knows about input intent.
   */
  notifyInputIntent(thruster: T, held: boolean): void {
    this.inputIntent[thruster] = held
    if (!held) this.releasedSinceLockout[thruster] = true
  }

  /** Whether a thruster has enough charge for at least one frame of firing. */
  canFire(thruster: T, modifiers?: ThrusterRuntimeModifiers<T>): boolean {
    if (this.locked[thruster]) return false
    const cfg = this.config.thrusters[thruster]
    const burnRateMultiplier = Math.max(0, modifiers?.burnRateMultiplier?.[thruster] ?? 1)
    return this.charges[thruster] >= cfg.burnRate * burnRateMultiplier * ONE_FRAME_AT_60FPS
  }

  /** Whether a thruster is currently locked out and waiting for recharge. */
  isLocked(thruster: T): boolean {
    return this.locked[thruster]
  }

  /** Snapshot of a single thruster's runtime state. */
  getState(thruster: T): ThrusterState {
    return {
      charge: this.charges[thruster],
      capacity: this.config.thrusters[thruster].capacity,
      active: this.activeState[thruster],
    }
  }

  /** Current fuel remaining in the shared tank. */
  get fuelLevel(): number {
    return this.fuel
  }

  /** Maximum fuel capacity. */
  get fuelCapacity(): number {
    return this.config.fuelCapacity
  }

  /** Whether the fuel tank is empty. */
  get isFuelEmpty(): boolean {
    return this.fuel <= 0
  }

  /** Whether fuel and all thruster charges are depleted. */
  get isAllDepleted(): boolean {
    if (this.fuel > 0) return false
    for (const name of this.thrusterNames) {
      if (this.charges[name] > 0) return false
    }
    return true
  }

  /**
   * Drain fuel directly from the shared tank (e.g. base O2 consumption).
   * Clamps to zero — will not go negative.
   *
   * @param amount - Fuel units to consume
   */
  consumeFuel(amount: number): void {
    this.fuel = Math.max(0, this.fuel - amount)
  }

  /**
   * Add fuel to the shared tank (e.g. RTG decay burst).
   * Clamps to capacity.
   *
   * @param amount - Fuel units to add
   */
  addFuel(amount: number): void {
    this.fuel = Math.min(this.config.fuelCapacity, this.fuel + amount)
  }

  /** Restore fuel and all thruster charges to full capacity. */
  refuel(): void {
    this.fuel = this.config.fuelCapacity
    this.fuelEmptyFired = false
    this.allDepletedFired = false
    for (const name of this.thrusterNames) {
      this.charges[name] = this.config.thrusters[name].capacity
      this.activeState[name] = false
      this.locked[name] = false
      this.releasedSinceLockout[name] = true
      this.inputIntent[name] = false
    }
  }

  /**
   * Advance one frame. Active thrusters drain charge; idle thrusters recharge from fuel.
   *
   * @param dt - Delta time in seconds
   * @param active - Which thrusters are firing this frame
   */
  tick(dt: number, active: Record<T, boolean>, modifiers?: ThrusterRuntimeModifiers<T>): void {
    this.activeState = { ...active }

    for (const name of this.thrusterNames) {
      const cfg = this.config.thrusters[name]
      const burnRateMultiplier = Math.max(0, modifiers?.burnRateMultiplier?.[name] ?? 1)

      if (active[name]) {
        this.charges[name] = Math.max(
          0,
          this.charges[name] - cfg.burnRate * burnRateMultiplier * dt,
        )
      } else {
        if (this.fuel > 0 && this.charges[name] < cfg.capacity) {
          const rechargeMultiplier = Math.max(0, modifiers?.rechargeRateMultiplier?.[name] ?? 1)
          const fuelCostMultiplier = Math.max(0, modifiers?.fuelCostMultiplier?.[name] ?? 1)
          const desiredRecharge = cfg.rechargeRate * rechargeMultiplier * dt
          const chargeSpace = cfg.capacity - this.charges[name]
          const actualRecharge = Math.min(desiredRecharge, chargeSpace)
          const fuelCost = Math.max(
            0,
            actualRecharge * cfg.fuelCostPerRecharge * fuelCostMultiplier,
          )
          const actualFuelUsed = Math.min(fuelCost, this.fuel)
          const chargeFromFuel =
            fuelCostMultiplier > 0
              ? actualFuelUsed / (cfg.fuelCostPerRecharge * fuelCostMultiplier)
              : 0
          this.charges[name] = Math.min(cfg.capacity, this.charges[name] + chargeFromFuel)
          this.fuel = Math.max(0, this.fuel - actualFuelUsed)
        }
      }

      // Recharge lockout: once the bar can no longer sustain a single
      // frame of firing, gate canFire until BOTH (a) the bar refills
      // back up to lockoutFraction × capacity AND (b) the caller has
      // reported the input as released since the lockout latched. The
      // release requirement matters because the active-state branch
      // above sets active=false when canFire returns false — without
      // an explicit release latch, a held input would auto-cycle
      // recharge → unlock → drain → lock the moment the bar crossed
      // the threshold, producing the visible "thruster keeps firing
      // with empty bar" stutter.
      const lockFraction = cfg.lockoutFraction ?? 0
      if (lockFraction > 0) {
        const minFireCharge = cfg.burnRate * burnRateMultiplier * ONE_FRAME_AT_60FPS
        if (!this.locked[name] && this.charges[name] < minFireCharge) {
          this.locked[name] = true
          this.releasedSinceLockout[name] = !this.inputIntent[name]
        } else if (
          this.locked[name] &&
          this.releasedSinceLockout[name] &&
          this.charges[name] >= cfg.capacity * lockFraction
        ) {
          this.locked[name] = false
        }
      }
    }

    if (this.fuel <= 0 && !this.fuelEmptyFired) {
      this.fuelEmptyFired = true
      this.onFuelEmpty?.()
    }

    if (this.isAllDepleted && !this.allDepletedFired) {
      this.allDepletedFired = true
      this.onAllDepleted?.()
    }
  }
}
