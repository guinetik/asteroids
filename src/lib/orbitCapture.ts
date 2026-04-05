/**
 * Orbital capture and slingshot system for the map view.
 *
 * Handles proximity detection, state-machine-driven approach/orbit/launch
 * transitions, per-frame orbit position computation, and slingshot exit
 * velocity calculation.  Pure domain logic — no Three.js dependencies.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-orbit-capture-slingshot-design.md
 */
import { StateMachine } from '@/lib/stateMachine'
import { SIZE_SCALE } from '@/lib/planets/constants'
import orbitConfig from '@/data/shuttle/orbit-capture.json'

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * The three states the orbit-capture system can be in.
 *
 * - `free`        — shuttle is flying freely, no planet captured
 * - `approaching` — a planet is targeted; autopilot steers to orbit radius
 * - `orbiting`    — shuttle is locked on the orbit circle
 */
export type OrbitCaptureState = 'free' | 'approaching' | 'orbiting'

/**
 * A planet (or any massive body) that can capture the shuttle into orbit.
 *
 * Implementors supply live world-space coordinates so the system always
 * works with up-to-date planet positions even while planets are moving.
 */
export interface CaptureBody {
  /** Human-readable body name shown in the HUD. */
  readonly name: string
  /**
   * Logical display radius used to derive capture and orbit radii.
   * Typical range: 0.05 (small moon) – 1.5 (gas giant).
   */
  readonly displayRadius: number
  /** Returns the body's current X position in world space. */
  getWorldX(): number
  /** Returns the body's current Z position in world space (depth axis). */
  getWorldZ(): number
}

/**
 * A 2-D position in the XZ world plane.
 */
export interface Vec2 {
  /** World-space X coordinate. */
  x: number
  /** World-space Z coordinate. */
  z: number
}

/**
 * A 2-D velocity vector in the XZ world plane.
 */
export interface Vel2 {
  /** Velocity along the X axis (world units per second). */
  vx: number
  /** Velocity along the Z axis (world units per second). */
  vz: number
}

/**
 * Snapshot of orbit-capture state for HUD rendering.
 */
export interface OrbitHudState {
  /** Current FSM state. */
  state: OrbitCaptureState
  /** Name of the nearest body within capture range, or `null`. */
  nearestBodyName: string | null
  /** Tangential orbital speed (world units per second) at the current orbit radius. */
  orbitalSpeed: number
  /** Estimated exit speed after a slingshot launch. */
  slingshotSpeed: number
  /** Slingshot charge level 0–1 while E is held during orbit. */
  chargeLevel: number
  /** True when cargo inspect mode is active — hides orbit prompts. */
  inspectMode: boolean
}

// ─── Internal precomputed body data ─────────────────────────────────────────

/**
 * Precomputed radii for a single {@link CaptureBody}.
 * Computed once in the constructor to avoid repeated math each frame.
 */
interface BodyData {
  /** Reference to the live body object. */
  body: CaptureBody
  /**
   * Distance at which the body's gravity "grabs" the shuttle.
   * `max(displayRadius * SIZE_SCALE * captureMultiplier, minCaptureRadius)`
   */
  captureRadius: number
  /** Square of `captureRadius` — used for fast distance checks. */
  captureRadiusSq: number
  /**
   * Distance from the planet centre at which the shuttle orbits.
   * `max(displayRadius * SIZE_SCALE * orbitMultiplier, minOrbitRadius)`
   */
  orbitRadius: number
}

// ─── Module-level constants ───────────────────────────────────────────────────

/**
 * Fractional tolerance for orbit arrival detection.
 * The shuttle must be within this fraction of the orbit radius to trigger
 * the `arrived` transition.  Value: 0.15 = 15 %.
 */
const ORBIT_ARRIVAL_TOLERANCE = 0.15

// ─── OrbitCaptureSystem ──────────────────────────────────────────────────────

