/**
 * Map intro flow state for the opening orbit cutscene.
 *
 * Uses a {@link StateMachine.fromSequence} to drive fixed-duration camera
 * steps (zoom / hold pairs). Each step has its own timer — no percentage-based
 * budgets, no easing-curve warping between steps.
 *
 * @author guinetik
 * @date 2026-04-09
 * @spec docs/superpowers/specs/2026-04-09-intro-cinematic-expansion-design.md
 */

import { StateMachine } from '@/lib/stateMachine'

// ---------------------------------------------------------------------------
// Cinematic step durations (seconds) — tune these freely
// ---------------------------------------------------------------------------

/** Hold on the full solar system so the player can read the opening subtitle. */
export const INTRO_DUR_HOLD_SOLAR_SYSTEM = 2.5

/** Zoom from wide solar system to Phobos. */
export const INTRO_DUR_ZOOM_PHOBOS = 3

/** Hold on Phobos — discovery caption. */
export const INTRO_DUR_HOLD_PHOBOS = 4

/** Slight zoom out to reveal virus. */
export const INTRO_DUR_ZOOM_VIRUS = 2

/** Hold on virus + Phobos. */
export const INTRO_DUR_HOLD_VIRUS = 4

/** Zoom from Phobos to the Earth-Moon system. */
export const INTRO_DUR_ZOOM_MOON = 3

/** Hold on Luna — human population + ship fabrication caption. */
export const INTRO_DUR_HOLD_MOON = 6

/** Zoom from Luna to Jupiter. */
export const INTRO_DUR_ZOOM_JUPITER = 3

/** Hold on Jupiter — outer-system expansion caption. */
export const INTRO_DUR_HOLD_JUPITER = 4

/** Zoom closer to Jupiter as city rises. */
export const INTRO_DUR_ZOOM_CITY = 2

/** Hold on cloud city. */
export const INTRO_DUR_HOLD_CITY = 4

/** Zoom from Jupiter to Saturn. */
export const INTRO_DUR_ZOOM_SATURN = 2.5

/** Hold on Saturn — elite / viroid stasis caption. */
export const INTRO_DUR_HOLD_SATURN = 4

/** Zoom from Jupiter to shuttle near Earth. */
export const INTRO_DUR_ZOOM_SHUTTLE = 3

/** Hold on shuttle — hero shot. */
export const INTRO_DUR_HOLD_SHUTTLE = 3

/** Hand off from intro camera to orbit camera. */
export const INTRO_DUR_HANDOFF = 2

// ---------------------------------------------------------------------------
// Cinematic step names
// ---------------------------------------------------------------------------

/** All possible cinematic step names. */
export type IntroCinematicStep =
  | 'hold_solar_system'
  | 'zoom_phobos'
  | 'hold_phobos'
  | 'zoom_virus'
  | 'hold_virus'
  | 'zoom_moon'
  | 'hold_moon'
  | 'zoom_jupiter'
  | 'hold_jupiter'
  | 'zoom_city'
  | 'hold_city'
  | 'zoom_saturn'
  | 'hold_saturn'
  | 'zoom_shuttle'
  | 'hold_shuttle'
  | 'handoff'
  | 'done'

/** Steps that are zoom (eased) transitions vs holds (linear). */
export const INTRO_ZOOM_STEPS: ReadonlySet<IntroCinematicStep> = new Set([
  'zoom_phobos',
  'zoom_virus',
  'zoom_moon',
  'zoom_jupiter',
  'zoom_city',
  'zoom_saturn',
  'zoom_shuttle',
  'handoff',
])

// ---------------------------------------------------------------------------
// Captions — keyed by step
// ---------------------------------------------------------------------------

/** Caption: wide solar system establishing shot. */
export const MAP_INTRO_CAPTION_SOLAR_SYSTEM = 'SOLAR SYSTEM, 2299 AD.'

/** Caption: Phobos neutron thruster discovery. */
export const MAP_INTRO_CAPTION_PHOBOS =
  'A DISCOVERY ON PHOBOS UNLOCKED RELATIVISTIC ACCELERATION AT OUR FINGERTIPS: THE NEUTRON THRUSTER.'

/** Caption: Viroid reveal on Phobos. */
export const MAP_INTRO_CAPTION_VIROIDS =
  'BUT THE MOON WAS ALSO HIDING SOMETHING IN STASIS: SILICATE CREATURES FROM INTERSTELLAR SPACE. TERRITORIAL. LETHAL.'

