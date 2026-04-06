/**
 * Tests for slingshot launch release rules.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { describe, expect, it } from 'vitest'
import { canReleaseSlingshot } from '../slingshotLaunchPolicy'

describe('canReleaseSlingshot', () => {
  it('blocks release until charge is full', () => {
    expect(canReleaseSlingshot(0.99, false)).toBe(false)
  })

  it('allows release at full charge when the trajectory is clear', () => {
    expect(canReleaseSlingshot(1, false)).toBe(true)
  })

  it('blocks release when the trajectory is blocked', () => {
    expect(canReleaseSlingshot(1, true)).toBe(false)
  })
})
