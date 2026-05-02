<!-- src/views/LevelView.vue -->
<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Timer } from '@/lib/Timer'
import DebugHud from '@/components/DebugHud.vue'
import { isDebugHudEnabled } from '@/lib/debug/debugMetrics'
import { LevelViewController } from './LevelViewController'
import LanderHud from '@/components/LanderHud.vue'
import MissionAnnouncement from '@/components/MissionAnnouncement.vue'
import LevelLoadingOverlay from '@/components/LevelLoadingOverlay.vue'
import type { LevelViewBootState } from './LevelViewController'
import MissionTipMarquee from '@/components/MissionTipMarquee.vue'
import ObjectiveTracker from '@/components/ObjectiveTracker.vue'
import type { ObjectiveTrackerEntry } from '@/components/ObjectiveTracker.vue'
import FpsHud from '@/components/FpsHud.vue'
import FpsCompass from '@/components/FpsCompass.vue'
import DeathOverlay from '@/components/DeathOverlay.vue'
import DamageFeedback from '@/components/DamageFeedback.vue'
import LevelMinimap from '@/components/LevelMinimap.vue'
import type { MapMarker } from '@/components/LevelMinimap.vue'
import PickupToast from '@/components/PickupToast.vue'
import type {
  PickupEntry,
  ProspectEntry,
  SurveyEntry,
  SurvivorEventEntry,
} from '@/components/PickupToast.vue'
import LevelInventoryPanel from '@/components/LevelInventoryPanel.vue'
import type { Inventory } from '@/lib/inventory/types'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { removeItem } from '@/lib/inventory/inventory'
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { MissionTipTransmission } from '@/lib/level/missionTips'
import {
  getMissionTipObjectiveType,
  resolveFirstRunLanderTipTransmission,
  resolveMissionTipTransmission,
  resolveRuntimeMissionTipTransmission,
} from '@/lib/level/missionTips'
import {
  getVisibleMissionTipsForView,
  pushMissionTipQueue,
  removeMissionTipQueueEntry,
} from '@/lib/level/missionTipQueue'
import {
  shouldTriggerDrillWalkingTip,
  shouldTriggerGatherRocketScienceTip,
  shouldTriggerLanderHullRepairTip,
  shouldTriggerLanderWarningTip,
  shouldTriggerLowOxygenTip,
  shouldTriggerLowRtgTip,
} from '@/lib/level/levelRuntimeTipTriggers'
import type { ObjectiveType } from '@/lib/missions/types'
import { loadProfile } from '@/lib/player/profile'
import { OBJECTIVE_LABELS } from '@/lib/minigame/MiniGame'
import RescueSurvivorPanel from '@/components/RescueSurvivorPanel.vue'
import DanScanPanel from '@/components/DanScanPanel.vue'
import BunkerWaveHud from '@/components/BunkerWaveHud.vue'
import { RescueMinigame } from '@/lib/minigame/RescueMinigame'
import { DanMinigame } from '@/lib/minigame/DanMinigame'
import { BunkerMinigame } from '@/lib/minigame/BunkerMinigame'
import type { BunkerSubState } from '@/lib/bunker/bunkerSceneState'
import { shouldHardReloadLevelRestart } from '@/lib/level/levelRestartPolicy'
import ProspectusOverlay from '@/components/ProspectusOverlay.vue'
import { contractSystem } from '@/lib/contracts/runtime'
import {
  playBackgroundMusic,
  stopBackgroundMusic,
  toggleBackgroundMusic,
  useBackgroundMusicGlobalState,
} from '@/audio/backgroundMusic'
import { uiAudio } from '@/audio/UiAudioDirector'
import { LEVEL_GRID_SIZE } from '@/lib/missions/asteroidMissionGenerator'

