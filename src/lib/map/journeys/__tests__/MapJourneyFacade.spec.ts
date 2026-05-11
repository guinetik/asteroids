import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MapJourneyFacade,
  type MapJourneyCallbacks,
  type MapJourneyFacadeDeps,
} from '../MapJourneyFacade'
import { createProfile } from '@/lib/player/profile'
import {
  ACT_1_JOURNEY_ID,
  ACT_2_JOURNEY_ID,
  WELCOME_JOURNEY_ID,
} from '@/lib/journeys'
import type { PlayerProfile } from '@/lib/player/types'

/** Profile with the welcome journey completed + announced so the tracker is quiet. */
function quietProfile(): PlayerProfile {
  const base = createProfile('Test')
  return {
    ...base,
    completedJourneyIds: [WELCOME_JOURNEY_ID, ACT_1_JOURNEY_ID],
    announcedJourneyStartIds: [WELCOME_JOURNEY_ID, ACT_1_JOURNEY_ID],
  }
}

function buildFacade(initial: PlayerProfile = quietProfile()) {
  let profile = initial
  const persistProfile = vi.fn()
  const setTutorialMessagesUnlocked = vi.fn()
  const notifyContractJourneyCompleted = vi.fn()
  const callbacks: MapJourneyCallbacks = {
    onJourneyTracker: vi.fn(),
    onJourneyTrackerVisible: vi.fn(),
    onJourneyCompletedAnnouncement: vi.fn(),
    onJourneyStartedAnnouncement: vi.fn(),
  }
  const deps: MapJourneyFacadeDeps = {
    getProfile: () => profile,
    setProfile: (next: PlayerProfile) => {
      profile = next
    },
    persistProfile,
    setTutorialMessagesUnlocked,
    notifyContractJourneyCompleted,
    callbacks,
  }
  const facade = new MapJourneyFacade()
  facade.attach(deps)
  return {
    facade,
    deps,
    callbacks,
    persistProfile,
    setTutorialMessagesUnlocked,
    getProfile: () => profile,
  }
}

