/**
 * Pure builder that converts an active-mission snapshot from
 * {@link ShuttleMissionBoard} into the grouped row data consumed by
 * `MissionTrackerPanel.vue`. Empty groups are omitted.
 *
 * @author guinetik
 * @date 2026-05-04
 * @spec docs/superpowers/specs/2026-05-04-active-missions-tracker-design.md
 */

import type { ShuttleMissionBoard } from '@/lib/missions/types'

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

/**
 * Build the ordered list of non-empty mission groups for the HUD tracker.
 *
 * @param board - Current shuttle mission board snapshot.
 * @returns Ordered groups (delivery → asteroid → EVA → mining), empty groups omitted.
 */
export function buildMissionTrackerGroups(
  board: ShuttleMissionBoard,
): readonly MissionTrackerGroup[] {
  void board
  return []
}
