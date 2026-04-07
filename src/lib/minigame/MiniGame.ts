/**
 * Base interface for objective minigames.
 *
 * Each objective type (survey, gather, exterminate, rescue) implements
 * this interface. The LevelViewController manages minigame instances
 * without knowing their internals — just ticking, querying status,
 * and listening for events.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */

/** Minigame lifecycle status. */
export type MiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

/** Context passed to minigames each frame so they can read game state without coupling. */
export interface MiniGameContext {
  /** Current level state ('lander' | 'eva' | etc). */
  levelState: string
  /** Lander world position (null if not available). */
  landerPosition: { x: number; y: number; z: number } | null
  /** EVA player world position (null if not in EVA). */
  playerPosition: { x: number; y: number; z: number } | null
  /** Whether the interact key was just pressed this frame. */
  interactPressed: boolean
}

/** Events a minigame can emit. */
export interface MiniGameEvents {
  /** Show or hide a prompt (null = hide). */
  onPrompt: ((text: string | null) => void) | null
  /** Objective completed. */
  onComplete: ((objectiveIndex: number) => void) | null
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

  /** Per-frame update. */
  tick(dt: number, ctx: MiniGameContext): void
  /** Clean up all 3D resources. */
  dispose(): void
}