const route = useRoute()
const router = useRouter()
const debugHudVisible = computed(
  () => route.query.debug === '1' || route.query.debug === 'true' || isDebugHudEnabled(),
)
const container = ref<HTMLElement>()
const viewController = new LevelViewController()
const letterboxVisible = ref(true)
const bootPhase = ref<LevelViewBootState['phase']>('preparing')
const bootLabel = ref('Preparing')
const bootAsteroid = ref('')
const bootMission = ref('')
const stateInfo = reactive({ state: '', grounded: false, canExfil: false, canEnterLander: false })
const deathFade = ref(0)
const deathMessage = ref(false)
// Start fully black so the canvas never flashes white between the loading
// screen and the cutscene's first frame. ArrivalSequence.tickEstablish drives
// it back to 0 during the establish phase.
const arrivalFade = ref(1)
const deathOverlayVisible = ref(false)
const deathOverlayCause = ref('')
const showMap = ref(false)
const showInventory = ref(false)
const inventorySnapshot = ref<Inventory | null>(null)
/** Positive deltas vs sortie baseline for cargo panel badges (catalog id → qty). */
const inventoryRunGainsThisSortie = ref<Record<string, number>>({})
const terminalPrompt = ref<string | null>(null)
const announceVisible = ref(false)
const announceAsteroid = ref('')
const announceMission = ref('')
const objCompleteVisible = ref(false)
const objCompleteLabel = ref('')
const missionCompleteVisible = ref(false)
const trackerVisible = ref(false)
const missionTipQueue = ref<MissionTipTransmission[]>([])
const activeMissionTipView = computed(() => (stateInfo.state === 'lander' ? 'lander' : 'fps'))
const visibleMissionTips = computed(() =>
  getVisibleMissionTipsForView(missionTipQueue.value, activeMissionTipView.value),
)
const activeMissionObjectiveType = ref<ObjectiveType | null>(null)
const trackerObjectives = ref<ObjectiveTrackerEntry[]>([])
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

const prospectEntries = ref<ProspectEntry[]>([])
const PROSPECT_TOAST_LIFETIME_SEC = 5.0
const prospectTimers = new Map<string, ReturnType<typeof Timer.after>>()
let prospectSeq = 0

/**
 * Push a prospect-complete entry that auto-removes after
 * {@link PROSPECT_TOAST_LIFETIME_SEC}. Each call gets its own timer
 * so back-to-back prospects don't clobber each other.
 */
function recordProspect(label: string): void {
  prospectSeq += 1
  const entry: ProspectEntry = { id: `prospect-${prospectSeq}`, label }
  prospectEntries.value.push(entry)
  const handle = Timer.after(PROSPECT_TOAST_LIFETIME_SEC, () => {
    const idx = prospectEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) prospectEntries.value.splice(idx, 1)
    prospectTimers.delete(entry.id)
  })
  prospectTimers.set(entry.id, handle)
}

const surveyEntries = ref<SurveyEntry[]>([])
const SURVEY_TOAST_LIFETIME_SEC = 5.0
const surveyTimers = new Map<string, ReturnType<typeof Timer.after>>()
let surveySeq = 0

/**
 * Push a survey-reveal entry that auto-removes after
 * {@link SURVEY_TOAST_LIFETIME_SEC}. Each call gets its own timer so
 * back-to-back reveals don't clobber each other.
 */
function recordSurvey(label: string): void {
  surveySeq += 1
  const entry: SurveyEntry = { id: `survey-${surveySeq}`, label }
  surveyEntries.value.push(entry)
  const handle = Timer.after(SURVEY_TOAST_LIFETIME_SEC, () => {
    const idx = surveyEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) surveyEntries.value.splice(idx, 1)
    surveyTimers.delete(entry.id)
  })
  surveyTimers.set(entry.id, handle)
}

const survivorEntries = ref<SurvivorEventEntry[]>([])
const SURVIVOR_TOAST_LIFETIME_SEC = 1.8
const survivorTimers = new Map<string, ReturnType<typeof Timer.after>>()
let survivorSeq = 0

/**
 * Push a survivor event toast (lost or aboard) and auto-remove it after
 * {@link SURVIVOR_TOAST_LIFETIME_SEC}. Each call gets its own timer so
 * back-to-back events don't clobber each other.
 */
