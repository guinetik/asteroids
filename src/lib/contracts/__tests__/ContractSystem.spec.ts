/**
 * Unit tests for the ContractSystem state machine.
 *
 * @author guinetik
 * @date 2026-04-20
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem, contractIntroMessageId, contractStepMessageId, contractCompletionMessageId } from '../ContractSystem'
import type { Contract, ContractStoreSnapshot, RewardEffect } from '../contractTypes'
import { emptyContractSnapshot } from '../contractStorage'

const TEST_DATE = '2306-04-05 09:12 UTC'

const cowboysContract: Contract = {
  id: 'space-cowboys-mars-hq',
  inboxName: 'Space Cowboys, Inc.',
  from: 'Jay',
  sentAt: TEST_DATE,
  triggerOnMessageArchived: 'jay-first-slingshot-contracts',
  introSubject: 'Contract — Mars HQ',
  introBody: ['Intro body'],
  steps: [
    {
      kind: 'complete-missions',
      count: 3,
      subject: 'Step 1',
      flavor: ['Step 1 flavor'],
    },
    {
      kind: 'install-upgrade',
      upgradeId: 'shuttleFreezeResistance',
      minLevel: 1,
      subject: 'Step 2',
      flavor: ['Step 2 flavor'],
    },
    {
      kind: 'visit-planet',
      planetId: 'mars',
      subject: 'Step 3',
      flavor: ['Step 3 flavor'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['Completion body'],
  rewards: [{ type: 'fast-travel', planetId: 'mars' }],
}

const uscContract: Contract = {
  id: 'usc-venus-certification',
  inboxName: 'USC',
  from: 'USC',
  sentAt: TEST_DATE,
  triggerOnMissionCompletedNth: 1,
  introSubject: 'USC Offer',
  introBody: ['USC intro'],
  steps: [
    {
      kind: 'complete-missions',
      count: 1,
      missionType: 'eva',
      subject: 'EVA',
      flavor: ['Do an EVA'],
    },
    {
      kind: 'orbital-mission',
      targetPlanetId: 'venus',
      subject: 'Orbital',
      flavor: ['Do orbital at venus'],
    },
  ],
  completionSubject: 'Certified',
  completionBody: ['Certified body'],
  rewards: [
    { type: 'fast-travel', planetId: 'earth' },
    { type: 'mission-pay-multiplier', planetId: 'earth', multiplier: 2 },
  ],
}

const mmcPrereqContract: Contract = {
  id: 'martian-marine-corps-cohort',
  inboxName: 'MMC',
  from: 'MMC',
  sentAt: TEST_DATE,
  offerWhenPrerequisites: {
    requiredCompletedContractId: 'space-cowboys-mars-hq',
    minGiverPlanetCompletions: { planetId: 'mars', min: 1 },
  },
  introSubject: 'MMC',
  introBody: ['intro'],
  steps: [
    {
      kind: 'complete-missions',
      count: 1,
      missionType: 'mining',
      giverId: 'martian-marines',
      subject: 'Mine',
      flavor: ['a'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['b'],
  rewards: [
    { type: 'mission-pay-multiplier', planetId: 'mars', multiplier: 2 },
    { type: 'shuttle-upgrade', upgradeId: 'orbitalSurfing', minLevel: 1 },
  ],
}

const triggerMessage = {
  id: 'jay-first-slingshot-contracts',
  from: 'Jay',
  subject: 'Slingshot',
  sentAt: TEST_DATE,
  body: ['Trigger body'],
  trigger: 'map_first_slingshot' as const,
  delivery: 'inbox_prompt' as const,
  priority: 50,
}

interface Harness {
  contracts: ContractSystem
  messages: MessageSystem
  snapshot: ContractStoreSnapshot
  granted: RewardEffect[]
}

function createHarness(
  contractList: Contract[] = [cowboysContract, uscContract],
  initial: ContractStoreSnapshot = emptyContractSnapshot(),
): Harness {
  const snapshot: ContractStoreSnapshot = {
    ...initial,
    instances: { ...initial.instances },
    giverPlanetCompletions: { ...initial.giverPlanetCompletions },
  }
  const granted: RewardEffect[] = []

  const messages = new MessageSystem(
    [triggerMessage],
    {
      load: () => ({}),
      save: () => {},
    },
  )

  const contracts = new ContractSystem(
    contractList,
    messages,
    {
      load: () => snapshot,
      save: (next) => {
        snapshot.instances = next.instances
        snapshot.observedMissionCompletions = next.observedMissionCompletions
        snapshot.giverPlanetCompletions = { ...next.giverPlanetCompletions }
        snapshot.version = next.version
      },
    },
    {
      onContractsChanged: () => {},
      onRewardGranted: (effect) => granted.push(effect),
    },
  )

  return { contracts, messages, snapshot, granted }
}

describe('ContractSystem.notifyMessageArchived', () => {
  it('offers a contract when its trigger message is archived', () => {
    const { contracts, messages } = createHarness()
    messages.notifyTrigger('map_first_slingshot')
    messages.dismiss(triggerMessage.id)

    contracts.notifyMessageArchived(triggerMessage.id)

    const instance = contracts.getInstance(cowboysContract.id)
    expect(instance?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(cowboysContract.id))).toMatchObject({
      status: 'pending',
    })
  })

  it('does not double-offer the same contract on a second archive', () => {
    const { contracts } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    const first = contracts.getInstance(cowboysContract.id)
    contracts.notifyMessageArchived(triggerMessage.id)
    const second = contracts.getInstance(cowboysContract.id)
    expect(second?.offeredAt).toBe(first?.offeredAt)
  })
})

describe('ContractSystem.notifyMissionCompletedNth trigger', () => {
  it('offers the USC contract on the first mission completion', () => {
    const { contracts, messages } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(uscContract.id)?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(uscContract.id))).toMatchObject({
      status: 'pending',
    })
  })

  it('does not re-offer USC after the first completion', () => {
    const { contracts } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    const instance = contracts.getInstance(uscContract.id)
    expect(instance?.status).toBe('available')
  })
})

describe('ContractSystem.offerWhenPrerequisites', () => {
  it('offers the MMC intro when a saved snapshot already has Space Cowboys done and a Mars giver count', () => {
    const base = emptyContractSnapshot()
    const { contracts, messages } = createHarness(
      [cowboysContract, uscContract, mmcPrereqContract],
      {
        ...base,
        instances: {
          'space-cowboys-mars-hq': {
            contractId: 'space-cowboys-mars-hq',
            status: 'completed',
            currentStepIndex: 2,
            stepCounters: [1, 1, 1],
            offeredAt: 't0',
            acceptedAt: 't0',
            completedAt: 't0',
          },
        },
        giverPlanetCompletions: { mars: 1 },
      },
    )
    expect(contracts.getInstance(mmcPrereqContract.id)?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(mmcPrereqContract.id))).toMatchObject({
      status: 'pending',
    })
  })
})

describe('ContractSystem.acceptContract', () => {
  it('moves an available contract to active and delivers step-1 flavor', () => {
    const { contracts, messages } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    expect(contracts.acceptContract(cowboysContract.id)).toBe(true)
    expect(contracts.getInstance(cowboysContract.id)?.status).toBe('active')
    expect(messages.getRecord(contractStepMessageId(cowboysContract.id, 0))).toMatchObject({
      status: 'pending',
    })
  })

  it('returns false when the contract was never offered', () => {
    const { contracts } = createHarness()
    expect(contracts.acceptContract(cowboysContract.id)).toBe(false)
  })
})

describe('ContractSystem.declineContract', () => {
  it('marks an offered contract as declined', () => {
    const { contracts } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    expect(contracts.declineContract(cowboysContract.id)).toBe(true)
    expect(contracts.getInstance(cowboysContract.id)?.status).toBe('declined')
  })
})

describe('ContractSystem.advanceStep — complete-missions', () => {
  it('counts only after acceptance', () => {
    const { contracts } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(cowboysContract.id)?.stepCounters[0]).toBe(0)
    contracts.acceptContract(cowboysContract.id)
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(cowboysContract.id)?.stepCounters[0]).toBe(1)
  })

  it('advances to next step when the count threshold is met', () => {
    const { contracts, messages } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
      })
    }
    expect(contracts.getInstance(cowboysContract.id)?.currentStepIndex).toBe(1)
    expect(messages.getRecord(contractStepMessageId(cowboysContract.id, 1))).toMatchObject({
      status: 'pending',
    })
  })
})

describe('ContractSystem.advanceStep — install-upgrade and visit-planet', () => {
  it('advances on upgrade install at minLevel', () => {
    const { contracts } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
      })
    }
    expect(contracts.getInstance(cowboysContract.id)?.currentStepIndex).toBe(1)
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    expect(contracts.getInstance(cowboysContract.id)?.currentStepIndex).toBe(2)
  })

  it('completes the contract and grants rewards on the final visit', () => {
    const { contracts, granted, messages } = createHarness()
    contracts.notifyMessageArchived(triggerMessage.id)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
      })
    }
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    contracts.notifyPlanetVisited('mars')

    const instance = contracts.getInstance(cowboysContract.id)
    expect(instance?.status).toBe('completed')
    expect(messages.getRecord(contractCompletionMessageId(cowboysContract.id))).toMatchObject({
      status: 'pending',
    })
    expect(granted).toEqual([{ type: 'fast-travel', planetId: 'mars' }])
  })
})

describe('ContractSystem mission filters', () => {
  it('only counts missions that match missionType filters', () => {
    const { contracts } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    contracts.acceptContract(uscContract.id)

    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(uscContract.id)?.stepCounters[0]).toBe(0)

    contracts.notifyMissionCompleted({
      kind: 'eva', giverPlanetId: 'earth', giverId: null, targetPlanetId: null,
    })
    expect(contracts.getInstance(uscContract.id)?.stepCounters[0]).toBe(1)
  })

  it('counts orbital-mission completion at the right planet', () => {
    const { contracts, granted } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle', giverPlanetId: 'earth', giverId: null, targetPlanetId: 'mars',
    })
    contracts.acceptContract(uscContract.id)
    contracts.notifyMissionCompleted({
      kind: 'eva', giverPlanetId: 'earth', giverId: null, targetPlanetId: null,
    })
    contracts.notifyOrbitalMissionCompleted({ giverPlanetId: 'earth', targetPlanetId: 'mars' })
    expect(contracts.getInstance(uscContract.id)?.currentStepIndex).toBe(1)
    contracts.notifyOrbitalMissionCompleted({ giverPlanetId: 'earth', targetPlanetId: 'venus' })
    expect(contracts.getInstance(uscContract.id)?.status).toBe('completed')
    expect(granted).toEqual([
      { type: 'fast-travel', planetId: 'earth' },
      { type: 'mission-pay-multiplier', planetId: 'earth', multiplier: 2 },
    ])
  })
})

describe('ContractSystem persistence', () => {
  it('persists snapshot on every change', () => {
    const save = vi.fn()
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const sys = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => emptyContractSnapshot(), save },
    )
    sys.notifyMessageArchived(triggerMessage.id)
    sys.acceptContract(cowboysContract.id)
    expect(save).toHaveBeenCalled()
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
