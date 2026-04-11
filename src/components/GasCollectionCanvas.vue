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

function drawBackground(ctx: CanvasRenderingContext2D, dt: number) {
  bgOffset += dt * 120
  if (bgOffset > CANVAS_WIDTH) bgOffset -= CANVAS_WIDTH

  // Atmosphere gradient
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
  grad.addColorStop(0, '#1a0a00')
  grad.addColorStop(0.3, '#cc6600')
  grad.addColorStop(0.6, '#ff9933')
  grad.addColorStop(1, '#ffcc66')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  // Scrolling cloud bands
  ctx.globalAlpha = 0.15
  for (let i = 0; i < 6; i++) {
    const y = 60 + i * 80
    const offset = (bgOffset * (0.5 + i * 0.15)) % CANVAS_WIDTH
    ctx.fillStyle = i % 2 === 0 ? '#fff' : '#cc8800'
    ctx.fillRect(-offset, y, CANVAS_WIDTH * 2, 20 + i * 5)
  }
  ctx.globalAlpha = 1.0
}

function drawShip(ctx: CanvasRenderingContext2D) {
  const { shipX: x, shipY: y } = props.minigame
  ctx.save()
  ctx.translate(x, y)

  // Ship body — cone right, thrusters left
  ctx.fillStyle = '#e0ddd8'
  ctx.beginPath()
  ctx.moveTo(SHIP_HALF_WIDTH, 0)
  ctx.lineTo(-SHIP_HALF_WIDTH, -SHIP_HALF_HEIGHT)
  ctx.lineTo(-SHIP_HALF_WIDTH, SHIP_HALF_HEIGHT)
  ctx.closePath()
  ctx.fill()

  // Thruster glow
  const hasThrust =
    props.minigame.shipVx !== 0 || props.minigame.shipVy !== 0
  if (hasThrust) {
    ctx.fillStyle = '#00ccff'
    ctx.globalAlpha = 0.6 + Math.random() * 0.3
    ctx.beginPath()
    ctx.moveTo(-SHIP_HALF_WIDTH, -4)
    ctx.lineTo(-SHIP_HALF_WIDTH - 12 - Math.random() * 8, 0)
    ctx.lineTo(-SHIP_HALF_WIDTH, 4)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = 1.0
  }

  ctx.restore()
}

function drawDrones(ctx: CanvasRenderingContext2D) {
  for (const drone of props.minigame.drones) {
    if (drone.collected) continue
    ctx.save()
    ctx.translate(drone.x, drone.y)

    // Drone glow
    ctx.fillStyle = '#00ffcc'
    ctx.shadowColor = '#00ffcc'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

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
