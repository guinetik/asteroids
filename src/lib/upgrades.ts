/**
 * Data-driven upgrade definitions and value resolution.
 *
 * Loads 27 upgrade definitions from JSON across 4 categories
 * (shuttle, lander, multitool, suit). Each upgrade has levels 0-3
 * with numeric values and linear cost scaling.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-upgrade-system-design.md
 */
import upgradesData from '@/data/upgrades.json'
import {
  isKnownUpgradeId,
  loadStoredPlayerUpgrades,
  saveStoredPlayerUpgrades,
} from '@/lib/upgradeStorage'

/** Upgrade category for UI grouping. */
export type UpgradeCategory = 'shuttle' | 'lander' | 'multitool' | 'suit'

/** A single upgrade definition loaded from JSON. */
export interface NumericUpgradeDefinition {
  /** Unique upgrade key used by gameplay systems. */
  id: string
  /** Category for UI grouping. */
  category: UpgradeCategory
  /** Display name. */
  label: string
  /** One-line effect description. */
  description: string
  /** CR cost for level 1. Levels 2+ cost baseCost × level. */
  baseCost: number
  /** Highest supported upgrade level. */
  maxLevel: number
  /** Numeric value at each level from 0..maxLevel. */
  valuesByLevel: readonly number[]
}

/** Valid upgrade IDs derived from the JSON data. */
export type UpgradeId =
  | 'shuttleThrusterEfficiency'
  | 'shuttleThrusterCharge'
  | 'shuttleThrusterSpeed'
  | 'shuttleSystemsEfficiency'
  | 'shuttleHull'
  | 'shuttleHeatResistance'
  | 'shuttleFreezeResistance'
  | 'shuttleRadiationResistance'
  | 'shuttleCargoBay'
  | 'shuttleFuelCapacity'
  | 'shuttleScienceStation'
  | 'shuttleSlingshotSpeed'
  | 'landerThrusterEfficiency'
  | 'landerThrusterCharge'
  | 'landerThrusterSpeed'
  | 'landerHull'
  | 'landerFuelCapacity'
  | 'multitoolEfficiency'
  | 'multitoolDamage'
  | 'multitoolRtgCapacity'
  | 'multitoolRtgCharge'
  | 'multitoolScience'
  | 'suitArmor'
  | 'suitStaminaCapacity'
  | 'suitStaminaEfficiency'
  | 'suitO2Capacity'
  | 'suitMobility'

/** Runtime player upgrade levels keyed by upgrade id. */
export type UpgradeLevels = Partial<Record<UpgradeId, number>>

/** Build the keyed catalog from the JSON array. */
const definitions = upgradesData as unknown as NumericUpgradeDefinition[]

/** All upgrade definitions keyed by id for O(1) lookup. */
export const UPGRADE_DEFINITIONS: Record<UpgradeId, NumericUpgradeDefinition> =
  Object.fromEntries(definitions.map((d) => [d.id, d])) as Record<UpgradeId, NumericUpgradeDefinition>

/**
 * Current player upgrade levels.
 * All start at 0 — no purchase flow yet.
 */
export const CURRENT_PLAYER_UPGRADE_LEVELS: Record<UpgradeId, number> =
  Object.fromEntries(definitions.map((d) => [d.id, 0])) as Record<UpgradeId, number>

/**
 * Merge persisted levels from localStorage into {@link CURRENT_PLAYER_UPGRADE_LEVELS}.
 * Unknown keys and out-of-range values are ignored or clamped.
 */
export function hydratePlayerUpgradeLevelsFromStorage(): void {
  const stored = loadStoredPlayerUpgrades()
  if (!stored) return
  for (const [key, raw] of Object.entries(stored)) {
    if (!isKnownUpgradeId(key)) continue
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const id = key as UpgradeId
    const max = UPGRADE_DEFINITIONS[id].maxLevel
    CURRENT_PLAYER_UPGRADE_LEVELS[id] = Math.max(0, Math.min(max, Math.floor(raw)))
  }
}

/**
 * Write current runtime upgrade levels to localStorage.
 */
export function saveCurrentPlayerUpgradesToStorage(): void {
  saveStoredPlayerUpgrades(CURRENT_PLAYER_UPGRADE_LEVELS as unknown as Record<string, number>)
}

/**
 * Reset all upgrades to level 0 and persist (e.g. player respawn economy reset).
 */
export function resetPlayerUpgradesToDefaults(): void {
  for (const id of Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]) {
    CURRENT_PLAYER_UPGRADE_LEVELS[id] = 0
  }
  saveStoredPlayerUpgrades(CURRENT_PLAYER_UPGRADE_LEVELS as unknown as Record<string, number>)
}

/**
 * Copy of current upgrade levels for UI binding.
 */
export function getPlayerUpgradeLevelsSnapshot(): Record<UpgradeId, number> {
  return { ...CURRENT_PLAYER_UPGRADE_LEVELS }
}

