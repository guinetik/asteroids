/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * Loads the shuttle model, animates approach → flip → doors open →
 * lander detach → shuttle departs. Manages a cinematic camera
 * that transitions to follow the lander at the end.
 *
 * @author guinetik
 * @date 2026-04-06
 */
import * as THREE from 'three'
import { loadGLB } from './loadGLB'
import { FuelTank } from './FuelTank'
import { HabitatModule } from './HabitatModule'

const SHUTTLE_MODEL_PATH = '/models/shuttle.glb'
const LANDER_MODEL_PATH = '/models/lander.glb'

/** NASA model is in centimeters. Scale to meters. */
const MODEL_SCALE = 0.01

/** Model orientation correction: rotate -90° around X to lay flat on XZ. */
const MODEL_ROTATION_X = -Math.PI / 2

/** Cargo bay door open angle (radians). */
const DOOR_OPEN_ANGLE = Math.PI * 0.6

/** Cargo bay door animation speed (radians/sec). */
const DOOR_ANIM_SPEED = 1.5

/** Scale for the lander model inside the cargo bay (raw shuttle cm space). */
const CARGO_LANDER_SCALE = 30

/** Lander position inside the bay — raw model coords. */
const CARGO_LANDER_OFFSET = new THREE.Vector3(-320, 0, 20)

// ── Timeline phase durations (seconds) ──────────────────────────
/** Shuttle approaches from distance. */
const PHASE_APPROACH_DURATION = 4.0
/** Shuttle rotates 180° (flip maneuver). */
const PHASE_FLIP_DURATION = 2.5
/** Doors open, brief pause. */
const PHASE_DOORS_DURATION = 2.5
/** Lander detaches and drifts out. */
const PHASE_DETACH_DURATION = 2.0
/** Shuttle closes doors and flies away. */
const PHASE_DEPART_DURATION = 3.0
/** Camera transitions to follow lander. */
const PHASE_CAMERA_TRANSITION_DURATION = 1.5

/** Total sequence duration. */
export const ARRIVAL_SEQUENCE_DURATION =
  PHASE_APPROACH_DURATION +
  PHASE_FLIP_DURATION +
  PHASE_DOORS_DURATION +
  PHASE_DETACH_DURATION +
  PHASE_DEPART_DURATION +
  PHASE_CAMERA_TRANSITION_DURATION

// ── Approach path ───────────────────────────────────────────────
/** Shuttle starts this far from the asteroid (world units). */
const APPROACH_START_DISTANCE = 800
/** Shuttle stops this far from the lander spawn point. */
const APPROACH_END_DISTANCE = 60
/** Shuttle approach altitude (Y). */
const APPROACH_ALTITUDE = 400
/** Shuttle visual scale in the level scene. */
const SHUTTLE_LEVEL_SCALE = 1.0

/** Shuttle departure acceleration (world units/sec²). */
const SHUTTLE_DEPART_ACCELERATION = 40

/** Timeline phase identifiers. */
type ArrivalPhase = 'approach' | 'flip' | 'doors' | 'detach' | 'depart' | 'camera-transition' | 'done'

/**
 * Cinematic arrival sequence for the asteroid level.
 *
 * @author guinetik
 * @date 2026-04-06
 */
export class ArrivalSequence {
  /** Root group added to the scene. */
  readonly shuttleGroup = new THREE.Group()

  /** The cinematic camera managed by this sequence. */
  readonly camera: THREE.PerspectiveCamera

  /** Whether the sequence has finished. */
  get isDone(): boolean {
    return this.phase === 'done'
  }

  /** World position where the lander should spawn after detach. */
  get landerSpawnPosition(): THREE.Vector3 {
    return this.landerWorldPos.clone()
  }

  private phase: ArrivalPhase = 'approach'
  private elapsed = 0
  private phaseElapsed = 0

  // Model nodes
  private doorPortNode: THREE.Object3D | null = null
  private doorStbNode: THREE.Object3D | null = null
  private doorPortClosedRotX = 0
  private doorStbClosedRotX = 0
  private doorProgress = 0
  private landerModel: THREE.Object3D | null = null
  private landerDetached = false
  private landerWorldPos = new THREE.Vector3()

