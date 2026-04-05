/**
 * Procedural bacteriophage enemy — 8-legged spider walker.
 *
 * Builds geometry procedurally (no GLTF). Animates legs with
 * alternating tetrapod gait when moving, subtle twitch when idle.
 * Ported from docs/inspo/bacteriophage-demo.html.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import type { Enemy } from '@/lib/fps/enemy'

// ── Visual constants ────────────────────────────────────────────
const PHAGE_SCALE = 2.0
const LEG_COUNT = 8
const LEG_TUBE_RADIUS = 0.025
const LEG_SEGMENTS = 12

const HIT_FLASH_DURATION = 0.08
const HIT_RECOIL_DURATION = 0.25
const HIT_RECOIL_INTENSITY = 0.15
const DEATH_DELAY_MS = 300

/**
 * Y offset from group origin to body center (in world units).
 * Used by the VC to position the hit-detection sphere at the torso,
 * not at ground level. Value = bodyGroup.y (0.8) * PHAGE_SCALE.
 */
export const PHAGE_HIT_CENTER_Y = 0.8 * PHAGE_SCALE

// ── Shared materials (reused across all phage instances) ────────
const siliconMetal = new THREE.MeshStandardMaterial({
  color: 0x667788,
  metalness: 0.6,
  roughness: 0.35,
})

const neckMat = new THREE.MeshStandardMaterial({
  color: 0x556677,
  emissive: 0x0a3a3a,
  emissiveIntensity: 0.4,
})

const headMat = new THREE.MeshPhysicalMaterial({
  color: 0xddeeff,
  transparent: true,
  opacity: 0.35,
  roughness: 0.05,
  metalness: 0.3,
})

const flashMat = new THREE.MeshBasicMaterial({ color: 0xff00ff })

const coreMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc })

const legMat = new THREE.MeshStandardMaterial({
  color: 0x556677,
  emissive: 0x112233,
  emissiveIntensity: 0.2,
  metalness: 0.6,
  roughness: 0.4,
})

// ── Shared geometries ───────────────────────────────────────────
const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.08, 8)
const headGeo = new THREE.IcosahedronGeometry(0.4, 0)
const coreGeo = new THREE.TorusKnotGeometry(0.12, 0.02, 64, 4)
const ringGeo = new THREE.TorusGeometry(0.32, 0.02, 4, 8)

/** Per-leg state for animation — mesh, radial angle, and gait phase offset. */
interface LegData {
  mesh: THREE.Mesh
  angle: number
  phase: number
}

/**
 * Procedural bacteriophage enemy controller.
 *
 * @author guinetik
 * @date 2026-04-05
 * @spec docs/superpowers/specs/2026-04-05-enemy-system-design.md
 */
export class BacteriophageController implements Tickable {
  readonly group = new THREE.Group()
  readonly enemy: Enemy

  private readonly bodyGroup = new THREE.Group()
  private readonly legsGroup = new THREE.Group()
  private readonly legs: LegData[] = []
  private head!: THREE.Mesh
  private core!: THREE.Mesh
  private light!: THREE.PointLight

  private elapsed = 0
  private readonly timeOffset: number
  private flashTimer = 0
  private recoilTimer = 0
  private dead = false
  private disposed = false

  /** Current visual state — set by VC from director output. */
  isMoving = false
  /** Current agitation state — set by VC from director output. */
  isAgitated = false

  constructor(enemy: Enemy) {
    this.enemy = enemy
    this.timeOffset = Math.random() * 10

    this.group.add(this.bodyGroup)
    this.group.add(this.legsGroup)
    this.group.scale.setScalar(PHAGE_SCALE)

    this.buildBody()
    this.buildLegs()

    // Set initial body height (legs extend from here)
    this.bodyGroup.position.y = 0.8

    // Wire death
    this.enemy.onDeath = () => this.die()
  }

  // ═══════════════════════════════════════════════════════════════
  // Build geometry
  // ═══════════════════════════════════════════════════════════════

