/**
 * Ship health and temperature domain logic.
 *
 * Tracks hull HP and temperature. Temperature drifts based on solar
 * distance — hot near the Sun, cold past the outer planets.
 * Extreme temperature and radiation proximity tick hull damage.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */

/** Tuning constants loaded from ship-health.json. */
export interface ShipHealthConfig {
  /** Maximum hull points */
  maxHp: number
  /** HP restored per second while healing (Earth orbit) */
  healRate: number
  /** Distance from Sun below which heat rises (Venus orbit) */
  hotBoundary: number
  /** Distance from Sun above which cold rises (Jupiter orbit) */
  coldBoundary: number
  /** Temperature drift speed (units/s toward zone target) */
  tempDriftRate: number
  /** Temperature magnitude above which hull takes damage */
  damageThreshold: number
  /** Max hull damage per second from extreme temperature */
  maxTempDamage: number
  /** Radiation proximity above which hull takes damage (0–1) */
  radiationThreshold: number
  /** Max hull damage per second from radiation */
  maxRadiationDamage: number
  /** Temperature magnitude above which the gauge is shown */
  displayThreshold: number
}

/** Target temperature value for the hot zone */
const HOT_ZONE_TARGET = 100
/** Target temperature value for the cold zone */
const COLD_ZONE_TARGET = -100
/** Target temperature value for the safe zone */
const SAFE_ZONE_TARGET = 0
/** Minimum allowable temperature */
const MIN_TEMPERATURE = -100
/** Maximum allowable temperature */
const MAX_TEMPERATURE = 100

/**
 * Manages ship hull integrity and temperature.
 * Pure domain logic — no Three.js, no rendering.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 */
export class ShipHealth {
  private _hp: number
  private _temperature = 0
  private readonly config: ShipHealthConfig
  private _dead = false

  /** Fired when HP reaches 0 with the cause of death. */
  onDeath: ((cause: string) => void) | null = null

  constructor(config: ShipHealthConfig) {
    this.config = config
    this._hp = config.maxHp
  }

  /** Current hull points. */
  get hp(): number {
    return this._hp
  }

  /** Maximum hull points from config. */
  get maxHp(): number {
    return this.config.maxHp
  }

  /** Current temperature in the range [-100, 100]. */
  get temperature(): number {
    return this._temperature
  }

  /** Whether the temperature gauge should be visible to the player. */
  get temperatureVisible(): boolean {
    return Math.abs(this._temperature) > this.config.displayThreshold
  }

  /**
   * Advance health simulation by dt seconds.
   *
   * @param dt - Delta time in seconds
   * @param sunDistance - Distance from the Sun in world units
   * @param radiationProximity - Gravity proximity to Sun (0–1)
   * @param healing - Whether the ship is healing (e.g. Earth orbit)
   * @param heatResistance - Multiplier on hot-zone drift rate (0–1, lower = more resistant)
   * @param heatArmor - Multiplier on heat damage (0–1, lower = less damage)
   */
  tick(
    dt: number,
    sunDistance: number,
    radiationProximity: number,
    healing = false,
    heatResistance = 1,
    heatArmor = 1,
  ): void {
    if (this._dead) return

    // Temperature drift toward zone target — stronger the deeper in the zone
    let targetTemp: number
    let driftMultiplier = 1
    if (sunDistance < this.config.hotBoundary) {
      targetTemp = HOT_ZONE_TARGET
      // Closer to Sun = faster heating (1x at boundary, up to 4x at origin)
      driftMultiplier = 1 + 3 * (1 - sunDistance / this.config.hotBoundary)
    } else if (sunDistance > this.config.coldBoundary) {
      targetTemp = COLD_ZONE_TARGET
      // Further from Sun = faster freezing
      driftMultiplier = 1 + 3 * Math.min(1, (sunDistance - this.config.coldBoundary) / this.config.coldBoundary)
    } else {
      targetTemp = SAFE_ZONE_TARGET
    }

    const diff = targetTemp - this._temperature
    const resistanceFactor = targetTemp > 0 ? heatResistance : 1 // only applies to hot zone
    const drift = Math.sign(diff) * Math.min(Math.abs(diff), this.config.tempDriftRate * driftMultiplier * resistanceFactor * dt)
    this._temperature = Math.max(MIN_TEMPERATURE, Math.min(MAX_TEMPERATURE, this._temperature + drift))

    // Temperature damage
    let tempDamage = 0
    const absTemp = Math.abs(this._temperature)
    if (absTemp > this.config.damageThreshold) {
      const ratio = (absTemp - this.config.damageThreshold) / (MAX_TEMPERATURE - this.config.damageThreshold)
      const armorFactor = this._temperature > 0 ? heatArmor : 1 // only applies to heat damage
      tempDamage = ratio * this.config.maxTempDamage * armorFactor * dt
    }

    // Radiation damage
    let radDamage = 0
    if (radiationProximity > this.config.radiationThreshold) {
      const ratio =
        (radiationProximity - this.config.radiationThreshold) /
        (1 - this.config.radiationThreshold)
      radDamage = ratio * this.config.maxRadiationDamage * dt
    }

    // Apply damage
    const totalDamage = tempDamage + radDamage
    if (totalDamage > 0) {
      this._hp = Math.max(0, this._hp - totalDamage)
    }

    // Healing — only when no damage is occurring
    if (healing && totalDamage === 0) {
      this._hp = Math.min(this.config.maxHp, this._hp + this.config.healRate * dt)
    }

    // Death check
    if (this._hp <= 0 && !this._dead) {
      this._dead = true
      this.onDeath?.(this.getDeathCause(radiationProximity))
    }
  }

  /** Reset HP and temperature to initial values. */
  reset(): void {
    this._hp = this.config.maxHp
    this._temperature = 0
    this._dead = false
  }

  /**
   * Determine cause of death from current game state.
   *
   * @param radiationProximity - Current radiation proximity (0–1)
   * @returns Human-readable death cause string
   */
  private getDeathCause(radiationProximity: number): string {
    if (radiationProximity > this.config.radiationThreshold) return 'Radiation Exposure'
    if (this._temperature > this.config.damageThreshold) return 'Hull Overheated'
    return 'Hull Frozen'
  }
}
