<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { IceHarvestMiniGame } from '@/lib/minigame/iceHarvest/IceHarvestMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
  COOK_ZONE_Y,
  COOK_ZONE_TOLERANCE,
  HEAT_WARNING_OFFSET,
  HULL_MAX_HP,
  HARPOON_COOLDOWN,
} from '@/lib/minigame/iceHarvest/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  minigame: IceHarvestMiniGame
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

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: 'saturn',
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
  if (e.key === ' ') {
    e.preventDefault()
    props.minigame.fireHarpoon()
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = false
}

function updateInput() {
  props.minigame.setInput({
    up: !!keys['w'],
    down: !!keys['s'],
    left: !!keys['a'],
    right: !!keys['d'],
  })
}

// ─── Saturn scene constants (from inspo) ──────────────────────────────────────

const SATURN_X = CANVAS_WIDTH * 0.88
const SATURN_Y = CANVAS_HEIGHT * 0.08
const SATURN_R = 180
const RING_INNER = 220
const RING_OUTER = 340
const RING_TILT = 0.18

// ─── Pre-generated scene elements ─────────────────────────────────────────────

const stars: { x: number; y: number; r: number; bright: number; twinkleSpeed: number; twinkleOffset: number }[] = []
for (let i = 0; i < 200; i++) {
  stars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.2 + 0.3,
    bright: Math.random() * 0.6 + 0.4,
    twinkleSpeed: Math.random() * 2 + 1,
    twinkleOffset: Math.random() * Math.PI * 2,
  })
}

interface RingParticle { angle: number; dist: number; size: number; brightness: number; speed: number; colorShift: number }
const ringParticles: RingParticle[] = []
for (let i = 0; i < 300; i++) {
  const angle = Math.random() * Math.PI * 2
  const dist = RING_INNER + Math.random() * (RING_OUTER - RING_INNER)
  const bandNoise = Math.sin(dist * 0.08) * 0.3 + 0.7
  if (Math.random() > bandNoise) continue
  ringParticles.push({
    angle,
    dist,
    size: Math.random() * 3 + 0.8,
    brightness: Math.random() * 0.5 + 0.3,
    speed: (0.02 + Math.random() * 0.03) / (dist * 0.005),
    colorShift: Math.random(),
  })
}

interface Debris { x: number; y: number; size: number; speed: number; brightness: number }
const debris: Debris[] = []
for (let i = 0; i < 25; i++) {
  debris.push({
    x: Math.random() * CANVAS_WIDTH * 1.4 - CANVAS_WIDTH * 0.2,
    y: CANVAS_HEIGHT * 0.55 + Math.random() * CANVAS_HEIGHT * 0.5,
    size: Math.random() * 6 + 2,
    speed: 15 + Math.random() * 40,
    brightness: Math.random() * 0.3 + 0.15,
  })
}

// ─── Background rendering (from inspo) ───────────────────────────────────────

