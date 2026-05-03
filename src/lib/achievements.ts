/**
 * Achievement unlock evaluation, persistence, and UI grouping helpers.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { PlayerAchievementStats, PlayerProfile } from '@/lib/player/types'
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_DEFINITIONS,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementProgress,
} from '@/data/achievements'
import { getPlanet } from '@/lib/planets/catalog'
import { getJourneyDisplay, hasCompletedJourney } from '@/lib/journeys'
import type { UpgradeLevels } from '@/lib/upgrades'
import type { ContractMissionType, ContractStoreSnapshot } from '@/lib/contracts/contractTypes'

const ACHIEVEMENTS_STORAGE_KEY = 'asteroid-lander-achievements-v1'
const EMPTY_ACHIEVEMENT_STATS: PlayerAchievementStats = {
  lifetimeCreditsEarned: 0,
  lifetimeCreditsSpent: 0,
  lifetimeTradeCreditsEarned: 0,
  missionObjectivesCompletedByType: {},
  runtimeTipsShownCount: {},
  slingshotLaunches: 0,
  slingshotLaunchesByBody: {},
  gravitySurfStarts: 0,
  manifoldRides: 0,
  portalDepartures: 0,
  lifetimeWorldLineDistance: 0,
  maxSingleRunWorldLineDistance: 0,
}

/** Result of comparing profile state against locked achievements. */
export interface AchievementUnlockResult {
  /** Complete merged unlocked id list after this evaluation, e.g. `['flight-first-launch']`. */
  unlockedIds: string[]
  /** Definitions that changed from locked to unlocked during this evaluation. */
  newlyUnlocked: AchievementDefinition[]
}

/** One accordion section in the achievements panel. */
export interface AchievementGroup {
  /** Category represented by this group, e.g. `'credits'`. */
  category: AchievementCategory
  /** Player-facing label for the accordion header, e.g. `'Credits'`. */
  label: string
  /** Achievement definitions in authored display order for this category. */
  items: AchievementDefinition[]
}

/** Reads persisted unlocked-id list from `localStorage`. */
export function loadUnlockedAchievementIds(): string[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

/** Writes the full unlocked-id list to `localStorage`. */
export function persistUnlockedAchievementIds(ids: string[]): void {
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore persistence failures */
  }
}

/** Counts asteroids with at least one logged visit. */
function getUniqueAsteroidVisitCount(profile: PlayerProfile): number {
  return Object.values(profile.visitedAsteroids).filter((count) => count > 0).length
}

/** Sums installed upgrade tier steps across all shuttle systems. */
function getPurchasedUpgradeTierCount(upgradeLevels: UpgradeLevels): number {
  return Object.values(upgradeLevels).reduce((sum, level) => sum + Math.max(0, level ?? 0), 0)
}

/** Counts completed contract instances in the persisted contract snapshot. */
function getCompletedContractCount(snapshot: ContractStoreSnapshot): number {
  return Object.values(snapshot.instances).filter((instance) => instance.status === 'completed')
    .length
}

/** Checks whether one specific contract instance has completed. */
function hasCompletedContract(snapshot: ContractStoreSnapshot, contractId: string): boolean {
  return snapshot.instances[contractId]?.status === 'completed'
}

/** Reads the completed mission count for one contract mission family. */
function getMissionKindCount(snapshot: ContractStoreSnapshot, kind: ContractMissionType): number {
  return Math.max(0, snapshot.missionCompletionsByKind[kind] ?? 0)
}

/** Reads the completed count for one mission objective type from profile stats. */
function getObjectiveCount(profile: PlayerProfile, objectiveType: string): number {
  return Math.max(
    0,
    getAchievementStats(profile).missionObjectivesCompletedByType[objectiveType] ?? 0,
  )
}

/** Returns achievement counters, falling back for defensive legacy callers. */
function getAchievementStats(profile: PlayerProfile): PlayerAchievementStats {
  return profile.achievementStats ?? EMPTY_ACHIEVEMENT_STATS
}

