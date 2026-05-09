/**
 * Procedural chimera walker enemy — two-legged biomech with a pulsing head
 * and hanging tentacles.
 *
 * Builds geometry procedurally from the local inspiration demo and adapts it
 * to the repo's controller pattern. Uses simple spline rebuilds for the legs
 * and tentacles, with hit flash and death-collapse behavior.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Enemy } from '@/lib/fps/enemy'
import {
  createTronHologramMaterial,
  disposeTronHologramMaterials,
  syncTronHologramTimeSeconds,
  TRON_HOLOGRAM_ENEMY_ALPHA_GAIN,
  TRON_HOLOGRAM_ENEMY_COLOR_GAIN,
  TRON_HOLOGRAM_ENEMY_MATERIAL_OPACITY,
} from '@/three/tronHologramMaterial'
import { MutableTubeGeometry } from '@/three/geometry/MutableTubeGeometry'
import {
  enemyVisualPaletteForTier,
  type EnemyVisualControllerOptions,
  type EnemyVisualPalette,
} from '@/three/enemyVisualPalette'
import type { EnemyLightPool } from '@/three/EnemyLightPool'

const CHIMERA_SCALE = 0.9
/** Axial segments per leg tube — lower = cheaper {@link THREE.TubeGeometry} rebuilds. */
const LEG_TUBE_AXIAL_SEGMENTS = 6
const LEG_TUBE_RADIAL_SEGMENTS = 4
const LEG_TUBE_RADIUS_UPPER = 0.09
const LEG_TUBE_RADIUS_LOWER = 0.075
const TENTACLE_COUNT = 6
const TENTACLE_SEGMENTS = 3
const TENTACLE_RADIAL_ATTACH = 0.72
const TENTACLE_RADIUS_START = 0.055
const TENTACLE_RADIUS_STEP = 0.01
/** Leg curve rebake rate — rescue missions favor steady frames over limb fidelity. */
const LEG_GEOMETRY_UPDATE_INTERVAL = 1 / 4
/** Tentacle tubes are the hottest path; keep uploads sparse during enemy packs. */
const TENTACLE_GEOMETRY_UPDATE_INTERVAL = 1 / 3
/** Axial segments per tentacle quadratic span. */
const TENTACLE_TUBE_AXIAL_SEGMENTS = 4
const TENTACLE_TUBE_RADIAL_SEGMENTS = 4

const BODY_HEIGHT = 6.5
const HIP_HEIGHT = 5.3
const HEAD_HEIGHT = 8.8

// --- Astronaut rider constants (used when variant === 'astronaut-chimera') ---
/**
 * Y offset of the rider's root above the chimera's group origin (world units, pre-scale).
 * Places the astronaut figure just above the head membrane sphere.
 */
const RIDER_ROOT_Y = HEAD_HEIGHT + 1.2
/** Height of the astronaut torso capsule (world units, pre-scale). */
const RIDER_TORSO_HEIGHT = 1.6
/** Radius of the astronaut torso capsule. */
const RIDER_TORSO_RADIUS = 0.28
/** Radius of the astronaut helmet sphere. */
const RIDER_HEAD_RADIUS = 0.32
/** Y offset of the helmet centre above the rider root. */
const RIDER_HEAD_Y = RIDER_TORSO_HEIGHT * 0.5 + RIDER_HEAD_RADIUS + 0.06
/** Half-length of each arm (extends left and right from shoulders). */
const RIDER_ARM_HALF_LENGTH = 0.55
/** Radius of the arm cylinder. */
const RIDER_ARM_RADIUS = 0.1
/** Y offset of the arms from the rider root (shoulder line). */
const RIDER_ARM_Y = RIDER_TORSO_HEIGHT * 0.3
/** Arm separation from body centre (X offset to the arm centre). */
const RIDER_ARM_X = RIDER_TORSO_RADIUS + RIDER_ARM_HALF_LENGTH
/** Max T-pose sway amplitude (radians) applied to each arm each tick. */
const RIDER_ARM_SWAY_AMPLITUDE = 0.22
/** Angular frequency of the idle arm flailing (rad/s). */
const RIDER_ARM_SWAY_FREQ = 1.8
/** Colour of the astronaut suit (off-white). */
const RIDER_SUIT_COLOR = 0xe8e8e0
/** Colour of the helmet visor (dark tinted glass). */
const RIDER_VISOR_COLOR = 0x112233

const CHIMERA_EYE_LASER_FLASH_DURATION = 0.085

const HIT_FLASH_DURATION = 0.08
const HIT_RECOIL_DURATION = 0.25
const HIT_RECOIL_INTENSITY = 0.14
const DEATH_ANIM_DURATION = 1.35
/** World Y where retired controllers park so their meshes frustum-cull. */
const RETIRE_PARK_Y = -10_000
/** Default walker eye/hair feature color. */
const CHIMERA_DEFAULT_FEATURE = 0xff2200
/** Brighter default walker hair-tip feature color. */
const CHIMERA_DEFAULT_FEATURE_BRIGHT = 0xff6644

