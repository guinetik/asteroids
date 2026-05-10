/**
 * Owns the offscreen 2D canvas + CanvasTexture used as the cabinet screen.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import * as THREE from 'three'
import { drawCabinetHudFooter, drawCabinetHudHeader } from './RetroHud'
import type { ArcadeRom, RomMeta } from './types'

const SCREEN_LOGICAL_WIDTH = 640
const SCREEN_LOGICAL_HEIGHT = 480
const FOOTER_HINT_PLAY = 'ARROWS MOVE · SPACE FIRE · X HYPERSPACE · ESC EXIT'
const FOOTER_HINT_MENU = 'UP/DOWN SELECT · ENTER START · ESC EXIT'
const MENU_TITLE = 'SELECT GAME'
const MENU_TITLE_FONT_SIZE_PX = 28
const MENU_ROW_FONT_SIZE_PX = 20
const MENU_ROW_HEIGHT_PX = 36
const MENU_FONT = 'Datatype, monospace'
const MENU_BG_ALPHA = 0.6
const MENU_BG_COLOR_RGB = '0, 8, 6'
const MENU_TITLE_COLOR = '#6effd2'
const MENU_TITLE_Y_RATIO = 0.32
const MENU_LIST_TOP_RATIO = 0.45
const MENU_ROW_SELECTED_COLOR = '#f8fff9'
const MENU_ROW_DIM_COLOR = 'rgba(216, 255, 242, 0.6)'

/** Camera-facing summary of the menu state to draw. */
export interface ArcadeMenuView {
  /** Catalog displayed in the menu. */
  entries: ReadonlyArray<RomMeta>
  /** Currently highlighted index. */
  selectedIndex: number
}

/** Cabinet screen renderer — all draws funnel through here. */
export class ArcadeScreenRenderer {
  /** The backing offscreen canvas. */
  readonly canvas: HTMLCanvasElement
  /** Three.js texture wrapping {@link canvas}. */
  readonly texture: THREE.CanvasTexture
  /** Logical canvas width. */
  readonly width = SCREEN_LOGICAL_WIDTH
  /** Logical canvas height. */
  readonly height = SCREEN_LOGICAL_HEIGHT
  private readonly ctx: CanvasRenderingContext2D

  /** Build a screen renderer with a fresh detached canvas + texture. */
  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = SCREEN_LOGICAL_WIDTH
    this.canvas.height = SCREEN_LOGICAL_HEIGHT
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('ArcadeScreenRenderer: 2D context unavailable')
    this.ctx = ctx
    this.texture = new THREE.CanvasTexture(this.canvas)
    this.texture.minFilter = THREE.NearestFilter
    this.texture.magFilter = THREE.NearestFilter
    this.texture.generateMipmaps = false
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.flipY = false
  }

  /** Render the ROM's ATTRACT loop. */
  drawAttract(rom: ArcadeRom): void {
    this.beginFrame()
    rom.attractRender(this.ctx, this.width, this.height)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_MENU)
    this.endFrame()
  }

  /** Render the boot menu over the ROM's attract loop. */
  drawMenu(rom: ArcadeRom, menu: ArcadeMenuView): void {
    this.beginFrame()
    rom.attractRender(this.ctx, this.width, this.height)
    this.drawMenuOverlay(menu)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_MENU)
    this.endFrame()
  }

  /** Render the active ROM run. */
  drawPlay(rom: ArcadeRom): void {
    this.beginFrame()
    rom.render(this.ctx, this.width, this.height)
    drawCabinetHudHeader(this.ctx, this.width, rom.hudSnapshot())
    drawCabinetHudFooter(this.ctx, this.width, this.height, FOOTER_HINT_PLAY)
    this.endFrame()
  }

  /** Free the texture (call on scene dispose). */
  dispose(): void {
    this.texture.dispose()
  }

  private beginFrame(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  private endFrame(): void {
    this.texture.needsUpdate = true
  }

  private drawMenuOverlay(menu: ArcadeMenuView): void {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = `rgba(${MENU_BG_COLOR_RGB}, ${MENU_BG_ALPHA})`
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.fillStyle = MENU_TITLE_COLOR
    ctx.font = `${MENU_TITLE_FONT_SIZE_PX}px ${MENU_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(MENU_TITLE, this.width / 2, this.height * MENU_TITLE_Y_RATIO)

    ctx.font = `${MENU_ROW_FONT_SIZE_PX}px ${MENU_FONT}`
    const top = this.height * MENU_LIST_TOP_RATIO
    menu.entries.forEach((entry, i) => {
      const y = top + i * MENU_ROW_HEIGHT_PX
      const selected = i === menu.selectedIndex
      ctx.fillStyle = selected ? MENU_ROW_SELECTED_COLOR : MENU_ROW_DIM_COLOR
      const prefix = selected ? '> ' : '  '
      ctx.fillText(`${prefix}${entry.title}  ·  ${entry.year}`, this.width / 2, y)
    })
    ctx.restore()
  }
}
