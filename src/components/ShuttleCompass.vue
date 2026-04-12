<script setup lang="ts">
import { computed } from 'vue'
import type { CompassBearing } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  headingRad: number
  bearings: CompassBearing[]
}>()

/** Pixels per degree on the compass strip. */
const PX_PER_DEG = 3

/** Maximum bearing offset in pixels before clamping to strip edge. */
const MAX_OFFSET_PX = 170

/** Convert radians to degrees. */
const RAD_TO_DEG = 180 / Math.PI

/** Normalize an angle to [-180, 180] degrees. */
function normalizeDeg(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return d
}

/** Planet markers positioned on the strip. */
const markers = computed(() => {
  return props.bearings.map((b) => {
    const deg = normalizeDeg(b.bearingRad * RAD_TO_DEG)
    let offsetPx = -deg * PX_PER_DEG
    let clamped = false
    if (offsetPx > MAX_OFFSET_PX) {
      offsetPx = MAX_OFFSET_PX
      clamped = true
    } else if (offsetPx < -MAX_OFFSET_PX) {
      offsetPx = -MAX_OFFSET_PX
      clamped = true
    }
    return {
      label: b.label,
      color: b.color,
      offsetPx,
      clamped,
    }
  })
})
</script>

<template>
  <div class="shuttle-compass">
    <span
      v-for="m in markers"
      :key="m.label"
      class="shuttle-compass__marker"
      :style="{
        left: `calc(50% + ${m.offsetPx}px)`,
        color: m.color,
        opacity: m.clamped ? 0.4 : 1,
      }"
    >{{ m.label }}</span>
    <div class="shuttle-compass__pointer" />
  </div>
</template>
