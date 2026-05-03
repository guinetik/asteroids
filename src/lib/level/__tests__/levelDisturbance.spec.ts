/**
 * Tests for hidden level disturbance escalation.
 *
 * @author guinetik
 * @date 2026-05-02
 * @spec docs/superpowers/specs/2026-05-02-level-disturbance-system-design.md
 */
import { describe, expect, it } from 'vitest'
import {
  createLevelDisturbanceState,
  getLevelDisturbanceDifficultyFactor,
  recordLevelDisturbance,
  resetLevelDisturbance,
  tickLevelDisturbance,
} from '@/lib/level/levelDisturbance'

describe('levelDisturbance', () => {
  it('scales action gain by mission difficulty', () => {
    const easy = createLevelDisturbanceState({ missionDifficulty: 1 })
    const hard = createLevelDisturbanceState({ missionDifficulty: 10 })
    const belowRange = createLevelDisturbanceState({ missionDifficulty: -1 })
    const aboveRange = createLevelDisturbanceState({ missionDifficulty: 99 })

    recordLevelDisturbance(easy, { type: 'jump' })
    recordLevelDisturbance(hard, { type: 'jump' })

    expect(getLevelDisturbanceDifficultyFactor(1)).toBeCloseTo(0.75)
    expect(getLevelDisturbanceDifficultyFactor(10)).toBeCloseTo(1.25)
    expect(getLevelDisturbanceDifficultyFactor(Number.NaN)).toBeCloseTo(0.75)
    expect(belowRange.missionDifficulty).toBe(1)
    expect(belowRange.difficultyFactor).toBeCloseTo(0.75)
    expect(aboveRange.missionDifficulty).toBe(10)
    expect(aboveRange.difficultyFactor).toBeCloseTo(1.25)
    expect(hard.disturbance).toBeGreaterThan(easy.disturbance)
  })

  it('emits response events once as thresholds are crossed', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 5 })

    recordLevelDisturbance(state, { type: 'jump', amount: 11 })
    const first = tickLevelDisturbance(state, 0)
    const second = tickLevelDisturbance(state, 0)

    expect(first.map((event) => event.tier)).toEqual(['scout'])
    expect(first[0]?.enemyCount).toBe(1)
    expect(second).toEqual([])
  })

  it('can trigger repeated patrol reinforcements while disturbance remains high', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })
    const thresholdEvents = tickLevelDisturbance(state, 0)
    const earlyPatrol = tickLevelDisturbance(state, 1)
    const laterPatrol = tickLevelDisturbance(state, 8)

    expect(thresholdEvents[thresholdEvents.length - 1]?.tier).toBe('patrol')
    expect(earlyPatrol).toEqual([])
    expect(laterPatrol).toEqual([{ tier: 'patrol', enemyCount: 4, alert: 'VIROID SIGNAL CLOSING' }])
  })

  it('keeps patrol response count deterministic for hidden UI contract', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })

    expect(tickLevelDisturbance(state, 0).map((event) => event.enemyCount)).toEqual([
      1, 1, 2, 3, 4,
    ])
  })

  it('reset clears disturbance and response history', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 6 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })
    expect(tickLevelDisturbance(state, 0).length).toBeGreaterThan(0)
    expect(state.patrolCooldownRemaining).toBeGreaterThan(0)

    resetLevelDisturbance(state)
    recordLevelDisturbance(state, { type: 'jump', amount: 11 })

    expect(state.patrolCooldownRemaining).toBe(0)
    expect(state.disturbance).toBeGreaterThan(0)
    expect(tickLevelDisturbance(state, 0).map((event) => event.tier)).toEqual(['scout'])
  })

  it('ignores negative and non-finite custom amounts', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 5 })

    recordLevelDisturbance(state, { type: 'jump', amount: 10 })
    const initialDisturbance = state.disturbance

    recordLevelDisturbance(state, { type: 'jump', amount: -5 })
    recordLevelDisturbance(state, { type: 'jump', amount: Number.NaN })
    recordLevelDisturbance(state, { type: 'jump', amount: Number.POSITIVE_INFINITY })

    expect(state.disturbance).toBe(initialDisturbance)
  })

  it('clamps disturbance to the lower bound when recording', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 5 })
    state.disturbance = -10

    recordLevelDisturbance(state, { type: 'movement', amount: 0 })

    expect(state.disturbance).toBe(0)
  })

  it('ignores negative and non-finite delta time', () => {
    const state = createLevelDisturbanceState({ missionDifficulty: 10 })

    recordLevelDisturbance(state, { type: 'explosion', amount: 100 })
    tickLevelDisturbance(state, 0)
    const cooldown = state.patrolCooldownRemaining

    tickLevelDisturbance(state, -5)
    tickLevelDisturbance(state, Number.NaN)
    tickLevelDisturbance(state, Number.POSITIVE_INFINITY)

    expect(state.patrolCooldownRemaining).toBe(cooldown)
  })
})
