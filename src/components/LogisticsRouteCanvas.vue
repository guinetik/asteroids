<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { LogisticsRouteMiniGame } from '@/lib/minigame/logistics/LogisticsRouteMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_START_X,
  LANE_SPACING,
  SHIP_HALF_SIZE,
  HULL_MAX_HP,
} from '@/lib/minigame/logistics/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'
import type { RouteSymbolType } from '@/lib/minigame/logistics/types'

const props = defineProps<{
  minigame: LogisticsRouteMiniGame
}>()

const emit = defineEmits<{
  complete: []
  fail: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const briefingVisible = ref(false)
let animId = 0
let lastTime = 0
let simTime = 0
let frameCount = 0

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'earth',
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = false
}

function updateInput() {
  props.minigame.setInput({
    up: !!keys['w'] || !!keys['arrowup'],
    down: !!keys['s'] || !!keys['arrowdown'],
    left: !!keys['a'] || !!keys['arrowleft'],
    right: !!keys['d'] || !!keys['arrowright'],
  })
}

// ─── Earth scene constants ────────────────────────────────────────────────────

const EARTH_X = CANVAS_WIDTH + 80
const EARTH_Y = CANVAS_HEIGHT * 0.5
const EARTH_R = 320

// ─── Pre-generated scene elements ─────────────────────────────────────────────

interface Star {
  x: number
  y: number
  r: number
  brightness: number
  twinkleSpeed: number
  twinkleOffset: number
}

const stars: Star[] = []
for (let i = 0; i < 180; i++) {
  stars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.0 + 0.2,
    brightness: Math.random() * 0.4 + 0.15,
    twinkleSpeed: Math.random() * 2 + 0.5,
    twinkleOffset: Math.random() * Math.PI * 2,
  })
}

interface ScrollParticle {
  x: number
  y: number
  size: number
  speed: number
  alpha: number
}

const scrollParticles: ScrollParticle[] = []
for (let i = 0; i < 40; i++) {
  scrollParticles.push({
    x: Math.random() * CANVAS_WIDTH * 0.8,
    y: Math.random() * CANVAS_HEIGHT,
    size: 0.5 + Math.random() * 1.5,
    speed: 30 + Math.random() * 60,
    alpha: 0.04 + Math.random() * 0.06,
  })
}

interface Station {
  x: number
  y: number
  size: number
  speed: number
  alpha: number
}

const stations: Station[] = [
  { x: CANVAS_WIDTH * 0.15, y: CANVAS_HEIGHT * 0.15, size: 12, speed: 8, alpha: 0.08 },
  { x: CANVAS_WIDTH * 0.65, y: CANVAS_HEIGHT * 0.35, size: 8, speed: 5, alpha: 0.05 },
  { x: CANVAS_WIDTH * 0.4, y: CANVAS_HEIGHT * 0.8, size: 15, speed: 12, alpha: 0.06 },
]

