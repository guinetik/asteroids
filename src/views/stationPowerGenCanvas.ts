/**
 * Renders a "GENERATOR STATUS" diagnostics panel onto a `<canvas>` for
 * display on the r-power room terminal. Six cell rows — one per fuel
 * cell — each filled in proportion to how far the SCI repair has
 * progressed. Below the rows: an aggregate readout ("POWER OFFLINE"
 * → "POWER ONLINE") and a thicker progress bar that drives the
 * player's eye toward "how much is left".
 *
 * Pure DOM utility — the canvas is fed into a Three.js `CanvasTexture`
 * by the terminal model.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */

/** Square canvas size in pixels — matches the terminal idle-canvas resolution. */
const CANVAS_SIZE = 512
/** Outer padding around the panel layout. */
const PANEL_PADDING = 28
/** Background — matches the terminal's dark glass screen. */
const PANEL_BG = '#021510'
/** Frame stroke colour. */
const PANEL_FRAME = '#0e3a36'
/** Header text colour while power is offline. */
const HEADER_OFFLINE_COLOR = '#f87171'
/** Header text colour once power is restored. */
const HEADER_ONLINE_COLOR = '#4ade80'
/** Header font (matches the terminal's general font stack). */
const HEADER_FONT = '700 28px "Space Grotesk", "Segoe UI", monospace'
/** Per-cell label font. */
const ROW_FONT = '600 18px "Space Grotesk", "Segoe UI", monospace'
/** Aggregate readout font. */
const STATUS_FONT = '700 22px "Space Grotesk", "Segoe UI", monospace'
/** Row track (unfilled) colour. */
const ROW_TRACK = '#093530'
/** Row fill colour while damaged (matches wireframe red). */
const ROW_FILL_DAMAGED = '#f87171'
/** Row fill colour at mid progress. */
const ROW_FILL_MID = '#fb923c'
/** Row fill colour near completion. */
const ROW_FILL_NEAR = '#84cc16'
/** Row fill colour once repaired. */
const ROW_FILL_DONE = '#4ade80'
/** Spacing between rows in pixels. */
const ROW_GAP = 12
/** Height of each per-cell row, in pixels. */
const ROW_HEIGHT = 28
/** Width reserved for the row label (e.g. "CELL 1"). */
const ROW_LABEL_WIDTH = 110
/** Height of the aggregate progress bar at the bottom of the panel. */
const TOTAL_BAR_HEIGHT = 14

/**
 * Per-cell repair state passed in by the host so the panel reflects the
 * live model. Each entry maps to one row.
 */
export interface PowerGenCellState {
  /** 1-based cell index — printed on the row label. */
  index: number
  /** Repair progress in `[0, 1]`. `1` = fully restored. */
  progress: number
}

/**
 * Paint a generator-status panel into `canvas`. Safe to call repeatedly
 * with the same canvas — each call clears and redraws.
 *
 * @param canvas - Target canvas, sized to `CANVAS_SIZE`.
 * @param cells - Per-cell repair progress, in display order.
 * @param powerRestored - True after the host has fired its all-repaired
 *   callback. Drives the header tint and the "ONLINE" copy.
 */
export function drawPowerGenStatusCanvas(
  canvas: HTMLCanvasElement,
  cells: ReadonlyArray<PowerGenCellState>,
  powerRestored: boolean,
): void {
  if (canvas.width !== CANVAS_SIZE) canvas.width = CANVAS_SIZE
  if (canvas.height !== CANVAS_SIZE) canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = PANEL_BG
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.strokeStyle = PANEL_FRAME
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, CANVAS_SIZE - 2, CANVAS_SIZE - 2)

  // Header.
  ctx.fillStyle = powerRestored ? HEADER_ONLINE_COLOR : HEADER_OFFLINE_COLOR
  ctx.font = HEADER_FONT
  ctx.textBaseline = 'top'
  ctx.fillText('GENERATOR STATUS', PANEL_PADDING, PANEL_PADDING)

  // Per-cell rows.
  let y = PANEL_PADDING + 56
  const rowX = PANEL_PADDING
  const trackX = rowX + ROW_LABEL_WIDTH
  const trackW = CANVAS_SIZE - trackX - PANEL_PADDING
  for (const cell of cells) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = ROW_FONT
    ctx.fillText(`CELL ${cell.index}`, rowX, y + 6)

    ctx.fillStyle = ROW_TRACK
    ctx.fillRect(trackX, y, trackW, ROW_HEIGHT)
    const fillW = Math.max(0, Math.min(1, cell.progress)) * trackW
    ctx.fillStyle = rowFillColor(cell.progress)
    ctx.fillRect(trackX, y, fillW, ROW_HEIGHT)

    y += ROW_HEIGHT + ROW_GAP
  }

  // Aggregate readout.
  const totalCells = cells.length
  const restoredCount = cells.filter((c) => c.progress >= 1).length
  ctx.font = STATUS_FONT
  ctx.fillStyle = powerRestored ? HEADER_ONLINE_COLOR : '#e5e7eb'
  const statusLine = powerRestored
    ? 'POWER ONLINE'
    : `POWER OFFLINE  ${restoredCount}/${totalCells}`
  ctx.fillText(statusLine, PANEL_PADDING, CANVAS_SIZE - PANEL_PADDING - 48)

  // Aggregate progress bar.
  const totalProgress = totalCells === 0 ? 0 : restoredCount / totalCells
  const barX = PANEL_PADDING
  const barY = CANVAS_SIZE - PANEL_PADDING - TOTAL_BAR_HEIGHT
  const barW = CANVAS_SIZE - PANEL_PADDING * 2
  ctx.fillStyle = ROW_TRACK
  ctx.fillRect(barX, barY, barW, TOTAL_BAR_HEIGHT)
  ctx.fillStyle = powerRestored ? ROW_FILL_DONE : ROW_FILL_NEAR
  ctx.fillRect(barX, barY, totalProgress * barW, TOTAL_BAR_HEIGHT)
}

/** Pick a row fill colour from per-cell progress, matching the wireframe walk. */
function rowFillColor(progress: number): string {
  if (progress >= 1) return ROW_FILL_DONE
  if (progress >= 2 / 3) return ROW_FILL_NEAR
  if (progress >= 1 / 3) return ROW_FILL_MID
  return ROW_FILL_DAMAGED
}
