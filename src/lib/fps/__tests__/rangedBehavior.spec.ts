import { describe, it, expect, beforeEach } from 'vitest'
import { RangedBehavior } from '../rangedBehavior'

const TEST_CONFIG = {
  aggroRadius: 50,
  leashRadius: 70,
  agitateRadius: 25,
  wanderRadius: 10,
  wanderSpeed: 1.5,
  speed: 4,
  preferredRange: 25,
  minRange: 12,
  fireRate: 0.5,
}

describe('RangedBehavior', () => {
  let behavior: RangedBehavior

  beforeEach(() => {
    behavior = new RangedBehavior(TEST_CONFIG)
  })

  // --- Idle state ---

  it('should start in idle state', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 0, 999, [])
    expect(out.isChasing).toBe(false)
    expect(out.wantsToFire).toBe(false)
  })

  // --- Aggro transition ---

  it('should engage when player enters aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 40, 0, 0, [])
    expect(out.isChasing).toBe(true)
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should NOT engage when player is outside aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 60, 0, 0, [])
    expect(out.isChasing).toBe(false)
  })

  // --- Approach until preferred range ---

  it('should approach player when beyond preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 40, 0, 0, [])
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should stop at preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 25, 0, 0, [])
    expect(out.isMoving).toBe(false)
    expect(out.isAgitated).toBe(true)
  })

  // --- Hold at range ---

  it('should not move when within preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 20, 0, 0, [])
    expect(out.isMoving).toBe(false)
    expect(out.isAgitated).toBe(true)
  })

  // --- Back away when too close ---

  it('should back away when player is within min range', () => {
    const out = behavior.tick(0.016, 0, 0, 8, 0, 0, [])
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeLessThan(0)
  })

  // --- Fire intent ---

  it('should want to fire when in preferred range and cooldown expired', () => {
    const out1 = behavior.tick(0.016, 0, 0, 20, 0, 0, [])
    expect(out1.wantsToFire).toBe(true)
  })

  it('should NOT fire when on cooldown', () => {
    behavior.tick(0.016, 0, 0, 20, 0, 0, [])
    const out2 = behavior.tick(0.016, 0, 0, 20, 0, 0, [])
    expect(out2.wantsToFire).toBe(false)
  })

  it('should fire again after cooldown expires', () => {
    behavior.tick(0.016, 0, 0, 20, 0, 0, []) // fires
    behavior.tick(2.1, 0, 0, 20, 0, 0, []) // cooldown passes
    const out = behavior.tick(0.016, 0, 0, 20, 0, 0, [])
    expect(out.wantsToFire).toBe(true)
  })

  it('should NOT fire when outside preferred range', () => {
    const out = behavior.tick(0.016, 0, 0, 40, 0, 0, [])
    expect(out.wantsToFire).toBe(false)
  })

  it('should NOT fire when idle', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 0, 999, [])
    expect(out.wantsToFire).toBe(false)
  })

  // --- Leash ---

  it('should return to idle when player exceeds leash radius', () => {
    behavior.tick(0.016, 0, 0, 40, 0, 0, []) // engage
    const out = behavior.tick(0.016, 0, 0, 80, 0, 0, []) // beyond leash
    expect(out.isChasing).toBe(false)
    expect(out.wantsToFire).toBe(false)
  })

  // --- Direction ---

  it('should back away in correct direction on Z axis', () => {
    const out = behavior.tick(0.016, 0, 0, 0, 0, 8, [])
    expect(out.moveDir.z).toBeLessThan(0)
  })
})
