/**
 * Self-contained Three.js scene for the walkable habitat interior.
 *
 * Handles cylinder geometry, lighting, starfield, furniture loading,
 * FPS movement, and table interaction. Designed to be swapped into an
 * EffectComposer renderPass by MapViewController.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'
import { FpsCamera, type FpsCameraConfig } from '@/three/FpsCamera'
import { InputManager } from '@/lib/InputManager'
import { HABITAT_BINDINGS } from '@/lib/defaultBindings'
import { loadGLB } from '@/three/loadGLB'

// ---------------------------------------------------------------------------
// Constants — no magic numbers
// ---------------------------------------------------------------------------

/** Radius of the habitat cylinder in world units. */
const CYLINDER_RADIUS = 5
/** Length of the habitat cylinder along the Z axis. */
const CYLINDER_LENGTH = 16
/** Number of radial segments on the cylinder mesh. */
const CYLINDER_RADIAL_SEGMENTS = 24
/** Number of height segments used for the girder rings. */
const GIRDER_SEGMENTS_HEIGHT = 6
/** Number of radial steps per girder arc. */
const GIRDER_SEGMENTS_RADIAL = 12
/** Tint colour of the glass shell. */
const GLASS_COLOR = 0x88ccff
/** Transparency of the glass shell (0 = fully transparent, 1 = opaque). */
const GLASS_OPACITY = 0.15
/** Colour of the metallic wireframe girders. */
const GIRDER_COLOR = 0x888888
/** Colour of the end-cap disc. */
const CAP_COLOR = 0xaaaaaa
/** Number of star points in the background starfield. */
const STAR_COUNT = 2000
/** Radius of the sphere on which stars are placed. */
const STAR_SPHERE_RADIUS = 200
/** Y position of the walkable floor (world units). */
const FLOOR_Y = 0
/** Player movement speed (world units per second). */
const MOVE_SPEED = 6
/** Minimum distance between player centre and cylinder wall. */
const COLLISION_MARGIN = 1.5
/** Distance within which the player can interact with the table. */
const INTERACT_DISTANCE = 2.5

/** Eye height of the FPS camera above the floor (world units). */
const HABITAT_EYE_HEIGHT = 1.7
/** Mouse sensitivity for the FPS camera (radians per pixel). */
const HABITAT_SENSITIVITY = 0.002
/** Maximum up/down pitch angle of the FPS camera (radians). */
const HABITAT_PITCH_CLAMP = Math.PI / 3
/** Vertical field of view for the FPS camera (degrees). */
const HABITAT_FOV = 70
/** Intensity of the warm point light inside the habitat. */
const INTERIOR_LIGHT_INTENSITY = 1.0
/** Maximum range of the interior point light (world units). */
const INTERIOR_LIGHT_RANGE = 25
/** Intensity of the ambient fill light. */
const AMBIENT_INTENSITY = 0.6
/** Intensity of the exterior directional rim light. */
const EXTERIOR_LIGHT_INTENSITY = 0.3
/** How far inside the cylinder radius the girder rings sit. */
const GIRDER_INSET = 0.05
/** Render size of each star point (world units, with sizeAttenuation). */
const STAR_POINT_SIZE = 0.8
/** Floor width as a multiple of the cylinder radius. */
const FLOOR_WIDTH_FACTOR = 1.8
/** Distance between the table and the cylinder end-cap (world units). */
const TABLE_WALL_INSET = 5

/** FPS camera configuration for the habitat interior. */
const HABITAT_CAMERA_CONFIG: FpsCameraConfig = {
  eyeHeight: HABITAT_EYE_HEIGHT,
  sensitivity: HABITAT_SENSITIVITY,
  pitchClamp: HABITAT_PITCH_CLAMP,
  fov: HABITAT_FOV,
}

// ---------------------------------------------------------------------------
// Scene class
// ---------------------------------------------------------------------------

