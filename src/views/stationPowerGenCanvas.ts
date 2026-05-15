/**
 * Renders the r-power terminal's diagnostic screens onto a `<canvas>`.
 * Three frames live here:
 *
 * 1. **Tutorial** — pre-minigame copy telling the player to use SCI mode.
 * 2. **Puzzle** — live ignition sequence: letters row on top, numbers
 *    row on bottom, central diamond tinted by the resulting hex code,
 *    with charged symbols filling orange as cells are repaired. Also
 *    handles the wrong-shot "REINITIATE" state and the final ONLINE
 *    confirmation.
 * 3. **Status** — legacy per-cell progress bars (kept for reuse).
 *
 * Pure DOM utility — the canvas is fed into a Three.js `CanvasTexture`
 * by the terminal model.
 *
 * @author guinetik
 * @date 2026-05-15
 * @spec docs/superpowers/specs/2026-05-12-yamada-station-interior-design.md
 */
import { LETTER_SYMBOLS, type PowerGenPuzzleState } from '@/three/StationPowerGenModel'

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

/** Sub-heading colour for the tutorial panel. */
const TUTORIAL_SUBHEAD_COLOR = '#9ca3af'
/** Body paragraph colour for the tutorial panel. */
const TUTORIAL_BODY_COLOR = '#d1d5db'
/** Tutorial body font. */
const TUTORIAL_BODY_FONT = '500 18px "Space Grotesk", "Segoe UI", monospace'
/** Tutorial sub-heading font. */
const TUTORIAL_SUBHEAD_FONT = '600 16px "Space Grotesk", "Segoe UI", monospace'
/** Pixel gap between tutorial body lines. */
const TUTORIAL_LINE_HEIGHT = 26

/**
 * Paint the pre-minigame tutorial panel onto `canvas`. Walks the player
 * through the emergency reset procedure: the multitool's SCI mode dumps
 * energy into the dormant fuel cells, and the player must follow the
 * ignition sequence the console will hand out to land each shot on a
 * cell whose residual charge is highest. Static — only repainted on
 * stage change, not per-frame.
 *
 * @param canvas - Target canvas, sized to {@link CANVAS_SIZE}.
 */
export function drawPowerGenTutorialCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.width !== CANVAS_SIZE) canvas.width = CANVAS_SIZE
  if (canvas.height !== CANVAS_SIZE) canvas.height = CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = PANEL_BG
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  ctx.strokeStyle = PANEL_FRAME
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, CANVAS_SIZE - 2, CANVAS_SIZE - 2)

  ctx.textBaseline = 'top'

  // Header — flashing-warning red, matches the offline status panel.
  ctx.fillStyle = HEADER_OFFLINE_COLOR
  ctx.font = HEADER_FONT
  ctx.fillText('AUX. POWER RESTART', PANEL_PADDING, PANEL_PADDING)

  // Sub-heading: situation summary.
  ctx.fillStyle = TUTORIAL_SUBHEAD_COLOR
  ctx.font = TUTORIAL_SUBHEAD_FONT
  ctx.fillText('MAIN BUS OFFLINE — REACTOR COLD', PANEL_PADDING, PANEL_PADDING + 40)
  ctx.fillText('FUEL CELLS RETAIN PARTIAL CHARGE', PANEL_PADDING, PANEL_PADDING + 62)

  // Body procedure.
  ctx.fillStyle = TUTORIAL_BODY_COLOR
  ctx.font = TUTORIAL_BODY_FONT
  const lines: ReadonlyArray<string> = [
    'EMERGENCY KICKSTART:',
    '',
    'USE YOUR MULTITOOL [SCI] MODE',
    'TO CHARGE THE DORMANT FUEL',
    'CELLS, IGNITING THEIR',
    'RESIDUAL CHARGE.',
    '',
    'CELLS MUST BE LIT IN THE',
    'IGNITION ORDER ON THIS CONSOLE',
    'TO MAXIMIZE CHARGE TRANSFER.',
    '',
    'A WRONG SHOT RESETS THE PURGE',
    'AND A NEW SEQUENCE IS DRAFTED.',
  ]
  let y = PANEL_PADDING + 110
  for (const line of lines) {
    ctx.fillText(line, PANEL_PADDING, y)
    y += TUTORIAL_LINE_HEIGHT
  }
}

/** Pick a row fill colour from per-cell progress, matching the wireframe walk. */
function rowFillColor(progress: number): string {
  if (progress >= 1) return ROW_FILL_DONE
  if (progress >= 2 / 3) return ROW_FILL_NEAR
  if (progress >= 1 / 3) return ROW_FILL_MID
  return ROW_FILL_DAMAGED
}

