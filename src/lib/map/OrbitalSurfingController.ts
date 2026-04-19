/**
 * State machine for orbital surfing along manifold highways.
 *
 * Manages the free → coupling → diving → emerging → orbit handoff flow.
 * Pure state logic — no Three.js objects owned here; the ManifoldSpline
 * renderer is driven externally by reading this controller's state.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
import * as THREE from 'three'
import type { InputManager } from '@/lib/InputManager'
import { MAP_VIEW_CONTROLLER_CONFIG as MAP_CONFIG } from '@/lib/map/mapViewControllerConfig'
import {
  findNearestOrbitPoint,
  extractOrbitArc,
  type OrbitPoint2D,
  type OrbitSnapResult,
} from '@/lib/map/orbitalSurfing'
import type { ShuttleController } from '@/three/ShuttleController'
import { MAP_PHYSICS } from '@/three/ShuttleController'

/** Discriminated union of orbital surfing states. */
type OrbitalSurfState =
  | { mode: 'free' }
  | {
      mode: 'coupling'
      startX: number
      startZ: number
      targetX: number
      targetZ: number
      elapsed: number
      duration: number
      targetPlanetIndex: number
      arcPoints: OrbitPoint2D[]
    }
  | {
      mode: 'diving'
      arcPoints: OrbitPoint2D[]
      /** Parametric progress along the spline 0→1. */
      t: number
      /** Units of t advanced per second. */
      speed: number
      /** Direction multiplier: +1 = forward, -1 = reverse. */
      direction: number
      targetPlanetIndex: number
      /** Current Y depth (transitions from 0 to tunnel depth during ramp). */
      currentY: number
      /** Phase: 'ramp-down' | 'cruise' | 'ramp-up' */
      phase: 'ramp-down' | 'cruise' | 'ramp-up'
      phaseElapsed: number
    }
  | {
      mode: 'emerging'
      targetPlanetIndex: number
      elapsed: number
      duration: number
      /** Y at start of emerge. */
      startY: number
    }

/** Minimum shuttle speed to allow orbital surf attachment. */
const ORBITAL_SURF_MIN_ATTACH_SPEED = 0.15

/** Dependencies injected each tick from MapViewController. */
export interface OrbitalSurfingDeps {
  /** The shuttle controller. */
  shuttleController: ShuttleController | null
  /** Input manager for key bindings. */
  inputManager: InputManager | null
  /** Whether the player has the orbital surfing unlock. */
  hasOrbitalSurfingUnlock: boolean
  /** Current orbit capture state string ('free', 'approaching', 'orbiting'). */
  orbitState: string
  /** Whether gravity surfing is currently active. */
  gravitySurfingActive: boolean
  /** Whether the slingshot burst is active. */
  slingshotBurstActive: boolean
  /**
   * Per-planet orbit ellipse points in XZ world space, indexed by planet index.
   * Each entry corresponds to a planet in the PLANETS array.
   */
  planetOrbitPoints: readonly (readonly OrbitPoint2D[])[]
  /**
   * Per-planet world positions, indexed by planet index.
   */
  planetWorldPositions: readonly { x: number; z: number }[]
  /** Per-planet display names, indexed by planet index. */
  planetNames: readonly string[]
}

/** Callback fired when the orbital surf completes and the player should enter orbit. */
export type OrbitalSurfCompleteCallback = (planetIndex: number) => void

