import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ShipHealth,
  getRadiationZone,
  getRadiationArmor,
  type ShipHealthConfig,
} from '../shipHealth'

const config: ShipHealthConfig = {
  maxHp: 100,
  healRate: 10,
  hotBoundary: 40,
  heatZone2Boundary: 25,
  heatZone3Boundary: 12,
  coldBoundary: 350,
  coldZone3Boundary: 600,
  tempDriftRate: 8,
  damageThreshold: 60,
  maxTempDamage: 5,
  radiationThreshold: 0.3,
  maxRadiationDamage: 15,
  radiationZone1Boundary: 25,
  radiationZone2Boundary: 12,
  radiationZone3Boundary: 6,
  displayThreshold: 20,
  protectedTempCap: 55,
}

/**
 * Sun distance well inside the safe band (between hotBoundary and coldBoundary).
 * Used by tests that need radiation/thermal effects to stay quiescent.
 */
const SAFE_SUN_DISTANCE = 100

/** Sun distance inside Zone 1 (Mercury-orbit analog) but outside Zone 2. */
const ZONE_1_SUN_DISTANCE = 20

/** Sun distance inside Zone 2 (between Mercury and Sun proximity) but outside Zone 3. */
const ZONE_2_SUN_DISTANCE = 9

/** Sun distance inside Zone 3 (innermost, Sun proximity). */
const ZONE_3_SUN_DISTANCE = 3

describe('getRadiationZone', () => {
  it('returns 0 outside the outer boundary', () => {
    expect(getRadiationZone(SAFE_SUN_DISTANCE, config)).toBe(0)
    expect(getRadiationZone(config.radiationZone1Boundary, config)).toBe(0)
  })

  it('returns 1 between zone1 and zone2 boundaries', () => {
    expect(getRadiationZone(ZONE_1_SUN_DISTANCE, config)).toBe(1)
  })

  it('returns 2 between zone2 and zone3 boundaries', () => {
    expect(getRadiationZone(ZONE_2_SUN_DISTANCE, config)).toBe(2)
  })

  it('returns 3 inside zone3 boundary', () => {
    expect(getRadiationZone(ZONE_3_SUN_DISTANCE, config)).toBe(3)
    expect(getRadiationZone(0, config)).toBe(3)
  })
})

describe('getRadiationArmor', () => {
  it('always returns 0 in zone 0 regardless of level', () => {
    expect(getRadiationArmor(0, 0)).toBe(0)
    expect(getRadiationArmor(3, 0)).toBe(0)
  })

  it('returns 0 (immune) when level >= zone', () => {
    expect(getRadiationArmor(1, 1)).toBe(0)
    expect(getRadiationArmor(2, 2)).toBe(0)
    expect(getRadiationArmor(3, 3)).toBe(0)
    expect(getRadiationArmor(3, 1)).toBe(0)
  })

  it('returns 0.5 (partial) when level === zone - 1 (tier gap === 1)', () => {
    expect(getRadiationArmor(0, 1)).toBe(0.5)
    expect(getRadiationArmor(1, 2)).toBe(0.5)
    expect(getRadiationArmor(2, 3)).toBe(0.5)
  })

  it('returns 1 (full damage) when level <= zone - 2 (tier gap >= 2)', () => {
    expect(getRadiationArmor(0, 2)).toBe(1)
    expect(getRadiationArmor(0, 3)).toBe(1)
    expect(getRadiationArmor(1, 3)).toBe(1)
  })
})