function recordSurvivor(kind: 'lost' | 'aboard'): void {
  survivorSeq += 1
  const label = kind === 'lost' ? 'Survivor Lost' : 'Survivor Aboard'
  const entry: SurvivorEventEntry = { id: `survivor-${survivorSeq}`, kind, label }
  survivorEntries.value.push(entry)
  const handle = Timer.after(SURVIVOR_TOAST_LIFETIME_SEC, () => {
    const idx = survivorEntries.value.findIndex((p) => p.id === entry.id)
    if (idx >= 0) survivorEntries.value.splice(idx, 1)
    survivorTimers.delete(entry.id)
  })
  survivorTimers.set(entry.id, handle)
}

function clearPickups(): void {
  for (const { handle } of pickupTimers.values()) Timer.cancel(handle)
  pickupTimers.clear()
  pickups.value = []
  for (const handle of prospectTimers.values()) Timer.cancel(handle)
  prospectTimers.clear()
  prospectEntries.value = []
  for (const handle of surveyTimers.values()) Timer.cancel(handle)
  surveyTimers.clear()
  surveyEntries.value = []
  for (const handle of survivorTimers.values()) Timer.cancel(handle)
  survivorTimers.clear()
  survivorEntries.value = []
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
const rescueTotal = ref(0)
const rescueAlive = ref(0)
const rescueAboard = ref(0)
const rescueActive = ref(false)
const danActive = ref(false)
const danTimeRemaining = ref(0)
const danCaptured = ref(0)
const danRequired = ref(0)
const danInstruction = ref<string | null>(null)
const danScanning = ref(false)
const prospectusVisible = ref(false)
let rescuePollHandle: ReturnType<typeof setInterval> | null = null
let runtimeTipPollHandle: ReturnType<typeof setInterval> | null = null
let gatherFpsIdleSeconds = 0
let gatherFpsIdleLastMs: number | null = null
let hasMinedRockThisMission = false
let previousLanderHullHp: number | null = null
let previousLevelState = ''
const dispatchedRuntimeTipIds = new Set<string>()
const NON_MINERAL_PICKUP_IDS = new Set(['health', 'oxygen', 'rtg', 'lander-fuel-cell'])

/**
 * Sub-states that the {@link BunkerWaveHud} renders. The bunker FSM has more
 * states than these (e.g. `entering`, `antechamber-idle`, `exiting`); during
 * those phases the HUD stays hidden and the player follows mission-instruction
 * prompts instead.
 */
type BunkerWaveHudPhase = Extract<
  BunkerSubState,
  'wave-active' | 'wave-breather' | 'final-clear' | 'exit-prompt'
>

/** Props snapshot driving the {@link BunkerWaveHud}, refreshed on the same poll cadence as rescue. */
interface BunkerHudSnapshot {
  /** Zero-based current wave index. */
  waveIndex: number
  /** Total waves the player must clear in this bunker run. */
  totalWaves: number
  /** Live alive-enemy count for the hostile counter. */
  hostiles: number
  /** Current sub-state — only the four combat/exit phases are rendered. */
  phase: BunkerWaveHudPhase
}

const bunkerHudProps = ref<BunkerHudSnapshot | null>(null)
const inBunker = computed(() => stateInfo.state === 'bunker-interior')

/** True when the bunker FSM is in a phase the wave HUD knows how to render. */
function isBunkerHudPhase(phase: BunkerSubState): phase is BunkerWaveHudPhase {
  return (
    phase === 'wave-active' ||
    phase === 'wave-breather' ||
    phase === 'final-clear' ||
    phase === 'exit-prompt'
  )
}

/**
 * Poll the active minigame every 500ms so the rescue panel + bunker HUD
 * reflect the correct counts during combat, before any event fires.
 */
function refreshRescueRefs(): void {
  const active = viewController.getActiveMinigame()
  if (active instanceof RescueMinigame) {
    rescueActive.value = true
    rescueTotal.value = active.totalSurvivors
    rescueAlive.value = active.aliveSurvivors
    rescueAboard.value = active.aboardSurvivors
  } else {
    rescueActive.value = false
  }
  if (active instanceof DanMinigame) {
    danActive.value = true
    danTimeRemaining.value = active.timeRemaining ?? 0
    danCaptured.value = active.progressCurrent ?? 0
    danRequired.value = active.progressTotal ?? 0
    danInstruction.value = active.missionInstruction
    danScanning.value = active.phase === 'scanning'
  } else {
    danActive.value = false
  }
  if (active instanceof BunkerMinigame) {
    const phase = active.bunkerPhase
    if (isBunkerHudPhase(phase) && active.progressTotal !== null) {
      bunkerHudProps.value = {
        waveIndex: active.currentWaveIndex,
        totalWaves: active.progressTotal,
        hostiles: active.hostiles,
        phase,
      }
    } else {
      bunkerHudProps.value = null
    }
  } else {
    bunkerHudProps.value = null
  }
}

function resetMissionTipRuntimeState(): void {
  missionTipQueue.value = []
  activeMissionObjectiveType.value = null
  gatherFpsIdleSeconds = 0
  gatherFpsIdleLastMs = null
  hasMinedRockThisMission = false
  previousLanderHullHp = null
  previousLevelState = ''
  dispatchedRuntimeTipIds.clear()
}

function pushMissionTip(tip: MissionTipTransmission | null): void {
  if (!tip) return
  missionTipQueue.value = pushMissionTipQueue(missionTipQueue.value, tip)
}

function pushRuntimeMissionTip(id: string): void {
  if (dispatchedRuntimeTipIds.has(id)) return
  const objectiveType = activeMissionObjectiveType.value
  if (!objectiveType) return
  const tip = resolveRuntimeMissionTipTransmission(id, objectiveType)
  if (!tip) return

  dispatchedRuntimeTipIds.add(id)
  if (id === 'gatherRocketScience') {
    missionTipQueue.value = removeMissionTipQueueEntry(missionTipQueue.value, 'objective:gather')
  }
  pushMissionTip(tip)
}

function dismissTopMissionTip(): boolean {
  const tipStackVisible = stateInfo.state === 'lander' || stateInfo.state === 'eva' || inBunker.value
  if (!trackerVisible.value || !tipStackVisible) return false

  const [tip] = visibleMissionTips.value
  if (!tip) return false

  missionTipQueue.value = removeMissionTipQueueEntry(missionTipQueue.value, tip.id)
  uiAudio.notifyShuttleProgramClick()
  return true
}

function areTrackerObjectivesComplete(): boolean {
  return (
    trackerObjectives.value.length > 0 &&
    trackerObjectives.value.every((objective) => objective.complete)
  )
}

function handleLanderEntryTips(previousState: string, nextState: string): void {
  if (nextState !== 'lander' || previousState !== 'eva') return

  if (areTrackerObjectivesComplete()) {
    pushRuntimeMissionTip('landerObjectiveExfil')
    return
  }

  pushRuntimeMissionTip('landerGroundBoost')
}

function tickGatherIdleTimer(): void {
  if (
    stateInfo.state !== 'eva' ||
    activeMissionObjectiveType.value !== 'gather' ||
    dispatchedRuntimeTipIds.has('gatherRocketScience') ||
    hasMinedRockThisMission
  ) {
    gatherFpsIdleLastMs = null
    return
  }

  const now = performance.now()
  if (gatherFpsIdleLastMs === null) {
    gatherFpsIdleLastMs = now
    return
  }

  gatherFpsIdleSeconds += (now - gatherFpsIdleLastMs) / 1000
  gatherFpsIdleLastMs = now
  if (shouldTriggerGatherRocketScienceTip(gatherFpsIdleSeconds, hasMinedRockThisMission)) {
    pushRuntimeMissionTip('gatherRocketScience')
  }
}

function refreshRuntimeMissionTips(): void {
  if (!trackerVisible.value) return

  if (stateInfo.state === 'eva' || inBunker.value) {
    tickGatherIdleTimer()
    if (shouldTriggerLowOxygenTip(fpsTelemetry)) pushRuntimeMissionTip('oxygenLow')
    if (shouldTriggerLowRtgTip(fpsTelemetry)) pushRuntimeMissionTip('rtgLow')
    if (shouldTriggerDrillWalkingTip(fpsTelemetry)) pushRuntimeMissionTip('drillWalking')
  } else if (stateInfo.state === 'lander') {
    gatherFpsIdleLastMs = null
    if (shouldTriggerLanderWarningTip(landerTelemetry.descentWarning)) {
      pushRuntimeMissionTip('landerDescentWarning')
    }
    if (shouldTriggerLanderWarningTip(landerTelemetry.attitudeWarning)) {
      pushRuntimeMissionTip('landerAttitudeWarning')
    }
  } else {
    gatherFpsIdleLastMs = null
  }
}

const backgroundMusic = useBackgroundMusicGlobalState()
const musicEnabled = computed(() => backgroundMusic.isEnabled.value)

const OBJECTIVE_COLORS: Record<string, string> = {
  gather: '#66ffee',
  exterminate: '#ff4444',
  rescue: '#ffcc44',
  survey: '#00ffcc',
  photometry: '#b388ff',
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
  minigameProgressLabel: null,
  missionInstruction: null,
})
const landerFuelCellCount = ref(0)

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