  // Shuttle flight state
  private shuttleStartPos = new THREE.Vector3()
  private shuttleEndPos = new THREE.Vector3()
  private departSpeed = 0

  // Camera state
  private cameraStartPos = new THREE.Vector3()
  private cameraStartTarget = new THREE.Vector3()
  private cameraEndPos = new THREE.Vector3()
  private cameraEndTarget = new THREE.Vector3()

  /** Called when the lander detaches — passes world position for LanderController placement. */
  onLanderDetach: ((position: THREE.Vector3) => void) | null = null

  /** Called when the full sequence completes. */
  onComplete: (() => void) | null = null

  constructor(private readonly landerSpawnTarget: THREE.Vector3) {
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 15000)

    this.shuttleEndPos.set(
      landerSpawnTarget.x,
      APPROACH_ALTITUDE,
      landerSpawnTarget.z - APPROACH_END_DISTANCE,
    )
    this.shuttleStartPos.set(
      landerSpawnTarget.x,
      APPROACH_ALTITUDE,
      landerSpawnTarget.z - APPROACH_START_DISTANCE,
    )
    this.shuttleGroup.position.copy(this.shuttleStartPos)
  }

  /** Load the shuttle model and set up internal structure. */
  async load(): Promise<void> {
    const shuttleScene = await loadGLB(SHUTTLE_MODEL_PATH)
    shuttleScene.scale.setScalar(MODEL_SCALE)
    shuttleScene.rotation.x = MODEL_ROTATION_X
    this.shuttleGroup.add(shuttleScene)
    this.shuttleGroup.scale.setScalar(SHUTTLE_LEVEL_SCALE)

    // Find door nodes
    this.doorPortNode = this.findNode(shuttleScene, 'door-prt')
    this.doorStbNode = this.findNode(shuttleScene, 'door-stb')
    if (this.doorPortNode) this.doorPortClosedRotX = this.doorPortNode.rotation.x
    if (this.doorStbNode) this.doorStbClosedRotX = this.doorStbNode.rotation.x

    // Fuel tanks (cosmetic, always full)
    const landerTank = new FuelTank({
      radius: 80,
      length: 120,
      position: new THREE.Vector3(-125, 0, 15),
      color: 0xcc6633,
    })
    landerTank.update(1.0)
    shuttleScene.add(landerTank.group)

    const shuttleTank = new FuelTank({
      radius: 80,
      length: 220,
      position: new THREE.Vector3(35, 0, 15),
      color: 0x999999,
    })
    shuttleTank.update(1.0)
    shuttleScene.add(shuttleTank.group)

    // Habitat module (cosmetic)
    const habitat = new HabitatModule({
      radius: 80,
      length: 260,
      position: new THREE.Vector3(290, 0, 15),
    })
    habitat.setVisible(true)
    shuttleScene.add(habitat.group)

    // Lander inside cargo bay
    this.landerModel = await loadGLB(LANDER_MODEL_PATH)
    this.landerModel.scale.setScalar(CARGO_LANDER_SCALE)
    this.landerModel.position.copy(CARGO_LANDER_OFFSET)
    this.landerModel.rotation.set(0, 0, -Math.PI / 2)
    shuttleScene.add(this.landerModel)

    // Initial camera: behind and above the shuttle
    this.camera.position.set(
      this.shuttleStartPos.x,
      this.shuttleStartPos.y + 30,
      this.shuttleStartPos.z - 120,
    )
    this.camera.lookAt(this.shuttleStartPos)
  }

  /** Advance the sequence by dt seconds. */
  tick(dt: number): void {
    if (this.phase === 'done') return

    this.elapsed += dt
    this.phaseElapsed += dt

    switch (this.phase) {
      case 'approach':
        this.tickApproach()
        break
      case 'flip':
        this.tickFlip()
        break
      case 'doors':
        this.tickDoors(dt)
        break
      case 'detach':
        this.tickDetach()
        break
      case 'depart':
        this.tickDepart(dt)
        break
      case 'camera-transition':
        this.tickCameraTransition()
        break
    }
  }

  /** Remove shuttle from scene. Call after sequence completes. */
  dispose(): void {
    this.shuttleGroup.removeFromParent()
    this.shuttleGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
  }

  // ── Phase tickers ─────────────────────────────────────────────

  private tickApproach(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_APPROACH_DURATION)
    const eased = this.easeInOut(t)

    this.shuttleGroup.position.lerpVectors(this.shuttleStartPos, this.shuttleEndPos, eased)

    this.camera.position.set(
      this.shuttleGroup.position.x + 20,
      this.shuttleGroup.position.y + 25,
      this.shuttleGroup.position.z - 80,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('flip')
  }

  private tickFlip(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FLIP_DURATION)
    const eased = this.easeInOut(t)

    this.shuttleGroup.rotation.y = eased * Math.PI

    const angle = eased * Math.PI * 0.5
    const camDist = 100
    this.camera.position.set(
      this.shuttleGroup.position.x + Math.sin(angle) * camDist,
      this.shuttleGroup.position.y + 20,
      this.shuttleGroup.position.z - Math.cos(angle) * camDist,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('doors')
  }

  private tickDoors(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DOORS_DURATION)

    this.doorProgress = Math.min(1, this.doorProgress + DOOR_ANIM_SPEED * dt)
    this.updateDoorRotation()

    const camTarget = this.shuttleGroup.position.clone()
    camTarget.y -= 10
    this.camera.position.set(
      this.shuttleGroup.position.x + 60,
      this.shuttleGroup.position.y - 5,
      this.shuttleGroup.position.z + 40,
    )
    this.camera.lookAt(camTarget)

    if (t >= 1) this.nextPhase('detach')
  }

  private tickDetach(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DETACH_DURATION)

    if (!this.landerDetached && this.landerModel) {
      const worldPos = new THREE.Vector3()
      this.landerModel.getWorldPosition(worldPos)

      this.landerModel.removeFromParent()
      this.landerWorldPos.copy(worldPos)
      this.landerDetached = true
      this.onLanderDetach?.(worldPos)
    }

    this.camera.position.set(
      this.landerWorldPos.x + 40,
      this.landerWorldPos.y + 20,
      this.landerWorldPos.z + 30,
    )
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) this.nextPhase('depart')
  }

  private tickDepart(dt: number): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_DEPART_DURATION)

    this.doorProgress = Math.max(0, this.doorProgress - DOOR_ANIM_SPEED * dt)
    this.updateDoorRotation()

    this.departSpeed += SHUTTLE_DEPART_ACCELERATION * dt
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(this.shuttleGroup.quaternion)
    forward.normalize()
    this.shuttleGroup.position.addScaledVector(forward, this.departSpeed * dt)
    this.shuttleGroup.position.y += this.departSpeed * 0.3 * dt

    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) {
      this.cameraStartPos.copy(this.camera.position)
      this.cameraStartTarget.copy(this.landerWorldPos)
      this.cameraEndPos.set(
        this.landerWorldPos.x + 80,
        this.landerWorldPos.y + 30,
        this.landerWorldPos.z + 60,
      )
      this.cameraEndTarget.copy(this.landerWorldPos)
      this.nextPhase('camera-transition')
    }
  }

  private tickCameraTransition(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_CAMERA_TRANSITION_DURATION)
    const eased = this.easeInOut(t)

    this.camera.position.lerpVectors(this.cameraStartPos, this.cameraEndPos, eased)
    const target = new THREE.Vector3().lerpVectors(this.cameraStartTarget, this.cameraEndTarget, eased)
    this.camera.lookAt(target)

    if (t >= 1) {
      this.phase = 'done'
      this.onComplete?.()
    }
  }

  // ── Helpers ───────────────────────────────────────────────────

  private nextPhase(next: ArrivalPhase): void {
    this.phase = next
    this.phaseElapsed = 0
  }

  private updateDoorRotation(): void {
    const angle = this.doorProgress * DOOR_OPEN_ANGLE
    if (this.doorPortNode) {
      this.doorPortNode.rotation.x = this.doorPortClosedRotX - angle
    }
    if (this.doorStbNode) {
      this.doorStbNode.rotation.x = this.doorStbClosedRotX + angle
    }
  }

  private easeInOut(t: number): number {
    return t * t * (3 - 2 * t)
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) found = child
    })
    return found
  }
}
