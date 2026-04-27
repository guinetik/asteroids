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
 * Radiation upgrades likewise provide zone-based protection: each successive
 * boundary closer to the Sun raises the required `shuttleRadiationResistance`
 * level. A player whose level matches or exceeds the active zone is fully
 * shielded; one level under takes half damage; two or more levels under takes
 * full damage. See {@link ShipHealth.tick} and the design spec for the table.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-05-ship-health-temperature-design.md
 * @spec docs/superpowers/specs/2026-04-23-radiation-zones-design.md
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
  /**
   * Legacy radiation proximity threshold (0–1).
   * Retained in the schema for save-file / catalog parity but no longer
   * consulted by the radiation damage path, which is now zone-based.
   *
   * @deprecated Replaced by `radiationZone{1,2,3}Boundary` in 2026-04-23.
   */
  radiationThreshold: number
  /** Max hull damage per second from radiation at the deepest zone (Sun proximity) */
  maxRadiationDamage: number
  /**
   * Sun-distance below which radiation Zone 1 begins (outer edge of any radiation).
   * Pre-scaled by ORBIT_SCALE. Default catalog value (`0.55`) sits between Venus
   * (`0.72`) and Mercury (`0.39`), so Mercury orbit lands inside Zone 1 (requires
   * `shuttleRadiationResistance` Lvl 1 to be safe).
   */
  radiationZone1Boundary: number
  /**
   * Sun-distance below which radiation Zone 2 begins.
   * Pre-scaled by ORBIT_SCALE. Default catalog value (`0.35`) sits just inside
   * Mercury's orbit — moving inward past Mercury immediately requires
   * `shuttleRadiationResistance` Lvl 2 for full immunity.
   */
  radiationZone2Boundary: number
  /**
   * Sun-distance below which radiation Zone 3 begins (deepest, Sun-proximity).
   * Pre-scaled by ORBIT_SCALE. Default catalog value (`0.25`) is aligned with
   * `heatZone3Boundary` so the lethal radiation and lethal heat bands kick in
   * together — only `shuttleRadiationResistance` Lvl 3 is fully safe here, and
   * Lvl 2 takes partial damage ("burn less severely" per the design spec).
   */
  radiationZone3Boundary: number
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

/** Number of radiation zones (Zone 1 = outermost, Zone 3 = Sun-proximity). */
const RADIATION_ZONE_COUNT = 3

/** Damage multiplier applied when the player's upgrade level is exactly one tier under the zone. */
const RADIATION_PARTIAL_ARMOR = 0.5

/** Damage multiplier applied when the player has no relevant protection (level << zone). */
const RADIATION_FULL_DAMAGE = 1

/** Damage multiplier applied when the player is fully shielded (level ≥ zone). */
const RADIATION_IMMUNE = 0

/**
 * Resolved radiation zone (`0` = none, `1`–`3` = nested bands closer to the Sun).
 */
export type RadiationZone = 0 | 1 | 2 | 3

/**
 * Compute the active radiation zone from a sun distance and the per-zone boundaries.
 * Pure function — exposed for tests and HUD overlays that need the same classification.
 *
 * @param sunDistance - Distance from the Sun in world units.
 * @param config - Ship-health config carrying the three radiation boundaries.
 * @returns The most-severe zone the ship currently occupies (`0` = safe).
 */
export function getRadiationZone(sunDistance: number, config: ShipHealthConfig): RadiationZone {
  if (sunDistance < config.radiationZone3Boundary) return 3
  if (sunDistance < config.radiationZone2Boundary) return 2
  if (sunDistance < config.radiationZone1Boundary) return 1
  return 0
}

/**
 * Resolve the per-tick radiation armor multiplier from the player's upgrade level
 * vs the active zone. Tiered model:
 *
 * - `level >= zone` → fully shielded (returns `0`)
 * - `level === zone - 1` → partial protection (returns `0.5`)
 * - `level <= zone - 2` → no protection (returns `1`)
 *
 * Zone `0` always returns `0` regardless of level (no radiation in safe space).
 *
 * @param level - The player's `shuttleRadiationResistance` upgrade level (`0`–`3`).
 * @param zone - The active radiation zone resolved from sun distance.
 * @returns Damage multiplier in `{0, 0.5, 1}`.
 */
