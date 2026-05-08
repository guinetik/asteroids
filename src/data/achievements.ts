/**
 * Achievement definitions — titles, subtitles, unlock rules, and rewards.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-03-player-profile-design.md
 */
import type { UpgradeId, UpgradeLevels } from '@/lib/upgrades'
import type { BodyAccessState, PlayerProfile } from '@/lib/player/types'
import { PLANETS } from '@/lib/planets/catalog'
import {
  ACT_1_JOURNEY_ID,
  ACT_2_JOURNEY_ID,
  ACT_3_JOURNEY_ID,
  WELCOME_JOURNEY_ID,
  type JourneyId,
} from '@/lib/journeys'
import type { ContractMissionType, ContractStoreSnapshot } from '@/lib/contracts/contractTypes'

/** High-level achievement tab / grouping key used in the player profile UI. */
export type AchievementCategory =
  | 'flight'
  | 'missions'
  | 'exploration'
  | 'credits'
  | 'contracts'
  | 'upgrades'
  | 'cat'

/** Rule discriminator used by the achievement evaluator. */
export type AchievementKind =
  | 'intro'
  | 'journey_completed'
  | 'missions_completed'
  | 'unique_asteroids'
  | 'credits_balance'
  | 'credits_lifetime_earned'
  | 'credits_lifetime_spent'
  | 'credits_trade_earned'
  | 'upgrade_tiers'
  | 'specific_upgrade'
  | 'solar_body_orbit'
  | 'contract_completed_count'
  | 'specific_contract_completed'
  | 'specific_contract_accepted'
  | 'specific_contract_step_completed'
  | 'mission_kind_completed'
  | 'mission_objective_completed'
  | 'slingshot_launches'
  | 'slingshot_from_body'
  | 'gravity_surf_starts'
  | 'manifold_rides'
  | 'portal_departures'
  | 'worldline_lifetime_distance'
  | 'worldline_single_run_distance'
  | 'body_access_state'
  | 'sushi_pets'
  | 'sushi_bowl_refills'

/** Static row from `ACHIEVEMENT_DEFINITIONS` — copy, rule kind, and optional thresholds. */
export interface AchievementDefinition {
  /** Stable achievement id persisted in unlock storage, e.g. `'flight-first-launch'`. */
  id: string
  /** UI category bucket, e.g. `'flight'` or `'contracts'`. */
  category: AchievementCategory
  /** Small visual marker shown beside the row, e.g. a rocket glyph. */
  icon: string
  /** Primary headline — short, punchy name shown in UI. */
  title: string
  /** Secondary line — flavor, tone, or context under the title. */
  subtitle: string
  /** Plain-language unlock description shown in details. */
  description: string
  /** Small-caps family label shown in the card, e.g. `'MISSION BOARD'`. */
  type: string
  /** Credits granted when unlocked. Valid range: finite `>= 0`, e.g. `500`. */
  rewardCredits: number
  /** Rule evaluated by `isAchievementUnlocked`, e.g. `'credits_balance'`. */
  kind: AchievementKind
  /** Required count/distance/credit threshold. Valid range: finite `> 0`, e.g. `10_000`. */
  threshold?: number
  /** Upgrade id required by `specific_upgrade`, e.g. `'gravitySurfing'`. */
  upgradeId?: UpgradeId
  /** Journey id used by `journey_completed` achievements. */
  journeyId?: JourneyId
  /** Planet id or `"sun"` — must match keys in {@link PlayerProfile.orbitedSolarBodies}. */
  orbitBodyKey?: string
  /** Contract id used by `specific_contract_completed`, `specific_contract_accepted`, and `specific_contract_step_completed` achievements. */
  contractId?: string
  /**
   * Required outcome id for `specific_contract_completed` achievements that gate on a
   * specific choice-mission resolution (e.g. `'transmit'` or `'sabotage'`). When absent
   * the achievement fires for any successful completion of the contract.
   */
  requiredOutcomeId?: string
  /**
   * Zero-based step index for `specific_contract_step_completed` achievements.
   * Fires once `instance.currentStepIndex` has advanced past this index,
   * meaning the step at this index has been completed. Valid range: `>= 0`.
   */
  requiredStepIndex?: number
  /** Mission family counted by `mission_kind_completed` achievements. */
  missionKind?: ContractMissionType
  /** Mission objective type counted by `mission_objective_completed` achievements. */
  objectiveType?: string
  /** Body id used by `body_access_state` and `slingshot_from_body` achievements. */
  bodyId?: string
  /** Required access state for `body_access_state` achievements. */
  bodyAccessState?: BodyAccessState
}

/** Snapshot of profile + upgrades passed into unlock evaluation. */
export interface AchievementProgress {
  /** Current player save, including achievement counters and body access, e.g. Hektor state. */
  profile: PlayerProfile
  /** Current installed upgrade tiers keyed by upgrade id, e.g. `{ gravitySurfing: 1 }`. */
  upgradeLevels: UpgradeLevels
  /** Current contract persistence snapshot used for contract and mission-family progress. */
  contractSnapshot: ContractStoreSnapshot
}

