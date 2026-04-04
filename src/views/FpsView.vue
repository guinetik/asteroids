<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'
import FpsHud from '@/components/FpsHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()
const pointerLocked = ref(true)

const telemetry = reactive<FpsTelemetry>({
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  deathTimer: null,
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onPointerLockChange = (locked) => {
      pointerLocked.value = locked
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function resumeLock() {
  viewController.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <FpsHud :telemetry="telemetry" />
  <div
    v-if="!pointerLocked"
    class="fixed inset-0 flex items-center justify-center bg-black/60 cursor-pointer z-50"
    @click="resumeLock"
  >
    <span class="text-lg text-white/80 font-mono tracking-widest uppercase">Click to resume</span>
  </div>
</template>
