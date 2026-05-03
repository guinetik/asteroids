/**
 * Hidden asteroid-level disturbance model.
 *
 * Surface EVA actions add hidden viroid attention. Threshold crossings emit
 * response events that the scene-facing director turns into ambient enemies.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */

/**
 * Disturbance action categories emitted by level systems.
 *
 * Examples include `movement` for continuous EVA movement, `jump` for jump input,
 * and `explosion` for high-noise impacts.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export type LevelDisturbanceEventType =
  | 'movement'
  | 'sprint'
  | 'jump'
  | 'hard-landing'
  | 'tool-fire'
  | 'mining-hit'
  | 'rock-break'
  | 'combat-hit'
  | 'explosion'

/**
 * Response tier identifiers ordered from least to most severe.
 *
 * `scout` represents a single early viroid, while `patrol` represents the
 * repeated high-disturbance reinforcement tier.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export type LevelDisturbanceResponseTier = 'scout' | 'second-contact' | 'pair' | 'cluster' | 'patrol'

/**
 * One action contribution to the hidden disturbance meter.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceEvent {
  /** Kind of noisy action that occurred, for example `jump`, `mining-hit`, or `explosion`. */
  type: LevelDisturbanceEventType
  /**
   * Optional raw gain before difficulty scaling.
   *
   * Finite values in `[0, Infinity)` are accepted, for example `11` in tests.
   * Negative or non-finite values are treated as `0`. If omitted, the action's
   * base gain is used.
   */
  amount?: number
}

/**
 * Event emitted when hidden disturbance crosses a response threshold.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceResponseEvent {
  /** Response tier that should be spawned, such as `scout` or `patrol`. */
  tier: LevelDisturbanceResponseTier
  /** Number of ambient viroids requested for this response, usually `1` to `4`. */
  enemyCount: number
  /**
   * Diegetic alert text that may be surfaced as a short prompt.
   *
   * Examples include `SUBSURFACE MOVEMENT DETECTED` and `VIROID SIGNAL CLOSING`.
   */
  alert: string
}

/**
 * Mutable state for one level's hidden disturbance cycle.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export interface LevelDisturbanceState {
  /** Mission difficulty in `[1, 10]`, for example `1` for easy or `10` for hard. */
  missionDifficulty: number
  /** Difficulty gain multiplier in `[0.75, 1.25]`, for example `0.75` at difficulty `1`. */
  difficultyFactor: number
  /** Hidden disturbance value in `[0, 100]`, where `90` reaches patrol response. */
  disturbance: number
  /** Response tiers already fired during this disturbance cycle, for example `scout`. */
  triggeredTiers: Set<LevelDisturbanceResponseTier>
  /** Seconds in `[0, Infinity)` until another patrol can fire, for example `8`. */
  patrolCooldownRemaining: number
}

/** Static tuning for one hidden disturbance response threshold. */
interface LevelDisturbanceThreshold {
  /** Tier emitted once this threshold is crossed. */
  tier: LevelDisturbanceResponseTier
  /** Hidden disturbance value required to emit the tier. */
  threshold: number
  /** Number of enemies requested by this response tier. */
  enemyCount: number
  /** Diegetic alert text associated with this response tier. */
  alert: string
}

/** Hidden meter floor. */
const DISTURBANCE_MIN = 0
/** Hidden meter cap. */
const DISTURBANCE_MAX = 100
/** Disturbance ratio that keeps patrol reinforcements active. */
const PATROL_REINFORCEMENT_DISTURBANCE_RATIO = 0.9
/** Lowest supported mission difficulty. */
const MIN_MISSION_DIFFICULTY = 1
/** Highest supported mission difficulty. */
const MAX_MISSION_DIFFICULTY = 10
/** Difficulty-1 gain multiplier. */
const DIFFICULTY_FACTOR_MIN = 0.75
/** Difficulty-10 gain multiplier. */
const DIFFICULTY_FACTOR_MAX = 1.25
/** First disturbance threshold for a scout response. */
const SCOUT_THRESHOLD = 10
/** Second disturbance threshold for renewed contact. */
const SECOND_CONTACT_THRESHOLD = 25
/** Third disturbance threshold for a pair response. */
const PAIR_THRESHOLD = 45
/** Fourth disturbance threshold for a cluster response. */
const CLUSTER_THRESHOLD = 70
/** Final disturbance threshold for a patrol response. */
const PATROL_THRESHOLD = 90
/** Enemy count for one viroid response. */
const SINGLE_ENEMY_COUNT = 1
/** Enemy count for pair response. */
const PAIR_ENEMY_COUNT = 2
/** Enemy count for cluster response. */
const CLUSTER_ENEMY_COUNT = 3
/** Enemy count for patrol response. */
const PATROL_ENEMY_COUNT = 4
/** Patrol reinforcement cooldown before difficulty scaling. */
const BASE_PATROL_COOLDOWN_SECONDS = 10
/** Minimum patrol cooldown after difficulty scaling. */
const MIN_PATROL_COOLDOWN_SECONDS = 6
/** Movement action base disturbance gain. */
const MOVEMENT_BASE_GAIN = 0.35
/** Sprint action base disturbance gain. */
const SPRINT_BASE_GAIN = 0.8
/** Jump action base disturbance gain. */
const JUMP_BASE_GAIN = 3
/** Hard-landing action base disturbance gain. */
const HARD_LANDING_BASE_GAIN = 8
/** Tool-fire action base disturbance gain. */
const TOOL_FIRE_BASE_GAIN = 1.4
/** Mining-hit action base disturbance gain. */
const MINING_HIT_BASE_GAIN = 2.2
/** Rock-break action base disturbance gain. */
const ROCK_BREAK_BASE_GAIN = 7
/** Combat-hit action base disturbance gain. */
const COMBAT_HIT_BASE_GAIN = 1.2
/** Explosion action base disturbance gain. */
const EXPLOSION_BASE_GAIN = 18
/** Number of spans between inclusive mission difficulty endpoints. */
const MISSION_DIFFICULTY_SPAN = MAX_MISSION_DIFFICULTY - MIN_MISSION_DIFFICULTY
/** Difference between minimum and maximum disturbance gain multipliers. */
const DIFFICULTY_FACTOR_SPAN = DIFFICULTY_FACTOR_MAX - DIFFICULTY_FACTOR_MIN

