/**
 * Pure 2D renderer for the Asteroids ROM. Imported by AsteroidsRom; never
 * touches Vue or Three.js.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-cabinet-projection-design.md
 */
import type { AsteroidEntity, AsteroidsGameState, AsteroidsShip, SaucerEntity } from './types'

// ---------------------------------------------------------------------------
// Shape factors (all dimensionless multipliers of entity radius)
// ---------------------------------------------------------------------------

/** How far ahead of the ship's centre the nose point is drawn. */
const SHIP_NOSE_FACTOR = 1.35

/** Rear offset along the back vector for the wing attachment point. */
const SHIP_WING_BACK_FACTOR = 0.9

/** Lateral offset along the perpendicular for the wing tip. */
const SHIP_WING_SIDE_FACTOR = 0.72

/** Interior notch at the back-centre of the ship hull. */
const SHIP_WING_INTERIOR_FACTOR = 0.35

/** Half-width of the saucer body disc. */
const SAUCER_HALF_WIDTH_FACTOR = 1.4

/** Half-height of the saucer body above/below the equator. */
const SAUCER_BODY_HEIGHT_FACTOR = 0.42

/** Full height of the saucer dome cap. */
const SAUCER_DOME_HEIGHT_FACTOR = 0.72

/** Lateral half-width of the saucer neck where the dome meets the body. */
const SAUCER_NECK_HALF_WIDTH_FACTOR = 0.5

/** Horizontal inset from centre where the dome arc meets the body edge. */
const SAUCER_DOME_NECK_FACTOR = 0.7

/** Length of the thrust-flame spike behind the ship. */
const THRUST_FLAME_LENGTH_FACTOR = 1.25

/** Lateral spread of the two side flame whiskers. */
const THRUST_FLAME_SIDE_FACTOR = 0.45

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

/** Number of grid divisions along the longest screen axis. */
const GRID_DIVISIONS = 12

/** Opacity of the background scan-line grid. */
const GRID_ALPHA = 0.12

// ---------------------------------------------------------------------------
// Stroke widths
// ---------------------------------------------------------------------------

/** Stroke width used for asteroid outlines. */
const ASTEROID_LINE_WIDTH = 2

/** Stroke width used for ship and saucer outlines. */
const SHIP_LINE_WIDTH = 2

/** Scale factor applied to canvas width to derive the overlay message font size. */
const MESSAGE_FONT_SCALE = 0.035

