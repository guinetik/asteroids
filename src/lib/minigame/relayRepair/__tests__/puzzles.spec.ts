import { describe, it, expect } from 'vitest'
import { getRelayPuzzle, DEFAULT_PUZZLE_KEY } from '../puzzles'

describe('getRelayPuzzle', () => {
  it('returns the default puzzle for unknown mission ids', () => {
    const p = getRelayPuzzle('not_a_real_mission')
    expect(p.cells).toHaveLength(13)
    expect(p.idealPathLength).toBe(11)
    expect(p.startSelected).toBe('1-2')
  })

  it('returns the default puzzle when the default key is passed', () => {
    expect(getRelayPuzzle(DEFAULT_PUZZLE_KEY).relay).toBe('TITAN-RELAY-07')
  })

  it('puzzle cells declare I, L, and T shapes only', () => {
    const p = getRelayPuzzle(DEFAULT_PUZZLE_KEY)
    for (const c of p.cells) {
      expect(['I', 'L', 'T']).toContain(c.shape)
      expect(c.rotation).toBeGreaterThanOrEqual(0)
      expect(c.rotation).toBeLessThanOrEqual(3)
    }
  })
})
