/**
 * Visual controller for the photometry probe, waypoint, LOS, and scan flash.
 *
 * @author guinetik
 * @date 2026-04-26
 * @spec docs/superpowers/specs/2026-04-26-photometry-minigame-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import {
  createWaypointMarkerGroup,
  disposeWaypointMarkerGroup,
  tickWaypointMarkerGroup,
  WAYPOINT_SURFACE_BEAM_HEIGHT,
} from '@/three/WaypointMarkers'
import { ParticleEmitter } from '@/three/ParticleEmitter'

/** Probe octahedron radius in world units. */
const PROBE_RADIUS = 5

/** Probe collection trigger distance in world units. */
const COLLECT_RANGE = 30

/** Seconds the probe pauses just above the terminal before climbing. */
const LAUNCH_HOVER_DURATION = 1

/** Seconds spent climbing from the terminal to the launch apex. */
const LAUNCH_CLIMB_DURATION = 5

/** Seconds spent arcing sideways from the apex to the standoff. */
const LAUNCH_SIDE_ARC_DURATION = 7

/** Probe scale at the terminal before it grows during launch. */
const LAUNCH_START_SCALE = 0.2

/** Terminal body height in world units. */
const TERMINAL_BODY_HEIGHT = 3

/** World-space probe center offset so its bottom touches the terminal top. */
const LAUNCH_HOVER_HEIGHT = TERMINAL_BODY_HEIGHT + PROBE_RADIUS

/** Probe spin speed while launching, in radians per second. */
const LAUNCH_SPIN_SPEED = 7.5

/** Idle spin speed after the probe reaches its standoff. */
const IDLE_SPIN_SPEED = 1.4

/** Idle vertical bob amplitude in world units. */
const IDLE_BOB_AMPLITUDE = 0.7

/** Idle vertical bob speed multiplier. */
const IDLE_BOB_SPEED = 2

/** Photometry visual accent color. */
const PHOTOMETRY_COLOR = 0xb388ff

/** Red scan color for the focus point and LOS beam. */
const SCAN_COLOR = 0xff5533

/** Green scan color shown when the lander is holding a valid lock. */
const SCAN_LOCKED_COLOR = 0x55ff88

/** Bright cyan asteroid wireframe color shown when the exposure completes. */
const SCAN_FLASH_COLOR = 0x66ffee

/** Target marker sphere radius in world units. */
const TARGET_MARKER_RADIUS = 14

/** LOS beam opacity for a translucent laser-style guide. */
const LOS_BEAM_OPACITY = 0.35

/** LOS beam radius in world units. */
const LOS_BEAM_RADIUS = 0.22

/** Forward scan beam length in world units. */
const LOS_BEAM_LENGTH = 2600

/** Number of particles emitted when the probe is collected. */
const COLLECT_PARTICLE_COUNT = 28

/** Number of arrival particles emitted when the waypoint appears. */
const ARRIVAL_PARTICLE_COUNT = 8

/** Default duration of the asteroid wireframe flash in seconds. */
const DEFAULT_FLASH_DURATION = 5

/** Tiny upward velocity used for arrival particles. */
const ARRIVAL_PARTICLE_UP_VELOCITY = 4

/** Photometry waypoint floats above the probe by this fraction of the standard beam height. */
const PHOTOMETRY_WAYPOINT_HEIGHT_OFFSET_FRACTION = 0.1

/** Photometry waypoint vertical offset in world units. */
const PHOTOMETRY_WAYPOINT_Y_OFFSET =
  WAYPOINT_SURFACE_BEAM_HEIGHT * PHOTOMETRY_WAYPOINT_HEIGHT_OFFSET_FRACTION

/** Particle burst outward velocity scale. */
const COLLECT_PARTICLE_SPEED = 14

/** Options for launching a photometry probe. */
export interface PhotometryProbeSpawnOptions {
  /** Terminal launch position in world space. */
  terminalPosition: THREE.Vector3
  /** Final side-standoff probe position in world space. */
  targetPosition: THREE.Vector3
  /** Apex Y coordinate reached before the probe arcs sideways. */
  launchApexY: number
}

/** Material wireframe state captured before an asteroid scan flash. */
interface WireframeSnapshot {
  /** Material whose wireframe state is temporarily changed. */
  material: THREE.Material & { wireframe?: boolean }
  /** Original wireframe flag. */
  wireframe: boolean
  /** Original color for materials that expose a color channel. */
  color: THREE.Color | null
  /** Original material opacity. */
  opacity: number
  /** Original transparent flag. */
  transparent: boolean
}

