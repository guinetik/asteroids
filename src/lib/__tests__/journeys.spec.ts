import { describe, expect, it } from 'vitest'
import type { PlayerProfile } from '../player/types'
import { createProfile } from '../player/profile'
import {
  applyJourneyTrigger,
  ACT_3_JOURNEY_ID,
  buildActiveJourneyTracker,
  isJourneyFeatureUnlocked,
} from '../journeys'

/** Welcome journey checked off — next visible arc is ordinarily Act I. */
function profileAfterWelcomeComplete(profile: PlayerProfile = createProfile('Pilot')) {
  let p = profile
  p = applyJourneyTrigger(p, 'message_archived:seller-welcome-earth-orbit').profile
  p = applyJourneyTrigger(p, 'message_archived:jay-so-you-actually-did-it').profile
  p = applyJourneyTrigger(p, 'shuttle_control_opened').profile
  p = applyJourneyTrigger(p, 'shuttle_program_opened').profile
  p = applyJourneyTrigger(p, 'lander_program_opened').profile
  p = applyJourneyTrigger(p, 'inventory_opened').profile
  p = applyJourneyTrigger(p, 'upgrades_opened').profile
  p = applyJourneyTrigger(p, 'accepted_asteroid_mission').profile
  p = applyJourneyTrigger(p, 'accepted_eva_mission').profile
  p = applyJourneyTrigger(p, 'bought_shuttle_fuel').profile
  return applyJourneyTrigger(p, 'left_habitat').profile
}

/** Act I is visible (`usc` accepted) but its contracts + manifold step are unfinished. */
function profileMidAct1(profile: PlayerProfile = createProfile('Pilot')) {
  let p = profileAfterWelcomeComplete(profile)
  p = applyJourneyTrigger(p, 'contract_accepted:usc-venus-certification').profile
  return p
}

/**
 * Walk Welcome and Act I through completion so subsequent tests only observe Act II gating.
 *
 * @param profile - Seed profile from {@link createProfile}.
 * @returns Profile with `welcome` + `act-1-inner-system` in completed journey ids.
 */
function profileAfterAct1Complete(profile: PlayerProfile = createProfile('Pilot')) {
  let p = profile
  p = applyJourneyTrigger(p, 'message_archived:seller-welcome-earth-orbit').profile
  p = applyJourneyTrigger(p, 'message_archived:jay-so-you-actually-did-it').profile
  p = applyJourneyTrigger(p, 'shuttle_control_opened').profile
  p = applyJourneyTrigger(p, 'shuttle_program_opened').profile
  p = applyJourneyTrigger(p, 'lander_program_opened').profile
  p = applyJourneyTrigger(p, 'inventory_opened').profile
  p = applyJourneyTrigger(p, 'upgrades_opened').profile
  p = applyJourneyTrigger(p, 'accepted_asteroid_mission').profile
  p = applyJourneyTrigger(p, 'accepted_eva_mission').profile
  p = applyJourneyTrigger(p, 'bought_shuttle_fuel').profile
  p = applyJourneyTrigger(p, 'left_habitat').profile
  p = applyJourneyTrigger(p, 'contract_accepted:usc-venus-certification').profile
  p = applyJourneyTrigger(p, 'contract_completed:usc-venus-certification').profile
  p = applyJourneyTrigger(p, 'contract_completed:space-cowboys-mars-hq').profile
  p = applyJourneyTrigger(p, 'contract_completed:martian-marine-corps-cohort').profile
  return applyJourneyTrigger(p, 'orbital_surf_completed').profile
}

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
    // Act 1 is gated behind `contract_accepted:usc-venus-certification`, so
    // after welcome completes the HUD stays silent until the USC contract
    // is accepted.
    expect(buildActiveJourneyTracker(profile)).toBeNull()
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

  it('accepts first_orbit triggers with no matching authored start gate', () => {
    const profile = createProfile('Pilot')
    const result = applyJourneyTrigger(profile, 'first_orbit:pluto')
    expect(result.changed).toBe(false)
  })
})