describe('MapJourneyFacade.armUiFromHabitatEntry', () => {
  it('flips armed from false to true on first call', () => {
    const { facade } = buildFacade()
    expect(facade.armed).toBe(false)
    facade.armUiFromHabitatEntry()
    expect(facade.armed).toBe(true)
  })

  it('is idempotent on repeat calls', () => {
    const { facade, callbacks } = buildFacade()
    facade.armUiFromHabitatEntry()
    facade.armUiFromHabitatEntry()
    // Should only invoke tryAnnounceNextStart once's tracker-visible side effect.
    // Without pending journeys, visibility flips once per arm.
    expect((callbacks.onJourneyTrackerVisible as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      1,
    )
  })
})

describe('MapJourneyFacade.tryAnnounceNextStart', () => {
  let ctx: ReturnType<typeof buildFacade>

  beforeEach(() => {
    ctx = buildFacade()
  })

  it('no-ops when UI is not armed', () => {
    ctx.facade.tryAnnounceNextStart()
    expect(ctx.callbacks.onJourneyTrackerVisible).not.toHaveBeenCalled()
    expect(ctx.callbacks.onJourneyStartedAnnouncement).not.toHaveBeenCalled()
  })

  it('reveals the tracker without firing a banner when nothing is pending', () => {
    ctx.facade.armed = true
    ctx.facade.tryAnnounceNextStart()
    expect(ctx.callbacks.onJourneyTrackerVisible).toHaveBeenCalledWith(true)
    expect(ctx.callbacks.onJourneyStartedAnnouncement).not.toHaveBeenCalled()
  })
})

describe('MapJourneyFacade.canLeaveHabitat', () => {
  it('returns true when no active journey has a next step', () => {
    const { facade } = buildFacade()
    expect(facade.canLeaveHabitat()).toBe(true)
  })

  it('blocks exit during onboarding when a non-terminal welcome step is pending', () => {
    const base = createProfile('Onboarding')
    const profile: PlayerProfile = {
      ...base,
      // Welcome NOT in completedJourneyIds → still active.
      completedJourneyIds: [],
      // No completed steps → next label = 'Read the message from Marta'.
      journeyStepProgress: { ...base.journeyStepProgress, [WELCOME_JOURNEY_ID]: [] },
    }
    const { facade } = buildFacade(profile)
    expect(facade.canLeaveHabitat()).toBe(false)
  })

  it('allows exit while on Act 2 even if its next step is mid-arc (regression)', () => {
    const base = createProfile('Act2Player')
    const profile: PlayerProfile = {
      ...base,
      completedJourneyIds: [WELCOME_JOURNEY_ID, ACT_1_JOURNEY_ID],
      announcedJourneyStartIds: [
        WELCOME_JOURNEY_ID,
        ACT_1_JOURNEY_ID,
        ACT_2_JOURNEY_ID,
      ],
      // Act 2 is start-ready but no steps complete → next label is something like
      // "Complete Venusian Zeppelin Trade Loop", which is NOT 'Leave the Habitat'.
      journeyStartReadyIds: [ACT_2_JOURNEY_ID],
    }
    const { facade } = buildFacade(profile)
    expect(facade.canLeaveHabitat()).toBe(true)
  })
})

describe('MapJourneyFacade.buildLeaveBlockedPrompt', () => {
  it('returns null when there is no active step label', () => {
    const { facade } = buildFacade()
    expect(facade.buildLeaveBlockedPrompt()).toBeNull()
  })

  it('returns null on a post-welcome journey even if a step is pending (regression)', () => {
    const base = createProfile('Act2Player')
    const profile: PlayerProfile = {
      ...base,
      completedJourneyIds: [WELCOME_JOURNEY_ID, ACT_1_JOURNEY_ID],
      announcedJourneyStartIds: [
        WELCOME_JOURNEY_ID,
        ACT_1_JOURNEY_ID,
        ACT_2_JOURNEY_ID,
      ],
      journeyStartReadyIds: [ACT_2_JOURNEY_ID],
    }
    const { facade } = buildFacade(profile)
    expect(facade.buildLeaveBlockedPrompt()).toBeNull()
  })

  it('still surfaces an onboarding step in the blocked prompt', () => {
    const base = createProfile('Onboarding')
    const profile: PlayerProfile = {
      ...base,
      completedJourneyIds: [],
      journeyStepProgress: { ...base.journeyStepProgress, [WELCOME_JOURNEY_ID]: [] },
    }
    const { facade } = buildFacade(profile)
    expect(facade.buildLeaveBlockedPrompt()).toBe(
      'Complete Journey first: Read the message from Marta',
    )
  })
})

describe('MapJourneyFacade.emitTracker', () => {
  it('forwards buildActiveJourneyTracker output to the HUD callback', () => {
    const { facade, callbacks } = buildFacade()
    facade.emitTracker()
    expect(callbacks.onJourneyTracker).toHaveBeenCalled()
  })
})

describe('MapJourneyFacade.dispose', () => {
  it('clears pending interlude timers and detaches deps', () => {
    const { facade, callbacks } = buildFacade()
    facade.armed = true
    facade.hideTrackerAndScheduleNextStart()
    facade.dispose()
    // After dispose, new triggers are no-ops (no deps).
    ;(callbacks.onJourneyTracker as ReturnType<typeof vi.fn>).mockClear()
    facade.emitTracker()
    expect(callbacks.onJourneyTracker).not.toHaveBeenCalled()
  })
})

describe('MapJourneyFacade.notifyTrigger', () => {
  it('is a no-op when no deps are attached', () => {
    const facade = new MapJourneyFacade()
    expect(() => facade.notifyTrigger('left_habitat')).not.toThrow()
  })

  it('is a no-op when the trigger produces no profile change', () => {
    const { facade, persistProfile, callbacks } = buildFacade()
    // An unknown/unused trigger type still returns changed=false from applyJourneyTrigger.
    facade.notifyTrigger('bought_shuttle_fuel')
    expect(persistProfile).not.toHaveBeenCalled()
    expect(callbacks.onJourneyTracker).not.toHaveBeenCalled()
  })
})
