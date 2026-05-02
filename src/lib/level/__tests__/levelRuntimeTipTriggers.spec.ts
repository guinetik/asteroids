import { describe, expect, it } from 'vitest'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'
import {
  LEVEL_TIP_GATHER_IDLE_SECONDS,
  shouldTriggerDrillWalkingTip,
  shouldTriggerGatherRocketScienceTip,
  shouldTriggerLanderHullRepairTip,
  shouldTriggerLanderWarningTip,
  shouldTriggerLowOxygenTip,
  shouldTriggerLowRtgTip,
} from '@/lib/level/levelRuntimeTipTriggers'

function fps(overrides: Partial<FpsTelemetry> = {}): FpsTelemetry {
  return {
    hp: 100,
    maxHp: 100,
    o2Level: 100,
    o2Capacity: 100,
    sprintCharge: 50,
    sprintCapacity: 50,
    speed: 0,
    grounded: true,
    activeMode: 'weapon',
    aiming: false,
    isFiring: false,
    rtgLevel: 240,
    rtgCapacity: 240,
    modeCharge: 20,
    modeCapacity: 20,
    headingRad: 0,
    objectives: [],
    ...overrides,
  }
}

function lander(overrides: Partial<LanderTelemetry> = {}): LanderTelemetry {
  return {
    altitude: 0,
    velocityY: 0,
    posX: 0,
    posZ: 0,
    fuelLevel: 100,
    fuelCapacity: 100,
    mainEngineCharge: 20,
    mainEngineCapacity: 20,
    rcsCharge: 10,
    rcsCapacity: 10,
    hp: 100,
    maxHp: 100,
    tiltAngle: 0,
    grounded: true,
    descentWarning: 'safe',
    attitudeWarning: 'safe',
    landingSafety: 'safe',
    surveyTimeRemaining: null,
    surveyProbesCollected: null,
    surveyProbesTotal: null,
    minigameProgressLabel: null,
    missionInstruction: null,
    ...overrides,
  }
}

describe('levelRuntimeTipTriggers', () => {
  it('triggers oxygen and RTG tips below half capacity', () => {
    expect(shouldTriggerLowOxygenTip(fps({ o2Level: 49 }))).toBe(true)
    expect(shouldTriggerLowRtgTip(fps({ rtgLevel: 119 }))).toBe(true)
  })

  it('does not trigger low resource tips at exactly half capacity', () => {
    expect(shouldTriggerLowOxygenTip(fps({ o2Level: 50 }))).toBe(false)
    expect(shouldTriggerLowRtgTip(fps({ rtgLevel: 120 }))).toBe(false)
  })

  it('triggers drill walking only when DRL is selected and the player is moving', () => {
    expect(shouldTriggerDrillWalkingTip(fps({ activeMode: 'drill', speed: 1 }))).toBe(true)
    expect(shouldTriggerDrillWalkingTip(fps({ activeMode: 'weapon', speed: 1 }))).toBe(false)
  })

  it('triggers the lander hull repair tip on hull loss', () => {
    expect(shouldTriggerLanderHullRepairTip(100, lander({ hp: 82 }))).toBe(true)
    expect(shouldTriggerLanderHullRepairTip(82, lander({ hp: 82 }))).toBe(false)
  })

  it('triggers lander warning tips only outside the safe band', () => {
    expect(shouldTriggerLanderWarningTip('warn')).toBe(true)
    expect(shouldTriggerLanderWarningTip('danger')).toBe(true)
    expect(shouldTriggerLanderWarningTip('safe')).toBe(false)
  })

  it('triggers the gather rocket tip after idle gather time with no mined rock', () => {
    expect(shouldTriggerGatherRocketScienceTip(LEVEL_TIP_GATHER_IDLE_SECONDS, false)).toBe(true)
    expect(shouldTriggerGatherRocketScienceTip(LEVEL_TIP_GATHER_IDLE_SECONDS, true)).toBe(false)
  })
})
