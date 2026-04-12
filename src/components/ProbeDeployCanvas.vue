<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ProbeDeployMiniGame } from '@/lib/minigame/probeDeploy/ProbeDeployMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLANET_X,
  PLANET_Y,
  PLANET_R,
  SHIP_X,
  SHIP_HALF_SIZE,
  HULL_MAX_HP,
} from '@/lib/minigame/probeDeploy/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  minigame: ProbeDeployMiniGame
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

const isMercury = props.minigame.planetId === 'mercury'

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: props.minigame.planetId,
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
  if (e.key === ' ') {
    e.preventDefault()
    props.minigame.launchProbe()
  }
}

function onKeyUp(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = false
}

function updateInput() {
  props.minigame.setInput({
    up: !!keys['w'] || !!keys['arrowup'],
    down: !!keys['s'] || !!keys['arrowdown'],
  })
}

// ─── Mercury scene constants ───────────────────────────────────────────────────

const MERCURY_SUN_X = -80
const MERCURY_SUN_Y = -120
const MERCURY_SUN_R = 320

// ─── Uranus scene constants ────────────────────────────────────────────────────

const URANUS_SUN_X = CANVAS_WIDTH * 0.9
const URANUS_SUN_Y = CANVAS_HEIGHT * 0.08
const URANUS_RING_TILT = 0.15

// ─── Pre-generated scene elements — Mercury ───────────────────────────────────

interface StarMercury {
  x: number; y: number; r: number; brightness: number
  twinkleSpeed: number; twinkleOffset: number
}
const mercuryStars: StarMercury[] = []
for (let i = 0; i < 90; i++) {
  mercuryStars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 0.9 + 0.2,
    brightness: Math.random() * 0.3 + 0.1,
    twinkleSpeed: Math.random() * 2 + 1,
    twinkleOffset: Math.random() * Math.PI * 2,
  })
}

interface SolarWindParticle {
  x: number; y: number; length: number; speed: number
  alpha: number; thickness: number; yDrift: number
}
const solarWind: SolarWindParticle[] = []
for (let i = 0; i < 60; i++) {
  solarWind.push({
    x: Math.random() * CANVAS_WIDTH * 1.5,
    y: Math.random() * CANVAS_HEIGHT * 0.7,
    length: 15 + Math.random() * 50,
    speed: 80 + Math.random() * 200,
    alpha: Math.random() * 0.12 + 0.03,
    thickness: Math.random() * 1.5 + 0.3,
    yDrift: (Math.random() - 0.3) * 20,
  })
}

interface Streamer {
  angle: number; length: number; width: number; alpha: number
  pulseSpeed: number; pulseOffset: number
}
const streamers: Streamer[] = []
for (let i = 0; i < 8; i++) {
  const angle = Math.PI * 0.15 + Math.random() * Math.PI * 0.55
  streamers.push({
    angle,
    length: 400 + Math.random() * 500,
    width: 0.03 + Math.random() * 0.06,
    alpha: 0.02 + Math.random() * 0.04,
    pulseSpeed: 0.5 + Math.random() * 1.5,
    pulseOffset: Math.random() * Math.PI * 2,
  })
}

// Craters stored as angular positions on the sphere (drawn with rotation offset)
interface Crater { angle: number; dist: number; r: number; depth: number }
const craters: Crater[] = []
for (let i = 0; i < 18; i++) {
  craters.push({
    angle: Math.random() * Math.PI * 2,
    dist: Math.random() * (PLANET_R - 10),
    r: 4 + Math.random() * 18,
    depth: Math.random() * 0.15 + 0.05,
  })
}

interface ShimmerPoint {
  angle: number; dist: number; phase: number; speed: number
  amplitude: number; size: number; alpha: number
}
const shimmerPoints: ShimmerPoint[] = []
for (let i = 0; i < 30; i++) {
  shimmerPoints.push({
    angle: Math.random() * Math.PI * 2,
    dist: PLANET_R - 5 + Math.random() * 8,
    phase: Math.random() * Math.PI * 2,
    speed: 1.5 + Math.random() * 2.5,
    amplitude: 1 + Math.random() * 3,
    size: 2 + Math.random() * 4,
    alpha: 0.06 + Math.random() * 0.1,
  })
}

// ─── Pre-generated scene elements — Uranus ────────────────────────────────────

interface StarUranus {
  x: number; y: number; r: number; brightness: number
  twinkleSpeed: number; twinkleOffset: number; hue: number
}
const uranusStars: StarUranus[] = []
for (let i = 0; i < 220; i++) {
  uranusStars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT,
    r: Math.random() * 1.1 + 0.2,
    brightness: Math.random() * 0.55 + 0.2,
    twinkleSpeed: Math.random() * 1.5 + 0.5,
    twinkleOffset: Math.random() * Math.PI * 2,
    hue: Math.random(),
  })
}

interface KuiperParticle {
  x: number; y: number; size: number; brightness: number; drift: number; twinkle: number
}
const kuiperParticles: KuiperParticle[] = []
for (let i = 0; i < 120; i++) {
  kuiperParticles.push({
    x: CANVAS_WIDTH * 0.3 + Math.random() * CANVAS_WIDTH * 0.75,
    y: CANVAS_HEIGHT * 0.15 + Math.random() * CANVAS_HEIGHT * 0.5,
    size: 0.5 + Math.random() * 2,
    brightness: 0.08 + Math.random() * 0.15,
    drift: 0.5 + Math.random() * 2,
    twinkle: Math.random() * Math.PI * 2,
  })
}

