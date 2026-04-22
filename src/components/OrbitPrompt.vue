<script setup lang="ts">
import { computed } from 'vue'
import type { OrbitHudState } from '@/lib/orbitCapture'
import { uiAudio } from '@/audio/UiAudioDirector'

const props = defineProps<{
  orbitState: OrbitHudState
  shopAvailable?: boolean
  shopPlanet?: string
  missionAvailable?: boolean
}>()

const emit = defineEmits<{
  openEngineeringBay: []
  openMissionBoard: []
  openShop: []
  openMission: []
}>()

const visible = computed(() => {
  if (props.orbitState.inspectMode) return false
  if (props.orbitState.state === 'free' && props.orbitState.nearestBodyName) return true
  if (props.orbitState.state === 'approaching') return true
  if (props.orbitState.state === 'orbiting') return true
  return false
})

const isCharging = computed(() => {
  return props.orbitState.state === 'orbiting' && props.orbitState.chargeLevel > 0
})

const title = computed(() => {
  const s = props.orbitState
  if (s.state === 'free' && s.nearestBodyName) return s.nearestBodyName
  if (s.state === 'approaching' && s.nearestBodyName) return s.nearestBodyName
  if (s.state === 'orbiting' && s.nearestBodyName) return s.nearestBodyName
  return ''
})

const action = computed(() => {
  const s = props.orbitState
  if (s.state === 'free') return 'E  Orbit'
  if (s.state === 'approaching') return 'E  Cancel'
  if (s.state === 'orbiting' && s.chargeLevel > 0) {
    return `Charging ${Math.round(s.chargeLevel * 100)}%`
  }
  if (s.state === 'orbiting') return 'Hold E  Slingshot'
  return ''
})

const details = computed(() => {
  const lines: string[] = []
  if (props.orbitState.state === 'orbiting') {
    lines.push(`Speed: ${props.orbitState.orbitalSpeed.toFixed(1)} u/s`)
    lines.push('A / D  Aim direction')
  }
  return lines
})
</script>

<template>
  <div v-if="visible" class="orbit-prompt" :class="{ 'orbit-prompt-charging': isCharging }">
    <span class="orbit-prompt-title">{{ title }}</span>
    <span class="orbit-prompt-action">{{ action }}</span>
    <span v-for="line in details" :key="line" class="orbit-prompt-detail">{{ line }}</span>
    <div v-if="isCharging" class="orbit-prompt-bar">
      <div class="orbit-prompt-bar-fill" :style="{ width: (props.orbitState.chargeLevel * 100) + '%' }"></div>
    </div>
    <button
      v-if="shopAvailable && orbitState.state === 'orbiting'"
      type="button"
      class="orbit-prompt-engineering-btn"
      @click="uiAudio.notifyButtonClick(); emit('openEngineeringBay')"
    >
      U  Engineering Bay
    </button>
    <button
      v-if="shopAvailable && orbitState.state === 'orbiting'"
      type="button"
      class="orbit-prompt-mission-board-btn"
      @click="uiAudio.notifyButtonClick(); emit('openMissionBoard')"
    >
      J  Mission Board
    </button>
    <button
      v-if="shopAvailable && orbitState.state === 'orbiting'"
      type="button"
      class="orbit-prompt-shop-btn"
      @click="uiAudio.notifyButtonClick(); emit('openShop')"
    >
      B  Shop
    </button>
    <button
      v-if="missionAvailable && orbitState.state === 'orbiting'"
      type="button"
      class="orbit-prompt-mission-btn"
      @click="uiAudio.notifyButtonClick(); emit('openMission')"
    >
      I  Mission
    </button>
  </div>
</template>
