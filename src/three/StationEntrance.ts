/**
 * A single entrance to a {@link StationRoom}. Wraps the `entrance.glb`
 * specialised wall piece + a fitted `door.glb` and remembers its world
 * anchor + the event id it dispatches on interact, so the controller can
 * do generic per-frame proximity checks without hard-coding any room
 * geometry.
 *
 * Designed to be data-driven: a room spec lists `EntranceSpec` records
 * by side + tile index, the builder instantiates one {@link StationEntrance}
 * per spec, and the view controller iterates the room's entrance list
 * each tick. Procedurally generated rooms compose by stitching together
 * room specs whose entrances connect to neighbouring rooms.
 *
 * @author guinetik
 * @date 2026-05-13
 */
import { Group, Vector3, type Object3D } from 'three'

/** Cardinal side of a room a {@link StationEntrance} sits on. */
export type EntranceSide = 'N' | 'S' | 'E' | 'W'

/**
 * How wide the door opens when interacted with:
 * - `'crack'`: opens just a sliver before firing the event — for exits
 *   the player is *leaving* through (e.g. egress to space), where a
 *   full open is wasted animation since the room is about to unload.
 * - `'full'`: opens all the way before firing the event — for doors
 *   between rooms the player walks through.
 */
export type EntranceOpenStyle = 'crack' | 'full'

/** Data-only description of a single entrance on a room. */
export interface EntranceSpec {
  /** Which perimeter wall the entrance sits in. */
  side: EntranceSide
  /**
   * 0-based wall-tile index along that side. For `N` / `S` the index runs
   * along X (0..width-1); for `E` / `W` it runs along Z (0..depth-1).
   */
  index: number
  /** Storey index this entrance lives on. Defaults to 0. */
  storey?: number
  /** Prompt text to show when the player is in range (e.g. `'F  Leave'`). */
  prompt: string
  /** Identifier passed to `onInteract` when the player triggers it. */
  event: string
  /** How wide the door opens before firing the event. Defaults to `'full'`. */
  openStyle?: EntranceOpenStyle
}

/** Animation seconds the door takes to open fully. */
const DOOR_OPEN_DURATION = 0.55
/** Hinge rotation (radians) for a `'full'` open — door swings clear of the frame. */
const DOOR_ANGLE_FULL = Math.PI / 2
/** Hinge rotation (radians) for a `'crack'` open — door barely cracks. */
const DOOR_ANGLE_CRACK = 0.18

/**
 * Runtime instance of an entrance: the assembled scene group + cached
 * world-space anchor used for proximity tests + a simple open animation
 * driven by {@link tick}.
 */
export class StationEntrance {
  /** Root group containing the entrance frame + fitted door. */
  readonly group: Group
  /** World-space position used for the proximity check. */
  readonly anchor: Vector3
  /** Prompt string the controller forwards to the HUD. */
  readonly prompt: string
  /** Event id dispatched when the player interacts with this entrance. */
  readonly event: string
  /** How far the door opens before firing the event. */
  readonly openStyle: EntranceOpenStyle

  private readonly hinge: Object3D
  private readonly hingeClosedAngle: number
  private readonly openAngle: number
  /** 0..1 progress through the open animation. */
  private openProgress = 0
  /** True once {@link triggerOpen} fires and the animation begins. */
  private opening = false
  /** True once the animation reaches 1.0 — re-entry guards. */
  private completed = false
  /** Fired exactly once when {@link openProgress} hits 1.0. */
  private onComplete: (() => void) | null = null

  /**
   * Build an entrance instance from its assembled group + anchor + door.
   *
   * @param group - Three.js group containing the entrance frame + door.
   * @param anchor - World position the controller measures distance from.
   * @param prompt - Prompt text shown when in range.
   * @param event - Event id dispatched on interact.
   * @param hinge - Hinge group whose `rotation.y` swings the door open.
   * @param openStyle - `'crack'` or `'full'`. Defaults to `'full'`.
   */
  constructor(
    group: Group,
    anchor: Vector3,
    prompt: string,
    event: string,
    hinge: Object3D,
    openStyle: EntranceOpenStyle = 'full',
  ) {
    this.group = group
    this.anchor = anchor.clone()
    this.prompt = prompt
    this.event = event
    this.openStyle = openStyle
    this.hinge = hinge
    this.hingeClosedAngle = hinge.rotation.y
    this.openAngle = openStyle === 'crack' ? DOOR_ANGLE_CRACK : DOOR_ANGLE_FULL
  }

  /** True if the door is currently animating open. */
  get isOpening(): boolean {
    return this.opening && !this.completed
  }

  /** True once the open animation has finished (latched). */
  get isOpened(): boolean {
    return this.completed
  }

  /**
   * Begin the open animation. Idempotent — subsequent calls before
   * completion are ignored. The callback fires exactly once when the
   * animation reaches 1.0.
   *
   * @param onComplete - Invoked when the door is fully (or crack-) open.
   */
  triggerOpen(onComplete: () => void): void {
    if (this.opening) return
    this.opening = true
    this.onComplete = onComplete
  }

  /**
   * Advance the open animation. No-op when the door is closed or already
   * finished.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (!this.opening || this.completed) return
    this.openProgress = Math.min(1, this.openProgress + dt / DOOR_OPEN_DURATION)
    this.hinge.rotation.y = this.hingeClosedAngle + this.openAngle * this.openProgress
    if (this.openProgress >= 1) {
      this.completed = true
      const cb = this.onComplete
      this.onComplete = null
      cb?.()
    }
  }
}
