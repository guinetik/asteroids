/**
 * Tests for data-driven upgrade definitions and value resolution.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  UPGRADE_DEFINITIONS,
  CURRENT_PLAYER_UPGRADE_LEVELS,
  getUpgradeValue,
  getCurrentUpgradeValue,
  getUpgradeCost,
  getUpgradesByCategory,
  getShuttleThrusterEfficiencyModifiers,
  getCurrentShuttleThrusterEfficiencyModifiers,
  getShuttleSlingshotBurstMultiplier,
  getShuttleSlingshotCruiseSpeedMultiplier,
  hasGravitySurfingUnlock,
  hasOrbitalSurfingUnlock,
  hydratePlayerUpgradeLevelsFromStorage,
  resetPlayerUpgradesToDefaults,
} from '../upgrades'
import {
  PLAYER_UPGRADES_STORAGE_KEY,
  PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION,
} from '../upgradeStorage'

/** Total number of upgrades defined in the JSON. */
const EXPECTED_UPGRADE_COUNT = 33

describe('UPGRADE_DEFINITIONS', () => {
  it('loads all upgrades from JSON', () => {
    const ids = Object.keys(UPGRADE_DEFINITIONS)
    expect(ids).toHaveLength(EXPECTED_UPGRADE_COUNT)
  })

  it('every definition has id matching its key', () => {
    for (const [key, def] of Object.entries(UPGRADE_DEFINITIONS)) {
      expect(def.id).toBe(key)
    }
  })

  it('every definition has category, label, description, baseCost', () => {
    for (const def of Object.values(UPGRADE_DEFINITIONS)) {
      expect(['shuttle', 'lander', 'multitool', 'suit']).toContain(def.category)
      expect(def.label).toBeTruthy()
      expect(def.description).toBeTruthy()
      expect(def.hiddenFromShop || def.baseCost > 0).toBe(true)
    }
  })

  it('valuesByLevel length equals maxLevel + 1', () => {
    for (const def of Object.values(UPGRADE_DEFINITIONS)) {
      expect(def.valuesByLevel).toHaveLength(def.maxLevel + 1)
    }
  })
})

describe('CURRENT_PLAYER_UPGRADE_LEVELS', () => {
  afterEach(() => {
    localStorage.removeItem(PLAYER_UPGRADES_STORAGE_KEY)
    resetPlayerUpgradesToDefaults()
  })

  it('initializes all upgrades to level 0', () => {
    const keys = Object.keys(CURRENT_PLAYER_UPGRADE_LEVELS)
    expect(keys).toHaveLength(EXPECTED_UPGRADE_COUNT)
    for (const level of Object.values(CURRENT_PLAYER_UPGRADE_LEVELS)) {
      expect(level).toBe(0)
    }
  })

  it('hydratePlayerUpgradeLevelsFromStorage merges stored levels', () => {
    resetPlayerUpgradesToDefaults()
    localStorage.setItem(
      PLAYER_UPGRADES_STORAGE_KEY,
      JSON.stringify({
        v: PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION,
        levels: { shuttleHull: 2 },
      }),
    )
    hydratePlayerUpgradeLevelsFromStorage()
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleHull).toBe(2)
    expect(CURRENT_PLAYER_UPGRADE_LEVELS.shuttleThrusterEfficiency).toBe(0)
  })
})

describe('getUpgradeValue', () => {
  it('resolves shuttle systems efficiency by level', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 0 })).toBe(3)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 1 })).toBe(2)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 2 })).toBe(1)
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 3 })).toBe(0)
  })

  it('defaults missing upgrade state to level 0', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', {})).toBe(3)
  })

  it('clamps levels above the upgrade max', () => {
    expect(getUpgradeValue('shuttleSystemsEfficiency', { shuttleSystemsEfficiency: 99 })).toBe(0)
  })

  it('resolves shuttle thruster efficiency multiplier', () => {
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 0 })).toBe(1)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 1 })).toBe(0.75)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 2 })).toBe(0.5)
    expect(getUpgradeValue('shuttleThrusterEfficiency', { shuttleThrusterEfficiency: 3 })).toBe(0.25)
  })
})

describe('getCurrentUpgradeValue', () => {
  it('resolves from current player state (all level 0)', () => {
    expect(getCurrentUpgradeValue('shuttleSystemsEfficiency')).toBe(3)
    expect(getCurrentUpgradeValue('shuttleThrusterEfficiency')).toBe(1)
    expect(getCurrentUpgradeValue('shuttleHeatResistance')).toBe(1)
  })
})

describe('hasGravitySurfingUnlock', () => {
  it('is false at level 0 and true at level 1', () => {
    expect(hasGravitySurfingUnlock({ gravitySurfing: 0 })).toBe(false)
    expect(hasGravitySurfingUnlock({ gravitySurfing: 1 })).toBe(true)
  })
})

describe('hasOrbitalSurfingUnlock', () => {
  it('returns false at level 0', () => {
    expect(hasOrbitalSurfingUnlock({ orbitalSurfing: 0 })).toBe(false)
  })

  it('returns true at level 1', () => {
    expect(hasOrbitalSurfingUnlock({ orbitalSurfing: 1 })).toBe(true)
  })
})

