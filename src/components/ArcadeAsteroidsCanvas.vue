<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ArcadeAsteroidsOverlayController } from './ArcadeAsteroidsOverlayController'
import type {
  AsteroidEntity,
  AsteroidsGameState,
  AsteroidsShip,
  SaucerEntity,
} from '@/lib/minigame/arcadeAsteroids/types'

const props = defineProps<{
  controller: ArcadeAsteroidsOverlayController
  visible: boolean
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let frameId: number | null = null
let resizeObserver: ResizeObserver | null = null
let lastFrameMs: number | null = null

const DEVICE_PIXEL_RATIO_MAX = 2
const MILLISECONDS_PER_SECOND = 1000
const FRAME_DT_MAX_SECONDS = 0.05
const SHIP_NOSE_FACTOR = 1.35
const SHIP_WING_BACK_FACTOR = 0.9
const SHIP_WING_SIDE_FACTOR = 0.72
const SAUCER_HALF_WIDTH_FACTOR = 1.4
const SAUCER_BODY_HEIGHT_FACTOR = 0.42
const SAUCER_DOME_HEIGHT_FACTOR = 0.72
const THRUST_FLAME_LENGTH_FACTOR = 1.25
const THRUST_FLAME_SIDE_FACTOR = 0.45

function focus(): void {
  canvasEl.value?.focus()
}

function resizeCanvas(): void {
  const canvas = canvasEl.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(window.devicePixelRatio || 1, DEVICE_PIXEL_RATIO_MAX)
  const nextWidth = Math.max(1, Math.round(rect.width * dpr))
  const nextHeight = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
  }
  props.controller.resize(rect.width, rect.height)
}

function loop(nowMs: number): void {
  if (!props.visible) return
  const previous = lastFrameMs ?? nowMs
  lastFrameMs = nowMs
  const dt = Math.min(FRAME_DT_MAX_SECONDS, (nowMs - previous) / MILLISECONDS_PER_SECOND)
  props.controller.tick(dt)
  draw()
  frameId = window.requestAnimationFrame(loop)
}

function startLoop(): void {
  if (frameId !== null) return
  lastFrameMs = null
  resizeCanvas()
  draw()
  frameId = window.requestAnimationFrame(loop)
}

function stopLoop(): void {
  if (frameId !== null) window.cancelAnimationFrame(frameId)
  frameId = null
  lastFrameMs = null
  props.controller.clearInputs()
}

function draw(): void {
  const canvas = canvasEl.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const state = props.controller.snapshot.value
  const sx = canvas.width / state.width
  const sy = canvas.height / state.height
  ctx.setTransform(sx, 0, 0, sy, 0, 0)
  ctx.clearRect(0, 0, state.width, state.height)
  drawGrid(ctx, state)
  for (const asteroid of state.asteroids) drawAsteroid(ctx, asteroid)
  for (const bullet of state.bullets) drawBullet(ctx, bullet.x, bullet.y, bullet.radius)
  for (const bullet of state.saucerBullets) drawBullet(ctx, bullet.x, bullet.y, bullet.radius)
  if (state.saucer) drawSaucer(ctx, state.saucer)
  if (state.ship.visible) drawShip(ctx, state.ship, props.controller.inputs.thrust)
  drawMessage(ctx, state)
}

function drawGrid(ctx: CanvasRenderingContext2D, state: AsteroidsGameState): void {
  ctx.save()
  ctx.fillStyle = '#020706'
  ctx.fillRect(0, 0, state.width, state.height)
  ctx.globalAlpha = 0.12
  ctx.strokeStyle = '#4cffd7'
  ctx.lineWidth = 1
  ctx.beginPath()
  const cell = Math.max(state.width, state.height) / 12
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
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(nose.x, nose.y)
  ctx.lineTo(
    Math.cos(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.cos(left) * ship.radius * SHIP_WING_SIDE_FACTOR,
    Math.sin(back) * ship.radius * SHIP_WING_BACK_FACTOR +
      Math.sin(left) * ship.radius * SHIP_WING_SIDE_FACTOR,
  )
  ctx.lineTo(Math.cos(back) * ship.radius * 0.35, Math.sin(back) * ship.radius * 0.35)
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
    ctx.moveTo(Math.cos(back) * ship.radius * 0.35, Math.sin(back) * ship.radius * 0.35)
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.moveTo(
      Math.cos(back) * ship.radius * 0.35 + Math.cos(left) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
      Math.sin(back) * ship.radius * 0.35 + Math.sin(left) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
    )
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.moveTo(
      Math.cos(back) * ship.radius * 0.35 + Math.cos(right) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
      Math.sin(back) * ship.radius * 0.35 + Math.sin(right) * ship.radius * THRUST_FLAME_SIDE_FACTOR,
    )
    ctx.lineTo(
      Math.cos(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
      Math.sin(back) * ship.radius * THRUST_FLAME_LENGTH_FACTOR,
    )
    ctx.stroke()
  }
  ctx.restore()
}

function drawAsteroid(ctx: CanvasRenderingContext2D, asteroid: AsteroidEntity): void {
  ctx.save()
  ctx.translate(asteroid.x, asteroid.y)
  ctx.rotate(asteroid.angle)
  ctx.strokeStyle = '#f8fff9'
  ctx.lineWidth = 2
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

function drawSaucer(ctx: CanvasRenderingContext2D, saucer: SaucerEntity): void {
  const halfWidth = saucer.radius * SAUCER_HALF_WIDTH_FACTOR
  const bodyHeight = saucer.radius * SAUCER_BODY_HEIGHT_FACTOR
  const domeHeight = saucer.radius * SAUCER_DOME_HEIGHT_FACTOR
  ctx.save()
  ctx.translate(saucer.x, saucer.y)
  ctx.strokeStyle = '#f8fff9'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-halfWidth, 0)
  ctx.lineTo(-saucer.radius * 0.5, -bodyHeight)
  ctx.lineTo(saucer.radius * 0.5, -bodyHeight)
  ctx.lineTo(halfWidth, 0)
  ctx.lineTo(saucer.radius * 0.5, bodyHeight)
  ctx.lineTo(-saucer.radius * 0.5, bodyHeight)
  ctx.closePath()
  ctx.moveTo(-saucer.radius * 0.7, -bodyHeight)
  ctx.lineTo(0, -domeHeight)
  ctx.lineTo(saucer.radius * 0.7, -bodyHeight)
  ctx.stroke()
  ctx.restore()
}

function drawBullet(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.save()
  ctx.fillStyle = '#f8fff9'
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

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
  ctx.font = `${Math.max(18, state.width * 0.035)}px Datatype, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f8fff9'
  ctx.fillText(message, state.width / 2, state.height / 2)
  ctx.restore()
}

function onKeydown(event: KeyboardEvent): void {
  props.controller.handleKeydown(event)
}

function onKeyup(event: KeyboardEvent): void {
  props.controller.handleKeyup(event)
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      startLoop()
      requestAnimationFrame(focus)
    } else {
      stopLoop()
    }
  },
)

onMounted(() => {
  if (canvasEl.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvasEl.value)
  }
  if (props.visible) startLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({ focus })
</script>

<template>
  <canvas
    ref="canvasEl"
    class="arcade-asteroids-canvas"
    tabindex="0"
    aria-label="Classic Asteroids arcade game"
    @keydown="onKeydown"
    @keyup="onKeyup"
    @blur="controller.clearInputs()"
  />
</template>
