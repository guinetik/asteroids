/**
 * Unit tests for the ContractSystem state machine.
 *
 * @author guinetik
 * @date 2026-04-20
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import {
  ContractSystem,
  contractIntroMessageId,
  contractStepMessageId,
  contractCompletionMessageId,
} from '../ContractSystem'
import type {
  Contract,
  ContractStoreSnapshot,
  MissionCompletedEvent,
  RewardEffect,
} from '../contractTypes'
import type {
  ContractStepCompletedPayload,
  ChoiceOutcomeResolvedPayload,
  ContractStepActivatedPayload,
} from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'

const TEST_DATE = '2306-04-05 09:12 UTC'

const cowboysContract: Contract = {
  id: 'space-cowboys-mars-hq',
  inboxName: 'Space Cowboys, Inc.',
  from: 'Jay',
  sentAt: TEST_DATE,
  triggerOnMissionCompletedNth: 1,
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
  triggerOnMissionOfKind: { n: 1, missionType: 'asteroid' },
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

const sampleShuttleMission: MissionCompletedEvent = {
  kind: 'shuttle',
  giverPlanetId: 'earth',
  giverId: null,
  targetPlanetId: 'mars',
}

const sampleAsteroidMission: MissionCompletedEvent = {
  kind: 'asteroid',
  giverPlanetId: null,
  giverId: 'jay',
  targetPlanetId: null,
}

/** Fires the mission event that makes Space Cowboys available (`triggerOnMissionCompletedNth: 1`). */
function offerCowboys(contracts: ContractSystem): void {
  contracts.notifyMissionCompleted(sampleShuttleMission)
}

/**
 * Cowboys first, then the first asteroid — USC is offered only on the first asteroid; Jay’s
 * contract is offered on the first mission of any type.
 */
function offerCowboysThenUsc(contracts: ContractSystem): void {
  offerCowboys(contracts)
  contracts.notifyMissionCompleted(sampleAsteroidMission)
}

/** Minimal contract used only to test `triggerOnMessageArchived` wiring. */
const messageTriggerContract: Contract = {
  id: 'message-trigger-stub',
  inboxName: 'Test Trigger',
  from: 'Test',
  sentAt: TEST_DATE,
  triggerOnMessageArchived: 'jay-first-slingshot-contracts',
  introSubject: 'Stub',
  introBody: ['body'],
  steps: [{ kind: 'visit-planet', planetId: 'earth', subject: 's', flavor: ['f'] }],
  completionSubject: 'Done',
  completionBody: ['d'],
  rewards: [],
}

/** Trade-loop contract used to validate buy/sell step progression. */
const venusTradeLoopContract: Contract = {
  id: 'venusian-zeppelin-trade-loop',
  inboxName: 'Venusian Zeppelin Exchange',
  from: 'Lucas Maverick',
  sentAt: TEST_DATE,
  triggerOnPlanetVisited: 'venus',
  introSubject: 'Trade Loop',
  introBody: ['Run the loop'],
  steps: [
    {
      kind: 'trade-goods',
      action: 'buy',
      planetId: 'venus',
      itemId: 'acid-resistant-coatings',
      count: 10,
      subject: 'Buy',
      flavor: ['buy'],
    },
    {
      kind: 'trade-goods',
      action: 'sell',
      planetId: 'earth',
      itemId: 'acid-resistant-coatings',
      count: 10,
      subject: 'Sell',
      flavor: ['sell'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['done'],
  rewards: [{ type: 'fast-travel', planetId: 'venus' }],
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
    missionCompletionsByKind: { ...initial.missionCompletionsByKind },
  }
  const granted: RewardEffect[] = []

  const messages = new MessageSystem([triggerMessage], {
    load: () => ({}),
    save: () => {},
  })

  const contracts = new ContractSystem(
    contractList,
    messages,
    {
      load: () => snapshot,
      save: (next) => {
        snapshot.instances = next.instances
        snapshot.observedMissionCompletions = next.observedMissionCompletions
        snapshot.giverPlanetCompletions = { ...next.giverPlanetCompletions }
        snapshot.missionCompletionsByKind = { ...next.missionCompletionsByKind }
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
    const { contracts, messages } = createHarness([messageTriggerContract])
    messages.notifyTrigger('map_first_slingshot')
    messages.dismiss(triggerMessage.id)

    contracts.notifyMessageArchived(triggerMessage.id)

    const instance = contracts.getInstance(messageTriggerContract.id)
    expect(instance?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(messageTriggerContract.id))).toMatchObject({
      status: 'pending',
    })
  })

  it('does not double-offer the same contract on a second archive', () => {
    const { contracts } = createHarness([messageTriggerContract])
    contracts.notifyMessageArchived(triggerMessage.id)
    const first = contracts.getInstance(messageTriggerContract.id)
    contracts.notifyMessageArchived(triggerMessage.id)
    const second = contracts.getInstance(messageTriggerContract.id)
    expect(second?.offeredAt).toBe(first?.offeredAt)
  })
})

describe('ContractSystem offer triggers (first mission & first asteroid)', () => {
  it('offers Space Cowboys on the first mission completion of any type', () => {
    const { contracts, messages } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(cowboysContract.id)?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(cowboysContract.id))).toMatchObject({
      status: 'pending',
    })
  })

  it('offers the USC contract only on the first asteroid mission completion', () => {
    const { contracts, messages } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(uscContract.id)).toBeNull()
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: 'jay',
      targetPlanetId: null,
    })
    expect(contracts.getInstance(uscContract.id)?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(uscContract.id))).toMatchObject({
      status: 'pending',
    })
  })

  it('offers both when the first mission is already an asteroid', () => {
    const { contracts } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: 'jay',
      targetPlanetId: null,
    })
    expect(contracts.getInstance(cowboysContract.id)?.status).toBe('available')
    expect(contracts.getInstance(uscContract.id)?.status).toBe('available')
  })

  it('does not re-offer USC after the first asteroid', () => {
    const { contracts } = createHarness()
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: 'jay',
      targetPlanetId: null,
    })
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: 'jay',
      targetPlanetId: null,
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
            resolvedOutcomeId: null,
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