const EVENT_BASE_GAIN: Record<LevelDisturbanceEventType, number> = {
  movement: MOVEMENT_BASE_GAIN,
  sprint: SPRINT_BASE_GAIN,
  jump: JUMP_BASE_GAIN,
  'hard-landing': HARD_LANDING_BASE_GAIN,
  'tool-fire': TOOL_FIRE_BASE_GAIN,
  'mining-hit': MINING_HIT_BASE_GAIN,
  'rock-break': ROCK_BREAK_BASE_GAIN,
  'combat-hit': COMBAT_HIT_BASE_GAIN,
  explosion: EXPLOSION_BASE_GAIN,
}

const RESPONSE_THRESHOLDS: readonly LevelDisturbanceThreshold[] = [
  {
    tier: 'scout',
    threshold: SCOUT_THRESHOLD,
    enemyCount: SINGLE_ENEMY_COUNT,
    alert: 'SUBSURFACE MOVEMENT DETECTED',
  },
  {
    tier: 'second-contact',
    threshold: SECOND_CONTACT_THRESHOLD,
    enemyCount: SINGLE_ENEMY_COUNT,
    alert: 'VIROID SIGNAL CLOSING',
  },
  {
    tier: 'pair',
    threshold: PAIR_THRESHOLD,
    enemyCount: PAIR_ENEMY_COUNT,
    alert: 'VIROID SIGNAL CLOSING',
  },
  {
    tier: 'cluster',
    threshold: CLUSTER_THRESHOLD,
    enemyCount: CLUSTER_ENEMY_COUNT,
    alert: 'VIROID PATTERN LOCK',
  },
  {
    tier: 'patrol',
    threshold: PATROL_THRESHOLD,
    enemyCount: PATROL_ENEMY_COUNT,
    alert: 'VIROID SIGNAL CLOSING',
  },
]

