import { describe, it, expect } from 'vitest'
import type {
  YamadaBunkerProtectState,
  YamadaBunkerExtractState,
  YamadaPatientRescueState,
  YamadaMissionState,
} from '../yamadaArchetype'
import { stampYamadaState, pickSuspensionLapseSeconds } from '../yamadaArchetype'

describe('YamadaMissionState union', () => {
  it('discriminates by archetype', () => {
    const protect: YamadaBunkerProtectState = {
      archetype: 'bunker-protect',
      suspensionLapseSeconds: 360,
    }
    const extract: YamadaBunkerExtractState = {
      archetype: 'bunker-extract',
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 240,
      organItemId: 'yamada-organ-case',
    }
    const rescue: YamadaPatientRescueState = {
      archetype: 'patient-rescue',
      vipOperatorIndex: 0,
    }
    const states: YamadaMissionState[] = [protect, extract, rescue]
    expect(states.map((s) => s.archetype)).toEqual([
      'bunker-protect',
      'bunker-extract',
      'patient-rescue',
    ])
  })
})

describe('stampYamadaState', () => {
  it('returns undefined for non-Yamada archetype strings', () => {
    expect(stampYamadaState({ archetype: undefined, difficulty: 5 })).toBeUndefined()
    expect(stampYamadaState({ archetype: 'not-a-real-archetype', difficulty: 5 })).toBeUndefined()
  })

  it('stamps bunker-protect with a difficulty-derived timer', () => {
    const state = stampYamadaState({ archetype: 'bunker-protect', difficulty: 5 })
    expect(state).toEqual({
      archetype: 'bunker-protect',
      suspensionLapseSeconds: pickSuspensionLapseSeconds(5),
    })
  })

  it('stamps bunker-extract with destination + timer + organ id', () => {
    const state = stampYamadaState({
      archetype: 'bunker-extract',
      difficulty: 6,
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 300,
    })
    expect(state).toEqual({
      archetype: 'bunker-extract',
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 300,
      organItemId: 'yamada-organ-case',
    })
  })

  it('stamps patient-rescue with a random VIP index within range', () => {
    const state = stampYamadaState({
      archetype: 'patient-rescue',
      difficulty: 7,
      operatorCount: 4,
      rand: () => 0.75,
    })
    expect(state).toEqual({ archetype: 'patient-rescue', vipOperatorIndex: 3 })
  })
})

describe('pickSuspensionLapseSeconds', () => {
  it('returns 420 (7 min) at difficulty 4-6', () => {
    expect(pickSuspensionLapseSeconds(4)).toBe(420)
    expect(pickSuspensionLapseSeconds(6)).toBe(420)
  })

  it('returns 300 (5 min) at difficulty 7-9', () => {
    expect(pickSuspensionLapseSeconds(7)).toBe(300)
    expect(pickSuspensionLapseSeconds(9)).toBe(300)
  })
})

describe('YamadaBunkerExtractState.organDispensed', () => {
  it('defaults to undefined on a freshly stamped state', () => {
    const state = stampYamadaState({
      archetype: 'bunker-extract',
      difficulty: 5,
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 240,
    })
    expect(state).toBeDefined()
    expect(state?.archetype).toBe('bunker-extract')
    // Cast after asserting discriminator — organDispensed is optional and absent by default.
    const extract = state as YamadaBunkerExtractState
    expect(extract.organDispensed).toBeUndefined()
  })

  it('preserves an explicitly-set organDispensed flag in a literal state value', () => {
    const state = {
      archetype: 'bunker-extract' as const,
      destinationPlanetId: 'uranus',
      deliveryTimerSeconds: 240,
      organItemId: 'yamada-organ-case',
      organDispensed: true,
    }
    expect(state.organDispensed).toBe(true)
  })
})
