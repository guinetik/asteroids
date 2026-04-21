# Relay Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `relay_repair` EVA minigame end-to-end — a Vue overlay where the player rotates pipe-shaped nodes on a 5×3 grid to route a signal from IN to OUT, with live wave trace and lock-in at ≥ 95% quality.

**Architecture:** Thin `RelayRepairMiniGame` class implements the `OrbitalMiniGame` contract (`presentation: 'overlay'`); all puzzle state + UI lives in `RelayRepairCanvas.vue` which the existing `EvaMinigameOverlay.vue` dispatcher branches to via `instanceof`. Pure domain math lives in separate modules under `src/lib/minigame/relayRepair/` (shapes, wave, quality, wiggle) with full Vitest coverage. Puzzle layouts are read from `src/data/minigames/relay-puzzles.json` keyed by mission id with a `_default` fallback.

**Tech Stack:** Vue 3 SFC, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4 via `@apply` in `src/assets/css/main.css`, Vitest, `requestAnimationFrame` loop, SVG for the grid.

**Spec:** `docs/superpowers/specs/2026-04-20-relay-repair-design.md`
**Prototype reference:** `docs/inspo/RelayRepairMinigame.jsx` (React — layout + feel source of truth)
**Pattern reference:** `docs/superpowers/plans/2026-04-20-telescope-alignment.md` (same overlay pattern, same SFC + class split)

---

## File Map

### Created
- `src/lib/minigame/relayRepair/constants.ts` — tuning knobs (grid dims, thresholds, durations, palette)
- `src/lib/minigame/relayRepair/types.ts` — `Shape`, `Direction`, `Rotation`, `Cell`, `RelayPuzzle`, `TraceResult`
- `src/lib/minigame/relayRepair/shapes.ts` — `SHAPE_ROTATIONS` table, `DIR_DELTA`, `OPPOSITE`, `getPorts`
- `src/lib/minigame/relayRepair/wave.ts` — `traceWave` BFS with T-piece branching
- `src/lib/minigame/relayRepair/quality.ts` — `computeQuality` (caps at 0.94 without sink)
- `src/lib/minigame/relayRepair/wiggle.ts` — `wigglyPath` SVG `d`-string generator
- `src/lib/minigame/relayRepair/puzzles.ts` — typed accessor over the puzzle JSON
- `src/lib/minigame/relayRepair/RelayRepairMiniGame.ts` — `OrbitalMiniGame` bridge class
- `src/lib/minigame/relayRepair/__tests__/shapes.spec.ts`
- `src/lib/minigame/relayRepair/__tests__/wave.spec.ts`
- `src/lib/minigame/relayRepair/__tests__/quality.spec.ts`
- `src/lib/minigame/relayRepair/__tests__/wiggle.spec.ts`
- `src/lib/minigame/relayRepair/__tests__/puzzles.spec.ts`
- `src/lib/minigame/relayRepair/__tests__/RelayRepairMiniGame.spec.ts`
- `src/data/minigames/relay-puzzles.json`
- `src/components/RelayRepairCanvas.vue`

### Modified
- `src/lib/minigame/orbitalMiniGameFactory.ts` — add `case 'relay_repair'`
- `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts` — cover relay branch in both the direct case block and the `presentation` table
- `src/components/EvaMinigameOverlay.vue` — add `v-else-if` branch rendering `RelayRepairCanvas`
- `src/assets/css/main.css` — append `.relay-*` classes

---

## Conventions (read first)

**Code style:** no semicolons, single quotes, 2-space indent, 100-char line width. TypeScript strict + `noUncheckedIndexedAccess`.

**TSDoc:** every exported function, class, interface, type alias, and constant needs a TSDoc block. File-level header pattern:

```ts
/**
 * Brief description.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
```

**No magic numbers** — every numeric literal referenced at runtime goes through `constants.ts`.

**No `<style>` in SFCs** — all CSS lives in `src/assets/css/main.css` as top-level `.relay-*` classes (the codebase rule enforced on telescope).

**Test runner:** Vitest. Run a single file with `bun test:unit src/path/to/file.spec.ts`.

**Gates before every commit:**
```bash
bun run type-check
bun lint
bun test:unit
```
`bun lint` runs oxlint then ESLint with `--max-warnings 0`. ESLint enforces `jsdoc/require-jsdoc` as an error on `src/**/*.ts` except `__tests__`.

---

## Task 1: Constants + types module

**Files:**
- Create: `src/lib/minigame/relayRepair/constants.ts`
- Create: `src/lib/minigame/relayRepair/types.ts`

- [ ] **Step 1: Write `constants.ts`**

```ts
/**
 * Tuning constants for the relay repair minigame. Every numeric value the
 * class, math modules, and canvas reach for is named here — no magic
 * numbers leak to callers.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */

/** Grid column count. Matches prototype. */
export const GRID_COLS = 5

/** Grid row count. Matches prototype. */
export const GRID_ROWS = 3

/** SVG cell side length in px at base resolution. */
export const CELL_PX = 96

/** Node (pipe hub) radius as a fraction of CELL_PX. */
export const NODE_RADIUS_PCT = 0.36

/** Ideal path length through the default puzzle — divisor for partial quality. */
export const IDEAL_PATH_LENGTH = 11

/** Quality cap when the wave has not reached the sink yet. */
export const QUALITY_CAP_WITHOUT_SINK = 0.94

/** Active-cell weight applied to partial quality before the cap. */
export const QUALITY_SCALE = 0.9

/** Minimum quality required to press E and lock in. */
export const LOCK_THRESHOLD = 0.95

/** Lock-in animation duration in ms — matches prototype's 450ms. */
export const LOCK_ANIMATION_MS = 450

/** Caption fade-in duration in ms after lock-in completes. */
export const CAPTION_FADE_MS = 1200

/** Wiggle sine amplitude in px perpendicular to the pipe axis. */
export const WIGGLE_AMPLITUDE_PX = 2.8

/** Wiggle wavelength in px along the pipe axis. */
export const WIGGLE_WAVELENGTH_PX = 16

/** Wiggle travel speed multiplier — higher = faster flow. */
export const WIGGLE_SPEED = 5.5

/** Minimum number of sample points for a wiggle path. */
export const WIGGLE_MIN_STEPS = 6

/** Approximate px per wiggle sample above the minimum. */
export const WIGGLE_PX_PER_STEP = 3

/** Shared palette mirrored from prototype line 42. */
export const COLOR = {
  /** Deep panel background. */
  bg: '#05070c',
  /** Secondary panel fill. */
  panel: '#0a0f1a',
  /** Primary text. */
  text: '#cffafe',
  /** Primary cyan stroke. */
  cyan: '#22d3ee',
  /** Hover/focus cyan stroke. */
  cyanBright: '#7dd3fc',
  /** Dim cyan for inactive pipes. */
  cyanDim: 'rgba(103, 232, 249, 0.3)',
  /** Border rule color. */
  border: 'rgba(34, 211, 238, 0.25)',
  /** Success / locked-in green. */
  green: '#34d399',
  /** Warning amber. */
  amber: '#fbbf24',
  /** Dead-end red (reserved — prototype uses amber for dead ends). */
  red: '#f87171',
  /** Grid line color. */
  grid: 'rgba(34, 211, 238, 0.06)',
} as const
```

- [ ] **Step 2: Write `types.ts`**

```ts
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
```

- [ ] **Step 3: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: both clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/minigame/relayRepair/constants.ts src/lib/minigame/relayRepair/types.ts
git commit -m "feat(relay): constants and types for relay repair minigame"
```

---

## Task 2: Shape rotations + port helper

**Files:**
- Create: `src/lib/minigame/relayRepair/shapes.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/shapes.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests — expect FAIL (module missing)**

```bash
bun test:unit src/lib/minigame/relayRepair/__tests__/shapes.spec.ts
```
Expected: FAIL — "Cannot find module '../shapes'".

- [ ] **Step 3: Implement `shapes.ts`**

