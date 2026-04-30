<!-- src/components/DebugHud.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, reactive } from 'vue'
import { debugMetrics, type DebugTickableSample } from '@/lib/debug/debugMetrics'

/** HUD refresh cadence — 5 Hz keeps the readout legible without flicker. */
const REFRESH_INTERVAL_MS = 200

/** ms threshold at which the peak readout flashes red — anything past one frame is bad. */
const PEAK_BAD_MS = 33

/** ms threshold at which the peak readout warns yellow. */
const PEAK_WARN_MS = 20

/**
 * Locally mirrored snapshot of {@link debugMetrics}. Polled on a fixed
 * interval rather than reactively wired to the per-frame tracker so the
 * HUD itself does not measurably impact the frame budget being measured.
 */
const view = reactive({
  active: false,
  fps: 0,
  frameMs: 0,
  peakFrameMs: 0,
  memMB: Number.NaN,
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  programs: 0,
  programsDelta: 0,
  enemies: 0,
  projectiles: 0,
  topTickables: [] as DebugTickableSample[],
})

let intervalHandle: ReturnType<typeof setInterval> | null = null

function pollMetrics(): void {
  view.active = debugMetrics.active
  view.fps = debugMetrics.fps
  view.frameMs = debugMetrics.frameMs
  view.peakFrameMs = debugMetrics.peakFrameMs
  view.memMB = debugMetrics.memMB
  view.drawCalls = debugMetrics.drawCalls
  view.triangles = debugMetrics.triangles
  view.geometries = debugMetrics.geometries
  view.textures = debugMetrics.textures
  view.programs = debugMetrics.programs
  view.programsDelta = debugMetrics.programsDelta
  view.enemies = debugMetrics.enemies
  view.projectiles = debugMetrics.projectiles
  view.topTickables = debugMetrics.topTickables.map((sample) => ({
    name: sample.name,
    ms: sample.ms,
  }))
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString()
}

function fmtFps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value.toFixed(0)
}

function fmtMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value.toFixed(1)
}

function fmtMem(value: number): string {
  if (!Number.isFinite(value)) return 'n/a'
  return `${value.toFixed(0)} MB`
}

function fpsClass(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'debug-hud__value'
  if (value < 30) return 'debug-hud__value debug-hud__value--bad'
  if (value < 50) return 'debug-hud__value debug-hud__value--warn'
  return 'debug-hud__value debug-hud__value--good'
}

function peakClass(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'debug-hud__value'
  if (value > PEAK_BAD_MS) return 'debug-hud__value debug-hud__value--bad'
  if (value > PEAK_WARN_MS) return 'debug-hud__value debug-hud__value--warn'
  return 'debug-hud__value debug-hud__value--good'
}

function programsDeltaClass(delta: number): string {
  if (delta > 0) return 'debug-hud__delta debug-hud__delta--bad'
  if (delta < 0) return 'debug-hud__delta'
  return 'debug-hud__delta debug-hud__delta--mute'
}

function tickableMsClass(ms: number): string {
  if (ms > 8) return 'debug-hud__value debug-hud__value--bad'
  if (ms > 3) return 'debug-hud__value debug-hud__value--warn'
  return 'debug-hud__value'
}