describe('act-1-inner-system journey', () => {
  it('is hidden from the tracker until the USC contract is accepted, even after welcome completes', () => {
    let profile = createProfile('Pilot')

    // Walk Welcome to completion so no journey is "active" in the old sense.
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

    // Tracker must be null — Act 1 is gated behind the USC accept trigger.
    expect(buildActiveJourneyTracker(profile)).toBeNull()

    // Accepting USC opens the gate and Act 1 becomes the active tracker.
    const acceptResult = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification')
    expect(acceptResult.newlyStartReadyJourneyIds).toContain('act-1-inner-system')
    profile = acceptResult.profile
    expect(buildActiveJourneyTracker(profile)?.title).toBe('Inner System')
  })

  it('records step progress for Act 1 even before the USC accept gate opens, and shows it ticked on gate open', () => {
    let profile = createProfile('Pilot')

    // Walk Welcome to completion so the only incomplete journey is Act 1.
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

    // Player completes Jay's contract before ever accepting USC.
    const jayCompletion = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq')
    expect(jayCompletion.changed).toBe(true)
    profile = jayCompletion.profile
    expect(profile.journeyStepProgress['act-1-inner-system']).toContain('cowboys-hq')

    // But Act 1 is still hidden from the HUD tracker until the gate opens.
    expect(buildActiveJourneyTracker(profile)).toBeNull()

    // Accepting USC opens the gate. Act 1 appears with Jay's step already ticked.
    profile = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification').profile
    const tracker = buildActiveJourneyTracker(profile)
    expect(tracker?.title).toBe('Inner System')
    const cowboysStep = tracker?.objectives[0]?.steps[1]
    expect(cowboysStep?.label).toBe('Complete Space Cowboys Mars HQ')
    expect(cowboysStep?.complete).toBe(true)
  })

  it('does not mark Act 1 complete until its start gate is open, even if every step has already fired', () => {
    let profile = createProfile('Pilot')

    // Fire every Act 1 step trigger before the gate is open.
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    profile = applyJourneyTrigger(profile, 'orbital_surf_completed').profile

    expect(profile.completedJourneyIds).not.toContain('act-1-inner-system')

    // Opening the gate now completes Act 1 in a single call — the third pass
    // detects start-ready + step-complete and fires the completion + unlocks.
    const result = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification')
    expect(result.completedJourneyIds).toContain('act-1-inner-system')
  })

  it('completes when all three contracts are done and the player finishes an orbital surf', () => {
    let profile = createProfile('Pilot')

    // Walk Welcome to completion so Act 1 becomes the only incomplete journey,
    // then open its gate via contract_accepted.
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

    profile = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification').profile

    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile

    // Before the orbital surf, Act 1 is active with step 4 pending.
    const beforeInstall = buildActiveJourneyTracker(profile)
    expect(beforeInstall?.title).toBe('Inner System')
    const step4 = beforeInstall?.objectives[0]?.steps[3]
    expect(step4?.label).toBe('Complete an orbital surf (manifold highway)')
    expect(step4?.active).toBe(true)
    expect(step4?.complete).toBe(false)

    profile = applyJourneyTrigger(profile, 'orbital_surf_completed').profile

    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
    expect(buildActiveJourneyTracker(profile)).toBeNull()
  })

  it('is insensitive to the order the three contracts complete in', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'orbital_surf_completed').profile
    expect(profile.completedJourneyIds).toContain('act-1-inner-system')
  })

  it('does not tick step 4 on a non-orbital-surf trigger', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:space-cowboys-mars-hq').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:martian-marine-corps-cohort').profile
    const installResult = applyJourneyTrigger(profile, 'upgrade_installed:shuttleHull')
    expect(installResult.changed).toBe(false)
    expect(installResult.profile.completedJourneyIds).not.toContain('act-1-inner-system')

    const gravityResult = applyJourneyTrigger(profile, 'upgrade_installed:gravitySurfing')
    expect(gravityResult.changed).toBe(false)
    expect(gravityResult.profile.completedJourneyIds).not.toContain('act-1-inner-system')
  })

  it('is idempotent — re-firing the same trigger does not double-advance', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'contract_accepted:usc-venus-certification').profile
    const first = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    profile = first.profile
    const second = applyJourneyTrigger(profile, 'contract_completed:usc-venus-certification')
    expect(second.changed).toBe(false)
  })
})

