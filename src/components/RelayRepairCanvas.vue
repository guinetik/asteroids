<!--
  RelayRepairCanvas.vue

  Placeholder dispatch target for `relay_repair`. Full grid UI lands in
  Task 9 onward — this renders a card with a WIP complete button so the
  EVA reward loop is exercised end-to-end.

  @author guinetik
  @date 2026-04-20
  @spec docs/superpowers/specs/2026-04-20-relay-repair-design.md
-->
<script setup lang="ts">
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { RelayRepairMiniGame } from '@/lib/minigame/relayRepair/RelayRepairMiniGame'

const props = defineProps<{
  /** The EVA mission opening this overlay. */
  mission: ActiveVisitRelayMission
  /** Active relay minigame instance. */
  minigame: RelayRepairMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame. */
  complete: []
  /** User dismissed the overlay. */
  close: []
}>()

/** Temporary complete handler — replaced by lock-in in Task 11. */
function handleTempComplete(): void {
  props.minigame.complete()
  emit('complete')
}
</script>

<template>
  <div class="relay-overlay">
    <h2>{{ mission.template.name }}</h2>
    <p>Relay repair minigame — WIP placeholder.</p>
    <div class="relay-placeholder-actions">
      <button type="button" @click="handleTempComplete">(WIP) Complete</button>
      <button type="button" @click="emit('close')">Close</button>
    </div>
  </div>
</template>
