<!--
  EvaMinigameOverlay.vue

  Modal overlay shown while the EVA player is interacting with a POI maintenance
  terminal. Today it renders the default "Complete Mission" button card so the
  end-to-end loop (approach POI → press F → overlay → reward paid) is playable.
  Real per-minigameType branches (relay_repair, satellite_servicing,
  telescope_alignment) plug in here as additional `v-if` blocks once their canvas
  components exist — same pattern as MissionMiniGameOverlay.

  @author guinetik
  @date 2026-04-19
  @spec docs/superpowers/specs/2026-04-18-visit-relay-mission-design.md
-->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ActiveVisitRelayMission } from '@/lib/missions/types'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'

const props = defineProps<{
  /** The EVA mission whose terminal the player is interacting with. */
  mission: ActiveVisitRelayMission
  /** Active minigame instance — `complete()` is called from the overlay's button. */
  minigame: OrbitalMiniGame
}>()

const emit = defineEmits<{
  /** User completed the minigame — host should pay the reward + close. */
  complete: []
  /** User dismissed the overlay (X button or ESC) — host should restore EVA control. */
  close: []
}>()

/**
 * Capture-phase ESC handler so the overlay closes even if a future minigame
 * canvas swallows keystrokes.
 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

/** Trigger the minigame's own completion path; host listens via `onComplete`. */
function handleComplete(): void {
  props.minigame.complete()
  emit('complete')
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true)
})
</script>

<template>
  <div class="mission-minigame-overlay">
    <div class="mission-minigame-card">
      <div class="mission-minigame-card__chrome">
        <span>EVA Maintenance Terminal</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body">
        <h2 class="mission-minigame-card__title">{{ mission.template.name }}</h2>
        <p class="mission-minigame-card__desc">{{ mission.template.description }}</p>
        <div class="mission-minigame-card__details">
          Reward: +{{ mission.template.reward.toLocaleString() }} CR on completion
        </div>
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          @click="handleComplete"
        >
          Complete Maintenance
        </button>
      </div>
    </div>
  </div>
</template>
