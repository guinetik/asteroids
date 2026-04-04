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
  ])('template "%s" gather slots have valid params', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    const gatherSlots = t.objectiveSlots.filter((s) => s.params.type === 'gather')

    for (const slot of gatherSlots) {
      const params = slot.params as import('../types').GatherScalableParams
      expect(params.resourceAmount.min).toBeGreaterThan(0)
      expect(params.resourceAmount.min).toBeLessThanOrEqual(params.resourceAmount.max)
    }
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" exterminate slots have valid params', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    const extSlots = t.objectiveSlots.filter((s) => s.params.type === 'exterminate')

    for (const slot of extSlots) {
      const params = slot.params as import('../types').ExterminateScalableParams
      expect(params.nestCount.min).toBeGreaterThan(0)
      expect(params.nestCount.min).toBeLessThanOrEqual(params.nestCount.max)
      expect(params.swarmSize.min).toBeGreaterThan(0)
      expect(params.swarmSize.min).toBeLessThanOrEqual(params.swarmSize.max)
      expect(params.spitterChance).toBeGreaterThanOrEqual(0)
      expect(params.spitterChance).toBeLessThanOrEqual(1)
    }
  })

  it.each([
    ['mining_contract'],
    ['pest_control'],
    ['search_and_rescue'],
    ['hazard_cleanup'],
    ['colony_relief'],
  ])('template "%s" rescue slots have valid params', (id) => {
    const t = MISSION_TEMPLATES.find((t) => t.id === id)!
    const rescueSlots = t.objectiveSlots.filter((s) => s.params.type === 'rescue')

    for (const slot of rescueSlots) {
      const params = slot.params as import('../types').RescueScalableParams
      expect(params.colonistCount.min).toBeGreaterThan(0)
      expect(params.colonistCount.min).toBeLessThanOrEqual(params.colonistCount.max)
      expect(params.oxygenTime.min).toBeGreaterThan(params.oxygenTime.max)
      expect(params.guardedChance).toBeGreaterThanOrEqual(0)
      expect(params.guardedChance).toBeLessThanOrEqual(1)
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
