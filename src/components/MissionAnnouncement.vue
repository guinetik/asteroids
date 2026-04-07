<!-- src/components/MissionAnnouncement.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

/** Duration in ms before the announcement starts fading. */
const DISPLAY_DURATION = 3000
/** Fade-out transition duration in ms. */
const FADE_DURATION = 1500

const props = defineProps<{
  asteroidName: string
  missionName: string
  visible: boolean
}>()

const fading = ref(false)
const hidden = ref(false)

onMounted(() => {
  if (props.visible) startTimer()
})

function startTimer() {
  setTimeout(() => {
    fading.value = true
    setTimeout(() => {
      hidden.value = true
    }, FADE_DURATION)
  }, DISPLAY_DURATION)
}

defineExpose({ startTimer })
</script>

<template>
  <Transition name="announce">
    <div
      v-if="visible && !hidden"
      class="mission-announcement"
      :class="{ 'mission-announcement--fading': fading }"
    >
      <div class="announce-location">{{ props.asteroidName }}</div>
      <div class="announce-divider" />
      <div class="announce-mission">{{ props.missionName }}</div>
    </div>
  </Transition>
</template>

<style>
.mission-announcement {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 45;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  opacity: 1;
  transition: opacity 1.5s ease-out;
}
.mission-announcement--fading {
  opacity: 0;
}
.announce-location {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 1rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
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
  color: rgba(255, 255, 255, 0.9);
  text-shadow:
    0 0 20px rgba(0, 255, 204, 0.4),
    0 0 40px rgba(0, 255, 204, 0.15);
}
</style>
