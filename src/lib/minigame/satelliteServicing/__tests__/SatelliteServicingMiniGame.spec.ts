import { describe, it, expect, vi } from 'vitest'
import { SatelliteServicingMiniGame } from '../SatelliteServicingMiniGame'

describe('SatelliteServicingMiniGame', () => {
  it('reports presentation "in_scene"', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    expect(mg.presentation).toBe('in_scene')
  })

  it('starts with progress 0 / total = brokenComponents length', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b', 'c'])
    expect(mg.progressCurrent).toBe(0)
    expect(mg.progressTotal).toBe(3)
  })

  it('markRepaired increments progress and ignores duplicates', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    mg.markRepaired('a')
    expect(mg.progressCurrent).toBe(1)
    mg.markRepaired('a')
    expect(mg.progressCurrent).toBe(1)
  })

  it('markRepaired ignores unknown component names', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    mg.markRepaired('zzz')
    expect(mg.progressCurrent).toBe(0)
  })

  it('fires onComplete exactly once when all components are repaired', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a', 'b'])
    const spy = vi.fn()
    mg.onComplete = spy
    mg.markRepaired('a')
    expect(spy).not.toHaveBeenCalled()
    mg.markRepaired('b')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('mid')
    // Calling complete again is a no-op.
    mg.complete()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('handles zero-component input by completing immediately on complete()', () => {
    const mg = new SatelliteServicingMiniGame('mid', [])
    const spy = vi.fn()
    mg.onComplete = spy
    mg.complete()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mg.status).toBe('completed')
  })

  it('markRepaired after completion is a no-op', () => {
    const mg = new SatelliteServicingMiniGame('mid', ['a'])
    mg.complete()
    mg.markRepaired('a')
    expect(mg.progressCurrent).toBe(0)
  })
})