```ts
/**
 * Pipe-node shape rotation tables and direction helpers. Pure data — no DOM
 * or framework dependencies. Values mirror `docs/inspo/RelayRepairMinigame.jsx`
 * lines 82–93 verbatim.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import type { Direction, Rotation, Shape } from './types'

/** Port lists for each shape × rotation. Index 0 is canonical. */
export const SHAPE_ROTATIONS: Readonly<Record<Shape, readonly (readonly Direction[])[]>> = {
  I: [
    ['E', 'W'],
    ['N', 'S'],
    ['E', 'W'],
    ['N', 'S'],
  ],
  L: [
    ['N', 'E'],
    ['E', 'S'],
    ['S', 'W'],
    ['W', 'N'],
  ],
  T: [
    ['N', 'E', 'S'],
    ['E', 'S', 'W'],
    ['S', 'W', 'N'],
    ['W', 'N', 'E'],
  ],
} as const

/** Opposite direction of each cardinal. */
export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
} as const

/** Row/col delta for each cardinal. */
export const DIR_DELTA: Readonly<Record<Direction, readonly [number, number]>> = {
  N: [-1, 0],
  E: [0, 1],
  S: [1, 0],
  W: [0, -1],
} as const

/**
 * Get the active port list for a shape at a given rotation. Rotation is
 * normalized to [0, 4) so callers can freely increment the visual rotation
 * across multiple turns without wrapping manually.
 *
 * @param shape - Shape family.
 * @param rotation - Discrete rotation index; normalized via mod-4.
 * @returns The port list at that rotation.
 */
export function getPorts(shape: Shape, rotation: Rotation): readonly Direction[] {
  const idx = (((rotation % 4) + 4) % 4) as 0 | 1 | 2 | 3
  return SHAPE_ROTATIONS[shape][idx]!
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test:unit src/lib/minigame/relayRepair/__tests__/shapes.spec.ts
```
Expected: PASS — all cases green.

