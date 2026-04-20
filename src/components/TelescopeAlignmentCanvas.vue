<!--
  TelescopeAlignmentCanvas.vue

  Overlay canvas for the telescope alignment minigame. Structured as a fixed
  full-viewport panel with: status bar, eyepiece (blurred / chromatic /
  offset image), four knob slots, 2D pointing indicator, signal-quality bar,
  controls hint row. Image rendering in Task 9; drift + lock-in in Task 10.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive } from 'vue'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'
import { getTelescopeTarget } from '@/lib/minigame/telescopeAlignment/targets'
import {
  MAX_FOCUS,
  MAX_CHROMA,
  MAX_POINTING,
  LOCK_THRESHOLD,
  STEP_COARSE,
  STEP_POINTING,
  STEP_FINE_MUL,
} from '@/lib/minigame/telescopeAlignment/constants'
import { computeQuality, perKnobQuality, ledColor } from '@/lib/minigame/telescopeAlignment/quality'
import type { KnobState } from '@/lib/minigame/telescopeAlignment/types'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active telescope minigame instance. */
  minigame: TelescopeAlignmentMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

const target = getTelescopeTarget(props.mission.template.id)

/** Placeholder handler until lock-in ships in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}

/** Initial knob roll — magnitude 40–100% of range so players always start misaligned. */
const INIT_ROLL_MIN = 0.4
/** Random range added on top of INIT_ROLL_MIN so the knob lands in [40%, 100%] of max. */
const INIT_ROLL_RANGE = 0.6

/** Threshold below which the pointing dot reads CENTERED. */
const POINTING_CENTERED_THRESHOLD = 0.05
/** Horizontal/vertical range of the crosshair dot as a percent of the crosshair box. */
const POINTING_DOT_HALF_RANGE_PCT = 45

/**
 * Randomize an initial unsigned knob value in [INIT_ROLL_MIN, 1.0] of its range.
 *
 * @param range - Maximum absolute value for the knob axis.
 * @returns A positive offset ensuring players start misaligned.
 */
function rollUnsigned(range: number): number {
  return range * (INIT_ROLL_MIN + Math.random() * INIT_ROLL_RANGE)
}

/**
 * Randomize an initial signed knob value in ±[INIT_ROLL_MIN, 1.0] of its range.
 *
 * @param range - Maximum absolute value for the knob axis.
 * @returns A signed offset ensuring players start misaligned on pointing axes.
 */
function rollSigned(range: number): number {
  return (Math.random() < 0.5 ? -1 : 1) * rollUnsigned(range)
}

const knobs = reactive<KnobState>({
  focus: rollUnsigned(MAX_FOCUS),
  chroma: rollUnsigned(MAX_CHROMA),
  azimuth: rollSigned(MAX_POINTING),
  elevation: rollSigned(MAX_POINTING),
})

const quality = computed(() => computeQuality(knobs))
const qualityPct = computed(() => Math.round(quality.value * 100))
const canLock = computed(() => quality.value >= LOCK_THRESHOLD)

const focusQ = computed(() => perKnobQuality(knobs.focus, MAX_FOCUS))
const chromaQ = computed(() => perKnobQuality(knobs.chroma, MAX_CHROMA))
const azQ = computed(() => perKnobQuality(knobs.azimuth, MAX_POINTING))
const elQ = computed(() => perKnobQuality(knobs.elevation, MAX_POINTING))

const focusLed = computed(() => ledColor(focusQ.value))
const chromaLed = computed(() => ledColor(chromaQ.value))
const azLed = computed(() => ledColor(azQ.value))
const elLed = computed(() => ledColor(elQ.value))

const pointingDistNorm = computed(() => {
  const ax = knobs.azimuth / MAX_POINTING
  const ay = knobs.elevation / MAX_POINTING
  return Math.min(1, Math.sqrt(ax * ax + ay * ay) / Math.SQRT2)
})
const pointingCentered = computed(() => pointingDistNorm.value < POINTING_CENTERED_THRESHOLD)
const pointingDotX = computed(
  () => 50 + (knobs.azimuth / MAX_POINTING) * POINTING_DOT_HALF_RANGE_PCT,
)
const pointingDotY = computed(
  () => 50 + (knobs.elevation / MAX_POINTING) * POINTING_DOT_HALF_RANGE_PCT,
)

/**
 * Adjust a knob in a given direction, optionally with Shift fine-mode.
 *
 * @param axis - Which knob to move.
 * @param dir - Direction of adjustment (+1 or -1).
 * @param fine - Whether Shift is held for fractional step.
 */
