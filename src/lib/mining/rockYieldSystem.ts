/**
 * Universal rock yield system.
 *
 * Owns the per-rock mineral roll and kg accounting for every mineable
 * surface rock in a level. Responsibility split:
 *   - Roll a single mineral per rock (deterministic from `seed + spawnIndex`,
 *     weighted by the asteroid's composition).
 *   - Track remaining kg per rock; drill bolts deduct kg until depletion.
 *   - When a rock depletes, fire `onConsume` so the renderer can hide
 *     the instance and remove its collider.
 *   - Forward every grant via `onMineralExtracted` so listeners (the
 *     gather minigame, telemetry) can react.
 *
 * The system is renderer-agnostic — it never touches THREE. Wiring is
 * done by `LevelViewController`.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/superpowers/specs/2026-04-18-gather-mission-design.md
 */
import type { MineralEntry } from '@/lib/asteroids/types'
import { resolveCompositionItemId } from '@/lib/asteroids/mineralItemMap'
import {
  BOLT_DAMAGE_KG_PER_HIT,
  MAX_ROCK_YIELD_KG,
  MINERAL_KG_PER_DIAMETER_UNIT,
  MIN_PROSPECT_BONUS_KG,
  MIN_ROCK_YIELD_KG,
  PROSPECT_BONUS_RATIO,
  PROSPECT_ITEM_SALT,
  PROSPECT_SECOND_ROLL_CHANCE,
  PROSPECT_TRIGGER_SALT,
  SCIENCE_HP_RATIO,
} from './constants'

/** Result of a single drill hit on a registered rock. */
export interface MineHitResult {
  /** Inventory item id granted by this hit. */
  itemId: string
  /** Kilograms successfully extracted (clamped to remaining yield). */
  kgGranted: number
  /** Whether the rock has now been fully depleted by this hit. */
  depleted: boolean
}

/** Per-rock roll registered when the rock is spawned. */
interface RockRoll {
  /** Inventory item id for this rock (rolled at registration). */
  itemId: string
  /** Total kg available at registration. */
  totalKg: number
  /** Remaining kg after drill hits. Reaches 0 on depletion. */
  remainingKg: number
  /** Remaining science HP for prospecting, in kg-equivalent units. */
  scienceHp: number
  /** Initial science HP, used to normalize wireframe-overlay opacity. */
  initialScienceHp: number
  /** Whether this rock has been fully analysed by the science gun. */
  prospected: boolean
}

/** Spawn input for {@link RockYieldSystem.registerRock}. */
export interface RockYieldSpawn {
  /** Stable index used by both the mesh layer and collider id. */
  spawnIndex: number
  /** Diameter in world units, used to compute total kg when {@link totalKgOverride} is absent. */
  diameter: number
  /** Override the system-level composition for this rock only (e.g. belt tier loot tables). */
  compositionOverride?: readonly MineralEntry[]
  /** Override the diameter-derived HP (kg). Takes precedence over {@link diameter} for yield size. */
  totalKgOverride?: number
}

/** Construction options for {@link RockYieldSystem}. */
export interface RockYieldSystemOptions {
  /** Asteroid composition (mineral name + percentage), used to weight rolls. */
  composition: readonly MineralEntry[]
  /** Numeric seed for deterministic mineral rolls (mission seed is fine). */
  seed: number
  /** Optional override for kg removed per drill bolt hit. */
  boltDamageKg?: number
}

/**
 * Pure-ish system — no rendering, no input. All side effects flow
 * through callbacks the host wires up at construction time.
 */
export class RockYieldSystem {
  private readonly rocks = new Map<number, RockRoll>()
  private readonly weightedItems: { itemId: string; weight: number }[] = []
  private readonly seed: number
  private readonly boltDamageKg: number

  /** Fired when a rock depletes; host hides the mesh and removes the collider. */
  onConsume: ((spawnIndex: number) => void) | null = null

  /**
   * Fired on every successful kg grant (including the depletion hit).
   * Listeners (e.g. gather minigame) increment progress against quotas.
   */
  onMineralExtracted: ((itemId: string, kg: number, spawnIndex: number) => void) | null = null

  /**
   * Fired on every science-hit while not yet prospected. Drives the
   * wireframe-overlay opacity ramp.
   */
  onScienceProgress:
    ((spawnIndex: number, scienceHp: number, initialScienceHp: number) => void) | null = null

  /**
   * Fired exactly once per rock when scienceHp first reaches 0.
   * Listeners chain themselves with the same wrap-and-call pattern
   * `onMineralExtracted` already uses.
   */
  onRockProspected: ((spawnIndex: number, itemId: string) => void) | null = null

  constructor(options: RockYieldSystemOptions) {
    this.seed = options.seed | 0
    this.boltDamageKg = Math.max(0.1, options.boltDamageKg ?? BOLT_DAMAGE_KG_PER_HIT)

    for (const entry of options.composition) {
      const itemId = resolveCompositionItemId(entry.name)
      if (itemId === null) continue
      const weight = Math.max(0, entry.percentage)
      if (weight <= 0) continue
      this.weightedItems.push({ itemId, weight })
    }
  }

