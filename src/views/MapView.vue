<!-- src/views/MapView.vue -->
<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import GravityWarning from '@/components/GravityWarning.vue'
import GravitationalAnomalyHud from '@/components/GravitationalAnomalyHud.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import DamageVignette from '@/components/DamageVignette.vue'
import MapOverlay from '@/components/MapOverlay.vue'
import ShipMessageDialog from '@/components/ShipMessageDialog.vue'
import ShuttleControlOverlay from '@/components/ShuttleControlOverlay.vue'
import PlanetShopDialog from '@/components/shop/PlanetShopDialog.vue'
import CreditsBadge from '@/components/hud/CreditsBadge.vue'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'
import { shipMessageSystem } from '@/lib/messages/runtime'
import type { ActiveShipMessage } from '@/lib/messages/messageTypes'
import type { MapIntroUiState } from '@/lib/mapIntroState'
import type {
  ShuttleTelemetry,
  GravityWarningState,
  GravitationalAnomalyHudState,
  MapOverlayState,
} from '@/lib/ShuttleTelemetry'
import type { OrbitHudState } from '@/lib/orbitCapture'

const container = ref<HTMLElement>()
const viewController = new MapViewController()
const activeMessage = ref<ActiveShipMessage | null>(null)
const pendingMessageCount = ref(0)
const messageDialogVisible = ref(false)
const mapIntro = reactive<MapIntroUiState>({
  phase: 'inactive',
  letterboxVisible: false,
  messagePromptVisible: false,
  messageDialogVisible: false,
  controlsLocked: false,
})

function refreshActiveMessage(): void {
  activeMessage.value = shipMessageSystem.getActiveMessage()
  pendingMessageCount.value = shipMessageSystem.getPendingMessageCount()
  if (!activeMessage.value) {
    messageDialogVisible.value = false
  }
}

function openMessage(): void {
  if (activeMessage.value?.status === 'pending') {
    shipMessageSystem.markShown(activeMessage.value.id)
  }

  if (mapIntro.controlsLocked) {
    viewController.openIntroMessage()
  } else {
    messageDialogVisible.value = true
  }

  refreshActiveMessage()
}

function dismissActiveMessage(): void {
  if (!activeMessage.value) return
  shipMessageSystem.dismiss(activeMessage.value.id)
  if (mapIntro.controlsLocked) {
    viewController.completeIntroMessage()
  }
  messageDialogVisible.value = false
  refreshActiveMessage()
}

function messagePromptLabel(): string {
  return pendingMessageCount.value === 1
    ? 'You have 1 new message'
    : `You have ${pendingMessageCount.value} new messages`
}
const telemetry = reactive<ShuttleTelemetry>({
  speed: 0,
  heading: 0,
  posX: 0,
  posZ: 0,
  fuelLevel: 0,
  fuelCapacity: 0,
  thrustCharge: 0,
  thrustCapacity: 0,
  brakeCharge: 0,
  brakeCapacity: 0,
  rcsCharge: 0,
  rcsCapacity: 0,
  adriftCountdown: -1,
  hp: 100,
  maxHp: 100,
  temperature: 0,
  temperatureVisible: false,
  damageIntensity: 0,
})
const orbitState = reactive<OrbitHudState>({
  state: 'free',
  nearestBodyName: null,
  orbitalSpeed: 0,
  slingshotSpeed: 0,
  chargeLevel: 0,
  inspectMode: false,
})
const gravityWarning = reactive<GravityWarningState>({
  proximity: 0,
  bodyName: null,
  visible: false,
})
const gravitationalAnomalyHud = reactive<GravitationalAnomalyHudState>({
  visible: false,
  token: 0,
  title: '',
  subtitle: '',
})
const habitatActive = ref(false)
const shuttleControlVisible = ref(false)
const habitatPrompt = ref<string | null>(null)
const habitatFadeOpacity = ref(0)
const deathVisible = ref(false)
const deathCause = ref('')
const orbitsVisible = ref(true)
const gridVisible = ref(true)
const ambientVisible = ref(true)
const shopButtonVisible = ref(false)
const shopButtonPlanet = ref('')
const shopDialogVisible = ref(false)
const shopSession = ref<ShopSession | null>(null)
const shopProfile = ref<PlayerProfile>(createProfile('Pilot'))
const shopInventory = ref<Inventory>(createInventory())
const playerCredits = ref(1000)

const mapOverlay = reactive<MapOverlayState>({
  visible: false,
  labels: [],
  shipX: 0,
  shipY: 0,
  headingDeg: 0,
  speed: 0,
  distances: [],
  gravityRings: [],
  trajectoryPoints: [],
})

onMounted(async () => {
  if (container.value) {
    viewController.onTelemetry = (t) => {
      Object.assign(telemetry, t)
    }
    viewController.onOrbitState = (s) => {
      Object.assign(orbitState, s)
    }
    viewController.onGravityWarning = (w) => {
      Object.assign(gravityWarning, w)
    }
    viewController.onGravitationalAnomalyHud = (h) => {
      Object.assign(gravitationalAnomalyHud, h)
    }
    viewController.onDeathOverlay = (visible, cause) => {
      deathVisible.value = visible
      deathCause.value = cause
    }
    viewController.onMapOverlay = (s) => {
      Object.assign(mapOverlay, s)
    }
    viewController.onMapIntro = (state) => {
      Object.assign(mapIntro, state)
    }
    viewController.onMessageUpdate = () => {
      refreshActiveMessage()
    }
    viewController.onHabitatActive = (active) => {
      habitatActive.value = active
    }
    viewController.onShuttleControl = (visible) => {
      shuttleControlVisible.value = visible
    }
    viewController.onHabitatPrompt = (prompt) => {
      habitatPrompt.value = prompt
    }
    viewController.onHabitatFade = (opacity) => {
      habitatFadeOpacity.value = opacity
    }
    viewController.onShopButton = (visible, planetName) => {
      shopButtonVisible.value = visible
      shopButtonPlanet.value = planetName
      if (!visible) shopDialogVisible.value = false
    }
    viewController.onShopState = (session, profile, inventory) => {
      if (session) {
        shopSession.value = session
        shopProfile.value = profile
        shopInventory.value = inventory
        shopDialogVisible.value = true
      } else {
        shopDialogVisible.value = false
      }
    }
    viewController.onCreditsUpdate = (credits) => {
      playerCredits.value = credits
    }
    await viewController.init(container.value)
    refreshActiveMessage()
  }
})