function adjust(axis: keyof KnobState, dir: -1 | 1, fine: boolean): void {
  const step =
    (axis === 'azimuth' || axis === 'elevation' ? STEP_POINTING : STEP_COARSE) *
    (fine ? STEP_FINE_MUL : 1)
  const next = knobs[axis] + dir * step
  if (axis === 'focus') knobs.focus = Math.max(0, Math.min(MAX_FOCUS, next))
  else if (axis === 'chroma') knobs.chroma = Math.max(0, Math.min(MAX_CHROMA, next))
  else if (axis === 'azimuth')
    knobs.azimuth = Math.max(-MAX_POINTING, Math.min(MAX_POINTING, next))
  else knobs.elevation = Math.max(-MAX_POINTING, Math.min(MAX_POINTING, next))
  props.minigame.reportQuality(computeQuality(knobs))
}

/**
 * Keyboard handler: Q/W focus, A/S chroma, Z/X azimuth, C/V elevation; Shift = fine.
 *
 * @param e - The keyboard event from window.
 */
function onKeyDown(e: KeyboardEvent): void {
  const k = e.key.toLowerCase()
  const fine = e.shiftKey
  switch (k) {
    case 'q':
      e.preventDefault()
      adjust('focus', -1, fine)
      break
    case 'w':
      e.preventDefault()
      adjust('focus', +1, fine)
      break
    case 'a':
      e.preventDefault()
      adjust('chroma', -1, fine)
      break
    case 's':
      e.preventDefault()
      adjust('chroma', +1, fine)
      break
    case 'z':
      e.preventDefault()
      adjust('azimuth', -1, fine)
      break
    case 'x':
      e.preventDefault()
      adjust('azimuth', +1, fine)
      break
    case 'c':
      e.preventDefault()
      adjust('elevation', -1, fine)
      break
    case 'v':
      e.preventDefault()
      adjust('elevation', +1, fine)
      break
    default:
      break
  }
}

/** Chromatic-aberration channel sign: R offsets left, B offsets right, G stays centered. */
type ChromaChannel = 'r' | 'g' | 'b'

/**
 * CSS style for one chromatic-aberration layer: base blur + channel-offset translate.
 * The three layers are stacked with mix-blend-mode: screen so R/G/B recombine into
 * a sharp image when `chroma` is zero, and fringe visibly as `chroma` rises.
 *
 * @param channel - Which R/G/B layer this style is for.
 * @returns Inline CSS for the `<img>` element.
 */