/** Balance threshold for the legacy 2,000-credit wallet achievement. */
const CREDIT_BALANCE_TWO_THOUSAND = 2_000
/** Balance threshold for the legacy 5,000-credit wallet achievement. */
const CREDIT_BALANCE_FIVE_THOUSAND = 5_000
/** Credit balance needed for the first five-figure wallet achievement. */
const CREDIT_BALANCE_TEN_THOUSAND = 10_000
/** Lifetime earned-credit threshold for a midgame economy achievement. */
const CREDITS_EARNED_TWENTY_FIVE_THOUSAND = 25_000
/** Lifetime earned-credit threshold for an advanced economy achievement. */
const CREDITS_EARNED_FIFTY_THOUSAND = 50_000
/** Lifetime earned-credit threshold for the six-figure economy achievement. */
const CREDITS_EARNED_ONE_HUNDRED_THOUSAND = 100_000
/** Lifetime spent-credit threshold for the first spender achievement. */
const CREDITS_SPENT_TEN_THOUSAND = 10_000
/** Lifetime spent-credit threshold for the advanced spender achievement. */
const CREDITS_SPENT_FIFTY_THOUSAND = 50_000
/** Lifetime trade-credit threshold for the first trade route achievement. */
const CREDITS_TRADE_TEN_THOUSAND = 10_000
/** Count needed for first-time achievements. */
const FIRST_COUNT = 1
/** Count needed for small-set achievements. */
const THREE_COUNT = 3
/** Count needed for five-completion achievements. */
const FIVE_COUNT = 5
/** Count needed for six-asteroid exploration achievement. */
const SIX_COUNT = 6
/** Count needed for ten-completion achievements. */
const TEN_COUNT = 10
/** Count needed for twenty-upgrade achievement. */
const TWENTY_COUNT = 20
/** First sampled worldline distance threshold. */
const WORLDLINE_FIRST_TRACE_DISTANCE = 100
/** Single-run worldline distance threshold. */
const WORLDLINE_LONG_THREAD_DISTANCE = 2_500
/** First lifetime worldline distance threshold. */
const WORLDLINE_LIFETIME_TEN_THOUSAND = 10_000
/** Advanced lifetime worldline distance threshold. */
const WORLDLINE_LIFETIME_FIFTY_THOUSAND = 50_000
/** Reward for small unlocks. */
const REWARD_SMALL = 250
/** Reward for first board-contract unlocks. */
const REWARD_FIRST_MISSION = 300
/** Reward for starter economy and upgrade unlocks. */
const REWARD_STARTER = 350
/** Reward for early exploration unlocks. */
const REWARD_EXPLORATION = 450
/** Reward for standard unlocks. */
const REWARD_STANDARD = 500
/** Reward for larger upgrade unlocks. */
const REWARD_ENGINEERING = 700
/** Reward for notable unlocks. */
const REWARD_NOTABLE = 750
/** Reward for larger exploration unlocks. */
const REWARD_EXPLORATION_MAJOR = 800
/** Reward for legacy ten-mission unlock. */
const REWARD_MISSION_TEN = 900
/** Reward for major unlocks. */
const REWARD_MAJOR = 1_000
/** Reward for special upgrade unlocks. */
const REWARD_SPECIAL_UPGRADE = 1_200
/** Reward for capstone unlocks. */
const REWARD_CAPSTONE = 1_500
/** Reward for generated planet orbit achievements. */
const REWARD_PLANET_ORBIT = 220
/** Pet threshold for the "Beloved" Sushi achievement. */
const SUSHI_PET_THRESHOLD = 25
/** Empty-bowl refill threshold for the "Bowl-Filler" Sushi achievement. */
const SUSHI_BOWL_REFILL_THRESHOLD = 3
/** Credits granted for unlocking the "Beloved" Sushi achievement. */
const REWARD_SUSHI_BELOVED = 2_000
/** Credits granted for unlocking the "Bowl-Filler" Sushi achievement. */
const REWARD_SUSHI_BOWL_FILLER = 10_000

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
    rewardCredits: REWARD_SMALL,
    kind: 'journey_completed',
    journeyId: WELCOME_JOURNEY_ID,
  },
  {
    id: 'missions-first-contract',
    category: 'missions',
    icon: '\u{1F4CB}',
    title: 'INKED & PAID',
    subtitle: 'The board cut your first real check',
    description: 'Deliver your first mission payout.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_FIRST_MISSION,
    kind: 'missions_completed',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-five-contracts',
    category: 'missions',
    icon: '\u{1F4E1}',
    title: 'THE USUAL UNUSUAL',
    subtitle: 'Five payouts · same dangerous desk job',
    description: 'Complete 5 missions for the board.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_STANDARD,
    kind: 'missions_completed',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-ten-contracts',
    category: 'missions',
    icon: '\u{1F3C6}',
    title: 'LONG HAULER',
    subtitle: 'Ten contracts · legs of iron, logbook full',
    description: 'Complete 10 missions across the system.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_MISSION_TEN,
    kind: 'missions_completed',
    threshold: TEN_COUNT,
  },
  {
    id: 'exploration-first-asteroid',
    category: 'exploration',
    icon: '\u{1FAA8}',
    title: 'DUST TO DUST',
    subtitle: 'First rock logged · boots optional',
    description: 'Return from your first asteroid visit.',
    type: 'EXPLORATION',
    rewardCredits: REWARD_SMALL,
    kind: 'unique_asteroids',
    threshold: FIRST_COUNT,
  },
  {
    id: 'exploration-three-asteroids',
    category: 'exploration',
    icon: '\u{1F9ED}',
    title: 'TRIPLE THREAT',
    subtitle: 'Three asteroids · one stubborn pilot',
    description: 'Visit 3 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: REWARD_EXPLORATION,
    kind: 'unique_asteroids',
    threshold: THREE_COUNT,
  },
  {
    id: 'exploration-six-asteroids',
    category: 'exploration',
    icon: '\u{1F30C}',
    title: 'WALL OF STICKY NOTES',
    subtitle: 'Six worlds charted · zero apologies',
    description: 'Visit 6 different asteroids.',
    type: 'EXPLORATION',
    rewardCredits: REWARD_EXPLORATION_MAJOR,
    kind: 'unique_asteroids',
    threshold: SIX_COUNT,
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
      rewardCredits: REWARD_EXPLORATION,
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
      rewardCredits: REWARD_PLANET_ORBIT,
      kind: 'solar_body_orbit',
      orbitBodyKey: planet.id,
    }
  }),
  {
    id: 'credits-two-thousand',
    category: 'credits',
    icon: '\u{1F4B3}',
    title: 'FIRST FAT WALLET',
    subtitle: '2,000 CR · stacked and smug',
    description: 'Hold 2,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: REWARD_STARTER,
    kind: 'credits_balance',
    threshold: CREDIT_BALANCE_TWO_THOUSAND,
  },
  {
    id: 'credits-five-thousand',
    category: 'credits',
    icon: '\u{1F4B0}',
    title: 'RETIREMENT IS A LIE',
    subtitle: '5,000 CR on hand · dreams sold separately',
    description: 'Hold 5,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: REWARD_MAJOR,
    kind: 'credits_balance',
    threshold: CREDIT_BALANCE_FIVE_THOUSAND,
  },
  {
    id: 'credits-ten-thousand',
    category: 'credits',
    icon: '\u{1F4B0}',
    title: 'FIVE FIGURES, NO ALIBI',
    subtitle: '10,000 CR on hand · the wallet has mass',
    description: 'Hold 10,000 credits at once.',
    type: 'CREDITS',
    rewardCredits: REWARD_STANDARD,
    kind: 'credits_balance',
    threshold: CREDIT_BALANCE_TEN_THOUSAND,
  },
  {
    id: 'credits-earned-twenty-five-thousand',
    category: 'credits',
    icon: '\u{1F4C8}',
    title: 'GROSS RECEIPTS',
    subtitle: '25,000 CR earned · the books wake up',
    description: 'Earn 25,000 lifetime credits after profile creation.',
    type: 'CREDITS',
    rewardCredits: REWARD_STANDARD,
    kind: 'credits_lifetime_earned',
    threshold: CREDITS_EARNED_TWENTY_FIVE_THOUSAND,
  },
  {
    id: 'credits-earned-fifty-thousand',
    category: 'credits',
    icon: '\u{1F4C8}',
    title: 'HALF A HUNDRED',
    subtitle: '50,000 CR earned · signatures everywhere',
    description: 'Earn 50,000 lifetime credits after profile creation.',
    type: 'CREDITS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'credits_lifetime_earned',
    threshold: CREDITS_EARNED_FIFTY_THOUSAND,
  },
  {
    id: 'credits-earned-one-hundred-thousand',
    category: 'credits',
    icon: '\u{1F48E}',
    title: 'SIX-FIGURE ORBIT',
    subtitle: '100,000 CR earned · gravity likes you now',
    description: 'Earn 100,000 lifetime credits after profile creation.',
    type: 'CREDITS',
    rewardCredits: REWARD_MAJOR,
    kind: 'credits_lifetime_earned',
    threshold: CREDITS_EARNED_ONE_HUNDRED_THOUSAND,
  },
  {
    id: 'credits-spent-ten-thousand',
    category: 'credits',
    icon: '\u{1F6D2}',
    title: 'MONEY HAS THRUST',
    subtitle: '10,000 CR spent · receipts in the exhaust',
    description: 'Spend 10,000 lifetime credits through successful credit sinks.',
    type: 'CREDITS',
    rewardCredits: REWARD_STANDARD,
    kind: 'credits_lifetime_spent',
    threshold: CREDITS_SPENT_TEN_THOUSAND,
  },
  {
    id: 'credits-spent-fifty-thousand',
    category: 'credits',
    icon: '\u{1F6D2}',
    title: 'AUTHORIZED BAD IDEAS',
    subtitle: '50,000 CR spent · engineering applauds',
    description: 'Spend 50,000 lifetime credits through successful credit sinks.',
    type: 'CREDITS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'credits_lifetime_spent',
    threshold: CREDITS_SPENT_FIFTY_THOUSAND,
  },
  {
    id: 'credits-trade-ten-thousand',
    category: 'credits',
    icon: '\u{1F69A}',
    title: 'LANE MAKER',
    subtitle: '10,000 CR traded · margin with manners',
    description: 'Earn 10,000 credits from trade-good sales.',
    type: 'TRADE',
    rewardCredits: REWARD_NOTABLE,
    kind: 'credits_trade_earned',
    threshold: CREDITS_TRADE_TEN_THOUSAND,
  },
  {
    id: 'contracts-first-complete',
    category: 'contracts',
    icon: '\u{1F4DC}',
    title: 'SIGNED, SEALED, SURVIVED',
    subtitle: 'One contract closed · everybody exhales',
    description: 'Complete your first faction contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_STANDARD,
    kind: 'contract_completed_count',
    threshold: FIRST_COUNT,
  },
  {
    id: 'contracts-three-complete',
    category: 'contracts',
    icon: '\u{1F4DA}',
    title: 'THREE STAMP PILOT',
    subtitle: 'Three contracts closed · reputation sticks',
    description: 'Complete 3 faction contracts.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'contract_completed_count',
    threshold: THREE_COUNT,
  },
  {
    id: 'contracts-usc-venus-certification',
    category: 'contracts',
    icon: '\u{1F3DB}',
    title: 'VENUS CERTIFIED',
    subtitle: 'USC paperwork · stamped under pressure',
    description: 'Complete the USC Venus Certification contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'specific_contract_completed',
    contractId: 'usc-venus-certification',
  },
  {
    id: 'contracts-space-cowboys-mars-hq',
    category: 'contracts',
    icon: '\u{1F920}',
    title: 'MARS HQ HANDSHAKE',
    subtitle: 'Cowboys called · you answered in dust',
    description: 'Complete the Space Cowboys Mars HQ contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'specific_contract_completed',
    contractId: 'space-cowboys-mars-hq',
  },
  {
    id: 'contracts-martian-marine-corps-cohort',
    category: 'contracts',
    icon: '\u{1FA96}',
    title: 'COHORT CLEARED',
    subtitle: 'MMC drills · live rounds, clean exit',
    description: 'Complete the Martian Marine Corps Cohort contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'specific_contract_completed',
    contractId: 'martian-marine-corps-cohort',
  },
  {
    id: 'contracts-cinderline-mercury-consecration',
    category: 'contracts',
    icon: '\u{1F525}',
    title: 'ANVIL CONSECRATE',
    subtitle: 'Cinderline rites · hull still humming',
    description: 'Complete the Cinderline Mercury Consecration contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_MAJOR,
    kind: 'specific_contract_completed',
    contractId: 'cinderline-mercury-consecration',
  },
  {
    id: 'contracts-jovian-society-prospection',
    category: 'contracts',
    icon: '\u{1FA90}',
    title: 'PROSPECTUS FILED',
    subtitle: 'Jovian Society · data became leverage',
    description: 'Complete the Jovian Society Prospection contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'specific_contract_completed',
    contractId: 'jovian-society-prospection',
  },
  {
    id: 'ceres-institute-accepted',
    category: 'contracts',
    icon: '\u{1F393}',
    title: 'ACADEMIC-GRADE COMPENSATION',
    subtitle: "Accepted Dean Porter's standing invitation.",
    description: 'Accept the Ceres Institute Eternal Biology contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_STANDARD,
    kind: 'specific_contract_accepted',
    contractId: 'ceres-institute-eternal-biology',
  },
  {
    id: 'ceres-first-psychosphere',
    category: 'contracts',
    icon: '\u{1F9EC}',
    title: 'PROMISING MATERIAL',
    subtitle: 'Collected your first unit of psychosphere for the Institute.',
    description: 'Complete the first rescue step of the Ceres Institute contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'specific_contract_step_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredStepIndex: 3,
  },
  {
    id: 'ceres-rescue-pattern',
    category: 'contracts',
    icon: '\u{1F91D}',
    title: 'I AM SORRY TO ASK TWICE',
    subtitle: 'Extracted a second Institute team.',
    description: 'Complete the second rescue step of the Ceres Institute contract.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_NOTABLE,
    kind: 'specific_contract_step_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredStepIndex: 8,
  },
  {
    id: 'ceres-archive-transmitted',
    category: 'contracts',
    icon: '\u{1F4E1}',
    title: 'THE FOUNDATION WILL REMEMBER',
    subtitle: 'Transmitted the archive to the Institute.',
    description: 'Complete the Ceres Institute contract via the transmit outcome.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'specific_contract_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredOutcomeId: 'transmit',
  },
  {
    id: 'ceres-archive-sabotaged',
    category: 'contracts',
    icon: '\u{1F4A5}',
    title: 'FILE CLOSURE',
    subtitle: 'Sabotaged the archive transmission.',
    description: 'Complete the Ceres Institute contract via the sabotage outcome.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'specific_contract_completed',
    contractId: 'ceres-institute-eternal-biology',
    requiredOutcomeId: 'sabotage',
  },
  {
    id: 'contracts-hektor-liberated',
    category: 'contracts',
    icon: '\u{1F513}',
    title: 'HEKTOR LIBERATED',
    subtitle: 'Asset 2306-J · no longer just an asset',
    description: 'Resolve Hektor with a liberated access state.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'body_access_state',
    bodyId: 'hektor',
    bodyAccessState: 'liberated',
  },
  {
    id: 'contracts-hektor-destroyed',
    category: 'contracts',
    icon: '\u{1F4A5}',
    title: 'HEKTOR DESTROYED',
    subtitle: 'Asset 2306-J · the ledger ends in fire',
    description: 'Resolve Hektor with a destroyed access state.',
    type: 'CONTRACTS',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'body_access_state',
    bodyId: 'hektor',
    bodyAccessState: 'destroyed',
  },
  {
    id: 'journey-act-1-inner-system',
    category: 'contracts',
    icon: '\u{1F3AD}',
    title: 'ACT I: INNER SYSTEM',
    subtitle: 'Certification complete · the map gets stranger',
    description: 'Complete the Act I Inner System journey.',
    type: 'JOURNEY',
    rewardCredits: REWARD_MAJOR,
    kind: 'journey_completed',
    journeyId: ACT_1_JOURNEY_ID,
  },
  {
    id: 'journey-act-2-jovian-arrival',
    category: 'contracts',
    icon: '\u{1FA90}',
    title: 'ACT II: JOVIAN ARRIVAL',
    subtitle: 'Three ledgers reconciled · the giant noticed',
    description: 'Complete the Act II Jovian Arrival journey.',
    type: 'JOURNEY',
    rewardCredits: REWARD_MAJOR,
    kind: 'journey_completed',
    journeyId: ACT_2_JOURNEY_ID,
  },
  {
    id: 'journey-act-3-outer-reaches',
    category: 'contracts',
    icon: '\u{1F319}',
    title: 'ACT III: OUTER REACHES',
    subtitle: 'Saturn rang · the long ice opened',
    description: 'Complete the Act III Outer Reaches journey.',
    type: 'JOURNEY',
    rewardCredits: REWARD_MAJOR,
    kind: 'journey_completed',
    journeyId: ACT_3_JOURNEY_ID,
  },
  {
    id: 'flight-first-slingshot',
    category: 'flight',
    icon: '\u{1F300}',
    title: 'GRAVITY THREW FIRST',
    subtitle: 'One slingshot launch · clean vector',
    description: 'Perform your first slingshot launch.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_SMALL,
    kind: 'slingshot_launches',
    threshold: FIRST_COUNT,
  },
  {
    id: 'flight-ten-slingshots',
    category: 'flight',
    icon: '\u{1F504}',
    title: 'TEN NICE EXITS',
    subtitle: 'Ten slingshots · orbit learned your name',
    description: 'Perform 10 slingshot launches.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_NOTABLE,
    kind: 'slingshot_launches',
    threshold: TEN_COUNT,
  },
  {
    id: 'flight-sun-launch',
    category: 'flight',
    icon: '\u{2600}\u{FE0F}',
    title: 'SOLAR SLING',
    subtitle: 'The Sun let go · eventually',
    description: 'Slingshot launch from the Sun.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_NOTABLE,
    kind: 'slingshot_from_body',
    bodyId: 'sun',
    threshold: FIRST_COUNT,
  },
  {
    id: 'flight-first-gravity-surf',
    category: 'flight',
    icon: '\u{1F30A}',
    title: 'FIRST FABRIC RIPPLE',
    subtitle: 'Gravity Surfing · fingers on the sheet',
    description: 'Start your first Gravity Surf.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_STANDARD,
    kind: 'gravity_surf_starts',
    threshold: FIRST_COUNT,
  },
  {
    id: 'flight-first-manifold',
    category: 'flight',
    icon: '\u{1F573}',
    title: 'MANIFOLD MILE',
    subtitle: 'Orbital highway · one impossible lane',
    description: 'Complete your first manifold ride.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_STANDARD,
    kind: 'manifold_rides',
    threshold: FIRST_COUNT,
  },
  {
    id: 'flight-first-portal-departure',
    category: 'flight',
    icon: '\u{1F6AA}',
    title: 'EDGE DEPARTURE',
    subtitle: 'Portal crossed · map says yes, physics says maybe',
    description: 'Depart through your first edge portal.',
    type: 'FLIGHT LOG',
    rewardCredits: REWARD_STANDARD,
    kind: 'portal_departures',
    threshold: FIRST_COUNT,
  },
  {
    id: 'worldline-first-trace',
    category: 'flight',
    icon: '\u{1F4AB}',
    title: 'FIRST TRACE',
    subtitle: 'Worldline sampled · the thread begins',
    description: 'Travel 100 sampled worldline units.',
    type: 'WORLDLINE',
    rewardCredits: REWARD_SMALL,
    kind: 'worldline_lifetime_distance',
    threshold: WORLDLINE_FIRST_TRACE_DISTANCE,
  },
  {
    id: 'worldline-long-thread',
    category: 'flight',
    icon: '\u{1F9F5}',
    title: 'LONG THREAD',
    subtitle: 'One run, long line · telemetry approves',
    description: 'Travel 2,500 worldline units in one continuous run.',
    type: 'WORLDLINE',
    rewardCredits: REWARD_NOTABLE,
    kind: 'worldline_single_run_distance',
    threshold: WORLDLINE_LONG_THREAD_DISTANCE,
  },
  {
    id: 'worldline-lifetime-ten-thousand',
    category: 'flight',
    icon: '\u{1F4CF}',
    title: 'TEN THOUSAND THREADS',
    subtitle: '10,000 units · the path remembers',
    description: 'Travel 10,000 lifetime worldline units.',
    type: 'WORLDLINE',
    rewardCredits: REWARD_NOTABLE,
    kind: 'worldline_lifetime_distance',
    threshold: WORLDLINE_LIFETIME_TEN_THOUSAND,
  },
  {
    id: 'worldline-lifetime-fifty-thousand',
    category: 'flight',
    icon: '\u{1F30C}',
    title: 'FIFTY THOUSAND THREADS',
    subtitle: '50,000 units · your contrail has history',
    description: 'Travel 50,000 lifetime worldline units.',
    type: 'WORLDLINE',
    rewardCredits: REWARD_MAJOR,
    kind: 'worldline_lifetime_distance',
    threshold: WORLDLINE_LIFETIME_FIFTY_THOUSAND,
  },
  {
    id: 'missions-shuttle-first',
    category: 'missions',
    icon: '\u{1F6F0}',
    title: 'ORBITAL COURIER',
    subtitle: 'One shuttle job · cargo with altitude',
    description: 'Complete your first shuttle mission.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_SMALL,
    kind: 'mission_kind_completed',
    missionKind: 'shuttle',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-asteroid-first',
    category: 'missions',
    icon: '\u{1FAA8}',
    title: 'ROCK CALL',
    subtitle: 'One asteroid job · boots optional',
    description: 'Complete your first asteroid mission.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_SMALL,
    kind: 'mission_kind_completed',
    missionKind: 'asteroid',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-eva-first',
    category: 'missions',
    icon: '\u{1F9D1}\u{200D}\u{1F680}',
    title: 'SUIT WALKER',
    subtitle: 'One EVA job · air kept its promise',
    description: 'Complete your first EVA mission.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_SMALL,
    kind: 'mission_kind_completed',
    missionKind: 'eva',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-mining-first',
    category: 'missions',
    icon: '\u{26CF}\u{FE0F}',
    title: 'LASER SHIFT',
    subtitle: 'One mining job · ore noticed',
    description: 'Complete your first mining mission.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_SMALL,
    kind: 'mission_kind_completed',
    missionKind: 'mining',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-asteroid-five',
    category: 'missions',
    icon: '\u{1FAA8}',
    title: 'BELT REGULAR',
    subtitle: 'Five asteroid jobs · dust in the seams',
    description: 'Complete 5 asteroid missions.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_kind_completed',
    missionKind: 'asteroid',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-eva-five',
    category: 'missions',
    icon: '\u{1F9D1}\u{200D}\u{1F680}',
    title: 'VACUUM HAND',
    subtitle: 'Five EVA jobs · tether discipline',
    description: 'Complete 5 EVA missions.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_kind_completed',
    missionKind: 'eva',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-mining-five',
    category: 'missions',
    icon: '\u{26CF}\u{FE0F}',
    title: 'ORE FOREMAN',
    subtitle: 'Five mining jobs · the turret pays rent',
    description: 'Complete 5 mining missions.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_kind_completed',
    missionKind: 'mining',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-shuttle-five',
    category: 'missions',
    icon: '\u{1F6F0}',
    title: 'ROUTE KEEPER',
    subtitle: 'Five shuttle jobs · stations wave back',
    description: 'Complete 5 shuttle missions.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_kind_completed',
    missionKind: 'shuttle',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-photometry-first',
    category: 'missions',
    icon: '\u{1F52D}',
    title: 'LIGHTCURVE LOCK',
    subtitle: 'Photometry complete · brightness confessed',
    description: 'Complete your first photometry objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_STANDARD,
    kind: 'mission_objective_completed',
    objectiveType: 'photometry',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-dan-first',
    category: 'missions',
    icon: '\u{1F4E1}',
    title: 'NEUTRON WHISPER',
    subtitle: 'DAN complete · the subsurface answered',
    description: 'Complete your first DAN objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_STANDARD,
    kind: 'mission_objective_completed',
    objectiveType: 'dan',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-survey-first',
    category: 'missions',
    icon: '\u{1F4CD}',
    title: 'SURVEY STAKE',
    subtitle: 'Survey complete · coordinates behaving',
    description: 'Complete your first survey objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_SMALL,
    kind: 'mission_objective_completed',
    objectiveType: 'survey',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-bunker-first',
    category: 'missions',
    icon: '\u{1F6E1}',
    title: 'BUNKER BREACH',
    subtitle: 'Bunker cleared · echoes only',
    description: 'Complete your first bunker objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_STANDARD,
    kind: 'mission_objective_completed',
    objectiveType: 'bunker',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-prospectus-terminal-first',
    category: 'missions',
    icon: '\u{1F5A5}',
    title: 'TERMINAL VERDICT',
    subtitle: 'Prospectus terminal · decision logged',
    description: 'Complete your first prospectus-terminal objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_MAJOR,
    kind: 'mission_objective_completed',
    objectiveType: 'prospectus-terminal',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-mineral-analysis-first',
    category: 'missions',
    icon: '\u{1F48E}',
    title: 'ASSAY SIGNATURE',
    subtitle: 'Mineral analysis complete · report filed',
    description: 'Complete your first mineral-analysis objective.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_STANDARD,
    kind: 'mission_objective_completed',
    objectiveType: 'mineral-analysis',
    threshold: FIRST_COUNT,
  },
  {
    id: 'missions-gather-five',
    category: 'missions',
    icon: '\u{1F4E6}',
    title: 'SAMPLE RUNNER',
    subtitle: 'Five gathers · pockets with purpose',
    description: 'Complete 5 gather objectives.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_objective_completed',
    objectiveType: 'gather',
    threshold: FIVE_COUNT,
  },
  {
    id: 'missions-mineral-analysis-five',
    category: 'missions',
    icon: '\u{1F52C}',
    title: 'FIELD ASSAYER',
    subtitle: 'Five analyses · rocks keep talking',
    description: 'Complete 5 mineral-analysis objectives.',
    type: 'MISSION BOARD',
    rewardCredits: REWARD_NOTABLE,
    kind: 'mission_objective_completed',
    objectiveType: 'mineral-analysis',
    threshold: FIVE_COUNT,
  },
  {
    id: 'upgrades-first-install',
    category: 'upgrades',
    icon: '\u{1F527}',
    title: 'FIRST MOD, BEST MOD',
    subtitle: 'One tier installed · many more implied',
    description: 'Purchase your first shuttle upgrade.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_STARTER,
    kind: 'upgrade_tiers',
    threshold: FIRST_COUNT,
  },
  {
    id: 'upgrades-five-tiers',
    category: 'upgrades',
    icon: '\u{1F6E0}',
    title: 'RATCHET JOCKEY',
    subtitle: 'Five upgrade tiers · manifest says "yes"',
    description: 'Install 5 total upgrade tiers.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_ENGINEERING,
    kind: 'upgrade_tiers',
    threshold: FIVE_COUNT,
  },
  {
    id: 'upgrades-gravity-surfing',
    category: 'upgrades',
    icon: '\u{1F310}',
    title: 'THE SHEET REMEMBERS',
    subtitle: 'Gravity Surfing · fold space, keep the hull',
    description: 'Unlock Gravity Surfing and gain access to Space Fabric controls.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_SPECIAL_UPGRADE,
    kind: 'specific_upgrade',
    upgradeId: 'gravitySurfing',
  },
  {
    id: 'upgrades-orbital-surfing',
    category: 'upgrades',
    icon: '\u{1F300}',
    title: 'HIGHWAY PERMIT',
    subtitle: 'Orbital Surfing · manifold toll paid',
    description: 'Unlock Orbital Surfing and gain access to manifold routes.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_MAJOR,
    kind: 'specific_upgrade',
    upgradeId: 'orbitalSurfing',
  },
  {
    id: 'upgrades-turret-mining-unlock',
    category: 'upgrades',
    icon: '\u{26CF}\u{FE0F}',
    title: 'TURRET PROSPECTOR',
    subtitle: 'Mining turret online · rocks look nervous',
    description: 'Unlock the shuttle mining turret.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_MAJOR,
    kind: 'specific_upgrade',
    upgradeId: 'turretMiningUnlock',
  },
  {
    id: 'upgrades-ten-tiers',
    category: 'upgrades',
    icon: '\u{1F9F0}',
    title: 'TEN TIER TINKER',
    subtitle: 'Ten upgrade tiers · bolts believe',
    description: 'Install 10 total upgrade tiers.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_MAJOR,
    kind: 'upgrade_tiers',
    threshold: TEN_COUNT,
  },
  {
    id: 'cat-beloved',
    category: 'cat',
    icon: '\u{1F408}',
    title: 'BELOVED',
    subtitle: 'Twenty-five pets · Sushi remembers your hand',
    description: 'Pet Sushi 25 times.',
    type: 'HABITAT',
    rewardCredits: REWARD_SUSHI_BELOVED,
    kind: 'sushi_pets',
    threshold: SUSHI_PET_THRESHOLD,
  },
  {
    id: 'cat-bowl-filler',
    category: 'cat',
    icon: '\u{1F963}',
    title: 'BOWL-FILLER',
    subtitle: 'Three empty bowls rescued · Sushi eats again',
    description: 'Refill the empty bowl 3 times.',
    type: 'HABITAT',
    rewardCredits: REWARD_SUSHI_BOWL_FILLER,
    kind: 'sushi_bowl_refills',
    threshold: SUSHI_BOWL_REFILL_THRESHOLD,
  },
  {
    id: 'upgrades-twenty-tiers',
    category: 'upgrades',
    icon: '\u{1F6E0}',
    title: 'SHIP OF THESEUS',
    subtitle: 'Twenty tiers installed · original parts optional',
    description: 'Install 20 total upgrade tiers.',
    type: 'ENGINEERING',
    rewardCredits: REWARD_CAPSTONE,
    kind: 'upgrade_tiers',
    threshold: TWENTY_COUNT,
  },
]

