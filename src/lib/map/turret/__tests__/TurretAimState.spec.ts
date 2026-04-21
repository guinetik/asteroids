import { describe, it, expect } from 'vitest'
import { createTurretAimState, tickTurretAim } from '../TurretAimState'
import { TURRET_CONE_HALF_ANGLE, TURRET_PITCH_LIMIT, TURRET_TRAVERSE_SPEED } from '../turretConstants'

describe('tickTurretAim', () => {
  it('starts at zero on all axes', () => {
    const state = createTurretAimState()
    expect(state.baseYaw).toBe(0)
    expect(state.coneYaw).toBe(0)
    expect(state.conePitch).toBe(0)
  })

  it('accumulates baseYaw proportional to A/D input × dt', () => {
    const state = createTurretAimState()
    const next = tickTurretAim(state, { yawAxis: 1, mouseDx: 0, mouseDy: 0 }, 1)
    expect(next.baseYaw).toBeCloseTo(TURRET_TRAVERSE_SPEED, 5)

    const back = tickTurretAim(next, { yawAxis: -1, mouseDx: 0, mouseDy: 0 }, 0.5)
    expect(back.baseYaw).toBeCloseTo(TURRET_TRAVERSE_SPEED - TURRET_TRAVERSE_SPEED * 0.5, 5)
  })

  it('does not drift under neutral input', () => {
    const state = createTurretAimState()
    const n1 = tickTurretAim(state, { yawAxis: 0, mouseDx: 0, mouseDy: 0 }, 0.016)
    const n2 = tickTurretAim(n1, { yawAxis: 0, mouseDx: 0, mouseDy: 0 }, 0.016)
    expect(n2.baseYaw).toBe(0)
    expect(n2.coneYaw).toBe(0)
    expect(n2.conePitch).toBe(0)
  })

  it('clamps coneYaw at the cone half-angle limit', () => {
    let state = createTurretAimState()
    // Push far past the limit with a large mouseDx sweep
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { yawAxis: 0, mouseDx: 100, mouseDy: 0 }, 0.016)
    }
    expect(state.coneYaw).toBeLessThanOrEqual(TURRET_CONE_HALF_ANGLE)
    expect(state.coneYaw).toBeGreaterThan(0)
  })

  it('clamps conePitch at the pitch limit', () => {
    let state = createTurretAimState()
    for (let i = 0; i < 10_000; i++) {
      state = tickTurretAim(state, { yawAxis: 0, mouseDx: 0, mouseDy: -100 }, 0.016)
    }
    expect(state.conePitch).toBeLessThanOrEqual(TURRET_PITCH_LIMIT)
  })
})
