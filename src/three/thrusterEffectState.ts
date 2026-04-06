/**
 * Pure state resolution for shuttle thruster particle effects.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-04-shuttle-scene-design.md
 */

/**
 * Emission state for the shuttle's main thrust and brake particle systems.
 */
export interface ThrusterEffectState {
  /** True when the orange engine trail should emit. */
  emitThrust: boolean
  /** True when the blue brake burst should emit. */
  emitBrake: boolean
  /** True when the rear engines should show a subtle always-on idle plume. */
  emitIdleThrust: boolean
}

/**
 * Resolve which shuttle emitters should be active this frame.
 *
 * @param isThrusting - Whether gameplay thrust is currently active.
 * @param isBraking - Whether gameplay braking is currently active.
 * @param hasFuel - Whether the shuttle still has fuel available.
 * @param slingshotLaunchFxActive - Whether the temporary launch burst VFX is active.
 * @returns Final engine/brake emitter state for the frame.
 */
export function resolveThrusterEffectState(
  isThrusting: boolean,
  isBraking: boolean,
  hasFuel: boolean,
  slingshotLaunchFxActive: boolean,
): ThrusterEffectState {
  if (slingshotLaunchFxActive) {
    return {
      emitThrust: true,
      emitBrake: true,
      emitIdleThrust: false,
    }
  }

  return {
    emitThrust: isThrusting,
    emitBrake: isBraking,
    emitIdleThrust: hasFuel && !isThrusting,
  }
}