function lerp3(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, t: number): [number, number, number] {
  return [r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  bg.addColorStop(0, '#05060f')
  bg.addColorStop(0.4, '#080a18')
  bg.addColorStop(0.65, '#0d0f1e')
  bg.addColorStop(0.78, '#1a1520')
  bg.addColorStop(0.85, '#2a1f28')
  bg.addColorStop(1, '#1e1518')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawStars(ctx: CanvasRenderingContext2D) {
  for (const s of stars) {
    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.bright * twinkle
    const dx = s.x - SATURN_X
    const dy = s.y - SATURN_Y
    if (dx * dx + dy * dy < (SATURN_R + 20) * (SATURN_R + 20)) continue
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(220,225,255,${alpha})`
    ctx.fill()
  }
}

function drawSaturn(ctx: CanvasRenderingContext2D) {
  // Planet body
  ctx.save()
  ctx.beginPath()
  ctx.arc(SATURN_X, SATURN_Y, SATURN_R, 0, Math.PI * 2)
  ctx.clip()

  const pg = ctx.createLinearGradient(SATURN_X - SATURN_R, SATURN_Y - SATURN_R, SATURN_X + SATURN_R, SATURN_Y + SATURN_R)
  pg.addColorStop(0, '#c4a44a')
  pg.addColorStop(0.2, '#d4b870')
  pg.addColorStop(0.35, '#b89545')
  pg.addColorStop(0.5, '#c9a958')
  pg.addColorStop(0.65, '#ddc080')
  pg.addColorStop(0.8, '#b08a3a')
  pg.addColorStop(1, '#9a7830')
  ctx.fillStyle = pg
  ctx.fillRect(SATURN_X - SATURN_R, SATURN_Y - SATURN_R, SATURN_R * 2, SATURN_R * 2)

  // Horizontal bands
  for (let i = 0; i < 12; i++) {
    const bandY = SATURN_Y - SATURN_R + (SATURN_R * 2 / 12) * i
    const bandH = SATURN_R * 2 / 12
    const hue = i % 3 === 0 ? '#8a6520' : '#d4b870'
    ctx.fillStyle = hue
    ctx.globalAlpha = (i % 2 === 0 ? 0.08 : 0.04) + Math.sin(i * 1.5 + simTime * 0.3) * 0.02
    ctx.fillRect(SATURN_X - SATURN_R, bandY, SATURN_R * 2, bandH)
  }
  ctx.globalAlpha = 1

  // Limb darkening
  const limb = ctx.createRadialGradient(SATURN_X - 30, SATURN_Y - 30, SATURN_R * 0.3, SATURN_X, SATURN_Y, SATURN_R)
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.7, 'rgba(0,0,0,0.15)')
  limb.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = limb
  ctx.fillRect(SATURN_X - SATURN_R, SATURN_Y - SATURN_R, SATURN_R * 2, SATURN_R * 2)
  ctx.restore()

  // Atmospheric glow
  const glow = ctx.createRadialGradient(SATURN_X, SATURN_Y, SATURN_R - 5, SATURN_X, SATURN_Y, SATURN_R + 25)
  glow.addColorStop(0, 'rgba(200,170,80,0)')
  glow.addColorStop(0.5, 'rgba(200,170,80,0.06)')
  glow.addColorStop(1, 'rgba(200,170,80,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(SATURN_X, SATURN_Y, SATURN_R + 25, 0, Math.PI * 2)
  ctx.fill()
}

function drawRingsBack(ctx: CanvasRenderingContext2D) {
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = SATURN_X + Math.cos(a) * p.dist
    const py = SATURN_Y + Math.sin(a) * p.dist * RING_TILT
    if (Math.sin(a) > 0.1) continue
    const dx = px - SATURN_X
    const dy = py - SATURN_Y
    if (dx * dx + dy * dy < SATURN_R * SATURN_R) continue
    if (px < -10 || px > CANVAS_WIDTH + 10 || py < -10 || py > CANVAS_HEIGHT + 10) continue
    const [r, g, b] = lerp3(180, 160, 120, 220, 200, 170, p.colorShift)
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${p.brightness})`
    ctx.fill()
  }
}

function drawRingsFront(ctx: CanvasRenderingContext2D) {
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = SATURN_X + Math.cos(a) * p.dist
    const py = SATURN_Y + Math.sin(a) * p.dist * RING_TILT
    if (Math.sin(a) <= 0.1) continue
    if (px < -10 || px > CANVAS_WIDTH + 10 || py < -10 || py > CANVAS_HEIGHT + 10) continue
    const [r, g, b] = lerp3(180, 160, 120, 220, 200, 170, p.colorShift)
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${p.brightness * 0.8})`
    ctx.fill()
  }

  // Ring shadow on planet
  ctx.save()
  ctx.beginPath()
  ctx.arc(SATURN_X, SATURN_Y, SATURN_R, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.beginPath()
  ctx.ellipse(SATURN_X, SATURN_Y - 10, RING_OUTER, RING_OUTER * RING_TILT, 0, 0.4, Math.PI - 0.4)
  ctx.lineTo(SATURN_X + RING_OUTER, SATURN_Y - 10 - 8)
  ctx.ellipse(SATURN_X, SATURN_Y - 10 - 8, RING_OUTER, RING_OUTER * RING_TILT, 0, Math.PI - 0.4, 0.4, true)
  ctx.fill()
  ctx.restore()
}

function drawForegroundDebris(ctx: CanvasRenderingContext2D, dt: number) {
  for (const d of debris) {
    d.x -= d.speed * dt
    if (d.x < -20) d.x = CANVAS_WIDTH + 20 + Math.random() * 40

    const bob = Math.sin(simTime * 1.5 + d.x * 0.01) * 2
    ctx.beginPath()
    ctx.arc(d.x, d.y + bob, d.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(160,140,110,${d.brightness})`
    ctx.fill()

    if (d.size > 3) {
      ctx.beginPath()
      ctx.arc(d.x - d.size * 0.3, d.y + bob - d.size * 0.3, d.size * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(220,200,170,${d.brightness * 0.5})`
      ctx.fill()
    }
  }
}

function drawCookZone(ctx: CanvasRenderingContext2D) {
  // Dense ring plane gradient
  const zoneGrad = ctx.createLinearGradient(0, COOK_ZONE_Y - 30, 0, CANVAS_HEIGHT)
  zoneGrad.addColorStop(0, 'rgba(180,150,100,0)')
  zoneGrad.addColorStop(0.08, 'rgba(180,150,100,0.06)')
  zoneGrad.addColorStop(0.2, 'rgba(200,170,110,0.12)')
  zoneGrad.addColorStop(0.5, 'rgba(190,160,100,0.25)')
  zoneGrad.addColorStop(1, 'rgba(160,130,80,0.4)')
  ctx.fillStyle = zoneGrad
  ctx.fillRect(0, COOK_ZONE_Y - 30, CANVAS_WIDTH, CANVAS_HEIGHT - COOK_ZONE_Y + 30)

  // Dense particle band
  for (let i = 0; i < 80; i++) {
    const px = (i * 11.3 + simTime * 20) % (CANVAS_WIDTH + 40) - 20
    const py = COOK_ZONE_Y + 5 + Math.sin(i * 3.7) * 15 + ((i * 17) % 20)
    const size = 1 + ((i * 7) % 3)
    const alpha = 0.15 + ((i * 13) % 20) * 0.01
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(190,165,115,${alpha})`
    ctx.fill()
  }

  // Dashed warning line
  const cookPulse = 0.25 + 0.15 * Math.sin(simTime * 4)
  ctx.save()
  ctx.setLineDash([8, 6])
  ctx.strokeStyle = `rgba(220,160,60,${cookPulse})`
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, COOK_ZONE_Y)
  ctx.lineTo(CANVAS_WIDTH, COOK_ZONE_Y)
  ctx.stroke()
  ctx.restore()
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.25, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.7)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

// ─── Game element rendering ──────────────────────────────────────────────────

function drawShip(ctx: CanvasRenderingContext2D) {
  const { shipX: x, shipY: y } = props.minigame
  const hw = SHIP_HALF_WIDTH
  const hh = SHIP_HALF_HEIGHT

  const hoverOffset = Math.sin(simTime * 2.5) * 2.5
  const tilt = Math.max(-0.12, Math.min(0.12, props.minigame.shipVy * 0.0003))

  ctx.save()
  ctx.translate(x, y + hoverOffset)
  ctx.scale(props.minigame.shipFacing, 1)
  ctx.rotate(tilt)

  // Engine exhaust
  const speed = Math.sqrt(props.minigame.shipVx ** 2 + props.minigame.shipVy ** 2)
  if (speed > 5) {
    const flameLen = 10 + (speed / 400) * 20 + Math.random() * 6
    const flameGrad = ctx.createLinearGradient(-hw, 0, -hw - flameLen, 0)
    flameGrad.addColorStop(0, 'rgba(0, 200, 255, 0.8)')
    flameGrad.addColorStop(0.4, 'rgba(100, 180, 255, 0.4)')
    flameGrad.addColorStop(1, 'rgba(100, 180, 255, 0)')
    ctx.fillStyle = flameGrad
    ctx.beginPath()
    ctx.moveTo(-hw, -3)
    ctx.lineTo(-hw - flameLen, 0)
    ctx.lineTo(-hw, 3)
    ctx.closePath()
    ctx.fill()
  }

  // Fuselage
  ctx.fillStyle = '#c8c4be'
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(hw + 4, 0)
  ctx.lineTo(hw - 4, -hh * 0.5)
  ctx.lineTo(-hw + 6, -hh * 0.55)
  ctx.lineTo(-hw, -hh * 0.4)
  ctx.lineTo(-hw, hh * 0.4)
  ctx.lineTo(-hw + 6, hh * 0.55)
  ctx.lineTo(hw - 4, hh * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Thermal tiles
  ctx.fillStyle = '#2a2a2e'
  ctx.beginPath()
  ctx.moveTo(hw - 2, hh * 0.15)
  ctx.lineTo(-hw + 6, hh * 0.3)
  ctx.lineTo(-hw, hh * 0.4)
  ctx.lineTo(-hw, hh * 0.05)
  ctx.lineTo(-hw + 6, hh * 0.15)
  ctx.lineTo(hw - 2, hh * 0.05)
  ctx.closePath()
  ctx.fill()

  // Wing
  ctx.fillStyle = '#a8a4a0'
  ctx.strokeStyle = '#777'
  ctx.beginPath()
  ctx.moveTo(-4, hh * 0.4)
  ctx.lineTo(-hw + 2, hh + 6)
  ctx.lineTo(-hw, hh * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Vertical stabilizer
  ctx.fillStyle = '#b0aca8'
  ctx.beginPath()
  ctx.moveTo(-hw + 8, -hh * 0.55)
  ctx.lineTo(-hw, -hh - 6)
  ctx.lineTo(-hw - 2, -hh * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cockpit
  ctx.fillStyle = '#44aadd'
  ctx.globalAlpha = 0.7
  ctx.beginPath()
  ctx.ellipse(hw - 6, -1, 3, 2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1.0

  // Engine nozzles
  ctx.fillStyle = '#444'
  ctx.fillRect(-hw - 2, -3, 3, 2)
  ctx.fillRect(-hw - 2, 1, 3, 2)

  ctx.restore()
}

function drawIceChunks(ctx: CanvasRenderingContext2D) {
  for (const chunk of props.minigame.chunks) {
    if (chunk.shattered) continue
    ctx.save()
    ctx.translate(chunk.x, chunk.y)

    // Outer glow — icy blue
    ctx.globalAlpha = 0.2
    const glowGrad = ctx.createRadialGradient(0, 0, chunk.radius * 0.3, 0, 0, chunk.radius * 1.6)
    glowGrad.addColorStop(0, '#aaddff')
    glowGrad.addColorStop(1, '#aaddff00')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(0, 0, chunk.radius * 1.6, 0, Math.PI * 2)
    ctx.fill()

    // Body — irregular polygon for rocky feel
    ctx.globalAlpha = 0.85
    const r = chunk.radius
    const sides = chunk.size === 'small' ? 5 : chunk.size === 'medium' ? 6 : 8
    ctx.fillStyle = chunk.size === 'large' ? '#8ab4cc' : chunk.size === 'medium' ? '#9ac0d8' : '#b0d4e8'
    ctx.strokeStyle = '#cceeff'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides + chunk.y * 0.01 // pseudo-random rotation from y
      const wobble = 0.7 + ((i * 37 + Math.floor(chunk.y)) % 10) * 0.03 // deterministic wobble
      const px = Math.cos(angle) * r * wobble
      const py = Math.sin(angle) * r * wobble
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Specular highlight
    ctx.globalAlpha = 0.4
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(-r * 0.25, -r * 0.25, r * 0.2, r * 0.15, -0.3, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.restore()
  }
}

function drawShards(ctx: CanvasRenderingContext2D) {
  for (const shard of props.minigame.shards) {
    if (shard.collected) continue
    const fadeAlpha = Math.min(1, shard.ttl / 1.0) // fade in last second

    // Scintillation — sparkle effect
    const sparkle = 0.5 + 0.5 * Math.sin(simTime * 12 + shard.x * 0.5 + shard.y * 0.3)

    ctx.save()
    ctx.translate(shard.x, shard.y)
    ctx.globalAlpha = fadeAlpha * 0.6

    // Glow
    const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 10)
    glowGrad.addColorStop(0, `rgba(180, 220, 255, ${sparkle * 0.6})`)
    glowGrad.addColorStop(1, 'rgba(180, 220, 255, 0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, Math.PI * 2)
    ctx.fill()

    // Core
    ctx.globalAlpha = fadeAlpha * (0.6 + sparkle * 0.4)
    ctx.fillStyle = '#ddeeff'
    ctx.beginPath()
    ctx.arc(0, 0, 3, 0, Math.PI * 2)
    ctx.fill()

    // Bright center
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, 1.2, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 1
    ctx.restore()
  }
}

function drawHarpoon(ctx: CanvasRenderingContext2D) {
  const harpoon = props.minigame.harpoon
  if (!harpoon) return

  // Trail
  const trailLen = 6
  ctx.globalAlpha = 0.2
  ctx.strokeStyle = '#ffcc44'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(harpoon.x - harpoon.vx * 0.01 * trailLen, harpoon.y - harpoon.vy * 0.01 * trailLen)
  ctx.lineTo(harpoon.x, harpoon.y)
  ctx.stroke()
  ctx.globalAlpha = 1.0

  ctx.save()
  ctx.translate(harpoon.x, harpoon.y)

  // Rotate to face velocity direction
  const angle = Math.atan2(harpoon.vy, harpoon.vx)
  ctx.rotate(angle)

  // Harpoon body — elongated titanium shape
  ctx.fillStyle = '#c0c0c0'
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(12, 0) // tip
  ctx.lineTo(6, -2.5)
  ctx.lineTo(-8, -2)
  ctx.lineTo(-10, -3.5) // tail fins
  ctx.lineTo(-12, 0)
  ctx.lineTo(-10, 3.5)
  ctx.lineTo(-8, 2)
  ctx.lineTo(6, 2.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Bright tip
  ctx.fillStyle = '#ffdd88'
  ctx.beginPath()
  ctx.moveTo(12, 0)
  ctx.lineTo(8, -1.5)
  ctx.lineTo(8, 1.5)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawHUD(ctx: CanvasRenderingContext2D) {
  // ─── Hull HP bar (top-left) ────────────────────────────────────────────────
  const hpBarW = 160
  const hpBarH = 12
  const hpBarX = 20
  const hpBarY = 16

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH)

  const hpRatio = props.minigame.hullHp / HULL_MAX_HP
  const hpColor = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ffaa00' : '#ff3333'
  ctx.fillStyle = hpColor
  ctx.fillRect(hpBarX, hpBarY, hpBarW * hpRatio, hpBarH)

  ctx.strokeStyle = 'rgba(100, 200, 220, 0.3)'
  ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH)

  ctx.fillStyle = '#ffffff'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`HULL: ${props.minigame.hullHp}/${HULL_MAX_HP}`, hpBarX, hpBarY - 4)

  // ─── Harpoon cooldown indicator (top-left, below HP) ───────────────────────
  const cdRatio = props.minigame.harpoonCooldown / HARPOON_COOLDOWN
  const harpoonReady = cdRatio <= 0
  ctx.fillStyle = harpoonReady ? 'rgba(0, 204, 255, 0.5)' : 'rgba(100, 100, 100, 0.4)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(
    harpoonReady ? '[SPACE] FIRE HARPOON' : `HARPOON: ${(HARPOON_COOLDOWN - props.minigame.harpoonCooldown).toFixed(1)}s`,
    hpBarX, hpBarY + hpBarH + 14,
  )
  if (!harpoonReady) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.fillRect(hpBarX, hpBarY + hpBarH + 18, hpBarW * 0.6, 4)
    ctx.fillStyle = '#00ccff'
    ctx.fillRect(hpBarX, hpBarY + hpBarH + 18, hpBarW * 0.6 * (1 - cdRatio), 4)
  }

  // ─── Ice gauge (bottom) ────────────────────────────────────────────────────
  const barWidth = CANVAS_WIDTH - 100
  const barHeight = 16
  const barX = 50
  const barY = CANVAS_HEIGHT - 40

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(barX, barY, barWidth, barHeight)

  const fill = Math.min(props.minigame.iceCollected / props.minigame.targetIce, 1)
  ctx.fillStyle = fill >= 1 ? '#00ff88' : '#88ccff'
  ctx.fillRect(barX, barY, barWidth * fill, barHeight)

  ctx.strokeStyle = 'rgba(100, 200, 220, 0.4)'
  ctx.strokeRect(barX, barY, barWidth, barHeight)

  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `ICE: ${props.minigame.iceCollected.toFixed(1)} / ${props.minigame.targetIce}`,
    CANVAS_WIDTH / 2, barY - 6,
  )
}

function drawHeatWarning(ctx: CanvasRenderingContext2D) {
  const shipBottom = props.minigame.shipY + SHIP_HALF_HEIGHT
  const warningStart = COOK_ZONE_Y - HEAT_WARNING_OFFSET
  const heatRatio = props.minigame.heatTimer / COOK_ZONE_TOLERANCE

  if (shipBottom > warningStart || heatRatio > 0) {
    const proximity = Math.max(
      (shipBottom - warningStart) / HEAT_WARNING_OFFSET,
      heatRatio,
    )
    const intensity = Math.min(1, proximity) * 0.4

    const vigGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.25,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.6,
    )
    vigGrad.addColorStop(0, 'rgba(255, 0, 0, 0)')
    vigGrad.addColorStop(1, `rgba(255, 30, 0, ${intensity})`)
    ctx.fillStyle = vigGrad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    if (heatRatio > 0) {
      const flash = 0.1 + heatRatio * 0.25 * (0.5 + 0.5 * Math.sin(simTime * 12))
      ctx.fillStyle = `rgba(255, 50, 0, ${flash})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }
  }

  if (heatRatio > 0) {
    const barW = 120
    const barH = 6
    const barX = (CANVAS_WIDTH - barW) / 2
    const barY = 50
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(barX, barY, barW, barH)
    ctx.fillStyle = heatRatio > 0.7 ? '#ff2200' : '#ff6600'
    ctx.fillRect(barX, barY, barW * heatRatio, barH)
    ctx.strokeStyle = 'rgba(255, 100, 0, 0.5)'
    ctx.strokeRect(barX, barY, barW, barH)
    ctx.fillStyle = '#ff6600'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('DENSE RING PLANE — PULL UP', CANVAS_WIDTH / 2, barY - 4)
  }
}

function drawDamageFlash(ctx: CanvasRenderingContext2D) {
  if (props.minigame.damageFlash <= 0) return
  const alpha = props.minigame.damageFlash * 0.4
  ctx.fillStyle = `rgba(255, 100, 50, ${alpha})`
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = props.minigame.status === 'completed' ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'

  let msg: string
  if (props.minigame.status === 'completed') {
    msg = 'ICE HARVEST COMPLETE'
  } else if (props.minigame.hullHp <= 0) {
    msg = 'HULL DESTROYED — MISSION FAILED'
  } else {
    msg = 'RING PLANE COLLISION — MISSION FAILED'
  }
  ctx.fillText(msg, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
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
    updateInput()
    props.minigame.tick(dt, STUB_CTX)
  }

  // Screen shake on damage
  const shakeAmt = props.minigame.damageFlash * 6
  ctx.save()
  if (shakeAmt > 0) {
    ctx.translate((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt)
  }

  // Heat shake
  const heatRatio = props.minigame.heatTimer / COOK_ZONE_TOLERANCE
  if (heatRatio > 0) {
    ctx.translate((Math.random() - 0.5) * heatRatio * 8, (Math.random() - 0.5) * heatRatio * 8)
  }

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  drawBackground(ctx)
  drawStars(ctx)
  drawRingsBack(ctx)
  drawSaturn(ctx)
  drawRingsFront(ctx)
  drawCookZone(ctx)
  drawIceChunks(ctx)
  drawShards(ctx)
  drawHarpoon(ctx)
  drawShip(ctx)
  drawForegroundDebris(ctx, dt)
  drawVignette(ctx)
  drawHUD(ctx)
  drawHeatWarning(ctx)
  drawDamageFlash(ctx)

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
  drawRingsBack(ctx)
  drawSaturn(ctx)
  drawRingsFront(ctx)
  drawCookZone(ctx)
  drawVignette(ctx)
  drawShip(ctx)
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
          <div class="gas-collection-briefing__icon">💎</div>
          <h3 class="gas-collection-briefing__title">RING PLANE ICE FIELD</h3>
          <p class="gas-collection-briefing__text">
            Saturn's rings are shedding pristine ice — high-purity crystals perfect
            for cryo-lab experiments. But the ring debris is dense and moving fast.
          </p>
          <p class="gas-collection-briefing__text">
            Fire your titanium harpoon to shatter incoming ice chunks into collectible
            shards. Fly through the scintillating fragments to bank them before they
            evaporate. Watch your hull — unshattered rocks hit hard.
          </p>
          <div class="gas-collection-briefing__controls">
            <span><b>W A S D</b> — fly</span>
            <span><b>SPACE</b> — fire harpoon</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Hull: {{ minigame.hullMaxHp }} HP.
            Target: {{ minigame.targetIce }} ice units.
            Harpoon cooldown: {{ HARPOON_COOLDOWN }}s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            BEGIN HARVEST
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
