<script setup lang="ts">
/**
 * Twin canvas-backed donut HUD that surfaces Sushi the cat's `sushiLove`
 * and `sushiHunger` meters from the player profile while the player is
 * inside the habitat scene and a habitat key-prompt is on screen.
 *
 * Mounted alongside the habitat `KeyPrompt` in {@link MapView}; pointer
 * events are disabled (purely informational). The donut arcs are
 * animated with a per-frame lerp toward the live meter values so swings
 * feel smooth when the cat AI bumps the meters.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-05-07-sushi-cat-care-design.md
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** Props accepted by {@link SushiMetersOverlay}. */
interface Props {
  /** When false, the overlay is fully hidden (no DOM rendered). */
  visible: boolean
  /** Affection meter, expected range [0, 100]. */
  love: number
  /** Hunger meter, expected range [0, 100]. */
  hunger: number
}

const props = defineProps<Props>()

/** Lower bound of the meter range. */
const METER_MIN = 0
/** Upper bound of the meter range. */
const METER_MAX = 100
/** Logical CSS pixel diameter of each donut canvas. */
const DONUT_DIAMETER_PX = 56
/** Stroke thickness of the donut ring in CSS pixels. */
const DONUT_THICKNESS_PX = 7
/** Maximum devicePixelRatio multiplier to avoid blowing up backing-store size on phones. */
const HUD_DPR_LIMIT = 2
/** Per-frame lerp factor controlling how fast the displayed arc chases the target value. */
const ARC_LERP_RATE = 0.18
/** Tolerance for considering the displayed arc "settled" so we can stop the rAF loop. */
const ARC_SETTLE_EPSILON = 0.05
/** Track color (empty portion of the ring). */
const TRACK_COLOR = 'rgba(255, 255, 255, 0.18)'
/** Filled-arc color for the love donut — matches CatController's heart particles. */
const LOVE_FILL_COLOR = '#ff5577'
/** Filled-arc color for the hunger donut. */
const HUNGER_FILL_COLOR = '#f2a83a'
/** Center percentage label color. */
const CENTER_TEXT_COLOR = 'rgba(255, 255, 255, 0.92)'
/** Font family stack used by the canvas labels (matches global Datatype). */
const CANVAS_FONT_FAMILY = "'Datatype', ui-monospace, monospace"
/** Center text font size in CSS pixels. */
const CENTER_TEXT_SIZE_PX = 14
/** Full-circle sweep in radians. */
const FULL_CIRCLE_RADIANS = Math.PI * 2
/** 12-o'clock start angle in canvas radians. */
const TWELVE_OCLOCK_RADIANS = -Math.PI / 2

/** Clamp a numeric meter value to [METER_MIN, METER_MAX]. */
function clampMeter(value: number): number {
  if (!Number.isFinite(value)) return METER_MIN
  if (value < METER_MIN) return METER_MIN
  if (value > METER_MAX) return METER_MAX
  return value
}

const loveCanvasRef = ref<HTMLCanvasElement | null>(null)
const hungerCanvasRef = ref<HTMLCanvasElement | null>(null)

/** Currently-rendered love percentage (lerps toward `props.love`). */
const displayedLove = ref(clampMeter(props.love))
/** Currently-rendered hunger percentage (lerps toward `props.hunger`). */
const displayedHunger = ref(clampMeter(props.hunger))

/** Integer percentage shown at the center of the love donut. */
const loveCenterLabel = computed(() => Math.round(displayedLove.value).toString())
/** Integer percentage shown at the center of the hunger donut. */
const hungerCenterLabel = computed(() => Math.round(displayedHunger.value).toString())

let rafHandle = 0

/**
 * Resolve the device pixel ratio we want to honor, capped to {@link HUD_DPR_LIMIT}.
 */
function resolveDpr(): number {
  const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  return Math.min(raw, HUD_DPR_LIMIT)
}

/**
 * Configure the canvas backing-store size for crisp HiDPI rendering.
 */
function configureCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = resolveDpr()
  const sizePx = DONUT_DIAMETER_PX
  canvas.width = Math.round(sizePx * dpr)
  canvas.height = Math.round(sizePx * dpr)
  canvas.style.width = `${sizePx}px`
  canvas.style.height = `${sizePx}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

/**
 * Draw a single donut: full track ring, then an arc starting at 12 o'clock
 * sweeping clockwise proportional to `percent01`. Center label is rendered last.
 */
function drawDonut(
  canvas: HTMLCanvasElement | null,
  percent01: number,
  fillColor: string,
  centerLabel: string,
): void {
  if (!canvas) return
  const ctx = configureCanvas(canvas)
  if (!ctx) return
  const center = DONUT_DIAMETER_PX / 2
  const radius = center - DONUT_THICKNESS_PX / 2
  ctx.clearRect(0, 0, DONUT_DIAMETER_PX, DONUT_DIAMETER_PX)
  ctx.lineWidth = DONUT_THICKNESS_PX
  ctx.lineCap = 'round'
  // Track
  ctx.strokeStyle = TRACK_COLOR
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, FULL_CIRCLE_RADIANS)
  ctx.stroke()
  // Filled arc
  if (percent01 > 0) {
    const sweep = FULL_CIRCLE_RADIANS * percent01
    ctx.strokeStyle = fillColor
    ctx.beginPath()
    ctx.arc(
      center,
      center,
      radius,
      TWELVE_OCLOCK_RADIANS,
      TWELVE_OCLOCK_RADIANS + sweep,
      false,
    )
    ctx.stroke()
  }
  // Center label
  ctx.fillStyle = CENTER_TEXT_COLOR
  ctx.font = `${CENTER_TEXT_SIZE_PX}px ${CANVAS_FONT_FAMILY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(centerLabel, center, center + 1)
}

/** Repaint both canvases using the currently-displayed meter values. */
function repaint(): void {
  drawDonut(
    loveCanvasRef.value,
    displayedLove.value / METER_MAX,
    LOVE_FILL_COLOR,
    loveCenterLabel.value,
  )
  drawDonut(
    hungerCanvasRef.value,
    displayedHunger.value / METER_MAX,
    HUNGER_FILL_COLOR,
    hungerCenterLabel.value,
  )
}

/**
 * Step the displayed meters one tick toward their targets. Returns true while
 * either meter is still chasing (so the rAF loop keeps spinning).
 */
function stepLerp(): boolean {
  const targetLove = clampMeter(props.love)
  const targetHunger = clampMeter(props.hunger)
  const dLove = targetLove - displayedLove.value
  const dHunger = targetHunger - displayedHunger.value
  let moving = false
  if (Math.abs(dLove) > ARC_SETTLE_EPSILON) {
    displayedLove.value += dLove * ARC_LERP_RATE
    moving = true
  } else if (displayedLove.value !== targetLove) {
    displayedLove.value = targetLove
  }
  if (Math.abs(dHunger) > ARC_SETTLE_EPSILON) {
    displayedHunger.value += dHunger * ARC_LERP_RATE
    moving = true
  } else if (displayedHunger.value !== targetHunger) {
    displayedHunger.value = targetHunger
  }
  return moving
}

/** Drive the lerp loop only while values are still chasing their targets. */
function tick(): void {
  const moving = stepLerp()
  repaint()
  if (moving) {
    rafHandle = window.requestAnimationFrame(tick)
  } else {
    rafHandle = 0
  }
}

/** Kick the rAF loop if it isn't already running. */
function ensureLoop(): void {
  if (rafHandle !== 0) return
  if (typeof window === 'undefined') return
  rafHandle = window.requestAnimationFrame(tick)
}

watch(
  () => [props.love, props.hunger],
  () => {
    ensureLoop()
  },
)

watch(
  () => props.visible,
  (next) => {
    if (next) {
      // Repaint immediately on show — canvases are freshly mounted.
      repaint()
      ensureLoop()
    }
  },
)

onMounted(() => {
  repaint()
})

onBeforeUnmount(() => {
  if (rafHandle !== 0 && typeof window !== 'undefined') {
    window.cancelAnimationFrame(rafHandle)
    rafHandle = 0
  }
})
</script>

<template>
  <div v-if="visible" class="sushi-meters" role="status" aria-live="polite">
    <div class="sushi-meters__cell">
      <canvas
        ref="loveCanvasRef"
        class="sushi-meters__canvas"
        :aria-label="`Sushi love ${loveCenterLabel}%`"
      ></canvas>
      <span class="sushi-meters__title">LOVE</span>
    </div>
    <div class="sushi-meters__cell">
      <canvas
        ref="hungerCanvasRef"
        class="sushi-meters__canvas"
        :aria-label="`Sushi hunger ${hungerCenterLabel}%`"
      ></canvas>
      <span class="sushi-meters__title">HUNGER</span>
    </div>
  </div>
</template>
