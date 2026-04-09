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

const CHIMERA_SCALE = 0.9
/** Axial segments per leg tube — lower = cheaper {@link THREE.TubeGeometry} rebuilds. */
const LEG_TUBE_AXIAL_SEGMENTS = 6
const LEG_TUBE_RADIAL_SEGMENTS = 4
const LEG_TUBE_RADIUS_UPPER = 0.09
const LEG_TUBE_RADIUS_LOWER = 0.075
const TENTACLE_COUNT = 10
const TENTACLE_SEGMENTS = 4
const TENTACLE_RADIAL_ATTACH = 0.72
const TENTACLE_RADIUS_START = 0.055
const TENTACLE_RADIUS_STEP = 0.01
/** Leg curve rebake rate — tentacles dominate cost; legs can update slower. */
const LEG_GEOMETRY_UPDATE_INTERVAL = 1 / 7
/** Tentacle tubes are the hottest path (~40 meshes) — keep this low (~5 Hz). */
const TENTACLE_GEOMETRY_UPDATE_INTERVAL = 1 / 5
/** Axial segments per tentacle quadratic span. */
const TENTACLE_TUBE_AXIAL_SEGMENTS = 5
const TENTACLE_TUBE_RADIAL_SEGMENTS = 4

const BODY_HEIGHT = 6.5
const HIP_HEIGHT = 5.3
const HEAD_HEIGHT = 8.8

const HIT_FLASH_DURATION = 0.08
const HIT_RECOIL_DURATION = 0.25
const HIT_RECOIL_INTENSITY = 0.14
const DEATH_ANIM_DURATION = 1.35

/**
 * Y offset from group origin to body center in world units.
 * The view controller uses this to place the hit sphere near the torso.
 */
export const CHIMERA_HIT_CENTER_Y = BODY_HEIGHT * CHIMERA_SCALE