/** Side length of each ignition-symbol tile on the puzzle screen. */
const PUZZLE_TILE_SIZE = 78
/** Gap between adjacent tiles in a row. */
const PUZZLE_TILE_GAP = 22
/** Stroke / fill weight for puzzle frames. */
const PUZZLE_FRAME_STROKE_WIDTH = 3
/** Y offset (from top padding) of the letters row baseline. */
const PUZZLE_LETTERS_Y = 100
/** Diagonal radius (half-extent along each axis) of the central diamond. */
const PUZZLE_DIAMOND_RADIUS = 56
/** Pixel length of dashed connectors between tiles and the diamond. */
const PUZZLE_DASH_LENGTH = 6
/** Pixel gap between dashes. */
const PUZZLE_DASH_GAP = 4
/** Tile fill while still locked / un-charged. */
const PUZZLE_TILE_FILL_IDLE = '#0a2522'
/** Tile fill once that symbol has been charged. */
const PUZZLE_TILE_FILL_CHARGED = '#fb923c'
/** Tile stroke while idle. */
const PUZZLE_TILE_STROKE_IDLE = '#1f5b54'
/** Tile stroke once charged. */
const PUZZLE_TILE_STROKE_CHARGED = '#fef3c7'
/** Tile symbol colour while idle. */
const PUZZLE_TILE_TEXT_IDLE = '#d1d5db'
/** Tile symbol colour once charged. */
const PUZZLE_TILE_TEXT_CHARGED = '#1c1917'
/** Symbol font on the puzzle tiles. */
const PUZZLE_SYMBOL_FONT = '700 36px "Space Grotesk", "Segoe UI", monospace'
/** Caption shown under each row (e.g. "FAR PANEL", "NEAR PANEL"). */
const PUZZLE_CAPTION_FONT = '600 14px "Space Grotesk", "Segoe UI", monospace'
/** Caption colour. */
const PUZZLE_CAPTION_COLOR = '#6ee7b7'
/** Status line (REINITIATE / IGNITING / ONLINE) font. */
const PUZZLE_STATUS_FONT = '700 20px "Space Grotesk", "Segoe UI", monospace'

/**
 * Paint the live ignition-puzzle screen. Three sub-frames blend through
 * the same layout: active (shows the sequence, fills tiles orange as
 * cells charge), reset-pending (after a wrong shot, prompts the player
 * to reinitiate at the terminal), and restored (once power is online).
 *
 * @param canvas - Target canvas, sized to {@link CANVAS_SIZE}.
 * @param state - Latest puzzle snapshot from the powergen model.
 */
