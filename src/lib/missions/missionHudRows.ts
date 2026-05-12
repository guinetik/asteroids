/**
 * Pure builder that converts an active-mission snapshot from
 * {@link ShuttleMissionBoard} into the grouped row data consumed by
 * `MissionTrackerPanel.vue`. Empty groups are omitted.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

import type {
  ActiveShuttleMission,
  ShuttleMissionBoard,
  GeneratedAsteroidMission,
  ObjectiveType,
  ActiveVisitRelayMission,
  EvaMissionPoiType,
  ActiveTurretMiningMission,
  MiningOreCategory,
} from '@/lib/missions/types'
import type { Inventory } from '@/lib/inventory/types'
import type {
  CargoState,
  CargoThermalZone,
  DeliveryTimerState,
} from '@/lib/missions/cargoIntegrity'
import { getItemDefinition } from '@/lib/inventory/catalog'
import { computeMiningProgressKg } from '@/lib/missions/turretMiningSession'

/** Group key — drives section header and row palette. */
export type MissionTrackerGroupKey = 'delivery' | 'asteroid' | 'eva' | 'mining'

/** Spatial focus target for a tracker row. */
export type MissionTrackerFocus =
  | { kind: 'planet'; planetId: string }
  | { kind: 'world'; worldX: number; worldZ: number }

/** Color tone for a status row — drives CSS class selection in the Vue layer. */
export type MissionTrackerStatusTone = 'ok' | 'warn' | 'danger'

/** A single row inside a tracker group. */
export interface MissionTrackerRow {
  /** Stable id used for v-for keying. */
  id: string
  /** Mission name shown as the row title. */
  title: string
  /** Optional objective-type display label (asteroid/EVA only). */
  objectiveType?: string
  /** Optional progress line (e.g. mining `"180 / 350 kg of Olivine"`). */
  progress?: string
  /** Optional countdown timer (seconds remaining). Rendered as `mm:ss`. */
  timerSeconds?: number
  /** Optional integrity / progress bar. */
  bar?: {
    /** Current value (0..max). */
    value: number
    /** Max value (typically 100 for integrity). */
    max: number
    /** Display label above or beside the bar. */
    label: string
  }
  /** Optional categorical status indicator (e.g. SAFE / HOT / COLD). */
  status?: {
    /** Short label shown in the indicator. */
    label: string
    /** Tone driving the color of the indicator. */
    tone: MissionTrackerStatusTone
  }
  /** Where clicking the row should park the camera. */
  focus: MissionTrackerFocus
}

/** A group rendered as one section. Empty groups are not produced. */
export interface MissionTrackerGroup {
  /** Discriminator used for keys, ordering, and styling hooks. */
  key: MissionTrackerGroupKey
  /** Human label shown as the section eyebrow. */
  title: string
  /** Rows in acceptance order. */
  rows: readonly MissionTrackerRow[]
}

/** Section title for the delivery group. */
const DELIVERY_GROUP_TITLE = 'Deliveries'

/** Section title for the asteroid group. */
const ASTEROID_GROUP_TITLE = 'Asteroid'

/** Section title for the EVA group. */
const EVA_GROUP_TITLE = 'EVA'

/** Section title for the mining group. */
const MINING_GROUP_TITLE = 'Shuttle Mining'

/** Display labels for each EVA POI type. */
const EVA_POI_LABELS: Record<EvaMissionPoiType, string> = {
  satellite: 'Satellite Servicing',
  relay_antenna: 'Relay Repair',
  telescope: 'Telescope',
}

/** Display labels for each asteroid objective discriminant. */
const ASTEROID_OBJECTIVE_LABELS: Record<ObjectiveType, string> = {
  gather: 'Gather',
  exterminate: 'Exterminate',
  rescue: 'Rescue',
  survey: 'Survey',
  photometry: 'Photometry',
  dan: 'DAN Survey',
  collect: 'Collect',
  bunker: 'Bunker Defense',
  'mineral-analysis': 'Mineral Analysis',
  'prospectus-terminal': 'Prospectus',
}

/**
 * Build the ordered list of non-empty mission groups for the HUD tracker.
 *
 * @param board - Current shuttle mission board snapshot.
 * @param inventory - Optional live shuttle inventory; when provided, mining rows
 *   surface a `progress` line (e.g. `"180 / 350 kg of Olivine"`).
 * @returns Ordered groups (delivery → asteroid → EVA → mining), empty groups omitted.
 */
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
  inventory?: Inventory | null,
): readonly MissionTrackerGroup[] {
  const groups: MissionTrackerGroup[] = []

  const deliveryRows = board.activeMissions.map(buildDeliveryRow)
  if (deliveryRows.length > 0) {
    groups.push({ key: 'delivery', title: DELIVERY_GROUP_TITLE, rows: deliveryRows })
  }

  if (board.activeAsteroidMission) {
    groups.push({
      key: 'asteroid',
      title: ASTEROID_GROUP_TITLE,
      rows: [buildAsteroidRow(board.activeAsteroidMission)],
    })
  }

  const evaRows = board.activeEvaMissions.map(buildEvaRow)
  if (evaRows.length > 0) {
    groups.push({ key: 'eva', title: EVA_GROUP_TITLE, rows: evaRows })
  }

  const miningRows = board.activeMiningMissions.map((mission, index) =>
    buildMiningRow(mission, index, inventory ?? null),
  )
  if (miningRows.length > 0) {
    groups.push({ key: 'mining', title: MINING_GROUP_TITLE, rows: miningRows })
  }

  return groups
}

