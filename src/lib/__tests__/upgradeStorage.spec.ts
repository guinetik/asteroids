/**
 * Tests for upgrade level localStorage persistence.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredPlayerUpgrades,
  loadStoredPlayerUpgrades,
  PLAYER_UPGRADES_STORAGE_KEY,
  PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION,
  saveStoredPlayerUpgrades,
} from '../upgradeStorage'

describe('upgradeStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns null when empty', () => {
    expect(loadStoredPlayerUpgrades()).toBeNull()
  })

  it('returns null for wrong schema version', () => {
    localStorage.setItem(
      PLAYER_UPGRADES_STORAGE_KEY,
      JSON.stringify({ v: 999, levels: { shuttleHull: 1 } }),
    )
    expect(loadStoredPlayerUpgrades()).toBeNull()
  })

  it('round-trips levels through save and load', () => {
    saveStoredPlayerUpgrades({ shuttleHull: 2, landerFuelCapacity: 1 })
    const loaded = loadStoredPlayerUpgrades()
    expect(loaded).toEqual({ shuttleHull: 2, landerFuelCapacity: 1 })
  })

  it('stores schema version in payload', () => {
    saveStoredPlayerUpgrades({ suitArmor: 3 })
    const raw = localStorage.getItem(PLAYER_UPGRADES_STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { v: number; levels: Record<string, number> }
    expect(parsed.v).toBe(PLAYER_UPGRADES_STORAGE_SCHEMA_VERSION)
    expect(parsed.levels.suitArmor).toBe(3)
  })

  it('clearStoredPlayerUpgrades removes the key', () => {
    saveStoredPlayerUpgrades({ shuttleHull: 1 })
    clearStoredPlayerUpgrades()
    expect(localStorage.getItem(PLAYER_UPGRADES_STORAGE_KEY)).toBeNull()
  })
})
