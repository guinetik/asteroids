import { describe, expect, it, vi } from 'vitest'
import {
  GravitationalEvent,
  GRAVITATIONAL_EVENT_FINISH,
  GRAVITATIONAL_EVENT_START,
} from '@/lib/physics/gravitationalEvent'

describe('GravitationalEvent', () => {
  it('dispatches start once then moves along direction', () => {
    const onStart = vi.fn()
    const ev = new GravitationalEvent('test-1', 0, 0, 1, 0, 50, 10, 3e-5, 3)
    ev.addEventListener(GRAVITATIONAL_EVENT_START, onStart)

    expect(ev.tick(0.1)).toBe(true)
    expect(onStart).toHaveBeenCalledTimes(1)
    const d = onStart.mock.calls[0]![0] as CustomEvent
    expect(d.detail.x).toBe(0)
    expect(d.detail.z).toBe(0)
    expect(ev.positionX).toBeCloseTo(5)
    expect(ev.positionZ).toBeCloseTo(0)
  })

  it('dispatches finish and returns false when duration elapses', () => {
    const onFinish = vi.fn()
    const ev = new GravitationalEvent('test-2', 100, 200, 0, 1, 10, 1, 2e-5, 2)
    ev.addEventListener(GRAVITATIONAL_EVENT_FINISH, onFinish)

    expect(ev.tick(1)).toBe(false)
    expect(onFinish).toHaveBeenCalledTimes(1)
    const d = onFinish.mock.calls[0]![0] as CustomEvent
    expect(d.detail.id).toBe('test-2')
    expect(ev.tick(0)).toBe(false)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('toGravitySource matches position and mass', () => {
    const ev = new GravitationalEvent('id', 7, 9, 1, 0, 0, 99, 4e-5, 2.5)
    ev.tick(0)
    const g = ev.toGravitySource()
    expect(g.x).toBe(7)
    expect(g.z).toBe(9)
    expect(g.mass).toBe(4e-5)
    expect(g.wellWidthMultiplier).toBe(2.5)
  })
})

describe('GravitationalEventManager', () => {
  it('only exposes grid sources within proximity of observer', async () => {
    const { GravitationalEventManager } = await import('@/lib/physics/gravitationalEvent')
    const mgr = new GravitationalEventManager({
      worldHalfExtent: 500,
      renderProximityRadius: 50,
      maxConcurrent: 5,
      autoSpawnEnabled: false,
    })
    mgr.spawnRandomInWorld({ x: 0, z: 0, durationSec: 10, speed: 0, gridMass: 3e-5, wellWidthMultiplier: 3 })

    const near = mgr.getGridSourcesNear(0, 0)
    expect(near).toHaveLength(1)

    const far = mgr.getGridSourcesNear(5000, 5000)
    expect(far).toHaveLength(0)

    mgr.clear()
    expect(mgr.activeCount).toBe(0)
  })
})
