/**
 * Wave propagation across a relay puzzle grid. BFS with branching — T-pieces
 * emit to every port except the incoming one. Pure function; safe to call
 * every frame. Matches `docs/inspo/RelayRepairMinigame.jsx` lines 155–205.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import { GRID_COLS, GRID_ROWS } from './constants'
import { DIR_DELTA, OPPOSITE, getPorts } from './shapes'
import type { Cell, Direction, TraceResult, WaveExit } from './types'

/**
 * Trace the wave from a starting cell + direction. Returns the set of active
 * cells, active individual port segments, and every frontier that escaped
 * the grid or died blocked.
 *
 * @param cells - Authored cells (may be fewer than `GRID_ROWS × GRID_COLS` — gaps are empty).
 * @param startRow - Starting row index.
 * @param startCol - Starting col index.
 * @param startDir - Heading of the wave as it enters the starting cell.
 * @returns Trace result.
 */
export function traceWave(
  cells: readonly Cell[],
  startRow: number,
  startCol: number,
  startDir: Direction,
): TraceResult {
  const map = new Map<string, Cell>()
  for (const c of cells) map.set(cellId(c.row, c.col), c)

  const activeCells = new Set<string>()
  const activeSegments = new Set<string>()
  const exits: WaveExit[] = []
  const visited = new Set<string>()
  /** Each queue entry carries a `source` flag so the start cell bypasses the port-acceptance check. */
  const queue: Array<{ row: number; col: number; dir: Direction; source?: boolean }> = [
    { row: startRow, col: startCol, dir: startDir, source: true },
  ]

  while (queue.length > 0) {
    const step = queue.shift()!
    const key = `${step.row}-${step.col}-${step.dir}`
    if (visited.has(key)) continue
    visited.add(key)

    if (step.row < 0 || step.row >= GRID_ROWS || step.col < 0 || step.col >= GRID_COLS) {
      exits.push({ row: step.row, col: step.col, dir: step.dir })
      continue
    }

    const cell = map.get(cellId(step.row, step.col))
    if (!cell) {
      exits.push({ row: step.row, col: step.col, dir: step.dir, blocked: true })
      continue
    }

    const ports = getPorts(cell.shape, cell.rotation)
    const entering = OPPOSITE[step.dir]
    // Non-source cells must expose the entering port — otherwise the wave is blocked.
    if (!step.source && !ports.includes(entering)) {
      exits.push({ row: step.row, col: step.col, dir: step.dir, blocked: true })
      continue
    }

    activeCells.add(cellId(step.row, step.col))
    activeSegments.add(`${step.row}-${step.col}-${entering}`)

    for (const port of ports) {
      if (port === entering) continue
      activeSegments.add(`${step.row}-${step.col}-${port}`)
      const delta = DIR_DELTA[port]
      queue.push({ row: step.row + delta[0], col: step.col + delta[1], dir: port })
    }
  }

  return { activeCells, activeSegments, exits }
}

/**
 * Canonical cell id string. Used as the key in the active-cell set and the
 * puzzle JSON's `startSelected` field.
 *
 * @param row - Row index.
 * @param col - Col index.
 * @returns `${row}-${col}` string.
 */
export function cellId(row: number, col: number): string {
  return `${row}-${col}`
}
