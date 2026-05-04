import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { MineralAnalysisMinigame } from '../MineralAnalysisMinigame'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { Heightmap } from '@/lib/terrain/heightmap'

function makeHeightmap(): Heightmap {
  return {
    heightAt: () => 0,
    slopeAt: () => 0,
    grid: new Float32Array(0),
    resolution: 1,
    worldSize: 100,
  } as unknown as Heightmap
}

function makeObjective(): ConcreteObjective {
  return {
    type: 'mineral-analysis',
    x: 0,
    z: 0,
    analysisRockCount: 2,
    sampleKg: 25,
    reward: 100,
  }
}

function tickAtTerminal(minigame: MineralAnalysisMinigame, terminalInteractPressed: boolean): void {
  minigame.tick(0.016, {
    levelState: 'eva',
    landerPosition: null,
    landerGrounded: false,
    playerPosition: { x: 0, y: 0, z: 0 },
    interactPressed: false,
    terminalInteractPressed,
  })
}

function makeMinigame(
  rockYieldSystem = new RockYieldSystem({
    composition: [{ name: 'Olivine', percentage: 100 }],
    seed: 42,
  }),
): MineralAnalysisMinigame {
  return new MineralAnalysisMinigame({
    objectiveIndex: 0,
    objective: makeObjective(),
    scene: new THREE.Scene(),
    heightmap: makeHeightmap(),
    rockYieldSystem,
    sampleSelectionRandom: () => 0,
  })
}

describe('MineralAnalysisMinigame', () => {
  it('starts at the terminal and counts distinct analyzed rocks', () => {
    const rockYieldSystem = new RockYieldSystem({
      composition: [{ name: 'Olivine', percentage: 100 }],
      seed: 42,
    })
    const minigame = makeMinigame(rockYieldSystem)

    expect(minigame.status).toBe('idle')
    tickAtTerminal(minigame, true)

    expect(minigame.status).toBe('active')
    expect(minigame.progressCurrent).toBe(0)
    expect(minigame.progressTotal).toBe(2)

    rockYieldSystem.onRockProspected?.(11, 'olivine')
    rockYieldSystem.onRockProspected?.(11, 'olivine')
    rockYieldSystem.onRockProspected?.(12, 'pyroxene')

    expect(minigame.progressCurrent).toBe(2)
    expect(minigame.steps[1]?.complete).toBe(true)
  })

  it('selects the sample mineral from analyzed rocks and completes after delivery', () => {
    const rockYieldSystem = new RockYieldSystem({
      composition: [{ name: 'Olivine', percentage: 100 }],
      seed: 42,
    })
    const minigame = makeMinigame(rockYieldSystem)
    let completed = false
    minigame.onComplete = () => {
      completed = true
    }

    tickAtTerminal(minigame, true)
    rockYieldSystem.onRockProspected?.(11, 'olivine')
    rockYieldSystem.onRockProspected?.(12, 'pyroxene')
    tickAtTerminal(minigame, true)

    expect(minigame.selectedSampleItemId).toBe('olivine')
    expect(minigame.steps[3]?.label).toContain('Olivine')

    rockYieldSystem.onMineralExtracted?.('pyroxene', 100, 20)
    expect(minigame.sampleKgMined).toBe(0)

    rockYieldSystem.onMineralExtracted?.('olivine', 10, 21)
    expect(minigame.sampleKgMined).toBe(10)
    expect(completed).toBe(false)

    rockYieldSystem.onMineralExtracted?.('olivine', 20, 22)
    tickAtTerminal(minigame, true)

    expect(minigame.sampleKgMined).toBe(25)
    expect(minigame.status).toBe('completed')
    expect(completed).toBe(true)
  })
})