describe('ContractSystem triggerOnPlanetVisited', () => {
  it('offers a contract when the player first orbits the trigger planet', () => {
    const { contracts, messages } = createHarness([venusTradeLoopContract])
    contracts.notifyPlanetVisited('venus')
    expect(contracts.getInstance(venusTradeLoopContract.id)?.status).toBe('available')
    expect(messages.getRecord(contractIntroMessageId(venusTradeLoopContract.id))).toMatchObject({
      status: 'pending',
    })
  })
})

describe('ContractSystem.acceptContract', () => {
  it('moves an available contract to active and delivers step-1 flavor', () => {
    const { contracts, messages } = createHarness()
    offerCowboys(contracts)
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
    offerCowboys(contracts)
    expect(contracts.declineContract(cowboysContract.id)).toBe(true)
    expect(contracts.getInstance(cowboysContract.id)?.status).toBe('declined')
  })
})

describe('ContractSystem.advanceStep — complete-missions', () => {
  it('counts only after acceptance', () => {
    const { contracts } = createHarness()
    offerCowboys(contracts)
    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(cowboysContract.id)?.stepCounters[0]).toBe(0)
    contracts.acceptContract(cowboysContract.id)
    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(cowboysContract.id)?.stepCounters[0]).toBe(1)
  })

  it('advances to next step when the count threshold is met', () => {
    const { contracts, messages } = createHarness()
    offerCowboys(contracts)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle',
        giverPlanetId: 'earth',
        giverId: null,
        targetPlanetId: 'mars',
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
    offerCowboys(contracts)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle',
        giverPlanetId: 'earth',
        giverId: null,
        targetPlanetId: 'mars',
      })
    }
    expect(contracts.getInstance(cowboysContract.id)?.currentStepIndex).toBe(1)
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    expect(contracts.getInstance(cowboysContract.id)?.currentStepIndex).toBe(2)
  })

  it('completes the contract and grants rewards on the final visit', () => {
    const { contracts, granted, messages } = createHarness()
    offerCowboys(contracts)
    contracts.acceptContract(cowboysContract.id)
    for (let i = 0; i < 3; i++) {
      contracts.notifyMissionCompleted({
        kind: 'shuttle',
        giverPlanetId: 'earth',
        giverId: null,
        targetPlanetId: 'mars',
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
    offerCowboysThenUsc(contracts)
    contracts.acceptContract(uscContract.id)

    contracts.notifyMissionCompleted({
      kind: 'shuttle',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: 'mars',
    })
    expect(contracts.getInstance(uscContract.id)?.stepCounters[0]).toBe(0)

    contracts.notifyMissionCompleted({
      kind: 'eva',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: null,
    })
    expect(contracts.getInstance(uscContract.id)?.stepCounters[0]).toBe(1)
  })

  it('counts orbital-mission completion at the right planet', () => {
    const { contracts, granted } = createHarness()
    offerCowboysThenUsc(contracts)
    contracts.acceptContract(uscContract.id)
    contracts.notifyMissionCompleted({
      kind: 'eva',
      giverPlanetId: 'earth',
      giverId: null,
      targetPlanetId: null,
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

describe('ContractSystem trade-goods steps', () => {
  it('counts only matching action, planet, and item transactions', () => {
    const { contracts } = createHarness([venusTradeLoopContract])
    contracts.notifyPlanetVisited('venus')
    contracts.acceptContract(venusTradeLoopContract.id)

    contracts.notifyTradeTransaction({
      action: 'sell',
      planetId: 'venus',
      itemId: 'acid-resistant-coatings',
      quantity: 10,
    })
    expect(contracts.getInstance(venusTradeLoopContract.id)?.stepCounters[0]).toBe(0)

    contracts.notifyTradeTransaction({
      action: 'buy',
      planetId: 'venus',
      itemId: 'acid-resistant-coatings',
      quantity: 4,
    })
    expect(contracts.getInstance(venusTradeLoopContract.id)?.stepCounters[0]).toBe(4)
  })

  it('advances by quantity and caps progress at required count', () => {
    const { contracts, granted } = createHarness([venusTradeLoopContract])
    contracts.notifyPlanetVisited('venus')
    contracts.acceptContract(venusTradeLoopContract.id)

    contracts.notifyTradeTransaction({
      action: 'buy',
      planetId: 'venus',
      itemId: 'acid-resistant-coatings',
      quantity: 12,
    })
    expect(contracts.getInstance(venusTradeLoopContract.id)?.currentStepIndex).toBe(1)

    contracts.notifyTradeTransaction({
      action: 'sell',
      planetId: 'earth',
      itemId: 'acid-resistant-coatings',
      quantity: 10,
    })
    expect(contracts.getInstance(venusTradeLoopContract.id)?.status).toBe('completed')
    expect(granted).toEqual([{ type: 'fast-travel', planetId: 'venus' }])
  })
})

/** Cinderline-shape contract used to validate `collect-drops` and `launch-from-body` steps. */
const cinderlineLikeContract: Contract = {
  id: 'cinderline-test',
  inboxName: 'Anvil',
  from: 'Anvil',
  sentAt: TEST_DATE,
  triggerOnPlanetVisited: 'mercury',
  introSubject: 'Cinderline',
  introBody: ['intro'],
  steps: [
    {
      kind: 'collect-drops',
      itemId: 'viroid-psychosphere',
      count: 3,
      subject: 'Harvest',
      flavor: ['harvest'],
    },
    {
      kind: 'launch-from-body',
      planetId: 'sun',
      subject: 'Break solar orbit',
      flavor: ['launch'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['done'],
  rewards: [{ type: 'fast-travel', planetId: 'mercury' }],
}

describe('ContractSystem collect-drops steps', () => {
  it('advances by quantity per pickup and clamps at the required count', () => {
    const { contracts } = createHarness([cinderlineLikeContract])
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(cinderlineLikeContract.id)

    contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 1 })
    expect(contracts.getInstance(cinderlineLikeContract.id)?.stepCounters[0]).toBe(1)

    contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 5 })
    const instance = contracts.getInstance(cinderlineLikeContract.id)
    expect(instance?.currentStepIndex).toBe(1)
    expect(instance?.stepCounters[0]).toBe(3)
  })

  it('ignores drops of other items', () => {
    const { contracts } = createHarness([cinderlineLikeContract])
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(cinderlineLikeContract.id)

    contracts.notifyDropCollected({ itemId: 'olivine', quantity: 5 })
    expect(contracts.getInstance(cinderlineLikeContract.id)?.stepCounters[0]).toBe(0)
  })

  it('ignores zero-quantity events', () => {
    const { contracts } = createHarness([cinderlineLikeContract])
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(cinderlineLikeContract.id)

    contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 0 })
    expect(contracts.getInstance(cinderlineLikeContract.id)?.stepCounters[0]).toBe(0)
  })
})

describe('ContractSystem deliver-items steps', () => {
  /** Cinderline-shape contract whose first step is a Mercury delivery. */
  const deliveryContract: Contract = {
    id: 'deliver-test',
    inboxName: 'Anvil',
    from: 'Anvil',
    sentAt: TEST_DATE,
    triggerOnPlanetVisited: 'mercury',
    introSubject: 'Deliver',
    introBody: ['intro'],
    steps: [
      {
        kind: 'deliver-items',
        planetId: 'mercury',
        itemId: 'viroid-psychosphere',
        count: 20,
        creditsReward: 500,
        subject: 'Handoff',
        flavor: ['handoff'],
      },
    ],
    completionSubject: 'Done',
    completionBody: ['done'],
    rewards: [{ type: 'fast-travel', planetId: 'mercury' }],
  }

  function buildDeliveryHarness(consumeImpl: (itemId: string, count: number) => boolean): {
    contracts: ContractSystem
    consumeCalls: Array<{ itemId: string; count: number }>
  } {
    const consumeCalls: Array<{ itemId: string; count: number }> = []
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const snapshot = emptyContractSnapshot()
    const contracts = new ContractSystem(
      [deliveryContract],
      messages,
      {
        load: () => snapshot,
        save: (next) => Object.assign(snapshot, next),
      },
      {
        consumeItemsForDelivery: (itemId, count) => {
          consumeCalls.push({ itemId, count })
          return consumeImpl(itemId, count)
        },
      },
    )
    return { contracts, consumeCalls }
  }

  it('advances and consumes inventory when orbiting the destination with enough items', () => {
    const { contracts, consumeCalls } = buildDeliveryHarness(() => true)
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(deliveryContract.id)

    contracts.notifyPlanetVisited('mercury')

    expect(consumeCalls).toEqual([{ itemId: 'viroid-psychosphere', count: 20 }])
    expect(contracts.getInstance(deliveryContract.id)?.status).toBe('completed')
  })

  it('does not advance when the inventory hook reports insufficient stock', () => {
    const { contracts, consumeCalls } = buildDeliveryHarness(() => false)
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(deliveryContract.id)

    contracts.notifyPlanetVisited('mercury')

    expect(consumeCalls).toEqual([{ itemId: 'viroid-psychosphere', count: 20 }])
    const instance = contracts.getInstance(deliveryContract.id)
    expect(instance?.status).toBe('active')
    expect(instance?.currentStepIndex).toBe(0)
  })

  it('ignores planet visits to other bodies', () => {
    const { contracts, consumeCalls } = buildDeliveryHarness(() => true)
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(deliveryContract.id)

    contracts.notifyPlanetVisited('venus')

    expect(consumeCalls).toEqual([])
    expect(contracts.getInstance(deliveryContract.id)?.status).toBe('active')
  })

  it('retries on each Mercury orbit until the host hook succeeds', () => {
    let armed = false
    const { contracts, consumeCalls } = buildDeliveryHarness(() => armed)
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(deliveryContract.id)

    contracts.notifyPlanetVisited('mercury')
    expect(contracts.getInstance(deliveryContract.id)?.status).toBe('active')

    armed = true
    contracts.notifyPlanetVisited('mercury')
    expect(contracts.getInstance(deliveryContract.id)?.status).toBe('completed')
    expect(consumeCalls).toHaveLength(2)
  })
})

describe('ContractSystem launch-from-body steps', () => {
  it('advances when launching from the matching planet id', () => {
    const { contracts, granted } = createHarness([cinderlineLikeContract])
    contracts.notifyPlanetVisited('mercury')
    contracts.acceptContract(cinderlineLikeContract.id)
    contracts.notifyDropCollected({ itemId: 'viroid-psychosphere', quantity: 3 })

    contracts.notifyOrbitalLaunched({ planetId: 'mercury' })
    expect(contracts.getInstance(cinderlineLikeContract.id)?.status).toBe('active')

    contracts.notifyOrbitalLaunched({ planetId: 'sun' })
    expect(contracts.getInstance(cinderlineLikeContract.id)?.status).toBe('completed')
    expect(granted).toEqual([{ type: 'fast-travel', planetId: 'mercury' }])
  })

  it('does not advance when no contract is active', () => {
    const { contracts } = createHarness([cinderlineLikeContract])
    contracts.notifyOrbitalLaunched({ planetId: 'sun' })
    expect(contracts.getInstance(cinderlineLikeContract.id)).toBeNull()
  })
})

describe('ContractSystem persistence', () => {
  it('persists snapshot on every change', () => {
    const save = vi.fn()
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const sys = new ContractSystem([cowboysContract], messages, {
      load: () => emptyContractSnapshot(),
      save,
    })
    sys.notifyMissionCompleted(sampleShuttleMission)
    sys.acceptContract(cowboysContract.id)
    expect(save).toHaveBeenCalled()
  })
})

describe('onContractCompleted hook', () => {
  it('fires exactly once when a contract transitions from active to completed', () => {
    const completedIds: string[] = []
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
    }
    const contracts = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractCompleted: (id) => completedIds.push(id),
      },
    )

    // Offer + accept Cowboys by firing the Nth mission trigger.
    offerCowboys(contracts)
    contracts.acceptContract('space-cowboys-mars-hq')

    // Step 1 needs 3 missions, step 2 an install, step 3 a visit.
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    expect(completedIds).toEqual([])

    contracts.notifyPlanetVisited('mars')

    expect(completedIds).toEqual(['space-cowboys-mars-hq'])
  })

  it('fires during replayCompletedRewards for pre-existing completed instances', () => {
    const now = new Date().toISOString()
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        'space-cowboys-mars-hq': {
          contractId: 'space-cowboys-mars-hq',
          status: 'completed',
          currentStepIndex: 2,
          stepCounters: [3, 1, 1],
          offeredAt: now,
          acceptedAt: now,
          completedAt: now,
          resolvedOutcomeId: null,
        },
      },
    }
    const completedIds: string[] = []
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const contracts = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractCompleted: (id) => completedIds.push(id),
        onRewardGranted: () => {},
      },
    )
    contracts.replayCompletedRewards()
    expect(completedIds).toEqual(['space-cowboys-mars-hq'])
  })

  it('replayCompletedRewards is a no-op on subsequent calls (single-fire guard)', () => {
    const now = new Date().toISOString()
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        'space-cowboys-mars-hq': {
          contractId: 'space-cowboys-mars-hq',
          status: 'completed',
          currentStepIndex: 2,
          stepCounters: [3, 1, 1],
          offeredAt: now,
          acceptedAt: now,
          completedAt: now,
          resolvedOutcomeId: null,
        },
      },
    }
    const completedIds: string[] = []
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const contracts = new ContractSystem(
      [cowboysContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractCompleted: (id) => completedIds.push(id),
      },
    )
    contracts.replayCompletedRewards()
    contracts.replayCompletedRewards()
    contracts.replayCompletedRewards()
    expect(completedIds).toEqual(['space-cowboys-mars-hq'])
  })
})

