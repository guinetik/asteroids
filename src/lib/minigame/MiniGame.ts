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

/** Minigame lifecycle status. */
export type MiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

/** Context passed to minigames each frame so they can read game state without coupling. */
export interface MiniGameContext {
  /** Current level state ('lander' | 'eva' | etc). */
  levelState: string
  /** Lander world position (null if not available). */
  landerPosition: { x: number; y: number; z: number } | null
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

/** A single step in a minigame's progression. */
export interface MiniGameStep {
  /** Step label shown in the tracker. */
  label: string
  /** Whether this step is complete. */
  complete: boolean
  /** Whether this is the currently active step. */
  active: boolean
}

/** Shared fallback labels for objective-driven HUD/tracker views. */
export const OBJECTIVE_LABELS: Record<string, string> = {
  gather: 'Gather',
  exterminate: 'Exterminate',
  rescue: 'Rescue',
  survey: 'Survey',
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

  /** Per-frame update. */
  tick(dt: number, ctx: MiniGameContext): void
  /** Clean up all 3D resources. */
  dispose(): void
}
