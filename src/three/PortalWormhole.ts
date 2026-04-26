/**
 * Arrival wormhole — an inverted gravity well that ejects the shuttle
 * into the scene, pulses, then collapses back to flat spacetime.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import {
  createTronHologramMaterial,
  syncTronHologramTimeSeconds,
} from '@/three/tronHologramMaterial'

/** Wormhole lifecycle states. */
export type WormholeState = 'revealing' | 'idle' | 'summoning' | 'ejecting' | 'collapsing' | 'done'

/** Minimal grid interface — avoids importing the full SpaceTimeGrid class. */
export interface GridSource {
  /** Register a gravity source at world coordinates with the given mass. */
  addSource(source: { x: number; z: number; mass: number }): void
}

/** Negative mass applied to the spacetime grid to create an upward bulge. */
const WORMHOLE_MASS = -0.6

/** Default radius of the wormhole core sphere in world units (level / flat-arrival scale). */
const WORMHOLE_RADIUS = 15

/** Primary tron hologram tint for the portal surface (cyan-blue). */
const PORTAL_COLOR = 0x00aaff

/** Grid line accent — slightly warmer blue so the lattice reads against the body. */
const PORTAL_GRID_TINT = 0x44ddff

/** Glow sphere radius multiplier relative to the core. */
const GLOW_SCALE = 2.0

/** Alpha gain for the portal surface (body mesh). */
const BODY_ALPHA_GAIN = 1.6

/** Alpha gain for the outer glow sphere — softer than the core. */
const GLOW_ALPHA_GAIN = 0.7

/** Duration of the scale-from-zero reveal animation in seconds. */
const REVEAL_DURATION = 1.2

/** Rotation speed of the wormhole group in radians per second. */
const SPIN_SPEED = 0.6

/** Duration of the summoning hold before ejection in seconds. */
const SUMMON_DURATION = 0.5

/** Duration of the ejection pulse animation in seconds. */
const PULSE_DURATION = 0.3

/** Peak scale multiplier during the pulse. */
const PULSE_SCALE = 1.5

/** Duration of the collapse animation in seconds. */
const COLLAPSE_DURATION = 3.0

/**
 * Arrival portal wormhole controller.
 * Implements {@link Tickable} for per-frame animation updates.
 *
 * Lifecycle:
 * 0. `revealing`  — scales from 0 → 1 over REVEAL_DURATION; entered via {@link reveal}
 * 1. `idle`       — full size, spinning, waiting for {@link eject} call
 * 2. `summoning`  — brief hold before the pulse (SUMMON_DURATION seconds)
 * 3. `ejecting`   — pulse animation fires (PULSE_DURATION seconds)
 * 4. `collapsing` — grid mass lerps to zero, meshes fade out (COLLAPSE_DURATION seconds)
 * 5. `done`       — invisible, mass zeroed, `onDone` callback fired once
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/superpowers/specs/2026-04-04-portal-wormhole-design.md
 */
export class PortalWormhole implements Tickable {
  /** Three.js group containing all portal meshes — add to your scene. */
  readonly group = new THREE.Group()

  /** Live reference to the registered grid source so mass can be mutated. */
  private readonly gridSource: { x: number; z: number; mass: number }

  /** Snapshot of the initial mass for lerp calculations. */
  private readonly initialMass: number

  /** Core glowing sphere. */
  private readonly bodyMesh: THREE.Mesh

  /** Outer additive-blended glow sphere. */
  private readonly glowMesh: THREE.Mesh

  /** Tron hologram material on the body mesh — needs `uTime` synced every frame. */
  private readonly bodyMat: THREE.ShaderMaterial

  /** Tron hologram material on the glow mesh — needs `uTime` synced every frame. */
  private readonly glowMat: THREE.ShaderMaterial

  /** Current lifecycle state. */
  private currentState: WormholeState = 'idle'

  /** Elapsed time within the current phase. */
  private phaseTimer = 0

  /** Accumulated scene time for tron shader animation. */
  private elapsedTime = 0

  /** Fired once when summoning ends and shuttle should receive velocity. */
  onEject: (() => void) | null = null
  /** Fired once when collapse finishes. Assign before calling {@link eject}. */
  onDone: (() => void) | null = null

  /**
   * @param position - World position of the portal center.
   * @param grid     - SpaceTimeGrid (or stub) that accepts gravity sources.
   * @param radius   - Core sphere radius in world units. Defaults to {@link WORMHOLE_RADIUS}.
   *                   Pass a planet-scale value (e.g. `displayRadius * SIZE_SCALE`) to match
   *                   a specific body's apparent size in the scene.
   */
  constructor(position: THREE.Vector3, grid: GridSource, radius = WORMHOLE_RADIUS) {
    // Body sphere — tron hologram portal surface
    const bodyGeo = new THREE.SphereGeometry(radius, 32, 32)
    this.bodyMat = createTronHologramMaterial({
      color: PORTAL_COLOR,
      gridTint: PORTAL_GRID_TINT,
      colorGain: 1.4,
      alphaGain: BODY_ALPHA_GAIN,
    })
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat)
    this.group.add(this.bodyMesh)