/**
 * Y offset from group origin to body center in world units.
 * The view controller uses this to place the hit sphere near the torso.
 */
export const CHIMERA_HIT_CENTER_Y = BODY_HEIGHT * CHIMERA_SCALE

/** TRON head inner core. */
const CHIMERA_TRON_HEAD_CORE = 0xff0066
/** TRON DNA torus accent. */
const CHIMERA_TRON_DNA = 0x39ff14
/** TRON RNA torus accent. */
const CHIMERA_TRON_RNA = 0xff3366
const flashMat = new THREE.MeshBasicMaterial({ color: 0xff00ff })

const torsoGeo = new THREE.IcosahedronGeometry(1.2, 1)
const hipGeo = new THREE.SphereGeometry(0.6, 8, 6)
const dnaGeo = new THREE.TorusKnotGeometry(0.3, 0.06, 32, 4, 2, 3)
const rnaGeo = new THREE.TorusKnotGeometry(0.25, 0.05, 24, 4, 3, 2)
const headMembraneGeo = new THREE.SphereGeometry(0.9, 12, 8)
const headCoreGeo = new THREE.SphereGeometry(0.55, 8, 6)
const jointKneeGeo = new THREE.SphereGeometry(0.18, 6, 4)
const jointAnkleGeo = new THREE.SphereGeometry(0.14, 6, 4)
const toeGeo = new THREE.ConeGeometry(0.06, 0.5, 4)
const SHARED_GEOMETRIES = new Set<THREE.BufferGeometry>([
  torsoGeo,
  hipGeo,
  dnaGeo,
  rnaGeo,
  headMembraneGeo,
  headCoreGeo,
  jointKneeGeo,
  jointAnkleGeo,
  toeGeo,
])

/** Per-leg state for animation. */
interface ChimeraLeg {
  side: -1 | 1
  phase: number
  upperMesh: THREE.Mesh
  lowerMesh: THREE.Mesh
  /** In-place mutable tube geometry for the upper leg segment. */
  upperTube: MutableTubeGeometry
  /** In-place mutable tube geometry for the lower leg segment. */
  lowerTube: MutableTubeGeometry
  kneeSphere: THREE.Mesh
  ankleSphere: THREE.Mesh
  toes: Array<{ mesh: THREE.Mesh; offset: number }>
}

/** Per-tentacle state for animation. */
interface ChimeraTentacle {
  angle: number
  length: number
  phase: number
  freqX: number
  freqY: number
  freqZ: number
  ampBase: number
  curl: number
  reachDir: THREE.Vector3
  meshes: THREE.Mesh[]
  /** In-place mutable tube geometry per tentacle segment (parallel to `meshes`). */
  tubes: MutableTubeGeometry[]
}

