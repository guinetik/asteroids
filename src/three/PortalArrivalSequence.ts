/**
 * Reusable portal arrival orchestrator for any scene with a SpaceTimeGrid.
 *
 * Two arrival modes depending on whether an `anchorPos` with Y > 0 is supplied:
 *
 * **Elevated arrival (Y > 0)** — used when spawning above a planet.
 * The vehicle starts at wormhole height, descends to Y=0 during the collapse
 * phase, then {@link PortalArrivalSequence.onComplete} fires so the caller can
 * begin a forced orbit. No free-flight velocity is applied.
 *
 * **Flat arrival (Y = 0)** — original behaviour. After the eject pulse the
 * vehicle is unfrozen with a forward velocity and {@link PortalArrivalSequence.onComplete}
 * fires after wormhole cleanup.
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

/** Random orbital radius used when no anchor position is supplied. */
const PORTAL_SPAWN_RADIUS = 450
/** Default eject speed (m/s) for flat arrivals when the portal sends no speed param. */
const PORTAL_DEFAULT_EJECT_SPEED = 40
/** Duration in seconds for the elevated descent animation (wormhole Y → 0). */
const PORTAL_DESCENT_DURATION = 2.5

/** Smooth ease-out curve: fast start, soft landing. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** Optional overrides for {@link PortalArrivalSequence.tryArrive}. */
export interface PortalArrivalOptions {
  /**
   * World-space position to spawn the wormhole. When `y > 0` the sequence uses
   * the elevated arrival mode: vehicle starts at this height and descends to 0
   * before {@link PortalArrivalSequence.onComplete} fires. The simulation should
   * be frozen beforehand so the anchor stays static for the full animation.
   * Defaults to a random orbital position at {@link PORTAL_SPAWN_RADIUS} with Y=0.
   */
  anchorPos?: THREE.Vector3
  /**
   * Core sphere radius of the wormhole in world units.
   * Defaults to the built-in `WORMHOLE_RADIUS` constant (level scale).
   * Pass `displayRadius * SIZE_SCALE` to match a planet's apparent size.
   */
  radius?: number
  /**
   * When `true`, {@link PortalArrivalSequence.tryArrive} positions the vehicle
   * and spawns the wormhole but does **not** call `eject()` automatically.
   * The caller is responsible for calling {@link PortalArrivalSequence.eject}
   * when it wants the summon → eject → collapse sequence to begin.
   * Useful for cinematic pre-delays (e.g. showing Earth alone before the portal
   * appears, then showing the portal before the ship is ejected).
   */
  manualEject?: boolean
}