/** Smoothstep-style easing for 0→1 progress (Hermite / smoothstep). */
function easeInOut01(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Orbital surfing controller — state machine for manifold highway travel.
 *
 * @author guinetik
 * @date 2026-04-12
 * @spec docs/superpowers/specs/2026-04-12-orbital-surfing-manifold-highway-design.md
 */
export class OrbitalSurfingController {
  private state: OrbitalSurfState = { mode: 'free' }

  /** Fired when emerging completes — caller should transition to orbiting. */
  onComplete: OrbitalSurfCompleteCallback | null = null

  /** Fired when coupling starts — caller should build/show the manifold spline. */
  onCouplingStart: ((arcPoints: OrbitPoint2D[]) => void) | null = null

  /** Fired each frame during coupling with (shipPos, orbitPos, progress 0→1, dt). */
  onCouplingProgress:
    | ((shipPosition: THREE.Vector3, orbitPosition: THREE.Vector3, progress: number, dt: number) => void)
    | null = null

  /** Fired when coupling ends (transitions to diving or cancelled). */
  onCouplingEnd: (() => void) | null = null

  /** Fired when the dive begins (coupling → diving transition). Receives travel time in seconds. */
  onDiveStart: ((travelTimeSec: number) => void) | null = null

  /** Fired when the surf ends (back to free or orbit). */
  onSurfEnd: (() => void) | null = null

  /** Current mode for external queries. */
  get mode(): string {
    return this.state.mode
  }

  /** True when not in free state. */
  isActive(): boolean {
    return this.state.mode !== 'free'
  }

  /**
   * Returns the HUD prompt string if a manifold attach is available, or null.
   * E.g. "Q ENTER VENUS MANIFOLD"
   */
  getAttachPrompt(deps: OrbitalSurfingDeps): string | null {
    if (this.state.mode !== 'free') return null
    const snap = this.findSnapTarget(deps)
    if (!snap) return null
    const name = deps.planetNames[snap.planetIndex] ?? 'UNKNOWN'
    return `Q ENTER ${name.toUpperCase()} MANIFOLD`
  }

  /** The arc points for the current surf, or null if not active. */
  getArcPoints(): OrbitPoint2D[] | null {
    if (this.state.mode === 'coupling' || this.state.mode === 'diving') {
      return this.state.arcPoints
    }
    return null
  }

  /** Current parametric progress along the spline (0→1), or 0 if not diving. */
  getSplineT(): number {
    return this.state.mode === 'diving' ? this.state.t : 0
  }

  /** Current Y offset of the ship, or 0 if not active. */
  getCurrentY(): number {
    if (this.state.mode === 'diving') return this.state.currentY
    if (this.state.mode === 'emerging') {
      const t = this.state.duration <= 0 ? 1 : this.state.elapsed / this.state.duration
      return THREE.MathUtils.lerp(this.state.startY, 0, easeInOut01(t))
    }
    return 0
  }

  /** Current dive phase, or null. */
  getDivePhase(): 'ramp-down' | 'cruise' | 'ramp-up' | null {
    return this.state.mode === 'diving' ? this.state.phase : null
  }

  /** Reset to free state and restore shuttle control. */
  reset(deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    this.state = { mode: 'free' }
    if (!shuttle) return
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
  }

  /** Handle C key toggle — attach or cancel coupling. */
  requestToggle(deps: OrbitalSurfingDeps): void {
    if (!deps.inputManager?.wasActionPressed('gravitySurfingToggle')) return

    // Cancel during coupling
    if (this.state.mode === 'coupling') {
      this.cancelCoupling(deps)
      return
    }

    // No cancel during diving or emerging — committed
    if (this.state.mode === 'diving' || this.state.mode === 'emerging') return

    // Try to attach
    const snap = this.findSnapTarget(deps)
    if (!snap) return
    this.beginCoupling(snap, deps)
  }

  /** Advance the state machine by dt seconds. */
  tick(dt: number, deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle || this.state.mode === 'free') return

    if (this.state.mode === 'coupling') {
      this.tickCoupling(dt, shuttle)
    }

    if (this.state.mode === 'diving') {
      this.tickDiving(dt, shuttle, deps)
    }

    if (this.state.mode === 'emerging') {
      this.tickEmerging(dt, shuttle)
    }
  }

  private findSnapTarget(
    deps: OrbitalSurfingDeps,
  ): { snapResult: OrbitSnapResult; planetIndex: number; arcPoints: OrbitPoint2D[] } | null {
    if (
      !deps.shuttleController
      || !deps.hasOrbitalSurfingUnlock
      || deps.orbitState !== 'free'
      || deps.gravitySurfingActive
      || deps.slingshotBurstActive
      || deps.shuttleController.speed < ORBITAL_SURF_MIN_ATTACH_SPEED
    ) {
      return null
    }

    const shipX = deps.shuttleController.position.x
    const shipZ = deps.shuttleController.position.z

    let bestSnap: OrbitSnapResult | null = null
    let bestPlanetIndex = -1

    for (let i = 0; i < deps.planetOrbitPoints.length; i++) {
      const points = deps.planetOrbitPoints[i]!
      const snap = findNearestOrbitPoint(shipX, shipZ, points, MAP_CONFIG.ORBITAL_SURF_SNAP_DISTANCE)
      if (snap && (!bestSnap || snap.distance < bestSnap.distance)) {
        bestSnap = snap
        bestPlanetIndex = i
      }
    }

    if (!bestSnap || bestPlanetIndex < 0) return null

    // Find planet's nearest point on its own orbit to determine arc endpoint
    const planetPos = deps.planetWorldPositions[bestPlanetIndex]!
    const orbitPoints = deps.planetOrbitPoints[bestPlanetIndex]!
    const planetSnap = findNearestOrbitPoint(planetPos.x, planetPos.z, orbitPoints, Infinity)
    if (!planetSnap) return null

    const arcPoints = extractOrbitArc(
      orbitPoints as OrbitPoint2D[],
      bestSnap.index,
      planetSnap.index,
    )

    return { snapResult: bestSnap, planetIndex: bestPlanetIndex, arcPoints }
  }

  private beginCoupling(
    target: { snapResult: OrbitSnapResult; planetIndex: number; arcPoints: OrbitPoint2D[] },
    deps: OrbitalSurfingDeps,
  ): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    this.state = {
      mode: 'coupling',
      startX: shuttle.position.x,
      startZ: shuttle.position.z,
      targetX: target.snapResult.x,
      targetZ: target.snapResult.z,
      elapsed: 0,
      duration: MAP_CONFIG.ORBITAL_SURF_COUPLE_DURATION_SEC,
      targetPlanetIndex: target.planetIndex,
      arcPoints: target.arcPoints,
    }
    shuttle.freeze()
    shuttle.setInputEnabled(false)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    this.onCouplingStart?.(target.arcPoints)
  }

  private cancelCoupling(deps: OrbitalSurfingDeps): void {
    const shuttle = deps.shuttleController
    if (!shuttle) return
    this.state = { mode: 'free' }
    shuttle.unfreeze()
    shuttle.setInputEnabled(true)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    shuttle.group.rotation.x = 0
    shuttle.group.rotation.z = 0
    this.onCouplingEnd?.()
    this.onSurfEnd?.()
  }

  private tickCoupling(dt: number, shuttle: ShuttleController): void {
    if (this.state.mode !== 'coupling') return
    const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
    const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
    const eased = easeInOut01(t)
    const x = THREE.MathUtils.lerp(this.state.startX, this.state.targetX, eased)
    const z = THREE.MathUtils.lerp(this.state.startZ, this.state.targetZ, eased)
    shuttle.group.position.set(x, 0, z)
    shuttle.setVelocity(new THREE.Vector3(0, 0, 0))
    this.onCouplingProgress?.(
      shuttle.group.position,
      new THREE.Vector3(this.state.targetX, 0, this.state.targetZ),
      t,
      dt,
    )
    this.state.elapsed = nextElapsed

    if (nextElapsed >= this.state.duration) {
      // Travel time scales with arc length: short hops ~2s, full Pluto orbit ~10s
      const arcLength = this.estimateArcLength(this.state.arcPoints)
      // Pluto half-orbit ≈ 18850 world units (π × 40AU × 150 units/AU)
      const maxArcLength = Math.PI * 40 * 150
      const fraction = Math.min(1, arcLength / maxArcLength)
      const minTimeSec = 2
      const maxTimeSec = 10
      const travelTimeSec = minTimeSec + fraction * (maxTimeSec - minTimeSec)
      const tPerSecond = 1 / travelTimeSec
      this.onCouplingEnd?.()
      this.onDiveStart?.(travelTimeSec)
      this.state = {
        mode: 'diving',
        arcPoints: this.state.arcPoints,
        t: 0,
        speed: tPerSecond,
        direction: 1,
        targetPlanetIndex: this.state.targetPlanetIndex,
        currentY: 0,
        phase: 'ramp-down',
        phaseElapsed: 0,
      }
    }
  }

  private tickDiving(dt: number, shuttle: ShuttleController, deps: OrbitalSurfingDeps): void {
    if (this.state.mode !== 'diving') return

    // No player input during diving — fully committed to the manifold

    // Tick thruster system for passive fuel drain
    shuttle.thrusterSystem.tick(
      dt * MAP_CONFIG.ORBITAL_SURF_FUEL_MULTIPLIER,
      { thrust: false, brake: false, rcs: false },
      shuttle.getThrusterRuntimeModifiers(),
    )

    // Phase management
    this.state.phaseElapsed += dt
    const rampDuration = MAP_CONFIG.ORBITAL_SURF_RAMP_DURATION_SEC
    const tunnelDepth = -MAP_CONFIG.ORBITAL_SURF_TUNNEL_DEPTH

    if (this.state.phase === 'ramp-down') {
      const rampT = rampDuration <= 0 ? 1 : Math.min(1, this.state.phaseElapsed / rampDuration)
      this.state.currentY = THREE.MathUtils.lerp(0, tunnelDepth, easeInOut01(rampT))
      if (rampT >= 1) {
        this.state.phase = 'cruise'
        this.state.phaseElapsed = 0
      }
    } else if (this.state.phase === 'cruise') {
      this.state.currentY = tunnelDepth
    }

    // Advance along spline
    this.state.t += this.state.speed * this.state.direction * dt

    // Check if we've reached the end — only transition once (guard prevents reset loop)
    if (this.state.t >= 0.95 && this.state.direction > 0 && this.state.phase !== 'ramp-up') {
      this.state.phase = 'ramp-up'
      this.state.phaseElapsed = 0
    }

    if (this.state.phase === 'ramp-up') {
      this.state.t = Math.min(1, this.state.t)
      // Skip the separate emerging phase — the spline geometry already has the
      // exit ramp baked in. Go straight to orbit handoff.
      const planetIndex = this.state.targetPlanetIndex
      this.state = { mode: 'free' }
      shuttle.unfreeze()
      shuttle.setInputEnabled(false)
      shuttle.group.rotation.x = 0
      shuttle.group.rotation.z = 0
      this.onSurfEnd?.()
      this.onComplete?.(planetIndex)
    }

    // Clamp t for reverse direction
    if (this.state.mode === 'diving' && this.state.t < 0) {
      this.state.t = 0
    }

    // Position shuttle from arc
    if (this.state.mode === 'diving') {
      const pos = this.sampleArc(this.state.arcPoints, Math.max(0, Math.min(1, this.state.t)))
      shuttle.group.position.set(pos.x, this.state.currentY, pos.z)
      // Face along the spline tangent
      const tangentT = Math.min(0.99, Math.max(0.01, this.state.t))
      const ahead = this.sampleArc(this.state.arcPoints, tangentT + 0.01)
      const heading = Math.atan2(-(ahead.z - pos.z), ahead.x - pos.x)
      shuttle.group.rotation.y = heading
    }
  }

  private beginEmerging(_shuttle: ShuttleController): void {
    if (this.state.mode !== 'diving') return
    this.state = {
      mode: 'emerging',
      targetPlanetIndex: this.state.targetPlanetIndex,
      elapsed: 0,
      duration: MAP_CONFIG.ORBITAL_SURF_RAMP_DURATION_SEC,
      startY: this.state.currentY,
    }
  }

  private tickEmerging(dt: number, shuttle: ShuttleController): void {
    if (this.state.mode !== 'emerging') return
    const nextElapsed = Math.min(this.state.duration, this.state.elapsed + dt)
    const t = this.state.duration <= 0 ? 1 : nextElapsed / this.state.duration
    const y = THREE.MathUtils.lerp(this.state.startY, 0, easeInOut01(t))
    shuttle.group.position.y = y
    this.state.elapsed = nextElapsed

    if (nextElapsed >= this.state.duration) {
      const planetIndex = this.state.targetPlanetIndex
      this.state = { mode: 'free' }
      // Briefly restore shuttle control so beginForcedOrbit can reposition it.
      // beginForcedOrbit immediately re-freezes for the orbiting state.
      shuttle.unfreeze()
      shuttle.setInputEnabled(false)
      shuttle.group.rotation.x = 0
      shuttle.group.rotation.z = 0
      this.onSurfEnd?.()
      this.onComplete?.(planetIndex)
    }
  }

  /** Linear interpolation along the arc points array at parametric t (0→1). */
  private sampleArc(points: OrbitPoint2D[], t: number): { x: number; z: number } {
    if (points.length === 0) return { x: 0, z: 0 }
    if (points.length === 1) return { x: points[0]!.x, z: points[0]!.z }
    const maxIndex = points.length - 1
    const floatIndex = t * maxIndex
    const i0 = Math.floor(floatIndex)
    const i1 = Math.min(i0 + 1, maxIndex)
    const frac = floatIndex - i0
    const p0 = points[i0]!
    const p1 = points[i1]!
    return {
      x: p0.x + (p1.x - p0.x) * frac,
      z: p0.z + (p1.z - p0.z) * frac,
    }
  }

  /** Rough arc length estimate by summing segment distances. */
  private estimateArcLength(points: OrbitPoint2D[]): number {
    let len = 0
    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.x - points[i - 1]!.x
      const dz = points[i]!.z - points[i - 1]!.z
      len += Math.sqrt(dx * dx + dz * dz)
    }
    return len
  }
}
