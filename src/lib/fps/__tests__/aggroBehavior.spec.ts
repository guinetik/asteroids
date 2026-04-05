import { describe, it, expect, beforeEach } from 'vitest'
import { AggroBehavior } from '../aggroBehavior'

const TEST_CONFIG = {
  aggroRadius: 40,
  leashRadius: 60,
  agitateRadius: 10,
  wanderRadius: 15,
  wanderSpeed: 2,
  speed: 8,
}

describe('AggroBehavior', () => {
  let behavior: AggroBehavior

  beforeEach(() => {
    behavior = new AggroBehavior(TEST_CONFIG)
  })

  // --- Idle state ---

  it('should start in idle state', () => {
    const out = behavior.tick(0.016, 0, 0, 999, 999)
    expect(out.isAgitated).toBe(false)
  })

  it('should wander within wanderRadius of spawn', () => {
    let ex = 0
    let ez = 0
    for (let i = 0; i < 600; i++) {
      const out = behavior.tick(0.016, ex, ez, 999, 999)
      ex += out.moveDir.x * TEST_CONFIG.wanderSpeed * 0.016
      ez += out.moveDir.z * TEST_CONFIG.wanderSpeed * 0.016
    }
    const dist = Math.sqrt(ex * ex + ez * ez)
    expect(dist).toBeLessThanOrEqual(TEST_CONFIG.wanderRadius + 1)
  })

  // --- Aggro transition ---

  it('should chase when player enters aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 30, 0)
    expect(out.isMoving).toBe(true)
    expect(out.isChasing).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should NOT chase when player is outside aggro radius', () => {
    const out = behavior.tick(0.016, 0, 0, 50, 0)
    expect(out.isAgitated).toBe(false)
  })

  it('should become agitated when player is within agitate radius', () => {
    const out = behavior.tick(0.016, 0, 0, 5, 0)
    expect(out.isAgitated).toBe(true)
  })

  it('should NOT be agitated when chasing but outside agitate radius', () => {
    const out = behavior.tick(0.016, 0, 0, 30, 0)
    expect(out.isMoving).toBe(true)
    expect(out.isAgitated).toBe(false)
  })

  // --- Leash ---

  it('should keep chasing within leash radius', () => {
    behavior.tick(0.016, 0, 0, 30, 0)
    const out = behavior.tick(0.016, 0, 0, 55, 0)
    expect(out.isMoving).toBe(true)
    expect(out.moveDir.x).toBeGreaterThan(0)
  })

  it('should return to idle when player exceeds leash radius', () => {
    behavior.tick(0.016, 0, 0, 30, 0)
    const out = behavior.tick(0.016, 0, 0, 70, 0)
    expect(out.isAgitated).toBe(false)
  })

  // --- Chase direction ---

  it('should chase toward player in correct direction', () => {
    const out = behavior.tick(0.016, 0, 0, -20, 0)
    expect(out.moveDir.x).toBeLessThan(0)
  })

  it('should chase toward player on Z axis', () => {
    const out = behavior.tick(0.016, 0, 0, 0, -25)
    expect(out.moveDir.z).toBeLessThan(0)
  })
})