/**
 * Procedural chimera walker controller.
 *
 * @author guinetik
 * @date 2026-04-08
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class ChimeraWalkerController implements Tickable {
  readonly group = new THREE.Group()
  /**
   * Domain enemy entity this controller visualizes. Mutable so the
   * controller can be retired into a pool and recycled with a freshly
   * spawned enemy.
   */
  enemy: Enemy

  private readonly bodyGroup = new THREE.Group()
  private readonly legsGroup = new THREE.Group()
  private readonly headGroup = new THREE.Group()
  private readonly tentaclesGroup = new THREE.Group()
  private readonly spineSegments: THREE.Mesh[] = []
  private readonly legs: ChimeraLeg[] = []
  private readonly tentacles: ChimeraTentacle[] = []

  private headMembrane!: THREE.Mesh
  private headCore!: THREE.Mesh
  private dnaCore!: THREE.Mesh
  private rnaCore!: THREE.Mesh
  private bodyLight!: THREE.PointLight
  private headLight!: THREE.PointLight
  /** Pool the lights were borrowed from; `null` when self-owned. */
  private readonly lightPool: EnemyLightPool | null
  /** True when the chimera's lights should contribute this frame; gated in tick(). */
  private lightsEnabled = true
  /** Restores head shell after hit / death flash (shared TRON shader). */
  private headMembraneMat!: THREE.ShaderMaterial
  private readonly tronMaterials: THREE.ShaderMaterial[] = []
  private readonly visualPalette: EnemyVisualPalette
  /** Eye emissives — disposed with this instance. */
  private readonly disposableBasicMaterials: THREE.MeshBasicMaterial[] = []
  private leftEye!: THREE.Mesh
  private rightEye!: THREE.Mesh
  private leftEyeMat!: THREE.MeshBasicMaterial
  private rightEyeMat!: THREE.MeshBasicMaterial
  /** Alternates which eye the domain uses as the laser muzzle. */
  private eyeLaserUseRight = false
  /** Restores red eye materials after a laser pulse. */
  private eyeLaserFlashTimer = 0

  /**
   * Left arm mesh of the astronaut rider; `null` when variant is `'standard'`.
   * Animated each tick with a mild flailing sway.
   */
  private riderArmLeft: THREE.Mesh | null = null
  /**
   * Right arm mesh of the astronaut rider; `null` when variant is `'standard'`.
   * Animated each tick with a mild flailing sway (phase-offset from left).
   */
  private riderArmRight: THREE.Mesh | null = null

  private elapsed = 0
  private readonly timeOffset = Math.random() * 10
  private flashTimer = 0
  private recoilTimer = 0
  private legGeometryTimer = 0
  private tentacleGeometryTimer = 0
  private dead = false
  private deathTimer = 0
  private disposed = false

  /** Current visual state — set by the view controller from director output. */
  isMoving = false
  /** Current agitation state — set by the view controller from director output. */
  isAgitated = false
  /**
   * When `true`, per-frame leg/tentacle geometry rebakes are skipped — used
   * by the minigame VC to LOD-out distant enemies whose tube wiggle is
   * invisible. Set every tick by the caller.
   */
  lodSkipGeometry = false

  /** True once the death animation has completed. */
  get deathComplete(): boolean {
    return this.dead && this.deathTimer >= DEATH_ANIM_DURATION
  }

  constructor(enemy: Enemy, options: EnemyVisualControllerOptions = {}) {
    this.enemy = enemy
    this.lightPool = options.lightPool ?? null
    const palette = enemyVisualPaletteForTier(options.visualTier)
    this.visualPalette =
      options.visualTier === undefined || options.visualTier === 'default'
        ? {
            ...palette,
            feature: CHIMERA_DEFAULT_FEATURE,
            featureBright: CHIMERA_DEFAULT_FEATURE_BRIGHT,
          }
        : palette

    this.group.add(this.legsGroup)
    this.group.add(this.bodyGroup)
    this.group.add(this.headGroup)
    this.group.add(this.tentaclesGroup)
    this.group.scale.setScalar(CHIMERA_SCALE)

    this.buildBody()
    this.buildLegs()
    this.buildHead()
    this.buildTentacles()
    this.refreshLegGeometry(0, false)
    this.refreshTentacleGeometry(0, false)

    if (options.variant === 'astronaut-chimera') {
      this.buildAstronautRider()
    }

    this.enemy.onDeath = () => this.die()
  }

  /**
   * World position of the eye used for this shot (alternates L/R). Call after the
   * group’s world matrix is current (e.g. `group.updateMatrixWorld(true)`).
   *
   * @param out - Receives world-space muzzle position
   */
  getEyeLaserMuzzle(out: THREE.Vector3): void {
    this.eyeLaserUseRight = !this.eyeLaserUseRight
    const eye = this.eyeLaserUseRight ? this.rightEye : this.leftEye
    eye.getWorldPosition(out)
  }

  /**
   * Brief magenta flash on both eyes when a laser is fired.
   */
  pulseEyeLaser(): void {
    this.eyeLaserFlashTimer = CHIMERA_EYE_LASER_FLASH_DURATION
    this.leftEye.material = flashMat
    this.rightEye.material = flashMat
  }

  /**
   * Allocate a TRON hologram material tracked for time sync and disposal.
   *
   * @param color - Primary tint
   * @returns Shader material instance
   */
  private makeTron(color: number): THREE.ShaderMaterial {
    const m = createTronHologramMaterial({
      color,
      colorGain: TRON_HOLOGRAM_ENEMY_COLOR_GAIN,
      alphaGain: TRON_HOLOGRAM_ENEMY_ALPHA_GAIN,
      opacity: TRON_HOLOGRAM_ENEMY_MATERIAL_OPACITY,
    })
    this.tronMaterials.push(m)
    return m
  }

  /** @inheritdoc */
  tick(dt: number): void {
    if (this.disposed) return
    syncTronHologramTimeSeconds(this.tronMaterials, this.elapsed + this.timeOffset)
    this.elapsed += dt
    const t = this.elapsed + this.timeOffset

    if (this.dead) {
      this.tickDeath(dt, t)
      return
    }

    if (this.isMoving) {
      this.bodyGroup.position.y = Math.sin(t * 3) * 0.15
      this.bodyGroup.rotation.z = Math.sin(t * 3) * 0.04
      this.bodyGroup.position.x = Math.sin(t * 1.5) * 0.08
    } else {
      this.bodyGroup.position.y = Math.sin(t * 0.8) * 0.05
      this.bodyGroup.rotation.z = Math.sin(t * 0.5) * 0.015
      this.bodyGroup.position.x = 0
    }

    this.headGroup.position.y = this.bodyGroup.position.y
    this.headGroup.rotation.x = Math.sin(t * (this.isMoving ? 2 : 0.6)) * 0.06
    this.headGroup.rotation.z = Math.sin(t * (this.isMoving ? 1.5 : 0.4)) * 0.04

    if (this.recoilTimer > 0) {
      this.recoilTimer -= dt
      const intensity = (this.recoilTimer / HIT_RECOIL_DURATION) * HIT_RECOIL_INTENSITY
      this.bodyGroup.position.y += Math.sin(t * 40) * intensity
      this.bodyGroup.rotation.z += Math.sin(t * 35) * intensity
    }

    const breathe = this.isAgitated ? 1 + Math.sin(t * 4) * 0.06 : 1 + Math.sin(t * 1.2) * 0.02
    this.headMembrane.scale.setScalar(breathe)

    this.dnaCore.rotation.y += 0.02
    this.dnaCore.rotation.x += 0.005
    this.rnaCore.rotation.y -= 0.015
    this.rnaCore.rotation.z += 0.008
    this.dnaCore.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
    this.rnaCore.scale.setScalar(1 + Math.sin(t * 2.5 + 1) * 0.08)

    this.bodyLight.intensity = this.lightsEnabled ? 0.3 + Math.sin(t * 2) * 0.2 : 0
    this.headLight.intensity = !this.lightsEnabled
      ? 0
      : this.isAgitated
        ? 1 + Math.sin(t * 5) * 0.5
        : 0.5 + Math.sin(t * 1.5) * 0.2

    // LOD: skip the rebake entirely for distant chimeras — caller sets
    // `lodSkipGeometry` when this enemy is too far for limb wiggle to be
    // visible. The static last-pose stays on screen, no GPU upload happens.
    this.legGeometryTimer += dt
    if (!this.lodSkipGeometry && this.legGeometryTimer >= LEG_GEOMETRY_UPDATE_INTERVAL) {
      this.refreshLegGeometry(t, this.isMoving)
      this.legGeometryTimer %= LEG_GEOMETRY_UPDATE_INTERVAL
    }

    this.tentacleGeometryTimer += dt
    if (!this.lodSkipGeometry && this.tentacleGeometryTimer >= TENTACLE_GEOMETRY_UPDATE_INTERVAL) {
      this.refreshTentacleGeometry(t, this.isAgitated)
      this.tentacleGeometryTimer %= TENTACLE_GEOMETRY_UPDATE_INTERVAL
    }

    for (let i = 0; i < this.spineSegments.length; i++) {
      const seg = this.spineSegments[i]!
      seg.rotation.y = Math.sin(t * 2 + i * 0.5) * 0.1
      seg.rotation.x = Math.sin(t * 1.5 + i * 0.3) * 0.05
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.headMembrane.material = this.headMembraneMat
      }
    }

    if (this.eyeLaserFlashTimer > 0) {
      this.eyeLaserFlashTimer -= dt
      if (this.eyeLaserFlashTimer <= 0) {
        this.leftEye.material = this.leftEyeMat
        this.rightEye.material = this.rightEyeMat
      }
    }

    this.tickAstronautRider(t)
  }

  /**
   * Retire this controller into a pool slot. Hides the visual group and
   * resets transient animation state so a future {@link recycle} can rebind
   * a fresh enemy without re-running the constructor (which allocates ~68
   * THREE objects — the source of disturbance spawn hitches).
   */
  retire(): void {
    this.enemy.onDeath = null
    this.dead = false
    this.deathTimer = 0
    this.flashTimer = 0
    this.recoilTimer = 0
    this.eyeLaserFlashTimer = 0
    this.legGeometryTimer = 0
    this.tentacleGeometryTimer = 0
    this.elapsed = 0
    this.isMoving = false
    this.isAgitated = false
    this.lodSkipGeometry = false
    this.headMembrane.material = this.headMembraneMat
    this.headMembrane.scale.setScalar(1)
    this.leftEye.material = this.leftEyeMat
    this.rightEye.material = this.rightEyeMat
    this.headCore.scale.setScalar(1)
    this.dnaCore.scale.setScalar(1)
    this.rnaCore.scale.setScalar(1)
    this.bodyGroup.position.set(0, 0, 0)
    this.bodyGroup.rotation.set(0, 0, 0)
    this.headGroup.position.set(0, 0, 0)
    this.headGroup.rotation.set(0, 0, 0)
    this.group.scale.setScalar(CHIMERA_SCALE)
    this.group.rotation.set(0, 0, 0)
    // See BacteriophageController.retire — toggling `visible` would mutate
    // `NUM_POINT_LIGHTS` and recompile every lit material. Park instead.
    this.group.position.set(0, RETIRE_PARK_Y, 0)
  }

  /**
   * Bind a freshly spawned enemy to this pooled controller.
   *
   * @param enemy - New domain enemy to drive this controller.
   */
  recycle(enemy: Enemy): void {
    this.enemy = enemy
    this.enemy.onDeath = () => this.die()
  }

  /** Flash the head membrane magenta and apply recoil. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.recoilTimer = HIT_RECOIL_DURATION
    this.headMembrane.material = flashMat
  }

  /** Clean up owned geometry. */
  dispose(): void {
    this.disposed = true
    disposeTronHologramMaterials(this.tronMaterials)
    this.tronMaterials.length = 0
    for (const m of this.disposableBasicMaterials) {
      m.dispose()
    }
    this.disposableBasicMaterials.length = 0
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!SHARED_GEOMETRIES.has(child.geometry)) {
          child.geometry.dispose()
        }
      }
    })
    if (this.lightPool) {
      this.lightPool.release(this.bodyLight)
      this.lightPool.release(this.headLight)
    }
  }

  private buildBody(): void {
    const bodyTron = this.makeTron(this.visualPalette.silhouette)
    const hullTron = this.makeTron(this.visualPalette.silhouette)
    const neckTron = this.makeTron(this.visualPalette.silhouetteDark)
    const dnaTron = this.makeTron(CHIMERA_TRON_DNA)
    const rnaTron = this.makeTron(CHIMERA_TRON_RNA)

    const torso = new THREE.Mesh(torsoGeo, bodyTron)
    torso.position.y = BODY_HEIGHT
    this.bodyGroup.add(torso)

    for (let i = 0; i < 6; i++) {
      const r = 0.35 - i * 0.03
      const segGeo = new THREE.CylinderGeometry(r, r + 0.02, 0.15, 8)
      const seg = new THREE.Mesh(segGeo, neckTron)
      seg.position.y = 7.7 + i * 0.16
      this.bodyGroup.add(seg)
      this.spineSegments.push(seg)
    }

    const hip = new THREE.Mesh(hipGeo, hullTron)
    hip.position.y = HIP_HEIGHT
    this.bodyGroup.add(hip)

    this.dnaCore = new THREE.Mesh(dnaGeo, dnaTron)
    this.dnaCore.position.y = BODY_HEIGHT
    this.bodyGroup.add(this.dnaCore)

    this.rnaCore = new THREE.Mesh(rnaGeo, rnaTron)
    this.rnaCore.position.y = BODY_HEIGHT
    this.bodyGroup.add(this.rnaCore)

    // Borrow a pool slot when available so spawn/despawn does not change
    // scene-wide `NUM_POINT_LIGHTS` and trigger lit-material recompiles.
    const pooledBody = this.lightPool?.acquire() ?? null
    if (pooledBody) {
      pooledBody.color.setHex(0x00ffcc)
      pooledBody.distance = 6
      pooledBody.intensity = 0.4
      this.bodyLight = pooledBody
    } else {
      this.bodyLight = new THREE.PointLight(0x00ffcc, 0.4, 6)
    }
    this.bodyLight.position.y = BODY_HEIGHT
    this.bodyGroup.add(this.bodyLight)
  }

  private buildHead(): void {
    this.headMembraneMat = this.makeTron(this.visualPalette.silhouette)
    this.headMembrane = new THREE.Mesh(headMembraneGeo, this.headMembraneMat)
    this.headMembrane.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headMembrane)

    this.headCore = new THREE.Mesh(headCoreGeo, this.makeTron(CHIMERA_TRON_HEAD_CORE))
    this.headCore.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headCore)

    // Pooled head light — same rationale as bodyLight in {@link buildBody}.
    const pooledHead = this.lightPool?.acquire() ?? null
    if (pooledHead) {
      pooledHead.color.setHex(0xff4400)
      pooledHead.distance = 8
      pooledHead.intensity = 0.8
      this.headLight = pooledHead
    } else {
      this.headLight = new THREE.PointLight(0xff4400, 0.8, 8)
    }
    this.headLight.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headLight)

    for (const side of [-1, 1] as const) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: this.visualPalette.feature })
      this.disposableBasicMaterials.push(eyeMat)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), eyeMat)
      eye.position.set(side * 0.35, 8.95, 0.65)
      this.headGroup.add(eye)
      if (side === -1) {
        this.leftEye = eye
        this.leftEyeMat = eyeMat
      } else {
        this.rightEye = eye
        this.rightEyeMat = eyeMat
      }
    }
  }

  private buildLegs(): void {
    const legTron = this.makeTron(this.visualPalette.silhouette)
    const toeTron = this.makeTron(this.visualPalette.silhouette)
    for (const side of [-1, 1] as const) {
      const upperTube = new MutableTubeGeometry(
        LEG_TUBE_AXIAL_SEGMENTS,
        LEG_TUBE_RADIAL_SEGMENTS,
        LEG_TUBE_RADIUS_UPPER,
        false,
      )
      upperTube.update(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)))
      const upperMesh = new THREE.Mesh(upperTube, legTron)

      const lowerTube = new MutableTubeGeometry(
        LEG_TUBE_AXIAL_SEGMENTS,
        LEG_TUBE_RADIAL_SEGMENTS,
        LEG_TUBE_RADIUS_LOWER,
        false,
      )
      lowerTube.update(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)))
      const lowerMesh = new THREE.Mesh(lowerTube, legTron)

      const kneeSphere = new THREE.Mesh(jointKneeGeo, legTron)
      const ankleSphere = new THREE.Mesh(jointAnkleGeo, legTron)

      this.legsGroup.add(upperMesh)
      this.legsGroup.add(lowerMesh)
      this.legsGroup.add(kneeSphere)
      this.legsGroup.add(ankleSphere)

      const toes: Array<{ mesh: THREE.Mesh; offset: number }> = []
      for (const offset of [-1, 0, 1]) {
        const toe = new THREE.Mesh(toeGeo, toeTron)
        toe.rotation.x = Math.PI * 0.6
        this.legsGroup.add(toe)
        toes.push({ mesh: toe, offset })
      }

      this.legs.push({
        side,
        phase: side === -1 ? 0 : Math.PI,
        upperMesh,
        lowerMesh,
        upperTube,
        lowerTube,
        kneeSphere,
        ankleSphere,
        toes,
      })
    }
  }

  private buildTentacles(): void {
    const tentacleTron = this.makeTron(this.visualPalette.feature)
    const tentacleTipTron = this.makeTron(this.visualPalette.featureBright)
    const initCurve = new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const angle = (i / TENTACLE_COUNT) * Math.PI * 2
      const meshes: THREE.Mesh[] = []
      const tubes: MutableTubeGeometry[] = []
      for (let s = 0; s < TENTACLE_SEGMENTS; s++) {
        const radius = Math.max(0.014, TENTACLE_RADIUS_START - s * TENTACLE_RADIUS_STEP)
        const tube = new MutableTubeGeometry(
          TENTACLE_TUBE_AXIAL_SEGMENTS,
          TENTACLE_TUBE_RADIAL_SEGMENTS,
          radius,
          false,
        )
        tube.update(initCurve)
        const mesh = new THREE.Mesh(
          tube,
          s < TENTACLE_SEGMENTS - 1 ? tentacleTron : tentacleTipTron,
        )
        this.tentaclesGroup.add(mesh)
        meshes.push(mesh)
        tubes.push(tube)
      }

      this.tentacles.push({
        angle,
        length: 1.8 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        freqX: 1.5 + Math.random() * 1.8,
        freqY: 1 + Math.random() * 1.4,
        freqZ: 1.2 + Math.random() * 1.8,
        ampBase: 0.25 + Math.random() * 0.2,
        curl: 0.3 + Math.random() * 0.5,
        reachDir: new THREE.Vector3(
          Math.cos(angle) * (0.5 + Math.random() * 0.35),
          (Math.random() - 0.35) * 0.7,
          Math.sin(angle) * (0.5 + Math.random() * 0.35),
        ).normalize(),
        meshes,
        tubes,
      })
    }
  }

  private updateLeg(leg: ChimeraLeg, time: number, isMoving: boolean): void {
    const stride = isMoving ? 1.2 : 0
    const stepHeight = isMoving ? 1 : 0
    const cycle = Math.sin(time * 3 + leg.phase)
    const liftCycle = Math.max(0, cycle)

    const footX = leg.side * 1.6
    const footY = liftCycle * stepHeight
    const footZ = isMoving ? cycle * stride : Math.sin(time * 0.5 + leg.phase) * 0.1
    const kneeX = leg.side * 1.2
    const kneeY = 2.8 + liftCycle * 0.4
    const kneeZ = footZ * 0.3 - 0.6
    const ankleX = footX
    const ankleY = 0.5 + footY
    const ankleZ = footZ * 0.8

    const hip = new THREE.Vector3(leg.side * 0.8, HIP_HEIGHT, 0)
    const knee = new THREE.Vector3(kneeX, kneeY, kneeZ)
    const ankle = new THREE.Vector3(ankleX, ankleY, ankleZ)
    const foot = new THREE.Vector3(footX, footY, footZ)

    const upperCurve = new THREE.QuadraticBezierCurve3(
      hip,
      new THREE.Vector3((hip.x + knee.x) / 2, (hip.y + knee.y) / 2 + 0.3, (hip.z + knee.z) / 2),
      knee,
    )
    leg.upperTube.update(upperCurve)

    const lowerCurve = new THREE.QuadraticBezierCurve3(
      knee,
      new THREE.Vector3(
        (knee.x + ankle.x) / 2,
        (knee.y + ankle.y) / 2 - 0.2,
        (knee.z + ankle.z) / 2,
      ),
      ankle,
    )
    leg.lowerTube.update(lowerCurve)

    leg.kneeSphere.position.copy(knee)
    leg.ankleSphere.position.copy(ankle)

    for (const toe of leg.toes) {
      toe.mesh.position.set(foot.x + toe.offset * 0.15, foot.y + 0.05, foot.z + 0.2)
      toe.mesh.rotation.z = toe.offset * 0.3
    }
  }

  private updateTentacle(tentacle: ChimeraTentacle, time: number, isAgitated: boolean): void {
    const baseY = 8
    const attachX = Math.cos(tentacle.angle) * TENTACLE_RADIAL_ATTACH
    const attachZ = Math.sin(tentacle.angle) * TENTACLE_RADIAL_ATTACH
    const agitMult = isAgitated ? 2.3 : 1
    const ampMult = isAgitated ? 1.9 : 1
    const segLen = tentacle.length / TENTACLE_SEGMENTS
    let prevEnd = new THREE.Vector3(attachX, baseY, attachZ)

    for (let s = 0; s < TENTACLE_SEGMENTS; s++) {
      const progress = (s + 1) / TENTACLE_SEGMENTS
      const tipFactor = progress * progress
      const tX = time * tentacle.freqX * agitMult + tentacle.phase + s * 1.1
      const tY = time * tentacle.freqY * agitMult + tentacle.phase * 1.7 + s * 0.8
      const tZ = time * tentacle.freqZ * agitMult + tentacle.phase * 0.6 + s * 1.2
      const amp = tentacle.ampBase * ampMult
      const curlAngle = time * 1.5 * agitMult + s * tentacle.curl * 1.4 + tentacle.phase
      const curlR = tentacle.curl * 0.22 * progress * ampMult

      const segEnd = new THREE.Vector3(
        prevEnd.x +
          tentacle.reachDir.x * segLen +
          Math.sin(tX) * amp * (0.3 + tipFactor * 0.6) +
          Math.cos(curlAngle) * curlR,
        prevEnd.y +
          tentacle.reachDir.y * segLen +
          Math.sin(tY) * amp * (0.2 + tipFactor * 0.7) -
          segLen * 0.2,
        prevEnd.z +
          tentacle.reachDir.z * segLen +
          Math.cos(tZ) * amp * (0.3 + tipFactor * 0.6) +
          Math.sin(curlAngle) * curlR,
      )

      const mid = new THREE.Vector3(
        (prevEnd.x + segEnd.x) / 2 + Math.sin(tX * 1.2 + s) * amp * 0.3 * tipFactor,
        (prevEnd.y + segEnd.y) / 2 + Math.cos(tY * 1.1 + s * 0.6) * amp * 0.35 * tipFactor,
        (prevEnd.z + segEnd.z) / 2 + Math.sin(tZ + s) * amp * 0.3 * tipFactor,
      )

      const curve = new THREE.QuadraticBezierCurve3(prevEnd, mid, segEnd)
      tentacle.tubes[s]!.update(curve)
      prevEnd = segEnd
    }
  }

  private tickDeath(dt: number, time: number): void {
    this.deathTimer += dt
    const progress = Math.min(1, this.deathTimer / DEATH_ANIM_DURATION)
    const ease = progress * progress

    if (this.eyeLaserFlashTimer > 0) {
      this.eyeLaserFlashTimer -= dt
      if (this.eyeLaserFlashTimer <= 0) {
        this.leftEye.material = this.leftEyeMat
        this.rightEye.material = this.rightEyeMat
      }
    }

    this.bodyGroup.position.y = -ease * 1.8
    this.bodyGroup.rotation.x = ease * 1.2 + Math.sin(time * 15) * 0.08 * (1 - ease)
    this.bodyGroup.rotation.z = ease * 0.45 + Math.sin(time * 12) * 0.05 * (1 - ease)
    this.headGroup.rotation.x = ease * 0.4
    this.headGroup.position.y = -ease * 0.8

    this.legGeometryTimer += dt
    if (this.legGeometryTimer >= LEG_GEOMETRY_UPDATE_INTERVAL) {
      for (const leg of this.legs) {
        const hip = new THREE.Vector3(leg.side * 0.8, HIP_HEIGHT * (1 - ease), 0)
        const knee = new THREE.Vector3(leg.side * (1 - ease * 0.4), 2.2 * (1 - ease), -0.5)
        const foot = new THREE.Vector3(leg.side * (1.2 - ease * 0.5), -0.4 * ease, -0.2)

        const upperCurve = new THREE.QuadraticBezierCurve3(
          hip,
          hip
            .clone()
            .lerp(knee, 0.5)
            .add(new THREE.Vector3(0, 0.2, 0)),
          knee,
        )
        const lowerCurve = new THREE.QuadraticBezierCurve3(
          knee,
          knee
            .clone()
            .lerp(foot, 0.5)
            .add(new THREE.Vector3(0, -0.1, 0)),
          foot,
        )
        leg.upperTube.update(upperCurve)
        leg.lowerTube.update(lowerCurve)
        leg.kneeSphere.position.copy(knee)
        leg.ankleSphere.position.copy(foot)
      }
      this.legGeometryTimer %= LEG_GEOMETRY_UPDATE_INTERVAL
    }

    this.tentacleGeometryTimer += dt
    if (this.tentacleGeometryTimer >= TENTACLE_GEOMETRY_UPDATE_INTERVAL) {
      this.refreshTentacleGeometry(time + progress * 2, true)
      this.tentacleGeometryTimer %= TENTACLE_GEOMETRY_UPDATE_INTERVAL
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.headMembrane.material = this.headMembraneMat
      }
    }

    const flicker = Math.random() > progress ? 1 : 0
    this.headCore.scale.setScalar((1 - ease * 0.8) * flicker)
    this.dnaCore.scale.setScalar((1 - ease) * flicker)
    this.rnaCore.scale.setScalar((1 - ease) * flicker)
    this.bodyLight.intensity = this.lightsEnabled ? (1 - ease) * flicker : 0
    this.headLight.intensity = this.lightsEnabled ? (1 - ease) * 2 * flicker : 0

    if (progress > 0.6) {
      const shrinkProgress = (progress - 0.6) / 0.4
      this.group.scale.setScalar(CHIMERA_SCALE * (1 - shrinkProgress * 0.55))
    }

    if (progress >= 1) {
      this.group.removeFromParent()
    }
  }

  private die(): void {
    this.dead = true
    this.deathTimer = 0
    this.legGeometryTimer = LEG_GEOMETRY_UPDATE_INTERVAL
    this.tentacleGeometryTimer = TENTACLE_GEOMETRY_UPDATE_INTERVAL
    this.flashTimer = HIT_FLASH_DURATION
    this.headMembrane.material = flashMat
  }

  private refreshLegGeometry(time: number, isMoving: boolean): void {
    for (const leg of this.legs) {
      this.updateLeg(leg, time, isMoving)
    }
  }

  /**
   * Toggle the body + head point lights on/off. The minigame VC calls this
   * every tick on a "keep N nearest, hide the rest" basis to cap the number
   * of dynamic lights affecting PBR materials when many enemies are
   * visible. Hides both lights at once — they're a single visual unit.
   *
   * @param enabled Whether the chimera's two point lights contribute this frame.
   */
  setLightsEnabled(enabled: boolean): void {
    // Toggling `.visible` on point lights would change `NUM_POINT_LIGHTS` and
    // recompile every lit material in the scene. Track the LOD state on a
    // flag and gate intensity in tick() instead.
    this.lightsEnabled = enabled
  }

  private refreshTentacleGeometry(time: number, isAgitated: boolean): void {
    for (const tentacle of this.tentacles) {
      this.updateTentacle(tentacle, time, isAgitated)
    }
  }

  /**
   * Build a procedural astronaut-rider figure parented to the chimera root group.
   *
   * The rider sits above the chimera head in a T-pose. All geometry is created
   * inline — no async GLB load — so it is immediately visible on spawn. Combat
   * colliders are UNCHANGED; the rider is purely cosmetic.
   *
   * Called once from the constructor when `variant === 'astronaut-chimera'`.
   */
  private buildAstronautRider(): void {
    const suitMat = new THREE.MeshBasicMaterial({ color: RIDER_SUIT_COLOR })
    const visorMat = new THREE.MeshBasicMaterial({ color: RIDER_VISOR_COLOR })
    // Track for disposal
    this.disposableBasicMaterials.push(suitMat, visorMat)

    const riderGroup = new THREE.Group()
    riderGroup.position.y = RIDER_ROOT_Y

    // Torso — capsule (cylinder + two half-spheres via CapsuleGeometry)
    const torsoGeo = new THREE.CapsuleGeometry(
      RIDER_TORSO_RADIUS,
      RIDER_TORSO_HEIGHT,
      4,
      8,
    )
    const torso = new THREE.Mesh(torsoGeo, suitMat)
    torso.position.y = 0
    riderGroup.add(torso)

    // Helmet — sphere
    const helmetGeo = new THREE.SphereGeometry(RIDER_HEAD_RADIUS, 8, 6)
    const helmet = new THREE.Mesh(helmetGeo, suitMat)
    helmet.position.y = RIDER_HEAD_Y
    riderGroup.add(helmet)

    // Visor plate — slightly smaller sphere inset into the front of the helmet
    const visorGeo = new THREE.SphereGeometry(RIDER_HEAD_RADIUS * 0.68, 6, 5)
    const visor = new THREE.Mesh(visorGeo, visorMat)
    visor.position.set(0, RIDER_HEAD_Y, RIDER_HEAD_RADIUS * 0.52)
    riderGroup.add(visor)

    // Arms — cylinders rotated horizontal (T-pose)
    const armGeo = new THREE.CylinderGeometry(
      RIDER_ARM_RADIUS,
      RIDER_ARM_RADIUS,
      RIDER_ARM_HALF_LENGTH * 2,
      6,
    )
    const leftArm = new THREE.Mesh(armGeo, suitMat)
    leftArm.rotation.z = Math.PI / 2
    leftArm.position.set(-RIDER_ARM_X, RIDER_ARM_Y, 0)
    riderGroup.add(leftArm)

    const rightArm = new THREE.Mesh(armGeo, suitMat)
    rightArm.rotation.z = Math.PI / 2
    rightArm.position.set(RIDER_ARM_X, RIDER_ARM_Y, 0)
    riderGroup.add(rightArm)

    this.riderArmLeft = leftArm
    this.riderArmRight = rightArm

    // Parent to the chimera root (not a sub-group) so the rider inherits
    // the full chimera transform without double-scaling issues.
    this.group.add(riderGroup)
  }

  /**
   * Animate the astronaut rider arms with mild out-of-phase flailing.
   * No-op when there is no rider (`riderArmLeft === null`).
   *
   * @param time - Running elapsed time (seconds + per-instance offset).
   */
  private tickAstronautRider(time: number): void {
    if (!this.riderArmLeft || !this.riderArmRight) return
    // Left arm flails slightly forward/back around the default T-pose z-rotation.
    this.riderArmLeft.rotation.x = Math.sin(time * RIDER_ARM_SWAY_FREQ) * RIDER_ARM_SWAY_AMPLITUDE
    // Right arm flails in the opposite phase for an asymmetric, disturbing look.
    this.riderArmRight.rotation.x =
      Math.sin(time * RIDER_ARM_SWAY_FREQ + Math.PI) * RIDER_ARM_SWAY_AMPLITUDE
  }
}
