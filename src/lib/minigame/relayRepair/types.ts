/**
 * Shared types for the relay repair minigame.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

/** Pipe-node shape family. */
export type Shape = 'I' | 'L' | 'T'

/** Cardinal port direction. */
export type Direction = 'N' | 'E' | 'S' | 'W'

/** Discrete rotation index, 0–3 (each step = 90° CW). */
export type Rotation = 0 | 1 | 2 | 3

/** One authored cell on the grid. */
export interface Cell {
  /** Row index [0, GRID_ROWS). */
  row: number
  /** Column index [0, GRID_COLS). */
  col: number
  /** Shape family controlling the port set. */
  shape: Shape
  /** Logical rotation used by the wave trace. */
  rotation: Rotation
  /** Visual rotation driving the CSS transform — allowed to exceed 3 for smooth multi-turn animation. */
  visualRotation: number
}

/** Authored puzzle payload per mission. */
export interface RelayPuzzle {
  /** Short HUD label, e.g. `BACKBONE RETERM`. */
  label: string
  /** Relay identifier shown in the grid panel header, e.g. `TITAN-RELAY-07`. */
  relay: string
  /** Carrier frequency string, e.g. `2.400 GHz`. */
  carrier: string
  /** Initial cell layout. */
  cells: Cell[]
  /** Reference path length for partial-quality math. */
  idealPathLength: number
  /** Canonical cell id (e.g. `1-2`) that starts selected. */
  startSelected: string
}

/** Wave exit record — one per BFS frontier that escapes the grid or dies blocked. */
export interface WaveExit {
  /** Row the wave tried to enter (may be off-grid). */
  row: number
  /** Col the wave tried to enter. */
  col: number
  /** Direction the wave was heading when it hit this exit. */
  dir: Direction
  /** True when the exit was blocked by an empty cell or missing port. */
  blocked?: boolean
}

/** Output of a wave trace pass. */
export interface TraceResult {
  /** Set of `${row}-${col}` strings for cells that carry at least one active port. */
  activeCells: ReadonlySet<string>
  /** Set of `${row}-${col}-${port}` strings for individual lit port segments. */
  activeSegments: ReadonlySet<string>
  /** Every frontier that escaped the grid or died blocked. */
  exits: readonly WaveExit[]
}
