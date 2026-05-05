import { describe, it, expect } from 'vitest'
import { acceptEvaMission, createShuttleMissionBoard } from '../shuttleMissionSession'
import type { VisitRelayShuttleMissionTemplate } from '../types'

function template(
  id: string,
  poiType: 'satellite' | 'relay_antenna' | 'telescope',
  minigameType: string,
): VisitRelayShuttleMissionTemplate {
  return {
    id,
    name: id,
    description: '',
    poiType,
    minigameType,
    reward: 1500,
  }
}

function boardWithOffer(tmpl: VisitRelayShuttleMissionTemplate, planetId: string) {
  return {
    ...createShuttleMissionBoard(),
    offeredEvaMission: tmpl,
    offeringEvaPlanet: planetId,
  }
}

const WAYPOINT = { worldX: 100, worldZ: -50, poiLocalY: 12 }

describe('acceptEvaMission damage roll', () => {
  it('rolls brokenComponents for satellite_servicing missions', () => {
    const tmpl = template('earth_sat_1', 'satellite', 'satellite_servicing')
    const board = boardWithOffer(tmpl, 'earth')
    const result = acceptEvaMission(board, WAYPOINT)
    const [active] = result.activeEvaMissions
    expect(active!.brokenComponents).toBeDefined()
    expect(active!.brokenComponents!.length).toBeGreaterThanOrEqual(2)
  })

  it('produces the same brokenComponents for the same mission id', () => {
    const tmpl = template('jupiter_sat_42', 'satellite', 'satellite_servicing')
    const b1 = boardWithOffer(tmpl, 'jupiter')
    const b2 = boardWithOffer(tmpl, 'jupiter')
    const r1 = acceptEvaMission(b1, WAYPOINT)
    const r2 = acceptEvaMission(b2, WAYPOINT)
    expect(r1.activeEvaMissions[0]!.brokenComponents).toEqual(
      r2.activeEvaMissions[0]!.brokenComponents,
    )
  })

  it('picks more components for outer-planet (hard) missions than inner (easy)', () => {
    const earth = template('earth_sat_1', 'satellite', 'satellite_servicing')
    const neptune = template('neptune_sat_1', 'satellite', 'satellite_servicing')
    const e = acceptEvaMission(boardWithOffer(earth, 'earth'), WAYPOINT)
    const n = acceptEvaMission(boardWithOffer(neptune, 'neptune'), WAYPOINT)
    expect(e.activeEvaMissions[0]!.brokenComponents!.length).toBe(2)
    expect(n.activeEvaMissions[0]!.brokenComponents!.length).toBe(3)
  })

  it('does not roll damage for non-satellite_servicing minigames', () => {
    const tmpl = template('earth_relay_1', 'relay_antenna', 'relay_repair')
    const board = boardWithOffer(tmpl, 'earth')
    const result = acceptEvaMission(board, WAYPOINT)
    expect(result.activeEvaMissions[0]!.brokenComponents).toBeUndefined()
  })

  it('rolls a poi variant from the pool for satellite_servicing missions', () => {
    const tmpl = template('mars_servicing_1', 'satellite', 'satellite_servicing')
    const board = boardWithOffer(tmpl, 'mars')
    const result = acceptEvaMission(board, WAYPOINT)
    const active = result.activeEvaMissions[0]!
    expect(active.rolledPoiType).toBeDefined()
    expect(['satellite', 'relay_antenna', 'telescope']).toContain(active.rolledPoiType)
  })

  it('does not roll a poi variant for non-servicing minigames', () => {
    const tmpl = template('earth_relay_2', 'relay_antenna', 'relay_repair')
    const board = boardWithOffer(tmpl, 'earth')
    const result = acceptEvaMission(board, WAYPOINT)
    expect(result.activeEvaMissions[0]!.rolledPoiType).toBeUndefined()
  })
})
