/**
 * Focused runtime coverage for nearby asteroid tumble integration in the belt controller.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-nearby-asteroid-tumble-design.md
 */
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AsteroidBelt } from '@/lib/planets/types'

vi.mock('@/three/loadGLB', () => ({
  fixMaterials: vi.fn(),
  loadGLB: vi.fn(),
}))

import { AsteroidBeltController } from '@/three/controllers/AsteroidBeltController'
import { loadGLB } from '@/three/loadGLB'

/** Typed access to the belt controller internals used by these focused tests. */
interface BeltControllerTestInternals {
  /** Per-mesh nearby-tumble runtime state. */
  instanceDataList: BeltRuntimeData[]
  /** Counts frames toward the next nearby-tumble evaluation pass. */
  tumbleEvaluationFrameCounter: number
  /** Global count of active tumblers across belt meshes. */
  nearbyTumblerActiveCount: number
}

/** Narrow view of per-mesh runtime state needed for nearby-tumble integration tests. */
interface BeltRuntimeData {
  /** Cached base transforms for each instance. */
  baseMatrices: THREE.Matrix4[]
  /** Cached belt-local positions for each instance. */
  localPositions: THREE.Vector3[]
  /** Whether each instance is currently tumbling. */
  isTumbling: boolean[]
  /** Currently active tumbler indices for this instanced mesh. */
  activeTumblerSet: Set<number>
}

/** Shared harness returned by controller integration test setup. */
interface BeltControllerTestHarness {
  /** Controller under test. */
  controller: AsteroidBeltController
  /** First instanced mesh built by the controller. */
  mesh: THREE.InstancedMesh
  /** Typed test-only access to nearby-tumble internals. */
  internals: BeltControllerTestInternals
  /** First mesh runtime data record. */
  runtimeData: BeltRuntimeData
}

/**
 * Read one instance matrix into a fresh matrix object.
 *
 * @param mesh - Instanced mesh to inspect
 * @param index - Instance slot to read
 * @returns Copy of the current instance matrix
 */
function readInstanceMatrix(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4()
  mesh.getMatrixAt(index, matrix)
  return matrix
}

/**
 * Assert two instance matrices are numerically close component-by-component.
 *
 * @param actual - Matrix read from the runtime mesh
 * @param expected - Cached or previously captured comparison matrix
 */
function expectMatrixClose(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  for (let i = 0; i < actual.elements.length; i += 1) {
    expect(actual.elements[i]).toBeCloseTo(expected.elements[i]!, 5)
  }
}

/**
 * Build a minimal belt definition for deterministic controller tests.
 *
 * @param overrides - Optional field overrides for larger or specialized test setups
 * @returns Tiny belt config with one instance and fixed scale range
 */
function makeTestBelt(overrides: Partial<AsteroidBelt> = {}): AsteroidBelt {
  return {
    id: 'test-belt',
    name: 'Test Belt',
    orbit: {
      semiMajorAxis: 10,
      eccentricity: 0,
      inclination: 0,
      longitudeOfAscendingNode: 0,
      argumentOfPeriapsis: 0,
      period: 1,
    },
    innerRadius: 0.05,
    outerRadius: 0.05,
    maxParticles: 1,
    thickness: 0,
    orbitalSpeed: 0,
    tumbleSpeed: 1,
    sizeRange: [1, 1],
    sizeExponent: 1,
    kirkwoodGaps: [],
    emissiveColor: [0.06, 0.05, 0.04],
    ...overrides,
  }
}

/**
 * Build a minimal GLB scene with one mesh for controller creation.
 *
 * @returns Scene graph compatible with the controller loader contract
 */
function makeMockGlbScene(): THREE.Group {
  const glbScene = new THREE.Group()
  glbScene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()))
  return glbScene
}

/**
 * Provide a deterministic `Math.random()` stream and fail loudly if exhausted.
 *
 * @param values - Ordered random values expected during runtime evaluation
 */
function mockRandomSequence(values: number[]): void {
  const queue = [...values]
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const next = queue.shift()
    if (next === undefined) {
      throw new Error('Math.random sequence exhausted')
    }
    return next
  })
}

/**
 * Read the private nearby-tumble fields used by these focused integration tests.
 *
 * @param controller - Controller instance under test
 * @returns Typed view of the controller internals needed by the tests
 */
function getControllerTestInternals(controller: AsteroidBeltController): BeltControllerTestInternals {
  return controller as unknown as BeltControllerTestInternals
}

/**
 * Create a controller test harness with a mocked GLB scene and typed internals.
 *
 * @param beltOverrides - Optional asteroid-belt overrides for the test case
 * @returns Controller, mesh, and narrowed runtime data for the first instanced mesh
 */
async function createHarness(
  beltOverrides: Partial<AsteroidBelt> = {},
): Promise<BeltControllerTestHarness> {
  vi.mocked(loadGLB).mockResolvedValue(makeMockGlbScene())
  const controller = await AsteroidBeltController.create(makeTestBelt(beltOverrides))
  const mesh = controller.group.children[0] as THREE.InstancedMesh
  const internals = getControllerTestInternals(controller)
  return {
    controller,
    mesh,
    internals,
    runtimeData: internals.instanceDataList[0]!,
  }
}

/**
 * Advance the controller through an inclusive frame range with a fixed shuttle position.
 *
 * @param controller - Controller under test
 * @param startFrame - First frame number to simulate
 * @param endFrame - Last frame number to simulate
 * @param shuttleWorldPosition - Shuttle world position to feed each tick
 */
