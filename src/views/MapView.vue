<!-- src/views/MapView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
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
import AchievementBanner from '@/components/AchievementBanner.vue'
import AchievementsDialog from '@/components/AchievementsDialog.vue'
import PortalWelcomeDialog from '@/components/PortalWelcomeDialog.vue'
import type { ShuttleMissionBoard, ActiveShuttleMission } from '@/lib/missions/types'
import MissionMiniGameOverlay from '@/components/MissionMiniGameOverlay.vue'
import { PLANETS } from '@/lib/planets/catalog'
import type { ShopSession } from '@/lib/shop/tradeTypes'
import type { PlayerProfile } from '@/lib/player/types'
import type { Inventory } from '@/lib/inventory/types'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'
import {
  shipMessageSystem,
  setShipMessageFollowUpDeliveryListener,
} from '@/lib/messages/runtime'
import {
  getUpgradeCost,
  getPlayerUpgradeLevelsSnapshot,
  hasGravitySurfingUnlock,
  hydratePlayerUpgradeLevelsFromStorage,
  UPGRADE_DEFINITIONS,
  type UpgradeId,
  type UpgradeLevels,
} from '@/lib/upgrades'
import UpgradeInstalledAnnouncement from '@/components/UpgradeInstalledAnnouncement.vue'
import { Timer, type TimerHandle } from '@/lib/Timer'
import type { ActiveShipMessage } from '@/lib/messages/messageTypes'
import type { MapIntroUiState } from '@/lib/mapIntroState'
import type { MapViewLayerToggleState } from './MapViewController'
import type { AchievementProgress } from '@/data/achievements'
import type {
  ShuttleTelemetry,
  GravityWarningState,
  GravitationalAnomalyHudState,
  MapOverlayState,
} from '@/lib/ShuttleTelemetry'
import { isWithinAsteroidMissionApproachRadius } from '@/lib/missions/mapAsteroidMissionApproach'
import type { OrbitHudState } from '@/lib/orbitCapture'
import {
  evaluateAchievementUnlocks,
  loadUnlockedAchievementIds,
  persistUnlockedAchievementIds,
} from '@/lib/achievements'
import {
  stopMessageAudio,
  useShipMessageAudioGlobalState,
} from '@/components/shuttle-control/shipMessageAudioSession'
import {
  playBackgroundMusic,
  stopBackgroundMusic,
  toggleBackgroundMusic,
  useBackgroundMusicGlobalState,
} from '@/audio/backgroundMusic'

/** So Space Fabric gating matches storage before the first paint (also merged again in controller `init`). */
hydratePlayerUpgradeLevelsFromStorage()

/** Matches `index.html` document title — map screen top bar branding. */
const MAP_SCREEN_GAME_TITLE = 'Asteroid Lander'
const shipMessageAudio = useShipMessageAudioGlobalState()
const shipMessageAudioPlaying = computed(() => shipMessageAudio.isPlaying.value)
const backgroundMusic = useBackgroundMusicGlobalState()
const musicEnabled = computed(() => backgroundMusic.isEnabled.value)

const container = ref<HTMLElement>()
const viewController = new MapViewController()
const activeMessage = ref<ActiveShipMessage | null>(null)
const pendingMessageCount = ref(0)
const messageDialogVisible = ref(false)
const messageAudioAutoplayToken = ref(0)
/**
 * `controlsLocked: true` until the first MapViewController `onMapIntro` sync — hides shuttle HUD for
 * the gap before `init()` (lib `MapIntroState` is `inactive` / unlocked until `start()` or `skip()`).
 */
