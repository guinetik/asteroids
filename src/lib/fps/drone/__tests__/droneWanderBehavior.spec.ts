import { describe, it, expect } from 'vitest'
import {
  type DronePatrolRect,
  makeInitialWanderState,
  tickWander,
} from '../droneWanderBehavior'
import {
  DRONE_HOVER_BOB_AMPLITUDE,
  DRONE_HOVER_BOB_FREQUENCY,
  DRONE_PATROL_SPEED,
  DRONE_REROLL_SECONDS,
} from '../droneConfig'

const TWO_PI = Math.PI * 2

const RECT: DronePatrolRect = {
  minX: -2,
  maxX: 2,
  minZ: -2,
  maxZ: 2,
  floorY: 1.6,
}

/** RNG that always returns the same value — picks the center of the rect. */
const halfRng = (): number => 0.5

describe('makeInitialWanderState', () => {
  it('places target inside the rect', () => {
    const state = makeInitialWanderState(RECT, halfRng)
    expect(state.targetX).toBeGreaterThanOrEqual(RECT.minX)
    expect(state.targetX).toBeLessThanOrEqual(RECT.maxX)
    expect(state.targetZ).toBeGreaterThanOrEqual(RECT.minZ)
    expect(state.targetZ).toBeLessThanOrEqual(RECT.maxZ)
  })

  it('starts secondsSinceReroll at 0', () => {
    const state = makeInitialWanderState(RECT, halfRng)
    expect(state.secondsSinceReroll).toBe(0)
  })

  it('seeds bobPhase from the rng so multiple drones do not sync', () => {
    let seq = 0
    const stub = (): number => {
      const v = [0.1, 0.2, 0.3, 0.4][seq % 4]!
      seq++
      return v
    }
    const a = makeInitialWanderState(RECT, stub)
    const b = makeInitialWanderState(RECT, stub)
    expect(a.bobPhase).not.toBe(b.bobPhase)
  })
})

describe('tickWander', () => {
  it('steers toward the current target and reduces distance', () => {
    const state = makeInitialWanderState(RECT, halfRng) // target at (0,0)
    // Start at the corner so we have distance to travel toward (0,0).
    const startX = -2
    const startZ = -2
    const out = tickWander(state, { x: startX, z: startZ, dt: 0.1, rng: halfRng }, RECT)

    expect(out.reachedTarget).toBe(false)
    // Move vector magnitude ~ DRONE_PATROL_SPEED (unit vector * speed)
    const mag = Math.sqrt(out.moveX * out.moveX + out.moveZ * out.moveZ)
    expect(mag).toBeCloseTo(DRONE_PATROL_SPEED, 5)
    // Movement points toward (0,0): both components positive.
    expect(out.moveX).toBeGreaterThan(0)
    expect(out.moveZ).toBeGreaterThan(0)
  })

  it('triggers reroll on arrival (within arrive radius)', () => {
    // Seed initial target via halfRng (lands at (0,0)) so we can verify
    // the post-arrival reroll actually moves the target to a fresh
    // location — sequenceRng below returns a non-0.5 pair on the next
    // two calls, so the new target must land off-origin.
    const state = makeInitialWanderState(RECT, halfRng)
    const originalTargetX = state.targetX
    const originalTargetZ = state.targetZ
    let i = 0
    const sequenceRng = (): number => {
      const seq = [0.25, 0.75]
      const v = seq[i % seq.length] as number
      i++
      return v
    }
    // Start right on top of the target → arrived.
    const out = tickWander(state, { x: 0, z: 0, dt: 0.016, rng: sequenceRng }, RECT)
    expect(out.reachedTarget).toBe(true)
    expect(out.moveX).toBe(0)
    expect(out.moveZ).toBe(0)
    // The reroll must reset the timer AND produce a different target
    // (0.25/0.75 sample of the [-2..2] rect = -1 / +1, not 0).
    expect(state.secondsSinceReroll).toBe(0)
    expect(state.targetX).not.toBe(originalTargetX)
    expect(state.targetZ).not.toBe(originalTargetZ)
    expect(state.targetX).toBeGreaterThanOrEqual(RECT.minX)
    expect(state.targetX).toBeLessThanOrEqual(RECT.maxX)
  })

  it('forces a reroll after DRONE_REROLL_SECONDS even without arrival', () => {
    const state = makeInitialWanderState(RECT, halfRng) // target at (0,0)
    // Burn the entire reroll budget in one tick, starting at the far corner.
    const out = tickWander(
      state,
      { x: -2, z: -2, dt: DRONE_REROLL_SECONDS + 0.001, rng: halfRng },
      RECT,
    )
    expect(out.reachedTarget).toBe(true)
    expect(state.secondsSinceReroll).toBe(0)
  })

  it('advances bobPhase by frequency * dt and wraps modulo 2π', () => {
    const state = makeInitialWanderState(RECT, halfRng)
    state.bobPhase = 0
    const dt = 0.1
    tickWander(state, { x: -2, z: -2, dt, rng: halfRng }, RECT)
    expect(state.bobPhase).toBeCloseTo(DRONE_HOVER_BOB_FREQUENCY * dt, 5)
  })

  it('wraps bobPhase below 2π after a large dt', () => {
    const state = makeInitialWanderState(RECT, halfRng)
    state.bobPhase = 0
    // Big dt → phase wraps multiple times.
    const dt = 10
    tickWander(state, { x: -2, z: -2, dt, rng: halfRng }, RECT)
    expect(state.bobPhase).toBeGreaterThanOrEqual(0)
    expect(state.bobPhase).toBeLessThan(TWO_PI)
  })

  it('returns bobY in the expected amplitude band', () => {
    const state = makeInitialWanderState(RECT, halfRng)
    const out = tickWander(state, { x: -2, z: -2, dt: 0.05, rng: halfRng }, RECT)
    expect(Math.abs(out.bobY)).toBeLessThanOrEqual(DRONE_HOVER_BOB_AMPLITUDE + 1e-9)
  })
})