/**
 * Photometry probe controller.
 *
 * @author guinetik
 * @date 2026-04-26
 */
export class PhotometryProbeController implements Tickable {
  private readonly scene: THREE.Scene
  private readonly asteroidRoot: THREE.Object3D | null
  private readonly probeGroup = new THREE.Group()
  private readonly probeMesh: THREE.Mesh
  private readonly origin = new THREE.Vector3()
  private readonly apex = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private waypoint: THREE.Group | null = null
  private targetMarker: THREE.Mesh | null = null
  private losBeam: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial> | null = null
  private elapsed = 0
  private flightTime = 0
  private arrived = false
  private isCollected = false
  private collectedCount = 0
  private readonly flashSnapshots: WireframeSnapshot[] = []
  private flashRemaining = 0
  private flashDuration = 0

  /** Particle emitter for arrival and collection bursts. */
  readonly collectEmitter: ParticleEmitter

  /** Callback fired once when the lander collects the arrived probe. */
  onCollect: (() => void) | null = null

  /** Whether the probe has reached its final standoff point. */
  get isArrived(): boolean {
    return this.arrived
  }

  /** Whether the waypoint marker is currently visible at the probe standoff. */
  get hasWaypoint(): boolean {
    return this.waypoint !== null
  }

  /** Number of photometry probes collected. Always `0` or `1`. */
  get collected(): number {
    return this.collectedCount
  }

  /** Total probe count for HUD progress. */
  get total(): number {
    return 1
  }

  /** True after the single photometry probe has been collected. */
  get allCollected(): boolean {
    return this.collectedCount === this.total
  }

