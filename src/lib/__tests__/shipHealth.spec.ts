import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ShipHealth, type ShipHealthConfig } from '../shipHealth'

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
  displayThreshold: 20,
  protectedTempCap: 55,
}

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
  })

  describe('temperature drift', () => {
    it('drifts toward +100 in hot zone (distance < hotBoundary)', () => {
      health.tick(1, 20, 0)
      expect(health.temperature).toBeGreaterThan(0)
    })

    it('drifts toward -100 in cold zone (distance > coldBoundary)', () => {
      health.tick(1, 400, 0)
      expect(health.temperature).toBeLessThan(0)
    })

    it('drifts toward 0 in safe zone (between hotBoundary and coldBoundary)', () => {
      // Force temperature positive first
      health.tick(10, 20, 0)
      const hotTemp = health.temperature
      expect(hotTemp).toBeGreaterThan(0)

      // Now put in safe zone — temperature should decrease toward 0
      health.tick(1, 100, 0)
      expect(health.temperature).toBeLessThan(hotTemp)
    })

    it('drifts faster closer to the Sun', () => {
      const near = new ShipHealth(config)
      const far = new ShipHealth(config)
      near.tick(1, 5, 0) // very close
      far.tick(1, 35, 0) // near boundary
      expect(near.temperature).toBeGreaterThan(far.temperature)
    })

    it('clamps temperature to +100 maximum', () => {
      // Tick many times in hot zone
      for (let i = 0; i < 100; i++) health.tick(1, 10, 0)
      expect(health.temperature).toBeLessThanOrEqual(100)
    })

    it('clamps temperature to -100 minimum', () => {
      for (let i = 0; i < 100; i++) health.tick(1, 500, 0)
      expect(health.temperature).toBeGreaterThanOrEqual(-100)
    })
  })

  describe('temperature damage', () => {
    it('does not damage hull when temperature is below threshold', () => {
      // Stay in safe zone for moderate ticks
      health.tick(1, 100, 0)
      expect(health.hp).toBe(100)
    })

    it('damages hull when temperature exceeds positive threshold', () => {
      // Get temp to exactly 100 by ticking in hot zone
      for (let i = 0; i < 20; i++) health.tick(1, 10, 0)
      const hpBeforeDamage = health.hp
      // At temp=100, ratio=1, damage = maxTempDamage * dt = 5 per second
      // HP should have dropped during saturation ticks
      expect(hpBeforeDamage).toBeLessThan(100)
    })

    it('damages hull when temperature falls below negative threshold', () => {
      // Get temp to -100 by ticking in cold zone
      for (let i = 0; i < 20; i++) health.tick(1, 500, 0)
      expect(health.hp).toBeLessThan(100)
    })

    it('scales temperature damage with how far past the threshold', () => {
      // At temp exactly at damageThreshold (60): ratio=0, no damage
      // Manually set temp just past threshold by ticking briefly in hot zone
      // then measure damage rate
      const fresh = new ShipHealth(config)
      // After 8 seconds in hot zone, temp = 64 (above threshold of 60)
      fresh.tick(8, 10, 0)
      const hpAt8s = fresh.hp
      // After 1 more second the temp will be higher → more damage
      fresh.tick(1, 10, 0)
      const hpAt9s = fresh.hp
      // There should be damage since temp > damageThreshold
      expect(hpAt9s).toBeLessThan(hpAt8s)
    })
  })

  describe('thermal armor upgrades', () => {
    it('heatArmor reduces overheating hull damage without changing drift', () => {
      const mitigated = new ShipHealth(config)
      const baseline = new ShipHealth(config)
      for (let i = 0; i < 25; i++) {
        mitigated.tick(1, 10, 0, false, 1, 0.5, 1, 1, 1)
        baseline.tick(1, 10, 0, false, 1, 1, 1, 1, 1)
      }
      expect(mitigated.temperature).toBeCloseTo(baseline.temperature, 5)
      expect(mitigated.hp).toBeGreaterThan(baseline.hp)
    })

    it('coldArmor reduces freezing hull damage without changing drift', () => {
      const mitigated = new ShipHealth(config)
      const baseline = new ShipHealth(config)
      for (let i = 0; i < 25; i++) {
        mitigated.tick(1, 500, 0, false, 1, 1, 1, 0.5, 1)
        baseline.tick(1, 500, 0, false, 1, 1, 1, 1, 1)
      }
      expect(mitigated.temperature).toBeCloseTo(baseline.temperature, 5)
      expect(mitigated.hp).toBeGreaterThan(baseline.hp)
    })
  })

  describe('radiation damage', () => {
    it('does not damage hull when proximity below radiationThreshold', () => {
      health.tick(1, 100, 0.1)
      expect(health.hp).toBe(100)
    })

    it('damages hull when proximity exceeds radiationThreshold', () => {
      health.tick(1, 100, 0.5)
      expect(health.hp).toBeLessThan(100)
    })

    it('scales radiation damage with proximity above threshold', () => {
      const a = new ShipHealth(config)
      const b = new ShipHealth(config)
      a.tick(1, 100, 0.5)
      b.tick(1, 100, 0.9)
      // Higher proximity → more damage → lower HP
      expect(b.hp).toBeLessThan(a.hp)
    })

    it('applies full maxRadiationDamage at proximity=1', () => {
      // proximity=1: ratio=(1-0.3)/(1-0.3)=1, damage=15*dt=15 per second
      health.tick(1, 100, 1)
      expect(health.hp).toBeCloseTo(100 - 15, 5)
    })
  })

  describe('coldResistance upgrade', () => {
    it('reduces cold-zone drift rate when coldResistance < 1', () => {
      const resistant = new ShipHealth(config)
      const normal = new ShipHealth(config)
      // coldResistance=0.5 → half drift rate in cold zone
      resistant.tick(1, 500, 0, false, 1, 1, 0.5, 1)
      normal.tick(1, 500, 0, false, 1, 1, 1, 1)
      // resistant ship should be less cold (closer to 0)
      expect(resistant.temperature).toBeGreaterThan(normal.temperature)
    })

    it('applies no cold drift reduction when coldResistance=1 (default)', () => {
      const a = new ShipHealth(config)
      const b = new ShipHealth(config)
      a.tick(1, 500, 0)
      b.tick(1, 500, 0, false, 1, 1, 1, 1)
      expect(a.temperature).toBeCloseTo(b.temperature, 10)
    })
  })

  describe('radiationArmor upgrade', () => {
    it('halves radiation damage when radiationArmor=0.5', () => {
      const armored = new ShipHealth(config)
      const normal = new ShipHealth(config)
      // proximity=1, dt=1: normal damage = maxRadiationDamage * 1 = 15
      // armored damage = 15 * 0.5 = 7.5
      armored.tick(1, 100, 1, false, 1, 1, 1, 1, 0.5)
      normal.tick(1, 100, 1)
      expect(armored.hp).toBeGreaterThan(normal.hp)
      expect(armored.hp).toBeCloseTo(100 - 7.5, 5)
    })

    it('applies full radiation damage when radiationArmor=1 (default)', () => {
      const a = new ShipHealth(config)
      const b = new ShipHealth(config)
      a.tick(1, 100, 1)
      b.tick(1, 100, 1, false, 1, 1, 1, 1, 1)
      expect(a.hp).toBeCloseTo(b.hp, 10)
    })
  })

  describe('healing', () => {
    it('restores HP when healing=true and no damage is occurring', () => {
      // Manually damage first
      health.tick(1, 100, 0.5) // take radiation damage
      const damagedHp = health.hp
      // Now heal in safe zone, no radiation
      health.tick(1, 100, 0, true)
      expect(health.hp).toBeGreaterThan(damagedHp)
    })

    it('heals at the configured healRate per second', () => {
      // Take enough damage that healing 10 HP won't overshoot maxHp
      for (let i = 0; i < 3; i++) health.tick(1, 100, 1) // ~45 damage (15/s)
      const damagedHp = health.hp
      health.tick(1, 100, 0, true) // heal 1 second = +10 HP
      expect(health.hp).toBeCloseTo(damagedHp + config.healRate, 4)
    })

    it('does not heal above maxHp', () => {
      health.tick(1, 100, 0, true)
      expect(health.hp).toBeLessThanOrEqual(100)
    })

    it('does not heal when damage is occurring simultaneously', () => {
      health.tick(1, 100, 0.5) // radiation damage first
      const hpAfterDamage = health.hp
      // healing=true but radiation is still active
      health.tick(1, 100, 0.5, true)
      // Should not heal since totalDamage > 0
      expect(health.hp).toBeLessThanOrEqual(hpAfterDamage)
    })
  })

  describe('death', () => {
    it('fires onDeath with "Radiation Exposure" cause', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      // Apply massive radiation damage — tick many times
      for (let i = 0; i < 20; i++) health.tick(1, 100, 1)
      expect(onDeath).toHaveBeenCalledWith('Radiation Exposure')
    })

    it('fires onDeath with "Hull Overheated" cause', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      // Extreme heat — deep in hot zone, many ticks
      for (let i = 0; i < 50; i++) health.tick(1, 5, 0)
      expect(onDeath).toHaveBeenCalledWith('Hull Overheated')
    })

    it('fires onDeath with "Hull Frozen" cause', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 50; i++) health.tick(1, 500, 0)
      expect(onDeath).toHaveBeenCalledWith('Hull Frozen')
    })

    it('fires onDeath only once', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 50; i++) health.tick(1, 100, 1)
      expect(onDeath).toHaveBeenCalledTimes(1)
    })

    it('stops ticking after death', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 20; i++) health.tick(1, 100, 1)
      const hpAfterDeath = health.hp
      health.tick(1, 100, 1) // should be a no-op
      expect(health.hp).toBe(hpAfterDeath)
    })
  })

  describe('temperatureVisible', () => {
    it('is false when temp is within displayThreshold', () => {
      // Very short time near boundary — temp stays under 20
      health.tick(0.5, 39, 0)
      expect(Math.abs(health.temperature)).toBeLessThan(config.displayThreshold)
      expect(health.temperatureVisible).toBe(false)
    })

    it('is true when temp exceeds displayThreshold', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 20, 0)
      expect(health.temperature).toBeGreaterThan(config.displayThreshold)
      expect(health.temperatureVisible).toBe(true)
    })

    it('is true when temp is below negative displayThreshold', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 500, 0)
      expect(health.temperature).toBeLessThan(-config.displayThreshold)
      expect(health.temperatureVisible).toBe(true)
    })
  })

  describe('zone-based thermal protection caps', () => {
    it('caps positive temperature at protectedTempCap when heatTempCap is active', () => {
      // Tick many times in hot zone with protection active (heatTempCap = 55)
      for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 55, -100)
      expect(health.temperature).toBeLessThanOrEqual(55)
      expect(health.temperature).toBeCloseTo(55, 0)
    })

    it('suppresses hull damage when heat protection cap is active', () => {
      // Cap at 55 which is below damageThreshold (60) — no damage even though cap is applied
      for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 55, -100)
      expect(health.hp).toBe(100)
    })

    it('suppresses hull damage even when heatTempCap exceeds damageThreshold', () => {
      // Cap at 65 which is above damageThreshold (60) — protection still blocks damage
      for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 65, -100)
      expect(health.temperature).toBeCloseTo(65, 0)
      expect(health.hp).toBe(100)
    })

    it('allows temperature to reach max and damage hull when no cap is active', () => {
      for (let i = 0; i < 30; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 100, -100)
      expect(health.hp).toBeLessThan(100)
    })

    it('caps negative temperature at -protectedTempCap when coldTempCap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 100, -55)
      expect(health.temperature).toBeGreaterThanOrEqual(-55)
      expect(health.temperature).toBeCloseTo(-55, 0)
    })

    it('suppresses hull damage when cold protection cap is active', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 100, -55)
      expect(health.hp).toBe(100)
    })

    it('does not clamp cold temperature when no cold cap is set', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 100, -100)
      expect(health.temperature).toBeLessThan(-55)
    })

    it('heat cap does not interfere with cold zone', () => {
      // Active heat cap but in cold zone — temperature should drift negative freely
      for (let i = 0; i < 30; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 55, -100)
      expect(health.temperature).toBeLessThan(0)
    })

    describe('full immunity (cap = 0)', () => {
      it('clamps temperature to 0 in hot zone — bar stays below displayThreshold', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 0, -100)
        expect(health.temperature).toBe(0)
        expect(health.temperatureVisible).toBe(false)
      })

      it('suppresses all hull damage when immune in hot zone', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 0, -100)
        expect(health.hp).toBe(100)
      })

      it('clamps temperature to 0 in cold zone — bar stays dark', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 100, 0)
        expect(health.temperature).toBe(0)
        expect(health.temperatureVisible).toBe(false)
      })

      it('suppresses all hull damage when immune in cold zone', () => {
        for (let i = 0; i < 50; i++) health.tick(1, 500, 0, false, 1, 1, 1, 1, 1, 100, 0)
        expect(health.hp).toBe(100)
      })

      it('cools existing positive temperature down to 0 when entering immune hot zone', () => {
        // Start with high temperature from a previous hot exposure
        for (let i = 0; i < 15; i++) health.tick(1, 10, 0)
        expect(health.temperature).toBeGreaterThan(0)
        // Now enter immune zone — temperature must drop to 0
        for (let i = 0; i < 30; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 0, -100)
        expect(health.temperature).toBe(0)
      })
    })
  })

  describe('isEvaThermalBlocked', () => {
    it('returns false at neutral temperature with no protection caps', () => {
      expect(health.isEvaThermalBlocked(100, -100)).toBe(false)
    })

    it('returns true when temperature magnitude exceeds 75', () => {
      for (let i = 0; i < 80; i++) health.tick(1, 800, 0)
      expect(health.temperature).toBeLessThan(-75)
      expect(health.isEvaThermalBlocked(100, -100)).toBe(true)
    })

    it('returns false when heat-capped below damage and within 75% gauge', () => {
      for (let i = 0; i < 50; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 65, -100)
      expect(health.temperature).toBeCloseTo(65, 0)
      expect(health.isEvaThermalBlocked(65, -100)).toBe(false)
    })

    it('returns true in unprotected hot exposure hot enough for hull thermal damage', () => {
      for (let i = 0; i < 30; i++) health.tick(1, 10, 0, false, 1, 1, 1, 1, 1, 100, -100)
      expect(health.temperature).toBeGreaterThan(config.damageThreshold)
      expect(health.hp).toBeLessThan(100)
      expect(health.isEvaThermalBlocked(100, -100)).toBe(true)
    })
  })

  describe('reset', () => {
    it('restores HP to maxHp', () => {
      for (let i = 0; i < 5; i++) health.tick(1, 100, 1)
      expect(health.hp).toBeLessThan(100)
      health.reset()
      expect(health.hp).toBe(100)
    })

    it('resets temperature to 0', () => {
      health.tick(5, 10, 0)
      expect(health.temperature).toBeGreaterThan(0)
      health.reset()
      expect(health.temperature).toBe(0)
    })

    it('allows ticking again after death + reset', () => {
      const onDeath = vi.fn()
      health.onDeath = onDeath
      for (let i = 0; i < 20; i++) health.tick(1, 100, 1)
      expect(onDeath).toHaveBeenCalledTimes(1)

      health.reset()
      // Should tick again and not immediately re-fire onDeath
      health.tick(0.1, 100, 0)
      expect(health.hp).toBe(100)
    })
  })
})
