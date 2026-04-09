<!-- src/views/HomeView.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  loadProfile,
  savePlayerDisplayName,
  MAX_PLAYER_DISPLAY_NAME_LENGTH,
} from '@/lib/player/profile'

const pilotName = ref('')
const savedAs = ref<string | null>(null)

onMounted(() => {
  if (typeof localStorage === 'undefined') return
  const existing = loadProfile()
  if (existing) pilotName.value = existing.name
})

function saveNameFromInput(): void {
  const profile = savePlayerDisplayName(pilotName.value)
  savedAs.value = profile.name
  pilotName.value = profile.name
}
</script>

<template>
  <div
    class="home-view min-h-screen w-screen bg-black text-green-400 font-mono flex flex-col items-center justify-center gap-10 px-4"
  >
    <h1
      class="text-2xl tracking-[0.35em] uppercase text-green-400/90"
      style="text-shadow: 0 0 8px rgba(0, 255, 0, 0.35)"
    >
      Asteroids
    </h1>

    <div
      class="flex w-full max-w-md flex-col gap-3 border border-green-400/40 rounded-sm bg-green-400/5 px-5 py-4"
    >
      <label class="text-xs uppercase tracking-[0.2em] text-green-400/70" for="pilot-name">
        Pilot name
      </label>
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="pilot-name"
          v-model="pilotName"
          type="text"
          autocomplete="username"
          :maxlength="MAX_PLAYER_DISPLAY_NAME_LENGTH"
          class="home-view__input min-w-0 flex-1 border border-green-400/50 bg-black/80 px-3 py-2 text-green-300 outline-none focus:border-green-400/90"
          placeholder="Enter your call sign"
          @keydown.enter.prevent="saveNameFromInput"
        />
        <button
          type="button"
          class="home-view__save-name shrink-0 border border-green-400/55 px-4 py-2 uppercase tracking-widest text-xs hover:bg-green-400/10 hover:border-green-400/80 transition-colors"
          @click="saveNameFromInput"
        >
          Save name
        </button>
      </div>
      <p v-if="savedAs !== null" class="text-[11px] text-green-400/60">
        Saved as <span class="text-green-300/90">{{ savedAs }}</span>
      </p>
    </div>

    <RouterLink
      to="/map"
      class="px-10 py-3 border border-green-400/55 rounded-sm uppercase tracking-widest text-sm hover:bg-green-400/10 hover:border-green-400/80 transition-colors"
    >
      Play
    </RouterLink>
  </div>
</template>
