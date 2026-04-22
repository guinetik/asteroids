/**
 * Ship health and temperature domain logic.
 *
 * Tracks hull HP and temperature. Temperature drifts based on solar
 * distance — hot near the Sun, cold past the outer planets.
 * Extreme temperature and radiation proximity tick hull damage.
 *
 * Thermal upgrades provide zone-based protection: when the ship is within
 * the upgrade's protected zone, temperature is hard-capped at `protectedTempCap`
 * and hull damage from temperature is fully suppressed.
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
  /**
   * World-space distance from Sun below which the heat zone begins.
   * This value must already be scaled by ORBIT_SCALE before being passed to ShipHealth
   * (MapViewController handles this at construction time).
   * Conceptually sits between Venus and Earth in catalog units.
   */
  hotBoundary: number
  /**
   * World-space distance below which heat zone 2 (Mercury range) begins.
   * Pre-scaled by ORBIT_SCALE; conceptually between Mercury and Venus in catalog units.
   */
  heatZone2Boundary: number
  /**
   * World-space distance below which heat zone 3 (Sun proximity) begins.
   * Pre-scaled by ORBIT_SCALE; conceptually inside Mercury's orbit in catalog units.
   */
  heatZone3Boundary: number
  /**
   * World-space distance from Sun above which the cold zone begins.
   * Pre-scaled by ORBIT_SCALE; conceptually between Mars and Jupiter in catalog units.
   */
  coldBoundary: number
  /**
   * World-space distance above which cold zone 3 (deep cold: Uranus/Neptune/Pluto) begins.
   * Pre-scaled by ORBIT_SCALE; conceptually between Saturn and Uranus in catalog units.
   */
  coldZone3Boundary: number
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
  /**
   * Maximum temperature magnitude when thermal protection is active.
   * Temperature is clamped here and hull damage is suppressed.
   * Must be a positive value in the range (0, 100]. e.g. 75 = 75% of the bar.
   */
  protectedTempCap: number
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
 * Absolute temperature (0–100 scale) above which EVA is blocked even when zone
 * protection fully suppresses hull damage — the suit lockout matches the HUD stress band.
 */
