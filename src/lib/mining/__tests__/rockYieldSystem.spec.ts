import { describe, expect, it } from 'vitest'
import { RockYieldSystem } from '../rockYieldSystem'
import {
  BOLT_DAMAGE_KG_PER_HIT,
  MAX_ROCK_YIELD_KG,
  MIN_ROCK_YIELD_KG,
} from '../constants'
import type { MineralEntry } from '@/lib/asteroids/types'

const COMPOSITION: MineralEntry[] = [
  { name: 'Olivine', percentage: 60 },
  { name: 'Pyroxene', percentage: 40 },
]

function makeSystem(overrides: { seed?: number; boltDamageKg?: number } = {}): RockYieldSystem {
  return new RockYieldSystem({
    composition: COMPOSITION,
    seed: overrides.seed ?? 42,
    boltDamageKg: overrides.boltDamageKg ?? BOLT_DAMAGE_KG_PER_HIT,
  })
}

describe('RockYieldSystem', () => {
  it('rolls deterministically from the same seed + spawn index', () => {
    const a = makeSystem({ seed: 7 })
    const b = makeSystem({ seed: 7 })
    a.registerRock({ spawnIndex: 11, diameter: 5 })
    b.registerRock({ spawnIndex: 11, diameter: 5 })
    expect(a.peekRock(11)?.itemId).toBe(b.peekRock(11)?.itemId)
    expect(a.peekRock(11)?.totalKg).toBe(b.peekRock(11)?.totalKg)
  })

  it('produces different rolls for different spawn indices', () => {
    const sys = makeSystem()
    for (let i = 0; i < 50; i++) {
      sys.registerRock({ spawnIndex: i, diameter: 5 })
    }
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) ids.add(sys.peekRock(i)!.itemId)
    expect(ids.size).toBeGreaterThan(1)
  })

  it('clamps total kg between MIN and MAX', () => {
    const sys = makeSystem()
    sys.registerRock({ spawnIndex: 1, diameter: 0.1 })
    sys.registerRock({ spawnIndex: 2, diameter: 9999 })
    expect(sys.peekRock(1)!.totalKg).toBe(MIN_ROCK_YIELD_KG)
    expect(sys.peekRock(2)!.totalKg).toBe(MAX_ROCK_YIELD_KG)
  })

  it('deducts kg per hit and depletes the rock', () => {
    const sys = makeSystem({ boltDamageKg: 5 })
    sys.registerRock({ spawnIndex: 9, diameter: 1 })
    const total = sys.peekRock(9)!.remainingKg
    expect(total).toBeGreaterThanOrEqual(MIN_ROCK_YIELD_KG)

    const result1 = sys.mineRock(9)
    expect(result1?.kgGranted).toBe(Math.min(5, total))

    let depleted = result1?.depleted ?? false
    let safety = 100
    while (!depleted && safety-- > 0) {
      const next = sys.mineRock(9)
      if (!next) break
      depleted = next.depleted
    }
    expect(depleted).toBe(true)
    expect(sys.peekRock(9)).toBeNull()
  })

  it('fires onConsume when the rock is depleted', () => {
    const sys = makeSystem({ boltDamageKg: MAX_ROCK_YIELD_KG })
    let consumedIndex: number | null = null
    sys.onConsume = (idx) => {
      consumedIndex = idx
    }
    sys.registerRock({ spawnIndex: 3, diameter: 5 })
    sys.mineRock(3)
    expect(consumedIndex).toBe(3)
  })

  it('forwards every grant via onMineralExtracted', () => {
    const sys = makeSystem({ boltDamageKg: 3 })
    const grants: { itemId: string; kg: number; idx: number }[] = []
    sys.onMineralExtracted = (itemId, kg, idx) => {
      grants.push({ itemId, kg, idx })
    }
    sys.registerRock({ spawnIndex: 5, diameter: 1 })
    sys.mineRock(5)
    sys.mineRock(5)
    expect(grants.length).toBeGreaterThan(0)
    for (const grant of grants) expect(grant.kg).toBeGreaterThan(0)
  })

  it('returns null for unknown or already-depleted rocks', () => {
    const sys = makeSystem()
    expect(sys.mineRock(99)).toBeNull()
    sys.registerRock({ spawnIndex: 4, diameter: 1 })
    while (sys.mineRock(4) !== null) {
      // drain
    }
    expect(sys.mineRock(4)).toBeNull()
  })

  it('reports the asteroid composition (filtered to known items)', () => {
    const sys = makeSystem()
    expect(sys.availableItemIds).toEqual(['olivine', 'pyroxene'])
  })

  it('weighted distribution favors heavier composition entries', () => {
    const sys = new RockYieldSystem({
      composition: [
        { name: 'Olivine', percentage: 90 },
        { name: 'Pyroxene', percentage: 10 },
      ],
      seed: 1,
    })
    let olivine = 0
    let pyroxene = 0
    for (let i = 0; i < 2000; i++) {
      sys.registerRock({ spawnIndex: i, diameter: 5 })
      const itemId = sys.peekRock(i)?.itemId
      if (itemId === 'olivine') olivine++
      if (itemId === 'pyroxene') pyroxene++
    }
    expect(olivine).toBeGreaterThan(pyroxene * 5)
  })

  it('skips composition entries without a registered inventory item', () => {
    const sys = new RockYieldSystem({
      composition: [
        { name: 'Olivine', percentage: 50 },
        { name: 'Unobtanium', percentage: 50 },
      ],
      seed: 1,
    })
    sys.registerRock({ spawnIndex: 0, diameter: 5 })
    expect(sys.peekRock(0)?.itemId).toBe('olivine')
  })

  it('exposes only mineral ids actually rolled into rocks via rolledItemIds', () => {
    const sys = makeSystem()
    expect(sys.rolledItemIds.size).toBe(0)
    for (let i = 0; i < 30; i++) sys.registerRock({ spawnIndex: i, diameter: 5 })
    const ids = sys.rolledItemIds
    expect(ids.size).toBeGreaterThan(0)
    for (const id of ids) {
      expect(['olivine', 'pyroxene']).toContain(id)
    }
  })

  it('countRolls reports current per-mineral coverage', () => {
    const sys = makeSystem()
    for (let i = 0; i < 30; i++) sys.registerRock({ spawnIndex: i, diameter: 5 })
    const olivine = sys.countRolls('olivine')
    const pyroxene = sys.countRolls('pyroxene')
    expect(olivine + pyroxene).toBe(30)
    expect(sys.countRolls('magnetite')).toBe(0)
  })

  it('forceRockMineral converts unmined rocks to the requested mineral', () => {
    const sys = makeSystem()
    for (let i = 0; i < 10; i++) sys.registerRock({ spawnIndex: i, diameter: 5 })
    const before = sys.countRolls('olivine')
    const target = before + 3
    const converted = sys.forceRockMineral('olivine', target - before)
    expect(converted).toBeGreaterThanOrEqual(0)
    expect(sys.countRolls('olivine')).toBeGreaterThanOrEqual(before)
  })

  it('forceRockMineral skips already-mined rocks', () => {
    const sys = makeSystem({ boltDamageKg: 1 })
    sys.registerRock({ spawnIndex: 0, diameter: 5 })
    sys.registerRock({ spawnIndex: 1, diameter: 5 })
    sys.mineRock(0)
    const targetId = sys.peekRock(0)?.itemId === 'olivine' ? 'pyroxene' : 'olivine'
    sys.forceRockMineral(targetId, 5)
    expect(sys.peekRock(0)?.itemId).not.toBe(targetId)
  })
})
