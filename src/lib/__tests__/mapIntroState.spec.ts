import { describe, expect, it } from 'vitest'
import {
  MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  MAP_INTRO_CAPTION_ENCELADUS,
  MAP_INTRO_CAPTION_VIROIDS,
  MAP_INTRO_CAPTION_JUPITER_MATERIALS,
  MAP_INTRO_CAPTION_CLOUD_CITY,
  MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  INTRO_DUR_ZOOM_ENCELADUS,
  INTRO_DUR_HOLD_ENCELADUS,
  INTRO_DUR_ZOOM_VIRUS,
  INTRO_DUR_HOLD_VIRUS,
  INTRO_DUR_ZOOM_JUPITER,
  INTRO_DUR_HOLD_JUPITER,
  INTRO_DUR_ZOOM_CITY,
  INTRO_DUR_HOLD_CITY,
  INTRO_DUR_ZOOM_SHUTTLE,
  INTRO_DUR_HOLD_SHUTTLE,
  INTRO_DUR_HANDOFF,
  MapIntroState,
  mapIntroCaptionForStep,
} from '../mapIntroState'

/** Tick through all cinematic steps until the cinematic phase ends. */
function fastForwardCinematic(state: MapIntroState): void {
  for (let i = 0; i < 20; i++) state.tick(10)
}

describe('MapIntroState', () => {
  it('starts inactive', () => {
    const state = new MapIntroState()

    expect(state.phase).toBe('inactive')
    expect(state.controlsLocked).toBe(false)
    expect(state.cinematicStep).toBeNull()
  })

  it('enters the cinematic zoom when started', () => {
    const state = new MapIntroState()

    state.start()

    expect(state.phase).toBe('cinematic_zoom')
    expect(state.controlsLocked).toBe(true)
    expect(state.uiState.letterboxVisible).toBe(true)
    expect(state.cinematicStep).toBe('zoom_enceladus')
  })

  it('advances through cinematic steps with fixed durations', () => {
    const state = new MapIntroState()
    state.start()

    expect(state.cinematicStep).toBe('zoom_enceladus')
    state.tick(INTRO_DUR_ZOOM_ENCELADUS)

    expect(state.cinematicStep).toBe('hold_enceladus')
    state.tick(INTRO_DUR_HOLD_ENCELADUS)

    expect(state.cinematicStep).toBe('zoom_virus')
    state.tick(INTRO_DUR_ZOOM_VIRUS)

    expect(state.cinematicStep).toBe('hold_virus')
    state.tick(INTRO_DUR_HOLD_VIRUS)

    expect(state.cinematicStep).toBe('zoom_jupiter')
    state.tick(INTRO_DUR_ZOOM_JUPITER)

    expect(state.cinematicStep).toBe('hold_jupiter')
    state.tick(INTRO_DUR_HOLD_JUPITER)

    expect(state.cinematicStep).toBe('zoom_city')
    state.tick(INTRO_DUR_ZOOM_CITY)

    expect(state.cinematicStep).toBe('hold_city')
    state.tick(INTRO_DUR_HOLD_CITY)

    expect(state.cinematicStep).toBe('zoom_shuttle')
    state.tick(INTRO_DUR_ZOOM_SHUTTLE)

    expect(state.cinematicStep).toBe('hold_shuttle')
    state.tick(INTRO_DUR_HOLD_SHUTTLE)

    expect(state.cinematicStep).toBe('handoff')
    state.tick(INTRO_DUR_HANDOFF)

    expect(state.phase).toBe('awaiting_message_open')
  })

  it('advances to interactive when skipBlockingMessageAfterCinematic is set', () => {
    const state = new MapIntroState()
    state.start({ skipBlockingMessageAfterCinematic: true })

    // Fast-forward through all steps (one tick per step)
    fastForwardCinematic(state)

    expect(state.phase).toBe('interactive')
    expect(state.controlsLocked).toBe(false)
  })

  it('opens the message only from the prompt phase', () => {
    const state = new MapIntroState()
    state.start()
    fastForwardCinematic(state)

    expect(state.openMessage()).toBe(true)
    expect(state.phase).toBe('reading_message')
    expect(state.uiState.messageDialogVisible).toBe(true)
  })

  it('completes into interactive only after the message is open', () => {
    const state = new MapIntroState()
    state.start()
    fastForwardCinematic(state)
    state.openMessage()

    expect(state.completeMessage()).toBe(true)
    expect(state.phase).toBe('interactive')
    expect(state.controlsLocked).toBe(false)
    expect(state.uiState.letterboxVisible).toBe(false)
  })

  it('can skip directly to interactive', () => {
    const state = new MapIntroState()

    state.skip()

    expect(state.phase).toBe('interactive')
    expect(state.controlsLocked).toBe(false)
  })

  it('returns correct captions for each step', () => {
    expect(mapIntroCaptionForStep('zoom_enceladus')).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)
    expect(mapIntroCaptionForStep('hold_enceladus')).toBe(MAP_INTRO_CAPTION_ENCELADUS)
    expect(mapIntroCaptionForStep('zoom_virus')).toBe(MAP_INTRO_CAPTION_ENCELADUS)
    expect(mapIntroCaptionForStep('hold_virus')).toBe(MAP_INTRO_CAPTION_VIROIDS)
    expect(mapIntroCaptionForStep('zoom_jupiter')).toBe(MAP_INTRO_CAPTION_VIROIDS)
    expect(mapIntroCaptionForStep('hold_jupiter')).toBe(MAP_INTRO_CAPTION_JUPITER_MATERIALS)
    expect(mapIntroCaptionForStep('zoom_city')).toBe(MAP_INTRO_CAPTION_JUPITER_MATERIALS)
    expect(mapIntroCaptionForStep('hold_city')).toBe(MAP_INTRO_CAPTION_CLOUD_CITY)
    expect(mapIntroCaptionForStep('zoom_shuttle')).toBe(MAP_INTRO_CAPTION_RETIRED_OPERATOR)
    expect(mapIntroCaptionForStep('hold_shuttle')).toBe(MAP_INTRO_CAPTION_RETIRED_OPERATOR)
    expect(mapIntroCaptionForStep('handoff')).toBe(MAP_INTRO_CAPTION_RETIRED_OPERATOR)
    expect(mapIntroCaptionForStep('done')).toBe('')
    expect(mapIntroCaptionForStep(null)).toBe('')
  })

  it('exposes step progress within 0-1 range', () => {
    const state = new MapIntroState()
    state.start()

    expect(state.cinematicStepProgress).toBe(0)

    state.tick(INTRO_DUR_ZOOM_ENCELADUS / 2)
    expect(state.cinematicStepProgress).toBeCloseTo(0.5, 1)
  })

  it('exposes the current cinematic caption on uiState during the zoom phase', () => {
    const state = new MapIntroState()

    state.start()

    expect(state.uiState.cinematicCaption).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)

    state.skip()

    expect(state.uiState.cinematicCaption).toBe('')
  })
})
