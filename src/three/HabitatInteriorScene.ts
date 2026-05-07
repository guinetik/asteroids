/**
 * Self-contained Three.js scene for the walkable habitat interior.
 *
 * Handles cylinder geometry, lighting, starfield, furniture loading,
 * FPS movement, and table interaction. Designed to be swapped into an
 * EffectComposer renderPass by MapViewController.
 *
 * **Dev (`import.meta.env.DEV`):** LMB near the table grabs it (floats in front of the camera);
 * LMB again places it and logs world pose to the browser console.
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
import { FootstepSystem } from '@/lib/fps/footstepSystem'
import {
  CatController,
  type CatObstacle,
  type CatWanderBounds,
} from '@/three/CatController'

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
/**
 * Floor width as a multiple of the cylinder radius. With the canopy lowered to floor level
 * (axis at {@link FLOOR_Y}), the deck needs to span the full diameter so its edges meet the
 * curved walls instead of leaving a gap that exposes the curved hull underside.
 */
const FLOOR_WIDTH_FACTOR = 2
/** Vertical thickness of the deck (world units). Top sits at {@link FLOOR_Y}. */
const FLOOR_THICKNESS = 0.12
/**
 * Clearance between the table's pivot and the **front** (cockpit-side, +Z) end-cap of the
 * habitat cylinder, in world units. Picked from the dev grab tool output (LMB-place log)
 * so the prop sits flush against the cockpit wall without clipping the cap geometry.
 */
const TABLE_FRONT_CAP_CLEARANCE = 0.7526

/**
 * World X position the bed is shoved to so its long edge sits against the +X wall (the
 * player's left when facing the cockpit at spawn) instead of dominating the centre of the
 * cabin. The canopy curves inward as Y rises, so pushing the bed too far hits the arch —
 * +2.6 puts the bed's outer edge near X≈+3.6, which clears the half-cylinder ceiling at
 * bed height comfortably.
 */
const BED_X = 3.6

// --- Cockpit hatch (back cap, -Z) ------------------------------------------
// Submarine-style pressure hatch: a grey metallic ring frame around a white
// circular door, with a yellow wheel-knob (torus + crossed spokes) at the
// center. Geometry-only, no textures.

/** Radius of the white circular door disc (world units). */
const HATCH_DOOR_RADIUS = 1.0
/** Thickness of the door disc (world units). */
const HATCH_DOOR_THICKNESS = 0.06
/** Radial segment count for the door disc and frame. */
const HATCH_DOOR_SEGMENTS = 48
/** Radius from the centre of the frame torus to the centre of its tube. */
const HATCH_FRAME_RING_RADIUS = HATCH_DOOR_RADIUS + 0.12
/** Tube radius of the frame torus (world units). */
const HATCH_FRAME_TUBE_RADIUS = 0.12
/** Major radius of the wheel-knob torus (world units). */
const HATCH_KNOB_RING_RADIUS = 0.28
/** Tube radius of the wheel-knob torus (world units). */
const HATCH_KNOB_TUBE_RADIUS = 0.045
/** Length of each crossed spoke through the wheel-knob (world units). */
const HATCH_KNOB_SPOKE_LENGTH = HATCH_KNOB_RING_RADIUS * 2
/** Thickness (square cross-section) of each crossed spoke (world units). */
const HATCH_KNOB_SPOKE_THICKNESS = 0.045
/** Floor-relative Y of the hatch centre (world units). Roughly at eye height. */
const HATCH_CENTRE_Y = FLOOR_Y + 1.6
/** Offset from the back-cap surface so the door doesn't z-fight with the disc. */
const HATCH_DOOR_SURFACE_OFFSET = 0.05
/** Tiny offset that keeps the wheel-knob in front of the door panel (world units). */
const HATCH_KNOB_Z_BIAS = HATCH_DOOR_THICKNESS / 2 + 0.02
/** White circular door panel colour. */
const HATCH_DOOR_COLOR = 0xeaeaea
/** Grey metallic frame ring colour. */
const HATCH_FRAME_COLOR = 0x9aa3ad
/** Yellow wheel-knob colour. */
const HATCH_KNOB_COLOR = 0xf2c438
/**
 * Author-corrective rotation applied to the table model so the Sketchfab mesh reads the
 * right way up after import. The pre-centered GLB
 * (see `scripts/center-table-glb.mjs`) has its origin at the floor-center, so this
 * rotation now orbits the correct pivot.
 */
const TABLE_LAYOUT_ROT_X = Math.PI
/**
 * 180° yaw so the table's authored front faces back into the cabin (−Z) instead of into the
 * cockpit cap (+Z). Without this you spawn looking at the back panel.
 */
const TABLE_LAYOUT_ROT_Y = Math.PI
const TABLE_LAYOUT_ROT_Z = Math.PI
/**
 * How far in front of the camera (along its yaw forward, on the XZ plane) the table sits
 * while grabbed (dev tool, world units).
 */
