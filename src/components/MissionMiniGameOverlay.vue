<script setup lang="ts">
import type { ActiveShuttleMission } from '@/lib/missions/types'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'
import { GasCollectionMiniGame } from '@/lib/minigame/gasCollection/GasCollectionMiniGame'
import { IceHarvestMiniGame } from '@/lib/minigame/iceHarvest/IceHarvestMiniGame'
import { MaintenanceMiniGame } from '@/lib/minigame/maintenance/MaintenanceMiniGame'
import { LogisticsRouteMiniGame } from '@/lib/minigame/logistics/LogisticsRouteMiniGame'
import { ProbeDeployMiniGame } from '@/lib/minigame/probeDeploy/ProbeDeployMiniGame'
import GasCollectionCanvas from '@/components/GasCollectionCanvas.vue'
import IceHarvestCanvas from '@/components/IceHarvestCanvas.vue'
import MaintenanceCanvas from '@/components/MaintenanceCanvas.vue'
import LogisticsRouteCanvas from '@/components/LogisticsRouteCanvas.vue'
import ProbeDeployCanvas from '@/components/ProbeDeployCanvas.vue'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { computed } from 'vue'

const props = defineProps<{
  mission: ActiveShuttleMission
  canFitCargo: boolean
  minigame: OrbitalMiniGame | null
}>()

const emit = defineEmits<{
  complete: []
  close: []
}>()

function handleComplete() {
  props.minigame?.complete()
  emit('complete')
}

const isGasCollection = computed(
  () => props.minigame instanceof GasCollectionMiniGame,
)

const gasMinigame = computed(
  () => (props.minigame instanceof GasCollectionMiniGame ? props.minigame : null),
)

const isIceHarvest = computed(
  () => props.minigame instanceof IceHarvestMiniGame,
)

const iceMinigame = computed(
  () => (props.minigame instanceof IceHarvestMiniGame ? props.minigame : null),
)

const isMaintenance = computed(
  () => props.minigame instanceof MaintenanceMiniGame,
)

const maintenanceMinigame = computed(
  () => (props.minigame instanceof MaintenanceMiniGame ? props.minigame : null),
)

const isLogistics = computed(
  () => props.minigame instanceof LogisticsRouteMiniGame,
)

const logisticsMinigame = computed(
  () => (props.minigame instanceof LogisticsRouteMiniGame ? props.minigame : null),
)

const isProbeDeploy = computed(
  () => props.minigame instanceof ProbeDeployMiniGame,
)

const probeMinigame = computed(
  () => (props.minigame instanceof ProbeDeployMiniGame ? props.minigame : null),
)

const orbitalConfig = computed(() => getPlanetOrbitalConfig(props.mission.template.targetPlanet))
const gatherItemDef = computed(() => {
  const itemId = orbitalConfig.value?.gatherItem
  return itemId ? getItemDefinition(itemId) : undefined
})
</script>

<template>
  <!-- Gas Collection: fullscreen canvas -->
  <div v-if="isGasCollection && gasMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <GasCollectionCanvas
          :minigame="gasMinigame"
          :planet-id="mission.template.targetPlanet"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Ice Harvest: fullscreen canvas -->
  <div v-else-if="isIceHarvest && iceMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <IceHarvestCanvas
          :minigame="iceMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Maintenance: solar panel puzzle -->
  <div v-else-if="isMaintenance && maintenanceMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <MaintenanceCanvas
          :minigame="maintenanceMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Logistics Route: fullscreen canvas -->
  <div v-else-if="isLogistics && logisticsMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <LogisticsRouteCanvas
          :minigame="logisticsMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Probe Deploy: fullscreen canvas -->
  <div v-else-if="isProbeDeploy && probeMinigame" class="mission-minigame-overlay">
    <div class="mission-minigame-card" style="max-width: 850px;">
      <div class="mission-minigame-card__chrome">
        <span>{{ mission.template.name }}</span>
        <button
          type="button"
          class="ship-message-card__button"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
      <div class="mission-minigame-card__body" style="padding: 0.5rem;">
        <ProbeDeployCanvas
          :minigame="probeMinigame"
          @complete="emit('complete')"
          @fail="() => {}"
        />
      </div>
    </div>
  </div>

  <!-- Default: button card -->
  <div v-else class="mission-minigame-overlay">
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
          @click="handleComplete"
        >
          Complete Mission
        </button>
      </div>
    </div>
  </div>
</template>
