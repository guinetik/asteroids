/**
 * Generalized loot drop system evolved from DropSystem. Supports data-driven
 * enemy-biased drops for immediate powerups (health, oxygen, RTG) and
 * contract-gated psychosphere. Uses weighted random selection from
 * dropTables.json. Collection uses cylindrical overlap test. Fully decoupled
 * from visuals and Vue.
 *
 * Powerups trigger onPowerupCollected immediately; psychosphere uses legacy
 * onPickup path for inventory/contract flow.
 *
 * @author guinetik
 * @date 2026-04-28
 * @spec docs/superpowers/specs/2026-04-28-loot-drop-system-design.md
 */
import type { DropPolicy } from './dropSystem'
import { createContractDropPolicy } from './dropSystem'
import type { ContractSystem } from '@/lib/contracts/ContractSystem'
import lootDropTablesJson from '@/data/loot/dropTables.json'

/** Named constants - no magic numbers. */
const DEFAULT_PICKUP_RADIUS = 2.5
const DEFAULT_SPAWN_Y_OFFSET = 0.6
const PSYCHOSPHERE_ITEM_ID = 'viroid-psychosphere'
const EMPTY_LOOT_PICKUPS: readonly LootPickup[] = []
/**
 * Psychosphere drop weight applied when an active contract step needs the
 * item (`policy.isItemArmed('viroid-psychosphere') === true`). Replaces the
 * table's natural psychosphere weight; the remaining `1 - PSYCHOSPHERE_ARMED_WEIGHT`
 * is split across `health` / `oxygen` / `rtg` proportional to their original
 * shares. Tuned so an 8-pickup contract step closes in a single combat run.
 */
const PSYCHOSPHERE_ARMED_WEIGHT = 0.7

/** All supported loot/powerup types. Psychosphere remains contract-driven. */
export type LootType = 'health' | 'oxygen' | 'rtg' | 'psychosphere'

/** Data shape matching src/data/loot/dropTables.json (data-driven). */
export interface LootDropTable {
  baseChance: number
  difficultyMultiplier: number
  biasedDrops: Record<LootType, number>
}

/** Full drop tables config loaded from JSON. */
export interface LootDropTables {
  version: string
  tables: Record<string, LootDropTable>
  globalSettings: {
    maxDropsPerKill: number
    minDifficultyForBonus: number
  }
}

/** Live loot pickup entity for both powerups and psychosphere. */
export interface LootPickup {
  /** Stable id for matching to visuals. */
  readonly id: number
  /** Loot type determines visual color and effect. */
  readonly type: LootType
  /** World position (Y offset applied on spawn). */
  readonly position: { x: number; y: number; z: number }
  /** Spawn timestamp for animation timing. */
  readonly spawnTime: number
  /** For psychosphere compatibility with existing contract flow. */
  readonly itemId?: string
}

/** Options for constructing LootSystem (evolves DropSystemOptions). */
export interface LootSystemOptions {
  /** Policy gates psychosphere drops via active contracts. */
  policy: DropPolicy
  /** Called for immediate powerup effects (health/oxygen/rtg). */
  onPowerupCollected?: (type: LootType) => void
  /** Legacy callback for psychosphere (inventory + contract notify). */
  onPickup?: (pickup: LootPickup) => void
  /** Cylindrical collection radius (XZ plane only). */
  pickupRadius?: number
  /** Vertical float offset from enemy death position. */
  spawnYOffset?: number
}

const DROP_TABLES: LootDropTables = lootDropTablesJson as LootDropTables

/**
 * Compute renormalized drop weights when psychosphere is armed by an active
 * contract step. Sets psychosphere to {@link PSYCHOSPHERE_ARMED_WEIGHT} and
 * scales the other powerups proportionally so the total stays at 1.
 *
 * If the table's other-powerup weights sum to 0 (degenerate case), the entire
 * remainder lumps onto `health` to keep cumulative selection valid.
 *
 * @param baseWeights - Table's natural `biasedDrops` shape.
 * @returns Adjusted weights summing to 1 with psychosphere boosted.
 */
function armedDropWeights(baseWeights: Record<LootType, number>): Record<LootType, number> {
  const otherSum = baseWeights.health + baseWeights.oxygen + baseWeights.rtg
  const otherTarget = 1 - PSYCHOSPHERE_ARMED_WEIGHT
  if (otherSum <= 0) {
    return {
      health: otherTarget,
      oxygen: 0,
      rtg: 0,
      psychosphere: PSYCHOSPHERE_ARMED_WEIGHT,
    }
  }
  const scale = otherTarget / otherSum
  return {
    health: baseWeights.health * scale,
    oxygen: baseWeights.oxygen * scale,
    rtg: baseWeights.rtg * scale,
    psychosphere: PSYCHOSPHERE_ARMED_WEIGHT,
  }
}

/**
 * Creates a policy compatible with LootSystem by delegating to the existing
 * contract-based DropPolicy. Ensures psychosphere only drops when a
 * collect-drops contract is active.
 */
