<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import KeyPrompt from '@/components/KeyPrompt.vue'
import { parseKeyPrompt } from '@/lib/ui/parseKeyPrompt'
import { StationViewController } from './StationViewController'

const DEFAULT_STATION_ID = 'yamada-titania'

const container = ref<HTMLElement | null>(null)
const controller = new StationViewController()
const route = useRoute()
const router = useRouter()
const promptText = ref<string | null>(null)
const parsedPrompt = computed(() =>
  promptText.value ? parseKeyPrompt(promptText.value) : null,
)

controller.onPrompt = (prompt) => {
  promptText.value = prompt
}
controller.onInteract = (event) => {
  if (event === 'station:exit') {
    void router.push('/')
  }
}

onMounted(async () => {
  if (!container.value) return
  const raw = route.query.station
  const stationId = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const resolved = stationId ? String(stationId) : DEFAULT_STATION_ID
  await controller.init(container.value, resolved, router)
  // /station shares the shuttle-arrival prelude with /level. Once the
  // scene is mounted, tell the prelude it can play its outbound finale;
  // when the shuttle clears the top edge, the IIFE dispatches
  // `prelude-play` and the overlay dismisses itself. On SPA nav the
  // prelude has already stopped — synthesize the event so anything
  // listening still fires.
  if (typeof window !== 'undefined' && window.Prelude) {
    if (window.Prelude.isActive?.()) {
      window.Prelude.ready()
    } else {
      window.dispatchEvent(new Event('prelude-play'))
    }
  }
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
  <KeyPrompt
    v-if="parsedPrompt"
    :key-label="parsedPrompt.key"
    :action="parsedPrompt.label"
    tone="cyan"
    position="bottom-low"
  />
</template>
