<!-- src/views/ShuttleView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { ShuttleViewController } from './ShuttleViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const route = useRoute()
const container = ref<HTMLElement>()
const viewController = new ShuttleViewController()
const telemetry = reactive<ShuttleTelemetry>({
  speed: 0,
  heading: 0,
  posX: 0,
  posZ: 0,
  actionPrompt: null,
  fuelLevel: 0,
  fuelCapacity: 0,
  thrustCharge: 0,
  thrustCapacity: 0,
  brakeCharge: 0,
  brakeCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
  adriftCountdown: -1,
  hp: 100,
  maxHp: 100,
  temperature: 0,
  temperatureVisible: false,
  damageIntensity: 0,
  compassBearings: [],
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    const cityQuery = route.query.city
    const city =
      cityQuery === 'true' || (Array.isArray(cityQuery) && cityQuery.includes('true'))
    await viewController.init(container.value, { city })
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <ShuttleHud :telemetry="telemetry" />
</template>
