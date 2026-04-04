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

/** Wormhole lifecycle states. */
export type WormholeState = 'idle' | 'summoning' | 'ejecting' | 'collapsing' | 'done'

/** Minimal grid interface — avoids importing the full SpaceTimeGrid class. */
export interface GridSource {
  /** Register a gravity source at world coordinates with the given mass. */
  addSource(source: { x: number; z: number; mass: number }): void
}

/** Negative mass applied to the spacetime grid to create an upward bulge. */
const WORMHOLE_MASS = -0.6

/** Radius of the wormhole core sphere in world units. */
const WORMHOLE_RADIUS = 15

/** Hex color of the portal glow (blue-ish). */
const GLOW_COLOR = 0x4488ff

/** Glow sphere radius multiplier relative to the core. */
const GLOW_SCALE = 2.0

/** Base opacity of the glow sphere. */
const GLOW_OPACITY = 0.25

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
 * 1. `idle`      — visible, stable gravity well, waiting for shuttle spawn
 * 2. `ejecting`  — pulse animation fires (PULSE_DURATION seconds)
 * 3. `collapsing`— grid mass lerps to zero, meshes fade out (COLLAPSE_DURATION seconds)
 * 4. `done`      — invisible, mass zeroed, `onDone` callback fired once
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

  /** Current lifecycle state. */
  private currentState: WormholeState = 'idle'

  /** Elapsed time within the current phase. */
  private phaseTimer = 0

  /** Fired once when summoning ends and shuttle should receive velocity. */
  onEject: (() => void) | null = null
  /** Fired once when collapse finishes. Assign before calling {@link eject}. */
  onDone: (() => void) | null = null

  /**
   * @param position - World position of the portal center.
   * @param grid     - SpaceTimeGrid (or stub) that accepts gravity sources.
   */
  constructor(position: THREE.Vector3, grid: GridSource) {
    // Body sphere — small bright core
    const bodyGeo = new THREE.SphereGeometry(WORMHOLE_RADIUS, 24, 24)
    const bodyMat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: 0.8,
    })
    this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat)
    this.group.add(this.bodyMesh)

    // Glow sphere — larger, additive blended
    const glowRadius = WORMHOLE_RADIUS * GLOW_SCALE
    const glowGeo = new THREE.SphereGeometry(glowRadius, 24, 24)
    const glowMat = new THREE.MeshBasicMaterial({
      color: GLOW_COLOR,
      transparent: true,
      opacity: GLOW_OPACITY,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat)
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
   * Trigger the ejection pulse → collapse sequence.
   * No-op if not in `idle` state.
   */
  eject(): void {
    if (this.currentState !== 'idle') return
    this.currentState = 'summoning'
    this.phaseTimer = 0
  }

  /**
   * Advance the wormhole animation.
   * @param dt - Delta time in seconds since last frame.
   */
  tick(dt: number): void {
    if (this.currentState === 'idle' || this.currentState === 'done') return

    this.phaseTimer += dt

    if (this.currentState === 'summoning') {
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
    ;(this.bodyMesh.material as THREE.MeshBasicMaterial).dispose()
    this.glowMesh.geometry.dispose()
    ;(this.glowMesh.material as THREE.MeshBasicMaterial).dispose()
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

  /** Lerp grid mass to zero, fade meshes, then fire onDone. */
  private tickCollapsing(): void {
    const t = Math.min(this.phaseTimer / COLLAPSE_DURATION, 1)

    // Lerp grid mass toward zero
    this.gridSource.mass = this.initialMass * (1 - t)

    // Fade glow and body opacity
    const bodyMat = this.bodyMesh.material as THREE.MeshBasicMaterial
    const glowMat = this.glowMesh.material as THREE.MeshBasicMaterial
    bodyMat.opacity = 0.8 * (1 - t)
    glowMat.opacity = GLOW_OPACITY * (1 - t)

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
