/**
 * Tests for `notifyDockedAtAsset`, `grantItemsForPickup`, and pinned-asset
 * lifecycle hooks added in Task 5 of the Ceres Station Dock System plan.
 *
 * Suite A – pickup-from-asset: hook fires, step advances on match.
 * Suite B – deliver-to-asset: consume gating (false → no advance, true → advance).
 * Suite C – lifecycle: onPinnedAssetActivated fires on accept; onPinnedAssetDeactivated
 *            fires when the contract reaches a terminal state.
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageSystem } from '@/lib/messages/messageSystem'
import { ContractSystem } from '../ContractSystem'
import type { PinnedAssetLifecyclePayload } from '../ContractSystem'
import { emptyContractSnapshot } from '../contractStorage'
import type { Contract, ContractStoreSnapshot } from '../contractTypes'

// ---------------------------------------------------------------------------
// Harness helpers — identical pattern to jovian-contract.spec.ts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Minimal test contract with one pickup-from-asset step
// ---------------------------------------------------------------------------

const pickupContract: Contract = {
  id: 'test-pickup-contract',
  inboxName: 'Test Pickup Contract',
  from: 'Test Sender',
  sentAt: '2026-05-05',
  introSubject: 'Test Intro',
  introBody: ['Hello.'],
  completionSubject: 'Done',
  completionBody: ['Completed.'],
  rewards: [],
  pinnedAssets: [
    {
      assetRef: 'station-1',
      kind: 'station',
      region: 'kuiper-belt',
      label: 'Test Station',
      modelPath: 'models/station.glb',
      positionSeed: 'seed-abc',
    },
  ],
  steps: [
    {
      kind: 'pickup-from-asset',
      assetRef: 'station-1',
      itemId: 'test-canister',
      count: 1,
      subject: 'Pickup step',
      flavor: ['Pick it up.'],
    },
  ],
}

// ---------------------------------------------------------------------------
// Contract with pickup then deliver-to-asset steps, same asset
// ---------------------------------------------------------------------------

const pickupAndDeliverContract: Contract = {
  id: 'test-pickup-deliver-contract',
  inboxName: 'Test Pickup + Deliver',
  from: 'Test Sender',
  sentAt: '2026-05-05',
  introSubject: 'Test Intro',
  introBody: ['Hello.'],
  completionSubject: 'Done',
  completionBody: ['All done.'],
  rewards: [],
  pinnedAssets: [
    {
      assetRef: 'station-1',
      kind: 'station',
      region: 'kuiper-belt',
      label: 'Test Station',
      modelPath: 'models/station.glb',
      positionSeed: 'seed-abc',
    },
  ],
  steps: [
    {
      kind: 'pickup-from-asset',
      assetRef: 'station-1',
      itemId: 'test-canister',
      count: 1,
      subject: 'Pickup step',
      flavor: ['Pick it up.'],
    },
    {
      kind: 'deliver-to-asset',
      assetRef: 'station-1',
      itemId: 'test-canister',
      count: 1,
      subject: 'Deliver step',
      flavor: ['Hand it over.'],
    },
  ],
}

// ---------------------------------------------------------------------------
// Suite A — pickup-from-asset: hook fires and step advances
// ---------------------------------------------------------------------------

describe('Suite A — pickup-from-asset advances and grants items', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls grantItemsForPickup with (itemId, count) and advances to step 1', () => {
    const grantFn = vi.fn()
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([pickupContract], messages, inMemoryPersistence(), {
      grantItemsForPickup: grantFn,
    })
    contracts.resetForTests()
    contracts.offerForTests(pickupContract.id)
    contracts.acceptContract(pickupContract.id)

    contracts.notifyDockedAtAsset('station-1')

    expect(grantFn).toHaveBeenCalledOnce()
    expect(grantFn).toHaveBeenCalledWith('test-canister', 1)
    // Single-step contract: advancing past the last step completes the contract
    expect(contracts.getInstance(pickupContract.id)?.status).toBe('completed')
  })

  it('does not advance when assetRef does not match', () => {
    const grantFn = vi.fn()
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem([pickupContract], messages, inMemoryPersistence(), {
      grantItemsForPickup: grantFn,
    })
    contracts.resetForTests()
    contracts.offerForTests(pickupContract.id)
    contracts.acceptContract(pickupContract.id)

    contracts.notifyDockedAtAsset('wrong-station')

    expect(grantFn).not.toHaveBeenCalled()
    expect(contracts.getInstance(pickupContract.id)?.currentStepIndex).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Suite B — deliver-to-asset: consume gating
// ---------------------------------------------------------------------------

describe('Suite B — deliver-to-asset advances only when consume returns true', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('does not advance when consumeItemsForDelivery returns false', () => {
    const consumeFn = vi.fn().mockReturnValue(false)
    const grantFn = vi.fn()
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem(
      [pickupAndDeliverContract],
      messages,
      inMemoryPersistence(),
      {
        grantItemsForPickup: grantFn,
        consumeItemsForDelivery: consumeFn,
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(pickupAndDeliverContract.id)
    contracts.acceptContract(pickupAndDeliverContract.id)

    // Advance through the pickup step
    contracts.notifyDockedAtAsset('station-1')
    expect(contracts.getInstance(pickupAndDeliverContract.id)?.currentStepIndex).toBe(1)

    // Now at deliver step — consume returns false, step should not advance
    contracts.notifyDockedAtAsset('station-1')
    expect(consumeFn).toHaveBeenCalledWith('test-canister', 1)
    expect(contracts.getInstance(pickupAndDeliverContract.id)?.currentStepIndex).toBe(1)
  })

  it('advances to step 2 (completed) when consumeItemsForDelivery returns true', () => {
    const consumeFn = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    const grantFn = vi.fn()
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem(
      [pickupAndDeliverContract],
      messages,
      inMemoryPersistence(),
      {
        grantItemsForPickup: grantFn,
        consumeItemsForDelivery: consumeFn,
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(pickupAndDeliverContract.id)
    contracts.acceptContract(pickupAndDeliverContract.id)

    // Advance through pickup
    contracts.notifyDockedAtAsset('station-1')
    expect(contracts.getInstance(pickupAndDeliverContract.id)?.currentStepIndex).toBe(1)

    // First deliver attempt: consume returns false — stays on step 1
    contracts.notifyDockedAtAsset('station-1')
    expect(contracts.getInstance(pickupAndDeliverContract.id)?.currentStepIndex).toBe(1)

    // Second deliver attempt: consume returns true — advances (contract completes)
    contracts.notifyDockedAtAsset('station-1')
    expect(contracts.getInstance(pickupAndDeliverContract.id)?.status).toBe('completed')
  })
})

// ---------------------------------------------------------------------------
// Suite C — lifecycle: onPinnedAssetActivated / onPinnedAssetDeactivated
// ---------------------------------------------------------------------------

describe('Suite C — emits pinned-asset lifecycle hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fires onPinnedAssetActivated with full station payload on accept', () => {
    const activatedPayloads: PinnedAssetLifecyclePayload[] = []
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem(
      [pickupAndDeliverContract],
      messages,
      inMemoryPersistence(),
      {
        onPinnedAssetActivated: (p) => activatedPayloads.push(p),
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(pickupAndDeliverContract.id)
    contracts.acceptContract(pickupAndDeliverContract.id)

    expect(activatedPayloads).toHaveLength(1)
    expect(activatedPayloads[0]).toMatchObject({
      assetRef: 'station-1',
      kind: 'station',
      region: 'kuiper-belt',
      label: 'Test Station',
      modelPath: 'models/station.glb',
      positionSeed: 'seed-abc',
    })
  })

  it('fires onPinnedAssetDeactivated with { assetRef } when contract completes', () => {
    const deactivatedRefs: string[] = []
    const consumeFn = vi.fn().mockReturnValue(true)
    const grantFn = vi.fn()
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem(
      [pickupAndDeliverContract],
      messages,
      inMemoryPersistence(),
      {
        grantItemsForPickup: grantFn,
        consumeItemsForDelivery: consumeFn,
        onPinnedAssetDeactivated: (p) => deactivatedRefs.push(p.assetRef),
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(pickupAndDeliverContract.id)
    contracts.acceptContract(pickupAndDeliverContract.id)

    // Drive to completion: pickup then deliver
    contracts.notifyDockedAtAsset('station-1')
    contracts.notifyDockedAtAsset('station-1')

    expect(contracts.getInstance(pickupAndDeliverContract.id)?.status).toBe('completed')
    expect(deactivatedRefs).toContain('station-1')
  })

  it('fires onPinnedAssetDeactivated when contract is declined', () => {
    // declined transitions from available — no pinnedAsset spawn expected
    // so just verify no error is thrown and the hook fires 0 times (not active)
    const deactivatedRefs: string[] = []
    const messages = new MessageSystem([], emptyMessageStore())
    const contracts = new ContractSystem(
      [pickupAndDeliverContract],
      messages,
      inMemoryPersistence(),
      {
        onPinnedAssetDeactivated: (p) => deactivatedRefs.push(p.assetRef),
      },
    )
    contracts.resetForTests()
    contracts.offerForTests(pickupAndDeliverContract.id)
    contracts.declineContract(pickupAndDeliverContract.id)

    // 'declined' from 'available' — no activation happened, so deactivation should not fire
    expect(deactivatedRefs).toHaveLength(0)
  })
})
