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

  it('tick() advances transitioning_in to waking_up after 0.8s', () => {
    state.enter()
    expect(state.progress).toBeCloseTo(0, 5)

    state.tick(0.4)
    expect(state.progress).toBeCloseTo(0.5, 5)
    expect(state.phase).toBe('transitioning_in')

    state.tick(0.4)
    expect(state.phase).toBe('waking_up')
  })

  it('tick() advances waking_up to habitat after 3.0s', () => {
    state.enter()
    state.tick(0.8) // → waking_up
    expect(state.phase).toBe('waking_up')
    expect(state.progress).toBeCloseTo(0, 5)

    state.tick(1.5)
    expect(state.progress).toBeCloseTo(0.5, 5)
    expect(state.phase).toBe('waking_up')

    state.tick(1.5)
    expect(state.phase).toBe('habitat')
    expect(state.progress).toBe(1)
  })

  it('leave() transitions habitat to transitioning_out, returns true', () => {
    state.enter()
    state.tick(0.8) // → waking_up
    state.tick(3.0) // → habitat
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
    state.tick(0.8) // → waking_up
    state.tick(3.0) // → habitat
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
