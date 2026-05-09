<script setup lang="ts">
import { computed } from 'vue'
import type { Inventory } from '@/lib/inventory/types'
import { canFitItem } from '@/lib/inventory/inventory'
import type {
  ShuttleMissionBoard,
  ActiveShuttleMission,
  ActiveVisitRelayMission,
  ActiveTurretMiningMission,
  MiningOreCategory,
  GeneratedAsteroidMission,
  MissionRegion,
} from '@/lib/missions/types'
import { getGatherItemForPlanet, getPlanetOrbitalConfig } from '@/lib/missions/planetOrbitalConfig'
import { computeMiningProgressKg, isMiningMissionReady } from '@/lib/missions/turretMiningSession'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { getPlanet } from '@/lib/planets/catalog'
import type { UpgradeLevels } from '@/lib/upgrades'
import { getUpgradeValue } from '@/lib/upgrades'
import { getMissionPool } from '@/lib/missions/shuttleMissionPools'
import { getEvaMissionPool } from '@/lib/missions/evaMissionPools'
import { getTurretMiningPool } from '@/lib/missions/turretMiningPools'
import type { EvaMissionPoiType } from '@/lib/missions/types'
import ShuttleProgramCover from '@/components/ShuttleProgramCover.vue'

const props = defineProps<{
  board: ShuttleMissionBoard | null
  dockedPlanet: string | null
  /** Shuttle cargo hold — used to disable Accept when the pickup cannot fit. */
  inventory?: Inventory | null
  /** Used so asteroid rewards match Science Station payout multiplier. */
  upgradeLevels?: UpgradeLevels | null
}>()

/** Same multiplier applied when completing an asteroid mission (see LevelViewController). */
const scienceStationRewardMult = computed(() =>
  getUpgradeValue('shuttleScienceStation', props.upgradeLevels ?? {}),
)

/**
 * CR shown for asteroid contracts — base contract × Science Station (rounded).
 *
 * @param baseReward - Stored mission `totalReward` before station bonus.
 */
function buffedAsteroidRewardCr(baseReward: number): number {
  return Math.round(baseReward * scienceStationRewardMult.value)
}

/** True when offered planetary cargo can fit in the current hold (or inventory unknown). */
const canAcceptPlanetaryOffer = computed(() => {
  const inv = props.inventory
  const mission = props.board?.offeredMission
  const giver = props.board?.offeringPlanet
  if (!mission || !giver || !props.dockedPlanet || giver !== props.dockedPlanet) return true
  if (!inv) return true
  const gatherItem = getGatherItemForPlanet(mission.targetPlanet)
  if (!gatherItem) return false
  return canFitItem(inv, gatherItem, mission.gatherQuantity)
})

/** True when the turret mining upgrade has been purchased (level ≥ 1). */
const miningTabVisible = computed(
  () => getUpgradeValue('turretMiningUnlock', props.upgradeLevels ?? {}) >= 1,
)

/** Active turret mining missions from the board. */
const activeMiningMissions = computed<ActiveTurretMiningMission[]>(
  () => props.board?.activeMiningMissions ?? [],
)

/** True when the player has at least one active mission of any kind. */
const hasAnyActiveMission = computed(() => {
  const b = props.board
  if (!b) return false
  return (
    b.activeMissions.length > 0 ||
    b.activeEvaMissions.length > 0 ||
    b.activeMiningMissions.length > 0 ||
    b.activeAsteroidMission !== null
  )
})

/** Show the EVA section only while there's an offer at the dock or a restock timer running. */
const evaSectionVisible = computed(() => {
  const b = props.board
  if (!b || !props.dockedPlanet) return false
  const hasOffer = b.offeredEvaMission !== null && b.offeringEvaPlanet === props.dockedPlanet
  return hasOffer || b.evaRestockTimer !== null
})

/** Show the mining section only when unlocked AND offering at this dock OR restocking. */
const miningSectionVisible = computed(() => {
  if (!miningTabVisible.value) return false
  const b = props.board
  if (!b || !props.dockedPlanet) return false
  const hasOffer = b.offeredMiningMission !== null && b.offeringMiningPlanet === props.dockedPlanet
  return hasOffer || b.miningRestockTimer !== null
})

