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
}