export function drawPowerGenPuzzleCanvas(
  canvas: HTMLCanvasElement,
  state: PowerGenPuzzleState,
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

  ctx.textBaseline = 'top'
  const headerColor = state.restored
    ? HEADER_ONLINE_COLOR
    : state.resetPending
      ? HEADER_OFFLINE_COLOR
      : '#fde68a'
  ctx.fillStyle = headerColor
  ctx.font = HEADER_FONT
  const headerText = state.restored
    ? 'POWER ONLINE'
    : state.resetPending
      ? 'PURGE FAILED'
      : 'IGNITION SEQUENCE'
  ctx.fillText(headerText, PANEL_PADDING, PANEL_PADDING)

  // ---- Row layout ----
  const rowWidth = PUZZLE_TILE_SIZE * 3 + PUZZLE_TILE_GAP * 2
  const rowX = (CANVAS_SIZE - rowWidth) / 2
  const topRowY = PANEL_PADDING + PUZZLE_LETTERS_Y
  const bottomRowY = CANVAS_SIZE - PANEL_PADDING - PUZZLE_LETTERS_Y - PUZZLE_TILE_SIZE
  const diamondCenter = { x: CANVAS_SIZE / 2, y: CANVAS_SIZE / 2 }

  // Numbers row (top = far panel from the door).
  drawPuzzleRow(
    ctx,
    rowX,
    topRowY,
    state.numberOrder.map((slot) => String(slot + 1)),
    state.numbersCharged,
    'FAR PANEL',
    'above',
  )
  // Letters row (bottom = near panel from the door).
  drawPuzzleRow(
    ctx,
    rowX,
    bottomRowY,
    state.letterOrder.map((slot) => LETTER_SYMBOLS[slot] ?? '?'),
    state.lettersCharged,
    'NEAR PANEL',
    'below',
  )

  // Dashed connectors from each tile centre to the diamond.
  ctx.setLineDash([PUZZLE_DASH_LENGTH, PUZZLE_DASH_GAP])
  ctx.strokeStyle = '#1f5b54'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    const tileX = rowX + i * (PUZZLE_TILE_SIZE + PUZZLE_TILE_GAP) + PUZZLE_TILE_SIZE / 2
    ctx.beginPath()
    ctx.moveTo(tileX, topRowY + PUZZLE_TILE_SIZE)
    ctx.lineTo(diamondCenter.x, diamondCenter.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(tileX, bottomRowY)
    ctx.lineTo(diamondCenter.x, diamondCenter.y)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // Central diamond, tinted by the puzzle colour. Greyed-out during a
  // reset so the player reads the "target" as expired.
  const diamondFill = state.resetPending ? '#374151' : state.hexColor
  drawDiamond(ctx, diamondCenter.x, diamondCenter.y, PUZZLE_DIAMOND_RADIUS, diamondFill)

  // Status footer.
  ctx.fillStyle = state.restored
    ? HEADER_ONLINE_COLOR
    : state.resetPending
      ? HEADER_OFFLINE_COLOR
      : PUZZLE_CAPTION_COLOR
  ctx.font = PUZZLE_STATUS_FONT
  const statusLine = state.restored
    ? 'REACTOR ONLINE'
    : state.resetPending
      ? 'REINITIATE AT TERMINAL'
      : `${state.lettersCharged + state.numbersCharged}/6 CELLS IGNITED`
  const statusWidth = ctx.measureText(statusLine).width
  ctx.fillText(statusLine, (CANVAS_SIZE - statusWidth) / 2, CANVAS_SIZE - PANEL_PADDING - 28)
}

/**
 * Paint a single row of three ignition tiles plus its caption. The
 * `chargedCount` first tiles render in their "charged" pose (orange
 * fill, dark glyph); the rest stay idle.
 */
function drawPuzzleRow(
  ctx: CanvasRenderingContext2D,
  rowX: number,
  rowY: number,
  symbols: ReadonlyArray<string>,
  chargedCount: number,
  caption: string,
  captionSide: 'above' | 'below',
): void {
  for (let i = 0; i < symbols.length; i++) {
    const tileX = rowX + i * (PUZZLE_TILE_SIZE + PUZZLE_TILE_GAP)
    const charged = i < chargedCount
    ctx.fillStyle = charged ? PUZZLE_TILE_FILL_CHARGED : PUZZLE_TILE_FILL_IDLE
    ctx.fillRect(tileX, rowY, PUZZLE_TILE_SIZE, PUZZLE_TILE_SIZE)
    ctx.strokeStyle = charged ? PUZZLE_TILE_STROKE_CHARGED : PUZZLE_TILE_STROKE_IDLE
    ctx.lineWidth = PUZZLE_FRAME_STROKE_WIDTH
    ctx.strokeRect(tileX, rowY, PUZZLE_TILE_SIZE, PUZZLE_TILE_SIZE)
    ctx.fillStyle = charged ? PUZZLE_TILE_TEXT_CHARGED : PUZZLE_TILE_TEXT_IDLE
    ctx.font = PUZZLE_SYMBOL_FONT
    const sym = symbols[i] ?? '?'
    const symWidth = ctx.measureText(sym).width
    ctx.textBaseline = 'middle'
    ctx.fillText(sym, tileX + (PUZZLE_TILE_SIZE - symWidth) / 2, rowY + PUZZLE_TILE_SIZE / 2)
    ctx.textBaseline = 'top'
  }
  ctx.fillStyle = PUZZLE_CAPTION_COLOR
  ctx.font = PUZZLE_CAPTION_FONT
  const captionWidth = ctx.measureText(caption).width
  const captionX = rowX + ((PUZZLE_TILE_SIZE + PUZZLE_TILE_GAP) * 3 - PUZZLE_TILE_GAP) / 2 - captionWidth / 2
  const captionY =
    captionSide === 'above' ? rowY - 22 : rowY + PUZZLE_TILE_SIZE + 6
  ctx.fillText(caption, captionX, captionY)
}

/** Draw a filled diamond centred on `(cx, cy)`. */
function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  fill: string,
): void {
  ctx.beginPath()
  ctx.moveTo(cx, cy - r)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(cx, cy + r)
  ctx.lineTo(cx - r, cy)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = '#f8fafc'
  ctx.lineWidth = 2
  ctx.stroke()
}
