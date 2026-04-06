import { describe, expect, it } from 'vitest'
import { MAP_INTRO_CINEMATIC_DURATION, MapIntroState } from '../mapIntroState'

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
})
