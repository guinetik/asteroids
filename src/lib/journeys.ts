import type { PlayerProfile } from '@/lib/player/types'

export type JourneyId = 'welcome'
export type JourneyFeatureId = 'slingshot'
export type JourneyTriggerId =
  | `message_archived:${string}`
  | 'shuttle_control_opened'
  | 'shuttle_program_opened'
  | 'lander_program_opened'
  | 'shop_opened'
  | 'bought_shuttle_fuel'
  | 'inventory_opened'
  | 'upgrades_opened'
  | 'left_habitat'

export interface JourneyTrackerStepProgress {
  current: number
  target: number
  unit: string
}

export interface JourneyTrackerStep {
  label: string
  complete: boolean
  active: boolean
  progress?: JourneyTrackerStepProgress
}

export interface JourneyTrackerEntry {
  id: string
  label: string
  complete: boolean
  steps: readonly JourneyTrackerStep[]
}

export interface JourneyTrackerState {
  eyebrow: string
  title: string
  objectives: JourneyTrackerEntry[]
}

interface JourneyStepDefinition {
  id: string
  label: string
  trigger: JourneyTriggerId
}

interface JourneyDefinition {
  id: JourneyId
  eyebrow: string
  title: string
  objectiveLabel: string
  unlocks: readonly JourneyFeatureId[]
  steps: readonly JourneyStepDefinition[]
}

export const WELCOME_JOURNEY_ID: JourneyId = 'welcome'
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
]

export interface ApplyJourneyTriggerResult {
  profile: PlayerProfile
  changed: boolean
  completedJourneyIds: JourneyId[]
  unlockedFeatureIds: JourneyFeatureId[]
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function getCompletedStepIds(profile: PlayerProfile, journeyId: JourneyId): string[] {
  return uniqueStrings(profile.journeyStepProgress[journeyId] ?? [])
}

function isJourneyComplete(profile: PlayerProfile, journeyId: JourneyId): boolean {
  return profile.completedJourneyIds.includes(journeyId)
}

export function hasCompletedJourney(profile: PlayerProfile, journeyId: JourneyId): boolean {
  return isJourneyComplete(profile, journeyId)
}

export function isJourneyFeatureUnlocked(
  profile: PlayerProfile,
  featureId: JourneyFeatureId,
): boolean {
  return profile.unlockedFeatureIds.includes(featureId)
}

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

export function getActiveJourneyNextStepLabel(profile: PlayerProfile): string | null {
  const activeJourney = JOURNEY_DEFINITIONS.find((journey) => !isJourneyComplete(profile, journey.id))
  if (!activeJourney) return null
  const completedStepIds = new Set(getCompletedStepIds(profile, activeJourney.id))
  const nextStep = activeJourney.steps.find((step) => !completedStepIds.has(step.id))
  return nextStep?.label ?? null
}
