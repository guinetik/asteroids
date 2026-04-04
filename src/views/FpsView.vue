<!-- src/views/FpsView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { FpsViewController } from './FpsViewController'

const container = ref<HTMLElement>()
const viewController = new FpsViewController()

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
