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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
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
  DRIFT_FOCUS,
  DRIFT_CHROMA,
  DRIFT_AZIMUTH,
  DRIFT_ELEVATION,
  LOCK_ANIMATION_MS,
  CAPTION_FADE_MS,
} from '@/lib/minigame/telescopeAlignment/constants'
import { computeDrift } from '@/lib/minigame/telescopeAlignment/drift'
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

/** Lock-in state machine: player is tuning, locking in (animating), or fully locked. */
type LockState = 'calibrating' | 'locking' | 'locked'
const lockState = ref<LockState>('calibrating')

/** Ease-out-cubic for the knob-zeroing animation. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Kick off the lock-in sequence. Animates knobs to zero, then calls complete. */
function handleLockIn(): void {
  if (!canLock.value || lockState.value !== 'calibrating') return
  lockState.value = 'locking'
  const start = performance.now()
  const initial: KnobState = { ...knobs }
  function step(now: number): void {
    const tNorm = Math.min(1, (now - start) / LOCK_ANIMATION_MS)
    const k = 1 - easeOutCubic(tNorm)
    knobs.focus = initial.focus * k
    knobs.chroma = initial.chroma * k
    knobs.azimuth = initial.azimuth * k
    knobs.elevation = initial.elevation * k
    if (tNorm < 1) {
      requestAnimationFrame(step)
    } else {
      lockState.value = 'locked'
      props.minigame.complete()
      window.setTimeout(() => emit('complete'), CAPTION_FADE_MS)
    }
  }
  requestAnimationFrame(step)
}

/** Status-bar text reflecting current lock state. */
const statusText = computed(() => {
  if (lockState.value === 'locked') return 'CAPTURE COMPLETE'
  if (lockState.value === 'locking') return 'LOCKING IN'
  return canLock.value ? 'SIGNAL LOCK AVAILABLE' : 'CALIBRATING'
})

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

const driftTime = ref(0)
let rafId = 0
let lastTs = 0

/** Duration in ms of the knob key-pulse flash. */
const KNOB_PULSE_MS = 180

/** Timestamps of the last pulse per axis — compared against performance.now(). */
const pulse = reactive<Record<keyof KnobState, number>>({
  focus: 0,
  chroma: 0,
  azimuth: 0,
  elevation: 0,
})

/** Trigger a brief visual pulse on a knob axis. */
function pulseKnob(axis: keyof KnobState): void {
  pulse[axis] = performance.now()
}

/**
 * Wheel-scroll on a knob adjusts it by one step.
 * Scrolling down is +1 (increase error), up is −1 (decrease error).
 * Holding Shift applies the fine-step multiplier.
 *
 * @param e - The WheelEvent from the knob element.
 * @param axis - Which knob axis to adjust.
 */
function onKnobWheel(e: WheelEvent, axis: keyof KnobState): void {
  if (lockState.value !== 'calibrating') return
  const dir: -1 | 1 = e.deltaY > 0 ? 1 : -1
  adjust(axis, dir, e.shiftKey)
  pulseKnob(axis)
}

/** Reactive check — is this axis currently flashing? Driven off driftTime (RAF tick). */
function isPulsing(axis: keyof KnobState): boolean {
  // Tying the expression to driftTime.value ensures Vue re-evaluates on every RAF tick,
  // so the pulse fades out without a dedicated timer.
  void driftTime.value
  return performance.now() - pulse[axis] < KNOB_PULSE_MS
}

/** Displayed knob values = raw intent + bounded per-axis sine drift. */
const displayedKnobs = computed<KnobState>(() => ({
  focus: Math.max(0, knobs.focus + computeDrift(driftTime.value, DRIFT_FOCUS, MAX_FOCUS)),
  chroma: Math.max(0, knobs.chroma + computeDrift(driftTime.value, DRIFT_CHROMA, MAX_CHROMA)),
  azimuth: knobs.azimuth + computeDrift(driftTime.value, DRIFT_AZIMUTH, MAX_POINTING),
  elevation: knobs.elevation + computeDrift(driftTime.value, DRIFT_ELEVATION, MAX_POINTING),
}))

