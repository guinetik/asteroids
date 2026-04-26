<!-- src/views/FpsView.vue -->
<!--
  URL query flags (handled in FpsViewController.init):
  - flat — flat terrain
  - targets — target dummies in a ring
  - enemies — full enemy demo
  - hostages — spawn hostage.glb props (optional count: ?hostages=5; default 3)
  - viruses — spawn virus.glb props (optional count: ?viruses=4; default 3)
-->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'
import FpsHud from '@/components/FpsHud.vue'
import { useAudio } from '@/audio/useAudio'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()
const pointerLocked = ref(true)
/**
 * Gate the controller behind an explicit user gesture. Browsers refuse to
 * start audio contexts (and pointer-lock requests originating from
 * non-user-initiated code paths are flaky) without one, and the sandbox
 * is the screen we use most for iterating on FPS audio — having to live
 * with silent first-load every time was getting in the way.
 */
const started = ref(false)
const initializing = ref(false)
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
  rtgLevel: 240,
  rtgCapacity: 240,
  modeCharge: 20,
  modeCapacity: 20,
  headingRad: 0,
  objectives: [],
})

/**
 * Wire callbacks ahead of time so they're attached the moment `init`
 * starts spawning subsystems. Doing this in `onMounted` (rather than
 * inside `start()`) keeps the click handler's hot path tiny — by the
 * time the user hits PLAY all the listeners are already in place.
 */
onMounted(() => {
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
})

onUnmounted(() => {
  viewController.dispose()
})

/**
 * User-gesture entry point. Unlocks the audio context (Howler refuses to
 * resume otherwise on Chrome/Edge), then boots the FPS controller. Guards
 * against double-clicks via {@link initializing}; once we're past the
 * `await`, {@link started} is flipped and the overlay disappears in the
 * same tick the renderer mounts.
 */
async function start() {
  if (started.value || initializing.value) return
  if (!container.value) return
  initializing.value = true
  try {
    useAudio().unlock()
    await viewController.init(container.value)
    started.value = true
  } finally {
    initializing.value = false
  }
}

function resumeLock() {
  viewController.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <template v-if="started">
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
      <span class="text-lg text-white/80 font-mono tracking-widest uppercase">
        Click to resume
      </span>
    </div>
  </template>
  <!--
    Pre-flight gate. Renders on top of the empty container until the user
    clicks PLAY, at which point we unlock the audio context, boot the
    controller, and tear this overlay down in the same tick the HUD
    appears.
  -->
  <div v-if="!started" class="fps-start-overlay" @click="start">
    <div class="fps-start-card">
      <div class="fps-start-eyebrow">FPS Sandbox</div>
      <button type="button" class="fps-start-button" :disabled="initializing" @click.stop="start">
        {{ initializing ? 'Booting…' : '▶ Play' }}
      </button>
      <div class="fps-start-hint">Click to unlock audio &amp; capture mouse</div>
    </div>
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

/*
 * Pre-flight gate. Sits above everything (z-index 100) so it captures
 * the mandatory user gesture. Background is a solid black wash so we
 * don't show whatever the empty WebGL canvas paints in the meantime.
 */
.fps-start-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #0a0f14 0%, #000 100%);
  cursor: pointer;
  z-index: 100;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}

.fps-start-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 2.5rem 3rem;
  border: 1px solid rgba(120, 220, 255, 0.25);
  border-radius: 6px;
  background: rgba(10, 18, 26, 0.85);
  box-shadow:
    0 0 0 1px rgba(120, 220, 255, 0.05),
    0 20px 60px rgba(0, 0, 0, 0.6),
    inset 0 0 40px rgba(120, 220, 255, 0.04);
}

.fps-start-eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: rgba(120, 220, 255, 0.7);
}

.fps-start-button {
  appearance: none;
  border: 1px solid rgba(120, 220, 255, 0.6);
  background: rgba(120, 220, 255, 0.08);
  color: #d8f5ff;
  font-family: inherit;
  font-size: 1.5rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  padding: 0.85rem 2.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition:
    background 120ms ease,
    transform 120ms ease,
    box-shadow 120ms ease;
}

.fps-start-button:hover:not(:disabled) {
  background: rgba(120, 220, 255, 0.18);
  box-shadow: 0 0 24px rgba(120, 220, 255, 0.25);
  transform: translateY(-1px);
}

.fps-start-button:active:not(:disabled) {
  transform: translateY(0);
}

.fps-start-button:disabled {
  opacity: 0.55;
  cursor: progress;
}

.fps-start-hint {
  font-size: 0.7rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: rgba(180, 200, 220, 0.5);
}
</style>