// ─── Background rendering ─────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0)
  bg.addColorStop(0, '#060810')
  bg.addColorStop(0.6, '#080a14')
  bg.addColorStop(0.8, '#0c1020')
  bg.addColorStop(1, '#101828')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawStars(ctx: CanvasRenderingContext2D) {
  for (const s of stars) {
    const dx = s.x - EARTH_X
    const dy = s.y - EARTH_Y
    if (dx * dx + dy * dy < (EARTH_R + 10) * (EARTH_R + 10)) continue

    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.brightness * twinkle
    if (alpha < 0.02) continue

    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(210,215,235,${alpha})`
    ctx.fill()
  }
}

function drawEarth(ctx: CanvasRenderingContext2D) {
  ctx.save()

  // Atmosphere glow
  const atmoGlow = ctx.createRadialGradient(
    EARTH_X, EARTH_Y, EARTH_R - 20,
    EARTH_X, EARTH_Y, EARTH_R + 60,
  )
  atmoGlow.addColorStop(0, 'rgba(60,140,220,0)')
  atmoGlow.addColorStop(0.5, 'rgba(60,140,220,0.06)')
  atmoGlow.addColorStop(0.7, 'rgba(80,160,240,0.03)')
  atmoGlow.addColorStop(1, 'rgba(60,120,200,0)')
  ctx.fillStyle = atmoGlow
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R + 60, 0, Math.PI * 2)
  ctx.fill()

  // Planet body — clip to circle
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R, 0, Math.PI * 2)
  ctx.clip()

  // Base ocean gradient
  const pg = ctx.createRadialGradient(
    EARTH_X - EARTH_R * 0.3, EARTH_Y - EARTH_R * 0.2, EARTH_R * 0.1,
    EARTH_X, EARTH_Y, EARTH_R,
  )
  pg.addColorStop(0, '#4a90d0')
  pg.addColorStop(0.3, '#3a78b8')
  pg.addColorStop(0.5, '#2a60a0')
  pg.addColorStop(0.7, '#1e4a88')
  pg.addColorStop(1, '#103060')
  ctx.fillStyle = pg
  ctx.fillRect(EARTH_X - EARTH_R, EARTH_Y - EARTH_R, EARTH_R * 2, EARTH_R * 2)

  // Continent blobs — green/brown patches
  const continents = [
    { x: EARTH_X - 180, y: EARTH_Y - 80, rx: 60, ry: 45 },
    { x: EARTH_X - 220, y: EARTH_Y + 40, rx: 40, ry: 30 },
    { x: EARTH_X - 140, y: EARTH_Y + 100, rx: 35, ry: 50 },
    { x: EARTH_X - 100, y: EARTH_Y - 140, rx: 50, ry: 25 },
    { x: EARTH_X - 250, y: EARTH_Y - 20, rx: 30, ry: 40 },
  ]
  for (const c of continents) {
    ctx.beginPath()
    ctx.ellipse(c.x, c.y, c.rx, c.ry, 0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(50,95,45,0.4)'
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(c.x + 5, c.y + 3, c.rx * 0.5, c.ry * 0.4, 0.2, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,100,60,0.15)'
    ctx.fill()
  }

  // Cloud swirls (animated)
  for (let i = 0; i < 6; i++) {
    const cx = EARTH_X - 280 + i * 55 + Math.sin(simTime * 0.1 + i) * 10
    const cy = EARTH_Y - 120 + i * 50 + Math.cos(simTime * 0.08 + i * 2) * 8
    ctx.beginPath()
    ctx.ellipse(cx, cy, 40 + i * 5, 12 + i * 2, 0.3 + i * 0.1, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(220,230,240,0.08)'
    ctx.fill()
  }

  // Limb darkening
  const limb = ctx.createRadialGradient(
    EARTH_X - EARTH_R * 0.25, EARTH_Y - EARTH_R * 0.15, EARTH_R * 0.3,
    EARTH_X, EARTH_Y, EARTH_R,
  )
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.6, 'rgba(0,0,0,0.1)')
  limb.addColorStop(0.85, 'rgba(0,0,0,0.35)')
  limb.addColorStop(1, 'rgba(0,0,0,0.6)')
  ctx.fillStyle = limb
  ctx.fillRect(EARTH_X - EARTH_R, EARTH_Y - EARTH_R, EARTH_R * 2, EARTH_R * 2)

  // City lights on dark side
  for (let i = 0; i < 15; i++) {
    const lx = EARTH_X - 80 - Math.random() * 200
    const ly = EARTH_Y - 150 + Math.random() * 300
    const dx = lx - EARTH_X
    const dy = ly - EARTH_Y
    if (dx * dx + dy * dy > EARTH_R * EARTH_R) continue
    const darkSide = (lx - EARTH_X + EARTH_R * 0.3) / EARTH_R
    if (darkSide < 0.3) continue
    ctx.beginPath()
    ctx.arc(lx, ly, 1 + Math.random() * 2, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,220,140,${0.05 + Math.random() * 0.08})`
    ctx.fill()
  }

  ctx.restore()

  // Thin blue atmosphere line on lit edge
  ctx.save()
  ctx.beginPath()
  ctx.arc(EARTH_X, EARTH_Y, EARTH_R + 2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,160,255,0.08)'
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.restore()
}