/** Caption: Luna population and near-Earth fabrication. */
export const MAP_INTRO_CAPTION_LUNA =
  'BACK ON EARTH, VIROIDS ASSIMILATE TERRAIN FASTER THAN WE CAN RECLAIM IT. MOST OF HUMANITY LIVES ON LUNA. TO SUPPORT THIS MIGRATION, MASS 3D PRINTING PROJECTS ASSEMBLED THOUSANDS OF NEAR-EARTH SHIPS LIKE THE SPACE SHUTTLE.'

/** Caption: Jupiter expansion beat. */
export const MAP_INTRO_CAPTION_JUPITER =
  "WITH LUNA AS ITS INDUSTRIAL BASE, HUMANITY PUSHED OUTWARD. JUPITER'S SYSTEM BECAME THE GATEWAY TO THE DEEPER SOLAR SYSTEM."

/** Caption: Jupiter cloud city assembly lines. */
export const MAP_INTRO_CAPTION_CLOUD_CITY =
  'USING THE MOONS RESOURCES, ABOVE JUPITER, CLOUD CITIES 3D-PRINTED THE SHIPS, HABITATS, AND INFRASTRUCTURE OF THE OUTER SYSTEM.'

/** Caption: Saturn elite / viroid stasis beat. */
export const MAP_INTRO_CAPTION_SATURN =
  'AT SATURN LIVE THE ELITE OF HUMANITY. BELOW THE FREEZING POINT OF VIROIDS, OUT HERE THEY CAN ONLY EXIST IN STASIS.'

/** Caption: retired lander operator receives shuttle. */
export const MAP_INTRO_CAPTION_RETIRED_OPERATOR =
  'A RETIRED LANDER OPERATOR JUST RECEIVED A REFURBISHED SHUTTLE FROM THE SPACE PROGRAM.'

/** Map from cinematic step to its caption text. */
const STEP_CAPTIONS: Record<IntroCinematicStep, string> = {
  hold_solar_system: MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  zoom_phobos: MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  hold_phobos: MAP_INTRO_CAPTION_PHOBOS,
  zoom_virus: MAP_INTRO_CAPTION_PHOBOS,
  hold_virus: MAP_INTRO_CAPTION_VIROIDS,
  zoom_moon: MAP_INTRO_CAPTION_VIROIDS,
  hold_moon: MAP_INTRO_CAPTION_LUNA,
  zoom_jupiter: MAP_INTRO_CAPTION_LUNA,
  hold_jupiter: MAP_INTRO_CAPTION_JUPITER,
  zoom_city: MAP_INTRO_CAPTION_JUPITER,
  hold_city: MAP_INTRO_CAPTION_CLOUD_CITY,
  zoom_saturn: MAP_INTRO_CAPTION_CLOUD_CITY,
  hold_saturn: MAP_INTRO_CAPTION_SATURN,
  zoom_shuttle: MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  hold_shuttle: MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  handoff: MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  done: '',
}

/**
 * Returns the caption for a given cinematic step.
 *
 * @param step - The current cinematic step name.
 * @returns The caption string, or empty for non-cinematic steps.
 *
 * @author guinetik
 * @date 2026-04-09
 */
export function mapIntroCaptionForStep(step: IntroCinematicStep | null): string {
  if (!step) return ''
  return STEP_CAPTIONS[step] ?? ''
}

// ---------------------------------------------------------------------------
// Outer intro flow phases (cinematic → message → interactive)
// ---------------------------------------------------------------------------

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

/** Options for {@link MapIntroState.start}. */
export interface MapIntroStartOptions {
  /**
   * When true, the cinematic goes straight to `interactive` orbit instead of
   * `awaiting_message_open` (no centered "new message" gate before gameplay).
   */
  skipBlockingMessageAfterCinematic?: boolean
}

/**
 * Tracks the map intro lifecycle from cinematic zoom to interactive play.
 *
 * The cinematic phase is driven by a {@link StateMachine} with fixed-duration
 * steps (zoom/hold pairs). Each step exposes its own 0→1 progress via
 * {@link cinematicStepProgress}. Zoom steps should be eased by the consumer;
 * hold steps are linear.
 *
 * @author guinetik
 * @date 2026-04-09
 * @spec docs/superpowers/specs/2026-04-09-intro-cinematic-expansion-design.md
 */
export class MapIntroState {
  /** Current intro phase. */
  phase: MapIntroPhase = 'inactive'

