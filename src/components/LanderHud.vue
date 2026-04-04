<!-- src/components/LanderHud.vue -->
<script setup lang="ts">
export interface LanderTelemetry {
  altitude: number
  velocityY: number
  posX: number
  posZ: number
}

const props = defineProps<{
  telemetry: LanderTelemetry
}>()
</script>

<template>
  <div class="lander-hud">
    <div class="hud-readout">ALT {{ props.telemetry.altitude.toFixed(1) }}</div>
    <div class="hud-readout">VEL {{ props.telemetry.velocityY.toFixed(1) }}</div>
    <div class="hud-readout">X {{ props.telemetry.posX.toFixed(0) }} Z {{ props.telemetry.posZ.toFixed(0) }}</div>
  </div>
</template>
