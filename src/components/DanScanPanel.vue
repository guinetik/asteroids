<!-- src/components/DanScanPanel.vue -->
<script setup lang="ts">
/**
 * Persistent DAN-mission HUD: scan timer, neutron capture meter, and
 * mission instruction. Mounts whenever the active minigame is a
 * `DanMinigame` so the player sees their progress across both lander
 * and EVA phases (the standard `LanderHud` survey block is gated to
 * `'lander'` state and disappears the moment they step out).
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-27-dan-mission-design.md
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Seconds remaining in the active scan window (0 once the window closes). */
  timeRemaining: number
  /** Neutron particles captured so far. */
  captured: number
  /** Required hits to fill the meter. */
  required: number
  /** Imperative HUD instruction telling the player the next action. */
  instruction: string | null
  /** Whether the scan window is still open (drives timer color). */
  scanning: boolean
}>()

const fillPct = computed(() => {
  if (props.required <= 0) return 0
  return Math.max(0, Math.min(100, (props.captured / props.required) * 100))
})

const timerLabel = computed(() => {
  const seconds = Math.max(0, Math.ceil(props.timeRemaining))
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

/** Cool blue while plenty of time remains, amber under 15s, red under 5s. */
const timerColor = computed(() => {
  if (!props.scanning) return 'dan-timer-done'
  if (props.timeRemaining <= 5) return 'dan-timer-low'
  if (props.timeRemaining <= 15) return 'dan-timer-mid'
  return 'dan-timer-high'
})
</script>

<template>
  <div class="dan-scan-panel">
    <div class="dan-scan-header">
      <span class="dan-scan-label">DAN SCAN</span>
      <span :class="['dan-scan-timer', timerColor]">{{ timerLabel }}</span>
    </div>
    <div class="dan-scan-meter-row">
      <div class="dan-scan-meter">
        <div class="dan-scan-meter-fill" :style="{ width: fillPct + '%' }" />
      </div>
      <span class="dan-scan-counter">{{ captured }}/{{ required }} NEUTRONS</span>
    </div>
    <div v-if="instruction" class="dan-scan-instruction" aria-live="polite">{{ instruction }}</div>
  </div>
</template>

<!--
  Styles live in `src/assets/css/dan-scan-panel.css` (imported by main.css).
  Tailwind v4 + Vue scoped <style> can't resolve @apply, so per project convention
  utility-class rules go in a sibling .css file rather than a <style scoped> block.
-->
