import type { PlayerProfile } from '@/lib/player/types'
import type { UpgradeId } from '@/lib/upgrades'

/** Stable ids for journey definitions persisted on the player profile. */
export type JourneyId = 'welcome' | 'act-1-inner-system' | 'act-2-jovian-arrival'
/** Feature unlock ids granted by completing journeys. */
export type JourneyFeatureId = 'slingshot'
/** Runtime trigger ids that can advance one or more journey steps. */
export type JourneyTriggerId =
  | `message_archived:${string}`
  | `contract_accepted:${string}`
  | `contract_completed:${string}`
  | `upgrade_installed:${UpgradeId}`
  | 'shuttle_control_opened'
  | 'shuttle_program_opened'
  | 'lander_program_opened'
  | 'shop_opened'
  | 'bought_shuttle_fuel'
  | 'inventory_opened'
  | 'upgrades_opened'
  | 'accepted_asteroid_mission'
  | 'accepted_eva_mission'
  | 'left_habitat'
  /**
   * First persisted orbit at a catalog body key (`jupiter`, `mars`, …).
   * Emitted from the map when solar first-orbit persistence newly records that body.
   */
  | `first_orbit:${string}`

/** Progress meter metadata for a tracker step when a step needs sub-progress. */
export interface JourneyTrackerStepProgress {
  current: number
  target: number
  unit: string
}

/** One visible step inside the HUD tracker for the active journey. */
export interface JourneyTrackerStep {
  label: string
  complete: boolean
  active: boolean
  progress?: JourneyTrackerStepProgress
}

/** One top-level objective entry rendered by the shared objective tracker UI. */
export interface JourneyTrackerEntry {
  id: string
  label: string
  complete: boolean
  steps: readonly JourneyTrackerStep[]
}

/** UI payload describing the currently active journey in tracker form. */
export interface JourneyTrackerState {
  eyebrow: string
  title: string
  objectives: JourneyTrackerEntry[]
}

/** One authored journey step and the trigger that fulfills it. */
interface JourneyStepDefinition {
  id: string
  label: string
  trigger: JourneyTriggerId
}

/** Full authored definition for a journey and its unlocks. */
interface JourneyDefinition {
  id: JourneyId
  eyebrow: string
  title: string
  objectiveLabel: string
  unlocks: readonly JourneyFeatureId[]
  /**
   * When present, the journey is hidden from the HUD tracker / start-banner and
   * its step-advance events are ignored until this trigger fires for the profile.
   * Default: no gate — the journey becomes active as soon as earlier journeys
   * complete.
   */
  startTrigger?: JourneyTriggerId
  steps: readonly JourneyStepDefinition[]
}

/** Canonical id for the onboarding journey. */
export const WELCOME_JOURNEY_ID: JourneyId = 'welcome'
/** Canonical id for the Act 1 inner-system arc. */
export const ACT_1_JOURNEY_ID: JourneyId = 'act-1-inner-system'
/** Canonical id for the Act 2 three-contract Jupiter gate arc. */
export const ACT_2_JOURNEY_ID: JourneyId = 'act-2-jovian-arrival'

/** Contract ids that must all complete to unlock the Act 1 climax (Consortium Certification). */
export const ACT_1_CONTRACT_IDS = [
  'usc-venus-certification',
  'space-cowboys-mars-hq',
  'martian-marine-corps-cohort',
] as const

/**
 * Contract ids whose completion satisfies Act II journey steps once the Jupiter first-orbit gate
 * is open ({@link ACT_2_JOURNEY_ID}).
 */
export const ACT_2_CONTRACT_IDS = [
  'venusian-zeppelin-trade-loop',
  'cinderline-mercury-consecration',
  'jovian-society-prospection',
] as const
/** Unlock granted after the onboarding journey completes. */
export const SLINGSHOT_JOURNEY_FEATURE_ID: JourneyFeatureId = 'slingshot'