onMounted(() => {
  pollMetrics()
  intervalHandle = setInterval(pollMetrics, REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
})
</script>

<template>
  <div class="debug-hud" role="status" aria-live="off">
    <div class="debug-hud__title">DEBUG</div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">FPS</span>
      <span :class="fpsClass(view.fps)">{{ fmtFps(view.fps) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">FRAME</span>
      <span class="debug-hud__value">{{ fmtMs(view.frameMs) }} ms</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">PEAK 2s</span>
      <span :class="peakClass(view.peakFrameMs)">{{ fmtMs(view.peakFrameMs) }} ms</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">MEM</span>
      <span class="debug-hud__value">{{ fmtMem(view.memMB) }}</span>
    </div>
    <div class="debug-hud__sep" />
    <div class="debug-hud__row">
      <span class="debug-hud__label">DRAWS</span>
      <span class="debug-hud__value">{{ fmt(view.drawCalls) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">TRIS</span>
      <span class="debug-hud__value">{{ fmt(view.triangles) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">GEOM</span>
      <span class="debug-hud__value">{{ fmt(view.geometries) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">TEX</span>
      <span class="debug-hud__value">{{ fmt(view.textures) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">PROG</span>
      <span class="debug-hud__value">
        {{ fmt(view.programs) }}
        <span v-if="view.programsDelta !== 0" :class="programsDeltaClass(view.programsDelta)">
          {{ view.programsDelta > 0 ? '+' : '' }}{{ view.programsDelta }}
        </span>
      </span>
    </div>
    <div class="debug-hud__sep" />
    <div class="debug-hud__row">
      <span class="debug-hud__label">ENEMY</span>
      <span class="debug-hud__value">{{ fmt(view.enemies) }}</span>
    </div>
    <div class="debug-hud__row">
      <span class="debug-hud__label">PROJ</span>
      <span class="debug-hud__value">{{ fmt(view.projectiles) }}</span>
    </div>
    <div v-if="view.topTickables.length > 0" class="debug-hud__sep" />
    <div v-if="view.topTickables.length > 0" class="debug-hud__sub">TOP TICK</div>
    <div
      v-for="sample in view.topTickables"
      :key="sample.name"
      class="debug-hud__row debug-hud__row--tick"
    >
      <span class="debug-hud__label debug-hud__label--tick" :title="sample.name">{{
        sample.name
      }}</span>
      <span :class="tickableMsClass(sample.ms)">{{ sample.ms.toFixed(2) }}</span>
    </div>
  </div>
</template>

<style>
.debug-hud {
  position: fixed;
  top: max(0.75rem, env(safe-area-inset-top, 0px) + 0.5rem);
  right: max(0.75rem, env(safe-area-inset-right, 0px) + 0.5rem);
  z-index: 80;
  pointer-events: none;
  min-width: 11rem;
  max-width: 14rem;
  padding: 0.5rem 0.7rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  color: rgba(186, 230, 253, 0.92);
  background: rgba(2, 6, 23, 0.78);
  border: 1px solid rgba(34, 211, 238, 0.32);
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.06),
    0 6px 18px rgba(2, 6, 23, 0.45);
  user-select: none;
}
.debug-hud__title {
  color: rgba(102, 255, 238, 0.95);
  font-size: 0.68rem;
  letter-spacing: 0.28em;
  margin-bottom: 0.35rem;
  text-align: center;
  text-transform: uppercase;
}
.debug-hud__sub {
  color: rgba(102, 255, 238, 0.7);
  font-size: 0.62rem;
  letter-spacing: 0.24em;
  margin-bottom: 0.25rem;
  text-transform: uppercase;
}
.debug-hud__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  line-height: 1.35;
}
.debug-hud__row--tick {
  gap: 0.5rem;
}
.debug-hud__label {
  color: rgba(125, 211, 252, 0.65);
  text-transform: uppercase;
  font-size: 0.65rem;
}
.debug-hud__label--tick {
  text-transform: none;
  letter-spacing: 0.04em;
  font-size: 0.65rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.debug-hud__value {
  color: rgba(226, 245, 255, 0.95);
  font-variant-numeric: tabular-nums;
}
.debug-hud__value--good {
  color: #4ade80;
}
.debug-hud__value--warn {
  color: #facc15;
}
.debug-hud__value--bad {
  color: #f87171;
  text-shadow: 0 0 6px rgba(248, 113, 113, 0.5);
}
.debug-hud__delta {
  margin-left: 0.35rem;
  font-size: 0.62rem;
  font-variant-numeric: tabular-nums;
  color: rgba(125, 211, 252, 0.85);
}
.debug-hud__delta--bad {
  color: #f87171;
  text-shadow: 0 0 6px rgba(248, 113, 113, 0.6);
}
.debug-hud__delta--mute {
  color: rgba(125, 211, 252, 0.45);
}
.debug-hud__sep {
  height: 1px;
  margin: 0.35rem 0;
  background: linear-gradient(to right, transparent, rgba(34, 211, 238, 0.35), transparent);
}
</style>
