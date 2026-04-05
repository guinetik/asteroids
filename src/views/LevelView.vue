<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { LevelViewController } from './LevelViewController'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)

onMounted(async () => {
  if (container.value) {
    viewController.onLetterbox = (visible) => {
      letterboxVisible.value = visible
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
  <div
    class="letterbox-bar letterbox-bar--top"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <div
    class="letterbox-bar letterbox-bar--bottom"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
</template>

<style>
.letterbox-bar {
  position: fixed;
  left: 0;
  right: 0;
  height: 12%;
  background: black;
  z-index: 40;
  transition: height 0.6s ease-in-out;
  pointer-events: none;
}
.letterbox-bar--top {
  top: 0;
}
.letterbox-bar--bottom {
  bottom: 0;
}
.letterbox-bar--hidden {
  height: 0;
}
</style>