  /**
   * Register a rock so drill hits can extract from it. Idempotent —
   * re-registering an existing index keeps the original roll.
   */
  registerRock(spawn: RockYieldSpawn): void {
    if (this.rocks.has(spawn.spawnIndex)) return

    const weightedItems = spawn.compositionOverride
      ? this.buildWeightedItems(spawn.compositionOverride)
      : this.weightedItems
    if (weightedItems.length === 0) return

    const itemId = this.rollMineralFrom(weightedItems, spawn.spawnIndex)
    const totalKg = spawn.totalKgOverride ?? this.rollTotalKg(spawn.diameter)
    const initialScienceHp = Math.max(
      BOLT_DAMAGE_KG_PER_HIT,
      Math.ceil(totalKg * SCIENCE_HP_RATIO),
    )
    this.rocks.set(spawn.spawnIndex, {
      itemId,
      totalKg,
      remainingKg: totalKg,
      scienceHp: initialScienceHp,
      initialScienceHp,
      prospected: false,
    })
  }

  /** Forget a rock (e.g. on dispose) without firing callbacks. */
  unregisterRock(spawnIndex: number): void {
    this.rocks.delete(spawnIndex)
  }

  /**
   * Apply a single drill hit to the rock at `spawnIndex`. Returns
   * `null` when the rock is unknown or already depleted.
   */
  mineRock(spawnIndex: number, kgRemoved: number = this.boltDamageKg): MineHitResult | null {
    const roll = this.rocks.get(spawnIndex)
    if (!roll) return null
    if (roll.remainingKg <= 0) return null

    const granted = Math.min(roll.remainingKg, Math.max(0, kgRemoved))
    if (granted <= 0) return null

    roll.remainingKg -= granted
    const depleted = roll.remainingKg <= 1e-3
    if (depleted) roll.remainingKg = 0

    this.onMineralExtracted?.(roll.itemId, granted, spawnIndex)

    if (depleted && roll.prospected) {
      const bonusKg = Math.max(
        MIN_PROSPECT_BONUS_KG,
        Math.ceil(roll.totalKg * PROSPECT_BONUS_RATIO),
      )
      // Guaranteed: another grant of the rock's primary mineral.
      this.onMineralExtracted?.(roll.itemId, bonusKg, spawnIndex)
      // 25% chance: a second composition-weighted grant. Two distinct salts
      // keep trigger and item-id draws statistically independent.
      const trigger = pseudoRandom(this.seed, spawnIndex ^ PROSPECT_TRIGGER_SALT)
      if (trigger < PROSPECT_SECOND_ROLL_CHANCE) {
        const rolledItemId = this.rollMineralFromSalted(
          this.weightedItems,
          spawnIndex,
          PROSPECT_ITEM_SALT,
        )
        this.onMineralExtracted?.(rolledItemId, bonusKg, spawnIndex)
      }
    }

    if (depleted) {
      this.rocks.delete(spawnIndex)
      this.onConsume?.(spawnIndex)
    }

    return { itemId: roll.itemId, kgGranted: granted, depleted }
  }

  /**
   * Inspect the current roll for a rock without mutating state.
   * Returns `null` when the rock is unknown.
   */
  peekRock(spawnIndex: number): { itemId: string; totalKg: number; remainingKg: number } | null {
    const roll = this.rocks.get(spawnIndex)
    if (!roll) return null
    return { itemId: roll.itemId, totalKg: roll.totalKg, remainingKg: roll.remainingKg }
  }

  /**
   * Inspect the prospecting state for a rock without mutating it. Returns
   * `null` when the rock is unknown.
   */
  getScienceProgress(spawnIndex: number): {
    scienceHp: number
    initialScienceHp: number
    prospected: boolean
  } | null {
    const roll = this.rocks.get(spawnIndex)
    if (!roll) return null
    return {
      scienceHp: roll.scienceHp,
      initialScienceHp: roll.initialScienceHp,
      prospected: roll.prospected,
    }
  }

  /**
   * Apply one science-bolt hit to the rock at `spawnIndex`. No-op (returns
   * `null`) when the rock is unknown or already prospected. Returns the
   * updated state on success — callers use `prospected` to know whether
   * THIS hit completed the analysis.
   */
  scienceHit(spawnIndex: number): {
    prospected: boolean
    scienceHp: number
    initialScienceHp: number
  } | null {
    const roll = this.rocks.get(spawnIndex)
    if (!roll) return null
    if (roll.prospected) return null

    roll.scienceHp = Math.max(0, roll.scienceHp - this.boltDamageKg)
    const justProspected = roll.scienceHp <= 0
    if (justProspected) {
      roll.prospected = true
    }

    this.onScienceProgress?.(spawnIndex, roll.scienceHp, roll.initialScienceHp)
    if (justProspected) {
      this.onRockProspected?.(spawnIndex, roll.itemId)
    }
    return {
      prospected: roll.prospected,
      scienceHp: roll.scienceHp,
      initialScienceHp: roll.initialScienceHp,
    }
  }

