/**
 * Probe deploy orbital minigame.
 *
 * Side-view probe deployment: the player holds station in an orbital lane
 * on the left while a planet rotates on the right. Launch probes to hit
 * marked surface targets before the timer runs out. Meteorites drift
 * left across the play area — dodge them or lose probes and hull HP.
 *
 * Pure game logic — no DOM or canvas. The Vue component reads state
 * and renders.
 *
 * @author guinetik
 * @date 2026-04-11
 * @spec docs/superpowers/specs/2026-04-11-probe-deploy-minigame-design.md
 */
import type {
  OrbitalMiniGame,
  OrbitalMiniGameContext,
  OrbitalMiniGameEvents,
  OrbitalMiniGameStatus,
  OrbitalMiniGameStep,
} from '../OrbitalMiniGame'
import type { ShipInput, Probe, Meteorite, PlanetTarget, MeteoriteSize } from './types'
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLANET_X,
  PLANET_Y,
  PLANET_R,
  PLANET_ROTATION_SPEED,
  ROTATION_SPEED_PER_TARGET,
  SHIP_X,
  SHIP_ACCEL,
  SHIP_DRAG,
  SHIP_MAX_SPEED,
  SHIP_HALF_SIZE,
  EDGE_PADDING,
  HULL_MAX_HP,
  METEORITE_DAMAGE,
  DAMAGE_GRACE_PERIOD,
  KNOCKBACK_SPEED,
  PROBE_SPEED,
  PROBE_COOLDOWN,
  TARGET_HIT_RADIUS,
  TARGET_VISUAL_RADIUS,
  METEORITE_RADIUS_SMALL,
  METEORITE_RADIUS_MEDIUM,
  METEORITE_RADIUS_LARGE,
  METEORITE_SPEED_MIN,
  METEORITE_SPEED_MAX,
  METEORITE_SPAWN_INTERVAL_START,
  METEORITE_SPAWN_INTERVAL_MIN,
  METEORITE_SPAWN_RAMP_DURATION,
  METEORITE_SIZE_WEIGHTS,
  MIN_TARGETS,
  MAX_TARGETS,
  TIMER_BASE,
  TIMER_PER_TARGET,
} from './constants'

/** Collision radius lookup by meteorite size. */
const METEORITE_RADII: Record<MeteoriteSize, number> = {
  small: METEORITE_RADIUS_SMALL,
  medium: METEORITE_RADIUS_MEDIUM,
  large: METEORITE_RADIUS_LARGE,
}

/**
 * Probe deploy minigame — orbital lane, rotating planet, probe shots, meteorite hazards.
 *
 * @author guinetik
 * @date 2026-04-11
 */
export class ProbeDeployMiniGame implements OrbitalMiniGame, OrbitalMiniGameEvents {
  /** The shuttle mission id this minigame tracks. */
  readonly missionId: string

  /** The planet being targeted (theme selector). */
  readonly planetId: string

  /** Number of surface targets to hit for completion. */
  readonly targetCount: number

  /** Total probes available at start. */
  readonly probeCount: number

  /** Planet rotation speed in radians/s (difficulty-scaled). */
  readonly rotationSpeed: number

  /** Total time allotted for the mission in seconds. */
  readonly timeTotal: number

  /** Maximum hull hit points. */
  readonly hullMaxHp = HULL_MAX_HP

  private _status: OrbitalMiniGameStatus = 'active'
  private readonly _steps: OrbitalMiniGameStep[] = [
    { label: 'Deploy probes to targets', complete: false, active: true },
    { label: 'Mission complete', complete: false, active: false },
  ]

  /** Ship vertical position in canvas pixels. */
  shipY: number

  /** Ship vertical velocity in px/s. */
  shipVy = 0

  /** Current hull hit points. */
  hullHp = HULL_MAX_HP

  /** Probes still available to launch. */
  probesRemaining: number

  /** Cooldown remaining before next probe can launch (seconds). */
  probeCooldown = 0

  /** Active probe in flight (null if none). */
  activeProbe: Probe | null = null

  /** Surface targets to hit. */
  targets: PlanetTarget[]

  /** Active meteorites in the play area. */
  meteorites: Meteorite[] = []

  /** Current planet rotation in radians. */
  planetRotation = 0

  /** Time remaining before mission fails (seconds). */
  timeRemaining: number

  /** Damage flash timer — positive when the ship just took a hit (visual). */
  damageFlash = 0

  /** Number of targets hit so far (progress tracking). */
  private targetsHit = 0

  /** Total elapsed game time for spawn ramping. */
  private elapsedTime = 0

  /** Time accumulator for meteorite spawning. */
  private meteoriteSpawnTimer = 0

  /** Invulnerability grace period remaining after last hit (seconds). */
  private gracePeriod = 0

  private input: ShipInput = { up: false, down: false }

  /** Callback fired when the minigame completes successfully. */
  onComplete: ((missionId: string) => void) | null = null

  /** Callback fired when the step list changes. */
  onStepChange: ((steps: readonly OrbitalMiniGameStep[]) => void) | null = null

