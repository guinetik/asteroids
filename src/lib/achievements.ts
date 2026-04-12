import type { PlayerProfile } from '@/lib/player/types'
import {
  ACHIEVEMENT_CATEGORY_LABELS,
  ACHIEVEMENT_DEFINITIONS,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementProgress,
} from '@/data/achievements'
import type { UpgradeLevels } from '@/lib/upgrades'

const ACHIEVEMENTS_STORAGE_KEY = 'asteroid-lander-achievements-v1'

export interface AchievementUnlockResult {
  unlockedIds: string[]
  newlyUnlocked: AchievementDefinition[]
}

export interface AchievementGroup {
  category: AchievementCategory
  label: string
  items: AchievementDefinition[]
}

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

export function persistUnlockedAchievementIds(ids: string[]): void {
  try {
    localStorage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore persistence failures */
  }
}

function getUniqueAsteroidVisitCount(profile: PlayerProfile): number {
  return Object.values(profile.visitedAsteroids).filter((count) => count > 0).length
}

function getPurchasedUpgradeTierCount(upgradeLevels: UpgradeLevels): number {
  return Object.values(upgradeLevels).reduce((sum, level) => sum + Math.max(0, level ?? 0), 0)
}

export function isAchievementUnlocked(definition: AchievementDefinition, progress: AchievementProgress): boolean {
  switch (definition.kind) {
    case 'intro':
      return progress.profile.hasSeenIntro
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
  }
}

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

export function getAchievementLockedHint(
  definition: AchievementDefinition,
  progress: AchievementProgress,
): string {
  switch (definition.kind) {
    case 'intro':
      return 'Finish the opening flight sequence on the map.'
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
  }
}

export function resetAchievementStorageForTests(): void {
  try {
    localStorage.removeItem(ACHIEVEMENTS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
