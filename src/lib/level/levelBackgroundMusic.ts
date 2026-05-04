/**
 * Picks looping asteroid-level background music from mission objectives.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/asteroid-lander-gdd.md
 */
import type { AudioSoundId } from '@/audio/audioManifest'
import type { ObjectiveType } from '@/lib/missions/types'

/** Asteroid missions: nests, bunkers, and DAN hostile survey. */
const OBJECTIVES_COMBAT_MUSIC = new Set<ObjectiveType>(['exterminate', 'bunker', 'dan'])
/** Cocoons / colonist evacuation. */
const OBJECTIVES_RESCUE_MUSIC = new Set<ObjectiveType>(['rescue'])
/** Mining cargo and scripted resource pickup. */
const OBJECTIVES_GATHER_MUSIC = new Set<ObjectiveType>(['gather', 'collect'])
/** Gravitometry, photometry, and terminal intel — calmer analytic bed. */
const OBJECTIVES_GRAVITY_MUSIC = new Set<ObjectiveType>([
  'survey',
  'photometry',
  'mineral-analysis',
  'prospectus-terminal',
])

/** Fallback when objectives are unknown or ambiguous. */
const DEFAULT_LEVEL_BACKGROUND_MUSIC_SOUND_ID: AudioSoundId = 'music.levelCombat'

/**
 * Resolves manifest music id for the active asteroid mission.
 *
 * When several objective types coexist, precedence is combat/hazard (combat bucket) over rescue
 * over gathering over gravity/science, then default combat.
 *
 * @param objectives - Ordered mission objectives; may be empty.
 * @returns A registered {@link AudioSoundId} for one of `music.level*` assets.
 */
export function resolveLevelBackgroundMusicSoundId(
  objectives: ReadonlyArray<{ readonly type: ObjectiveType }>,
): AudioSoundId {
  const seen = new Set<ObjectiveType>()
  for (const o of objectives) {
    seen.add(o.type)
  }

  if (seen.size === 0) return DEFAULT_LEVEL_BACKGROUND_MUSIC_SOUND_ID

  const hasCombat = [...OBJECTIVES_COMBAT_MUSIC].some((t) => seen.has(t))
  if (hasCombat) return 'music.levelCombat'

  const hasRescue = [...OBJECTIVES_RESCUE_MUSIC].some((t) => seen.has(t))
  if (hasRescue) return 'music.levelRescue'

  const hasGather = [...OBJECTIVES_GATHER_MUSIC].some((t) => seen.has(t))
  if (hasGather) return 'music.levelGather'

  const hasGravity = [...OBJECTIVES_GRAVITY_MUSIC].some((t) => seen.has(t))
  if (hasGravity) return 'music.levelGravity'

  return DEFAULT_LEVEL_BACKGROUND_MUSIC_SOUND_ID
}
