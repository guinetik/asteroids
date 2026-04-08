import { describe, expect, it } from 'vitest'
import {
  MAP_INTRO_CAPTION_LANDER_OPERATOR,
  MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  MAP_INTRO_CAPTION_SPACE_RACE,
  MAP_INTRO_CINEMATIC_DURATION,
  MAP_INTRO_CINEMATIC_HERO_HOLD_END,
  MAP_INTRO_CINEMATIC_HERO_HOLD_START,
  MapIntroState,
  mapIntroCaptionForEasedProgress,
} from '../mapIntroState'

describe('MapIntroState', () => {
  it('starts inactive', () => {
    const state = new MapIntroState()

    expect(state.phase).toBe('inactive')
    expect(state.controlsLocked).toBe(false)
    expect(state.cinematicProgress).toBe(0)
  })

  it('enters the cinematic zoom when started', () => {
    const state = new MapIntroState()

    state.start()

    expect(state.phase).toBe('cinematic_zoom')
    expect(state.controlsLocked).toBe(true)
    expect(state.uiState.letterboxVisible).toBe(true)
  })

  it('advances from cinematic zoom to awaiting message open after the full duration', () => {
    const state = new MapIntroState()

    state.start()
    state.tick(MAP_INTRO_CINEMATIC_DURATION)

    expect(state.phase).toBe('awaiting_message_open')
    expect(state.uiState.messagePromptVisible).toBe(true)
    expect(state.cinematicProgress).toBe(1)
  })

  it('advances from cinematic zoom to interactive when skipBlockingMessageAfterCinematic is set', () => {
    const state = new MapIntroState()

    state.start({ skipBlockingMessageAfterCinematic: true })
    state.tick(MAP_INTRO_CINEMATIC_DURATION)

    expect(state.phase).toBe('interactive')
    expect(state.uiState.messagePromptVisible).toBe(false)
    expect(state.controlsLocked).toBe(false)
  })

  it('opens the message only from the prompt phase', () => {
    const state = new MapIntroState()

    state.start()
    state.tick(MAP_INTRO_CINEMATIC_DURATION)

    expect(state.openMessage()).toBe(true)
    expect(state.phase).toBe('reading_message')
    expect(state.uiState.messageDialogVisible).toBe(true)
  })

  it('completes into interactive only after the message is open', () => {
    const state = new MapIntroState()

    state.start()
    state.tick(MAP_INTRO_CINEMATIC_DURATION)
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

  it('shows the three cinematic captions in order by eased progress', () => {
    expect(mapIntroCaptionForEasedProgress(0)).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_CINEMATIC_HERO_HOLD_START - 0.01)).toBe(
      MAP_INTRO_CAPTION_SOLAR_SYSTEM,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_CINEMATIC_HERO_HOLD_START)).toBe(
      MAP_INTRO_CAPTION_SPACE_RACE,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_CINEMATIC_HERO_HOLD_END - 0.01)).toBe(
      MAP_INTRO_CAPTION_SPACE_RACE,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_CINEMATIC_HERO_HOLD_END)).toBe(
      MAP_INTRO_CAPTION_LANDER_OPERATOR,
    )
    expect(mapIntroCaptionForEasedProgress(1)).toBe(MAP_INTRO_CAPTION_LANDER_OPERATOR)
  })

  it('exposes the current cinematic caption on uiState during the zoom phase', () => {
    const state = new MapIntroState()

    state.start()

    expect(state.uiState.cinematicCaption).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)

    state.skip()

    expect(state.uiState.cinematicCaption).toBe('')
  })
})
