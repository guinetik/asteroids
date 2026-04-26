import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Heightmap } from '@/lib/terrain/heightmap'
import type { MiniGameContext } from '@/lib/minigame/MiniGame'
import type { Tickable } from '@/lib/Tickable'
import {
  computePhotometryProbeTarget,
  computePhotometryStandoffDistance,
  findClosestPhotometrySurfacePoint,
} from '@/lib/photometry/photometryGeometry'
import {
  DEFAULT_PHOTOMETRY_ASTEROID_MID_Y,
  PhotometryMinigame,
} from '@/lib/minigame/PhotometryMinigame'
import type { PhotometryProbeController } from '@/three/PhotometryProbeController'

const OBJECTIVE = {
  type: 'photometry' as const,
  x: 0,
  z: 0,
  timeLimit: 240,
  scanHoldSeconds: 2,
  probeDistance: 900,
  reward: 500,
}

const SHORT_OBJECTIVE = {
  ...OBJECTIVE,
  timeLimit: 3,
}

const HEIGHTMAP = new Heightmap(3, 200)
const LANDER_UP = { x: 0, y: 1, z: 0 }

function expectedProbeTarget(): ReturnType<typeof computePhotometryProbeTarget> {
  return computePhotometryProbeTarget({
    objectiveX: OBJECTIVE.x,
    objectiveZ: OBJECTIVE.z,
    terminalY: 0,
    asteroidMidY: DEFAULT_PHOTOMETRY_ASTEROID_MID_Y,
    probeDistance: computePhotometryStandoffDistance(HEIGHTMAP),
    seed: 42,
  })
}

function context(overrides: Partial<MiniGameContext>): MiniGameContext {
  return {
    levelState: 'eva',
    landerPosition: null,
    landerGrounded: false,
    playerPosition: null,
    interactPressed: false,
    terminalInteractPressed: false,
    ...overrides,
  }
}

function aimAtScanTarget(landerPosition: { x: number; y: number; z: number }): {
  x: number
  y: number
  z: number
} {
  const scanTarget = findClosestPhotometrySurfacePoint(HEIGHTMAP, landerPosition, 0)!
  const emitter = new THREE.Vector3(landerPosition.x, landerPosition.y + 24, landerPosition.z)
  const forward = new THREE.Vector3(scanTarget.x, landerPosition.y, scanTarget.z)
    .sub(emitter)
    .normalize()
  return { x: forward.x, y: forward.y, z: forward.z }
}

