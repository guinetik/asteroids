<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { MaintenanceMiniGame } from '@/lib/minigame/maintenance/MaintenanceMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  NEPTUNE_X,
  NEPTUNE_Y,
  NEPTUNE_R,
  PANEL_POSITIONS,
  PANEL_HALF_SIZE,
  PANEL_HIT_RADIUS,
  PANEL_DRAG_SENSITIVITY,
  TIME_LIMIT,
} from '@/lib/minigame/maintenance/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  minigame: MaintenanceMiniGame
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
let isDragging = false
let dragStartAngle = 0

/** Sun position — read from minigame (randomized per game). */
function sunX() { return props.minigame.sunX }
function sunY() { return props.minigame.sunY }

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'neptune',
  distanceToPlanet: null,
}

// ─── Pre-generated scene elements (from inspo) ──────────────────────────────

const stars: { x: number; y: number; r: number; bright: number; twinkleSpeed: number; twinkleOffset: number; hue: number }[] = []
for (let i = 0; i < 280; i++) {
  stars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.0 + 0.2,
    bright: Math.random() * 0.5 + 0.2,
    twinkleSpeed: Math.random() * 1.5 + 0.5,
    twinkleOffset: Math.random() * Math.PI * 2,
    hue: Math.random(),
  })
}

// Ring particles (Neptune's faint rings)
const RING_INNER = NEPTUNE_R + 18
const RING_OUTER = NEPTUNE_R + 65
const RING_TILT = 0.22

interface RingParticle { angle: number; dist: number; size: number; brightness: number; speed: number }
const ringParticles: RingParticle[] = []
for (let i = 0; i < 200; i++) {
  const angle = Math.random() * Math.PI * 2
  const dist = RING_INNER + Math.random() * (RING_OUTER - RING_INNER)
  const bandDensity = Math.sin(dist * 0.12) * 0.3 + 0.7
  if (Math.random() > bandDensity) continue
  ringParticles.push({
    angle,
    dist,
    size: 0.4 + Math.random() * 1.2,
    brightness: 0.08 + Math.random() * 0.12,
    speed: (0.008 + Math.random() * 0.012) / (dist * 0.004),
  })
}

// Triton
const TRITON_ORBIT_R = 260
const TRITON_R = 6
const TRITON_SPEED = 0.15

// Ambient dust
interface Dust { x: number; y: number; size: number; speed: number; alpha: number; drift: number }
const ambientDust: Dust[] = []
for (let i = 0; i < 35; i++) {
  ambientDust.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    size: 0.5 + Math.random() * 1.5,
    speed: 1 + Math.random() * 4,
    alpha: 0.03 + Math.random() * 0.06,
    drift: (Math.random() - 0.5) * 2,
  })
}

// ─── Background rendering ────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R * 0.5, NEPTUNE_X, NEPTUNE_Y, CANVAS_WIDTH * 0.9)
  bg.addColorStop(0, '#08101a')
  bg.addColorStop(0.2, '#060c14')
  bg.addColorStop(0.5, '#040810')
  bg.addColorStop(1, '#030508')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawStars(ctx: CanvasRenderingContext2D) {
  for (const s of stars) {
    const dx = s.x - NEPTUNE_X
    const dy = s.y - NEPTUNE_Y
    if (dx * dx + dy * dy < (NEPTUNE_R + 8) * (NEPTUNE_R + 8)) continue
    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.bright * twinkle
    if (alpha < 0.02) continue
    const r = s.hue > 0.85 ? 235 : s.hue > 0.7 ? 210 : 195
    const g = s.hue > 0.85 ? 215 : 210
    const b = 230 + (s.hue < 0.3 ? 20 : 0)
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.fill()
  }
}