function eyepieceImageStyle(channel: ChromaChannel): Record<string, string> {
  const sign = channel === 'r' ? -1 : channel === 'b' ? 1 : 0
  const dx = knobs.chroma * sign + knobs.azimuth
  const dy = knobs.elevation
  return {
    filter: `blur(${Math.max(0, knobs.focus).toFixed(2)}px)`,
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  props.minigame.reportQuality(quality.value)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="telescope-overlay">
    <div class="telescope-status">
      <span class="telescope-status__location">{{ target.label }}</span>
      <span class="telescope-status__mission">{{ mission.template.name }}</span>
      <span class="telescope-status__state">
        {{ canLock ? 'SIGNAL LOCK AVAILABLE' : 'CALIBRATING' }}
      </span>
    </div>

    <div class="telescope-body">
      <div class="telescope-eyepiece" aria-label="Telescope eyepiece">
        <img
          class="telescope-eyepiece__img telescope-eyepiece__img--r"
          :src="`/telescope/${target.image}`"
          :alt="target.label"
          :style="eyepieceImageStyle('r')"
        />
        <img
          class="telescope-eyepiece__img telescope-eyepiece__img--g"
          :src="`/telescope/${target.image}`"
          alt=""
          aria-hidden="true"
          :style="eyepieceImageStyle('g')"
        />
        <img
          class="telescope-eyepiece__img telescope-eyepiece__img--b"
          :src="`/telescope/${target.image}`"
          alt=""
          aria-hidden="true"
          :style="eyepieceImageStyle('b')"
        />
      </div>

      <div class="telescope-knobs">
        <div class="telescope-knob">
          <div class="telescope-knob__dial" :class="`led-${focusLed}`" data-axis="focus" />
          <div class="telescope-knob__label">FOCUS · Q/W</div>
          <div class="telescope-knob__bar">
            <span
              :style="{ width: `${Math.round(focusQ * 100)}%` }"
              :class="`bar-${focusLed}`"
            />
          </div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" :class="`led-${chromaLed}`" data-axis="chroma" />
          <div class="telescope-knob__label">CHROMA · A/S</div>
          <div class="telescope-knob__bar">
            <span
              :style="{ width: `${Math.round(chromaQ * 100)}%` }"
              :class="`bar-${chromaLed}`"
            />
          </div>
        </div>
        <div class="telescope-pointing">
          <div class="telescope-pointing__crosshair">
            <span
              class="telescope-pointing__dot"
              :style="{ left: `${pointingDotX}%`, top: `${pointingDotY}%` }"
            />
          </div>
          <div class="telescope-pointing__caption">
            {{ pointingCentered ? 'CENTERED' : `${Math.round(pointingDistNorm * 100)}% OFF` }}
          </div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" :class="`led-${azLed}`" data-axis="azimuth" />
          <div class="telescope-knob__label">AZIMUTH · Z/X</div>
          <div class="telescope-knob__bar">
            <span
              :style="{ width: `${Math.round(azQ * 100)}%` }"
              :class="`bar-${azLed}`"
            />
          </div>
        </div>
        <div class="telescope-knob">
          <div class="telescope-knob__dial" :class="`led-${elLed}`" data-axis="elevation" />
          <div class="telescope-knob__label">ELEVATION · C/V</div>
          <div class="telescope-knob__bar">
            <span
              :style="{ width: `${Math.round(elQ * 100)}%` }"
              :class="`bar-${elLed}`"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="telescope-quality">
      <div class="telescope-quality__label">SIGNAL QUALITY</div>
      <div class="telescope-quality__bar">
        <span
          :style="{ width: `${qualityPct}%` }"
          :class="canLock ? 'bar-green' : 'bar-amber'"
        />
      </div>
      <div class="telescope-quality__pct">{{ qualityPct }}%</div>
    </div>

    <div class="telescope-hints">
      <span>Q/W FOCUS</span>
      <span>A/S CHROMA</span>
      <span>Z/X AZ</span>
      <span>C/V EL</span>
      <span>SHIFT · FINE</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <button type="button" class="telescope-temp-complete" @click="handleTempComplete">
      (WIP) Complete
    </button>
    <button type="button" class="telescope-close" @click="emit('close')">Close</button>
  </div>
</template>

<style scoped>
.telescope-overlay {
  @apply fixed inset-0 z-50 flex flex-col gap-4 p-6 font-mono text-cyan-100;
  background-color: #05070c;
}
.telescope-status {
  @apply flex justify-between items-center border border-cyan-400/25 px-4 py-2 text-sm tracking-widest;
}
.telescope-body {
  @apply flex-1 grid gap-4;
  grid-template-columns: 1fr 360px;
}
.telescope-eyepiece {
  @apply relative rounded-full overflow-hidden border border-cyan-400/25 self-center justify-self-center;
  width: 780px;
  height: 780px;
  max-width: 80vmin;
  max-height: 80vmin;
  aspect-ratio: 1 / 1;
}
.telescope-eyepiece__img {
  @apply absolute inset-0 w-full h-full object-cover pointer-events-none;
  mix-blend-mode: screen;
}
.telescope-knobs {
  @apply flex flex-col gap-3;
}
.telescope-knob {
  @apply flex flex-col gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-knob__dial {
  @apply w-[72px] h-[72px] border border-cyan-400/40 rounded-full self-center;
}
.telescope-knob__label {
  @apply text-xs tracking-widest text-center;
}
.telescope-knob__bar {
  @apply h-1 bg-cyan-400/10;
}
.telescope-knob__bar span {
  @apply block h-full;
}
.telescope-pointing {
  @apply flex flex-col items-center gap-1 border border-cyan-400/25 p-2 rounded-sm;
}
.telescope-pointing__crosshair {
  @apply relative w-[72px] h-[72px] border border-cyan-400/40;
}
.telescope-pointing__dot {
  @apply absolute w-2 h-2 rounded-full bg-cyan-300;
  transform: translate(-50%, -50%);
}
.telescope-pointing__caption {
  @apply text-xs tracking-widest;
}
.telescope-quality {
  @apply flex items-center gap-3 border border-cyan-400/25 px-4 py-2 text-sm;
}
.telescope-quality__bar {
  @apply flex-1 h-2 bg-cyan-400/10;
}
.telescope-quality__bar span {
  @apply block h-full;
}
.telescope-hints {
  @apply flex flex-wrap gap-4 text-xs tracking-widest text-cyan-200;
}
.telescope-temp-complete,
.telescope-close {
  @apply absolute top-4 right-4 px-3 py-1 border border-cyan-400/40 rounded text-cyan-100;
}
.telescope-close {
  right: 140px;
}
.bar-red {
  @apply bg-red-400;
}
.bar-amber {
  @apply bg-amber-400;
}
.bar-green {
  @apply bg-emerald-400;
}
.led-red {
  border-color: #f87171;
}
.led-amber {
  border-color: #fbbf24;
}
.led-green {
  border-color: #34d399;
}
</style>