const JOURNEY_DEFINITIONS: readonly JourneyDefinition[] = [
  {
    id: WELCOME_JOURNEY_ID,
    eyebrow: 'Journey',
    title: 'Welcome',
    objectiveLabel: 'Complete Onboarding',
    unlocks: [SLINGSHOT_JOURNEY_FEATURE_ID],
    steps: [
      {
        id: 'read-marta',
        label: 'Read the message from Marta',
        trigger: 'message_archived:seller-welcome-earth-orbit',
      },
      {
        id: 'read-jay',
        label: 'Read the message from Jay',
        trigger: 'message_archived:jay-so-you-actually-did-it',
      },
      {
        id: 'open-control-panel',
        label: 'Explore the Shuttle Control Panel',
        trigger: 'shuttle_control_opened',
      },
      {
        id: 'open-shuttle-program',
        label: 'Explore the Shuttle Program',
        trigger: 'shuttle_program_opened',
      },
      {
        id: 'open-lander-program',
        label: 'Explore the Lander Program',
        trigger: 'lander_program_opened',
      },
      {
        id: 'open-inventory',
        label: 'Explore the inventory',
        trigger: 'inventory_opened',
      },
      {
        id: 'open-upgrades',
        label: 'Explore the Upgrades Shop',
        trigger: 'upgrades_opened',
      },
      {
        id: 'accept-asteroid-mission',
        label: 'Accept an asteroid mission',
        trigger: 'accepted_asteroid_mission',
      },
      {
        id: 'accept-eva-mission',
        label: 'Accept an EVA mission',
        trigger: 'accepted_eva_mission',
      },
      {
        id: 'buy-shuttle-fuel',
        label: 'Visit the shop and buy Shuttle Fuel',
        trigger: 'bought_shuttle_fuel',
      },
      {
        id: 'leave-habitat',
        label: 'Leave the Habitat',
        trigger: 'left_habitat',
      },
    ],
  },
  {
    id: ACT_1_JOURNEY_ID,
    eyebrow: 'Act I',
    title: 'Inner System',
    objectiveLabel: 'Earn your manifold cert',
    unlocks: [],
    // Act 1 stays hidden until the player has actually accepted the USC contract —
    // before that the "Inner System" title would spoiler the arc.
    startTrigger: `contract_accepted:${ACT_1_CONTRACT_IDS[0]}`,
    steps: [
      {
        id: 'usc-cert',
        label: 'Complete USC Venus Certification',
        trigger: `contract_completed:${ACT_1_CONTRACT_IDS[0]}`,
      },
      {
        id: 'cowboys-hq',
        label: 'Complete Space Cowboys Mars HQ',
        trigger: `contract_completed:${ACT_1_CONTRACT_IDS[1]}`,
      },
      {
        id: 'mmc-cohort',
        label: 'Complete MMC Turret Cohort',
        trigger: `contract_completed:${ACT_1_CONTRACT_IDS[2]}`,
      },
      {
        id: 'grid-coupling',
        label: 'Install the USC Module',
        trigger: 'upgrade_installed:gravitySurfing',
      },
    ],
  },
  {
    id: ACT_2_JOURNEY_ID,
    eyebrow: 'Act II',
    title: 'Jovian Arrival',
    objectiveLabel: 'Close the belts before Jupiter forgets your name',
    unlocks: [],
    startTrigger: 'first_orbit:jupiter',
    steps: [
      {
        id: `contract-${ACT_2_CONTRACT_IDS[0]}`,
        label: 'Complete Venusian Zeppelin Trade Loop',
        trigger: `contract_completed:${ACT_2_CONTRACT_IDS[0]}`,
      },
      {
        id: `contract-${ACT_2_CONTRACT_IDS[1]}`,
        label: 'Complete The Cinderline (Mercury Consecration)',
        trigger: `contract_completed:${ACT_2_CONTRACT_IDS[1]}`,
      },
      {
        id: `contract-${ACT_2_CONTRACT_IDS[2]}`,
        label: 'Complete Jovian Society Prospection',
        trigger: `contract_completed:${ACT_2_CONTRACT_IDS[2]}`,
      },
    ],
  },
]

/** Result payload returned after trying to apply a journey trigger. */
export interface ApplyJourneyTriggerResult {
  profile: PlayerProfile
  changed: boolean
  completedJourneyIds: JourneyId[]
  unlockedFeatureIds: JourneyFeatureId[]
  /** Journey ids whose `startTrigger` gate was just satisfied by this call. */
  newlyStartReadyJourneyIds: JourneyId[]
}