const mapIntro = reactive<MapIntroUiState>({
  phase: 'inactive',
  letterboxVisible: false,
  messagePromptVisible: false,
  messageDialogVisible: false,
  controlsLocked: true,
  cinematicCaption: '',
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
  messageAudioAutoplayToken.value += 1

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
  actionPrompt: null,
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
  compassBearings: [],
})
const orbitState = reactive<OrbitHudState>({
  state: 'free',
  nearestBodyName: null,
  orbitalSpeed: 0,
  slingshotSpeed: 0,
  chargeLevel: 0,
  inspectMode: false,
  progradeAlignment: 0,
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
/** Hides orbit shuttle chrome during Earth first-mail cinematic → habitat (not used when intro is skipped). */
const earthStartupOrbitHudSuppressed = ref(false)
const shuttleControlVisible = ref(false)
/** When opening the terminal from the map bar, optionally land on a specific program (e.g. missions). */
const shuttleControlProgramOnOpen = ref<'missions' | undefined>(undefined)

watch(shuttleControlVisible, (visible) => {
  if (!visible) shuttleControlProgramOnOpen.value = undefined
})
/** Upgrade levels shown in the shuttle terminal engineering bay (synced on open / after purchase). */
const upgradeLevelsUi = ref<Partial<Record<UpgradeId, number>>>(getPlayerUpgradeLevelsSnapshot())
const upgradeInstalledVisible = ref(false)
const upgradeInstalledHeadline = ref('UPGRADE INSTALLED')
const upgradeInstalledUpgradeName = ref('')
const upgradeInstalledTier = ref(1)
const upgradeInstalledCreditsSpent = ref(0)
const upgradeInstalledMetaText = ref<string | null>(null)
const habitatPrompt = ref<string | null>(null)
const habitatFadeOpacity = ref(0)
const deathVisible = ref(false)
const deathCause = ref('')
const achievementsOpen = ref(false)
const portalWelcomeVisible = ref(false)
const portalWelcomeIsFirstVisit = ref(false)
/**
 * Hidden for portal arrivals until the welcome dialog is dismissed.
 * Initialised from the URL at setup time (before any async init) so the
 * UI never flashes on during the loading phase.
 */
const portalCinematicActive = ref(
  new URLSearchParams(window.location.search).get('portal') === 'true',
)
const unlockedAchievementIds = ref<string[]>(loadUnlockedAchievementIds())
const achievementBannerRef = ref<InstanceType<typeof AchievementBanner> | null>(null)
const orbitsVisible = ref(true)
const gridVisible = ref(false)
const labelsVisible = ref(true)
const ambientVisible = ref(true)
const shopButtonVisible = ref(false)
const shopButtonPlanet = ref('')
const shopDialogVisible = ref(false)
const shopSession = ref<ShopSession | null>(null)
const shopProfile = ref<PlayerProfile>(createProfile('Pilot'))
const playerProfileSnapshot = ref<PlayerProfile>(createProfile('Pilot'))
const shopInventory = ref<Inventory>(createInventory())
const playerCredits = ref(1000)
const fuelCellCount = ref(0)
const missionButtonVisible = ref(false)
const missionOverlayVisible = ref(false)
const missionOverlayMission = ref<ActiveShuttleMission | null>(null)
const missionOverlayCanFit = ref(false)
const activeOrbitalMinigame = computed(
  () => viewController.activeMinigame,
)
const missionBoard = ref<ShuttleMissionBoard | null>(null)
const missionNotification = ref<string | null>(null)
let missionNotificationTimer: TimerHandle | null = null

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
  missionWaypoint: null,
})

/** Space Fabric toggle is shown only after Gravity Surfing (shop-hidden upgrade). */
const spaceFabricControlUnlocked = computed(() =>
  hasGravitySurfingUnlock(upgradeLevelsUi.value as UpgradeLevels),
)

const achievementProgress = computed<AchievementProgress>(() => ({
  profile: playerProfileSnapshot.value,
  upgradeLevels: upgradeLevelsUi.value,
}))

watch(unlockedAchievementIds, (ids) => {
  persistUnlockedAchievementIds(ids)
}, { deep: true })

watch(achievementProgress, (progress) => {
  const result = evaluateAchievementUnlocks(progress, unlockedAchievementIds.value)
  if (result.newlyUnlocked.length === 0) return
  unlockedAchievementIds.value = result.unlockedIds
  for (const unlocked of result.newlyUnlocked) {
    if (unlocked.rewardCredits > 0) {
      viewController.giveCredits(unlocked.rewardCredits)
    }
    achievementBannerRef.value?.show(
      unlocked.icon,
      unlocked.title,
      unlocked.subtitle,
      `${unlocked.description} +${unlocked.rewardCredits.toLocaleString()} CR`,
      unlocked.type,
    )
  }
}, { deep: true, immediate: true })

