import { describe, expect, it, vi } from 'vitest'
import { MapHabitatFacade, type MapHabitatFacadeDeps } from '../MapHabitatFacade'
import type { HabitatBackdropContext } from '@/three/HabitatBackdrop'
import { PLANETS, SUN } from '@/lib/planets/catalog'

function createBackdropContext(planetId: string): HabitatBackdropContext {
  const planet = PLANETS.find((entry) => entry.id === planetId) ?? PLANETS[0] ?? null
  return {
    sun: SUN,
    shipToSunDistance: 1000,
    planet,
    shipToPlanetDistance: 200,
  }
}

function buildDeps(getHabitatBackdropContext: () => HabitatBackdropContext | null): MapHabitatFacadeDeps {
  return {
    getSceneObjects: () => null,
    getVehicleCamera: () => null,
    getShuttleEffects: () => null,
    getShuttleController: () => null,
    getInspectMode: () => false,
    setInspectMode: vi.fn(),
    shuttleAudio: {
      notifyEnterHabitat: vi.fn(),
      notifyExitHabitat: vi.fn(),
    } as unknown as MapHabitatFacadeDeps['shuttleAudio'],
    modeCoordinator: {} as MapHabitatFacadeDeps['modeCoordinator'],
    armJourneyUiFromHabitatEntry: vi.fn(),
    isFirstHabitatEntry: () => true,
    setEarthStartupOrbitHudSuppressed: vi.fn(),
    notifyJourneyTrigger: vi.fn(),
    getUnlockedAchievementIds: () => [],
    getHabitatBackdropContext,
    getProfile: vi.fn() as unknown as MapHabitatFacadeDeps['getProfile'],
    setProfile: vi.fn(),
    getInventory: vi.fn() as unknown as MapHabitatFacadeDeps['getInventory'],
    setInventory: vi.fn(),
    evaluateAchievements: vi.fn(),
    callbacks: {
      onHabitatActive: vi.fn(),
      onShuttleControl: vi.fn(),
      onObservatory: vi.fn(),
      onHabitatPrompt: vi.fn(),
      onHatchExit: vi.fn(),
    },
  }
}

describe('MapHabitatFacade backdrop refresh', () => {
  it('refreshes backdrop context when ensureScene reuses an existing scene', async () => {
    const context = createBackdropContext('venus')
    const facade = new MapHabitatFacade()
    facade.attach(buildDeps(() => context))
    const setBackdropContext = vi.fn()
    const existingScene = {
      setBackdropContext,
    } as unknown as NonNullable<MapHabitatFacade['interiorScene']>
    ;(facade as unknown as { scene: NonNullable<MapHabitatFacade['interiorScene']> }).scene =
      existingScene

    const scene = await facade.ensureScene()

    expect(scene).toBe(existingScene)
    expect(setBackdropContext).toHaveBeenCalledTimes(1)
    expect(setBackdropContext).toHaveBeenCalledWith(context)
  })

  it('refreshes backdrop context on habitat entry for cached scenes', () => {
    const context = createBackdropContext('earth')
    const facade = new MapHabitatFacade()
    facade.attach(buildDeps(() => context))
    const setBackdropContext = vi.fn()
    ;(facade as unknown as { scene: { setBackdropContext: (ctx: HabitatBackdropContext | null) => void } }).scene =
      { setBackdropContext }

    facade.handleEnter()

    expect(setBackdropContext).toHaveBeenCalledTimes(1)
    expect(setBackdropContext).toHaveBeenCalledWith(context)
  })
})