/** TRON hull — legs, joints, toes, hip. */
const CHIMERA_TRON_HULL = 0x00d4e8
/** TRON torso + spine stack. */
const CHIMERA_TRON_BODY = 0x00a8c4
/** TRON head outer shell. */
const CHIMERA_TRON_HEAD_MEMBRANE = 0xff2a7a
/** TRON head inner core. */
const CHIMERA_TRON_HEAD_CORE = 0xff0066
/** TRON DNA torus accent. */
const CHIMERA_TRON_DNA = 0x39ff14
/** TRON RNA torus accent. */
const CHIMERA_TRON_RNA = 0xff3366
/** TRON tentacle shaft. */
const CHIMERA_TRON_TENTACLE = 0xff00cc
/** TRON tentacle tip. */
const CHIMERA_TRON_TENTACLE_TIP = 0xff66dd

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
  readonly enemy: Enemy

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
  /** Restores head shell after hit / death flash (shared TRON shader). */
  private headMembraneMat!: THREE.ShaderMaterial
  private readonly tronMaterials: THREE.ShaderMaterial[] = []
  /** Eye emissives — disposed with this instance. */
  private readonly disposableBasicMaterials: THREE.MeshBasicMaterial[] = []

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

  /** True once the death animation has completed. */
  get deathComplete(): boolean {
    return this.dead && this.deathTimer >= DEATH_ANIM_DURATION
  }

  constructor(enemy: Enemy) {
    this.enemy = enemy

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

    this.enemy.onDeath = () => this.die()
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

    const breathe = this.isAgitated
      ? 1 + Math.sin(t * 4) * 0.06
      : 1 + Math.sin(t * 1.2) * 0.02
    this.headMembrane.scale.setScalar(breathe)

    this.dnaCore.rotation.y += 0.02
    this.dnaCore.rotation.x += 0.005
    this.rnaCore.rotation.y -= 0.015
    this.rnaCore.rotation.z += 0.008
    this.dnaCore.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
    this.rnaCore.scale.setScalar(1 + Math.sin(t * 2.5 + 1) * 0.08)

    this.bodyLight.intensity = 0.3 + Math.sin(t * 2) * 0.2
    this.headLight.intensity = this.isAgitated
      ? 1 + Math.sin(t * 5) * 0.5
      : 0.5 + Math.sin(t * 1.5) * 0.2

    this.legGeometryTimer += dt
    if (this.legGeometryTimer >= LEG_GEOMETRY_UPDATE_INTERVAL) {
      this.refreshLegGeometry(t, this.isMoving)
      this.legGeometryTimer %= LEG_GEOMETRY_UPDATE_INTERVAL
    }

    this.tentacleGeometryTimer += dt
    if (this.tentacleGeometryTimer >= TENTACLE_GEOMETRY_UPDATE_INTERVAL) {
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
  }

  private buildBody(): void {
    const bodyTron = this.makeTron(CHIMERA_TRON_BODY)
    const hullTron = this.makeTron(CHIMERA_TRON_HULL)
    const neckTron = this.makeTron(CHIMERA_TRON_BODY)
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

    this.bodyLight = new THREE.PointLight(0x00ffcc, 0.4, 6)
    this.bodyLight.position.y = BODY_HEIGHT
    this.bodyGroup.add(this.bodyLight)
  }

  private buildHead(): void {
    this.headMembraneMat = this.makeTron(CHIMERA_TRON_HEAD_MEMBRANE)
    this.headMembrane = new THREE.Mesh(headMembraneGeo, this.headMembraneMat)
    this.headMembrane.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headMembrane)

    this.headCore = new THREE.Mesh(headCoreGeo, this.makeTron(CHIMERA_TRON_HEAD_CORE))
    this.headCore.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headCore)

    this.headLight = new THREE.PointLight(0xff4400, 0.8, 8)
    this.headLight.position.y = HEAD_HEIGHT
    this.headGroup.add(this.headLight)

    for (const side of [-1, 1] as const) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 })
      this.disposableBasicMaterials.push(eyeMat)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), eyeMat)
      eye.position.set(side * 0.35, 8.95, 0.65)
      this.headGroup.add(eye)
    }
  }

  private buildLegs(): void {
    const legTron = this.makeTron(CHIMERA_TRON_HULL)
    const toeTron = this.makeTron(CHIMERA_TRON_HULL)
    for (const side of [-1, 1] as const) {
      const upperMesh = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
          LEG_TUBE_AXIAL_SEGMENTS,
          LEG_TUBE_RADIUS_UPPER,
          LEG_TUBE_RADIAL_SEGMENTS,
        ),
        legTron,
      )
      const lowerMesh = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
          LEG_TUBE_AXIAL_SEGMENTS,
          LEG_TUBE_RADIUS_LOWER,
          LEG_TUBE_RADIAL_SEGMENTS,
        ),
        legTron,
      )
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
        kneeSphere,
        ankleSphere,
        toes,
      })
    }
  }

  private buildTentacles(): void {
    const tentacleTron = this.makeTron(CHIMERA_TRON_TENTACLE)
    const tentacleTipTron = this.makeTron(CHIMERA_TRON_TENTACLE_TIP)
    for (let i = 0; i < TENTACLE_COUNT; i++) {
      const angle = (i / TENTACLE_COUNT) * Math.PI * 2
      const meshes: THREE.Mesh[] = []
      for (let s = 0; s < TENTACLE_SEGMENTS; s++) {
        const radius = Math.max(0.014, TENTACLE_RADIUS_START - s * TENTACLE_RADIUS_STEP)
        const mesh = new THREE.Mesh(
          new THREE.TubeGeometry(
            new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -1, 0)),
            TENTACLE_TUBE_AXIAL_SEGMENTS,
            radius,
            TENTACLE_TUBE_RADIAL_SEGMENTS,
            false,
          ),
          s < TENTACLE_SEGMENTS - 1 ? tentacleTron : tentacleTipTron,
        )
        this.tentaclesGroup.add(mesh)
        meshes.push(mesh)
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
    leg.upperMesh.geometry.dispose()
    leg.upperMesh.geometry = new THREE.TubeGeometry(
      upperCurve,
      LEG_TUBE_AXIAL_SEGMENTS,
      LEG_TUBE_RADIUS_UPPER,
      LEG_TUBE_RADIAL_SEGMENTS,
    )

    const lowerCurve = new THREE.QuadraticBezierCurve3(
      knee,
      new THREE.Vector3((knee.x + ankle.x) / 2, (knee.y + ankle.y) / 2 - 0.2, (knee.z + ankle.z) / 2),
      ankle,
    )
    leg.lowerMesh.geometry.dispose()
    leg.lowerMesh.geometry = new THREE.TubeGeometry(
      lowerCurve,
      LEG_TUBE_AXIAL_SEGMENTS,
      LEG_TUBE_RADIUS_LOWER,
      LEG_TUBE_RADIAL_SEGMENTS,
    )

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
        prevEnd.x + tentacle.reachDir.x * segLen + Math.sin(tX) * amp * (0.3 + tipFactor * 0.6) + Math.cos(curlAngle) * curlR,
        prevEnd.y + tentacle.reachDir.y * segLen + Math.sin(tY) * amp * (0.2 + tipFactor * 0.7) - segLen * 0.2,
        prevEnd.z + tentacle.reachDir.z * segLen + Math.cos(tZ) * amp * (0.3 + tipFactor * 0.6) + Math.sin(curlAngle) * curlR,
      )

      const mid = new THREE.Vector3(
        (prevEnd.x + segEnd.x) / 2 + Math.sin(tX * 1.2 + s) * amp * 0.3 * tipFactor,
        (prevEnd.y + segEnd.y) / 2 + Math.cos(tY * 1.1 + s * 0.6) * amp * 0.35 * tipFactor,
        (prevEnd.z + segEnd.z) / 2 + Math.sin(tZ + s) * amp * 0.3 * tipFactor,
      )

      const radius = Math.max(0.012, TENTACLE_RADIUS_START - s * TENTACLE_RADIUS_STEP)
      const curve = new THREE.QuadraticBezierCurve3(prevEnd, mid, segEnd)
      tentacle.meshes[s]!.geometry.dispose()
      tentacle.meshes[s]!.geometry = new THREE.TubeGeometry(
        curve,
        TENTACLE_TUBE_AXIAL_SEGMENTS,
        radius,
        TENTACLE_TUBE_RADIAL_SEGMENTS,
        false,
      )
      prevEnd = segEnd
    }
  }

  private tickDeath(dt: number, time: number): void {
    this.deathTimer += dt
    const progress = Math.min(1, this.deathTimer / DEATH_ANIM_DURATION)
    const ease = progress * progress

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
          hip.clone().lerp(knee, 0.5).add(new THREE.Vector3(0, 0.2, 0)),
          knee,
        )
        const lowerCurve = new THREE.QuadraticBezierCurve3(
          knee,
          knee.clone().lerp(foot, 0.5).add(new THREE.Vector3(0, -0.1, 0)),
          foot,
        )
        leg.upperMesh.geometry.dispose()
        leg.upperMesh.geometry = new THREE.TubeGeometry(
          upperCurve,
          LEG_TUBE_AXIAL_SEGMENTS,
          LEG_TUBE_RADIUS_UPPER,
          LEG_TUBE_RADIAL_SEGMENTS,
        )
        leg.lowerMesh.geometry.dispose()
        leg.lowerMesh.geometry = new THREE.TubeGeometry(
          lowerCurve,
          LEG_TUBE_AXIAL_SEGMENTS,
          LEG_TUBE_RADIUS_LOWER,
          LEG_TUBE_RADIAL_SEGMENTS,
        )
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
    this.bodyLight.intensity = (1 - ease) * flicker
    this.headLight.intensity = (1 - ease) * 2 * flicker

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

  private refreshTentacleGeometry(time: number, isAgitated: boolean): void {
    for (const tentacle of this.tentacles) {
      this.updateTentacle(tentacle, time, isAgitated)
    }
  }
}
