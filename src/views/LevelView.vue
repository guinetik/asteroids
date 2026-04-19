<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { Timer } from '@/lib/Timer'
import { LevelViewController } from './LevelViewController'
import LanderHud from '@/components/LanderHud.vue'
import MissionAnnouncement from '@/components/MissionAnnouncement.vue'
import MissionTracker from '@/components/MissionTracker.vue'
import type { TrackerObjective } from '@/components/MissionTracker.vue'
import FpsHud from '@/components/FpsHud.vue'
import FpsCompass from '@/components/FpsCompass.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import DamageFeedback from '@/components/DamageFeedback.vue'
import LevelMinimap from '@/components/LevelMinimap.vue'
import type { MapMarker } from '@/components/LevelMinimap.vue'
import PickupToast from '@/components/PickupToast.vue'
import type { PickupEntry } from '@/components/PickupToast.vue'
import LevelInventoryPanel from '@/components/LevelInventoryPanel.vue'
import type { Inventory } from '@/lib/inventory/types'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { removeItem } from '@/lib/inventory/inventory'
import type { LanderTelemetry } from '@/components/LanderHud.vue'
import type { FpsTelemetry } from '@/components/FpsHud.vue'
import { OBJECTIVE_LABELS } from '@/lib/minigame/MiniGame'
import {
  playBackgroundMusic,
  stopBackgroundMusic,
  toggleBackgroundMusic,
  useBackgroundMusicGlobalState,
} from '@/audio/backgroundMusic'
import { LEVEL_GRID_SIZE } from '@/lib/missions/asteroidMissionGenerator'

const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)
const stateInfo = reactive({ state: '', grounded: false, canExfil: false, canEnterLander: false })
const deathFade = ref(0)
const deathMessage = ref(false)
const arrivalFade = ref(0)
const deathOverlayVisible = ref(false)
const deathOverlayCause = ref('')
const showMap = ref(false)
const showInventory = ref(false)
const inventorySnapshot = ref<Inventory | null>(null)
const terminalPrompt = ref<string | null>(null)
const announceVisible = ref(false)
const announceAsteroid = ref('')
const announceMission = ref('')
const objCompleteVisible = ref(false)
const objCompleteLabel = ref('')
const missionCompleteVisible = ref(false)
const trackerVisible = ref(false)
const trackerObjectives = ref<TrackerObjective[]>([])
const trackerAsteroid = ref('')
const trackerMission = ref('')
const mapCanvas = ref<HTMLCanvasElement | null>(null)
const playerX = ref(0)
const playerZ = ref(0)
const mapMarkers = ref<MapMarker[]>([])
const damageFlash = ref(0)
const damageFeedback = ref<InstanceType<typeof DamageFeedback> | null>(null)
const pickups = ref<PickupEntry[]>([])
const PICKUP_AGGREGATE_WINDOW_SEC = 1.5
const PICKUP_LIFETIME_SEC = 2.2
const pickupTimers = new Map<string, { handle: ReturnType<typeof Timer.after>; key: string }>()
let pickupSeq = 0

/**
 * Push a pickup notification, aggregating against the most recent
 * unexpired entry with the same `itemId`. Each call refreshes the
 * fade-out timer so a stream of extractions stays coalesced.
 */
function recordPickup(itemId: string, quantity: number, label: string): void {
  const existing = pickups.value.find((p) => p.itemId === itemId)
  let entry: PickupEntry
  if (existing) {
    existing.quantity += quantity
    existing.pulse += 1
    entry = existing
    const previous = pickupTimers.get(existing.id)
    if (previous) Timer.cancel(previous.handle)
  } else {
    pickupSeq += 1
    entry = {
      id: `pickup-${pickupSeq}`,
      itemId,
      label,
      quantity,
      pulse: 0,
    }
    pickups.value.push(entry)
  }
  const lifetime = Math.max(PICKUP_AGGREGATE_WINDOW_SEC, PICKUP_LIFETIME_SEC)
  const handle = Timer.after(lifetime, () => {
    const idx = pickups.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) pickups.value.splice(idx, 1)
    pickupTimers.delete(entry.id)
  })
  pickupTimers.set(entry.id, { handle, key: entry.id })
}

function clearPickups(): void {
  for (const { handle } of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  pickups.value = []
  for (const handle of pickupFailedTimers) Timer.cancel(handle)
  pickupFailedTimers.clear()
  pickupFailed.value = null
}

/**
 * Transient warning when a mineral hit produces no pickup (typically
 * because the cargo hold is over weight or out of slots). Held in a
 * single ref because we only ever show one banner at a time and the
 * message text already changes on each failure.
 */
const pickupFailed = ref<{ id: number; label: string; reason: string } | null>(null)
const pickupFailedTimers = new Set<ReturnType<typeof Timer.after>>()
const PICKUP_FAILED_LIFETIME_SEC = 2.4
let pickupFailedSeq = 0

/**
 * Surface a transient "INVENTORY FULL" warning. New failures replace
 * the previous banner so the player always sees the latest reason
 * rather than a stale stack.
 */
function recordPickupFailed(label: string, reason: string): void {
  pickupFailedSeq += 1
  pickupFailed.value = { id: pickupFailedSeq, label, reason }
  const handle = Timer.after(PICKUP_FAILED_LIFETIME_SEC, () => {
    if (pickupFailed.value && pickupFailed.value.id === pickupFailedSeq) {
      pickupFailed.value = null
    }
    pickupFailedTimers.delete(handle)
  })
  pickupFailedTimers.add(handle)
}
const backgroundMusic = useBackgroundMusicGlobalState()
const musicEnabled = computed(() => backgroundMusic.isEnabled.value)

const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
  survey: '#00ffcc',
  collect: '#66d9ff',
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
  rtgLevel: 240,
  rtgCapacity: 240,
  modeCharge: 20,
  modeCapacity: 20,
  headingRad: 0,
  objectives: [],
})

