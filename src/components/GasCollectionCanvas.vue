<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { GasCollectionMiniGame } from '@/lib/minigame/gasCollection/GasCollectionMiniGame'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
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

function drawBackground(ctx: CanvasRenderingContext2D, dt: number) {
  bgOffset += dt * 80
  simTime += dt

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

  // Scrolling cloud bands on the planet surface — parallax layers
  ctx.save()
  ctx.beginPath()
  ctx.arc(CANVAS_WIDTH / 2, curveCenterY, curveRadius, 0, Math.PI * 2)
  ctx.clip()

  for (let i = 0; i < 8; i++) {
    const bandY = PLANET_HORIZON_Y + 10 + i * 28
    const speed = 40 + i * 18
    const offset = (bgOffset * speed / 80) % (CANVAS_WIDTH * 2)
    const thickness = 8 + i * 4
    const alpha = 0.08 + (i % 3) * 0.04

    ctx.globalAlpha = alpha
    ctx.fillStyle = i % 2 === 0 ? '#ffcc88' : '#e68a00'
    // Two strips for seamless wrap
    ctx.fillRect(-offset, bandY, CANVAS_WIDTH * 3, thickness)
  }
  ctx.restore()
  ctx.globalAlpha = 1.0

  // Atmospheric glow along the horizon — thin bright line
  const glowGrad = ctx.createLinearGradient(0, PLANET_HORIZON_Y - 20, 0, PLANET_HORIZON_Y + 15)
  glowGrad.addColorStop(0, 'rgba(255, 180, 80, 0)')
  glowGrad.addColorStop(0.4, 'rgba(255, 200, 120, 0.25)')
  glowGrad.addColorStop(0.6, 'rgba(255, 160, 60, 0.15)')
  glowGrad.addColorStop(1, 'rgba(255, 120, 30, 0)')
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, PLANET_HORIZON_Y - 20, CANVAS_WIDTH, 35)
}

function drawShip(ctx: CanvasRenderingContext2D) {
  const { shipX: x, shipY: y } = props.minigame
  const hw = SHIP_HALF_WIDTH
  const hh = SHIP_HALF_HEIGHT
  ctx.save()
  ctx.translate(x, y)

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

function drawDrones(ctx: CanvasRenderingContext2D) {
  for (const drone of props.minigame.drones) {
    if (drone.collected) continue

    // Fading trail
    const trailLen = 5
    ctx.globalAlpha = 0.15
    ctx.strokeStyle = '#00ffcc'
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

    // Outer glow
    const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 14)
    glowGrad.addColorStop(0, 'rgba(0, 255, 204, 0.6)')
    glowGrad.addColorStop(0.5, 'rgba(0, 255, 204, 0.15)')
    glowGrad.addColorStop(1, 'rgba(0, 255, 204, 0)')
    ctx.fillStyle = glowGrad
    ctx.beginPath()
    ctx.arc(0, 0, 14, 0, Math.PI * 2)
    ctx.fill()

    // Inner core
    ctx.fillStyle = '#00ffcc'
    ctx.beginPath()
    ctx.arc(0, 0, 4, 0, Math.PI * 2)
    ctx.fill()

    // Bright center
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2)
    ctx.fill()

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

function drawEndScreen(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  ctx.fillStyle = props.minigame.status === 'completed' ? '#00ff88' : '#ff4444'
  ctx.font = 'bold 28px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(
    props.minigame.status === 'completed'
      ? 'COLLECTION COMPLETE'
      : 'DRONES DEPLETED — MISSION FAILED',
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

  // Clear + draw
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  drawBackground(ctx, dt)
  drawShip(ctx)
  drawDrones(ctx)
  drawGauge(ctx)

  // Drone counter
  ctx.fillStyle = '#00ccff'
  ctx.font = '12px monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`DRONES: ${props.minigame.dronesRemaining} remaining`, CANVAS_WIDTH - 20, 30)

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

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  animId = requestAnimationFrame(loop)
})

onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <canvas
    ref="canvasRef"
    :width="CANVAS_WIDTH"
    :height="CANVAS_HEIGHT"
    class="gas-collection-canvas"
  />
</template>