interface RingParticle { angle: number; dist: number; size: number; brightness: number; speed: number }
const ringParticles: RingParticle[] = []
for (let i = 0; i < 180; i++) {
  const angle = Math.random() * Math.PI * 2
  const dist = PLANET_R + 20 + Math.random() * 80
  ringParticles.push({
    angle,
    dist,
    size: 0.5 + Math.random() * 1.5,
    brightness: 0.1 + Math.random() * 0.15,
    speed: (0.01 + Math.random() * 0.015) / (dist * 0.003),
  })
}

interface IceCrystal {
  x: number; y: number; size: number; speed: number; alpha: number
  drift: number; sparkle: number; sparkleSpeed: number
}
const iceCrystals: IceCrystal[] = []
for (let i = 0; i < 50; i++) {
  iceCrystals.push({
    x: Math.random() * CANVAS_WIDTH * 1.3,
    y: CANVAS_HEIGHT * 0.3 + Math.random() * CANVAS_HEIGHT * 0.45,
    size: 1 + Math.random() * 2.5,
    speed: 3 + Math.random() * 12,
    alpha: 0.05 + Math.random() * 0.1,
    drift: (Math.random() - 0.5) * 4,
    sparkle: Math.random() * Math.PI * 2,
    sparkleSpeed: 2 + Math.random() * 4,
  })
}

// ─── Mercury background rendering ─────────────────────────────────────────────

function drawMercuryBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(
    MERCURY_SUN_X + 60, MERCURY_SUN_Y + 60, 50,
    MERCURY_SUN_X + 200, MERCURY_SUN_Y + 200, CANVAS_WIDTH * 1.2,
  )
  bg.addColorStop(0, '#4a3018')
  bg.addColorStop(0.15, '#2a1a10')
  bg.addColorStop(0.35, '#160e0a')
  bg.addColorStop(0.6, '#0a0808')
  bg.addColorStop(1, '#060506')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawMercurySunGlow(ctx: CanvasRenderingContext2D) {
  ctx.save()

  const corona1 = ctx.createRadialGradient(
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R * 0.8,
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R * 2.5,
  )
  corona1.addColorStop(0, 'rgba(255,220,140,0.25)')
  corona1.addColorStop(0.3, 'rgba(255,180,80,0.08)')
  corona1.addColorStop(0.6, 'rgba(255,140,40,0.02)')
  corona1.addColorStop(1, 'rgba(255,100,20,0)')
  ctx.fillStyle = corona1
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const pulse = Math.sin(simTime * 1.2) * 0.02 + 0.98
  const corona2 = ctx.createRadialGradient(
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R * 0.5,
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R * 1.5 * pulse,
  )
  corona2.addColorStop(0, 'rgba(255,240,200,0.4)')
  corona2.addColorStop(0.4, 'rgba(255,200,120,0.12)')
  corona2.addColorStop(0.7, 'rgba(255,160,60,0.03)')
  corona2.addColorStop(1, 'rgba(255,120,30,0)')
  ctx.fillStyle = corona2
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.beginPath()
  ctx.arc(MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R, 0, Math.PI * 2)
  const sunBody = ctx.createRadialGradient(
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R * 0.7,
    MERCURY_SUN_X, MERCURY_SUN_Y, MERCURY_SUN_R,
  )
  sunBody.addColorStop(0, 'rgba(255,250,230,0.9)')
  sunBody.addColorStop(0.6, 'rgba(255,230,170,0.8)')
  sunBody.addColorStop(0.85, 'rgba(255,200,100,0.6)')
  sunBody.addColorStop(1, 'rgba(255,160,50,0.2)')
  ctx.fillStyle = sunBody
  ctx.fill()
  ctx.restore()
}

function drawMercuryStreamers(ctx: CanvasRenderingContext2D) {
  ctx.save()
  for (const s of streamers) {
    const pulse = Math.sin(simTime * s.pulseSpeed + s.pulseOffset) * 0.3 + 0.7
    const alpha = s.alpha * pulse
    const sx = MERCURY_SUN_X + Math.cos(s.angle) * MERCURY_SUN_R * 0.9
    const sy = MERCURY_SUN_Y + Math.sin(s.angle) * MERCURY_SUN_R * 0.9
    const ex = MERCURY_SUN_X + Math.cos(s.angle) * s.length
    const ey = MERCURY_SUN_Y + Math.sin(s.angle) * s.length
    const grad = ctx.createLinearGradient(sx, sy, ex, ey)
    grad.addColorStop(0, `rgba(255,220,140,${alpha * 2})`)
    grad.addColorStop(0.3, `rgba(255,180,80,${alpha})`)
    grad.addColorStop(0.7, `rgba(255,140,40,${alpha * 0.3})`)
    grad.addColorStop(1, 'rgba(255,100,20,0)')
    ctx.strokeStyle = grad
    ctx.lineWidth = s.width * MERCURY_SUN_R
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(ex, ey)
    ctx.stroke()
  }
  ctx.restore()
}

