import { describe, expect, it } from 'vitest'
import {
  computeStationBriefingFadeState,
  computeStationStartupIntroState,
  type StationBriefingFadeTiming,
  type StationStartupIntroTiming,
} from '@/lib/station/stationStartupIntro'

const TIMING: StationStartupIntroTiming = {
  duration: 5,
  fadeInDuration: 2,
  walkDuration: 4,
}

const BRIEFING_FADE: StationBriefingFadeTiming = {
  duration: 5,
}

describe('computeStationStartupIntroState', () => {
  it('starts fully faded with letterbox and HUD visible', () => {
    const state = computeStationStartupIntroState(0, TIMING)

    expect(state.fadeOpacity).toBe(1)
    expect(state.walkProgress).toBe(0)
    expect(state.hudVisible).toBe(true)
    expect(state.letterboxVisible).toBe(true)
    expect(state.complete).toBe(false)
  })

  it('fades and walks by normalized progress', () => {
    const state = computeStationStartupIntroState(1, TIMING)

    expect(state.fadeOpacity).toBe(0.5)
    expect(state.walkProgress).toBeCloseTo(0.15625, 5)
  })

  it('finishes the walk and letterbox without clearing the briefing HUD', () => {
    const state = computeStationStartupIntroState(5, TIMING)

    expect(state.fadeOpacity).toBe(0)
    expect(state.walkProgress).toBe(1)
    expect(state.hudVisible).toBe(true)
    expect(state.letterboxVisible).toBe(false)
    expect(state.complete).toBe(true)
  })
})

describe('computeStationBriefingFadeState', () => {
  it('holds the briefing fully visible before movement starts', () => {
    const state = computeStationBriefingFadeState(null, BRIEFING_FADE)

    expect(state.opacity).toBe(1)
    expect(state.complete).toBe(false)
  })

  it('fades over five seconds once movement starts', () => {
    const state = computeStationBriefingFadeState(2.5, BRIEFING_FADE)

    expect(state.opacity).toBe(0.5)
    expect(state.complete).toBe(false)
  })

  it('marks the briefing complete after the fade duration', () => {
    const state = computeStationBriefingFadeState(5, BRIEFING_FADE)

    expect(state.opacity).toBe(0)
    expect(state.complete).toBe(true)
  })
})
