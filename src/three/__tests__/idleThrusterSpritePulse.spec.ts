/**
 * Tests for rear-engine idle sprite pulse animation.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */
import { describe, expect, it } from 'vitest'
import { getIdleThrusterSpritePulse } from '../idleThrusterSpritePulse'

describe('getIdleThrusterSpritePulse', () => {
  it('starts at the brightest and largest pulse sample', () => {
    expect(getIdleThrusterSpritePulse(0)).toEqual({
      opacity: 0.5,
      scale: 1,
    })
  })

  it('falls to the minimum pulse halfway through the cycle', () => {
    expect(getIdleThrusterSpritePulse(0.125)).toEqual({
      opacity: 0.24,
      scale: 0.65,
    })
  })
})
