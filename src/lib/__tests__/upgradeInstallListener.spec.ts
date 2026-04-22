/**
 * Tests for the upgrade-install listener API.
 *
 * @author guinetik
 * @date 2026-04-22
 * @spec docs/superpowers/specs/2026-04-22-act-1-inner-system-journey-design.md
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CURRENT_PLAYER_UPGRADE_LEVELS,
  ensureUpgradeAtLeast,
  onUpgradeInstalled,
  resetPlayerUpgradesToDefaults,
  setPlayerUpgradeLevel,
  type UpgradeId,
} from '../upgrades'

describe('onUpgradeInstalled', () => {
  beforeEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  afterEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  it('fires when ensureUpgradeAtLeast takes a level from 0 to 1', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('gravitySurfing', 1)
      expect(events).toEqual(['gravitySurfing'])
    } finally {
      unsubscribe()
    }
  })

  it('does not fire on a 1 → 2 tier bump (install is a zero-crossing event)', () => {
    ensureUpgradeAtLeast('shuttleHull', 1)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('shuttleHull', 2)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('does not fire when ensureUpgradeAtLeast is a no-op at current level', () => {
    ensureUpgradeAtLeast('shuttleHull', 1)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      ensureUpgradeAtLeast('shuttleHull', 1)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('fires from setPlayerUpgradeLevel on a 0 → ≥1 transition', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      setPlayerUpgradeLevel('gravitySurfing', 1)
      expect(events).toEqual(['gravitySurfing'])
      expect(CURRENT_PLAYER_UPGRADE_LEVELS.gravitySurfing).toBe(1)
    } finally {
      unsubscribe()
    }
  })

  it('fires exactly once on a direct 0 → 2 jump via setPlayerUpgradeLevel', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      setPlayerUpgradeLevel('shuttleHull', 2)
      expect(events).toEqual(['shuttleHull'])
      expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleHull).toBe(2)
    } finally {
      unsubscribe()
    }
  })

  it('does not fire from setPlayerUpgradeLevel when the new value equals the old', () => {
    ensureUpgradeAtLeast('shuttleHull', 2)
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    try {
      setPlayerUpgradeLevel('shuttleHull', 2)
      expect(events).toEqual([])
    } finally {
      unsubscribe()
    }
  })

  it('unsubscribe removes the listener', () => {
    const events: UpgradeId[] = []
    const unsubscribe = onUpgradeInstalled((id) => events.push(id))
    unsubscribe()
    ensureUpgradeAtLeast('gravitySurfing', 1)
    expect(events).toEqual([])
  })
})