describe('getUpgradeCost', () => {
  it('returns baseCost * level', () => {
    expect(getUpgradeCost('shuttleThrusterEfficiency', 1)).toBe(1000)
    expect(getUpgradeCost('shuttleThrusterEfficiency', 2)).toBe(2000)
    expect(getUpgradeCost('shuttleThrusterEfficiency', 3)).toBe(3000)
  })

  it('returns 0 for level 0', () => {
    expect(getUpgradeCost('shuttleThrusterEfficiency', 0)).toBe(0)
  })

  it('works for late-game upgrades with high base cost', () => {
    expect(getUpgradeCost('shuttleRadiationResistance', 1)).toBe(5000)
    expect(getUpgradeCost('shuttleRadiationResistance', 3)).toBe(15000)
  })
})

describe('getUpgradesByCategory', () => {
  it('returns 16 shuttle upgrades (shop-visible only)', () => {
    expect(getUpgradesByCategory('shuttle')).toHaveLength(16)
  })

  it('omits Gravity Surfing from shuttle shop list', () => {
    const ids = getUpgradesByCategory('shuttle').map((d) => d.id)
    expect(ids).not.toContain('gravitySurfing')
  })

  it('returns 5 lander upgrades', () => {
    expect(getUpgradesByCategory('lander')).toHaveLength(5)
  })

  it('returns 5 multitool upgrades', () => {
    expect(getUpgradesByCategory('multitool')).toHaveLength(5)
  })

  it('returns 5 suit upgrades', () => {
    expect(getUpgradesByCategory('suit')).toHaveLength(5)
  })
})

describe('getShuttleSlingshotBurstMultiplier', () => {
  it('returns absolute burst multipliers 2, 3, 3.5, 5 by upgrade level', () => {
    expect(getShuttleSlingshotBurstMultiplier({})).toBe(2)
    expect(getShuttleSlingshotBurstMultiplier({ shuttleSlingshotSpeed: 1 })).toBe(3)
    expect(getShuttleSlingshotBurstMultiplier({ shuttleSlingshotSpeed: 2 })).toBe(3.5)
    expect(getShuttleSlingshotBurstMultiplier({ shuttleSlingshotSpeed: 3 })).toBe(5)
  })
})

describe('getShuttleSlingshotCruiseSpeedMultiplier', () => {
  it('is 1 at stock burst factor 2; scales with excess burst coupling', () => {
    expect(getShuttleSlingshotCruiseSpeedMultiplier({})).toBe(1)
    // burst 3 → 1 + (3-2)*0.25 = 1.25
    expect(getShuttleSlingshotCruiseSpeedMultiplier({ shuttleSlingshotSpeed: 1 })).toBeCloseTo(1.25)
    // burst 3.5 → 1 + 1.5*0.25 = 1.375
    expect(getShuttleSlingshotCruiseSpeedMultiplier({ shuttleSlingshotSpeed: 2 })).toBeCloseTo(1.375)
    // burst 5 → 1 + 3*0.25 = 1.75
    expect(getShuttleSlingshotCruiseSpeedMultiplier({ shuttleSlingshotSpeed: 3 })).toBeCloseTo(1.75)
  })
})

describe('getShuttleThrusterEfficiencyModifiers', () => {
  it('returns unified multiplier for all three thruster groups', () => {
    expect(getShuttleThrusterEfficiencyModifiers({
      shuttleThrusterEfficiency: 2,
    })).toEqual({
      thrust: 0.5,
      brake: 0.5,
      rcs: 0.5,
    })
  })

  it('defaults to 1.0 when no upgrades set', () => {
    expect(getCurrentShuttleThrusterEfficiencyModifiers()).toEqual({
      thrust: 1,
      brake: 1,
      rcs: 1,
    })
  })
})

describe('turret mining upgrades', () => {
  afterEach(() => {
    resetPlayerUpgradesToDefaults()
  })

  it('turretMiningUnlock starts locked at level 0 and unlocks at level 1', () => {
    expect(getCurrentUpgradeValue('turretMiningUnlock')).toBe(0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningUnlock = 1
    expect(getCurrentUpgradeValue('turretMiningUnlock')).toBe(1)
  })

  it('turretMiningYield scales across levels', () => {
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(1.0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningYield = 1
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(1.35)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningYield = 3
    expect(getCurrentUpgradeValue('turretMiningYield')).toBe(2.25)
  })

  it('turretMiningCharge scales across levels', () => {
    expect(getCurrentUpgradeValue('turretMiningCharge')).toBe(1.0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningCharge = 1
    expect(getCurrentUpgradeValue('turretMiningCharge')).toBe(1.35)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningCharge = 3
    expect(getCurrentUpgradeValue('turretMiningCharge')).toBe(2.2)
  })

  it('turretMiningEfficiency scales down across levels', () => {
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(1.0)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningEfficiency = 1
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(0.75)
    CURRENT_PLAYER_UPGRADE_LEVELS.turretMiningEfficiency = 3
    expect(getCurrentUpgradeValue('turretMiningEfficiency')).toBe(0.4)
  })
})
