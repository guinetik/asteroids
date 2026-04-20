import { describe, it, expect, vi } from 'vitest'
import { TelescopeAlignmentMiniGame } from '../TelescopeAlignmentMiniGame'

describe('TelescopeAlignmentMiniGame', () => {
  it('starts in active status with three steps, second step active', () => {
    const g = new TelescopeAlignmentMiniGame('earth_l2_observatory_phasing')
    expect(g.status).toBe('active')
    expect(g.steps).toHaveLength(3)
    expect(g.steps[0]?.complete).toBe(true)
    expect(g.steps[1]?.active).toBe(true)
    expect(g.steps[2]?.active).toBe(false)
  })

  it('advertises overlay presentation', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    expect(g.presentation).toBe('overlay')
  })

  it('reports progress based on reported quality (0..100)', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    g.reportQuality(0.5)
    expect(g.progressCurrent).toBe(50)
    expect(g.progressTotal).toBe(100)
  })

  it('complete() transitions to completed and fires onComplete exactly once', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    const spy = vi.fn()
    g.onComplete = spy
    g.complete()
    g.complete()
    expect(g.status).toBe('completed')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('m1')
  })

  it('complete() marks the active step done and fires onStepChange', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    const stepSpy = vi.fn()
    g.onStepChange = stepSpy
    g.complete()
    expect(g.steps[1]?.complete).toBe(true)
    expect(g.steps[2]?.complete).toBe(true)
    expect(stepSpy).toHaveBeenCalledTimes(1)
  })

  it('tick is a no-op and does not change status', () => {
    const g = new TelescopeAlignmentMiniGame('m1')
    g.tick(0.016, {
      shipPosition: { x: 0, y: 0, z: 0 },
      orbitState: 'orbiting',
      orbitedPlanetId: 'earth',
      distanceToPlanet: 100,
    })
    expect(g.status).toBe('active')
  })
})
