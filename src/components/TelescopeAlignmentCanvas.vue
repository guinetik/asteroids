<!--
  TelescopeAlignmentCanvas.vue

  Placeholder dispatch target for `telescope_alignment`. Full UI lands in
  subsequent tasks — for now this renders a card with a completion button
  so the EVA reward loop is exercised.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-19-telescope-alignment-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { TelescopeAlignmentMiniGame } from '@/lib/minigame/telescopeAlignment/TelescopeAlignmentMiniGame'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active telescope minigame instance. */
  minigame: TelescopeAlignmentMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

/** Temporary complete handler — replaced by lock-in in Task 11. */
function handleComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="telescope-placeholder">
    <h2>{{ mission.template.name }}</h2>
    <p>Telescope alignment minigame — WIP placeholder.</p>
    <div class="telescope-placeholder__actions">
      <button type="button" @click="handleComplete">Complete (WIP)</button>
      <button type="button" @click="emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.telescope-placeholder {
  @apply absolute inset-0 grid place-items-center bg-slate-950/90 text-cyan-100 font-mono;
}
.telescope-placeholder__actions {
  @apply mt-4 flex gap-3;
}
.telescope-placeholder button {
  @apply px-4 py-2 border border-cyan-400/40 rounded text-cyan-100 hover:bg-cyan-400/10;
}
</style>
