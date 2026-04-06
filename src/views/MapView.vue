<!-- src/views/MapView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import GravityWarning from '@/components/GravityWarning.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import MapOverlay from '@/components/MapOverlay.vue'
import type { ShuttleTelemetry, GravityWarningState, MapOverlayState } from '@/lib/ShuttleTelemetry'
import type { OrbitHudState } from '@/lib/orbitCapture'

const container = ref<HTMLElement>()
const viewController = new MapViewController()
const telemetry = reactive<ShuttleTelemetry>({
  speed: 0,
  heading: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  thrustCharge: 0,
  thrustCapacity: 0,
  brakeCharge: 0,
  brakeCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
  adriftCountdown: -1,
})
const orbitState = reactive<OrbitHudState>({
  state: 'free',
  nearestBodyName: null,
  orbitalSpeed: 0,
  slingshotSpeed: 0,
  chargeLevel: 0,
  inspectMode: false,
})
const gravityWarning = reactive<GravityWarningState>({
  proximity: 0,
  bodyName: null,
  visible: false,
})
const deathVisible = ref(false)
const deathCause = ref('')
const mapOverlay = reactive<MapOverlayState>({
  visible: false,
  labels: [],
  shipX: 0,
  shipY: 0,
  headingDeg: 0,
  speed: 0,
  distances: [],
  gravityRings: [],
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onOrbitState = (s) => {
      Object.assign(orbitState, s)
    }
    viewController.onGravityWarning = (w) => {
      Object.assign(gravityWarning, w)
    }
    viewController.onDeathOverlay = (visible, cause) => {
      deathVisible.value = visible
      deathCause.value = cause
    }
    viewController.onMapOverlay = (s) => {
      Object.assign(mapOverlay, s)
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function handleRestart() {
  viewController.restart()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud v-show="!mapOverlay.visible" :telemetry="telemetry" />
  <OrbitPrompt v-show="!mapOverlay.visible" :orbitState="orbitState" />
  <GravityWarning v-show="!mapOverlay.visible" :warning="gravityWarning" />
  <DeathOverlay v-show="!mapOverlay.visible" :visible="deathVisible" :cause="deathCause" @restart="handleRestart" />
  <MapOverlay :overlay="mapOverlay" />
</template>
