/**
 * Map intro flow state for the opening orbit cutscene.
 *
 * Separates the cinematic onboarding sequence from the shuttle's orbit
 * mechanics so the map can keep animating while gameplay stays locked.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */

/** Duration in seconds for the opening cinematic zoom. */
export const MAP_INTRO_CINEMATIC_DURATION = 7

/** Phases of the map intro flow. */
export type MapIntroPhase =
  | 'inactive'
  | 'cinematic_zoom'
  | 'awaiting_message_open'
  | 'reading_message'
  | 'interactive'

/** View-facing snapshot of the intro UI state. */
export interface MapIntroUiState {
  /** Current intro phase. */
  phase: MapIntroPhase
  /** Whether cinematic letterbox bars should be visible. */
  letterboxVisible: boolean
  /** Whether the centered message CTA button should be visible. */
  messagePromptVisible: boolean
  /** Whether the startup message dialog should currently be open. */
  messageDialogVisible: boolean
  /** Whether normal map controls should remain locked. */
  controlsLocked: boolean
}

/**
 * Tracks the map intro lifecycle from cinematic zoom to interactive play.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
export class MapIntroState {
  /** Current intro phase. */
  phase: MapIntroPhase = 'inactive'

  /** Elapsed time inside the cinematic zoom. */
  private elapsed = 0

  /** Start the cinematic intro flow. */
  start(): void {
    this.phase = 'cinematic_zoom'
    this.elapsed = 0
  }

  /** Skip the intro entirely when no startup message is active. */
  skip(): void {
    this.phase = 'interactive'
    this.elapsed = 0
  }

  /** Advance the cinematic timer. */
  tick(dt: number): void {
    if (this.phase !== 'cinematic_zoom') return

    this.elapsed += dt
    if (this.elapsed >= MAP_INTRO_CINEMATIC_DURATION) {
      this.phase = 'awaiting_message_open'
      this.elapsed = 0
    }
  }

  /** Open the startup message reader. */
  openMessage(): boolean {
    if (this.phase !== 'awaiting_message_open') return false
    this.phase = 'reading_message'
    return true
  }

  /** Complete the intro after the player dismisses the startup message. */
  completeMessage(): boolean {
    if (this.phase !== 'reading_message') return false
    this.phase = 'interactive'
    this.elapsed = 0
    return true
  }

  /** Normalized cinematic zoom progress (0-1). */
  get cinematicProgress(): number {
    if (this.phase === 'cinematic_zoom') {
      return Math.min(1, this.elapsed / MAP_INTRO_CINEMATIC_DURATION)
    }

    if (
      this.phase === 'awaiting_message_open'
      || this.phase === 'reading_message'
      || this.phase === 'interactive'
    ) {
      return 1
    }

    return 0
  }

  /** Whether intro locking is still active. */
  get controlsLocked(): boolean {
    return this.phase !== 'inactive' && this.phase !== 'interactive'
  }

  /** Current UI snapshot for Vue. */
  get uiState(): MapIntroUiState {
    return {
      phase: this.phase,
      letterboxVisible: this.controlsLocked,
      messagePromptVisible: this.phase === 'awaiting_message_open',
      messageDialogVisible: this.phase === 'reading_message',
      controlsLocked: this.controlsLocked,
    }
  }
}
