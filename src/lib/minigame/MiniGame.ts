/**
 * Base interface for objective minigames.
 *
 * Each objective type (survey, collect, exterminate, rescue) implements
 * this interface. The LevelViewController manages minigame instances
 * without knowing their internals — just ticking, querying status,
 * and listening for events.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import type { Enemy } from '@/lib/fps/enemy'
import type { WorldCollider } from '@/lib/physics/worldCollision'

/** Minigame lifecycle status. */
export type MiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

/** Context passed to minigames each frame so they can read game state without coupling. */
export interface MiniGameContext {
  /** Current level state ('lander' | 'eva' | etc). */
  levelState: string
  /** Lander world position (null if not available). */
  landerPosition: { x: number; y: number; z: number } | null
  /** Lander forward direction in world space (null if not available). */
  landerForward?: { x: number; y: number; z: number } | null
  /** Lander up direction in world space (null if not available). */
  landerUp?: { x: number; y: number; z: number } | null
  /** Whether the lander is currently grounded on the surface. */
  landerGrounded: boolean
  /** EVA player world position (null if not in EVA). */
  playerPosition: { x: number; y: number; z: number } | null
  /** Whether the interact key (F) was just pressed this frame. */
  interactPressed: boolean
  /** Whether the terminal interact key (E) was just pressed this frame. */
  terminalInteractPressed: boolean
}

/** Events a minigame can emit. */
export interface MiniGameEvents {
  /** Show or hide a prompt (null = hide). */
  onPrompt: ((text: string | null) => void) | null
  /** Objective completed. */
  onComplete: ((objectiveIndex: number) => void) | null
  /** A step advanced — pass updated steps for reactivity. */
  onStepChange: ((objectiveIndex: number, steps: readonly MiniGameStep[]) => void) | null
}

/**
 * Optional progress metadata appended to a step label so the tracker
 * can render `Mine Olivine    23/75 kg` without each minigame having
 * to format its own string.
 */
export interface MiniGameStepProgress {
  /** Current value (e.g. kg mined so far). */
  current: number
  /** Target value (e.g. quota). */
  target: number
  /** Unit suffix (e.g. `'kg'`, `'probes'`). */
  unit: string
}

/** A single step in a minigame's progression. */
export interface MiniGameStep {
  /** Step label shown in the tracker. */
  label: string
  /** Whether this step is complete. */
  complete: boolean
  /** Whether this is the currently active step. */
  active: boolean
  /**
   * Optional incremental progress meter rendered after the label.
   * Other minigames can omit this field — the tracker treats it as
   * additive UI when present and leaves the existing layout intact
   * when absent.
   */
  progress?: MiniGameStepProgress
}

/** Shared fallback labels for objective-driven HUD/tracker views. */
export const OBJECTIVE_LABELS: Record<string, string> = {
  gather: 'Gather',
  exterminate: 'Exterminate',
  rescue: 'Rescue',
  survey: 'Survey',
  photometry: 'Photometry',
  collect: 'Collect',
}

/**
 * Base minigame interface. All objective minigames implement this.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export interface MiniGame {
  /** Current minigame status. */
  readonly status: MiniGameStatus
  /** The objective index this minigame tracks. */
  readonly objectiveIndex: number
  /** Whether the player is near this minigame's interaction point. */
  readonly isPlayerNearInteraction: boolean
  /** Time remaining in seconds (null if no timer or not active). */
  readonly timeRemaining: number | null
  /** Progress numerator (e.g. probes collected). Null if not applicable. */
  readonly progressCurrent: number | null
  /** Progress denominator (e.g. total probes). Null if not applicable. */
  readonly progressTotal: number | null
  /** Ordered steps for the tracker HUD. */
  readonly steps: readonly MiniGameStep[]
  /** Optional short instruction shown in the mission HUD, or `null` when idle. */
  readonly missionInstruction?: string | null
  /** Optional static colliders owned by this minigame's scene props. */
  readonly worldColliders?: readonly WorldCollider[]
  /**
   * Optional live enemy count owned by this minigame. Combat minigames
   * (exterminate, rescue) override; non-combat objectives leave it
   * undefined and are treated as zero by the debug HUD aggregator.
   */
  readonly enemyCount?: number

  /** Per-frame update. */
  tick(dt: number, ctx: MiniGameContext): void
  /** Clean up all 3D resources. */
  dispose(): void
  /**
   * Optional notification that one of this minigame's enemies just took a
   * projectile hit from the player. Implementations should locate the matching
   * visual controller and trigger its hit-flash. Minigames that don't own
   * enemies may leave this undefined.
   *
   * @param enemy - Enemy domain instance that was hit.
   */
  notifyEnemyHit?(enemy: Enemy): void
}
