/**
 * Draws a top-down preview of a hazard room's tile layout onto a
 * `<canvas>` for display on the in-world peek terminal. The canvas is
 * fed into a Three.js `CanvasTexture` and mapped onto a plane in front
 * of the terminal's screen, so the player reads the path the same way
 * they'd read any diegetic UI in the station.
 *
 * Pure utility — no DOM or Three.js coupling beyond `<canvas>` itself
 * so the renderer can be unit-tested against a JSDOM canvas if needed.
 *
 * @author guinetik
 * @date 2026-05-14
 * @spec docs/space-station-update-gdd.md
 */

import type { MazeMap, Tile } from '@/lib/station/safePath'

export type { MazeMap }

/** Total canvas size in pixels (square). */
const CANVAS_SIZE = 512
/** Padding around the grid inside the canvas, in pixels. */
const CANVAS_PADDING = 28
/** Background tint behind the grid — matches the terminal's dark glass. */
const CANVAS_BG = '#031412'
/** Stroke colour for the outer grid frame. */
const GRID_FRAME_COLOR = '#0e3a36'
/** Per-tile inset so adjacent fills don't bleed into each other. */
const TILE_INSET = 2
/** Lava-tile fill — matches the in-world red hologram tint. */
const LAVA_FILL = '#ff2a1a'
/** Lava-tile inner glow stop. */
const LAVA_GLOW = 'rgba(255, 80, 60, 0.55)'
/** Safe-tile fill — matches the in-world cyan hologram tint. */
const SAFE_FILL = '#3399ff'
/** Safe-tile inner glow stop. */
const SAFE_GLOW = 'rgba(120, 200, 255, 0.55)'
/** Entrance accent — bright cyan ring. */
const ENTRANCE_ACCENT = '#9eecff'
/** Target accent — sharp magenta so it pops against the safe blue. */
const TARGET_ACCENT = '#ff5cd1'
/** Header banner colour. */
const HEADER_COLOR = '#66ffee'
/** Header text. */
const HEADER_TEXT = 'HAZARD MAP · MICROWAVE BAY'

/**
 * Render the maze preview onto the given canvas. Resizes the canvas to
 * {@link CANVAS_SIZE} and clears it before drawing. Returns the same
 * canvas so callers can chain.
 *
 * @param canvas - Target canvas. Resized in place.
 * @param maze - Planned tile data for the hazard room.
 * @returns The same canvas, now containing the rendered preview.
 */
export function drawMazeCanvas(canvas: HTMLCanvasElement, maze: MazeMap): HTMLCanvasElement {
  canvas.width = CANVAS_SIZE
  canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

  // Header banner.
  ctx.fillStyle = HEADER_COLOR
  ctx.font = 'bold 22px "Courier New", monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(HEADER_TEXT, CANVAS_SIZE / 2, 12)

  // Grid box geometry — the canvas is rotated 90° CCW from the raw
  // (col, row) grid so the player's forward direction (the +col axis,
  // east in r-microwave) points UP on the canvas. That matches the
  // FPS-minimap convention: up = ahead, left = left, right = right —
  // which is how a player standing at the door naturally reads the
  // map. Concretely:
  //   canvas horizontal extent = depth  (row spans left/right)
  //   canvas vertical extent   = width  (col spans bottom/top)
  // +row (north / player's left when entering W door) → canvas LEFT
  // +col (east / player forward)                       → canvas UP
  const headerOffset = 56
  const gridSize = CANVAS_SIZE - CANVAS_PADDING * 2 - headerOffset
  const tilePxX = gridSize / maze.depth
  const tilePxY = gridSize / maze.width
  const tilePx = Math.min(tilePxX, tilePxY)
  const gridPxWidth = tilePx * maze.depth
  const gridPxHeight = tilePx * maze.width
  const originX = (CANVAS_SIZE - gridPxWidth) / 2
  const originY = (CANVAS_SIZE - gridPxHeight + headerOffset) / 2

  // Outer frame.
  ctx.strokeStyle = GRID_FRAME_COLOR
  ctx.lineWidth = 2
  ctx.strokeRect(originX - 4, originY - 4, gridPxWidth + 8, gridPxHeight + 8)

  for (let col = 0; col < maze.width; col++) {
    for (let row = 0; row < maze.depth; row++) {
      const key = `${col}:${row}`
      const safe = maze.safeTileKeys.has(key)
      const [px, py] = tilePixel(originX, originY, tilePx, maze, { col, row })
      drawTile(ctx, px, py, tilePx, safe)
    }
  }

  // Accent the entrance(s) and target on top of the base fills.
  for (const tile of maze.entranceTiles) {
    accentTile(ctx, originX, originY, tilePx, maze, tile, ENTRANCE_ACCENT)
  }
  if (maze.targetTile) {
    accentTile(ctx, originX, originY, tilePx, maze, maze.targetTile, TARGET_ACCENT)
  }

  return canvas
}

/**
 * Compute the canvas pixel origin of one tile under the 90°-CCW
 * rotation: row maps to canvas-x (mirrored so +row goes left), col
 * maps to canvas-y (mirrored so +col goes up).
 *
 * @param originX - Top-left corner X of the grid box.
 * @param originY - Top-left corner Y of the grid box.
 * @param tilePx - Tile size in pixels (square).
 * @param maze - Source maze (provides width/depth for the inversion).
 * @param tile - Tile to project.
 * @returns Tuple `[px, py]` — the tile's top-left pixel.
 */
function tilePixel(
  originX: number,
  originY: number,
  tilePx: number,
  maze: MazeMap,
  tile: Tile,
): [number, number] {
  // Player reads the peek terminal while facing west (the r-terminal
  // kiosk faces east), then walks east into the microwave room. Mapping
  // +row to canvas RIGHT keeps the path orientation consistent with the
  // player's in-room frame: the first turn they see on the screen is
  // the same turn they need to take once they cross the threshold.
  const px = originX + tile.row * tilePx
  const py = originY + (maze.width - 1 - tile.col) * tilePx
  return [px, py]
}

/** Paint one tile with its base + inner glow. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  safe: boolean,
): void {
  const inset = TILE_INSET
  const w = size - inset * 2
  const h = size - inset * 2
  ctx.fillStyle = safe ? SAFE_FILL : LAVA_FILL
  ctx.fillRect(x + inset, y + inset, w, h)
  const grad = ctx.createRadialGradient(
    x + size / 2,
    y + size / 2,
    1,
    x + size / 2,
    y + size / 2,
    size * 0.7,
  )
  grad.addColorStop(0, safe ? SAFE_GLOW : LAVA_GLOW)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = grad
  ctx.fillRect(x + inset, y + inset, w, h)
}

/** Draw a thin coloured ring around one tile to mark entrance / target. */
function accentTile(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  tilePx: number,
  maze: MazeMap,
  tile: Tile,
  color: string,
): void {
  const [x, y] = tilePixel(originX, originY, tilePx, maze, tile)
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.strokeRect(x + 4, y + 4, tilePx - 8, tilePx - 8)
}