/** Show the asteroid section only when offering or restocking at this dock. */
const asteroidSectionVisible = computed(() => {
  const b = props.board
  if (!b || !props.dockedPlanet) return false
  const hasOffer =
    b.offeredAsteroidMission !== null &&
    b.offeringAsteroidPlanet === props.dockedPlanet &&
    b.activeAsteroidMission === null
  return hasOffer || b.asteroidRestockTimer !== null
})

/** Show the planetary section only when offering at this dock or restocking. */
const planetarySectionVisible = computed(() => {
  const b = props.board
  if (!b || !props.dockedPlanet) return false
  const hasOffer = b.offeredMission !== null && b.offeringPlanet === props.dockedPlanet
  return hasOffer || b.restockTimer !== null
})

const emit = defineEmits<{
  acceptMission: []
  deliverMission: [missionId: string]
  acceptAsteroidMission: []
  acceptEvaMission: []
  acceptMiningMission: []
  deliverMiningMission: [missionId: string]
}>()

/**
 * Human-readable label for a mining ore category.
 *
 * @param category - The ore category from the mission template.
 * @returns Display label from the inventory catalog, or `'Any main-belt ore'` for the `'any'` tier.
 */
function oreLabelFor(category: MiningOreCategory): string {
  if (category === 'any') return 'Any main-belt ore'
  const def = getItemDefinition(category)
  return def ? def.label : category
}

/**
 * Ore progress line for an active mining mission, derived from current cargo.
 *
 * @param mission - The active turret mining mission.
 * @returns A string like `"210 / 475 kg of Olivine"`, capped at the target.
 */
function miningProgressLabel(mission: ActiveTurretMiningMission): string {
  const ore = oreLabelFor(mission.template.oreCategory)
  const inv = props.inventory
  const kg = inv ? Math.min(computeMiningProgressKg(inv, mission), mission.template.targetKg) : 0
  return `${kg} / ${mission.template.targetKg} kg of ${ore}`
}

/**
 * Status line for an active mining mission, derived from current cargo.
 *
 * @param mission - The active turret mining mission.
 * @returns Delivery prompt when ready and docked at giver, return prompt when
 *   ready elsewhere, or posting planet otherwise.
 */
function miningStatusLabel(mission: ActiveTurretMiningMission): string {
  const inv = props.inventory
  const ready = inv ? isMiningMissionReady(inv, mission) : false
  if (ready) {
    if (props.dockedPlanet === mission.giverPlanet) return 'Ready — press Deliver'
    return `Return to ${targetPlanetName(mission.giverPlanet)} to deliver`
  }
  return `Posted by ${targetPlanetName(mission.giverPlanet)}`
}

/**
 * True when the player can press Deliver on a mining mission right now —
 * docked at the giver planet AND cargo holds at least `targetKg` of matching ore.
 *
 * @param mission - The active turret mining mission.
 * @returns Whether the deliver button should be enabled and visible.
 */
function canDeliverMining(mission: ActiveTurretMiningMission): boolean {
  if (props.dockedPlanet !== mission.giverPlanet) return false
  const inv = props.inventory
  return inv ? isMiningMissionReady(inv, mission) : false
}

function targetPlanetName(planetId: string): string {
  try {
    return getPlanet(planetId).name
  } catch {
    return planetId
  }
}

function gatherItemLabel(mission: ActiveShuttleMission): string {
  const cfg = getPlanetOrbitalConfig(mission.template.targetPlanet)
  if (!cfg) return '???'
  const item = getItemDefinition(cfg.gatherItem)
  return item ? item.label : cfg.gatherItem
}

function statusLabel(mission: ActiveShuttleMission): string {
  if (mission.status === 'active') {
    return `Travel to ${targetPlanetName(mission.template.targetPlanet)}`
  }
  return `Return to ${targetPlanetName(mission.giverPlanet)}`
}

