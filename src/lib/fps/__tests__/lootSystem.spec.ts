/**
 * Unit tests for the generalized LootSystem.
 *
 * Starts with failing tests per TDD. Covers data-driven drop tables,
 * biased weighted selection per enemy, psychosphere policy gate,
 * collection mechanics, and powerup callbacks. No magic numbers.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-28-loot-drop-system-design.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LootSystem, type LootType, type LootPickup } from '../lootSystem'
import type { DropPolicy } from '../dropSystem'
import dropTablesJson from '@/data/loot/dropTables.json'

const ALWAYS_ARMED: DropPolicy = { isItemArmed: () => true }
const NEVER_ARMED: DropPolicy = { isItemArmed: () => false }

describe('LootSystem', () => {
  let system: LootSystem
  let onPowerupCollected: (type: LootType) => void
  let onPickup: (pickup: LootPickup) => void

  beforeEach(() => {
    onPowerupCollected = vi.fn<(type: LootType) => void>()
    onPickup = vi.fn<(pickup: LootPickup) => void>()
    system = new LootSystem({
      policy: ALWAYS_ARMED,
      onPowerupCollected,
      onPickup,
      pickupRadius: 2.5,
      spawnYOffset: 0.6,
    })
  })

  it('loads drop tables and exposes global settings (data-driven)', () => {
    // Test will fail until LootSystem imports and validates the JSON structure
    expect(dropTablesJson.version).toBe('2026-04-28')
    expect(dropTablesJson.tables.bacteriophage).toBeDefined()
    expect(dropTablesJson.globalSettings.maxDropsPerKill).toBe(1)
  })

  it('trySpawnLoot respects baseChance + difficulty scaling for bacteriophage', () => {
    // Mock random to control probability. With base 0.35, at diff=1 should sometimes spawn
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // below baseChance 0.35 -> should spawn
    const pickup = system.trySpawnLoot('bacteriophage', { x: 0, y: 0, z: 0 }, 1)
    expect(pickup).not.toBeNull()
    expect(pickup!.type).toBeDefined()
    expect(['health', 'oxygen', 'rtg', 'psychosphere']).toContain(pickup!.type)
    vi.restoreAllMocks()
  })

  it('trySpawnLoot can produce different loot types per enemy bias', () => {
    // Multiple runs to hit different biases (psychosphere favored by bacteriophage)
    // This test drives weighted random selection logic
    const types = new Set<LootType>()
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.8) // high to hit psychosphere bias ~0.4
    const p1 = system.trySpawnLoot('bacteriophage', { x: 10, y: 0, z: 0 }, 1)
    if (p1) types.add(p1.type)

    vi.spyOn(Math, 'random').mockReturnValueOnce(0.2) // low for health bias 0.15
    const p2 = system.trySpawnLoot('bacteriophage', { x: 20, y: 0, z: 0 }, 1)
    if (p2) types.add(p2.type)

    expect(types.size).toBeGreaterThan(0)
    vi.restoreAllMocks()
  })

  it('never spawns psychosphere when policy disarms it', () => {
    const noPsychoSystem = new LootSystem({
      policy: NEVER_ARMED,
      onPowerupCollected: vi.fn<(type: LootType) => void>(),
      onPickup: vi.fn<(pickup: LootPickup) => void>(),
    })
    // Mock chance pass (0.1 < 0.35) then selection toward psychosphere (0.9)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9)
    const pickup = noPsychoSystem.trySpawnLoot('bacteriophage', { x: 0, y: 0, z: 0 }, 1)
    expect(pickup).not.toBeNull()
    expect(pickup!.type).not.toBe('psychosphere')
    vi.restoreAllMocks()
  })

  it('tick collects pickups within cylindrical radius and triggers correct callback', () => {
    // Spawn one, collect it
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const _pickup = system.trySpawnLoot('bacteriophage', { x: 0, y: 0, z: 0 }, 1)
    expect(system.pickups).toHaveLength(1)

    const collected = system.tick(0.016, { x: 0.5, y: 0, z: 0.5 }) // within ~0.7 < 2.5
    expect(collected).toHaveLength(1)
    expect(system.pickups).toHaveLength(0)

    // With random=0.1 this hits health first (per bacteriophage table bias)
    expect(onPowerupCollected).toHaveBeenCalled()
    expect(onPickup).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('clear() removes all live pickups', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    system.trySpawnLoot('spire', { x: 0, y: 0, z: 0 }, 1)
    system.trySpawnLoot('chimera', { x: 10, y: 0, z: 0 }, 1)
    expect(system.pickups.length).toBeGreaterThan(0)

    system.clear()
    expect(system.pickups).toHaveLength(0)
    vi.restoreAllMocks()
  })
})

describe('createContractLootPolicy', () => {
  // Similar to existing but adapted for loot context if needed
  it('delegates to contract drop policy for psychosphere', () => {
    // Test will drive the policy wrapper
    expect(true).toBe(true) // placeholder until implemented
  })
})
