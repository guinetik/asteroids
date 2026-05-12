<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StationViewController } from './StationViewController'

const DEFAULT_STATION_ID = 'yamada-titania'

const container = ref<HTMLElement | null>(null)
const controller = new StationViewController()
const route = useRoute()
const router = useRouter()

onMounted(async () => {
  if (!container.value) return
  const raw = route.query.station
  const stationId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const resolved = stationId ? String(stationId) : DEFAULT_STATION_ID
  await controller.init(container.value, resolved, router)
})

onBeforeUnmount(() => {
  controller.dispose()
})

function onPointerDown(): void {
  controller.requestPointerLock()
}
</script>

<template>
  <div ref="container" class="station-view" @pointerdown="onPointerDown" />
</template>
