import { describe, it, expect } from 'vitest'
import { createTurretAimState, tickTurretAim } from '../TurretAimState'
import { TURRET_MOUSE_SENSITIVITY, TURRET_PITCH_LIMIT } from '../turretConstants'

describe('tickTurretAim', () => {
  it('starts at zero on all axes', () => {
    const state = createTurretAimState()
    expect(state.baseYaw).toBe(0)
    expect(state.conePitch).toBe(0)
  })

  it('right mouse (positive mouseDx) decreases baseYaw (looks right)', () => {
    const state = createTurretAimState()
    const next = tickTurretAim(state, { mouseDx: 10, mouseDy: 0 })
    expect(next.baseYaw).toBeCloseTo(-10 * TURRET_MOUSE_SENSITIVITY, 6)
  })

  it('does not drift under neutral input', () => {
    const state = createTurretAimState()
    const n1 = tickTurretAim(state, { mouseDx: 0, mouseDy: 0 })
    const n2 = tickTurretAim(n1, { mouseDx: 0, mouseDy: 0 })
    expect(n2.baseYaw).toBe(0)
    expect(n2.conePitch).toBe(0)
  })

  it('baseYaw is unclamped — full 360° rotation allowed', () => {
    let state = createTurretAimState()
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { mouseDx: 100, mouseDy: 0 })
    }
    expect(Math.abs(state.baseYaw)).toBeGreaterThan(Math.PI * 4)
  })

  it('clamps conePitch at the positive pitch limit', () => {
    let state = createTurretAimState()
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { mouseDx: 0, mouseDy: -100 })
    }
    expect(state.conePitch).toBeLessThanOrEqual(TURRET_PITCH_LIMIT)
    expect(state.conePitch).toBeGreaterThan(0)
  })

  it('clamps conePitch at the negative pitch limit', () => {
    let state = createTurretAimState()
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { mouseDx: 0, mouseDy: 100 })
    }
    expect(state.conePitch).toBeGreaterThanOrEqual(-TURRET_PITCH_LIMIT)
  })
})
