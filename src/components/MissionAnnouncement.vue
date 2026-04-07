<!-- src/components/MissionAnnouncement.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'

/** Duration in ms for the stripe to expand open. */
const OPEN_DURATION = 600
/** Duration in ms the announcement stays fully visible. */
const HOLD_DURATION = 3000
/** Duration in ms for the stripe to collapse closed. */
const CLOSE_DURATION = 800

const props = defineProps<{
  asteroidName: string
  missionName: string
  visible: boolean
}>()

const phase = ref<'closed' | 'opening' | 'open' | 'closing'>('closed')
const removed = ref(false)

watch(() => props.visible, (val) => {
  if (!val) return
  phase.value = 'opening'
  setTimeout(() => {
    phase.value = 'open'
    setTimeout(() => {
      phase.value = 'closing'
      setTimeout(() => {
        removed.value = true
      }, CLOSE_DURATION)
    }, HOLD_DURATION)
  }, OPEN_DURATION)
})
</script>

<template>
  <div
    v-if="visible && !removed"
    class="mission-announcement"
    :class="`mission-announcement--${phase}`"
  >
    <div class="announce-content">
      <div class="announce-location">{{ props.asteroidName }}</div>
      <div class="announce-divider" />
      <div class="announce-mission">{{ props.missionName }}</div>
    </div>
  </div>
</template>

<style>
.mission-announcement {
  position: fixed;
  top: 50%;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  z-index: 45;
  pointer-events: none;
  overflow: hidden;
  border-top: 1px solid rgba(0, 255, 204, 0.15);
  border-bottom: 1px solid rgba(0, 255, 204, 0.15);
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(0, 255, 204, 0.04) 20%,
    rgba(0, 255, 204, 0.08) 50%,
    rgba(0, 255, 204, 0.04) 80%,
    transparent
  );
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  max-height: 0;
}
.mission-announcement--opening {
  animation: announce-open 0.6s ease-out forwards;
}
.mission-announcement--open {
  max-height: 10rem;
  padding: 2rem 0;
}
.mission-announcement--closing {
  animation: announce-close 0.8s ease-in forwards;
}
.announce-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
.announce-location {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 1rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: rgba(0, 255, 204, 0.6);
}
.announce-divider {
  width: 12rem;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(0, 255, 204, 0.6),
    transparent
  );
}
.announce-mission {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 2.2rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(0, 255, 204, 0.9);
  text-shadow:
    0 0 20px rgba(0, 255, 204, 0.4),
    0 0 40px rgba(0, 255, 204, 0.15);
}
@keyframes announce-open {
  from {
    max-height: 0;
    padding: 0;
    opacity: 0;
  }
  to {
    max-height: 10rem;
    padding: 2rem 0;
    opacity: 1;
  }
}
@keyframes announce-close {
  from {
    max-height: 10rem;
    padding: 2rem 0;
    opacity: 1;
  }
  to {
    max-height: 0;
    padding: 0;
    opacity: 0;
  }
}
</style>
