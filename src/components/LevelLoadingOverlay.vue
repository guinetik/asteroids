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
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
  color: #fde68a;
  font-family: 'JetBrains Mono', 'Fira Code', 'Menlo', monospace;
  letter-spacing: 0.12em;
}

.level-loader__panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 2rem 2.5rem;
  border: 1px solid rgba(252, 211, 77, 0.3);
  background: rgba(0, 0, 0, 0.6);
  min-width: 28rem;
  max-width: 38rem;
}

.level-loader__tag {
  font-size: 0.72rem;
  color: rgba(252, 211, 77, 0.7);
  text-transform: uppercase;
}

.level-loader__asteroid {
  font-size: 1.25rem;
  font-weight: 600;
  color: #fef3c7;
  text-transform: uppercase;
}

.level-loader__mission {
  font-size: 0.875rem;
  color: rgba(253, 230, 138, 0.8);
  text-transform: uppercase;
}

.level-loader__divider {
  height: 1px;
  width: 100%;
  background: rgba(252, 211, 77, 0.25);
  margin: 0.5rem 0;
}

.level-loader__status-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.level-loader__pulse {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: #fcd34d;
  animation: level-loader-pulse 0.9s ease-in-out infinite;
}

.level-loader__status {
  font-size: 0.85rem;
  color: rgba(253, 230, 138, 0.9);
  text-transform: uppercase;
}

.level-loader__footer {
  position: absolute;
  bottom: 1.5rem;
  font-size: 0.7rem;
  color: rgba(252, 211, 77, 0.4);
  text-transform: uppercase;
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