function drawMercuryStars(ctx: CanvasRenderingContext2D) {
  for (const s of mercuryStars) {
    const dx = s.x - MERCURY_SUN_X
    const dy = s.y - MERCURY_SUN_Y
    const sunDist = Math.sqrt(dx * dx + dy * dy)
    const sunFade = Math.min(1, Math.max(0, (sunDist - MERCURY_SUN_R) / 400))
    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.brightness * twinkle * sunFade
    if (alpha < 0.02) continue
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(220,215,240,${alpha})`
    ctx.fill()
  }
}

function drawMercurySolarWind(ctx: CanvasRenderingContext2D, dt: number) {
  ctx.save()
  for (const p of solarWind) {
    p.x += p.speed * dt
    p.y += p.yDrift * dt
    if (p.x > CANVAS_WIDTH + 60) {
      p.x = -p.length - Math.random() * 100
      p.y = Math.random() * CANVAS_HEIGHT * 0.65
    }
    const angle = Math.atan2(p.yDrift, p.speed)
    const ex = p.x - Math.cos(angle) * p.length
    const ey = p.y - Math.sin(angle) * p.length
    const grad = ctx.createLinearGradient(p.x, p.y, ex, ey)
    grad.addColorStop(0, `rgba(255,200,100,${p.alpha})`)
    grad.addColorStop(0.5, `rgba(255,170,60,${p.alpha * 0.5})`)
    grad.addColorStop(1, 'rgba(255,140,30,0)')
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(p.x, p.y)
    ctx.strokeStyle = grad
    ctx.lineWidth = p.thickness
    ctx.stroke()
  }
  ctx.restore()
}

function drawMercuryPlanet(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, Math.PI * 2)
  ctx.clip()

  // Base scorched-gray gradient
  const pg = ctx.createRadialGradient(
    PLANET_X - PLANET_R * 0.3, PLANET_Y - PLANET_R * 0.3, PLANET_R * 0.1,
    PLANET_X, PLANET_Y, PLANET_R,
  )
  pg.addColorStop(0, '#a09080')
  pg.addColorStop(0.3, '#8a7568')
  pg.addColorStop(0.55, '#6e5c4a')
  pg.addColorStop(0.75, '#5a4a3a')
  pg.addColorStop(0.9, '#463a2e')
  pg.addColorStop(1, '#342a20')
  ctx.fillStyle = pg
  ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2)

  // Craters — rotated with planetRotation
  const rot = props.minigame.planetRotation
  for (const c of craters) {
    const a = c.angle + rot
    const cx = PLANET_X + Math.cos(a) * c.dist
    const cy = PLANET_Y + Math.sin(a) * c.dist
    // Only visible half (facing camera, check that x is roughly visible)
    const facingRatio = Math.cos(a)
    if (facingRatio < -0.1) continue
    const fade = Math.max(0, facingRatio)

    ctx.beginPath()
    ctx.arc(cx, cy, c.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,0,0,${c.depth * fade})`
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx - c.r * 0.2, cy - c.r * 0.2, c.r * 0.85, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(140,120,95,${c.depth * 0.6 * fade})`
    ctx.fill()

    ctx.beginPath()
    ctx.arc(cx + c.r * 0.15, cy + c.r * 0.15, c.r * 0.6, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,0,0,${c.depth * 0.8 * fade})`
    ctx.fill()
  }

  // Sun-facing highlight — left rim of planet
  const highlight = ctx.createLinearGradient(PLANET_X - PLANET_R, PLANET_Y, PLANET_X, PLANET_Y)
  highlight.addColorStop(0, 'rgba(255,200,130,0.18)')
  highlight.addColorStop(0.5, 'rgba(255,180,100,0.06)')
  highlight.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = highlight
  ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2)

  // Limb darkening
  const limb = ctx.createRadialGradient(
    PLANET_X - PLANET_R * 0.2, PLANET_Y - PLANET_R * 0.15, PLANET_R * 0.3,
    PLANET_X, PLANET_Y, PLANET_R,
  )
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.6, 'rgba(0,0,0,0.1)')
  limb.addColorStop(0.85, 'rgba(0,0,0,0.3)')
  limb.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = limb
  ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2)

  ctx.restore()

  // Atmospheric heat glow
  const glow = ctx.createRadialGradient(PLANET_X, PLANET_Y, PLANET_R - 5, PLANET_X, PLANET_Y, PLANET_R + 28)
  glow.addColorStop(0, 'rgba(255,160,60,0)')
  glow.addColorStop(0.4, 'rgba(255,140,40,0.04)')
  glow.addColorStop(0.7, 'rgba(255,120,30,0.02)')
  glow.addColorStop(1, 'rgba(255,100,20,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(PLANET_X, PLANET_Y, PLANET_R + 28, 0, Math.PI * 2)
  ctx.fill()
}

