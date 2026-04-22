<!-- src/views/MapView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { MapViewController } from './MapViewController'
import ShuttleHud from '@/components/ShuttleHud.vue'
import FpsHud, { type FpsTelemetry } from '@/components/FpsHud.vue'
import HelmetVisor from '@/components/HelmetVisor.vue'
import OrbitPrompt from '@/components/OrbitPrompt.vue'
import GravityWarning from '@/components/GravityWarning.vue'
import GravitationalAnomalyHud from '@/components/GravitationalAnomalyHud.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import DamageVignette from '@/components/DamageVignette.vue'
import MapOverlay from '@/components/MapOverlay.vue'
import FastTravelConfirmDialog from '@/components/FastTravelConfirmDialog.vue'
import ShipMessageDialog from '@/components/ShipMessageDialog.vue'
import ShuttleControlOverlay from '@/components/ShuttleControlOverlay.vue'
import PlanetShopDialog from '@/components/shop/PlanetShopDialog.vue'
import CreditsBadge from '@/components/hud/CreditsBadge.vue'
import AchievementBanner from '@/components/AchievementBanner.vue'
import AchievementsDialog from '@/components/AchievementsDialog.vue'
import PortalWelcomeDialog from '@/components/PortalWelcomeDialog.vue'
import ObjectiveTracker from '@/components/ObjectiveTracker.vue'
import PickupToast from '@/components/PickupToast.vue'
import type { PickupEntry } from '@/components/PickupToast.vue'
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  ActiveVisitRelayMission,
} from '@/lib/missions/types'
import type { OrbitalMiniGame } from '@/lib/minigame/OrbitalMiniGame'
import MissionMiniGameOverlay from '@/components/MissionMiniGameOverlay.vue'
import EvaMinigameOverlay from '@/components/EvaMinigameOverlay.vue'
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
import { contractSystem } from '@/lib/contracts/runtime'
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
import type { MapViewBootState, MapViewLayerToggleState } from './MapViewController'
import type { AchievementProgress } from '@/data/achievements'
import type { JourneyTrackerState } from '@/lib/journeys'
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
  if ((messageDialogVisible.value || mapIntro.messageDialogVisible) && activeMessage.value) {
    // If the dialog is open, don't swap the message out from under the user.
    // Just update the count.
    pendingMessageCount.value = shipMessageSystem.getPendingMessageCount()
    return
  }
  activeMessage.value = shipMessageSystem.getActiveMessage()
  pendingMessageCount.value = shipMessageSystem.getPendingMessageCount()
  if (!activeMessage.value) {
    messageDialogVisible.value = false
  }
}