/** Begin-mission prompt: derived from telemetry + board so it never depends on a Three.js callback. */
const missionApproachHud = computed(() => {
  if (
    mapOverlay.visible ||
    mapIntro.controlsLocked ||
    habitatActive.value ||
    deathVisible.value ||
    earthStartupOrbitHudSuppressed.value
  ) {
    return { visible: false as const, name: '' }
  }
  const board = missionBoard.value
  const m = board?.activeAsteroidMission
  if (!m || m.status !== 'accepted') {
    return { visible: false as const, name: '' }
  }
  if (telemetry.hp <= 0) {
    return { visible: false as const, name: '' }
  }
  if (!isWithinAsteroidMissionApproachRadius(telemetry.posX, telemetry.posZ, m.waypoint)) {
    return { visible: false as const, name: '' }
  }
  return { visible: true as const, name: m.name }
})

function showMissionNotification(text: string): void {
  missionNotification.value = text
  if (missionNotificationTimer) Timer.cancel(missionNotificationTimer)
  missionNotificationTimer = Timer.after(4, () => {
    missionNotification.value = null
  })
}

function syncPersistentProgressFromController(): void {
  playerProfileSnapshot.value = viewController.getPlayerProfileSnapshot()
  upgradeLevelsUi.value = viewController.getUpgradeLevelsSnapshot()
  playerCredits.value = playerProfileSnapshot.value.credits
}

onMounted(async () => {
  playBackgroundMusic('map')
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
    viewController.onMapViewLayerToggles = (state: MapViewLayerToggleState) => {
      orbitsVisible.value = state.orbitsVisible
      gridVisible.value = state.gridVisible
      labelsVisible.value = state.labelsVisible
      ambientVisible.value = state.ambientVisible
    }
    viewController.onUpgradeHudRefresh = () => {
      syncPersistentProgressFromController()
    }
    viewController.onUpgradeInstalledAnnouncement = (headline, upgradeName, tier, creditsSpent, metaText) => {
      upgradeInstalledHeadline.value = headline
      upgradeInstalledUpgradeName.value = upgradeName
      upgradeInstalledTier.value = tier
      upgradeInstalledCreditsSpent.value = creditsSpent
      upgradeInstalledMetaText.value = metaText ?? null
      upgradeInstalledVisible.value = false
      Timer.after(0, () => {
        upgradeInstalledVisible.value = true
      })
    }
    viewController.onMessageUpdate = () => {
      refreshActiveMessage()
    }
    viewController.onEarthStartupOrbitHudSuppressed = (suppressed) => {
      earthStartupOrbitHudSuppressed.value = suppressed
    }
    viewController.onHabitatActive = (active) => {
      habitatActive.value = active
    }
    viewController.onShuttleControl = (visible) => {
      shuttleControlVisible.value = visible
      if (visible) {
        syncPersistentProgressFromController()
        shopProfile.value = viewController.getPlayerProfileSnapshot()
        shopInventory.value = viewController.getPlayerInventorySnapshot()
      }
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
      shopProfile.value = profile
      playerProfileSnapshot.value = { ...profile }
      shopInventory.value = inventory
      if (session) {
        shopSession.value = session
        shopDialogVisible.value = true
      } else {
        shopSession.value = null
        shopDialogVisible.value = false
      }
    }
    viewController.onCreditsUpdate = (credits) => {
      playerCredits.value = credits
      playerProfileSnapshot.value = {
        ...viewController.getPlayerProfileSnapshot(),
        credits,
      }
    }
    viewController.onFuelCellCount = (count) => {
      fuelCellCount.value = count
    }
    viewController.onMissionButton = (visible) => {
      missionButtonVisible.value = visible
    }
    viewController.onMissionOverlay = (visible, mission, canFit) => {
      missionOverlayVisible.value = visible
      missionOverlayMission.value = mission
      missionOverlayCanFit.value = canFit
    }
    viewController.onMissionBoardUpdate = (board) => {
      missionBoard.value = board
    }
    viewController.onMissionComplete = (mission) => {
      if (mission) {
        showMissionNotification(`Mission items collected — return to deliver`)
        syncPersistentProgressFromController()
      }
    }
    viewController.onMissionDeliver = (mission) => {
      if (mission) {
        showMissionNotification(`Mission complete — +${mission.template.reward} CR`)
        syncPersistentProgressFromController()
      }
    }
    viewController.onBeginAsteroidMission = () => {
      import('@/router').then((mod) => {
        mod.default.push('/level')
      })
    }
    viewController.onPortalWelcome = () => {
      portalWelcomeIsFirstVisit.value = !viewController.getPlayerProfileSnapshot().hasSeenIntro
      portalWelcomeVisible.value = true
    }
    setShipMessageFollowUpDeliveryListener(() => {
      refreshActiveMessage()
    })
    await viewController.init(container.value)
    syncPersistentProgressFromController()
    shopProfile.value = viewController.getPlayerProfileSnapshot()
    shopInventory.value = viewController.getPlayerInventorySnapshot()
    refreshActiveMessage()
  }
})

