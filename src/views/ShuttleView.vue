<!-- src/views/ShuttleView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ShuttleViewController } from './ShuttleViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'

const container = ref<HTMLElement>()
const viewController = new ShuttleViewController()
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
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    await viewController.init(container.value)
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
