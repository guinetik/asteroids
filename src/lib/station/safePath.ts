/**
 * Procedural safe-tile path planner for hazard rooms (the
 * "microwave-floor" pattern: most tiles are lava, but a single-tile-wide
 * winding path connects the entrance to a target tile).
 *
 * The walk is a randomized DFS over the room's `(col, row)` grid:
 * neighbours are visited in shuffled order with no revisits, so the
 * path naturally produces L-shapes and serpentine detours rather than
 * a straight Manhattan run. A `[minLength, maxLength]` clamp lets the
 * caller dial how punishing the room feels — too short and the player
 * sees the whole solution at once; too long and they thrash out of
 * fuel before reaching the terminal.
 *
 * @author guinetik
 * @date 2026-05-14
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Discrete tile coordinate inside a room's `(col, row)` grid. */
export interface Tile {
  /** Column index in `[0, room.width)`. */
  col: number
  /** Row index in `[0, room.depth)`. */
  row: number
}

/**
 * Plan a winding safe-tile path between two tiles in a `width × depth`
 * grid. Walks the grid with randomized DFS, succeeding the first time
 * the target is reached with a path length inside the requested
 * bounds. Falls back to the shortest path found within `attempts`
 * tries when no in-bounds path exists (defensive — only happens on
 * pathological tiny grids).
 *
 * @param width - Grid width (number of columns).
 * @param depth - Grid depth (number of rows).
 * @param start - Entrance tile (included as the first path tile).
 * @param end - Target tile (included as the last path tile).
 * @param minLength - Inclusive lower bound on tile count, including
 *   both endpoints. Clamped to `manhattan(start, end) + 1` since no
 *   shorter path exists.
 * @param maxLength - Inclusive upper bound on tile count. Clamped to
 *   `width * depth` (cannot visit more tiles than the grid has).
 * @param attempts - Maximum DFS restarts. Defaults to 96, plenty for
 *   small rooms (≤ 9×9).
 * @returns Ordered tile list from `start` to `end`. Empty when start
 *   and end coincide on a zero-area grid.
 */
export function generateSafePath(
  width: number,
  depth: number,
  start: Tile,
  end: Tile,
  minLength: number,
  maxLength: number,
  attempts = 96,
): Tile[] {
  const manhattan = Math.abs(start.col - end.col) + Math.abs(start.row - end.row)
  const tileCount = width * depth
  const minLen = Math.max(2, Math.min(manhattan + 1, minLength))
  const maxLen = Math.max(minLen, Math.min(tileCount, maxLength))

  let fallback: Tile[] | null = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    const path = randomizedDfs(width, depth, start, end, minLen, maxLen)
    if (path) return path
    if (!fallback) {
      const shortest = shortestPath(width, depth, start, end)
      if (shortest) fallback = shortest
    }
  }
  return fallback ?? [start, end]
}

/**
 * Randomized depth-first search bounded by `[minLen, maxLen]` total
 * tiles. Returns the first walk that reaches `end` inside the bounds,
 * or `null` if every walk exits the bounds first.
 *
 * @param width - Grid width.
 * @param depth - Grid depth.
 * @param start - Walk origin.
 * @param end - Walk target.
 * @param minLen - Minimum tile count for a successful walk.
 * @param maxLen - Maximum tile count before the walk gives up.
 * @returns Ordered tile list, or `null` on failure.
 */
function randomizedDfs(
  width: number,
  depth: number,
  start: Tile,
  end: Tile,
  minLen: number,
  maxLen: number,
): Tile[] | null {
  const visited = new Set<string>()
  const stack: Tile[] = [start]
  visited.add(tileKey(start))

  const dfs = (): Tile[] | null => {
    const cur = stack[stack.length - 1]!
    if (cur.col === end.col && cur.row === end.row) {
      return stack.length >= minLen ? [...stack] : null
    }
    if (stack.length >= maxLen) return null

    for (const next of shuffledNeighbours(cur, width, depth)) {
      const key = tileKey(next)
      if (visited.has(key)) continue
      // Don't accept reaching `end` too early — keep wandering until we
      // have enough tiles in the path.
      if (next.col === end.col && next.row === end.row && stack.length + 1 < minLen) {
        continue
      }
      // Reject candidates that touch a prior path tile (other than the
      // immediate predecessor) — that would create a one-step shortcut
      // around the loop. Endpoints are exempt only when they ARE the
      // candidate itself, otherwise the path can't reach them.
      if (isAdjacentToPath(next, stack)) continue
      visited.add(key)
      stack.push(next)
      const result = dfs()
      if (result) return result
      stack.pop()
      visited.delete(key)
    }
    return null
  }

  return dfs()
}

/**
 * True if `candidate` is cardinally adjacent to any tile already on the
 * path *other than* the last one (its predecessor). Enforces the "no
 * shortcuts" rule: the player can never step laterally from one path
 * tile onto another non-consecutive one.
 *
 * @param candidate - Tile we'd append to the path.
 * @param stack - Path so far (last element is the predecessor).
 */
function isAdjacentToPath(candidate: Tile, stack: Tile[]): boolean {
  for (let i = 0; i < stack.length - 1; i++) {
    const t = stack[i]!
    const dx = Math.abs(t.col - candidate.col)
    const dz = Math.abs(t.row - candidate.row)
    if (dx + dz === 1) return true
  }
  return false
}

/**
 * Plain BFS shortest path between two tiles. Used as a fallback when
 * the bounded DFS exhausts its attempt budget — pathological grids
 * (1×1 rooms, blocked targets) should never reach this in practice,
 * but a no-path return would crash the builder.
 *
 * @param width - Grid width.
 * @param depth - Grid depth.
 * @param start - Search origin.
 * @param end - Search target.
 * @returns Ordered tile list from start to end, or `null` if unreachable.
 */
function shortestPath(
  width: number,
  depth: number,
  start: Tile,
  end: Tile,
): Tile[] | null {
  if (start.col === end.col && start.row === end.row) return [start]
  const parents = new Map<string, string>()
  const queue: Tile[] = [start]
  const seen = new Set<string>([tileKey(start)])
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (cur.col === end.col && cur.row === end.row) {
      const out: Tile[] = []
      let key = tileKey(cur)
      while (true) {
        const [col, row] = key.split(':').map(Number) as [number, number]
        out.unshift({ col, row })
        const p = parents.get(key)
        if (!p) break
        key = p
      }
      return out
    }
    for (const n of neighbours(cur, width, depth)) {
      const key = tileKey(n)
      if (seen.has(key)) continue
      seen.add(key)
      parents.set(key, tileKey(cur))
      queue.push(n)
    }
  }
  return null
}

/** All four cardinal neighbours of `tile`, clipped to the grid. */
function neighbours(tile: Tile, width: number, depth: number): Tile[] {
  const out: Tile[] = []
  if (tile.col + 1 < width) out.push({ col: tile.col + 1, row: tile.row })
  if (tile.col - 1 >= 0) out.push({ col: tile.col - 1, row: tile.row })
  if (tile.row + 1 < depth) out.push({ col: tile.col, row: tile.row + 1 })
  if (tile.row - 1 >= 0) out.push({ col: tile.col, row: tile.row - 1 })
  return out
}

/** Same as {@link neighbours} but Fisher–Yates shuffled for the DFS. */
function shuffledNeighbours(tile: Tile, width: number, depth: number): Tile[] {
  const arr = neighbours(tile, width, depth)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/** Stable string key for a tile (used as Set/Map key). */
function tileKey(tile: Tile): string {
  return `${tile.col}:${tile.row}`
}
