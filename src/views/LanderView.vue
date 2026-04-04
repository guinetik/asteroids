<!-- src/views/LanderView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { LanderViewController } from './LanderViewController'
import LanderHud from '@/components/LanderHud.vue'
import type { LanderTelemetry } from '@/components/LanderHud.vue'

const container = ref<HTMLElement>()
const viewController = new LanderViewController()
const telemetry = reactive<LanderTelemetry>({
  altitude: 0,
  velocityY: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  mainEngineCharge: 0,
  mainEngineCapacity: 0,
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
  <LanderHud :telemetry="telemetry" />
</template>
