import { describe, it, expect, vi } from 'vitest'
import { ThrusterSystem, DEFAULT_SHUTTLE_CONFIG, DEFAULT_THRUSTER_CONFIG } from '../thrusterSystem'
import type { ShuttleThrusterName } from '../thrusterSystem'

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
    sys.tick(1, { thrust: true, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBe(before - DEFAULT_THRUSTER_CONFIG.thrust.burnRate)
  })

  it('recharges idle thrusters consuming fuel', () => {
    const sys = createShuttleSystem()
    sys.tick(2, { thrust: true, brake: false, rcs: false })
    const chargeAfterDrain = sys.getState('thrust').charge
    const fuelBefore = sys.fuelLevel
    sys.tick(1, { thrust: false, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBeGreaterThan(chargeAfterDrain)
    expect(sys.fuelLevel).toBeLessThan(fuelBefore)
  })

  it('does not recharge active thrusters', () => {
    const sys = createShuttleSystem()
    sys.tick(2, { thrust: true, brake: false, rcs: false })
    const chargeAfterDrain = sys.getState('thrust').charge
    sys.tick(1, { thrust: true, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBeLessThan(chargeAfterDrain)
  })

  it('canFire returns false when charge is insufficient', () => {
    const sys = createShuttleSystem()
    sys.tick(100, { thrust: true, brake: false, rcs: false })
    expect(sys.canFire('thrust')).toBe(false)
  })

  it('canFire returns true when charge is sufficient', () => {
    const sys = createShuttleSystem()
    expect(sys.canFire('thrust')).toBe(true)
  })

  it('stops recharging when fuel is empty', () => {
    const sys = createShuttleSystem({ fuelCapacity: 1 })
    // Drain charge first so recharge actually consumes fuel
    sys.tick(3, { thrust: true, brake: true, rcs: true })
    // Now let it try to recharge — should exhaust the tiny fuel tank
    sys.tick(10, { thrust: false, brake: false, rcs: false })
    expect(sys.fuelLevel).toBe(0)
    const chargeNow = sys.getState('thrust').charge
    // With no fuel left, charge should not increase further
    sys.tick(1, { thrust: false, brake: false, rcs: false })
    expect(sys.getState('thrust').charge).toBe(chargeNow)
  })

  it('fires onFuelEmpty callback once', () => {
    const sys = createShuttleSystem({ fuelCapacity: 1 })
    const cb = vi.fn()
    sys.onFuelEmpty = cb
    // Drain charge so recharge consumes the tiny fuel tank
    sys.tick(3, { thrust: true, brake: true, rcs: true })
    sys.tick(10, { thrust: false, brake: false, rcs: false })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('fires onAllDepleted when fuel and all charges are zero', () => {
    const sys = createShuttleSystem({ fuelCapacity: 0 })
    const cb = vi.fn()
    sys.onAllDepleted = cb
    sys.tick(100, { thrust: true, brake: true, rcs: true })
    expect(cb).toHaveBeenCalled()
  })

  it('clamps charge to capacity', () => {
    const sys = createShuttleSystem()
    sys.tick(10, { thrust: false, brake: false, rcs: false })
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
