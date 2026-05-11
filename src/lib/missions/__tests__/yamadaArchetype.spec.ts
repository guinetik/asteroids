import { describe, it, expect } from 'vitest'
import type {
  YamadaBunkerProtectState,
  YamadaBunkerExtractState,
  YamadaPatientRescueState,
  YamadaMissionState,
} from '../yamadaArchetype'

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
