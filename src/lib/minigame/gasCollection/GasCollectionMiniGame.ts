/**
 * Gas collection orbital minigame.
 *
 * 2D side-scrolling collection game: fly the shuttle, launch drones
 * through rising gas puffs to load them, then catch the loaded drone.
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
import type { ShipInput, Drone, GasPuff } from './types'
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
  DRONE_DRAG,
  DRONE_DRAG_DELAY,
  DRONE_GRACE_PERIOD,
  MAX_DRONES,
  SHIP_HALF_WIDTH,
  SHIP_HALF_HEIGHT,
  SHIP_GRAVITY,
  COOK_ZONE_Y,
  PUFF_SPAWN_INTERVAL,
  PUFF_SPEED_MIN,
  PUFF_SPEED_MAX,
  PUFF_RADIUS_MIN,
  PUFF_RADIUS_MAX,
  GAS_PER_PUFF,
  DRONE_PUFF_COLLECT_RADIUS,
} from './constants'

/**
 * Gas collection minigame — fly the shuttle, launch drones through
 * rising gas puffs, catch loaded drones.
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
  /** Ship facing direction: 1 = right, -1 = left. */
  shipFacing = 1

  /** Active drones in flight. */
  drones: Drone[] = []
  /** Drones remaining to launch. */
  dronesRemaining = MAX_DRONES
  /** Accumulated gas gauge value. */
  gasCollected = 0

  /** Rising gas puffs from the atmosphere. */
  gasPuffs: GasPuff[] = []
  /** Time accumulator for puff spawning. */
  private puffTimer = 0

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

    // Launch in the direction the ship is facing — pure launch force, no ship velocity
    const angle = this.shipFacing === 1 ? DRONE_LAUNCH_ANGLE : Math.PI - DRONE_LAUNCH_ANGLE
    const launchVx = DRONE_LAUNCH_SPEED * Math.cos(angle)
    const launchVy = DRONE_LAUNCH_SPEED * Math.sin(angle)

    this.drones.push({
      x: this.shipX,
      y: this.shipY,
      vx: launchVx,
      vy: launchVy,
      airTime: 0,
      collected: false,
      gasLoaded: 0,
    })
  }

  /** Per-frame update. Advances ship, puffs, drones, collisions, and end conditions. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.tickShip(dt)
    if (this.checkCookZone()) return
    this.tickGasPuffs(dt)
    this.tickDrones(dt)
    this.checkDronePuffCollisions()
    this.checkShipDroneCollisions()
    this.cleanupDrones()
    this.cleanupPuffs()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via gauge. */
  complete(): void {
    // Completion is driven by gasCollected reaching targetGas
  }

  /** Clean up resources. */
  dispose(): void {
    this.drones.length = 0
    this.gasPuffs.length = 0
  }

  /** Advance ship physics: gravity, acceleration, drag, speed cap, position clamping. */
  private tickShip(dt: number): void {
    // Planet gravity — constant pull downward
    this.shipVy += SHIP_GRAVITY * dt

    if (this.input.right) this.shipVx += SHIP_ACCELERATION * dt
    if (this.input.left) this.shipVx -= SHIP_ACCELERATION * dt
    if (this.input.up) this.shipVy -= SHIP_ACCELERATION * dt
    if (this.input.down) this.shipVy += SHIP_ACCELERATION * dt

    // Update facing direction based on horizontal input
    if (this.input.right) this.shipFacing = 1
    if (this.input.left) this.shipFacing = -1

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

  /** Spawn and advance gas puffs rising from the atmosphere. */
  private tickGasPuffs(dt: number): void {
    // Spawn new puffs
    this.puffTimer += dt
    while (this.puffTimer >= PUFF_SPAWN_INTERVAL) {
      this.puffTimer -= PUFF_SPAWN_INTERVAL
      this.gasPuffs.push({
        x: 40 + Math.random() * (CANVAS_WIDTH - 80),
        y: COOK_ZONE_Y + 20,
        speed: PUFF_SPEED_MIN + Math.random() * (PUFF_SPEED_MAX - PUFF_SPEED_MIN),
        radius: PUFF_RADIUS_MIN + Math.random() * (PUFF_RADIUS_MAX - PUFF_RADIUS_MIN),
        consumed: false,
        alpha: 0.6 + Math.random() * 0.3,
      })
    }

    // Move puffs upward, fade as they rise
    for (const puff of this.gasPuffs) {
      puff.y -= puff.speed * dt
      // Fade out as it rises away from the cook zone
      const travelRatio = (COOK_ZONE_Y - puff.y) / COOK_ZONE_Y
      puff.alpha = Math.max(0, 0.7 * (1 - travelRatio * 1.5))
    }
  }

  /** Advance drone physics: gravity and air time accumulation. */
  private tickDrones(dt: number): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      drone.vy += DRONE_GRAVITY * dt
      // Drag only kicks in after the launch impulse has carried
      if (drone.airTime > DRONE_DRAG_DELAY) {
        const droneDrag = Math.pow(DRONE_DRAG, dt * 60)
        drone.vx *= droneDrag
        drone.vy *= droneDrag
      }
      drone.x += drone.vx * dt
      drone.y += drone.vy * dt
      drone.airTime += dt
    }
  }

  /** Check if ship entered the cook zone — instant fail. */
  private checkCookZone(): boolean {
    if (this.shipY + SHIP_HALF_HEIGHT >= COOK_ZONE_Y) {
      this._status = 'failed'
      return true
    }
    return false
  }

  /** Check drone-puff collisions — drones passing through puffs load gas. */
  private checkDronePuffCollisions(): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      for (const puff of this.gasPuffs) {
        if (puff.consumed) continue
        const dx = drone.x - puff.x
        const dy = drone.y - puff.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= puff.radius + DRONE_PUFF_COLLECT_RADIUS) {
          puff.consumed = true
          drone.gasLoaded += GAS_PER_PUFF
        }
      }
    }
  }

  /** Check ship-drone proximity — catching a drone banks its loaded gas. */
  private checkShipDroneCollisions(): void {
    for (const drone of this.drones) {
      if (drone.collected) continue
      if (drone.airTime < DRONE_GRACE_PERIOD) continue
      const dx = drone.x - this.shipX
      const dy = drone.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= DRONE_COLLECT_RADIUS) {
        drone.collected = true
        this.gasCollected += drone.gasLoaded
      }
    }
  }

  /** Remove collected drones, drones past the cook zone, and drones off screen. */
  private cleanupDrones(): void {
    this.drones = this.drones.filter((d) => !d.collected && d.y <= COOK_ZONE_Y)
  }

  /** Remove consumed and off-screen gas puffs. */
  private cleanupPuffs(): void {
    this.gasPuffs = this.gasPuffs.filter((p) => !p.consumed && p.y > -40)
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
