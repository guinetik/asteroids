/**
 * Pure wave-roster generator for the Bunker minigame.
 *
 * Loads authored skeletons from `src/data/missions/bunker-waves.json` and
 * produces a per-wave enemy roster: the fixed authored units plus 1–3 random
 * fill units drawn from the wave's `fillPool`. The RNG is seeded per
 * `(missionId, waveIndex)` so replays of the same mission see the same waves.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-bunker-mission-design.md
 */
import waveData from '@/data/missions/bunker-waves.json'

/** Slice-1 enemy types valid in bunker rosters. */
export type BunkerEnemyType = 'bacteriophage' | 'spire' | 'chimera'

/** Difficulty tier — drives wave count and authored skeletons. */
export type BunkerWaveTier = 'easy' | 'medium' | 'hard'

/** A single fixed roster entry: spawn `count` of `type`. */
interface WaveFixedEntry {
  type: BunkerEnemyType
  count: number
}

/** One authored wave skeleton: fixed roster + a fill pool. */
interface WaveSkeleton {
  fixed: WaveFixedEntry[]
  fillPool: BunkerEnemyType[]
}

/** Lower bound (inclusive) of random fill units added per wave. */
const FILL_MIN = 1
/** Upper bound (inclusive) of random fill units added per wave. */
const FILL_MAX = 3

const WAVES: Record<BunkerWaveTier, readonly WaveSkeleton[]> = waveData as Record<
  BunkerWaveTier,
  readonly WaveSkeleton[]
>

/**
 * Map an asteroid mission difficulty (1–10) to a bunker tier.
 *
 * @param difficulty - Rolled mission difficulty
 */
export function difficultyToTier(difficulty: number): BunkerWaveTier {
  if (difficulty <= 4) return 'easy'
  if (difficulty <= 7) return 'medium'
  return 'hard'
}

/**
 * Total wave count the player must clear at this tier.
 *
 * @param tier - Bunker tier
 */
export function totalWavesForTier(tier: BunkerWaveTier): number {
  return WAVES[tier].length
}

/**
 * FNV-1a 32-bit hash of a string. Tiny, deterministic, dependency-free —
 * used to seed the per-wave PRNG.
 *
 * @param input - String to hash
 */
function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Mulberry32 PRNG — small, fast, well-distributed.
 *
 * @param seed - 32-bit unsigned seed
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Roll the full enemy roster for a single wave.
 *
 * @param tier      - Difficulty tier
 * @param waveIndex - Zero-based wave index
 * @param missionId - Stable mission instance id, used as PRNG seed
 * @returns Flat list of enemy type strings; spawn order = list order
 */
export function rollWave(
  tier: BunkerWaveTier,
  waveIndex: number,
  missionId: string,
): BunkerEnemyType[] {
  const skeletons = WAVES[tier]
  if (waveIndex < 0 || waveIndex >= skeletons.length) {
    throw new Error(
      `bunkerWaveSchedule: waveIndex ${waveIndex} out of range for tier '${tier}' (${skeletons.length} waves)`,
    )
  }
  const skeleton = skeletons[waveIndex]!

  const roster: BunkerEnemyType[] = []
  for (const entry of skeleton.fixed) {
    for (let i = 0; i < entry.count; i++) roster.push(entry.type)
  }

  const seed = hashString(`${missionId}:${tier}:${waveIndex}`)
  const rng = mulberry32(seed)
  const fillCount = FILL_MIN + Math.floor(rng() * (FILL_MAX - FILL_MIN + 1))
  for (let i = 0; i < fillCount; i++) {
    const pick = skeleton.fillPool[Math.floor(rng() * skeleton.fillPool.length)]!
    roster.push(pick)
  }

  return roster
}