    // Glow sphere — softer outer halo using the same tron shader
    const glowRadius = radius * GLOW_SCALE
    const glowGeo = new THREE.SphereGeometry(glowRadius, 24, 24)
    this.glowMat = createTronHologramMaterial({
      color: PORTAL_COLOR,
      gridTint: PORTAL_GRID_TINT,
      colorGain: 0.6,
      alphaGain: GLOW_ALPHA_GAIN,
    })
    this.glowMesh = new THREE.Mesh(glowGeo, this.glowMat)
    this.group.add(this.glowMesh)

    this.group.position.copy(position)

    // Register negative-mass source for upward grid deformation
    this.initialMass = WORMHOLE_MASS
    this.gridSource = { x: position.x, z: position.z, mass: WORMHOLE_MASS }
    grid.addSource(this.gridSource)
  }

  /** Current lifecycle state. */
  get state(): WormholeState {
    return this.currentState
  }

  /** Whether the wormhole has fully collapsed and can be removed from the scene. */
  get isDone(): boolean {
    return this.currentState === 'done'
  }

  /** The world position of the portal center — use as the shuttle spawn point. */
  get peakPosition(): THREE.Vector3 {
    return this.group.position
  }

  /**
   * Make the wormhole visible and animate it scaling in from zero.
   * Transitions to `idle` once the reveal completes.
   * No-op if already past the `idle` state (i.e. eject has been called).
   */
  reveal(): void {
    if (this.currentState !== 'idle') return
    this.group.visible = true
    this.group.scale.setScalar(0)
    this.currentState = 'revealing'
    this.phaseTimer = 0
  }

  /**
   * Trigger the ejection pulse → collapse sequence.
   * If called while still in the `revealing` animation, snaps reveal to
   * completion so the portal is always fully visible when the pulse fires.
   * No-op if past `idle` (already summoning/ejecting/collapsing).
   */
  eject(): void {
    if (this.currentState === 'revealing') {
      // Snap reveal to completion
      this.group.scale.setScalar(1)
      this.currentState = 'idle'
      this.phaseTimer = 0
    }
    if (this.currentState !== 'idle') return
    this.currentState = 'summoning'
    this.phaseTimer = 0
  }

  /**
   * Advance the wormhole animation.
   * @param dt - Delta time in seconds since last frame.
   */
  tick(dt: number): void {
    if (this.currentState === 'done') return

    // Advance and sync shader time for scan / grid animations
    this.elapsedTime += dt
    syncTronHologramTimeSeconds([this.bodyMat, this.glowMat], this.elapsedTime)

    // Spin the whole group while active
    this.group.rotation.y += SPIN_SPEED * dt

    if (this.currentState === 'idle') return

    this.phaseTimer += dt

    if (this.currentState === 'revealing') {
      this.tickRevealing()
    } else if (this.currentState === 'summoning') {
      this.tickSummoning()
    } else if (this.currentState === 'ejecting') {
      this.tickEjecting()
    } else if (this.currentState === 'collapsing') {
      this.tickCollapsing()
    }
  }

  /**
   * Release Three.js geometry and material resources.
   * Call when removing the portal from the scene permanently.
   */
  dispose(): void {
    this.bodyMesh.geometry.dispose()
    this.bodyMat.dispose()
    this.glowMesh.geometry.dispose()
    this.glowMat.dispose()
  }

  /** Scale the group from 0 → 1 with an ease-out curve, then enter idle. */
  private tickRevealing(): void {
    const t = Math.min(this.phaseTimer / REVEAL_DURATION, 1)
    const scale = 1 - (1 - t) * (1 - t) // ease-out quad
    this.group.scale.setScalar(scale)

    if (t >= 1) {
      this.group.scale.setScalar(1)
      this.currentState = 'idle'
      this.phaseTimer = 0
    }
  }

  /** Hold the shuttle at the portal for a brief summoning moment. */
  private tickSummoning(): void {
    if (this.phaseTimer >= SUMMON_DURATION) {
      this.currentState = 'ejecting'
      this.phaseTimer = 0
      this.onEject?.()
    }
  }

  /** Animate the ejection pulse — scales glow up then resets, then transitions. */
  private tickEjecting(): void {
    const t = Math.min(this.phaseTimer / PULSE_DURATION, 1)

    // Scale up during pulse, then back down
    const scale = 1 + (PULSE_SCALE - 1) * Math.sin(t * Math.PI)
    this.glowMesh.scale.setScalar(scale)

    if (this.phaseTimer >= PULSE_DURATION) {
      this.currentState = 'collapsing'
      this.phaseTimer = 0
      this.glowMesh.scale.setScalar(1)
    }
  }

  /** Lerp grid mass to zero, fade meshes via alphaGain, then fire onDone. */
  private tickCollapsing(): void {
    const t = Math.min(this.phaseTimer / COLLAPSE_DURATION, 1)
    const remaining = 1 - t

    // Lerp grid mass toward zero
    this.gridSource.mass = this.initialMass * remaining

    // Fade tron shaders via alphaGain uniform
    this.bodyMat.uniforms['uAlphaGain']!.value = BODY_ALPHA_GAIN * remaining
    this.glowMat.uniforms['uAlphaGain']!.value = GLOW_ALPHA_GAIN * remaining

    // Shrink meshes
    const scale = 1 - t * 0.8
    this.bodyMesh.scale.setScalar(scale)
    this.glowMesh.scale.setScalar(scale)

    if (t >= 1) {
      this.gridSource.mass = 0
      this.currentState = 'done'
      this.group.visible = false
      this.onDone?.()
    }
  }
}