  /** Whether this rock has been fully analysed. */
  isProspected(spawnIndex: number): boolean {
    return this.rocks.get(spawnIndex)?.prospected ?? false
  }

  /** Mineral ids actually present on this asteroid (after composition filter). */
  get availableItemIds(): readonly string[] {
    return this.weightedItems.map((entry) => entry.itemId)
  }

  /** Composition weights as registered, exposed for the minigame's mineral picker. */
  get weightedComposition(): readonly { itemId: string; weight: number }[] {
    return this.weightedItems
  }

  /**
   * Distinct mineral ids that have actually been rolled into at least
   * one registered rock. Differs from {@link availableItemIds} which
   * only reflects the composition table — with a small rock count
   * a low-percentage mineral may not appear on any rock at all, in
   * which case the gather minigame must not ask the player to mine it.
   *
   * Cheap to call; recomputed each invocation but the rock map is
   * typically a few hundred entries at most.
   */
  get rolledItemIds(): ReadonlySet<string> {
    const ids = new Set<string>()
    for (const roll of this.rocks.values()) ids.add(roll.itemId)
    return ids
  }

  /**
   * Count how many *currently registered* rocks roll to `itemId`.
   * Used by the gather minigame to decide whether a required mineral
   * needs additional rocks forced via {@link forceRockMineral}.
   */
  countRolls(itemId: string): number {
    let count = 0
    for (const roll of this.rocks.values()) {
      if (roll.itemId === itemId) count++
    }
    return count
  }

  /**
   * Override the mineral on rocks that haven't been mined yet so a
   * required mineral is guaranteed to be obtainable. Used by the
   * gather minigame when the natural roll left a quota-mineral with
   * zero coverage on this asteroid.
   *
   * Reroll is deterministic — picks the first `count` rocks in
   * spawn-index order so two runs of the same mission convert the
   * same rocks. No-op when `count` exceeds the unmined pool.
   *
   * @param itemId Catalog item id to assign.
   * @param count Number of rocks to convert.
   * @returns The number of rocks actually converted.
   */
  forceRockMineral(itemId: string, count: number): number {
    if (count <= 0 || this.rocks.size === 0) return 0
    const sortedSpawnIndices = Array.from(this.rocks.keys()).sort((a, b) => a - b)
    let converted = 0
    for (const spawnIndex of sortedSpawnIndices) {
      if (converted >= count) break
      const roll = this.rocks.get(spawnIndex)!
      if (roll.remainingKg < roll.totalKg) continue
      if (roll.itemId === itemId) continue
      roll.itemId = itemId
      converted++
    }
    return converted
  }

  /** Build a weighted mineral list from a composition table, same rules as constructor. */
  private buildWeightedItems(
    composition: readonly MineralEntry[],
  ): { itemId: string; weight: number }[] {
    const result: { itemId: string; weight: number }[] = []
    for (const entry of composition) {
      const itemId = resolveCompositionItemId(entry.name)
      if (itemId === null) continue
      const weight = Math.max(0, entry.percentage)
      if (weight <= 0) continue
      result.push({ itemId, weight })
    }
    return result
  }

  /** Roll a mineral from an arbitrary weighted list using seed + spawn index. */
  private rollMineralFrom(items: { itemId: string; weight: number }[], spawnIndex: number): string {
    const r = pseudoRandom(this.seed, spawnIndex)
    const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0)
    const target = r * totalWeight
    let acc = 0
    for (const entry of items) {
      acc += entry.weight
      if (target < acc) return entry.itemId
    }
    return items[items.length - 1]!.itemId
  }

  /**
   * Roll a mineral from a weighted list using a salted pseudo-random draw.
   * Used by prospecting bonus rolls so the second grant's item-id draw is
   * statistically independent of the primary roll for the same rock.
   */
  private rollMineralFromSalted(
    items: { itemId: string; weight: number }[],
    spawnIndex: number,
    salt: number,
  ): string {
    const r = pseudoRandom(this.seed, spawnIndex ^ salt)
    const totalWeight = items.reduce((sum, entry) => sum + entry.weight, 0)
    const target = r * totalWeight
    let acc = 0
    for (const entry of items) {
      acc += entry.weight
      if (target < acc) return entry.itemId
    }
    return items[items.length - 1]!.itemId
  }

  private rollTotalKg(diameter: number): number {
    const raw = diameter * MINERAL_KG_PER_DIAMETER_UNIT
    return Math.max(MIN_ROCK_YIELD_KG, Math.min(MAX_ROCK_YIELD_KG, Math.round(raw)))
  }
}

/**
 * Cheap deterministic float in [0, 1) from two integers.
 * Same family as mulberry32 but stateless for single draws.
 */
function pseudoRandom(seed: number, salt: number): number {
  let s = ((seed | 0) * 0x9e3779b1) ^ ((salt | 0) * 0x85ebca77)
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