function drawDistantStations(ctx: CanvasRenderingContext2D) {
  const scrollOffset = props.minigame.scrollOffset
  for (const st of stations) {
    const sy = ((st.y + scrollOffset * st.speed * 0.001) % (CANVAS_HEIGHT + 40)) - 20

    ctx.save()
    ctx.translate(st.x, sy)
    ctx.fillStyle = `rgba(100,120,150,${st.alpha})`

    // Station cross body
    ctx.fillRect(-st.size, -1.5, st.size * 2, 3)
    ctx.fillRect(-1.5, -st.size, 3, st.size * 2)

    // Solar panel squares
    ctx.fillRect(-st.size - 3, -3, 4, 6)
    ctx.fillRect(st.size - 1, -3, 4, 6)

    ctx.restore()
  }
}

function drawLaneMarkers(ctx: CanvasRenderingContext2D) {
  const scrollOffset = props.minigame.scrollOffset
  ctx.save()
  ctx.setLineDash([12, 20])
  const dashOffset = -(scrollOffset % 32)
  ctx.lineDashOffset = dashOffset

  for (let i = 0; i <= LANE_COUNT; i++) {
    const x = LANE_START_X + LANE_SPACING * (i + 0.5)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, CANVAS_HEIGHT)
    ctx.strokeStyle = 'rgba(60,100,140,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Outer lane boundaries — slightly brighter
  ctx.setLineDash([20, 10])
  ctx.lineDashOffset = dashOffset
  const leftBound = LANE_START_X + LANE_SPACING * 0.5
  const rightBound = LANE_START_X + LANE_SPACING * (LANE_COUNT + 0.5)

  ctx.beginPath()
  ctx.moveTo(leftBound, 0)
  ctx.lineTo(leftBound, CANVAS_HEIGHT)
  ctx.strokeStyle = 'rgba(60,120,160,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(rightBound, 0)
  ctx.lineTo(rightBound, CANVAS_HEIGHT)
  ctx.strokeStyle = 'rgba(60,120,160,0.12)'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.setLineDash([])
  ctx.restore()
}

