/**
 * Procedural animated lava lamp prop for the habitat bedroom.
 *
 * Owns its Three.js geometry, materials, placement offsets, animation state,
 * and GPU cleanup so the habitat scene only consumes it as a small model.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
import * as THREE from 'three'

/** Small lift above the bed bbox top so the lamp base does not z-fight the rail. */
const LAVA_LAMP_BED_TOP_CLEARANCE = -0.035
/** Local X offset from the bed bbox center toward the locker-side headboard rail. */
const LAVA_LAMP_BED_OFFSET_X = 0.80
/** Local Z offset from the bed bbox center toward the locker-side headboard rail. */
const LAVA_LAMP_BED_OFFSET_Z = 0.45
/** Overall scale for the procedural lava lamp prop. */
const LAVA_LAMP_SCALE = 0.72
/** Radius of the lamp's metal base. */
const LAVA_LAMP_BASE_RADIUS = 0.13
/** Height of the lamp's metal base. */
const LAVA_LAMP_BASE_HEIGHT = 0.09
/** Radius of the lamp's metal cap. */
const LAVA_LAMP_CAP_RADIUS = 0.13
/** Height of the lamp's metal cap. */
const LAVA_LAMP_CAP_HEIGHT = 0.13
/** Small rounded nose radius at the top of the cone-like cap. */
const LAVA_LAMP_CAP_NOSE_RADIUS = 0.018
/** Height of the glass/liquid chamber between base and cap. */
const LAVA_LAMP_GLASS_HEIGHT = 0.52
/** Number of radial segments for round lamp geometry. */
const LAVA_LAMP_RADIAL_SEGMENTS = 32
/** Number of lathe segments used for the curvy glass chamber. */
const LAVA_LAMP_LATHE_SEGMENTS = 40
/** Glass shell tint. */
const LAVA_LAMP_GLASS_COLOR = 0xffd0e8
/** Glass shell opacity. */
const LAVA_LAMP_GLASS_OPACITY = 0.28
/** Lamp metal base/cap color. */
const LAVA_LAMP_METAL_COLOR = 0x10151c
/** Emissive liquid color. */
const LAVA_LAMP_LIQUID_COLOR = 0xff3f88
/** Secondary blob color used to make the motion read like hot wax. */
const LAVA_LAMP_HOT_BLOB_COLOR = 0xffb347
/** Core liquid opacity inside the glass chamber. */
const LAVA_LAMP_LIQUID_OPACITY = 0.42
/** Local Y of the bottom of the glass chamber above the group origin. */
const LAVA_LAMP_GLASS_BOTTOM_Y = LAVA_LAMP_BASE_HEIGHT
/** Local Y of the top of the glass chamber above the group origin. */
const LAVA_LAMP_GLASS_TOP_Y = LAVA_LAMP_GLASS_BOTTOM_Y + LAVA_LAMP_GLASS_HEIGHT
/** Blob count inside the lamp chamber. */
const LAVA_LAMP_BLOB_COUNT = 5
/** Base radius for animated lava blobs. */
const LAVA_LAMP_BLOB_RADIUS = 0.038
/** Amount each blob rises/falls inside the chamber. */
const LAVA_LAMP_BLOB_VERTICAL_DRIFT = 0.11
/** Amount each blob sways horizontally while drifting. */
const LAVA_LAMP_BLOB_HORIZONTAL_DRIFT = 0.024
/** Minimum local Y for moving blobs. */
const LAVA_LAMP_BLOB_MIN_Y = LAVA_LAMP_GLASS_BOTTOM_Y + 0.1
/** Range added to {@link LAVA_LAMP_BLOB_MIN_Y} for blob centre placement. */
const LAVA_LAMP_BLOB_Y_RANGE = LAVA_LAMP_GLASS_HEIGHT - 0.28
/** Local Y position for the small molten pool at the lamp base. */
const LAVA_LAMP_POOL_Y = LAVA_LAMP_GLASS_BOTTOM_Y + 0.035
/** Local Y position for the warm point light inside the lamp. */
const LAVA_LAMP_LIGHT_Y = LAVA_LAMP_GLASS_BOTTOM_Y + LAVA_LAMP_GLASS_HEIGHT * 0.5
/** Intensity of the lava lamp's local point light. */
const LAVA_LAMP_LIGHT_INTENSITY = 0.7
/** Range of the lava lamp's local point light. */
const LAVA_LAMP_LIGHT_RANGE = 1.45
/** Motion phase multiplier applied per lava blob index. */
const LAVA_LAMP_BLOB_PHASE_STEP = 1.37
/** Base animation speed for the lamp's first lava blob. */
const LAVA_LAMP_BLOB_BASE_SPEED = 0.85
/** Per-index speed increment for lava blobs. */
const LAVA_LAMP_BLOB_SPEED_STEP = 0.17
/** Multiplier for the subtle lamp glow pulse. */
const LAVA_LAMP_LIGHT_PULSE_AMOUNT = 0.18
/** Radius of the pooled lava disc near the bottom of the lamp. */
const LAVA_LAMP_POOL_RADIUS = 0.092
/** Height of the pooled lava disc near the bottom of the lamp. */
const LAVA_LAMP_POOL_HEIGHT = 0.026
/** Base material roughness for the dark metal pieces. */
const LAVA_LAMP_METAL_ROUGHNESS = 0.36
/** Base material metalness for the dark metal pieces. */
const LAVA_LAMP_METAL_METALNESS = 0.65
/** Glass material roughness so highlights stay soft in the dark habitat. */
const LAVA_LAMP_GLASS_ROUGHNESS = 0.08
/** Glass material environment response. */
const LAVA_LAMP_GLASS_ENV_MAP_INTENSITY = 1.2
/** Blob sphere segment count. */
const LAVA_LAMP_BLOB_SEGMENTS = 18
/** Blob horizontal orbit phase offset in radians. */
const LAVA_LAMP_BLOB_ORBIT_PHASE = Math.PI / 2
/** Blob vertical squash amplitude. */
const LAVA_LAMP_BLOB_SCALE_Y_PULSE = 0.16
/** Blob horizontal stretch amplitude. */
const LAVA_LAMP_BLOB_SCALE_XZ_PULSE = 0.08

