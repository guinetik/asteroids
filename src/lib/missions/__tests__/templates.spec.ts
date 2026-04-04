import { describe, it, expect } from 'vitest'
import { MISSION_TEMPLATES, getTemplateById, getTemplatesForDifficulty } from '../templates'

const VALID_TYPES = new Set(['gather', 'exterminate', 'rescue'])
const DIFFICULTY_MIN = 1
const DIFFICULTY_MAX = 10

describe('MISSION_TEMPLATES', () => {
  it('contains exactly 5 templates', () => {
    expect(MISSION_TEMPLATES).toHaveLength(5)
  })

  it('has unique IDs', () => {
    const ids = MISSION_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has required string fields', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)
    expect(t).toBeDefined()
    expect(t!.name).toBeTruthy()
    expect(t!.description).toBeTruthy()
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid difficulty range', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.minDifficulty).toBeGreaterThanOrEqual(DIFFICULTY_MIN)
    expect(t.maxDifficulty).toBeLessThanOrEqual(DIFFICULTY_MAX)
    expect(t.minDifficulty).toBeLessThanOrEqual(t.maxDifficulty)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid completion bonus', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.completionBonus.min).toBeGreaterThan(0)
    expect(t.completionBonus.min).toBeLessThanOrEqual(t.completionBonus.max)
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid objective slots', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    expect(t.objectiveSlots.length).toBeGreaterThan(0)

    for (const slot of t.objectiveSlots) {
      expect(VALID_TYPES.has(slot.type)).toBe(true)
      expect(slot.weight).toBeGreaterThan(0)
      expect(slot.reward.min).toBeGreaterThan(0)
      expect(slot.reward.min).toBeLessThanOrEqual(slot.reward.max)
      expect(slot.params.type).toBe(slot.type)
    }
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" has valid scalable params', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!

    for (const slot of t.objectiveSlots) {
      if (slot.params.type === 'gather') {
        expect(slot.params.resourceAmount.min).toBeGreaterThan(0)
        expect(slot.params.resourceAmount.min).toBeLessThanOrEqual(
          slot.params.resourceAmount.max,
        )
      } else if (slot.params.type === 'exterminate') {
        expect(slot.params.nestCount.min).toBeGreaterThan(0)
        expect(slot.params.nestCount.min).toBeLessThanOrEqual(slot.params.nestCount.max)
        expect(slot.params.swarmSize.min).toBeGreaterThan(0)
        expect(slot.params.swarmSize.min).toBeLessThanOrEqual(slot.params.swarmSize.max)
        expect(slot.params.spitterChance).toBeGreaterThanOrEqual(0)
        expect(slot.params.spitterChance).toBeLessThanOrEqual(1)
      } else if (slot.params.type === 'rescue') {
        expect(slot.params.colonistCount.min).toBeGreaterThan(0)
        expect(slot.params.colonistCount.min).toBeLessThanOrEqual(
          slot.params.colonistCount.max,
        )
        expect(slot.params.oxygenTime.min).toBeGreaterThan(slot.params.oxygenTime.max)
        expect(slot.params.guardedChance).toBeGreaterThanOrEqual(0)
        expect(slot.params.guardedChance).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('getTemplateById', () => {
  it('returns the correct template for a known ID', () => {
    const t = getTemplateById('mining_contract')
    expect(t).toBeDefined()
    expect(t!.name).toBe('Mining Contract')
  })

  it('returns undefined for an unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined()
  })
})

describe('getTemplatesForDifficulty', () => {
  it('returns only mining_contract at difficulty 1', () => {
    const templates = getTemplatesForDifficulty(1)
    expect(templates).toHaveLength(1)
    expect(templates[0]!.id).toBe('mining_contract')
  })

  it('returns all 5 templates at difficulty 5', () => {
    const templates = getTemplatesForDifficulty(5)
    expect(templates).toHaveLength(5)
  })

  it('returns all templates at difficulty 10', () => {
    const templates = getTemplatesForDifficulty(10)
    expect(templates).toHaveLength(5)
  })
})
