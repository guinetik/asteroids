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
    profile = applyJourneyTrigger(profile, 'inventory_opened').profile
    profile = applyJourneyTrigger(profile, 'upgrades_opened').profile
    profile = applyJourneyTrigger(profile, 'accepted_asteroid_mission').profile
    profile = applyJourneyTrigger(profile, 'accepted_eva_mission').profile
    profile = applyJourneyTrigger(profile, 'bought_shuttle_fuel').profile

    const beforeExitTracker = buildActiveJourneyTracker(profile)
    const steps = beforeExitTracker?.objectives[0]?.steps ?? []
    expect(steps[steps.length - 1]?.active).toBe(true)
    expect(isJourneyFeatureUnlocked(profile, 'slingshot')).toBe(false)

    profile = applyJourneyTrigger(profile, 'left_habitat').profile

    expect(profile.completedJourneyIds).toContain('welcome')
    expect(isJourneyFeatureUnlocked(profile, 'slingshot')).toBe(true)
    // Act 1 becomes the active journey after welcome completes.
    expect(buildActiveJourneyTracker(profile)?.title).toBe('Inner System')
  })

  it('accepts contract_completed and upgrade_installed triggers without effect when no step matches', () => {
    let profile = createProfile('Pilot')
    // Use a contract id and upgrade id that are not referenced by any journey step.
    const contractResult = applyJourneyTrigger(profile, 'contract_completed:unknown-contract-xyz')
    expect(contractResult.changed).toBe(false)
    expect(contractResult.completedJourneyIds).toEqual([])
    expect(contractResult.unlockedFeatureIds).toEqual([])
    profile = contractResult.profile
    const upgradeResult = applyJourneyTrigger(profile, 'upgrade_installed:shuttleHull')
    expect(upgradeResult.changed).toBe(false)
    expect(upgradeResult.completedJourneyIds).toEqual([])
    expect(upgradeResult.unlockedFeatureIds).toEqual([])
  })
})

describe('act-1-inner-system journey', () => {
  it('completes when all three contracts are done and gravitySurfing installs', () => {
    let profile = createProfile('Pilot')

    // Mark welcome as complete so Act 1 becomes the active journey in the tracker.
    profile = applyJourneyTrigger(profile, 'message_archived:seller-welcome-earth-orbit').profile
    profile = applyJourneyTrigger(profile, 'message_archived:jay-so-you-actually-did-it').profile
    profile = applyJourneyTrigger(profile, 'shuttle_control_opened').profile
    profile = applyJourneyTrigger(profile, 'shuttle_program_opened').profile
    profile = applyJourneyTrigger(profile, 'lander_program_opened').profile
    profile = applyJourneyTrigger(profile, 'inventory_opened').profile
    profile = applyJourneyTrigger(profile, 'upgrades_opened').profile
    profile = applyJourneyTrigger(profile, 'accepted_asteroid_mission').profile
    profile = applyJourneyTrigger(profile, 'accepted_eva_mission').profile
    profile = applyJourneyTrigger(profile, 'bought_shuttle_fuel').profile
    profile = applyJourneyTrigger(profile, 'left_habitat').profile

    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile

    // Before the final upgrade install, Act 1 is active with step 4 pending.
    const beforeInstall = buildActiveJourneyTracker(profile)
    expect(beforeInstall?.title).toBe('Inner System')
    const step4 = beforeInstall?.objectives[0]?.steps[3]
    expect(step4?.label).toBe('Install the USC Module')
    expect(step4?.active).toBe(true)
    expect(step4?.complete).toBe(false)

    profile = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing').profile

    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
    expect(buildActiveJourneyTracker(profile)).toBeNull()
  })

  it('is insensitive to the order the three contracts complete in', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing').profile
    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
  })

  it('does not tick step 4 on a non-gravitySurfing install', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    const result = applyJourneyTrigger(profile, 'upgrade_installed:shuttleHull')
    expect(result.changed).toBe(false)
    expect(result.profile.completedJourneyIds).not.toContain('act-1-inner-system')
  })

  it('is idempotent — re-firing the same trigger does not double-advance', () => {
    let profile = createProfile('Pilot')
    const first = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    profile = first.profile
    const second = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    expect(second.changed).toBe(false)
  })
})