onUnmounted(() => {
  viewController.dispose()
})

function handleRestart() {
  viewController.restart()
}

function handleToggleOrbits() {
  orbitsVisible.value = viewController.toggleOrbits()
}

function handleToggleGrid() {
  gridVisible.value = viewController.toggleSpaceTimeGrid()
}

function closeShuttleControl() {
  shuttleControlVisible.value = false
  const canvas = document.querySelector('canvas')
  canvas?.requestPointerLock()
}

function handleToggleAmbient() {
  ambientVisible.value = viewController.toggleAmbient()
}

function openShop() {
  viewController.openShop()
}

function closeShop() {
  shopDialogVisible.value = false
  const canvas = document.querySelector('canvas')
  canvas?.requestPointerLock()
}

function handleShopBuyTradeGood(slotIndex: number, quantity: number) {
  viewController.shopBuyTradeGood(slotIndex, quantity)
}

function handleShopSellItem(itemId: string, quantity: number) {
  viewController.shopSellItem(itemId, quantity)
}

function handleShopRefuel() {
  viewController.shopRefuel()
}

function handleShopBuyReserveFuel() {
  viewController.shopBuyReserveFuel()
}
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <div
    class="map-intro-letterbox map-intro-letterbox--top"
    :class="{ 'map-intro-letterbox--hidden': !mapIntro.letterboxVisible }"
  />
  <div
    class="map-intro-letterbox map-intro-letterbox--bottom"
    :class="{ 'map-intro-letterbox--hidden': !mapIntro.letterboxVisible }"
  />
  <ShuttleHud v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive" :telemetry="telemetry" />
  <OrbitPrompt
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :orbitState="orbitState"
    :shop-available="shopButtonVisible && !shopDialogVisible && !shuttleControlVisible"
    @open-shop="openShop"
  />
  <GravityWarning v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive" :warning="gravityWarning" />
  <GravitationalAnomalyHud
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :anomaly="gravitationalAnomalyHud"
  />
  <DamageVignette :intensity="telemetry.damageIntensity" :temperature="telemetry.temperature" />
  <DeathOverlay
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :visible="deathVisible"
    :cause="deathCause"
    @restart="handleRestart"
  />
  <MapOverlay :overlay="mapOverlay" />
  <div v-if="mapIntro.messagePromptVisible && activeMessage" class="map-intro-message-prompt">
    <button
      type="button"
      class="map-intro-message-prompt__button"
      @click="openMessage"
    >
      {{ messagePromptLabel() }}
    </button>
  </div>
  <div
    v-else-if="!mapIntro.controlsLocked && pendingMessageCount > 0 && activeMessage && !messageDialogVisible"
    class="map-message-notice"
  >
    <button
      type="button"
      class="map-message-notice__button"
      @click="openMessage"
    >
      {{ messagePromptLabel() }}
    </button>
  </div>
  <ShipMessageDialog
    v-if="activeMessage && (mapIntro.messageDialogVisible || messageDialogVisible)"
    :message="activeMessage"
    @dismiss="dismissActiveMessage"
  />
  <div v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive" class="map-view-toggles">
    <button
      type="button"
      class="map-toggle-btn"
      :class="orbitsVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
      @click="handleToggleOrbits"
    >
      <span class="map-toggle-btn__dot" />
      Orbits
    </button>
    <button
      type="button"
      class="map-toggle-btn"
      :class="gridVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
      @click="handleToggleGrid"
    >
      <span class="map-toggle-btn__dot" />
      Space Fabric
    </button>
    <button
      type="button"
      class="map-toggle-btn"
      :class="ambientVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
      @click="handleToggleAmbient"
    >
      <span class="map-toggle-btn__dot" />
      Debris
    </button>
  </div>
  <ShuttleControlOverlay
    :visible="shuttleControlVisible"
    @close="closeShuttleControl"
  />
  <CreditsBadge
    v-show="!mapOverlay.visible && !mapIntro.controlsLocked && !habitatActive"
    :credits="playerCredits"
  />
  <PlanetShopDialog
    v-if="shopDialogVisible && shopSession"
    :session="shopSession"
    :profile="shopProfile"
    :inventory="shopInventory"
    @close="closeShop"
    @buy-trade-good="handleShopBuyTradeGood"
    @sell-item="handleShopSellItem"
    @refuel="handleShopRefuel"
    @buy-reserve-fuel="handleShopBuyReserveFuel"
  />
  <div v-if="habitatActive && habitatPrompt && !shuttleControlVisible" class="habitat-prompt">
    <span class="orbit-prompt-action">{{ habitatPrompt }}</span>
  </div>
  <div
    v-if="habitatFadeOpacity > 0"
    class="habitat-fade"
    :style="{ opacity: habitatFadeOpacity }"
  />
</template>
