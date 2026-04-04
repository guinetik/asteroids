export interface ThrusterConfig {
  capacity: number
  burnRate: number
  rechargeRate: number
  fuelCostPerRecharge: number
}

export interface ThrusterSystemConfig {
  thrust: ThrusterConfig
  brake: ThrusterConfig
  rcs: ThrusterConfig
  fuelCapacity: number
}

export interface ThrusterState {
  charge: number
  capacity: number
  active: boolean
}

export const DEFAULT_THRUSTER_CONFIG: ThrusterSystemConfig = {
  thrust: { capacity: 100, burnRate: 20, rechargeRate: 6, fuelCostPerRecharge: 0.5 },
  brake: { capacity: 60, burnRate: 40, rechargeRate: 3, fuelCostPerRecharge: 0.6 },
  rcs: { capacity: 60, burnRate: 8, rechargeRate: 5, fuelCostPerRecharge: 0.2 },
  fuelCapacity: 500,
}

type ThrusterName = 'thrust' | 'brake' | 'rcs'

const THRUSTER_NAMES: ThrusterName[] = ['thrust', 'brake', 'rcs']
const ONE_FRAME_AT_60FPS = 1 / 60

/**
 * Three-thruster resource system with shared fuel tank.
 * Active thrusters drain charge. Idle thrusters recharge, consuming fuel.
 * No fuel = no recharging. All empty = game over.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export class ThrusterSystem {
  private charges: Record<ThrusterName, number>
  private activeState: Record<ThrusterName, boolean> = { thrust: false, brake: false, rcs: false }
  private readonly config: ThrusterSystemConfig
  private fuel: number
  private fuelEmptyFired = false
  private allDepletedFired = false

  onFuelEmpty: (() => void) | null = null
  onAllDepleted: (() => void) | null = null

  constructor(overrides: Partial<ThrusterSystemConfig> = {}) {
    this.config = { ...DEFAULT_THRUSTER_CONFIG, ...overrides }
    this.charges = {
      thrust: this.config.thrust.capacity,
      brake: this.config.brake.capacity,
      rcs: this.config.rcs.capacity,
    }
    this.fuel = this.config.fuelCapacity
  }

  canFire(thruster: ThrusterName): boolean {
    const cfg = this.config[thruster]
    return this.charges[thruster] >= cfg.burnRate * ONE_FRAME_AT_60FPS
  }

  getState(thruster: ThrusterName): ThrusterState {
    return {
      charge: this.charges[thruster],
      capacity: this.config[thruster].capacity,
      active: this.activeState[thruster],
    }
  }

  get fuelLevel(): number {
    return this.fuel
  }

  get fuelCapacity(): number {
    return this.config.fuelCapacity
  }

  get isFuelEmpty(): boolean {
    return this.fuel <= 0
  }

  get isAllDepleted(): boolean {
    return (
      this.fuel <= 0 &&
      this.charges.thrust <= 0 &&
      this.charges.brake <= 0 &&
      this.charges.rcs <= 0
    )
  }

  tick(dt: number, active: Record<ThrusterName, boolean>): void {
    this.activeState = { ...active }

    for (const name of THRUSTER_NAMES) {
      const cfg = this.config[name]

      if (active[name]) {
        this.charges[name] = Math.max(0, this.charges[name] - cfg.burnRate * dt)
      } else {
        if (this.fuel > 0) {
          const fuelCost = cfg.rechargeRate * dt * cfg.fuelCostPerRecharge
          const actualFuelUsed = Math.min(fuelCost, this.fuel)
          if (this.charges[name] < cfg.capacity) {
            const actualRecharge = actualFuelUsed / cfg.fuelCostPerRecharge
            this.charges[name] = Math.min(cfg.capacity, this.charges[name] + actualRecharge)
          }
          this.fuel = Math.max(0, this.fuel - actualFuelUsed)
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
