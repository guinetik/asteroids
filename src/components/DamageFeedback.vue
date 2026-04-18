<!-- src/components/DamageFeedback.vue -->
<!--
  Player damage feedback overlay — red radial vignette plus a 12-slice
  directional ring that lights up the wedge facing the damage source.

  The component owns its own animation-frame loop for fading the directional
  ring and exposes a `flash(angleRad)` method via `defineExpose` so view
  controllers can trigger a new directional indicator on each hit. The
  red vignette is driven by the `flashOpacity` prop, which the controller
  updates every frame from its decaying damage timer.

  Pulled out of `FpsView.vue` so it can be reused by `LevelView.vue` and any
  future scene that needs the same hit feedback.

  @author guinetik
  @date 2026-04-18
  @spec docs/superpowers/specs/2026-04-18-level-damage-feedback-design.md
-->
<script setup lang="ts">
/**
 * @fileoverview Reusable damage feedback overlay (red vignette + directional ring).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Props for {@link DamageFeedback}.
 *
 * @property flashOpacity - Current red-vignette opacity, in `[0, 1]`. Driven
 *   by the view controller's per-frame damage timer; `0` hides the overlay.
 * @property directionDuration - Seconds the directional ring takes to fade
 *   out after a hit. Defaults to 0.6s to match the original FPS view.
 */
interface Props {
  flashOpacity: number
  directionDuration?: number
}

const props = withDefaults(defineProps<Props>(), {
  directionDuration: 0.6,
})

const SLICE_COUNT = 12
const SLICE_ANGLE = (Math.PI * 2) / SLICE_COUNT
// Outer radius overshoots the viewBox so the ring covers screen corners on
// any aspect ratio. Inner radius keeps the central viewport clear.
const OUTER_R = 720
const INNER_R = 280
const CX = 500
const CY = 500

interface SlicePath {
  d: string
  index: number
  gradX1: number
  gradY1: number
  gradX2: number
  gradY2: number
}

const directionTimer = ref(0)
const currentDirection = ref<number | null>(null)

/**
 * Build 12 pizza-slice SVG paths arranged in a ring. Each slice is a wedge
 * from `INNER_R` to `OUTER_R`; the centre is hollow.
 *
 * @returns Array of slice descriptors with `d` (SVG path) and gradient anchor
 *   coordinates so each slice can fade outward from the centre.
 */
