/**
 * Pure turret aim math. Single 360° yaw + clamped pitch, driven entirely by
 * mouse deltas. Mouse-right maps to "look right" (turret rotates clockwise
 * from above = THREE rotation.y decreasing), matching the FPS convention
 * used elsewhere in the codebase.
 *
 * @author guinetik
 * @date 2026-04-20
 * @spec docs/superpowers/specs/2026-04-20-turret-mode-design.md
 */
import { TURRET_MOUSE_SENSITIVITY, TURRET_PITCH_LIMIT } from './turretConstants'

/** Turret aim state — immutable snapshot. */
export interface TurretAimState {
  /** World-relative yaw of the turret base (radians). Unclamped — full 360° rotation. */
  readonly baseYaw: number
  /** Camera pitch from horizontal (radians). Clamped to `±TURRET_PITCH_LIMIT`. */
  readonly conePitch: number
}

/** Per-tick input bag for {@link tickTurretAim}. */
export interface TurretAimInput {
  /** Mouse x delta in pixels this frame. Positive = mouse moved right. */
  readonly mouseDx: number
  /** Mouse y delta in pixels this frame. Positive = mouse moved down. */
  readonly mouseDy: number
}

/** Build an identity aim state (turret facing shuttle-forward, camera level). */
export function createTurretAimState(): TurretAimState {
  return { baseYaw: 0, conePitch: 0 }
}

/**
 * Advance one tick of aim state. Pure — no side effects.
 *
 * @param state - Current aim state.
 * @param input - Mouse input for this frame.
 * @returns Next aim state snapshot.
 */
export function tickTurretAim(state: TurretAimState, input: TurretAimInput): TurretAimState {
  // Mouse right (positive dx) should turn the camera right. In THREE, camera yaw
  // rotates CCW when rotation.y is positive, so right-look needs rotation.y to
  // decrease. Subtract mouseDx.
  const baseYaw = state.baseYaw - input.mouseDx * TURRET_MOUSE_SENSITIVITY
  // Mouse up (negative dy) should tilt view up (positive pitch). Subtract mouseDy.
  const rawPitch = state.conePitch - input.mouseDy * TURRET_MOUSE_SENSITIVITY
  const conePitch = clamp(rawPitch, -TURRET_PITCH_LIMIT, TURRET_PITCH_LIMIT)
  return { baseYaw, conePitch }
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
