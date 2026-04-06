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
const PHASE_APPROACH_DURATION = 6.0
/** Shuttle rotates 180° (flip maneuver). */
const PHASE_FLIP_DURATION = 2.5
/** Doors open, brief pause. */
const PHASE_DOORS_DURATION = 2.5
/** Lander detaches, falls with gravity, camera follows. */
const PHASE_DETACH_DURATION = 3.0
/** Fade to black while lander falls. */
const PHASE_FADEOUT_DURATION = 1.5

/** Total sequence duration. */
export const ARRIVAL_SEQUENCE_DURATION =
  PHASE_APPROACH_DURATION +
  PHASE_FLIP_DURATION +
  PHASE_DOORS_DURATION +
  PHASE_DETACH_DURATION +
  PHASE_FADEOUT_DURATION

// ── Approach path ───────────────────────────────────────────────
/** Shuttle starts this far from the asteroid (world units). */
const APPROACH_START_DISTANCE = 2000
/** Shuttle stops this far from the lander spawn point. */
const APPROACH_END_DISTANCE = 60
/** Shuttle approach altitude (Y). */
const APPROACH_ALTITUDE = 800
/** Shuttle visual scale in the level scene. */
const SHUTTLE_LEVEL_SCALE = 1.0

/** Lander fall gravity after detach (world units/sec²). */
const LANDER_FALL_GRAVITY = 3.0

/** Idle thruster sprite size (in raw model space, pre MODEL_SCALE). */
const THRUSTER_SPRITE_SIZE = 140

/** Thruster sprite X offset behind nozzle (raw model space). */
const THRUSTER_SPRITE_X_OFFSET = -80

