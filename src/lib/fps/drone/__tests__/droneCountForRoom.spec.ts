import { describe, it, expect } from 'vitest'
import { maxDronesForRoom, rollDroneCount } from '../droneCountForRoom'

describe('maxDronesForRoom', () => {
  it('returns 0 for area 1 (1x1)', () => {
    expect(maxDronesForRoom(1, 1)).toBe(0)
  })

  it('returns 0 for area 2 (1x2)', () => {
    expect(maxDronesForRoom(1, 2)).toBe(0)
  })

  it('returns 2 for area 3 (1x3)', () => {
    expect(maxDronesForRoom(1, 3)).toBe(2)
  })

  it('returns 2 for area 4 (2x2)', () => {
    expect(maxDronesForRoom(2, 2)).toBe(2)
  })

  it('returns 3 for area 5', () => {
    expect(maxDronesForRoom(1, 5)).toBe(3)
  })

  it('returns 3 for area 6 (2x3)', () => {
    expect(maxDronesForRoom(2, 3)).toBe(3)
  })

  it('returns 4 for area 7', () => {
    expect(maxDronesForRoom(1, 7)).toBe(4)
  })

  it('returns 4 for very large rooms (5x10)', () => {
    expect(maxDronesForRoom(5, 10)).toBe(4)
  })

  it('returns 4 for area 50', () => {
    expect(maxDronesForRoom(5, 10)).toBe(4)
  })

  it('returns 0 for negative or non-finite inputs', () => {
    expect(maxDronesForRoom(-1, 5)).toBe(0)
    expect(maxDronesForRoom(3, Number.NaN)).toBe(0)
    expect(maxDronesForRoom(Number.POSITIVE_INFINITY, 3)).toBe(0)
  })

  it('floors fractional tile counts before bucket lookup', () => {
    // 1.9 * 1.9 → floor=1*1=1 → bucket 0
    expect(maxDronesForRoom(1.9, 1.9)).toBe(0)
  })
})

describe('rollDroneCount', () => {
  /**
   * Build a deterministic RNG that returns values from `seq` in order, then
   * wraps. Mirrors the simple stub used in the existing FPS specs.
   */
  function stubRng(seq: number[]): () => number {
    let i = 0
    return () => {
      const v = seq[i % seq.length]!
      i++
      return v
    }
  }

  it('returns 0 when max is 0', () => {
    expect(rollDroneCount(0, () => 0, 1)).toBe(0)
  })

  it('returns 0 when max is negative', () => {
    expect(rollDroneCount(-3, () => 0, 1)).toBe(0)
  })

  it('always counts successes when probability is 1', () => {
    expect(rollDroneCount(4, () => 0.999, 1)).toBe(4)
  })

  it('never counts successes when probability is 0', () => {
    expect(rollDroneCount(4, () => 0, 0)).toBe(0)
  })

  it('counts deterministic successes against an injected RNG', () => {
    // seq [0.1, 0.9, 0.5] vs probability 0.7 → < 0.7: yes, no, yes
    const count = rollDroneCount(3, stubRng([0.1, 0.9, 0.5]), 0.7)
    expect(count).toBe(2)
  })

  it('uses the default probability when none supplied', () => {
    // default is 0.7; an RNG that always returns 0 always succeeds
    expect(rollDroneCount(3, () => 0)).toBe(3)
    // an RNG that always returns 0.99 always fails
    expect(rollDroneCount(3, () => 0.99)).toBe(0)
  })

  it('clamps probability above 1 to 1', () => {
    expect(rollDroneCount(2, () => 0.99, 5)).toBe(2)
  })

  it('clamps probability below 0 to 0', () => {
    expect(rollDroneCount(2, () => 0, -5)).toBe(0)
  })

  it('floors fractional max counts', () => {
    expect(rollDroneCount(2.9, () => 0, 1)).toBe(2)
  })
})