const TABLE_DEBUG_HOLD_DISTANCE = 2.75
/**
 * Vertical offset relative to the camera eye while grabbed (world units, negative = below
 * the lens). Keeps the prop in frame instead of floating into the ceiling.
 */
const TABLE_DEBUG_HOLD_BELOW_EYE = 0.55
/**
 * Minimum clearance above {@link FLOOR_Y} for the hold position so the table never clips
 * through the floor when the player looks down.
 */
const TABLE_DEBUG_HOLD_MIN_ABOVE_FLOOR = 0.35
/**
 * Grab reach multiplier on {@link INTERACT_DISTANCE} — slightly forgiving so LMB grab works
 * from the same ring as F Shuttle Control.
 */
const TABLE_DEBUG_GRAB_REACH_MULT = 1.35

/** Rounds to 4 decimal places for devtools pose logs. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Compute the XZ footprint of a placed Object3D as an axis-aligned obstacle rectangle,
 * padded outward on every side. Used to feed the cat's pathing the live world-space
 * extents of furniture without hardcoding magic placement numbers.
 *
 * @param obj - The placed object (must already be in the scene graph for accurate bbox).
 * @param padding - World-units to expand the rectangle on each side.
 * @returns A {@link CatObstacle} rectangle in world XZ.
 */
function footprintFromObject(obj: THREE.Object3D, padding: number): CatObstacle {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  return {
    minX: box.min.x - padding,
    maxX: box.max.x + padding,
    minZ: box.min.z - padding,
    maxZ: box.max.z + padding,
  }
}

/**
 * Compile-time feature flag for the LMB grab/place tool used to author the table's resting
 * pose. The code path stays compiled in (re-enable by flipping this constant to `true` and
 * running a `bun dev` session); it's gated to `false` by default so dev builds don't expose
 * the dev-only LMB binding to playtesters.
 */
const TABLE_PLACEMENT_DEBUG_ENABLED = false

/**
 * Whether LMB grab/place for the habitat table is enabled.
 *
 * @returns The current value of {@link TABLE_PLACEMENT_DEBUG_ENABLED}.
 */
function isTablePlacementDebugEnabled(): boolean {
  return TABLE_PLACEMENT_DEBUG_ENABLED
}

/**
 * World-space rectangle Sushi (the habitat cat) is allowed to wander within.
 * Kept inside the cylinder collision envelope and clear of the table at +Z so
 * the cat doesn't path-find through furniture.
 */
const CAT_WANDER_BOUNDS: CatWanderBounds = {
  minX: -2.5,
  maxX: 2.5,
  minZ: -6,
  maxZ: 5,
  floorY: FLOOR_Y,
}

/** Path to the cat GLB asset (rigged Persian cat with idle/walk/sit/run clips). */
const CAT_MODEL_URL = '/models/cat.glb'

// --- Sushi feeding area (food bowl + water fountain) -----------------------
// Procedural geometry — no GLB needed. Sits beside the table at the +Z end so
// it reads as "the cat's corner" without crowding the bed or interaction zone.

/** World X of the food bowl (off-centre, port side of the cabin). */
const CAT_BOWL_X = -1.85
/** World X of the water fountain (next to the bowl). */
const CAT_FOUNTAIN_X = -2.25
/** Shared world Z of the feeding area — sits just shy of the +Z wall, beside the table. */
const CAT_FEEDING_Z = 7.2
/** Outer radius of the ceramic food bowl (world units). */
const CAT_BOWL_RADIUS = 0.14
/** Total height of the food bowl (world units). */
const CAT_BOWL_HEIGHT = 0.05
/** Outer radius of the water fountain base (world units). */
const CAT_FOUNTAIN_RADIUS = 0.13
/** Total height of the water fountain (base cylinder + top dish), world units. */
const CAT_FOUNTAIN_HEIGHT = 0.2

/**
 * Padding (world units) added to each side of every furniture obstacle handed to the cat.
 * Slightly larger than the cat's body radius so paths skirt furniture instead of clipping
 * through corners.
 */
const CAT_OBSTACLE_PADDING = 0.35

