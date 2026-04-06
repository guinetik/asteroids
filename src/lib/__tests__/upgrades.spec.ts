/**
 * Tests for generic upgrade value resolution.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  CURRENT_PLAYER_UPGRADE_LEVELS,
  getCurrentShuttleThrusterEfficiencyModifiers,
  getCurrentUpgradeValue,
  getShuttleThrusterEfficiencyModifiers,
  getUpgradeValue,
} from '../upgrades'

describe('getUpgradeValue', () => {
  it('resolves shuttle fuel drain values by level', () => {
    expect(getUpgradeValue('shuttleFuelUpgrade', { shuttleFuelUpgrade: 0 })).toBe(3)
    expect(getUpgradeValue('shuttleFuelUpgrade', { shuttleFuelUpgrade: 1 })).toBe(2)
    expect(getUpgradeValue('shuttleFuelUpgrade', { shuttleFuelUpgrade: 2 })).toBe(1)
    expect(getUpgradeValue('shuttleFuelUpgrade', { shuttleFuelUpgrade: 3 })).toBe(0)
  })

  it('defaults missing upgrade state to level zero', () => {
    expect(getUpgradeValue('shuttleFuelUpgrade', {})).toBe(3)
  })

  it('clamps levels above the upgrade max', () => {
    expect(getUpgradeValue('shuttleFuelUpgrade', { shuttleFuelUpgrade: 99 })).toBe(0)
  })

  it('resolves shuttle thruster efficiency upgrade multipliers by level', () => {
    expect(getUpgradeValue('shuttleBoosterEfficiencyUpgrade', { shuttleBoosterEfficiencyUpgrade: 0 })).toBe(1)
    expect(getUpgradeValue('shuttleBoosterEfficiencyUpgrade', { shuttleBoosterEfficiencyUpgrade: 1 })).toBe(0.75)
    expect(getUpgradeValue('shuttleBrakeEfficiencyUpgrade', { shuttleBrakeEfficiencyUpgrade: 2 })).toBe(0.5)
    expect(getUpgradeValue('shuttleThrustersEfficiencyUpgrade', { shuttleThrustersEfficiencyUpgrade: 3 })).toBe(0.25)
  })
})

describe('getCurrentUpgradeValue', () => {
  it('uses the current player upgrade levels', () => {
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleFuelUpgrade).toBe(0)
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleBoosterEfficiencyUpgrade).toBe(0)
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleBrakeEfficiencyUpgrade).toBe(0)
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleThrustersEfficiencyUpgrade).toBe(0)
    expect(getCurrentUpgradeValue('shuttleFuelUpgrade')).toBe(3)
  })
})

describe('getShuttleThrusterEfficiencyModifiers', () => {
  it('resolves shuttle thruster burn-rate multipliers from upgrade levels', () => {
    expect(getShuttleThrusterEfficiencyModifiers({
      shuttleBoosterEfficiencyUpgrade: 1,
      shuttleBrakeEfficiencyUpgrade: 2,
      shuttleThrustersEfficiencyUpgrade: 3,
    })).toEqual({
      thrust: 0.75,
      brake: 0.5,
      rcs: 0.25,
    })
  })

  it('uses current player upgrades for the default shuttle modifiers', () => {
    expect(getCurrentShuttleThrusterEfficiencyModifiers()).toEqual({
      thrust: 1,
      brake: 1,
      rcs: 1,
    })
  })
})
