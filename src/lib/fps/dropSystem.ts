/**
 * Enemy drop / pickup pipeline for the FPS layer.
 *
 * Decouples three concerns:
 * 1. **Policy** — is a given drop "armed" right now? Backed by the contract
 *    system so contracts (or any other rule) can light up loot data-driven.
 * 2. **Spawn** — when an armed enemy dies, materialize a pickup at its last
 *    known position. Pickups are pure domain entities (`PickupEntity`); the
 *    Three.js layer turns them into meshes via {@link DropSystem.pickups}.
 * 3. **Collection** — every tick the level VC calls {@link DropSystem.tick}
 *    with the player position; overlapping pickups are removed and each
 *    triggers `onPickup`, which adds to inventory and notifies the contract.
 *
 * The FPS layer never imports the contract module directly — it talks to
 * {@link DropPolicy} only. That keeps the loot rule swappable for tests and
 * for future contracts that introduce new drop kinds.
 *
 * @author guinetik
 * @date 2026-04-23
 * @spec docs/contracts-cinderline.md
 */
import type { ContractSystem } from '@/lib/contracts/ContractSystem'

/**
 * Decides whether a virus death should spawn a drop right now. Implementations
 * are typically thin wrappers around the active contract slate, but tests and
 * future systems can substitute their own policy.
 */
export interface DropPolicy {
  /**
   * @param itemId - Inventory item id (e.g. `'viroid-psychosphere'`).
   * @returns `true` when at least one currently active rule wants drops of this item.
   */
  isItemArmed(itemId: string): boolean
}

/** A live pickup in the world waiting to be collected. */
export interface PickupEntity {
  /** Stable id for matching visuals to domain state. */
  readonly id: number
  /** Inventory item id this pickup grants on collection. */
  readonly itemId: string
  /** World-space position (XYZ). */
  readonly position: { x: number; y: number; z: number }
  /** Spawn time in seconds (monotonic) — useful for despawn / pulse animation. */
  readonly spawnTime: number
}

/**
 * Build a {@link DropPolicy} that consults the contract system: a drop is
 * armed iff there is an active contract whose current step is
 * `kind === 'collect-drops'` matching `itemId`.
 *
 * @param contracts - The shared {@link ContractSystem} singleton.
 * @returns Policy backed by `contracts.listInstances()`.
 */
export function createContractDropPolicy(contracts: ContractSystem): DropPolicy {
  return {
    isItemArmed(itemId: string): boolean {
      const instances = contracts.listInstances()
      for (const instance of instances) {
        if (instance.status !== 'active') continue
        const contract = contracts.getContract(instance.contractId)
        if (!contract) continue
        const step = contract.steps[instance.currentStepIndex]
        if (!step || step.kind !== 'collect-drops') continue
        if (step.itemId === itemId) return true
      }
      return false
    },
  }
}

/** Construction options for {@link DropSystem}. */
export interface DropSystemOptions {
  /** Policy that gates whether a drop materializes on enemy death. */
  policy: DropPolicy
  /**
   * Radius (world units) within which a player counts as "touching" a pickup.
   * Defaults to 1.5 units which is friendly to FPS movement speeds.
   */
  pickupRadius?: number
  /**
   * Vertical offset added to the enemy position on spawn so the pickup floats
   * slightly above the death point and stays visible on uneven terrain.
   * Defaults to 0.6.
   */
  spawnYOffset?: number
  /**
   * Called when the player overlaps a pickup. The host (LevelViewController /
   * FpsViewController) is responsible for adding the item to inventory and
   * forwarding the event to the contract system.
   *
   * @param pickup - The collected pickup entity (already removed from the live list).
   */
  onPickup?: (pickup: PickupEntity) => void
}

/**
 * Live drop-and-pickup loop for the FPS layer. Fully decoupled from Three.js
 * and Vue; the visual layer reads {@link pickups} each frame and renders meshes
 * on demand.
 */
export class DropSystem {
  private readonly _pickups: PickupEntity[] = []
  private readonly policy: DropPolicy
  private readonly pickupRadius: number
  private readonly spawnYOffset: number
  private nextId = 1
  private elapsed = 0
  private onPickupCb: ((pickup: PickupEntity) => void) | null = null

  constructor(options: DropSystemOptions) {
    this.policy = options.policy
    this.pickupRadius = options.pickupRadius ?? 1.5
    this.spawnYOffset = options.spawnYOffset ?? 0.6
    this.onPickupCb = options.onPickup ?? null
  }

  /** Read-only snapshot of currently live pickups. */
  get pickups(): readonly PickupEntity[] {
    return this._pickups
  }

  /**
   * Update or replace the pickup callback after construction (handy when the
   * inventory/contract bridge isn't available at instantiation time).
   *
   * @param cb - Replacement callback or null to disable.
   */
  setOnPickup(cb: ((pickup: PickupEntity) => void) | null): void {
    this.onPickupCb = cb
  }

  /**
   * Spawn a pickup at a world position if the policy says the item is armed.
   * Returns the pickup entity (or null if not armed).
   *
   * @param itemId - Inventory item id to spawn (e.g. `'viroid-psychosphere'`).
   * @param position - World-space spawn position; usually the enemy's last position.
   * @returns Spawned pickup entity, or null when policy filters it out.
   */
  spawnFor(itemId: string, position: { x: number; y: number; z: number }): PickupEntity | null {
    if (!this.policy.isItemArmed(itemId)) return null
    const pickup: PickupEntity = {
      id: this.nextId++,
      itemId,
      position: {
        x: position.x,
        y: position.y + this.spawnYOffset,
        z: position.z,
      },
      spawnTime: this.elapsed,
    }
    this._pickups.push(pickup)
    return pickup
  }

  /**
   * Drive overlap checks and clear collected pickups. Call once per frame
   * with the player's current world position.
   *
   * @param dt - Frame delta in seconds (drives the internal `elapsed` clock).
   * @param playerPosition - Player world position (XYZ).
   * @returns Pickups collected this frame (already removed from the live list).
   */
  tick(dt: number, playerPosition: { x: number; y: number; z: number }): readonly PickupEntity[] {
    this.elapsed += dt
    if (this._pickups.length === 0) return EMPTY_PICKUPS
    const radiusSq = this.pickupRadius * this.pickupRadius
    const collected: PickupEntity[] = []
    for (let i = this._pickups.length - 1; i >= 0; i--) {
      const pickup = this._pickups[i]!
      const dx = pickup.position.x - playerPosition.x
      const dy = pickup.position.y - playerPosition.y
      const dz = pickup.position.z - playerPosition.z
      if (dx * dx + dy * dy + dz * dz <= radiusSq) {
        this._pickups.splice(i, 1)
        collected.push(pickup)
      }
    }
    if (collected.length > 0 && this.onPickupCb) {
      for (const pickup of collected) {
        try {
          this.onPickupCb(pickup)
        } catch {
          // host-side errors must not break the loop
        }
      }
    }
    return collected
  }

  /** Remove all live pickups (e.g. on level teardown). */
  clear(): void {
    this._pickups.length = 0
  }
}

const EMPTY_PICKUPS: readonly PickupEntity[] = []
