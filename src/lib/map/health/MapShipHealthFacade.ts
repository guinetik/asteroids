/**
 * Owns the map view's ship-health state and persistence.
 *
 * Responsibilities pulled out of {@link MapViewController}:
 *   - Build the world-scaled config from raw JSON + hull upgrade multiplier.
 *   - Construct and own the {@link ShipHealth} instance.
 *   - Throttled hull-HP persist (~5/s) + `pagehide` flush for tab navigation.
 *   - Per-frame radiation + thermal tick that returns the HUD / audio snapshot.
 *
 * The facade does not touch the player profile directly: it exposes a pull-style
 * `getCurrentHp()` so the controller can write HP into the profile on its own
 * persist flow (shop repair, respawn, etc.).
 *
 * @author guinetik
 * @date 2026-04-24
 * @spec docs/superpowers/specs/2026-04-04-thruster-fuel-hud-design.md
 */
import { ShipHealth, type ShipHealthConfig } from '@/lib/shipHealth'
import type { RadiationWarningState } from '@/lib/ShuttleTelemetry'
import {
  buildShipHealthConfig,
  clampInitialHullHp,
  computeThermalCaps,
  type ThermalCaps,
} from './shipHealthHelpers'

/** Throttle for hull-HP → profile writes (5/s). Debounce would never fire during continuous damage. */
const HULL_PERSIST_THROTTLE_MS = 200

/** Inputs for {@link MapShipHealthFacade.initialize}. */
export interface MapShipHealthInitInput {
  /** Raw unscaled config (e.g. `shipHealthData` JSON). */
  rawData: ShipHealthConfig
  /** Current `shuttleHull` upgrade value (1.0..2.0). */
  hullMultiplier: number
  /** Catalog→world scale factor (`ORBIT_SCALE`). */
  orbitScale: number
  /** Persisted hull HP from the player profile; `undefined` when no save exists. */
  savedHp: number | undefined
  /** Invoked when the shuttle dies, with the cause string. */
  onDeath: (cause: string) => void
  /** Invoked after a throttled persist fires, so the controller can snapshot HP to profile + disk. */
  onPersistDue: () => void
}

/** Per-frame inputs for {@link MapShipHealthFacade.tickHealth}. */
export interface MapShipHealthTickInput {
  /** Frame delta in seconds. */
  dt: number
  /** Distance from the Sun in world units. */
  sunDist: number
  /** True while the ship is orbiting Earth — enables passive HP regen. */
  isHealingAtEarth: boolean
  /** `shuttleHeatResistance` upgrade value (used for mitigation + armor). */
  heatMitigation: number
  /** `shuttleFreezeResistance` upgrade value (used for mitigation + armor). */
  coldMitigation: number
  /** `shuttleRadiationResistance` level (0..3). */
  radiationLevel: number
  /** `shuttleHeatResistance` upgrade level (0..3) for thermal-zone caps. */
  heatZoneLevel: number
  /** `shuttleFreezeResistance` upgrade level (0..3) for thermal-zone caps. */
  coldZoneLevel: number
}

/** Output of {@link MapShipHealthFacade.tickHealth} — what the controller pipes to HUD + audio. */
export interface MapShipHealthTickOutput {
  /** Fresh radiation-warning state for the Vue HUD banner. */
  radiation: RadiationWarningState
  /** Latest temperature value — forward to `MapShuttleEffects.setTemperature`. */
  temperature: number
  /** True while radiation is actively ticking hull damage (drives the geiger audio loop). */
  radiationDamageActive: boolean
}

/** Guard in case the ship is dead / simulation frozen. Clears stale HUD + audio state. */
export const IDLE_RADIATION_STATE: RadiationWarningState = {
  zone: 0,
  damageActive: false,
  visible: false,
}

/**
 * Facade that encapsulates the full ship-health lifecycle for the map view.
 *
 * Not a Vue ref holder — the controller still subscribes Vue through its
 * `onRadiationWarning` callback; this class just produces the per-frame payload.
 */
export class MapShipHealthFacade {
  private health: ShipHealth | null = null
  private configValue: ShipHealthConfig | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private onPersistDue: (() => void) | null = null
  /** Bound handler so `addEventListener` / `removeEventListener` can match references. */
  private readonly pageHideHandler = (): void => {
    this.clearPersistTimer()
    this.onPersistDue?.()
  }

  /** Live `ShipHealth` instance, or `null` before `initialize()` runs. */
  get shipHealth(): ShipHealth | null {
    return this.health
  }

  /** Scaled config (world-space distance boundaries, hull-upgraded max HP). */
  get config(): ShipHealthConfig | null {
    return this.configValue
  }

  /** Build the ship-health instance and wire the throttled-persist + pagehide listeners. */
  initialize(input: MapShipHealthInitInput): void {
    const config = buildShipHealthConfig(input.rawData, input.hullMultiplier, input.orbitScale)
    this.configValue = config
    this.onPersistDue = input.onPersistDue

    const health = new ShipHealth(config)
    health.onDeath = (cause) => input.onDeath(cause)
    health.setPersistedHp(clampInitialHullHp(input.savedHp, config.maxHp))
    health.onHpChanged = () => this.schedulePersist()
    this.health = health

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.pageHideHandler)
    }
  }

  /**
   * Run one frame of ship-health. Returns the HUD + audio snapshot when the ship is alive
   * and the sim is running; returns {@link IDLE_RADIATION_STATE} + temperature 0 when the
   * caller has signalled the paused path (frozen / dead / missing).
   *
   * @param input - Per-frame scalars (dt, sun distance, upgrade levels).
   * @returns Radiation state, temperature, damage-active flag.
   */
  tickHealth(input: MapShipHealthTickInput): MapShipHealthTickOutput {
    const health = this.health
    const config = this.configValue
    if (!health || !config) {
      return { radiation: IDLE_RADIATION_STATE, temperature: 0, radiationDamageActive: false }
    }

    const { heatCap, coldCap } = computeThermalCaps({
      config,
      sunDist: input.sunDist,
      heatLevel: input.heatZoneLevel,
      coldLevel: input.coldZoneLevel,
    })

    health.tick(
      input.dt,
      input.sunDist,
      input.isHealingAtEarth,
      input.heatMitigation,
      input.heatMitigation,
      input.coldMitigation,
      input.coldMitigation,
      input.radiationLevel,
      heatCap,
      coldCap,
    )

    const damageActive = health.isTakingRadiationDamage
    const zone = health.radiationZone
    return {
      radiation: {
        zone,
        damageActive,
        visible: zone > 0,
      },
      temperature: health.temperature,
      radiationDamageActive: damageActive,
    }
  }

  /** Resolve zone-based thermal caps without running a full tick (used by EVA gate checks). */
  getThermalCaps(sunDist: number, heatLevel: number, coldLevel: number): ThermalCaps | null {
    if (!this.configValue) return null
    return computeThermalCaps({
      config: this.configValue,
      sunDist,
      heatLevel,
      coldLevel,
    })
  }

  /** Schedule a throttled persist call — coalesces bursts of HP changes into ~5 writes/s. */
  schedulePersist(): void {
    if (this.persistTimer !== null) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.onPersistDue?.()
    }, HULL_PERSIST_THROTTLE_MS)
  }

  /** Cancel any pending throttled persist (used on dispose / respawn). */
  clearPersistTimer(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
  }

  /** Clean up pagehide listener + pending timer. Flush is caller's responsibility. */
  dispose(): void {
    this.clearPersistTimer()
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pageHideHandler)
    }
    this.onPersistDue = null
    this.health = null
    this.configValue = null
  }
}