onMounted(async () => {
  playBackgroundMusic('level')
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
    viewController.onStepChange = (index, steps) => {
      const obj = trackerObjectives.value.find((o) => o.id === `obj-${index}`)
      if (obj) {
        obj.steps = steps.map((s) => ({ ...s }))
      }
    }
    viewController.onObjectiveComplete = (index) => {
      const obj = trackerObjectives.value.find((o) => o.id === `obj-${index}`)
      if (obj) {
        obj.complete = true
        objCompleteLabel.value = obj.label
      }
      objCompleteVisible.value = true
      Timer.after(5, () => { objCompleteVisible.value = false })
    }
    viewController.onMissionComplete = () => {
      missionCompleteVisible.value = true
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
    viewController.onDamageFlash = (opacity) => {
      damageFlash.value = opacity
    }
    viewController.onDamageDirection = (angle) => {
      damageFeedback.value?.flash(angle)
    }
    viewController.onResourcePickup = (itemId, quantity, label) => {
      recordPickup(itemId, quantity, label)
      if (showInventory.value) refreshInventorySnapshot()
    }
    viewController.onResourcePickupFailed = (label, reason) => {
      recordPickupFailed(label, reason)
      if (showInventory.value) refreshInventorySnapshot()
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
      trackerObjectives.value = mission.objectives.map((obj, i) => {
        const mg = viewController.getMinigame(i)
        return {
          id: `obj-${i}`,
          label: (OBJECTIVE_LABELS[obj.type] ?? obj.type).toUpperCase(),
          complete: false,
          steps: mg?.steps ?? [],
        }
      })
    }

    window.addEventListener('keydown', handleGlobalKeydown)
  }
})

function handleRestart() {
  viewController.restart()
}

/**
 * Refresh the cached cargo snapshot used by the inventory panel from
 * persisted storage. Called when the panel opens, after a jettison,
 * and after a successful pickup so the live readout stays in sync.
 */
function refreshInventorySnapshot(): void {
  inventorySnapshot.value = loadInventory()
}

/** Open the cargo panel and release pointer-lock so the player can use the mouse. */
function openInventoryPanel(): void {
  refreshInventorySnapshot()
  showInventory.value = true
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock()
  }
}

function closeInventoryPanel(): void {
  showInventory.value = false
}

function toggleInventoryPanel(): void {
  if (showInventory.value) closeInventoryPanel()
  else openInventoryPanel()
}

/**
 * Handle a jettison request from the panel: drop `quantity` of `itemId`
 * from the persisted inventory and refresh the snapshot. No-op when
 * there is nothing to remove or the inventory hasn't loaded yet.
 */
function handleJettison(itemId: string, quantity: number): void {
  if (quantity <= 0) return
  const current = loadInventory()
  if (!current) return
  const result = removeItem(current, itemId, quantity)
  if (!result.ok) return
  saveInventory(result.inventory)
  inventorySnapshot.value = result.inventory
}

function handleGlobalKeydown(e: KeyboardEvent): void {
  if (e.code === 'KeyB') {
    if (stateInfo.state !== 'eva' && stateInfo.state !== 'lander') return
    e.preventDefault()
    toggleInventoryPanel()
    return
  }
  if (e.code === 'Escape' && showInventory.value) {
    e.preventDefault()
    closeInventoryPanel()
    return
  }
  if (e.code === 'KeyM' && !showInventory.value) {
    showMap.value = !showMap.value
  }
}

onUnmounted(() => {
  stopBackgroundMusic('level')
  clearPickups()
  window.removeEventListener('keydown', handleGlobalKeydown)
  viewController.dispose()
})