- [ ] **Step 5: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/relayRepair/shapes.ts src/lib/minigame/relayRepair/__tests__/shapes.spec.ts
git commit -m "feat(relay): shape rotation tables + direction helpers"
```

---

## Task 3: Wave trace (BFS with T-piece branching)

**Files:**
- Create: `src/lib/minigame/relayRepair/wave.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/wave.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
      { row: 0, col: 0, shape: 'I', rotation: 0, visualRotation: 0 }, // [E, W]
    ]
    const { exits } = traceWave(cells, 0, 0, 'E')
    const offGrid = exits.find((e) => e.row === 0 && e.col === 1)
    expect(offGrid).toBeDefined()
    expect(offGrid?.blocked).toBe(true)
  })

  it('T-piece at rotation 0 with W-incoming exits N and S', () => {
    const cells: Cell[] = [
      { row: 1, col: 1, shape: 'T', rotation: 0, visualRotation: 0 }, // [N, E, S]
    ]
    const { activeSegments, exits } = traceWave(cells, 1, 1, 'E')
    expect(activeSegments.has('1-1-W')).toBe(true) // entering port
    expect(activeSegments.has('1-1-N')).toBe(true)
    expect(activeSegments.has('1-1-E')).toBe(true)
    expect(activeSegments.has('1-1-S')).toBe(true)
    expect(exits).toHaveLength(3) // N, E, S all escape the 1x1 grid
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test:unit src/lib/minigame/relayRepair/__tests__/wave.spec.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `wave.ts`**

```ts
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
  const queue: Array<{ row: number; col: number; dir: Direction }> = [
    { row: startRow, col: startCol, dir: startDir },
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
    if (!ports.includes(entering)) {
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test:unit src/lib/minigame/relayRepair/__tests__/wave.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

```bash
bun run type-check && bun lint
```
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/relayRepair/wave.ts src/lib/minigame/relayRepair/__tests__/wave.spec.ts
git commit -m "feat(relay): BFS wave trace with T-piece branching"
```

---

## Task 4: Quality math (pure + tested)

**Files:**
- Create: `src/lib/minigame/relayRepair/quality.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/quality.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { computeQuality } from '../quality'
import {
  IDEAL_PATH_LENGTH,
  LOCK_THRESHOLD,
  QUALITY_CAP_WITHOUT_SINK,
  QUALITY_SCALE,
} from '../constants'

describe('computeQuality', () => {
  it('returns 1 when the sink is reached regardless of active-cell count', () => {
    expect(computeQuality(0, true)).toBe(1)
    expect(computeQuality(IDEAL_PATH_LENGTH, true)).toBe(1)
  })

  it('returns 0 when no cells are active and the sink is not reached', () => {
    expect(computeQuality(0, false)).toBe(0)
  })

  it('scales linearly below the cap', () => {
    const half = Math.floor(IDEAL_PATH_LENGTH / 2)
    const expected = (half / IDEAL_PATH_LENGTH) * QUALITY_SCALE
    expect(computeQuality(half, false)).toBeCloseTo(expected, 6)
  })

  it('caps at QUALITY_CAP_WITHOUT_SINK when sink is not reached', () => {
    const huge = IDEAL_PATH_LENGTH * 10
    expect(computeQuality(huge, false)).toBe(QUALITY_CAP_WITHOUT_SINK)
  })

  it('never crosses LOCK_THRESHOLD without sink', () => {
    for (let n = 0; n <= IDEAL_PATH_LENGTH * 3; n++) {
      expect(computeQuality(n, false)).toBeLessThan(LOCK_THRESHOLD)
    }
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test:unit src/lib/minigame/relayRepair/__tests__/quality.spec.ts
```
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `quality.ts`**

```ts
/**
 * Signal-quality math for relay repair. Pure — no DOM, no state. Key
 * invariant: quality cannot reach `LOCK_THRESHOLD` without the sink being
 * reached, which gates the E lock-in. Tested explicitly.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import {
  IDEAL_PATH_LENGTH,
  QUALITY_CAP_WITHOUT_SINK,
  QUALITY_SCALE,
} from './constants'

/**
 * Compute signal quality in [0, 1]. Returns 1 when the wave reaches the
 * sink; otherwise scales from the active-cell count capped at
 * `QUALITY_CAP_WITHOUT_SINK`.
 *
 * @param activeCellCount - Number of cells carrying at least one active port.
 * @param sinkReached - True if one of the wave exits is the sink.
 * @returns Quality in [0, 1].
 */
export function computeQuality(activeCellCount: number, sinkReached: boolean): number {
  if (sinkReached) return 1
  return Math.min(
    QUALITY_CAP_WITHOUT_SINK,
    (activeCellCount / IDEAL_PATH_LENGTH) * QUALITY_SCALE,
  )
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Type-check + lint**

```bash
bun run type-check && bun lint
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/relayRepair/quality.ts src/lib/minigame/relayRepair/__tests__/quality.spec.ts
git commit -m "feat(relay): quality formula with sink-gated 0.95 invariant"
```

---

## Task 5: Wiggle path generator

**Files:**
- Create: `src/lib/minigame/relayRepair/wiggle.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/wiggle.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { wigglyPath } from '../wiggle'

describe('wigglyPath', () => {
  it('returns a trivial `M x,y` command when endpoints are identical', () => {
    expect(wigglyPath(10, 10, 10, 10, 0)).toBe('M 10.0,10.0')
  })

  it('starts at (x1, y1) and ends at (x2, y2) regardless of time', () => {
    const path = wigglyPath(0, 0, 100, 0, 1.5)
    expect(path.startsWith('M 0.0,0.0')).toBe(true)
    expect(path.endsWith('100.0,0.0')).toBe(true)
  })

  it('produces different geometry at different times (wave is animated)', () => {
    const a = wigglyPath(0, 0, 100, 0, 0)
    const b = wigglyPath(0, 0, 100, 0, 0.25)
    expect(a).not.toBe(b)
  })

  it('returns the same string for the same inputs', () => {
    expect(wigglyPath(0, 0, 100, 0, 0.3)).toBe(wigglyPath(0, 0, 100, 0, 0.3))
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `wiggle.ts`**

```ts
/**
 * Wiggly sine-wave SVG path generator. Perpendicular offset tapered by
 * `sin(t·π)` so the path touches the endpoints exactly at `t=0` and `t=1`.
 * Matches `docs/inspo/RelayRepairMinigame.jsx` lines 211–232.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import {
  WIGGLE_AMPLITUDE_PX,
  WIGGLE_MIN_STEPS,
  WIGGLE_PX_PER_STEP,
  WIGGLE_SPEED,
  WIGGLE_WAVELENGTH_PX,
} from './constants'

/**
 * Build an SVG path `d` string for an animated wiggly line.
 *
 * @param x1 - Start x.
 * @param y1 - Start y.
 * @param x2 - End x.
 * @param y2 - End y.
 * @param time - Elapsed seconds since the canvas mounted (drives phase).
 * @returns SVG path command string (e.g. `M 0.0,0.0 L 1.2,0.3 ...`).
 */
export function wigglyPath(x1: number, y1: number, x2: number, y2: number, time: number): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = Math.hypot(dx, dy)
  if (length < 0.1) return `M ${x1.toFixed(1)},${y1.toFixed(1)}`
  const ux = dx / length
  const uy = dy / length
  const px = -uy
  const py = ux
  const steps = Math.max(WIGGLE_MIN_STEPS, Math.ceil(length / WIGGLE_PX_PER_STEP))
  const pts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const d = t * length
    const edgeFade = Math.sin(t * Math.PI)
    const phase = (d / WIGGLE_WAVELENGTH_PX) * Math.PI * 2 - time * WIGGLE_SPEED
    const offset = Math.sin(phase) * WIGGLE_AMPLITUDE_PX * edgeFade
    const cx = x1 + ux * d + px * offset
    const cy = y1 + uy * d + py * offset
    pts.push(`${cx.toFixed(1)},${cy.toFixed(1)}`)
  }
  return 'M ' + pts.join(' L ')
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Type-check + lint**

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/relayRepair/wiggle.ts src/lib/minigame/relayRepair/__tests__/wiggle.spec.ts
git commit -m "feat(relay): wiggly SVG path generator"
```

---

## Task 6: Puzzle JSON + typed accessor

**Files:**
- Create: `src/data/minigames/relay-puzzles.json`
- Create: `src/lib/minigame/relayRepair/puzzles.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/puzzles.spec.ts`

- [ ] **Step 1: Write the JSON (mirrors prototype's INITIAL_CELLS)**

`src/data/minigames/relay-puzzles.json`:

```json
{
  "_default": {
    "label": "BACKBONE RETERM",
    "relay": "TITAN-RELAY-07",
    "carrier": "2.400 GHz",
    "idealPathLength": 11,
    "startSelected": "1-2",
    "cells": [
      { "row": 0, "col": 0, "shape": "L", "rotation": 2, "visualRotation": 2 },
      { "row": 0, "col": 1, "shape": "I", "rotation": 0, "visualRotation": 0 },
      { "row": 0, "col": 2, "shape": "L", "rotation": 1, "visualRotation": 1 },
      { "row": 0, "col": 3, "shape": "I", "rotation": 1, "visualRotation": 1 },
      { "row": 0, "col": 4, "shape": "L", "rotation": 2, "visualRotation": 2 },
      { "row": 1, "col": 0, "shape": "I", "rotation": 1, "visualRotation": 1 },
      { "row": 1, "col": 2, "shape": "T", "rotation": 3, "visualRotation": 3 },
      { "row": 1, "col": 4, "shape": "I", "rotation": 1, "visualRotation": 1 },
      { "row": 2, "col": 0, "shape": "L", "rotation": 0, "visualRotation": 0 },
      { "row": 2, "col": 1, "shape": "I", "rotation": 0, "visualRotation": 0 },
      { "row": 2, "col": 2, "shape": "L", "rotation": 3, "visualRotation": 3 },
      { "row": 2, "col": 3, "shape": "I", "rotation": 0, "visualRotation": 0 },
      { "row": 2, "col": 4, "shape": "L", "rotation": 0, "visualRotation": 0 }
    ]
  }
}
```

- [ ] **Step 2: Write failing tests**

```ts
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
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Implement `puzzles.ts`**

```ts
/**
 * Typed accessor over `relay-puzzles.json`. Keyed by EVA mission id with a
 * `_default` fallback so every relay-repair mission resolves to a playable
 * puzzle. Uses `satisfies` for compile-time schema validation.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import rawPuzzles from '@/data/minigames/relay-puzzles.json'
import type { RelayPuzzle } from './types'

/** Key of the fallback puzzle served for unmapped mission ids. */
export const DEFAULT_PUZZLE_KEY = '_default'

const PUZZLES: Record<string, RelayPuzzle> = rawPuzzles satisfies Record<string, RelayPuzzle>

/**
 * Look up the puzzle for a given EVA mission id.
 *
 * @param missionId - EVA mission id (matches keys in the JSON).
 * @returns Registered puzzle, or the `_default` entry.
 */
export function getRelayPuzzle(missionId: string): RelayPuzzle {
  return PUZZLES[missionId] ?? PUZZLES[DEFAULT_PUZZLE_KEY]!
}
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Type-check + lint**

- [ ] **Step 7: Commit**

```bash
git add src/data/minigames/relay-puzzles.json src/lib/minigame/relayRepair/puzzles.ts src/lib/minigame/relayRepair/__tests__/puzzles.spec.ts
git commit -m "feat(relay): puzzle JSON + typed accessor with _default fallback"
```

---

## Task 7: `RelayRepairMiniGame` class

**Files:**
- Create: `src/lib/minigame/relayRepair/RelayRepairMiniGame.ts`
- Create: `src/lib/minigame/relayRepair/__tests__/RelayRepairMiniGame.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest'
import { RelayRepairMiniGame } from '../RelayRepairMiniGame'

describe('RelayRepairMiniGame', () => {
  it('starts in active status with three steps, second step active', () => {
    const g = new RelayRepairMiniGame('earth_l1_relay_reterm')
    expect(g.status).toBe('active')
    expect(g.steps).toHaveLength(3)
    expect(g.steps[0]?.complete).toBe(true)
    expect(g.steps[1]?.active).toBe(true)
    expect(g.steps[2]?.active).toBe(false)
  })

  it('advertises overlay presentation', () => {
    const g = new RelayRepairMiniGame('m1')
    expect(g.presentation).toBe('overlay')
  })

  it('reports progress based on reported quality (0..100)', () => {
    const g = new RelayRepairMiniGame('m1')
    g.reportQuality(0.5)
    expect(g.progressCurrent).toBe(50)
    expect(g.progressTotal).toBe(100)
  })

  it('complete() transitions to completed and fires onComplete exactly once', () => {
    const g = new RelayRepairMiniGame('m1')
    const spy = vi.fn()
    g.onComplete = spy
    g.complete()
    g.complete()
    expect(g.status).toBe('completed')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('m1')
  })

  it('complete() marks the active step done and fires onStepChange', () => {
    const g = new RelayRepairMiniGame('m1')
    const stepSpy = vi.fn()
    g.onStepChange = stepSpy
    g.complete()
    expect(g.steps[1]?.complete).toBe(true)
    expect(g.steps[2]?.complete).toBe(true)
    expect(stepSpy).toHaveBeenCalledTimes(1)
  })

  it('tick is a no-op and does not change status', () => {
    const g = new RelayRepairMiniGame('m1')
    g.tick(0.016, {
      shipPosition: { x: 0, y: 0, z: 0 },
      orbitState: 'orbiting',
      orbitedPlanetId: 'earth',
      distanceToPlanet: 100,
    })
    expect(g.status).toBe('active')
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement the class**

```ts
/**
 * Relay repair minigame — Vue-overlay-presented. Contract bridge for the
 * `OrbitalMiniGame` host. All puzzle state, RAF loop, and rendering live in
 * `RelayRepairCanvas.vue`. The canvas reports current quality via
 * `reportQuality` so HUD code can read `progressCurrent` without reaching
 * into the component.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'

/**
 * Relay repair minigame — see file header for architecture notes.
 *
 * @author guinetik
 * @date 2026-04-20
 */
export class RelayRepairMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** Shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Relay renders inside a Vue overlay. */
  readonly presentation = 'overlay' as const

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Approach Relay Bay', complete: true, active: false },
    { label: 'Reterminate Backbone', complete: false, active: true },
    { label: 'Confirm Carrier Lock', complete: false, active: false },
  ]
  private _quality = 0

  /** Minigame completed — fires with mission id. Set by host. */
  onComplete: ((missionId: string) => void) | null = null
  /** Steps changed — fires with updated steps for reactivity. Set by host. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new relay repair minigame.
   *
   * @param missionId - shuttle mission id
   */
  constructor(missionId: string) {
    this.missionId = missionId
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — latest quality rounded to an integer percent. */
  get progressCurrent(): number {
    return Math.round(this._quality * 100)
  }

  /** Progress denominator — always 100 (percent scale). */
  get progressTotal(): number {
    return 100
  }

  /**
   * Per-frame update. No-op — the canvas drives all state via `reportQuality`.
   *
   * @param _dt - Delta time (unused).
   * @param _ctx - Map scene context (unused).
   */
  tick(_dt: number, _ctx: OrbitalMiniGameContext): void {
    // No-op — canvas-driven.
  }

  /**
   * Called by the canvas each tick with the current quality so the HUD
   * tracker can display progress without reaching into component state.
   *
   * @param quality - Current quality in [0, 1].
   */
  reportQuality(quality: number): void {
    if (this._status !== 'active') return
    this._quality = quality
  }

  /**
   * Finalize the minigame. Idempotent — subsequent calls are ignored.
   */
  complete(): void {
    if (this._status !== 'active') return
    const reterm = this._steps[1]
    const confirm = this._steps[2]
    if (reterm) {
      reterm.complete = true
      reterm.active = false
    }
    if (confirm) {
      confirm.complete = true
      confirm.active = false
    }
    this._status = 'completed'
    this.onStepChange?.(this._steps)
    this.onComplete?.(this.missionId)
  }

  /** Clean up resources — no-op. */
  dispose(): void {
    // No resources held; canvas manages its own RAF + listener teardown.
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Type-check + lint**

- [ ] **Step 6: Commit**

```bash
git add src/lib/minigame/relayRepair/RelayRepairMiniGame.ts src/lib/minigame/relayRepair/__tests__/RelayRepairMiniGame.spec.ts
git commit -m "feat(relay): OrbitalMiniGame bridge class"
```

---

## Task 8: Factory + dispatcher + placeholder canvas

**Files:**
- Modify: `src/lib/minigame/orbitalMiniGameFactory.ts`
- Modify: `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`
- Create: `src/components/RelayRepairCanvas.vue`
- Modify: `src/components/EvaMinigameOverlay.vue`

- [ ] **Step 1: Extend factory test**

Open `src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts`. Add import at top:

```ts
import { RelayRepairMiniGame } from '../relayRepair/RelayRepairMiniGame'
```

Inside the existing main describe block add a case following the telescope pattern:

```ts
it('creates a RelayRepairMiniGame for relay_repair', () => {
  const g = createOrbitalMiniGame('earth_l1_relay_reterm', 'relay_repair', 0)
  expect(g).toBeInstanceOf(RelayRepairMiniGame)
  expect(g.presentation).toBe('overlay')
})
```

In the `OrbitalMiniGame.presentation` table at the bottom of the file, add one row (keep the existing order):

```ts
['telescope_alignment', 'overlay'],
['relay_repair', 'overlay'],
['unknown-type', 'overlay'],
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test:unit src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts
```
Expected: FAIL — factory returns `DefaultOrbitalMiniGame` for `relay_repair`.

- [ ] **Step 3: Add the factory case**

In `src/lib/minigame/orbitalMiniGameFactory.ts` add the import near the others:

```ts
import { RelayRepairMiniGame } from './relayRepair/RelayRepairMiniGame'
```

And inside the switch, above `default`:

```ts
case 'relay_repair':
  return new RelayRepairMiniGame(missionId)
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Create the placeholder canvas**

`src/components/RelayRepairCanvas.vue`:

```vue
<!--
  RelayRepairCanvas.vue

  Placeholder dispatch target for `relay_repair`. Full grid UI lands in
  Task 9 onward — this renders a card with a WIP complete button so the
  EVA reward loop is exercised end-to-end.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active relay minigame instance. */
  minigame: RelayRepairMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

/** Temporary complete handler — replaced by lock-in in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="relay-overlay">
    <h2>{{ mission.template.name }}</h2>
    <p>Relay repair minigame — WIP placeholder.</p>
    <div class="relay-placeholder-actions">
      <button type="button" @click="handleTempComplete">(WIP) Complete</button>
      <button type="button" @click="emit('close')">Close</button>
    </div>
  </div>
</template>
```

Add minimal placeholder styles to `src/assets/css/main.css`:

```css
/* ──────────────────────────────────────────────────────────────────────── */
/* Relay repair minigame                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

.relay-overlay {
  @apply w-full max-w-3xl rounded-xl border border-cyan-400/20
         bg-slate-900/95 shadow-2xl
         flex flex-col gap-4 p-6 font-mono text-cyan-100;
  max-height: 90vh;
  overflow: hidden;
}
.relay-placeholder-actions {
  @apply mt-4 flex gap-3;
}
.relay-placeholder-actions button {
  @apply px-4 py-2 border border-cyan-400/40 rounded text-cyan-100 hover:bg-cyan-400/10;
}
```

- [ ] **Step 6: Branch the dispatcher**

Edit `src/components/EvaMinigameOverlay.vue`:

1. Add imports in `<script setup lang="ts">`:

```ts
import RelayRepairCanvas from '@/components/RelayRepairCanvas.vue'
import { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'
```

2. Add a narrowing computed next to the telescope one:

```ts
/** Narrow the generic minigame to a relay instance for the canvas prop. */
const relayMinigame = computed(() =>
  props.minigame instanceof RelayRepairMiniGame ? props.minigame : null,
)
```

3. In the template, add the `v-else-if` branch between the telescope branch and the default card:

```vue
<TelescopeAlignmentCanvas
  v-if="telescopeMinigame"
  :mission="mission"
  :minigame="telescopeMinigame"
  @complete="emit('complete')"
  @close="emit('close')"
/>
<RelayRepairCanvas
  v-else-if="relayMinigame"
  :mission="mission"
  :minigame="relayMinigame"
  @complete="emit('complete')"
  @close="emit('close')"
/>
<div v-else class="mission-minigame-card">
  <!-- existing card markup unchanged -->
</div>
```

- [ ] **Step 7: Full gates**

```bash
bun run type-check && bun lint && bun test:unit
```
All green.

- [ ] **Step 8: Manual sanity check**

Run `bun dev`, accept `earth_l1_relay_reterm` (or any relay_repair mission), reach the POI, press F, confirm the WIP card opens, press `(WIP) Complete` — reward should pay + EVA resume.

- [ ] **Step 9: Commit**

```bash
git add src/lib/minigame/orbitalMiniGameFactory.ts src/lib/minigame/__tests__/orbitalMiniGameFactory.spec.ts src/components/RelayRepairCanvas.vue src/components/EvaMinigameOverlay.vue src/assets/css/main.css
git commit -m "feat(relay): factory case + overlay dispatch with placeholder canvas"
```

---

## Task 9: Static overlay layout (no interactivity)

**Files:**
- Modify: `src/components/RelayRepairCanvas.vue`
- Modify: `src/assets/css/main.css`

Replace the placeholder with the full structural layout. No interactivity yet — static grid at the prototype's initial rotations, signal quality bar hard-coded at 0%, selected ring on `1-2`.

- [ ] **Step 1: Rewrite the SFC shell**

```vue
<!--
  RelayRepairCanvas.vue

  Overlay canvas for the relay repair minigame. Renders a 5×3 pipe grid
  inside the existing `.mission-minigame-overlay` backdrop. Interactivity
  lands in Task 10; wave trace in Task 11; lock-in in Task 11.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'
import { getRelayPuzzle } from '@/lib/minigame/relayRepair/puzzles'
import {
  CELL_PX,
  GRID_COLS,
  GRID_ROWS,
  NODE_RADIUS_PCT,
} from '@/lib/minigame/relayRepair/constants'
import { SHAPE_ROTATIONS } from '@/lib/minigame/relayRepair/shapes'
import type { Cell, Direction } from '@/lib/minigame/relayRepair/types'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active relay minigame instance. */
  minigame: RelayRepairMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

const puzzle = getRelayPuzzle(props.mission.template.id)

const GRID_W = GRID_COLS * CELL_PX
const GRID_H = GRID_ROWS * CELL_PX
const NODE_R = CELL_PX * NODE_RADIUS_PCT

/** Get the SVG center of a cell. */
function cellCenter(row: number, col: number): { cx: number; cy: number } {
  return { cx: col * CELL_PX + CELL_PX / 2, cy: row * CELL_PX + CELL_PX / 2 }
}

/** Get the SVG edge point of a cell in the given direction. */
function portEdge(row: number, col: number, port: Direction): { x: number; y: number } {
  const { cx, cy } = cellCenter(row, col)
  const h = CELL_PX / 2
  if (port === 'N') return { x: cx, y: cy - h }
  if (port === 'E') return { x: cx + h, y: cy }
  if (port === 'S') return { x: cx, y: cy + h }
  return { x: cx - h, y: cy }
}

/** Get the SVG node-edge point of a cell in the given direction. */
function portStart(row: number, col: number, port: Direction): { x: number; y: number } {
  const { cx, cy } = cellCenter(row, col)
  if (port === 'N') return { x: cx, y: cy - NODE_R }
  if (port === 'E') return { x: cx + NODE_R, y: cy }
  if (port === 'S') return { x: cx, y: cy + NODE_R }
  return { x: cx - NODE_R, y: cy }
}

/** Placeholder handler until lock-in ships in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}

/** Canonical port list for a cell in its current rotation — static for this task. */
function cellPorts(cell: Cell): readonly Direction[] {
  return SHAPE_ROTATIONS[cell.shape][cell.rotation] ?? []
}
</script>

<template>
  <div class="relay-overlay" role="dialog" aria-label="Relay repair" tabindex="0">
    <div class="relay-status">
      <span class="relay-status__location">EVA / RELAY BAY · {{ puzzle.relay }}</span>
      <span class="relay-status__mission">{{ mission.template.name }}</span>
      <span class="relay-status__state">CALIBRATING</span>
    </div>

    <div class="relay-osc">
      <div class="relay-osc__label">
        <span>INPUT SIGNAL · {{ puzzle.carrier }} · CLEAN</span>
        <span class="relay-osc__lock">● CARRIER LOCKED</span>
      </div>
      <div class="relay-osc__trace" />
    </div>

    <div class="relay-grid-panel">
      <div class="relay-grid-panel__header">
        <span>SIGNAL GRID · {{ puzzle.relay }}</span>
        <span class="relay-grid-panel__state">⚠ PATH INCOMPLETE</span>
      </div>
      <svg
        class="relay-grid-panel__svg"
        :viewBox="`-60 -20 ${GRID_W + 120} ${GRID_H + 40}`"
        preserveAspectRatio="xMidYMid meet"
      >
        <!-- Grid lines -->
        <g>
          <line
            v-for="i in GRID_ROWS + 1"
            :key="`h${i}`"
            :x1="0"
            :y1="(i - 1) * CELL_PX"
            :x2="GRID_W"
            :y2="(i - 1) * CELL_PX"
            class="relay-grid__line"
          />
          <line
            v-for="i in GRID_COLS + 1"
            :key="`v${i}`"
            :x1="(i - 1) * CELL_PX"
            :y1="0"
            :x2="(i - 1) * CELL_PX"
            :y2="GRID_H"
            class="relay-grid__line"
          />
        </g>

        <!-- Cells -->
        <g v-for="cell in puzzle.cells" :key="`${cell.row}-${cell.col}`">
          <g
            class="relay-node"
            :style="{
              transform: `rotate(${cell.visualRotation * 90}deg)`,
              transformOrigin: `${cellCenter(cell.row, cell.col).cx}px ${cellCenter(cell.row, cell.col).cy}px`,
            }"
          >
            <template v-for="port in SHAPE_ROTATIONS[cell.shape][0]" :key="port">
              <line
                :x1="cellCenter(cell.row, cell.col).cx"
                :y1="cellCenter(cell.row, cell.col).cy"
                :x2="portStart(cell.row, cell.col, port).x"
                :y2="portStart(cell.row, cell.col, port).y"
                class="relay-hub-arm"
              />
              <line
                :x1="portStart(cell.row, cell.col, port).x"
                :y1="portStart(cell.row, cell.col, port).y"
                :x2="portEdge(cell.row, cell.col, port).x"
                :y2="portEdge(cell.row, cell.col, port).y"
                class="relay-pipe-arm"
              />
            </template>
          </g>
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            :r="NODE_R"
            class="relay-node-body"
          />
          <circle
            :cx="cellCenter(cell.row, cell.col).cx"
            :cy="cellCenter(cell.row, cell.col).cy"
            r="2"
            class="relay-node-hub"
          />
          <text
            :x="cellCenter(cell.row, cell.col).cx + NODE_R - 4"
            :y="cellCenter(cell.row, cell.col).cy + NODE_R - 2"
            class="relay-node-glyph"
          >
            {{ cell.shape }}
          </text>
        </g>
      </svg>
    </div>

    <div class="relay-quality">
      <div class="relay-quality__label">SIGNAL QUALITY</div>
      <div class="relay-quality__bar"><span style="width: 0%;" class="relay-bar-amber" /></div>
      <div class="relay-quality__pct">0%</div>
    </div>

    <div class="relay-hints">
      <span>WASD · MOVE</span>
      <span>CLICK · WHEEL · ROTATE</span>
      <span>R · ROTATE</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <button type="button" class="relay-temp-complete" @click="handleTempComplete">(WIP) Complete</button>
    <button type="button" class="relay-close" @click="emit('close')">Close</button>
  </div>
</template>
```

- [ ] **Step 2: Replace the placeholder CSS in `src/assets/css/main.css`**

Find the `/* Relay repair minigame */` block added in Task 8 and replace everything under it up to the next top-level block comment with:

```css
/* ──────────────────────────────────────────────────────────────────────── */
/* Relay repair minigame                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

.relay-overlay {
  @apply relative w-full max-w-4xl rounded-xl border border-cyan-400/20
         bg-slate-900/95 shadow-2xl
         flex flex-col gap-3 p-6 font-mono text-cyan-100;
  max-height: 90vh;
  overflow: hidden;
}
.relay-status {
  @apply flex justify-between items-center border-y border-cyan-400/25
         px-3 py-2 text-xs tracking-widest;
}
.relay-osc {
  @apply relative border border-cyan-400/25 bg-slate-950/70;
  height: 64px;
  overflow: hidden;
}
.relay-osc__label {
  @apply absolute inset-x-0 top-0 flex justify-between items-center
         px-2 py-1 text-[9px] tracking-widest text-cyan-200/60
         border-b border-cyan-400/15 bg-slate-950/60;
}
.relay-osc__lock {
  @apply text-emerald-300;
}
.relay-osc__trace {
  @apply absolute inset-x-0 bottom-0;
  height: 48px;
  background: repeating-linear-gradient(
    to right,
    transparent 0 49px,
    rgba(34, 211, 238, 0.12) 49px 50px
  );
}
.relay-grid-panel {
  @apply relative border border-cyan-400/25 bg-slate-950/70 px-8 py-4;
}
.relay-grid-panel__header {
  @apply flex justify-between items-center mb-2 text-[9px]
         tracking-widest text-cyan-200/50;
}
.relay-grid-panel__state {
  @apply text-amber-300;
}
.relay-grid-panel__svg {
  @apply w-full;
  display: block;
}
.relay-grid__line {
  stroke: rgba(34, 211, 238, 0.06);
  stroke-width: 1;
}
.relay-node {
  transition: transform 260ms cubic-bezier(0.22, 0.8, 0.32, 1.05);
}
.relay-hub-arm {
  stroke: rgba(103, 232, 249, 0.3);
  stroke-width: 2;
  stroke-linecap: round;
}
.relay-pipe-arm {
  stroke: rgba(103, 232, 249, 0.3);
  stroke-width: 2;
  stroke-linecap: round;
}
.relay-pipe-arm--active {
  stroke: #22d3ee;
  stroke-width: 3.5;
  filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.5));
}
.relay-hub-arm--active {
  stroke: #22d3ee;
  stroke-width: 3;
}
.relay-node-body {
  fill: rgba(10, 15, 26, 0.92);
  stroke: rgba(34, 211, 238, 0.45);
  stroke-width: 1.5;
  transition: stroke 160ms, fill 160ms;
}
.relay-node-body--active {
  fill: rgba(34, 211, 238, 0.1);
  stroke: #22d3ee;
}
.relay-node-body--hovered {
  stroke: #7dd3fc;
}
.relay-node-hub {
  fill: rgba(34, 211, 238, 0.5);
}
.relay-node-hub--active {
  fill: #7dd3fc;
  filter: drop-shadow(0 0 4px #22d3ee);
}
.relay-node-glyph {
  fill: rgba(103, 232, 249, 0.4);
  font-size: 8px;
  font-family: monospace;
  letter-spacing: 1px;
  text-anchor: end;
}
.relay-selection-ring {
  fill: none;
  stroke: #7dd3fc;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  opacity: 0.65;
}
.relay-quality {
  @apply flex items-center gap-3 border border-cyan-400/25 px-4 py-2 text-sm;
}
.relay-quality__bar {
  @apply flex-1 h-2 bg-cyan-400/10;
}
.relay-quality__bar span {
  @apply block h-full;
  transition: width 180ms ease-out;
}
.relay-bar-amber { @apply bg-amber-400; }
.relay-bar-green { @apply bg-emerald-400; }
.relay-bar-cyan { @apply bg-cyan-400; }
.relay-hints {
  @apply flex flex-wrap gap-4 text-[10px] tracking-widest text-cyan-200/60;
}
.relay-caption {
  @apply absolute inset-x-0 bottom-20 mx-auto w-fit border border-emerald-400/60
         bg-slate-950/80 px-6 py-3 text-center tracking-widest;
}
.relay-caption__label { @apply text-emerald-200; }
.relay-caption__body { @apply text-cyan-100 text-xs; }
/* matches CAPTION_FADE_MS = 1200 */
.relay-caption-enter-active { transition: opacity 1200ms ease-in; }
.relay-caption-enter-from { opacity: 0; }
.relay-caption-enter-to { opacity: 1; }
.relay-temp-complete,
.relay-close {
  @apply absolute top-4 right-4 px-3 py-1 border border-cyan-400/40
         rounded text-cyan-100;
}
.relay-close { right: 140px; }
```

- [ ] **Step 3: Visual QA**

`bun dev`, open any `relay_repair` mission, confirm the grid renders with 13 cells in their initial rotations, oscilloscope strip visible above the grid, quality bar shows 0%, hint row reads WASD / CLICK / WHEEL / R / E / ESC.

- [ ] **Step 4: Full gates**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/RelayRepairCanvas.vue src/assets/css/main.css
git commit -m "feat(relay): static overlay layout with SVG grid and oscilloscope"
```

---

## Task 10: Interactivity + wave wiring

**Files:**
- Modify: `src/components/RelayRepairCanvas.vue`

- [ ] **Step 1: Extend `<script setup>` with reactive state + handlers**

Add imports (merge where appropriate):

```ts
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { DIR_DELTA } from '@/lib/minigame/relayRepair/shapes'
import { traceWave, cellId } from '@/lib/minigame/relayRepair/wave'
import { computeQuality } from '@/lib/minigame/relayRepair/quality'
import type { Rotation } from '@/lib/minigame/relayRepair/types'
```

Replace the static `puzzle` lookup with a reactive `cells` array plus selection + hover state:

```ts
const puzzle = getRelayPuzzle(props.mission.template.id)

/** Source row, col, and heading when the wave enters the grid. */
const SOURCE_ROW = 0
const SOURCE_COL = 0
const SOURCE_DIR: Direction = 'E'

/** Sink row, col, and direction the wave must exit heading. */
const SINK_ROW = 2
const SINK_COL = GRID_COLS
const SINK_DIR: Direction = 'E'

const cells = reactive(puzzle.cells.map((c) => ({ ...c })))
const selectedId = ref<string>(puzzle.startSelected)
const hoveredId = ref<string | null>(null)

const trace = computed(() => traceWave(cells, SOURCE_ROW, SOURCE_COL, SOURCE_DIR))
const sinkReached = computed(() =>
  trace.value.exits.some(
    (e) => e.row === SINK_ROW && e.col === SINK_COL && e.dir === SINK_DIR,
  ),
)
const quality = computed(() => computeQuality(trace.value.activeCells.size, sinkReached.value))
const qualityPct = computed(() => Math.round(quality.value * 100))
const canLock = computed(() => quality.value >= 0.95)
const deadEnds = computed(() => {
  const list: Array<{ fromRow: number; fromCol: number; dir: Direction }> = []
  for (const exit of trace.value.exits) {
    if (exit.row === SINK_ROW && exit.col === SINK_COL && exit.dir === SINK_DIR) continue
    const [dr, dc] = DIR_DELTA[exit.dir]
    const fromRow = exit.row - dr
    const fromCol = exit.col - dc
    if (trace.value.activeCells.has(cellId(fromRow, fromCol))) {
      list.push({ fromRow, fromCol, dir: exit.dir })
    }
  }
  return list
})

/** Is this specific port segment lit right now? */
function segmentActive(row: number, col: number, port: Direction): boolean {
  return trace.value.activeSegments.has(`${row}-${col}-${port}`)
}

/** Is this cell currently the selected one? */
function isSelected(cell: { row: number; col: number }): boolean {
  return selectedId.value === cellId(cell.row, cell.col)
}

/** Is this cell currently hovered? */
function isHovered(cell: { row: number; col: number }): boolean {
  return hoveredId.value === cellId(cell.row, cell.col)
}

/** Rotate the target cell one step CW. */
function rotateCell(id: string): void {
  const cell = cells.find((c) => cellId(c.row, c.col) === id)
  if (!cell) return
  cell.rotation = (((cell.rotation + 1) % 4 + 4) % 4) as Rotation
  cell.visualRotation = cell.visualRotation + 1
  props.minigame.reportQuality(quality.value)
}

/** Move the selection one cell in the given grid direction, skipping empties. */
function moveSelection(dir: Direction): void {
  const current = cells.find((c) => cellId(c.row, c.col) === selectedId.value)
  if (!current) return
  const [dr, dc] = DIR_DELTA[dir]
  const target = cells.find((c) => c.row === current.row + dr && c.col === current.col + dc)
  if (target) selectedId.value = cellId(target.row, target.col)
}

function handleCellClick(id: string): void {
  selectedId.value = id
  rotateCell(id)
}

function handleCellWheel(e: WheelEvent, id: string): void {
  e.preventDefault()
  selectedId.value = id
  rotateCell(id)
}

function onKeyDown(e: KeyboardEvent): void {
  const k = e.key.toLowerCase()
  if (k === 'escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (k === 'w' || e.key === 'ArrowUp') { e.preventDefault(); moveSelection('N'); return }
  if (k === 's' || e.key === 'ArrowDown') { e.preventDefault(); moveSelection('S'); return }
  if (k === 'a' || e.key === 'ArrowLeft') { e.preventDefault(); moveSelection('W'); return }
  if (k === 'd' || e.key === 'ArrowRight') { e.preventDefault(); moveSelection('E'); return }
  if (k === 'r') { e.preventDefault(); rotateCell(selectedId.value); return }
  // `e` key handler added in Task 11.
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  props.minigame.reportQuality(quality.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
```

- [ ] **Step 2: Bind the template to live state**

Swap every cell-group block to wire click/wheel/hover + active segment styling:

```vue
<g
  v-for="cell in cells"
  :key="`${cell.row}-${cell.col}`"
  :class="{ 'relay-cell--selected': isSelected(cell), 'relay-cell--hovered': isHovered(cell) }"
  @click.stop="handleCellClick(`${cell.row}-${cell.col}`)"
  @mouseenter="hoveredId = `${cell.row}-${cell.col}`"
  @mouseleave="hoveredId = null"
  @wheel="handleCellWheel($event, `${cell.row}-${cell.col}`)"
>
  <rect
    :x="cell.col * CELL_PX + 4"
    :y="cell.row * CELL_PX + 4"
    :width="CELL_PX - 8"
    :height="CELL_PX - 8"
    fill="transparent"
  />
  <g
    class="relay-node"
    :style="{
      transform: `rotate(${cell.visualRotation * 90}deg)`,
      transformOrigin: `${cellCenter(cell.row, cell.col).cx}px ${cellCenter(cell.row, cell.col).cy}px`,
    }"
  >
    <template v-for="(canonPort, i) in SHAPE_ROTATIONS[cell.shape][0]" :key="canonPort">
      <line
        :x1="cellCenter(cell.row, cell.col).cx"
        :y1="cellCenter(cell.row, cell.col).cy"
        :x2="portStart(cell.row, cell.col, canonPort).x"
        :y2="portStart(cell.row, cell.col, canonPort).y"
        class="relay-hub-arm"
        :class="{ 'relay-hub-arm--active': segmentActive(cell.row, cell.col, SHAPE_ROTATIONS[cell.shape][cell.rotation][i]!) }"
      />
      <line
        :x1="portStart(cell.row, cell.col, canonPort).x"
        :y1="portStart(cell.row, cell.col, canonPort).y"
        :x2="portEdge(cell.row, cell.col, canonPort).x"
        :y2="portEdge(cell.row, cell.col, canonPort).y"
        class="relay-pipe-arm"
        :class="{ 'relay-pipe-arm--active': segmentActive(cell.row, cell.col, SHAPE_ROTATIONS[cell.shape][cell.rotation][i]!) }"
      />
    </template>
  </g>
  <circle
    :cx="cellCenter(cell.row, cell.col).cx"
    :cy="cellCenter(cell.row, cell.col).cy"
    :r="NODE_R"
    class="relay-node-body"
    :class="{
      'relay-node-body--active': cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)),
      'relay-node-body--hovered': isHovered(cell),
    }"
  />
  <circle
    :cx="cellCenter(cell.row, cell.col).cx"
    :cy="cellCenter(cell.row, cell.col).cy"
    :r="cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)) ? 3.5 : 2"
    class="relay-node-hub"
    :class="{ 'relay-node-hub--active': cellPorts(cell).some((p) => segmentActive(cell.row, cell.col, p)) }"
  />
  <text
    :x="cellCenter(cell.row, cell.col).cx + NODE_R - 4"
    :y="cellCenter(cell.row, cell.col).cy + NODE_R - 2"
    class="relay-node-glyph"
  >
    {{ cell.shape }}
  </text>
  <circle
    v-if="isSelected(cell)"
    :cx="cellCenter(cell.row, cell.col).cx"
    :cy="cellCenter(cell.row, cell.col).cy"
    :r="NODE_R + 12"
    class="relay-selection-ring"
  />
</g>
```

Update the quality bar binding:

```vue
<div class="relay-quality__bar">
  <span :style="{ width: `${qualityPct}%` }" :class="canLock ? 'relay-bar-green' : 'relay-bar-amber'" />
</div>
<div class="relay-quality__pct">{{ qualityPct }}%</div>
```

Update the status state span:

```vue
<span class="relay-status__state">
  {{ canLock ? 'SIGNAL LOCK AVAILABLE' : sinkReached ? 'PATH COMPLETE' : 'CALIBRATING' }}
</span>
```

Update the grid panel header state:

```vue
<span class="relay-grid-panel__state" :class="{ 'relay-grid-panel__state--ok': sinkReached }">
  {{ sinkReached ? '● BACKBONE RESTORED' : '⚠ PATH INCOMPLETE' }}
</span>
```

Render dead-end markers:

```vue
<g v-for="(de, i) in deadEnds" :key="`de-${i}`">
  <circle
    :cx="portEdge(de.fromRow, de.fromCol, de.dir).x"
    :cy="portEdge(de.fromRow, de.fromCol, de.dir).y"
    r="3"
    class="relay-dead-end"
  />
</g>
```

- [ ] **Step 3: Add the new CSS classes to `main.css`**

Append:

```css
.relay-grid-panel__state--ok {
  @apply text-emerald-300;
}
.relay-dead-end {
  fill: #fbbf24;
  filter: drop-shadow(0 0 5px #fbbf24);
}
```

- [ ] **Step 4: Manual QA**

- Click any cell → rotates + becomes selected.
- W/A/S/D moves the selection ring skipping empty cells.
- R rotates the selected cell.
- Wheel over a cell rotates it.
- Rotate (0,3) and (1,2) each once → quality hits 100%, status flips to `SIGNAL LOCK AVAILABLE`, header reads `● BACKBONE RESTORED`.
- Over-rotate a cell onto a dead-end → amber dot appears at the edge where the wave died.

- [ ] **Step 5: Full gates**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/RelayRepairCanvas.vue src/assets/css/main.css
git commit -m "feat(relay): cell interactivity + live wave trace + dead-end markers"
```

---

## Task 11: RAF wiggle + lock-in + caption + ESC

**Files:**
- Modify: `src/components/RelayRepairCanvas.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Add lock state + RAF wiggle loop + handlers**

In `<script setup>`:

```ts
import {
  CAPTION_FADE_MS,
  LOCK_ANIMATION_MS,
  LOCK_THRESHOLD,
} from '@/lib/minigame/relayRepair/constants'
import { wigglyPath } from '@/lib/minigame/relayRepair/wiggle'

/** Lock-in state machine — `calibrating` accepts tuning, then `locking` plays the animation, then `locked`. */
type LockState = 'calibrating' | 'locking' | 'locked'
const lockState = ref<LockState>('calibrating')
const time = ref(0)
let rafId = 0
let lastTs = 0

/** RAF loop — advances wiggle time. Pauses when the player has locked in. */
function tick(ts: number): void {
  if (lockState.value === 'locked') { rafId = 0; return }
  if (lastTs === 0) lastTs = ts
  const dt = (ts - lastTs) / 1000
  lastTs = ts
  time.value += dt
  rafId = requestAnimationFrame(tick)
}

/** Wiggly path `d` for an active outer pipe arm. */
function wigglePathD(row: number, col: number, port: Direction): string {
  const s = portStart(row, col, port)
  const e = portEdge(row, col, port)
  return wigglyPath(s.x, s.y, e.x, e.y, time.value)
}

/** Kick off the lock-in sequence. */
function handleLockIn(): void {
  if (quality.value < LOCK_THRESHOLD || lockState.value !== 'calibrating') return
  lockState.value = 'locking'
  setTimeout(() => {
    lockState.value = 'locked'
    props.minigame.complete()
    setTimeout(() => emit('complete'), CAPTION_FADE_MS)
  }, LOCK_ANIMATION_MS)
}

/** Status-bar text reflecting current lock state. */
const statusText = computed(() => {
  if (lockState.value === 'locked') return 'BACKBONE RESTORED'
  if (lockState.value === 'locking') return 'LOCKING IN'
  if (canLock.value) return 'SIGNAL LOCK AVAILABLE'
  return sinkReached.value ? 'PATH COMPLETE' : 'CALIBRATING'
})
```

Extend `onKeyDown` — add at the top, after reading `k`:

```ts
if (lockState.value !== 'calibrating' && k !== 'escape') return
```

Add the `e` case inside the existing handler chain (before the generic fallback):

```ts
if (k === 'e' && canLock.value) { e.preventDefault(); handleLockIn(); return }
```

Start/stop the RAF:

```ts
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  props.minigame.reportQuality(quality.value)
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (rafId) cancelAnimationFrame(rafId)
})
```

- [ ] **Step 2: Swap static active pipe arms for wiggly paths + add caption + remove WIP buttons**

In the template, replace the two `<line class="relay-pipe-arm...">` elements with conditional rendering — when the segment is active, draw a `<path>` using `wigglePathD`; otherwise keep the static line:

```vue
<template v-for="(canonPort, i) in SHAPE_ROTATIONS[cell.shape][0]" :key="canonPort">
  <line
    :x1="cellCenter(cell.row, cell.col).cx"
    :y1="cellCenter(cell.row, cell.col).cy"
    :x2="portStart(cell.row, cell.col, canonPort).x"
    :y2="portStart(cell.row, cell.col, canonPort).y"
    class="relay-hub-arm"
    :class="{ 'relay-hub-arm--active': segmentActive(cell.row, cell.col, SHAPE_ROTATIONS[cell.shape][cell.rotation][i]!) }"
  />
  <template v-if="segmentActive(cell.row, cell.col, SHAPE_ROTATIONS[cell.shape][cell.rotation][i]!)">
    <path
      :d="wigglePathD(cell.row, cell.col, canonPort)"
      class="relay-pipe-arm--active-path"
    />
  </template>
  <template v-else>
    <line
      :x1="portStart(cell.row, cell.col, canonPort).x"
      :y1="portStart(cell.row, cell.col, canonPort).y"
      :x2="portEdge(cell.row, cell.col, canonPort).x"
      :y2="portEdge(cell.row, cell.col, canonPort).y"
      class="relay-pipe-arm"
    />
  </template>
</template>
```

Bind status text to `statusText`:

```vue
<span class="relay-status__state">{{ statusText }}</span>
```

Add the caption (just above the two WIP buttons):

```vue
<transition name="relay-caption">
  <div v-if="lockState === 'locked'" class="relay-caption">
    <div class="relay-caption__label">{{ puzzle.label }}</div>
    <div class="relay-caption__body">Carrier {{ puzzle.carrier }} · backbone nominal</div>
  </div>
</transition>
```

Delete the two WIP buttons (`<button class="relay-temp-complete">` and `<button class="relay-close">`) plus their `handleTempComplete` function in the script block.

- [ ] **Step 3: Add the active-path + delete WIP button styles**

Append to `main.css`:

```css
.relay-pipe-arm--active-path {
  fill: none;
  stroke: #22d3ee;
  stroke-width: 3.5;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px rgba(34, 211, 238, 0.5));
}
```

Delete the `.relay-temp-complete`, `.relay-close` rules from earlier.

- [ ] **Step 4: Manual QA**

- With zero input, active pipes wiggle gently; quality stays whatever it is, no drift crossing LOCK_THRESHOLD without sink.
- Rotate to completion → status reads `SIGNAL LOCK AVAILABLE`, press E → 450ms lock animation, caption fades in, reward pays, overlay closes, EVA resumes.
- Press E below threshold → nothing happens.
- Press Esc pre-lock → closes without reward.

- [ ] **Step 5: Full gates**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/RelayRepairCanvas.vue src/assets/css/main.css
git commit -m "feat(relay): wiggle RAF + lock-in sequence + caption fade + ESC abort"
```

---

## Task 12: Polish (hover halo, selection halo, oscilloscope trace, terminal arrows, a11y)

**Files:**
- Modify: `src/components/RelayRepairCanvas.vue`
- Modify: `src/assets/css/main.css`

- [ ] **Step 1: Draw source/sink terminals in the SVG**

Add a `<Terminal>`-equivalent block (inline SVG — no sub-component needed):

```vue
<!-- Source terminal (IN) at left edge -->
<g>
  <line
    :x1="portEdge(SOURCE_ROW, SOURCE_COL, 'W').x - 18"
    :y1="portEdge(SOURCE_ROW, SOURCE_COL, 'W').y"
    :x2="portEdge(SOURCE_ROW, SOURCE_COL, 'W').x"
    :y2="portEdge(SOURCE_ROW, SOURCE_COL, 'W').y"
    class="relay-terminal-line relay-terminal-line--active"
  />
  <text
    :x="portEdge(SOURCE_ROW, SOURCE_COL, 'W').x - 36"
    :y="portEdge(SOURCE_ROW, SOURCE_COL, 'W').y - 6"
    class="relay-terminal-label"
    text-anchor="end"
  >IN</text>
  <text
    :x="portEdge(SOURCE_ROW, SOURCE_COL, 'W').x - 36"
    :y="portEdge(SOURCE_ROW, SOURCE_COL, 'W').y + 9"
    class="relay-terminal-sublabel relay-terminal-sublabel--active"
    text-anchor="end"
  >{{ puzzle.carrier }} · LOCKED</text>
</g>

<!-- Sink terminal (OUT) at right edge, row 2 -->
<g>
  <line
    :x1="portEdge(SINK_ROW, GRID_COLS - 1, 'E').x"
    :y1="portEdge(SINK_ROW, GRID_COLS - 1, 'E').y"
    :x2="portEdge(SINK_ROW, GRID_COLS - 1, 'E').x + 18"
    :y2="portEdge(SINK_ROW, GRID_COLS - 1, 'E').y"
    class="relay-terminal-line"
    :class="{ 'relay-terminal-line--active': sinkReached }"
  />
  <text
    :x="portEdge(SINK_ROW, GRID_COLS - 1, 'E').x + 36"
    :y="portEdge(SINK_ROW, GRID_COLS - 1, 'E').y - 6"
    class="relay-terminal-label"
    text-anchor="start"
  >OUT</text>
  <text
    :x="portEdge(SINK_ROW, GRID_COLS - 1, 'E').x + 36"
    :y="portEdge(SINK_ROW, GRID_COLS - 1, 'E').y + 9"
    class="relay-terminal-sublabel"
    :class="{ 'relay-terminal-sublabel--active': sinkReached }"
    text-anchor="start"
  >{{ sinkReached ? 'CARRIER OK' : 'NO CARRIER' }}</text>
</g>
```

- [ ] **Step 2: Add hover highlight + a11y**

On each cell group add:

```vue
<g ... aria-label="Pipe node" role="button" tabindex="-1">
```

Already-present `:class="{ 'relay-cell--hovered': ... }"` covers the state — add the hover CSS:

```css
.relay-cell--hovered .relay-node-body {
  stroke: #7dd3fc;
}
```

- [ ] **Step 3: Add terminal styles**

```css
.relay-terminal-line {
  stroke: rgba(103, 232, 249, 0.3);
  stroke-width: 3;
  stroke-linecap: round;
}
.relay-terminal-line--active {
  stroke: #34d399;
}
.relay-terminal-label {
  fill: #cffafe;
  font-size: 11px;
  font-family: monospace;
  font-weight: 700;
  letter-spacing: 2px;
}
.relay-terminal-sublabel {
  fill: #fbbf24;
  font-size: 9px;
  font-family: monospace;
  letter-spacing: 1.5px;
}
.relay-terminal-sublabel--active {
  fill: #34d399;
}
```

- [ ] **Step 4: Oscilloscope scrolling trace**

Replace the static `.relay-osc__trace` div with an inline SVG sine wave. In the template, swap:

```vue
<div class="relay-osc__trace" />
```

with:

```vue
<svg class="relay-osc__svg" preserveAspectRatio="none" viewBox="0 0 600 48">
  <line
    v-for="i in 12"
    :key="`osc-v-${i}`"
    :x1="(i - 1) * 50"
    y1="0"
    :x2="(i - 1) * 50"
    y2="48"
    class="relay-osc__grid"
  />
  <line x1="0" y1="24" x2="600" y2="24" class="relay-osc__baseline" />
  <path :d="oscPath" class="relay-osc__wave" />
</svg>
```

In script, compute the sine once:

```ts
const oscPath = (() => {
  const pts: string[] = []
  for (let x = 0; x < 1200; x += 2) {
    const y = 24 + Math.sin(x * 0.06) * 14
    pts.push(`${x},${y}`)
  }
  return 'M ' + pts.join(' L ')
})()
```

Add CSS:

```css
.relay-osc__svg {
  @apply absolute inset-x-0 bottom-0 w-full;
  height: 48px;
}
.relay-osc__grid {
  stroke: rgba(34, 211, 238, 0.06);
  stroke-width: 1;
}
.relay-osc__baseline {
  stroke: rgba(34, 211, 238, 0.18);
  stroke-dasharray: 2 4;
}
.relay-osc__wave {
  fill: none;
  stroke: #34d399;
  stroke-width: 1.5;
  filter: drop-shadow(0 0 2px #34d399);
}
```

- [ ] **Step 5: Manual QA**

- Source + sink terminals render with labels; sink flips to green on `sinkReached`.
- Oscilloscope shows a clean sine above the grid with vertical grid lines.
- Hovering a cell lightens its border.
- Tabbing into the overlay gives focus (outline visible).

- [ ] **Step 6: Full gates**

```bash
bun run type-check && bun lint && bun test:unit
```

- [ ] **Step 7: Commit**

```bash
git add src/components/RelayRepairCanvas.vue src/assets/css/main.css
git commit -m "feat(relay): terminals + oscilloscope trace + hover polish + a11y"
```

---

## Task 13: End-to-end QA pass

Manual verification. Spec lists 10+ relay missions across the planet roster — pick three to sanity-check the fallback puzzle + reward loop.

- [ ] **Step 1: Confirm mission entries exist**

```bash
grep -rn 'relay_repair' src/data/shuttle-missions/eva/ | head
```
Expected: at least entries in earth.json, mars.json, jupiter.json, saturn.json, etc.

- [ ] **Step 2: Earth mission run**

1. `bun dev`
2. `/map`, accept `earth_l1_relay_reterm`.
3. Fly, orbit, EVA, dock with the relay POI.
4. `F` opens overlay; grid renders; status `CALIBRATING`.
5. Rotate (0,3) and (1,2) each once → wave connects, sink turns green.
6. `E` → lock animation → `BACKBONE RESTORED` caption → reward paid → overlay closes → EVA resumes.

- [ ] **Step 3: Mars + Jupiter runs (fallback puzzle)**

Repeat on any two more `relay_repair` missions from different planets; confirm both open the same `_default` puzzle, both accept E after completing the route, and both pay their per-mission reward.

- [ ] **Step 4: Abort path**

Accept a mission, open overlay, press `Esc` at ~40% quality. Expected: overlay closes, no payout, EVA resumes.

- [ ] **Step 5: Run final checks**

```bash
bun run type-check && bun lint && bun test:unit
```
All green.

- [ ] **Step 6: Sign-off commit**

```bash
git commit --allow-empty -m "chore(relay): end-to-end QA pass complete"
```

---

## Self-Review

**1. Spec coverage:**

- Goals §"Port the prototype to Vue + TS class" → Tasks 7–12 deliver the class + canvas port.
- Goals §"Match prototype feel (5×3 grid, two wrong cells, wiggly pipes, amber dead-ends, 95% lock)" → Task 6 (puzzle JSON authored to match prototype's `INITIAL_CELLS`), Task 10 (wave + dead-ends + live quality), Task 11 (wiggle + lock-in).
- Goals §"Data-driven puzzle layouts, mission-keyed JSON" → Task 6.
- Goals §"Inherit EVA O2 as timer, no per-minigame countdown" → Achieved by default; no timer anywhere in the plan.
- Goals §"Wire into reward chain" → Task 8 (factory + dispatcher).
- Non-Goals — audio, procedural gen, multi-signal, gamepad, mobile — all excluded.
- Player Flow §1–8 → Tasks 8 (dispatch), 10 (keyboard + click + wheel), 11 (E lock + Esc).
- Data Model §`RelayRepairMiniGame` → Task 7.
- Data Model §`RelayRepairCanvas.vue` → Tasks 8 (placeholder) + 9 (static) + 10 (interactive) + 11 (RAF + lock) + 12 (polish).
- Data Model §Puzzle JSON → Task 6.
- Data Model §Accessor — Task 6.
- Systems §shape rotations → Task 2.
- Systems §wave propagation → Task 3.
- Systems §quality formula + sink-gated invariant → Task 4.
- Systems §visual layers → Tasks 9 + 10 + 11 + 12.
- Systems §wiggle generator → Task 5.
- Systems §lock-in transition → Task 11.
- Testing §unit tests → Tasks 2, 3, 4, 5, 6, 7.
- Testing §manual → Task 13.

**2. Placeholder scan:** No `TBD`, `TODO`, "implement later", or "similar to Task N" references. Every code step shows complete code.

**3. Type consistency:** `Cell`, `RelayPuzzle`, `TraceResult`, `Direction`, `Rotation`, `Shape` declared in Task 1, consumed consistently by Tasks 2 (shapes), 3 (wave, `cellId`), 4 (quality), 6 (puzzles), 9–12 (canvas). `RelayRepairMiniGame.reportQuality` defined in Task 7, called in Tasks 10, 11. `LOCK_THRESHOLD` = 0.95 consistent across Tasks 4 + 11. `cellId(row, col)` helper introduced in Task 3, reused by the canvas computeds in Task 10. `SHAPE_ROTATIONS`, `getPorts`, `DIR_DELTA`, `OPPOSITE` exports match between Task 2 and downstream usages.

No gaps. Plan is ready.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-04-20-relay-repair.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, spec + code-quality review between tasks.

**2. Inline Execution** — batch execution in this session.

Which approach?