describe('onContractStepCompleted hook', () => {
  /**
   * Contract with three steps each carrying a distinct payout. Step 1 needs 3
   * mission completions (count threshold), step 2 is an upgrade install
   * (single-event), step 3 omits `creditsReward` to assert the default-zero path.
   */
  const payoutContract: Contract = {
    id: 'payout-fixture',
    inboxName: 'Payout Fixture',
    from: 'Payout Tester',
    sentAt: TEST_DATE,
    triggerOnMissionCompletedNth: 1,
    introSubject: 'Payout intro',
    introBody: ['intro'],
    steps: [
      {
        kind: 'complete-missions',
        count: 3,
        creditsReward: 4000,
        subject: 'Step 1',
        flavor: ['s1'],
      },
      {
        kind: 'install-upgrade',
        upgradeId: 'shuttleFreezeResistance',
        minLevel: 1,
        creditsReward: 666.69,
        subject: 'Step 2',
        flavor: ['s2'],
      },
      {
        kind: 'visit-planet',
        planetId: 'mars',
        subject: 'Step 3',
        flavor: ['s3'],
      },
    ],
    completionSubject: 'Done',
    completionBody: ['d'],
    rewards: [],
  }

  function createPayoutHarness(): {
    contracts: ContractSystem
    payouts: ContractStepCompletedPayload[]
  } {
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const payouts: ContractStepCompletedPayload[] = []
    const contracts = new ContractSystem(
      [payoutContract],
      messages,
      { load: () => emptyContractSnapshot(), save: () => {} },
      {
        onContractStepCompleted: (payload) => payouts.push(payload),
      },
    )
    return { contracts, payouts }
  }

  it('fires exactly once per step transition with the authored creditsReward', () => {
    const { contracts, payouts } = createPayoutHarness()
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(payoutContract.id)

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyUpgradeInstalled('shuttleFreezeResistance', 1)
    contracts.notifyPlanetVisited('mars')

    expect(payouts).toEqual([
      { contractId: payoutContract.id, stepIndex: 0, creditsReward: 4000 },
      { contractId: payoutContract.id, stepIndex: 1, creditsReward: 666.69 },
      { contractId: payoutContract.id, stepIndex: 2, creditsReward: 0 },
    ])
  })

  it('does not fire on partial counter increments', () => {
    const { contracts, payouts } = createPayoutHarness()
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(payoutContract.id)

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.notifyMissionCompleted(sampleShuttleMission)
    expect(payouts).toEqual([])

    contracts.notifyMissionCompleted(sampleShuttleMission)
    expect(payouts).toEqual([{ contractId: payoutContract.id, stepIndex: 0, creditsReward: 4000 }])
  })

  it('does not fire during replayCompletedRewards', () => {
    const now = new Date().toISOString()
    const snapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        [payoutContract.id]: {
          contractId: payoutContract.id,
          status: 'completed',
          currentStepIndex: 2,
          stepCounters: [3, 1, 1],
          offeredAt: now,
          acceptedAt: now,
          completedAt: now,
          resolvedOutcomeId: null,
        },
      },
    }
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const payouts: ContractStepCompletedPayload[] = []
    const contracts = new ContractSystem(
      [payoutContract],
      messages,
      { load: () => snapshot, save: () => {} },
      {
        onContractStepCompleted: (payload) => payouts.push(payload),
      },
    )
    contracts.replayCompletedRewards()
    expect(payouts).toEqual([])
  })
})

