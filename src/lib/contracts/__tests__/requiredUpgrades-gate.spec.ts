/**
 * Tests for the requiredUpgrades offer prerequisite — contract is offered only
 * when the player has every listed upgrade at >= minLevel AND every other
 * prerequisite is satisfied.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-ceres-institute-contract-design.md
 */
import { describe, expect, it } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type { Contract, ContractStoreSnapshot } from '../contractTypes'

const fixture: Contract = {
  id: 'requiredUpgrades-fixture',
  inboxName: 'Test Institute',
  from: 'Test Liaison',
  sentAt: '2306-05-04 00:00 UTC',
  offerWhenPrerequisites: {
    requiredUpgrades: [
      { upgradeId: 'gravitySurfing', minLevel: 1 },
      { upgradeId: 'orbitalSurfing', minLevel: 1 },
    ],
    triggerOnPlanetVisited: 'ceres',
  },
  introSubject: 'Hello',
  introBody: ['hi'],
  steps: [
    {
      kind: 'visit-planet',
      planetId: 'ceres',
      subject: 'Step 1',
      flavor: ['x'],
    },
  ],
  completionSubject: 'Done',
  completionBody: ['done'],
  rewards: [],
}

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

describe('requiredUpgrades offer prerequisite', () => {
  it('does NOT offer when the player has no upgrades and visits the planet', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 0,
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)).toBeNull()
  })

  it('does NOT offer when only one of the required upgrades is installed', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: (id) => (id === 'gravitySurfing' ? 1 : 0),
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)).toBeNull()
  })

  it('offers when both required upgrades are installed AND the planet is visited', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 1,
    })
    system.notifyPlanetVisited('ceres')
    expect(system.getInstance(fixture.id)?.status).toBe('available')
  })

  it('does NOT offer when upgrades are present but the trigger planet has not been visited', () => {
    const messages = new MessageSystem([], emptyMessageStore())
    const system = new ContractSystem([fixture], messages, inMemoryPersistence(), {
      getInstalledUpgradeLevel: () => 1,
    })
    expect(system.getInstance(fixture.id)).toBeNull()
  })
})
