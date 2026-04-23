import { describe, it, expect, beforeEach } from 'vitest'
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

  it('defaults to weapon mode', () => {
    expect(state.mode).toBe('weapon')
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

  it('hold trigger: fires immediately on press while aiming', () => {
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('hold trigger: waits for the configured interval before firing again', () => {
    // Drill fireRate in multitool-config.json: interval = 1 / fireRate (e.g. 12 Hz => ~0.0833s)
    const interval = 1 / (multiToolConfigJson as MultiToolConfig).modes.drill.fireRate!
    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)
    state.setInput(true, false)
    state.tick(0.05)
    expect(state.isFiring).toBe(false)
    state.setInput(true, false)
    state.tick(interval - 0.016 - 0.05 + 0.001)
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

  it('hold trigger: still fires every frame when no fireRate is configured', () => {
    const config = structuredClone(multiToolConfigJson as MultiToolConfig)
    delete config.modes.drill.fireRate
    state = new MultiToolState(config)

    state.setMode('drill')
    state.setAiming(true)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('drill stays locked after depletion until recharged to at least 50%', () => {
    state.setMode('drill')
    state.setAiming(true)

    // One long tick while firing: drain must cover full mode capacity (see multitool-config drill burn/capacity)
    state.setInput(true, true)
    state.tick(0.31)
    expect(state.isFiring).toBe(true)
    expect(state.modeCharge).toBe(0)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(1.5)
    expect(state.modeCharge).toBeGreaterThan(0)
    expect(state.modeCharge).toBeLessThan(state.modeChargeCapacity * 0.5)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(0.5)
    expect(state.modeCharge).toBeGreaterThanOrEqual(state.modeChargeCapacity * 0.5)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(0.016)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('drill requires releasing the trigger after recovery before firing again', () => {
    state.setMode('drill')
    state.setAiming(true)

    state.setInput(true, true)
    state.tick(0.31)
    expect(state.isFiring).toBe(true)
    expect(state.modeCharge).toBe(0)

    state.setInput(true, false)
    state.tick(2.1)
    expect(state.modeCharge).toBeGreaterThanOrEqual(state.modeChargeCapacity * 0.5)
    expect(state.isFiring).toBe(false)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('drill enters recovery lock even when charge is too low to fire before exact zero', () => {
    state.setMode('drill')
    state.setAiming(true)

    state.setInput(true, true)
    state.tick(0.24)
    expect(state.modeCharge).toBeGreaterThan(0)
    expect(state.modeCharge).toBeLessThan(state.modeChargeCapacity * 0.5)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(2.1)
    expect(state.modeCharge).toBeGreaterThanOrEqual(state.modeChargeCapacity * 0.5)

    state.setInput(true, false)
    state.tick(0.016)
    expect(state.isFiring).toBe(false)

    state.setInput(false, false)
    state.tick(0.016)
    state.setInput(true, true)
    state.tick(0.016)
    expect(state.isFiring).toBe(true)
  })

  it('partially depleted drill recharges at 1.5x the default rate', () => {
    state.setMode('drill')
    state.setAiming(true)

    state.setInput(true, true)
    state.tick(0.1)
    expect(state.modeCharge).toBe(20)

    state.setInput(false, false)
    state.tick(1)
    expect(state.modeCharge).toBe(30)
  })

  it('fully depleted drill keeps the default recharge rate until 50% recovery', () => {
    state.setMode('drill')
    state.setAiming(true)

    state.setInput(true, true)
    state.tick(0.31)
    expect(state.modeCharge).toBe(0)

    state.setInput(false, false)
    state.tick(1)
    expect(state.modeCharge).toBe(8)
    expect(state.modeCharge).toBeLessThan(state.modeChargeCapacity * 0.5)
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

  // --- Config access ---

  it('exposes mode config for current mode', () => {
    state.setMode('weapon')
    const cfg = state.modeConfig
    expect(cfg.label).toBe('LAS')
    expect(cfg.color).toBe('#ff00ff')
    expect(cfg.trigger).toBe('auto')
  })
})
