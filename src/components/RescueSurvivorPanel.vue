<!-- src/components/RescueSurvivorPanel.vue -->
<script setup lang="ts">
/**
 * Persistent rescue-mission HUD: TOTAL · ALIVE · ABOARD.
 *
 * Mounted by `LevelView.vue` whenever the active minigame is a `RescueMinigame`.
 * Reads three reactive count refs from the parent — the parent polls the
 * minigame each tick and updates these refs.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-rescue-extraction-phase-design.md
 */
import { computed } from 'vue'

const props = defineProps<{
  /** Total survivors released onto the ground (snapshot, never decremented). */
  total: number
  /** Currently alive AND not yet aboard. */
  alive: number
  /** Cumulative count of survivors who walked into the lander. */
  aboard: number
}>()

const aliveColor = computed(() => {
  if (props.alive <= 1) return 'rescue-alive-low'
  if (props.total > 0 && props.alive / props.total < 0.5) return 'rescue-alive-mid'
  return 'rescue-alive-high'
})
</script>

<template>
  <div class="rescue-survivor-panel">
    <span class="rescue-label">SURVIVORS:</span>
    <span :class="['rescue-alive', aliveColor]">{{ alive }} ALIVE</span>
    <span class="rescue-sep">·</span>
    <span class="rescue-aboard">{{ aboard }} ABOARD</span>
    <span class="rescue-sep">·</span>
    <span class="rescue-total">{{ total }} TOTAL</span>
  </div>
</template>

<style scoped>
.rescue-survivor-panel {
  @apply absolute top-24 left-4 z-30 px-3 py-1.5 rounded bg-black/55 border border-white/10
         font-mono text-sm tracking-wider text-white/85 select-none flex items-center gap-2;
}
.rescue-label { @apply text-white/55; }
.rescue-alive-high { @apply text-emerald-400; }
.rescue-alive-mid  { @apply text-amber-300; }
.rescue-alive-low  { @apply text-red-400 font-semibold; }
.rescue-aboard     { @apply text-sky-300; }
.rescue-total      { @apply text-white/65; }
.rescue-sep        { @apply text-white/30; }
</style>
