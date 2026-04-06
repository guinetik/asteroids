/**
 * Transient “gravity anomaly” props on the map spacetime sheet: a synthetic well that
 * spawns, moves across the plane for a bounded time, and dispatches lifecycle events.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/asteroid-lander-gdd-v03.md
 */

import type { GravitySource } from '@/three/SpaceTimeGrid'

/** Dispatched when a new anomaly begins (after construction / first tick). */
export const GRAVITATIONAL_EVENT_START = 'gravitational-event-start'

/** Dispatched when duration elapses and the anomaly is removed. */
export const GRAVITATIONAL_EVENT_FINISH = 'gravitational-event-finish'

/** Payload for {@link GRAVITATIONAL_EVENT_START}. */
export interface GravitationalEventStartDetail {
  /** Stable id for the anomaly instance. */
  id: string
  /** World X at spawn (before movement this frame). */
  x: number
  /** World Z at spawn. */
  z: number
  /** Travel speed in world units per second along `dirX` / `dirZ`. */
  speed: number
  /** Unit direction X on the sheet. */
  dirX: number
  /** Unit direction Z on the sheet. */
  dirZ: number
  /** Total lifetime in seconds. */
  durationSec: number
  /** Synthetic solar mass passed to {@link SpaceTimeGrid} (map exponent shapes σ and depth). */
  gridMass: number
  /** Extra σ multiplier for footprint size vs same mass without multiplier. */
  wellWidthMultiplier: number
}

/** Payload for {@link GRAVITATIONAL_EVENT_FINISH}. */
export interface GravitationalEventFinishDetail {
  id: string
  /** Final world X before removal. */
  x: number
  /** Final world Z before removal. */
  z: number
}

/** Strongly typed listeners for {@link GravitationalEvent}. */
export type GravitationalEventStartListener = (ev: CustomEvent<GravitationalEventStartDetail>) => void

/** Strongly typed listeners for {@link GravitationalEvent} end. */
export type GravitationalEventFinishListener = (
  ev: CustomEvent<GravitationalEventFinishDetail>,
) => void

/** Minimum anomaly lifetime (seconds). */
const ANOMALY_DURATION_MIN_SEC = 5

/** Maximum anomaly lifetime (seconds). */
const ANOMALY_DURATION_MAX_SEC = 10

/** Minimum travel speed (world units/s). */
const ANOMALY_SPEED_MIN = 35

/** Maximum travel speed (world units/s). */
const ANOMALY_SPEED_MAX = 110

/** Minimum synthetic mass (M☉) for the spacetime Gaussian (map uses small exponent). */
const ANOMALY_GRID_MASS_MIN = 2.6e-5

/** Maximum synthetic mass (M☉). */
const ANOMALY_GRID_MASS_MAX = 1.35e-4

/**
 * Extra depth on the Gaussian (amplitude only) so travelling depressions read clearly.
 */
const ANOMALY_WELL_DEPTH_MULTIPLIER = 1.85

/** Minimum σ footprint multiplier. */
const ANOMALY_WELL_WIDTH_MULT_MIN = 2.1

/** Maximum σ footprint multiplier. */
const ANOMALY_WELL_WIDTH_MULT_MAX = 5.6

/** Default max simultaneous anomalies. */
const MANAGER_MAX_CONCURRENT = 3

/** Minimum seconds between automatic spawns. */
const MANAGER_AUTO_SPAWN_INTERVAL_MIN = 38

/** Maximum seconds between automatic spawns. */
const MANAGER_AUTO_SPAWN_INTERVAL_MAX = 72

/** Fraction of world half-extent used as spawn bounds (keeps away from portal walls). */
const SPAWN_BOUNDS_INSET = 0.88

/** Player proximity (world units): only contribute to the grid inside this radius. */
const DEFAULT_RENDER_PROXIMITY_RADIUS = 420

/**
 * Wider than {@link DEFAULT_RENDER_PROXIMITY_RADIUS} so the HUD can warn slightly
 * before the depression is applied to the wireframe.
 */
const DEFAULT_HUD_NOTIFY_RADIUS = 520

let eventIdSeq = 0

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  eventIdSeq += 1
  return `gravity-anomaly-${eventIdSeq}`
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomUnitDirXZ(): { dirX: number; dirZ: number } {
  const a = Math.random() * Math.PI * 2
  return { dirX: Math.cos(a), dirZ: Math.sin(a) }
}

/**
 * User-provided knobs for a single anomaly (all fields optional except nothing required to spawn random).
 */
