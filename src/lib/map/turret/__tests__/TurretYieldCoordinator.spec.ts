import { describe, it, expect, vi } from 'vitest'
import { Vector3 } from 'three'
import { TurretYieldCoordinator, type TurretInstanceHandle } from '../TurretYieldCoordinator'

function makeHandle(overrides: Partial<TurretInstanceHandle> = {}): TurretInstanceHandle {
  return {
    beltMeshIndex: 0,
    localIndex: 0,
    worldPosition: new Vector3(),
    radius: 1,
    tierId: 'small',
    ...overrides,
  }
}

describe('TurretYieldCoordinator', () => {
  it('assigns unique spawnIndex across registrations', () => {
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    const a = coord.register(makeHandle({ localIndex: 0 }))
    const b = coord.register(makeHandle({ localIndex: 1 }))
    const c = coord.register(makeHandle({ beltMeshIndex: 1, localIndex: 0 }))
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a).not.toBe(c)
  })

  it('commits a whole unit once fractional buffer exceeds 1kg', () => {
    const commit = vi.fn(() => ({ ok: true as const }))
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 0.4, 0)
    expect(commit).not.toHaveBeenCalled()
    coord.acceptYield('iron', 0.5, 0)
    expect(commit).not.toHaveBeenCalled()
    coord.acceptYield('iron', 0.2, 0)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('iron')
  })

  it('commits multiple units when buffer crosses multiple thresholds', () => {
    const commit = vi.fn(() => ({ ok: true as const }))
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 3.7, 0)
    expect(commit).toHaveBeenCalledTimes(3)
  })

  it('stops buffer draining on commit failure and fires onPickupFailed', () => {
    const commit = vi.fn(() => ({ ok: false as const, reason: 'Inventory full' }))
    const failed = vi.fn()
    const coord = new TurretYieldCoordinator({
      commitOneUnit: commit,
      onInstanceConsumed: () => {},
      onPickupFailed: failed,
    })
    coord.register(makeHandle())
    coord.acceptYield('iron', 3.5, 0)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(failed).toHaveBeenCalledTimes(1)
    expect(failed).toHaveBeenCalledWith('iron', 'Inventory full')
  })

  it('onInstanceConsumed fires with the stored handle on depletion', () => {
    const consumed = vi.fn()
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: consumed,
      onPickupFailed: () => {},
    })
    const handle = makeHandle({ beltMeshIndex: 2, localIndex: 7 })
    coord.register(handle)
    coord.notifyDepleted(0)
    expect(consumed).toHaveBeenCalledTimes(1)
    expect(consumed.mock.calls[0]![0]).toBe(handle)
  })

  it('resolveInstance returns the handle for a known spawnIndex and null otherwise', () => {
    const coord = new TurretYieldCoordinator({
      commitOneUnit: () => ({ ok: true }),
      onInstanceConsumed: () => {},
      onPickupFailed: () => {},
    })
    const handle = makeHandle({ localIndex: 3 })
    const idx = coord.register(handle)
    expect(coord.resolveInstance(idx)).toBe(handle)
    expect(coord.resolveInstance(99999)).toBeNull()
  })
})
