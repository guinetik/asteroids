import { describe, it, expect } from 'vitest'
import { getRelayDifficulty, WRONG_CELLS_BY_TIER } from '../difficulty'

describe('getRelayDifficulty', () => {
  it('returns 1 for inner planets', () => {
    expect(getRelayDifficulty('mercury')).toBe(1)
    expect(getRelayDifficulty('venus')).toBe(1)
    expect(getRelayDifficulty('earth')).toBe(1)
  })

  it('returns 2 for mid planets', () => {
    expect(getRelayDifficulty('mars')).toBe(2)
    expect(getRelayDifficulty('jupiter')).toBe(2)
  })

  it('returns 3 for outer planets', () => {
    expect(getRelayDifficulty('saturn')).toBe(3)
    expect(getRelayDifficulty('uranus')).toBe(3)
    expect(getRelayDifficulty('neptune')).toBe(3)
  })

  it('falls back to tier 1 for unknown planets', () => {
    expect(getRelayDifficulty('pluto')).toBe(1)
    expect(getRelayDifficulty('')).toBe(1)
  })
})

describe('WRONG_CELLS_BY_TIER', () => {
  it('tier sizes are 2/3/4', () => {
    expect(WRONG_CELLS_BY_TIER[1]).toBe(2)
    expect(WRONG_CELLS_BY_TIER[2]).toBe(3)
    expect(WRONG_CELLS_BY_TIER[3]).toBe(4)
  })
})