  /**
   * Create a new probe deploy minigame.
   *
   * @param missionId - shuttle mission id
   * @param targetGas - gas units from mission data; drives difficulty scaling
   * @param planetId - planet being visited ('mercury' | 'uranus')
   */
  constructor(missionId: string, targetGas: number, planetId: string) {
    this.missionId = missionId
    this.planetId = planetId

    this.targetCount = Math.min(MAX_TARGETS, Math.max(MIN_TARGETS, targetGas + 1))
    this.probeCount = this.targetCount + 2
    this.probesRemaining = this.probeCount
    this.rotationSpeed =
      PLANET_ROTATION_SPEED + ROTATION_SPEED_PER_TARGET * Math.max(0, targetGas - 2)
    this.timeRemaining = TIMER_BASE + TIMER_PER_TARGET * this.targetCount
    this.timeTotal = this.timeRemaining
    this.shipY = CANVAS_HEIGHT / 2

    // Evenly distribute targets around planet circumference
    this.targets = Array.from({ length: this.targetCount }, (_, i) => {
      const surfaceAngle = (i / this.targetCount) * 2 * Math.PI
      return {
        surfaceAngle,
        x: PLANET_X + Math.cos(surfaceAngle) * PLANET_R,
        y: PLANET_Y + Math.sin(surfaceAngle) * PLANET_R,
        radius: TARGET_VISUAL_RADIUS,
        hit: false,
        pulseOffset: (i / this.targetCount) * Math.PI * 2,
      }
    })
  }

  /** Current minigame status. */
  get status(): OrbitalMiniGameStatus {
    return this._status
  }

  /** Ordered steps for the tracker HUD. */
  get steps(): readonly OrbitalMiniGameStep[] {
    return this._steps
  }

  /** Progress numerator — targets hit so far. */
  get progressCurrent(): number {
    return this.targets.filter((t) => t.hit).length
  }

  /** Progress denominator — total targets to hit. */
  get progressTotal(): number {
    return this.targetCount
  }

  /** Set the vertical input state. Called by the Vue component. */
  setInput(input: ShipInput): void {
    this.input = input
  }

  /**
   * Launch a probe from the ship's current position.
   * Guarded on: status, cooldown, probesRemaining, activeProbe in flight.
   */
  launchProbe(): void {
    if (this._status !== 'active') return
    if (this.probeCooldown > 0) return
    if (this.probesRemaining <= 0) return
    if (this.activeProbe !== null) return

    this.activeProbe = {
      x: SHIP_X,
      y: this.shipY,
      speed: PROBE_SPEED,
      consumed: false,
    }
    this.probesRemaining -= 1
    this.probeCooldown = PROBE_COOLDOWN
  }

  /** Per-frame update. Advances all systems. */
  tick(dt: number, _ctx: OrbitalMiniGameContext): void {
    if (this._status !== 'active') return

    // ── Timers ────────────────────────────────────────────────────────────────
    this.elapsedTime += dt
    this.damageFlash = Math.max(0, this.damageFlash - dt)
    this.probeCooldown = Math.max(0, this.probeCooldown - dt)
    this.gracePeriod = Math.max(0, this.gracePeriod - dt)
    this.timeRemaining = Math.max(0, this.timeRemaining - dt)

    // ── Systems ───────────────────────────────────────────────────────────────
    this.tickShip(dt)
    this.tickProbe(dt)
    this.tickPlanet(dt)
    this.tickMeteoriteSpawning(dt)
    this.tickMeteoriteMovement(dt)
    this.checkMeteoriteShipCollisions()
    this.cleanupMeteorites()
    this.checkEndConditions()
  }

  /** Manual complete is a no-op — completion is automatic via target hits. */
  complete(): void {
    // Completion is driven by all targets being hit
  }

