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

/** Point light intensity per probe. */
const PROBE_LIGHT_INTENSITY = 8

/** Point light range per probe. */
const PROBE_LIGHT_DISTANCE = 40

/** Number of particles emitted on collection. */
const COLLECT_PARTICLE_COUNT = 12

/** Tracked probe state. */
interface ProbeEntry {
  /** Three.js group (diamond mesh + light). */
  group: THREE.Group
  /** Original spawn Y for bob calculation. */
  baseY: number
  /** Whether this probe has been collected. */
  collected: boolean
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

  /** Particle emitter for collection bursts. */
  readonly collectEmitter: ParticleEmitter

  /** Number of probes collected so far. */
  get collected(): number {
    return this.probes.filter((p) => p.collected).length
  }

  /** Total probe count. */
  get total(): number {
    return this.probes.length
  }

  /** True when all probes have been collected. */
  get allCollected(): boolean {
    return this.probes.length > 0 && this.collected === this.probes.length
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
   * Spawn probes at the given world positions.
   *
   * @param positions - Array of world-space positions for each probe.
   */
  spawn(positions: THREE.Vector3[]): void {
    for (const pos of positions) {
      const group = new THREE.Group()

      // Diamond mesh — wireframe octahedron
      const geo = new THREE.OctahedronGeometry(PROBE_RADIUS, 0)
      const mat = new THREE.MeshBasicMaterial({
        color: PROBE_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.85,
      })
      const mesh = new THREE.Mesh(geo, mat)
      group.add(mesh)

      // Point light for visibility
      const light = new THREE.PointLight(PROBE_COLOR, PROBE_LIGHT_INTENSITY, PROBE_LIGHT_DISTANCE)
      group.add(light)

      group.position.copy(pos)
      this.scene.add(group)

      this.probes.push({
        group,
        baseY: pos.y,
        collected: false,
      })
    }
  }

  /**
   * Per-frame update — animate probes and check collection.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    this.collectEmitter.tick(dt)

    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected) continue

      // Animate — rotate + bob
      probe.group.rotation.y = this.elapsed * ROTATION_SPEED
      probe.group.position.y = probe.baseY + Math.sin(this.elapsed * BOB_SPEED) * BOB_AMPLITUDE
    }
  }

  /**
   * Check lander proximity against all uncollected probes.
   * Call this each frame during lander state with the current lander position.
   *
   * @param landerPos - Current lander world position.
   */
  checkCollection(landerPos: THREE.Vector3): void {
    for (let i = 0; i < this.probes.length; i++) {
      const probe = this.probes[i]!
      if (probe.collected) continue

      const dx = landerPos.x - probe.group.position.x
      const dy = landerPos.y - probe.group.position.y
      const dz = landerPos.z - probe.group.position.z
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist <= COLLECT_RANGE) {
        probe.collected = true
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