function drawSun(ctx: CanvasRenderingContext2D) {
  // Tiny glow
  const glow = ctx.createRadialGradient(sunX(), sunY(), 0, sunX(), sunY(), 25)
  glow.addColorStop(0, 'rgba(255,250,235,0.35)')
  glow.addColorStop(0.15, 'rgba(255,240,210,0.08)')
  glow.addColorStop(0.5, 'rgba(255,220,180,0.015)')
  glow.addColorStop(1, 'rgba(255,200,150,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(sunX(), sunY(), 25, 0, Math.PI * 2)
  ctx.fill()

  // Disc
  ctx.beginPath()
  ctx.arc(sunX(), sunY(), 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,248,230,0.85)'
  ctx.fill()
}

function drawRingsBack(ctx: CanvasRenderingContext2D) {
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = NEPTUNE_X + Math.cos(a) * p.dist
    const py = NEPTUNE_Y + Math.sin(a) * p.dist * RING_TILT
    if (Math.sin(a) > 0.08) continue
    const dx = px - NEPTUNE_X
    const dy = py - NEPTUNE_Y
    if (dx * dx + dy * dy < NEPTUNE_R * NEPTUNE_R) continue
    if (px < -10 || px > CANVAS_WIDTH + 10 || py < -10 || py > CANVAS_HEIGHT + 10) continue
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,120,160,${p.brightness})`
    ctx.fill()
  }
}

function drawNeptune(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R, 0, Math.PI * 2)
  ctx.clip()

  // Deep cobalt blue
  const pg = ctx.createRadialGradient(NEPTUNE_X - NEPTUNE_R * 0.25, NEPTUNE_Y - NEPTUNE_R * 0.2, NEPTUNE_R * 0.1, NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R)
  pg.addColorStop(0, '#5080d0')
  pg.addColorStop(0.2, '#4070c0')
  pg.addColorStop(0.4, '#3060b0')
  pg.addColorStop(0.6, '#2550a0')
  pg.addColorStop(0.8, '#1a4090')
  pg.addColorStop(1, '#0e2860')
  ctx.fillStyle = pg
  ctx.fillRect(NEPTUNE_X - NEPTUNE_R, NEPTUNE_Y - NEPTUNE_R, NEPTUNE_R * 2, NEPTUNE_R * 2)

  // Storm bands
  for (let i = 0; i < 10; i++) {
    const bandY = NEPTUNE_Y - NEPTUNE_R + (NEPTUNE_R * 2 / 10) * i
    const bandH = NEPTUNE_R * 2 / 10
    const drift = Math.sin(i * 1.8 + simTime * 0.15 * (1 + i * 0.1)) * 3
    const alpha = 0.03 + Math.sin(i * 2.5) * 0.015
    ctx.fillStyle = i % 2 === 0 ? `rgba(70,120,200,${alpha})` : `rgba(30,70,160,${alpha})`
    ctx.fillRect(NEPTUNE_X - NEPTUNE_R + drift, bandY, NEPTUNE_R * 2, bandH)
  }

  // Great Dark Spot
  const spotX = NEPTUNE_X + NEPTUNE_R * 0.15 + Math.sin(simTime * 0.08) * 3
  const spotY = NEPTUNE_Y + NEPTUNE_R * 0.1
  const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, 18)
  spotGrad.addColorStop(0, 'rgba(10,25,70,0.35)')
  spotGrad.addColorStop(0.6, 'rgba(15,35,80,0.15)')
  spotGrad.addColorStop(1, 'rgba(20,45,90,0)')
  ctx.fillStyle = spotGrad
  ctx.beginPath()
  ctx.ellipse(spotX, spotY, 20, 12, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // Bright companion cloud
  const cloudGrad = ctx.createRadialGradient(spotX + 22, spotY - 8, 0, spotX + 22, spotY - 8, 8)
  cloudGrad.addColorStop(0, 'rgba(140,180,240,0.2)')
  cloudGrad.addColorStop(1, 'rgba(100,150,220,0)')
  ctx.fillStyle = cloudGrad
  ctx.beginPath()
  ctx.ellipse(spotX + 22, spotY - 8, 10, 5, -0.2, 0, Math.PI * 2)
  ctx.fill()

  // Limb darkening
  const limb = ctx.createRadialGradient(NEPTUNE_X - NEPTUNE_R * 0.2, NEPTUNE_Y - NEPTUNE_R * 0.15, NEPTUNE_R * 0.25, NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R)
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.55, 'rgba(0,0,0,0.08)')
  limb.addColorStop(0.8, 'rgba(0,0,0,0.25)')
  limb.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = limb
  ctx.fillRect(NEPTUNE_X - NEPTUNE_R, NEPTUNE_Y - NEPTUNE_R, NEPTUNE_R * 2, NEPTUNE_R * 2)

  // Sunlit crescent
  const sunAngle = Math.atan2(NEPTUNE_Y - sunY(), NEPTUNE_X - sunX())
  const crescentGrad = ctx.createLinearGradient(
    NEPTUNE_X - Math.cos(sunAngle) * NEPTUNE_R, NEPTUNE_Y - Math.sin(sunAngle) * NEPTUNE_R,
    NEPTUNE_X + Math.cos(sunAngle) * NEPTUNE_R, NEPTUNE_Y + Math.sin(sunAngle) * NEPTUNE_R,
  )
  crescentGrad.addColorStop(0, 'rgba(120,160,230,0.12)')
  crescentGrad.addColorStop(0.4, 'rgba(0,0,0,0)')
  crescentGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = crescentGrad
  ctx.fillRect(NEPTUNE_X - NEPTUNE_R, NEPTUNE_Y - NEPTUNE_R, NEPTUNE_R * 2, NEPTUNE_R * 2)
  ctx.restore()

  // Atmospheric glow
  const glow = ctx.createRadialGradient(NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R - 3, NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R + 20)
  glow.addColorStop(0, 'rgba(60,100,200,0)')
  glow.addColorStop(0.5, 'rgba(60,100,200,0.04)')
  glow.addColorStop(0.8, 'rgba(50,80,180,0.02)')
  glow.addColorStop(1, 'rgba(40,60,150,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R + 20, 0, Math.PI * 2)
  ctx.fill()
}

function drawRingsFront(ctx: CanvasRenderingContext2D) {
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = NEPTUNE_X + Math.cos(a) * p.dist
    const py = NEPTUNE_Y + Math.sin(a) * p.dist * RING_TILT
    if (Math.sin(a) <= 0.08) continue
    if (px < -10 || px > CANVAS_WIDTH + 10 || py < -10 || py > CANVAS_HEIGHT + 10) continue
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,120,160,${p.brightness * 0.7})`
    ctx.fill()
  }
}

