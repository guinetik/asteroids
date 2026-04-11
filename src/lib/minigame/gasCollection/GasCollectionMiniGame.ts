/**
 * Gas collection orbital minigame.
 *
 * 2D side-scrolling collection game: fly the shuttle, launch drones
 * with Q, collect them for gas yield proportional to air time.
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-10-gas-collection-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, Drone } from './types'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  SHIP_ACCELERATION,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  DRONE_GRAVITY,
  DRONE_LAUNCH_SPEED,
  DRONE_LAUNCH_ANGLE,
  DRONE_COLLECT_RADIUS,
  DRONE_GRACE_PERIOD,
  MAX_AIR_TIME_YIELD,
  MAX_DRONES,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
} from './constants'

/**
 * Gas collection minigame — fly the shuttle, launch and collect drones.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class GasCollectionMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Target gas amount to collect for mission completion. */
  readonly targetGas: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Collect atmospheric gas', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  /** Ship horizontal position in canvas pixels. */
  shipX = CANVAS_WIDTH / 2
  /** Ship vertical position in canvas pixels. */
  shipY = CANVAS_HEIGHT / 2
  /** Ship horizontal velocity in px/s. */
  shipVx = 0
  /** Ship vertical velocity in px/s. */
  shipVy = 0

  /** Active drones in flight. */
  drones: Drone[] = []
  /** Drones remaining to launch. */
  dronesRemaining = MAX_DRONES
  /** Accumulated gas gauge value. */
  gasCollected = 0

  private input: ShipInput = { up: false, down: false, left: false, right: false }

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null
  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new gas collection minigame.
   *
   * @param missionId - shuttle mission id
   * @param targetGas - gas units required for completion
   */
  constructor(missionId: string, targetGas: number) {
    this.missionId = missionId
    this.targetGas = targetGas
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — gas collected so far. */
  get progressCurrent(): number {
    return this.gasCollected
  }

  /** Progress denominator — target gas amount. */
  get progressTotal(): number {
    return this.targetGas
  }

  /** Set the current WASD input state. Called by the Vue component. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /** Launch a drone from the ship's current position and velocity. */
  launchDrone(): void {
    if (this._status !== 'active') return
    if (this.dronesRemaining <= 0) return

    this.dronesRemaining--

    const launchVx = this.shipVx + DRONE_LAUNCH_SPEED * Math.cos(DRONE_LAUNCH_ANGLE)
    const launchVy = this.shipVy + DRONE_LAUNCH_SPEED * Math.sin(DRONE_LAUNCH_ANGLE)

    this.drones.push({
      x: this.shipX,
      y: this.shipY,
      vx: launchVx,
      vy: launchVy,
      airTime: 0,
      collected: false,
    })
  }

  /** Per-frame update. Advances ship, drones, collisions, and end conditions. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.tickShip(dt)
    this.checkCollisions()
    this.tickDrones(dt)
    this.cleanupDrones()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via gauge. */
  complete(): void {
    // Completion is driven by gasCollected reaching targetGas
  }

  /** Clean up resources. */
  dispose(): void {
    this.drones.length = 0
  }

  /**
   * Advance ship physics: acceleration, drag, speed cap, position clamping.
   *
   * @param dt - delta time in seconds
   */
  private tickShip(dt: number): void {
    if (this.input.right) this.shipVx += SHIP_ACCELERATION * dt
    if (this.input.left) this.shipVx -= SHIP_ACCELERATION * dt
    if (this.input.up) this.shipVy -= SHIP_ACCELERATION * dt
    if (this.input.down) this.shipVy += SHIP_ACCELERATION * dt

    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVx *= dragPerFrame
    this.shipVy *= dragPerFrame

    const speed = Math.sqrt(this.shipVx * this.shipVx + this.shipVy * this.shipVy)
    if (speed > SHIP_MAX_SPEED) {
      const scale = SHIP_MAX_SPEED / speed
      this.shipVx *= scale
      this.shipVy *= scale
    }

    this.shipX += this.shipVx * dt
    this.shipY += this.shipVy * dt

    this.shipX = Math.max(SHIP_HALF_WIDTH, Math.min(CANVAS_WIDTH - SHIP_HALF_WIDTH, this.shipX))
    this.shipY = Math.max(
      SHIP_HALF_HEIGHT,
      Math.min(CANVAS_HEIGHT - SHIP_HALF_HEIGHT, this.shipY),
    )
  }

  /**
   * Advance drone physics: gravity and air time accumulation.
   *
   * @param dt - delta time in seconds
   */
  private tickDrones(dt: number): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      drone.vy += DRONE_GRAVITY * dt
      drone.x += drone.vx * dt
      drone.y += drone.vy * dt
      drone.airTime += dt
    }
  }

  /** Check ship-drone proximity and collect drones within range. */
  private checkCollisions(): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      if (drone.airTime < DRONE_GRACE_PERIOD) continue
      const dx = drone.x - this.shipX
      const dy = drone.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= DRONE_COLLECT_RADIUS) {
        drone.collected = true
        const yield_ = Math.min(drone.airTime, MAX_AIR_TIME_YIELD)
        this.gasCollected += yield_
      }
    }
  }

  /** Remove collected drones and drones that fell off screen. */
  private cleanupDrones(): void {
    this.drones = this.drones.filter((d) => !d.collected && d.y <= CANVAS_HEIGHT + 20)
  }

  /** Check for mission completion or failure. */
  private checkEndConditions(): void {
    if (this.gasCollected >= this.targetGas) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.dronesRemaining === 0 && this.drones.length === 0) {
      this._status = 'failed'
    }
  }
}