/** RAF loop — advance drift time, recompute displayed knob values, push quality. */
function tick(ts: number): void {
  if (lastTs === 0) lastTs = ts
  const dt = (ts - lastTs) / 1000
  lastTs = ts
  driftTime.value += dt
  props.minigame.reportQuality(computeQuality(displayedKnobs.value))
  rafId = requestAnimationFrame(tick)
}

const quality = computed(() => computeQuality(displayedKnobs.value))
const qualityPct = computed(() => Math.round(quality.value * 100))
const canLock = computed(() => quality.value >= LOCK_THRESHOLD)

const focusQ = computed(() => perKnobQuality(displayedKnobs.value.focus, MAX_FOCUS))
const chromaQ = computed(() => perKnobQuality(displayedKnobs.value.chroma, MAX_CHROMA))
const azQ = computed(() => perKnobQuality(displayedKnobs.value.azimuth, MAX_POINTING))
const elQ = computed(() => perKnobQuality(displayedKnobs.value.elevation, MAX_POINTING))

const focusLed = computed(() => ledColor(focusQ.value))
const chromaLed = computed(() => ledColor(chromaQ.value))
const azLed = computed(() => ledColor(azQ.value))
const elLed = computed(() => ledColor(elQ.value))

const pointingDistNorm = computed(() => {
  const ax = displayedKnobs.value.azimuth / MAX_POINTING
  const ay = displayedKnobs.value.elevation / MAX_POINTING
  return Math.min(1, Math.sqrt(ax * ax + ay * ay) / Math.SQRT2)
})
const pointingCentered = computed(() => pointingDistNorm.value < POINTING_CENTERED_THRESHOLD)
const pointingDotX = computed(
  () => 50 + (displayedKnobs.value.azimuth / MAX_POINTING) * POINTING_DOT_HALF_RANGE_PCT,
)
const pointingDotY = computed(
  () => 50 + (displayedKnobs.value.elevation / MAX_POINTING) * POINTING_DOT_HALF_RANGE_PCT,
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
  else if (axis === 'azimuth') knobs.azimuth = Math.max(-MAX_POINTING, Math.min(MAX_POINTING, next))
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

  // Escape always aborts, regardless of lock state.
  if (k === 'escape') {
    e.preventDefault()
    emit('close')
    return
  }

  // Once we're locking or locked, freeze tuning input.
  if (lockState.value !== 'calibrating') return

  switch (k) {
    case 'q':
      e.preventDefault()
      adjust('focus', -1, fine)
      pulseKnob('focus')
      break
    case 'w':
      e.preventDefault()
      adjust('focus', +1, fine)
      pulseKnob('focus')
      break
    case 'a':
      e.preventDefault()
      adjust('chroma', -1, fine)
      pulseKnob('chroma')
      break
    case 's':
      e.preventDefault()
      adjust('chroma', +1, fine)
      pulseKnob('chroma')
      break
    case 'z':
      e.preventDefault()
      adjust('azimuth', -1, fine)
      pulseKnob('azimuth')
      break
    case 'x':
      e.preventDefault()
      adjust('azimuth', +1, fine)
      pulseKnob('azimuth')
      break
    case 'c':
      e.preventDefault()
      adjust('elevation', -1, fine)
      pulseKnob('elevation')
      break
    case 'v':
      e.preventDefault()
      adjust('elevation', +1, fine)
      pulseKnob('elevation')
      break
    case 'e':
      if (canLock.value) {
        e.preventDefault()
        handleLockIn()
      }
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
  const d = displayedKnobs.value
  const sign = channel === 'r' ? -1 : channel === 'b' ? 1 : 0
  const dx = d.chroma * sign + d.azimuth
  const dy = d.elevation
  return {
    filter: `blur(${Math.max(0, d.focus).toFixed(2)}px)`,
    transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`,
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  cancelAnimationFrame(rafId)
})
</script>

<template>
  <div class="telescope-overlay" role="dialog" aria-label="Telescope alignment" tabindex="0">
    <div class="telescope-status">
      <span class="telescope-status__location">{{ target.label }}</span>
      <span class="telescope-status__mission">{{ mission.template.name }}</span>
      <span class="telescope-status__state">{{ statusText }}</span>
    </div>

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

    <div class="telescope-quality">
      <div class="telescope-quality__label">SIGNAL QUALITY</div>
      <div class="telescope-quality__bar">
        <span
          :style="{ width: `${qualityPct}%` }"
          :class="canLock ? 'telescope-bar-green' : 'telescope-bar-amber'"
        />
      </div>
      <div class="telescope-quality__pct">{{ qualityPct }}%</div>
    </div>

    <div class="telescope-knobs">
      <div class="telescope-knob" @wheel.prevent="onKnobWheel($event, 'focus')">
        <div
          class="telescope-knob__dial"
          :class="[`telescope-led-${focusLed}`, { 'telescope-knob-pulse': isPulsing('focus') }]"
          data-axis="focus"
          aria-label="Focus knob"
        />
        <div class="telescope-knob__label">FOCUS · Q/W</div>
        <div class="telescope-knob__bar">
          <span
            :style="{ width: `${Math.round(focusQ * 100)}%` }"
            :class="`telescope-bar-${focusLed}`"
          />
        </div>
      </div>

      <div class="telescope-knob" @wheel.prevent="onKnobWheel($event, 'chroma')">
        <div
          class="telescope-knob__dial"
          :class="[`telescope-led-${chromaLed}`, { 'telescope-knob-pulse': isPulsing('chroma') }]"
          data-axis="chroma"
          aria-label="Chromatic aberration knob"
        />
        <div class="telescope-knob__label">CHROMA · A/S</div>
        <div class="telescope-knob__bar">
          <span
            :style="{ width: `${Math.round(chromaQ * 100)}%` }"
            :class="`telescope-bar-${chromaLed}`"
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

      <div class="telescope-knob" @wheel.prevent="onKnobWheel($event, 'azimuth')">
        <div
          class="telescope-knob__dial"
          :class="[`telescope-led-${azLed}`, { 'telescope-knob-pulse': isPulsing('azimuth') }]"
          data-axis="azimuth"
          aria-label="Azimuth pointing knob"
        />
        <div class="telescope-knob__label">AZIMUTH · Z/X</div>
        <div class="telescope-knob__bar">
          <span :style="{ width: `${Math.round(azQ * 100)}%` }" :class="`telescope-bar-${azLed}`" />
        </div>
      </div>

      <div class="telescope-knob" @wheel.prevent="onKnobWheel($event, 'elevation')">
        <div
          class="telescope-knob__dial"
          :class="[`telescope-led-${elLed}`, { 'telescope-knob-pulse': isPulsing('elevation') }]"
          data-axis="elevation"
          aria-label="Elevation pointing knob"
        />
        <div class="telescope-knob__label">ELEVATION · C/V</div>
        <div class="telescope-knob__bar">
          <span :style="{ width: `${Math.round(elQ * 100)}%` }" :class="`telescope-bar-${elLed}`" />
        </div>
      </div>
    </div>

    <div class="telescope-hints">
      <span>Q/W FOCUS</span>
      <span>A/S CHROMA</span>
      <span>Z/X AZ</span>
      <span>C/V EL</span>
      <span>SHIFT · FINE</span>
      <span>WHEEL · ADJUST</span>
      <span>E · LOCK IN (≥95%)</span>
      <span>ESC · ABORT</span>
    </div>

    <transition name="telescope-caption">
      <div v-if="lockState === 'locked'" class="telescope-caption">
        <div class="telescope-caption__label">{{ target.label }}</div>
        <div class="telescope-caption__body">{{ target.caption }}</div>
      </div>
    </transition>
  </div>
</template>
