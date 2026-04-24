import { describe, expect, it } from 'vitest'
import {
  computeDeathPresentationState,
  computeHypoxiaFadeOpacity,
  computeKnockbackAwayFromSource,
  computeNonLethalFallDamage,
  computeRelativeDamageAngle,
  stepDamageFlash,
} from '../fpsPresentation'

describe('fpsPresentation', () => {
  it('computes knockback away from a damage source', () => {
    expect(computeKnockbackAwayFromSource(10, 0, 0, 0, 12)).toEqual({ x: 12, z: 0 })
  })

  it('computes a relative damage angle from player/camera state', () => {
    expect(computeRelativeDamageAngle(0, 0, 0, 10, 0)).toBeCloseTo(0)
  })

  it('steps damage flash toward zero opacity', () => {
    expect(stepDamageFlash(0.3, 0.1, 0.3)).toEqual({
      timer: 0.19999999999999998,
      opacity: 0.6666666666666666,
    })
  })

  it('returns zero hypoxia fade when oxygen is available', () => {
    expect(computeHypoxiaFadeOpacity(10, 50, 100, 1)).toBe(0)
  })

  it('computes death fade/message timing and pitch movement', () => {
    expect(computeDeathPresentationState(0, 0.5, 1.6, 1.2, -1.4, 2, 1.5)).toEqual({
      pitch: -0.6,
      fadeOpacity: 0.8,
      showMessage: true,
    })
  })

  it('keeps fall damage non-lethal', () => {
    expect(
      computeNonLethalFallDamage(100, 10, {
        safeSpeed: 28,
        damagePerUnit: 0.55,
        maxDamage: 22,
        minHpAfter: 5,
      }),
    ).toBe(5)
  })
})