function drawTriton(ctx: CanvasRenderingContext2D) {
  const angle = -simTime * TRITON_SPEED
  const tx = NEPTUNE_X + Math.cos(angle) * TRITON_ORBIT_R
  const ty = NEPTUNE_Y + Math.sin(angle) * TRITON_ORBIT_R * 0.3

  // Orbit path
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(NEPTUNE_X, NEPTUNE_Y, TRITON_ORBIT_R, TRITON_ORBIT_R * 0.3, 0, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(80,100,140,0.04)'
  ctx.lineWidth = 0.5
  ctx.stroke()
  ctx.restore()

  const dx = tx - NEPTUNE_X
  const dy = ty - NEPTUNE_Y
  if (dx * dx + dy * dy < NEPTUNE_R * NEPTUNE_R && Math.sin(angle) < 0) return

  const moonGrad = ctx.createRadialGradient(tx - 1, ty - 1, 0, tx, ty, TRITON_R)
  moonGrad.addColorStop(0, 'rgba(200,195,185,0.8)')
  moonGrad.addColorStop(0.6, 'rgba(160,155,145,0.6)')
  moonGrad.addColorStop(1, 'rgba(100,95,90,0.3)')
  ctx.fillStyle = moonGrad
  ctx.beginPath()
  ctx.arc(tx, ty, TRITON_R, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = '8px monospace'
  ctx.fillStyle = 'rgba(140,160,180,0.3)'
  ctx.textAlign = 'center'
  ctx.fillText('TRITON', tx, ty + TRITON_R + 10)
}

function drawPanelGuides(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.setLineDash([3, 8])
  ctx.lineWidth = 0.5
  ctx.strokeStyle = 'rgba(60,100,160,0.08)'

  // Draw curved guide arcs through each side's 3 panel positions
  const half = PANEL_POSITIONS.length / 2
  for (let side = 0; side < 2; side++) {
    const p0 = PANEL_POSITIONS[side * half]!
    const p1 = PANEL_POSITIONS[side * half + 1]!
    const p2 = PANEL_POSITIONS[side * half + 2]!
    ctx.beginPath()
    ctx.moveTo(NEPTUNE_X + p0[0], NEPTUNE_Y + p0[1])
    ctx.quadraticCurveTo(NEPTUNE_X + p1[0], NEPTUNE_Y + p1[1], NEPTUNE_X + p2[0], NEPTUNE_Y + p2[1])
    ctx.stroke()
  }

  ctx.setLineDash([])
  ctx.restore()
}

function drawAmbientDust(ctx: CanvasRenderingContext2D, dt: number) {
  for (const d of ambientDust) {
    d.x -= d.speed * dt
    d.y += d.drift * dt
    if (d.x < -10) { d.x = CANVAS_WIDTH + 10; d.y = Math.random() * CANVAS_HEIGHT }
    ctx.beginPath()
    ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(100,130,180,${d.alpha})`
    ctx.fill()
  }
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(NEPTUNE_X, NEPTUNE_Y, NEPTUNE_R * 1.5, NEPTUNE_X, NEPTUNE_Y, CANVAS_WIDTH * 0.72)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.5, 'rgba(0,0,0,0.1)')
  vg.addColorStop(1, 'rgba(0,0,0,0.45)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

// ─── Game element rendering ──────────────────────────────────────────────────

function drawSurfaceTargets(ctx: CanvasRenderingContext2D) {
  for (const target of props.minigame.targets) {
    const pulse = Math.sin(simTime * 2.5 + target.pulseOffset) * 0.3 + 0.7
    const alpha = pulse * (target.lit ? 1.0 : 0.5)

    const litColor = target.lit ? '100,255,150' : '100,220,255'

    // Outer glow
    const outerGlow = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, target.radius * 2.5)
    outerGlow.addColorStop(0, `rgba(${litColor},${alpha * 0.3})`)
    outerGlow.addColorStop(0.4, `rgba(${litColor},${alpha * 0.1})`)
    outerGlow.addColorStop(1, `rgba(${litColor},0)`)
    ctx.fillStyle = outerGlow
    ctx.beginPath()
    ctx.arc(target.x, target.y, target.radius * 2.5, 0, Math.PI * 2)
    ctx.fill()

    // Core dot
    const coreGlow = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, target.radius)
    coreGlow.addColorStop(0, `rgba(${litColor},${alpha * 0.7})`)
    coreGlow.addColorStop(0.5, `rgba(${litColor},${alpha * 0.4})`)
    coreGlow.addColorStop(1, `rgba(${litColor},${alpha * 0.1})`)
    ctx.fillStyle = coreGlow
    ctx.beginPath()
    ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2)
    ctx.fill()

    // Ring indicator
    ctx.beginPath()
    ctx.arc(target.x, target.y, target.radius * 1.6, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${litColor},${alpha * 0.25})`
    ctx.lineWidth = 0.8
    ctx.stroke()

    // Lit checkmark
    if (target.lit) {
      ctx.fillStyle = `rgba(100,255,150,${alpha * 0.8})`
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('✓', target.x, target.y - target.radius * 2)
    }
  }
}

function drawPanels(ctx: CanvasRenderingContext2D) {
  for (const panel of props.minigame.panels) {
    const isSelected = panel.id === props.minigame.selectedPanel
    const hs = PANEL_HALF_SIZE

    ctx.save()
    ctx.translate(panel.x, panel.y)
    ctx.rotate(panel.aimAngle)

    // Panel body — small rectangle
    ctx.fillStyle = panel.lit
      ? (isSelected ? '#88ddff' : '#5599cc')
      : (isSelected ? '#667788' : '#3a4a5a')
    ctx.strokeStyle = isSelected ? '#aaeeff' : 'rgba(100,160,200,0.3)'
    ctx.lineWidth = isSelected ? 1.5 : 0.8
    ctx.fillRect(-hs, -hs * 0.4, hs * 2, hs * 0.8)
    ctx.strokeRect(-hs, -hs * 0.4, hs * 2, hs * 0.8)

    // Reflective surface indicator — bright line on the face
    if (panel.lit) {
      ctx.strokeStyle = 'rgba(200,240,255,0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(hs, -hs * 0.3)
      ctx.lineTo(hs, hs * 0.3)
      ctx.stroke()
    }

    // Aim direction arrow
    ctx.strokeStyle = isSelected ? 'rgba(170,238,255,0.5)' : 'rgba(100,160,200,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(hs + 2, 0)
    ctx.lineTo(hs + 12, 0)
    ctx.stroke()
    // Arrowhead
    ctx.beginPath()
    ctx.moveTo(hs + 12, 0)
    ctx.lineTo(hs + 8, -3)
    ctx.moveTo(hs + 12, 0)
    ctx.lineTo(hs + 8, 3)
    ctx.stroke()

    ctx.restore()

    // Selection ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(panel.x, panel.y, PANEL_HIT_RADIUS, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(170,238,255,0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Lit glow
    if (panel.lit) {
      ctx.globalAlpha = 0.15
      const panelGlow = ctx.createRadialGradient(panel.x, panel.y, 2, panel.x, panel.y, 20)
      panelGlow.addColorStop(0, '#88ddff')
      panelGlow.addColorStop(1, 'rgba(100,200,255,0)')
      ctx.fillStyle = panelGlow
      ctx.beginPath()
      ctx.arc(panel.x, panel.y, 20, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1.0
    }
  }
}

function drawLightBeams(ctx: CanvasRenderingContext2D) {
  for (const beam of props.minigame.beams) {
    const alpha = beam.intensity * 0.7
    const dx = beam.x2 - beam.x1
    const dy = beam.y2 - beam.y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 1) continue

    // Perpendicular normal for beam width
    const nx = -dy / len
    const ny = dx / len

    ctx.save()

    // Outer prismatic glow — wide, rainbow-ish edges
    const outerW = 8
    ctx.globalAlpha = alpha * 0.12
    const prismGrad = ctx.createLinearGradient(
      beam.x1 + nx * outerW, beam.y1 + ny * outerW,
      beam.x1 - nx * outerW, beam.y1 - ny * outerW,
    )
    prismGrad.addColorStop(0, 'rgba(100,150,255,0)')
    prismGrad.addColorStop(0.2, 'rgba(120,180,255,1)')
    prismGrad.addColorStop(0.35, 'rgba(180,220,255,1)')
    prismGrad.addColorStop(0.5, 'rgba(255,255,255,1)')
    prismGrad.addColorStop(0.65, 'rgba(255,240,200,1)')
    prismGrad.addColorStop(0.8, 'rgba(255,200,120,1)')
    prismGrad.addColorStop(1, 'rgba(255,160,80,0)')
    ctx.strokeStyle = prismGrad
    ctx.lineWidth = outerW * 2
    ctx.beginPath()
    ctx.moveTo(beam.x1, beam.y1)
    ctx.lineTo(beam.x2, beam.y2)
    ctx.stroke()

    // Mid glow — soft white
    ctx.globalAlpha = alpha * 0.25
    ctx.strokeStyle = 'rgba(200,230,255,0.8)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(beam.x1, beam.y1)
    ctx.lineTo(beam.x2, beam.y2)
    ctx.stroke()

    // Core beam — bright white, thin
    ctx.globalAlpha = alpha * 0.9
    ctx.strokeStyle = '#eef4ff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(beam.x1, beam.y1)
    ctx.lineTo(beam.x2, beam.y2)
    ctx.stroke()

    // Sparkle dots along the beam — scintillation effect
    ctx.globalAlpha = alpha * 0.5
    const sparkleCount = Math.floor(len / 30)
    for (let i = 0; i < sparkleCount; i++) {
      const t = (i + 0.5) / sparkleCount
      const sparklePhase = simTime * 8 + i * 2.3
      const sparkleAlpha = 0.3 + 0.7 * Math.max(0, Math.sin(sparklePhase))
      if (sparkleAlpha < 0.3) continue
      const sx = beam.x1 + dx * t + nx * Math.sin(sparklePhase * 0.7) * 2
      const sy = beam.y1 + dy * t + ny * Math.sin(sparklePhase * 0.7) * 2
      ctx.globalAlpha = alpha * sparkleAlpha * 0.4
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }
}

function drawHUD(ctx: CanvasRenderingContext2D) {
  // Timer
  if (TIME_LIMIT > 0) {
    const timeLeft = Math.max(0, props.minigame.timeRemaining)
    const timeLow = timeLeft < 20
    ctx.fillStyle = timeLow ? '#ff4444' : '#ffffff'
    ctx.font = timeLow ? 'bold 16px monospace' : '14px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.ceil(timeLeft)}s`, CANVAS_WIDTH / 2, 24)
  }

  // Target counter
  ctx.fillStyle = '#88ccff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(
    `TARGETS: ${props.minigame.targetsLit} / ${props.minigame.targetCount}`,
    CANVAS_WIDTH - 20, 24,
  )

  // Progress bar (bottom)
  const barWidth = CANVAS_WIDTH - 100
  const barHeight = 16
  const barX = 50
  const barY = CANVAS_HEIGHT - 40

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(barX, barY, barWidth, barHeight)

  const fill = props.minigame.targetsLit / props.minigame.targetCount
  ctx.fillStyle = fill >= 1 ? '#00ff88' : '#88ccff'
  ctx.fillRect(barX, barY, barWidth * fill, barHeight)

  ctx.strokeStyle = 'rgba(100, 200, 220, 0.4)'
  ctx.strokeRect(barX, barY, barWidth, barHeight)

  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `ALIGNMENT: ${props.minigame.targetsLit} / ${props.minigame.targetCount}`,
    CANVAS_WIDTH / 2, barY - 6,
  )

  // Instructions
  if (props.minigame.selectedPanel >= 0) {
    ctx.fillStyle = 'rgba(170,238,255,0.5)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('DRAG to aim panel — CLICK elsewhere to deselect', 20, CANVAS_HEIGHT - 55)
  } else {
    ctx.fillStyle = 'rgba(100,160,200,0.4)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('CLICK a solar panel to select it', 20, CANVAS_HEIGHT - 55)
  }
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = props.minigame.status === 'completed' ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    props.minigame.status === 'completed' ? 'ALIGNMENT COMPLETE' : 'TIME EXPIRED — MISSION FAILED',
    CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2,
  )
}

