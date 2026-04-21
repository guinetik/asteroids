/**
 * Achievement unlock evaluation, persistence, and UI grouping helpers.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { PlayerProfile } from '@/lib/player/types'
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_DEFINITIONS,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementProgress,
} from '@/data/achievements'
import { getPlanet } from '@/lib/planets/catalog'
import { hasCompletedJourney } from '@/lib/journeys'
import type { UpgradeLevels } from '@/lib/upgrades'

const ACHIEVEMENTS_STORAGE_KEY = 'asteroid-lander-achievements-v1'

/** Result of comparing profile state against locked achievements. */
export interface AchievementUnlockResult {
  unlockedIds: string[]
  newlyUnlocked: AchievementDefinition[]
}

/** One accordion section in the achievements panel. */
export interface AchievementGroup {
  category: AchievementCategory
  label: string
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
export function isAchievementUnlocked(definition: AchievementDefinition, progress: AchievementProgress): boolean {
  switch (definition.kind) {
    case 'intro':
      return progress.profile.hasSeenIntro
    case 'journey_completed':
      return hasCompletedJourney(progress.profile, definition.journeyId ?? 'welcome')
    case 'missions_completed':
      return progress.profile.completedMissionCount >= (definition.threshold ?? 0)
    case 'unique_asteroids':
      return getUniqueAsteroidVisitCount(progress.profile) >= (definition.threshold ?? 0)
    case 'credits_balance':
      return progress.profile.credits >= (definition.threshold ?? 0)
    case 'upgrade_tiers':
      return getPurchasedUpgradeTierCount(progress.upgradeLevels) >= (definition.threshold ?? 0)
    case 'specific_upgrade':
      return (progress.upgradeLevels[definition.upgradeId ?? 'gravitySurfing'] ?? 0) > 0
    case 'solar_body_orbit':
      return hasOrbitedSolarBody(progress.profile, definition.orbitBodyKey ?? '')
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
    case 'journey_completed':
      return 'Complete the Welcome Journey in the habitat and on the map.'
    case 'missions_completed': {
      const current = progress.profile.completedMissionCount
      const needed = definition.threshold ?? 0
      return `Complete ${needed} mission${needed === 1 ? '' : 's'} (${current}/${needed}).`
    }
    case 'unique_asteroids': {
      const current = getUniqueAsteroidVisitCount(progress.profile)
      const needed = definition.threshold ?? 0
      return `Visit ${needed} different asteroids (${current}/${needed}).`
    }
    case 'credits_balance': {
      const current = progress.profile.credits
      const needed = definition.threshold ?? 0
      return `Hold ${needed.toLocaleString()} CR at once (currently ${current.toLocaleString()} CR).`
    }
    case 'upgrade_tiers': {
      const current = getPurchasedUpgradeTierCount(progress.upgradeLevels)
      const needed = definition.threshold ?? 0
      return `Install ${needed} total upgrade tiers (${current}/${needed}).`
    }
    case 'specific_upgrade':
      return 'Unlock the Gravity Surfing upgrade.'
    case 'solar_body_orbit': {
      const key = definition.orbitBodyKey ?? ''
      const label = solarOrbitAchievementLabel(key)
      return `Enter orbit around ${label} on the solar map.`
    }
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
