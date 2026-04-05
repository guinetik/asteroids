<script setup lang='ts'>
import type { GravityWarningState } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  warning: GravityWarningState
}>()

/** Proximity tier thresholds. */
const DANGER_THRESHOLD = 0.3
const CRITICAL_THRESHOLD = 0.7

function tierClass(): string {
  if (props.warning.proximity >= CRITICAL_THRESHOLD) return 'gravity-warning-critical'
  if (props.warning.proximity >= DANGER_THRESHOLD) return 'gravity-warning-danger'
  return 'gravity-warning-caution'
}

function tierLabel(): string {
  if (props.warning.proximity >= CRITICAL_THRESHOLD) return 'CRITICAL'
  if (props.warning.proximity >= DANGER_THRESHOLD) return 'GRAVITY WARNING'
  return 'GRAVITATIONAL PULL'
}
</script>

<template>
  <div v-if="props.warning.visible" class="gravity-warning" :class="tierClass()">
    &#9888; {{ tierLabel() }} &mdash; {{ props.warning.bodyName }}
  </div>
</template>
