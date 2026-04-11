import { describe, it, expect, vi } from 'vitest'
import { DefaultOrbitalMiniGame } from '../DefaultOrbitalMiniGame'
import type { OrbitalMiniGameContext } from '../OrbitalMiniGame'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'venus',
  distanceToPlanet: 100,
}

describe('DefaultOrbitalMiniGame', () => {
  it('starts with active status and one step', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(mg.status).toBe('active')
    expect(mg.missionId).toBe('test-mission')
    expect(mg.steps).toHaveLength(1)
    expect(mg.steps[0]!.label).toBe('Complete Mission')
    expect(mg.steps[0]!.active).toBe(true)
    expect(mg.steps[0]!.complete).toBe(false)
  })

  it('has null progress values', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(mg.progressCurrent).toBeNull()
    expect(mg.progressTotal).toBeNull()
  })

  it('complete() transitions status to completed', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    mg.complete()
    expect(mg.status).toBe('completed')
    expect(mg.steps[0]!.complete).toBe(true)
    expect(mg.steps[0]!.active).toBe(false)
  })

  it('complete() fires onComplete callback with mission id', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onComplete = cb
    mg.complete()
    expect(cb).toHaveBeenCalledWith('test-mission')
  })

  it('complete() fires onStepChange callback', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onStepChange = cb
    mg.complete()
    expect(cb).toHaveBeenCalledOnce()
    expect(cb.mock.calls[0]![0][0].complete).toBe(true)
  })

  it('complete() is idempotent — second call is no-op', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    const cb = vi.fn()
    mg.onComplete = cb
    mg.complete()
    mg.complete()
    expect(cb).toHaveBeenCalledOnce()
  })

  it('tick() is a no-op — status stays active', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    mg.tick(0.016, STUB_CTX)
    mg.tick(1.0, STUB_CTX)
    expect(mg.status).toBe('active')
  })

  it('dispose() does not throw', () => {
    const mg = new DefaultOrbitalMiniGame('test-mission')
    expect(() => mg.dispose()).not.toThrow()
  })
})
