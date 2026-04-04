/**
 * Reusable portal arrival orchestrator for any scene with a SpaceTimeGrid.
 *
 * Checks VibePortal for arrival, creates a PortalWormhole, freezes the
 * vehicle during summoning, ejects it forward, then cleans up after collapse.
 * The view controller only needs to call {@link tryArrive} during init.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { VibePortal } from '@/lib/portal'
import { PortalWormhole } from './PortalWormhole'

/** Vehicle capabilities required by the arrival sequence. */
export interface PortalVehicle {
  /** The vehicle's scene group (position, rotation, quaternion). */
  readonly group: THREE.Object3D
  /** Prevent all movement updates. */
  freeze(): void
  /** Resume movement updates. */
  unfreeze(): void
  /** Lock Y to 0, ignoring spacetime grid deformation. */
  setIgnoreGridY(ignore: boolean): void
  /** Set the vehicle's velocity vector. */
  setVelocity(v: THREE.Vector3): void
}

/** Scene services required by the arrival sequence. */
export interface PortalScene {
  /** Add an object to the Three.js scene. */
  addToScene(object: THREE.Object3D): void
  /** Remove an object from the Three.js scene. */
  removeFromScene(object: THREE.Object3D): void
  /** Register a tickable at the given priority. */
  registerTick(tickable: Tickable, priority: number): void
  /** Unregister a tickable from the tick handler. */
  unregisterTick(tickable: Tickable): void
}

/** Minimal grid interface — matches SpaceTimeGrid.addSource(). */
export interface PortalGrid {
  /** Register a gravity source for grid deformation. */
  addSource(source: { x: number; z: number; mass: number }): void
}

const PORTAL_SPAWN_RADIUS = 450
const PORTAL_DEFAULT_EJECT_SPEED = 40

/**
 * Orchestrates a portal arrival: wormhole spawn → summon → eject → collapse.
 *
 * Usage:
 * ```ts
 * const arrival = new PortalArrivalSequence()
 * const arrived = arrival.tryArrive(vehicle, grid, scene, tickPriority)
 * // returns true if player arrived via portal, false for normal spawn
 * ```
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
export class PortalArrivalSequence {
  private wormhole: PortalWormhole | null = null

  /** The parsed VibePortal instance, available after construction. */
  readonly portal = new VibePortal()

  /** Whether the player arrived via a portal. */
  get isArrival(): boolean {
    return this.portal.isArrival
  }

  /**
   * If the player arrived via portal, spawn a wormhole and run the
   * summoning → eject → collapse sequence. Returns true if arrival
   * was handled, false if the view should use its normal spawn logic.
   *
   * @param vehicle - The vehicle to position and eject
   * @param grid - SpaceTimeGrid for wormhole deformation
   * @param scene - Scene services for add/remove/tick registration
   * @param tickPriority - Priority for the wormhole's tick registration
   */
  tryArrive(
    vehicle: PortalVehicle,
    grid: PortalGrid,
    scene: PortalScene,
    tickPriority: number,
  ): boolean {
    if (!this.portal.isArrival) return false

    // Spawn wormhole at random orbital position
    const angle = Math.random() * Math.PI * 2
    const wormholePos = new THREE.Vector3(
      Math.cos(angle) * PORTAL_SPAWN_RADIUS,
      0,
      Math.sin(angle) * PORTAL_SPAWN_RADIUS,
    )

    this.wormhole = new PortalWormhole(wormholePos, grid)
    scene.addToScene(this.wormhole.group)
    scene.registerTick(this.wormhole, tickPriority)

    // Freeze vehicle at wormhole center, ignore grid Y until collapse ends
    vehicle.group.position.set(wormholePos.x, 0, wormholePos.z)
    vehicle.freeze()
    vehicle.setIgnoreGridY(true)

    // Random heading
    vehicle.group.rotation.y = Math.random() * Math.PI * 2

    // Summon → eject: unfreeze and push forward along vehicle's nose
    this.wormhole.onEject = () => {
      vehicle.unfreeze()
      const forward = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(vehicle.group.quaternion)
      forward.y = 0
      forward.normalize()
      const speed = this.portal.arrival.speed ?? PORTAL_DEFAULT_EJECT_SPEED
      vehicle.setVelocity(forward.multiplyScalar(speed))
    }

    // Start the sequence
    this.wormhole.eject()

    // Collapse cleanup
    this.wormhole.onDone = () => {
      vehicle.setIgnoreGridY(false)
      if (this.wormhole) {
        scene.unregisterTick(this.wormhole)
        this.wormhole.dispose()
        scene.removeFromScene(this.wormhole.group)
        this.wormhole = null
      }
    }

    return true
  }

  /** Clean up if the scene disposes before the wormhole collapses. */
  dispose(): void {
    this.wormhole?.dispose()
    this.wormhole = null
  }
}