/**
 * Manages orbital capture, orbit tracking, and slingshot launch for the
 * map-view shuttle.
 *
 * ### Usage
 * ```ts
 * const system = new OrbitCaptureSystem(planets)
 *
 * // Each frame:
 * if (system.state === 'free') {
 *   system.beginCapture(shuttle.x, shuttle.z)
 * }
 * if (system.state === 'approaching') {
 *   system.checkArrival(shuttle.x, shuttle.z)
 *   const target = system.getApproachTarget()   // steer towards this
 * }
 * if (system.state === 'orbiting') {
 *   const pos = system.tickOrbit(dt)             // move shuttle here
 *   if (playerPressedLaunch) {
 *     const vel = system.launchSlingshot(facing, dt)
 *   }
 * }
 * ```
 */
export class OrbitCaptureSystem {
  /** Precomputed data for every registered body. */
  private readonly bodyData: BodyData[]
  /** Finite state machine governing approach → orbit → launch flow. */
  private readonly fsm: StateMachine<OrbitCaptureState>
  /** The body currently being approached or orbited, or `null`. */
  private targetData: BodyData | null = null
  /** Current angle (radians) along the orbit circle. */
  private orbitAngle = 0
  /** Planet world X captured at the start of the previous tick (for velocity). */
  private prevPlanetX = 0
  /** Planet world Z captured at the start of the previous tick (for velocity). */
  private prevPlanetZ = 0

  /**
   * Constructs a new `OrbitCaptureSystem` and precomputes radii for every body.
   *
   * @param bodies - Array of capture bodies (planets, moons, stations…).
   */
  constructor(bodies: CaptureBody[]) {
    this.bodyData = bodies.map((body) => {
      const captureRadius = Math.max(
        body.displayRadius * SIZE_SCALE * orbitConfig.captureMultiplier,
        orbitConfig.minCaptureRadius,
      )
      const orbitRadius = Math.max(
        body.displayRadius * SIZE_SCALE * orbitConfig.orbitMultiplier,
        orbitConfig.minOrbitRadius,
      )
      return {
        body,
        captureRadius,
        captureRadiusSq: captureRadius * captureRadius,
        orbitRadius,
      }
    })

    this.fsm = new StateMachine<OrbitCaptureState>({
      initial: 'free',
      states: {
        free: { on: { capture: 'approaching' } },
        approaching: { on: { arrived: 'orbiting', cancel: 'free' } },
        orbiting: { on: { launch: 'free' } },
      },
    })
  }

  // ─── Public read-only state ────────────────────────────────────────────────

  /**
   * The current FSM state.
   *
   * @returns `'free'`, `'approaching'`, or `'orbiting'`.
   */
  get state(): OrbitCaptureState {
    return this.fsm.state ?? 'free'
  }

  /**
   * The currently targeted {@link CaptureBody}, or `null` when in `free` state.
   *
   * Exposed so the caller can read the planet's live world position (e.g. to
   * aim the camera at the planet centre during orbit).
   */
  /** Orbit radius of the current target body, or 0 if no target. */
  get targetOrbitRadius(): number {
    return this.targetData?.orbitRadius ?? 0
  }

  get target(): CaptureBody | null {
    return this.targetData?.body ?? null
  }

  // ─── Proximity detection ──────────────────────────────────────────────────

  /**
   * Finds the nearest {@link CaptureBody} within its capture radius.
   *
   * Uses squared distances to avoid square-root operations when comparing.
   *
   * @param px - Shuttle X position in world space.
   * @param pz - Shuttle Z position in world space.
   * @returns The nearest in-range body, or `null` if none are in range.
   */
  findNearestInRange(px: number, pz: number): CaptureBody | null {
    let nearestBody: CaptureBody | null = null
    let nearestDistSq = Infinity

    for (const bd of this.bodyData) {
      const dx = px - bd.body.getWorldX()
      const dz = pz - bd.body.getWorldZ()
      const distSq = dx * dx + dz * dz
      if (distSq <= bd.captureRadiusSq && distSq < nearestDistSq) {
        nearestDistSq = distSq
        nearestBody = bd.body
      }
    }
    return nearestBody
  }