/** Timeline phase identifiers. */
type ArrivalPhase = 'approach' | 'flip' | 'doors' | 'detach' | 'fadeout' | 'done'

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
  private landerFallSpeed = 0
  private readonly thrusterSprites: THREE.Sprite[] = []
  private thrusterElapsed = 0
  /** The detached lander group in scene space (for falling animation). */
  private fallingLander: THREE.Object3D | null = null

  // Shuttle flight state
  private shuttleStartPos = new THREE.Vector3()
  private shuttleEndPos = new THREE.Vector3()

  /** Called when the lander detaches — passes world position for LanderController placement. */
  onLanderDetach: ((position: THREE.Vector3) => void) | null = null

  /** Called each frame with fade opacity (0 = clear, 1 = black). */
  onFadeOut: ((opacity: number) => void) | null = null

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
    // Nose along +X in model space; rotate -90° Y so nose points +Z (travel direction)
    this.shuttleGroup.rotation.y = -Math.PI / 2
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

    // Initial camera: wide establishing shot, far behind and above the shuttle
    this.camera.position.set(
      this.shuttleStartPos.x + 80,
      this.shuttleStartPos.y + 100,
      this.shuttleStartPos.z - 400,
    )
    this.camera.lookAt(this.shuttleStartPos)

    // Thruster nozzle sprites — idle glow at each engine nozzle
    // Positions in raw model coords (shuttleScene is scaled by MODEL_SCALE)
    const thrusterTexture = this.createThrusterTexture()
    const engSpritePositions: [number, number, number][] = [
      [-510 + THRUSTER_SPRITE_X_OFFSET, 0, 72],
      [-510 + THRUSTER_SPRITE_X_OFFSET, -52, -46],
      [-510 + THRUSTER_SPRITE_X_OFFSET, 52, -46],
    ]
    for (const [x, y, z] of engSpritePositions) {
      const material = new THREE.SpriteMaterial({
        map: thrusterTexture,
        color: new THREE.Color(0xff9a1f),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const sprite = new THREE.Sprite(material)
      sprite.position.set(x, y, z)
      sprite.visible = false
      sprite.scale.setScalar(THRUSTER_SPRITE_SIZE)
      shuttleScene.add(sprite)
      this.thrusterSprites.push(sprite)
    }

    // Place engine nozzle geometry (same as ShuttleController)
    const engNode = this.findNode(shuttleScene, 'eng')
    if (engNode) {
      const engParent = engNode.parent
      if (engParent) engParent.remove(engNode)
      const engPositions: [number, number, number][] = [
        [-510, 0, 72],
        [-510, -52, -46],
        [-510, 52, -46],
      ]
      for (const [x, y, z] of engPositions) {
        const nozzle = engNode.clone()
        nozzle.position.set(x, y, z)
        nozzle.rotation.set(0, 0, 0)
        nozzle.scale.set(1, 1, 1)
        shuttleScene.add(nozzle)
      }
    }

    // Hide RCS pods
    const rcsNode = this.findNode(shuttleScene, 'rcs')
    if (rcsNode) rcsNode.visible = false
  }

  /** Advance the sequence by dt seconds. */
  tick(dt: number): void {
    if (this.phase === 'done') return

    this.elapsed += dt
    this.phaseElapsed += dt

    // Thruster sprites pulse during approach and depart
    this.thrusterElapsed += dt
    const thrustersActive = this.phase === 'approach'
    this.updateThrusterSprites(thrustersActive)

    // Falling lander gravity (continues through fadeout)
    if (this.fallingLander) {
      this.landerFallSpeed += LANDER_FALL_GRAVITY * dt
      this.fallingLander.position.y -= this.landerFallSpeed * dt
      this.landerWorldPos.copy(this.fallingLander.position)
    }

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
      case 'fadeout':
        this.tickFadeout()
        break
    }
  }

  /**
   * Park the shuttle hovering above the lander position.
   * Removes the falling cinematic lander but keeps the shuttle in the scene.
   * Call after sequence completes to leave the shuttle visible from below.
   *
   * @param hoverHeight - Altitude above the lander detach point.
   */
  parkShuttle(hoverHeight: number): void {
    this.fallingLander?.removeFromParent()
    this.fallingLander = null

    // Position shuttle at hover height above terrain (not relative to detach altitude)
    this.shuttleGroup.position.set(
      this.landerWorldPos.x,
      hoverHeight,
      this.landerWorldPos.z,
    )
    // Right-side up so the lighter belly faces down toward the player
    this.shuttleGroup.rotation.set(0, -Math.PI / 2, 0)

    // Close doors
    this.doorProgress = 0
    this.updateDoorRotation()

    // Hide thruster sprites (parked, not thrusting)
    for (const sprite of this.thrusterSprites) {
      sprite.visible = false
    }

    // Navigation lights so the shuttle is visible from the ground
    // Light below illuminates the belly from underneath
    const underLight = new THREE.PointLight(0x6699cc, 8, 600)
    underLight.position.set(0, -20, 0)
    this.shuttleGroup.add(underLight)
    // Light above for skyline silhouette
    const topLight = new THREE.PointLight(0xffeedd, 4, 400)
    topLight.position.set(0, 10, 0)
    this.shuttleGroup.add(topLight)
    // Cargo bay interior glow (doors are closed but adds presence)
    const cargoGlow = new THREE.PointLight(0xffaa44, 3, 300)
    cargoGlow.position.set(-3, -2, 0)
    this.shuttleGroup.add(cargoGlow)
  }

  /** Remove shuttle and falling lander from scene entirely. */
  dispose(): void {
    this.fallingLander?.removeFromParent()
    this.fallingLander = null
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

    // Camera starts wide and far, pulls in as shuttle approaches
    const camDistance = THREE.MathUtils.lerp(400, 80, eased)
    const camHeight = THREE.MathUtils.lerp(100, 25, eased)
    const camSide = THREE.MathUtils.lerp(80, 20, eased)
    this.camera.position.set(
      this.shuttleGroup.position.x + camSide,
      this.shuttleGroup.position.y + camHeight,
      this.shuttleGroup.position.z - camDistance,
    )
    this.camera.lookAt(this.shuttleGroup.position)

    if (t >= 1) this.nextPhase('flip')
  }

  private tickFlip(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FLIP_DURATION)
    const eased = this.easeInOut(t)

    // Pitch 180° — nose goes over tail. Base Y rotation stays at -90° (nose along +Z).
    // Rotate around local X axis for a pitch-over maneuver.
    this.shuttleGroup.rotation.set(eased * Math.PI, -Math.PI / 2, 0, 'YXZ')

    // Camera orbits to the side to show the flip
    const angle = eased * Math.PI * 0.5
    const camDist = 100
    this.camera.position.set(
      this.shuttleGroup.position.x + Math.sin(angle) * camDist,
      this.shuttleGroup.position.y + 20,
      this.shuttleGroup.position.z + Math.cos(angle) * camDist * 0.3,
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
      // Get lander world transform before reparenting
      const worldPos = new THREE.Vector3()
      this.landerModel.getWorldPosition(worldPos)
      const worldScale = new THREE.Vector3()
      this.landerModel.getWorldScale(worldScale)

      // Reparent lander to the scene root so it falls independently
      this.landerModel.removeFromParent()
      this.landerModel.position.copy(worldPos)
      this.landerModel.scale.copy(worldScale)
      this.landerModel.rotation.set(0, 0, 0)
      this.shuttleGroup.parent?.add(this.landerModel)

      this.fallingLander = this.landerModel
      this.landerWorldPos.copy(worldPos)
      this.landerDetached = true
      this.onLanderDetach?.(worldPos)
    }

    // Camera follows the falling lander
    this.camera.position.set(
      this.landerWorldPos.x + 30,
      this.landerWorldPos.y + 15,
      this.landerWorldPos.z + 25,
    )
    this.camera.lookAt(this.landerWorldPos)

    if (t >= 1) this.nextPhase('fadeout')
  }

  private tickFadeout(): void {
    const t = Math.min(1, this.phaseElapsed / PHASE_FADEOUT_DURATION)

    // Fade to black
    this.onFadeOut?.(t)

    // Camera continues following the falling lander
    this.camera.position.set(
      this.landerWorldPos.x + 30,
      this.landerWorldPos.y + 15,
      this.landerWorldPos.z + 25,
    )
    this.camera.lookAt(this.landerWorldPos)

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

  private updateThrusterSprites(active: boolean): void {
    if (!active) {
      for (const sprite of this.thrusterSprites) {
        sprite.visible = false
      }
      return
    }
    // Pulse: scale and opacity oscillate
    const pulse = 0.7 + 0.3 * Math.sin(this.thrusterElapsed * 12)
    const opacity = 0.5 + 0.5 * Math.sin(this.thrusterElapsed * 8)
    for (const sprite of this.thrusterSprites) {
      sprite.visible = true
      sprite.scale.setScalar(THRUSTER_SPRITE_SIZE * pulse)
      ;(sprite.material as THREE.SpriteMaterial).opacity = opacity
    }
  }

  private createThrusterTexture(): THREE.CanvasTexture {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const center = size / 2
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center)
    gradient.addColorStop(0, '#fff5cc')
    gradient.addColorStop(0.45, '#ff9a1f')
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  private findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    root.traverse((child) => {
      if (child.name === name && !found) found = child
    })
    return found
  }
}