const slicePaths = computed<SlicePath[]>(() => {
  const paths: SlicePath[] = []
  for (let i = 0; i < SLICE_COUNT; i++) {
    const startAngle = i * SLICE_ANGLE - Math.PI / 2
    const endAngle = (i + 1) * SLICE_ANGLE - Math.PI / 2

    const cos1 = Math.cos(startAngle)
    const sin1 = Math.sin(startAngle)
    const cos2 = Math.cos(endAngle)
    const sin2 = Math.sin(endAngle)

    const ox1 = CX + cos1 * OUTER_R
    const oy1 = CY + sin1 * OUTER_R
    const ox2 = CX + cos2 * OUTER_R
    const oy2 = CY + sin2 * OUTER_R

    const ix1 = CX + cos1 * INNER_R
    const iy1 = CY + sin1 * INNER_R
    const ix2 = CX + cos2 * INNER_R
    const iy2 = CY + sin2 * INNER_R

    const d = [
      `M ${ox1} ${oy1}`,
      `A ${OUTER_R} ${OUTER_R} 0 0 1 ${ox2} ${oy2}`,
      `L ${ix2} ${iy2}`,
      `A ${INNER_R} ${INNER_R} 0 0 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ')

    const midAngle = (startAngle + endAngle) / 2
    const gradX1 = 50
    const gradY1 = 50
    const gradX2 = 50 + Math.cos(midAngle) * 50
    const gradY2 = 50 + Math.sin(midAngle) * 50

    paths.push({ d, index: i, gradX1, gradY1, gradX2, gradY2 })
  }
  return paths
})

/**
 * Compute opacity for each slice based on damage direction.
 * The slice aligned with the damage source gets full intensity, neighbours
 * get partial intensity, and the rest stay invisible.
 *
 * @param sliceIndex - Index of the slice (0..SLICE_COUNT-1).
 * @returns Opacity value in `[0, 1]`.
 */
function sliceOpacity(sliceIndex: number): number {
  if (currentDirection.value === null) return 0

  const fadeProgress = directionTimer.value / props.directionDuration

  // damageDir is relative angle where 0 = ahead, positive = right. Flip by PI
  // so the lit slice points back at the source instead of away from it.
  let hitAngle = currentDirection.value + Math.PI
  hitAngle = ((hitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

  const sliceCenterAngle = (sliceIndex + 0.5) * SLICE_ANGLE

  let delta = Math.abs(hitAngle - sliceCenterAngle)
  if (delta > Math.PI) delta = Math.PI * 2 - delta

  const slicesDist = delta / SLICE_ANGLE
  let intensity = 0
  if (slicesDist < 0.5) {
    intensity = 1.0
  } else if (slicesDist < 1.5) {
    intensity = 0.4
  } else if (slicesDist < 2.5) {
    intensity = 0.1
  }

  return intensity * fadeProgress * 0.85
}

/** Faint base radial-gradient vignette driven by `flashOpacity`. */
const baseVignette = computed(() => {
  if (props.flashOpacity <= 0) return 'none'
  const alpha = props.flashOpacity * 0.35
  return `radial-gradient(ellipse at center, transparent 50%, rgba(255, 0, 0, ${alpha}))`
})

/**
 * Light up the directional ring from `angleRad` and reset its fade timer.
 * Called by the parent view whenever the player takes a hit. Subsequent
 * calls overwrite the current angle and restart the fade.
 *
 * @param angleRad - Hit direction in radians, relative to the camera (`0` =
 *   ahead, positive = right).
 */
function flash(angleRad: number): void {
  currentDirection.value = angleRad
  directionTimer.value = props.directionDuration
}

defineExpose({ flash })

let rafId = 0
let lastRaf = 0

/**
 * Animation frame loop: ticks the directional ring fade-out timer and clears
 * the displayed direction once the timer expires.
 */
function tickDirection(now: number): void {
  const dt = lastRaf === 0 ? 0 : (now - lastRaf) / 1000
  lastRaf = now

  if (directionTimer.value > 0) {
    directionTimer.value = Math.max(0, directionTimer.value - dt)
    if (directionTimer.value <= 0) {
      currentDirection.value = null
    }
  }

  rafId = requestAnimationFrame(tickDirection)
}

onMounted(() => {
  rafId = requestAnimationFrame((t) => {
    lastRaf = t
    tickDirection(t)
  })
})

onBeforeUnmount(() => {
  if (rafId !== 0) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div
    v-if="flashOpacity > 0"
    class="damage-feedback__vignette"
    :style="{ background: baseVignette }"
  />
  <svg
    v-if="currentDirection !== null"
    class="damage-feedback__ring"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <linearGradient
        v-for="slice in slicePaths"
        :id="`damageSliceGrad${slice.index}`"
        :key="`g${slice.index}`"
        :x1="`${slice.gradX1}%`"
        :y1="`${slice.gradY1}%`"
        :x2="`${slice.gradX2}%`"
        :y2="`${slice.gradY2}%`"
      >
        <stop offset="0%" stop-color="rgb(255, 20, 20)" stop-opacity="0" />
        <stop offset="50%" stop-color="rgb(255, 20, 20)" stop-opacity="0.3" />
        <stop offset="100%" stop-color="rgb(255, 20, 20)" stop-opacity="1" />
      </linearGradient>
    </defs>
    <path
      v-for="slice in slicePaths"
      :key="slice.index"
      :d="slice.d"
      :fill="`url(#damageSliceGrad${slice.index})`"
      :opacity="sliceOpacity(slice.index)"
    />
  </svg>
</template>

<style scoped>
.damage-feedback__vignette {
  position: fixed;
  inset: 0;
  z-index: 45;
  pointer-events: none;
}

.damage-feedback__ring {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 45;
  pointer-events: none;
}
</style>
