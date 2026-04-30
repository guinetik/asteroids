import { describe, it, expect } from 'vitest'
import { applyShuttleBuffs } from '@/lib/shuttle/buffs'
import { buildBuffedShuttleConfig } from '@/lib/physics/thrusterSystem'
import type { PlayerProfile } from '@/lib/player/types'

describe('applyShuttleBuffs', () => {
  it('returns base value when shuttleBuffs is undefined', () => {
    const p = {} as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(100)
  })

  it('returns base when shuttleBuffs is empty', () => {
    const p = { shuttleBuffs: {} } as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(100)
  })

  it('multiplies by jovianEmpowerment', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    expect(applyShuttleBuffs(p, 100, 'fuel')).toBe(150)
  })

  it('compounds multiple buffs', () => {
    const p = { shuttleBuffs: { a: 1.5, b: 2 } } as unknown as PlayerProfile
    expect(applyShuttleBuffs(p, 100, '_')).toBe(300)
  })

  it('handles fractional values', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    expect(applyShuttleBuffs(p, 1000, 'fuel')).toBe(1500)
  })
})

describe('end-to-end buff → ship stat integration', () => {
  it('profile with jovianEmpowerment=1.5 produces 1.5× fuel capacity in shuttle thruster config', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    const buffMult = applyShuttleBuffs(p, 1, 'fuel')
    const config = buildBuffedShuttleConfig(/* fuelUpgradeMultiplier */ 1, buffMult)
    // Base shuttle fuel capacity is 1000; with 1.5× buff → 1500
    expect(config.fuelCapacity).toBe(1500)
  })

  it('profile with jovianEmpowerment=1.5 scales thrust group capacity 1.5×', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    const buffMult = applyShuttleBuffs(p, 1, 'thruster-capacity')
    const config = buildBuffedShuttleConfig(1, buffMult)
    // Base thrust capacity is 100; with 1.5× buff → 150
    expect(config.thrusters.thrust.capacity).toBe(150)
    // Base brake capacity is 60; with 1.5× buff → 90
    expect(config.thrusters.brake.capacity).toBe(90)
  })

  it('profile with jovianEmpowerment=1.5 scales thrust group rechargeRate 1.5×', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    const buffMult = applyShuttleBuffs(p, 1, 'thruster-recharge')
    const config = buildBuffedShuttleConfig(1, buffMult)
    // Base thrust rechargeRate is 21; with 1.5× buff → 31.5
    expect(config.thrusters.thrust.rechargeRate).toBe(31.5)
  })

  it('fuelUpgradeMultiplier and buffMultiplier both scale fuel capacity', () => {
    const p = { shuttleBuffs: { jovianEmpowerment: 1.5 } } as unknown as PlayerProfile
    const buffMult = applyShuttleBuffs(p, 1, 'fuel')
    const config = buildBuffedShuttleConfig(/* fuelUpgradeMultiplier */ 2, buffMult)
    // 1000 × 2 (upgrade) × 1.5 (buff) = 3000
    expect(config.fuelCapacity).toBe(3000)
  })

  it('no buff leaves config unchanged (buffMultiplier = 1)', () => {
    const p = {} as PlayerProfile
    const buffMult = applyShuttleBuffs(p, 1, 'fuel')
    const config = buildBuffedShuttleConfig(1, buffMult)
    expect(config.fuelCapacity).toBe(1000)
    expect(config.thrusters.thrust.capacity).toBe(100)
    expect(config.thrusters.thrust.rechargeRate).toBe(21)
  })
})