export interface GravitationalEventSpawnOptions {
  /** Override start X; default random in manager bounds. */
  x?: number
  /** Override start Z. */
  z?: number
  /** Unit direction X; random if omitted. */
  dirX?: number
  /** Unit direction Z; random if omitted. */
  dirZ?: number
  /** Speed (world u/s); random if omitted. */
  speed?: number
  /** Lifetime seconds; random in [5,10] if omitted. */
  durationSec?: number
  /** Synthetic grid mass; random if omitted. */
  gridMass?: number
  /** Well width multiplier; random if omitted. */
  wellWidthMultiplier?: number
}

/**
 * Configuration for {@link GravitationalEventManager}.
 */
export interface GravitationalEventManagerOptions {
  /**
   * Half-width of the spawn rectangle on XZ: positions are drawn from
   * [-worldHalfExtent * inset, +worldHalfExtent * inset] per axis.
   */
  worldHalfExtent: number
  /**
   * Shuttle must be within this distance (XZ) for the anomaly to affect {@link SpaceTimeGrid}.
   */
  renderProximityRadius?: number
  /** Max active anomalies at once. */
  maxConcurrent?: number
  /** When true, the manager picks random spawn times in the configured interval band. */
  autoSpawnEnabled?: boolean
  /**
   * XZ distance (world units) from the shuttle within which nearby-HUD callbacks fire.
   * Default is slightly wider than the grid coupling radius so the HUD can lead the effect.
   */
  hudNotifyRadius?: number
}

/**
 * Optional hooks for map HUD when an anomaly starts or ends near the observer.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export interface GravitationalEventNearbyHudCallbacks {
  /**
   * Fired once per anomaly on its first tick if start (x,z) lies within the HUD radius.
   */
  onNearbyAnomalyStart?: (
    detail: GravitationalEventStartDetail,
    observerX: number,
    observerZ: number,
  ) => void
  /**
   * Fired when the anomaly expires if its final (x,z) lies within the HUD radius.
   */
  onNearbyAnomalyFinish?: (
    detail: GravitationalEventFinishDetail,
    observerX: number,
    observerZ: number,
  ) => void
}

function normalizeDir(dirX: number, dirZ: number): { dirX: number; dirZ: number } {
  const len = Math.hypot(dirX, dirZ)
  if (len < 1e-8) {
    return randomUnitDirXZ()
  }
  return { dirX: dirX / len, dirZ: dirZ / len }
}

/**
 * One moving depression on the spacetime fabric: integrates position, exposes a {@link GravitySource},
 * and fires `CustomEvent`s on start (once) and finish.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class GravitationalEvent extends EventTarget {
  /** @inheritdoc */
  readonly id: string

  private x: number
  private z: number
  private readonly dirX: number
  private readonly dirZ: number
  private readonly speed: number
  private readonly durationSec: number
  private readonly gridMass: number
  private readonly wellWidthMultiplier: number
  private elapsed = 0
  private startDispatched = false
  /** After finish, tick is a no-op. */
  private finished = false

  /**
   * @param id - Unique id (see {@link randomId}).
   * @param x - Initial world X.
   * @param z - Initial world Z.
   * @param dirX - Normalized direction X.
   * @param dirZ - Normalized direction Z.
   * @param speed - World units per second.
   * @param durationSec - Total lifetime.
   * @param gridMass - Passed to the grid as synthetic M☉.
   * @param wellWidthMultiplier - Widens σ only.
   */
  constructor(
    id: string,
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    speed: number,
    durationSec: number,
    gridMass: number,
    wellWidthMultiplier: number,
  ) {
    super()
    this.id = id
    this.x = x
    this.z = z
    const d = normalizeDir(dirX, dirZ)
    this.dirX = d.dirX
    this.dirZ = d.dirZ
    this.speed = speed
    this.durationSec = durationSec
    this.gridMass = gridMass
    this.wellWidthMultiplier = wellWidthMultiplier
  }

  /**
   * Advances time, moves the anomaly, and dispatches {@link GRAVITATIONAL_EVENT_FINISH} once expired.
   *
   * @param dt - Seconds.
   * @returns `false` after the event has finished (manager should drop it).
   */
  tick(dt: number): boolean {
    if (this.finished) {
      return false
    }

    if (!this.startDispatched) {
      this.dispatchStart()
      this.startDispatched = true
    }

    this.elapsed += dt
    this.x += this.dirX * this.speed * dt
    this.z += this.dirZ * this.speed * dt

    if (this.elapsed >= this.durationSec) {
      this.dispatchFinish()
      this.finished = true
      return false
    }
    return true
  }

  /** Current world X. */
  get positionX(): number {
    return this.x
  }

  /** Current world Z. */
  get positionZ(): number {
    return this.z
  }

  /** Synthetic mass fed to the grid. */
  get syntheticMass(): number {
    return this.gridMass
  }

  /**
   * Grid representation for {@link SpaceTimeGrid.addSource}.
   */
  toGravitySource(): GravitySource {
    return {
      x: this.x,
      z: this.z,
      mass: this.gridMass,
      wellWidthMultiplier: this.wellWidthMultiplier,
      wellDepthMultiplier: ANOMALY_WELL_DEPTH_MULTIPLIER,
      isFabricAnomaly: true,
    }
  }

  private dispatchStart(): void {
    const detail: GravitationalEventStartDetail = {
      id: this.id,
      x: this.x,
      z: this.z,
      speed: this.speed,
      dirX: this.dirX,
      dirZ: this.dirZ,
      durationSec: this.durationSec,
      gridMass: this.gridMass,
      wellWidthMultiplier: this.wellWidthMultiplier,
    }
    this.dispatchEvent(new CustomEvent(GRAVITATIONAL_EVENT_START, { detail }))
  }

  private dispatchFinish(): void {
    const detail: GravitationalEventFinishDetail = { id: this.id, x: this.x, z: this.z }
    this.dispatchEvent(new CustomEvent(GRAVITATIONAL_EVENT_FINISH, { detail }))
  }
}

