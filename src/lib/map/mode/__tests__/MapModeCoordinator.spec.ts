import { describe, it, expect, beforeEach } from 'vitest'
import { MapModeCoordinator } from '../MapModeCoordinator'

describe('MapModeCoordinator.resolveTurretToggle', () => {
  let coord: MapModeCoordinator
  beforeEach(() => {
    coord = new MapModeCoordinator()
  })

  const baseParams = {
    togglePressed: true,
    turretActive: false,
    orbitState: 'free' as const,
    mapIsOpen: false,
    habitatActive: false,
    evaActive: false,
    isDead: false,
    unlocked: true,
    introLocked: false,
  }

  it('returns null without press', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, togglePressed: false })).toBeNull()
  })

  it('returns null when turret is already active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, turretActive: true })).toBeNull()
  })

  it('returns null when map is open', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, mapIsOpen: true })).toBeNull()
  })

  it('returns null when habitat is active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, habitatActive: true })).toBeNull()
  })

  it('returns null when EVA is active', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, evaActive: true })).toBeNull()
  })

  it('returns null when shuttle is dead', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, isDead: true })).toBeNull()
  })

  it('returns null when not unlocked', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, unlocked: false })).toBeNull()
  })

  it('returns null during intro lock', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, introLocked: true })).toBeNull()
  })

  it('returns null while approaching a planet', () => {
    expect(coord.resolveTurretToggle({ ...baseParams, orbitState: 'approaching' })).toBeNull()
  })

  it("returns 'enter' in free flight with unlock, no other modes active, press true", () => {
    expect(coord.resolveTurretToggle(baseParams)).toBe('enter')
  })

  it("returns 'enter' while orbiting (orbit is stationary and safe)", () => {
    expect(coord.resolveTurretToggle({ ...baseParams, orbitState: 'orbiting' })).toBe('enter')
  })
})
