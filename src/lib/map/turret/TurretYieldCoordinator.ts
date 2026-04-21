/**
 * Bridge between {@link RockYieldSystem}, the asteroid belt instance layer,
 * and inventory. Owns the per-session spawnIndex → handle map and buffers
 * fractional kg yields until whole-unit inventory commits are possible.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import type { Vector3 } from 'three'
import type { TurretTierId } from './turretTiers'
import { TURRET_YIELD_COMMIT_GRANULARITY_KG } from './turretConstants'

/** Per-instance handle a coordinator stores for lookup/hide callbacks. */
export interface TurretInstanceHandle {
  /** Which belt mesh (index into AsteroidBeltController.instanceDataList) owns the instance. */
  readonly beltMeshIndex: number
  /** Instance index within that mesh. */
  readonly localIndex: number
  /** World-space sphere center (snapshotted at turret-open time; sim is frozen). */
  readonly worldPosition: Vector3
  /** Collision radius in world units. */
  readonly radius: number
  /** Tier classification for loot/HP. */
  readonly tierId: TurretTierId
}

/** Result of a single inventory commit attempt. */
export type CommitResult = { ok: true } | { ok: false; reason: string }

/** Collaborators TurretYieldCoordinator leans on. */
export interface TurretYieldCoordinatorDeps {
  /** Commit one whole unit of itemId to inventory; failure halts buffer drain. */
  commitOneUnit: (itemId: string) => CommitResult
  /** Fires when a registered rock depletes (coordinator cleans up). */
  onInstanceConsumed: (handle: TurretInstanceHandle) => void
  /** Fires when commitOneUnit rejects — host surfaces a toast. */
  onPickupFailed: (itemId: string, reason: string) => void
}

/** Coordinator state for one turret session. */
export class TurretYieldCoordinator {
  private readonly deps: TurretYieldCoordinatorDeps
  private readonly handles = new Map<number, TurretInstanceHandle>()
  private readonly buffers = new Map<string, number>()
  private nextSpawnIndex = 0

  /** @param deps - Injected collaborators for commits and lifecycle callbacks. */
  constructor(deps: TurretYieldCoordinatorDeps) {
    this.deps = deps
  }

  /** Register a belt instance with this coordinator; returns the assigned spawnIndex. */
  register(handle: TurretInstanceHandle): number {
    const spawnIndex = this.nextSpawnIndex++
    this.handles.set(spawnIndex, handle)
    return spawnIndex
  }

  /** Get the handle for a spawnIndex, or null if unknown. */
  resolveInstance(spawnIndex: number): TurretInstanceHandle | null {
    return this.handles.get(spawnIndex) ?? null
  }

  /** Accept fractional kg yield from the beam and commit full units. */
  acceptYield(itemId: string, kg: number, _spawnIndex: number): void {
    const current = (this.buffers.get(itemId) ?? 0) + kg
    let remaining = current
    while (remaining >= TURRET_YIELD_COMMIT_GRANULARITY_KG) {
      const result = this.deps.commitOneUnit(itemId)
      if (!result.ok) {
        this.deps.onPickupFailed(itemId, result.reason)
        // Drop remainder for this item to avoid tight-loop on persistent failure.
        remaining = 0
        break
      }
      remaining -= TURRET_YIELD_COMMIT_GRANULARITY_KG
    }
    if (remaining > 0) {
      this.buffers.set(itemId, remaining)
    } else {
      this.buffers.delete(itemId)
    }
  }

  /** Called when RockYieldSystem.onConsume fires — forwards to host for hide/particle burst. */
  notifyDepleted(spawnIndex: number): void {
    const handle = this.handles.get(spawnIndex)
    if (!handle) return
    this.handles.delete(spawnIndex)
    this.deps.onInstanceConsumed(handle)
  }

  /** Snapshot of currently registered instances (for beam raycast list). */
  listInstances(): { spawnIndex: number; handle: TurretInstanceHandle }[] {
    const result: { spawnIndex: number; handle: TurretInstanceHandle }[] = []
    for (const [spawnIndex, handle] of this.handles) {
      result.push({ spawnIndex, handle })
    }
    return result
  }

  /** Total registrations (including depleted) — stable key generator. */
  get registrationCount(): number {
    return this.nextSpawnIndex
  }

  /** Drop all registrations and fractional buffers (on session close). */
  clear(): void {
    this.handles.clear()
    this.buffers.clear()
    this.nextSpawnIndex = 0
  }
}