export function createContractLootPolicy(contracts: ContractSystem): DropPolicy {
  return createContractDropPolicy(contracts)
}

/**
 * Core domain logic for loot drops. Owns live pickup list, uses data-driven
 * tables for enemy-specific bias and difficulty scaling, performs weighted
 * random selection, and handles collection with type-specific callbacks.
 */
export class LootSystem {
  private readonly _pickups: LootPickup[] = []
  private readonly policy: DropPolicy
  private readonly pickupRadius: number
  private readonly spawnYOffset: number
  private readonly onPowerupCollected: ((type: LootType) => void) | null
  private readonly onPickup: ((pickup: LootPickup) => void) | null
  private nextId = 1
  private elapsed = 0

  constructor(options: LootSystemOptions) {
    this.policy = options.policy
    this.pickupRadius = options.pickupRadius ?? DEFAULT_PICKUP_RADIUS
    this.spawnYOffset = options.spawnYOffset ?? DEFAULT_SPAWN_Y_OFFSET
    this.onPowerupCollected = options.onPowerupCollected ?? null
    this.onPickup = options.onPickup ?? null
  }

  /** Read-only view of active loot pickups for visual controllers. */
  get pickups(): readonly LootPickup[] {
    return this._pickups
  }

  /**
   * Attempt to spawn loot based on enemy type, current difficulty, and
   * drop table probabilities. Respects psychosphere policy. Returns the
   * spawned pickup or null if no drop triggered.
   *
   * Uses weighted selection from biasedDrops (sums to 1.0 per table).
   */
  trySpawnLoot(
    enemyType: string,
    position: { x: number; y: number; z: number },
    difficulty: number = 1,
  ): LootPickup | null {
    const table = DROP_TABLES.tables[enemyType]
    if (!table) return null

    // Chance scales with difficulty, clamped [0,1]. No magic numbers.
    const chance = Math.min(1, table.baseChance + (difficulty - 1) * table.difficultyMultiplier)
    if (Math.random() > chance) return null

    // Pick the active weights table. When the contract policy arms
    // psychosphere, override the table's psychosphere weight to
    // PSYCHOSPHERE_ARMED_WEIGHT and renormalize the remaining powerups so the
    // total stays at 1.
    const psychosphereArmed = this.policy.isItemArmed(PSYCHOSPHERE_ITEM_ID)
    const weights = psychosphereArmed
      ? armedDropWeights(table.biasedDrops)
      : table.biasedDrops

    // Weighted random selection using cumulative probabilities
    const roll = Math.random()
    let cumulative = 0
    let selectedType: LootType = 'psychosphere'

    for (const [lootType, weight] of Object.entries(weights)) {
      cumulative += weight
      if (roll <= cumulative) {
        selectedType = lootType as LootType
        break
      }
    }

    // When the contract is not armed, any psychosphere roll falls back to a
    // powerup (psychosphere doesn't drop without a contract step asking for it).
    if (selectedType === 'psychosphere' && !psychosphereArmed) {
      selectedType = 'health'
    }

    const pickup: LootPickup = {
      id: this.nextId++,
      type: selectedType,
      position: {
        x: position.x,
        y: position.y + this.spawnYOffset,
        z: position.z,
      },
      spawnTime: this.elapsed,
      ...(selectedType === 'psychosphere' ? { itemId: PSYCHOSPHERE_ITEM_ID } : {}),
    }

    this._pickups.push(pickup)
    return pickup
  }

  /**
   * Advances simulation, performs cylindrical collection test (ignores Y
   * for terrain/player height tolerance), removes collected items, and
   * invokes the appropriate callback based on loot type.
   */
  tick(dt: number, playerPosition: { x: number; y: number; z: number }): readonly LootPickup[] {
    this.elapsed += dt
    if (this._pickups.length === 0) return EMPTY_LOOT_PICKUPS

    const radiusSq = this.pickupRadius * this.pickupRadius
    const collected: LootPickup[] = []

    // Iterate backwards for safe splicing
    for (let i = this._pickups.length - 1; i >= 0; i--) {
      const pickup = this._pickups[i]!
      const dx = pickup.position.x - playerPosition.x
      const dz = pickup.position.z - playerPosition.z
      if (dx * dx + dz * dz <= radiusSq) {
        this._pickups.splice(i, 1)
        collected.push(pickup)
      }
    }

    if (collected.length > 0) {
      for (const pickup of collected) {
        try {
          if (pickup.type === 'psychosphere' && this.onPickup) {
            this.onPickup(pickup)
          } else if (this.onPowerupCollected) {
            this.onPowerupCollected(pickup.type)
          }
        } catch {
          // Isolate callback errors (mirrors DropSystem robustness)
        }
      }
    }

    return collected
  }

  /** Clears all live pickups (e.g. level reset). */
  clear(): void {
    this._pickups.length = 0
  }
}
