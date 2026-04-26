/**
 * Data-driven upgrade definitions and value resolution.
 *
 * Loads upgrade definitions from JSON across 4 categories
 * (shuttle, lander, multitool, suit). Numeric upgrades have levels 0-3
 * with values and linear cost scaling; some shuttle entries are shop-hidden
 * story or dev grants (e.g. Gravity Surfing).
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
  /**
   * When true, the engineering-bay UI never lists this upgrade (mission / dev unlock only).
   */
  hiddenFromShop?: boolean
  /**
   * When true, {@link computeMissionDifficulty} ignores this id so cosmetic unlocks do not shift belt scaling.
   */
  excludeFromMissionDifficulty?: boolean
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
  | 'gravitySurfing'
  | 'orbitalSurfing'
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
  | 'turretMiningUnlock'
  | 'turretMiningYield'
  | 'turretMiningCharge'
  | 'turretMiningEfficiency'

/** Runtime player upgrade levels keyed by upgrade id. */
export type UpgradeLevels = Partial<Record<UpgradeId, number>>

/** Build the keyed catalog from the JSON array. */
const definitions = upgradesData as unknown as NumericUpgradeDefinition[]

/** All upgrade definitions keyed by id for O(1) lookup. */
export const UPGRADE_DEFINITIONS: Record<UpgradeId, NumericUpgradeDefinition> = Object.fromEntries(
  definitions.map((d) => [d.id, d]),
) as Record<UpgradeId, NumericUpgradeDefinition>

/**
 * Current player upgrade levels.
 * All start at 0 — no purchase flow yet.
 */
export const CURRENT_PLAYER_UPGRADE_LEVELS: Record<UpgradeId, number> = Object.fromEntries(
  definitions.map((d) => [d.id, 0]),
) as Record<UpgradeId, number>

/**
 * `gravitySurfing` value at tier 1 from catalog data — Space Fabric map control unlock threshold.
 */
const GRAVITY_SURFING_UNLOCK_VALUE = UPGRADE_DEFINITIONS.gravitySurfing.valuesByLevel[1]!

/**
 * `orbitalSurfing` value at tier 1 from catalog data — Manifold Highway unlock threshold.
 */
const ORBITAL_SURFING_UNLOCK_VALUE = UPGRADE_DEFINITIONS.orbitalSurfing.valuesByLevel[1]!

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

/** Listeners notified when any upgrade level transitions from 0 to ≥1. */
const upgradeInstallListeners = new Set<(upgradeId: UpgradeId) => void>()

/**
 * Subscribe to the "an upgrade just got installed" event. The event fires once per
 * transition of a stored upgrade level from 0 to any value ≥1 — a tier bump from 1
 * to 2 is NOT an install event.
 *
 * @param listener - Receives the upgrade id whose level crossed zero.
 * @returns Unsubscribe function.
 */
export function onUpgradeInstalled(listener: (upgradeId: UpgradeId) => void): () => void {
  upgradeInstallListeners.add(listener)
  return () => upgradeInstallListeners.delete(listener)
}

/** Fire upgradeInstallListeners; swallow listener errors so one bad subscriber cannot break others. */
function emitUpgradeInstalled(upgradeId: UpgradeId): void {
  // Snapshot before iteration: a listener that subscribes a new handler mid-dispatch
  // must not receive the in-flight event.
  for (const listener of Array.from(upgradeInstallListeners)) {
    try {
      listener(upgradeId)
    } catch {
      // best-effort notification — upstream listeners are isolated
    }
  }
}

/**
 * Set an upgrade's stored level to an exact value (clamped to catalog maxLevel).
 * Persists to storage. Fires `onUpgradeInstalled` if the previous level was 0 and
 * the new level is ≥1. Idempotent when the new value equals the old.
 *
 * @param upgradeId - Catalog upgrade to set.
 * @param newLevel - Target level.
 * @returns The actually persisted level after clamping.
 */
export function setPlayerUpgradeLevel(upgradeId: UpgradeId, newLevel: number): number {
  const def = UPGRADE_DEFINITIONS[upgradeId]
  const clamped = Math.max(0, Math.min(def.maxLevel, Math.floor(newLevel)))
  const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
  if (clamped === current) return current
  CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] = clamped
  saveCurrentPlayerUpgradesToStorage()
  if (current === 0 && clamped >= 1) emitUpgradeInstalled(upgradeId)
  return clamped
}

