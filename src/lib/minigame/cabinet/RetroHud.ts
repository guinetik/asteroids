/**
 * Cabinet HUD overlay. Drawn by ArcadeScreenRenderer above the ROM render.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { RomHudSnapshot } from './types'

const HUD_FONT_FAMILY = 'Datatype, monospace'
const HUD_FONT_SIZE_PX = 14
const HUD_FOOTER_FONT_SIZE_PX = 12
const HUD_PADDING_X = 12
const HUD_PADDING_Y = 8
const HUD_DIM = 'rgba(216, 255, 242, 0.72)'
const HUD_HINT = 'rgba(216, 255, 242, 0.55)'
const HUD_RULE_COLOR = 'rgba(110, 255, 210, 0.18)'
const HUD_RULE_OFFSET_PX = 6
const HUD_CELL_SPACING_PX = 18

/** Draw the score/lives/wave/mode strip across the top of the cabinet screen. */
export function drawCabinetHudHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  hud: RomHudSnapshot,
): void {
  ctx.save()
  ctx.font = `${HUD_FONT_SIZE_PX}px ${HUD_FONT_FAMILY}`
  ctx.textBaseline = 'top'
  const cells = [
    `SCORE ${hud.score.toLocaleString()}`,
    `HIGH ${hud.highScore.toLocaleString()}`,
    `LIVES ${hud.lives}`,
    `WAVE ${hud.wave}`,
    `MODE ${hud.phaseLabel}`,
  ]
  let x = HUD_PADDING_X
  ctx.fillStyle = HUD_DIM
  for (const cell of cells) {
    ctx.fillText(cell, x, HUD_PADDING_Y)
    x += ctx.measureText(cell).width + HUD_CELL_SPACING_PX
  }
  ctx.strokeStyle = HUD_RULE_COLOR
  ctx.lineWidth = 1
  ctx.beginPath()
  const ruleY = HUD_PADDING_Y + HUD_FONT_SIZE_PX + HUD_RULE_OFFSET_PX
  ctx.moveTo(0, ruleY)
  ctx.lineTo(width, ruleY)
  ctx.stroke()
  ctx.restore()
}

/** Draw the keybinds hint strip across the bottom of the cabinet screen. */
export function drawCabinetHudFooter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
): void {
  ctx.save()
  ctx.font = `${HUD_FOOTER_FONT_SIZE_PX}px ${HUD_FONT_FAMILY}`
  ctx.textBaseline = 'bottom'
  ctx.textAlign = 'center'
  ctx.fillStyle = HUD_HINT
  ctx.fillText(text, width / 2, height - HUD_PADDING_Y)
  ctx.restore()
}