onUnmounted(() => {
  setShipMessageFollowUpDeliveryListener(null)
  stopBackgroundMusic('map')
  viewController.dispose()
})

function handleRestart() {
  viewController.restart()
}

function handlePortalWatchIntro(): void {
  portalWelcomeVisible.value = false
  portalCinematicActive.value = false
  viewController.portalWatchIntro()
}

function handlePortalSkip(): void {
  portalWelcomeVisible.value = false
  portalCinematicActive.value = false
  viewController.portalSkipIntro()
}

function handleToggleOrbits() {
  orbitsVisible.value = viewController.toggleOrbits()
}

function handleToggleGrid() {
  gridVisible.value = viewController.toggleSpaceTimeGrid()
}

function closeShuttleControl() {
  shuttleControlVisible.value = false
  // Habitat opens the terminal after `exitPointerLock`; map mode uses orbit drag without lock.
  if (habitatActive.value) {
    const canvas = document.querySelector('canvas')
    canvas?.requestPointerLock()
  }
}

function openShuttleControlFromMap(): void {
  shuttleControlVisible.value = true
  syncPersistentProgressFromController()
  shopProfile.value = viewController.getPlayerProfileSnapshot()
  shopInventory.value = viewController.getPlayerInventorySnapshot()
}

function openMissionsFromMap(): void {
  shuttleControlProgramOnOpen.value = 'missions'
  shuttleControlVisible.value = true
  syncPersistentProgressFromController()
  shopProfile.value = viewController.getPlayerProfileSnapshot()
  shopInventory.value = viewController.getPlayerInventorySnapshot()
}

function stopShuttleMessageAudio(): void {
  stopMessageAudio()
}

function handleToggleMusic(): void {
  toggleBackgroundMusic()
}

function openHabitatFromMap(): void {
  shuttleControlVisible.value = false
  viewController.enterHabitat()
}

function openShopFromTerminal() {
  shuttleControlVisible.value = false
  viewController.openShop()
}

function handlePurchaseUpgrade(upgradeId: UpgradeId): void {
  if (!viewController.purchaseNextUpgradeLevel(upgradeId)) return
  syncPersistentProgressFromController()
  const newLevel = upgradeLevelsUi.value[upgradeId] ?? 0
  const def = UPGRADE_DEFINITIONS[upgradeId]
  upgradeInstalledHeadline.value = 'UPGRADE INSTALLED'
  upgradeInstalledUpgradeName.value = def.label
  upgradeInstalledTier.value = newLevel
  upgradeInstalledCreditsSpent.value = getUpgradeCost(upgradeId, newLevel)
  upgradeInstalledMetaText.value = null
  upgradeInstalledVisible.value = true
}

function onUpgradeInstalledDismissed(): void {
  upgradeInstalledVisible.value = false
  upgradeInstalledMetaText.value = null
}

function handleToggleLabels() {
  labelsVisible.value = viewController.toggleLabels()
}

function handleToggleAmbient() {
  ambientVisible.value = viewController.toggleAmbient()
}

function openShop() {
  viewController.openShop()
}