// ─── Mouse interaction ───────────────────────────────────────────────────────

/** Cached canvas rect — updated on mouse down to avoid per-move layout queries. */
let cachedRect: DOMRect | null = null
let cachedScaleX = 1
let cachedScaleY = 1

function updateCachedRect() {
  const canvas = canvasRef.value
  if (!canvas) return
  cachedRect = canvas.getBoundingClientRect()
  cachedScaleX = CANVAS_WIDTH / cachedRect.width
  cachedScaleY = CANVAS_HEIGHT / cachedRect.height
}

function getCanvasPos(e: MouseEvent): { x: number; y: number } | null {
  if (!cachedRect) return null
  return {
    x: (e.clientX - cachedRect.left) * cachedScaleX,
    y: (e.clientY - cachedRect.top) * cachedScaleY,
  }
}

function onMouseDown(e: MouseEvent) {
  if (props.minigame.status !== 'active') return
  updateCachedRect()
  const pos = getCanvasPos(e)
  if (!pos) return

  // Check if clicking a panel
  for (const panel of props.minigame.panels) {
    const dx = pos.x - panel.x
    const dy = pos.y - panel.y
    if (dx * dx + dy * dy < PANEL_HIT_RADIUS * PANEL_HIT_RADIUS) {
      props.minigame.selectPanel(panel.id)
      isDragging = true
      return
    }
  }

  // If a panel is selected, clicking elsewhere aims it there
  if (props.minigame.selectedPanel >= 0) {
    props.minigame.aimSelectedPanelAt(pos.x, pos.y)
    return
  }

  // Nothing selected, nothing clicked — no-op
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging) return
  if (props.minigame.selectedPanel < 0) return
  const pos = getCanvasPos(e)
  if (!pos) return

  props.minigame.aimSelectedPanelAt(pos.x, pos.y)
}