  /** Clean up resources. */
  dispose(): void {
    this.meteorites.length = 0
    this.targets.length = 0
    this.activeProbe = null
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private tick methods
  // ────────────────────────────────────────────────────────────────────────────

  /** Advance ship physics — vertical only, no gravity. */
  private tickShip(dt: number): void {
    if (this.input.up) this.shipVy -= SHIP_ACCEL * dt
    if (this.input.down) this.shipVy += SHIP_ACCEL * dt

    const dragPerFrame = Math.pow(SHIP_DRAG, dt * 60)
    this.shipVy *= dragPerFrame

    if (Math.abs(this.shipVy) > SHIP_MAX_SPEED) {
      this.shipVy = Math.sign(this.shipVy) * SHIP_MAX_SPEED
    }

    this.shipY += this.shipVy * dt
    this.shipY = Math.max(EDGE_PADDING, Math.min(CANVAS_HEIGHT - EDGE_PADDING, this.shipY))
  }

  /** Advance planet rotation and update target world positions. */
  private tickPlanet(dt: number): void {
    this.planetRotation += this.rotationSpeed * dt
    for (const target of this.targets) {
      target.x = PLANET_X + Math.cos(target.surfaceAngle + this.planetRotation) * PLANET_R
      target.y = PLANET_Y + Math.sin(target.surfaceAngle + this.planetRotation) * PLANET_R
    }
  }

  /** Move active probe; check probe-meteorite and probe-target collisions. */
  private tickProbe(dt: number): void {
    if (!this.activeProbe) return

    this.activeProbe.x += this.activeProbe.speed * dt

    // Check probe-meteorite collisions
    for (const meteor of this.meteorites) {
      const dx = this.activeProbe.x - meteor.x
      const dy = this.activeProbe.y - meteor.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < meteor.radius + 4) {
        this.activeProbe = null
        // Reset cooldown so next probe can only fire after a full cooldown
        this.probeCooldown = PROBE_COOLDOWN
        return
      }
    }

    // Check if probe reached planet perimeter
    if (this.activeProbe.x >= PLANET_X - PLANET_R) {
      // Check each unhit target — probe hits at most one
      for (const target of this.targets) {
        if (target.hit) continue
        const dx = this.activeProbe.x - target.x
        const dy = this.activeProbe.y - target.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < TARGET_HIT_RADIUS) {
          target.hit = true
          break
        }
      }
      // Consume probe; reset cooldown so next launch waits a full interval
      this.activeProbe = null
      this.probeCooldown = PROBE_COOLDOWN
    }
  }

  /** Spawn meteorites from the right edge with a ramping interval. */
  private tickMeteoriteSpawning(dt: number): void {
    const rampT = Math.min(1, this.elapsedTime / METEORITE_SPAWN_RAMP_DURATION)
    const interval =
      METEORITE_SPAWN_INTERVAL_START +
      (METEORITE_SPAWN_INTERVAL_MIN - METEORITE_SPAWN_INTERVAL_START) * rampT

    this.meteoriteSpawnTimer += dt
    while (this.meteoriteSpawnTimer >= interval) {
      this.meteoriteSpawnTimer -= interval
      this.spawnMeteorite()
    }
  }

  /** Spawn a single meteorite at the right canvas edge. */
  private spawnMeteorite(): void {
    const size = this.rollMeteoriteSize()
    const radius = METEORITE_RADII[size]
    const speed = METEORITE_SPEED_MIN + Math.random() * (METEORITE_SPEED_MAX - METEORITE_SPEED_MIN)

    const minY = radius
    const maxY = CANVAS_HEIGHT - radius
    const y = minY + Math.random() * (maxY - minY)

    this.meteorites.push({
      x: CANVAS_WIDTH + radius,
      y,
      vx: -speed,
      vy: (Math.random() - 0.5) * 30,
      size,
      radius,
    })
  }

  /** Pick a meteorite size using weighted probabilities. */
  private rollMeteoriteSize(): MeteoriteSize {
    const r = Math.random()
    const [smallW, medW] = METEORITE_SIZE_WEIGHTS
    if (r < smallW!) return 'small'
    if (r < smallW! + medW!) return 'medium'
    return 'large'
  }

  /** Move all meteorites left. */
  private tickMeteoriteMovement(dt: number): void {
    for (const meteor of this.meteorites) {
      meteor.x += meteor.vx * dt
      meteor.y += meteor.vy * dt
    }
  }

  /** Check ship-meteorite collisions — damages hull and applies knockback. */
  private checkMeteoriteShipCollisions(): void {
    if (this.gracePeriod > 0) return

    for (const meteor of this.meteorites) {
      const dx = SHIP_X - meteor.x
      const dy = this.shipY - meteor.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < meteor.radius + SHIP_HALF_SIZE) {
        this.hullHp -= METEORITE_DAMAGE
        this.damageFlash = 0.3
        this.gracePeriod = DAMAGE_GRACE_PERIOD

        // Apply knockback away from meteorite
        const angle = Math.atan2(dy, dx)
        this.shipVy += Math.sin(angle) * KNOCKBACK_SPEED
        break
      }
    }
  }

  /** Remove meteorites that have passed the left edge. */
  private cleanupMeteorites(): void {
    this.meteorites = this.meteorites.filter((m) => m.x > -m.radius * 2)
  }

  /** Check for mission completion or failure. */
  private checkEndConditions(): void {
    // Count from the actual targets array to support direct property mutation in tests
    const hitCount = this.targets.filter((t) => t.hit).length
    // All targets hit → success
    if (hitCount >= this.targetCount) {
      this._status = 'completed'
      this._steps[0]!.complete = true
      this._steps[0]!.active = false
      this._steps[1]!.complete = true
      this._steps[1]!.active = false
      this.onStepChange?.(this._steps)
      this.onComplete?.(this.missionId)
      return
    }

    // Hull depleted → fail
    if (this.hullHp <= 0) {
      this.hullHp = 0
      this._status = 'failed'
      return
    }

    // Timer expired → fail
    if (this.timeRemaining <= 0) {
      this._status = 'failed'
      return
    }

    // Probes exhausted with no probe in flight and targets remaining → fail
    if (this.probesRemaining <= 0 && this.activeProbe === null) {
      const anyUnhit = this.targets.some((t) => !t.hit)
      if (anyUnhit) {
        this._status = 'failed'
      }
    }
  }
}
