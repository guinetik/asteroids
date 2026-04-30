import { describe, it, expect } from 'vitest'
import { applyShuttleBuffs } from '@/lib/shuttle/buffs'
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
