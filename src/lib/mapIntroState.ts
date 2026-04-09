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

import { easeInOutCubic } from '@/lib/math/easing'

/** Duration in seconds for the opening cinematic (6 visual beats). */
export const MAP_INTRO_CINEMATIC_DURATION = 30

/** Eased progress boundary: start of Enceladus discovery beat. */
export const MAP_INTRO_BEAT_ENCELADUS = 0.12

/** Eased progress boundary: start of Viroid reveal beat. */
export const MAP_INTRO_BEAT_VIROIDS = 0.28

/** Eased progress boundary: start of Jupiter approach beat. */
export const MAP_INTRO_BEAT_JUPITER = 0.42

/** Eased progress boundary: start of cloud city reveal beat. */
export const MAP_INTRO_BEAT_CLOUD_CITY = 0.56

/** Eased progress boundary: start of Earth / player beat. */
export const MAP_INTRO_BEAT_EARTH = 0.7

/** Caption: wide solar system establishing shot. */
export const MAP_INTRO_CAPTION_SOLAR_SYSTEM = 'SOLAR SYSTEM, 2299 AD.'

/** Caption: Enceladus neutron thruster discovery. */
export const MAP_INTRO_CAPTION_ENCELADUS =
  'A DISCOVERY ON ENCELADUS UNLOCKED RELATIVISTIC ACCELERATION AT OUR FINGERTIPS: THE NEUTRON THRUSTER.'

/** Caption: Viroid reveal on Enceladus. */
export const MAP_INTRO_CAPTION_VIROIDS =
  'BUT IT WAS HOME TO SOMETHING ELSE. SILICATE CREATURES FROM INTERSTELLAR SPACE. TERRITORIAL AND LETHAL. WE CALL THEM VIROIDS.'

/** Caption: Jupiter raw materials / humanity spreading. */
export const MAP_INTRO_CAPTION_JUPITER_MATERIALS =
  "FROM THE NEUTRON, HUMANITY SPREAD TO THE OUTER SYSTEM. JUPITER'S MOONS PROVIDED THE RAW MATERIALS."

/** Caption: Jupiter cloud city assembly lines. */
export const MAP_INTRO_CAPTION_CLOUD_CITY =
  'ABOVE THE SURFACE, A CLOUD CITY 3D-PRINTED THE ASSEMBLY LINES.'

/** Caption: retired lander operator receives shuttle. */
export const MAP_INTRO_CAPTION_RETIRED_OPERATOR =
  'A RETIRED LANDER OPERATOR JUST RECEIVED A REFURBISHED SHUTTLE FROM THE SPACE PROGRAM.'

/**
 * Resolves the lower-third title line for a given eased intro progress value.
 *
 * @param easedProgress - Eased 0–1 timeline (same cubic ease as the intro camera).
 * @returns One of the six caption strings.
 *
 * @author guinetik
 * @date 2026-04-09
 */
export function mapIntroCaptionForEasedProgress(easedProgress: number): string {
  if (easedProgress < MAP_INTRO_BEAT_ENCELADUS) return MAP_INTRO_CAPTION_SOLAR_SYSTEM
  if (easedProgress < MAP_INTRO_BEAT_VIROIDS) return MAP_INTRO_CAPTION_ENCELADUS
  if (easedProgress < MAP_INTRO_BEAT_JUPITER) return MAP_INTRO_CAPTION_VIROIDS
  if (easedProgress < MAP_INTRO_BEAT_CLOUD_CITY) return MAP_INTRO_CAPTION_JUPITER_MATERIALS
  if (easedProgress < MAP_INTRO_BEAT_EARTH) return MAP_INTRO_CAPTION_CLOUD_CITY
  return MAP_INTRO_CAPTION_RETIRED_OPERATOR
}

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
  /** Lower-third title line during `cinematic_zoom`; empty otherwise. */
  cinematicCaption: string
}

/**
 * Tracks the map intro lifecycle from cinematic zoom to interactive play.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-startup-message-system-design.md
 */
/** Options for {@link MapIntroState.start}. */
export interface MapIntroStartOptions {
  /**
   * When true, the cinematic goes straight to `interactive` orbit instead of
   * `awaiting_message_open` (no centered “new message” gate before gameplay).
   */
  skipBlockingMessageAfterCinematic?: boolean
}

export class MapIntroState {
  /** Current intro phase. */
  phase: MapIntroPhase = 'inactive'

  /** Elapsed time inside the cinematic zoom. */
  private elapsed = 0

  /**
   * When set by {@link start}, the post-cinematic phase skips the blocking mail prompt.
   */
  private skipBlockingMessageAfterCinematic = false

  /**
   * Start the cinematic intro flow.
   *
   * @param options - When `skipBlockingMessageAfterCinematic` is true, orbit unlocks immediately
   * after the zoom with no “open message” step.
   */
  start(options?: MapIntroStartOptions): void {
    this.phase = 'cinematic_zoom'
    this.elapsed = 0
    this.skipBlockingMessageAfterCinematic = options?.skipBlockingMessageAfterCinematic ?? false
  }

  /** Skip the intro entirely when no startup message is active. */
  skip(): void {
    this.phase = 'interactive'
    this.elapsed = 0
    this.skipBlockingMessageAfterCinematic = false
  }

  /** Advance the cinematic timer. */
  tick(dt: number): void {
    if (this.phase !== 'cinematic_zoom') return

    this.elapsed += dt
    if (this.elapsed >= MAP_INTRO_CINEMATIC_DURATION) {
      if (this.skipBlockingMessageAfterCinematic) {
        this.phase = 'interactive'
        this.skipBlockingMessageAfterCinematic = false
      } else {
        this.phase = 'awaiting_message_open'
      }
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
    const cinematicCaption =
      this.phase === 'cinematic_zoom'
        ? mapIntroCaptionForEasedProgress(easeInOutCubic(this.cinematicProgress))
        : ''

    return {
      phase: this.phase,
      letterboxVisible: this.controlsLocked,
      messagePromptVisible: this.phase === 'awaiting_message_open',
      messageDialogVisible: this.phase === 'reading_message',
      controlsLocked: this.controlsLocked,
      cinematicCaption,
    }
  }
}