  private buildBody(): void {
    // Baseplate
    const base = new THREE.Mesh(baseGeo, siliconMetal)
    base.position.y = -0.05
    this.bodyGroup.add(base)

    // Ring around baseplate
    const ring = new THREE.Mesh(ringGeo, siliconMetal)
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.05
    this.bodyGroup.add(ring)

    // Trunk connector
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 0.35, 8)
    const trunk = new THREE.Mesh(trunkGeo, siliconMetal)
    trunk.position.y = 0.15
    this.bodyGroup.add(trunk)

    // Segmented collar (accordion neck)
    const COLLAR_SEGMENTS = 6
    const COLLAR_START_Y = 0.38
    const COLLAR_SPACING = 0.045
    for (let i = 0; i < COLLAR_SEGMENTS; i++) {
      const r = 0.15 + (i % 2 === 0 ? 0.05 : -0.03)
      const segGeo = new THREE.CylinderGeometry(r, r, 0.04, 8)
      const seg = new THREE.Mesh(segGeo, neckMat)
      seg.position.y = COLLAR_START_Y + i * COLLAR_SPACING
      this.bodyGroup.add(seg)
    }

    // Collar cap ring
    const capRingGeo = new THREE.TorusGeometry(0.14, 0.015, 4, 8)
    const capRing = new THREE.Mesh(capRingGeo, neckMat)
    capRing.rotation.x = Math.PI / 2
    capRing.position.y = 0.36
    this.bodyGroup.add(capRing)

    // Capsid head
    this.head = new THREE.Mesh(headGeo, headMat)
    this.head.position.y = 0.75
    this.bodyGroup.add(this.head)

    // DNA core (inside head)
    this.core = new THREE.Mesh(coreGeo, coreMat)
    this.core.position.y = 0.75
    this.bodyGroup.add(this.core)

