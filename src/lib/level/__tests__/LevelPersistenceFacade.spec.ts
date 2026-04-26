import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LevelPersistenceFacade } from '../LevelPersistenceFacade'

const itemDefinition = { label: 'Olivine' }
const inventory = { stacks: [], maxSlots: 8, maxWeightKg: 500 }
const updatedInventory = {
  stacks: [{ itemId: 'olivine', quantity: 2, totalWeightKg: 2 }],
  maxSlots: 8,
  maxWeightKg: 500,
}
const profile = {
  name: 'Pilot',
  credits: 1000,
  completedMissionCount: 0,
  visitedAsteroids: {},
  orbitedSolarBodies: {},
  lastDockedPlanetId: 'earth',
  hasSeenIntro: false,
  unlockedFastTravelPlanets: [],
  missionPayMultipliers: {},
  completedJourneyIds: [],
  journeyStepProgress: {},
  unlockedFeatureIds: [],
  announcedJourneyStartIds: [],
  journeyStartReadyIds: [],
}

vi.mock('@/lib/inventory/catalog', () => ({
  getItemDefinition: vi.fn(() => itemDefinition),
}))

vi.mock('@/lib/inventory/inventory', () => ({
  addItem: vi.fn(() => ({ ok: true, inventory: updatedInventory })),
}))

vi.mock('@/lib/inventory/inventoryStorage', () => ({
  loadInventory: vi.fn(() => inventory),
  saveInventory: vi.fn(),
}))

vi.mock('@/lib/player/profile', () => ({
  loadProfile: vi.fn(() => profile),
  saveProfile: vi.fn(),
}))

describe('LevelPersistenceFacade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists a successful inventory pickup', async () => {
    const { saveInventory } = await import('@/lib/inventory/inventoryStorage')
    const facade = new LevelPersistenceFacade()

    const result = facade.persistInventoryPickup('olivine', 2)

    expect(result).toEqual({ ok: true, label: 'Olivine', quantity: 2 })
    expect(saveInventory).toHaveBeenCalledWith(updatedInventory)
  })

  it('surfaces inventory failure reasons', async () => {
    const { addItem } = await import('@/lib/inventory/inventory')
    vi.mocked(addItem).mockReturnValueOnce({
      ok: false,
      inventory,
      reason: 'No available slots',
    })
    const facade = new LevelPersistenceFacade()

    const result = facade.persistInventoryPickup('olivine', 1)

    expect(result).toEqual({
      ok: false,
      label: 'Olivine',
      quantity: 1,
      reason: 'No available slots',
    })
  })

  it('writes lander hull hp only when it changed', async () => {
    const { saveProfile } = await import('@/lib/player/profile')
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
    const facade = new LevelPersistenceFacade()

    facade.flushLanderHullHp(42)

    expect(saveProfile).toHaveBeenCalledWith({ ...profile, landerHullHp: 42 })
    vi.unstubAllGlobals()
  })
})