export function getRadiationArmor(level: number, zone: RadiationZone): number {
  if (zone === 0) return RADIATION_IMMUNE
  if (level >= zone) return RADIATION_IMMUNE
  if (level === zone - 1) return RADIATION_PARTIAL_ARMOR
  return RADIATION_FULL_DAMAGE
}

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
  private _lastRadiationZone: RadiationZone = 0
  private _lastRadiationArmor = RADIATION_FULL_DAMAGE

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
   * Active radiation zone after the most recent {@link ShipHealth.tick}.
   * `0` when the ship is outside any radiation band.
   */
  get radiationZone(): RadiationZone {
    return this._lastRadiationZone
  }

  /**
   * Effective radiation armor multiplier from the most recent {@link ShipHealth.tick}
   * (`0` when fully shielded, `0.5` partial, `1` full damage). Useful for HUD pulses
   * that need to know whether radiation is *actually* hurting the hull right now.
   */
  get radiationArmor(): number {
    return this._lastRadiationArmor
  }

  /**
   * True when the ship is in any radiation zone AND the player's protection isn't
   * sufficient to block damage — the canonical "we're being irradiated" predicate
   * for HUD warnings and audio cues.
   */
  get isTakingRadiationDamage(): boolean {
    return this._lastRadiationZone > 0 && this._lastRadiationArmor > 0
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
   * Instant hull repair from an external source (e.g. map EVA science bolt on the shuttle).
   *
   * @param amount - HP to add (clamped to max; no-op if dead or `amount` ≤ 0).
   * @returns How many HP were applied and whether the hull is now at maximum.
   */
  applyHullHeal(amount: number): { applied: number; becameFull: boolean } {
    if (this._dead || amount <= 0) {
      return { applied: 0, becameFull: this._hp >= this.config.maxHp }
    }
    const previousHp = this._hp
    this._hp = Math.min(this.config.maxHp, this._hp + amount)
    this.notifyHpChangedIfNeeded(previousHp)
    return {
      applied: this._hp - previousHp,
      becameFull: this._hp >= this.config.maxHp,
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
   * Radiation is zone-based: the active zone is resolved from `sunDistance` against
   * `radiationZone{1,2,3}Boundary`. Damage is then tiered by the player's
   * `radiationLevel` vs the active zone (see {@link getRadiationArmor}).
   *
   * @param dt - Delta time in seconds
   * @param sunDistance - Distance from the Sun in world units
   * @param healing - Whether the ship is healing (e.g. Earth orbit)
   * @param heatResistance - Multiplier on hot-zone drift rate (0–1, lower = more resistant)
   * @param heatArmor - Multiplier on hull damage while overheated (0–1, lower = less damage)
   * @param coldResistance - Multiplier on cold-zone drift rate (0–1, lower = more resistant)
   * @param coldArmor - Multiplier on hull damage while frozen (0–1, lower = less damage)
   * @param radiationLevel - Player's `shuttleRadiationResistance` upgrade level (0–3)
   * @param heatTempCap - Max positive temperature allowed; clamped + damage suppressed when < MAX_TEMPERATURE
   * @param coldTempCap - Min negative temperature allowed; clamped + damage suppressed when > MIN_TEMPERATURE
   */
  tick(
    dt: number,
    sunDistance: number,
    healing = false,
    heatResistance = 1,
    heatArmor = 1,
    coldResistance = 1,
    coldArmor = 1,
    radiationLevel = 0,
    heatTempCap = MAX_TEMPERATURE,
    coldTempCap = MIN_TEMPERATURE,
  ): void {
    if (this._dead) return

    const hpBeforeTick = this._hp

    let targetTemp: number
    let driftMultiplier = 1
    if (sunDistance < this.config.hotBoundary) {
      targetTemp = HOT_ZONE_TARGET
      driftMultiplier = 1 + 3 * (1 - sunDistance / this.config.hotBoundary)
    } else if (sunDistance > this.config.coldBoundary) {
      targetTemp = COLD_ZONE_TARGET
      driftMultiplier =
        1 + 3 * Math.min(1, (sunDistance - this.config.coldBoundary) / this.config.coldBoundary)
    } else {
      targetTemp = SAFE_ZONE_TARGET
    }

    const diff = targetTemp - this._temperature
    const resistanceFactor = targetTemp > 0 ? heatResistance : targetTemp < 0 ? coldResistance : 1
    const drift =
      Math.sign(diff) *
      Math.min(Math.abs(diff), this.config.tempDriftRate * driftMultiplier * resistanceFactor * dt)
    this._temperature = Math.max(
      MIN_TEMPERATURE,
      Math.min(MAX_TEMPERATURE, this._temperature + drift),
    )

    const heatProtected = heatTempCap < MAX_TEMPERATURE
    const coldProtected = coldTempCap > MIN_TEMPERATURE
    if (heatProtected && this._temperature > heatTempCap) {
      this._temperature = heatTempCap
    }
    if (coldProtected && this._temperature < coldTempCap) {
      this._temperature = coldTempCap
    }

    let tempDamage = 0
    const absTemp = Math.abs(this._temperature)
    if (absTemp > this.config.damageThreshold) {
      const isHeatDamage = this._temperature > 0
      const isColdDamage = this._temperature < 0
      const protectionBlocks = (isHeatDamage && heatProtected) || (isColdDamage && coldProtected)
      if (!protectionBlocks) {
        const ratio =
          (absTemp - this.config.damageThreshold) / (MAX_TEMPERATURE - this.config.damageThreshold)
        const armorFactor = isHeatDamage ? heatArmor : isColdDamage ? coldArmor : 1
        tempDamage = ratio * this.config.maxTempDamage * armorFactor * dt
      }
    }

    const zone = getRadiationZone(sunDistance, this.config)
    const radArmor = getRadiationArmor(radiationLevel, zone)
    this._lastRadiationZone = zone
    this._lastRadiationArmor = radArmor
    let radDamage = 0
    if (zone > 0 && radArmor > 0) {
      radDamage = this.config.maxRadiationDamage * (zone / RADIATION_ZONE_COUNT) * radArmor * dt
    }

    const totalDamage = tempDamage + radDamage
    if (totalDamage > 0) {
      this._hp = Math.max(0, this._hp - totalDamage)
    }

    const absTemp2 = Math.abs(this._temperature)
    const tempIntensity =
      absTemp2 > this.config.displayThreshold
        ? (absTemp2 - this.config.displayThreshold) /
          (MAX_TEMPERATURE - this.config.displayThreshold)
        : 0
    const radIntensity = zone > 0 ? (zone / RADIATION_ZONE_COUNT) * radArmor : 0
    this._lastDamageIntensity = Math.min(1, Math.max(tempIntensity, radIntensity))

    if (healing && totalDamage === 0) {
      this._hp = Math.min(this.config.maxHp, this._hp + this.config.healRate * dt)
    }

    if (this._hp <= 0 && !this._dead) {
      this._dead = true
      this.onDeath?.(this.getDeathCause())
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
    this._lastRadiationZone = 0
    this._lastRadiationArmor = RADIATION_FULL_DAMAGE
    this.notifyHpChangedIfNeeded(previousHp)
  }

  /**
   * Determine cause of death from the most recent {@link ShipHealth.tick} state.
   * Radiation wins when it was actively damaging the hull; otherwise we fall back
   * to the temperature direction.
   *
   * @returns Human-readable death cause string.
   */
  private getDeathCause(): string {
    if (this._lastRadiationZone > 0 && this._lastRadiationArmor > 0) return 'Radiation Exposure'
    if (this._temperature > this.config.damageThreshold) return 'Hull Overheated'
    return 'Hull Frozen'
  }
}
