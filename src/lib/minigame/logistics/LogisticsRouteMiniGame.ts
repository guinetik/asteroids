/**
 * Logistics route orbital minigame.
 *
 * Vertical scroller: pilot your shuttle through Earth's orbital shipping lanes,
 * collect the sequence of route symbols listed on your manifest, and dodge
 * incoming traffic. The manifest grows with targetGas difficulty; scroll speed
 * and traffic density scale up proportionally.
 *
 * Pure game logic — no DOM or canvas. The Vue component reads state and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-logistics-route-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, RouteSymbol, TrafficShuttle } from './types'
import { RouteSymbolType, ROUTE_SYMBOL_TYPES } from './types'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  LANE_COUNT,
  LANE_START_X,
  LANE_SPACING,
  SHIP_ACCEL,
  SHIP_DRAG,
  SHIP_MAX_SPEED_Y,
  SHIP_MAX_SPEED_X,
  SPRING_STRENGTH,
  SHIP_HALF_SIZE,
  EDGE_PADDING,
  SHIP_START_X,
  SHIP_START_Y,
  HULL_MAX_HP,
  TRAFFIC_DAMAGE,
  DAMAGE_GRACE_PERIOD,
  KNOCKBACK_SPEED,
  MIN_MANIFEST_LENGTH,
  SYMBOL_COLLECT_RADIUS,
  SYMBOL_SPAWN_INTERVAL,
  TRAFFIC_RADIUS,
  TRAFFIC_LANE_JITTER,
  MIN_TRAFFIC_GAP,
  TRAFFIC_SPEED_MIN_FACTOR,
  TRAFFIC_SPEED_RANDOM_RANGE,
  BASE_SCROLL_SPEED,
  SCROLL_SPEED_PER_TARGET,
  BASE_TRAFFIC_COUNT,
  TRAFFIC_SPAWN_INTERVAL,
} from './constants'

/**
 * Logistics route minigame — collect manifest symbols while dodging traffic.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class LogisticsRouteMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** Target gas deliveries — drives manifest length and difficulty. */
  readonly targetGas: number

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Collect route symbols', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  // ─── Ship state ─────────────────────────────────────────────────────────────

  /** Ship horizontal position in canvas pixels. */
  shipX = SHIP_START_X
  /** Ship vertical position in canvas pixels. */
  shipY = SHIP_START_Y
  /** Ship horizontal velocity in px/s. */
  shipVx = 0
  /** Ship vertical velocity in px/s. */
  shipVy = 0

  // ─── Hull ───────────────────────────────────────────────────────────────────

  /** Current hull hit points. */
  hullHp = HULL_MAX_HP
  /** Maximum hull hit points. */
  readonly hullMaxHp = HULL_MAX_HP

  // ─── Manifest ───────────────────────────────────────────────────────────────

  /** Ordered list of symbol types the player must collect. */
  readonly manifest: RouteSymbolType[]

  /** Index into manifest — next symbol the player must collect. */
  manifestIndex = 0

  // ─── Active objects ─────────────────────────────────────────────────────────

  /** Route symbols currently on screen. */
  symbols: RouteSymbol[] = []

  /** Traffic shuttles currently on screen. */
  traffic: TrafficShuttle[] = []

  // ─── Difficulty ─────────────────────────────────────────────────────────────

  /** Scroll speed for symbols and background (px/s). */
  readonly scrollSpeed: number

  /** Maximum simultaneous traffic shuttles on screen. */
  readonly maxTraffic: number

  // ─── Visual / timing state ──────────────────────────────────────────────────

  /** Damage flash timer — positive when ship just took a hit. */
  damageFlash = 0

  /** Accumulated scroll offset for background parallax (px). */
  scrollOffset = 0

  /** Horizontal center for spring anchor. */
  readonly centerX = SHIP_START_X

  // ─── Private timers ─────────────────────────────────────────────────────────

  private elapsedTime = 0
  private symbolSpawnTimer = 0
  private trafficSpawnTimer = 0
  private gracePeriod = 0

  private input: ShipInput = { up: false, down: false, left: false, right: false }

  // ─── Events ─────────────────────────────────────────────────────────────────

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null

  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new logistics route minigame.
   *
   * @param missionId - shuttle mission id
   * @param targetGas - gas deliveries required (drives difficulty + manifest length)
   */
  constructor(missionId: string, targetGas: number) {
    this.missionId = missionId
    this.targetGas = targetGas

    const manifestLength = Math.max(MIN_MANIFEST_LENGTH, targetGas)
    this.manifest = Array.from({ length: manifestLength }, () => this.randomSymbolType())

    const extra = Math.max(0, targetGas - MIN_MANIFEST_LENGTH)
    this.scrollSpeed = BASE_SCROLL_SPEED + SCROLL_SPEED_PER_TARGET * extra
    this.maxTraffic = BASE_TRAFFIC_COUNT + Math.floor(extra / 2)
  }

  // ─── OrbitalMiniGame interface ───────────────────────────────────────────────

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — symbols collected so far. */
  get progressCurrent(): number {
    return this.manifestIndex
  }

  /** Progress denominator — total symbols in manifest. */
  get progressTotal(): number {
    return this.manifest.length
  }

  /** Set the current WASD input state. Called by the Vue component each frame. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /** Per-frame update. Advances all systems. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    this.elapsedTime += dt
    this.scrollOffset += this.scrollSpeed * dt
    this.damageFlash = Math.max(0, this.damageFlash - dt)
    this.gracePeriod = Math.max(0, this.gracePeriod - dt)

    this.tickShip(dt)
    this.tickSymbolSpawning(dt)
    this.tickTrafficSpawning(dt)
    this.tickSymbols(dt)
    this.tickTraffic(dt)
    this.checkSymbolCollections()
    this.checkTrafficCollisions()
    this.cleanupSymbols()
    this.cleanupTraffic()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via manifest collection. */
  complete(): void {
    // Completion is driven by manifestIndex reaching manifest.length
  }

  /** Clean up resources. */
  dispose(): void {
    this.symbols.length = 0
    this.traffic.length = 0
  }

  // ─── Ship physics ────────────────────────────────────────────────────────────

  /** Advance ship physics. No gravity — pure WASD + spring center-pull. */
  private tickShip(dt: number): void {
    // Vertical: WASD acceleration
    if (this.input.up) this.shipVy -= SHIP_ACCEL * dt
    if (this.input.down) this.shipVy += SHIP_ACCEL * dt

    // Horizontal: WASD or soft spring toward centerX
    if (this.input.left) {
      this.shipVx -= SHIP_ACCEL * dt
    } else if (this.input.right) {
      this.shipVx += SHIP_ACCEL * dt
    } else {
      // Soft spring pulls ship back to lane center
      this.shipVx += SPRING_STRENGTH * (this.centerX - this.shipX) * dt
    }

    // Drag
    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVx *= dragPerFrame
    this.shipVy *= dragPerFrame

    // Speed caps (independent per axis)
    this.shipVx = Math.max(-SHIP_MAX_SPEED_X, Math.min(SHIP_MAX_SPEED_X, this.shipVx))
    this.shipVy = Math.max(-SHIP_MAX_SPEED_Y, Math.min(SHIP_MAX_SPEED_Y, this.shipVy))

    this.shipX += this.shipVx * dt
    this.shipY += this.shipVy * dt

    // Clamp to canvas bounds with edge padding
    this.shipX = Math.max(EDGE_PADDING, Math.min(CANVAS_WIDTH - EDGE_PADDING, this.shipX))
    this.shipY = Math.max(EDGE_PADDING, Math.min(CANVAS_HEIGHT - EDGE_PADDING, this.shipY))
  }

  // ─── Symbol spawning ────────────────────────────────────────────────────────

  /** Spawn route symbols at regular intervals. */
  private tickSymbolSpawning(dt: number): void {
    if (this.manifestIndex >= this.manifest.length) return

    this.symbolSpawnTimer += dt
    while (this.symbolSpawnTimer >= SYMBOL_SPAWN_INTERVAL) {
      this.symbolSpawnTimer -= SYMBOL_SPAWN_INTERVAL
      this.spawnSymbol()
    }
  }

  /** Spawn a single route symbol at the top of a random lane. */
  private spawnSymbol(): void {
    if (this.manifestIndex >= this.manifest.length) return

    const type = this.manifest[this.manifestIndex]!
    const lane = Math.floor(Math.random() * LANE_COUNT)

    this.symbols.push({
      x: this.laneX(lane),
      y: -20,
      type,
      lane,
      collected: false,
    })
  }

  // ─── Traffic spawning ───────────────────────────────────────────────────────

  /** Spawn traffic shuttles at regular intervals. */
  private tickTrafficSpawning(dt: number): void {
    this.trafficSpawnTimer += dt
    while (this.trafficSpawnTimer >= TRAFFIC_SPAWN_INTERVAL) {
      this.trafficSpawnTimer -= TRAFFIC_SPAWN_INTERVAL
      this.spawnTraffic()
    }
  }

  /** Spawn a single traffic shuttle respecting gap and count limits. */
  private spawnTraffic(): void {
    if (this.traffic.length >= this.maxTraffic) return

    const lane = Math.floor(Math.random() * LANE_COUNT)
    const baseX = this.laneX(lane)
    const x = baseX + (Math.random() * 2 - 1) * TRAFFIC_LANE_JITTER

    // Enforce minimum gap from nearest existing shuttle
    for (const t of this.traffic) {
      if (Math.abs(t.y) < MIN_TRAFFIC_GAP) return
    }

    const speedFactor =
      TRAFFIC_SPEED_MIN_FACTOR + Math.random() * TRAFFIC_SPEED_RANDOM_RANGE
    const speed = this.scrollSpeed * speedFactor

    this.traffic.push({
      x,
      y: -20,
      speed,
      size: 0.6 + Math.random() * 0.4,
      lane,
      alpha: 0.3 + Math.random() * 0.3,
    })
  }

  // ─── Object movement ────────────────────────────────────────────────────────

  /** Move all route symbols down at scroll speed. */
  private tickSymbols(dt: number): void {
    for (const sym of this.symbols) {
      sym.y += this.scrollSpeed * dt
    }
  }

  /** Move all traffic shuttles down at their individual speeds. */
  private tickTraffic(dt: number): void {
    for (const shuttle of this.traffic) {
      shuttle.y += shuttle.speed * dt
    }
  }

  // ─── Collision detection ────────────────────────────────────────────────────

  /** Check if ship flies through the next manifest symbol. */
  private checkSymbolCollections(): void {
    if (this.manifestIndex >= this.manifest.length) return

    const nextType = this.manifest[this.manifestIndex]!

    for (const sym of this.symbols) {
      if (sym.collected) continue
      if (sym.type !== nextType) continue

      const dx = sym.x - this.shipX
      const dy = sym.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist <= SYMBOL_COLLECT_RADIUS) {
        sym.collected = true
        this.manifestIndex++
        return // Only collect one per frame
      }
    }
  }

  /** Check if ship collides with any traffic shuttle. */
  private checkTrafficCollisions(): void {
    if (this.gracePeriod > 0) return

    for (const shuttle of this.traffic) {
      const dx = shuttle.x - this.shipX
      const dy = shuttle.y - this.shipY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const hitDist = TRAFFIC_RADIUS + SHIP_HALF_SIZE

      if (dist <= hitDist) {
        this.hullHp = Math.max(0, this.hullHp - TRAFFIC_DAMAGE)
        this.damageFlash = 0.3
        this.gracePeriod = DAMAGE_GRACE_PERIOD

        // Knockback impulse away from shuttle
        const nx = dx === 0 && dy === 0 ? 0 : dx / (dist || 1)
        const ny = dx === 0 && dy === 0 ? -1 : dy / (dist || 1)
        this.shipVx -= nx * KNOCKBACK_SPEED
        this.shipVy -= ny * KNOCKBACK_SPEED

        return // One hit per frame
      }
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /** Remove collected and off-screen symbols. */
  private cleanupSymbols(): void {
    this.symbols = this.symbols.filter(
      (s) => !s.collected && s.y < CANVAS_HEIGHT + 40,
    )
  }

  /** Remove off-screen traffic shuttles. */
  private cleanupTraffic(): void {
    this.traffic = this.traffic.filter((t) => t.y < CANVAS_HEIGHT + 40)
  }

  // ─── End conditions ─────────────────────────────────────────────────────────

  /** Check for mission completion or failure. */
  private checkEndConditions(): void {
    if (this.manifestIndex >= this.manifest.length) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    if (this.hullHp <= 0) {
      this.hullHp = 0
      this._status = 'failed'
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Compute the center X of a given lane index.
   *
   * @param lane - 0-based lane index
   * @returns Canvas X position for that lane's center
   */
  laneX(lane: number): number {
    return LANE_START_X + LANE_SPACING * (lane + 1)
  }

  /** Pick a random route symbol type. */
  private randomSymbolType(): RouteSymbolType {
    const index = Math.floor(Math.random() * ROUTE_SYMBOL_TYPES.length)
    return ROUTE_SYMBOL_TYPES[index]!
  }
}
