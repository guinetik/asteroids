<!-- src/views/LanderView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { LanderViewController } from './LanderViewController'

const container = ref<HTMLElement>()
const viewController = new LanderViewController()

onMounted(async () => {
  if (container.value) {
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
</template>
