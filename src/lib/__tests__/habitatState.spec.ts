import { describe, it, expect, beforeEach } from 'vitest'
import { HabitatState } from '../habitatState'

describe('HabitatState', () => {
  let state: HabitatState

  beforeEach(() => {
    state = new HabitatState()
  })

  it('starts in map phase, isActive is false, progress is 0', () => {
    expect(state.phase).toBe('map')
    expect(state.isActive).toBe(false)
    expect(state.progress).toBe(0)
  })

  it('enter() transitions to transitioning_in, returns true, isActive is true', () => {
    const result = state.enter()
    expect(result).toBe(true)
    expect(state.phase).toBe('transitioning_in')
    expect(state.isActive).toBe(true)
  })

  it('enter() blocked when not in map phase', () => {
    state.enter()
    const result = state.enter()
    expect(result).toBe(false)
    expect(state.phase).toBe('transitioning_in')
  })

  it('tick() advances transitioning_in to habitat after 0.8s, progress goes 0→1', () => {
    state.enter()
    expect(state.progress).toBeCloseTo(0, 5)

    state.tick(0.4)
    expect(state.progress).toBeCloseTo(0.5, 5)
    expect(state.phase).toBe('transitioning_in')

    state.tick(0.4)
    expect(state.phase).toBe('habitat')
    expect(state.progress).toBe(1)
  })

  it('leave() transitions habitat to transitioning_out, returns true', () => {
    state.enter()
    state.tick(0.8)
    expect(state.phase).toBe('habitat')

    const result = state.leave()
    expect(result).toBe(true)
    expect(state.phase).toBe('transitioning_out')
  })

  it('leave() blocked when not in habitat phase', () => {
    const result = state.leave()
    expect(result).toBe(false)
    expect(state.phase).toBe('map')
  })

  it('tick() advances transitioning_out to map after 0.5s, progress goes 1→0', () => {
    state.enter()
    state.tick(0.8)
    state.leave()
    expect(state.progress).toBeCloseTo(1, 5)

    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0.5, 5)
    expect(state.phase).toBe('transitioning_out')

    state.tick(0.25)
    expect(state.phase).toBe('map')
    expect(state.progress).toBe(0)
  })
})
