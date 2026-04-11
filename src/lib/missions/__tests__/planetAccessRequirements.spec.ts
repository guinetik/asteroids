import { describe, it, expect } from 'vitest'
import { canAccessPlanet } from '../planetAccessRequirements'

describe('canAccessPlanet', () => {
  it('earth and mars are always accessible', () => {
    expect(canAccessPlanet('earth', {})).toBe(true)
    expect(canAccessPlanet('mars', {})).toBe(true)
  })

  it('venus requires heat resistance 1', () => {
    expect(canAccessPlanet('venus', {})).toBe(false)
    expect(canAccessPlanet('venus', { shuttleHeatResistance: 0 })).toBe(false)
    expect(canAccessPlanet('venus', { shuttleHeatResistance: 1 })).toBe(true)
    expect(canAccessPlanet('venus', { shuttleHeatResistance: 3 })).toBe(true)
  })

  it('mercury requires heat resistance 3', () => {
    expect(canAccessPlanet('mercury', { shuttleHeatResistance: 1 })).toBe(false)
    expect(canAccessPlanet('mercury', { shuttleHeatResistance: 2 })).toBe(false)
    expect(canAccessPlanet('mercury', { shuttleHeatResistance: 3 })).toBe(true)
  })

  it('jupiter and saturn require freeze resistance 1', () => {
    expect(canAccessPlanet('jupiter', {})).toBe(false)
    expect(canAccessPlanet('jupiter', { shuttleFreezeResistance: 1 })).toBe(true)
    expect(canAccessPlanet('saturn', {})).toBe(false)
    expect(canAccessPlanet('saturn', { shuttleFreezeResistance: 1 })).toBe(true)
  })

  it('uranus and neptune require freeze resistance 3', () => {
    expect(canAccessPlanet('uranus', { shuttleFreezeResistance: 1 })).toBe(false)
    expect(canAccessPlanet('uranus', { shuttleFreezeResistance: 2 })).toBe(false)
    expect(canAccessPlanet('uranus', { shuttleFreezeResistance: 3 })).toBe(true)
    expect(canAccessPlanet('neptune', { shuttleFreezeResistance: 2 })).toBe(false)
    expect(canAccessPlanet('neptune', { shuttleFreezeResistance: 3 })).toBe(true)
  })

  it('unknown planets are always accessible', () => {
    expect(canAccessPlanet('pluto', {})).toBe(true)
  })
})