/** Distance (XZ, world units) the player ends up in front of Sushi during a pet. */
const PET_APPROACH_DISTANCE = 0.1
/** XZ proximity (world units) at which the "Pet Sushi" prompt appears. */
const PET_PROMPT_DISTANCE = 1.0
/** XZ distance beyond which a sitting Sushi gets up and resumes wandering. */
const PET_SIT_CANCEL_DISTANCE = 3.0
/** Total seconds the pet glide-to-front animation lasts. */
const PET_APPROACH_DURATION_S = 0.55
/** Lerp factor (per second) for camera tracking onto Sushi during the pet sequence. */
const PET_CAMERA_TURN_RATE = 8

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

  /**
   * Cached spawn yaw for {@link getSpawnPosition}. `Math.PI` so the player wakes up facing
   * the **table** (+Z, cockpit-side cap) rather than the cockpit hatch (−Z, back cap). At
   * yaw=0 the FPS forward is (0, 0, -1); flipping by π puts forward at (0, 0, +1) toward
   * the table.
   */
  private spawnYaw = Math.PI

  /** Footstep audio for the flat habitat floor. */
  private readonly footsteps = new FootstepSystem('habitat')

  /** Loaded table root — moved when using the dev grab/place tool. */
  private tableRoot: THREE.Object3D | null = null

  /**
   * Sushi the cat — roams the cabin once {@link load} resolves. Kept as a tribute
   * to the author's cat (R.I.P. 2026); load failures are non-fatal so the rest of
   * the habitat still works without the model.
   */
  private cat: CatController | null = null

  /** When true, table follows the camera until the next LMB releases it. */
  private tablePlacementGrabbed = false

  private readonly _tmpWorldPos = new THREE.Vector3()
  private readonly _tmpWorldQuat = new THREE.Quaternion()
  private readonly _tmpEuler = new THREE.Euler()

  /** True while the player is being glided into petting position in front of Sushi. */
  private petSequenceActive = false
  /** Seconds elapsed in the current pet glide-to-front sequence. */
  private petSequenceTime = 0
  /** XZ start of the pet glide; Y reused as floor. */
  private readonly _petStartXZ = new THREE.Vector2()
  /** XZ end of the pet glide — a point in front of Sushi. */
  private readonly _petTargetXZ = new THREE.Vector2()

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
    this.buildCockpitHatch()
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
   * Primary mouse button while pointer-locked. In dev, grab/release the table for manual pose
   * tuning: first LMB near the table attaches it in front of the view; second LMB places it
   * and logs world {@link THREE.Vector3 | position} + {@link THREE.Quaternion | quaternion}
   * to the browser console.
   */
  onPrimaryClick(): void {
    if (!isTablePlacementDebugEnabled() || !this.tableRoot) return
    if (this.tablePlacementGrabbed) {
      this.commitTablePlacementFromDebug()
      return
    }
    const px = this.player.position.x - this.tablePosition.x
    const pz = this.player.position.z - this.tablePosition.z
    const distXZ = Math.hypot(px, pz)
    if (distXZ < INTERACT_DISTANCE * TABLE_DEBUG_GRAB_REACH_MULT) {
      this.tablePlacementGrabbed = true
      this.onPrompt?.('LMB place table → devtools console')
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

    // Re-centre after scale + rotation, then shove against the −X wall.
    bedBox.setFromObject(bedModel)
    const bedCenter = bedBox.getCenter(new THREE.Vector3())
    bedModel.position.sub(bedCenter)
    bedModel.position.x += BED_X

    // Drop to floor
    bedBox.setFromObject(bedModel)
    const bedMin = bedBox.min.y
    bedModel.position.y -= bedMin - FLOOR_Y

    this.scene.add(bedModel)

    // --- Table --------------------------------------------------------------
    // The GLB ships with its origin at the floor-center thanks to
    // `scripts/center-table-glb.mjs` (runs `@gltf-transform/functions`'s
    // `center({ pivot: 'below' })`). That means we only need scale + author
    // rotation + final XZ placement; no runtime re-centering needed.
    const tableBox = new THREE.Box3().setFromObject(tableModel)
    const tableSize = tableBox.getSize(new THREE.Vector3())
    const tableMaxDim = Math.max(tableSize.x, tableSize.y, tableSize.z)
    const TABLE_TARGET_SIZE = 3.5
    tableModel.scale.setScalar(TABLE_TARGET_SIZE / tableMaxDim)
    tableModel.rotation.set(TABLE_LAYOUT_ROT_X, TABLE_LAYOUT_ROT_Y, TABLE_LAYOUT_ROT_Z)

    const TABLE_Z = CYLINDER_LENGTH / 2 - TABLE_FRONT_CAP_CLEARANCE
    tableModel.position.set(0, FLOOR_Y, TABLE_Z)

    // Defensive drop-to-floor in case the layout rotation flipped Y past zero.
    tableBox.setFromObject(tableModel)
    if (tableBox.min.y < FLOOR_Y) {
      tableModel.position.y -= tableBox.min.y - FLOOR_Y
    }

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
    this.tableRoot = tableModel
    tableModel.updateMatrixWorld(true)
    new THREE.Box3().setFromObject(tableModel).getCenter(this.tablePosition)
    this.tablePosition.y = FLOOR_Y

    // --- Sushi's feeding area ----------------------------------------------
    const feedingArea = this.buildCatFeedingArea()
    this.scene.add(feedingArea)

    // --- Sushi (habitat cat) -----------------------------------------------
    // Tribute NPC. Loaded best-effort: a load failure should not break the
    // rest of the habitat scene, so we swallow the error and log it instead.
    // Obstacle rectangles are computed from the *current* world bbox of each
    // piece of furniture so the avoidance follows the actual placement, not
    // hardcoded numbers that would drift if layout constants change.
    const obstacles: CatObstacle[] = [
      footprintFromObject(bedModel, CAT_OBSTACLE_PADDING),
      footprintFromObject(tableModel, CAT_OBSTACLE_PADDING),
      footprintFromObject(feedingArea, CAT_OBSTACLE_PADDING),
    ]
    try {
      this.cat = await CatController.create(CAT_MODEL_URL, {
        ...CAT_WANDER_BOUNDS,
        obstacles,
      })
      this.scene.add(this.cat.group)
      // Hearts emit in world space — add as a sibling so they stay where spawned
      // even if Sushi walks off mid-burst.
      this.scene.add(this.cat.hearts)
    } catch (err) {
      console.warn('[HabitatInteriorScene] failed to load cat model:', err)
    }
  }

  /**
   * Advance the scene by one frame.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.inputManager.tick(dt)
    if (!this.tickPetSequence(dt)) {
      this.tickMovement(dt)
    }
    this.tickInteraction()
    this.fpsCamera.tick(dt)
    this.tickTablePlacementHold()
    this.cat?.tick(dt)
  }

  /** Release GPU resources and event listeners. */
  dispose(): void {
    this.inputManager.dispose()
    this.fpsCamera.dispose()
    this.cat?.dispose()
    this.cat = null
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

  /**
   * Build the cabin shell: a half-cylinder glass canopy whose base sits exactly on the
   * deck floor, plus matching half-disc end-caps. The cylinder axis is at world Y=0
   * (the floor plane) so the visible geometry is a tunnel cross-section — flat deck
   * underfoot, glass arch overhead — instead of a full cylinder where the bottom curve
   * dips below the floor.
   */
  private buildCylinder(): void {
    // Half-cylinder canopy spanning the upper semicircle (Y >= 0).
    const glassGeo = new THREE.CylinderGeometry(
      CYLINDER_RADIUS,
      CYLINDER_RADIUS,
      CYLINDER_LENGTH,
      CYLINDER_RADIAL_SEGMENTS,
      1,
      true,
      Math.PI / 2,
      Math.PI,
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
    glass.position.y = FLOOR_Y
    this.scene.add(glass)

    // Half-disc end caps (D-shape, flat side resting on the deck).
    const capShape = new THREE.Shape()
    capShape.moveTo(-CYLINDER_RADIUS, 0)
    capShape.absarc(0, 0, CYLINDER_RADIUS, Math.PI, 0, true)
    capShape.lineTo(-CYLINDER_RADIUS, 0)
    const capGeo = new THREE.ShapeGeometry(capShape, CYLINDER_RADIAL_SEGMENTS)
    const capMat = new THREE.MeshStandardMaterial({
      color: CAP_COLOR,
      metalness: 0.6,
      roughness: 0.4,
      side: THREE.DoubleSide,
    })
    const capBack = new THREE.Mesh(capGeo, capMat)
    capBack.position.set(0, FLOOR_Y, -CYLINDER_LENGTH / 2)
    this.scene.add(capBack)

    const capFront = new THREE.Mesh(capGeo.clone(), capMat.clone())
    capFront.position.set(0, FLOOR_Y, CYLINDER_LENGTH / 2)
    capFront.rotation.y = Math.PI
    this.scene.add(capFront)

    this.buildGirders()
  }

  /**
   * Build wireframe girder rings inside the **upper** half of the cylinder only.
   *
   * The girders frame the glass canopy on top. Drawing them full-circle (the original
   * implementation) sweeps lines across the floor — visible as bright X marks on the
   * deck from any low camera angle (and from a wandering cat's eye view). Restricting
   * the radial range to the top semicircle (0…π) keeps the structural look without
   * crawling lines on the floor.
   */
  private buildGirders(): void {
    const verts: number[] = []
    // Slightly inside the glass shell
    const r = CYLINDER_RADIUS - GIRDER_INSET
    const halfLen = CYLINDER_LENGTH / 2

    // Horizontal half-circle arcs at each height step (top half only)
    for (let h = 0; h <= GIRDER_SEGMENTS_HEIGHT; h++) {
      // In pre-rotation coords CylinderGeometry Y runs along the axis
      // After rotation.x = PI/2 the cylinder axis maps to world Z.
      // We build verts in world space directly.
      const z = -halfLen + (h / GIRDER_SEGMENTS_HEIGHT) * CYLINDER_LENGTH
      for (let s = 0; s < GIRDER_SEGMENTS_RADIAL; s++) {
        const a1 = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
        const a2 = ((s + 1) / GIRDER_SEGMENTS_RADIAL) * Math.PI
        verts.push(
          Math.cos(a1) * r,
          FLOOR_Y + Math.sin(a1) * r,
          z,
          Math.cos(a2) * r,
          FLOOR_Y + Math.sin(a2) * r,
          z,
        )
      }
    }

    // Vertical bars along the length at each radial step (top half only)
    for (let s = 0; s <= GIRDER_SEGMENTS_RADIAL; s++) {
      const a = (s / GIRDER_SEGMENTS_RADIAL) * Math.PI
      const cx = Math.cos(a) * r
      const cy = FLOOR_Y + Math.sin(a) * r
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

  /**
   * Build a submarine-style pressure hatch on the **back** end-cap (−Z): grey metallic
   * frame ring, white circular door, yellow wheel-knob with crossed spokes. Geometry
   * only — no textures, no animation — purely a visual hint that the back wall is the
   * way to the cockpit.
   *
   * Everything is parented to a single group so XZ position is centralised. The group's
   * local +Z faces back into the cabin, matching the back cap which sits at z = −L/2.
   */
  private buildCockpitHatch(): void {
    const capZ = -CYLINDER_LENGTH / 2
    const hatch = new THREE.Group()
    hatch.name = 'habitatCockpitHatch'
    hatch.position.set(0, HATCH_CENTRE_Y, capZ + HATCH_DOOR_SURFACE_OFFSET)

    // Door — flat white disc made from a low cylinder (Y axis), rotated so its
    // circular faces look down ±Z.
    const doorMat = new THREE.MeshStandardMaterial({
      color: HATCH_DOOR_COLOR,
      metalness: 0.18,
      roughness: 0.55,
    })
    const doorGeo = new THREE.CylinderGeometry(
      HATCH_DOOR_RADIUS,
      HATCH_DOOR_RADIUS,
      HATCH_DOOR_THICKNESS,
      HATCH_DOOR_SEGMENTS,
    )
    const door = new THREE.Mesh(doorGeo, doorMat)
    door.name = 'habitatCockpitHatchDoor'
    door.rotation.x = Math.PI / 2
    hatch.add(door)

    // Frame — torus around the door. Default torus lies in the XY plane (axis
    // along Z), which is exactly the orientation we want against the back cap.
    const frameMat = new THREE.MeshStandardMaterial({
      color: HATCH_FRAME_COLOR,
      metalness: 0.7,
      roughness: 0.4,
    })
    const frameGeo = new THREE.TorusGeometry(
      HATCH_FRAME_RING_RADIUS,
      HATCH_FRAME_TUBE_RADIUS,
      16,
      HATCH_DOOR_SEGMENTS,
    )
    const frame = new THREE.Mesh(frameGeo, frameMat)
    frame.name = 'habitatCockpitHatchFrame'
    hatch.add(frame)

    // Wheel-knob — small torus + two crossed spoke bars at the door centre.
    const knobMat = new THREE.MeshStandardMaterial({
      color: HATCH_KNOB_COLOR,
      metalness: 0.45,
      roughness: 0.45,
    })
    const knobRingGeo = new THREE.TorusGeometry(
      HATCH_KNOB_RING_RADIUS,
      HATCH_KNOB_TUBE_RADIUS,
      12,
      HATCH_DOOR_SEGMENTS,
    )
    const knobRing = new THREE.Mesh(knobRingGeo, knobMat)
    knobRing.position.z = HATCH_KNOB_Z_BIAS
    hatch.add(knobRing)

    const horizontalSpokeGeo = new THREE.BoxGeometry(
      HATCH_KNOB_SPOKE_LENGTH,
      HATCH_KNOB_SPOKE_THICKNESS,
      HATCH_KNOB_SPOKE_THICKNESS,
    )
    const verticalSpokeGeo = new THREE.BoxGeometry(
      HATCH_KNOB_SPOKE_THICKNESS,
      HATCH_KNOB_SPOKE_LENGTH,
      HATCH_KNOB_SPOKE_THICKNESS,
    )
    const horizontalSpoke = new THREE.Mesh(horizontalSpokeGeo, knobMat)
    const verticalSpoke = new THREE.Mesh(verticalSpokeGeo, knobMat)
    horizontalSpoke.position.z = HATCH_KNOB_Z_BIAS
    verticalSpoke.position.z = HATCH_KNOB_Z_BIAS
    hatch.add(horizontalSpoke, verticalSpoke)

    this.scene.add(hatch)
  }

  /** Set up interior lighting: warm point near bed, ambient fill, cool rim from cockpit end. */
  private buildLighting(): void {
    // Main light — centered over the bed area (+Z side)
    const point = new THREE.PointLight(0xffeedd, INTERIOR_LIGHT_INTENSITY, INTERIOR_LIGHT_RANGE)
    point.position.set(0, CYLINDER_RADIUS * 0.7, CYLINDER_LENGTH / 6)
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
      const y = FLOOR_Y + STAR_SPHERE_RADIUS * Math.cos(phi)
      const z = STAR_SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta)
      // Skip stars too close to the cabin centre (now at floor level).
      const distXY = Math.sqrt(x * x + (y - FLOOR_Y) * (y - FLOOR_Y))
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

  /**
   * Build Sushi's feeding corner: a ceramic food bowl with a small mound of kibble next to
   * a small chrome water fountain with a translucent water disc on top. Pure procedural
   * geometry — no GLB asset — so the tribute is self-contained. Returns the parent group
   * so the caller can compute its world bbox for the cat's obstacle list.
   *
   * @returns The feeding-area group, already positioned at floor level.
   */
  private buildCatFeedingArea(): THREE.Group {
    const group = new THREE.Group()
    group.name = 'sushiFeedingArea'

    // --- Food bowl: ceramic dish + brown kibble disc ------------------------
    const bowlMat = new THREE.MeshStandardMaterial({
      color: 0xeae3d2,
      roughness: 0.55,
      metalness: 0.05,
    })
    const bowl = new THREE.Mesh(
      // Slightly tapered cylinder so the rim is wider than the foot — reads as a dish.
      new THREE.CylinderGeometry(CAT_BOWL_RADIUS, CAT_BOWL_RADIUS * 0.85, CAT_BOWL_HEIGHT, 24),
      bowlMat,
    )
    bowl.position.set(CAT_BOWL_X, FLOOR_Y + CAT_BOWL_HEIGHT / 2, CAT_FEEDING_Z)
    group.add(bowl)

    const kibbleMat = new THREE.MeshStandardMaterial({
      color: 0x8b5a2b,
      roughness: 0.95,
      metalness: 0,
    })
    const kibble = new THREE.Mesh(
      new THREE.CylinderGeometry(CAT_BOWL_RADIUS * 0.8, CAT_BOWL_RADIUS * 0.65, 0.018, 20),
      kibbleMat,
    )
    kibble.position.set(CAT_BOWL_X, FLOOR_Y + CAT_BOWL_HEIGHT + 0.005, CAT_FEEDING_Z)
    group.add(kibble)

    // --- Water fountain: chrome base + dish + translucent water disc --------
    const fountainMat = new THREE.MeshStandardMaterial({
      color: 0xc9d2da,
      roughness: 0.35,
      metalness: 0.7,
    })
    const fountainBaseHeight = CAT_FOUNTAIN_HEIGHT * 0.85
    const fountainBase = new THREE.Mesh(
      new THREE.CylinderGeometry(
        CAT_FOUNTAIN_RADIUS,
        CAT_FOUNTAIN_RADIUS,
        fountainBaseHeight,
        24,
      ),
      fountainMat,
    )
    fountainBase.position.set(
      CAT_FOUNTAIN_X,
      FLOOR_Y + fountainBaseHeight / 2,
      CAT_FEEDING_Z,
    )
    group.add(fountainBase)

    // Lip at the top — torus reads as the rim of the drinking dish.
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(CAT_FOUNTAIN_RADIUS * 0.85, 0.018, 8, 24),
      fountainMat,
    )
    lip.rotation.x = Math.PI / 2
    lip.position.set(CAT_FOUNTAIN_X, FLOOR_Y + fountainBaseHeight, CAT_FEEDING_Z)
    group.add(lip)

    // Water surface — translucent blue disc just below the lip line.
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a90c2,
      transparent: true,
      opacity: 0.7,
      roughness: 0.05,
      metalness: 0,
    })
    const water = new THREE.Mesh(new THREE.CircleGeometry(CAT_FOUNTAIN_RADIUS * 0.82, 24), waterMat)
    water.rotation.x = -Math.PI / 2
    water.position.set(
      CAT_FOUNTAIN_X,
      FLOOR_Y + fountainBaseHeight - 0.005,
      CAT_FEEDING_Z,
    )
    group.add(water)

    return group
  }

  /**
   * Add a flat deck floor running the length of the cylinder. Modelled as a thin box
   * (rather than a single-sided plane) so it reads as a solid surface from grazing
   * angles and props/NPCs cannot peek through the underside when their bbox dips a
   * few millimetres on an animation frame.
   */
  private buildFloor(): void {
    const floorWidth = CYLINDER_RADIUS * FLOOR_WIDTH_FACTOR
    const floorGeo = new THREE.BoxGeometry(floorWidth, FLOOR_THICKNESS, CYLINDER_LENGTH)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xdadbd8,
      roughness: 0.4,
      metalness: 0.85,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    // Top face flush with FLOOR_Y so all walking math (player + NPCs) stays unchanged.
    floor.position.y = FLOOR_Y - FLOOR_THICKNESS / 2
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

    if (forward) {
      dx += fwd.x
      dz += fwd.y
    }
    if (back) {
      dx -= fwd.x
      dz -= fwd.y
    }
    if (left) {
      dx -= rgt.x
      dz -= rgt.y
    }
    if (right) {
      dx += rgt.x
      dz += rgt.y
    }

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

    // Footsteps — always grounded on the flat habitat floor
    this.footsteps.update(dt, len > 0, true)
  }

  /**
   * Check proximity to nearby interactables (cat, then table) and fire prompt /
   * interact callbacks. Cat takes priority when the player is in petting range so a
   * cat napping next to the table doesn't get hidden behind the Shuttle Control
   * prompt. Compares XZ distance only so the check works regardless of camera pitch.
   */
  /**
   * Begin a short scripted glide that takes the player into petting position —
   * standing just in front of Sushi, facing him. WASD input is ignored while the
   * sequence is active; both the body slide and the camera turn are handled by
   * {@link tickPetSequence}.
   *
   * The target XZ is `cat.position + APPROACH_DISTANCE * catForward`, where the
   * cat's forward vector matches the same `(sin(yaw), cos(yaw))` convention used
   * inside {@link CatController.tickWalk}. The point is clamped into the cabin
   * envelope so a cat sitting against a wall doesn't push the player through it.
   */
  private startPetSequence(): void {
    if (!this.cat) return
    const catYaw = this.cat.group.rotation.y
    const fx = Math.sin(catYaw)
    const fz = Math.cos(catYaw)
    let tx = this.cat.group.position.x + fx * PET_APPROACH_DISTANCE
    let tz = this.cat.group.position.z + fz * PET_APPROACH_DISTANCE
    const maxX = CYLINDER_RADIUS - COLLISION_MARGIN
    const maxZ = CYLINDER_LENGTH / 2 - COLLISION_MARGIN
    tx = Math.max(-maxX, Math.min(maxX, tx))
    tz = Math.max(-maxZ, Math.min(maxZ, tz))
    this._petStartXZ.set(this.player.position.x, this.player.position.z)
    this._petTargetXZ.set(tx, tz)
    this.petSequenceActive = true
    this.petSequenceTime = 0
    // Tell Sushi to swivel toward where the player will end up so they meet
    // eyes through the glide. Y is the player's eye height so the head-tilt
    // override actually angles his face upward at us, not at the floor.
    this._tmpWorldPos.set(tx, FLOOR_Y + HABITAT_EYE_HEIGHT, tz)
    this.cat.lookAt(this._tmpWorldPos)
  }

  /**
   * Advance the pet glide-to-front sequence. Eases the player from its starting
   * XZ to the target spot in front of Sushi, while the camera continually lerps
   * its yaw/pitch toward Sushi's head. Returns true while the sequence owns the
   * player, telling {@link tick} to skip the normal movement step.
   *
   * @param dt - Delta time in seconds.
   * @returns Whether the sequence consumed control this frame.
   */
  private tickPetSequence(dt: number): boolean {
    if (!this.petSequenceActive) return false
    if (!this.cat) {
      this.petSequenceActive = false
      return false
    }
    // Keep Sushi's face target locked on the petter's head throughout the sequence
    // so he tracks them rather than the static glide endpoint. Use the player body
    // + fixed eye height (NOT camera.position) — the camera Y wobbles with the
    // walk-bob, and feeding that into atan2 turns Sushi's head into a horror-movie
    // up-down jitter at this short range.
    this._tmpWorldPos.set(
      this.player.position.x,
      this.player.position.y + HABITAT_EYE_HEIGHT,
      this.player.position.z,
    )
    this.cat.lookAt(this._tmpWorldPos)
    this.petSequenceTime += dt
    const t = Math.min(1, this.petSequenceTime / PET_APPROACH_DURATION_S)
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
    this.player.position.x = this._petStartXZ.x + (this._petTargetXZ.x - this._petStartXZ.x) * e
    this.player.position.z = this._petStartXZ.y + (this._petTargetXZ.y - this._petStartXZ.y) * e
    this.player.position.y = FLOOR_Y

    // Camera tracks Sushi: lerp yaw/pitch toward the head point each frame.
    this.cat.getLookAtPoint(this._tmpWorldPos)
    const cam = this.fpsCamera.camera
    const dx = this._tmpWorldPos.x - cam.position.x
    const dy = this._tmpWorldPos.y - cam.position.y
    const dz = this._tmpWorldPos.z - cam.position.z
    const horiz = Math.hypot(dx, dz)
    if (horiz > 1e-4) {
      const desiredYaw = Math.atan2(-dx, -dz)
      const desiredPitch = Math.atan2(dy, horiz)
      const k = Math.min(1, PET_CAMERA_TURN_RATE * dt)
      let yawErr = desiredYaw - this.fpsCamera.yaw
      while (yawErr > Math.PI) yawErr -= Math.PI * 2
      while (yawErr < -Math.PI) yawErr += Math.PI * 2
      this.fpsCamera.yaw += yawErr * k
      this.fpsCamera.pitch += (desiredPitch - this.fpsCamera.pitch) * k
      const clamp = HABITAT_PITCH_CLAMP
      this.fpsCamera.pitch = Math.max(-clamp, Math.min(clamp, this.fpsCamera.pitch))
    }

    if (t >= 1) this.petSequenceActive = false
    return true
  }

  private tickInteraction(): void {
    if (this.tablePlacementGrabbed) {
      this.onPrompt?.('LMB place table → devtools console')
      return
    }

    // --- Cat (pet) — takes priority when in range ---------------------------
    if (this.cat) {
      const cx = this.player.position.x - this.cat.group.position.x
      const cz = this.player.position.z - this.cat.group.position.z
      const distCat = Math.hypot(cx, cz)
      // If Sushi is sitting (post-pet) and the player has wandered off, end the
      // sit so he doesn't stay parked staring at empty air — he'll pick a new
      // waypoint and resume his normal roam.
      if (
        !this.petSequenceActive &&
        this.cat.isSitting &&
        distCat > PET_SIT_CANCEL_DISTANCE
      ) {
        this.cat.endSit()
      }
      if (distCat < PET_PROMPT_DISTANCE) {
        this.onPrompt?.('F  Pet Sushi')
        if (this.inputManager.wasActionPressed('interact')) {
          this.cat.pet()
          this.startPetSequence()
          this.onInteract?.('cat')
        }
        return
      }
    }

    // --- Table -------------------------------------------------------------
    const px = this.player.position.x - this.tablePosition.x
    const pz = this.player.position.z - this.tablePosition.z
    const distXZ = Math.hypot(px, pz)
    const near = distXZ < INTERACT_DISTANCE * TABLE_DEBUG_GRAB_REACH_MULT

    if (distXZ < INTERACT_DISTANCE) {
      this.onPrompt?.(
        isTablePlacementDebugEnabled()
          ? 'LMB grab table (dev)  ·  F  Shuttle Control'
          : 'F  Shuttle Control',
      )
      if (this.inputManager.wasActionPressed('interact')) {
        this.onInteract?.('table')
      }
    } else if (near && isTablePlacementDebugEnabled()) {
      this.onPrompt?.('LMB grab table (dev, closer)')
    } else {
      this.onPrompt?.(null)
    }
  }

  /**
   * While grabbed, write the table's **world** transform directly each frame, keeping it as a
   * direct child of {@link scene}. The FPS camera is intentionally **not** part of the scene
   * graph (only {@link FpsCamera.tick} sets its pose), so reparenting the table to the camera
   * removes it from the rendered hierarchy entirely — the previous attempt did exactly that
   * which is why the model "disappeared" the instant it was grabbed.
   *
   * Forward direction comes from {@link FpsCamera.yaw} (no pitch) so looking up/down does not
   * lift or sink the prop. Y is anchored to the camera eye minus a small offset and clamped
   * above the floor so it never clips when the player looks straight down.
   */
  private tickTablePlacementHold(): void {
    if (!this.tablePlacementGrabbed || !this.tableRoot) return
    const cam = this.fpsCamera.camera
    const yaw = this.fpsCamera.yaw
    const fwdX = -Math.sin(yaw)
    const fwdZ = -Math.cos(yaw)
    const eyeY = cam.position.y
    this.tableRoot.position.set(
      cam.position.x + fwdX * TABLE_DEBUG_HOLD_DISTANCE,
      Math.max(FLOOR_Y + TABLE_DEBUG_HOLD_MIN_ABOVE_FLOOR, eyeY - TABLE_DEBUG_HOLD_BELOW_EYE),
      cam.position.z + fwdZ * TABLE_DEBUG_HOLD_DISTANCE,
    )
    this.tableRoot.rotation.set(TABLE_LAYOUT_ROT_X, yaw, TABLE_LAYOUT_ROT_Z)
  }

  /**
   * Drop the table back onto the floor at its current XZ + yaw and log the resulting world
   * pose for pasting into {@link load}. We deliberately overwrite the held Y so the released
   * table never floats — `tickTablePlacementHold` parks it at eye-height while grabbed for
   * visibility, but the placement workflow always wants it sitting on the deck.
   */
  private commitTablePlacementFromDebug(): void {
    const root = this.tableRoot
    if (!root) return
    this.tablePlacementGrabbed = false

    // Snap to floor: keep XZ + rotation, then offset Y so the post-rotation bbox.min sits at
    // FLOOR_Y. Mirrors the `load()` defensive drop-to-floor step.
    root.position.y = FLOOR_Y
    root.updateMatrixWorld(true)
    const grounded = new THREE.Box3().setFromObject(root)
    if (grounded.min.y !== FLOOR_Y) {
      root.position.y -= grounded.min.y - FLOOR_Y
      root.updateMatrixWorld(true)
    }

    root.getWorldPosition(this._tmpWorldPos)
    root.getWorldQuaternion(this._tmpWorldQuat)
    this._tmpEuler.setFromQuaternion(this._tmpWorldQuat, 'YXZ')
    const wp = this._tmpWorldPos
    const wq = this._tmpWorldQuat
    const e = this._tmpEuler
    const payload = {
      position: { x: round4(wp.x), y: round4(wp.y), z: round4(wp.z) },
      rotationYXZ: {
        x: round4(e.x),
        y: round4(e.y),
        z: round4(e.z),
        order: e.order,
      },
      quaternion: {
        x: round4(wq.x),
        y: round4(wq.y),
        z: round4(wq.z),
        w: round4(wq.w),
      },
      snippet: `tableModel.position.set(${round4(wp.x)}, ${round4(wp.y)}, ${round4(wp.z)})\ntableModel.quaternion.set(${round4(wq.x)}, ${round4(wq.y)}, ${round4(wq.z)}, ${round4(wq.w)})`,
    }
    console.log('[HabitatInteriorScene] Table world pose (paste into load() after layout):')
    console.log(JSON.stringify(payload, null, 2))
    this.tablePosition.set(wp.x, FLOOR_Y, wp.z)
  }
}