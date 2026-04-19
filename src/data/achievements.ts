/**
 * Achievement definitions — titles, subtitles, unlock rules, and rewards.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { UpgradeId, UpgradeLevels } from '@/lib/upgrades'
import type { PlayerProfile } from '@/lib/player/types'
import { PLANETS } from '@/lib/planets/catalog'

/** High-level achievement tab / grouping key used in the player profile UI. */
export type AchievementCategory = 'flight' | 'missions' | 'exploration' | 'credits' | 'upgrades'

/** Static row from `ACHIEVEMENT_DEFINITIONS` — copy, rule kind, and optional thresholds. */
export interface AchievementDefinition {
  id: string
  category: AchievementCategory
  icon: string
  /** Primary headline — short, punchy name shown in UI. */
  title: string
  /** Secondary line — flavor, tone, or context under the title. */
  subtitle: string
  description: string
  type: string
  rewardCredits: number
  kind:
    | 'intro'
    | 'missions_completed'
    | 'unique_asteroids'
    | 'credits_balance'
    | 'upgrade_tiers'
    | 'specific_upgrade'
    | 'solar_body_orbit'
  threshold?: number
  upgradeId?: UpgradeId
  /** Planet id or `"sun"` — must match keys in {@link PlayerProfile.orbitedSolarBodies}. */
  orbitBodyKey?: string
}

/** Snapshot of profile + upgrades passed into unlock evaluation. */
export interface AchievementProgress {
  profile: PlayerProfile
  upgradeLevels: UpgradeLevels
}

/**
 * Creative title + subtitle for first orbit around each catalog body (Sun + planets).
 * Keys are planet ids from `planetarium.json` plus `sun`.
 * Earth is omitted — the map starts in Earth orbit, so a first-orbit trophy would be unearned.
 */
