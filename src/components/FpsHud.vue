<!-- src/components/FpsHud.vue -->
<script setup lang="ts">
/** Telemetry data from FpsPlayerController for HUD display. */
export interface FpsTelemetry {
  /** Current O2 remaining */
  o2Level: number
  /** Maximum O2 capacity */
  o2Capacity: number
  /** Current sprint charge */
  sprintCharge: number
  /** Maximum sprint charge */
  sprintCapacity: number
  /** Current lateral speed */
  speed: number
  /** Whether player is on the ground */
  grounded: boolean
  /** Death timer seconds remaining, or null if not active */
  deathTimer: number | null
}

const props = defineProps<{ telemetry: FpsTelemetry }>()

function pct(value: number, max: number): number {
  return max > 0 ? (value / max) * 100 : 0
}

function o2Color(): string {
  const ratio = props.telemetry.o2Level / props.telemetry.o2Capacity
  if (ratio > 0.5) return 'var(--color-o2-high)'
  if (ratio > 0.2) return 'var(--color-o2-mid)'
  return 'var(--color-o2-low)'
}
</script>

<template>
  <div class="fps-hud">
    <!-- O2 Bar -->
    <div class="fps-hud__o2">
      <span class="fps-hud__label">O2</span>
      <div class="fps-hud__bar-track">
        <div
          class="fps-hud__bar-fill"
          :style="{ width: pct(telemetry.o2Level, telemetry.o2Capacity) + '%', backgroundColor: o2Color() }"
        />
      </div>
      <span class="fps-hud__value">{{ Math.ceil(telemetry.o2Level) }}</span>
    </div>

    <!-- Sprint Bar -->
    <div class="fps-hud__sprint">
      <span class="fps-hud__label">STA</span>
      <div class="fps-hud__bar-track fps-hud__bar-track--small">
        <div
          class="fps-hud__bar-fill fps-hud__bar-fill--sprint"
          :style="{ width: pct(telemetry.sprintCharge, telemetry.sprintCapacity) + '%' }"
        />
      </div>
    </div>

    <!-- Crosshair -->
    <div class="fps-hud__crosshair">+</div>

    <!-- Speed -->
    <div class="fps-hud__speed">
      <span class="fps-hud__label">SPD</span>
      <span class="fps-hud__value">{{ telemetry.speed.toFixed(1) }}</span>
    </div>

    <!-- Death Timer -->
    <div v-if="telemetry.deathTimer !== null" class="fps-hud__death">
      {{ Math.ceil(telemetry.deathTimer) }}s
    </div>
  </div>
</template>

<style>
:root {
  --color-o2-high: #3b82f6;
  --color-o2-mid: #f59e0b;
  --color-o2-low: #ef4444;
}

.fps-hud {
  @apply(fixed inset-0 pointer-events-none font-mono text-white/90);
}

.fps-hud__o2 {
  @apply(absolute top-4 left-4 flex items-center gap-2);
}

.fps-hud__sprint {
  @apply(absolute top-12 left-4 flex items-center gap-2);
}

.fps-hud__label {
  @apply(text-xs tracking-widest uppercase text-white/60 w-8);
}

.fps-hud__value {
  @apply(text-xs text-white/60 w-8 text-right);
}

.fps-hud__bar-track {
  @apply(w-40 h-3 bg-white/10 rounded-sm overflow-hidden);
}

.fps-hud__bar-track--small {
  @apply(h-2 w-32);
}

.fps-hud__bar-fill {
  @apply(h-full transition-all duration-100);
}

.fps-hud__bar-fill--sprint {
  @apply(bg-green-400/80);
}

.fps-hud__crosshair {
  @apply(absolute inset-0 flex items-center justify-center text-2xl text-white/40 select-none);
}

.fps-hud__speed {
  @apply(absolute bottom-4 left-4 flex items-center gap-2);
}

.fps-hud__death {
  @apply(absolute top-1/3 left-1/2 -translate-x-1/2 text-4xl text-red-500 animate-pulse tracking-widest);
}
</style>
