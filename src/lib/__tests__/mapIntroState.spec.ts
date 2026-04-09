import { describe, expect, it } from 'vitest'
import {
  MAP_INTRO_CAPTION_SOLAR_SYSTEM,
  MAP_INTRO_CAPTION_ENCELADUS,
  MAP_INTRO_CAPTION_VIROIDS,
  MAP_INTRO_CAPTION_JUPITER_MATERIALS,
  MAP_INTRO_CAPTION_CLOUD_CITY,
  MAP_INTRO_CAPTION_RETIRED_OPERATOR,
  MAP_INTRO_CINEMATIC_DURATION,
  MAP_INTRO_BEAT_ENCELADUS,
  MAP_INTRO_BEAT_VIROIDS,
  MAP_INTRO_BEAT_JUPITER,
  MAP_INTRO_BEAT_CLOUD_CITY,
  MAP_INTRO_BEAT_EARTH,
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

  it('shows the six cinematic captions in order by eased progress', () => {
    // Beat 1: Solar system (0 to BEAT_ENCELADUS)
    expect(mapIntroCaptionForEasedProgress(0)).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_ENCELADUS - 0.01)).toBe(
      MAP_INTRO_CAPTION_SOLAR_SYSTEM,
    )

    // Beat 2: Enceladus discovery
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_ENCELADUS)).toBe(
      MAP_INTRO_CAPTION_ENCELADUS,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_VIROIDS - 0.01)).toBe(
      MAP_INTRO_CAPTION_ENCELADUS,
    )

    // Beat 3: Viroid reveal
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_VIROIDS)).toBe(
      MAP_INTRO_CAPTION_VIROIDS,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_JUPITER - 0.01)).toBe(
      MAP_INTRO_CAPTION_VIROIDS,
    )

    // Beat 4a: Jupiter materials
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_JUPITER)).toBe(
      MAP_INTRO_CAPTION_JUPITER_MATERIALS,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_CLOUD_CITY - 0.01)).toBe(
      MAP_INTRO_CAPTION_JUPITER_MATERIALS,
    )

    // Beat 4b: Cloud city
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_CLOUD_CITY)).toBe(
      MAP_INTRO_CAPTION_CLOUD_CITY,
    )
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_EARTH - 0.01)).toBe(
      MAP_INTRO_CAPTION_CLOUD_CITY,
    )

    // Beat 5: Retired operator
    expect(mapIntroCaptionForEasedProgress(MAP_INTRO_BEAT_EARTH)).toBe(
      MAP_INTRO_CAPTION_RETIRED_OPERATOR,
    )
    expect(mapIntroCaptionForEasedProgress(1)).toBe(MAP_INTRO_CAPTION_RETIRED_OPERATOR)
  })

  it('exposes the current cinematic caption on uiState during the zoom phase', () => {
    const state = new MapIntroState()

    state.start()

    expect(state.uiState.cinematicCaption).toBe(MAP_INTRO_CAPTION_SOLAR_SYSTEM)

    state.skip()

    expect(state.uiState.cinematicCaption).toBe('')
  })
})
