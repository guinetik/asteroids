import { describe, it, expect } from 'vitest'
import { applyRelayDifficulty } from '../applyDifficulty'
import { getRelayPuzzle, DEFAULT_PUZZLE_KEY } from '../puzzles'
import { WRONG_CELLS_BY_TIER } from '../difficulty'
import { traceWave } from '../wave'

const base = getRelayPuzzle(DEFAULT_PUZZLE_KEY).cells

function countDiffs(
  a: readonly { rotation: number }[],
  b: readonly { rotation: number }[],
): number {
  let n = 0
  for (let i = 0; i < a.length; i++) if (a[i]!.rotation !== b[i]!.rotation) n++
  return n
}

describe('applyRelayDifficulty', () => {
  it('misrotates exactly WRONG_CELLS_BY_TIER[tier] cells', () => {
    for (const tier of [1, 2, 3] as const) {
      const rolled = applyRelayDifficulty(base, 'mission-x', tier)
      expect(countDiffs(base, rolled)).toBe(WRONG_CELLS_BY_TIER[tier])
    }
  })

  it('is deterministic for the same mission id and tier', () => {
    const a = applyRelayDifficulty(base, 'earth_l1_relay_reterm', 1)
    const b = applyRelayDifficulty(base, 'earth_l1_relay_reterm', 1)
    expect(a).toEqual(b)
  })

  it('produces different rolls for different mission ids at the same tier', () => {
    const a = applyRelayDifficulty(base, 'mission-a', 1)
    const b = applyRelayDifficulty(base, 'mission-b', 1)
    // At least one cell's rotation must differ — overwhelmingly likely.
    expect(a).not.toEqual(b)
  })

  it('leaves cell count, row/col, and shape unchanged', () => {
    const rolled = applyRelayDifficulty(base, 'mission-z', 3)
    expect(rolled).toHaveLength(base.length)
    for (let i = 0; i < base.length; i++) {
      expect(rolled[i]!.row).toBe(base[i]!.row)
      expect(rolled[i]!.col).toBe(base[i]!.col)
      expect(rolled[i]!.shape).toBe(base[i]!.shape)
    }
  })

  it('each misrotated cell has rotation in [0, 4)', () => {
    const rolled = applyRelayDifficulty(base, 'mission-rot', 3)
    for (const c of rolled) {
      expect(c.rotation).toBeGreaterThanOrEqual(0)
      expect(c.rotation).toBeLessThan(4)
    }
  })
})

describe('rolled puzzles are solvable by inverting misrotations', () => {
  it('the base puzzle already reaches the sink (verifies _default is solved)', () => {
    const { exits } = traceWave(base, 0, 0, 'E')
    const sinkHit = exits.some((e) => e.row === 2 && e.col === 5 && e.dir === 'E')
    expect(sinkHit).toBe(true)
  })

  it('a rolled puzzle reaches the sink after rotating the misrotated cells back', () => {
    const rolled = applyRelayDifficulty(base, 'mission-solve', 3)
    // Compute inverse rotations and apply them.
    const solved = rolled.map((c, i) => {
      const bump = (((c.rotation - base[i]!.rotation) % 4) + 4) % 4
      const inverse = (4 - bump) % 4
      return {
        ...c,
        rotation: ((((c.rotation + inverse) % 4) + 4) % 4) as 0 | 1 | 2 | 3,
      }
    })
    const { exits } = traceWave(solved, 0, 0, 'E')
    const sinkHit = exits.some((e) => e.row === 2 && e.col === 5 && e.dir === 'E')
    expect(sinkHit).toBe(true)
  })
})