  /**
   * Returns the precomputed {@link BodyData} for a given body, or `null`.
   *
   * @param body - The body whose data to look up.
   */
  private getBodyData(body: CaptureBody): BodyData | null {
    return this.bodyData.find((bd) => bd.body === body) ?? null
  }

  // ─── State transitions ────────────────────────────────────────────────────

  /**
   * Attempts to begin an approach to the nearest body in range.
   *
   * If a body is within capture range the FSM transitions `free → approaching`
   * and that body becomes the active target.
   *
   * @param px - Shuttle X position in world space.
   * @param pz - Shuttle Z position in world space.
   * @returns `true` if the transition occurred, `false` if nothing was in range.
   */
  beginCapture(px: number, pz: number): boolean {
    const nearest = this.findNearestInRange(px, pz)
    if (!nearest) return false
    this.targetData = this.getBodyData(nearest)
    return this.fsm.trigger('capture')
  }

  /**
   * Cancels the current approach and returns the FSM to `free`.
   *
   * Safe to call from any state; the FSM will silently ignore the trigger if
   * the `cancel` transition is not defined on the current state.
   */
  cancelApproach(): void {
    this.fsm.trigger('cancel')
    this.targetData = null
  }

  /**
   * Checks whether the shuttle has arrived at the target orbit radius.
   *
   * Arrival is defined as the shuttle's distance from the planet centre being
   * within {@link ORBIT_ARRIVAL_TOLERANCE} (15 %) of `orbitRadius`.  When
   * arrived the FSM transitions `approaching → orbiting` and `orbitAngle` is
   * initialised to the shuttle's current bearing.
   *
   * @param px - Shuttle X position in world space.
   * @param pz - Shuttle Z position in world space.
   * @returns `true` if the transition to `orbiting` occurred.
   */
  checkArrival(px: number, pz: number): boolean {
    if (!this.fsm.is('approaching') || !this.targetData) return false

    const bx = this.targetData.body.getWorldX()
    const bz = this.targetData.body.getWorldZ()
    const dx = px - bx
    const dz = pz - bz
    const dist = Math.sqrt(dx * dx + dz * dz)
    const { orbitRadius } = this.targetData

    const tolerance = orbitRadius * ORBIT_ARRIVAL_TOLERANCE
    if (Math.abs(dist - orbitRadius) > tolerance) return false

    // Snap orbit angle to the shuttle's current bearing
    this.orbitAngle = Math.atan2(dz, dx)
    this.prevPlanetX = bx
    this.prevPlanetZ = bz
    return this.fsm.trigger('arrived')
  }

  // ─── Approach steering ────────────────────────────────────────────────────

  /**
   * Returns the world-space position on the target orbit circle that the
   * shuttle should steer towards during the approach phase.
   *
   * The target point is placed at the current `orbitAngle` on the orbit circle.
   * The caller (autopilot) can use this as a steering goal.
   *
   * @returns `{x, z}` target position, or `null` when not approaching.
   */
  getApproachTarget(): Vec2 | null {
    if (!this.fsm.is('approaching') || !this.targetData) return null
    const bx = this.targetData.body.getWorldX()
    const bz = this.targetData.body.getWorldZ()
    return {
      x: bx + Math.cos(this.orbitAngle) * this.targetData.orbitRadius,
      z: bz + Math.sin(this.orbitAngle) * this.targetData.orbitRadius,
    }
  }

  // ─── Orbit ticking ────────────────────────────────────────────────────────