function onMouseUp() {
  isDragging = false
}

// ─── Game loop ───────────────────────────────────────────────────────────────

function loop(time: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time
  simTime += dt

  if (props.minigame.status === 'active') {
    props.minigame.tick(dt, STUB_CTX)
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawBackground(ctx)
  drawStars(ctx)
  drawSun(ctx)
  drawPanelGuides(ctx)
  drawRingsBack(ctx)
  drawTriton(ctx)
  drawNeptune(ctx)
  drawSurfaceTargets(ctx)
  drawRingsFront(ctx)
  drawLightBeams(ctx)
  drawPanels(ctx)
  drawAmbientDust(ctx, dt)
  drawVignette(ctx)
  drawHUD(ctx)

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
  drawSun(ctx)
  drawPanelGuides(ctx)
  drawRingsBack(ctx)
  drawTriton(ctx)
  drawNeptune(ctx)
  drawRingsFront(ctx)
  drawVignette(ctx)
}

function startGame() {
  started.value = true
  briefingVisible.value = false
  const canvas = canvasRef.value
  if (canvas) {
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', onMouseUp)
  }
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
  const canvas = canvasRef.value
  if (canvas) {
    canvas.removeEventListener('mousedown', onMouseDown)
    canvas.removeEventListener('mousemove', onMouseMove)
    canvas.removeEventListener('mouseup', onMouseUp)
    canvas.removeEventListener('mouseleave', onMouseUp)
  }
})
</script>

