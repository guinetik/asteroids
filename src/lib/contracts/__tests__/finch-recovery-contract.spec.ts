/**
 * Walkthrough test for the Finch Recovery contract: schema parses, the 11-step
 * alternation between `complete-missions` (telescope/bunker) and `visit-planet`
 * gates advances correctly, `revealsBody` fires at the expected stops, and
 * Saturn fast-travel + 2x mission pay multiplier are granted on completion.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/plans/2026-05-04-finch-recovery-contract-loop.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import finchRaw from '@/data/contracts/finch-recovery.json'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type {
  CompleteMissionsStep,
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
  VisitPlanetStep,
} from '../contractTypes'
import type { ContractStepActivatedPayload } from '../ContractSystem'

const finch = finchRaw as Contract

/** Empty in-memory persistence for the message store. */
function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

/** In-memory contract persistence. */
function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

/** Build a `MissionCompletedEvent` for an asteroid special mission with the given id. */
function asteroidSpecial(specialMissionId: string): MissionCompletedEvent {
  return {
    kind: 'asteroid',
    giverPlanetId: null,
    giverId: 'mr-finch',
    targetPlanetId: null,
    objectiveType: 'bunker',
    specialMissionId,
  }
}

/** Build a `MissionCompletedEvent` for an EVA special mission with the given id. */
function evaSpecial(specialMissionId: string): MissionCompletedEvent {
  return {
    kind: 'eva',
    giverPlanetId: null,
    giverId: 'mr-finch',
    targetPlanetId: null,
    specialMissionId,
  }
}

describe('finch-recovery schema', () => {
  it('parses with 11 steps and Saturn home-planet rewards', () => {
    expect(finch.id).toBe('finch-recovery')
    expect(finch.steps.length).toBe(11)
    expect(finch.homePlanet).toBe('saturn')
    expect(finch.rewards).toEqual(
      expect.arrayContaining<RewardEffect>([
        { type: 'fast-travel', planetId: 'saturn' },
        { type: 'mission-pay-multiplier', planetId: 'saturn', multiplier: 2 },
      ]),
    )
  })

  it('alternates complete-missions and visit-planet for stops 2-5', () => {
    // Steps 0,2,4,6,8,10 are complete-missions; 1,3,5,7,9 are visit-planet.
    const missionIndices = [0, 2, 4, 6, 8, 10]
    const visitIndices = [1, 3, 5, 7, 9]
    for (const i of missionIndices) {
      expect(finch.steps[i]?.kind).toBe('complete-missions')
    }
    for (const i of visitIndices) {
      expect(finch.steps[i]?.kind).toBe('visit-planet')
    }
  })

  it('mission steps point at the six special missions in order', () => {
    const specialIds = finch.steps
      .filter((s): s is CompleteMissionsStep => s.kind === 'complete-missions')
      .map((s) => s.specialMissionId)
    expect(specialIds).toEqual([
      'finch-recovery-saturn-telescope',
      'finch-recovery-mars-bunker',
      'finch-recovery-venus-telescope',
      'finch-recovery-earth-telescope',
      'finch-recovery-ceres-bunker',
      'finch-recovery-neptune-bunker',
    ])
  })

  it('visit-planet gates land on Mars, Venus, Earth, Ceres, Neptune in order', () => {
    const planetIds = finch.steps
      .filter((s): s is VisitPlanetStep => s.kind === 'visit-planet')
      .map((s) => s.planetId)
    expect(planetIds).toEqual(['mars', 'venus', 'earth', 'ceres', 'neptune'])
  })
})

describe('finch-recovery walkthrough', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function buildSystem() {
    const messages = new MessageSystem([], emptyMessageStore())
    const granted: RewardEffect[] = []
    const completed: string[] = []
    const stepActivations: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([finch], messages, inMemoryPersistence(), {
      onRewardGranted: (effect) => granted.push(effect),
      onContractCompleted: (id) => completed.push(id),
      onStepActivated: (p) => stepActivations.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests(finch.id)
    contracts.acceptContract(finch.id)
    return { contracts, granted, completed, stepActivations }
  }

  it('emits specialMissionId + revealsBody on Step 1 activation (Saturn telescope reveals Mars)', () => {
    const { stepActivations } = buildSystem()
    const last = stepActivations[stepActivations.length - 1]
    expect(last?.stepIndex).toBe(0)
    expect(last?.specialMissionId).toBe('finch-recovery-saturn-telescope')
    expect(last?.revealsBody).toBe('mars')
  })

  it('drives the entire 11-step loop end-to-end', () => {
    const { contracts, granted, completed } = buildSystem()

    // Step 0: Saturn telescope EVA
    contracts.notifyMissionCompleted(evaSpecial('finch-recovery-saturn-telescope'))
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(1)

    // Step 1: visit Mars
    contracts.notifyPlanetVisited('mars')
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(2)

    // Step 2: Mars bunker
    contracts.notifyMissionCompleted(asteroidSpecial('finch-recovery-mars-bunker'))
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(3)

    // Step 3: visit Venus
    contracts.notifyPlanetVisited('venus')
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(4)

    // Step 4: Venus telescope EVA
    contracts.notifyMissionCompleted(evaSpecial('finch-recovery-venus-telescope'))
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(5)

    // Step 5: visit Earth
    contracts.notifyPlanetVisited('earth')
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(6)

    // Step 6: Earth telescope EVA
    contracts.notifyMissionCompleted(evaSpecial('finch-recovery-earth-telescope'))
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(7)

    // Step 7: visit Ceres
    contracts.notifyPlanetVisited('ceres')
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(8)

    // Step 8: Ceres bunker
    contracts.notifyMissionCompleted(asteroidSpecial('finch-recovery-ceres-bunker'))
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(9)

    // Step 9: visit Neptune
    contracts.notifyPlanetVisited('neptune')
    expect(contracts.getInstance(finch.id)?.currentStepIndex).toBe(10)

    // Step 10: Neptune bunker (final)
    contracts.notifyMissionCompleted(asteroidSpecial('finch-recovery-neptune-bunker'))

    // Contract closed; Saturn rewards granted.
    expect(contracts.getInstance(finch.id)?.status).toBe('completed')
    expect(completed).toContain(finch.id)
    expect(granted).toEqual(
      expect.arrayContaining<RewardEffect>([
        { type: 'fast-travel', planetId: 'saturn' },
        { type: 'mission-pay-multiplier', planetId: 'saturn', multiplier: 2 },
      ]),
    )
  })
})
