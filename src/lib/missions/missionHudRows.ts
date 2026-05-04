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
} from '@/lib/missions/types'

/** Group key — drives section header and row palette. */
export type MissionTrackerGroupKey = 'delivery' | 'asteroid' | 'eva' | 'mining'

/** Spatial focus target for a tracker row. */
export type MissionTrackerFocus =
  | { kind: 'planet'; planetId: string }
  | { kind: 'world'; worldX: number; worldZ: number }

/** A single row inside a tracker group. */
export interface MissionTrackerRow {
  /** Stable id used for v-for keying. */
  id: string
  /** Mission name shown as the row title. */
  title: string
  /** Optional objective-type display label (asteroid/EVA only). */
  objectiveType?: string
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
 * @returns Ordered groups (delivery → asteroid → EVA → mining), empty groups omitted.
 */
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
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
