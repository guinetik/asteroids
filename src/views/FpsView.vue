<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'
import FpsHud from '@/components/FpsHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()
const pointerLocked = ref(true)
const damageFlash = ref(0)
const damageDir = ref<number | null>(null)
const damageDirTimer = ref(0)

const DAMAGE_DIR_DURATION = 0.6
const SLICE_COUNT = 12
const SLICE_ANGLE = (Math.PI * 2) / SLICE_COUNT

let lastRaf = 0
function tickDamageDir() {
  const now = performance.now()
  const dt = (now - lastRaf) / 1000
  lastRaf = now
  if (damageDirTimer.value > 0) {
    damageDirTimer.value -= dt
    if (damageDirTimer.value <= 0) {
      damageDir.value = null
    }
  }
  requestAnimationFrame(tickDamageDir)
}
requestAnimationFrame((t) => {
  lastRaf = t
  tickDamageDir()
})

/**
 * Build 12 pizza-slice SVG paths arranged in a ring.
 * Each slice is a wedge from innerRadius to outerRadius.
 * The center is hollow (masked by the inner circle gap).
 */
// Outer radius overshoots the viewBox so slices cover screen corners
// on any aspect ratio. Inner radius stays proportionally smaller for
// a generous clear center area.
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

const slicePaths = computed<SlicePath[]>(() => {
  const paths: SlicePath[] = []
  for (let i = 0; i < SLICE_COUNT; i++) {
    // Slice i covers angle range [startAngle, endAngle]
    // 0 = top of screen (12 o'clock), clockwise
    const startAngle = i * SLICE_ANGLE - Math.PI / 2
    const endAngle = (i + 1) * SLICE_ANGLE - Math.PI / 2

    const cos1 = Math.cos(startAngle)
    const sin1 = Math.sin(startAngle)
    const cos2 = Math.cos(endAngle)
    const sin2 = Math.sin(endAngle)

    // Outer arc points
    const ox1 = CX + cos1 * OUTER_R
    const oy1 = CY + sin1 * OUTER_R
    const ox2 = CX + cos2 * OUTER_R
    const oy2 = CY + sin2 * OUTER_R

    // Inner arc points
    const ix1 = CX + cos1 * INNER_R
    const iy1 = CY + sin1 * INNER_R
    const ix2 = CX + cos2 * INNER_R
    const iy2 = CY + sin2 * INNER_R

    // SVG path: outer arc → line to inner → inner arc back → close
    const d = [
      `M ${ox1} ${oy1}`,
      `A ${OUTER_R} ${OUTER_R} 0 0 1 ${ox2} ${oy2}`,
      `L ${ix2} ${iy2}`,
      `A ${INNER_R} ${INNER_R} 0 0 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ')

    // Linear gradient direction: center → outward along slice midpoint
    const midAngle = (startAngle + endAngle) / 2
    const gradX1 = 50 // start at center
    const gradY1 = 50
    const gradX2 = 50 + Math.cos(midAngle) * 50 // end at edge
    const gradY2 = 50 + Math.sin(midAngle) * 50

    paths.push({ d, index: i, gradX1, gradY1, gradX2, gradY2 })
  }
  return paths
})

/**
 * Compute opacity for each slice based on damage direction.
 * The slice aligned with the damage source gets full intensity,
 * neighbors get partial, rest get nothing.
 */
function sliceOpacity(sliceIndex: number): number {
  if (damageDir.value === null) return 0

  const fadeProgress = damageDirTimer.value / DAMAGE_DIR_DURATION

  // Normalize damage angle to [0, 2PI] — 0 = ahead/top
  // damageDir is relative angle where 0 = ahead, positive = right
  // We need to flip it to point toward the source (+ PI)
  let hitAngle = damageDir.value + Math.PI
  // Normalize to [0, 2PI]
  hitAngle = ((hitAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

  // Which slice does this angle fall in?
  const sliceCenterAngle = (sliceIndex + 0.5) * SLICE_ANGLE

  // Angular distance between slice center and hit angle
  let delta = Math.abs(hitAngle - sliceCenterAngle)
  if (delta > Math.PI) delta = Math.PI * 2 - delta

  // Primary slice: full intensity. Neighbors: falloff.
  // 1 slice away = 0.4, 2 slices away = 0.1, beyond = 0
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

/** Base vignette — low opacity, centered, always during flash. */
const baseVignette = computed(() => {
  if (damageFlash.value <= 0) return 'none'
  const alpha = damageFlash.value * 0.35
  return `radial-gradient(ellipse at center, transparent 50%, rgba(255, 0, 0, ${alpha}))`
})

const telemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  activeMode: 'weapon',
  aiming: false,
  isFiring: false,
  rtgLevel: 80,
  rtgCapacity: 80,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onPointerLockChange = (locked) => {
      pointerLocked.value = locked
    }
    viewController.onDamageFlash = (opacity) => {
      damageFlash.value = opacity
    }
    viewController.onDamageDirection = (angle) => {
      damageDir.value = angle
      damageDirTimer.value = DAMAGE_DIR_DURATION
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function resumeLock() {
  viewController.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <FpsHud :telemetry="telemetry" />
  <!-- Base damage vignette — faint red ring -->
  <div
    v-if="damageFlash > 0"
    class="fixed inset-0 pointer-events-none z-45"
    :style="{ background: baseVignette }"
  />
  <!-- Directional damage ring — pizza slices around screen edge -->
  <svg
    v-if="damageDir !== null"
    class="damage-ring"
    viewBox="0 0 1000 1000"
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <linearGradient
        v-for="slice in slicePaths"
        :id="`sliceGrad${slice.index}`"
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
      :fill="`url(#sliceGrad${slice.index})`"
      :opacity="sliceOpacity(slice.index)"
    />
  </svg>
  <div
    v-if="!pointerLocked"
    class="fixed inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-50"
    @click="resumeLock"
  >
    <span class="text-lg text-white/80 font-mono tracking-widest uppercase">Click to resume</span>
  </div>
</template>

<style>
.damage-ring {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 45;
  pointer-events: none;
}
</style>
