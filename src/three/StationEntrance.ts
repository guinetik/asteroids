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

// Pure-data layout types live in `src/lib/station/StationLayout.ts`; this
// file owns only the runtime Three.js wrapper.
export type {
  EntranceOpenStyle,
  EntranceSide,
  EntranceSpec,
  EntranceTarget,
} from '@/lib/station/StationLayout'
import type { EntranceOpenStyle } from '@/lib/station/StationLayout'

/** Animation seconds the door takes to open fully. */
const DOOR_OPEN_DURATION = 0.55
/** Hinge rotation (radians) for a `'full'` open — door swings clear of the frame. */
const DOOR_ANGLE_FULL = Math.PI / 2
/** Hinge rotation (radians) for a `'crack'` open — door barely cracks. */
const DOOR_ANGLE_CRACK = 0.18
/** Seconds the door stays held open before auto-closing behind the player. */
const DOOR_HOLD_DURATION = 0.4
/** Seconds the door takes to swing back closed. */
const DOOR_CLOSE_DURATION = 0.45

/**
 * Animation phase for the entrance door:
 *
 * - `idle`: closed, waiting for interaction.
 * - `opening`: hinge sweeping from closed → open angle.
 * - `open`: held at the open angle while the player walks through.
 * - `closing`: hinge sweeping back to closed.
 * - `done`: fully closed again; the entrance has been "used" and the
 *   controller no longer surfaces a prompt for it.
 */
type DoorPhase = 'idle' | 'opening' | 'open' | 'closing' | 'done'

/**
 * Runtime instance of an entrance: the assembled scene group + cached
 * world-space anchor used for proximity tests + a simple open animation
 * driven by {@link tick}.
 */
export class StationEntrance {
  /** Root group containing the entrance frame + fitted door. */
  readonly group: Group
  /** Prompt string the controller forwards to the HUD. */
  readonly prompt: string
  /** Event id dispatched when the player interacts with this entrance. */
  readonly event: string
  /** How far the door opens before firing the event. */
  readonly openStyle: EntranceOpenStyle

  private readonly hinge: Object3D
  private readonly hingeClosedAngle: number
  private readonly openAngle: number
  /** Current animation phase. */
  private phase: DoorPhase = 'idle'
  /** Elapsed seconds within the current phase. */
  private phaseT = 0
  /** Reused scratch for {@link anchor}. */
  private readonly _anchorScratch = new Vector3()

  /**
   * Current world-space position of the entrance, recomputed each read
   * from the group's world matrix. Lets a single entrance be placed
   * under any parent transform (e.g. the room's world wrapper) without
   * the controller needing to know about the chain.
   */
  get anchor(): Vector3 {
    this.group.updateWorldMatrix(true, false)
    return this.group.getWorldPosition(this._anchorScratch)
  }
  /** Fired exactly once when the open animation reaches its target. */
  private onComplete: (() => void) | null = null

  /**
   * Build an entrance instance from its assembled group + door.
   *
   * @param group - Three.js group containing the entrance frame + door.
   * @param prompt - Prompt text shown when in range.
   * @param event - Event id dispatched on interact.
   * @param hinge - Hinge group whose `rotation.y` swings the door open.
   * @param openStyle - `'crack'` or `'full'`. Defaults to `'full'`.
   */
  constructor(
    group: Group,
    prompt: string,
    event: string,
    hinge: Object3D,
    openStyle: EntranceOpenStyle = 'full',
  ) {
    this.group = group
    this.prompt = prompt
    this.event = event
    this.openStyle = openStyle
    this.hinge = hinge
    this.hingeClosedAngle = hinge.rotation.y
    this.openAngle = openStyle === 'crack' ? DOOR_ANGLE_CRACK : DOOR_ANGLE_FULL
  }

  /** True while the door is mid-animation (opening, held open, or closing). */
  get isOpening(): boolean {
    return this.phase === 'opening' || this.phase === 'open' || this.phase === 'closing'
  }

  /** True once the entrance has been used (closed, won't surface a prompt again). */
  get isOpened(): boolean {
    return this.phase !== 'idle'
  }

  /**
   * Begin the open animation. Idempotent — subsequent calls before the
   * entrance returns to `idle` are ignored. `onComplete` fires exactly
   * once, the moment the door reaches its open angle.
   *
   * @param onComplete - Invoked when the door is fully (or crack-) open.
   */
  triggerOpen(onComplete: () => void): void {
    if (this.phase !== 'idle') return
    this.phase = 'opening'
    this.phaseT = 0
    this.onComplete = onComplete
  }

  /**
   * Advance the open → hold → close animation. No-op while `idle` or
   * `done`.
   *
   * @param dt - Frame delta in seconds.
   */
  tick(dt: number): void {
    if (this.phase === 'idle' || this.phase === 'done') return
    this.phaseT += dt
    switch (this.phase) {
      case 'opening': {
        const t = Math.min(1, this.phaseT / DOOR_OPEN_DURATION)
        this.hinge.rotation.y = this.hingeClosedAngle + this.openAngle * t
        if (t >= 1) {
          this.phase = 'open'
          this.phaseT = 0
          const cb = this.onComplete
          this.onComplete = null
          cb?.()
        }
        break
      }
      case 'open': {
        if (this.phaseT >= DOOR_HOLD_DURATION) {
          this.phase = 'closing'
          this.phaseT = 0
        }
        break
      }
      case 'closing': {
        const t = Math.min(1, this.phaseT / DOOR_CLOSE_DURATION)
        this.hinge.rotation.y = this.hingeClosedAngle + this.openAngle * (1 - t)
        if (t >= 1) {
          this.phase = 'done'
        }
        break
      }
    }
  }
}
