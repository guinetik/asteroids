import { describe, it, expect, vi } from 'vitest'
import { ThrusterSystem, DEFAULT_SHUTTLE_CONFIG, DEFAULT_THRUSTER_CONFIG } from '../thrusterSystem'
import type {
  ShuttleThrusterName,
  ThrusterRuntimeModifiers,
  ThrusterSystemConfig,
} from '../thrusterSystem'

type TestName = 'a' | 'b'

const TEST_CONFIG: ThrusterSystemConfig<TestName> = {
  thrusters: {
    a: { capacity: 10, burnRate: 5, rechargeRate: 10, fuelCostPerRecharge: 1 },
    b: { capacity: 10, burnRate: 5, rechargeRate: 10, fuelCostPerRecharge: 1 },
  },
  fuelCapacity: 100,
}

function createShuttleSystem(overrides: Partial<typeof DEFAULT_SHUTTLE_CONFIG> = {}) {
  return new ThrusterSystem<ShuttleThrusterName>({ ...DEFAULT_SHUTTLE_CONFIG, ...overrides })
}

describe('ThrusterSystem', () => {
  it('starts with full charge on all thrusters', () => {
    const sys = createShuttleSystem()
    expect(sys.getState('thrust').charge).toBe(DEFAULT_THRUSTER_CONFIG.thrust.capacity)
    expect(sys.getState('brake').charge).toBe(DEFAULT_THRUSTER_CONFIG.brake.capacity)
    expect(sys.getState('rcs').charge).toBe(DEFAULT_THRUSTER_CONFIG.rcs.capacity)
  })

  it('starts with full fuel', () => {
    const sys = createShuttleSystem()
    expect(sys.fuelLevel).toBe(DEFAULT_THRUSTER_CONFIG.fuelCapacity)
  })

  it('drains charge when thruster is active', () => {
    const sys = createShuttleSystem()
    const before = sys.getState('thrust').charge
    sys.tick(1, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sys.getState('thrust').charge).toBe(before - DEFAULT_THRUSTER_CONFIG.thrust.burnRate)
  })

  it('applies burn rate multipliers to active thruster drain', () => {
    const sys = createShuttleSystem()
    const before = sys.getState('thrust').charge
    sys.tick(
      1,
      { thrust: true, brake: false, rcs: false, turretMining: false },
      {
        burnRateMultiplier: { thrust: 0.5 },
      },
    )
    expect(sys.getState('thrust').charge).toBe(
      before - DEFAULT_THRUSTER_CONFIG.thrust.burnRate * 0.5,
    )
  })

  it('applies burn rate multipliers to canFire thresholds', () => {
    const sys = createShuttleSystem()
    const thrust = DEFAULT_THRUSTER_CONFIG.thrust
    const oneFrame = 1 / 60
    /** Midway between “below default frame threshold” and “above 0.25× threshold”. */
    const drainSeconds =
      (2 * thrust.capacity - thrust.burnRate * oneFrame * 1.25) / (2 * thrust.burnRate)
    sys.tick(drainSeconds, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sys.canFire('thrust')).toBe(false)
    expect(sys.canFire('thrust', { burnRateMultiplier: { thrust: 0.25 } })).toBe(true)
  })

  it('recharges idle thrusters consuming fuel', () => {
    const sys = createShuttleSystem()
    sys.tick(2, { thrust: true, brake: false, rcs: false, turretMining: false })
    const chargeAfterDrain = sys.getState('thrust').charge
    const fuelBefore = sys.fuelLevel
    sys.tick(1, { thrust: false, brake: false, rcs: false, turretMining: false })
    expect(sys.getState('thrust').charge).toBeGreaterThan(chargeAfterDrain)
    expect(sys.fuelLevel).toBeLessThan(fuelBefore)
  })

  it('rechargeRateMultiplier 2.0 recharges twice as fast as default', () => {
    const thrustCfg = DEFAULT_THRUSTER_CONFIG.thrust
    const drainSeconds = 1
    const sysDefault = createShuttleSystem()
    sysDefault.tick(drainSeconds, { thrust: true, brake: false, rcs: false, turretMining: false })
    const chargeAfterDrain = sysDefault.getState('thrust').charge
    const headroom = thrustCfg.capacity - chargeAfterDrain
    /** Stay under capacity so 2× recharge is not clamped while 1× still fits. */
    const dt = (headroom - 0.01) / (2 * thrustCfg.rechargeRate)

    sysDefault.tick(dt, { thrust: false, brake: false, rcs: false, turretMining: false })
    const gainDefault = sysDefault.getState('thrust').charge - chargeAfterDrain

    const sysDouble = createShuttleSystem()
    sysDouble.tick(drainSeconds, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sysDouble.getState('thrust').charge).toBe(chargeAfterDrain)
    sysDouble.tick(
      dt,
      { thrust: false, brake: false, rcs: false, turretMining: false },
      {
        rechargeRateMultiplier: { thrust: 2 },
      },
    )
    const gainDouble = sysDouble.getState('thrust').charge - chargeAfterDrain

    expect(gainDouble).toBeCloseTo(thrustCfg.rechargeRate * dt * 2, 10)
    expect(gainDouble).toBeCloseTo(gainDefault * 2, 10)
  })

  it('rechargeRateMultiplier 0.5 recharges half as fast as default', () => {
    const thrustCfg = DEFAULT_THRUSTER_CONFIG.thrust
    const dt = 1
    const sysDefault = createShuttleSystem()
    sysDefault.tick(1, { thrust: true, brake: false, rcs: false, turretMining: false })
    const chargeAfterDrain = sysDefault.getState('thrust').charge
    sysDefault.tick(dt, { thrust: false, brake: false, rcs: false, turretMining: false })
    const gainDefault = sysDefault.getState('thrust').charge - chargeAfterDrain

    const sysHalf = createShuttleSystem()
    sysHalf.tick(1, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sysHalf.getState('thrust').charge).toBe(chargeAfterDrain)
    sysHalf.tick(
      dt,
      { thrust: false, brake: false, rcs: false, turretMining: false },
      {
        rechargeRateMultiplier: { thrust: 0.5 },
      },
    )
    const gainHalf = sysHalf.getState('thrust').charge - chargeAfterDrain

    expect(gainHalf).toBeCloseTo(thrustCfg.rechargeRate * dt * 0.5, 10)
    expect(gainHalf).toBeCloseTo(gainDefault * 0.5, 10)
  })

  it('omitting rechargeRateMultiplier matches explicit 1.0', () => {
    const runIdleRechargeTick = (modifiers?: ThrusterRuntimeModifiers<ShuttleThrusterName>) => {
      const sys = createShuttleSystem()
      sys.tick(1, { thrust: true, brake: false, rcs: false, turretMining: false })
      sys.tick(1, { thrust: false, brake: false, rcs: false, turretMining: false }, modifiers)
      return {
        thrustCharge: sys.getState('thrust').charge,
        fuelLevel: sys.fuelLevel,
      }
    }

    const omitted = runIdleRechargeTick()
    const explicitOne = runIdleRechargeTick({ rechargeRateMultiplier: { thrust: 1 } })
    expect(explicitOne).toEqual(omitted)
  })

  it('does not recharge active thrusters', () => {
    const sys = createShuttleSystem()
    sys.tick(0.5, { thrust: true, brake: false, rcs: false, turretMining: false })
    const chargeAfterDrain = sys.getState('thrust').charge
    expect(chargeAfterDrain).toBeGreaterThan(0)
    sys.tick(0.5, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sys.getState('thrust').charge).toBeLessThan(chargeAfterDrain)
  })

  it('canFire returns false when charge is insufficient', () => {
    const sys = createShuttleSystem()
    sys.tick(100, { thrust: true, brake: false, rcs: false, turretMining: false })
    expect(sys.canFire('thrust')).toBe(false)
  })

  it('canFire returns true when charge is sufficient', () => {
    const sys = createShuttleSystem()
    expect(sys.canFire('thrust')).toBe(true)
  })

  it('stops recharging when fuel is empty', () => {
    const sys = createShuttleSystem({ fuelCapacity: 1 })
    // Drain charge first so recharge actually consumes fuel
    sys.tick(3, { thrust: true, brake: true, rcs: true, turretMining: false })
    // Now let it try to recharge — should exhaust the tiny fuel tank
    sys.tick(10, { thrust: false, brake: false, rcs: false, turretMining: false })
    expect(sys.fuelLevel).toBe(0)
    const chargeNow = sys.getState('thrust').charge
    // With no fuel left, charge should not increase further
    sys.tick(1, { thrust: false, brake: false, rcs: false, turretMining: false })
    expect(sys.getState('thrust').charge).toBe(chargeNow)
  })

  it('fires onFuelEmpty callback once', () => {
    const sys = createShuttleSystem({ fuelCapacity: 1 })
    const cb = vi.fn()
    sys.onFuelEmpty = cb
    // Drain charge so recharge consumes the tiny fuel tank
    sys.tick(3, { thrust: true, brake: true, rcs: true, turretMining: false })
    sys.tick(10, { thrust: false, brake: false, rcs: false, turretMining: false })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires onAllDepleted when fuel and all charges are zero', () => {
    const sys = createShuttleSystem({ fuelCapacity: 0 })
    const cb = vi.fn()
    sys.onAllDepleted = cb
    sys.tick(100, { thrust: true, brake: true, rcs: true, turretMining: true })
    expect(cb).toHaveBeenCalled()
  })

  it('clamps charge to capacity', () => {
    const sys = createShuttleSystem()
    sys.tick(10, { thrust: false, brake: false, rcs: false, turretMining: false })
    expect(sys.getState('thrust').charge).toBe(DEFAULT_THRUSTER_CONFIG.thrust.capacity)
  })

  it('consumeFuel drains fuel from the shared tank', () => {
    const sys = createShuttleSystem()
    const before = sys.fuelLevel
    sys.consumeFuel(50)
    expect(sys.fuelLevel).toBe(before - 50)
  })

  it('consumeFuel clamps fuel to zero', () => {
    const sys = createShuttleSystem()
    sys.consumeFuel(999999)
    expect(sys.fuelLevel).toBe(0)
  })

  it('consumeFuel does not go negative', () => {
    const sys = createShuttleSystem()
    sys.consumeFuel(999999)
    sys.consumeFuel(10)
    expect(sys.fuelLevel).toBe(0)
  })
})