describe('ShipHealth', () => {
  let health: ShipHealth

  beforeEach(() => {
    health = new ShipHealth(config)
  })

  describe('setPersistedHp', () => {
    it('clamps to max and invokes onHpChanged', () => {
      const spy = vi.fn()
      health.onHpChanged = spy
      health.applyDamage(40, 'test')
      expect(health.hp).toBe(60)
      expect(spy).toHaveBeenCalled()
      spy.mockClear()
      health.setPersistedHp(55)
      expect(health.hp).toBe(55)
      expect(spy).toHaveBeenCalled()
      health.setPersistedHp(9999)
      expect(health.hp).toBe(100)
    })

    it('clears death when HP is restored from zero', () => {
      health.applyDamage(200, 'test')
      expect(health.hp).toBe(0)
      health.setPersistedHp(50)
      expect(health.hp).toBe(50)
    })
  })

  describe('initial state', () => {
    it('starts at full HP', () => {
      expect(health.hp).toBe(100)
      expect(health.maxHp).toBe(100)
    })

    it('starts at zero temperature', () => {
      expect(health.temperature).toBe(0)
    })

    it('temperatureVisible is false at zero temperature', () => {
      expect(health.temperatureVisible).toBe(false)
    })

    it('exposes radiationZone === 0 before any tick', () => {
      expect(health.radiationZone).toBe(0)
    })
  })

  describe('temperature drift', () => {
    it('drifts toward +100 in hot zone (distance < hotBoundary)', () => {
      health.tick(1, 20)
      expect(health.temperature).toBeGreaterThan(0)
    })

    it('drifts toward -100 in cold zone (distance > coldBoundary)', () => {
      health.tick(1, 400)
      expect(health.temperature).toBeLessThan(0)
    })

    it('drifts toward 0 in safe zone (between hotBoundary and coldBoundary)', () => {
      health.tick(10, 20)
      const hotTemp = health.temperature
      expect(hotTemp).toBeGreaterThan(0)

      health.tick(1, SAFE_SUN_DISTANCE)
      expect(health.temperature).toBeLessThan(hotTemp)
    })

    it('drifts faster closer to the Sun', () => {
      const near = new ShipHealth(config)
      const far = new ShipHealth(config)
      near.tick(1, 5)
      far.tick(1, 35)
      expect(near.temperature).toBeGreaterThan(far.temperature)
    })

    it('clamps temperature to +100 maximum', () => {
      for (let i = 0; i < 100; i++) health.tick(1, 10)
      expect(health.temperature).toBeLessThanOrEqual(100)
    })

    it('clamps temperature to -100 minimum', () => {
      for (let i = 0; i < 100; i++) health.tick(1, 500)
      expect(health.temperature).toBeGreaterThanOrEqual(-100)
    })
  })

  describe('temperature damage', () => {
    it('does not damage hull when temperature is below threshold', () => {
      health.tick(1, SAFE_SUN_DISTANCE)
      expect(health.hp).toBe(100)
    })

    it('damages hull when temperature exceeds positive threshold', () => {
      for (let i = 0; i < 20; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3)
      expect(health.hp).toBeLessThan(100)
    })

    it('damages hull when temperature falls below negative threshold', () => {
      for (let i = 0; i < 20; i++) health.tick(1, 500)
      expect(health.hp).toBeLessThan(100)
    })

    it('scales temperature damage with how far past the threshold', () => {
      const fresh = new ShipHealth(config)
      fresh.tick(8, 10, false, 1, 1, 1, 1, 3)
      const hpAt8s = fresh.hp
      fresh.tick(1, 10, false, 1, 1, 1, 1, 3)
      const hpAt9s = fresh.hp
      expect(hpAt9s).toBeLessThan(hpAt8s)
    })
  })

  describe('thermal armor upgrades', () => {
    it('heatArmor reduces overheating hull damage without changing drift', () => {
      const mitigated = new ShipHealth(config)
      const baseline = new ShipHealth(config)
      for (let i = 0; i < 25; i++) {
        mitigated.tick(1, 10, false, 1, 0.5, 1, 1, 3)
        baseline.tick(1, 10, false, 1, 1, 1, 1, 3)
      }
      expect(mitigated.temperature).toBeCloseTo(baseline.temperature, 5)
      expect(mitigated.hp).toBeGreaterThan(baseline.hp)
    })

    it('coldArmor reduces freezing hull damage without changing drift', () => {
      const mitigated = new ShipHealth(config)
      const baseline = new ShipHealth(config)
      for (let i = 0; i < 25; i++) {
        mitigated.tick(1, 500, false, 1, 1, 1, 0.5, 0)
        baseline.tick(1, 500, false, 1, 1, 1, 1, 0)
      }
      expect(mitigated.temperature).toBeCloseTo(baseline.temperature, 5)
      expect(mitigated.hp).toBeGreaterThan(baseline.hp)
    })
  })

  describe('radiation damage — zone-based', () => {
    it('does not damage hull outside any radiation zone', () => {
      health.tick(1, SAFE_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.hp).toBe(100)
      expect(health.radiationZone).toBe(0)
    })

    it('Zone 1 / Lvl 0 → 2.5 dmg/s partial (15 × 1/3 × 0.5 × 1) — chip damage, not lethal', () => {
      health.tick(1, ZONE_1_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.radiationZone).toBe(1)
      expect(health.radiationArmor).toBe(0.5)
      expect(health.hp).toBeCloseTo(100 - 2.5, 5)
    })

    it('Zone 2 / Lvl 0 → 10 dmg/s full damage (tier gap === 2)', () => {
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.radiationZone).toBe(2)
      expect(health.radiationArmor).toBe(1)
      expect(health.hp).toBeCloseTo(100 - 10, 5)
    })

    it('Zone 3 / Lvl 1 → 15 dmg/s full damage (tier gap === 2)', () => {
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 1)
      expect(health.radiationZone).toBe(3)
      expect(health.radiationArmor).toBe(1)
      expect(health.hp).toBeCloseTo(100 - 15, 5)
    })

    it('Zone 1 / Lvl 1 → fully shielded', () => {
      health.tick(1, ZONE_1_SUN_DISTANCE, false, 1, 1, 1, 1, 1)
      expect(health.hp).toBe(100)
      expect(health.radiationZone).toBe(1)
      expect(health.radiationArmor).toBe(0)
    })

    it('Zone 2 / Lvl 1 → 5 dmg/s partial (15 × 2/3 × 0.5 × 1)', () => {
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 1)
      expect(health.radiationZone).toBe(2)
      expect(health.radiationArmor).toBe(0.5)
      expect(health.hp).toBeCloseTo(100 - 5, 5)
    })

    it('Zone 2 / Lvl 2 → fully shielded', () => {
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 2)
      expect(health.hp).toBe(100)
    })

    it('Zone 3 / Lvl 2 → 7.5 dmg/s partial (15 × 3/3 × 0.5 × 1)', () => {
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 2)
      expect(health.radiationZone).toBe(3)
      expect(health.radiationArmor).toBe(0.5)
      expect(health.hp).toBeCloseTo(100 - 7.5, 5)
    })

    it('Zone 3 / Lvl 3 → fully shielded (orbit Sun freely)', () => {
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 3)
      expect(health.hp).toBe(100)
      expect(health.radiationArmor).toBe(0)
    })

    it('Zone 3 / Lvl 0 → 15 dmg/s (full damage at deepest zone)', () => {
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.hp).toBeCloseTo(100 - 15, 5)
    })

    it('isTakingRadiationDamage tracks the zone × armor product', () => {
      health.tick(1, ZONE_1_SUN_DISTANCE, false, 1, 1, 1, 1, 1)
      expect(health.isTakingRadiationDamage).toBe(false)
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 1)
      expect(health.isTakingRadiationDamage).toBe(true)
    })
  })

  describe('healing', () => {
    it('restores HP when healing=true and no damage is occurring', () => {
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      const damagedHp = health.hp
      health.tick(1, SAFE_SUN_DISTANCE, true)
      expect(health.hp).toBeGreaterThan(damagedHp)
    })

    it('heals at the configured healRate per second', () => {
      // Inflict deterministic damage so healing isn't clamped by maxHp and the
      // heal tick stays in a safe zone with no thermal/radiation interference.
      health.applyDamage(50, 'test')
      const damagedHp = health.hp
      health.tick(1, SAFE_SUN_DISTANCE, true)
      expect(health.hp).toBeCloseTo(damagedHp + config.healRate, 4)
    })

    it('does not heal above maxHp', () => {
      health.tick(1, SAFE_SUN_DISTANCE, true)
      expect(health.hp).toBeLessThanOrEqual(100)
    })

    it('does not heal when radiation damage is occurring simultaneously', () => {
      health.tick(1, ZONE_2_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      const hpAfterDamage = health.hp
      health.tick(1, ZONE_2_SUN_DISTANCE, true, 1, 1, 1, 1, 0)
      expect(health.hp).toBeLessThanOrEqual(hpAfterDamage)
    })
  })

  describe('death', () => {
    it('fires onDeath with "Radiation Exposure" cause', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 20; i++) health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(onDeath).toHaveBeenCalledWith('Radiation Exposure')
    })

    it('fires onDeath with "Hull Overheated" cause when temp damage dominates outside any rad zone', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 50; i++) health.tick(1, 30, false, 1, 1, 1, 1, 3)
      expect(onDeath).toHaveBeenCalledWith('Hull Overheated')
    })

    it('fires onDeath with "Hull Frozen" cause', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0)
      expect(onDeath).toHaveBeenCalledWith('Hull Frozen')
    })

    it('fires onDeath only once', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 50; i++) health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(onDeath).toHaveBeenCalledTimes(1)
    })

    it('stops ticking after death', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 20; i++) health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      const hpAfterDeath = health.hp
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.hp).toBe(hpAfterDeath)
    })
  })

  describe('temperatureVisible', () => {
    it('is false when temp is within displayThreshold', () => {
      health.tick(0.5, 39)
      expect(Math.abs(health.temperature)).toBeLessThan(config.displayThreshold)
      expect(health.temperatureVisible).toBe(false)
    })

    it('is true when temp exceeds displayThreshold', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 20)
      expect(health.temperature).toBeGreaterThan(config.displayThreshold)
      expect(health.temperatureVisible).toBe(true)
    })

    it('is true when temp is below negative displayThreshold', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 500)
      expect(health.temperature).toBeLessThan(-config.displayThreshold)
      expect(health.temperatureVisible).toBe(true)
    })
  })

  describe('zone-based thermal protection caps', () => {
    it('caps positive temperature at protectedTempCap when heatTempCap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 0, 55, -100)
      expect(health.temperature).toBeLessThanOrEqual(55)
      expect(health.temperature).toBeCloseTo(55, 0)
    })

    it('suppresses hull damage when heat protection cap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 55, -100)
      expect(health.hp).toBe(100)
    })

    it('suppresses hull damage even when heatTempCap exceeds damageThreshold', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 65, -100)
      expect(health.temperature).toBeCloseTo(65, 0)
      expect(health.hp).toBe(100)
    })

    it('allows temperature to reach max and damage hull when no cap is active', () => {
      for (let i = 0; i < 30; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 100, -100)
      expect(health.hp).toBeLessThan(100)
    })

    it('caps negative temperature at -protectedTempCap when coldTempCap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 100, -55)
      expect(health.temperature).toBeGreaterThanOrEqual(-55)
      expect(health.temperature).toBeCloseTo(-55, 0)
    })

    it('suppresses hull damage when cold protection cap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 100, -55)
      expect(health.hp).toBe(100)
    })

    it('does not clamp cold temperature when no cold cap is set', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 100, -100)
      expect(health.temperature).toBeLessThan(-55)
    })

    it('heat cap does not interfere with cold zone', () => {
      for (let i = 0; i < 30; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 55, -100)
      expect(health.temperature).toBeLessThan(0)
    })

    describe('full immunity (cap = 0)', () => {
      it('clamps temperature to 0 in hot zone — bar stays below displayThreshold', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 0, -100)
        expect(health.temperature).toBe(0)
        expect(health.temperatureVisible).toBe(false)
      })

      it('suppresses all hull damage when immune in hot zone', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 0, -100)
        expect(health.hp).toBe(100)
      })

      it('clamps temperature to 0 in cold zone — bar stays dark', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 100, 0)
        expect(health.temperature).toBe(0)
        expect(health.temperatureVisible).toBe(false)
      })

      it('suppresses all hull damage when immune in cold zone', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 500, false, 1, 1, 1, 1, 0, 100, 0)
        expect(health.hp).toBe(100)
      })

      it('cools existing positive temperature down to 0 when entering immune hot zone', () => {
        // Warm-up loop must keep radiation neutralized (radLevel=3) so the ship
        // survives long enough to actually develop a hot temperature.
        for (let i = 0; i < 15; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3)
        expect(health.temperature).toBeGreaterThan(0)
        for (let i = 0; i < 30; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 0, -100)
        expect(health.temperature).toBe(0)
      })
    })
  })

  describe('isEvaThermalBlocked', () => {
    it('returns false at neutral temperature with no protection caps', () => {
      expect(health.isEvaThermalBlocked(100, -100)).toBe(false)
    })

    it('returns true when temperature magnitude exceeds 75', () => {
      for (let i = 0; i < 80; i++) health.tick(1, 800)
      expect(health.temperature).toBeLessThan(-75)
      expect(health.isEvaThermalBlocked(100, -100)).toBe(true)
    })

    it('returns false when heat-capped below damage and within 75% gauge', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 65, -100)
      expect(health.temperature).toBeCloseTo(65, 0)
      expect(health.isEvaThermalBlocked(65, -100)).toBe(false)
    })

    it('returns true in unprotected hot exposure hot enough for hull thermal damage', () => {
      for (let i = 0; i < 30; i++) health.tick(1, 10, false, 1, 1, 1, 1, 3, 100, -100)
      expect(health.temperature).toBeGreaterThan(config.damageThreshold)
      expect(health.hp).toBeLessThan(100)
      expect(health.isEvaThermalBlocked(100, -100)).toBe(true)
    })
  })

  describe('reset', () => {
    it('restores HP to maxHp', () => {
      for (let i = 0; i < 5; i++) health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.hp).toBeLessThan(100)
      health.reset()
      expect(health.hp).toBe(100)
    })

    it('resets temperature to 0', () => {
      health.tick(5, 10)
      expect(health.temperature).toBeGreaterThan(0)
      health.reset()
      expect(health.temperature).toBe(0)
    })

    it('clears the recorded radiation zone', () => {
      health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(health.radiationZone).toBe(3)
      health.reset()
      expect(health.radiationZone).toBe(0)
    })

    it('allows ticking again after death + reset', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 20; i++) health.tick(1, ZONE_3_SUN_DISTANCE, false, 1, 1, 1, 1, 0)
      expect(onDeath).toHaveBeenCalledTimes(1)

      health.reset()
      health.tick(0.1, SAFE_SUN_DISTANCE)
      expect(health.hp).toBe(100)
    })
  })
})
