import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MultiToolState } from '../multiToolState'
import type { MultiToolConfig } from '../multiToolState'
import multiToolConfigJson from '@/data/fps/multitool-config.json'

function createState(): MultiToolState {
  return new MultiToolState(multiToolConfigJson as MultiToolConfig)
}

describe('MultiToolState', () => {
  let state: MultiToolState

  beforeEach(() => {
    state = createState()
  })

  it('defaults to drill mode', () => {
    expect(state.mode).toBe('drill')
  })

  it('switches mode via setMode', () => {
    state.setMode('weapon')
    expect(state.mode).toBe('weapon')
  })

  it('defaults to not aiming', () => {
    expect(state.aiming).toBe(false)
  })

  it('sets aiming state', () => {
    state.setAiming(true)
    expect(state.aiming).toBe(true)
  })

  it('isFiring is false by default', () => {
    expect(state.isFiring).toBe(false)
  })

  // --- Trigger: hold (drill) ---

  it('hold trigger: fires every frame while mouse held + aiming', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('hold trigger: keeps firing while mouse held', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('hold trigger: does not fire without aiming', () => {
    state.setMode('drill')
    state.setAiming(false)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  it('hold trigger: stops firing when mouse released', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  // --- Trigger: auto (weapon) ---

  it('auto trigger: fires at fixed rate while held + aiming', () => {
    state.setMode('weapon')
    state.setAiming(true)
    // fireRate = 5, so 1 shot every 0.2s
    state.setInput(true, true)
    state.tick(0.016) // first frame always fires
    expect(state.isFiring).toBe(true)
    // Tick small amounts — should not fire until 0.2s
    state.setInput(true, false)
    state.tick(0.1)
    expect(state.isFiring).toBe(false)
    state.setInput(true, false)
    state.tick(0.11) // total 0.21s > 0.2s interval
    expect(state.isFiring).toBe(true)
  })

  it('auto trigger: resets timer when mouse released', () => {
    state.setMode('weapon')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.1)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
    // Next press should fire immediately
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  // --- Trigger: click (heal) ---

  it('click trigger: fires once on mouse down', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('click trigger: does not fire while held (must release)', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  it('click trigger: fires again after release + re-press', () => {
    state.setMode('heal')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    state.setInput(false, false)
    state.tick(0.016)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  // --- isFiring resets each tick ---

  it('isFiring resets to false at start of tick', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
  })

  // --- Console log on fire ---

  it('logs to console when firing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    state.setMode('weapon')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(spy).toHaveBeenCalledWith('[MultiTool] fire: weapon')
    spy.mockRestore()
  })

  // --- Config access ---

  it('exposes mode config for current mode', () => {
    state.setMode('weapon')
    const cfg = state.modeConfig
    expect(cfg.label).toBe('LAS')
    expect(cfg.color).toBe('#ff00ff')
    expect(cfg.trigger).toBe('auto')
  })
})
