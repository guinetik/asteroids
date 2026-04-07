/**
 * Manages holographic diamond probes for a gravitometric survey.
 *
 * Spawns octahedron wireframe meshes at given positions, animates
 * them (rotation + bob), checks lander proximity for collection,
 * and fires a callback + particle burst on collect.
 *
 * @author guinetik
 * @date 2026-04-07
 * @spec docs/superpowers/specs/2026-04-07-survey-objective-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { ParticleEmitter } from '@/three/ParticleEmitter'

/** Diamond radius in world units. */
const PROBE_RADIUS = 3

/** Collection trigger distance (lander center to probe center). */
const COLLECT_RANGE = 15

/** Rotation speed in radians per second. */
const ROTATION_SPEED = 1.0

/** Vertical bob amplitude in world units. */
const BOB_AMPLITUDE = 0.5

/** Vertical bob speed multiplier. */
const BOB_SPEED = 2.0

/** Probe wireframe color — holographic teal. */
const PROBE_COLOR = 0x00ffcc

/** Number of particles emitted on collection. */
const COLLECT_PARTICLE_COUNT = 12

/** Seconds between each probe launching from the terminal. */
const LAUNCH_STAGGER_INTERVAL = 0.4

/** Seconds each probe takes to fly from terminal to target. */
const LAUNCH_FLIGHT_DURATION = 1.5

/** Scale at launch origin (grows to 1.0 during flight). */
const LAUNCH_START_SCALE = 0.2

/** Tracked probe state. */
interface ProbeEntry {
  /** Three.js group (diamond mesh + light). */
  group: THREE.Group
  /** Target world position. */
  target: THREE.Vector3
  /** Original spawn Y for bob calculation (set after arrival). */
  baseY: number
  /** Whether this probe has been collected. */
  collected: boolean
  /** Whether the probe has arrived at its target. */
  arrived: boolean
  /** Launch delay in seconds (staggered per probe). */
  launchDelay: number
  /** Time elapsed since this probe started flying (negative = waiting). */
  flightTime: number
}

/**
 * Survey probe controller — spawns, animates, and collects probes.
 *
 * @author guinetik
 * @date 2026-04-07
 */
export class SurveyProbeController implements Tickable {
  private readonly probes: ProbeEntry[] = []
  private readonly scene: THREE.Scene
  private elapsed = 0
  private collectedCount = 0
  private readonly origin = new THREE.Vector3()

  /** Particle emitter for collection bursts. */
  readonly collectEmitter: ParticleEmitter

  /** Number of probes collected so far. */
  get collected(): number {
    return this.collectedCount
  }

  /** Total probe count. */
  get total(): number {
    return this.probes.length
  }

  /** True when all probes have been collected. */
  get allCollected(): boolean {
    return this.probes.length > 0 && this.collected === this.probes.length
  }

  /** True when all probes have finished their launch animation. */
  get allArrived(): boolean {
    return this.probes.length > 0 && this.probes.every((p) => p.arrived)
  }

  /** Callback fired when a probe is collected. Receives the probe index. */
  onCollect: ((index: number) => void) | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.collectEmitter = new ParticleEmitter({
      poolSize: 64,
      color: new THREE.Color(PROBE_COLOR),
      size: 2.5,
      lifetime: 0.6,
      spread: 12,
      opacity: 0.9,
    })
    scene.add(this.collectEmitter.points)
  }

  /**
   * Spawn probes with a staggered launch animation from a terminal origin.
   *
   * Probes start hidden at the origin, then launch one by one toward
   * their target positions. They become collectible only after arriving.
   *
   * @param positions - Array of world-space target positions for each probe.
   * @param terminalPosition - World-space position of the survey terminal (launch origin).
   */
  spawn(positions: THREE.Vector3[], terminalPosition: THREE.Vector3): void {
    this.origin.copy(terminalPosition)
    // Raise the origin slightly above the terminal top
    this.origin.y += 4

    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]!
      const group = new THREE.Group()

      // Diamond mesh — wireframe octahedron
      const geo = new THREE.OctahedronGeometry(PROBE_RADIUS, 0)
      const mat = new THREE.MeshBasicMaterial({
        color: PROBE_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const mesh = new THREE.Mesh(geo, mat)
      group.add(mesh)

      // Start at terminal, hidden until launch delay elapses
      group.position.copy(this.origin)
      group.scale.setScalar(LAUNCH_START_SCALE)
      group.visible = false
      this.scene.add(group)

      this.probes.push({
        group,
        target: pos.clone(),
        baseY: pos.y,
        collected: false,
        arrived: false,
        launchDelay: i * LAUNCH_STAGGER_INTERVAL,
        flightTime: 0,
      })
    }
  }

  /**
   * Per-frame update — launch animation, idle animation, particle emitter.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    this.collectEmitter.tick(dt)

    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected) continue

      // Launch sequence
      if (!probe.arrived) {
        probe.flightTime += dt
        const flyElapsed = probe.flightTime - probe.launchDelay

        if (flyElapsed < 0) {
          // Still waiting for stagger
          continue
        }

        // Show probe once its turn comes
        probe.group.visible = true

        const t = Math.min(1, flyElapsed / LAUNCH_FLIGHT_DURATION)
        // Ease-out cubic for smooth deceleration
        const ease = 1 - Math.pow(1 - t, 3)

        // Lerp position from origin to target
        probe.group.position.lerpVectors(this.origin, probe.target, ease)

        // Scale up from small to full
        const scale = LAUNCH_START_SCALE + (1 - LAUNCH_START_SCALE) * ease
        probe.group.scale.setScalar(scale)

        // Spin fast during flight
        probe.group.rotation.y = flyElapsed * ROTATION_SPEED * 4

        if (t >= 1) {
          probe.arrived = true
          probe.group.position.copy(probe.target)
          probe.group.scale.setScalar(1)
          // Small arrival burst
          const up = new THREE.Vector3(0, 1, 0)
          for (let j = 0; j < 4; j++) {
            this.collectEmitter.emit(probe.group.position, up.clone().multiplyScalar(3))
          }
        }
        continue
      }

      // Idle animation — rotate + bob
      probe.group.rotation.y = this.elapsed * ROTATION_SPEED
      probe.group.position.y = probe.baseY + Math.sin(this.elapsed * BOB_SPEED) * BOB_AMPLITUDE
    }
  }

  /**
   * Check lander proximity against all uncollected probes.
   * Only checks probes that have arrived at their target.
   * Call this each frame during lander state with the current lander position.
   *
   * @param landerPos - Current lander world position.
   */
  checkCollection(landerPos: THREE.Vector3): void {
    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected || !probe.arrived) continue

      const dx = landerPos.x - probe.group.position.x
      const dy = landerPos.y - probe.group.position.y
      const dz = landerPos.z - probe.group.position.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist <= COLLECT_RANGE) {
        probe.collected = true
        this.collectedCount++
        probe.group.visible = false

        // Particle burst
        const up = new THREE.Vector3(0, 1, 0)
        for (let j = 0; j < COLLECT_PARTICLE_COUNT; j++) {
          this.collectEmitter.emit(probe.group.position, up.clone().multiplyScalar(5))
        }

        this.onCollect?.(i)
      }
    }
  }

  /** Dispose all probe meshes and the particle emitter. */
  dispose(): void {
    for (const probe of this.probes) {
      this.scene.remove(probe.group)
      probe.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (child.material instanceof THREE.Material) child.material.dispose()
        }
      })
    }
    this.probes.length = 0
    this.scene.remove(this.collectEmitter.points)
  }
}