// /level uses the global Prelude as its loader. The controller awaits the
// preludeGate promise before starting the arrival cinematic + audio, so the
// shuttle finale plays alone instead of on top of a mid-flight cutscene.
// We resolve the gate when the prelude dispatches 'prelude-play' (its
// natural end signal, fired after the shuttle clears the top edge).
let resolvePreludeGate: (() => void) | null = null
const preludeGate = new Promise<void>((resolve) => {
  resolvePreludeGate = resolve
})
viewController.setPreludeGate(preludeGate)

watch(bootPhase, (phase) => {
  if (phase !== 'started') return
  if (typeof window !== 'undefined' && window.Prelude) {
    window.Prelude.ready()
  }
})

const handlePreludePlay = () => {
  playBackgroundMusic('level')
  resolvePreludeGate?.()
  resolvePreludeGate = null
}
if (typeof window !== 'undefined') {
  window.addEventListener('prelude-play', handlePreludePlay)
}
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('prelude-play', handlePreludePlay)
  }
})

onMounted(async () => {
  viewController.setNavigateToMap(() => {
    void router.push('/')
  })
  if (container.value) {
    viewController.onBootState = (state) => {
      bootPhase.value = state.phase
      bootLabel.value = state.label
      bootAsteroid.value = state.asteroidName
      bootMission.value = state.missionName
    }
    viewController.onLetterbox = (visible) => {
      letterboxVisible.value = visible
    }
    viewController.onStateInfo = (info) => {
      handleLanderEntryTips(previousLevelState, info.state)
      Object.assign(stateInfo, info)
      previousLevelState = info.state
    }
    viewController.onLanderTelemetry = (t) => {
      Object.assign(landerTelemetry, t)
      if (shouldTriggerLanderHullRepairTip(previousLanderHullHp, t)) {
        pushRuntimeMissionTip('landerHullRepair')
      }
      previousLanderHullHp = t.hp
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
      if (visible && showInventory.value) refreshInventorySnapshot()
      // Death overlay needs a clickable Restart button — release pointer lock
      // so the cursor isn't captured by the FPS camera. Same pattern used by
      // the inventory open handler below.
      if (visible && typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock()
      }
    }
    viewController.onMissionAnnounce = (asteroid, mission) => {
      resetMissionTipRuntimeState()
      announceAsteroid.value = asteroid
      announceMission.value = mission
      announceVisible.value = true
      trackerAsteroid.value = asteroid
      trackerMission.value = mission
      const activeMission = viewController.getMission()
      const profile = loadProfile()
      activeMissionObjectiveType.value = activeMission ? getMissionTipObjectiveType(activeMission) : null
      if (activeMission) {
        pushMissionTip(resolveFirstRunLanderTipTransmission(activeMission, profile))
        pushMissionTip(resolveMissionTipTransmission(activeMission, profile, 'fps'))
        pushMissionTip(resolveMissionTipTransmission(activeMission, profile, 'lander'))
      }
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
      if (stateInfo.state === 'lander' && areTrackerObjectivesComplete()) {
        pushRuntimeMissionTip('landerObjectiveExfil')
      }
      objCompleteVisible.value = true
      Timer.after(5, () => {
        objCompleteVisible.value = false
      })
    }
    viewController.onMissionComplete = () => {
      missionCompleteVisible.value = true
    }
    viewController.onTerminalPrompt = (text) => {
      terminalPrompt.value = text
    }
    viewController.onProspectusOpen = () => {
      prospectusVisible.value = true
      // Release the FPS pointer lock so the player can click the overlay buttons.
      // Same pattern used by the death overlay handler above.
      if (typeof document !== 'undefined' && document.pointerLockElement) {
        document.exitPointerLock()
      }
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
      if (!NON_MINERAL_PICKUP_IDS.has(itemId)) {
        hasMinedRockThisMission = true
        missionTipQueue.value = removeMissionTipQueueEntry(
          missionTipQueue.value,
          'runtime:gatherRocketScience',
        )
      }
      viewController.refreshLanderFuelCellCount()
      if (showInventory.value) refreshInventorySnapshot()
      else inventoryRunGainsThisSortie.value = viewController.getLevelRunInventoryGains()
    }
    viewController.onResourcePickupFailed = (label, reason) => {
      recordPickupFailed(label, reason)
      if (showInventory.value) refreshInventorySnapshot()
    }
    viewController.onLanderFuelCellCount = (count) => {
      landerFuelCellCount.value = count
    }
    viewController.onProspect = (itemId) => {
      const def = getItemDefinition(itemId)
      const mineral = def?.label ?? itemId
      recordProspect(`${mineral}-bearing rock`)
    }
    viewController.onSurvey = (label) => {
      recordSurvey(label)
    }
    viewController.onSurvivorLost = () => {
      recordSurvivor('lost')
      const active = viewController.getActiveMinigame()
      if (active instanceof RescueMinigame) {
        rescueActive.value = true
        rescueTotal.value = active.totalSurvivors
        rescueAlive.value = active.aliveSurvivors
        rescueAboard.value = active.aboardSurvivors
      } else {
        rescueActive.value = false
      }
    }
    viewController.onSurvivorAboard = () => {
      recordSurvivor('aboard')
      const active = viewController.getActiveMinigame()
      if (active instanceof RescueMinigame) {
        rescueActive.value = true
        rescueTotal.value = active.totalSurvivors
        rescueAlive.value = active.aliveSurvivors
        rescueAboard.value = active.aboardSurvivors
      } else {
        rescueActive.value = false
      }
    }
    await viewController.init(container.value)
    viewController.refreshLanderFuelCellCount()

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
      // Seed rescue panel if this is a rescue mission
      const active = viewController.getActiveMinigame()
      if (active instanceof RescueMinigame) {
        rescueActive.value = true
        rescueTotal.value = active.totalSurvivors
        rescueAlive.value = active.aliveSurvivors
        rescueAboard.value = active.aboardSurvivors
      }
    }

    // 200ms is fast enough for the DAN scan timer to tick visibly without
    // adding meaningful overhead for rescue/bunker observers.
    rescuePollHandle = setInterval(refreshRescueRefs, 200)
    runtimeTipPollHandle = setInterval(refreshRuntimeMissionTips, 500)
    window.addEventListener('keydown', handleGlobalKeydown)
  }
})

