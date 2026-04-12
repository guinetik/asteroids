import type { UpgradeId, UpgradeLevels } from '@/lib/upgrades'
import type { PlayerProfile } from '@/lib/player/types'

export type AchievementCategory = 'flight' | 'missions' | 'exploration' | 'credits' | 'upgrades'

export interface AchievementDefinition {
  id: string
  category: AchievementCategory
  icon: string
  title: string
  description: string
  type: string
  rewardCredits: number
  kind: 'intro' | 'missions_completed' | 'unique_asteroids' | 'credits_balance' | 'upgrade_tiers' | 'specific_upgrade'
  threshold?: number
  upgradeId?: UpgradeId
}

export interface AchievementProgress {
  profile: PlayerProfile
  upgradeLevels: UpgradeLevels
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'flight-first-launch',
    category: 'flight',
    icon: '🚀',
    title: 'FIRST LAUNCH',
    description: 'Complete the opening flight onboarding and take command of the solar map.',
    type: 'FLIGHT LOG',
    rewardCredits: 250,
    kind: 'intro',
  },
  {
    id: 'missions-first-contract',
    category: 'missions',
    icon: '📋',
    title: 'FIRST CONTRACT',
    description: 'Deliver your first mission payout.',
    type: 'MISSION BOARD',
    rewardCredits: 300,
    kind: 'missions_completed',
    threshold: 1,
  },
  {
    id: 'missions-five-contracts',
    category: 'missions',
    icon: '🛰',
    title: 'REGULAR PILOT',
    description: 'Complete 5 missions for the board.',
    type: 'MISSION BOARD',
    rewardCredits: 500,
    kind: 'missions_completed',
    threshold: 5,
  },
  {
    id: 'missions-ten-contracts',
    category: 'missions',
    icon: '🏆',
    title: 'DEEP RUNNER',
    description: 'Complete 10 missions across the system.',
    type: 'MISSION BOARD',
    rewardCredits: 900,
    kind: 'missions_completed',
    threshold: 10,
  },
  {
    id: 'exploration-first-asteroid',
    category: 'exploration',
    icon: '🪨',
    title: 'FIRST ROCK',
    description: 'Return from your first asteroid visit.',
    type: 'EXPLORATION',
    rewardCredits: 250,
    kind: 'unique_asteroids',
    threshold: 1,
  },
  {
    id: 'exploration-three-asteroids',
    category: 'exploration',
    icon: '🧭',
    title: 'BELT SCOUT',
    description: 'Visit 3 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: 450,
    kind: 'unique_asteroids',
    threshold: 3,
  },
  {
    id: 'exploration-six-asteroids',
    category: 'exploration',
    icon: '🌌',
    title: 'CHART MAKER',
    description: 'Visit 6 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: 800,
    kind: 'unique_asteroids',
    threshold: 6,
  },
  {
    id: 'credits-two-thousand',
    category: 'credits',
    icon: '💳',
    title: 'CASHFLOW POSITIVE',
    description: 'Hold 2,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: 350,
    kind: 'credits_balance',
    threshold: 2000,
  },
  {
    id: 'credits-five-thousand',
    category: 'credits',
    icon: '💰',
    title: 'WAR CHEST',
    description: 'Hold 5,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: 1000,
    kind: 'credits_balance',
    threshold: 5000,
  },
  {
    id: 'upgrades-first-install',
    category: 'upgrades',
    icon: '🔧',
    title: 'FIRST INSTALL',
    description: 'Purchase your first shuttle upgrade.',
    type: 'ENGINEERING',
    rewardCredits: 350,
    kind: 'upgrade_tiers',
    threshold: 1,
  },
  {
    id: 'upgrades-five-tiers',
    category: 'upgrades',
    icon: '🛠',
    title: 'FIELD RETROFIT',
    description: 'Install 5 total upgrade tiers.',
    type: 'ENGINEERING',
    rewardCredits: 700,
    kind: 'upgrade_tiers',
    threshold: 5,
  },
  {
    id: 'upgrades-gravity-surfing',
    category: 'upgrades',
    icon: '🌐',
    title: 'SPACE FABRIC',
    description: 'Unlock Gravity Surfing and gain access to Space Fabric controls.',
    type: 'ENGINEERING',
    rewardCredits: 1200,
    kind: 'specific_upgrade',
    upgradeId: 'gravitySurfing',
  },
] as const

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  flight: 'Flight Log',
  missions: 'Mission Board',
  exploration: 'Exploration',
  credits: 'Credits',
  upgrades: 'Engineering',
}
