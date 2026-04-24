import { describe, it, expect } from 'vitest'
import type { ShuttleMissionBoard } from '../types'
import {
  createMissionBoard,
  offerMission,
  acceptMission,
  completeMission,
  deliverMission,
  tickMissionBoard,
  getActiveMissionsForPlanet,
  getDeliverableMissions,
  offerAsteroidMission,
  acceptAsteroidMission,
  beginAsteroidMission,
  tickAsteroidMissionBoard,
} from '../shuttleMissionSession'
import { generateAsteroidMission } from '../asteroidMissionGenerator'
import { createProfile } from '@/lib/player/profile'
import { createInventory } from '@/lib/inventory/inventory'
// Side-effect: register mission materials into item catalog
import '../missionMaterials'

/** Accept with an empty default hold (Earth pool missions fit this inventory). */
function acceptWithEmptyHold(board: ShuttleMissionBoard) {
  const r = acceptMission(board, createInventory())
  if (!r.ok) throw new Error(`acceptMission failed: ${r.reason ?? 'unknown'}`)
  return r.board
}

describe('createMissionBoard', () => {
  it('creates an empty mission board', () => {
    const board = createMissionBoard()
    expect(board.offeredMission).toBeNull()
    expect(board.offeringPlanet).toBeNull()
    expect(board.restockTimer).toBeNull()
    expect(board.activeMissions).toEqual([])
  })
})

describe('offerMission', () => {
  it('offers 1 mission from a planet pool', () => {
    const board = createMissionBoard()
    const updated = offerMission(board, 'earth')
    expect(updated.offeredMission).not.toBeNull()
    expect(updated.offeringPlanet).toBe('earth')
    expect(['earth_venus_gas_science', 'earth_mars_methane', 'earth_mercury_probe']).toContain(
      updated.offeredMission!.id,
    )
  })

  it('returns board unchanged for planet with no pool', () => {
    const board = createMissionBoard()
    const updated = offerMission(board, 'pluto')
    expect(updated.offeredMission).toBeNull()
  })

  it('filters missions by upgrade access — no heat means no Venus/Mercury targets', () => {
    const board = createMissionBoard()
    // Earth pool has targets: venus, mars, mercury — with no upgrades only mars is accessible
    const updated = offerMission(board, 'earth', {})
    expect(updated.offeredMission).not.toBeNull()
    expect(updated.offeredMission!.targetPlanet).toBe('mars')
  })

  it('with heat 1, Venus targets become available', () => {
    const board = createMissionBoard()
    const results = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const updated = offerMission(board, 'earth', { shuttleHeatResistance: 1 })
      if (updated.offeredMission) results.add(updated.offeredMission.targetPlanet)
    }
    expect(results.has('mars')).toBe(true)
    expect(results.has('venus')).toBe(true)
    expect(results.has('mercury')).toBe(false)
  })

  it('does not offer a mission if restock timer is active', () => {
    const board = createMissionBoard()
    const withOffer = offerMission(board, 'earth')
    const accepted = acceptWithEmptyHold(withOffer)
    const reoffered = offerMission(accepted, 'earth')
    expect(reoffered.offeredMission).toBeNull()
  })

  it('replaces a pending offer when docking mission computers at another planet', () => {
    let board = offerMission(createMissionBoard(), 'earth')
    expect(board.offeringPlanet).toBe('earth')
    board = offerMission(board, 'mars')
    expect(board.offeringPlanet).toBe('mars')
    expect(board.offeredMission).not.toBeNull()
  })
})

describe('acceptMission', () => {
  it('moves offered mission to active list', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const missionId = board.offeredMission!.id
    const { ok, board: updated } = acceptMission(board, createInventory())
    expect(ok).toBe(true)
    expect(updated.offeredMission).toBeNull()
    expect(updated.activeMissions).toHaveLength(1)
    expect(updated.activeMissions[0]!.template.id).toBe(missionId)
    expect(updated.activeMissions[0]!.giverPlanet).toBe('earth')
    expect(updated.activeMissions[0]!.status).toBe('active')
  })

  it('starts restock timer on accept', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const { ok, board: updated } = acceptMission(board, createInventory())
    expect(ok).toBe(true)
    expect(updated.restockTimer).not.toBeNull()
    expect(updated.restockTimer!.remaining).toBeGreaterThan(0)
  })

  it('returns unchanged board when no offered mission', () => {
    const board = createMissionBoard()
    const result = acceptMission(board, createInventory())
    expect(result.ok).toBe(false)
    expect(result.board.activeMissions).toHaveLength(0)
  })

  it('rejects when cargo cannot fit planned pickup quantity', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const inventory = { ...createInventory(), maxWeightKg: 0 }
    const result = acceptMission(board, inventory)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('cargo hold')
    expect(result.board.offeredMission).not.toBeNull()
  })
})

describe('completeMission', () => {
  it('adds gather items to inventory and sets status to ready-to-deliver', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()

    const result = completeMission(accepted, mission.template.id, inventory)
    expect(result.ok).toBe(true)
    expect(result.board.activeMissions[0]!.status).toBe('ready-to-deliver')
    expect(result.inventory.stacks.length).toBeGreaterThan(0)
  })

  it('fails when inventory cannot fit items', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const fullInventory = { ...inventory, maxWeightKg: 0 }

    const result = completeMission(accepted, mission.template.id, fullInventory)
    expect(result.ok).toBe(false)
    expect(result.reason).toBeDefined()
  })

  it('fails for unknown mission id', () => {
    const board = createMissionBoard()
    const inventory = createInventory()
    const result = completeMission(board, 'nonexistent', inventory)
    expect(result.ok).toBe(false)
  })
})

