import { describe, expect, it } from 'vitest'
import { createProfile } from '../player/profile'
import {
  applyJourneyTrigger,
  buildActiveJourneyTracker,
  isJourneyFeatureUnlocked,
} from '../journeys'

describe('journeys', () => {
  it('tracks the welcome journey and unlocks slingshot on completion', () => {
    let profile = createProfile('Pilot')

    profile = applyJourneyTrigger(profile, 'message_archived:seller-welcome-earth-orbit').profile
    profile = applyJourneyTrigger(profile, 'message_archived:jay-so-you-actually-did-it').profile
    profile = applyJourneyTrigger(profile, 'shuttle_control_opened').profile
    profile = applyJourneyTrigger(profile, 'shuttle_program_opened').profile
    profile = applyJourneyTrigger(profile, 'lander_program_opened').profile
    profile = applyJourneyTrigger(profile, 'bought_shuttle_fuel').profile
    profile = applyJourneyTrigger(profile, 'inventory_opened').profile
    profile = applyJourneyTrigger(profile, 'upgrades_opened').profile

    const beforeExitTracker = buildActiveJourneyTracker(profile)
    const steps = beforeExitTracker?.objectives[0]?.steps ?? []
    expect(steps[steps.length - 1]?.active).toBe(true)
    expect(isJourneyFeatureUnlocked(profile, 'slingshot')).toBe(false)

    profile = applyJourneyTrigger(profile, 'left_habitat').profile

    expect(buildActiveJourneyTracker(profile)).toBeNull()
    expect(profile.completedJourneyIds).toContain('welcome')
    expect(isJourneyFeatureUnlocked(profile, 'slingshot')).toBe(true)
  })

  it('accepts contract_completed and upgrade_installed triggers without effect when no journey matches', () => {
    let profile = createProfile('Pilot')
    const contractResult = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    expect(contractResult.changed).toBe(false)
    expect(contractResult.completedJourneyIds).toEqual([])
    expect(contractResult.unlockedFeatureIds).toEqual([])
    profile = contractResult.profile
    const upgradeResult = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing')
    expect(upgradeResult.changed).toBe(false)
    expect(upgradeResult.completedJourneyIds).toEqual([])
    expect(upgradeResult.unlockedFeatureIds).toEqual([])
  })
})