  /** The cinematic step sequence (created on {@link start}). */
  private cinematic: StateMachine<IntroCinematicStep> | null = null

  /** When set, the post-cinematic phase skips the blocking mail prompt. */
  private skipBlockingMessageAfterCinematic = false

  /**
   * Start the cinematic intro flow.
   *
   * @param options - When `skipBlockingMessageAfterCinematic` is true, orbit
   * unlocks immediately after the cinematic with no "open message" step.
   */
  start(options?: MapIntroStartOptions): void {
    this.phase = 'cinematic_zoom'
    this.skipBlockingMessageAfterCinematic = options?.skipBlockingMessageAfterCinematic ?? false
    this.cinematic = StateMachine.fromSequence<IntroCinematicStep>(
      [
        { name: 'hold_solar_system', duration: INTRO_DUR_HOLD_SOLAR_SYSTEM },
        { name: 'zoom_phobos', duration: INTRO_DUR_ZOOM_PHOBOS },
        { name: 'hold_phobos', duration: INTRO_DUR_HOLD_PHOBOS },
        { name: 'zoom_virus', duration: INTRO_DUR_ZOOM_VIRUS },
        { name: 'hold_virus', duration: INTRO_DUR_HOLD_VIRUS },
        { name: 'zoom_moon', duration: INTRO_DUR_ZOOM_MOON },
        { name: 'hold_moon', duration: INTRO_DUR_HOLD_MOON },
        { name: 'zoom_jupiter', duration: INTRO_DUR_ZOOM_JUPITER },
        { name: 'hold_jupiter', duration: INTRO_DUR_HOLD_JUPITER },
        { name: 'zoom_city', duration: INTRO_DUR_ZOOM_CITY },
        { name: 'hold_city', duration: INTRO_DUR_HOLD_CITY },
        { name: 'zoom_saturn', duration: INTRO_DUR_ZOOM_SATURN },
        { name: 'hold_saturn', duration: INTRO_DUR_HOLD_SATURN },
        { name: 'zoom_shuttle', duration: INTRO_DUR_ZOOM_SHUTTLE },
        { name: 'hold_shuttle', duration: INTRO_DUR_HOLD_SHUTTLE },
        { name: 'handoff', duration: INTRO_DUR_HANDOFF },
        { name: 'done' },
      ],
      {
        onComplete: () => {
          this.finishCinematic()
        },
      },
    )
  }

  /** Skip the intro entirely when no startup message is active. */
  skip(): void {
    this.phase = 'interactive'
    this.cinematic = null
    this.skipBlockingMessageAfterCinematic = false
  }

  /** Advance the cinematic timer. */
  tick(dt: number): void {
    if (this.phase !== 'cinematic_zoom' || !this.cinematic) return
    this.cinematic.tick(dt)

    // The 'done' state has no duration — finishCinematic fires via onComplete
    // of the last timed step. But also handle if we land in 'done' via auto-transition.
    if (this.cinematic.state === 'done') {
      this.finishCinematic()
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
    this.cinematic = null
    return true
  }

  /** The current cinematic step name, or null if not in cinematic phase. */
  get cinematicStep(): IntroCinematicStep | null {
    if (this.phase !== 'cinematic_zoom' || !this.cinematic) return null
    return this.cinematic.state
  }

  /** 0→1 progress within the current cinematic step. */
  get cinematicStepProgress(): number {
    if (!this.cinematic) return 0
    return this.cinematic.progress
  }

  /** Whether intro locking is still active. */
  get controlsLocked(): boolean {
    return this.phase !== 'inactive' && this.phase !== 'interactive'
  }

  /** Current UI snapshot for Vue. */
  get uiState(): MapIntroUiState {
    const cinematicCaption =
      this.phase === 'cinematic_zoom' ? mapIntroCaptionForStep(this.cinematicStep) : ''

    return {
      phase: this.phase,
      letterboxVisible: this.controlsLocked,
      messagePromptVisible: this.phase === 'awaiting_message_open',
      messageDialogVisible: this.phase === 'reading_message',
      controlsLocked: this.controlsLocked,
      cinematicCaption,
    }
  }

  /** Transition from cinematic to the post-cinematic phase. */
  private finishCinematic(): void {
    if (this.phase !== 'cinematic_zoom') return
    if (this.skipBlockingMessageAfterCinematic) {
      this.phase = 'interactive'
      this.skipBlockingMessageAfterCinematic = false
    } else {
      this.phase = 'awaiting_message_open'
    }
    this.cinematic = null
  }
}
