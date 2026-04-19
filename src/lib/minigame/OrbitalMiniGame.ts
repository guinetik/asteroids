/**
 * Orbital minigame interface for shuttle missions.
 *
 * Standalone interface — not related to the level-scene MiniGame.
 * Each planet's minigameType maps to a concrete implementation.
 * The default implementation wraps the current "press button to complete" behavior.
 *
 * @author guinetik
 * @date 2026-04-10
 * @spec docs/superpowers/specs/2026-04-10-orbital-minigame-design.md
 */

/** Orbital minigame lifecycle status. */
export type OrbitalMiniGameStatus = 'idle' | 'active' | 'completed' | 'failed'

/** How this minigame presents to the player. Determines whether the host opens a Vue overlay or yields camera/input control to an in-scene controller. */
export type OrbitalMiniGamePresentation = 'overlay' | 'in_scene'

/** A single step in an orbital minigame's progression. */
export interface OrbitalMiniGameStep {
  /** Step label shown in the tracker. */
  label: string
  /** Whether this step is complete. */
  complete: boolean
  /** Whether this is the currently active step. */
  active: boolean
}

/** Context passed to orbital minigames each frame. Carries map-scene state. */
export interface OrbitalMiniGameContext {
  /** Ship world position. */
  shipPosition: { x: number; y: number; z: number }
  /** Current orbit state ('free' | 'approaching' | 'orbiting'). */
  orbitState: string
  /** Planet id being orbited (null if not orbiting). */
  orbitedPlanetId: string | null
  /** Distance from ship to orbited body center (null if not orbiting). */
  distanceToPlanet: number | null
}

/** Events an orbital minigame can emit. */
export interface OrbitalMiniGameEvents {
  /** Minigame completed — pass mission id. */
  onComplete: ((missionId: string) => void) | null
  /** Steps changed — pass updated steps for reactivity. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null
}

/**
 * Orbital minigame interface. All shuttle mission minigames implement this.
 *
 * @author guinetik
 * @date 2026-04-10
 */
export interface OrbitalMiniGame {
  /** Current minigame status. */
  readonly status: OrbitalMiniGameStatus
  /** How this minigame presents. Drives host dispatch between Vue overlay and in-scene controller. */
  readonly presentation: OrbitalMiniGamePresentation
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string
  /** Ordered steps for the tracker HUD. */
  readonly steps: readonly OrbitalMiniGameStep[]
  /** Progress numerator (null if not applicable). */
  readonly progressCurrent: number | null
  /** Progress denominator (null if not applicable). */
  readonly progressTotal: number | null

  /** Per-frame update. No-op for UI-driven minigames. */
  tick(dt: number, ctx: OrbitalMiniGameContext): void
  /** Called by UI when the player completes the minigame via button/interaction. */
  complete(): void
  /** Clean up resources. */
  dispose(): void
}