/** Runtime state for one animated wax blob inside the procedural lava lamp. */
interface LavaLampBlob {
  /** Mesh being animated inside the glass chamber. */
  mesh: THREE.Mesh
  /** Stable base X offset around the lamp centreline. */
  baseX: number
  /** Stable base Z offset around the lamp centreline. */
  baseZ: number
  /** Base Y position around which the blob floats. */
  baseY: number
  /** Phase offset in radians so blobs do not move in sync. */
  phase: number
  /** Motion speed multiplier in radians per second. */
  speed: number
}

/**
 * Procedural lava lamp model with animated floating wax blobs.
 *
 * @author guinetik
 * @date 2026-05-08
 * @spec docs/superpowers/specs/2026-04-06-habitat-interior-design.md
 */
export class LavaLampModel {
  /** Root object to add to a Three.js scene. */
  readonly group = new THREE.Group()

  /** Animated wax blob meshes and their motion parameters. */
  private readonly blobs: LavaLampBlob[] = []

  /** Local point light that sells the lamp as an active glowing prop. */
  private readonly glowLight: THREE.PointLight

  /** Elapsed animation time in seconds. */
  private elapsed = 0

  constructor() {
    this.group.name = 'LavaLampModel'
    this.group.scale.setScalar(LAVA_LAMP_SCALE)

    this.addBase()
    this.addLiquidCore()
    this.addBlobs()
    this.addGlassShell()
    this.addCap()

    this.glowLight = new THREE.PointLight(
      LAVA_LAMP_LIQUID_COLOR,
      LAVA_LAMP_LIGHT_INTENSITY,
      LAVA_LAMP_LIGHT_RANGE,
    )
    this.glowLight.position.set(0, LAVA_LAMP_LIGHT_Y, 0)
    this.group.add(this.glowLight)
  }