function drawScrollParticles(ctx: CanvasRenderingContext2D, dt: number) {
  for (const p of scrollParticles) {
    p.y += p.speed * dt
    if (p.y > CANVAS_HEIGHT + 10) {
      p.y = -5
      p.x = Math.random() * CANVAS_WIDTH * 0.8
    }

    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,150,180,${p.alpha})`
    ctx.fill()
  }
}

// ─── Symbol shape drawing helper ──────────────────────────────────────────────

function drawSymbolShape(ctx: CanvasRenderingContext2D, type: RouteSymbolType, size: number) {
  ctx.beginPath()
  switch (type) {
    case 'star': {
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5 - Math.PI / 2
        const aInner = a + Math.PI / 5
        const ox = Math.cos(a) * size
        const oy = Math.sin(a) * size
        const ix = Math.cos(aInner) * size * 0.4
        const iy = Math.sin(aInner) * size * 0.4
        if (i === 0) ctx.moveTo(ox, oy)
        else ctx.lineTo(ox, oy)
        ctx.lineTo(ix, iy)
      }
      ctx.closePath()
      break
    }
    case 'diamond': {
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.7, 0)
      ctx.lineTo(0, size)
      ctx.lineTo(-size * 0.7, 0)
      ctx.closePath()
      break
    }
    case 'circle': {
      ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2)
      break
    }
    case 'triangle': {
      ctx.moveTo(0, -size)
      ctx.lineTo(size * 0.85, size * 0.7)
      ctx.lineTo(-size * 0.85, size * 0.7)
      ctx.closePath()
      break
    }
    case 'square': {
      const s = size * 0.75
      ctx.rect(-s, -s, s * 2, s * 2)
      break
    }
  }
}

function drawRouteSymbols(ctx: CanvasRenderingContext2D) {
  const targetType =
    props.minigame.manifestIndex < props.minigame.manifest.length
      ? props.minigame.manifest[props.minigame.manifestIndex]
      : null

  for (const sym of props.minigame.symbols) {
    if (sym.collected) continue

    const isTarget = sym.type === targetType
    const pulse = Math.sin(simTime * 3) * 0.15 + 0.85
    const size = isTarget ? 14 * pulse : 11
    const alpha = isTarget ? 0.9 : 0.4

    ctx.save()
    ctx.translate(sym.x, sym.y)

    // Glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2)
    glow.addColorStop(0, `rgba(80,220,200,${alpha * 0.3})`)
    glow.addColorStop(1, 'rgba(80,220,200,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, size * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `rgba(80,220,200,${alpha})`
    ctx.fillStyle = `rgba(80,220,200,${alpha * 0.2})`
    ctx.lineWidth = 1.5

    drawSymbolShape(ctx, sym.type, size)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }
}

function drawTraffic(ctx: CanvasRenderingContext2D) {
  for (const tr of props.minigame.traffic) {
    const s = tr.size * 10 // scale factor for visual size

    ctx.save()
    ctx.translate(tr.x, tr.y)

    // Shuttle body — pointing down
    ctx.fillStyle = `rgba(140,150,165,${tr.alpha})`
    ctx.beginPath()
    ctx.moveTo(0, -s)
    ctx.lineTo(s * 0.6, s * 0.3)
    ctx.lineTo(s * 0.3, s * 0.5)
    ctx.lineTo(s * 0.15, s)
    ctx.lineTo(-s * 0.15, s)
    ctx.lineTo(-s * 0.3, s * 0.5)
    ctx.lineTo(-s * 0.6, s * 0.3)
    ctx.closePath()
    ctx.fill()

    // Engine glow
    ctx.beginPath()
    ctx.arc(0, s + 2, s * 0.25, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,180,255,${tr.alpha * 0.5})`
    ctx.fill()

    // Running lights — red left, green right
    ctx.beginPath()
    ctx.arc(-s * 0.5, s * 0.3, 1, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,60,60,${tr.alpha * 0.6})`
    ctx.fill()

    ctx.beginPath()
    ctx.arc(s * 0.5, s * 0.3, 1, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(60,255,60,${tr.alpha * 0.6})`
    ctx.fill()

    ctx.restore()
  }
}

