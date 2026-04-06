<script setup lang="ts">
import type { ActiveShuttleMission } from '@/lib/missions/types'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { computed } from 'vue'

const props = defineProps<{
  mission: ActiveShuttleMission
  canFitCargo: boolean
}>()

const emit = defineEmits<{
  complete: []
  close: []
}>()

const orbitalConfig = computed(() => getPlanetOrbitalConfig(props.mission.template.targetPlanet))
const gatherItemDef = computed(() => {
  const itemId = orbitalConfig.value?.gatherItem
  return itemId ? getItemDefinition(itemId) : undefined
})
</script>

<template>
  <div class="mission-minigame-overlay">
    <div class="mission-minigame-card">
      <div class="mission-minigame-card__chrome">
        <span>Orbital Mission</span>
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
          <span v-if="gatherItemDef">
            Collect: {{ mission.template.gatherQuantity }}x {{ gatherItemDef.label }}
            ({{ gatherItemDef.weightPerUnit * mission.template.gatherQuantity }} kg)
          </span>
        </div>
        <div v-if="!canFitCargo" class="mission-minigame-card__warning">
          Cargo hold full — make room before starting
        </div>
        <button
          type="button"
          class="mission-minigame-card__complete-btn"
          :disabled="!canFitCargo"
          @click="emit('complete')"
        >
          Complete Mission
        </button>
      </div>
    </div>
  </div>
</template>
