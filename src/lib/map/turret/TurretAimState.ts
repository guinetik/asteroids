/**
 * Pure turret aim math. Tracks the rotating turret base (A/D traverse) plus
 * the camera's local cone-relative pitch/yaw from mouse deltas.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import {
  TURRET_CONE_HALF_ANGLE,
  TURRET_MOUSE_SENSITIVITY,
  TURRET_PITCH_LIMIT,
  TURRET_TRAVERSE_SPEED,
} from './turretConstants'

/** Turret aim state — immutable snapshot. */
export interface TurretAimState {
  /** World-relative yaw of the turret base (radians). Accumulates across A/D input. */
  readonly baseYaw: number
  /** Camera yaw within the cone, relative to the base (radians). Clamped. */
  readonly coneYaw: number
  /** Camera pitch from horizontal (radians). Clamped. */
  readonly conePitch: number
}

/** Per-tick input bag for {@link tickTurretAim}. */
export interface TurretAimInput {
  /** Key yaw axis: -1 (left), 0, +1 (right). */
  readonly yawAxis: number
  /** Mouse x delta in pixels this frame. */
  readonly mouseDx: number
  /** Mouse y delta in pixels this frame. */
  readonly mouseDy: number
}

/** Build an identity aim state (camera pointing straight down the base forward). */
export function createTurretAimState(): TurretAimState {
  return { baseYaw: 0, coneYaw: 0, conePitch: 0 }
}

/**
 * Advance one tick of aim state. Pure — no side effects.
 *
 * @param state - Current aim state.
 * @param input - Raw key + mouse input for this frame.
 * @param dt - Delta time in seconds.
 * @returns Next aim state snapshot.
 */
export function tickTurretAim(
  state: TurretAimState,
  input: TurretAimInput,
  dt: number,
): TurretAimState {
  const baseYaw = state.baseYaw + input.yawAxis * TURRET_TRAVERSE_SPEED * dt

  // Mouse X moves the camera yaw within the cone. Positive mouseDx (mouse right) maps to
  // positive coneYaw (look right), matching the test contract and Three.js euler convention.
  const rawConeYaw = state.coneYaw + input.mouseDx * TURRET_MOUSE_SENSITIVITY
  const coneYaw = clamp(rawConeYaw, -TURRET_CONE_HALF_ANGLE, TURRET_CONE_HALF_ANGLE)

  // Mouse Y moves pitch; up mouse = look up.
  const rawConePitch = state.conePitch - input.mouseDy * TURRET_MOUSE_SENSITIVITY
  const conePitch = clamp(rawConePitch, -TURRET_PITCH_LIMIT, TURRET_PITCH_LIMIT)

  return { baseYaw, coneYaw, conePitch }
}

/**
 * Clamps a value between min and max (inclusive).
 *
 * @param value - The number to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
