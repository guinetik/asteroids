/**
 * Shared arrow-key keyboard look helper for FPS-style controllers.
 *
 * Originally added to give the FPS sandbox a way to look around on a laptop
 * trackpad. The same four-action read + angular-rate scaling is reused by
 * the `/station`, `/level`, and `/habitat` controllers, so the logic and
 * the rate constant live here instead of being duplicated per scene.
 *
 * @author guinetik
 * @date 2026-05-16
 */
import type { InputManager } from '@/lib/InputManager'
import type { FpsCamera } from '@/three/FpsCamera'

/**
 * Angular rate for arrow-key keyboard look (radians per second).
 * Roughly 120°/s — fast enough to spin around to face a threat without
 * feeling sluggish, slow enough to be useable for coarse aiming on a
 * laptop trackpad where mouse look isn't practical.
 */
export const KEYBOARD_LOOK_RATE_RAD_PER_SEC = Math.PI * (2 / 3)

/**
 * Multiplier applied to {@link KEYBOARD_LOOK_RATE_RAD_PER_SEC} while the
 * player is aiming down sights. Standard FPS feel — turn slows for
 * precise reticle placement when ADS is active.
 */
export const KEYBOARD_LOOK_ADS_MULTIPLIER = 0.4

/**
 * Read the four `lookUp/Down/Left/Right` actions from the supplied input
 * manager and feed the result to the camera as a single look delta.
 * No-op when no look key is held.
 *
 * Mouse look (via `applyMouseDelta`) and keyboard look both feed the same
 * yaw/pitch, so the two can be used together — deltas simply sum. When
 * `aiming` is true the turn rate is multiplied by
 * {@link KEYBOARD_LOOK_ADS_MULTIPLIER} for precise reticle placement.
 *
 * @param input - Input manager whose bindings include the four look actions.
 * @param camera - Camera receiving the look delta.
 * @param dt - Frame delta in seconds.
 * @param aiming - Whether the player is currently ADS'd.
 */
export function applyKeyboardLook(
  input: InputManager,
  camera: FpsCamera,
  dt: number,
  aiming = false,
): void {
  const multiplier = aiming ? KEYBOARD_LOOK_ADS_MULTIPLIER : 1
  const rate = KEYBOARD_LOOK_RATE_RAD_PER_SEC * multiplier * dt
  let yawDelta = 0
  let pitchDelta = 0
  if (input.isActionActive('lookLeft')) yawDelta -= rate
  if (input.isActionActive('lookRight')) yawDelta += rate
  if (input.isActionActive('lookUp')) pitchDelta -= rate
  if (input.isActionActive('lookDown')) pitchDelta += rate
  if (yawDelta !== 0 || pitchDelta !== 0) {
    camera.applyLookDelta(yawDelta, pitchDelta)
  }
}
