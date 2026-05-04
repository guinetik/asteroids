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