/**
 * Owns many {@link GravitationalEvent} instances, optional automatic spawning, and proximity-filtered
 * grid sources near the shuttle.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class GravitationalEventManager {
  private readonly worldHalfExtent: number
  private readonly renderProximityRadius: number
  private readonly hudNotifyRadius: number
  private readonly maxConcurrent: number
  private autoSpawnEnabled: boolean
  private autoSpawnCountdown = 0
  private readonly events: GravitationalEvent[] = []
  private nearbyHudCallbacks: GravitationalEventNearbyHudCallbacks | null = null
  private lastObserverX = 0
  private lastObserverZ = 0

  /**
   * @param options - World bounds and LOD radius.
   */
  constructor(options: GravitationalEventManagerOptions) {
    this.worldHalfExtent = options.worldHalfExtent
    this.renderProximityRadius = options.renderProximityRadius ?? DEFAULT_RENDER_PROXIMITY_RADIUS
    this.hudNotifyRadius = options.hudNotifyRadius ?? DEFAULT_HUD_NOTIFY_RADIUS
    this.maxConcurrent = options.maxConcurrent ?? MANAGER_MAX_CONCURRENT
    this.autoSpawnEnabled = options.autoSpawnEnabled ?? true
    this.resetAutoSpawnTimer()
  }

  /**
   * Registers HUD listeners for nearby anomaly start/finish (map view).
   * Pass `null` to detach (e.g. on dispose).
   *
   * @param callbacks - Handlers, or `null`.
   */
  setNearbyHudCallbacks(callbacks: GravitationalEventNearbyHudCallbacks | null): void {
    this.nearbyHudCallbacks = callbacks
  }

  /**
   * Whether periodic random events are scheduled.
   */
  setAutoSpawnEnabled(enabled: boolean): void {
    this.autoSpawnEnabled = enabled
    if (enabled) {
      this.resetAutoSpawnTimer()
    }
  }

  /**
   * @returns Current auto-spawn flag.
   */
  getAutoSpawnEnabled(): boolean {
    return this.autoSpawnEnabled
  }

  /**
   * Advances all events and maybe spawns.
   *
   * @param dt - Seconds.
   * @param observerX - Shuttle (or camera target) X for proximity.
   * @param observerZ - Shuttle Z.
   */
  tick(dt: number, observerX: number, observerZ: number): void {
    this.lastObserverX = observerX
    this.lastObserverZ = observerZ

    if (this.autoSpawnEnabled) {
      this.autoSpawnCountdown -= dt
      if (this.autoSpawnCountdown <= 0 && this.events.length < this.maxConcurrent) {
        this.spawnRandomInWorld()
        this.resetAutoSpawnTimer()
      }
    }

    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i]!
      if (!ev.tick(dt)) {
        this.events.splice(i, 1)
      }
    }
  }

  /**
   * Spreads an anomaly at a random in-bounds position with random motion and size.
   *
   * @returns The new event, or `null` if at capacity.
   */
  spawnRandomInWorld(options?: GravitationalEventSpawnOptions): GravitationalEvent | null {
    if (this.events.length >= this.maxConcurrent) {
      return null
    }

    const half = this.worldHalfExtent * SPAWN_BOUNDS_INSET
    const x = options?.x ?? randomInRange(-half, half)
    const z = options?.z ?? randomInRange(-half, half)

    const dir =
      options?.dirX !== undefined && options?.dirZ !== undefined
        ? normalizeDir(options.dirX, options.dirZ)
        : randomUnitDirXZ()

    const speed = options?.speed ?? randomInRange(ANOMALY_SPEED_MIN, ANOMALY_SPEED_MAX)
    const durationSec =
      options?.durationSec ?? randomInRange(ANOMALY_DURATION_MIN_SEC, ANOMALY_DURATION_MAX_SEC)
    const gridMass =
      options?.gridMass ?? randomInRange(ANOMALY_GRID_MASS_MIN, ANOMALY_GRID_MASS_MAX)
    const wellWidthMultiplier =
      options?.wellWidthMultiplier ??
      randomInRange(ANOMALY_WELL_WIDTH_MULT_MIN, ANOMALY_WELL_WIDTH_MULT_MAX)

    const ev = new GravitationalEvent(
      randomId(),
      x,
      z,
      dir.dirX,
      dir.dirZ,
      speed,
      durationSec,
      gridMass,
      wellWidthMultiplier,
    )
    this.wireNearbyHud(ev)
    this.events.push(ev)
    return ev
  }

  /**
   * Convenience: random event with start position near `(centerX, centerZ)`.
   *
   * @param centerX - Anchor X (e.g. shuttle).
   * @param centerZ - Anchor Z.
   * @param maxOffset - Max random offset per axis from center.
   * @param options - Optional overrides for direction, mass, etc.
   */
  spawnNear(
    centerX: number,
    centerZ: number,
    maxOffset: number,
    options?: GravitationalEventSpawnOptions,
  ): GravitationalEvent | null {
    const ox = (Math.random() * 2 - 1) * maxOffset
    const oz = (Math.random() * 2 - 1) * maxOffset
    return this.spawnRandomInWorld({
      ...options,
      x: centerX + ox,
      z: centerZ + oz,
    })
  }

  /**
   * Sources within {@link renderProximityRadius} of the observer (XZ), for this frame’s grid pass.
   */
  getGridSourcesNear(observerX: number, observerZ: number): GravitySource[] {
    const rSq = this.renderProximityRadius * this.renderProximityRadius
    const out: GravitySource[] = []
    for (const ev of this.events) {
      const dx = ev.positionX - observerX
      const dz = ev.positionZ - observerZ
      if (dx * dx + dz * dz <= rSq) {
        out.push(ev.toGravitySource())
      }
    }
    return out
  }

  /** Removes all active events (does not dispatch finish — use for teardown / dev reset). */
  clear(): void {
    this.events.length = 0
  }

  /** Number of live anomalies. */
  get activeCount(): number {
    return this.events.length
  }

  private resetAutoSpawnTimer(): void {
    this.autoSpawnCountdown = randomInRange(
      MANAGER_AUTO_SPAWN_INTERVAL_MIN,
      MANAGER_AUTO_SPAWN_INTERVAL_MAX,
    )
  }

  private wireNearbyHud(ev: GravitationalEvent): void {
    if (!this.nearbyHudCallbacks) {
      return
    }

    ev.addEventListener(GRAVITATIONAL_EVENT_START, (ce) => {
      const d = (ce as CustomEvent<GravitationalEventStartDetail>).detail
      if (!this.isWithinHudRadius(d.x, d.z)) {
        return
      }
      this.nearbyHudCallbacks?.onNearbyAnomalyStart?.(d, this.lastObserverX, this.lastObserverZ)
    })

    ev.addEventListener(GRAVITATIONAL_EVENT_FINISH, (ce) => {
      const d = (ce as CustomEvent<GravitationalEventFinishDetail>).detail
      if (!this.isWithinHudRadius(d.x, d.z)) {
        return
      }
      this.nearbyHudCallbacks?.onNearbyAnomalyFinish?.(d, this.lastObserverX, this.lastObserverZ)
    })
  }

  private isWithinHudRadius(ax: number, az: number): boolean {
    const dx = ax - this.lastObserverX
    const dz = az - this.lastObserverZ
    const r = this.hudNotifyRadius
    return dx * dx + dz * dz <= r * r
  }
}
