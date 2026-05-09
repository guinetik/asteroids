/**
 * Validates the observatory targets manifest. Catches drift between the
 * JSON content and the {@link ObservatoryTarget} contract.
 *
 * @author guinetik
 * @date 2026-05-09
 * @spec docs/superpowers/specs/2026-05-09-habitat-observatory-design.md
 */

import { describe, expect, it } from 'vitest'
import type { ObservatoryTarget } from '@/lib/observatory/types'
import targets from '@/data/observatory/targets.json'

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const RA_PATTERN = /^\d{1,2}\s\d{1,2}\s\d{1,2}(\.\d+)?$/
const DEC_PATTERN = /^[+-]?\d{1,2}\s\d{1,2}\s\d{1,2}(\.\d+)?$/

describe('observatory/targets.json', () => {
  const list = targets as readonly ObservatoryTarget[]

  it('has exactly 5 targets', () => {
    expect(list).toHaveLength(5)
  })

  it('every target has all required fields', () => {
    for (const t of list) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(typeof t.ra).toBe('string')
      expect(typeof t.dec).toBe('string')
      expect(typeof t.fovDeg).toBe('number')
      expect(typeof t.survey).toBe('string')
      expect(typeof t.blurb).toBe('string')
      expect(t.label.length).toBeGreaterThan(0)
      expect(t.survey.length).toBeGreaterThan(0)
      expect(t.blurb.length).toBeGreaterThan(0)
    }
  })

  it('ids are unique and kebab-case', () => {
    const ids = list.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      expect(id).toMatch(ID_PATTERN)
    }
  })

  it('fovDeg is in (0, 60]', () => {
    for (const t of list) {
      expect(t.fovDeg).toBeGreaterThan(0)
      expect(t.fovDeg).toBeLessThanOrEqual(60)
    }
  })

  it('ra parses as sexagesimal (hh mm ss)', () => {
    for (const t of list) expect(t.ra).toMatch(RA_PATTERN)
  })

  it('dec parses as sexagesimal with sign (±dd mm ss)', () => {
    for (const t of list) expect(t.dec).toMatch(DEC_PATTERN)
  })
})