function handleRestart() {
  // Rescue and bunker interiors own stateful scene/controller graphs that the
  // in-place lander restart path cannot safely rebuild. Hard-reload those
  // failure cases for a clean run.
  if (shouldHardReloadLevelRestart(deathOverlayCause.value)) {
    window.location.reload()
    return
  }
  viewController.restart()
}

/**
 * Refresh the cached cargo snapshot used by the inventory panel from
 * persisted storage. Called when the panel opens, after a jettison,
 * and after a successful pickup so the live readout stays in sync.
 */
function refreshInventorySnapshot(): void {
  inventorySnapshot.value = loadInventory()
  inventoryRunGainsThisSortie.value = viewController.getLevelRunInventoryGains()
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
  inventoryRunGainsThisSortie.value = viewController.getLevelRunInventoryGains()
  viewController.refreshLanderFuelCellCount()
}

/** Consume one carried lander fuel cell from the HUD refuel button. */
function handleUseLanderFuelCell(): void {
  viewController.useLanderFuelCell()
  if (showInventory.value) refreshInventorySnapshot()
  else inventoryRunGainsThisSortie.value = viewController.getLevelRunInventoryGains()
}

/**
 * Handle a prospectus outcome from the overlay. Notifies the contract system,
 * closes the overlay, and optionally flips the terminal screen color.
 *
 * @param outcomeId - The player's choice (`'transmit'` or `'tamper'`).
 */