/** Deduplicate persisted string lists while preserving first-seen order. */
function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

/** Read the completed step ids for one journey from the player profile. */
function getCompletedStepIds(profile: PlayerProfile, journeyId: JourneyId): string[] {
  return uniqueStrings(profile.journeyStepProgress[journeyId] ?? [])
}

/** Check whether a journey is already marked complete on the profile. */
function isJourneyComplete(profile: PlayerProfile, journeyId: JourneyId): boolean {
  return profile.completedJourneyIds.includes(journeyId)
}

/**
 * Check whether a journey is start-ready on the profile. Journeys without a
 * `startTrigger` are always ready; journeys with one require the trigger to
 * have fired (recorded in `journeyStartReadyIds`).
 */
function isJourneyStartReady(profile: PlayerProfile, definition: JourneyDefinition): boolean {
  if (definition.startTrigger === undefined) return true
  return profile.journeyStartReadyIds.includes(definition.id)
}

/** Public completion check used by onboarding gates elsewhere in the map flow. */
export function hasCompletedJourney(profile: PlayerProfile, journeyId: JourneyId): boolean {
  return isJourneyComplete(profile, journeyId)
}

/** Display fields for a journey, used by HUD trackers and completion banners. */
export interface JourneyDisplay {
  /** Small-caps eyebrow text (e.g. `"Act I"`). */
  eyebrow: string
  /** Large headline (e.g. `"Inner System"`). */
  title: string
  /** One-line objective summary (e.g. `"Earn your manifold cert"`). */
  objectiveLabel: string
}

/** Look up the authored display fields for a journey id, or `null` if unknown. */
export function getJourneyDisplay(journeyId: JourneyId): JourneyDisplay | null {
  const definition = JOURNEY_DEFINITIONS.find((j) => j.id === journeyId)
  if (!definition) return null
  return {
    eyebrow: definition.eyebrow,
    title: definition.title,
    objectiveLabel: definition.objectiveLabel,
  }
}

/**
 * First incomplete journey that has NOT yet had its "JOURNEY BEGINS" banner fired,
 * or `null` when every active journey has already been announced.
 */
export function getJourneyPendingStartAnnouncement(profile: PlayerProfile): JourneyId | null {
  const announced = new Set(profile.announcedJourneyStartIds)
  for (const journey of JOURNEY_DEFINITIONS) {
    if (isJourneyComplete(profile, journey.id)) continue
    if (!isJourneyStartReady(profile, journey)) continue
    if (announced.has(journey.id)) continue
    return journey.id
  }
  return null
}

/** Mark a journey's start banner as announced. Idempotent. */
export function markJourneyStartAnnounced(
  profile: PlayerProfile,
  journeyId: JourneyId,
): PlayerProfile {
  if (profile.announcedJourneyStartIds.includes(journeyId)) return profile
  return {
    ...profile,
    announcedJourneyStartIds: uniqueStrings([...profile.announcedJourneyStartIds, journeyId]),
  }
}

/** Check whether a journey-gated feature has been unlocked for the profile. */
export function isJourneyFeatureUnlocked(
  profile: PlayerProfile,
  featureId: JourneyFeatureId,
): boolean {
  return profile.unlockedFeatureIds.includes(featureId)
}

