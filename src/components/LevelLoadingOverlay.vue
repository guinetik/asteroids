<!-- src/components/LevelLoadingOverlay.vue -->
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Current boot phase from LevelViewController. */
  phase: 'preparing' | 'ready' | 'started'
  /** Human-readable label for the current preload step. */
  label: string
  /** Asteroid name shown above the mission. */
  asteroidName: string
  /** Mission name (or template) shown below the asteroid. */
  missionName: string
}>()

/** Overlay is hidden once the controller flips to 'started'. */
const isVisible = computed(() => props.phase !== 'started')
</script>

<template>
  <Transition name="level-loader-fade">
    <div v-if="isVisible" class="level-loader">
      <div class="level-loader__panel">
        <div class="level-loader__tag">ORBITAL INSERTION // STANDBY</div>
        <div class="level-loader__asteroid">{{ asteroidName || 'ASTEROID' }}</div>
        <div class="level-loader__mission">{{ missionName || 'MISSION BRIEF' }}</div>
        <div class="level-loader__divider"></div>
        <div class="level-loader__status-row">
          <span class="level-loader__pulse" aria-hidden="true"></span>
          <span class="level-loader__status">{{ label }}</span>
        </div>
      </div>
      <div class="level-loader__footer">LINK ENGAGED // 01 // AUTOSYNC</div>
    </div>
  </Transition>
</template>

<style scoped>
.level-loader {
  @apply fixed inset-0 z-50 flex flex-col items-center justify-center;
  @apply bg-black/92 text-amber-200;
  font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
  letter-spacing: 0.12em;
}

.level-loader__panel {
  @apply flex flex-col gap-2 px-10 py-8;
  @apply border border-amber-300/30 bg-black/60;
  min-width: 28rem;
  max-width: 38rem;
}

.level-loader__tag {
  @apply text-[0.72rem] text-amber-300/70 uppercase;
}

.level-loader__asteroid {
  @apply text-xl font-semibold text-amber-100 uppercase;
}

.level-loader__mission {
  @apply text-sm text-amber-200/80 uppercase;
}

.level-loader__divider {
  @apply h-px w-full bg-amber-300/25 my-2;
}

.level-loader__status-row {
  @apply flex items-center gap-3;
}

.level-loader__pulse {
  @apply inline-block h-2 w-2 rounded-full bg-amber-300;
  animation: level-loader-pulse 0.9s ease-in-out infinite;
}

.level-loader__status {
  @apply text-[0.85rem] text-amber-200/90 uppercase;
}

.level-loader__footer {
  @apply absolute bottom-6 text-[0.7rem] text-amber-300/40 uppercase;
  letter-spacing: 0.24em;
}

.level-loader-fade-enter-active,
.level-loader-fade-leave-active {
  transition: opacity 0.5s ease-out;
}
.level-loader-fade-enter-from,
.level-loader-fade-leave-to {
  opacity: 0;
}

@keyframes level-loader-pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
</style>