describe('ThrusterSystem.tick — fuelCostMultiplier', () => {
  it('scales per-group fuel cost while idle-recharging', () => {
    const system = new ThrusterSystem<TestName>(TEST_CONFIG)
    // Drain charges so both thrusters need recharge
    system.tick(1, { a: true, b: true })
    const before = system.fuelLevel

    // Tick idle for 1s with multiplier: a=0.5 (cheap), b=2 (expensive)
    system.tick(
      1,
      { a: false, b: false },
      {
        fuelCostMultiplier: { a: 0.5, b: 2 },
      },
    )
    const after = system.fuelLevel
    const drained = before - after

    // a costs 0.5 per charge unit (5 units recovered → 2.5 fuel)
    // b costs 2 per charge unit (5 units recovered → 10 fuel)
    // Total expected: ~12.5 fuel; exact value depends on cap clamping and rates
    expect(drained).toBeGreaterThan(10)
    expect(drained).toBeLessThan(16)
  })

  it('treats missing fuelCostMultiplier entries as 1.0 (backward compatible)', () => {
    const system = new ThrusterSystem<TestName>(TEST_CONFIG)
    system.tick(1, { a: true, b: true })

    const baseline = new ThrusterSystem<TestName>(TEST_CONFIG)
    baseline.tick(1, { a: true, b: true })

    const deltaWithMods = (() => {
      const f0 = system.fuelLevel
      system.tick(1, { a: false, b: false }, { fuelCostMultiplier: { a: 1 } })
      return f0 - system.fuelLevel
    })()
    const deltaWithoutMods = (() => {
      const f0 = baseline.fuelLevel
      baseline.tick(1, { a: false, b: false })
      return f0 - baseline.fuelLevel
    })()

    expect(deltaWithMods).toBeCloseTo(deltaWithoutMods, 3)
  })
})
