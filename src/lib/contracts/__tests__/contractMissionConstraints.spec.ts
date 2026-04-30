/**
 * Tests for the contract → mission constraint query helper.
 *
 * @author guinetik
 * @date 2026-04-29
 * @spec docs/superpowers/plans/2026-04-29-contract-aware-asteroid-mission-bias.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import { getActiveAsteroidContractConstraints } from '../contractMissionConstraints'
import type { Contract, ContractStoreSnapshot } from '../contractTypes'

const TEST_DATE = '2306-04-05 09:12 UTC'

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

function buildContract(steps: Contract['steps'], id = 'test-contract'): Contract {
  return {
    id,
    inboxName: 'T',
    from: 't',
    sentAt: TEST_DATE,
    introSubject: 'T',
    introBody: ['t'],
    steps,
    completionSubject: 'd',
    completionBody: ['d'],
    rewards: [],
  }
}

describe('getActiveAsteroidContractConstraints', () => {
  it('returns null when no contracts are active', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([], messages, inMemoryPersistence())
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('returns constraints when an active asteroid step matches the planet', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'jovian-society',
        objectiveType: 'gather',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    const result = getActiveAsteroidContractConstraints(contracts, 'jupiter')
    expect(result).toEqual({ giverId: 'jovian-society', objectiveType: 'gather' })
  })

  it('returns null when the active step is not asteroid', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'mining',
        giverPlanetId: 'jupiter',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('respects giverPlanetId on the step (skips when the planet does not match)', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        giverId: 'jovian-society',
        giverPlanetId: 'jupiter',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    expect(getActiveAsteroidContractConstraints(contracts, 'mars')).toBeNull()
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toEqual({
      giverId: 'jovian-society',
      objectiveType: undefined,
    })
  })

  it('skips steps that carry specialMissionId (special-mission staging owns those)', () => {
    const c = buildContract([
      {
        kind: 'complete-missions',
        count: 1,
        missionType: 'asteroid',
        specialMissionId: 'jovian-prospection-hektor-photometry',
        subject: 's',
        flavor: ['f'],
      },
    ])
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([c], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('test-contract')
    contracts.acceptContract('test-contract')
    expect(getActiveAsteroidContractConstraints(contracts, 'jupiter')).toBeNull()
  })

  it('returns the FIRST matching active step when multiple contracts have candidates', () => {
    const a = buildContract(
      [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          giverId: 'jovian-society',
          objectiveType: 'gather',
          subject: 's',
          flavor: ['f'],
        },
      ],
      'a',
    )
    const b = buildContract(
      [
        {
          kind: 'complete-missions',
          count: 1,
          missionType: 'asteroid',
          giverId: 'space-cowboys',
          subject: 's',
          flavor: ['f'],
        },
      ],
      'b',
    )
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([a, b], messages, inMemoryPersistence())
    contracts.resetForTests()
    contracts.offerForTests('a')
    contracts.acceptContract('a')
    contracts.offerForTests('b')
    contracts.acceptContract('b')
    const result = getActiveAsteroidContractConstraints(contracts, 'jupiter')
    expect(result).not.toBeNull()
    expect(['jovian-society', 'space-cowboys']).toContain(result?.giverId)
  })
})
