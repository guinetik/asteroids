<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { LevelViewController } from './LevelViewController'
import LanderHud from '@/components/LanderHud.vue'
import FpsHud from '@/components/FpsHud.vue'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)
const stateInfo = reactive({ state: '', grounded: false })
const deathFade = ref(0)
const deathMessage = ref(false)
const arrivalFade = ref(0)

const landerTelemetry = reactive<LanderTelemetry>({
  altitude: 0,
  velocityY: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  mainEngineCharge: 0,
  mainEngineCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
})

const fpsTelemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 100,
  o2Capacity: 100,
  sprintCharge: 50,
  sprintCapacity: 50,
  speed: 0,
  grounded: false,
  activeMode: 'weapon',
  aiming: false,
  isFiring: false,
  rtgLevel: 80,
  rtgCapacity: 80,
  modeCharge: 20,
  modeCapacity: 20,
})

onMounted(async () => {
  if (container.value) {
    viewController.onLetterbox = (visible) => {
      letterboxVisible.value = visible
    }
    viewController.onStateInfo = (info) => {
      Object.assign(stateInfo, info)
    }
    viewController.onLanderTelemetry = (t) => {
      Object.assign(landerTelemetry, t)
    }
    viewController.onFpsTelemetry = (t) => {
      Object.assign(fpsTelemetry, t)
    }
    viewController.onDeathFade = (opacity) => {
      deathFade.value = opacity
    }
    viewController.onDeathMessage = (visible) => {
      deathMessage.value = visible
    }
    viewController.onArrivalFade = (opacity) => {
      arrivalFade.value = opacity
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
  <!-- Helmet visor overlay — always visible, frames the view -->
  <div v-if="stateInfo.state === 'eva'" class="helmet-visor" />
  <!-- Ambient vignette — subtle darkness at edges -->
  <div v-if="stateInfo.state !== ''" class="level-vignette" />
  <div
    class="letterbox-bar letterbox-bar--top"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <div
    class="letterbox-bar letterbox-bar--bottom"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <LanderHud v-if="stateInfo.state === 'lander'" :telemetry="landerTelemetry" />
  <FpsHud v-if="stateInfo.state === 'eva'" :telemetry="fpsTelemetry" />
  <div
    v-if="stateInfo.state === 'lander' && stateInfo.grounded"
    class="exit-prompt"
  >
    <span class="exit-prompt__text">EXIT (F)</span>
  </div>
  <div
    v-if="arrivalFade > 0"
    class="death-fade"
    :style="{ opacity: arrivalFade }"
  />
  <div
    v-if="deathFade > 0"
    class="death-fade"
    :style="{ opacity: deathFade }"
  />
  <div v-if="deathMessage" class="death-message">
    <span class="death-message__text">YOU DIED</span>
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
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0.15em;
  text-transform: uppercase;
  background: rgba(0, 0, 0, 0.5);
  padding: 0.4rem 1.2rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
}
.death-fade {
  position: fixed;
  inset: 0;
  background: black;
  z-index: 50;
  pointer-events: none;
}
.death-message {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  pointer-events: none;
}
.death-message__text {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 3rem;
  color: #ef4444;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  animation: death-pulse 2s ease-in-out infinite;
}
@keyframes death-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* Always-on vignette — subtle darkness at screen edges */
.level-vignette {
  position: fixed;
  inset: 0;
  z-index: 5;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    transparent 50%,
    rgba(0, 0, 0, 0.3) 80%,
    rgba(0, 0, 0, 0.7) 100%
  );
}

/* Helmet visor frame — EVA only, rounded viewport with opaque corners */
.helmet-visor {
  position: fixed;
  inset: 0;
  z-index: 6;
  pointer-events: none;
  border: 2px solid rgba(80, 100, 120, 0.2);
  border-radius: 20% / 12%;
  /* Large outer shadow fills the corners outside the rounded border with black */
  box-shadow:
    0 0 0 9999px rgba(0, 0, 0, 0.95),
    inset 0 0 60px rgba(0, 10, 30, 0.5),
    inset 0 0 150px rgba(0, 5, 15, 0.25);
  /* Subtle glass tint at visor edges */
  background: radial-gradient(
    ellipse at center,
    transparent 0%,
    transparent 65%,
    rgba(20, 40, 60, 0.06) 85%,
    rgba(10, 30, 50, 0.12) 100%
  );
}
</style>