  /**
   * Place the lamp on the raised bed rail using the final bed world bounding box.
   *
   * @param bed - Bed object after scene placement, scale, and grounding.
   */
  placeOnBed(bed: THREE.Object3D): void {
    bed.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(bed)
    const center = box.getCenter(new THREE.Vector3())
    this.group.position.set(
      center.x + LAVA_LAMP_BED_OFFSET_X,
      box.max.y + LAVA_LAMP_BED_TOP_CLEARANCE,
      center.z + LAVA_LAMP_BED_OFFSET_Z,
    )
  }

  /**
   * Advance the lava lamp's wax blobs and soft light pulse.
   *
   * @param dt - Delta time in seconds since the last frame.
   */
  tick(dt: number): void {
    this.elapsed += dt
    for (const blob of this.blobs) {
      const t = this.elapsed * blob.speed + blob.phase
      const vertical = Math.sin(t) * LAVA_LAMP_BLOB_VERTICAL_DRIFT
      const horizontal = Math.sin(t + LAVA_LAMP_BLOB_ORBIT_PHASE)
      const pulse = Math.sin(t * 2)
      blob.mesh.position.set(
        blob.baseX + horizontal * LAVA_LAMP_BLOB_HORIZONTAL_DRIFT,
        blob.baseY + vertical,
        blob.baseZ + Math.cos(t) * LAVA_LAMP_BLOB_HORIZONTAL_DRIFT,
      )
      blob.mesh.scale.set(
        1 + pulse * LAVA_LAMP_BLOB_SCALE_XZ_PULSE,
        1 - pulse * LAVA_LAMP_BLOB_SCALE_Y_PULSE,
        1 - pulse * LAVA_LAMP_BLOB_SCALE_XZ_PULSE,
      )
    }

    this.glowLight.intensity =
      LAVA_LAMP_LIGHT_INTENSITY *
      (1 + Math.sin(this.elapsed * LAVA_LAMP_BLOB_BASE_SPEED) * LAVA_LAMP_LIGHT_PULSE_AMOUNT)
  }

