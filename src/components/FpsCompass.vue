<!-- src/components/FpsCompass.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import type { CompassObjective } from '@/lib/ui/fpsHudTypes'

const props = defineProps<{
  headingRad: number
  objectives: CompassObjective[]
}>()

/** Pixels per degree on the compass strip. */
const TICK_SPACING = 4

/** Maximum POI offset before clamping to edge. */
const MAX_POI_OFFSET = 150

/** Cardinal/intercardinal labels at 45-degree intervals. */
const LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
}

/** Color per objective type. */
const TYPE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
  collect: '#66d9ff',
}

const headingDeg = computed(() => {
  return ((((-props.headingRad * 180) / Math.PI) % 360) + 360) % 360
})

const offset = computed(() => -headingDeg.value * TICK_SPACING)

/** Generate 720 degrees of ticks for seamless wrapping. */
const ticks = computed(() => {
  const out: { deg: number; label?: string; major: boolean; cardinal: boolean }[] = []
  for (let d = -180; d < 540; d += 5) {
    const norm = ((d % 360) + 360) % 360
    const cardinal = norm % 45 === 0
    out.push({
      deg: d,
      label: cardinal ? LABELS[norm] : undefined,
      major: cardinal,
      cardinal,
    })
  }
  return out
})

/** Position POI markers on strip with clamping. */
const poiMarkers = computed(() => {
  return props.objectives.map((obj) => {
    let offsetPx = obj.relativeDeg * TICK_SPACING
    let clamped = false
    if (offsetPx > MAX_POI_OFFSET) {
      offsetPx = MAX_POI_OFFSET
      clamped = true
    } else if (offsetPx < -MAX_POI_OFFSET) {
      offsetPx = -MAX_POI_OFFSET
      clamped = true
    }
    return {
      id: obj.id,
      label: obj.label,
      type: obj.type,
      offsetPx,
      clamped,
      color: TYPE_COLORS[obj.type] ?? '#66ffee',
    }
  })
})
</script>

<template>
  <div class="compass">
    <div class="compass__track" :style="{ transform: `translateX(${offset}px)` }">
      <div
        v-for="tick in ticks"
        :key="tick.deg"
        class="compass__tick"
        :class="{
          'compass__tick--major': tick.major,
          'compass__tick--cardinal': tick.cardinal,
        }"
        :style="{ left: `${tick.deg * TICK_SPACING}px` }"
      >
        <span v-if="tick.label" class="compass__label">{{ tick.label }}</span>
      </div>
    </div>
    <!-- Objective markers -->
    <div
      v-for="poi in poiMarkers"
      :key="poi.id"
      class="compass__poi"
      :style="{
        left: `calc(50% + ${poi.offsetPx}px)`,
        '--dot-color': poi.color,
        opacity: poi.clamped ? 0.6 : 1,
      }"
      :title="poi.label"
    />
    <!-- Center pointer -->
    <div class="compass__pointer" />
    <!-- Heading readout -->
    <div class="compass__readout">{{ Math.round(headingDeg) }}&deg;</div>
  </div>
</template>

<style>
.compass {
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 32px;
  overflow: hidden;
  z-index: 20;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  mask-image: linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0%,
    black 15%,
    black 85%,
    transparent 100%
  );
}

.compass__track {
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
}

.compass__tick {
  position: absolute;
  bottom: 0;
  width: 1px;
  height: 6px;
  background: rgba(255, 255, 255, 0.3);
}

.compass__tick--major {
  height: 10px;
  background: rgba(255, 255, 255, 0.5);
}

.compass__tick--cardinal {
  height: 14px;
  background: rgba(255, 255, 255, 0.8);
}

.compass__label {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.compass__poi {
  position: absolute;
  top: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dot-color, #66ffee);
  box-shadow: 0 0 6px var(--dot-color, #66ffee);
  transform: translate(-50%, -50%);
}

.compass__pointer {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 6px solid rgba(255, 255, 255, 0.8);
}

.compass__readout {
  position: absolute;
  bottom: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.55rem;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.1em;
}
</style>