<template>
  <div class="gas-collection-wrapper">
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="gas-collection-canvas"
      :style="{ cursor: started ? 'crosshair' : 'default' }"
    />

    <Transition name="gas-briefing">
      <div v-if="briefingVisible && !started" class="gas-collection-briefing-overlay">
        <div class="gas-collection-briefing">
          <div class="gas-collection-briefing__icon">☀</div>
          <h3 class="gas-collection-briefing__title">SOLAR MIRROR ARRAY OFFLINE</h3>
          <p class="gas-collection-briefing__text">
            Neptune's orbital solar mirror array has drifted out of alignment.
            Surface installations are losing power. The distant sun provides
            barely enough light — every photon must be redirected precisely.
          </p>
          <p class="gas-collection-briefing__text">
            Click each solar panel and drag to aim it. Chain panels to bounce
            sunlight around the planet's shadow. Illuminate all surface targets
            to restore power.
          </p>
          <div class="gas-collection-briefing__controls">
            <span><b>CLICK</b> — select panel</span>
            <span><b>DRAG</b> — aim panel</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Panels: {{ minigame.panels.length }}.
            Targets: {{ minigame.targetCount }}.
            Time limit: {{ Math.ceil(minigame.timeTotal) }}s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            BEGIN ALIGNMENT
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