/**
 * Checks whether an authored threshold can safely gate an achievement.
 *
 * @param definition - Achievement row to inspect.
 * @returns True when `threshold` is finite and greater than zero.
 */
function hasPositiveThreshold(definition: AchievementDefinition): boolean {
  return (
    typeof definition.threshold === 'number' &&
    Number.isFinite(definition.threshold) &&
    definition.threshold > 0
  )
}

/**
 * Checks optional id fields before they are used as evaluator keys.
 *
 * @param value - Optional id-like field, e.g. `'hektor'`.
 * @returns True when the value is a non-empty string.
 */
function hasNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Returns the first validation error for an authored achievement row.
 *
 * @param definition - Achievement row to validate.
 * @returns Error label, or `null` when the row has the fields its kind requires.
 */
function getAchievementDefinitionError(definition: AchievementDefinition): string | null {
  if (!hasNonEmptyString(definition.id)) return 'missing id'
  if (!Number.isFinite(definition.rewardCredits) || definition.rewardCredits < 0) {
    return 'invalid rewardCredits'
  }

  switch (definition.kind) {
    case 'intro':
      return null
    case 'journey_completed':
      return definition.journeyId ? null : 'missing journeyId'
    case 'missions_completed':
    case 'unique_asteroids':
    case 'credits_balance':
    case 'credits_lifetime_earned':
    case 'credits_lifetime_spent':
    case 'credits_trade_earned':
    case 'upgrade_tiers':
    case 'contract_completed_count':
    case 'slingshot_launches':
    case 'gravity_surf_starts':
    case 'manifold_rides':
    case 'portal_departures':
    case 'worldline_lifetime_distance':
    case 'worldline_single_run_distance':
    case 'sushi_pets':
    case 'sushi_bowl_refills':
      return hasPositiveThreshold(definition) ? null : 'missing positive threshold'
    case 'specific_upgrade':
      return definition.upgradeId ? null : 'missing upgradeId'
    case 'solar_body_orbit':
      return hasNonEmptyString(definition.orbitBodyKey) ? null : 'missing orbitBodyKey'
    case 'specific_contract_completed':
      return hasNonEmptyString(definition.contractId) ? null : 'missing contractId'
    case 'specific_contract_accepted':
      return hasNonEmptyString(definition.contractId) ? null : 'missing contractId'
    case 'specific_contract_step_completed':
      if (!hasNonEmptyString(definition.contractId)) return 'missing contractId'
      return typeof definition.requiredStepIndex === 'number' && definition.requiredStepIndex >= 0
        ? null
        : 'missing non-negative requiredStepIndex'
    case 'mission_kind_completed':
      if (!definition.missionKind) return 'missing missionKind'
      return hasPositiveThreshold(definition) ? null : 'missing positive threshold'
    case 'mission_objective_completed':
      if (!hasNonEmptyString(definition.objectiveType)) return 'missing objectiveType'
      return hasPositiveThreshold(definition) ? null : 'missing positive threshold'
    case 'slingshot_from_body':
      if (!hasNonEmptyString(definition.bodyId)) return 'missing bodyId'
      return hasPositiveThreshold(definition) ? null : 'missing positive threshold'
    case 'body_access_state':
      if (!hasNonEmptyString(definition.bodyId)) return 'missing bodyId'
      return definition.bodyAccessState ? null : 'missing bodyAccessState'
  }
}

/**
 * Validates authored achievements at module load so bad rows fail loudly.
 *
 * @param definitions - Authored achievement rows.
 */
function validateAchievementDefinitions(definitions: readonly AchievementDefinition[]): void {
  for (const definition of definitions) {
    const error = getAchievementDefinitionError(definition)
    if (error) throw new Error(`achievements: ${definition.id || '<missing id>'} ${error}`)
  }
}

validateAchievementDefinitions(ACHIEVEMENT_DEFINITIONS)

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  flight: 'Flight Log',
  missions: 'Mission Board',
  exploration: 'Exploration',
  credits: 'Credits',
  contracts: 'Contracts',
  upgrades: 'Engineering',
  cat: 'Habitat Cat',
}
