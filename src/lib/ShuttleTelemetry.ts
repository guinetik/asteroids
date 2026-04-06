/**
 * All shuttle data pushed to the HUD each frame.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
export interface ShuttleTelemetry {
  speed: number
  heading: number
  posX: number
  posZ: number
  fuelLevel: number
  fuelCapacity: number
  thrustCharge: number
  thrustCapacity: number
  brakeCharge: number
  brakeCapacity: number
  rcsCharge: number
  rcsCapacity: number
  /** Seconds remaining before adrift game over. -1 when not adrift. */
  adriftCountdown: number
}

/** Gravity danger state pushed to the HUD each frame. */
export interface GravityWarningState {
  /** 0 = safe (outside influence), 1 = at event horizon */
  proximity: number
  /** Name of the nearest massive body, or null if none */
  bodyName: string | null
  /** Whether the warning is visible (proximity > 0) */
  visible: boolean
}