function handleToggleMusic(): void {
  toggleBackgroundMusic()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <div class="level-topbar">
    <button
      type="button"
      class="level-topbar__music-btn"
      :aria-label="musicEnabled ? 'Mute music' : 'Unmute music'"
      :title="musicEnabled ? 'Mute music' : 'Unmute music'"
      @click="handleToggleMusic"
    >
      <svg viewBox="0 0 24 24" class="level-topbar__music-icon" aria-hidden="true">
        <path
          d="M5 9v6h4l5 4V5L9 9H5Z"
          fill="currentColor"
        />
        <path
          v-if="musicEnabled"
          d="M17 9.5a4 4 0 0 1 0 5"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.8"
        />
        <path
          v-if="musicEnabled"
          d="M19.5 7a7.5 7.5 0 0 1 0 10"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="1.8"
        />
        <path
          v-if="!musicEnabled"
          d="m17 8 4 8"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
        />
        <path
          v-if="!musicEnabled"
          d="m21 8-4 8"
          fill="none"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-width="2"
        />
      </svg>
    </button>
    <button
      v-if="stateInfo.state === 'eva' || stateInfo.state === 'lander'"
      type="button"
      class="level-topbar__cargo-btn"
      :class="{ 'level-topbar__cargo-btn--active': showInventory }"
      aria-label="Open cargo hold"
      title="Open cargo hold (B)"
      @click="toggleInventoryPanel"
    >
      <span class="level-topbar__cargo-icon" aria-hidden="true">&#x25A3;</span>
      <span class="level-topbar__cargo-label">CARGO</span>
      <span class="level-topbar__cargo-key" aria-hidden="true">B</span>
    </button>
  </div>
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
    @dismissed="trackerVisible = true"
  />
  <MissionAnnouncement
    :visible="objCompleteVisible"
    asteroid-name="OBJECTIVE COMPLETE"
    :mission-name="objCompleteLabel"
  />
  <MissionAnnouncement
    :visible="missionCompleteVisible"
    asteroid-name="MISSION COMPLETE"
    :mission-name="trackerMission"
  />
  <MissionTracker
    v-if="trackerVisible && (stateInfo.state === 'lander' || stateInfo.state === 'eva')"
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
    :grid-size="LEVEL_GRID_SIZE"
    :markers="mapMarkers"
  />
  <LevelInventoryPanel
    :open="showInventory"
    :inventory="inventorySnapshot"
    @close="closeInventoryPanel"
    @jettison="handleJettison"
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
    v-if="stateInfo.canEnterLander"
    class="exit-prompt"
  >
    <span class="exit-prompt__text">ENTER (F)</span>
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
  <DamageFeedback
    v-if="stateInfo.state === 'eva'"
    ref="damageFeedback"
    :flash-opacity="damageFlash"
  />
  <PickupToast
    v-if="stateInfo.state === 'eva' || stateInfo.state === 'lander'"
    :pickups="pickups"
  />
  <transition name="pickup-failed">
    <div
      v-if="pickupFailed && (stateInfo.state === 'eva' || stateInfo.state === 'lander')"
      :key="pickupFailed.id"
      class="pickup-failed"
      role="status"
      aria-live="polite"
    >
      <span class="pickup-failed__head">CARGO FULL</span>
      <span class="pickup-failed__body">{{ pickupFailed.label }} lost &mdash; {{ pickupFailed.reason }}</span>
    </div>
  </transition>
</template>

<style>
.level-topbar {
  position: fixed;
  bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 0.5rem);
  left: max(1rem, env(safe-area-inset-left, 0px) + 0.5rem);
  z-index: 35;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
.level-topbar__cargo-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  height: 3rem;
  padding: 0 0.85rem;
  border: 1px solid rgba(34, 211, 238, 0.32);
  border-radius: 9999px;
  background: rgba(2, 6, 23, 0.76);
  color: rgba(186, 230, 253, 0.92);
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}
.level-topbar__cargo-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.55);
  background: rgba(8, 47, 73, 0.82);
  color: white;
}
.level-topbar__cargo-btn--active {
  border-color: rgba(102, 255, 238, 0.85);
  color: rgba(102, 255, 238, 1);
  background: rgba(8, 47, 73, 0.88);
}
.level-topbar__cargo-icon {
  font-size: 1.1rem;
  line-height: 1;
}
.level-topbar__cargo-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  padding: 0 0.3rem;
  border: 1px solid rgba(102, 255, 238, 0.45);
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(102, 255, 238, 0.95);
}
.level-topbar__music-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid rgba(34, 211, 238, 0.28);
  border-radius: 9999px;
  background: rgba(2, 6, 23, 0.76);
  color: rgba(186, 230, 253, 0.92);
  box-shadow:
    0 0 0 1px rgba(34, 211, 238, 0.06),
    0 10px 24px rgba(2, 6, 23, 0.45);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}
.level-topbar__music-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(125, 211, 252, 0.5);
  background: rgba(8, 47, 73, 0.8);
  color: white;
}
.level-topbar__music-icon {
  width: 1.3rem;
  height: 1.3rem;
}
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

.pickup-failed {
  position: fixed;
  bottom: 18%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.45rem 1rem;
  font-family: 'Datatype', ui-monospace, monospace;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: rgba(28, 6, 6, 0.7);
  border: 1px solid rgba(255, 107, 107, 0.6);
  box-shadow:
    0 0 16px rgba(255, 107, 107, 0.25),
    inset 0 0 10px rgba(255, 107, 107, 0.08);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.pickup-failed__head {
  color: rgba(255, 107, 107, 0.95);
  font-size: 0.95rem;
  font-weight: 600;
}
.pickup-failed__body {
  color: rgba(255, 220, 220, 0.85);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
}
.pickup-failed-enter-active,
.pickup-failed-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.pickup-failed-enter-from,
.pickup-failed-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