  constructor(scene: THREE.Scene, asteroidRoot: THREE.Object3D | null = null) {
    this.scene = scene
    this.asteroidRoot = asteroidRoot
    const geometry = new THREE.OctahedronGeometry(PROBE_RADIUS, 0)
    const material = new THREE.MeshBasicMaterial({
      color: PHOTOMETRY_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.probeMesh = new THREE.Mesh(geometry, material)
    this.probeGroup.add(this.probeMesh)
    this.probeGroup.visible = false
    this.scene.add(this.probeGroup)

    this.collectEmitter = new ParticleEmitter({
      poolSize: 128,
      color: new THREE.Color(PHOTOMETRY_COLOR),
      size: 5,
      lifetime: 1,
      spread: 25,
      opacity: 1,
    })
    this.scene.add(this.collectEmitter.points)
  }

  /**
   * Launch the probe from the terminal to a side standoff position.
   *
   * @param options - Terminal origin, final target, and launch apex.
   */
  spawn(options: PhotometryProbeSpawnOptions): void {
    this.clearWaypoint()
    this.clearScanVisuals()
    this.restoreWireframeFlash()
    this.origin.copy(options.terminalPosition)
    this.origin.y += LAUNCH_HOVER_HEIGHT
    this.apex.set(options.terminalPosition.x, options.launchApexY, options.terminalPosition.z)
    this.target.copy(options.targetPosition)
    this.elapsed = 0
    this.flightTime = 0
    this.arrived = false
    this.isCollected = false
    this.collectedCount = 0
    this.probeGroup.visible = true
    this.probeGroup.position.copy(this.origin)
    this.probeGroup.scale.setScalar(LAUNCH_START_SCALE)
  }

  /**
   * Advance probe launch, idle animation, waypoint pulse, particles, and scan flash.
   *
   * @param dt - Delta time in seconds.
   */
  tick(dt: number): void {
    this.elapsed += dt
    this.collectEmitter.tick(dt)
    this.tickFlash(dt)

    if (!this.probeGroup.visible || this.isCollected) {
      this.tickWaypoint()
      return
    }

    if (!this.arrived) {
      this.tickLaunch(dt)
    } else {
      this.probeGroup.rotation.y = this.elapsed * IDLE_SPIN_SPEED
      this.probeGroup.position.y =
        this.target.y + Math.sin(this.elapsed * IDLE_BOB_SPEED) * IDLE_BOB_AMPLITUDE
    }

    this.tickWaypoint()
  }

  /**
   * Check whether the lander has collected the arrived probe.
   *
   * @param landerPosition - Current lander world position.
   */
  checkCollection(landerPosition: THREE.Vector3): void {
    if (!this.arrived || this.isCollected) return
    if (landerPosition.distanceTo(this.probeGroup.position) > COLLECT_RANGE) return

    this.isCollected = true
    this.collectedCount = 1
    this.probeGroup.visible = false
    for (let i = 0; i < COLLECT_PARTICLE_COUNT; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() + 0.5,
        (Math.random() - 0.5) * 2,
      )
        .normalize()
        .multiplyScalar(COLLECT_PARTICLE_SPEED)
      this.collectEmitter.emit(this.target, velocity)
    }
    this.onCollect?.()
  }

  /**
   * Reveal the asteroid scan target and LOS line.
   *
   * @param targetPosition - Asteroid surface target point.
   */
  showScanTarget(targetPosition: THREE.Vector3): void {
    if (!this.targetMarker) {
      const geometry = new THREE.SphereGeometry(TARGET_MARKER_RADIUS, 16, 8)
      const material = new THREE.MeshBasicMaterial({
        color: SCAN_COLOR,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      this.targetMarker = new THREE.Mesh(geometry, material)
      this.targetMarker.name = 'photometry-scan-target'
      this.scene.add(this.targetMarker)
    }
    this.targetMarker.position.copy(targetPosition)

    if (!this.losBeam) {
      const geometry = new THREE.CylinderGeometry(LOS_BEAM_RADIUS, LOS_BEAM_RADIUS, 1, 8)
      const material = new THREE.MeshBasicMaterial({
        color: SCAN_COLOR,
        transparent: true,
        opacity: LOS_BEAM_OPACITY,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      this.losBeam = new THREE.Mesh(geometry, material)
      this.losBeam.name = 'photometry-los-beam'
      this.scene.add(this.losBeam)
    }
  }

  /**
   * Update the forward scan beam emitted by the lander.
   *
   * @param emitterPosition - World-space beam origin on top of the lander.
   * @param forwardDirection - Normalized lander-facing direction.
   */
  updateScanBeam(emitterPosition: THREE.Vector3, forwardDirection: THREE.Vector3): void {
    if (!this.losBeam) return
    const delta = forwardDirection.clone().normalize().multiplyScalar(LOS_BEAM_LENGTH)
    const length = delta.length()
    if (length <= 0) return

    this.losBeam.position.copy(emitterPosition).addScaledVector(delta, 0.5)
    this.losBeam.scale.set(1, length, 1)
    this.losBeam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.multiplyScalar(1 / length),
    )
  }

  /**
   * Set whether the asteroid focus marker and beam show a valid scan lock.
   *
   * @param locked - True when the lander is stable enough to advance the scan.
   */
  setScanLocked(locked: boolean): void {
    if (!this.targetMarker || !(this.targetMarker.material instanceof THREE.MeshBasicMaterial)) {
      return
    }
    const color = locked ? SCAN_LOCKED_COLOR : SCAN_COLOR
    this.targetMarker.material.color.setHex(color)
    this.losBeam?.material.color.setHex(color)
  }

  /** Hide the waypoint marker once the standoff scan is complete. */
  hideWaypoint(): void {
    this.clearWaypoint()
  }

  /** Hide the scan focus marker and beam. */
  hideScanVisuals(): void {
    this.clearScanVisuals()
  }

  /**
   * Temporarily change asteroid mesh materials to wireframe for the exposure flash.
   *
   * @param durationSeconds - Duration of the flash in seconds.
   */
  triggerAsteroidFlash(durationSeconds: number = DEFAULT_FLASH_DURATION): void {
    this.restoreWireframeFlash()
    if (!this.asteroidRoot) return
    const touchedMaterials = new Set<THREE.Material>()
    this.asteroidRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (touchedMaterials.has(material)) continue
        touchedMaterials.add(material)
        const wireMaterial = material as THREE.Material & { wireframe?: boolean }
        const colorMaterial = material as THREE.Material & { color?: THREE.Color }
        this.flashSnapshots.push({
          material: wireMaterial,
          wireframe: wireMaterial.wireframe ?? false,
          color: colorMaterial.color?.clone() ?? null,
          opacity: material.opacity,
          transparent: material.transparent,
        })
        wireMaterial.wireframe = true
        colorMaterial.color?.setHex(SCAN_FLASH_COLOR)
        material.transparent = true
        material.opacity = 1
        material.needsUpdate = true
      }
    })
    this.flashRemaining = durationSeconds
    this.flashDuration = durationSeconds
  }

  /** Dispose probe, waypoint, scan visuals, particles, and flash state. */
  dispose(): void {
    this.clearWaypoint()
    this.clearScanVisuals()
    this.restoreWireframeFlash()
    this.scene.remove(this.probeGroup)
    this.probeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    })
    this.scene.remove(this.collectEmitter.points)
  }

  /** Advance the two-stage launch path. */
  private tickLaunch(dt: number): void {
    this.flightTime += dt
    this.probeGroup.rotation.y = this.flightTime * LAUNCH_SPIN_SPEED
    const totalDuration = LAUNCH_HOVER_DURATION + LAUNCH_CLIMB_DURATION + LAUNCH_SIDE_ARC_DURATION

    if (this.flightTime < LAUNCH_HOVER_DURATION) {
      this.probeGroup.position.copy(this.origin)
      this.probeGroup.scale.setScalar(LAUNCH_START_SCALE)
      return
    }

    if (this.flightTime < LAUNCH_HOVER_DURATION + LAUNCH_CLIMB_DURATION) {
      const t = (this.flightTime - LAUNCH_HOVER_DURATION) / LAUNCH_CLIMB_DURATION
      const ease = 1 - Math.pow(1 - t, 2)
      this.probeGroup.position.lerpVectors(this.origin, this.apex, ease)
      this.probeGroup.scale.setScalar(LAUNCH_START_SCALE + (1 - LAUNCH_START_SCALE) * ease)
      return
    }

    if (this.flightTime < totalDuration) {
      const t =
        (this.flightTime - LAUNCH_HOVER_DURATION - LAUNCH_CLIMB_DURATION) / LAUNCH_SIDE_ARC_DURATION
      const ease = t * t * (3 - 2 * t)
      this.probeGroup.position.lerpVectors(this.apex, this.target, ease)
      this.probeGroup.scale.setScalar(1)
      return
    }

    this.arrived = true
    this.probeGroup.position.copy(this.target)
    this.probeGroup.scale.setScalar(1)
    this.createWaypoint()
    for (let i = 0; i < ARRIVAL_PARTICLE_COUNT; i++) {
      this.collectEmitter.emit(this.target, new THREE.Vector3(0, ARRIVAL_PARTICLE_UP_VELOCITY, 0))
    }
  }

  /** Create the standoff waypoint once the probe arrives. */
  private createWaypoint(): void {
    if (this.waypoint) return
    this.waypoint = createWaypointMarkerGroup(PHOTOMETRY_COLOR, 'surface')
    this.waypoint.name = 'photometry-probe-waypoint'
    this.waypoint.position.copy(this.target)
    this.waypoint.position.y += PHOTOMETRY_WAYPOINT_Y_OFFSET
    this.scene.add(this.waypoint)
  }

  /** Animate the local waypoint marker if present. */
  private tickWaypoint(): void {
    if (this.waypoint) {
      tickWaypointMarkerGroup(this.waypoint, this.elapsed)
    }
  }

  /** Remove the local waypoint marker. */
  private clearWaypoint(): void {
    if (!this.waypoint) return
    disposeWaypointMarkerGroup(this.waypoint)
    this.waypoint = null
  }

  /** Remove target marker and LOS line resources. */
  private clearScanVisuals(): void {
    if (this.targetMarker) {
      this.scene.remove(this.targetMarker)
      this.targetMarker.geometry.dispose()
      if (this.targetMarker.material instanceof THREE.Material) this.targetMarker.material.dispose()
      this.targetMarker = null
    }
    if (this.losBeam) {
      this.scene.remove(this.losBeam)
      this.losBeam.geometry.dispose()
      this.losBeam.material.dispose()
      this.losBeam = null
    }
  }

  /** Advance and restore the asteroid wireframe flash. */
  private tickFlash(dt: number): void {
    if (this.flashRemaining <= 0) return
    this.flashRemaining -= dt
    if (this.flashRemaining <= 0) {
      this.restoreWireframeFlash()
      return
    }

    const fadeOpacity = Math.max(0, this.flashRemaining / Math.max(this.flashDuration, dt))
    for (const snapshot of this.flashSnapshots) {
      snapshot.material.opacity = fadeOpacity
      snapshot.material.needsUpdate = true
    }
  }

  /** Restore all materials touched by the wireframe flash. */
  private restoreWireframeFlash(): void {
    for (const snapshot of this.flashSnapshots) {
      snapshot.material.wireframe = snapshot.wireframe
      const colorMaterial = snapshot.material as THREE.Material & { color?: THREE.Color }
      if (snapshot.color && colorMaterial.color) {
        colorMaterial.color.copy(snapshot.color)
      }
      snapshot.material.opacity = snapshot.opacity
      snapshot.material.transparent = snapshot.transparent
      snapshot.material.needsUpdate = true
    }
    this.flashSnapshots.length = 0
    this.flashRemaining = 0
    this.flashDuration = 0
  }
}