/**
 * Orchestrates a portal arrival: wormhole spawn → summon → eject/descend → complete.
 *
 * Usage:
 * ```ts
 * const arrival = new PortalArrivalSequence()
 * arrival.onComplete = () => { ... }
 * const arrived = arrival.tryArrive(vehicle, grid, scene, tickPriority, { anchorPos })
 * // returns true if player arrived via portal, false for normal spawn
 * ```
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
export class PortalArrivalSequence {
  private wormhole: PortalWormhole | null = null
  /** Active descent tickable — non-null only during elevated arrival descent. */
  private descentTickable: Tickable | null = null

  /** The parsed VibePortal instance, available after construction. */
  readonly portal = new VibePortal()

  /**
   * Fires at the start of the descent phase (elevated mode only) — when the eject
   * pulse triggers and the ship begins dropping from wormhole height to Y=0.
   * Use this to switch the camera from a static cinematic shot to following the ship.
   */
  onDescentStart: (() => void) | null = null

  /**
   * Called when the arrival sequence fully completes:
   * - Elevated mode: fires when the vehicle reaches Y=0.
   * - Flat mode: fires after wormhole cleanup.
   * Use this to resume the simulation, begin a forced orbit, etc.
   */
  onComplete: (() => void) | null = null

  /** Whether the player arrived via a portal. */
  get isArrival(): boolean {
    return this.portal.isArrival
  }

  /**
   * Manually trigger the summon → eject → collapse sequence.
   * Only relevant when {@link PortalArrivalOptions.manualEject} was `true`.
   * No-op if the wormhole is not in `idle` state or hasn't been spawned.
   */
  eject(): void {
    this.wormhole?.eject()
  }

  /**
   * Show or hide the wormhole.
   * Passing `true` triggers the scale-from-zero {@link PortalWormhole.reveal} animation
   * rather than a hard visibility flip, so the portal materialises smoothly.
   * Passing `false` hides the group immediately (used during the pre-arrival hold).
   *
   * @param visible - `true` to animate-reveal the portal, `false` to hide it instantly.
   */
  setWormholeVisible(visible: boolean): void {
    if (!this.wormhole) return
    if (visible) {
      this.wormhole.reveal()
    } else {
      this.wormhole.group.visible = false
    }
  }

  /**
   * If the player arrived via portal, spawn a wormhole and run the arrival
   * sequence. Returns true if arrival was handled, false for normal spawn.
   *
   * @param vehicle - The vehicle to position and animate
   * @param grid - SpaceTimeGrid for wormhole deformation
   * @param scene - Scene services for add/remove/tick registration
   * @param tickPriority - Priority for wormhole and descent tickables
   * @param options - Optional overrides (e.g. anchor position above a planet)
   */
  tryArrive(
    vehicle: PortalVehicle,
    grid: PortalGrid,
    scene: PortalScene,
    tickPriority: number,
    options?: PortalArrivalOptions,
  ): boolean {
    if (!this.portal.isArrival) return false

    // Resolve wormhole spawn position
    let wormholePos: THREE.Vector3
    if (options?.anchorPos) {
      wormholePos = options.anchorPos.clone()
    } else {
      const angle = Math.random() * Math.PI * 2
      wormholePos = new THREE.Vector3(
        Math.cos(angle) * PORTAL_SPAWN_RADIUS,
        0,
        Math.sin(angle) * PORTAL_SPAWN_RADIUS,
      )
    }

    const elevated = wormholePos.y > 0

    this.wormhole = new PortalWormhole(wormholePos, grid, options?.radius)
    scene.addToScene(this.wormhole.group)
    scene.registerTick(this.wormhole, tickPriority)

    // Place vehicle at the wormhole position (elevated or flat)
    vehicle.group.position.set(wormholePos.x, wormholePos.y, wormholePos.z)
    vehicle.freeze()
    vehicle.setIgnoreGridY(true)

    // Random heading
    vehicle.group.rotation.y = Math.random() * Math.PI * 2

    if (elevated) {
      // ── Elevated arrival ──────────────────────────────────────────────────
      // Eject pulse triggers the descent animation. The vehicle stays frozen
      // throughout — no free-flight velocity is applied. onComplete fires when
      // Y reaches 0 so the caller can immediately begin a forced orbit.
      const startY = wormholePos.y

      this.wormhole.onEject = () => {
        this.onDescentStart?.()

        let elapsed = 0

        this.descentTickable = {
          tick: (dt: number) => {
            elapsed += dt
            const t = Math.min(elapsed / PORTAL_DESCENT_DURATION, 1)
            vehicle.group.position.y = startY * (1 - easeOut(t))

            if (t >= 1) {
              vehicle.group.position.y = 0
              vehicle.setIgnoreGridY(false)
              scene.unregisterTick(this.descentTickable!)
              this.descentTickable = null
              this.onComplete?.()
            }
          },
        }

        scene.registerTick(this.descentTickable, tickPriority)
      }

      // Wormhole cleanup only — onComplete already fired from descent
      this.wormhole.onDone = () => {
        if (this.wormhole) {
          scene.unregisterTick(this.wormhole)
          this.wormhole.dispose()
          scene.removeFromScene(this.wormhole.group)
          this.wormhole = null
        }
      }
    } else {
      // ── Flat arrival ──────────────────────────────────────────────────────
      // Original behaviour: unfreeze + forward velocity on eject, onComplete
      // fires after wormhole collapse cleanup.
      this.wormhole.onEject = () => {
        vehicle.unfreeze()
        const forward = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(vehicle.group.quaternion)
        forward.y = 0
        forward.normalize()
        const speed = this.portal.arrival.speed ?? PORTAL_DEFAULT_EJECT_SPEED
        vehicle.setVelocity(forward.multiplyScalar(speed))
      }

      this.wormhole.onDone = () => {
        vehicle.setIgnoreGridY(false)
        if (this.wormhole) {
          scene.unregisterTick(this.wormhole)
          this.wormhole.dispose()
          scene.removeFromScene(this.wormhole.group)
          this.wormhole = null
        }
        this.onComplete?.()
      }
    }

    // Start the sequence unless the caller wants manual control
    if (!options?.manualEject) {
      this.wormhole.eject()
    }

    return true
  }

  /** Clean up if the scene disposes before the sequence finishes. */
  dispose(): void {
    this.wormhole?.dispose()
    this.wormhole = null
    this.descentTickable = null
  }
}
