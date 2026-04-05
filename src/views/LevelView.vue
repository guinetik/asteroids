<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { LevelViewController } from './LevelViewController'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)
const stateInfo = reactive({ state: '', grounded: false })

onMounted(async () => {
  if (container.value) {
    viewController.onLetterbox = (visible) => {
      letterboxVisible.value = visible
    }
    viewController.onStateInfo = (info) => {
      Object.assign(stateInfo, info)
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
  <div
    v-if="stateInfo.state === 'lander' && stateInfo.grounded"
    class="exit-prompt"
  >
    <span class="exit-prompt__text">EXIT (F)</span>
  </div>
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
.exit-prompt {
  position: fixed;
  bottom: 15%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  pointer-events: none;
}
.exit-prompt__text {
  font-family: monospace;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.5);
  padding: 0.4rem 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
</style>