/**
 * Build a tracker row for one delivery mission. Focus follows the player's
 * next destination: the target planet during the gather phase (`active`),
 * the giver planet during the turn-in phase (`ready-to-deliver`).
 */
function buildDeliveryRow(
  mission: ActiveShuttleMission,
  index: number,
): MissionTrackerRow {
  const planetId =
    mission.status === 'ready-to-deliver' ? mission.giverPlanet : mission.template.targetPlanet
  return {
    id: `delivery:${mission.template.id}:${index}`,
    title: mission.template.name,
    focus: { kind: 'planet', planetId },
  }
}

/**
 * Build a tracker row for the active asteroid mission. The first objective's
 * type drives the display label — multi-objective missions surface their
 * leading objective for the at-a-glance HUD.
 */
function buildAsteroidRow(mission: GeneratedAsteroidMission): MissionTrackerRow {
  const first = mission.objectives[0]
  const objectiveType = first ? ASTEROID_OBJECTIVE_LABELS[first.type] : undefined
  return {
    id: `asteroid:${mission.id}`,
    title: mission.name,
    objectiveType,
    focus: {
      kind: 'world',
      worldX: mission.waypoint.worldX,
      worldZ: mission.waypoint.worldZ,
    },
  }
}

/**
 * Build a tracker row for one active EVA visit-relay mission. Camera focus
 * uses the snapshotted XZ waypoint (the Y-axis offset only matters during
 * EVA egress, not for the orbital map view).
 */
function buildEvaRow(mission: ActiveVisitRelayMission, index: number): MissionTrackerRow {
  return {
    id: `eva:${mission.template.id}:${index}`,
    title: mission.template.name,
    objectiveType: EVA_POI_LABELS[mission.template.poiType],
    focus: {
      kind: 'world',
      worldX: mission.waypoint.worldX,
      worldZ: mission.waypoint.worldZ,
    },
  }
}

/**
 * Build a tracker row for one active turret mining mission. Mining missions
 * have no spatial waypoint — the player roams the belt with a turret-equipped
 * shuttle and returns to the giver to deliver — so focus targets the giver
 * planet itself.
 */
function buildMiningRow(
  mission: ActiveTurretMiningMission,
  index: number,
  inventory: Inventory | null,
): MissionTrackerRow {
  const target = mission.template.targetKg
  const ore = oreLabelFor(mission.template.oreCategory)
  const kg = inventory ? Math.min(computeMiningProgressKg(inventory, mission), target) : 0
  return {
    id: `mining:${mission.template.id}:${index}`,
    title: mission.template.name,
    progress: `${kg} / ${target} kg of ${ore}`,
    focus: { kind: 'planet', planetId: mission.giverPlanet },
  }
}

/** Display label for a mining ore category — `'any'` reads as `Any main-belt ore`. */
function oreLabelFor(category: MiningOreCategory): string {
  if (category === 'any') return 'Any main-belt ore'
  const def = getItemDefinition(category)
  return def ? def.label : category
}

/** Short label for each thermal zone shown in the HUD status badge. */
const ZONE_LABELS: Record<CargoThermalZone, string> = {
  safe: 'SAFE',
  hot: 'HOT',
  cold: 'COLD',
}

/** Color tone for each thermal zone — non-safe zones are always danger. */
const ZONE_TONES: Record<CargoThermalZone, MissionTrackerStatusTone> = {
  safe: 'ok',
  hot: 'danger',
  cold: 'danger',
}

/** Max integrity constant matching the cargo model's start value. */
const CARGO_INTEGRITY_MAX = 100

/**
 * Build the three Bunker Extract cargo HUD rows — integrity bar, delivery
 * countdown, and thermal-zone status — for the right-hand mission tracker.
 *
 * Returns an empty array unless the active mission is a Yamada Bunker Extract
 * whose organ has been dispensed, AND all three live state inputs are present.
 *
 * @param mission - Active asteroid mission, or null.
 * @param timer - Live delivery countdown state, or null.
 * @param cargo - Live cargo integrity state, or null.
 * @param zone - Current thermal zone classification, or null.
 * @returns Three tracker rows, in order: integrity → timer → zone. Empty array if any precondition fails.
 * @author guinetik
 * @date 2026-05-11
 * @spec docs/superpowers/specs/2026-05-11-yamada-mission-pool-design.md
 */
export function buildBunkerExtractCargoRows(
  mission: GeneratedAsteroidMission | null,
  timer: DeliveryTimerState | null,
  cargo: CargoState | null,
  zone: CargoThermalZone | null,
): MissionTrackerRow[] {
  if (!mission || mission.yamada?.archetype !== 'bunker-extract') return []
  if (!mission.yamada.organDispensed || !timer || !cargo || !zone) return []
  const focus: MissionTrackerFocus = {
    kind: 'planet',
    planetId: mission.yamada.destinationPlanetId,
  }
  return [
    {
      id: `cargo-integrity:${mission.id}`,
      title: 'Cargo Integrity',
      bar: {
        value: Math.round(cargo.integrity),
        max: CARGO_INTEGRITY_MAX,
        label: 'Integrity',
      },
      focus,
    },
    {
      id: `cargo-timer:${mission.id}`,
      title: 'Delivery Window',
      timerSeconds: timer.remaining,
      focus,
    },
    {
      id: `cargo-zone:${mission.id}`,
      title: 'Thermal Zone',
      status: { label: ZONE_LABELS[zone], tone: ZONE_TONES[zone] },
      focus,
    },
  ]
}
