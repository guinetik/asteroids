<script setup lang="ts">
import type { ShuttleMissionBoard, ActiveShuttleMission, GeneratedAsteroidMission, MissionRegion } from '@/lib/missions/types'
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
  acceptAsteroidMission: []
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

function objectiveSummary(mission: GeneratedAsteroidMission): string {
  const obj = mission.objectives[0]
  if (!obj) return ''
  switch (obj.type) {
    case 'gather':
      return `Gather ${obj.resourceAmount} kg of resources`
    case 'exterminate':
      return `Clear ${obj.nestCount} nest${obj.nestCount !== 1 ? 's' : ''}${obj.hasSpitters ? ' (spitters present)' : ''}`
    case 'rescue':
      return `Rescue ${obj.colonistCount} colonist${obj.colonistCount !== 1 ? 's' : ''} (${obj.oxygenTime}s oxygen)`
    case 'survey':
      return `Calibrate ${obj.probeCount} gravitometric probe${obj.probeCount !== 1 ? 's' : ''} (${obj.timeLimit}s)`
  }
}

function regionLabel(region: MissionRegion): string {
  switch (region) {
    case 'near-earth': return 'Near-Earth'
    case 'asteroid-belt': return 'Asteroid Belt'
    case 'kuiper-belt': return 'Kuiper Belt'
  }
}
</script>

<template>
  <div class="shuttle-control-screen">
    <h2 class="shuttle-control-screen__title">Missions</h2>

    <!-- Planetary Missions -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Planetary Missions</h3>

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

    <!-- Asteroid Missions -->
    <div class="mission-board-section">
      <h3 class="mission-board-section__heading">Asteroid Missions</h3>

      <div v-if="board?.offeredAsteroidMission && !board.activeAsteroidMission" class="mission-board-offer">
        <div class="mission-board-offer__name">{{ board.offeredAsteroidMission.name }}</div>
        <div class="mission-board-offer__giver">From: {{ board.offeredAsteroidMission.giverName }}</div>
        <div class="mission-board-offer__desc">{{ board.offeredAsteroidMission.briefing }}</div>
        <div class="mission-board-offer__meta">
          <span>Region: {{ regionLabel(board.offeredAsteroidMission.region) }}</span>
          <span>Reward: {{ board.offeredAsteroidMission.totalReward }} CR</span>
        </div>
        <div class="mission-board-offer__objective">
          {{ objectiveSummary(board.offeredAsteroidMission) }}
        </div>
        <button
          type="button"
          class="mission-board-offer__accept-btn"
          @click="emit('acceptAsteroidMission')"
        >
          Accept
        </button>
      </div>

      <div v-else-if="board?.activeAsteroidMission" class="mission-board-active">
        <div class="mission-board-active__name">{{ board.activeAsteroidMission.name }}</div>
        <div class="mission-board-active__route">
          {{ board.activeAsteroidMission.giverName }} &middot; {{ regionLabel(board.activeAsteroidMission.region) }}
        </div>
        <div class="mission-board-active__status">
          {{ board.activeAsteroidMission.status === 'accepted' ? 'Navigate to waypoint' : 'In transit' }}
        </div>
        <div class="mission-board-active__cargo">
          {{ objectiveSummary(board.activeAsteroidMission) }}
          &middot; {{ board.activeAsteroidMission.totalReward }} CR
        </div>
      </div>

      <div v-else-if="board?.asteroidRestockTimer" class="mission-board-empty">
        Restocking in {{ formatTime(board.asteroidRestockTimer.remaining) }}
      </div>

      <div v-else class="mission-board-empty">
        No asteroid missions available
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