/**
 * Ensure an upgrade is at least `minLevel` (capped to catalog `maxLevel`).
 * Idempotent: does nothing if already at or above. Persists to storage.
 * Fires `onUpgradeInstalled` when the level transitions from 0 to ≥1.
 *
 * @param upgradeId - Catalog upgrade to bump.
 * @param minLevel - Target minimum level.
 * @returns True when a higher level was written.
 */
export function ensureUpgradeAtLeast(upgradeId: UpgradeId, minLevel: number): boolean {
  const current = CURRENT_PLAYER_UPGRADE_LEVELS[upgradeId] ?? 0
  const def = UPGRADE_DEFINITIONS[upgradeId]
  const target = Math.max(0, Math.min(def.maxLevel, Math.floor(minLevel)))
  if (current >= target) return false
  setPlayerUpgradeLevel(upgradeId, target)
  return true
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
  return definitions.filter((d) => d.category === category && !d.hiddenFromShop)
}

/**
 * True when the player has unlocked map Space Fabric controls (Gravity Surfing).
 *
 * @param levels - Upgrade state to inspect (defaults to current persisted runtime).
 */
export function hasGravitySurfingUnlock(
  levels: UpgradeLevels = CURRENT_PLAYER_UPGRADE_LEVELS,
): boolean {
  return getUpgradeValue('gravitySurfing', levels) >= GRAVITY_SURFING_UNLOCK_VALUE
}

/**
 * True when the player has unlocked Orbital Surfing (Manifold Highway).
 *
 * @param levels - Upgrade state to inspect (defaults to current persisted runtime).
 */
export function hasOrbitalSurfingUnlock(
  levels: UpgradeLevels = CURRENT_PLAYER_UPGRADE_LEVELS,
): boolean {
  return getUpgradeValue('orbitalSurfing', levels) >= ORBITAL_SURFING_UNLOCK_VALUE
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
export function getShuttleThrusterChargeModifiers(
  levels: UpgradeLevels,
): ShuttleThrusterChargeModifiers {
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

/** Turret-mining beam recharge multiplier derived from `turretMiningCharge`. */
export function getCurrentTurretMiningChargeMultiplier(): number {
  return getCurrentUpgradeValue('turretMiningCharge')
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
 * Baseline burst coupling at upgrade level 0 — values below this do not add post-settle cruise bonus.
 */
const SLINGSHOT_BURST_BASELINE_FOR_CRUISE = 2

/**
 * Portion of excess burst multiplier carried into stable lane speed after the settle ramp.
 * Tuned so higher tiers clearly raise cruise without dwarfing the burst spike.
 */
const SLINGSHOT_CRUISE_BOOST_PER_BURST_EXCESS = 0.25

/**
 * Multiplier applied to physics slingshot exit speed for the **post-settle** cruise target.
 * Stock burst factor is 2; stronger coupling raises both the spike and the speed the lane
 * decays toward (still subject to map max speed caps).
 *
 * @param levels - Runtime upgrade level state.
 * @returns Factor ≥ 1 applied to lane speed after the slingshot burst completes.
 */
export function getShuttleSlingshotCruiseSpeedMultiplier(levels: UpgradeLevels): number {
  const burst = getShuttleSlingshotBurstMultiplier(levels)
  return (
    1 +
    Math.max(0, burst - SLINGSHOT_BURST_BASELINE_FOR_CRUISE) *
      SLINGSHOT_CRUISE_BOOST_PER_BURST_EXCESS
  )
}

/**
 * Post-settle slingshot cruise multiplier for the current player (map free flight).
 *
 * @returns Factor ≥ 1 for stable speed after burst decay.
 */
export function getCurrentShuttleSlingshotCruiseSpeedMultiplier(): number {
  return getShuttleSlingshotCruiseSpeedMultiplier(CURRENT_PLAYER_UPGRADE_LEVELS)
}

/**
 * Slingshot exit burst multiplier from current player upgrades.
 *
 * @returns Burst multiplier for the current slingshot launch.
 */
export function getCurrentShuttleSlingshotBurstMultiplier(): number {
  return getShuttleSlingshotBurstMultiplier(CURRENT_PLAYER_UPGRADE_LEVELS)
}