function handleProspectusResolve(outcomeId: 'transmit' | 'tamper'): void {
  contractSystem.notifyChoiceResolved('jovian_final_prospectus', outcomeId)
  prospectusVisible.value = false
  viewController.flipProspectusTerminalScreen(outcomeId)
  viewController.notifyProspectusObjectiveComplete()
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
  if (e.code === 'Tab' && dismissTopMissionTip()) {
    e.preventDefault()
    return
  }
  if (e.code === 'KeyM' && !showInventory.value && !inBunker.value) {
    showMap.value = !showMap.value
  }
}

onUnmounted(() => {
  if (rescuePollHandle !== null) {
    clearInterval(rescuePollHandle)
    rescuePollHandle = null
  }
  if (runtimeTipPollHandle !== null) {
    clearInterval(runtimeTipPollHandle)
    runtimeTipPollHandle = null
  }
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
        <path d="M5 9v6h4l5 4V5L9 9H5Z" fill="currentColor" />
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
  <!-- Helmet visor overlay — frames the view in any first-person scene -->
  <div v-if="stateInfo.state === 'eva' || inBunker" class="helmet-visor" />
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
  <ObjectiveTracker
    v-if="trackerVisible && (stateInfo.state === 'lander' || stateInfo.state === 'eva' || inBunker)"
    :eyebrow="trackerAsteroid"
    :title="trackerMission"
    :objectives="trackerObjectives"
  />
  <TransitionGroup name="mission-tip-stack" tag="div" class="mission-tip-stack">
    <MissionTipMarquee
      v-for="tip in visibleMissionTips"
      v-show="trackerVisible && (stateInfo.state === 'lander' || stateInfo.state === 'eva' || inBunker)"
      :key="tip.id"
      :transmission="tip"
    />
  </TransitionGroup>
  <RescueSurvivorPanel
    v-if="rescueActive"
    :total="rescueTotal"
    :alive="rescueAlive"
    :aboard="rescueAboard"
  />
  <DanScanPanel
    v-if="danActive"
    :time-remaining="danTimeRemaining"
    :captured="danCaptured"
    :required="danRequired"
    :instruction="danInstruction"
    :scanning="danScanning"
  />
  <ProspectusOverlay
    v-if="prospectusVisible"
    body-id="hektor"
    :on-resolve="handleProspectusResolve"
  />
  <LanderHud
    v-if="stateInfo.state === 'lander'"
    :telemetry="landerTelemetry"
    :fuel-cell-count="landerFuelCellCount"
    @use-fuel-cell="handleUseLanderFuelCell"
  />
  <FpsHud
    v-if="stateInfo.state === 'eva' || inBunker"
    :telemetry="fpsTelemetry"
    :hide-movement-readout="inBunker"
  />
  <FpsCompass
    v-if="stateInfo.state === 'eva' && !inBunker"
    :heading-rad="fpsTelemetry.headingRad"
    :objectives="fpsTelemetry.objectives"
  />
  <BunkerWaveHud
    v-if="inBunker && bunkerHudProps"
    :wave-index="bunkerHudProps.waveIndex"
    :total-waves="bunkerHudProps.totalWaves"
    :hostiles="bunkerHudProps.hostiles"
    :phase="bunkerHudProps.phase"
  />
  <LevelMinimap
    v-if="showMap && !inBunker"
    :map-canvas="mapCanvas"
    :player-x="playerX"
    :player-z="playerZ"
    :grid-size="LEVEL_GRID_SIZE"
    :markers="mapMarkers"
  />
  <LevelInventoryPanel
    :open="showInventory"
    :inventory="inventorySnapshot"
    :run-gains-this-sortie="inventoryRunGainsThisSortie"
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
    class="exit-prompt exit-prompt--vehicle"
  >
    <span class="exit-prompt__text">EXIT (F)</span>
  </div>
  <div v-if="stateInfo.canEnterLander && !inBunker" class="exit-prompt exit-prompt--vehicle">
    <span class="exit-prompt__text">ENTER (F)</span>
  </div>
  <div v-if="terminalPrompt" class="exit-prompt">
    <span class="exit-prompt__text exit-prompt__text--terminal">{{ terminalPrompt }}</span>
  </div>
  <div v-if="stateInfo.canExfil && !inBunker" class="exit-prompt exit-prompt--vehicle">
    <span class="exit-prompt__text">EXFILTRATE (F)</span>
  </div>
  <div v-if="arrivalFade > 0" class="death-fade" :style="{ opacity: arrivalFade }" />
  <div v-if="deathFade > 0" class="death-fade" :style="{ opacity: deathFade }" />
  <div v-if="deathMessage" class="death-message">
    <span class="death-message__text">YOU DIED</span>
  </div>
  <LevelLoadingOverlay
    :phase="bootPhase"
    :label="bootLabel"
    :asteroid-name="bootAsteroid"
    :mission-name="bootMission"
  />
  <DeathOverlay
    :visible="deathOverlayVisible"
    :cause="deathOverlayCause"
    @restart="handleRestart"
  />
  <DamageFeedback
    v-if="stateInfo.state === 'eva' || inBunker"
    ref="damageFeedback"
    :flash-opacity="damageFlash"
  />
  <DebugHud v-if="debugHudVisible" />
  <PickupToast
    v-if="stateInfo.state === 'eva' || stateInfo.state === 'lander' || inBunker"
    :pickups="pickups"
    :prospect-entries="prospectEntries"
    :survey-entries="surveyEntries"
    :survivor-entries="survivorEntries"
  />
  <transition name="pickup-failed">
    <div
      v-if="pickupFailed && (stateInfo.state === 'eva' || stateInfo.state === 'lander' || inBunker)"
      :key="pickupFailed.id"
      class="pickup-failed"
      role="status"
      aria-live="polite"
    >
      <span class="pickup-failed__head">CARGO FULL</span>
      <span class="pickup-failed__body"
        >{{ pickupFailed.label }} lost &mdash; {{ pickupFailed.reason }}</span
      >
    </div>
  </transition>
</template>

<style>
.level-topbar {
  position: fixed;
  inset: 0;
  z-index: 35;
  pointer-events: none;
}
.level-topbar__cargo-btn {
  position: absolute;
  bottom: max(1rem, env(safe-area-inset-bottom, 0px) + 0.5rem);
  left: max(1rem, env(safe-area-inset-left, 0px) + 0.5rem);
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
  pointer-events: auto;
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
  position: absolute;
  top: max(1rem, env(safe-area-inset-top, 0px) + 0.5rem);
  right: max(1rem, env(safe-area-inset-right, 0px) + 0.5rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 1px solid rgba(34, 211, 238, 0.28);
  border-radius: 9999px;
  background: rgba(2, 6, 23, 0.76);
  color: rgba(186, 230, 253, 0.92);
  cursor: pointer;
  pointer-events: auto;
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
  /* Cyan terminal/mission-context prompt anchor — sits in the upper-middle
     band so it's clearly readable above the action prompt. */
  bottom: 22%;
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
.exit-prompt--vehicle {
  /* Vehicle action prompts sit just above the EVA O2/STA numeric labels
     (the O2 reading sits ~15% from bottom) and the lander thruster dock,
     while still leaving the cyan mission-context prompt readable above. */
  bottom: 18%;
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
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

/* Landing warnings — slightly above center, large, impossible to miss */
.landing-warnings {
  --landing-warnings-vertical-nudge: -2.25rem;
  position: fixed;
  inset: 0;
  z-index: 35;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transform: translateY(var(--landing-warnings-vertical-nudge));
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
  background: rgba(234, 179, 8, 0.18);
  text-shadow: 0 0 8px rgba(234, 179, 8, 0.5);
  animation: warning-blink 1s ease-in-out infinite;
}
.landing-warning--danger {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.5);
  background: rgba(239, 68, 68, 0.24);
  text-shadow: 0 0 12px rgba(239, 68, 68, 0.7);
  animation: warning-blink 0.4s ease-in-out infinite;
}
@keyframes warning-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
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
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}
.pickup-failed-enter-from,
.pickup-failed-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
