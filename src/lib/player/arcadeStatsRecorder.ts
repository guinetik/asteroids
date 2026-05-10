/**
 * Pure reducer that folds an ArcadeRomEvent into PlayerAchievementStats. The
 * cabinet wiring drives it from HabitatInteriorScene → MapHabitatFacade.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */
import type { PlayerAchievementStats } from './types'

/**
 * One observable thing that happened inside a ROM. The cabinet drains a queue
 * of these every tick.
 *
 * Note: the canonical definition will be moved to
 * `src/lib/minigame/cabinet/types.ts` in a follow-up task; this duplicate
 * exists temporarily so this module can land before the cabinet types update.
 */
export interface ArcadeRomEvent {
  /** Event family. */
  type: 'runStarted' | 'runEnded' | 'event'
  /** For type='event': the event id (e.g. 'saucerKill'). */
  eventId?: string
  /** Score at the moment the event fired. */
  score: number
  /** Wave at the moment the event fired. */
  wave: number
}

/** Increment used when bumping a counter for a single event. */
const ARCADE_COUNTER_INCREMENT = 1

/**
 * Fold one ROM event into the achievement stats. Returns a new stats object;
 * the input is never mutated.
 *
 * @param stats - Current achievement stats from the player profile.
 * @param romId - Cabinet ROM id (e.g. 'asteroids').
 * @param event - Event drained from the ROM's `consumeEvents()` queue.
 * @returns Updated stats with the relevant counters bumped.
 */
export function recordArcadeRomEvent(
  stats: PlayerAchievementStats,
  romId: string,
  event: ArcadeRomEvent,
): PlayerAchievementStats {
  const arcadeRunsByRom = { ...stats.arcadeRunsByRom }
  const arcadeBestScoreByRom = { ...stats.arcadeBestScoreByRom }
  const arcadeBestWaveByRom = { ...stats.arcadeBestWaveByRom }
  const arcadeEventCountsByRom = cloneNested(stats.arcadeEventCountsByRom)

  if (event.type === 'runStarted') {
    arcadeRunsByRom[romId] = (arcadeRunsByRom[romId] ?? 0) + ARCADE_COUNTER_INCREMENT
  }

  arcadeBestScoreByRom[romId] = Math.max(
    arcadeBestScoreByRom[romId] ?? 0,
    event.score,
  )
  arcadeBestWaveByRom[romId] = Math.max(arcadeBestWaveByRom[romId] ?? 0, event.wave)

  if (
    event.type === 'event' &&
    typeof event.eventId === 'string' &&
    event.eventId.length > 0
  ) {
    const inner = { ...arcadeEventCountsByRom[romId] }
    inner[event.eventId] = (inner[event.eventId] ?? 0) + ARCADE_COUNTER_INCREMENT
    arcadeEventCountsByRom[romId] = inner
  }

  return {
    ...stats,
    arcadeRunsByRom,
    arcadeBestScoreByRom,
    arcadeBestWaveByRom,
    arcadeEventCountsByRom,
  }
}

/**
 * Deep-clone a Record<string, Record<string, number>> so the returned outer
 * and inner records are fresh references suitable for immutable updates.
 *
 * @param src - Source nested record to copy.
 * @returns A new nested record with cloned inner records.
 */
function cloneNested(
  src: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [k, v] of Object.entries(src)) out[k] = { ...v }
  return out
}
