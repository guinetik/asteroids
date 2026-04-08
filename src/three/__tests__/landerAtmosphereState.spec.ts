import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { createAtmosphereContext } from '../atmosphere/AtmosphereContext'
import { applyLanderAtmosphereState } from '../atmosphere/landerAtmosphereState'

describe('applyLanderAtmosphereState', () => {
  it('uses support-based altitude so wash effects stay aligned on rough terrain', () => {
    const ctx = createAtmosphereContext(
      {
        sunAzimuth: 120,
        sunElevation: 40,
        sunColor: [1, 1, 1],
        sunIntensity: 3,
        ambientIntensity: 0.7,
      },
      {
        dustCoverage: 0.3,
        albedo: 0.5,
        biome: 'rocky',
        baseColor: [0.5, 0.48, 0.38],
      },
    )

    applyLanderAtmosphereState(ctx, {
      altitudeAboveGround: 2.5,
      isMainEngineActive: true,
      body: {
        velocityY: -1.25,
        grounded: false,
      },
      position: new Vector3(10, 100, -8),
    })

    expect(ctx.landerAltitude).toBe(2.5)
    expect(ctx.landerPosition.y - ctx.landerAltitude).toBe(97.5)
    expect(ctx.landerThrust).toBe(1)
    expect(ctx.landerVelocityY).toBe(-1.25)
    expect(ctx.landerGrounded).toBe(false)
  })
})
