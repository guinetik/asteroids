<script setup lang="ts">
import { ref, watch } from 'vue'
import type { GravitationalAnomalyHudState } from '@/lib/ShuttleTelemetry'

const props = defineProps<{
  anomaly: GravitationalAnomalyHudState
}>()

/** Seconds each toast stays readable before local fade. */
const DISPLAY_SECONDS = 4.8

const showLocal = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | undefined

watch(
  () => props.anomaly.token,
  () => {
    const hasCopy = props.anomaly.title.trim().length > 0
    if (!props.anomaly.visible || !hasCopy) {
      showLocal.value = false
      if (hideTimer !== undefined) clearTimeout(hideTimer)
      return
    }
    showLocal.value = true
    if (hideTimer !== undefined) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => {
      showLocal.value = false
    }, DISPLAY_SECONDS * 1000)
  },
)
</script>

<template>
  <div v-if="showLocal && props.anomaly.title.trim().length > 0" class="gravitational-anomaly-hud-wrap">
    <div :key="props.anomaly.token" class="gravitational-anomaly-hud" aria-live="polite">
      <div class="gravitational-anomaly-hud__title">{{ props.anomaly.title }}</div>
      <div class="gravitational-anomaly-hud__subtitle">{{ props.anomaly.subtitle }}</div>
    </div>
  </div>
</template>