function tickFrames(
  controller: AsteroidBeltController,
  startFrame: number,
  endFrame: number,
  shuttleWorldPosition: THREE.Vector3,
): void {
  for (let frame = startFrame; frame <= endFrame; frame += 1) {
    controller.tick(1, frame, shuttleWorldPosition)
  }
}

/**
 * Build a shuttle world position that is guaranteed to be far from a given local asteroid.
 *
 * @param localAsteroidPosition - Reference asteroid position in belt-local space
 * @returns A world-space shuttle position well outside the nearby tumble radius
 */
function farAwayFrom(localAsteroidPosition: THREE.Vector3): THREE.Vector3 {
  return localAsteroidPosition.clone().add(new THREE.Vector3(10000, 0, 0))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AsteroidBeltController nearby tumble integration', () => {
  it('resets an asteroid to its base matrix when nearby tumble deactivates', async () => {
    const { controller, mesh, runtimeData, internals } = await createHarness()
    const shuttleWorldPosition = runtimeData.localPositions[0]!.clone()
    const baseMatrix = runtimeData.baseMatrices[0]!.clone()

    runtimeData.activeTumblerSet.clear()
    runtimeData.isTumbling[0] = false
    internals.tumbleEvaluationFrameCounter = 0
    internals.nearbyTumblerActiveCount = 0

    mockRandomSequence([0, 1, 1, 0])

    tickFrames(controller, 1, 4, shuttleWorldPosition)

    const activeMatrix = readInstanceMatrix(mesh, 0)
    expect(activeMatrix.equals(baseMatrix)).toBe(false)

    tickFrames(controller, 5, 8, shuttleWorldPosition)

    const resetMatrix = readInstanceMatrix(mesh, 0)
    expectMatrixClose(resetMatrix, baseMatrix)
  })

  it('immediately removes an active tumbler that leaves the nearby radius on an evaluation pass', async () => {
    const { controller, mesh, runtimeData, internals } = await createHarness()
    const nearbyShuttleWorldPosition = runtimeData.localPositions[0]!.clone()
    const farShuttleWorldPosition = farAwayFrom(runtimeData.localPositions[0]!)
    const baseMatrix = runtimeData.baseMatrices[0]!.clone()

    runtimeData.activeTumblerSet.clear()
    runtimeData.isTumbling[0] = false
    internals.tumbleEvaluationFrameCounter = 0
    internals.nearbyTumblerActiveCount = 0

    mockRandomSequence([0, 1, 1, 1])

    tickFrames(controller, 1, 4, nearbyShuttleWorldPosition)

    expect(runtimeData.activeTumblerSet.has(0)).toBe(true)
    expect(runtimeData.isTumbling[0]).toBe(true)
    expect(internals.nearbyTumblerActiveCount).toBe(1)

    tickFrames(controller, 5, 8, farShuttleWorldPosition)

    const resetMatrix = readInstanceMatrix(mesh, 0)
    expectMatrixClose(resetMatrix, baseMatrix)
    expect(runtimeData.activeTumblerSet.has(0)).toBe(false)
    expect(runtimeData.isTumbling[0]).toBe(false)
    expect(internals.nearbyTumblerActiveCount).toBe(0)
  })

  it('clears active tumblers when LOD hides their instance index', async () => {
    const { controller, mesh, runtimeData, internals } = await createHarness({ maxParticles: 8 })

    const hiddenIndex = 7
    runtimeData.activeTumblerSet.add(hiddenIndex)
    runtimeData.isTumbling[hiddenIndex] = true
    internals.nearbyTumblerActiveCount = 1

    controller.setLodFraction(0.125)
    expect(mesh.count).toBe(1)

    controller.tick(1, 1, runtimeData.localPositions[0]!.clone())

    expect(runtimeData.activeTumblerSet.has(hiddenIndex)).toBe(false)
    expect(runtimeData.isTumbling[hiddenIndex]).toBe(false)
    expect(internals.nearbyTumblerActiveCount).toBe(0)
  })

  it('keeps evaluation-pass work bounded instead of scaling with all visible instances', async () => {
    const { controller, mesh, runtimeData, internals } = await createHarness({ maxParticles: 64 })
    const shuttleWorldPosition = runtimeData.localPositions[0]!.clone()
    const setMatrixAtSpy = vi.spyOn(mesh, 'setMatrixAt')
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    runtimeData.activeTumblerSet.clear()
    internals.tumbleEvaluationFrameCounter = 0
    internals.nearbyTumblerActiveCount = 0
    setMatrixAtSpy.mockClear()
    randomSpy.mockClear()

    tickFrames(controller, 1, 3, shuttleWorldPosition)
    expect(randomSpy).not.toHaveBeenCalled()
    expect(setMatrixAtSpy).not.toHaveBeenCalled()

    controller.tick(1, 4, shuttleWorldPosition)

    const sampledCount = randomSpy.mock.calls.length / 2

    expect(randomSpy.mock.calls.length).toBeGreaterThan(0)
    expect(randomSpy.mock.calls.length % 2).toBe(0)
    expect(sampledCount).toBeLessThan(mesh.count)
    expect(setMatrixAtSpy.mock.calls.length).toBeLessThan(mesh.count)
    expect(setMatrixAtSpy.mock.calls.length).toBeLessThanOrEqual(randomSpy.mock.calls.length / 2)
    expect(setMatrixAtSpy.mock.calls.length).toBe(runtimeData.activeTumblerSet.size)
    expect(internals.nearbyTumblerActiveCount).toBe(runtimeData.activeTumblerSet.size)
  })
})
