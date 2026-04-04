<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { HomeViewController } from './HomeViewController'

const container = ref<HTMLElement>()
const viewController = new HomeViewController()
const speed = ref(0)
const heading = ref(0)

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (s, h) => {
      speed.value = s
      heading.value = h
    }
    await viewController.init(container.value)
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function formatHeading(rad: number): string {
  const deg = ((rad * 180) / Math.PI) % 360
  return `${deg < 0 ? deg + 360 : deg}°`
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <div class="hud">
    <span>SPD {{ speed.toFixed(1) }}</span>
    <span>HDG {{ formatHeading(heading) }}</span>
  </div>
</template>