function canDeliver(mission: ActiveShuttleMission): boolean {
  return mission.status === 'ready-to-deliver' && props.dockedPlanet === mission.giverPlanet
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function objectiveSummary(mission: GeneratedAsteroidMission): string {
  const obj = mission.objectives[0]
  if (!obj) return ''
  switch (obj.type) {
    case 'gather':
      return `Gather ${obj.resourceAmount} kg of resources`
    case 'exterminate':
      return `Clear ${obj.nestCount} nest${obj.nestCount !== 1 ? 's' : ''}${obj.hasSpitters ? ' (spitters present)' : ''}`
    case 'rescue':
      return `Rescue ${obj.colonistCount} colonist${obj.colonistCount !== 1 ? 's' : ''} (${obj.oxygenTime}s oxygen)`
    case 'survey':
      return `Calibrate ${obj.probeCount} gravitometric probe${obj.probeCount !== 1 ? 's' : ''} (${obj.timeLimit}s)`
    case 'photometry':
      return `Capture photometry exposure (${obj.timeLimit}s)`
    case 'dan':
      return `Run DAN subsurface scan (${obj.scanDurationSeconds}s)`
    case 'collect': {
      const item = obj.collectItemLabel ?? obj.collectItemId ?? 'designated cargo'
      return `Collect ${item}`
    }
    case 'bunker':
      return `Clear bunker (${obj.waveCount ?? 0} waves)`
    default:
      // special-mission only — never generated; no summary needed
      return ''
  }
}

function evaMissionStatusLabel(mission: ActiveVisitRelayMission): string {
  if (mission.status === 'active') {
    const { worldX, worldZ } = mission.waypoint
    return `Travel to waypoint (${Math.round(worldX)}, ${Math.round(worldZ)})`
  }
  return `Return to ${targetPlanetName(mission.giverPlanet)}`
}

function regionLabel(region: MissionRegion): string {
  switch (region) {
    case 'near-earth':
      return 'Near-Earth'
    case 'asteroid-belt':
      return 'Asteroid Belt'
    case 'kuiper-belt':
      return 'Kuiper Belt'
    case 'jovian-trojans':
      return 'Jovian Trojans'
    case 'saturn-trojans':
      return 'Saturn Trojans'
  }
}

/**
 * Operating zone for procedural contracts — waypoint is anchored on the posting station's orbit.
 * Falls back to legacy belt labels when `originPlanetId` is missing (old saves / specials).
 *
 * @param mission - Offered or active asteroid mission.
 */
function asteroidOperatingLabel(mission: GeneratedAsteroidMission): string {
  if (mission.originPlanetId) {
    try {
      return `Near ${getPlanet(mission.originPlanetId).name} orbit`
    } catch {
      /* use belt tier below */
    }
  }
  return regionLabel(mission.region)
}

/**
 * Giver name for the planetary (shuttle) mission pool at a given planet.
 *
 * @param planetId - The planet id whose pool to query.
 * @returns Pool's `giverName`, or an empty string if not set.
 */
function planetaryGiverName(planetId: string | null): string {
  if (!planetId) return ''
  return getMissionPool(planetId)?.giverName ?? ''
}

/**
 * Giver name for the EVA mission pool at a given planet.
 *
 * @param planetId - The planet id whose pool to query.
 * @returns Pool's `giverName`, or an empty string if not set.
 */
function evaGiverName(planetId: string | null): string {
  if (!planetId) return ''
  return getEvaMissionPool(planetId)?.giverName ?? ''
}

/**
 * Giver name for the turret mining pool at a given planet.
 *
 * @param planetId - The planet id whose pool to query.
 * @returns Pool's `giverName`, or an empty string if not set.
 */
function miningGiverName(planetId: string | null): string {
  if (!planetId) return ''
  return getTurretMiningPool(planetId)?.giverName ?? ''
}

/**
 * Human-readable label for an EVA mission's POI type.
 *
 * @param poiType - The `poiType` field from a `VisitRelayShuttleMissionTemplate`.
 * @returns Display label, e.g. `"Relay Antenna Repair"`.
 */
function evaTypeLabel(poiType: EvaMissionPoiType): string {
  switch (poiType) {
    case 'satellite':
      return 'Satellite Servicing'
    case 'relay_antenna':
      return 'Relay Antenna Repair'
    case 'telescope':
      return 'Telescope Alignment'
  }
}
</script>

<template>
  <div class="shuttle-control-screen">
    <ShuttleProgramCover variant="missions">
      <h2 class="shuttle-control-screen__title">Missions</h2>
      <p class="shuttle-program-intro">
        Docked postings aggregate here: quick
        <span class="shuttle-program-intro-em">EVA</span>
        tickets,
        <span class="shuttle-program-intro-em">belt mining</span>
        allotments,
        <span class="shuttle-program-intro-em">asteroid</span>
        contracts, and rare
        <span class="shuttle-program-intro-em">planetary haulage</span>. Each card lists issuer,
        theater, reward, and whether your hold can swallow the cargo clause.
        <span class="shuttle-program-intro-em">Accept</span>
        moves work into
        <span class="shuttle-program-intro-em">Active</span>
        &mdash; finish the leg, deliver where instructed, and credits post when telemetry clears.
      </p>

      <!-- Shuttle EVA Missions (first — quick local spacewalk jobs) -->
      <div v-if="evaSectionVisible" class="mission-board-section">
        <h3 class="mission-board-section__heading">Shuttle EVA Missions</h3>
        <p class="mission-board-section__descriptor">
          Fly to a waypoint in deep space, exit the shuttle, and spacewalk to a relay or probe to
          service it.
        </p>

        <div
          v-if="board?.offeredEvaMission && board.offeringEvaPlanet === dockedPlanet"
          class="mission-board-offer"
        >
          <div class="mission-board-offer__name">{{ board.offeredEvaMission.name }}</div>
          <div v-if="evaGiverName(board.offeringEvaPlanet)" class="mission-board-offer__giver">
            From: {{ evaGiverName(board.offeringEvaPlanet) }}
          </div>
          <div class="mission-board-offer__desc">{{ board.offeredEvaMission.description }}</div>
          <div class="mission-board-offer__meta">
            <span>Type: {{ evaTypeLabel(board.offeredEvaMission.poiType) }}</span>
            <span>Waypoint: near {{ targetPlanetName(dockedPlanet ?? '') }}</span>
            <span>Reward: {{ board.offeredEvaMission.reward }} CR</span>
          </div>
          <button
            type="button"
            class="mission-board-offer__accept-btn"
            @click="emit('acceptEvaMission')"
          >
            Accept
          </button>
        </div>

        <div v-else-if="board?.evaRestockTimer" class="mission-board-empty">
          Restocking in {{ formatTime(board.evaRestockTimer.remaining) }}
        </div>
      </div>

      <!-- Turret Mining Missions (second — bulk ore collection via the map turret) -->
      <div v-if="miningSectionVisible" class="mission-board-section">
        <h3 class="mission-board-section__heading">Shuttle Mining Missions</h3>
        <p class="mission-board-section__descriptor">
          Volume haulage from the shuttle — never the lander. Accept here, then mine the asteroid
          belt from orbit with the shuttle turret. Return to the giver with the target tonnage in
          the cargo hold to deliver.
        </p>

        <div
          v-if="board?.offeredMiningMission && board.offeringMiningPlanet === dockedPlanet"
          class="mission-board-offer"
        >
          <div class="mission-board-offer__name">{{ board.offeredMiningMission.name }}</div>
          <div
            v-if="miningGiverName(board.offeringMiningPlanet)"
            class="mission-board-offer__giver"
          >
            From: {{ miningGiverName(board.offeringMiningPlanet) }}
          </div>
          <div class="mission-board-offer__desc">{{ board.offeredMiningMission.description }}</div>
          <div class="mission-board-offer__meta">
            <span>Ore: {{ oreLabelFor(board.offeredMiningMission.oreCategory) }}</span>
            <span>Quantity: {{ board.offeredMiningMission.targetKg }} kg</span>
            <span>Reward: {{ board.offeredMiningMission.reward }} CR</span>
          </div>
          <button
            type="button"
            class="mission-board-offer__accept-btn"
            @click="emit('acceptMiningMission')"
          >
            Accept
          </button>
        </div>

        <div v-else-if="board?.miningRestockTimer" class="mission-board-empty">
          Restocking in {{ formatTime(board.miningRestockTimer.remaining) }}
        </div>
      </div>

      <!-- Asteroid Missions (third — local lander jobs near the posting station) -->
      <div v-if="asteroidSectionVisible" class="mission-board-section">
        <h3 class="mission-board-section__heading">Asteroid Missions</h3>
        <p class="mission-board-section__descriptor">
          Contracts send you to a waypoint near your posting station's orbit; difficulty scales with
          your upgrades.
        </p>

        <div
          v-if="
            board?.offeredAsteroidMission &&
            board.offeringAsteroidPlanet === dockedPlanet &&
            !board.activeAsteroidMission
          "
          class="mission-board-offer"
        >
          <div class="mission-board-offer__name">{{ board.offeredAsteroidMission.name }}</div>
          <div class="mission-board-offer__giver">
            From: {{ board.offeredAsteroidMission.giverName }}
          </div>
          <div class="mission-board-offer__desc">{{ board.offeredAsteroidMission.briefing }}</div>
          <div class="mission-board-offer__meta">
            <span>Zone: {{ asteroidOperatingLabel(board.offeredAsteroidMission) }}</span>
            <span
              >Reward:
              {{ buffedAsteroidRewardCr(board.offeredAsteroidMission.totalReward) }} CR</span
            >
          </div>
          <div class="mission-board-offer__objective">
            {{ objectiveSummary(board.offeredAsteroidMission) }}
          </div>
          <button
            type="button"
            class="mission-board-offer__accept-btn"
            @click="emit('acceptAsteroidMission')"
          >
            Accept
          </button>
        </div>

        <div v-else-if="board?.asteroidRestockTimer" class="mission-board-empty">
          Restocking in {{ formatTime(board.asteroidRestockTimer.remaining) }}
        </div>
      </div>

      <!-- Planetary Missions (fourth — advanced: requires interplanetary travel) -->
      <div v-if="planetarySectionVisible" class="mission-board-section">
        <h3 class="mission-board-section__heading">Planetary Missions</h3>
        <p class="mission-board-section__descriptor">
          Advanced contracts that send you to <em>another</em> planet: match orbit from the shuttle,
          secure the orbital pickup in your cargo hold, then return to the posting station for your
          payout.
        </p>

        <div
          v-if="board?.offeredMission && board.offeringPlanet === dockedPlanet"
          class="mission-board-offer"
        >
          <div class="mission-board-offer__name">{{ board.offeredMission.name }}</div>
          <div v-if="planetaryGiverName(board.offeringPlanet)" class="mission-board-offer__giver">
            From: {{ planetaryGiverName(board.offeringPlanet) }}
          </div>
          <div class="mission-board-offer__desc">{{ board.offeredMission.description }}</div>
          <div class="mission-board-offer__meta">
            <span>Target: {{ targetPlanetName(board.offeredMission.targetPlanet) }}</span>
            <span>Reward: {{ board.offeredMission.reward }} CR</span>
          </div>
          <button
            type="button"
            class="mission-board-offer__accept-btn"
            :disabled="!canAcceptPlanetaryOffer"
            @click="emit('acceptMission')"
          >
            Accept
          </button>
          <p v-if="!canAcceptPlanetaryOffer" class="mission-board-offer__inventory-hint">
            Cargo hold full — sell items at the station shop (sidebar) to make room for this pickup.
          </p>
        </div>

        <div v-else-if="board?.restockTimer" class="mission-board-empty">
          Restocking in {{ formatTime(board.restockTimer.remaining) }}
        </div>
      </div>

      <!-- Active Missions — consolidated view across every mission kind -->
      <div class="mission-board-section">
        <h3 class="mission-board-section__heading">Active Missions</h3>

        <div v-if="!hasAnyActiveMission" class="mission-board-empty">No active missions</div>

        <!-- Planetary actives -->
        <div
          v-for="mission in board?.activeMissions"
          :key="`planetary-${mission.template.id}`"
          class="mission-board-active"
        >
          <div class="mission-board-active__name">{{ mission.template.name }}</div>
          <div v-if="planetaryGiverName(mission.giverPlanet)" class="mission-board-active__giver">
            {{ planetaryGiverName(mission.giverPlanet) }}
          </div>
          <div class="mission-board-active__route">
            {{ targetPlanetName(mission.giverPlanet) }} &rarr;
            {{ targetPlanetName(mission.template.targetPlanet) }}
          </div>
          <div class="mission-board-active__status">
            {{ statusLabel(mission) }}
          </div>
          <div class="mission-board-active__cargo">
            {{ mission.template.gatherQuantity }}x {{ gatherItemLabel(mission) }} &middot;
            {{ mission.template.reward }} CR
          </div>
          <button
            v-if="canDeliver(mission)"
            type="button"
            class="mission-board-active__deliver-btn"
            @click="emit('deliverMission', mission.template.id)"
          >
            Deliver
          </button>
        </div>

        <!-- EVA actives -->
        <div
          v-for="mission in board?.activeEvaMissions"
          :key="`eva-${mission.template.id}`"
          class="mission-board-active"
        >
          <div class="mission-board-active__name">{{ mission.template.name }}</div>
          <div v-if="evaGiverName(mission.giverPlanet)" class="mission-board-active__giver">
            {{ evaGiverName(mission.giverPlanet) }}
          </div>
          <div class="mission-board-active__route">
            {{ targetPlanetName(mission.giverPlanet) }} &rarr; deep-space waypoint
          </div>
          <div class="mission-board-active__status">
            {{ evaMissionStatusLabel(mission) }}
          </div>
          <div class="mission-board-active__cargo">
            {{ evaTypeLabel(mission.template.poiType) }} &middot; {{ mission.template.reward }} CR
            on delivery
          </div>
        </div>

        <!-- Turret mining actives -->
        <div
          v-for="mission in activeMiningMissions"
          :key="`mining-${mission.template.id}`"
          class="mission-board-active"
        >
          <div class="mission-board-active__name">{{ mission.template.name }}</div>
          <div v-if="miningGiverName(mission.giverPlanet)" class="mission-board-active__giver">
            {{ miningGiverName(mission.giverPlanet) }}
          </div>
          <div class="mission-board-active__route">
            {{ miningProgressLabel(mission) }}
          </div>
          <div class="mission-board-active__status">
            {{ miningStatusLabel(mission) }}
          </div>
          <div class="mission-board-active__cargo">
            {{ mission.template.reward }} CR on delivery
          </div>
          <button
            v-if="canDeliverMining(mission)"
            type="button"
            class="mission-board-active__deliver-btn"
            @click="emit('deliverMiningMission', mission.template.id)"
          >
            Deliver
          </button>
        </div>

        <!-- Asteroid active (single, may be null) -->
        <div v-if="board?.activeAsteroidMission" class="mission-board-active">
          <div class="mission-board-active__name">{{ board.activeAsteroidMission.name }}</div>
          <div class="mission-board-active__route">
            {{ board.activeAsteroidMission.giverName }} &middot;
            {{ asteroidOperatingLabel(board.activeAsteroidMission) }}
          </div>
          <div class="mission-board-active__status">
            {{
              board.activeAsteroidMission.status === 'accepted'
                ? 'Navigate to waypoint'
                : 'In transit'
            }}
          </div>
          <div class="mission-board-active__cargo">
            {{ objectiveSummary(board.activeAsteroidMission) }}
            &middot; {{ buffedAsteroidRewardCr(board.activeAsteroidMission.totalReward) }} CR
          </div>
        </div>
      </div>
    </ShuttleProgramCover>
  </div>
</template>