  /**
   * Advances the orbit angle and returns the new shuttle world position.
   *
   * Also records the planet's current position for the next frame so
   * `launchSlingshot` can compute the planet's frame-to-frame velocity.
   *
   * Angular speed formula: `orbitAngularSpeed / orbitRadius` (faster for tight
   * orbits — conserves a sense of orbital energy).
   *
   * @param dt - Delta time in seconds since the last frame.
   * @returns New `{x, z}` world position for the shuttle, or `null` if not orbiting.
   */
  tickOrbit(dt: number): Vec2 | null {
    if (!this.fsm.is('orbiting') || !this.targetData) return null

    const bx = this.targetData.body.getWorldX()
    const bz = this.targetData.body.getWorldZ()

    // Store previous planet position before updating angle
    this.prevPlanetX = bx
    this.prevPlanetZ = bz

    this.orbitAngle +=
      (orbitConfig.orbitVisualSpeed / this.targetData.orbitRadius) * dt

    return {
      x: bx + Math.cos(this.orbitAngle) * this.targetData.orbitRadius,
      z: bz + Math.sin(this.orbitAngle) * this.targetData.orbitRadius,
    }
  }

  // ─── Slingshot launch ─────────────────────────────────────────────────────

  /**
   * Computes the slingshot exit velocity and transitions `orbiting → free`.
   *
   * Exit velocity = orbital tangent velocity at `facingAngle` + planet's
   * frame-to-frame velocity (so the shuttle inherits the planet's motion).
   *
   * Orbital linear speed = `orbitAngularSpeed` (the angular rate times the
   * orbit radius cancels, leaving a constant tangential speed equal to the
   * configured angular speed).
   *
   * @param facingAngle - The shuttle's aimed direction in radians (XZ plane,
   *   0 = +X axis, increasing counter-clockwise).
   * @param dt - Delta time for the current frame, used to normalise planet velocity.
   * @returns `{vx, vz}` exit velocity in world units per second.
   */
  launchSlingshot(facingAngle: number, _dt: number): Vel2 {
    const speed = orbitConfig.orbitLaunchSpeed

    // Simple: launch in the direction the shuttle is facing at launch speed
    const vx = Math.cos(facingAngle) * speed
    const vz = -Math.sin(facingAngle) * speed

    this.fsm.trigger('launch')
    this.targetData = null

    return { vx, vz }
  }

  // ─── HUD snapshot ─────────────────────────────────────────────────────────

  /**
   * Returns a read-only snapshot of orbit-capture state for the HUD.
   *
   * The orbital speed is the tangential speed at the current orbit radius.
   * Slingshot speed is the magnitude of the tangential component alone
   * (planet velocity is frame-dependent and excluded from the HUD estimate).
   *
   * @param px - Shuttle X position in world space (used for nearest-body lookup).
   * @param pz - Shuttle Z position in world space.
   * @returns {@link OrbitHudState} snapshot.
   */
  getHudState(px: number, pz: number): OrbitHudState {
    const nearest = this.findNearestInRange(px, pz)
    // Show target body name when approaching/orbiting, nearest when free
    const bodyName = this.targetData?.body.name ?? nearest?.name ?? null
    // Linear orbital speed = angular speed. Larger planets = larger orbit radius = more distance
    // covered per revolution, but angular speed is constant, so linear speed = orbitLaunchSpeed.
    // To differentiate: include planet velocity estimate from prevPlanet tracking.
    let orbitalSpeed = 0
    if (this.targetData) {
      const baseSpeed = orbitConfig.orbitLaunchSpeed
      const planetVel = Math.sqrt(
        (this.targetData.body.getWorldX() - this.prevPlanetX) ** 2
        + (this.targetData.body.getWorldZ() - this.prevPlanetZ) ** 2,
      )
      orbitalSpeed = baseSpeed + planetVel
    }
    return {
      state: this.state,
      nearestBodyName: bodyName,
      orbitalSpeed,
      slingshotSpeed: orbitalSpeed,
      chargeLevel: 0,
      inspectMode: false,
    }
  }
}