describe('PhotometryMinigame', () => {
  it('launches from the terminal and registers one photometry probe controller', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const onRegisterTickable = vi.fn()
    const onPrompt = vi.fn()
    minigame.onRegisterTickable = onRegisterTickable
    minigame.onPrompt = onPrompt

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    expect(minigame.status).toBe('active')
    expect(onPrompt).toHaveBeenCalledWith('[E] LAUNCH PHOTOMETRY PROBE')
    expect(onRegisterTickable).toHaveBeenCalledTimes(1)
    expect(minigame.progressCurrent).toBe(0)
    expect(minigame.progressTotal).toBe(1)
    minigame.dispose()
  })

  it('collects the probe, completes the scan hold, and returns telemetry', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    const onComplete = vi.fn()
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)
    minigame.onComplete = onComplete

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const landerPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const landerForward = aimAtScanTarget(landerPosition)
    tickables[0]!.tick(14)
    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    expect(minigame.progressCurrent).toBe(2)
    expect(minigame.progressTotal).toBe(2)
    expect(scene.getObjectByName('photometry-scan-target')).toBeUndefined()
    expect(scene.getObjectByName('photometry-los-beam')).toBeUndefined()
    expect((tickables[0] as PhotometryProbeController).hasWaypoint).toBe(false)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    expect(minigame.status).toBe('completed')
    expect(onComplete).toHaveBeenCalledWith(0)
    minigame.dispose()
  })

  it('does not fail or relaunch after the scan is complete while returning telemetry', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, SHORT_OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    const onComplete = vi.fn()
    const onRegisterTickable = vi.fn((tickable: Tickable) => tickables.push(tickable))
    minigame.onRegisterTickable = onRegisterTickable
    minigame.onComplete = onComplete

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const landerPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const landerForward = aimAtScanTarget(landerPosition)
    tickables[0]!.tick(14)
    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    minigame.tick(10, context({ levelState: 'eva', playerPosition: { x: 5, y: 0, z: 0 } }))
    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    expect(minigame.status).toBe('completed')
    expect(onComplete).toHaveBeenCalledWith(0)
    expect(onRegisterTickable).toHaveBeenCalledTimes(1)
    minigame.dispose()
  })

  it('colors the asteroid scan marker red when unlocked and green when stable', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const stablePosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const landerForward = aimAtScanTarget(stablePosition)
    tickables[0]!.tick(14)
    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: stablePosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    const marker = scene.getObjectByName('photometry-scan-target') as THREE.Mesh
    const material = marker.material as THREE.MeshBasicMaterial
    expect(material.color.g).toBeGreaterThan(material.color.r)

    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition: stablePosition,
      landerForward: { x: 1, y: 0, z: 0 },
      landerUp: LANDER_UP,
    }))

    expect(material.color.r).toBeGreaterThan(material.color.g)
    minigame.dispose()
  })

  it('places the asteroid scan target at the probe standoff height', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const landerPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const landerForward = aimAtScanTarget(landerPosition)
    tickables[0]!.tick(14)

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    const marker = scene.getObjectByName('photometry-scan-target') as THREE.Mesh
    expect(marker.position.y).toBeCloseTo(probeTarget.y)
    minigame.dispose()
  })

  it('only shows the scan beam while the lander is near the standoff waypoint', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const collectionPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const lowerNearPosition = { x: probeTarget.x, y: probeTarget.y - 500, z: probeTarget.z }
    const farPosition = { x: probeTarget.x + 600, y: probeTarget.y - 500, z: probeTarget.z }
    const landerForward = aimAtScanTarget(collectionPosition)
    tickables[0]!.tick(14)

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: lowerNearPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    expect(scene.getObjectByName('photometry-scan-target')).toBeDefined()
    expect(scene.getObjectByName('photometry-los-beam')).toBeDefined()

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: farPosition,
      landerForward,
      landerUp: LANDER_UP,
    }))

    expect(scene.getObjectByName('photometry-scan-target')).toBeUndefined()
    expect(scene.getObjectByName('photometry-los-beam')).toBeUndefined()
    minigame.dispose()
  })

  it('reports photometry mission instructions for each scan phase', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    expect(minigame.missionInstruction).toBe('FLY TO PHOTOMETRY PROBE')

    const probeTarget = expectedProbeTarget()
    const collectionPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const farPosition = { x: probeTarget.x + 600, y: probeTarget.y, z: probeTarget.z }
    const lockedForward = aimAtScanTarget(collectionPosition)
    tickables[0]!.tick(14)

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: { x: 1, y: 0, z: 0 },
      landerUp: LANDER_UP,
    }))

    expect(minigame.missionInstruction).toBe('ALIGN WITH TARGET MARKER')

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(minigame.missionInstruction).toBe('FIRING X-RAY - HOLD POSITION')

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: farPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(minigame.missionInstruction).toBe('RETURN TO PHOTOMETRY STANDOFF')

    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))
    minigame.tick(1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(minigame.missionInstruction).toBe('COLLECTING PHOTOMETRY DATA')

    minigame.tick(5, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(minigame.missionInstruction).toBe('RETURN TELEMETRY TO TERMINAL')
    minigame.dispose()
  })

  it('emits scan audio visibility separately from scan lock progress', () => {
    const scene = new THREE.Scene()
    const minigame = new PhotometryMinigame(0, OBJECTIVE, scene, HEIGHTMAP, 42)
    const tickables: Tickable[] = []
    const audioStates: Array<{ visible: boolean; locked: boolean; progress: number }> = []
    minigame.onRegisterTickable = (tickable) => tickables.push(tickable)
    minigame.onScanAudioState = (state) => audioStates.push(state)

    minigame.tick(0, context({
      playerPosition: { x: 5, y: 0, z: 0 },
      terminalInteractPressed: true,
    }))

    const probeTarget = expectedProbeTarget()
    const collectionPosition = { x: probeTarget.x, y: probeTarget.y, z: probeTarget.z }
    const farPosition = { x: probeTarget.x + 600, y: probeTarget.y, z: probeTarget.z }
    const lockedForward = aimAtScanTarget(collectionPosition)
    tickables[0]!.tick(14)

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: { x: 1, y: 0, z: 0 },
      landerUp: LANDER_UP,
    }))

    expect(audioStates[audioStates.length - 1]).toMatchObject({ visible: true, locked: false })

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: collectionPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(audioStates[audioStates.length - 1]?.visible).toBe(true)
    expect(audioStates[audioStates.length - 1]?.locked).toBe(true)
    expect(audioStates[audioStates.length - 1]?.progress).toBeGreaterThan(0)

    minigame.tick(0.1, context({
      levelState: 'lander',
      landerPosition: farPosition,
      landerForward: lockedForward,
      landerUp: LANDER_UP,
    }))

    expect(audioStates[audioStates.length - 1]).toEqual({
      visible: false,
      locked: false,
      progress: 0,
    })
    minigame.dispose()
  })
})
