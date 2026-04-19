import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  GatherMinigame,
  pickRequiredMinerals,
  rollMineralCount,
} from '../GatherMinigame'
import { RockYieldSystem } from '@/lib/mining/rockYieldSystem'
import type { ConcreteObjective } from '@/lib/missions/types'
import type { MineralEntry } from '@/lib/asteroids/types'
import type { Heightmap } from '@/lib/terrain/heightmap'

const COMPOSITION: MineralEntry[] = [
  { name: 'Olivine', percentage: 60 },
  { name: 'Pyroxene', percentage: 25 },
  { name: 'Magnetite', percentage: 15 },
]

function makeHeightmap(): Heightmap {
  return {
    heightAt: () => 0,
    slopeAt: () => 0,
    grid: new Float32Array(0),
    resolution: 1,
    worldSize: 100,
  } as unknown as Heightmap
}

function makeObjective(amount: number): ConcreteObjective {
  return {
    type: 'gather',
    x: 0,
    z: 0,
    resourceAmount: amount,
    reward: 100,
  }
}

function makeMinigame(difficulty: number, amount = 60): GatherMinigame {
  const yieldSystem = new RockYieldSystem({ composition: COMPOSITION, seed: 42 })
  return new GatherMinigame({
    objectiveIndex: 0,
    objective: makeObjective(amount),
    scene: new THREE.Scene(),
    heightmap: makeHeightmap(),
    composition: COMPOSITION,
    difficulty,
    seed: 42,
    rockYieldSystem: yieldSystem,
  })
}

describe('rollMineralCount', () => {
  it('asks for 1 mineral at low difficulty', () => {
    expect(rollMineralCount(1)).toBe(1)
    expect(rollMineralCount(4)).toBe(1)
  })

  it('asks for 2 minerals at mid difficulty', () => {
    expect(rollMineralCount(5)).toBe(2)
    expect(rollMineralCount(9)).toBe(2)
  })

  it('asks for 3 minerals at top difficulty', () => {
    expect(rollMineralCount(10)).toBe(3)
  })
})

describe('pickRequiredMinerals', () => {
  it('returns the requested count when the pool is large enough', () => {
    const picked = pickRequiredMinerals(COMPOSITION, 2, 1, 0)
    expect(picked).toHaveLength(2)
    const ids = new Set(picked.map((p) => p.itemId))
    expect(ids.size).toBe(2)
  })

  it('caps at the pool size when count exceeds available minerals', () => {
    const picked = pickRequiredMinerals(COMPOSITION, 99, 1, 0)
    expect(picked).toHaveLength(COMPOSITION.length)
  })

  it('is deterministic for the same seed and objective index', () => {
    const a = pickRequiredMinerals(COMPOSITION, 2, 13, 0)
    const b = pickRequiredMinerals(COMPOSITION, 2, 13, 0)
    expect(a.map((p) => p.itemId)).toEqual(b.map((p) => p.itemId))
  })

  it('returns an empty array when no composition entries map to items', () => {
    const picked = pickRequiredMinerals(
      [{ name: 'Unobtanium', percentage: 100 }],
      1,
      1,
      0,
    )
    expect(picked).toEqual([])
  })
})

describe('GatherMinigame', () => {
  it('starts active with mining steps + a deposit step', () => {
    const mg = makeMinigame(1, 50)
    expect(mg.status).toBe('active')
    expect(mg.steps.length).toBeGreaterThanOrEqual(2)
    const last = mg.steps[mg.steps.length - 1]!
    expect(last.label).toContain('Deposit')
  })

  it('scales mining step count with difficulty', () => {
    const easy = makeMinigame(1).steps.length - 1
    const med = makeMinigame(7).steps.length - 1
    const hard = makeMinigame(10).steps.length - 1
    expect(easy).toBe(1)
    expect(med).toBe(2)
    expect(hard).toBe(3)
  })

  it('divides resourceAmount across required minerals (rounded up)', () => {
    const mg = makeMinigame(7, 60)
    const quotas = mg.mineralQuotas
    expect(quotas).toHaveLength(2)
    for (const quota of quotas) expect(quota.targetKg).toBe(30)
  })

  it('cannot complete until quotas are met, even when standing on the crate', () => {
    const yieldSystem = new RockYieldSystem({ composition: COMPOSITION, seed: 42 })
    const mg = new GatherMinigame({
      objectiveIndex: 0,
      objective: makeObjective(20),
      scene: new THREE.Scene(),
      heightmap: makeHeightmap(),
      composition: COMPOSITION,
      difficulty: 1,
      seed: 42,
      rockYieldSystem: yieldSystem,
    })
    let completed = false
    mg.onComplete = () => {
      completed = true
    }
    mg.tick(0.016, {
      levelState: 'eva',
      landerPosition: null,
      landerGrounded: false,
      playerPosition: { x: 0, y: 0, z: 0 },
      interactPressed: false,
      terminalInteractPressed: true,
    })
    expect(completed).toBe(false)
  })

  it('completes once quotas are met and the player presses interact at the crate', () => {
    const yieldSystem = new RockYieldSystem({ composition: COMPOSITION, seed: 42 })
    const mg = new GatherMinigame({
      objectiveIndex: 0,
      objective: makeObjective(20),
      scene: new THREE.Scene(),
      heightmap: makeHeightmap(),
      composition: COMPOSITION,
      difficulty: 1,
      seed: 42,
      rockYieldSystem: yieldSystem,
    })
    const targetItem = mg.mineralQuotas[0]!.itemId
    const target = mg.mineralQuotas[0]!.targetKg
    yieldSystem.onMineralExtracted!(targetItem, target, 0)

    let completed = false
    mg.onComplete = () => {
      completed = true
    }
    mg.tick(0.016, {
      levelState: 'eva',
      landerPosition: null,
      landerGrounded: false,
      playerPosition: { x: 0, y: 0, z: 0 },
      interactPressed: false,
      terminalInteractPressed: true,
    })
    expect(completed).toBe(true)
    expect(mg.status).toBe('completed')
  })

  it('reports kg progress on the matching step', () => {
    const yieldSystem = new RockYieldSystem({ composition: COMPOSITION, seed: 42 })
    const mg = new GatherMinigame({
      objectiveIndex: 0,
      objective: makeObjective(60),
      scene: new THREE.Scene(),
      heightmap: makeHeightmap(),
      composition: COMPOSITION,
      difficulty: 1,
      seed: 42,
      rockYieldSystem: yieldSystem,
    })
    const targetItem = mg.mineralQuotas[0]!.itemId
    yieldSystem.onMineralExtracted!(targetItem, 5, 0)
    const step = mg.steps[0]!
    expect(step.progress?.current).toBe(5)
    expect(step.progress?.target).toBe(60)
    expect(step.progress?.unit).toBe('kg')
  })

  it('clamps minedKg at the quota target', () => {
    const yieldSystem = new RockYieldSystem({ composition: COMPOSITION, seed: 42 })
    const mg = new GatherMinigame({
      objectiveIndex: 0,
      objective: makeObjective(20),
      scene: new THREE.Scene(),
      heightmap: makeHeightmap(),
      composition: COMPOSITION,
      difficulty: 1,
      seed: 42,
      rockYieldSystem: yieldSystem,
    })
    const targetItem = mg.mineralQuotas[0]!.itemId
    yieldSystem.onMineralExtracted!(targetItem, 9999, 0)
    expect(mg.mineralQuotas[0]!.minedKg).toBe(mg.mineralQuotas[0]!.targetKg)
  })
})