/** Returns a required positive threshold, or `null` when an authored row is malformed. */
function getRequiredThreshold(definition: AchievementDefinition): number | null {
  if (
    typeof definition.threshold !== 'number' ||
    !Number.isFinite(definition.threshold) ||
    definition.threshold <= 0
  ) {
    return null
  }
  return definition.threshold
}

/** True when an optional id field is present and not just whitespace. */
function hasRequiredString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Compares progress with a required threshold, rejecting malformed missing thresholds. */
function requiredThresholdReached(current: number, threshold: number | null): boolean {
  return threshold !== null && current >= threshold
}

/** Human-readable solar body name for locked-hint copy. */
function solarOrbitAchievementLabel(bodyKey: string): string {
  if (bodyKey === 'sun') return 'the Sun'
  try {
    return getPlanet(bodyKey).name
  } catch {
    return bodyKey
  }
}

/** True once the player has registered a first orbit in {@link PlayerProfile.orbitedSolarBodies}. */
function hasOrbitedSolarBody(profile: PlayerProfile, bodyKey: string): boolean {
  return (profile.orbitedSolarBodies[bodyKey] ?? 0) > 0
}

/** Pure predicate — whether `progress` satisfies `definition` right now. */
export function isAchievementUnlocked(
  definition: AchievementDefinition,
  progress: AchievementProgress,
): boolean {
  switch (definition.kind) {
    case 'intro':
      return progress.profile.hasSeenIntro
    case 'journey_completed':
      return definition.journeyId
        ? hasCompletedJourney(progress.profile, definition.journeyId)
        : false
    case 'missions_completed':
      return requiredThresholdReached(
        progress.profile.completedMissionCount,
        getRequiredThreshold(definition),
      )
    case 'unique_asteroids':
      return requiredThresholdReached(
        getUniqueAsteroidVisitCount(progress.profile),
        getRequiredThreshold(definition),
      )
    case 'credits_balance':
      return requiredThresholdReached(progress.profile.credits, getRequiredThreshold(definition))
    case 'credits_lifetime_earned':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).lifetimeCreditsEarned,
        getRequiredThreshold(definition),
      )
    case 'credits_lifetime_spent':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).lifetimeCreditsSpent,
        getRequiredThreshold(definition),
      )
    case 'credits_trade_earned':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).lifetimeTradeCreditsEarned,
        getRequiredThreshold(definition),
      )
    case 'upgrade_tiers':
      return requiredThresholdReached(
        getPurchasedUpgradeTierCount(progress.upgradeLevels),
        getRequiredThreshold(definition),
      )
    case 'specific_upgrade':
      return definition.upgradeId ? (progress.upgradeLevels[definition.upgradeId] ?? 0) > 0 : false
    case 'solar_body_orbit':
      return hasRequiredString(definition.orbitBodyKey)
        ? hasOrbitedSolarBody(progress.profile, definition.orbitBodyKey)
        : false
    case 'contract_completed_count':
      return requiredThresholdReached(
        getCompletedContractCount(progress.contractSnapshot),
        getRequiredThreshold(definition),
      )
    case 'specific_contract_completed':
      return hasRequiredString(definition.contractId)
        ? hasCompletedContract(progress.contractSnapshot, definition.contractId)
        : false
    case 'mission_kind_completed':
      return definition.missionKind
        ? requiredThresholdReached(
            getMissionKindCount(progress.contractSnapshot, definition.missionKind),
            getRequiredThreshold(definition),
          )
        : false
    case 'mission_objective_completed':
      return hasRequiredString(definition.objectiveType)
        ? requiredThresholdReached(
            getObjectiveCount(progress.profile, definition.objectiveType),
            getRequiredThreshold(definition),
          )
        : false
    case 'slingshot_launches':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).slingshotLaunches,
        getRequiredThreshold(definition),
      )
    case 'slingshot_from_body': {
      if (!hasRequiredString(definition.bodyId)) return false
      return requiredThresholdReached(
        getAchievementStats(progress.profile).slingshotLaunchesByBody[definition.bodyId] ?? 0,
        getRequiredThreshold(definition),
      )
    }
    case 'gravity_surf_starts':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).gravitySurfStarts,
        getRequiredThreshold(definition),
      )
    case 'manifold_rides':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).manifoldRides,
        getRequiredThreshold(definition),
      )
    case 'portal_departures':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).portalDepartures,
        getRequiredThreshold(definition),
      )
    case 'worldline_lifetime_distance':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).lifetimeWorldLineDistance,
        getRequiredThreshold(definition),
      )
    case 'worldline_single_run_distance':
      return requiredThresholdReached(
        getAchievementStats(progress.profile).maxSingleRunWorldLineDistance,
        getRequiredThreshold(definition),
      )
    case 'body_access_state':
      return hasRequiredString(definition.bodyId) && definition.bodyAccessState
        ? progress.profile.bodyAccess[definition.bodyId] === definition.bodyAccessState
        : false
  }
}