function drawPlayerShuttle(ctx: CanvasRenderingContext2D) {
  if (props.minigame.damageFlash > 0 && frameCount % 4 < 2) return

  const bob = Math.sin(simTime * 2.5) * 2.5
  const px = props.minigame.shipX
  const py = props.minigame.shipY + bob
  // Elongated shuttle proportions — rotated 90° (pointing up)
  const hw = 12 // half-width (narrow)
  const hh = 24 // half-height (long nose-to-tail)
  const tilt = Math.max(-0.12, Math.min(0.12, props.minigame.shipVx * 0.0003))

  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(tilt)

  // Engine exhaust glow
  const speed = Math.sqrt(
    props.minigame.shipVx * props.minigame.shipVx +
    props.minigame.shipVy * props.minigame.shipVy,
  )
  if (speed > 5) {
    const flameLen = 10 + (speed / 450) * 20 + Math.random() * 6
    const flameGrad = ctx.createLinearGradient(0, hh, 0, hh + flameLen)
    flameGrad.addColorStop(0, 'rgba(0,200,255,0.8)')
    flameGrad.addColorStop(0.4, 'rgba(100,180,255,0.4)')
    flameGrad.addColorStop(1, 'rgba(100,180,255,0)')
    ctx.fillStyle = flameGrad
    ctx.beginPath()
    ctx.moveTo(-3, hh)
    ctx.lineTo(0, hh + flameLen)
    ctx.lineTo(3, hh)
    ctx.closePath()
    ctx.fill()
  }

  // Fuselage — elongated shuttle body pointing up
  ctx.fillStyle = '#c8c4be'
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(0, -hh - 4)                // nose tip
  ctx.lineTo(hw * 0.5, -hh + 4)         // right nose curve
  ctx.lineTo(hw * 0.55, hh - 6)         // right body
  ctx.lineTo(hw * 0.4, hh)              // rear right
  ctx.lineTo(-hw * 0.4, hh)             // rear left
  ctx.lineTo(-hw * 0.55, hh - 6)        // left body
  ctx.lineTo(-hw * 0.5, -hh + 4)        // left nose curve
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Thermal tile pattern — darker right side
  ctx.fillStyle = '#2a2a2e'
  ctx.beginPath()
  ctx.moveTo(hw * 0.15, -hh + 2)
  ctx.lineTo(hw * 0.3, hh - 6)
  ctx.lineTo(hw * 0.4, hh)
  ctx.lineTo(hw * 0.05, hh)
  ctx.lineTo(hw * 0.15, hh - 6)
  ctx.lineTo(hw * 0.05, -hh + 2)
  ctx.closePath()
  ctx.fill()

  // Wing — swept delta (right)
  ctx.fillStyle = '#a8a4a0'
  ctx.strokeStyle = '#777'
  ctx.beginPath()
  ctx.moveTo(hw * 0.4, 4)
  ctx.lineTo(hw + 6, hh - 2)
  ctx.lineTo(hw * 0.5, hh)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Wing — swept delta (left)
  ctx.beginPath()
  ctx.moveTo(-hw * 0.4, 4)
  ctx.lineTo(-hw - 6, hh - 2)
  ctx.lineTo(-hw * 0.5, hh)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cockpit window
  ctx.fillStyle = '#44aadd'
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.ellipse(0, -hh + 6, 2, 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1.0

  // Engine nozzles
  ctx.fillStyle = '#444'
  ctx.fillRect(-3, hh, 2, 3)
  ctx.fillRect(1, hh, 2, 3)

  ctx.restore()
}

function drawManifestCard(ctx: CanvasRenderingContext2D) {
  const cardX = 15
  const cardY = 15
  const cardW = 90
  const cardH = 55

  ctx.save()
  ctx.fillStyle = 'rgba(10,20,35,0.7)'
  ctx.strokeStyle = 'rgba(60,140,180,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(cardX, cardY, cardW, cardH, 4)
  ctx.fill()
  ctx.stroke()

  ctx.font = '8px monospace'
  ctx.fillStyle = 'rgba(80,180,200,0.6)'
  ctx.textAlign = 'center'
  ctx.fillText('NEXT PICKUP', cardX + cardW / 2, cardY + 12)

  const targetType =
    props.minigame.manifestIndex < props.minigame.manifest.length
      ? props.minigame.manifest[props.minigame.manifestIndex]
      : null

  if (targetType != null) {
    const cardCx = cardX + cardW / 2
    const cardCy = cardY + 34
    const symSize = 10

    ctx.save()
    ctx.translate(cardCx, cardCy)

    // Glow behind symbol
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, symSize * 2)
    glow.addColorStop(0, 'rgba(80,220,200,0.24)')
    glow.addColorStop(1, 'rgba(80,220,200,0)')
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(0, 0, symSize * 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = 'rgba(80,220,200,0.8)'
    ctx.fillStyle = 'rgba(80,220,200,0.16)'
    ctx.lineWidth = 1.5
    drawSymbolShape(ctx, targetType, symSize)
    ctx.fill()
    ctx.stroke()

    ctx.restore()
  }

  ctx.restore()
}

function drawHUD(ctx: CanvasRenderingContext2D) {
  const rightEdge = CANVAS_WIDTH * 0.75 - 15

  ctx.save()
  ctx.font = '12px monospace'
  ctx.fillStyle = 'rgba(80,200,190,0.7)'
  ctx.textAlign = 'right'
  ctx.fillText(
    `ROUTE: ${props.minigame.manifestIndex} / ${props.minigame.manifest.length}`,
    rightEdge,
    28,
  )

  // Health bar
  const barX = CANVAS_WIDTH * 0.75 - 130
  const barY = 35
  const barW = 115
  const barH = 6
  const hpRatio = props.minigame.hullHp / HULL_MAX_HP
  const hpColor = hpRatio > 0.5 ? 'rgba(60,200,140,0.6)' : hpRatio > 0.25 ? 'rgba(255,170,0,0.6)' : 'rgba(255,60,60,0.6)'

  ctx.fillStyle = 'rgba(20,40,60,0.5)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = hpColor
  ctx.fillRect(barX, barY, barW * hpRatio, barH)
  ctx.strokeStyle = 'rgba(60,140,160,0.3)'
  ctx.lineWidth = 0.5
  ctx.strokeRect(barX, barY, barW, barH)

  ctx.restore()
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(
    CANVAS_WIDTH * 0.4, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.2,
    CANVAS_WIDTH * 0.45, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.65,
  )
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.6, 'rgba(0,0,0,0.08)')
  vg.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const completed = props.minigame.status === 'completed'
  ctx.fillStyle = completed ? '#00e8cc' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    completed ? 'ROUTE COMPLETE' : 'HULL BREACH',
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
  )
}

