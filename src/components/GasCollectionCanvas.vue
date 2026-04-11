<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
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

const props = defineProps<{
  minigame: GasCollectionMiniGame
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

function drawBackground(ctx: CanvasRenderingContext2D, dt: number) {
  bgOffset += dt * 80
  simTime += dt
  planetScrollX += dt * 100

  // Deep space gradient — black to dark amber near horizon
  const spaceGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  spaceGrad.addColorStop(0, '#020108')
  spaceGrad.addColorStop(0.4, '#0a0510')
  spaceGrad.addColorStop(0.6, '#1a0800')
  spaceGrad.addColorStop(0.72, '#4d2200')
  spaceGrad.addColorStop(1.0, '#cc6600')
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
  planetGrad.addColorStop(0, '#ff9933')
  planetGrad.addColorStop(0.4, '#e67300')
  planetGrad.addColorStop(0.7, '#cc5500')
  planetGrad.addColorStop(1.0, '#993300')
  ctx.fillStyle = planetGrad
  ctx.beginPath()
  ctx.arc(CANVAS_WIDTH / 2, curveCenterY, curveRadius, 0, Math.PI * 2)
  ctx.fill()

  // Scrolling cloud bands on the planet surface — parallax layers moving left-to-right
  ctx.save()
  ctx.beginPath()
  ctx.arc(CANVAS_WIDTH / 2, curveCenterY, curveRadius, 0, Math.PI * 2)
  ctx.clip()

  for (let i = 0; i < 10; i++) {
    const bandY = PLANET_HORIZON_Y + 5 + i * 24
    const speed = 60 + i * 25
    const scrollWrap = CANVAS_WIDTH * 2
    const offset = (planetScrollX * speed / 80) % scrollWrap
    const thickness = 10 + i * 5
    const alpha = 0.1 + (i % 3) * 0.05

    ctx.globalAlpha = alpha
    ctx.fillStyle = i % 3 === 0 ? '#ffdd99' : i % 3 === 1 ? '#e68a00' : '#cc7700'

    // Draw band scrolling right — offset goes positive = moves right
    ctx.fillRect(offset - scrollWrap, bandY, CANVAS_WIDTH * 3, thickness)

    // Wavy edge on some bands for organic feel
    if (i % 2 === 0) {
      ctx.globalAlpha = alpha * 0.5
      for (let wx = 0; wx < CANVAS_WIDTH; wx += 40) {
        const waveY = bandY + Math.sin((wx + planetScrollX * speed / 80) * 0.03) * 6
        ctx.fillRect(wx, waveY, 30, thickness * 0.4)
      }
    }
  }
  ctx.restore()
  ctx.globalAlpha = 1.0

  // Atmospheric glow along the horizon — thin bright line
  const glowGrad = ctx.createLinearGradient(0, PLANET_HORIZON_Y - 25, 0, PLANET_HORIZON_Y + 20)
  glowGrad.addColorStop(0, 'rgba(255, 180, 80, 0)')
  glowGrad.addColorStop(0.3, 'rgba(255, 220, 140, 0.3)')
  glowGrad.addColorStop(0.5, 'rgba(255, 200, 120, 0.2)')
  glowGrad.addColorStop(0.7, 'rgba(255, 160, 60, 0.1)')
  glowGrad.addColorStop(1, 'rgba(255, 120, 30, 0)')
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
    ctx.strokeStyle = '#ffcc88'
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
  for (const puff of props.minigame.gasPuffs) {
    if (puff.consumed) continue
    ctx.save()
    ctx.translate(puff.x, puff.y)

    // Outer haze
    ctx.globalAlpha = puff.alpha * 0.3
    const hazeGrad = ctx.createRadialGradient(0, 0, puff.radius * 0.3, 0, 0, puff.radius * 1.4)
    hazeGrad.addColorStop(0, '#ffdd44')
    hazeGrad.addColorStop(0.5, '#ffaa22')
    hazeGrad.addColorStop(1, 'rgba(255, 150, 30, 0)')
    ctx.fillStyle = hazeGrad
    ctx.beginPath()
    ctx.arc(0, 0, puff.radius * 1.4, 0, Math.PI * 2)
    ctx.fill()

    // Inner cloud
    ctx.globalAlpha = puff.alpha * 0.6
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, puff.radius)
    innerGrad.addColorStop(0, '#ffeeaa')
    innerGrad.addColorStop(0.6, '#ffcc44')
    innerGrad.addColorStop(1, 'rgba(255, 180, 40, 0)')
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
          <div class="gas-collection-briefing__icon">⚠</div>
          <h3 class="gas-collection-briefing__title">ATMOSPHERIC STORM DETECTED</h3>
          <p class="gas-collection-briefing__text">
            Sensors detect a massive storm brewing near the atmosphere — gas pockets are
            rising from the cloud layer. This is a rare collection window.
          </p>
          <p class="gas-collection-briefing__text">
            Your ship cannot cross the atmosphere threshold or it will overheat.
            Orbit at close range and deploy collection drones into the rising gas puffs.
            Catch your drones before they burn up to bank the gas.
          </p>
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
