import { describe, it, expect, beforeEach } from 'vitest'
import { MapOverlayProjector, type MapOverlayTuning } from '../MapOverlayProjector'
import type { MapCamera } from '@/three/MapCamera'
import type { GravityConfig } from '@/lib/physics/gravity'

const tuning: MapOverlayTuning = {
  worldLineSampleDistance: 10,
  nearestBodyCount: 3,
  influenceMassThreshold: 0.01,
}

/** Stub MapCamera.projectToScreen — returns (x/1000, z/1000) so outputs are stable + readable in %. */
function stubCamera(): MapCamera {
  return {
    projectToScreen(worldPos: { x: number; z: number }): { x: number; y: number } {
      return { x: worldPos.x / 1000, y: worldPos.z / 1000 }
    },
  } as unknown as MapCamera
}

const gravityConfig: GravityConfig = {
  gravityConstant: 500000,
  minDistance: 15,
  influenceScale: 400,
  eventHorizonScale: 230,
}

function baseBuildInput(
  overrides: Partial<Parameters<MapOverlayProjector['buildOverlayState']>[0]> = {},
) {
  return {
    mapCamera: stubCamera(),
    shipX: 0,
    shipZ: 0,
    heading: 0,
    speed: 0,
    shipDead: false,
    sunController: null,
    planetControllers: [],
    shipHealthConfig: null,
    activeAsteroidMission: null,
    gravityConfig,
    overlayData: tuning,
    ...overrides,
  }
}

describe('MapOverlayProjector.recordWorldLinePoint', () => {
  let proj: MapOverlayProjector

  beforeEach(() => {
    proj = new MapOverlayProjector()
  })

  it('records the first free-flight sample', () => {
    expect(
      proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: false }, 10),
    ).toBe(0)
    expect(proj.worldLineLength).toBe(1)
  })

  it('skips recording while orbiting', () => {
    expect(
      proj.recordWorldLinePoint(
        { orbitState: 'orbiting', shipX: 100, shipZ: 0, shipDead: false },
        10,
      ),
    ).toBe(0)
    expect(proj.worldLineLength).toBe(0)
  })

  it('skips recording while dead', () => {
    expect(
      proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: true }, 10),
    ).toBe(0)
    expect(proj.worldLineLength).toBe(0)
  })

  it('coalesces samples until the ship has moved min-distance', () => {
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 0, shipZ: 0, shipDead: false }, 10)
    expect(
      proj.recordWorldLinePoint({ orbitState: 'free', shipX: 5, shipZ: 0, shipDead: false }, 10),
    ).toBe(0)
    expect(proj.worldLineLength).toBe(1)
    expect(
      proj.recordWorldLinePoint({ orbitState: 'free', shipX: 20, shipZ: 0, shipDead: false }, 10),
    ).toBe(20)
    expect(proj.worldLineLength).toBe(2)
  })
})

describe('MapOverlayProjector.reset', () => {
  it('empties history and seeds with current ship position', () => {
    const proj = new MapOverlayProjector()
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: false }, 10)
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 200, shipZ: 0, shipDead: false }, 10)
    expect(proj.worldLineLength).toBe(2)
    proj.reset({ orbitState: 'free', shipX: 500, shipZ: 0, shipDead: false }, 10)
    expect(proj.worldLineLength).toBe(1)
  })

  it('leaves history empty when reset happens while dead (no seed)', () => {
    const proj = new MapOverlayProjector()
    proj.reset({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: true }, 10)
    expect(proj.worldLineLength).toBe(0)
  })
})

describe('MapOverlayProjector.buildOverlayState', () => {
  it('returns a visible state with shipScreen + heading projected correctly', () => {
    const proj = new MapOverlayProjector()
    const state = proj.buildOverlayState(
      baseBuildInput({ shipX: 500, shipZ: 0, heading: 0, speed: 12 }),
    )
    expect(state).not.toBeNull()
    expect(state!.visible).toBe(true)
    expect(state!.speed).toBe(12)
    // Stub camera: 500/1000 → 0.5 → 50%.
    expect(state!.shipX).toBeCloseTo(50, 5)
    // heading 0 → rotate(90deg) per CSS conversion comment in projector.
    expect(state!.headingDeg).toBeCloseTo(90, 5)
  })

  it('omits thermal zones when shipHealthConfig is null', () => {
    const proj = new MapOverlayProjector()
    const state = proj.buildOverlayState(baseBuildInput())
    expect(state!.thermalZones).toEqual([])
  })

  it('omits the mission waypoint when no active asteroid mission is set', () => {
    const proj = new MapOverlayProjector()
    const state = proj.buildOverlayState(baseBuildInput())
    expect(state!.missionWaypoint).toBeNull()
  })

  it('includes trajectory projection with the current ship point appended', () => {
    const proj = new MapOverlayProjector()
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: false }, 10)
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 200, shipZ: 0, shipDead: false }, 10)
    const state = proj.buildOverlayState(baseBuildInput({ shipX: 300, shipZ: 0 }))
    // history (2) + current point = 3 trajectory samples.
    expect(state!.trajectoryPoints).toHaveLength(3)
  })

  it('omits trajectory entirely while the shuttle is dead', () => {
    const proj = new MapOverlayProjector()
    proj.recordWorldLinePoint({ orbitState: 'free', shipX: 100, shipZ: 0, shipDead: false }, 10)
    const state = proj.buildOverlayState(baseBuildInput({ shipDead: true }))
    expect(state!.trajectoryPoints).toEqual([])
  })
})