describe('ContractSystem passive auto-advance (install-upgrade / visit-planet)', () => {
  /**
   * Mirrors the Cinderline shape that triggered the original bug: the
   * install-upgrade is the *third* step, deep enough that retro-eval at
   * acceptance never sees it as the current step. Also exercises a final
   * visit-planet so cascade behaviour can be checked.
   */
  const passiveContract: Contract = {
    id: 'passive-fixture',
    inboxName: 'Passive Fixture',
    from: 'Tester',
    sentAt: TEST_DATE,
    triggerOnMissionCompletedNth: 1,
    introSubject: 'Passive intro',
    introBody: ['intro'],
    steps: [
      {
        kind: 'complete-missions',
        count: 1,
        creditsReward: 100,
        subject: 'Step 1',
        flavor: ['s1'],
      },
      {
        kind: 'install-upgrade',
        upgradeId: 'shuttleFreezeResistance',
        minLevel: 3,
        creditsReward: 200,
        subject: 'Step 2',
        flavor: ['s2'],
      },
      {
        kind: 'visit-planet',
        planetId: 'mars',
        creditsReward: 300,
        subject: 'Step 3',
        flavor: ['s3'],
      },
    ],
    completionSubject: 'Done',
    completionBody: ['d'],
    rewards: [],
  }

  /**
   * Build a passive-eval harness with controllable upgrade-level and
   * orbited-body hooks so each test can flip the player's pre-state and
   * assert the expected snap/no-snap.
   */
  function createPassiveHarness(
    opts: {
      installedLevels?: Record<string, number>
      orbitedPlanets?: Set<string>
    } = {},
  ): {
    contracts: ContractSystem
    payouts: ContractStepCompletedPayload[]
    installedLevels: Record<string, number>
    orbitedPlanets: Set<string>
  } {
    const installedLevels = { ...opts.installedLevels }
    const orbitedPlanets = new Set(opts.orbitedPlanets ?? [])
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const payouts: ContractStepCompletedPayload[] = []
    const contracts = new ContractSystem(
      [passiveContract],
      messages,
      { load: () => emptyContractSnapshot(), save: () => {} },
      {
        onContractStepCompleted: (payload) => payouts.push(payload),
        getInstalledUpgradeLevel: (upgradeId) => installedLevels[upgradeId] ?? 0,
        hasOrbitedPlanet: (planetId) => orbitedPlanets.has(planetId),
      },
    )
    return { contracts, payouts, installedLevels, orbitedPlanets }
  }

  it('snaps install-upgrade when the chain advances into it and player already owns the level', () => {
    // Cinderline reproduction: the install-upgrade is at index 1 (step 2).
    // The player has rad shielding tier 3 from the start, but no fresh
    // notifyUpgradeInstalled event will ever fire. Without passive eval
    // the step would stall after the mission completion advances into it.
    const { contracts, payouts } = createPassiveHarness({
      installedLevels: { shuttleFreezeResistance: 3 },
    })
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(passiveContract.id)
    contracts.notifyMissionCompleted(sampleShuttleMission)

    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(2)
    expect(payouts).toEqual([
      { contractId: passiveContract.id, stepIndex: 0, creditsReward: 100 },
      { contractId: passiveContract.id, stepIndex: 1, creditsReward: 200 },
    ])
  })

  it('does not snap install-upgrade when player level is below minLevel', () => {
    const { contracts } = createPassiveHarness({
      installedLevels: { shuttleFreezeResistance: 2 },
    })
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(passiveContract.id)
    contracts.notifyMissionCompleted(sampleShuttleMission)

    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(1)
  })

  it('snaps install-upgrade at step 0 during acceptance (MMC parity)', () => {
    // Sanity: when install-upgrade is the *first* step, acceptance alone
    // should be enough to advance — same behaviour MMC relied on before.
    const mmcLikeContract: Contract = {
      id: 'mmc-like',
      inboxName: 'MMC-like',
      from: 'Sampaio',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'i',
      introBody: ['i'],
      steps: [
        {
          kind: 'install-upgrade',
          upgradeId: 'turretMiningUnlock',
          minLevel: 1,
          creditsReward: 1000,
          subject: 'op1',
          flavor: ['op1'],
        },
        {
          kind: 'complete-missions',
          count: 1,
          subject: 'op2',
          flavor: ['op2'],
        },
      ],
      completionSubject: 'Done',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const payouts: ContractStepCompletedPayload[] = []
    const contracts = new ContractSystem(
      [mmcLikeContract],
      messages,
      { load: () => emptyContractSnapshot(), save: () => {} },
      {
        onContractStepCompleted: (payload) => payouts.push(payload),
        getInstalledUpgradeLevel: () => 1,
        hasOrbitedPlanet: () => false,
      },
    )
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(mmcLikeContract.id)

    expect(contracts.getInstance(mmcLikeContract.id)?.currentStepIndex).toBe(1)
    expect(payouts).toEqual([{ contractId: mmcLikeContract.id, stepIndex: 0, creditsReward: 1000 }])
  })

  it('snaps visit-planet when the chain advances into it and player already orbited the body', () => {
    const { contracts } = createPassiveHarness({
      installedLevels: { shuttleFreezeResistance: 3 },
      orbitedPlanets: new Set(['mars']),
    })
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(passiveContract.id)
    contracts.notifyMissionCompleted(sampleShuttleMission)

    expect(contracts.getInstance(passiveContract.id)?.status).toBe('completed')
  })

  it('does nothing when neither hook is provided (engine stays inert)', () => {
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const contracts = new ContractSystem(
      [passiveContract],
      messages,
      { load: () => emptyContractSnapshot(), save: () => {} },
      {},
    )
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(passiveContract.id)
    contracts.notifyMissionCompleted(sampleShuttleMission)

    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(1)
  })

  it('evaluatePassiveStateForActiveContracts snaps a stuck install-upgrade in a pre-existing save', () => {
    // Save migration: a save was written before per-contract passive
    // eval landed. The Cinderline-shaped instance was persisted with
    // currentStepIndex=1 (install-upgrade) and the player has had the
    // upgrade for the entire run. New engine should snap on startup.
    const now = new Date().toISOString()
    const stuckSnapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        [passiveContract.id]: {
          contractId: passiveContract.id,
          status: 'active',
          currentStepIndex: 1,
          stepCounters: [1, 0, 0],
          offeredAt: now,
          acceptedAt: now,
          completedAt: null,
          resolvedOutcomeId: null,
        },
      },
    }
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    const payouts: ContractStepCompletedPayload[] = []
    let changeCount = 0
    const contracts = new ContractSystem(
      [passiveContract],
      messages,
      { load: () => stuckSnapshot, save: () => {} },
      {
        onContractsChanged: () => {
          changeCount++
        },
        onContractStepCompleted: (payload) => payouts.push(payload),
        getInstalledUpgradeLevel: () => 3,
        hasOrbitedPlanet: () => false,
      },
    )

    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(1)
    contracts.evaluatePassiveStateForActiveContracts()
    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(2)
    expect(payouts).toEqual([{ contractId: passiveContract.id, stepIndex: 1, creditsReward: 200 }])
    expect(changeCount).toBe(1)
  })

  it('evaluatePassiveStateForActiveContracts is a no-op when no active step is auto-derivable', () => {
    // Active contract whose current step is `complete-missions` — passive
    // eval has nothing to snap. Helper must not fire onContractsChanged.
    const now = new Date().toISOString()
    const onMissionStepSnapshot: ContractStoreSnapshot = {
      ...emptyContractSnapshot(),
      instances: {
        [passiveContract.id]: {
          contractId: passiveContract.id,
          status: 'active',
          currentStepIndex: 0,
          stepCounters: [0, 0, 0],
          offeredAt: now,
          acceptedAt: now,
          completedAt: null,
          resolvedOutcomeId: null,
        },
      },
    }
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    let changeCount = 0
    const contracts = new ContractSystem(
      [passiveContract],
      messages,
      { load: () => onMissionStepSnapshot, save: () => {} },
      {
        onContractsChanged: () => {
          changeCount++
        },
        getInstalledUpgradeLevel: () => 3,
        hasOrbitedPlanet: () => true,
      },
    )

    contracts.evaluatePassiveStateForActiveContracts()
    expect(contracts.getInstance(passiveContract.id)?.currentStepIndex).toBe(0)
    expect(changeCount).toBe(0)
  })

  it('does NOT auto-advance deliver-items even when the destination is in orbitedPlanets', () => {
    // deliver-items intentionally sidesteps passive eval: consumption is
    // a meaningful side-effect that requires the explicit player action
    // of orbiting the destination. Hook should never be called for it.
    const deliveryContract: Contract = {
      id: 'delivery-fixture',
      inboxName: 'Delivery',
      from: 'Tester',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'i',
      introBody: ['i'],
      steps: [
        {
          kind: 'deliver-items',
          planetId: 'mercury',
          itemId: 'viroid-psychosphere',
          count: 5,
          subject: 'd1',
          flavor: ['d1'],
        },
      ],
      completionSubject: 'Done',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([triggerMessage], { load: () => ({}), save: () => {} })
    let consumeCalls = 0
    const contracts = new ContractSystem(
      [deliveryContract],
      messages,
      { load: () => emptyContractSnapshot(), save: () => {} },
      {
        consumeItemsForDelivery: () => {
          consumeCalls++
          return true
        },
        hasOrbitedPlanet: () => true, // even with this true, no auto-snap
      },
    )
    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract(deliveryContract.id)

    expect(consumeCalls).toBe(0)
    expect(contracts.getInstance(deliveryContract.id)?.currentStepIndex).toBe(0)
    expect(contracts.getInstance(deliveryContract.id)?.status).toBe('active')
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})

/** Minimal MessageSystem persistence stub — no inbox messages needed for choice tests. */
function emptyMessageStore() {
  return { load: () => ({}), save: () => undefined }
}

/** In-memory ContractPersistence stub that survives across calls in one test. */
function inMemoryPersistence(): {
  load: () => ContractStoreSnapshot
  save: (snap: ContractStoreSnapshot) => void
} {
  let snap = emptyContractSnapshot()
  return { load: () => snap, save: (next) => (snap = next) }
}

describe('offerWhenPrerequisites combined gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires when both requiredCompletedContractId and triggerOnPlanetVisited met', () => {
    const A: Contract = {
      id: 'aaa',
      inboxName: 'A',
      from: 't',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'A',
      introBody: ['a'],
      steps: [{ kind: 'visit-planet', planetId: 'mars', subject: 's', flavor: ['f'] }],
      completionSubject: 'A done',
      completionBody: ['ad'],
      rewards: [],
    }
    const B: Contract = {
      id: 'bbb',
      inboxName: 'B',
      from: 't',
      sentAt: TEST_DATE,
      offerWhenPrerequisites: {
        requiredCompletedContractId: 'aaa',
        triggerOnPlanetVisited: 'jupiter',
      },
      introSubject: 'B',
      introBody: ['b'],
      steps: [{ kind: 'visit-planet', planetId: 'earth', subject: 's', flavor: ['f'] }],
      completionSubject: 'B done',
      completionBody: ['bd'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([A, B], messages, inMemoryPersistence(), {
      hasOrbitedPlanet: () => false,
    })
    contracts.resetForTests()

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract('aaa')
    contracts.notifyPlanetVisited('mars') // completes A

    // B prereq met but planet-visit gate not — should not be offered yet.
    expect(contracts.getInstance('bbb')).toBeNull()

    // Visiting jupiter now offers B.
    contracts.notifyPlanetVisited('jupiter')
    expect(contracts.getInstance('bbb')?.status).toBe('available')
  })

  it('respects order: planet visited before required contract completed', () => {
    const A: Contract = {
      id: 'a2',
      inboxName: 'A',
      from: 't',
      sentAt: TEST_DATE,
      triggerOnMissionCompletedNth: 1,
      introSubject: 'A',
      introBody: ['a'],
      steps: [{ kind: 'visit-planet', planetId: 'mars', subject: 's', flavor: ['f'] }],
      completionSubject: 'A done',
      completionBody: ['ad'],
      rewards: [],
    }
    const B: Contract = {
      id: 'b2',
      inboxName: 'B',
      from: 't',
      sentAt: TEST_DATE,
      offerWhenPrerequisites: {
        requiredCompletedContractId: 'a2',
        triggerOnPlanetVisited: 'jupiter',
      },
      introSubject: 'B',
      introBody: ['b'],
      steps: [{ kind: 'visit-planet', planetId: 'earth', subject: 's', flavor: ['f'] }],
      completionSubject: 'B done',
      completionBody: ['bd'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([A, B], messages, inMemoryPersistence(), {
      hasOrbitedPlanet: () => false,
    })
    contracts.resetForTests()

    contracts.notifyPlanetVisited('jupiter')
    expect(contracts.getInstance('b2')).toBeNull()

    contracts.notifyMissionCompleted(sampleShuttleMission)
    contracts.acceptContract('a2')
    contracts.notifyPlanetVisited('mars')
    expect(contracts.getInstance('b2')?.status).toBe('available')
  })
})

describe('choice-mission step', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves on a single notifyChoiceResolved call (requiredCount === 1)', () => {
    const choiceContract: Contract = {
      id: 'choice-stub',
      inboxName: 'Choice Stub',
      from: 'Test',
      sentAt: TEST_DATE,
      introSubject: 'Choose',
      introBody: ['intro'],
      steps: [
        {
          kind: 'choice-mission',
          missionId: 'stub-choice',
          minigameType: 'terminal-stub',
          outcomes: [
            { outcomeId: 'a', label: 'A', creditsReward: 100 },
            { outcomeId: 'b', label: 'B', creditsReward: 0 },
          ],
          subject: 'Choose',
          flavor: ['choose'],
        },
      ],
      completionByOutcome: {
        a: { completionSubject: 'Picked A', completionBody: ['a'], rewards: [] },
        b: { completionSubject: 'Picked B', completionBody: ['b'], rewards: [] },
      },
    }

    const choiceOutcomes: ChoiceOutcomeResolvedPayload[] = []
    const messages = new MessageSystem([], emptyMessageStore())
    const persistence = inMemoryPersistence()

    const contracts = new ContractSystem(
      [choiceContract],
      messages,
      persistence,
      {
        onChoiceOutcomeResolved: (payload) => choiceOutcomes.push(payload),
      },
    )

    contracts.offerForTests(choiceContract.id)
    contracts.acceptContract(choiceContract.id)
    contracts.notifyChoiceResolved('stub-choice', 'a')

    expect(contracts.getInstance(choiceContract.id)?.status).toBe('completed')
    expect(contracts.getInstance(choiceContract.id)?.resolvedOutcomeId).toBe('a')
    expect(choiceOutcomes).toEqual([
      {
        contractId: choiceContract.id,
        stepIndex: 0,
        outcomeId: 'a',
        creditsReward: 100,
      },
    ])
  })
})

/** In-memory storage map shared by `objectiveType filter` tests. */
const mockStorage: Record<string, string> = {}

describe('objectiveType filter', () => {
  beforeEach(() => {
    // Mirror the file's existing storage-reset pattern.
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  it('advances when the event objectiveType matches the step filter', () => {
    const c: Contract = {
      id: 'objtype-match',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          objectiveType: 'photometry',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-match')
    contracts.acceptContract('objtype-match')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      objectiveType: 'photometry',
    })
    expect(contracts.getInstance('objtype-match')?.status).toBe('completed')
  })

  it('does NOT advance when the event objectiveType differs from the filter', () => {
    const c: Contract = {
      id: 'objtype-miss',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          objectiveType: 'photometry',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-miss')
    contracts.acceptContract('objtype-miss')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      objectiveType: 'dan',
    })
    expect(contracts.getInstance('objtype-miss')?.status).toBe('active')
  })

  it('advances when the step has NO objectiveType filter (legacy behavior unchanged)', () => {
    const c: Contract = {
      id: 'objtype-omitted',
      inboxName: 'OT',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'OT',
      introBody: ['ot'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('objtype-omitted')
    contracts.acceptContract('objtype-omitted')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      // No objectiveType — should still advance because the step doesn't filter.
    })
    expect(contracts.getInstance('objtype-omitted')?.status).toBe('completed')
  })
})

import type { ContractMissionType } from '../contractTypes'

describe('matcher full filter set', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  function buildContract(stepFilters: {
    missionType?: ContractMissionType
    pinnedAssetRef?: string
    targetRegion?: string
    specialMissionId?: string
  }): Contract {
    const id = `match-${stepFilters.specialMissionId ?? stepFilters.pinnedAssetRef ?? stepFilters.targetRegion ?? 'x'}`
    return {
      id,
      inboxName: 'M',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'M',
      introBody: ['m'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          ...stepFilters,
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
  }

  function buildSystem(c: Contract) {
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests(c.id)
    contracts.acceptContract(c.id)
    return contracts
  }

  it('advances when specialMissionId matches', () => {
    const c = buildContract({
      missionType: 'asteroid',
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when specialMissionId differs', () => {
    const c = buildContract({
      missionType: 'asteroid',
      specialMissionId: 'jovian-prospection-hektor-photometry',
    })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      specialMissionId: 'jovian-prospection-saturn-photometry',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })

  it('advances when pinnedAssetRef matches', () => {
    const c = buildContract({ missionType: 'asteroid', pinnedAssetRef: 'hektor' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      pinnedAssetRef: 'hektor',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when pinnedAssetRef differs', () => {
    const c = buildContract({ missionType: 'asteroid', pinnedAssetRef: 'hektor' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      pinnedAssetRef: 'asset-2306-s',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })

  it('advances when targetRegion matches event.region', () => {
    const c = buildContract({ missionType: 'asteroid', targetRegion: 'saturn-trojans' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      region: 'saturn-trojans',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('completed')
  })

  it('does NOT advance when targetRegion differs from event.region', () => {
    const c = buildContract({ missionType: 'asteroid', targetRegion: 'saturn-trojans' })
    const contracts = buildSystem(c)
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
      region: 'jovian-trojans',
    })
    expect(contracts.getInstance(c.id)?.status).toBe('active')
  })
})

describe('onStepActivated hook', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
  })

  it('fires when a contract is accepted (step 0)', () => {
    const c: Contract = {
      id: 'sa-accept',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          specialMissionId: 'jovian-prospection-hektor-photometry',
          revealsBody: 'hektor',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-accept')
    contracts.acceptContract('sa-accept')
    expect(events).toHaveLength(1)
    expect(events[0]?.stepIndex).toBe(0)
    expect(events[0]?.specialMissionId).toBe('jovian-prospection-hektor-photometry')
    expect(events[0]?.revealsBody).toBe('hektor')
  })

  it('fires when a step advances (step 1)', () => {
    const c: Contract = {
      id: 'sa-advance',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's0',
          flavor: ['f'],
        },
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          specialMissionId: 'jovian-prospection-hektor-dan',
          subject: 's1',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-advance')
    contracts.acceptContract('sa-advance')
    contracts.notifyMissionCompleted({
      kind: 'asteroid',
      giverPlanetId: null,
      giverId: null,
      targetPlanetId: null,
    })
    expect(events.map((e) => e.stepIndex)).toEqual([0, 1])
    expect(events[1]?.specialMissionId).toBe('jovian-prospection-hektor-dan')
    expect(events[1]?.revealsBody).toBeNull()
  })

  it('emits null specialMissionId / revealsBody for vanilla steps', () => {
    const c: Contract = {
      id: 'sa-vanilla',
      inboxName: 'SA',
      from: 't',
      sentAt: TEST_DATE,
      introSubject: 'SA',
      introBody: ['s'],
      steps: [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          subject: 's',
          flavor: ['f'],
        },
      ],
      completionSubject: 'd',
      completionBody: ['d'],
      rewards: [],
    }
    const messages = new MessageSystem([], emptyMessageStore())
    const events: ContractStepActivatedPayload[] = []
    const contracts = new ContractSystem([c], messages, inMemoryPersistence(), {
      onStepActivated: (p) => events.push(p),
    })
    contracts.resetForTests()
    contracts.offerForTests('sa-vanilla')
    contracts.acceptContract('sa-vanilla')
    expect(events).toHaveLength(1)
    expect(events[0]?.specialMissionId).toBeNull()
    expect(events[0]?.revealsBody).toBeNull()
  })
})
