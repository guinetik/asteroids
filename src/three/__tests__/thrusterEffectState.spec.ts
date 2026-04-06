/**
 * Tests for shuttle thruster particle emission state decisions.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
import { describe, expect, it } from 'vitest'
import { resolveThrusterEffectState } from '../thrusterEffectState'

describe('resolveThrusterEffectState', () => {
  it('follows normal thrust and brake input when no launch fx is active', () => {
    expect(resolveThrusterEffectState(true, false, true, false)).toEqual({
      emitThrust: true,
      emitBrake: false,
      emitIdleThrust: false,
    })
    expect(resolveThrusterEffectState(false, true, true, false)).toEqual({
      emitThrust: false,
      emitBrake: true,
      emitIdleThrust: true,
    })
  })

  it('forces both engine and brake emitters on during slingshot launch fx', () => {
    expect(resolveThrusterEffectState(false, false, true, true)).toEqual({
      emitThrust: true,
      emitBrake: true,
      emitIdleThrust: false,
    })
  })

  it('keeps both emitters active during launch fx even if one input is already active', () => {
    expect(resolveThrusterEffectState(true, false, true, true)).toEqual({
      emitThrust: true,
      emitBrake: true,
      emitIdleThrust: false,
    })
  })

  it('emits a subtle rear idle plume whenever fuel is available and main thrust is not firing', () => {
    expect(resolveThrusterEffectState(false, false, true, false)).toEqual({
      emitThrust: false,
      emitBrake: false,
      emitIdleThrust: true,
    })
  })

  it('turns the idle rear plume off when fuel is gone', () => {
    expect(resolveThrusterEffectState(false, false, false, false)).toEqual({
      emitThrust: false,
      emitBrake: false,
      emitIdleThrust: false,
    })
  })
})
