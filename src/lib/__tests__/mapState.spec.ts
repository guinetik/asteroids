import { describe, it, expect } from 'vitest'
import { MapState } from '../mapState'

describe('MapState', () => {
  it('starts in closed state', () => {
    const state = new MapState()
    expect(state.phase).toBe('closed')
    expect(state.isOpen).toBe(false)
  })

  it('transitions from closed to opening on open()', () => {
    const state = new MapState()
    const result = state.open()
    expect(result).toBe(true)
    expect(state.phase).toBe('opening')
  })

  it('blocks open() when already opening', () => {
    const state = new MapState()
    state.open()
    expect(state.open()).toBe(false)
  })

  it('blocks open() when already open', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    expect(state.phase).toBe('open')
    expect(state.open()).toBe(false)
  })

  it('transitions opening → open after total transition duration', () => {
    const state = new MapState()
    state.open()
    state.tick(0.5)
    expect(state.phase).toBe('opening')
    state.tick(0.5)
    expect(state.phase).toBe('open')
  })

  it('transitions from open to closing on close()', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    const result = state.close()
    expect(result).toBe(true)
    expect(state.phase).toBe('closing')
  })

  it('transitions closing → closed after close duration', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    state.close()
    state.tick(0.5)
    expect(state.phase).toBe('closed')
    expect(state.isOpen).toBe(false)
  })

  it('blocks close() when already closed', () => {
    const state = new MapState()
    expect(state.close()).toBe(false)
  })

  it('reports isOpen for opening and open phases', () => {
    const state = new MapState()
    expect(state.isOpen).toBe(false)
    state.open()
    expect(state.isOpen).toBe(true)
    state.tick(2.0)
    expect(state.isOpen).toBe(true)
  })

  it('provides normalized transition progress', () => {
    const state = new MapState()
    state.open()
    expect(state.progress).toBeCloseTo(0)
    state.tick(0.5)
    expect(state.progress).toBeCloseTo(0.5)
    state.tick(0.5)
    expect(state.progress).toBeCloseTo(1)
  })

  it('progress goes 1→0 during closing', () => {
    const state = new MapState()
    state.open()
    state.tick(2.0)
    state.close()
    expect(state.progress).toBeCloseTo(1)
    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0.5)
    state.tick(0.25)
    expect(state.progress).toBeCloseTo(0)
  })
})