  /** Dispose all geometry and materials owned by the lava lamp. */
  dispose(): void {
    this.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      child.geometry.dispose()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      mats.forEach((mat) => mat.dispose())
    })
  }

  /** Add the dark metal base under the glowing chamber. */
  private addBase(): void {
    const material = new THREE.MeshStandardMaterial({
      color: LAVA_LAMP_METAL_COLOR,
      roughness: LAVA_LAMP_METAL_ROUGHNESS,
      metalness: LAVA_LAMP_METAL_METALNESS,
    })
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(
        LAVA_LAMP_BASE_RADIUS,
        LAVA_LAMP_BASE_RADIUS * 1.16,
        LAVA_LAMP_BASE_HEIGHT,
        LAVA_LAMP_RADIAL_SEGMENTS,
      ),
      material,
    )
    base.position.y = LAVA_LAMP_BASE_HEIGHT / 2
    this.group.add(base)
  }

  /** Add the dark metal cap above the glowing chamber. */
  private addCap(): void {
    const material = new THREE.MeshStandardMaterial({
      color: LAVA_LAMP_METAL_COLOR,
      roughness: LAVA_LAMP_METAL_ROUGHNESS,
      metalness: LAVA_LAMP_METAL_METALNESS,
    })
    const capBottomY = LAVA_LAMP_GLASS_TOP_Y - 0.012
    const capPoints = [
      new THREE.Vector2(LAVA_LAMP_CAP_RADIUS, capBottomY),
      new THREE.Vector2(LAVA_LAMP_CAP_RADIUS * 1.1, capBottomY + LAVA_LAMP_CAP_HEIGHT * 0.18),
      new THREE.Vector2(LAVA_LAMP_CAP_RADIUS * 0.58, capBottomY + LAVA_LAMP_CAP_HEIGHT * 0.62),
      new THREE.Vector2(LAVA_LAMP_CAP_NOSE_RADIUS, capBottomY + LAVA_LAMP_CAP_HEIGHT),
      new THREE.Vector2(0, capBottomY + LAVA_LAMP_CAP_HEIGHT - LAVA_LAMP_CAP_NOSE_RADIUS),
    ]
    const cap = new THREE.Mesh(
      new THREE.LatheGeometry(capPoints, LAVA_LAMP_LATHE_SEGMENTS),
      material,
    )
    this.group.add(cap)
  }

  /** Add the transparent lathed glass shell. */
  private addGlassShell(): void {
    const points = [
      new THREE.Vector2(0.068, LAVA_LAMP_GLASS_BOTTOM_Y),
      new THREE.Vector2(0.112, LAVA_LAMP_GLASS_BOTTOM_Y + 0.05),
      new THREE.Vector2(0.092, LAVA_LAMP_GLASS_BOTTOM_Y + LAVA_LAMP_GLASS_HEIGHT * 0.5),
      new THREE.Vector2(0.072, LAVA_LAMP_GLASS_TOP_Y),
    ]
    const glass = new THREE.Mesh(
      new THREE.LatheGeometry(points, LAVA_LAMP_LATHE_SEGMENTS),
      new THREE.MeshPhysicalMaterial({
        color: LAVA_LAMP_GLASS_COLOR,
        transparent: true,
        opacity: LAVA_LAMP_GLASS_OPACITY,
        roughness: LAVA_LAMP_GLASS_ROUGHNESS,
        metalness: 0,
        transmission: 0.35,
        envMapIntensity: LAVA_LAMP_GLASS_ENV_MAP_INTENSITY,
        depthWrite: false,
      }),
    )
    this.group.add(glass)
  }

  /** Add the glowing liquid core and molten pool. */
  private addLiquidCore(): void {
    const material = new THREE.MeshBasicMaterial({
      color: LAVA_LAMP_LIQUID_COLOR,
      transparent: true,
      opacity: LAVA_LAMP_LIQUID_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(
        LAVA_LAMP_POOL_RADIUS * 0.78,
        LAVA_LAMP_POOL_RADIUS,
        LAVA_LAMP_GLASS_HEIGHT * 0.92,
        LAVA_LAMP_RADIAL_SEGMENTS,
      ),
      material,
    )
    core.position.y = LAVA_LAMP_GLASS_BOTTOM_Y + LAVA_LAMP_GLASS_HEIGHT * 0.5
    this.group.add(core)

    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(
        LAVA_LAMP_POOL_RADIUS,
        LAVA_LAMP_POOL_RADIUS,
        LAVA_LAMP_POOL_HEIGHT,
        LAVA_LAMP_RADIAL_SEGMENTS,
      ),
      material.clone(),
    )
    pool.position.y = LAVA_LAMP_POOL_Y
    this.group.add(pool)
  }

  /** Add independently animated glowing blobs inspired by the 2D metaball sketch. */
  private addBlobs(): void {
    for (let i = 0; i < LAVA_LAMP_BLOB_COUNT; i += 1) {
      const phase = i * LAVA_LAMP_BLOB_PHASE_STEP
      const warm = i % 2 === 0
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(
          LAVA_LAMP_BLOB_RADIUS,
          LAVA_LAMP_BLOB_SEGMENTS,
          LAVA_LAMP_BLOB_SEGMENTS,
        ),
        new THREE.MeshBasicMaterial({
          color: warm ? LAVA_LAMP_HOT_BLOB_COLOR : LAVA_LAMP_LIQUID_COLOR,
          transparent: true,
          opacity: 0.86,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      const baseY = LAVA_LAMP_BLOB_MIN_Y + (i / (LAVA_LAMP_BLOB_COUNT - 1)) * LAVA_LAMP_BLOB_Y_RANGE
      const baseX = Math.sin(phase) * LAVA_LAMP_BLOB_HORIZONTAL_DRIFT
      const baseZ = Math.cos(phase) * LAVA_LAMP_BLOB_HORIZONTAL_DRIFT
      mesh.position.set(baseX, baseY, baseZ)
      this.group.add(mesh)
      this.blobs.push({
        mesh,
        baseX,
        baseZ,
        baseY,
        phase,
        speed: LAVA_LAMP_BLOB_BASE_SPEED + i * LAVA_LAMP_BLOB_SPEED_STEP,
      })
    }
  }
}
