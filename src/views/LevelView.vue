<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { LevelViewController } from './LevelViewController'
import LanderHud from '@/components/LanderHud.vue'
import MissionAnnouncement from '@/components/MissionAnnouncement.vue'
import MissionTracker from '@/components/MissionTracker.vue'
import type { TrackerObjective } from '@/components/MissionTracker.vue'
import FpsHud from '@/components/FpsHud.vue'
import FpsCompass from '@/components/FpsCompass.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import LevelMinimap from '@/components/LevelMinimap.vue'
import type { MapMarker } from '@/components/LevelMinimap.vue'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)
const stateInfo = reactive({ state: '', grounded: false, canExfil: false })
const deathFade = ref(0)
const deathMessage = ref(false)
const arrivalFade = ref(0)
const deathOverlayVisible = ref(false)
const deathOverlayCause = ref('')
const showMap = ref(false)
const terminalPrompt = ref<string | null>(null)
const announceVisible = ref(false)
const announceAsteroid = ref('')
const announceMission = ref('')
const objCompleteVisible = ref(false)
const trackerObjectives = ref<TrackerObjective[]>([])
const trackerAsteroid = ref('')
const trackerMission = ref('')
const mapCanvas = ref<HTMLCanvasElement | null>(null)
const playerX = ref(0)
const playerZ = ref(0)
const mapMarkers = ref<MapMarker[]>([])

const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
  survey: '#00ffcc',
}

const descentWarning = computed(() =>
  stateInfo.state === 'lander' ? landerTelemetry.descentWarning : 'safe',
)

const attitudeWarning = computed(() =>
  stateInfo.state === 'lander' ? landerTelemetry.attitudeWarning : 'safe',
)

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
  hp: 100,
  maxHp: 100,
  tiltAngle: 0,
  grounded: false,
  descentWarning: 'safe',
  attitudeWarning: 'safe',
  landingSafety: 'safe',
  surveyTimeRemaining: null,
  surveyProbesCollected: null,
  surveyProbesTotal: null,
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
  headingRad: 0,
  objectives: [],
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
    viewController.onDeathOverlay = (visible, cause) => {
      deathOverlayVisible.value = visible
      deathOverlayCause.value = cause
    }
    viewController.onMissionAnnounce = (asteroid, mission) => {
      announceAsteroid.value = asteroid
      announceMission.value = mission
      announceVisible.value = true
      trackerAsteroid.value = asteroid
      trackerMission.value = mission
    }
    viewController.onObjectiveComplete = (index) => {
      const obj = trackerObjectives.value.find((o) => o.id === `obj-${index}`)
      if (obj) obj.complete = true
      objCompleteVisible.value = true
      setTimeout(() => { objCompleteVisible.value = false }, 5000)
    }
    viewController.onTerminalPrompt = (text) => {
      terminalPrompt.value = text
    }
    viewController.onMapCanvas = (canvas) => {
      mapCanvas.value = canvas
    }
    viewController.onPlayerPosition = (x, z) => {
      playerX.value = x
      playerZ.value = z
    }
    await viewController.init(container.value)

    // Map markers + tracker from mission objectives
    const mission = viewController.getMission()
    if (mission) {
      mapMarkers.value = mission.objectives.map((obj, i) => ({
        id: `obj-${i}`,
        x: obj.x,
        z: obj.z,
        color: OBJECTIVE_COLORS[obj.type] ?? '#66ffee',
        label: obj.type.toUpperCase(),
      }))
      trackerObjectives.value = mission.objectives.map((obj, i) => ({
        id: `obj-${i}`,
        label: obj.type.toUpperCase(),
        complete: false,
      }))
    }

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') showMap.value = !showMap.value
    })
  }
})

function handleRestart() {
  viewController.restart()
}

onUnmounted(() => {
  viewController.dispose()
})
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <!-- Helmet visor overlay — always visible, frames the view -->
  <div v-if="stateInfo.state === 'eva'" class="helmet-visor" />
  <div
    class="letterbox-bar letterbox-bar--top"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <div
    class="letterbox-bar letterbox-bar--bottom"
    :class="{ 'letterbox-bar--hidden': !letterboxVisible }"
  />
  <MissionAnnouncement
    :visible="announceVisible"
    :asteroid-name="announceAsteroid"
    :mission-name="announceMission"
  />
  <MissionAnnouncement
    :visible="objCompleteVisible"
    asteroid-name="OBJECTIVE COMPLETE"
    :mission-name="trackerAsteroid"
  />
  <MissionTracker
    v-if="stateInfo.state === 'lander' || stateInfo.state === 'eva'"
    :asteroid-name="trackerAsteroid"
    :mission-name="trackerMission"
    :objectives="trackerObjectives"
  />
  <LanderHud v-if="stateInfo.state === 'lander'" :telemetry="landerTelemetry" />
  <FpsHud v-if="stateInfo.state === 'eva'" :telemetry="fpsTelemetry" />
  <FpsCompass
    v-if="stateInfo.state === 'eva'"
    :heading-rad="fpsTelemetry.headingRad"
    :objectives="fpsTelemetry.objectives"
  />
  <LevelMinimap
    v-if="showMap"
    :map-canvas="mapCanvas"
    :player-x="playerX"
    :player-z="playerZ"
    :grid-size="12000"
    :markers="mapMarkers"
  />
  <!-- Landing warnings — center screen, impossible to miss -->
  <div v-if="descentWarning !== 'safe' || attitudeWarning !== 'safe'" class="landing-warnings">
    <div
      v-if="descentWarning !== 'safe'"
      class="landing-warning"
      :class="descentWarning === 'danger' ? 'landing-warning--danger' : 'landing-warning--warn'"
    >
      DESCENT RATE
    </div>
    <div
      v-if="attitudeWarning !== 'safe'"
      class="landing-warning"
      :class="attitudeWarning === 'danger' ? 'landing-warning--danger' : 'landing-warning--warn'"
    >
      ATTITUDE
    </div>
  </div>
  <div
    v-if="stateInfo.state === 'lander' && stateInfo.grounded"
    class="exit-prompt"
  >
    <span class="exit-prompt__text">EXIT (F)</span>
  </div>
  <div
    v-if="terminalPrompt"
    class="exit-prompt"
  >
    <span class="exit-prompt__text exit-prompt__text--terminal">{{ terminalPrompt }}</span>
  </div>
  <div
    v-if="stateInfo.canExfil"
    class="exit-prompt"
  >
    <span class="exit-prompt__text">EXFILTRATE (F)</span>
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
  <DeathOverlay
    :visible="deathOverlayVisible"
    :cause="deathOverlayCause"
    @restart="handleRestart"
  />
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
.exit-prompt__text--terminal {
  border-color: rgba(0, 255, 204, 0.5);
  color: rgba(0, 255, 204, 0.9);
  text-shadow: 0 0 8px rgba(0, 255, 204, 0.5);
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

/* Landing warnings — centered, large, impossible to miss */
.landing-warnings {
  position: fixed;
  top: max(1.5rem, env(safe-area-inset-top, 0px) + 1rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 35;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.landing-warning {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 1.6rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 0.3rem 1.5rem;
  border: 2px solid;
}
.landing-warning--warn {
  color: #eab308;
  border-color: rgba(234, 179, 8, 0.4);
  background: rgba(234, 179, 8, 0.1);
  text-shadow: 0 0 8px rgba(234, 179, 8, 0.5);
  animation: warning-blink 1s ease-in-out infinite;
}
.landing-warning--danger {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.15);
  text-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
  animation: warning-blink 0.4s ease-in-out infinite;
}
@keyframes warning-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
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