/**
 * Resolve a numeric upgrade value from arbitrary runtime levels.
 *
 * @param upgradeId - Upgrade to resolve.
 * @param levels - Runtime upgrade level state.
 * @returns Numeric value for the resolved upgrade level.
 */
export function getUpgradeValue(upgradeId: UpgradeId, levels: UpgradeLevels): number {
  const definition = UPGRADE_DEFINITIONS[upgradeId]
  const rawLevel = levels[upgradeId] ?? 0
  const level = Math.max(0, Math.min(definition.maxLevel, rawLevel))
  return definition.valuesByLevel[level] ?? definition.valuesByLevel[0]!
}

/**
 * Resolve a numeric upgrade value from the current player state.
 *
 * @param upgradeId - Upgrade to resolve.
 * @returns Numeric value for the player's current upgrade level.
 */
export function getCurrentUpgradeValue(upgradeId: UpgradeId): number {
  return getUpgradeValue(upgradeId, CURRENT_PLAYER_UPGRADE_LEVELS)
}

/**
 * Compute the CR cost to purchase a specific upgrade level.
 *
 * @param upgradeId - Upgrade to price.
 * @param level - Target level (1, 2, or 3). Level 0 is free (default).
 * @returns CR cost for the requested level.
 */
export function getUpgradeCost(upgradeId: UpgradeId, level: number): number {
  if (level <= 0) return 0
  return UPGRADE_DEFINITIONS[upgradeId].baseCost * level
}

/**
 * Get all upgrade definitions in a given category.
 *
 * @param category - Category to filter by.
 * @returns Array of matching upgrade definitions.
 */
export function getUpgradesByCategory(category: UpgradeCategory): NumericUpgradeDefinition[] {
  return definitions.filter((d) => d.category === category)
}

/** Burn-rate multipliers for shuttle thruster bars. */
export interface ShuttleThrusterEfficiencyModifiers {
  /** Red booster bar drain multiplier. */
  thrust: number
  /** Blue brake bar drain multiplier. */
  brake: number
  /** White RCS bar drain multiplier. */
  rcs: number
}

/**
 * Resolve shuttle thruster burn-rate multipliers from arbitrary upgrade levels.
 * All three groups share the single `shuttleThrusterEfficiency` upgrade.
 *
 * @param levels - Runtime upgrade level state.
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getShuttleThrusterEfficiencyModifiers(
  levels: UpgradeLevels,
): ShuttleThrusterEfficiencyModifiers {
  const m = getUpgradeValue('shuttleThrusterEfficiency', levels)
  return { thrust: m, brake: m, rcs: m }
}

/**
 * Resolve shuttle thruster burn-rate multipliers from current player upgrades.
 *
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getCurrentShuttleThrusterEfficiencyModifiers(): ShuttleThrusterEfficiencyModifiers {
  return getShuttleThrusterEfficiencyModifiers(CURRENT_PLAYER_UPGRADE_LEVELS)
}

/** Per-thruster recharge-rate multipliers derived from shuttleThrusterCharge upgrade. */
export interface ShuttleThrusterChargeModifiers {
  /** Red booster bar recharge multiplier. */
  thrust: number
  /** Blue brake bar recharge multiplier. */
  brake: number
  /** White RCS bar recharge multiplier. */
  rcs: number
}

/**
 * Resolve shuttle thruster recharge-rate multipliers from arbitrary upgrade levels.
 * All three groups share the single `shuttleThrusterCharge` upgrade.
 *
 * @param levels - Runtime upgrade level state.
 * @returns Recharge-rate multipliers for shuttle thrusters.
 */
export function getShuttleThrusterChargeModifiers(levels: UpgradeLevels): ShuttleThrusterChargeModifiers {
  const m = getUpgradeValue('shuttleThrusterCharge', levels)
  return { thrust: m, brake: m, rcs: m }
}

/**
 * Resolve shuttle thruster recharge-rate multipliers from current player upgrades.
 *
 * @returns Recharge-rate multipliers for shuttle thrusters.
 */
export function getCurrentShuttleThrusterChargeModifiers(): ShuttleThrusterChargeModifiers {
  return getShuttleThrusterChargeModifiers(CURRENT_PLAYER_UPGRADE_LEVELS)
}

/**
 * Slingshot exit burst multiplier from the Slingshot Speed upgrade (2 / 3 / 3.5 / 5 by level).
 *
 * @param levels - Runtime upgrade level state.
 * @returns Value passed to {@link ShuttleController.beginSlingshotBurst}.
 */
export function getShuttleSlingshotBurstMultiplier(levels: UpgradeLevels): number {
  return getUpgradeValue('shuttleSlingshotSpeed', levels)
}

/**
 * Slingshot exit burst multiplier from current player upgrades.
 *
 * @returns Burst multiplier for the current slingshot launch.
 */
export function getCurrentShuttleSlingshotBurstMultiplier(): number {
  return getShuttleSlingshotBurstMultiplier(CURRENT_PLAYER_UPGRADE_LEVELS)
}