const EVA_THERMAL_GAUGE_BLOCK_BEYOND = 75

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

  /** Fired after {@link ShipHealth.hp} changes (damage, healing, repair, reset, load). */
  onHpChanged: (() => void) | null = null

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
   * Whether EVA egress should be denied for thermal reasons: hull temperature magnitude
   * is past 75% on the −100…+100 gauge, or the ship
   * would take hull damage from temperature on this frame (identical rules to the
   * temperature branch inside {@link ShipHealth.tick} — radiation damage alone does not
   * trigger this).
   *
   * @param heatTempCap - Same `heatTempCap` passed to {@link ShipHealth.tick}
   * @param coldTempCap - Same `coldTempCap` passed to {@link ShipHealth.tick}
   * @returns True while thermal stress forbids EVA
   */
  isEvaThermalBlocked(heatTempCap: number, coldTempCap: number): boolean {
    const absTemp = Math.abs(this._temperature)
    if (absTemp > EVA_THERMAL_GAUGE_BLOCK_BEYOND) return true
    return this.isTakingThermalHullDamage(heatTempCap, coldTempCap)
  }

  /**
   * True when {@link ShipHealth.tick} would apply a non-zero temperature damage term
   * (extremes past {@link ShipHealthConfig.damageThreshold} without matching zone protection).
   *
   * @param heatTempCap - Same `heatTempCap` as {@link ShipHealth.tick}
   * @param coldTempCap - Same `coldTempCap` as {@link ShipHealth.tick}
   */
  private isTakingThermalHullDamage(heatTempCap: number, coldTempCap: number): boolean {
    const absTemp = Math.abs(this._temperature)
    if (absTemp <= this.config.damageThreshold) return false
    const heatProtected = heatTempCap < MAX_TEMPERATURE
    const coldProtected = coldTempCap > MIN_TEMPERATURE
    const isHeatDamage = this._temperature > 0
    const isColdDamage = this._temperature < 0
    const protectionBlocks = (isHeatDamage && heatProtected) || (isColdDamage && coldProtected)
    return !protectionBlocks
  }

  /** Current damage intensity (0–1). Drives the red vignette overlay. */
  get damageIntensity(): number {
    return this._lastDamageIntensity
  }

  private _lastDamageIntensity = 0

  private notifyHpChangedIfNeeded(previousHp: number): void {
    if (this._hp !== previousHp) {
      this.onHpChanged?.()
    }
  }

  /**
   * Restore hull from persisted save data (clamped to current max).
   * Clears death when HP is brought back above zero.
   *
   * @param hp - Hit points to apply.
   */
  setPersistedHp(hp: number): void {
    const previousHp = this._hp
    this._hp = Math.max(0, Math.min(this.config.maxHp, hp))
    if (this._hp > 0) {
      this._dead = false
    }
    this.notifyHpChangedIfNeeded(previousHp)
  }

  /**
   * Apply direct hull damage from an instantaneous event.
   *
   * Used for collisions / impacts that should bypass the temperature-radiation
   * simulation and immediately chip the hull.
   */
  applyDamage(amount: number, cause: string): void {
    if (this._dead || amount <= 0) return

    const previousHp = this._hp
    this._hp = Math.max(0, this._hp - amount)
    this._lastDamageIntensity = Math.min(1, Math.max(this._lastDamageIntensity, amount / 25))
    this.notifyHpChangedIfNeeded(previousHp)

    if (this._hp <= 0 && !this._dead) {
      this._dead = true
      this.onDeath?.(cause)
    }
  }

  /**
   * Advance health simulation by dt seconds.
   *
   * The `heatTempCap` and `coldTempCap` parameters implement zone-based thermal
   * protection. When a cap is tighter than the natural maximum, temperature is
   * clamped at the cap value and hull damage from temperature is fully suppressed.
   * Pass `MAX_TEMPERATURE` / `MIN_TEMPERATURE` (or omit) to disable protection.
   *
   * @param dt - Delta time in seconds
   * @param sunDistance - Distance from the Sun in world units
   * @param radiationProximity - Gravity proximity to Sun (0–1)
   * @param healing - Whether the ship is healing (e.g. Earth orbit)
   * @param heatResistance - Multiplier on hot-zone drift rate (0–1, lower = more resistant)
   * @param heatArmor - Multiplier on hull damage while overheated (0–1, lower = less damage)
   * @param coldResistance - Multiplier on cold-zone drift rate (0–1, lower = more resistant)
   * @param coldArmor - Multiplier on hull damage while frozen (0–1, lower = less damage)
   * @param radiationArmor - Multiplier on radiation damage (0–1, lower = less damage)
   * @param heatTempCap - Max positive temperature allowed; clamped + damage suppressed when < MAX_TEMPERATURE
   * @param coldTempCap - Min negative temperature allowed; clamped + damage suppressed when > MIN_TEMPERATURE
   */
  tick(
    dt: number,
    sunDistance: number,
    radiationProximity: number,
    healing = false,
    heatResistance = 1,
    heatArmor = 1,
    coldResistance = 1,
    coldArmor = 1,
    radiationArmor = 1,
    heatTempCap = MAX_TEMPERATURE,
    coldTempCap = MIN_TEMPERATURE,
  ): void {
    if (this._dead) return

    const hpBeforeTick = this._hp

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
    const resistanceFactor = targetTemp > 0 ? heatResistance : (targetTemp < 0 ? coldResistance : 1)
    const drift = Math.sign(diff) * Math.min(Math.abs(diff), this.config.tempDriftRate * driftMultiplier * resistanceFactor * dt)
    this._temperature = Math.max(MIN_TEMPERATURE, Math.min(MAX_TEMPERATURE, this._temperature + drift))

    // Zone-based thermal protection: clamp temperature and flag protection state
    const heatProtected = heatTempCap < MAX_TEMPERATURE
    const coldProtected = coldTempCap > MIN_TEMPERATURE
    if (heatProtected && this._temperature > heatTempCap) {
      this._temperature = heatTempCap
    }
    if (coldProtected && this._temperature < coldTempCap) {
      this._temperature = coldTempCap
    }

    // Temperature damage — suppressed entirely when thermal protection is active
    let tempDamage = 0
    const absTemp = Math.abs(this._temperature)
    if (absTemp > this.config.damageThreshold) {
      const isHeatDamage = this._temperature > 0
      const isColdDamage = this._temperature < 0
      const protectionBlocks = (isHeatDamage && heatProtected) || (isColdDamage && coldProtected)
      if (!protectionBlocks) {
        const ratio = (absTemp - this.config.damageThreshold) / (MAX_TEMPERATURE - this.config.damageThreshold)
        const armorFactor = isHeatDamage ? heatArmor : isColdDamage ? coldArmor : 1
        tempDamage = ratio * this.config.maxTempDamage * armorFactor * dt
      }
    }

    // Radiation damage
    let radDamage = 0
    if (radiationProximity > this.config.radiationThreshold) {
      const ratio =
        (radiationProximity - this.config.radiationThreshold) /
        (1 - this.config.radiationThreshold)
      radDamage = ratio * this.config.maxRadiationDamage * radiationArmor * dt
    }

    // Apply damage
    const totalDamage = tempDamage + radDamage
    if (totalDamage > 0) {
      this._hp = Math.max(0, this._hp - totalDamage)
    }

    // Damage intensity for vignette — starts at displayThreshold, maxes at 100
    const absTemp2 = Math.abs(this._temperature)
    const tempIntensity = absTemp2 > this.config.displayThreshold
      ? (absTemp2 - this.config.displayThreshold) / (MAX_TEMPERATURE - this.config.displayThreshold)
      : 0
    const radIntensity = radiationProximity > this.config.radiationThreshold
      ? (radiationProximity - this.config.radiationThreshold) / (1 - this.config.radiationThreshold)
      : 0
    this._lastDamageIntensity = Math.min(1, Math.max(tempIntensity, radIntensity))

    // Healing — only when no damage is occurring
    if (healing && totalDamage === 0) {
      this._hp = Math.min(this.config.maxHp, this._hp + this.config.healRate * dt)
    }

    // Death check
    if (this._hp <= 0 && !this._dead) {
      this._dead = true
      this.onDeath?.(this.getDeathCause(radiationProximity))
    }

    this.notifyHpChangedIfNeeded(hpBeforeTick)
  }

  /** Restore HP to maximum (full hull repair). */
  repairFull(): void {
    const previousHp = this._hp
    this._hp = this.config.maxHp
    this.notifyHpChangedIfNeeded(previousHp)
  }

  /** Reset HP and temperature to initial values. */
  reset(): void {
    const previousHp = this._hp
    this._hp = this.config.maxHp
    this._temperature = 0
    this._dead = false
    this.notifyHpChangedIfNeeded(previousHp)
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
