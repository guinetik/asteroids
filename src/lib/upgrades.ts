/**
 * Generic numeric upgrade definitions and value resolution.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-map-shuttle-player-design.md
 */

/**
 * Numeric upgrade definition keyed by level.
 */
export interface NumericUpgradeDefinition {
  /** Unique upgrade id used by gameplay systems. */
  id: string
  /** Highest supported upgrade level. */
  maxLevel: number
  /** Value for each level from 0..maxLevel. */
  valuesByLevel: readonly number[]
}

/**
 * Runtime player upgrade levels keyed by upgrade id.
 */
export type UpgradeLevels = Partial<Record<UpgradeId, number>>

/**
 * Generic catalog of numeric upgrades.
 */
export const UPGRADE_DEFINITIONS = {
  shuttleFuelUpgrade: {
    id: 'shuttleFuelUpgrade',
    maxLevel: 3,
    valuesByLevel: [3, 2, 1, 0],
  },
  shuttleBoosterEfficiencyUpgrade: {
    id: 'shuttleBoosterEfficiencyUpgrade',
    maxLevel: 3,
    valuesByLevel: [1, 0.75, 0.5, 0.25],
  },
  shuttleBrakeEfficiencyUpgrade: {
    id: 'shuttleBrakeEfficiencyUpgrade',
    maxLevel: 3,
    valuesByLevel: [1, 0.75, 0.5, 0.25],
  },
  shuttleThrustersEfficiencyUpgrade: {
    id: 'shuttleThrustersEfficiencyUpgrade',
    maxLevel: 3,
    valuesByLevel: [1, 0.75, 0.5, 0.25],
  },
} as const satisfies Record<string, NumericUpgradeDefinition>

/**
 * Valid gameplay upgrade ids.
 */
export type UpgradeId = keyof typeof UPGRADE_DEFINITIONS

/**
 * Current player upgrade levels.
 * The player starts with no obtained upgrades, so all systems default to level 0.
 */
export const CURRENT_PLAYER_UPGRADE_LEVELS: UpgradeLevels = {
  shuttleFuelUpgrade: 0,
  shuttleBoosterEfficiencyUpgrade: 0,
  shuttleBrakeEfficiencyUpgrade: 0,
  shuttleThrustersEfficiencyUpgrade: 0,
}

/**
 * Burn-rate multipliers for shuttle thruster bars.
 */
export interface ShuttleThrusterEfficiencyModifiers {
  /** Red booster bar drain multiplier. */
  thrust: number
  /** Blue brake bar drain multiplier. */
  brake: number
  /** White RCS bar drain multiplier. */
  rcs: number
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
 * Resolve shuttle thruster burn-rate multipliers from arbitrary upgrade levels.
 *
 * @param levels - Runtime upgrade level state.
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getShuttleThrusterEfficiencyModifiers(
  levels: UpgradeLevels,
): ShuttleThrusterEfficiencyModifiers {
  return {
    thrust: getUpgradeValue('shuttleBoosterEfficiencyUpgrade', levels),
    brake: getUpgradeValue('shuttleBrakeEfficiencyUpgrade', levels),
    rcs: getUpgradeValue('shuttleThrustersEfficiencyUpgrade', levels),
  }
}

/**
 * Resolve shuttle thruster burn-rate multipliers from current player upgrades.
 *
 * @returns Burn-rate multipliers for shuttle thrusters.
 */
export function getCurrentShuttleThrusterEfficiencyModifiers(): ShuttleThrusterEfficiencyModifiers {
  return getShuttleThrusterEfficiencyModifiers(CURRENT_PLAYER_UPGRADE_LEVELS)
}
