<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { HomeViewController } from './HomeViewController'

const container = ref<HTMLElement>()
const viewController = new HomeViewController()

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
