/**
 * Tests for the jovian-society-prospection contract: schema parses, end-to-end
 * walkability with stub events, and per-outcome arm dispatch.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/specs/2026-04-29-jovian-contract-schema-parity-design.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import jovianRaw from '@/data/contracts/jovian-society-prospection.json'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type {
  ChoiceMissionStep,
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
} from '../contractTypes'
import type { ContractStepActivatedPayload } from '../ContractSystem'

const jovian = jovianRaw as Contract

function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

const mining: MissionCompletedEvent = {
  kind: 'mining',
  giverPlanetId: 'jupiter',
  giverId: null,
  targetPlanetId: null,
  objectiveType: 'mining',
}

const asteroidGather: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: 'jupiter',
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'gather',
}

const hektorPhotometryEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'photometry',
  region: 'jovian-trojans',
  pinnedAssetRef: 'hektor',
  specialMissionId: 'jovian-prospection-hektor-photometry',
}

const saturnPhotometryEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'photometry',
  region: 'saturn-trojans',
  specialMissionId: 'jovian-prospection-saturn-photometry',
}

const hektorDanEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'dan',
  region: 'jovian-trojans',
  pinnedAssetRef: 'hektor',
  specialMissionId: 'jovian-prospection-hektor-dan',
}

const saturnDanEvent: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jovian-society',
  targetPlanetId: null,
  objectiveType: 'dan',
  region: 'saturn-trojans',
  specialMissionId: 'jovian-prospection-saturn-dan',
}

describe('jovian-society-prospection schema', () => {
  it('parses with 9 steps, completionByOutcome, and pinnedAssets', () => {
    expect(jovian.id).toBe('jovian-society-prospection')
    expect(jovian.steps.length).toBe(9)
    expect(jovian.completionByOutcome).toBeTruthy()
    expect(jovian.completionByOutcome?.transmit).toBeTruthy()
    expect(jovian.completionByOutcome?.tamper).toBeTruthy()
    expect(jovian.pinnedAssets?.[0]?.assetRef).toBe('hektor')
  })

  it('step 9 is a choice-mission with two outcomes', () => {
    const step = jovian.steps[8] as ChoiceMissionStep
    expect(step.kind).toBe('choice-mission')
    expect(step.missionId).toBe('jovian_final_prospectus')
    expect(step.outcomes.map((o) => o.outcomeId)).toEqual(['transmit', 'tamper'])
  })
})

describe('jovian-society-prospection walkability', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function buildSystem() {
    const messages = new MessageSystem([], emptyMessageStore())
    const granted: RewardEffect[] = []
    const completed: string[] = []
    const contracts = new ContractSystem([jovian], messages, inMemoryPersistence(), {
      onRewardGranted: (effect) => granted.push(effect),
      onContractCompleted: (id) => completed.push(id),
    })
    contracts.resetForTests()
    contracts.offerForTests(jovian.id)
    contracts.acceptContract(jovian.id)
    return { contracts, granted, completed }
  }

  function driveToChoice(contracts: ContractSystem) {
    // Step 1 (OP 1): asteroid + gather
    contracts.notifyMissionCompleted(asteroidGather)
    // Step 2 (OP 2): mining + Jupiter board
    contracts.notifyMissionCompleted(mining)
    // Step 3 (OP 3): collect-drops 3 viroid-psychosphere
    for (let i = 0; i < 3; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 4 (OP 4): special mission, Hektor photometry
    contracts.notifyMissionCompleted(hektorPhotometryEvent)
    // Step 5 (OP 5): special mission, Saturn photometry
    contracts.notifyMissionCompleted(saturnPhotometryEvent)
    // Step 6 (OP 6): collect-drops 8
    for (let i = 0; i < 8; i++) {
      contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    }
    // Step 7 (OP 7): special mission, Hektor DAN
    contracts.notifyMissionCompleted(hektorDanEvent)
    // Step 8 (OP 8): special mission, Saturn DAN
    contracts.notifyMissionCompleted(saturnDanEvent)
  }

  it('drives transmit arm end-to-end', () => {
    const { contracts, granted, completed } = buildSystem()
    driveToChoice(contracts)
    const inst = contracts.getInstance(jovian.id)
    expect(inst?.currentStepIndex).toBe(8)
    const ok = contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
    expect(ok).toBe(true)
    expect(contracts.getInstance(jovian.id)?.status).toBe('completed')
    expect(contracts.getInstance(jovian.id)?.resolvedOutcomeId).toBe('transmit')
    expect(completed).toContain(jovian.id)
    const types = granted.map((e) => e.type)
    expect(types).toContain('shuttle-buff')
    expect(types).toContain('set-body-access')
    expect(types).toContain('mission-pay-multiplier')
  })

  it('drives tamper arm end-to-end', () => {
    const { contracts, granted } = buildSystem()
    driveToChoice(contracts)
    const ok = contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    expect(ok).toBe(true)
    expect(contracts.getInstance(jovian.id)?.status).toBe('completed')
    expect(contracts.getInstance(jovian.id)?.resolvedOutcomeId).toBe('tamper')
    const types = granted.map((e) => e.type)
    expect(types).toContain('disable-giver')
    expect(types).toContain('set-body-access')
    expect(types).not.toContain('shuttle-buff')
    expect(types).not.toContain('mission-pay-multiplier')
  })

  it('per-outcome creditsReward fires through onChoiceOutcomeResolved', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const credits: number[] = []
    const contracts = new ContractSystem([jovian], messages, inMemoryPersistence(), {
      onChoiceOutcomeResolved: (p) => credits.push(p.creditsReward),
    })
    contracts.resetForTests()
    contracts.offerForTests(jovian.id)
    contracts.acceptContract(jovian.id)
    driveToChoice(contracts)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'transmit')
    expect(credits).toEqual([5000])
  })

  it('survives serialize → deserialize round trip', () => {
    const { contracts } = buildSystem()
    driveToChoice(contracts)
    contracts.notifyChoiceResolved('jovian_final_prospectus', 'tamper')
    const inst = contracts.getInstance(jovian.id)
    const json = JSON.stringify({ instances: { [jovian.id]: inst } })
    const parsed = JSON.parse(json) as {
      instances: Record<string, { resolvedOutcomeId: string | null; status: string }>
    }
    expect(parsed.instances[jovian.id]?.resolvedOutcomeId).toBe('tamper')
    expect(parsed.instances[jovian.id]?.status).toBe('completed')
  })
})

describe('jovian-society-prospection step activation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('emits specialMissionId on activation of step 9 (choice-mission)', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([jovian], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests(jovian.id)
    contracts.acceptContract(jovian.id)
    for (let i = 0; i < 8; i++) contracts.advanceStepForTests(jovian.id)
    const last = events[events.length - 1]
    expect(last?.stepIndex).toBe(8)
    expect(last?.specialMissionId).toBe('jovian-prospection-hektor-prospectus')
  })
})
