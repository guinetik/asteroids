import { describe, it, expect } from 'vitest'
import { SHAPE_ROTATIONS, DIR_DELTA, OPPOSITE, getPorts } from '../shapes'

describe('SHAPE_ROTATIONS', () => {
  it('I at rotation 0 has E and W ports', () => {
    expect(SHAPE_ROTATIONS.I[0]).toEqual(['E', 'W'])
  })

  it('L at rotation 0 has N and E ports', () => {
    expect(SHAPE_ROTATIONS.L[0]).toEqual(['N', 'E'])
  })

  it('T at rotation 0 has N, E, and S ports', () => {
    expect(SHAPE_ROTATIONS.T[0]).toEqual(['N', 'E', 'S'])
  })

  it('every shape exposes exactly four rotations', () => {
    expect(SHAPE_ROTATIONS.I).toHaveLength(4)
    expect(SHAPE_ROTATIONS.L).toHaveLength(4)
    expect(SHAPE_ROTATIONS.T).toHaveLength(4)
  })
})

describe('getPorts', () => {
  it('returns the canonical port list at rotation 0', () => {
    expect(getPorts('L', 0)).toEqual(['N', 'E'])
  })

  it('normalizes negative rotations via mod-4', () => {
    expect(getPorts('L', -1 as 0 | 1 | 2 | 3)).toEqual(getPorts('L', 3))
  })

  it('normalizes rotations above 3', () => {
    expect(getPorts('I', 5 as 0 | 1 | 2 | 3)).toEqual(getPorts('I', 1))
  })
})

describe('OPPOSITE', () => {
  it('pairs each direction with its opposite', () => {
    expect(OPPOSITE.N).toBe('S')
    expect(OPPOSITE.S).toBe('N')
    expect(OPPOSITE.E).toBe('W')
    expect(OPPOSITE.W).toBe('E')
  })
})

describe('DIR_DELTA', () => {
  it('N moves row -1 col 0', () => {
    expect(DIR_DELTA.N).toEqual([-1, 0])
  })

  it('E moves row 0 col +1', () => {
    expect(DIR_DELTA.E).toEqual([0, 1])
  })

  it('S moves row +1 col 0', () => {
    expect(DIR_DELTA.S).toEqual([1, 0])
  })

  it('W moves row 0 col -1', () => {
    expect(DIR_DELTA.W).toEqual([0, -1])
  })
})
