import { describe, expect, it, vi } from 'vitest'
import type { FpsTelemetry } from '@/lib/ui/fpsHudTypes'
import type { LanderTelemetry } from '@/lib/ui/landerHudTypes'
import { LevelTelemetryFacade } from '../LevelTelemetryFacade'

const landerTelemetry: LanderTelemetry = {
  altitude: 10,
  velocityY: -1,
  posX: 3,
  posZ: 4,
  fuelLevel: 80,
  fuelCapacity: 100,
  mainEngineCharge: 6,
  mainEngineCapacity: 10,
  rcsCharge: 4,
  rcsCapacity: 8,
  hp: 90,
  maxHp: 100,
  tiltAngle: 5,
  grounded: true,
  descentWarning: 'safe',
  attitudeWarning: 'safe',
  landingSafety: 'safe',
  surveyTimeRemaining: null,
  surveyProbesCollected: null,
  surveyProbesTotal: null,
  minigameProgressLabel: null,
  missionInstruction: null,
}

const fpsBaseTelemetry: Omit<FpsTelemetry, 'headingRad' | 'objectives' | 'rockTarget'> = {
  hp: 75,
  maxHp: 100,
  o2Level: 60,
  o2Capacity: 100,
  sprintCharge: 10,
  sprintCapacity: 20,
  speed: 6,
  grounded: true,
  activeMode: 'drill',
  aiming: false,
  isFiring: false,
  rtgLevel: 5,
  rtgCapacity: 10,
  modeCharge: 2,
  modeCapacity: 4,
}

describe('LevelTelemetryFacade', () => {
  it('emits state info every frame and throttles lander telemetry', () => {
    const facade = new LevelTelemetryFacade()
    const callbacks = {
      onStateInfo: vi.fn(),
      onLanderTelemetry: vi.fn(),
      onFpsTelemetry: vi.fn(),
      onPlayerPosition: vi.fn(),
    }

    facade.tick(callbacks, {
      dt: 0.01,
      state: 'lander',
      canExfil: true,
      canEnterLander: false,
      lander: { telemetry: landerTelemetry, x: 1, z: 2 },
      fps: null,
    })

    expect(callbacks.onStateInfo).toHaveBeenCalledTimes(1)
    expect(callbacks.onLanderTelemetry).toHaveBeenCalledTimes(1)
    expect(callbacks.onPlayerPosition).toHaveBeenCalledWith(1, 2)

    facade.tick(callbacks, {
      dt: 0.01,
      state: 'lander',
      canExfil: false,
      canEnterLander: false,
      lander: { telemetry: landerTelemetry, x: 5, z: 6 },
      fps: null,
    })

    expect(callbacks.onStateInfo).toHaveBeenCalledTimes(2)
    expect(callbacks.onLanderTelemetry).toHaveBeenCalledTimes(1)
  })

  it('can force immediate emission after resetThrottle', () => {
    const facade = new LevelTelemetryFacade()
    const callbacks = {
      onStateInfo: vi.fn(),
      onLanderTelemetry: vi.fn(),
      onFpsTelemetry: vi.fn(),
      onPlayerPosition: vi.fn(),
    }

    facade.tick(callbacks, {
      dt: 0.01,
      state: 'lander',
      canExfil: false,
      canEnterLander: false,
      lander: { telemetry: landerTelemetry, x: 1, z: 2 },
      fps: null,
    })
    facade.tick(callbacks, {
      dt: 0.01,
      state: 'lander',
      canExfil: false,
      canEnterLander: false,
      lander: { telemetry: landerTelemetry, x: 1, z: 2 },
      fps: null,
    })

    facade.resetThrottle()
    facade.tick(callbacks, {
      dt: 0.001,
      state: 'lander',
      canExfil: false,
      canEnterLander: false,
      lander: { telemetry: landerTelemetry, x: 7, z: 8 },
      fps: null,
    })

    expect(callbacks.onLanderTelemetry).toHaveBeenCalledTimes(2)
    expect(callbacks.onPlayerPosition).toHaveBeenLastCalledWith(7, 8)
  })

  it('builds fps telemetry objectives and forwards rock target', () => {
    const facade = new LevelTelemetryFacade()
    const callbacks = {
      onStateInfo: vi.fn(),
      onLanderTelemetry: vi.fn(),
      onFpsTelemetry: vi.fn(),
      onPlayerPosition: vi.fn(),
    }

    facade.tick(callbacks, {
      dt: 0.02,
      state: 'eva',
      canExfil: false,
      canEnterLander: true,
      lander: null,
      fps: {
        telemetry: fpsBaseTelemetry,
        headingRad: 0,
        x: 0,
        z: 0,
        missionObjectives: [{ type: 'gather', x: 10, z: 0, reward: 100 }],
        rockTarget: { label: 'Olivine', remainingKg: 12, totalKg: 30 },
      },
    })

    expect(callbacks.onFpsTelemetry).toHaveBeenCalledTimes(1)
    const payload = callbacks.onFpsTelemetry.mock.calls[0]?.[0]
    expect(payload.objectives).toHaveLength(1)
    expect(payload.objectives[0]).toMatchObject({
      id: 'obj-0',
      label: 'GATHER',
      type: 'gather',
    })
    expect(payload.rockTarget).toEqual({ label: 'Olivine', remainingKg: 12, totalKg: 30 })
    expect(callbacks.onPlayerPosition).toHaveBeenCalledWith(0, 0)
  })
})