describe('act-2-jovian-arrival journey', () => {
  it('persists Jupiter first-orbit for later but keeps Act II HUD-gated until Act I completes', () => {
    let profile = profileMidAct1()
    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    expect(profile.journeyStartReadyIds).toContain('act-2-jovian-arrival')
    const tracker = buildActiveJourneyTracker(profile)
    expect(tracker?.title).toBe('Inner System')

    profile = profileAfterAct1Complete(profile)
    expect(buildActiveJourneyTracker(profile)?.title).toBe('Jovian Arrival')
  })

  it('is hidden until first_orbit:jupiter even when contract steps have fired', () => {
    let profile = profileAfterAct1Complete()
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    expect(profile.journeyStepProgress['act-2-jovian-arrival']).toBeDefined()
    expect(buildActiveJourneyTracker(profile)).toBeNull()

    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    expect(profile.journeyStartReadyIds).toContain('act-2-jovian-arrival')
    const tracker = buildActiveJourneyTracker(profile)
    expect(tracker?.title).toBe('Jovian Arrival')
    const zeppelin = tracker?.objectives[0]?.steps[0]
    expect(zeppelin?.complete).toBe(true)
  })

  it('completes instantly when all contracts finished before the Jupiter gate opens', () => {
    let profile = profileAfterAct1Complete()
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    profile = applyJourneyTrigger(profile, 'contract_completed:jovian-society-prospection').profile
    expect(profile.completedJourneyIds).not.toContain('act-2-jovian-arrival')

    const result = applyJourneyTrigger(profile, 'first_orbit:jupiter')
    expect(result.completedJourneyIds).toContain('act-2-jovian-arrival')
  })

  it('completes when the last contract closes after the gate is open', () => {
    let profile = profileAfterAct1Complete()
    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    profile = applyJourneyTrigger(profile, 'contract_completed:jovian-society-prospection').profile
    expect(profile.completedJourneyIds).toContain('act-2-jovian-arrival')
  })

  it('is insensitive to contract completion order once the gate is open', () => {
    let profile = profileAfterAct1Complete()
    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    profile = applyJourneyTrigger(profile, 'contract_completed:jovian-society-prospection').profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    expect(profile.completedJourneyIds).toContain('act-2-jovian-arrival')
  })
})

describe('act-3-outer-reaches journey', () => {
  it('persists Saturn first-orbit gate but completes only once Acts I and II finish', () => {
    let profile = applyJourneyTrigger(createProfile('Pilot'), 'first_orbit:saturn').profile
    expect(profile.journeyStartReadyIds).toContain(ACT_3_JOURNEY_ID)
    expect(profile.completedJourneyIds).not.toContain(ACT_3_JOURNEY_ID)

    profile = profileAfterAct1Complete(profile)
    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    profile = applyJourneyTrigger(profile, 'contract_completed:jovian-society-prospection').profile
    expect(profile.completedJourneyIds).toContain(ACT_3_JOURNEY_ID)
  })

  it('completes Act III on the trigger that wraps Act II if Saturn orbit was logged earlier', () => {
    let profile = createProfile('Pilot')
    profile = applyJourneyTrigger(profile, 'first_orbit:saturn').profile
    profile = profileAfterAct1Complete(profile)
    profile = applyJourneyTrigger(profile, 'first_orbit:jupiter').profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:venusian-zeppelin-trade-loop',
    ).profile
    profile = applyJourneyTrigger(
      profile,
      'contract_completed:cinderline-mercury-consecration',
    ).profile
    expect(profile.completedJourneyIds).not.toContain(ACT_3_JOURNEY_ID)

    profile = applyJourneyTrigger(profile, 'contract_completed:jovian-society-prospection').profile
    expect(profile.completedJourneyIds).toContain(ACT_3_JOURNEY_ID)
  })
})