/**
 * Convert mission difficulty to a disturbance gain multiplier.
 *
 * @param missionDifficulty - Mission difficulty, expected in `[1, 10]`; invalid values clamp to `1`.
 * @returns Difficulty-1 maps to `0.75`; difficulty-10 maps to `1.25`.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export function getLevelDisturbanceDifficultyFactor(missionDifficulty: number): number {
  const difficulty = clampMissionDifficulty(missionDifficulty)
  const progress = (difficulty - MIN_MISSION_DIFFICULTY) / MISSION_DIFFICULTY_SPAN
  return DIFFICULTY_FACTOR_MIN + DIFFICULTY_FACTOR_SPAN * progress
}

/**
 * Create a new hidden disturbance state for one level run.
 *
 * @param params - Mission tuning input.
 * @param params.missionDifficulty - Mission difficulty, expected in `[1, 10]`.
 * @returns Mutable disturbance state with disturbance and cooldown initialized to `0`.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export function createLevelDisturbanceState(params: {
  missionDifficulty: number
}): LevelDisturbanceState {
  const missionDifficulty = clampMissionDifficulty(params.missionDifficulty)
  return {
    missionDifficulty,
    difficultyFactor: getLevelDisturbanceDifficultyFactor(missionDifficulty),
    disturbance: DISTURBANCE_MIN,
    triggeredTiers: new Set(),
    patrolCooldownRemaining: DISTURBANCE_MIN,
  }
}

/**
 * Add one action contribution to the hidden disturbance meter.
 *
 * @param state - Disturbance state to mutate.
 * @param event - Action event emitted by level systems; invalid custom amounts are ignored.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export function recordLevelDisturbance(
  state: LevelDisturbanceState,
  event: LevelDisturbanceEvent,
): void {
  const rawGain = sanitizeNonNegativeFinite(event.amount ?? EVENT_BASE_GAIN[event.type])
  state.disturbance = clampDisturbance(
    sanitizeDisturbanceValue(state.disturbance) + rawGain * state.difficultyFactor,
  )
}

/**
 * Advance cooldowns and emit newly crossed response thresholds.
 *
 * @param state - Disturbance state to mutate.
 * @param dt - Delta time in seconds; negative or non-finite values are treated as `0`.
 * @returns Response events requested this frame.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export function tickLevelDisturbance(
  state: LevelDisturbanceState,
  dt: number,
): LevelDisturbanceResponseEvent[] {
  const elapsedSeconds = sanitizeNonNegativeFinite(dt)
  state.patrolCooldownRemaining = Math.max(
    DISTURBANCE_MIN,
    sanitizeNonNegativeFinite(state.patrolCooldownRemaining) - elapsedSeconds,
  )
  const events: LevelDisturbanceResponseEvent[] = []

  for (const threshold of RESPONSE_THRESHOLDS) {
    if (state.disturbance < threshold.threshold) continue
    if (state.triggeredTiers.has(threshold.tier)) continue

    state.triggeredTiers.add(threshold.tier)
    events.push({
      tier: threshold.tier,
      enemyCount: threshold.enemyCount,
      alert: threshold.alert,
    })

    if (threshold.tier === 'patrol') {
      state.patrolCooldownRemaining = getPatrolCooldownSeconds(state)
    }
  }

  if (
    state.disturbance >= DISTURBANCE_MAX * PATROL_REINFORCEMENT_DISTURBANCE_RATIO &&
    state.triggeredTiers.has('patrol') &&
    state.patrolCooldownRemaining <= DISTURBANCE_MIN
  ) {
    events.push({
      tier: 'patrol',
      enemyCount: PATROL_ENEMY_COUNT,
      alert: 'VIROID SIGNAL CLOSING',
    })
    state.patrolCooldownRemaining = getPatrolCooldownSeconds(state)
  }

  return events
}

/**
 * Clear the disturbance cycle after the lander lifts off.
 *
 * @param state - Disturbance state to mutate.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
export function resetLevelDisturbance(state: LevelDisturbanceState): void {
  state.disturbance = DISTURBANCE_MIN
  state.triggeredTiers.clear()
  state.patrolCooldownRemaining = DISTURBANCE_MIN
}

/**
 * Clamp raw mission difficulty into the supported tuning range.
 *
 * @param missionDifficulty - Raw mission difficulty from asteroid data.
 * @returns Difficulty constrained to `[1, 10]`.
 */
function clampMissionDifficulty(missionDifficulty: number): number {
  if (!Number.isFinite(missionDifficulty)) return MIN_MISSION_DIFFICULTY

  return Math.max(MIN_MISSION_DIFFICULTY, Math.min(MAX_MISSION_DIFFICULTY, missionDifficulty))
}

/**
 * Clamp a disturbance meter value into the documented range.
 *
 * @param disturbance - Raw disturbance value to constrain.
 * @returns Disturbance in `[0, 100]`.
 */
function clampDisturbance(disturbance: number): number {
  return Math.max(DISTURBANCE_MIN, Math.min(DISTURBANCE_MAX, disturbance))
}

/**
 * Sanitize an existing disturbance value before applying a new gain.
 *
 * @param disturbance - Current mutable disturbance value.
 * @returns Finite disturbance in `[0, 100]`, defaulting invalid values to `0`.
 */
function sanitizeDisturbanceValue(disturbance: number): number {
  if (!Number.isFinite(disturbance)) return DISTURBANCE_MIN

  return clampDisturbance(disturbance)
}

/**
 * Convert invalid or negative numeric input into neutral zero.
 *
 * @param value - Raw numeric input from events or frame timing.
 * @returns The finite non-negative value, or `0` when invalid.
 */
function sanitizeNonNegativeFinite(value: number): number {
  if (!Number.isFinite(value)) return DISTURBANCE_MIN

  return Math.max(DISTURBANCE_MIN, value)
}

/**
 * Calculate the patrol reinforcement cooldown for the current difficulty.
 *
 * @param state - Disturbance state whose difficulty factor drives cooldown.
 * @returns Cooldown in seconds before another patrol can be emitted.
 */
function getPatrolCooldownSeconds(state: LevelDisturbanceState): number {
  return Math.max(MIN_PATROL_COOLDOWN_SECONDS, BASE_PATROL_COOLDOWN_SECONDS / state.difficultyFactor)
}
