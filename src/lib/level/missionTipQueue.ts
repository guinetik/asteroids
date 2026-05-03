/**
 * Small FIFO queue for in-level visor transmissions.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-04-04-level-state-machine-design.md
 */
import type { MissionTipTransmission, MissionTipView } from '@/lib/level/missionTips'

/** Maximum transmissions retained: two visible plus one hidden queued entry. */
export const MISSION_TIP_QUEUE_CAPACITY = 3

/** Number of transmissions rendered at once. */
export const MISSION_TIP_VISIBLE_COUNT = 2

/**
 * Push a tip into the rolling visor queue.
 *
 * Existing ids are not duplicated. When a third visible event would arrive,
 * the oldest entry is dropped so the second entry moves into the first slot
 * and the hidden entry becomes visible.
 *
 * @param queue - Existing queue ordered oldest to newest.
 * @param tip - Transmission to add.
 * @returns Updated queue ordered oldest to newest.
 */
export function pushMissionTipQueue(
  queue: readonly MissionTipTransmission[],
  tip: MissionTipTransmission,
): MissionTipTransmission[] {
  if (queue.some((entry) => entry.id === tip.id)) return [...queue]

  const next = [...queue, tip]
  return next.slice(Math.max(0, next.length - MISSION_TIP_QUEUE_CAPACITY))
}

/**
 * Return the transmissions that should be visible.
 *
 * @param queue - Full queue ordered oldest to newest.
 * @returns At most two visible transmissions.
 */
export function getVisibleMissionTips(
  queue: readonly MissionTipTransmission[],
): MissionTipTransmission[] {
  return queue.slice(0, MISSION_TIP_VISIBLE_COUNT)
}

/** Prefix used by the runtime resolver to mark reactive guidance ids. */
const RUNTIME_TIP_ID_PREFIX = 'runtime:'

/**
 * Return whether a transmission id was produced by the runtime resolver.
 *
 * @param id - Tip id, for example `runtime:oxygenLow` or `objective:gather`.
 * @returns True when the id starts with the runtime prefix.
 */
function isRuntimeTipId(id: string): boolean {
  return id.startsWith(RUNTIME_TIP_ID_PREFIX)
}

/**
 * Return visible transmissions for the current gameplay view, with runtime tips
 * promoted ahead of objective/first-run tips so reactive guidance always wins
 * the top slot. Order is otherwise stable (insertion order within each tier).
 *
 * @param queue - Full queue ordered oldest to newest.
 * @param view - Current gameplay view, for example `fps` during EVA.
 * @returns At most two visible transmissions matching the current view.
 */
export function getVisibleMissionTipsForView(
  queue: readonly MissionTipTransmission[],
  view: MissionTipView,
): MissionTipTransmission[] {
  const matching = queue.filter((entry) => entry.view === view)
  const runtimeTips = matching.filter((entry) => isRuntimeTipId(entry.id))
  const otherTips = matching.filter((entry) => !isRuntimeTipId(entry.id))
  return [...runtimeTips, ...otherTips].slice(0, MISSION_TIP_VISIBLE_COUNT)
}

/**
 * Remove a specific transmission id from the queue.
 *
 * @param queue - Full queue ordered oldest to newest.
 * @param id - Transmission id to remove.
 * @returns Queue without that id.
 */
export function removeMissionTipQueueEntry(
  queue: readonly MissionTipTransmission[],
  id: string,
): MissionTipTransmission[] {
  return queue.filter((entry) => entry.id !== id)
}