describe('deliverMission', () => {
  it('removes items, awards credits, and removes mission', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const profile = createProfile('Pilot')

    const completed = completeMission(accepted, mission.template.id, inventory)
    expect(completed.ok).toBe(true)

    const result = deliverMission(
      completed.board,
      mission.template.id,
      profile,
      completed.inventory,
    )
    expect(result.ok).toBe(true)
    expect(result.board.activeMissions).toHaveLength(0)
    expect(result.profile.credits).toBe(profile.credits + mission.template.reward)
    const materialStack = result.inventory.stacks.find((s) => s.quantity > 0)
    expect(materialStack).toBeUndefined()
  })

  it('fails if mission is not ready-to-deliver', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const profile = createProfile('Pilot')

    const result = deliverMission(accepted, mission.template.id, profile, inventory)
    expect(result.ok).toBe(false)
  })
})

describe('tickMissionBoard', () => {
  it('decrements restock timer', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const remaining = accepted.restockTimer!.remaining

    const ticked = tickMissionBoard(accepted, 10)
    expect(ticked.restockTimer!.remaining).toBeCloseTo(remaining - 10)
  })

  it('clears timer when it expires', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const remaining = accepted.restockTimer!.remaining

    const ticked = tickMissionBoard(accepted, remaining + 1)
    expect(ticked.restockTimer).toBeNull()
  })

  it('does nothing when no timer is active', () => {
    const board = createMissionBoard()
    const ticked = tickMissionBoard(board, 10)
    expect(ticked).toBe(board)
  })
})

describe('getActiveMissionsForPlanet', () => {
  it('returns missions targeting the given planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!

    const matches = getActiveMissionsForPlanet(accepted, mission.template.targetPlanet)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.template.id).toBe(mission.template.id)
  })

  it('returns empty array for unrelated planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const matches = getActiveMissionsForPlanet(accepted, 'pluto')
    expect(matches).toHaveLength(0)
  })
})

describe('getDeliverableMissions', () => {
  it('returns ready-to-deliver missions for the giver planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const completed = completeMission(accepted, mission.template.id, inventory)

    const deliverable = getDeliverableMissions(completed.board, 'earth')
    expect(deliverable).toHaveLength(1)
  })

  it('excludes active (not completed) missions', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptWithEmptyHold(board)
    const deliverable = getDeliverableMissions(accepted, 'earth')
    expect(deliverable).toHaveLength(0)
  })
})

describe('offerAsteroidMission', () => {
  it('sets the offered asteroid mission', () => {
    const board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    const updated = offerAsteroidMission(board, mission)
    expect(updated.offeredAsteroidMission).not.toBeNull()
    expect(updated.offeredAsteroidMission!.id).toBe(mission.id)
  })

  it('does not offer if restock timer is running', () => {
    let board = createMissionBoard()
    const mission1 = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission1)
    board = acceptAsteroidMission(board)
    const mission2 = generateAsteroidMission(1)
    const updated = offerAsteroidMission(board, mission2)
    expect(updated.offeredAsteroidMission).toBeNull()
  })

  it('replaces an offer pinned to a different host planet (no slot starvation)', () => {
    /*
     * Regression: Mercury's Cinderline contract used to "claim" the global asteroid
     * offer slot on first dock. Subsequent visits to Earth/Mars/Venus saw nothing
     * because the UI only renders the offer when `offeringAsteroidPlanet` matches
     * the docked planet. The pure helper must therefore allow a fresh draft for a
     * new host to overwrite the stale, off-planet one.
     */
    let board = createMissionBoard()
    const mercuryHostR = 1
    const mercuryMission = generateAsteroidMission(1, {
      planetId: 'mercury',
      worldX: mercuryHostR,
      worldZ: 0,
    })
    board = offerAsteroidMission(board, mercuryMission)
    expect(board.offeringAsteroidPlanet).toBe('mercury')

    const earthMission = generateAsteroidMission(1, {
      planetId: 'earth',
      worldX: 1,
      worldZ: 0,
    })
    const updated = offerAsteroidMission(board, earthMission)
    expect(updated.offeringAsteroidPlanet).toBe('earth')
    expect(updated.offeredAsteroidMission!.id).toBe(earthMission.id)
  })
})

describe('acceptAsteroidMission', () => {
  it('moves offered to active with accepted status', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    const updated = acceptAsteroidMission(board)
    expect(updated.offeredAsteroidMission).toBeNull()
    expect(updated.activeAsteroidMission).not.toBeNull()
    expect(updated.activeAsteroidMission!.status).toBe('accepted')
    expect(updated.asteroidRestockTimer).not.toBeNull()
  })
})

describe('beginAsteroidMission', () => {
  it('sets status to in-transit', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const updated = beginAsteroidMission(board)
    expect(updated.activeAsteroidMission!.status).toBe('in-transit')
  })
})

describe('tickAsteroidMissionBoard', () => {
  it('decrements asteroid restock timer', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const remaining = board.asteroidRestockTimer!.remaining
    const ticked = tickAsteroidMissionBoard(board, 10)
    expect(ticked.asteroidRestockTimer!.remaining).toBeCloseTo(remaining - 10)
  })

  it('clears timer when expired', () => {
    let board = createMissionBoard()
    const mission = generateAsteroidMission(1)
    board = offerAsteroidMission(board, mission)
    board = acceptAsteroidMission(board)
    const ticked = tickAsteroidMissionBoard(board, 999)
    expect(ticked.asteroidRestockTimer).toBeNull()
  })
})
