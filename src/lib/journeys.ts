import type { PlayerProfile } from '@/lib/player/types'
import type { UpgradeId } from '@/lib/upgrades'

/** Stable ids for journey definitions persisted on the player profile. */
export type JourneyId = 'welcome' | 'act-1-inner-system'
/** Feature unlock ids granted by completing journeys. */
export type JourneyFeatureId = 'slingshot'
/** Runtime trigger ids that can advance one or more journey steps. */
export type JourneyTriggerId =
  | `message_archived:${string}`
  | `contract_completed:${string}`
  | `upgrade_installed:${UpgradeId}`
  | 'shuttle_control_opened'
  | 'shuttle_program_opened'
  | 'lander_program_opened'
  | 'shop_opened'
  | 'bought_shuttle_fuel'
  | 'inventory_opened'
  | 'upgrades_opened'
  | 'left_habitat'

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
  steps: readonly JourneyStepDefinition[]
}

/** Canonical id for the onboarding journey. */
export const WELCOME_JOURNEY_ID: JourneyId = 'welcome'
/** Canonical id for the Act 1 inner-system arc. */
export const ACT_1_JOURNEY_ID: JourneyId = 'act-1-inner-system'
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
        id: 'buy-shuttle-fuel',
        label: 'Explore the shop and buy some Shuttle Fuel',
        trigger: 'bought_shuttle_fuel',
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
    steps: [
      {
        id: 'usc-cert',
        label: 'Complete USC Venus Certification',
        trigger: 'contract_completed:usc-venus-certification',
      },
      {
        id: 'cowboys-hq',
        label: 'Complete Space Cowboys Mars HQ',
        trigger: 'contract_completed:space-cowboys-mars-hq',
      },
      {
        id: 'mmc-cohort',
        label: 'Complete MMC Turret Cohort',
        trigger: 'contract_completed:martian-marine-corps-cohort',
      },
      {
        id: 'grid-coupling',
        label: 'Install the USC Module',
        trigger: 'upgrade_installed:gravitySurfing',
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

/** Public completion check used by onboarding gates elsewhere in the map flow. */
export function hasCompletedJourney(profile: PlayerProfile, journeyId: JourneyId): boolean {
  return isJourneyComplete(profile, journeyId)
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

    const journeyComplete = journey.steps.every((step) => completedStepIds.has(step.id))
    if (!journeyComplete) continue

    completedJourneyIds.push(journey.id)
    nextProfile = {
      ...nextProfile,
      completedJourneyIds: uniqueStrings([...nextProfile.completedJourneyIds, journey.id]),
      unlockedFeatureIds: uniqueStrings([...nextProfile.unlockedFeatureIds, ...journey.unlocks]),
    }
    unlockedFeatureIds.push(...journey.unlocks)
  }

  return {
    profile: nextProfile,
    changed,
    completedJourneyIds,
    unlockedFeatureIds: uniqueStrings(unlockedFeatureIds) as JourneyFeatureId[],
  }
}

/** Build the HUD tracker payload for the first incomplete journey, if any remain. */
export function buildActiveJourneyTracker(profile: PlayerProfile): JourneyTrackerState | null {
  const activeJourney = JOURNEY_DEFINITIONS.find((journey) => !isJourneyComplete(profile, journey.id))
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
  const activeJourney = JOURNEY_DEFINITIONS.find((journey) => !isJourneyComplete(profile, journey.id))
  if (!activeJourney) return null
  const completedStepIds = new Set(getCompletedStepIds(profile, activeJourney.id))
  const nextStep = activeJourney.steps.find((step) => !completedStepIds.has(step.id))
  return nextStep?.label ?? null
}