function closeShop() {
  shopDialogVisible.value = false
  viewController.closeShop()
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

function handleShopBuyLanderFuel() {
  viewController.shopBuyLanderFuel()
}

function handleRepairHull() {
  viewController.shopRepairHull()
}

function handleUseFuelCell() {
  viewController.useFuelCell()
}

function handleUseInventoryItem(itemId: string) {
  viewController.useInventoryItem(itemId)
}

function openMissionOverlay() {
  viewController.openMissionOverlay()
}

function handleMissionComplete() {
  if (missionOverlayMission.value) {
    viewController.missionComplete(missionOverlayMission.value.template.id)
  }
}

function closeMissionOverlay() {
  viewController.closeMissionOverlay()
}

function handleAcceptMission() {
  viewController.missionAccept()
}

function handleAcceptAsteroidMission() {
  viewController.asteroidMissionAccept()
}

function handleAcceptEvaMission() {
  viewController.evaMissionAccept()
}

function handleDeliverMission(missionId: string) {
  viewController.missionDeliver(missionId)
}

function dockedPlanetId(): string | null {
  if (orbitState.state !== 'orbiting' || !orbitState.nearestBodyName) return null
  const planet = PLANETS.find((p) => p.name === orbitState.nearestBodyName)
  return planet?.id ?? null
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
  <p v-show="mapIntro.cinematicCaption" class="map-intro-cinematic-caption">
    {{ mapIntro.cinematicCaption }}
  </p>
  <template v-if="!portalCinematicActive">
  <header
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !deathVisible
    "
    class="map-screen-nav"
    aria-label="Map screen navigation"
  >
    <div class="map-screen-nav__brand">
      <span class="map-screen-nav__title">{{ MAP_SCREEN_GAME_TITLE }}</span>
    </div>
    <div class="map-screen-nav__actions">
      <button type="button" class="map-screen-nav__btn map-screen-nav__btn--habitat" @click="openHabitatFromMap">
        H Habitat
      </button>
      <button
        type="button"
        class="map-screen-nav__btn map-screen-nav__btn--missions"
        @click="openMissionsFromMap"
      >
        Missions
      </button>
      <button
        type="button"
        class="map-screen-nav__btn map-screen-nav__btn--terminal"
        @click="openShuttleControlFromMap"
      >
        Control Panel
      </button>
      <button
        v-if="shipMessageAudioPlaying"
        type="button"
        class="map-screen-nav__btn map-screen-nav__btn--audio-stop"
        @click="stopShuttleMessageAudio"
      >
        Stop Message Audio
      </button>
    </div>
  </header>
  <ShuttleHud
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    :telemetry="telemetry"
    :fuel-cell-count="fuelCellCount"
    @use-fuel-cell="handleUseFuelCell"
  />
  <OrbitPrompt
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    :orbitState="orbitState"
    :shop-available="shopButtonVisible && !shopDialogVisible && !shuttleControlVisible"
    :mission-available="missionButtonVisible && !missionOverlayVisible && !shuttleControlVisible"
    @open-shop="openShop"
    @open-mission="openMissionOverlay"
  />
  <GravityWarning
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    :warning="gravityWarning"
  />
  <GravitationalAnomalyHud
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    :anomaly="gravitationalAnomalyHud"
  />
  <DamageVignette :intensity="telemetry.damageIntensity" :temperature="telemetry.temperature" />
  <DeathOverlay
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
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
    v-else-if="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !earthStartupOrbitHudSuppressed &&
      pendingMessageCount > 0 &&
      activeMessage &&
      !messageDialogVisible
    "
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
    :autoplay-token="messageAudioAutoplayToken"
    @dismiss="dismissActiveMessage"
  />
  <div
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    class="map-view-toggles"
  >
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
      v-if="spaceFabricControlUnlocked"
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
    <button
      type="button"
      class="map-toggle-btn"
      :class="labelsVisible ? 'map-toggle-btn--active' : 'map-toggle-btn--inactive'"
      @click="handleToggleLabels"
    >
      <span class="map-toggle-btn__dot" />
      Labels
    </button>
  </div>
  <ShuttleControlOverlay
    :visible="shuttleControlVisible"
    :program-to-select-on-open="shuttleControlProgramOnOpen"
    :inventory="shopInventory"
    :inventory-stacks="shopInventory.stacks"
    :mission-board="missionBoard"
    :docked-planet="dockedPlanetId()"
    :upgrade-levels="upgradeLevelsUi"
    :player-credits="playerCredits"
    :player-name="playerProfileSnapshot.name"
    :telemetry="telemetry"
    @close="closeShuttleControl"
    @open-shop="openShopFromTerminal"
    @purchase-upgrade="handlePurchaseUpgrade"
    @accept-mission="handleAcceptMission"
    @deliver-mission="handleDeliverMission"
    @accept-asteroid-mission="handleAcceptAsteroidMission"
    @accept-eva-mission="handleAcceptEvaMission"
    @use-item="handleUseInventoryItem"
    @mail-changed="refreshActiveMessage"
  />
  <UpgradeInstalledAnnouncement
    :visible="upgradeInstalledVisible"
    :headline="upgradeInstalledHeadline"
    :upgrade-name="upgradeInstalledUpgradeName"
    :tier="upgradeInstalledTier"
    :credits-spent="upgradeInstalledCreditsSpent"
    :meta-text="upgradeInstalledMetaText ?? undefined"
    @dismissed="onUpgradeInstalledDismissed"
  />
  <AchievementsDialog
    :open="achievementsOpen"
    :progress="achievementProgress"
    :unlocked-ids="unlockedAchievementIds"
    @close="achievementsOpen = false"
  />
  <AchievementBanner ref="achievementBannerRef" />
  <button
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    type="button"
    class="music-toggle-btn map-screen-nav__icon-btn"
    :aria-label="musicEnabled ? 'Mute music' : 'Unmute music'"
    :title="musicEnabled ? 'Mute music' : 'Unmute music'"
    @click="handleToggleMusic"
  >
    <svg viewBox="0 0 24 24" class="map-screen-nav__icon" aria-hidden="true">
      <path d="M5 9v6h4l5 4V5L9 9H5Z" fill="currentColor" />
      <path
        v-if="musicEnabled"
        d="M17 9.5a4 4 0 0 1 0 5"
        fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"
      />
      <path
        v-if="musicEnabled"
        d="M19.5 7a7.5 7.5 0 0 1 0 10"
        fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8"
      />
      <path
        v-if="!musicEnabled"
        d="m17 8 4 8"
        fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"
      />
      <path
        v-if="!musicEnabled"
        d="m21 8-4 8"
        fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"
      />
    </svg>
  </button>
  <CreditsBadge
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    :credits="playerCredits"
  />
  <button
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed
    "
    type="button"
    class="achievements-badge-btn border-amber-300/55 text-amber-100 bg-amber-300/10 hover:bg-amber-300/18 hover:border-amber-200/80"
    @click="achievementsOpen = true"
  >
    Achievements {{ unlockedAchievementIds.length }}
  </button>
  <div v-if="missionNotification" class="mission-notification">
    {{ missionNotification }}
  </div>
  <div v-if="missionApproachHud.visible" class="mission-approach-prompt">
    <span class="mission-approach-prompt__name">{{ missionApproachHud.name }}</span>
    <span class="mission-approach-prompt__action">F  Begin Mission</span>
  </div>
  <PlanetShopDialog
    v-if="shopDialogVisible && shopSession"
    :session="shopSession"
    :profile="shopProfile"
    :inventory="shopInventory"
    :fuel-full="telemetry.fuelLevel >= telemetry.fuelCapacity * 0.99"
    :hull-full="telemetry.hp >= telemetry.maxHp"
    @close="closeShop"
    @buy-trade-good="handleShopBuyTradeGood"
    @sell-item="handleShopSellItem"
    @refuel="handleShopRefuel"
    @buy-reserve-fuel="handleShopBuyReserveFuel"
    @buy-lander-fuel="handleShopBuyLanderFuel"
    @repair-hull="handleRepairHull"
  />
  <MissionMiniGameOverlay
    v-if="missionOverlayVisible && missionOverlayMission"
    :mission="missionOverlayMission"
    :can-fit-cargo="missionOverlayCanFit"
    :minigame="activeOrbitalMinigame"
    @complete="handleMissionComplete"
    @close="closeMissionOverlay"
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
  <PortalWelcomeDialog
    :visible="portalWelcomeVisible"
    :player-name="playerProfileSnapshot.name"
    :is-first-visit="portalWelcomeIsFirstVisit"
    @watch-intro="handlePortalWatchIntro"
    @skip="handlePortalSkip"
  />
</template>