    // Inner point light
    this.light = new THREE.PointLight(0x00ffcc, 0.8, 3)
    this.light.position.y = 0.75
    this.bodyGroup.add(this.light)
  }

  private buildLegs(): void {
    for (let i = 0; i < LEG_COUNT; i++) {
      const angle = (i / LEG_COUNT) * Math.PI * 2
      const phase = i % 2 === 0 ? 0 : Math.PI

      const curve = this.makeLegCurve(angle, phase, 0, false)
      const geo = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
      const mesh = new THREE.Mesh(geo, legMat)
      this.legsGroup.add(mesh)
      this.legs.push({ mesh, angle, phase })
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Leg curve generation
  // ═══════════════════════════════════════════════════════════════

  private makeLegCurve(
    angle: number,
    phase: number,
    time: number,
    isMoving: boolean,
  ): THREE.QuadraticBezierCurve3 {
    const cx = Math.cos(angle)
    const cz = Math.sin(angle)
    const tx = -cz
    const tz = cx

    const hip = new THREE.Vector3(cx * 0.3, 0.8, cz * 0.3)

    if (!isMoving) {
      // Idle: planted legs with subtle knee twitch
      const foot = new THREE.Vector3(cx * 1.2, 0, cz * 1.2)
      const knee = new THREE.Vector3(
        cx * 0.7,
        0.85 + Math.sin(time * 0.8 + phase) * 0.04,
        cz * 0.7,
      )
      return new THREE.QuadraticBezierCurve3(hip, knee, foot)
    }

    // Walking: alternating tetrapod gait
    const GAIT_SPEED = 8
    const STRIDE = 0.25
    const cycle = ((time * GAIT_SPEED + phase) % (Math.PI * 2)) / (Math.PI * 2)
    const isSwing = cycle > 0.5
    const swingT = isSwing ? (cycle - 0.5) * 2 : 0
    const stanceT = !isSwing ? cycle * 2 : 0

    const restX = cx * 1.2
    const restZ = cz * 1.2

    let footX: number, footZ: number, footY: number
    if (isSwing) {
      footX = restX + tx * STRIDE * (swingT * 2 - 1)
      footZ = restZ + tz * STRIDE * (swingT * 2 - 1)
      footY = Math.sin(swingT * Math.PI) * 0.35
    } else {
      footX = restX + tx * STRIDE * (1 - stanceT * 2)
      footZ = restZ + tz * STRIDE * (1 - stanceT * 2)
      footY = 0
    }

    const foot = new THREE.Vector3(footX, footY, footZ)

    const kneeRadial = isSwing ? 0.65 : 0.75
    const kneeHeight = isSwing
      ? 1.1 + Math.sin(swingT * Math.PI) * 0.3
      : 0.85 + Math.sin(stanceT * Math.PI * 0.5) * 0.05
    const kneeOff = isSwing ? STRIDE * (swingT - 0.5) : STRIDE * (0.5 - stanceT)

    const knee = new THREE.Vector3(
      cx * kneeRadial + tx * kneeOff * 0.5,
      kneeHeight,
      cz * kneeRadial + tz * kneeOff * 0.5,
    )

    return new THREE.QuadraticBezierCurve3(hip, knee, foot)
  }

  // ═══════════════════════════════════════════════════════════════
  // Per-frame tick
  // ═══════════════════════════════════════════════════════════════

  /** @inheritdoc */
  tick(dt: number): void {
    if (this.disposed) return
    this.elapsed += dt
    const t = this.elapsed + this.timeOffset

    // --- Body animation ---
    if (this.isMoving) {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 8) * 0.03
      this.bodyGroup.rotation.z = Math.sin(t * 8) * 0.06
      this.bodyGroup.rotation.x = Math.sin(t * 4) * 0.03
    } else {
      this.bodyGroup.position.y = 0.8 + Math.sin(t * 1.2) * 0.015
      this.bodyGroup.rotation.z = Math.sin(t * 0.7) * 0.02
      this.bodyGroup.rotation.x = Math.sin(t * 0.5) * 0.01
    }

    // --- Hit recoil — jolt body on impact ---
    if (this.recoilTimer > 0) {
      this.recoilTimer -= dt
      const intensity = (this.recoilTimer / HIT_RECOIL_DURATION) * HIT_RECOIL_INTENSITY
      this.bodyGroup.position.y += Math.sin(t * 40) * intensity
      this.bodyGroup.rotation.z += Math.sin(t * 35) * intensity * 2
      this.bodyGroup.rotation.x += Math.cos(t * 30) * intensity * 1.5
    }

    // --- DNA core spin + pulse ---
    this.core.rotation.y += 0.02
    const coreScale = 1 + Math.sin(t * 2) * 0.1
    this.core.scale.setScalar(coreScale)

    // --- Light pulse ---
    this.light.intensity = 0.6 + Math.sin(t * 2) * 0.3

    // --- Legs ---
    for (const leg of this.legs) {
      const curve = this.makeLegCurve(leg.angle, leg.phase, t, this.isMoving)
      leg.mesh.geometry.dispose()
      leg.mesh.geometry = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
    }

    // --- Hit flash ---
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.head.material = headMat
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Hit / death
  // ═══════════════════════════════════════════════════════════════

  /** Flash head magenta + body recoil on hit — called by VC when projectile connects. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.recoilTimer = HIT_RECOIL_DURATION
    this.head.material = flashMat
  }

  /** Death animation — collapse legs, flash core, remove after delay. */
  private die(): void {
    this.dead = true

    // Collapse legs inward
    for (const leg of this.legs) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.1, 0),
        new THREE.Vector3(0, -0.2, 0),
      )
      leg.mesh.geometry.dispose()
      leg.mesh.geometry = new THREE.TubeGeometry(curve, LEG_SEGMENTS, LEG_TUBE_RADIUS, 4, false)
    }

    // Flash core + light spike
    this.core.material = flashMat
    this.light.intensity = 2

    // Remove from scene after brief delay
    setTimeout(() => {
      this.group.removeFromParent()
    }, DEATH_DELAY_MS)
  }

  /** Clean up all geometry and materials. */
  dispose(): void {
    this.disposed = true
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        // Only dispose instance-owned materials (not shared statics)
        if (
          child.material !== siliconMetal &&
          child.material !== neckMat &&
          child.material !== headMat &&
          child.material !== coreMat &&
          child.material !== legMat &&
          child.material !== flashMat
        ) {
          ;(child.material as THREE.Material).dispose()
        }
      }
    })
  }
}