function openMessage(): void {
  if (activeMessage.value?.status === 'pending') {
    shipMessageSystem.markShown(activeMessage.value.id)
    activeMessage.value = { ...activeMessage.value, status: 'shown' }
    pendingMessageCount.value = shipMessageSystem.getPendingMessageCount()
  }
  messageAudioAutoplayToken.value += 1

  if (mapIntro.controlsLocked) {
    viewController.openIntroMessage()
  } else {
    messageDialogVisible.value = true
  }
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
  turretMiningCharge: 0,
  turretMiningCapacity: 0,
  turretActive: false,
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
const evaActive = ref(false)
const evaTelemetry = reactive<FpsTelemetry>({
  hp: 100,
  maxHp: 100,
  o2Level: 0,
  o2Capacity: 0,
  sprintCharge: 0,
  sprintCapacity: 0,
  speed: 0,
  grounded: false,
  activeMode: 'drill',
  aiming: false,
  isFiring: false,
  rtgLevel: 0,
  rtgCapacity: 0,
  modeCharge: 0,
  modeCapacity: 0,
  headingRad: 0,
  objectives: [],
})
const habitatActive = ref(false)
/** Hides orbit shuttle chrome during Earth first-mail cinematic → habitat (not used when intro is skipped). */
const earthStartupOrbitHudSuppressed = ref(false)
const shuttleControlVisible = ref(false)
/** Programs the map nav bar can deep-link the shuttle terminal into. */
type ShuttleControlInitialProgram = 'mail' | 'missions' | 'inventory'

/** When opening the terminal from the map bar, optionally land on a specific program (e.g. missions). */
const shuttleControlProgramOnOpen = ref<ShuttleControlInitialProgram | undefined>(undefined)

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
const turretFadeOpacity = ref(0)
const turretHudPhase = ref<'idle' | 'opening' | 'active' | 'closing'>('idle')
const turretReticleValid = ref(false)
const turretTarget = ref<{
  label: string
  remainingKg: number
  totalKg: number
  compositionLabel: string
} | null>(null)
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
/**
 * EVA terminal minigame state. Populated when the EVA player presses F at a POI
 * terminal; cleared when they Complete or Close the overlay (or the EVA session
 * ends). Both refs flip together so the overlay never sees a mismatched pair.
 */
const evaMinigameMission = ref<ActiveVisitRelayMission | null>(null)
const evaMinigameInstance = ref<OrbitalMiniGame | null>(null)
const missionBoard = ref<ShuttleMissionBoard | null>(null)
const missionNotification = ref<string | null>(null)
let missionNotificationTimer: TimerHandle | null = null
const pickups = ref<PickupEntry[]>([])
const PICKUP_AGGREGATE_WINDOW_SEC = 1.5
const PICKUP_LIFETIME_SEC = 2.2
const pickupTimers = new Map<string, { handle: ReturnType<typeof Timer.after>; key: string }>()
let pickupSeq = 0
const pickupFailed = ref<{ id: number; label: string; reason: string } | null>(null)
const pickupFailedTimers = new Set<ReturnType<typeof Timer.after>>()
const PICKUP_FAILED_LIFETIME_SEC = 2.4
let pickupFailedSeq = 0
const mapBootState = reactive<MapViewBootState>({
  phase: 'preparing',
  label: 'Loading',
})
const mapExperienceStarted = ref(false)
const journeyTracker = ref<JourneyTrackerState | null>(null)

const mapBootOverlayVisible = computed(() => !mapExperienceStarted.value)
const mapBootReady = computed(() => mapBootState.phase === 'ready')
const turretTargetRatio = computed(() => {
  if (!turretTarget.value || turretTarget.value.totalKg <= 0) return 0
  return Math.max(0, Math.min(1, turretTarget.value.remainingKg / turretTarget.value.totalKg))
})

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

function recordPickupFailed(label: string, reason: string): void {
  pickupFailedSeq += 1
  pickupFailed.value = { id: pickupFailedSeq, label, reason }
  const handle = Timer.after(PICKUP_FAILED_LIFETIME_SEC, () => {
    if (pickupFailed.value?.id === pickupFailedSeq) {
      pickupFailed.value = null
    }
    pickupFailedTimers.delete(handle)
  })
  pickupFailedTimers.add(handle)
}

function clearPickupUi(): void {
  for (const { handle } of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  pickups.value = []
  for (const handle of pickupFailedTimers) Timer.cancel(handle)
  pickupFailedTimers.clear()
  pickupFailed.value = null
}

/** Set of planet ids the player has unlocked for fast travel (from profile). */
const fastTravelablePlanetIds = computed<Set<string>>(
  () => new Set(playerProfileSnapshot.value.unlockedFastTravelPlanets ?? []),
)

const fastTravelDialogVisible = ref(false)
const fastTravelTargetPlanetId = ref<string>('')
const fastTravelTargetPlanetLabel = ref<string>('')
/** Drives the fade-to-black overlay used during the fast travel jump. */
const fastTravelFadeOpacity = ref(0)
const FAST_TRAVEL_FADE_MS = 600
const FAST_TRAVEL_HOLD_MS = 220

/**
 * Handle the player clicking an unlocked planet on the tactical map. Opens the
 * confirmation dialog so they can review the destination before jumping.
 */
function handleMapPlanetClick(planetId: string, planetName: string): void {
  if (!fastTravelablePlanetIds.value.has(planetId)) return
  fastTravelTargetPlanetId.value = planetId
  fastTravelTargetPlanetLabel.value = planetName
  fastTravelDialogVisible.value = true
}

function cancelFastTravel(): void {
  fastTravelDialogVisible.value = false
}

/**
 * Run the fade-to-black transition, perform the warp at peak darkness, then
 * fade back in with the shuttle in its new orbit. Uses raw timeouts so the
 * sequence keeps running even if Vue reactivity is interrupted by the warp.
 */
async function confirmFastTravel(): Promise<void> {
  const planetId = fastTravelTargetPlanetId.value
  if (!planetId) {
    fastTravelDialogVisible.value = false
    return
  }
  fastTravelDialogVisible.value = false

  await new Promise<void>((resolve) => {
    fastTravelFadeOpacity.value = 1
    window.setTimeout(resolve, FAST_TRAVEL_FADE_MS)
  })

  viewController.fastTravelToPlanet(planetId)
  syncPersistentProgressFromController()

  await new Promise<void>((resolve) => window.setTimeout(resolve, FAST_TRAVEL_HOLD_MS))

  fastTravelFadeOpacity.value = 0
  fastTravelTargetPlanetId.value = ''
  fastTravelTargetPlanetLabel.value = ''
}

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
  window.addEventListener('keydown', handleWindowKeydown)
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
    viewController.onEvaTelemetry = (t) => {
      Object.assign(evaTelemetry, t)
    }
    viewController.onEvaModeChange = (active) => {
      evaActive.value = active
    }
    viewController.onEvaMinigameChange = (payload) => {
      if (payload) {
        evaMinigameMission.value = payload.mission
        evaMinigameInstance.value = payload.minigame
      } else {
        evaMinigameMission.value = null
        evaMinigameInstance.value = null
      }
    }
    viewController.onEvaMissionComplete = (mission) => {
      showMissionNotification(
        `EVA mission complete — +${mission.template.reward.toLocaleString()} CR`,
      )
      syncPersistentProgressFromController()
      contractSystem.notifyMissionCompleted({
        kind: 'eva',
        giverPlanetId: mission.giverPlanet,
        giverId: null,
        targetPlanetId: null,
      })
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
    viewController.onBootState = (state) => {
      Object.assign(mapBootState, state)
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
    viewController.onTurretFade = (opacity) => {
      turretFadeOpacity.value = opacity
    }
    viewController.onTurretHudState = (state) => {
      turretHudPhase.value = state.phase
      turretReticleValid.value = state.reticleValid
      turretTarget.value = state.target
      if (state.phase !== 'active') turretTarget.value = null
    }
    viewController.onResourcePickup = (itemId, quantity, label) => {
      recordPickup(itemId, quantity, label)
    }
    viewController.onResourcePickupFailed = (label, reason) => {
      recordPickupFailed(label, reason)
    }
    viewController.onJourneyTracker = (state) => {
      journeyTracker.value = state
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
        contractSystem.notifyOrbitalMissionCompleted({
          giverPlanetId: mission.giverPlanet,
          targetPlanetId: mission.template.targetPlanet,
        })
      }
    }
    viewController.onMissionDeliver = (mission) => {
      if (mission) {
        showMissionNotification(`Mission complete — +${mission.template.reward} CR`)
        syncPersistentProgressFromController()
        contractSystem.notifyMissionCompleted({
          kind: 'shuttle',
          giverPlanetId: mission.giverPlanet,
          giverId: null,
          targetPlanetId: mission.template.targetPlanet,
        })
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
  window.removeEventListener('keydown', handleWindowKeydown)
  clearPickupUi()
  setShipMessageFollowUpDeliveryListener(null)
  stopBackgroundMusic('map')
  viewController.dispose()
})

function handleRestart() {
  viewController.restart()
}

function handlePlay(): void {
  if (mapExperienceStarted.value || !mapBootReady.value) return
  mapExperienceStarted.value = true
  playBackgroundMusic('map')
  viewController.startExperience()
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

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (
    mapIntro.phase !== 'cinematic_zoom' &&
    mapIntro.phase !== 'awaiting_message_open' &&
    mapIntro.phase !== 'reading_message'
  ) {
    return
  }
  event.preventDefault()
  viewController.skipIntro()
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

function openProgramFromMap(program: ShuttleControlInitialProgram): void {
  viewController.notifyJourneyTrigger('shuttle_control_opened')
  shuttleControlProgramOnOpen.value = program
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
  viewController.notifyJourneyTrigger('shop_opened')
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
  contractSystem.notifyUpgradeInstalled(upgradeId, newLevel)
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

function handleShuttleControlScreenChange(screen: string): void {
  if (screen === 'shuttle') {
    viewController.notifyJourneyTrigger('shuttle_program_opened')
    return
  }
  if (screen === 'lander') {
    viewController.notifyJourneyTrigger('lander_program_opened')
    return
  }
  if (screen === 'inventory') {
    viewController.notifyJourneyTrigger('inventory_opened')
    return
  }
  if (screen === 'upgrades') {
    viewController.notifyJourneyTrigger('upgrades_opened')
  }
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
  const result = viewController.missionAccept()
  if (!result.ok && result.reason) {
    showMissionNotification(result.reason)
  }
}

function handleAcceptAsteroidMission() {
  viewController.asteroidMissionAccept()
}

function handleAcceptEvaMission() {
  viewController.evaMissionAccept()
}

/** Player clicked the overlay's Complete button — pay reward and close. */
function handleEvaMinigameComplete(): void {
  viewController.evaMinigameCompleteFromUi()
}

/** Player dismissed the overlay (X or ESC) without finishing. */
function handleEvaMinigameClose(): void {
  viewController.evaMinigameClose()
}

function handleDeliverMission(missionId: string) {
  viewController.missionDeliver(missionId)
}

function dockedPlanetId(): string | null {
  if (orbitState.state !== 'orbiting' || !orbitState.nearestBodyName) return null
  const planet = PLANETS.find((p) => p.name === orbitState.nearestBodyName)
  return planet?.id ?? null
}

/**
 * Notify the contract system whenever the shuttle transitions into an
 * `orbiting` state at a planet. The watcher uses an `oldState` signature so a
 * single visit only fires the notification once until the player breaks orbit.
 */
watch(
  () => ({ state: orbitState.state, name: orbitState.nearestBodyName }),
  (next, prev) => {
    if (next.state !== 'orbiting' || prev?.state === 'orbiting') return
    if (!next.name) return
    const planet = PLANETS.find((p) => p.name === next.name)
    if (!planet) return
    contractSystem.notifyPlanetVisited(planet.id)
  },
)
</script>

<template>
  <div ref="container" class="scene-container"></div>
  <div
    v-if="mapBootOverlayVisible"
    class="map-boot-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="map-boot-title"
  >
    <div class="map-boot-card">
      <div v-if="!mapBootReady" class="map-boot-spinner" />
      <h1 v-if="!mapBootReady" id="map-boot-title" class="map-boot-title">Loading</h1>
      <button
        type="button"
        class="map-boot-play"
        :disabled="!mapBootReady"
        @click="handlePlay"
      >
        PLAY
      </button>
    </div>
  </div>
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
      !deathVisible &&
      !evaActive
    "
    class="map-screen-nav"
    aria-label="Map screen navigation"
  >
    <div class="map-screen-nav__brand">
      <span class="map-screen-nav__title">{{ MAP_SCREEN_GAME_TITLE }}</span>
    </div>
    <div class="map-screen-nav__actions">
      <button
        type="button"
        class="map-screen-nav__icon-btn"
        title="Habitat (H)"
        @click="openHabitatFromMap"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="map-screen-nav__icon"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
      <button
        type="button"
        class="map-screen-nav__icon-btn"
        title="Mail"
        @click="openProgramFromMap('mail')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="map-screen-nav__icon"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
      </button>
      <button
        type="button"
        class="map-screen-nav__icon-btn"
        title="Missions (I)"
        @click="openProgramFromMap('missions')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="map-screen-nav__icon"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
      </button>
      <button
        type="button"
        class="map-screen-nav__icon-btn"
        title="Inventory (B)"
        @click="openProgramFromMap('inventory')"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="map-screen-nav__icon"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
      </button>
      <button
        v-if="shipMessageAudioPlaying"
        type="button"
        class="map-screen-nav__icon-btn"
        title="Stop Message Audio"
        @click="stopShuttleMessageAudio"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="map-screen-nav__icon"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>
      </button>
    </div>
  </header>
  <ShuttleHud
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
    "
    :telemetry="telemetry"
    :fuel-cell-count="fuelCellCount"
    @use-fuel-cell="handleUseFuelCell"
  />
  <HelmetVisor v-if="evaActive" />
  <FpsHud v-if="evaActive" :telemetry="evaTelemetry" variant="eva" />
  <OrbitPrompt
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
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
      !earthStartupOrbitHudSuppressed &&
      !evaActive
    "
    :warning="gravityWarning"
  />
  <GravitationalAnomalyHud
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
    "
    :anomaly="gravitationalAnomalyHud"
  />
  <DamageVignette :intensity="telemetry.damageIntensity" :temperature="telemetry.temperature" />
  <DeathOverlay
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
    "
    :visible="deathVisible"
    :cause="deathCause"
    @restart="handleRestart"
  />
  <MapOverlay
    :overlay="mapOverlay"
    :fast-travelable-planet-ids="fastTravelablePlanetIds"
    @planet-click="handleMapPlanetClick"
  />
  <FastTravelConfirmDialog
    :visible="fastTravelDialogVisible"
    :planet-label="fastTravelTargetPlanetLabel"
    @confirm="confirmFastTravel"
    @cancel="cancelFastTravel"
  />
  <div
    v-show="fastTravelFadeOpacity > 0"
    class="fast-travel-fade"
    :style="{ opacity: fastTravelFadeOpacity }"
    aria-hidden="true"
  />
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
  <ObjectiveTracker
    v-if="journeyTracker && !mapBootOverlayVisible"
    :eyebrow="journeyTracker.eyebrow"
    :title="journeyTracker.title"
    :objectives="journeyTracker.objectives"
  />
  <div
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
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
    @screen-change="handleShuttleControlScreenChange"
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
      !earthStartupOrbitHudSuppressed &&
      !evaActive
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
      !earthStartupOrbitHudSuppressed &&
      !evaActive
    "
    :credits="playerCredits"
  />
  <button
    v-show="
      !mapOverlay.visible &&
      !mapIntro.controlsLocked &&
      !habitatActive &&
      !earthStartupOrbitHudSuppressed &&
      !evaActive
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
  <EvaMinigameOverlay
    v-if="evaMinigameMission && evaMinigameInstance"
    :mission="evaMinigameMission"
    :minigame="evaMinigameInstance"
    @complete="handleEvaMinigameComplete"
    @close="handleEvaMinigameClose"
  />
  <div
    v-if="
      evaActive &&
      telemetry.actionPrompt &&
      !evaMinigameMission &&
      !evaMinigameInstance &&
      !shuttleControlVisible &&
      !deathVisible
    "
    class="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-6"
  >
    <div
      class="rounded-full border border-cyan-300/45 bg-slate-950/68 px-5 py-2 font-mono text-xs uppercase tracking-[0.28em] text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)] backdrop-blur-sm"
    >
      {{ telemetry.actionPrompt }}
    </div>
  </div>
  <div v-if="habitatActive && habitatPrompt && !shuttleControlVisible" class="habitat-prompt">
    <span class="orbit-prompt-action">{{ habitatPrompt }}</span>
  </div>
  <div
    v-if="habitatFadeOpacity > 0"
    class="habitat-fade"
    :style="{ opacity: habitatFadeOpacity }"
  />
  <div
    v-if="turretFadeOpacity > 0"
    class="turret-fade"
    :style="{ opacity: turretFadeOpacity }"
  />
  <div
    v-if="turretHudPhase === 'active'"
    class="turret-crosshair"
    :style="{ opacity: turretReticleValid ? 1 : 0.5 }"
  >
    <svg width="32" height="32" viewBox="0 0 32 32">
      <circle
        cx="16"
        cy="16"
        r="12"
        fill="none"
        :stroke="turretReticleValid ? '#66ff88' : '#3b82f6'"
        stroke-width="1.5"
      />
      <line
        x1="16"
        y1="8"
        x2="16"
        y2="24"
        :stroke="turretReticleValid ? '#66ff88' : '#3b82f6'"
        stroke-width="1"
      />
      <line
        x1="8"
        y1="16"
        x2="24"
        y2="16"
        :stroke="turretReticleValid ? '#66ff88' : '#3b82f6'"
        stroke-width="1"
      />
    </svg>
  </div>
  <div v-if="turretHudPhase === 'active' && turretTarget" class="turret-target-card">
    <div class="turret-target-card__eyebrow">Target Composition</div>
    <div class="turret-target-card__label">{{ turretTarget.label }}</div>
    <div class="turret-target-card__composition">{{ turretTarget.compositionLabel }}</div>
    <div class="turret-target-card__bar">
      <div class="turret-target-card__bar-fill" :style="{ width: `${turretTargetRatio * 100}%` }"></div>
    </div>
    <div class="turret-target-card__hp">
      {{ Math.ceil(turretTarget.remainingKg) }} / {{ Math.round(turretTarget.totalKg) }} KG
    </div>
  </div>
  <PickupToast :pickups="pickups" />
  <transition name="pickup-failed">
    <div
      v-if="pickupFailed"
      :key="pickupFailed.id"
      class="pickup-failed"
      role="status"
      aria-live="polite"
    >
      <span class="pickup-failed__head">CARGO FULL</span>
      <span class="pickup-failed__body">{{ pickupFailed.label }} lost - {{ pickupFailed.reason }}</span>
    </div>
  </transition>
  <PortalWelcomeDialog
    :visible="portalWelcomeVisible"
    :player-name="playerProfileSnapshot.name"
    :is-first-visit="portalWelcomeIsFirstVisit"
    @watch-intro="handlePortalWatchIntro"
    @skip="handlePortalSkip"
  />
  </template>
</template>

<style>
.turret-crosshair {
  position: fixed;
  inset: 50% auto auto 50%;
  z-index: 44;
  transform: translate(-50%, -50%);
  pointer-events: none;
  filter: drop-shadow(0 0 14px rgba(59, 130, 246, 0.38));
}

.turret-target-card {
  position: fixed;
  left: 50%;
  bottom: max(4rem, env(safe-area-inset-bottom, 0px) + 3rem);
  z-index: 44;
  width: min(28rem, calc(100vw - 2rem));
  transform: translateX(-50%);
  padding: 0.9rem 1rem 0.85rem;
  border: 1px solid rgba(103, 232, 249, 0.34);
  border-radius: 1rem;
  background: linear-gradient(180deg, rgba(5, 18, 28, 0.9), rgba(3, 10, 18, 0.82));
  box-shadow: 0 0 30px rgba(34, 211, 238, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  pointer-events: none;
}

.turret-target-card__eyebrow {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.68rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(186, 230, 253, 0.76);
}

.turret-target-card__label {
  margin-top: 0.25rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 1.2rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #e0fbff;
}

.turret-target-card__composition {
  margin-top: 0.2rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: rgba(191, 219, 254, 0.88);
}

.turret-target-card__bar {
  height: 0.48rem;
  margin-top: 0.65rem;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.95);
  box-shadow: inset 0 0 0 1px rgba(125, 211, 252, 0.18);
}

.turret-target-card__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22d3ee, #67e8f9 55%, #ecfeff);
  box-shadow: 0 0 20px rgba(103, 232, 249, 0.45);
}

.turret-target-card__hp {
  margin-top: 0.42rem;
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(224, 242, 254, 0.88);
}

.pickup-failed {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right, 0px) + 0.5rem);
  bottom: max(7.25rem, env(safe-area-inset-bottom, 0px) + 3rem);
  z-index: 46;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: min(22rem, calc(100vw - 2rem));
  padding: 0.8rem 0.95rem;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 0.9rem;
  background: rgba(36, 8, 8, 0.9);
  box-shadow: 0 0 24px rgba(248, 113, 113, 0.14);
  pointer-events: none;
}

.pickup-failed__head {
  font-family: 'Datatype', ui-monospace, monospace;
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fca5a5;
}

.pickup-failed__body {
  font-size: 0.84rem;
  color: rgba(254, 226, 226, 0.92);
}

.pickup-failed-enter-active,
.pickup-failed-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.pickup-failed-enter-from,
.pickup-failed-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
