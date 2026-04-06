import { describe, it, expect } from 'vitest'
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

  it('does not offer a mission if restock timer is active', () => {
    const board = createMissionBoard()
    const withOffer = offerMission(board, 'earth')
    const accepted = acceptMission(withOffer)
    const reoffered = offerMission(accepted, 'earth')
    expect(reoffered.offeredMission).toBeNull()
  })
})

describe('acceptMission', () => {
  it('moves offered mission to active list', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const missionId = board.offeredMission!.id
    const updated = acceptMission(board)
    expect(updated.offeredMission).toBeNull()
    expect(updated.activeMissions).toHaveLength(1)
    expect(updated.activeMissions[0]!.template.id).toBe(missionId)
    expect(updated.activeMissions[0]!.giverPlanet).toBe('earth')
    expect(updated.activeMissions[0]!.status).toBe('active')
  })

  it('starts restock timer on accept', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const updated = acceptMission(board)
    expect(updated.restockTimer).not.toBeNull()
    expect(updated.restockTimer!.remaining).toBeGreaterThan(0)
  })

  it('returns board unchanged if no offered mission', () => {
    const board = createMissionBoard()
    const updated = acceptMission(board)
    expect(updated.activeMissions).toHaveLength(0)
  })
})

describe('completeMission', () => {
  it('adds gather items to inventory and sets status to ready-to-deliver', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()

    const result = completeMission(accepted, mission.template.id, inventory)
    expect(result.ok).toBe(true)
    expect(result.board.activeMissions[0]!.status).toBe('ready-to-deliver')
    expect(result.inventory.stacks.length).toBeGreaterThan(0)
  })

  it('fails when inventory cannot fit items', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
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
    const accepted = acceptMission(board)
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
    const accepted = acceptMission(board)
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
    const accepted = acceptMission(board)
    const remaining = accepted.restockTimer!.remaining

    const ticked = tickMissionBoard(accepted, 10)
    expect(ticked.restockTimer!.remaining).toBeCloseTo(remaining - 10)
  })

  it('clears timer when it expires', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
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
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!

    const matches = getActiveMissionsForPlanet(accepted, mission.template.targetPlanet)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.template.id).toBe(mission.template.id)
  })

  it('returns empty array for unrelated planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const matches = getActiveMissionsForPlanet(accepted, 'pluto')
    expect(matches).toHaveLength(0)
  })
})

describe('getDeliverableMissions', () => {
  it('returns ready-to-deliver missions for the giver planet', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
    const mission = accepted.activeMissions[0]!
    const inventory = createInventory()
    const completed = completeMission(accepted, mission.template.id, inventory)

    const deliverable = getDeliverableMissions(completed.board, 'earth')
    expect(deliverable).toHaveLength(1)
  })

  it('excludes active (not completed) missions', () => {
    const board = offerMission(createMissionBoard(), 'earth')
    const accepted = acceptMission(board)
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