/** Apply one runtime trigger and return any resulting journey completion/unlocks. */
export function applyJourneyTrigger(
  profile: PlayerProfile,
  trigger: JourneyTriggerId,
): ApplyJourneyTriggerResult {
  let nextProfile = profile
  let changed = false
  const completedJourneyIds: JourneyId[] = []
  const unlockedFeatureIds: JourneyFeatureId[] = []
  const newlyStartReadyJourneyIds: JourneyId[] = []

  // Pass 1: start-trigger matches — open any gates this trigger opens.
  for (const journey of JOURNEY_DEFINITIONS) {
    if (journey.startTrigger !== trigger) continue
    if (nextProfile.journeyStartReadyIds.includes(journey.id)) continue
    nextProfile = {
      ...nextProfile,
      journeyStartReadyIds: uniqueStrings([...nextProfile.journeyStartReadyIds, journey.id]),
    }
    newlyStartReadyJourneyIds.push(journey.id)
    changed = true
  }

  // Pass 2: advance steps for every not-yet-complete journey. Step progress
  // accumulates even for gated journeys so the tracker can show retroactive
  // checks the moment the gate finally opens (e.g. player completed Jay's
  // Cowboys arc before they accepted USC — Cowboys step starts already ticked).
  for (const journey of JOURNEY_DEFINITIONS) {
    if (isJourneyComplete(nextProfile, journey.id)) continue

    const completedStepIds = new Set(getCompletedStepIds(nextProfile, journey.id))
    const matchingSteps = journey.steps.filter((step) => step.trigger === trigger)
    if (matchingSteps.length === 0) continue

    let journeyChanged = false
    for (const step of matchingSteps) {
      if (completedStepIds.has(step.id)) continue
      completedStepIds.add(step.id)
      journeyChanged = true
    }
    if (!journeyChanged) continue

    changed = true
    nextProfile = {
      ...nextProfile,
      journeyStepProgress: {
        ...nextProfile.journeyStepProgress,
        [journey.id]: [...completedStepIds],
      },
    }
  }

  // Pass 3: mark complete any journey that is both start-ready AND step-complete.
  // Two firing points converge here: pass 2 (last step just landed) and pass 1
  // (gate just opened on a journey whose steps were all already done — the Jay
  // / MMC / gravitySurfing path without a prior USC accept).
  for (const journey of JOURNEY_DEFINITIONS) {
    if (isJourneyComplete(nextProfile, journey.id)) continue
    if (!isJourneyStartReady(nextProfile, journey)) continue
    const completedStepIds = new Set(getCompletedStepIds(nextProfile, journey.id))
    const journeyComplete = journey.steps.every((step) => completedStepIds.has(step.id))
    if (!journeyComplete) continue

    completedJourneyIds.push(journey.id)
    nextProfile = {
      ...nextProfile,
      completedJourneyIds: uniqueStrings([...nextProfile.completedJourneyIds, journey.id]),
      unlockedFeatureIds: uniqueStrings([...nextProfile.unlockedFeatureIds, ...journey.unlocks]),
    }
    unlockedFeatureIds.push(...journey.unlocks)
    changed = true
  }

  return {
    profile: nextProfile,
    changed,
    completedJourneyIds,
    unlockedFeatureIds: uniqueStrings(unlockedFeatureIds) as JourneyFeatureId[],
    newlyStartReadyJourneyIds,
  }
}

/** Build the HUD tracker payload for the first incomplete journey, if any remain. */
export function buildActiveJourneyTracker(profile: PlayerProfile): JourneyTrackerState | null {
  const activeJourney = JOURNEY_DEFINITIONS.find(
    (journey) => !isJourneyComplete(profile, journey.id) && isJourneyStartReady(profile, journey),
  )
  if (!activeJourney) return null

  const completedStepIds = new Set(getCompletedStepIds(profile, activeJourney.id))
  let foundActive = false
  const steps: JourneyTrackerStep[] = activeJourney.steps.map((step) => {
    const complete = completedStepIds.has(step.id)
    const active = !complete && !foundActive
    if (active) foundActive = true
    return {
      label: step.label,
      complete,
      active,
    }
  })

  return {
    eyebrow: activeJourney.eyebrow,
    title: activeJourney.title,
    objectives: [
      {
        id: activeJourney.id,
        label: activeJourney.objectiveLabel,
        complete: steps.every((step) => step.complete),
        steps,
      },
    ],
  }
}

/** Return the next visible step label for the active journey, if one remains. */
export function getActiveJourneyNextStepLabel(profile: PlayerProfile): string | null {
  const activeJourney = JOURNEY_DEFINITIONS.find(
    (journey) => !isJourneyComplete(profile, journey.id) && isJourneyStartReady(profile, journey),
  )
  if (!activeJourney) return null
  const completedStepIds = new Set(getCompletedStepIds(profile, activeJourney.id))
  const nextStep = activeJourney.steps.find((step) => !completedStepIds.has(step.id))
  return nextStep?.label ?? null
}