const SOLAR_ORBIT_ACHIEVEMENT_COPY: Record<string, { title: string; subtitle: string }> = {
  sun: {
    title: 'CORONA COURTSHIP',
    subtitle: 'The star lets you borrow its edge — once',
  },
  mercury: {
    title: 'FURNACE LINE',
    subtitle: 'Mercury · where dawn never cools off',
  },
  venus: {
    title: 'YELLOWJACKET HALO',
    subtitle: 'Venus · thick air, thin patience',
  },
  mars: {
    title: 'RED RING RUN',
    subtitle: 'Mars · rust and rumor from the rail',
  },
  ceres: {
    title: 'BELT THRONE',
    subtitle: 'Ceres · small world, loud gravity',
  },
  jupiter: {
    title: 'STORM SHEPHERD',
    subtitle: 'Jupiter · one red eye, many rules',
  },
  saturn: {
    title: 'RADIUS OF WONDER',
    subtitle: 'Saturn · ice, ink, and borrowed light',
  },
  uranus: {
    title: 'SIDEWAYS SALUTE',
    subtitle: 'Uranus · polite chaos, tidy tilt',
  },
  neptune: {
    title: 'LAST MAJOR STOP',
    subtitle: 'Neptune · blue velocity, cold welcome',
  },
  pluto: {
    title: 'NIGHT SHIFT AT THE EDGE',
    subtitle: 'Pluto · still clocking in out here',
  },
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'flight-first-launch',
    category: 'flight',
    icon: '\u{1F680}',
    title: 'AIRLOCK AFTERGLOW',
    subtitle: 'Briefing done · solar map is yours',
    description: 'Complete the opening flight onboarding and take command of the solar map.',
    type: 'FLIGHT LOG',
    rewardCredits: 250,
    kind: 'intro',
  },
  {
    id: 'missions-first-contract',
    category: 'missions',
    icon: '\u{1F4CB}',
    title: 'INKED & PAID',
    subtitle: 'The board cut your first real check',
    description: 'Deliver your first mission payout.',
    type: 'MISSION BOARD',
    rewardCredits: 300,
    kind: 'missions_completed',
    threshold: 1,
  },
  {
    id: 'missions-five-contracts',
    category: 'missions',
    icon: '\u{1F4E1}',
    title: 'THE USUAL UNUSUAL',
    subtitle: 'Five payouts · same dangerous desk job',
    description: 'Complete 5 missions for the board.',
    type: 'MISSION BOARD',
    rewardCredits: 500,
    kind: 'missions_completed',
    threshold: 5,
  },
  {
    id: 'missions-ten-contracts',
    category: 'missions',
    icon: '\u{1F3C6}',
    title: 'LONG HAULER',
    subtitle: 'Ten contracts · legs of iron, logbook full',
    description: 'Complete 10 missions across the system.',
    type: 'MISSION BOARD',
    rewardCredits: 900,
    kind: 'missions_completed',
    threshold: 10,
  },
  {
    id: 'exploration-first-asteroid',
    category: 'exploration',
    icon: '\u{1FAA8}',
    title: 'DUST TO DUST',
    subtitle: 'First rock logged · boots optional',
    description: 'Return from your first asteroid visit.',
    type: 'EXPLORATION',
    rewardCredits: 250,
    kind: 'unique_asteroids',
    threshold: 1,
  },
  {
    id: 'exploration-three-asteroids',
    category: 'exploration',
    icon: '\u{1F9ED}',
    title: 'TRIPLE THREAT',
    subtitle: 'Three asteroids · one stubborn pilot',
    description: 'Visit 3 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: 450,
    kind: 'unique_asteroids',
    threshold: 3,
  },
  {
    id: 'exploration-six-asteroids',
    category: 'exploration',
    icon: '\u{1F30C}',
    title: 'WALL OF STICKY NOTES',
    subtitle: 'Six worlds charted · zero apologies',
    description: 'Visit 6 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: 800,
    kind: 'unique_asteroids',
    threshold: 6,
  },
  (() => {
    const sunCopy = SOLAR_ORBIT_ACHIEVEMENT_COPY.sun
    if (!sunCopy) throw new Error('achievements: missing sun orbit copy')
    return {
      id: 'exploration-orbit-sun',
      category: 'exploration' as const,
      icon: '\u{2600}\u{FE0F}',
      title: sunCopy.title,
      subtitle: sunCopy.subtitle,
      description: 'Establish a close orbit around the Sun for the first time.',
      type: 'EXPLORATION',
      rewardCredits: 450,
      kind: 'solar_body_orbit' as const,
      orbitBodyKey: 'sun',
    }
  })(),
  ...PLANETS.filter((planet) => planet.id !== 'earth').map((planet): AchievementDefinition => {
    const copy = SOLAR_ORBIT_ACHIEVEMENT_COPY[planet.id]
    if (!copy) {
      throw new Error(`achievements: missing orbit copy for planet id "${planet.id}"`)
    }
    return {
      id: `exploration-orbit-${planet.id}`,
      category: 'exploration',
      icon: '\u{1F6F0}',
      title: copy.title,
      subtitle: copy.subtitle,
      description: `Enter orbit around ${planet.name} for the first time.`,
      type: 'EXPLORATION',
      rewardCredits: 220,
      kind: 'solar_body_orbit',
      orbitBodyKey: planet.id,
    }
  }),
  {
    id: 'credits-two-thousand',
    category: 'credits',
    icon: '\u{1F4B3}',
    title: 'FIVE FIGURES, ONE WALLET',
    subtitle: '2,000 CR · stacked and smug',
    description: 'Hold 2,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: 350,
    kind: 'credits_balance',
    threshold: 2000,
  },
  {
    id: 'credits-five-thousand',
    category: 'credits',
    icon: '\u{1F4B0}',
    title: 'RETIREMENT IS A LIE',
    subtitle: '5,000 CR on hand · dreams sold separately',
    description: 'Hold 5,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: 1000,
    kind: 'credits_balance',
    threshold: 5000,
  },
  {
    id: 'upgrades-first-install',
    category: 'upgrades',
    icon: '\u{1F527}',
    title: 'FIRST MOD, BEST MOD',
    subtitle: 'One tier installed · many more implied',
    description: 'Purchase your first shuttle upgrade.',
    type: 'ENGINEERING',
    rewardCredits: 350,
    kind: 'upgrade_tiers',
    threshold: 1,
  },
  {
    id: 'upgrades-five-tiers',
    category: 'upgrades',
    icon: '\u{1F6E0}',
    title: 'RATCHET JOCKEY',
    subtitle: 'Five upgrade tiers · manifest says "yes"',
    description: 'Install 5 total upgrade tiers.',
    type: 'ENGINEERING',
    rewardCredits: 700,
    kind: 'upgrade_tiers',
    threshold: 5,
  },
  {
    id: 'upgrades-gravity-surfing',
    category: 'upgrades',
    icon: '\u{1F310}',
    title: 'THE SHEET REMEMBERS',
    subtitle: 'Gravity Surfing · fold space, keep the hull',
    description: 'Unlock Gravity Surfing and gain access to Space Fabric controls.',
    type: 'ENGINEERING',
    rewardCredits: 1200,
    kind: 'specific_upgrade',
    upgradeId: 'gravitySurfing',
  },
]

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  flight: 'Flight Log',
  missions: 'Mission Board',
  exploration: 'Exploration',
  credits: 'Credits',
  upgrades: 'Engineering',
}