/**
 * Walkable first-person habitat interior scene.
 *
 * Instantiate, call {@link load} to stream in furniture, then call
 * {@link tick} every frame. The host ViewController is responsible for
 * mounting the camera, handling pointer-lock mouse deltas via
 * `fpsCamera.applyMouseDelta()`, and resizing with `fpsCamera.resize()`.
 *
 * @author guinetik
 * @date 2026-04-06
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class HabitatInteriorScene {
  /** The Three.js scene graph. */
  readonly scene: THREE.Scene

  /** First-person camera controller. */
  readonly fpsCamera: FpsCamera

  /** Keyboard input tracker. */
  readonly inputManager: InputManager

  /**
   * Called when the player successfully interacts with a named object.
   * @param target - Identifier of the interacted object (e.g. `'table'`).
   */
  onInteract: ((target: string) => void) | null = null

  /**
   * Called whenever the interaction prompt should appear or disappear.
   * Pass `null` to hide the prompt; pass a string to show it.
   * @param prompt - Prompt text or `null`.
   */
  onPrompt: ((prompt: string | null) => void) | null = null

  /** Player avatar Object3D — moved each frame, camera tracks it. */
  private readonly player: THREE.Object3D

  /** World position of the table, used for interaction distance checks. */
  private tablePosition = new THREE.Vector3()

  /** Guards against calling load() more than once. */
  private loaded = false

  /** Cached spawn for {@link getSpawnPosition}. */
  private spawnYaw = 0

  constructor() {
    this.scene = new THREE.Scene()
    this.fpsCamera = new FpsCamera(HABITAT_CAMERA_CONFIG)
    this.inputManager = new InputManager(HABITAT_BINDINGS)

    // Player avatar — an empty Object3D the camera attaches to
    this.player = new THREE.Object3D()
    this.player.position.set(0, FLOOR_Y, 0)
    this.scene.add(this.player)
    this.fpsCamera.setTarget(this.player)
    this.fpsCamera.yaw = this.spawnYaw

    this.buildCylinder()
    this.buildLighting()
    this.buildStarfield()
    this.buildFloor()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Returns the Three.js perspective camera owned by the FPS controller. */
  getCamera(): THREE.PerspectiveCamera {
    return this.fpsCamera.camera
  }

  /** Returns the scene graph. */
  getScene(): THREE.Scene {
    return this.scene
  }

  /**
   * Returns the recommended spawn position and yaw for the player camera.
   * Call this before handing off pointer-lock to ensure the view faces the table.
   */
  getSpawnPosition(): { position: THREE.Vector3; yaw: number } {
    return {
      position: new THREE.Vector3(0, FLOOR_Y + HABITAT_CAMERA_CONFIG.eyeHeight, 0),
      yaw: this.spawnYaw,
    }
  }

  /**
   * Asynchronously loads bed.glb and table.glb and places them in the scene.
   * Safe to call multiple times — returns early after the first successful load.
   */
  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true

    const [bedModel, tableModel] = await Promise.all([
      loadGLB('/models/bed.glb'),
      loadGLB('/models/table.glb'),
    ])

    // --- Bed ----------------------------------------------------------------
    const bedBox = new THREE.Box3().setFromObject(bedModel)
    const bedSize = bedBox.getSize(new THREE.Vector3())
    const bedMaxDim = Math.max(bedSize.x, bedSize.y, bedSize.z)
    // Scale so the longest dimension ≈ 2 world units
    const BED_TARGET_SIZE = 2
    bedModel.scale.setScalar(BED_TARGET_SIZE / bedMaxDim)
    bedModel.rotation.y = Math.PI // face toward the base

    // Re-centre after scale + rotation
    bedBox.setFromObject(bedModel)
    const bedCenter = bedBox.getCenter(new THREE.Vector3())
    bedModel.position.sub(bedCenter)

    // Drop to floor
    bedBox.setFromObject(bedModel)
    const bedMin = bedBox.min.y
    bedModel.position.y -= bedMin - FLOOR_Y

    this.scene.add(bedModel)

    // --- Table --------------------------------------------------------------
    const tableBox = new THREE.Box3().setFromObject(tableModel)
    const tableSize = tableBox.getSize(new THREE.Vector3())
    const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
    const TABLE_TARGET_SIZE = 3.5
    tableModel.scale.setScalar(TABLE_TARGET_SIZE / tableMaxDim)
    tableModel.rotation.set(Math.PI, 0, Math.PI) // X flips front, Z flips upright

    // Re-centre after scale + rotation
    tableBox.setFromObject(tableModel)
    const tableCenter = tableBox.getCenter(new THREE.Vector3())
    tableModel.position.sub(tableCenter)

    // Place near the back wall (negative Z end of the cylinder)
    const TABLE_Z = -CYLINDER_LENGTH / 2 + TABLE_WALL_INSET
    tableModel.position.z = TABLE_Z

    // Drop to floor
    tableBox.setFromObject(tableModel)
    const tableMin = tableBox.min.y
    tableModel.position.y -= tableMin - FLOOR_Y

    // Tame the emissive LEDs on the table model
    tableModel.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial && mat.emissiveIntensity > 0) {
            mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.7)
          }
        }
      }
    })

    this.scene.add(tableModel)

    // Store the world position for interaction checks
    this.tablePosition.set(0, FLOOR_Y, TABLE_Z)
  }

  /**
   * Advance the scene by one frame.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.inputManager.tick(dt)
    this.tickMovement(dt)
    this.tickInteraction()
    this.fpsCamera.tick(dt)
  }

  /** Release GPU resources and event listeners. */
  dispose(): void {
    this.inputManager.dispose()
    this.fpsCamera.dispose()
    this.scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh ||
        child instanceof THREE.Points ||
        child instanceof THREE.LineSegments
      ) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        mats.forEach((m) => m.dispose())
      }
    })
  }

  // -------------------------------------------------------------------------
  // Private builders
  // -------------------------------------------------------------------------

  /** Build the cylinder shell: glass top half, metallic bottom half, end-caps, and girders. */
  private buildCylinder(): void {
    // Top half — transparent glass canopy
    const glassGeo = new THREE.CylinderGeometry(
      CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_LENGTH,
      CYLINDER_RADIAL_SEGMENTS, 1, true,
      Math.PI / 2, Math.PI,
    )
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: GLASS_COLOR,
      transparent: true,
      opacity: GLASS_OPACITY,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glass = new THREE.Mesh(glassGeo, glassMat)
    glass.rotation.x = Math.PI / 2
    glass.position.y = CYLINDER_RADIUS
    this.scene.add(glass)

    // Bottom half — opaque metallic hull
    const hullGeo = new THREE.CylinderGeometry(
      CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_LENGTH,
      CYLINDER_RADIAL_SEGMENTS, 1, true,
      -Math.PI / 2, Math.PI,
    )
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.5,
      roughness: 0.3,
      side: THREE.DoubleSide,
    })
    const hull = new THREE.Mesh(hullGeo, hullMat)
    hull.rotation.x = Math.PI / 2
    hull.position.y = CYLINDER_RADIUS
    this.scene.add(hull)

    // End-cap (back wall at negative Z)
    const capGeo = new THREE.CircleGeometry(CYLINDER_RADIUS, CYLINDER_RADIAL_SEGMENTS)
    const capMat = new THREE.MeshStandardMaterial({
      color: CAP_COLOR,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    // Back cap (tank side, -Z)
    const capBack = new THREE.Mesh(capGeo, capMat)
    capBack.position.set(0, CYLINDER_RADIUS, -CYLINDER_LENGTH / 2)
    this.scene.add(capBack)

    // Front cap (cockpit side, +Z)
    const capFront = new THREE.Mesh(capGeo.clone(), capMat.clone())
    capFront.position.set(0, CYLINDER_RADIUS, CYLINDER_LENGTH / 2)
    capFront.rotation.y = Math.PI
    this.scene.add(capFront)

    this.buildGirders()
  }

  /** Build full-circle wireframe girder rings inside the cylinder. */
  private buildGirders(): void {
    const verts: number[] = []
    // Slightly inside the glass shell
    const r = CYLINDER_RADIUS - GIRDER_INSET
    const halfLen = CYLINDER_LENGTH / 2

    // Horizontal full-circle arcs at each height step
    for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
      // In pre-rotation coords CylinderGeometry Y runs along the axis
      // After rotation.x = PI/2 the cylinder axis maps to world Z.
      // We build verts in world space directly.
      const z = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
      for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
        const a1 = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
        const a2 = ((s + 1) / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
        verts.push(
          Math.cos(a1) * r, CYLINDER_RADIUS + Math.sin(a1) * r, z,
          Math.cos(a2) * r, CYLINDER_RADIUS + Math.sin(a2) * r, z,
        )
      }
    }

    // Vertical bars along the length at each radial step
    for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
      const a = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI * 2
      const cx = Math.cos(a) * r
      const cy = CYLINDER_RADIUS + Math.sin(a) * r
      for (let h = 0; h < GIRDER_SEGMENTS_HEIGHT; h++) {
        const z1 = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        const z2 = -halfLen + ((h + 1) / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
        verts.push(cx, cy, z1, cx, cy, z2)
      }
    }

    const girderGeo = new THREE.BufferGeometry()
    girderGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    const girderMat = new THREE.LineBasicMaterial({ color: GIRDER_COLOR })
    const girder = new THREE.LineSegments(girderGeo, girderMat)
    this.scene.add(girder)
  }

  /** Set up interior lighting: warm point near bed, ambient fill, cool rim from cockpit end. */
  private buildLighting(): void {
    // Main light — centered over the bed area (+Z side)
    const point = new THREE.PointLight(0xffeedd, INTERIOR_LIGHT_INTENSITY, INTERIOR_LIGHT_RANGE)
    point.position.set(0, CYLINDER_RADIUS * 1.5, CYLINDER_LENGTH / 6)
    this.scene.add(point)

    const ambient = new THREE.AmbientLight(0x334466, AMBIENT_INTENSITY)
    this.scene.add(ambient)

    // Cool rim from the cockpit end — away from the table
    const directional = new THREE.DirectionalLight(0x6688cc, EXTERIOR_LIGHT_INTENSITY)
    directional.position.set(0, CYLINDER_RADIUS * 2, CYLINDER_LENGTH / 2)
    this.scene.add(directional)
  }

  /** Scatter stars on a large sphere, rejecting any that fall inside the cylinder. */
  private buildStarfield(): void {
    const verts: number[] = []
    const minDist = CYLINDER_RADIUS * 3
    for (let i = 0; i < STAR_COUNT; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const x = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta)
      const y = CYLINDER_RADIUS + STAR_SPHERE_RADIUS * Math.cos(phi)
      const z = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)
      // Skip stars too close to the cylinder center
      const distXY = Math.sqrt(x * x + (y - CYLINDER_RADIUS) * (y - CYLINDER_RADIUS))
      if (distXY < minDist && Math.abs(z) < CYLINDER_LENGTH) continue
      verts.push(x, y, z)
    }
    const positions = new Float32Array(verts)
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: STAR_POINT_SIZE,
      sizeAttenuation: true,
    })
    this.scene.add(new THREE.Points(starGeo, starMat))
  }

  /** Add a dark floor plane along the bottom of the cylinder. */
  private buildFloor(): void {
    const floorGeo = new THREE.PlaneGeometry(CYLINDER_RADIUS * FLOOR_WIDTH_FACTOR, CYLINDER_LENGTH)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2233,
      roughness: 0.9,
      metalness: 0.1,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = FLOOR_Y
    this.scene.add(floor)
  }

  // -------------------------------------------------------------------------
  // Private tick helpers
  // -------------------------------------------------------------------------

  /**
   * Process WASD input and move the player, with cylindrical collision clamping.
   *
   * @param dt - Delta time in seconds.
   */
  private tickMovement(dt: number): void {
    const forward = this.inputManager.isActionActive('moveForward')
    const back = this.inputManager.isActionActive('moveBack')
    const left = this.inputManager.isActionActive('moveLeft')
    const right = this.inputManager.isActionActive('moveRight')

    const fwd = this.fpsCamera.getForwardXZ()
    const rgt = this.fpsCamera.getRightXZ()

    let dx = 0
    let dz = 0

    if (forward) { dx += fwd.x; dz += fwd.y }
    if (back)    { dx -= fwd.x; dz -= fwd.y }
    if (left)    { dx -= rgt.x; dz -= rgt.y }
    if (right)   { dx += rgt.x; dz += rgt.y }

    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len > 0) {
      dx = (dx / len) * MOVE_SPEED * dt
      dz = (dz / len) * MOVE_SPEED * dt
    }

    this.player.position.x += dx
    this.player.position.z += dz

    // Cylindrical wall collision — clamp to axis-aligned bounding box
    // (cheaper than true cylinder check, good enough for narrow tube)
    const maxX = CYLINDER_RADIUS - COLLISION_MARGIN
    const maxZ = CYLINDER_LENGTH / 2 - COLLISION_MARGIN
    this.player.position.x = Math.max(-maxX, Math.min(maxX, this.player.position.x))
    this.player.position.z = Math.max(-maxZ, Math.min(maxZ, this.player.position.z))

    // Keep player glued to floor
    this.player.position.y = FLOOR_Y
  }

  /**
   * Check proximity to the table and fire prompt / interact callbacks.
   * Compares XZ distance only so the check works regardless of camera pitch.
   */
  private tickInteraction(): void {
    const px = this.player.position.x - this.tablePosition.x
    const pz = this.player.position.z - this.tablePosition.z
    const distXZ = Math.sqrt(px * px + pz * pz)

    if (distXZ < INTERACT_DISTANCE) {
      this.onPrompt?.('F  Shuttle Control')
      if (this.inputManager.wasActionPressed('interact')) {
        this.onInteract?.('table')
      }
    } else {
      this.onPrompt?.(null)
    }
  }
}