// ─── Game loop ────────────────────────────────────────────────────────────────

function loop(time: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time
  simTime += dt
  frameCount++

  if (props.minigame.status === 'active') {
    updateInput()
    props.minigame.tick(dt, STUB_CTX)
  }

  // Screen shake on damage
  const shakeAmt = props.minigame.damageFlash * 5
  ctx.save()
  if (shakeAmt > 0) {
    ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt)
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawBackground(ctx)
  drawStars(ctx)
  drawEarth(ctx)
  drawDistantStations(ctx)
  drawLaneMarkers(ctx)
  drawScrollParticles(ctx, dt)
  drawRouteSymbols(ctx)
  drawTraffic(ctx)
  drawPlayerShuttle(ctx)
  drawManifestCard(ctx)
  drawHUD(ctx)
  drawVignette(ctx)

  ctx.restore()

  if (props.minigame.status === 'completed') {
    drawEndScreen(ctx)
    emit('complete')
    return
  }
  if (props.minigame.status === 'failed') {
    drawEndScreen(ctx)
    emit('fail')
    return
  }

  animId = requestAnimationFrame(loop)
}

function drawStillFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawBackground(ctx)
  drawStars(ctx)
  drawEarth(ctx)
  drawDistantStations(ctx)
  drawLaneMarkers(ctx)
  drawVignette(ctx)
  drawPlayerShuttle(ctx)
}

function startGame() {
  started.value = true
  briefingVisible.value = false
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  lastTime = 0
  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  requestAnimationFrame(() => {
    drawStillFrame()
    setTimeout(() => {
      briefingVisible.value = true
    }, 600)
  })
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <div class="gas-collection-wrapper">
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="gas-collection-canvas"
    />

    <Transition name="gas-briefing">
      <div v-if="briefingVisible && !started" class="gas-collection-briefing-overlay">
        <div class="gas-collection-briefing">
          <div class="gas-collection-briefing__icon">📦</div>
          <h3 class="gas-collection-briefing__title">EARTH ORBITAL LOGISTICS</h3>
          <p class="gas-collection-briefing__text">
            Earth's orbital shipping lanes are busy. Fly your shuttle through the
            traffic corridor and collect every symbol on your manifest — in order.
          </p>
          <p class="gas-collection-briefing__text">
            The manifest card (top-left) shows your next pickup symbol. Dodge
            incoming traffic and protect your hull — one hull breach ends the route.
          </p>
          <div class="gas-collection-briefing__controls">
            <span><b>W A S D</b> or <b>Arrows</b> — fly</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Hull: {{ minigame.hullMaxHp }} HP.
            Route: {{ minigame.manifest.length }} symbols.
            Scroll speed: {{ minigame.scrollSpeed }} px/s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            BEGIN ROUTE
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
