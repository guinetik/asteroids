<script setup lang="ts">
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import { getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getPlanet } from '@/lib/planets/catalog'

const props = defineProps<{
  board: ShuttleMissionBoard | null
  dockedPlanet: string | null
}>()

const emit = defineEmits<{
  acceptMission: []
  deliverMission: [missionId: string]
}>()

function targetPlanetName(planetId: string): string {
  try {
    return getPlanet(planetId).name
  } catch {
    return planetId
  }
}

function gatherItemLabel(mission: ActiveShuttleMission): string {
  const cfg = getPlanetOrbitalConfig(mission.template.targetPlanet)
  if (!cfg) return '???'
  const item = getItemDefinition(cfg.gatherItem)
  return item ? item.label : cfg.gatherItem
}

function statusLabel(mission: ActiveShuttleMission): string {
  if (mission.status === 'active') {
    return `Travel to ${targetPlanetName(mission.template.targetPlanet)}`
  }
  return `Return to ${targetPlanetName(mission.giverPlanet)}`
}

function canDeliver(mission: ActiveShuttleMission): boolean {
  return (
    mission.status === 'ready-to-deliver' &&
    props.dockedPlanet === mission.giverPlanet
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Missions</h2>

    <!-- Available Mission -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Available Mission</h3>

      <div v-if="!dockedPlanet" class="mission-board-empty">
        Not docked at a planet
      </div>

      <div v-else-if="board?.offeredMission && board.offeringPlanet === dockedPlanet" class="mission-board-offer">
        <div class="mission-board-offer__name">{{ board.offeredMission.name }}</div>
        <div class="mission-board-offer__desc">{{ board.offeredMission.description }}</div>
        <div class="mission-board-offer__meta">
          <span>Target: {{ targetPlanetName(board.offeredMission.targetPlanet) }}</span>
          <span>Reward: {{ board.offeredMission.reward }} CR</span>
        </div>
        <button
          type="button"
          class="mission-board-offer__accept-btn"
          @click="emit('acceptMission')"
        >
          Accept
        </button>
      </div>

      <div v-else-if="board?.restockTimer" class="mission-board-empty">
        Restocking in {{ formatTime(board.restockTimer.remaining) }}
      </div>

      <div v-else class="mission-board-empty">
        No missions available
      </div>
    </div>

    <!-- Active Missions -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Active Missions</h3>

      <div v-if="!board || board.activeMissions.length === 0" class="mission-board-empty">
        No active missions
      </div>

      <div
        v-for="mission in board?.activeMissions"
        :key="mission.template.id"
        class="mission-board-active"
      >
        <div class="mission-board-active__name">{{ mission.template.name }}</div>
        <div class="mission-board-active__route">
          {{ targetPlanetName(mission.giverPlanet) }} &rarr; {{ targetPlanetName(mission.template.targetPlanet) }}
        </div>
        <div class="mission-board-active__status">
          {{ statusLabel(mission) }}
        </div>
        <div class="mission-board-active__cargo">
          {{ mission.template.gatherQuantity }}x {{ gatherItemLabel(mission) }}
          &middot; {{ mission.template.reward }} CR
        </div>
        <button
          v-if="canDeliver(mission)"
          type="button"
          class="mission-board-active__deliver-btn"
          @click="emit('deliverMission', mission.template.id)"
        >
          Deliver
        </button>
      </div>
    </div>
  </div>
</template>
