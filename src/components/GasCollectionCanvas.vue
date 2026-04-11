<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { GasCollectionMiniGame } from '@/lib/minigame/gasCollection/GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
  COOK_ZONE_Y,
  HEAT_WARNING_OFFSET,
  COOK_ZONE_TOLERANCE,
} from '@/lib/minigame/gasCollection/constants'
import type { OrbitalMiniGameContext } from '@/lib/minigame/OrbitalMiniGame'
import { getGasCollectionTheme } from '@/lib/minigame/gasCollection/theme'

const props = defineProps<{
  minigame: GasCollectionMiniGame
  planetId?: string
}>()

const theme = computed(() => getGasCollectionTheme(props.planetId ?? 'venus'))

const emit = defineEmits<{
  complete: []
  fail: []
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const briefingVisible = ref(false)
let animId = 0
let lastTime = 0
let bgOffset = 0
let simTime = 0

const STUB_CTX: OrbitalMiniGameContext = {
  shipPosition: { x: 0, y: 0, z: 0 },
  orbitState: 'orbiting',
  orbitedPlanetId: null,
  distanceToPlanet: null,
}

const keys: Record<string, boolean> = {}

function onKeyDown(e: KeyboardEvent) {
  keys[e.key.toLowerCase()] = true
  if (e.key.toLowerCase() === 'q') {
    props.minigame.launchDrone()
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

/** Pre-generated star positions (seeded once). */
const stars: { x: number; y: number; r: number; bright: number }[] = []
for (let i = 0; i < 60; i++) {
  stars.push({
    x: Math.random() * CANVAS_WIDTH,
    y: Math.random() * CANVAS_HEIGHT * 0.55,
    r: 0.4 + Math.random() * 1.2,
    bright: 0.3 + Math.random() * 0.7,
  })
}

/** Planet surface Y — curved horizon near the bottom. */
const PLANET_HORIZON_Y = CANVAS_HEIGHT * 0.72

/** Wind/atmosphere particles — spawn at left, drift right. */
interface WindParticle { x: number; y: number; speed: number; alpha: number; len: number }
const windParticles: WindParticle[] = []
const MAX_WIND_PARTICLES = 30

function spawnWindParticle() {
  windParticles.push({
    x: -20,
    y: PLANET_HORIZON_Y - 40 + Math.random() * (CANVAS_HEIGHT - PLANET_HORIZON_Y + 60),
    speed: 180 + Math.random() * 220,
    alpha: 0.06 + Math.random() * 0.14,
    len: 30 + Math.random() * 60,
  })
}

/** Planet surface scroll offset — drives the "orbiting" motion. */
let planetScrollX = 0

/** Simple hash for pseudo-random noise in the banded renderer. */
function hash(n: number): number {
  return ((Math.sin(n) * 43758.5453123) % 1 + 1) % 1
}

/** 2D value noise — cheap approximation of the GLSL noise3D. */
function noise2D(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n = ix + iy * 57
  const a = hash(n)
  const b = hash(n + 1)
  const c = hash(n + 57)
  const d = hash(n + 58)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/** 2-octave fbm for cheap turbulence. */
function fbm2(x: number, y: number): number {
  return noise2D(x, y) * 0.5 + noise2D(x * 2, y * 2) * 0.25
}

/** Flat cloud bands — simple parallax rectangles (Venus-style). */
function drawFlatBands(ctx: CanvasRenderingContext2D, t: ReturnType<typeof getGasCollectionTheme>) {
  for (let i = 0; i < 10; i++) {
    const bandY = PLANET_HORIZON_Y + 5 + i * 24
    const speed = 60 + i * 25
    const scrollWrap = CANVAS_WIDTH * 2
    const offset = (planetScrollX * speed / 80) % scrollWrap
    const thickness = 10 + i * 5
    const alpha = 0.1 + (i % 3) * 0.05

    ctx.globalAlpha = alpha
    ctx.fillStyle = t.cloudBands[i % 3]!
    ctx.fillRect(offset - scrollWrap, bandY, CANVAS_WIDTH * 3, thickness)

    if (i % 2 === 0) {
      ctx.globalAlpha = alpha * 0.5
      for (let wx = 0; wx < CANVAS_WIDTH; wx += 40) {
        const waveY = bandY + Math.sin((wx + planetScrollX * speed / 80) * 0.03) * 6
        ctx.fillRect(wx, waveY, 30, thickness * 0.4)
      }
    }
  }
}

/** Pre-parsed RGB triplet for fast lerp. */
type RGB = [number, number, number]

/** Parse a hex color to [r,g,b]. */
function parseHex(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Lerp two pre-parsed RGB colors, return CSS string. */
function lerpRGB(a: RGB, b: RGB, t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

/** Cached parsed band colors per theme (avoids re-parsing every frame). */
let cachedBandRGB: RGB[] | null = null
let cachedBandSrc: string | null = null

function getBandRGB(bands: [string, string, string]): RGB[] {
  const key = bands[0]
  if (cachedBandSrc === key && cachedBandRGB) return cachedBandRGB
  cachedBandRGB = bands.map(parseHex)
  cachedBandSrc = key
  return cachedBandRGB
}

/** Gas giant banded surface — sine-wave bands with turbulence, mirroring the GLSL shader logic. */
function drawBandedSurface(ctx: CanvasRenderingContext2D, t: ReturnType<typeof getGasCollectionTheme>) {
  const surfaceHeight = CANVAS_HEIGHT - PLANET_HORIZON_Y
  const step = 8 // px per scanline tile
  const rgb = getBandRGB(t.cloudBands)
  const scroll = planetScrollX * 0.006

  for (let row = 0; row < surfaceHeight; row += step) {
    const y = PLANET_HORIZON_Y + row
    const lat = row / surfaceHeight

    // Multi-frequency sine bands — mirrors the GLSL: sin(lat*15), sin(lat*25), sin(lat*40)
    const band =
      (Math.sin(lat * 15 * Math.PI + scroll) * 0.5 + 0.5) * 0.5 +
      (Math.sin(lat * 25 * Math.PI - scroll * 0.5) * 0.25 + 0.25) * 0.5 +
      (Math.sin(lat * 40 * Math.PI + scroll * 0.3) * 0.125 + 0.125) * 0.5

    // Turbulence distortion
    const turb = fbm2(lat * 5 + scroll * 0.2, simTime * 0.08) * 0.15
    const bandVal = Math.max(0, Math.min(1, band + turb))

    // Map band value to a pair of adjacent colors
    const colorIdx = bandVal * 2
    const ci = Math.min(1, Math.floor(colorIdx))
    const baseRGB = rgb[ci]!
    const nextRGB = rgb[ci + 1]!
    const lerp = colorIdx - ci

    ctx.globalAlpha = 0.2 + bandVal * 0.15
    for (let col = 0; col < CANVAS_WIDTH; col += step) {
      const colNoise = fbm2(col * 0.01 + scroll, lat * 8 + simTime * 0.05) * 0.3
      const localVal = Math.max(0, Math.min(1, lerp + colNoise))
      ctx.fillStyle = lerpRGB(baseRGB, nextRGB, localVal)
      ctx.fillRect(col, y, step, step)
    }
  }
}

/** Pre-generated terrain features for 'terrain' style surfaces. */
const terrainRocks: { x: number; y: number; w: number; h: number; shade: number }[] = []
const terrainCraters: { x: number; y: number; r: number; depth: number }[] = []
let terrainInited = false

function initTerrain() {
  if (terrainInited) return
  terrainInited = true
  for (let i = 0; i < 25; i++) {
    terrainRocks.push({
      x: Math.random() * CANVAS_WIDTH,
      y: PLANET_HORIZON_Y + 15 + Math.random() * (CANVAS_HEIGHT - PLANET_HORIZON_Y - 25),
      w: 3 + Math.random() * 14,
      h: 2 + Math.random() * 8,
      shade: Math.random() * 0.12 + 0.02,
    })
  }
  for (let i = 0; i < 10; i++) {
    terrainCraters.push({
      x: Math.random() * CANVAS_WIDTH,
      y: PLANET_HORIZON_Y + 25 + Math.random() * (CANVAS_HEIGHT - PLANET_HORIZON_Y - 35),
      r: 6 + Math.random() * 18,
      depth: Math.random() * 0.08 + 0.03,
    })
  }
}

/** Rocky terrain surface — mesas, craters, rocks, dust bands (Mars-style). */
function drawTerrainSurface(ctx: CanvasRenderingContext2D, t: ReturnType<typeof getGasCollectionTheme>) {
  initTerrain()

  // Sun-lit highlight from upper right
  const highlight = ctx.createLinearGradient(CANVAS_WIDTH, 0, CANVAS_WIDTH * 0.4, 0)
  highlight.addColorStop(0, 'rgba(220,140,80,0.1)')
  highlight.addColorStop(0.4, 'rgba(200,120,60,0.04)')
  highlight.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = highlight
  ctx.fillRect(0, PLANET_HORIZON_Y - 70, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Mesa silhouettes on the horizon
  if (t.mesas) {
    for (const m of t.mesas) {
      const mx = CANVAS_WIDTH * m.xFrac
      const curveFactor = 1 - Math.pow((m.xFrac - 0.5) * 2, 2)
      const baseY = PLANET_HORIZON_Y - 55 + 70 * (1 - curveFactor) - 5

      ctx.beginPath()
      ctx.moveTo(mx - m.width / 2, baseY)
      ctx.lineTo(mx - m.flatTop / 2, baseY - m.height)
      ctx.lineTo(mx + m.flatTop / 2, baseY - m.height)
      ctx.lineTo(mx + m.width / 2, baseY)
      ctx.closePath()
      ctx.fillStyle = t.surface.shadow + 'b3' // 70% alpha
      ctx.fill()
    }
  }

  // Craters
  for (const c of terrainCraters) {
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,0,0,${c.depth})`
    ctx.fill()

    ctx.beginPath()
    ctx.arc(c.x + c.r * 0.15, c.y - c.r * 0.15, c.r * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,65,40,${c.depth * 0.5})`
    ctx.fill()
  }

  // Rocks
  for (const r of terrainRocks) {
    ctx.beginPath()
    ctx.ellipse(r.x, r.y, r.w / 2, r.h / 2, 0, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(50,25,15,${r.shade + 0.1})`
    ctx.fill()

    ctx.beginPath()
    ctx.ellipse(r.x + 1, r.y - 1, r.w / 2 - 1, r.h / 2 - 1, 0, Math.PI, Math.PI * 2)
    ctx.fillStyle = `rgba(160,90,55,${r.shade})`
    ctx.fill()
  }

  // Dust bands — horizontal streaks blowing across
  const dustColor = t.dustColor ?? t.windColor
  for (let i = 0; i < 8; i++) {
    const bandY = PLANET_HORIZON_Y * 0.6 + (i / 8) * PLANET_HORIZON_Y * 0.35
    const speed = 20 + i * 8
    const bandLen = CANVAS_WIDTH * 0.4 + (i % 3) * CANVAS_WIDTH * 0.2
    const xOff = (simTime * speed + i * 200) % (CANVAS_WIDTH + bandLen) - bandLen * 0.5
    const alpha = 0.02 + (i % 3) * 0.015
    const bandH = 3 + (i % 4) * 3

    const grad = ctx.createLinearGradient(xOff, 0, xOff + bandLen, 0)
    grad.addColorStop(0, `${dustColor}00`)
    grad.addColorStop(0.2, dustColor + Math.round(alpha * 255).toString(16).padStart(2, '0'))
    grad.addColorStop(0.5, dustColor + Math.round(alpha * 1.2 * 255).toString(16).padStart(2, '0'))
    grad.addColorStop(0.8, dustColor + Math.round(alpha * 255).toString(16).padStart(2, '0'))
    grad.addColorStop(1, `${dustColor}00`)
    ctx.fillStyle = grad
    ctx.fillRect(xOff, bandY - bandH / 2, bandLen, bandH)
  }
}

function drawBackground(ctx: CanvasRenderingContext2D, dt: number) {
  bgOffset += dt * 80
  simTime += dt
  planetScrollX += dt * 100

  const t = theme.value

  // Deep space gradient — transitions into planet atmosphere
  const spaceGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  spaceGrad.addColorStop(0, t.sky.space)
  spaceGrad.addColorStop(0.4, t.sky.upperMid)
  spaceGrad.addColorStop(0.6, t.sky.lowerMid)
  spaceGrad.addColorStop(0.72, t.sky.horizon)
  spaceGrad.addColorStop(1.0, t.sky.dense)
  ctx.fillStyle = spaceGrad
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Stars (upper portion only — above the atmosphere)
  for (const star of stars) {
    const twinkle = star.bright * (0.6 + 0.4 * Math.sin(simTime * 2 + star.x))
    ctx.globalAlpha = twinkle
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1.0

  // Planet curvature — large ellipse at the bottom representing the atmosphere edge
  const curveRadius = CANVAS_WIDTH * 1.8
  const curveCenterY = PLANET_HORIZON_Y + curveRadius - 60
  const planetGrad = ctx.createRadialGradient(
    CANVAS_WIDTH / 2, curveCenterY, curveRadius - 120,
    CANVAS_WIDTH / 2, curveCenterY, curveRadius + 40,
  )
  planetGrad.addColorStop(0, t.surface.bright)
  planetGrad.addColorStop(0.4, t.surface.mid)
  planetGrad.addColorStop(0.7, t.surface.dark)
  planetGrad.addColorStop(1.0, t.surface.shadow)
  ctx.fillStyle = planetGrad
  ctx.beginPath()
  ctx.arc(CANVAS_WIDTH / 2, curveCenterY, curveRadius, 0, Math.PI * 2)
  ctx.fill()

  // Scrolling cloud bands on the planet surface
  ctx.save()
  ctx.beginPath()
  ctx.arc(CANVAS_WIDTH / 2, curveCenterY, curveRadius, 0, Math.PI * 2)
  ctx.clip()

  if (t.surfaceStyle === 'banded') {
    // Gas giant — sine-wave bands at multiple frequencies with turbulence
    drawBandedSurface(ctx, t)
  } else if (t.surfaceStyle === 'terrain') {
    // Rocky terrain — mesas, craters, dust (Mars-style)
    drawTerrainSurface(ctx, t)
  } else {
    // Flat cloud bands (Venus-style)
    drawFlatBands(ctx, t)
  }
  // Surface features (e.g. Great Red Spot) — scroll with the cloud bands
  if (t.surfaceFeatures) {
    const scrollWrap = CANVAS_WIDTH * 2
    const featSpeed = 30 // slow drift — much slower than the cloud bands
    for (const feat of t.surfaceFeatures) {
      const featX = ((feat.scrollPhase * scrollWrap + planetScrollX * featSpeed / 80) % scrollWrap) - scrollWrap * 0.25
      const featY = PLANET_HORIZON_Y + feat.yOffset

      // Only draw when on-screen (with generous margin)
      if (featX > -feat.radiusX * 2 && featX < CANVAS_WIDTH + feat.radiusX * 2) {
        ctx.save()
        ctx.translate(featX, featY)

        // Outer halo — feathered glow, blends into the surface color
        ctx.globalAlpha = 0.2
        const haloGrad = ctx.createRadialGradient(0, 0, feat.radiusX * 0.3, 0, 0, feat.radiusX * 1.6)
        haloGrad.addColorStop(0, feat.outerColor)
        haloGrad.addColorStop(0.6, feat.outerColor + '40')
        haloGrad.addColorStop(1, feat.outerColor + '00')
        ctx.fillStyle = haloGrad
        ctx.beginPath()
        ctx.ellipse(0, 0, feat.radiusX * 1.6, feat.radiusY * 1.6, 0, 0, Math.PI * 2)
        ctx.fill()

        // Main storm body — soft elliptical gradient with long feather
        ctx.globalAlpha = 0.6
        const spotGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, feat.radiusX)
        spotGrad.addColorStop(0, feat.coreColor)
        spotGrad.addColorStop(0.35, feat.midColor)
        spotGrad.addColorStop(0.65, feat.outerColor)
        spotGrad.addColorStop(0.85, feat.outerColor + '60')
        spotGrad.addColorStop(1, feat.outerColor + '00')
        ctx.fillStyle = spotGrad
        ctx.beginPath()
        ctx.ellipse(0, 0, feat.radiusX, feat.radiusY, 0, 0, Math.PI * 2)
        ctx.fill()

        // Swirl arcs — concentric elliptical strokes that rotate slowly
        const swirlAngle = simTime * feat.swirlSpeed
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = feat.coreColor + 'aa'
        ctx.lineWidth = 1.5
        for (let ring = 0; ring < 4; ring++) {
          const ringScale = 0.25 + ring * 0.16
          const arcStart = swirlAngle + ring * 1.2
          ctx.beginPath()
          ctx.ellipse(0, 0, feat.radiusX * ringScale, feat.radiusY * ringScale, swirlAngle * 0.3 + ring * 0.4, arcStart, arcStart + 2.5)
          ctx.stroke()
        }

        // Bright eye at the center
        ctx.globalAlpha = 0.4
        const eyeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, feat.radiusX * 0.18)
        eyeGrad.addColorStop(0, '#e8a090')
        eyeGrad.addColorStop(0.6, feat.coreColor)
        eyeGrad.addColorStop(1, feat.coreColor + '00')
        ctx.fillStyle = eyeGrad
        ctx.beginPath()
        ctx.ellipse(0, 0, feat.radiusX * 0.18, feat.radiusY * 0.18, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.restore()
      }
    }
  }

  ctx.restore()
  ctx.globalAlpha = 1.0

  // Atmospheric glow along the horizon — thin bright line
  const gt = t.glowTint
  const glowGrad = ctx.createLinearGradient(0, PLANET_HORIZON_Y - 25, 0, PLANET_HORIZON_Y + 20)
  glowGrad.addColorStop(0, gt.replace('rgb', 'rgba').replace(')', ', 0)'))
  glowGrad.addColorStop(0.3, gt.replace('rgb', 'rgba').replace(')', ', 0.3)'))
  glowGrad.addColorStop(0.5, gt.replace('rgb', 'rgba').replace(')', ', 0.2)'))
  glowGrad.addColorStop(0.7, gt.replace('rgb', 'rgba').replace(')', ', 0.1)'))
  glowGrad.addColorStop(1, gt.replace('rgb', 'rgba').replace(')', ', 0)'))
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, PLANET_HORIZON_Y - 25, CANVAS_WIDTH, 45)

  // Wind particles — horizontal streaks drifting left to right
  if (windParticles.length < MAX_WIND_PARTICLES && Math.random() < dt * 8) {
    spawnWindParticle()
  }
  for (let i = windParticles.length - 1; i >= 0; i--) {
    const p = windParticles[i]!
    p.x += p.speed * dt
    if (p.x > CANVAS_WIDTH + 40) {
      windParticles.splice(i, 1)
      continue
    }
    ctx.globalAlpha = p.alpha
    ctx.strokeStyle = t.windColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x - p.len, p.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1.0
}

function drawShip(ctx: CanvasRenderingContext2D) {
  const { shipX: x, shipY: y } = props.minigame
  const hw = SHIP_HALF_WIDTH
  const hh = SHIP_HALF_HEIGHT

  // Hover bob — gentle sine oscillation
  const hoverOffset = Math.sin(simTime * 2.5) * 2.5
  // Slight tilt based on vertical velocity
  const tilt = Math.max(-0.12, Math.min(0.12, props.minigame.shipVy * 0.0003))

  ctx.save()
  ctx.translate(x, y + hoverOffset)
  // Flip ship when facing left
  ctx.scale(props.minigame.shipFacing, 1)
  ctx.rotate(tilt)

  // Engine exhaust glow (behind everything)
  const speed = Math.sqrt(
    props.minigame.shipVx * props.minigame.shipVx +
    props.minigame.shipVy * props.minigame.shipVy,
  )
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

  // Fuselage — elongated shuttle body
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

function drawGasPuffs(ctx: CanvasRenderingContext2D) {
  const t = theme.value
  for (const puff of props.minigame.gasPuffs) {
    if (puff.consumed) continue
    ctx.save()
    ctx.translate(puff.x, puff.y)

    // Outer haze
    ctx.globalAlpha = puff.alpha * 0.3
    const hazeGrad = ctx.createRadialGradient(0, 0, puff.radius * 0.3, 0, 0, puff.radius * 1.4)
    hazeGrad.addColorStop(0, t.puffOuter)
    hazeGrad.addColorStop(0.5, t.puffInner)
    hazeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = hazeGrad
    ctx.beginPath()
    ctx.arc(0, 0, puff.radius * 1.4, 0, Math.PI * 2)
    ctx.fill()

    // Inner cloud
    ctx.globalAlpha = puff.alpha * 0.6
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, puff.radius)
    innerGrad.addColorStop(0, t.puffCenter)
    innerGrad.addColorStop(0.6, t.puffInner)
    innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = innerGrad
    ctx.beginPath()
    ctx.arc(0, 0, puff.radius, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = 1.0
    ctx.restore()
  }
}

function drawDrones(ctx: CanvasRenderingContext2D) {
  for (const drone of props.minigame.drones) {
    if (drone.collected) continue

    const hasGas = drone.gasLoaded > 0

    // Fading trail — green if loaded, cyan if empty
    const trailLen = 5
    ctx.globalAlpha = 0.15
    ctx.strokeStyle = hasGas ? '#44ff44' : '#00ffcc'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(
      drone.x - drone.vx * 0.01 * trailLen,
      drone.y - drone.vy * 0.01 * trailLen,
    )
    ctx.lineTo(drone.x, drone.y)
    ctx.stroke()
    ctx.globalAlpha = 1.0

    ctx.save()
    ctx.translate(drone.x, drone.y)

    // Outer glow — brighter if gas loaded
    const glowColor = hasGas ? 'rgba(80, 255, 80,' : 'rgba(0, 255, 204,'
    const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14)
    glowGrad.addColorStop(0, `${glowColor} 0.7)`)
    glowGrad.addColorStop(0.5, `${glowColor} 0.2)`)
    glowGrad.addColorStop(1, `${glowColor} 0)`)
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(0, 0, 14, 0, Math.PI * 2)
    ctx.fill()

    // Inner core
    ctx.fillStyle = hasGas ? '#44ff44' : '#00ffcc'
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()

    // Bright center
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2)
    ctx.fill()

    // Gas loaded indicator
    if (hasGas) {
      ctx.fillStyle = '#44ff44'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(`+${drone.gasLoaded.toFixed(1)}`, 0, -12)
    }

    ctx.restore()
  }
}

function drawGauge(ctx: CanvasRenderingContext2D) {
  const barWidth = CANVAS_WIDTH - 100
  const barHeight = 16
  const barX = 50
  const barY = CANVAS_HEIGHT - 40

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(barX, barY, barWidth, barHeight)

  // Fill
  const fill = Math.min(
    props.minigame.gasCollected / props.minigame.targetGas,
    1,
  )
  ctx.fillStyle = fill >= 1 ? '#00ff88' : '#00ccff'
  ctx.fillRect(barX, barY, barWidth * fill, barHeight)

  // Border
  ctx.strokeStyle = 'rgba(0, 204, 255, 0.4)'
  ctx.strokeRect(barX, barY, barWidth, barHeight)

  // Label
  ctx.fillStyle = '#ffffff'
  ctx.font = '11px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `GAS: ${props.minigame.gasCollected.toFixed(1)} / ${props.minigame.targetGas}`,
    CANVAS_WIDTH / 2,
    barY - 6,
  )
}

function drawHeatWarning(ctx: CanvasRenderingContext2D) {
  const shipBottom = props.minigame.shipY + SHIP_HALF_HEIGHT
  const warningStart = COOK_ZONE_Y - HEAT_WARNING_OFFSET
  const heatRatio = props.minigame.heatTimer / COOK_ZONE_TOLERANCE

  // Proximity-based warning — red vignette from edges
  if (shipBottom > warningStart || heatRatio > 0) {
    const proximity = Math.max(
      (shipBottom - warningStart) / HEAT_WARNING_OFFSET,
      heatRatio,
    )
    const intensity = Math.min(1, proximity) * 0.4

    // Red vignette overlay — stronger edges
    const vigGrad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.25,
      CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, CANVAS_WIDTH * 0.6,
    )
    vigGrad.addColorStop(0, 'rgba(255, 0, 0, 0)')
    vigGrad.addColorStop(1, `rgba(255, 30, 0, ${intensity})`)
    ctx.fillStyle = vigGrad
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Pulsing red flash when actually in the zone
    if (heatRatio > 0) {
      const flash = 0.1 + heatRatio * 0.25 * (0.5 + 0.5 * Math.sin(simTime * 12))
      ctx.fillStyle = `rgba(255, 50, 0, ${flash})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }
  }

  // Heat bar — shows cook timer when in the zone
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
    ctx.fillText('OVERHEATING', CANVAS_WIDTH / 2, barY - 4)
  }
}

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = props.minigame.status === 'completed' ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  let failMsg = 'HULL OVERHEATED — TOO CLOSE TO SURFACE'
  if (props.minigame.timeRemaining <= 0) failMsg = 'TIME EXPIRED — MISSION FAILED'
  else if (props.minigame.dronesRemaining === 0 && props.minigame.drones.length === 0)
    failMsg = 'ALL DRONES LOST — MISSION FAILED'
  ctx.fillText(
    props.minigame.status === 'completed' ? 'COLLECTION COMPLETE' : failMsg,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
  )
}

function loop(time: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dt = lastTime === 0 ? 0.016 : Math.min((time - lastTime) / 1000, 0.05)
  lastTime = time

  if (props.minigame.status === 'active') {
    updateInput()
    props.minigame.tick(dt, STUB_CTX)
  }

  // Screen shake when overheating
  const heatRatio = props.minigame.heatTimer / COOK_ZONE_TOLERANCE
  ctx.save()
  if (heatRatio > 0) {
    const shakeX = (Math.random() - 0.5) * heatRatio * 8
    const shakeY = (Math.random() - 0.5) * heatRatio * 8
    ctx.translate(shakeX, shakeY)
  }

  // Clear + draw
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawBackground(ctx, dt)

  // Cook zone warning — pulsing red line at the danger threshold
  const cookPulse = 0.3 + 0.2 * Math.sin(simTime * 4)
  ctx.globalAlpha = cookPulse
  ctx.strokeStyle = '#ff3300'
  ctx.lineWidth = 1.5
  ctx.setLineDash([8, 6])
  ctx.beginPath()
  ctx.moveTo(0, COOK_ZONE_Y)
  ctx.lineTo(CANVAS_WIDTH, COOK_ZONE_Y)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1.0

  drawGasPuffs(ctx)
  drawShip(ctx)
  drawDrones(ctx)
  drawGauge(ctx)

  drawHeatWarning(ctx)

  // Restore shake transform
  ctx.restore()

  // Timer — center top
  const timeLeft = Math.max(0, props.minigame.timeRemaining)
  const timeRatio = timeLeft / props.minigame.timeTotal
  const timeLow = timeLeft < 10
  ctx.fillStyle = timeLow ? '#ff4444' : '#ffffff'
  ctx.font = timeLow ? 'bold 16px monospace' : '14px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    `${Math.ceil(timeLeft)}s`,
    CANVAS_WIDTH / 2,
    24,
  )

  // Drone counter
  ctx.fillStyle = '#00ccff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'right'
  const inFlight = props.minigame.drones.filter((d) => !d.collected).length
  ctx.fillText(
    `DRONES: ${props.minigame.dronesRemaining} ready | ${inFlight} in flight`,
    CANVAS_WIDTH - 20,
    30,
  )

  // Q prompt
  if (props.minigame.dronesRemaining > 0 && props.minigame.status === 'active') {
    ctx.fillStyle = 'rgba(0, 204, 255, 0.5)'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('[Q] LAUNCH DRONE', 20, 30)
  }

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

/** Render one still frame — background + ship, no gameplay. */
function drawStillFrame() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawBackground(ctx, 0.016)
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
  // Render one still frame, then fade in briefing
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
    <!-- Canvas always renders -->
    <canvas
      ref="canvasRef"
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      class="gas-collection-canvas"
    />

    <!-- Briefing overlay — fades in on top of the still frame -->
    <Transition name="gas-briefing">
      <div v-if="briefingVisible && !started" class="gas-collection-briefing-overlay">
        <div class="gas-collection-briefing">
          <div class="gas-collection-briefing__icon">{{ theme.briefing.icon }}</div>
          <h3 class="gas-collection-briefing__title">{{ theme.briefing.title }}</h3>
          <p class="gas-collection-briefing__text">{{ theme.briefing.situation }}</p>
          <p class="gas-collection-briefing__text">{{ theme.briefing.instructions }}</p>
          <div class="gas-collection-briefing__controls">
            <span><b>W A S D</b> — fly</span>
            <span><b>Q</b> — launch drone</span>
          </div>
          <p class="gas-collection-briefing__detail">
            Drones: {{ minigame.dronesRemaining }} available — reusable if caught.
            Target: {{ minigame.targetGas }} gas units.
            Time limit: {{ Math.ceil(minigame.timeTotal) }}s.
          </p>
          <button
            type="button"
            class="gas-collection-briefing__start"
            @click="startGame"
          >
            BEGIN COLLECTION
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
