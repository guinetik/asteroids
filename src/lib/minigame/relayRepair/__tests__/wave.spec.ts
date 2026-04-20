import { describe, it, expect } from 'vitest'
import { traceWave } from '../wave'
import type { Cell } from '../types'

/** Prototype's INITIAL_CELLS (docs/inspo/RelayRepairMinigame.jsx:99). */
const INITIAL_CELLS: Cell[] = [
  { row: 0, col: 0, shape: 'L', rotation: 2, visualRotation: 2 },
  { row: 0, col: 1, shape: 'I', rotation: 0, visualRotation: 0 },
  { row: 0, col: 2, shape: 'L', rotation: 1, visualRotation: 1 },
  { row: 0, col: 3, shape: 'I', rotation: 1, visualRotation: 1 },
  { row: 0, col: 4, shape: 'L', rotation: 2, visualRotation: 2 },
  { row: 1, col: 0, shape: 'I', rotation: 1, visualRotation: 1 },
  { row: 1, col: 2, shape: 'T', rotation: 3, visualRotation: 3 },
  { row: 1, col: 4, shape: 'I', rotation: 1, visualRotation: 1 },
  { row: 2, col: 0, shape: 'L', rotation: 0, visualRotation: 0 },
  { row: 2, col: 1, shape: 'I', rotation: 0, visualRotation: 0 },
  { row: 2, col: 2, shape: 'L', rotation: 3, visualRotation: 3 },
  { row: 2, col: 3, shape: 'I', rotation: 0, visualRotation: 0 },
  { row: 2, col: 4, shape: 'L', rotation: 0, visualRotation: 0 },
]

function rotated(cells: Cell[], row: number, col: number, by: number): Cell[] {
  return cells.map((c) =>
    c.row === row && c.col === col
      ? { ...c, rotation: (((c.rotation + by) % 4 + 4) % 4) as 0 | 1 | 2 | 3, visualRotation: c.visualRotation + by }
      : c,
  )
}

describe('traceWave', () => {
  it('does not reach the sink on the initial authored puzzle', () => {
    const { exits } = traceWave(INITIAL_CELLS, 0, 0, 'E')
    const sinkHit = exits.some((e) => e.row === 2 && e.col === 5 && e.dir === 'E')
    expect(sinkHit).toBe(false)
  })

  it('reaches the sink after rotating (0,3) and (1,2) each once', () => {
    let cells = rotated(INITIAL_CELLS, 0, 3, 1)
    cells = rotated(cells, 1, 2, 1)
    const { activeCells, exits } = traceWave(cells, 0, 0, 'E')
    const sinkHit = exits.some((e) => e.row === 2 && e.col === 5 && e.dir === 'E')
    expect(sinkHit).toBe(true)
    expect(activeCells.size).toBe(11)
  })

  it('records a blocked exit when the wave enters an empty cell', () => {
    const cells: Cell[] = [
      { row: 0, col: 0, shape: 'I', rotation: 0, visualRotation: 0 },
    ]
    const { exits } = traceWave(cells, 0, 0, 'E')
    const offGrid = exits.find((e) => e.row === 0 && e.col === 1)
    expect(offGrid).toBeDefined()
    expect(offGrid?.blocked).toBe(true)
  })

  it('T-piece at rotation 0 with W-incoming exits N and S', () => {
    const cells: Cell[] = [
      { row: 1, col: 1, shape: 'T', rotation: 0, visualRotation: 0 },
    ]
    const { activeSegments, exits } = traceWave(cells, 1, 1, 'E')
    expect(activeSegments.has('1-1-W')).toBe(true)
    expect(activeSegments.has('1-1-N')).toBe(true)
    expect(activeSegments.has('1-1-E')).toBe(true)
    expect(activeSegments.has('1-1-S')).toBe(true)
    expect(exits).toHaveLength(3)
  })
})
