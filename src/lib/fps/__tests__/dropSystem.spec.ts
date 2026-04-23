/**
 * Unit tests for the FPS-layer drop / pickup pipeline.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/contracts-cinderline.md
 */
import { describe, it, expect, vi } from 'vitest'
import { DropSystem, createContractDropPolicy, type DropPolicy } from '../dropSystem'
import type { ContractSystem } from '@/lib/contracts/ContractSystem'
import type { Contract, ContractInstance } from '@/lib/contracts/contractTypes'

const ALWAYS_ARMED: DropPolicy = { isItemArmed: () => true }
const NEVER_ARMED: DropPolicy = { isItemArmed: () => false }

describe('DropSystem', () => {
  it('does not spawn pickups when policy disarms the item', () => {
    const system = new DropSystem({ policy: NEVER_ARMED })
    const result = system.spawnFor('viroid-psychosphere', { x: 0, y: 0, z: 0 })
    expect(result).toBeNull()
    expect(system.pickups).toHaveLength(0)
  })

  it('spawns pickups when policy is armed and offsets them above ground', () => {
    const system = new DropSystem({ policy: ALWAYS_ARMED, spawnYOffset: 1 })
    const pickup = system.spawnFor('viroid-psychosphere', { x: 5, y: 2, z: -3 })
    expect(pickup).not.toBeNull()
    expect(pickup!.itemId).toBe('viroid-psychosphere')
    expect(pickup!.position).toEqual({ x: 5, y: 3, z: -3 })
    expect(system.pickups).toHaveLength(1)
  })

  it('only collects pickups within the configured radius', () => {
    const onPickup = vi.fn()
    const system = new DropSystem({
      policy: ALWAYS_ARMED,
      pickupRadius: 1.0,
      spawnYOffset: 0,
      onPickup,
    })
    system.spawnFor('viroid-psychosphere', { x: 0, y: 0, z: 0 })
    system.spawnFor('viroid-psychosphere', { x: 10, y: 0, z: 0 })

    const collected = system.tick(1 / 60, { x: 0.5, y: 0, z: 0 })
    expect(collected).toHaveLength(1)
    expect(system.pickups).toHaveLength(1)
    expect(onPickup).toHaveBeenCalledTimes(1)
    expect(onPickup).toHaveBeenCalledWith(collected[0])
  })

  it('removes collected pickups so the next tick will not double-fire', () => {
    const onPickup = vi.fn()
    const system = new DropSystem({ policy: ALWAYS_ARMED, pickupRadius: 2, spawnYOffset: 0, onPickup })
    system.spawnFor('viroid-psychosphere', { x: 0, y: 0, z: 0 })
    system.tick(1 / 60, { x: 0, y: 0, z: 0 })
    system.tick(1 / 60, { x: 0, y: 0, z: 0 })
    expect(onPickup).toHaveBeenCalledTimes(1)
    expect(system.pickups).toHaveLength(0)
  })

  it('clear() drops all live pickups', () => {
    const system = new DropSystem({ policy: ALWAYS_ARMED })
    system.spawnFor('viroid-psychosphere', { x: 0, y: 0, z: 0 })
    system.spawnFor('viroid-psychosphere', { x: 1, y: 0, z: 1 })
    system.clear()
    expect(system.pickups).toHaveLength(0)
  })

  it('isolates listener errors from each other and from spawn flow', () => {
    const onPickup = vi.fn(() => {
      throw new Error('host failure')
    })
    const system = new DropSystem({ policy: ALWAYS_ARMED, pickupRadius: 2, spawnYOffset: 0, onPickup })
    system.spawnFor('viroid-psychosphere', { x: 0, y: 0, z: 0 })
    expect(() => system.tick(1 / 60, { x: 0, y: 0, z: 0 })).not.toThrow()
    expect(onPickup).toHaveBeenCalled()
  })
})

describe('createContractDropPolicy', () => {
  function buildContractSystemStub(
    contracts: Record<string, Contract>,
    instances: ContractInstance[],
  ): ContractSystem {
    return {
      listInstances: () => instances,
      getContract: (id: string) => contracts[id] ?? null,
    } as unknown as ContractSystem
  }

  const harvestContract: Contract = {
    id: 'cinderline-stub',
    inboxName: 'Anvil',
    from: 'Anvil',
    sentAt: '2306-04-05',
    introSubject: 'i',
    introBody: ['i'],
    steps: [
      { kind: 'collect-drops', itemId: 'viroid-psychosphere', count: 5, subject: 's', flavor: ['f'] },
    ],
    completionSubject: 'c',
    completionBody: ['c'],
    rewards: [],
  }

  it('returns true only when an active contract step matches the item id', () => {
    const policy = createContractDropPolicy(buildContractSystemStub(
      { [harvestContract.id]: harvestContract },
      [{
        contractId: harvestContract.id,
        status: 'active',
        currentStepIndex: 0,
        stepCounters: [0],
        offeredAt: '2306-04-05',
        acceptedAt: '2306-04-05',
        completedAt: null,
      }],
    ))
    expect(policy.isItemArmed('viroid-psychosphere')).toBe(true)
    expect(policy.isItemArmed('olivine')).toBe(false)
  })

  it('returns false when matching contract is not active', () => {
    const policy = createContractDropPolicy(buildContractSystemStub(
      { [harvestContract.id]: harvestContract },
      [{
        contractId: harvestContract.id,
        status: 'completed',
        currentStepIndex: 0,
        stepCounters: [5],
        offeredAt: '2306-04-05',
        acceptedAt: '2306-04-05',
        completedAt: '2306-04-05',
      }],
    ))
    expect(policy.isItemArmed('viroid-psychosphere')).toBe(false)
  })

  it('returns false when there are no active instances', () => {
    const policy = createContractDropPolicy(buildContractSystemStub({}, []))
    expect(policy.isItemArmed('viroid-psychosphere')).toBe(false)
  })
})