function drawMercuryHeatShimmer(ctx: CanvasRenderingContext2D) {
  ctx.save()
  const rot = props.minigame.planetRotation
  for (const s of shimmerPoints) {
    const a = s.angle + rot
    const px = PLANET_X + Math.cos(a) * s.dist + Math.sin(simTime * s.speed + s.phase) * s.amplitude
    const py = PLANET_Y + Math.sin(a) * s.dist + Math.cos(simTime * s.speed * 0.7 + s.phase) * s.amplitude * 0.5
    ctx.beginPath()
    ctx.arc(px, py, s.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,180,80,${s.alpha})`
    ctx.fill()
  }
  ctx.restore()
}

function drawMercuryHeatOverlay(ctx: CanvasRenderingContext2D) {
  const pulse = Math.sin(simTime * 0.8) * 0.01 + 0.02
  ctx.fillStyle = `rgba(255,100,20,${pulse})`
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawMercuryVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(
    CANVAS_WIDTH * 0.15, CANVAS_HEIGHT * 0.15, CANVAS_WIDTH * 0.15,
    CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.75,
  )
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.5, 'rgba(0,0,0,0.05)')
  vg.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

// ─── Uranus background rendering ──────────────────────────────────────────────

function drawUranusBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(
    PLANET_X - 150, PLANET_Y, 100,
    CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH,
  )
  bg.addColorStop(0, '#0a1218')
  bg.addColorStop(0.2, '#080e14')
  bg.addColorStop(0.5, '#060a10')
  bg.addColorStop(1, '#04060a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawUranusKuiperBelt(ctx: CanvasRenderingContext2D, dt: number) {
  ctx.save()

  const beltGlow = ctx.createLinearGradient(CANVAS_WIDTH * 0.35, CANVAS_HEIGHT * 0.2, CANVAS_WIDTH, CANVAS_HEIGHT * 0.45)
  beltGlow.addColorStop(0, 'rgba(80,100,130,0)')
  beltGlow.addColorStop(0.3, 'rgba(80,100,130,0.008)')
  beltGlow.addColorStop(0.5, 'rgba(90,110,140,0.012)')
  beltGlow.addColorStop(0.7, 'rgba(80,100,130,0.008)')
  beltGlow.addColorStop(1, 'rgba(80,100,130,0)')
  ctx.fillStyle = beltGlow
  ctx.fillRect(CANVAS_WIDTH * 0.3, CANVAS_HEIGHT * 0.1, CANVAS_WIDTH * 0.75, CANVAS_HEIGHT * 0.55)

  for (const k of kuiperParticles) {
    k.x -= k.drift * dt
    if (k.x < CANVAS_WIDTH * 0.25) k.x = CANVAS_WIDTH * 1.05 + Math.random() * 30

    const sparkle = Math.sin(simTime * 1.5 + k.twinkle) * 0.3 + 0.7
    const alpha = k.brightness * sparkle

    ctx.beginPath()
    ctx.arc(k.x, k.y, k.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(180,200,220,${alpha})`
    ctx.fill()

    if (k.size > 1.2 && sparkle > 0.85) {
      ctx.beginPath()
      ctx.arc(k.x, k.y, k.size * 1.8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(200,220,240,${alpha * 0.15})`
      ctx.fill()
    }
  }
  ctx.restore()
}

function drawUranusStars(ctx: CanvasRenderingContext2D) {
  for (const s of uranusStars) {
    const dx = s.x - PLANET_X
    const dy = s.y - PLANET_Y
    if (dx * dx + dy * dy < (PLANET_R + 10) * (PLANET_R + 10)) continue

    const twinkle = Math.sin(simTime * s.twinkleSpeed + s.twinkleOffset) * 0.3 + 0.7
    const alpha = s.brightness * twinkle
    if (alpha < 0.02) continue

    const r = s.hue > 0.8 ? 240 : s.hue > 0.6 ? 220 : 200
    const g = s.hue > 0.8 ? 210 : 215
    const b = s.hue > 0.5 ? 220 : 240

    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
    ctx.fill()
  }
}

function drawUranusSun(ctx: CanvasRenderingContext2D) {
  ctx.save()
  const glow = ctx.createRadialGradient(URANUS_SUN_X, URANUS_SUN_Y, 0, URANUS_SUN_X, URANUS_SUN_Y, 35)
  glow.addColorStop(0, 'rgba(255,250,235,0.4)')
  glow.addColorStop(0.15, 'rgba(255,240,200,0.1)')
  glow.addColorStop(0.4, 'rgba(255,220,170,0.02)')
  glow.addColorStop(1, 'rgba(255,200,140,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(URANUS_SUN_X, URANUS_SUN_Y, 35, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(URANUS_SUN_X, URANUS_SUN_Y, 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,250,235,0.9)'
  ctx.fill()
  ctx.restore()
}

function drawUranusPlanet(ctx: CanvasRenderingContext2D) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, Math.PI * 2)
  ctx.clip()

  const pg = ctx.createRadialGradient(
    PLANET_X + PLANET_R * 0.3, PLANET_Y - PLANET_R * 0.2, PLANET_R * 0.1,
    PLANET_X, PLANET_Y, PLANET_R,
  )
  pg.addColorStop(0, '#8ed4cc')
  pg.addColorStop(0.3, '#6dbfb8')
  pg.addColorStop(0.5, '#5aada8')
  pg.addColorStop(0.7, '#4a9a98')
  pg.addColorStop(0.9, '#3a8888')
  pg.addColorStop(1, '#2a6e70')
  ctx.fillStyle = pg
  ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2)

  // Very subtle horizontal bands — shift slightly with rotation for visual feedback
  const bandShift = (props.minigame.planetRotation * PLANET_R * 0.05) % (PLANET_R * 2 / 8)
  for (let i = 0; i < 8; i++) {
    const bandY = PLANET_Y - PLANET_R + ((PLANET_R * 2 / 8) * i + bandShift) % (PLANET_R * 2)
    const bandH = PLANET_R * 2 / 8
    const alpha = 0.015 + Math.sin(i * 2.1 + simTime * 0.1) * 0.005
    ctx.fillStyle = i % 2 === 0 ? `rgba(100,180,175,${alpha})` : `rgba(60,140,140,${alpha})`
    ctx.fillRect(PLANET_X - PLANET_R, bandY, PLANET_R * 2, bandH)
  }

  // Limb darkening
  const limb = ctx.createRadialGradient(
    PLANET_X + PLANET_R * 0.2, PLANET_Y - PLANET_R * 0.15, PLANET_R * 0.3,
    PLANET_X, PLANET_Y, PLANET_R,
  )
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.6, 'rgba(0,0,0,0.1)')
  limb.addColorStop(0.85, 'rgba(0,0,0,0.3)')
  limb.addColorStop(1, 'rgba(0,0,0,0.55)')
  ctx.fillStyle = limb
  ctx.fillRect(PLANET_X - PLANET_R, PLANET_Y - PLANET_R, PLANET_R * 2, PLANET_R * 2)

  ctx.restore()

  // Atmospheric glow
  const glow = ctx.createRadialGradient(PLANET_X, PLANET_Y, PLANET_R - 5, PLANET_X, PLANET_Y, PLANET_R + 30)
  glow.addColorStop(0, 'rgba(100,200,195,0)')
  glow.addColorStop(0.4, 'rgba(100,200,195,0.04)')
  glow.addColorStop(0.7, 'rgba(80,180,175,0.02)')
  glow.addColorStop(1, 'rgba(60,160,155,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(PLANET_X, PLANET_Y, PLANET_R + 30, 0, Math.PI * 2)
  ctx.fill()
}

function drawUranusRingsBack(ctx: CanvasRenderingContext2D) {
  ctx.save()
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = PLANET_X + Math.cos(a) * p.dist * URANUS_RING_TILT
    const py = PLANET_Y + Math.sin(a) * p.dist
    if (Math.cos(a) > 0.1) continue
    const dx = px - PLANET_X
    const dy = py - PLANET_Y
    if (dx * dx + dy * dy < PLANET_R * PLANET_R) continue
    if (px < -20 || px > CANVAS_WIDTH + 20 || py < -20 || py > CANVAS_HEIGHT + 20) continue
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,140,160,${p.brightness * 0.6})`
    ctx.fill()
  }
  ctx.restore()
}

function drawUranusRingsFront(ctx: CanvasRenderingContext2D) {
  ctx.save()
  for (const p of ringParticles) {
    const a = p.angle + simTime * p.speed
    const px = PLANET_X + Math.cos(a) * p.dist * URANUS_RING_TILT
    const py = PLANET_Y + Math.sin(a) * p.dist
    if (Math.cos(a) <= 0.1) continue
    if (px < -20 || px > CANVAS_WIDTH + 20 || py < -20 || py > CANVAS_HEIGHT + 20) continue
    ctx.beginPath()
    ctx.arc(px, py, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,140,160,${p.brightness * 0.5})`
    ctx.fill()
  }
  ctx.restore()
}

function drawUranusIceCrystals(ctx: CanvasRenderingContext2D, dt: number) {
  ctx.save()
  for (const ic of iceCrystals) {
    ic.x -= ic.speed * dt
    ic.y += ic.drift * dt
    if (ic.x < -15) {
      ic.x = CANVAS_WIDTH + 10 + Math.random() * 30
      ic.y = CANVAS_HEIGHT * 0.3 + Math.random() * CANVAS_HEIGHT * 0.45
    }

    const sparkle = Math.sin(simTime * ic.sparkleSpeed + ic.sparkle)
    const alpha = ic.alpha + (sparkle > 0.7 ? 0.08 : 0)

    ctx.beginPath()
    ctx.arc(ic.x, ic.y, ic.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(160,210,220,${alpha})`
    ctx.fill()

    if (sparkle > 0.9) {
      ctx.beginPath()
      ctx.moveTo(ic.x - ic.size * 2, ic.y)
      ctx.lineTo(ic.x + ic.size * 2, ic.y)
      ctx.moveTo(ic.x, ic.y - ic.size * 2)
      ctx.lineTo(ic.x, ic.y + ic.size * 2)
      ctx.strokeStyle = `rgba(200,235,240,${alpha * 0.6})`
      ctx.lineWidth = 0.5
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawUranusColdOverlay(ctx: CanvasRenderingContext2D) {
  const pulse = Math.sin(simTime * 0.3) * 0.003 + 0.008
  ctx.fillStyle = `rgba(60,140,150,${pulse})`
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawUranusVignette(ctx: CanvasRenderingContext2D) {
  const vg = ctx.createRadialGradient(
    CANVAS_WIDTH * 0.45, CANVAS_HEIGHT * 0.45, CANVAS_WIDTH * 0.2,
    CANVAS_WIDTH * 0.5, CANVAS_HEIGHT * 0.5, CANVAS_WIDTH * 0.72,
  )
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(0.6, 'rgba(0,0,0,0.12)')
  vg.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

// ─── Shared game element rendering ────────────────────────────────────────────

function drawTargets(ctx: CanvasRenderingContext2D) {
  const accentColor = isMercury ? '255,160,60' : '80,220,210'

  for (const target of props.minigame.targets) {
    if (target.hit) {
      // Filled checkmark circle for completed targets
      ctx.beginPath()
      ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2)
      ctx.fillStyle = isMercury ? 'rgba(255,140,30,0.35)' : 'rgba(60,200,190,0.35)'
      ctx.fill()
      ctx.strokeStyle = isMercury ? 'rgba(255,200,100,0.6)' : 'rgba(100,230,220,0.6)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Tick mark
      ctx.strokeStyle = isMercury ? 'rgba(255,220,120,0.9)' : 'rgba(150,240,230,0.9)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      const r = target.radius
      ctx.moveTo(target.x - r * 0.4, target.y)
      ctx.lineTo(target.x - r * 0.1, target.y + r * 0.35)
      ctx.lineTo(target.x + r * 0.45, target.y - r * 0.35)
      ctx.stroke()
      ctx.lineCap = 'butt'
      continue
    }

    // Determine if this target is on the ship-facing side (left half of planet)
    const angleFromPlanet = Math.atan2(target.y - PLANET_Y, target.x - PLANET_X)
    const facingShip = Math.cos(angleFromPlanet) < 0 // targets on left hemisphere face ship

    const pulse = Math.sin(simTime * 3 + target.pulseOffset) * 0.3 + 0.7
    const intensity = facingShip ? 1.0 : 0.35

    // Outer glow
    const glowR = target.radius * 2.2
    const glowGrad = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, glowR)
    glowGrad.addColorStop(0, `rgba(${accentColor},${0.25 * intensity * pulse})`)
    glowGrad.addColorStop(1, `rgba(${accentColor},0)`)
    ctx.beginPath()
    ctx.arc(target.x, target.y, glowR, 0, Math.PI * 2)
    ctx.fillStyle = glowGrad
    ctx.fill()

    // Ring
    ctx.beginPath()
    ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(${accentColor},${0.7 * intensity * pulse})`
    ctx.lineWidth = facingShip ? 2 : 1
    ctx.stroke()

    // Center dot
    ctx.beginPath()
    ctx.arc(target.x, target.y, target.radius * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(${accentColor},${0.6 * intensity * pulse})`
    ctx.fill()

    // Droppable label
    if (facingShip) {
      ctx.fillStyle = `rgba(${accentColor},${0.5 * pulse})`
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('◉', target.x, target.y - target.radius - 5)
    }
  }
}

function drawActiveProbe(ctx: CanvasRenderingContext2D) {
  const probe = props.minigame.activeProbe
  if (!probe) return

  const trailLength = 40
  const trailGrad = ctx.createLinearGradient(probe.x - trailLength, probe.y, probe.x, probe.y)
  if (isMercury) {
    trailGrad.addColorStop(0, 'rgba(255,180,60,0)')
    trailGrad.addColorStop(0.5, 'rgba(255,200,100,0.3)')
    trailGrad.addColorStop(1, 'rgba(255,220,140,0.7)')
  } else {
    trailGrad.addColorStop(0, 'rgba(60,200,210,0)')
    trailGrad.addColorStop(0.5, 'rgba(100,220,220,0.3)')
    trailGrad.addColorStop(1, 'rgba(160,240,240,0.7)')
  }

  ctx.beginPath()
  ctx.moveTo(probe.x - trailLength, probe.y)
  ctx.lineTo(probe.x, probe.y)
  ctx.strokeStyle = trailGrad
  ctx.lineWidth = 2
  ctx.stroke()

  // Probe tip
  ctx.save()
  ctx.translate(probe.x, probe.y)
  ctx.fillStyle = isMercury ? '#ffdd88' : '#aaeeff'
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.lineTo(4, -2)
  ctx.lineTo(-6, -2)
  ctx.lineTo(-8, 0)
  ctx.lineTo(-6, 2)
  ctx.lineTo(4, 2)
  ctx.closePath()
  ctx.fill()

  // Bright tip
  ctx.fillStyle = isMercury ? '#ffffff' : '#ddfeff'
  ctx.beginPath()
  ctx.moveTo(8, 0)
  ctx.lineTo(5, -1.5)
  ctx.lineTo(5, 1.5)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

function drawMeteoriteMercury(ctx: CanvasRenderingContext2D) {
  for (const m of props.minigame.meteorites) {
    ctx.save()
    ctx.translate(m.x, m.y)

    // Rocky dark body
    const sides = m.size === 'small' ? 5 : m.size === 'medium' ? 6 : 8
    const r = m.radius
    ctx.fillStyle = m.size === 'large' ? '#3a3025' : '#4a3e30'
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides
      const wobble = 0.7 + ((i * 37 + Math.floor(m.y)) % 10) * 0.03
      const px = Math.cos(angle) * r * wobble
      const py = Math.sin(angle) * r * wobble
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()

    // Sun-lit highlight (upper-left)
    ctx.fillStyle = 'rgba(180,140,80,0.5)'
    ctx.beginPath()
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  }
}

function drawMeteoriteUranus(ctx: CanvasRenderingContext2D) {
  for (const m of props.minigame.meteorites) {
    ctx.save()
    ctx.translate(m.x, m.y)

    const sides = m.size === 'small' ? 5 : m.size === 'medium' ? 6 : 8
    const r = m.radius

    // Icy blue-gray body
    ctx.fillStyle = m.size === 'large' ? '#2a3a45' : '#384855'
    ctx.strokeStyle = 'rgba(100,160,180,0.4)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides
      const wobble = 0.7 + ((i * 37 + Math.floor(m.y)) % 10) * 0.03
      const px = Math.cos(angle) * r * wobble
      const py = Math.sin(angle) * r * wobble
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Ice specular highlight
    ctx.fillStyle = 'rgba(180,220,240,0.45)'
    ctx.beginPath()
    ctx.arc(-r * 0.25, -r * 0.25, r * 0.3, 0, Math.PI * 2)
    ctx.fill()

    // Sparkle on larger ones
    if (m.size !== 'small' && Math.sin(simTime * 4 + m.y * 0.1) > 0.6) {
      ctx.strokeStyle = 'rgba(200,235,245,0.5)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(-r * 0.1, -r * 0.4)
      ctx.lineTo(-r * 0.1, r * 0.4)
      ctx.moveTo(-r * 0.4, -r * 0.1)
      ctx.lineTo(r * 0.4, -r * 0.1)
      ctx.stroke()
    }

    ctx.restore()
  }
}

function drawShip(ctx: CanvasRenderingContext2D) {
  // Blink on damage — skip alternating frames when damageFlash is active
  if (props.minigame.damageFlash > 0 && Math.floor(simTime * 14) % 2 === 0) return

  const x = SHIP_X
  const y = props.minigame.shipY
  // Use the same proportions as the Venus/gas-collection shuttle
  const hw = 24
  const hh = 12
  const bobOffset = Math.sin(simTime * 2.5) * 2.5
  const tilt = Math.max(-0.12, Math.min(0.12, props.minigame.shipVy * 0.0003))

  ctx.save()
  ctx.translate(x, y + bobOffset)
  ctx.rotate(tilt)

  // Engine exhaust glow (behind everything)
  const speed = Math.abs(props.minigame.shipVy)
  if (speed > 5) {
    const flameLen = 10 + (speed / 450) * 20 + Math.random() * 6
    const flameGrad = ctx.createLinearGradient(-hw, 0, -hw - flameLen, 0)
    if (isMercury) {
      flameGrad.addColorStop(0, 'rgba(255,180,60,0.8)')
      flameGrad.addColorStop(0.4, 'rgba(255,120,30,0.4)')
      flameGrad.addColorStop(1, 'rgba(255,80,10,0)')
    } else {
      flameGrad.addColorStop(0, 'rgba(0,200,255,0.8)')
      flameGrad.addColorStop(0.4, 'rgba(100,180,255,0.4)')
      flameGrad.addColorStop(1, 'rgba(100,180,255,0)')
    }
    ctx.fillStyle = flameGrad
    ctx.beginPath()
    ctx.moveTo(-hw, -3)
    ctx.lineTo(-hw - flameLen, 0)
    ctx.lineTo(-hw, 3)
    ctx.closePath()
    ctx.fill()
  }

  // Fuselage — elongated shuttle body (matches Venus canvas)
  ctx.fillStyle = '#c8c4be'
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(hw + 4, 0)                 // nose tip
  ctx.lineTo(hw - 4, -hh * 0.5)         // upper nose curve
  ctx.lineTo(-hw + 6, -hh * 0.55)       // upper body
  ctx.lineTo(-hw, -hh * 0.4)            // rear top
  ctx.lineTo(-hw, hh * 0.4)             // rear bottom
  ctx.lineTo(-hw + 6, hh * 0.55)        // lower body
  ctx.lineTo(hw - 4, hh * 0.5)          // lower nose curve
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Thermal tile pattern — darker belly
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

  // Wing — swept delta
  ctx.fillStyle = '#a8a4a0'
  ctx.strokeStyle = '#777'
  ctx.beginPath()
  ctx.moveTo(-4, hh * 0.4)
  ctx.lineTo(-hw + 2, hh + 6)
  ctx.lineTo(-hw, hh * 0.5)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Vertical stabilizer (top fin)
  ctx.fillStyle = '#b0aca8'
  ctx.beginPath()
  ctx.moveTo(-hw + 8, -hh * 0.55)
  ctx.lineTo(-hw, -hh - 6)
  ctx.lineTo(-hw - 2, -hh * 0.4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  // Cockpit window
  ctx.fillStyle = isMercury ? '#cc8822' : '#44aadd'
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

function drawHUD(ctx: CanvasRenderingContext2D) {
  const hudColor = isMercury ? 'rgba(180,130,80,0.95)' : 'rgba(80,220,210,0.9)'
  const hudDim = isMercury ? 'rgba(140,100,60,0.6)' : 'rgba(60,180,170,0.5)'

  // ─── Top-left info ────────────────────────────────────────────────────────
  ctx.font = '11px monospace'
  ctx.textAlign = 'left'

  ctx.fillStyle = hudColor
  const probeHit = props.minigame.progressCurrent
  const probeTotal = props.minigame.progressTotal
  ctx.fillText(
    `PROBES: ${props.minigame.probesRemaining} / ${props.minigame.probeCount}`,
    20, 20,
  )
  ctx.fillText(`TARGETS: ${probeHit} / ${probeTotal}`, 20, 36)

  // Timer
  const t = props.minigame.timeRemaining
  const mins = Math.floor(t / 60)
  const secs = Math.floor(t % 60)
  const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`
  const timerColor = t < 10 ? '#ff4444' : t < 20 ? '#ffaa00' : hudColor
  ctx.fillStyle = timerColor
  ctx.fillText(`TIME: ${timerStr}`, 20, 52)

  // Probe cooldown hint
  if (props.minigame.probeCooldown > 0) {
    ctx.fillStyle = hudDim
    ctx.fillText(`COOLDOWN: ${props.minigame.probeCooldown.toFixed(1)}s`, 20, 68)
  } else if (props.minigame.activeProbe === null && props.minigame.probesRemaining > 0) {
    ctx.fillStyle = hudColor
    ctx.fillText('[SPACE] LAUNCH PROBE', 20, 68)
  }

  // ─── Hull HP bar (top-right) ──────────────────────────────────────────────
  const hpBarW = 140
  const hpBarH = 10
  const hpBarX = CANVAS_WIDTH - hpBarW - 20
  const hpBarY = 14

  ctx.fillStyle = 'rgba(0,0,0,0.5)'
  ctx.fillRect(hpBarX, hpBarY, hpBarW, hpBarH)

  const hpRatio = props.minigame.hullHp / HULL_MAX_HP
  const hpColor = hpRatio > 0.5 ? '#00cc66' : hpRatio > 0.25 ? '#ffaa00' : '#ff3333'
  ctx.fillStyle = hpColor
  ctx.fillRect(hpBarX, hpBarY, hpBarW * hpRatio, hpBarH)

  ctx.strokeStyle = isMercury ? 'rgba(255,160,60,0.4)' : 'rgba(100,200,220,0.3)'
  ctx.strokeRect(hpBarX, hpBarY, hpBarW, hpBarH)

  ctx.fillStyle = hudColor
  ctx.font = '10px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`HULL: ${props.minigame.hullHp}/${HULL_MAX_HP}`, CANVAS_WIDTH - 20, hpBarY - 3)
}

function drawDamageFlash(ctx: CanvasRenderingContext2D) {
  if (props.minigame.damageFlash <= 0) return
  const alpha = props.minigame.damageFlash * 0.45
  ctx.fillStyle = isMercury
    ? `rgba(255,80,0,${alpha})`
    : `rgba(0,180,200,${alpha * 0.7})`
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const success = props.minigame.status === 'completed'
  ctx.fillStyle = success ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'

  let msg: string
  if (success) {
    msg = isMercury ? 'MERCURY PROBE DEPLOYMENT COMPLETE' : 'URANUS PROBE DEPLOYMENT COMPLETE'
  } else if (props.minigame.hullHp <= 0) {
    msg = 'HULL DESTROYED — MISSION FAILED'
  } else if (props.minigame.timeRemaining <= 0) {
    msg = 'TIME EXPIRED — MISSION FAILED'
  } else {
    msg = 'PROBES EXHAUSTED — MISSION FAILED'
  }
  ctx.fillText(msg, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
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

  if (isMercury) {
    drawMercuryBackground(ctx)
    drawMercurySunGlow(ctx)
    drawMercuryStreamers(ctx)
    drawMercuryStars(ctx)
    drawMercurySolarWind(ctx, dt)
    drawMercuryPlanet(ctx)
    drawMercuryHeatShimmer(ctx)
    drawTargets(ctx)
    drawMeteoriteMercury(ctx)
    drawActiveProbe(ctx)
    drawShip(ctx)
    drawMercuryHeatOverlay(ctx)
    drawMercuryVignette(ctx)
  } else {
    drawUranusBackground(ctx)
    drawUranusKuiperBelt(ctx, dt)
    drawUranusStars(ctx)
    drawUranusSun(ctx)
    drawUranusRingsBack(ctx)
    drawUranusPlanet(ctx)
    drawUranusRingsFront(ctx)
    drawUranusIceCrystals(ctx, dt)
    drawTargets(ctx)
    drawMeteoriteUranus(ctx)
    drawActiveProbe(ctx)
    drawShip(ctx)
    drawUranusColdOverlay(ctx)
    drawUranusVignette(ctx)
  }

  drawHUD(ctx)
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

  if (isMercury) {
    drawMercuryBackground(ctx)
    drawMercurySunGlow(ctx)
    drawMercuryStreamers(ctx)
    drawMercuryStars(ctx)
    drawMercuryPlanet(ctx)
    drawMercuryVignette(ctx)
    drawShip(ctx)
  } else {
    drawUranusBackground(ctx)
    drawUranusStars(ctx)
    drawUranusSun(ctx)
    drawUranusRingsBack(ctx)
    drawUranusPlanet(ctx)
    drawUranusRingsFront(ctx)
    drawUranusVignette(ctx)
    drawShip(ctx)
  }
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
          <div class="gas-collection-briefing__icon">{{ isMercury ? '🔥' : '❄️' }}</div>
          <h3 class="gas-collection-briefing__title">
            {{ isMercury ? 'MERCURY PROBE DEPLOYMENT' : 'URANUS PROBE DEPLOYMENT' }}
          </h3>
          <p class="gas-collection-briefing__text">
            <template v-if="isMercury">
              The sun-scorched surface of Mercury holds vital geological data. Deploy
              surface probes to marked landing zones as the planet rotates — but watch out
              for solar wind fragments blazing through the orbital lane.
            </template>
            <template v-else>
              The ice giant Uranus holds critical magnetic field data in its atmosphere.
              Align your orbital path with the designated surface zones and launch probes
              before the timer expires. Avoid the icy debris drifting through the rings.
            </template>
          </p>
          <div class="gas-collection-briefing__controls">
            <span><b>W / S</b> — move up / down</span>
            <span><b>↑ / ↓</b> — move up / down</span>
            <span><b>SPACE</b> — deploy probe</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Hull: {{ minigame.hullMaxHp }} HP.
            Probes: {{ minigame.probeCount }}.
            Targets: {{ minigame.targetCount }}.
            Time: {{ minigame.timeTotal }}s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            {{ isMercury ? 'BEGIN DEPLOYMENT' : 'INITIATE DEPLOYMENT' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
