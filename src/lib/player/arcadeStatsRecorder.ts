/**
 * Pure reducer that folds an ArcadeRomEvent into PlayerAchievementStats. The
 * cabinet wiring drives it from HabitatInteriorScene → MapHabitatFacade.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */
import type { PlayerAchievementStats } from './types'
import type { ArcadeRomEvent } from '@/lib/minigame/cabinet/types'

export type { ArcadeRomEvent }

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