/** Minimum font size in pixels for the overlay message regardless of canvas size. */
const MESSAGE_FONT_MIN_PX = 18

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Render parameters for the scene draw. */
export interface AsteroidsDrawOptions {
  /** Logical canvas width matching `state.width`. */
  width: number
  /** Logical canvas height matching `state.height`. */
  height: number
  /** Whether thruster flame should be drawn this frame. */
  thrust: boolean
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Draw the entire Asteroids scene to a 2D context whose transform already maps
 * logical → pixel space.
 *
 * @param ctx - 2D rendering context with the logical→pixel transform already applied.
 * @param state - Current simulation snapshot from {@link AsteroidsGame.snapshot}.
 * @param opts - Width, height, and thrust flag for this frame.
 */
export function drawAsteroidsScene(
  ctx: CanvasRenderingContext2D,
  state: AsteroidsGameState,
  opts: AsteroidsDrawOptions,
): void {
  drawGrid(ctx, state)
  for (const a of state.asteroids) drawAsteroid(ctx, a)
  for (const b of state.bullets) drawBullet(ctx, b.x, b.y, b.radius)
  for (const b of state.saucerBullets) drawBullet(ctx, b.x, b.y, b.radius)
  if (state.saucer) drawSaucer(ctx, state.saucer)
  if (state.ship.visible) drawShip(ctx, state.ship, opts.thrust)
  drawMessage(ctx, state)
}

// ---------------------------------------------------------------------------
// Private draw helpers (verbatim from ArcadeAsteroidsCanvas.vue)
// ---------------------------------------------------------------------------

/**
 * Draw the tinted background and scan-line grid.
 *
 * @param ctx - 2D rendering context.
 * @param state - Current simulation snapshot (provides width/height).
 */
function drawGrid(ctx: CanvasRenderingContext2D, state: AsteroidsGameState): void {
  ctx.save()
  ctx.fillStyle = '#020706'
  ctx.fillRect(0, 0, state.width, state.height)
  ctx.globalAlpha = GRID_ALPHA
  ctx.strokeStyle = '#4cffd7'
  ctx.lineWidth = 1
  ctx.beginPath()
  const cell = Math.max(state.width, state.height) / GRID_DIVISIONS
  for (let x = 0; x <= state.width; x += cell) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, state.height)
  }
  for (let y = 0; y <= state.height; y += cell) {
    ctx.moveTo(0, y)
    ctx.lineTo(state.width, y)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw the player ship hull and optional thrust flame.
 *
 * @param ctx - 2D rendering context.
 * @param ship - Current ship state from the simulation.
 * @param thrusting - Whether to render the thrust-flame effect this frame.
 */
function drawShip(ctx: CanvasRenderingContext2D, ship: AsteroidsShip, thrusting: boolean): void {
  const nose = {
    x: Math.cos(ship.angle) * ship.radius * SHIP_NOSE_FACTOR,
    y: Math.sin(ship.angle) * ship.radius * SHIP_NOSE_FACTOR,
  }
  const back = ship.angle + Math.PI
  const left = back - Math.PI / 2
  const right = back + Math.PI / 2
  ctx.save()
  ctx.translate(ship.x, ship.y)
  ctx.strokeStyle = ship.invulnerableTimer > 0 ? 'rgba(255,255,255,0.55)' : '#f8fff9'
  ctx.lineWidth = SHIP_LINE_WIDTH
  ctx.beginPath()
  ctx.moveTo(nose.x, nose.y)
  ctx.lineTo(
    Math.cos(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.cos(left) * ship.radius * SHIP_WING_SIDE_FACTOR,
    Math.sin(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.sin(left) * ship.radius * SHIP_WING_SIDE_FACTOR,
  )
  ctx.lineTo(
    Math.cos(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR,
    Math.sin(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR,
  )
  ctx.lineTo(
    Math.cos(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.cos(right) * ship.radius * SHIP_WING_SIDE_FACTOR,
    Math.sin(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.sin(right) * ship.radius * SHIP_WING_SIDE_FACTOR,
  )
  ctx.closePath()
  ctx.stroke()
  if (thrusting) {
    ctx.strokeStyle = '#ffdd66'
    ctx.beginPath()
    ctx.moveTo(
      Math.cos(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR,
      Math.sin(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR,
    )
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.moveTo(
      Math.cos(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR +
        Math.cos(left) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
      Math.sin(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR +
        Math.sin(left) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
    )
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.moveTo(
      Math.cos(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR +
        Math.cos(right) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
      Math.sin(back) * ship.radius * SHIP_WING_INTERIOR_FACTOR +
        Math.sin(right) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
    )
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Draw a single asteroid rock using its pre-computed vertex polygon.
 *
 * @param ctx - 2D rendering context.
 * @param asteroid - Asteroid entity to render.
 */
function drawAsteroid(ctx: CanvasRenderingContext2D, asteroid: AsteroidEntity): void {
  ctx.save()
  ctx.translate(asteroid.x, asteroid.y)
  ctx.rotate(asteroid.angle)
  ctx.strokeStyle = '#f8fff9'
  ctx.lineWidth = ASTEROID_LINE_WIDTH
  ctx.beginPath()
  asteroid.vertices.forEach((point, index) => {
    const x = point.x * asteroid.radius
    const y = point.y * asteroid.radius
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw the enemy saucer with its characteristic two-disc outline.
 *
 * @param ctx - 2D rendering context.
 * @param saucer - Saucer entity to render.
 */
function drawSaucer(ctx: CanvasRenderingContext2D, saucer: SaucerEntity): void {
  const halfWidth = saucer.radius * SAUCER_HALF_WIDTH_FACTOR
  const bodyHeight = saucer.radius * SAUCER_BODY_HEIGHT_FACTOR
  const domeHeight = saucer.radius * SAUCER_DOME_HEIGHT_FACTOR
  ctx.save()
  ctx.translate(saucer.x, saucer.y)
  ctx.strokeStyle = '#f8fff9'
  ctx.lineWidth = SHIP_LINE_WIDTH
  ctx.beginPath()
  ctx.moveTo(-halfWidth, 0)
  ctx.lineTo(-saucer.radius * SAUCER_NECK_HALF_WIDTH_FACTOR, -bodyHeight)
  ctx.lineTo(saucer.radius * SAUCER_NECK_HALF_WIDTH_FACTOR, -bodyHeight)
  ctx.lineTo(halfWidth, 0)
  ctx.lineTo(saucer.radius * SAUCER_NECK_HALF_WIDTH_FACTOR, bodyHeight)
  ctx.lineTo(-saucer.radius * SAUCER_NECK_HALF_WIDTH_FACTOR, bodyHeight)
  ctx.closePath()
  ctx.moveTo(-saucer.radius * SAUCER_DOME_NECK_FACTOR, -bodyHeight)
  ctx.lineTo(0, -domeHeight)
  ctx.lineTo(saucer.radius * SAUCER_DOME_NECK_FACTOR, -bodyHeight)
  ctx.stroke()
  ctx.restore()
}

/**
 * Draw a single bullet as a filled circle.
 *
 * @param ctx - 2D rendering context.
 * @param x - Horizontal position in logical pixels.
 * @param y - Vertical position in logical pixels.
 * @param radius - Bullet collision/draw radius in logical pixels.
 */
function drawBullet(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save()
  ctx.fillStyle = '#f8fff9'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Draw the phase-appropriate overlay message (attract, game-over, respawning).
 * No-ops during active play.
 *
 * @param ctx - 2D rendering context.
 * @param state - Current simulation snapshot providing phase and dimensions.
 */
function drawMessage(ctx: CanvasRenderingContext2D, state: AsteroidsGameState): void {
  const message =
    state.phase === 'attract'
      ? 'PRESS ENTER'
      : state.phase === 'gameOver'
        ? 'GAME OVER - ENTER TO RESTART'
        : state.phase === 'respawning'
          ? 'GET READY'
          : null
  if (!message) return
  ctx.save()
  ctx.font = `${Math.max(MESSAGE_FONT_MIN_PX, state.width * MESSAGE_FONT_SCALE)}px Datatype, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f8fff9'
  ctx.fillText(message, state.width / 2, state.height / 2)
  ctx.restore()
}
