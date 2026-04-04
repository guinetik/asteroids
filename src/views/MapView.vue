<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'

const container = ref<HTMLElement>()
const viewController = new MapViewController()

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
