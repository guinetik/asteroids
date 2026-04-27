<!-- src/components/RescueSurvivorPanel.vue -->
<script setup lang="ts">
/**
 * Persistent rescue-mission HUD: ALIVE · ABOARD · TOTAL.
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

<!--
  Styles live in `src/assets/css/rescue-survivor-panel.css` (imported by main.css).
  Tailwind v4 + Vue scoped <style> can't resolve @apply, so per project convention
  utility-class rules go in a sibling .css file rather than a <style scoped> block.
-->