/** Returns newly unlocked rows and the merged id list for persistence. */
export function evaluateAchievementUnlocks(
  progress: AchievementProgress,
  currentUnlockedIds: readonly string[],
): AchievementUnlockResult {
  const unlockedSet = new Set(currentUnlockedIds)
  const newlyUnlocked: AchievementDefinition[] = []

  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    if (unlockedSet.has(definition.id)) continue
    if (!isAchievementUnlocked(definition, progress)) continue
    unlockedSet.add(definition.id)
    newlyUnlocked.push(definition)
  }

  return {
    unlockedIds: [...unlockedSet],
    newlyUnlocked,
  }
}

/** Builds category sections from `ACHIEVEMENT_DEFINITIONS` order. */
export function getAchievementGroups(): AchievementGroup[] {
  const groups = new Map<AchievementCategory, AchievementDefinition[]>()
  for (const definition of ACHIEVEMENT_DEFINITIONS) {
    const items = groups.get(definition.category)
    if (items) {
      items.push(definition)
    } else {
      groups.set(definition.category, [definition])
    }
  }

  return [...groups.entries()].map(([category, items]) => ({
    category,
    label: ACHIEVEMENT_CATEGORY_LABELS[category],
    items,
  }))
}

/** Player-facing hint for locked rows — varies by achievement kind. */
export function getAchievementLockedHint(
  definition: AchievementDefinition,
  progress: AchievementProgress,
): string {
  switch (definition.kind) {
    case 'intro':
      return 'Finish the opening flight sequence on the map.'
    case 'journey_completed': {
      if (!definition.journeyId) return 'Complete the required journey.'
      const display = getJourneyDisplay(definition.journeyId)
      if (!display) return 'Complete the required journey.'
      return `Complete ${display.eyebrow}: ${display.title}.`
    }
    case 'missions_completed': {
      const current = progress.profile.completedMissionCount
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Complete the required missions.'
      return `Complete ${needed} mission${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'unique_asteroids': {
      const current = getUniqueAsteroidVisitCount(progress.profile)
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Visit the required asteroids.'
      return `Visit ${needed} different asteroids (${current}/${needed}).`
    }
    case 'credits_balance': {
      const current = progress.profile.credits
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Hold the required credit balance.'
      return `Hold ${needed.toLocaleString()} CR at once (currently ${current.toLocaleString()} CR).`
    }
    case 'credits_lifetime_earned': {
      const current = getAchievementStats(progress.profile).lifetimeCreditsEarned
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Earn the required lifetime credits.'
      return `Earn ${needed.toLocaleString()} lifetime CR (${current.toLocaleString()}/${needed.toLocaleString()} CR).`
    }
    case 'credits_lifetime_spent': {
      const current = getAchievementStats(progress.profile).lifetimeCreditsSpent
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Spend the required lifetime credits.'
      return `Spend ${needed.toLocaleString()} lifetime CR (${current.toLocaleString()}/${needed.toLocaleString()} CR).`
    }
    case 'credits_trade_earned': {
      const current = getAchievementStats(progress.profile).lifetimeTradeCreditsEarned
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Earn the required trade-good credits.'
      return `Earn ${needed.toLocaleString()} CR from trade-good sales (${current.toLocaleString()}/${needed.toLocaleString()} CR).`
    }
    case 'upgrade_tiers': {
      const current = getPurchasedUpgradeTierCount(progress.upgradeLevels)
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Install the required upgrade tiers.'
      return `Install ${needed} total upgrade tiers (${current}/${needed}).`
    }
    case 'specific_upgrade':
      return `Unlock the ${definition.title} upgrade.`
    case 'solar_body_orbit': {
      if (!hasRequiredString(definition.orbitBodyKey)) return 'Enter the required orbit.'
      const key = definition.orbitBodyKey
      const label = solarOrbitAchievementLabel(key)
      return `Enter orbit around ${label} on the solar map.`
    }
    case 'contract_completed_count': {
      const current = getCompletedContractCount(progress.contractSnapshot)
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Complete the required contracts.'
      return `Complete ${needed} contract${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'specific_contract_completed':
      return 'Complete the required faction contract.'
    case 'mission_kind_completed': {
      if (!definition.missionKind) return 'Complete the required mission family.'
      const kind = definition.missionKind
      const current = getMissionKindCount(progress.contractSnapshot, kind)
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Complete the required mission family.'
      return `Complete ${needed} ${kind} mission${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'mission_objective_completed': {
      if (!hasRequiredString(definition.objectiveType)) {
        return 'Complete the required mission objective.'
      }
      const objectiveType = definition.objectiveType
      const current = getObjectiveCount(progress.profile, objectiveType)
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Complete the required mission objective.'
      return `Complete ${needed} ${objectiveType} objective${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'slingshot_launches': {
      const current = getAchievementStats(progress.profile).slingshotLaunches
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Perform the required slingshot launches.'
      return `Perform ${needed} slingshot launch${needed === 1 ? '' : 'es'} (${current}/${needed}).`
    }
    case 'slingshot_from_body': {
      if (!hasRequiredString(definition.bodyId)) return 'Slingshot launch from the required body.'
      const bodyId = definition.bodyId
      const current = getAchievementStats(progress.profile).slingshotLaunchesByBody[bodyId] ?? 0
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Slingshot launch from the required body.'
      return `Slingshot launch from ${solarOrbitAchievementLabel(bodyId)} (${current}/${needed}).`
    }
    case 'gravity_surf_starts': {
      const current = getAchievementStats(progress.profile).gravitySurfStarts
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Start the required Gravity Surf events.'
      return `Start ${needed} Gravity Surf${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'manifold_rides': {
      const current = getAchievementStats(progress.profile).manifoldRides
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Complete the required manifold rides.'
      return `Complete ${needed} manifold ride${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'portal_departures': {
      const current = getAchievementStats(progress.profile).portalDepartures
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Depart through the required edge portals.'
      return `Depart through ${needed} edge portal${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'worldline_lifetime_distance': {
      const current = getAchievementStats(progress.profile).lifetimeWorldLineDistance
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Travel the required worldline distance.'
      return `Travel ${needed.toLocaleString()} worldline units (${Math.floor(current).toLocaleString()}/${needed.toLocaleString()}).`
    }
    case 'worldline_single_run_distance': {
      const current = getAchievementStats(progress.profile).maxSingleRunWorldLineDistance
      const needed = getRequiredThreshold(definition)
      if (needed === null) return 'Travel the required worldline distance in one run.'
      return `Travel ${needed.toLocaleString()} worldline units in one run (${Math.floor(current).toLocaleString()}/${needed.toLocaleString()}).`
    }
    case 'body_access_state':
      return 'Resolve the Hektor prospectus outcome.'
  }
}

/** Clears persisted unlocks between Vitest cases. */
export function resetAchievementStorageForTests(): void {
  try {
    localStorage.removeItem(ACHIEVEMENTS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
